---
title: "MySQL 慢查询优化实战（六）：生产案例分析"
date: "2022-04-29"
excerpt: "通过电商订单查询、社交动态流、日志分析、金融交易等真实生产场景，综合运用前文所学知识，深入讲解从问题定位到优化落地的完整过程。"
tags: ["MySQL", "性能优化", "生产案例", "实战"]
series:
  slug: "mysql-slow-query-optimization"
  title: "MySQL 慢查询优化实战"
  order: 6
---

## 前言

理论需要实践检验。本章通过四个真实的生产场景，展示慢查询优化的完整过程：问题发现、原因分析、方案设计、效果验证。每个案例都来自真实业务，具有代表性。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 实现章节 |
|--------|------|----------|----------|
| 电商订单查询优化 | ⭐⭐⭐⭐ | 高频考点 | 本章 |
| 社交动态流优化 | ⭐⭐⭐⭐⭐ | 进阶考点 | 本章 |
| 日志分析系统优化 | ⭐⭐⭐⭐ | 实战考点 | 本章 |
| 金融交易系统优化 | ⭐⭐⭐⭐⭐ | 进阶考点 | 本章 |

## 案例一：电商订单查询优化

### 1.1 场景描述

**业务背景**：某电商平台订单列表页，用户查询自己的订单记录。

**问题现象**：
- 高峰期接口响应时间超过 10 秒
- 数据库 CPU 飙升至 90%
- 用户投诉页面加载超时

**表结构**：

```sql
CREATE TABLE orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(50),
    user_id INT,
    status TINYINT,
    total_amount DECIMAL(12,2),
    payment_method TINYINT,
    receiver_name VARCHAR(50),
    receiver_phone VARCHAR(20),
    receiver_address VARCHAR(200),
    create_time DATETIME,
    update_time DATETIME,
    INDEX idx_user(user_id),
    INDEX idx_status(status),
    INDEX idx_create(create_time)
);
```

**慢查询 SQL**：

```sql
SELECT * FROM orders 
WHERE user_id = 12345 
  AND status IN (1, 2, 3)
  AND create_time >= '2022-01-01'
ORDER BY create_time DESC
LIMIT 0, 20;
```

### 1.2 问题分析

**执行计划分析**：

```sql
EXPLAIN SELECT * FROM orders 
WHERE user_id = 12345 
  AND status IN (1, 2, 3)
  AND create_time >= '2022-01-01'
ORDER BY create_time DESC
LIMIT 0, 20;
```

```
+----+-------+------+------------------+------+----------+----------------------------------------------+
| id | table | type | possible_keys    | key  | rows     | Extra                                        |
+----+-------+------+------------------+------+----------+----------------------------------------------+
|  1 | orders| ref  | idx_user,idx_... | idx_user | 50000 | Using where; Using filesort                  |
+----+-------+------+------------------+------+----------+----------------------------------------------+
```

**问题诊断**：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       问题分析过程                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. 索引选择：优化器选择了 idx_user(user_id)                           │
│                                                                         │
│   2. 扫描行数：rows = 50000，说明 user_id = 12345 有大量订单           │
│                                                                         │
│   3. 额外过滤：Using where                                              │
│      - status IN (1, 2, 3)                                             │
│      - create_time >= '2022-01-01'                                     │
│      这些条件无法使用索引                                               │
│                                                                         │
│   4. 排序代价：Using filesort                                           │
│      - ORDER BY create_time DESC 需要额外排序                           │
│      - 排序 50000 行数据                                                │
│                                                                         │
│   结论：索引设计不合理，无法支持多条件查询和排序                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 优化方案

**方案：创建联合索引**

```sql
-- 分析查询模式
-- 条件：user_id（等值）+ status（IN 范围）+ create_time（范围）
-- 排序：create_time DESC

-- 联合索引设计原则：
-- 1. 等值条件字段在前
-- 2. 范围条件字段在后
-- 3. 排序字段可考虑加入

-- 创建联合索引
CREATE INDEX idx_user_status_create ON orders(user_id, status, create_time DESC);
```

**优化后执行计划**：

