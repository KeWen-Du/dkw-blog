---
title: "MySQL 慢查询优化实战（五）：表结构与数据优化"
date: "2022-04-30 16:00:00"
excerpt: "从数据类型选择、表分区策略到分库分表实践，全面掌握表结构设计对性能的影响，学会处理大数据量场景下的表设计问题。"
tags: ["MySQL", "性能优化", "表结构", "分库分表"]
series:
  slug: "mysql-slow-query-optimization"
  title: "MySQL 慢查询优化实战"
  order: 5
---

## 前言

SQL 和索引优化是术，表结构设计是道。良好的表结构设计是高性能数据库的基础。本章从数据类型、分区、分表等维度，系统讲解表结构设计对性能的影响。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 实现章节 |
|--------|------|----------|----------|
| 数据类型选择 | ⭐⭐⭐ | 高频考点 | 本章 |
| 表分区策略 | ⭐⭐⭐⭐ | 进阶考点 | 本章 |
| 分库分表设计 | ⭐⭐⭐⭐⭐ | 高频考点 | 本章 |
| 反范式设计 | ⭐⭐⭐⭐ | 中频考点 | 本章 |
| 大表改造案例 | ⭐⭐⭐⭐⭐ | 实战考点 | 本章 |

## 面试题覆盖

- MySQL 有哪些数据类型？如何选择？
- 什么情况下需要分表？分表策略有哪些？
- 水平分表和垂直分表的区别？
- 表分区和分表有什么区别？
- 什么是反范式设计？有什么优缺点？

## 一、数据类型优化

### 1.1 整数类型选择

| 类型 | 字节 | 范围 | 使用场景 |
|------|------|------|---------|
| TINYINT | 1 | -128 ~ 127 | 状态、标记 |
| SMALLINT | 2 | -32768 ~ 32767 | 计数器 |
| MEDIUMINT | 3 | -838万 ~ 838万 | 中等范围 ID |
| INT | 4 | -21亿 ~ 21亿 | 主键、外键 |
| BIGINT | 8 | 非常大 | 大型系统主键 |

**选择原则**：

```sql
-- 差：过度使用 BIGINT
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,           -- 合理
    user_id BIGINT,                  -- 用户数不会超过 21 亿，用 INT 即可
    status BIGINT,                   -- 状态只有几种，用 TINYINT
    quantity BIGINT                  -- 数量不会超过 127，用 TINYINT
);

-- 优化：选择合适类型
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT UNSIGNED,            -- 使用无符号，范围 0 ~ 42 亿
    status TINYINT UNSIGNED,         -- 0-255 足够
    quantity SMALLINT UNSIGNED       -- 0-65535 足够
);
```

**存储空间对比**：

| 字段 | 原设计 | 优化后 | 节省 |
|------|--------|--------|------|
| user_id | 8 字节 | 4 字节 | 50% |
| status | 8 字节 | 1 字节 | 87.5% |
| quantity | 8 字节 | 2 字节 | 75% |
| 每行节省 | - | - | 13 字节 |

对于 1 亿行数据，可节省约 1.2GB 存储空间。

### 1.2 字符串类型选择

| 类型 | 最大长度 | 特点 | 使用场景 |
|------|---------|------|---------|
| CHAR(N) | 255 | 定长，不足补空格 | 固定长度如手机号、MD5 |
| VARCHAR(N) | 65535 | 变长 | 大部分字符串场景 |
| TEXT | 65535 | 独立存储 | 长文本 |
| MEDIUMTEXT | 16MB | 独立存储 | 文章内容 |

**VARCHAR 长度选择**：

```sql
-- 差：VARCHAR(255) 万能
CREATE TABLE users (
    username VARCHAR(255),    -- 实际最长 50
    email VARCHAR(255),       -- 实际最长 100
    phone VARCHAR(255)        -- 固定 11 位
);

-- 优化：根据实际需求设置
CREATE TABLE users (
    username VARCHAR(50),
    email VARCHAR(100),
    phone CHAR(11)            -- 固定长度用 CHAR
);
```

**注意事项**：