```
+----+-------+------+------------------+---------------------+------+----------+
| id | table | type | possible_keys    | key                 | rows | Extra    |
+----+-------+------+------------------+---------------------+------+----------+
|  1 | orders| range| idx_user,...     | idx_user_status_... | 20   | Using... |
+----+-------+------+------------------+---------------------+------+----------+
```

**注意**：`status IN (1, 2, 3)` 是范围条件，之后的 `create_time` 只能用于排序，无法用于范围过滤。

**进一步优化**：如果 status 区分度不够，考虑调整索引顺序

```sql
-- 如果 status 区分度很低（如 90% 都是已完成状态）
-- 考虑只索引 user_id + create_time
CREATE INDEX idx_user_create ON orders(user_id, create_time DESC);

-- 对应 SQL 调整
SELECT * FROM orders 
WHERE user_id = 12345 
  AND status IN (1, 2, 3)  -- 在应用层过滤
  AND create_time >= '2022-01-01'
ORDER BY create_time DESC
LIMIT 0, 20;
```

### 1.4 效果验证

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 执行时间 | 10.5 秒 | 0.02 秒 |
| 扫描行数 | 50000 | 20 |
| CPU 使用率 | 90% | 5% |
| Using filesort | 是 | 否 |

## 案例二：社交平台动态流优化

### 2.1 场景描述

**业务背景**：社交平台首页动态流，展示用户关注的人发布的动态。

**问题现象**：
- 首页加载超过 15 秒
- 高并发时数据库连接池耗尽
- 用户大量流失

**表结构**：

```sql
-- 用户表
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(50),
    nickname VARCHAR(50),
    INDEX idx_username(username)
);

-- 关注关系表
CREATE TABLE user_follows (
    id BIGINT PRIMARY KEY,
    user_id BIGINT,        -- 关注者
    follow_user_id BIGINT, -- 被关注者
    create_time DATETIME,
    INDEX idx_user(user_id),
    INDEX idx_follow(follow_user_id)
);

-- 动态表
CREATE TABLE posts (
    id BIGINT PRIMARY KEY,
    user_id BIGINT,
    content TEXT,
    like_count INT,
    comment_count INT,
    create_time DATETIME,
    INDEX idx_user(user_id),
    INDEX idx_create(create_time)
);
```

**慢查询 SQL**：

```sql
-- 获取用户关注的人的动态
SELECT p.*, u.username, u.nickname
FROM posts p
INNER JOIN user_follows f ON p.user_id = f.follow_user_id
INNER JOIN users u ON p.user_id = u.id
WHERE f.user_id = 12345  -- 当前用户
ORDER BY p.create_time DESC
LIMIT 20;
```

### 2.2 问题分析

**执行计划**：

```
+----+-------+--------+------------------+----------+----------+----------------------------------------------+
| id | table | type   | key              | rows     | filtered | Extra                                        |
+----+-------+--------+------------------+----------+----------+----------------------------------------------+
|  1 | f     | ref    | idx_user         | 500      | 100.00   | Using where; Using temporary; Using filesort |
|  1 | p     | ref    | idx_user         | 100      | 100.00   | NULL                                         |
|  1 | u     | eq_ref | PRIMARY          | 1        | 100.00   | NULL                                         |
+----+-------+--------+------------------+----------+----------+----------------------------------------------+
```

**问题诊断**：

1. **多表 JOIN 性能**：需要关联 user_follows 和 posts 两张大表
2. **Using temporary**：需要创建临时表存储 JOIN 结果
3. **Using filesort**：需要对临时表排序
4. **扩展性问题**：关注的人越多，查询越慢

### 2.3 优化方案

**方案一：推模式（Timeline）**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       推模式架构                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   写扩散：用户发动态时，推送到所有粉丝的收件箱                           │
│                                                                         │
│   ┌───────────┐      ┌───────────────────────────────────┐             │
│   │ 用户发动态 │ ───► │ 写入自己的发件箱                   │             │
│   └───────────┘      │ 写入所有粉丝的收件箱               │             │
│                      └───────────────────────────────────┘             │
│                                                                         │
│   收件箱表结构：                                                         │
│   CREATE TABLE timeline (                                               │
│       user_id BIGINT,        -- 粉丝 ID                                │
│       post_id BIGINT,        -- 动态 ID                                │
│       post_user_id BIGINT,   -- 发布者 ID                              │
│       create_time DATETIME,  -- 动态时间                               │
│       PRIMARY KEY(user_id, create_time, post_id)                       │
│   );                                                                    │
│                                                                         │
│   读操作：直接查询自己的收件箱                                           │
│   SELECT * FROM timeline WHERE user_id = 12345                         │
│   ORDER BY create_time DESC LIMIT 20;                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**方案二：拉模式优化**

```sql
-- 优化 JOIN 查询
-- 1. 先获取关注列表
SELECT follow_user_id FROM user_follows WHERE user_id = 12345;
-- 结果：[1, 2, 3, ..., 500]

-- 2. 使用 IN 查询动态
SELECT p.*, u.username, u.nickname
FROM posts p
INNER JOIN users u ON p.user_id = u.id
WHERE p.user_id IN (1, 2, 3, ..., 500)
ORDER BY p.create_time DESC
LIMIT 20;

-- 问题：IN 列表过长时性能下降
```

**方案三：混合模式（推荐）**

```sql
-- 对于关注数少的用户：拉模式
-- 对于关注数多的用户：推模式

-- 拉模式优化：使用联合索引
CREATE INDEX idx_user_create ON posts(user_id, create_time DESC);

-- 分批获取，在应用层合并排序
-- 1. 按时间倒序从每个关注用户获取最新 N 条
-- 2. 应用层合并排序取 Top 20
```

### 2.4 最终方案

采用**推模式**，牺牲写性能换取读性能：

```sql
-- 收件箱表
CREATE TABLE timeline (
    user_id BIGINT,
    post_id BIGINT,
    post_user_id BIGINT,
    create_time DATETIME,
    PRIMARY KEY(user_id, create_time, post_id)
) ENGINE=InnoDB;

-- 发动态时写入
-- 伪代码
BEGIN;
INSERT INTO posts (...) VALUES (...);  -- 写入动态表
post_id = LAST_INSERT_ID();

-- 获取粉丝列表
SELECT user_id FROM user_follows WHERE follow_user_id = post_user_id;

-- 批量写入收件箱
INSERT INTO timeline (user_id, post_id, post_user_id, create_time) VALUES
(follower1, post_id, post_user_id, create_time),
(follower2, post_id, post_user_id, create_time),
...;
COMMIT;

-- 读取首页动态
SELECT t.*, p.content, u.username
FROM timeline t
INNER JOIN posts p ON t.post_id = p.id
INNER JOIN users u ON t.post_user_id = u.id
WHERE t.user_id = 12345
ORDER BY t.create_time DESC
LIMIT 20;
```

### 2.5 效果验证

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 首页加载时间 | 15 秒 | 0.1 秒 |
| 数据库连接数 | 500（耗尽） | 50 |
| 查询复杂度 | O(N) JOIN | O(1) 查询 |

## 案例三：日志分析系统优化

### 3.1 场景描述

**业务背景**：应用日志存储在 MySQL，用于问题排查和分析。

**问题现象**：
- 日志表超过 10 亿行
- 按时间范围查询需要 30 秒以上
- 磁盘空间持续增长

**表结构**：

```sql
CREATE TABLE app_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    app_name VARCHAR(50),
    log_level VARCHAR(10),
    message TEXT,
    stack_trace TEXT,
    create_time DATETIME,
    INDEX idx_create(create_time)
);
```

### 3.2 问题分析

1. **数据量过大**：单表 10 亿行，索引庞大
2. **查询效率低**：即使有索引，扫描范围仍然很大
3. **存储成本高**：TEXT 字段占用大量空间
4. **维护困难**：清理历史数据慢

### 3.3 优化方案

**方案一：表分区**

```sql
CREATE TABLE app_logs (
    id BIGINT,
    app_name VARCHAR(50),
    log_level VARCHAR(10),
    message TEXT,
    stack_trace TEXT,
    create_time DATETIME,
    PRIMARY KEY (id, create_time)
) PARTITION BY RANGE (TO_DAYS(create_time)) (
    PARTITION p202203 VALUES LESS THAN (TO_DAYS('2022-04-01')),
    PARTITION p202204 VALUES LESS THAN (TO_DAYS('2022-05-01')),
    PARTITION p202205 VALUES LESS THAN (TO_DAYS('2022-06-01')),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);
```