1. VARCHAR(N) 的 N 是字符数，不是字节数
2. 过大的 N 会影响内存排序缓冲区大小
3. 索引长度受限制（InnoDB 默认 767 字节）

### 1.3 时间类型选择

| 类型 | 字节 | 格式 | 范围 | 精度 |
|------|------|------|------|------|
| DATE | 3 | YYYY-MM-DD | 1000-9999 | 天 |
| TIME | 3 | HH:MM:SS | -838~838 小时 | 秒 |
| DATETIME | 8 | YYYY-MM-DD HH:MM:SS | 1000-9999 | 秒 |
| TIMESTAMP | 4 | 时间戳 | 1970-2038 | 秒 |
| DATETIME(6) | 8 | 带微秒 | 1000-9999 | 微秒 |

**选择建议**：

```sql
-- 差：使用字符串存储时间
CREATE TABLE orders (
    create_time VARCHAR(50)    -- '2022-04-30 10:30:00'
);

-- 优化：使用 DATETIME
CREATE TABLE orders (
    create_time DATETIME,      -- 8 字节，支持范围查询
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**TIMESTAMP vs DATETIME**：

| 维度 | TIMESTAMP | DATETIME |
|------|-----------|----------|
| 字节 | 4 | 8 |
| 时区 | 自动转换 | 不转换 |
| 范围 | 1970-2038 | 1000-9999 |
| 默认值 | 可自动更新 | MySQL 5.6+ 支持 |

### 1.4 生产案例：数据类型优化

**场景**：用户表存储优化

```sql
-- 原始设计（每行 150 字节）
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255),
    password_hash VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(255),
    age INT,
    gender VARCHAR(10),
    status VARCHAR(50),
    create_time VARCHAR(50),
    update_time VARCHAR(50)
);

-- 优化设计（每行 80 字节，节省 47%）
CREATE TABLE users (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,  -- 用户不会超过 42 亿
    username VARCHAR(50) NOT NULL,
    password_hash CHAR(64) NOT NULL,             -- SHA256 固定 64 字符
    email VARCHAR(100),
    phone CHAR(11),
    age TINYINT UNSIGNED,                        -- 0-255 足够
    gender TINYINT,                              -- 0=未知,1=男,2=女
    status TINYINT UNSIGNED DEFAULT 1,           -- 1=正常,2=禁用
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_phone(phone),
    INDEX idx_email(email)
);
```

## 二、表分区策略

### 2.1 分区概述

分区是将一个大表物理拆分为多个小表，但对应用透明，仍像操作一个表一样。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       分区表结构示意                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   应用层                                                                 │
│   ┌───────────────────────────────────┐                                │
│   │  SELECT * FROM orders             │                                │
│   │  WHERE create_time > '2022-01-01' │                                │
│   └───────────────────────────────────┘                                │
│                    │                                                    │
│                    ▼                                                    │
│   ┌───────────────────────────────────┐                                │
│   │         MySQL 分区路由            │                                │
│   └───────────────────────────────────┘                                │
│        ┌────────┼────────┼────────┐                                    │
│        ▼        ▼        ▼        ▼                                    │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                         │
│   │ p2021  │ │ p2022q1│ │ p2022q2│ │ p2022q3│                         │
│   │ Q1-Q4  │ │ 01-03  │ │ 04-06  │ │ 07-09  │                         │
│   └────────┘ └────────┘ └────────┘ └────────┘                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 分区类型

#### RANGE 分区（最常用）

```sql
CREATE TABLE orders (
    id BIGINT,
    user_id INT,
    amount DECIMAL(10,2),
    status TINYINT,
    create_time DATETIME,
    PRIMARY KEY (id, create_time)
) PARTITION BY RANGE (YEAR(create_time)) (
    PARTITION p2020 VALUES LESS THAN (2021),
    PARTITION p2021 VALUES LESS THAN (2022),
    PARTITION p2022 VALUES LESS THAN (2023),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);
```

#### LIST 分区

```sql
CREATE TABLE orders (
    id BIGINT,
    region_id INT,
    amount DECIMAL(10,2),
    PRIMARY KEY (id, region_id)
) PARTITION BY LIST (region_id) (
    PARTITION p_north VALUES IN (1, 2, 3),
    PARTITION p_south VALUES IN (4, 5, 6),
    PARTITION p_east VALUES IN (7, 8, 9),
    PARTITION p_west VALUES IN (10, 11, 12)
);
```

#### HASH 分区

```sql
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT,
    amount DECIMAL(10,2)
) PARTITION BY HASH(user_id) PARTITIONS 4;
```

### 2.3 分区优化场景

**场景1：按时间范围查询**

```sql
-- 查询 2022 年数据
SELECT * FROM orders WHERE create_time >= '2022-01-01' AND create_time < '2023-01-01';

-- 分区裁剪：只扫描 p2022 分区
EXPLAIN SELECT * FROM orders WHERE create_time >= '2022-01-01' AND create_time < '2023-01-01';
-- partitions: p2022
```

**场景2：历史数据归档**

```sql
-- 删除 2020 年数据（瞬间完成，不锁表）
ALTER TABLE orders DROP PARTITION p2020;

-- 传统方式删除
DELETE FROM orders WHERE create_time < '2021-01-01';  -- 慢，锁表
```

### 2.4 分区注意事项

1. **主键必须包含分区键**

```sql
-- 错误：主键不包含分区键
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,         -- 只有 id
    create_time DATETIME
) PARTITION BY RANGE (YEAR(create_time)) (...);

-- 正确：主键包含分区键
CREATE TABLE orders (
    id BIGINT,
    create_time DATETIME,
    PRIMARY KEY (id, create_time)  -- 包含分区键
) PARTITION BY RANGE (YEAR(create_time)) (...);
```

2. **分区数量限制**

```sql
-- MySQL 8.0 支持 8192 个分区，但建议 < 1000
-- 分区过多会增加内存占用和管理复杂度
```

## 三、分库分表策略

### 3.1 垂直拆分

**垂直分库**：按业务拆分

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       垂直分库示意                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   单库（问题）                        分库后（解决）                     │
│   ┌─────────────────────┐           ┌─────────────────────┐            │
│   │      monolith_db    │           │     user_db         │            │
│   │  ┌───────────────┐  │           │  ┌───────────────┐  │            │
│   │  │ users         │  │           │  │ users         │  │            │
│   │  │ profiles      │  │           │  │ profiles      │  │            │
│   │  ├───────────────┤  │           │  └───────────────┘  │            │
│   │  │ orders        │  │           ├─────────────────────┤            │
│   │  │ order_items   │  │           │     order_db        │            │
│   │  ├───────────────┤  │           │  ┌───────────────┐  │            │
│   │  │ products      │  │           │  │ orders        │  │            │
│   │  │ categories    │  │           │  │ order_items   │  │            │
│   │  └───────────────┘  │           │  └───────────────┘  │            │
│   │  单表过大          │           ├─────────────────────┤            │
│   │  连接数不足        │           │     product_db      │            │
│   │  IO 竞争激烈       │           │  ┌───────────────┐  │            │
│   └─────────────────────┘           │  │ products      │  │            │
│                                     │  │ categories    │  │            │
│                                     │  └───────────────┘  │            │
│                                     └─────────────────────┘            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**垂直分表**：按字段拆分

```sql
-- 原始表（字段过多）
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(50),
    password_hash VARCHAR(64),
    email VARCHAR(100),
    phone VARCHAR(20),
    -- 基础信息结束
    nickname VARCHAR(50),
    avatar VARCHAR(200),
    bio TEXT,
    website VARCHAR(200),
    -- 扩展信息结束
    login_count INT,
    last_login_time DATETIME,
    last_login_ip VARCHAR(50)
    -- 统计信息结束
);

-- 垂直分表
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(50),
    password_hash VARCHAR(64),
    email VARCHAR(100),
    phone VARCHAR(20)
);

CREATE TABLE user_profiles (
    user_id BIGINT PRIMARY KEY,
    nickname VARCHAR(50),
    avatar VARCHAR(200),
    bio TEXT,
    website VARCHAR(200)
);