**方案二：冷热分离**

```sql
-- 热数据表：近 7 天
CREATE TABLE app_logs_hot (
    id BIGINT PRIMARY KEY,
    app_name VARCHAR(50),
    log_level VARCHAR(10),
    message TEXT,
    create_time DATETIME,
    INDEX idx_create(create_time)
);

-- 冷数据表：历史数据
CREATE TABLE app_logs_cold (
    id BIGINT PRIMARY KEY,
    app_name VARCHAR(50),
    log_level VARCHAR(10),
    message TEXT,
    create_time DATETIME
) ENGINE=ARCHIVE;  -- 压缩存储

-- 定时任务迁移数据
INSERT INTO app_logs_cold 
SELECT * FROM app_logs_hot 
WHERE create_time < DATE_SUB(NOW(), INTERVAL 7 DAY);

DELETE FROM app_logs_hot 
WHERE create_time < DATE_SUB(NOW(), INTERVAL 7 DAY);
```

**方案三：迁移到专用日志系统**

推荐使用 Elasticsearch 或 ClickHouse 作为日志存储。

### 3.4 最终方案

采用**表分区 + 定期归档**：

```sql
-- 1. 按月分区
ALTER TABLE app_logs PARTITION BY RANGE (TO_DAYS(create_time)) (...);

-- 2. 定期删除旧分区
ALTER TABLE app_logs DROP PARTITION p202201;  -- 瞬间完成

-- 3. 压缩存储
-- 使用 ROW_FORMAT=COMPRESSED 减少存储空间
ALTER TABLE app_logs ROW_FORMAT=COMPRESSED;

-- 4. 优化查询
-- 只查询必要字段
SELECT app_name, log_level, message, create_time
FROM app_logs
WHERE create_time >= '2022-04-01' AND create_time < '2022-05-01'
  AND log_level = 'ERROR'
ORDER BY create_time DESC
LIMIT 100;
```

### 3.5 效果验证

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 查询时间 | 30 秒 | 0.5 秒 |
| 存储空间 | 500GB | 150GB |
| 数据清理 | DELETE 耗时 | DROP PARTITION 瞬间 |

## 案例四：金融交易系统优化

### 4.1 场景描述

**业务背景**：银行交易流水查询，支持多维度筛选。

**问题现象**：
- 交易流水表超过 50 亿行
- 多条件组合查询超时
- 夜间批量对账任务执行时间过长

**表结构**：

```sql
CREATE TABLE transactions (
    id BIGINT PRIMARY KEY,
    trans_no VARCHAR(50),
    account_no VARCHAR(30),
    trans_type TINYINT,
    amount DECIMAL(18,2),
    balance DECIMAL(18,2),
    counter_account VARCHAR(30),
    channel TINYINT,
    status TINYINT,
    remark VARCHAR(200),
    trans_time DATETIME,
    INDEX idx_account(account_no),
    INDEX idx_time(trans_time),
    INDEX idx_type(trans_type)
);
```

### 4.2 慢查询示例

```sql
-- 多条件组合查询
SELECT * FROM transactions
WHERE account_no = '6222001234567890'
  AND trans_type IN (1, 2, 3)
  AND channel = 1
  AND trans_time >= '2022-01-01'
  AND trans_time < '2022-02-01'
ORDER BY trans_time DESC
LIMIT 100;
```

### 4.3 优化方案

**方案一：联合索引优化**

```sql
-- 分析查询模式
-- account_no: 等值条件，区分度高
-- trans_type: IN 条件，区分度中等
-- channel: 等值条件，区分度低
-- trans_time: 范围条件 + 排序

-- 创建联合索引
CREATE INDEX idx_account_type_channel_time ON transactions(
    account_no, 
    trans_type, 
    channel, 
    trans_time DESC
);
```

**方案二：分库分表**