CREATE TABLE user_stats (
    user_id BIGINT PRIMARY KEY,
    login_count INT,
    last_login_time DATETIME,
    last_login_ip VARCHAR(50)
);
```

### 3.2 水平拆分

**水平分表**：按数据行拆分

```sql
-- 原始订单表（1 亿行）
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT,
    amount DECIMAL(10,2),
    create_time DATETIME
);

-- 按 user_id 取模分表（分 4 张表）
-- orders_0: user_id % 4 = 0
-- orders_1: user_id % 4 = 1
-- orders_2: user_id % 4 = 2
-- orders_3: user_id % 4 = 3

CREATE TABLE orders_0 (id BIGINT PRIMARY KEY, user_id INT, ...);
CREATE TABLE orders_1 (id BIGINT PRIMARY KEY, user_id INT, ...);
CREATE TABLE orders_2 (id BIGINT PRIMARY KEY, user_id INT, ...);
CREATE TABLE orders_3 (id BIGINT PRIMARY KEY, user_id INT, ...);
```

**分片键选择原则**：

| 原则 | 说明 |
|------|------|
| 高频查询字段 | 作为分片键，避免跨分片查询 |
| 数据分布均匀 | 避免数据倾斜 |
| 业务隔离性 | 如按用户分片，用户数据在一起 |

### 3.3 分库分表中间件

| 中间件 | 特点 | 适用场景 |
|--------|------|---------|
| ShardingSphere | 功能全面，生态完善 | 企业级应用 |
| MyCat | 国产，配置简单 | 中小型应用 |
| Vitess | YouTube 开源，云原生 | 大规模应用 |

### 3.4 生产案例：电商订单系统分表

**背景**：
- 订单表数据量：5 亿行
- 单表查询慢：平均 3 秒
- 写入压力大：QPS 5000+

**分表方案**：

```sql
-- 分片策略：按 user_id 分 16 张表，分布在 4 个库
-- db0: orders_0, orders_1, orders_2, orders_3
-- db1: orders_4, orders_5, orders_6, orders_7
-- db2: orders_8, orders_9, orders_10, orders_11
-- db3: orders_12, orders_13, orders_14, orders_15

-- 分片算法
-- 库：user_id % 4
-- 表：user_id % 16

-- 路由示例
-- user_id = 100 → db0.orders_4 (100 % 4 = 0, 100 % 16 = 4)
-- user_id = 101 → db1.orders_5 (101 % 4 = 1, 101 % 16 = 5)
```

**ID 生成方案**：

```sql
-- 雪花算法生成分布式 ID
-- 64 位：1 位符号 + 41 位时间戳 + 10 位机器ID + 12 位序列号

-- ID 包含分片信息（取模后可定位分片）
-- 也可以使用独立的 ID 生成服务
```

**改造效果**：

| 指标 | 改造前 | 改造后 |
|------|--------|--------|
| 单表数据量 | 5 亿 | 3000 万 |
| 查询响应时间 | 3 秒 | 0.05 秒 |
| 写入 QPS | 5000 | 20000 |

## 四、反范式设计

### 4.1 范式 vs 反范式

**第三范式（3NF）**：每个非主键列都直接依赖于主键

```sql
-- 符合 3NF 的设计
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT,
    amount DECIMAL(10,2),
    create_time DATETIME
);

CREATE TABLE users (
    id INT PRIMARY KEY,
    username VARCHAR(50),
    level VARCHAR(20)
);

-- 查询需要 JOIN
SELECT o.id, o.amount, u.username, u.level
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.id = 1001;
```

**反范式设计**：冗余存储常用字段

```sql
-- 反范式设计：冗余用户信息
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT,
    username VARCHAR(50),     -- 冗余
    user_level VARCHAR(20),   -- 冗余
    amount DECIMAL(10,2),
    create_time DATETIME
);

-- 查询无需 JOIN
SELECT id, amount, username, user_level
FROM orders
WHERE id = 1001;
```

### 4.2 反范式优缺点

| 优点 | 缺点 |
|------|------|
| 减少 JOIN，查询更快 | 数据冗余，占用空间 |
| 简化查询逻辑 | 数据一致性维护成本 |
| 适合读多写少场景 | 更新操作变复杂 |

### 4.3 生产案例：订单冗余设计

**场景**：订单列表显示用户信息

```sql
-- 原始设计（需要 JOIN）
SELECT o.id, o.amount, o.create_time, u.username, u.level
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.user_id = 12345
ORDER BY o.create_time DESC
LIMIT 20;

-- 问题：每次查询都需要 JOIN，性能开销大
```

**优化方案**：冗余用户信息

```sql
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT,
    username VARCHAR(50),      -- 冗余，下单时记录
    user_level VARCHAR(20),    -- 冗余，下单时记录
    amount DECIMAL(10,2),
    create_time DATETIME,
    INDEX idx_user_create(user_id, create_time DESC)
);

-- 查询无需 JOIN
SELECT id, amount, create_time, username, user_level
FROM orders
WHERE user_id = 12345
ORDER BY create_time DESC
LIMIT 20;
```

**一致性维护策略**：

```sql
-- 策略1：用户信息变更时同步更新订单（复杂）

-- 策略2：接受短暂不一致，历史订单保持下单时的信息（推荐）
-- 大多数场景下，用户改名或升级 VIP 不影响历史订单展示
```

## 五、大表改造案例

### 5.1 案例背景

**业务场景**：物流轨迹表

```sql
-- 原始表设计
CREATE TABLE logistics_traces (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id BIGINT,
    location VARCHAR(200),
    status VARCHAR(50),
    operator VARCHAR(100),
    operation_time DATETIME,
    remark TEXT,
    create_time DATETIME
);

-- 问题
-- 1. 数据量：10 亿行，500GB
-- 2. 查询慢：按订单查询轨迹需要 5 秒
-- 3. 写入慢：高峰期写入延迟
-- 4. 维护难：索引重建需要数小时
```

### 5.2 改造方案

**步骤1：数据类型优化**

```sql
-- 优化后
CREATE TABLE logistics_traces (
    id BIGINT PRIMARY KEY,
    order_id BIGINT,
    location VARCHAR(100),      -- 缩短长度
    status TINYINT,             -- 使用数字编码
    operator_id INT,            -- 改用 ID
    operation_time DATETIME,
    remark VARCHAR(500),        -- 限制长度
    create_time DATETIME,
    INDEX idx_order_time(order_id, operation_time)
);
```

**步骤2：水平分表**

```sql
-- 按 order_id 分 64 张表
-- logistics_traces_00 ~ logistics_traces_63
-- 分片算法：order_id % 64
```

**步骤3：冷热数据分离**

```sql
-- 热数据表：近 3 个月数据
CREATE TABLE logistics_traces_hot (
    -- 同上结构
) PARTITION BY RANGE (TO_DAYS(create_time)) (
    PARTITION p202204 VALUES LESS THAN (TO_DAYS('2022-05-01')),
    PARTITION p202205 VALUES LESS THAN (TO_DAYS('2022-06-01')),
    PARTITION p202206 VALUES LESS THAN (TO_DAYS('2022-07-01'))
);

-- 冷数据表：历史数据归档
CREATE TABLE logistics_traces_cold (
    -- 同上结构
) ENGINE=ARCHIVE;  -- 使用压缩存储
```

### 5.3 改造效果

| 指标 | 改造前 | 改造后 |
|------|--------|--------|
| 单表数据量 | 10 亿 | 1500 万 |
| 存储空间 | 500GB | 200GB |
| 查询响应 | 5 秒 | 0.1 秒 |
| 写入延迟 | 500ms | 10ms |

## 总结

本章讲解了表结构与数据优化：

1. **数据类型**：选择合适类型，避免过度设计
2. **表分区**：适合时间序列数据，支持分区裁剪
3. **分库分表**：大数据量终极方案，需配合中间件
4. **反范式**：空间换时间，适合读多写少场景

下一章将通过生产案例综合运用这些优化技巧。

## 参考文献

- [MySQL 8.0 Partitioning](https://dev.mysql.com/doc/refman/8.0/en/partitioning.html)
- [ShardingSphere Documentation](https://shardingsphere.apache.org/document/)

## 下一章预告

**第6章：生产案例分析**

- 电商订单查询优化
- 社交平台动态流优化
- 日志分析系统优化
- 金融交易系统优化