```sql
-- 按账户号哈希分表
-- transactions_00 ~ transactions_63
-- 分片键：account_no

-- 分片算法
-- 表号 = CRC32(account_no) % 64
```

**方案三：读写分离**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       读写分离架构                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐                                                       │
│   │   应用层    │                                                       │
│   └──────┬──────┘                                                       │
│          │                                                              │
│          ▼                                                              │
│   ┌─────────────┐                                                       │
│   │  中间件层   │ ─── 写操作 ──► 主库 ───► 主从同步                     │
│   │ (ShardingSphere)                                                    │
│   └─────────────┘          读操作 ──► 从库                              │
│          │                                                              │
│          ▼                                                              │
│   ┌──────────────────────────────────────────────────────┐             │
│   │                    主库                              │             │
│   │  实时交易写入、账户余额更新                           │             │
│   └──────────────────────────────────────────────────────┘             │
│          │                                                              │
│          │ 主从同步                                                     │
│          ▼                                                              │
│   ┌──────────────────────────────────────────────────────┐             │
│   │                    从库                              │             │
│   │  交易流水查询、账单查询、对账任务                     │             │
│   └──────────────────────────────────────────────────────┘             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.4 最终方案

**综合采用联合索引 + 分库分表 + 读写分离**：

```sql
-- 1. 联合索引（单表优化）
CREATE INDEX idx_account_time ON transactions(account_no, trans_time DESC);

-- 2. 分库分表（水平扩展）
-- 按 account_no 分 64 张表，分布在 8 个库

-- 3. 读写分离
-- 写操作走主库，读操作走从库

-- 4. 对账任务优化
-- 原始：单线程批量查询
-- 优化：多线程并行处理，每次处理一个分片
```

### 4.5 效果验证

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 查询响应 | 60 秒 | 0.5 秒 |
| 对账任务 | 8 小时 | 30 分钟 |
| 系统吞吐 | 5000 TPS | 50000 TPS |

## 五、优化方法论总结

### 5.1 优化流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       慢查询优化标准流程                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. 发现问题                                                           │
│      ├── 监控告警                                                       │
│      ├── 用户反馈                                                       │
│      └── 慢查询日志分析                                                 │
│                                                                         │
│   2. 定位问题                                                           │
│      ├── EXPLAIN 分析执行计划                                           │
│      ├── 确认索引使用情况                                               │
│      └── 分析扫描行数和过滤效率                                         │
│                                                                         │
│   3. 分析原因                                                           │
│      ├── 索引问题（无索引、索引失效、索引选择错误）                     │
│      ├── SQL 问题（写法不当、JOIN 过多）                                │
│      └── 表结构问题（数据量过大、设计不合理）                           │
│                                                                         │
│   4. 制定方案                                                           │
│      ├── 索引优化（添加、修改、删除索引）                               │
│      ├── SQL 改写（优化 JOIN、子查询、分页）                            │
│      └── 架构调整（分区、分表、读写分离）                               │
│                                                                         │
│   5. 实施验证                                                           │
│      ├── 测试环境验证                                                   │
│      ├── 灰度发布                                                       │
│      └── 效果监控                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 优化原则

1. **先诊断，后优化**：不要盲目添加索引
2. **优先低成本方案**：索引优化 > SQL 改写 > 架构调整
3. **数据说话**：用 EXPLAIN 和实际测试验证效果
4. **权衡取舍**：读性能 vs 写性能，空间 vs 时间

## 总结

本章通过四个生产案例，展示了慢查询优化的完整过程：

1. **电商订单**：联合索引解决多条件查询
2. **社交动态流**：读写分离 + 推模式架构
3. **日志系统**：分区 + 冷热分离
4. **金融交易**：分库分表 + 读写分离

下一章将讲解监控与预防体系的搭建。

## 参考文献

- [MySQL 8.0 Reference Manual](https://dev.mysql.com/doc/refman/8.0/en/)
- [High Performance MySQL](https://www.oreilly.com/library/view/high-performance-mysql/9781449332471/)

## 下一章预告

**第7章：监控与预防体系**

- 慢查询监控告警
- 性能基线建设
- 自动化审核平台
- 优化效果跟踪
