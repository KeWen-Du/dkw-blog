---
title: "MySQL 慢查询优化实战（三）：索引优化实战"
date: "2022-04-26"
excerpt: "掌握索引设计的核心原则，深入理解联合索引、覆盖索引、索引下推等高级特性，通过生产案例学会解决索引失效和索引选择错误等问题。"
tags: ["MySQL", "性能优化", "索引", "数据库"]
series:
  slug: "mysql-slow-query-optimization"
  title: "MySQL 慢查询优化实战"
  order: 3
---

## 前言

索引是数据库性能优化的核心武器。然而，错误的索引设计不仅无法提升性能，反而会增加写入开销和存储空间。本章从索引原理出发，结合大量生产案例，帮助你建立系统化的索引优化能力。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 实现章节 |
|--------|------|----------|----------|
| B+ 树索引原理 | ⭐⭐⭐ | 高频考点 | 本章 |
| 联合索引设计 | ⭐⭐⭐⭐ | 高频考点 | 本章 |
| 覆盖索引优化 | ⭐⭐⭐⭐ | 高频考点 | 本章 |
| 索引失效场景 | ⭐⭐⭐⭐ | 高频考点 | 本章 |
| 索引下推优化 | ⭐⭐⭐⭐ | 进阶考点 | 本章 |

## 面试题覆盖

- MySQL 索引的数据结构是什么？为什么选择 B+ 树？
- 什么是联合索引？最左前缀原则是什么？
- 哪些情况会导致索引失效？
- 什么是覆盖索引？有什么优势？
- 什么是索引下推？能优化什么场景？

## 一、索引基础

### 1.1 B+ 树结构

MySQL InnoDB 使用 B+ 树作为索引结构：

```
                                    ┌─────────────────┐
                                    │   Root Node     │
                                    │  (K1, K2, K3)   │
                                    └────────┬────────┘
                        ┌─────────────────────┼─────────────────────┐
                        ▼                     ▼                     ▼
                ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
                │ Branch Node   │     │ Branch Node   │     │ Branch Node   │
                │ (K1, K2)      │     │ (K3, K4)      │     │ (K5, K6)      │
                └───────┬───────┘     └───────┬───────┘     └───────┬───────┘
           ┌────────────┼────────────┐  ...                      ...
           ▼            ▼            ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │ Leaf Node  │ │ Leaf Node  │ │ Leaf Node  │
    │ (K1→RowID) │ │ (K2→RowID) │ │ (K3→RowID) │
    └────────────┘ └────────────┘ └────────────┘
         ↕              ↕              ↕
    ←──────────── 双向链表连接 ────────────→
```

**B+ 树特点**：

| 特点 | 说明 | 优势 |
|------|------|------|
| 非叶子节点不存数据 | 只存储键值和指针 | 单节点存储更多键，树更矮 |
| 叶子节点存所有数据 | 键值 + 行数据/主键 | 范围查询高效 |
| 叶子节点双向链表 | 便于顺序访问 | 范围扫描无需回溯 |
| 高度通常 3-4 层 | 千万级数据 | 查询稳定，3-4 次 IO |

### 1.2 聚簇索引与非聚簇索引

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        聚簇索引 vs 非聚簇索引                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   聚簇索引（主键索引）                                                   │
│   ┌───────────────┐                                                     │
│   │ 叶子节点      │──► 存储完整行数据                                   │
│   │ id = 1001     │                                                     │
│   │ {name, age..}│                                                     │
│   └───────────────┘                                                     │
│                                                                         │
│   非聚簇索引（二级索引）                                                 │
│   ┌───────────────┐         ┌───────────────┐                          │
│   │ 叶子节点      │──► 回表 ──► 聚簇索引叶节点 │                         │
│   │ name = 'Tom'  │         │ id = 1001     │                          │
│   │ id = 1001     │         │ {完整数据}    │                          │
│   └───────────────┘         └───────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**关键差异**：

| 维度 | 聚簇索引 | 非聚簇索引 |
|------|---------|-----------|
| 叶子节点 | 完整行数据 | 主键值 + 索引列 |
| 查询方式 | 直接返回 | 可能需要回表 |
| 数量 | 每表一个 | 可多个 |
| 存储 | 按主键顺序存储 | 独立存储 |

### 1.3 回表代价

**生产案例**：

```sql
-- 表结构
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50),
    email VARCHAR(100),
    age INT,
    INDEX idx_username(username)
);

-- 查询需要回表
SELECT id, username, email FROM users WHERE username = 'tom123';
```

**执行过程**：

```
1. 扫描 idx_username 索引，找到 username = 'tom123' 的叶子节点
2. 获取主键值 id = 1001
3. 回表：根据 id = 1001 扫描聚簇索引，获取完整行数据
4. 返回 id, username, email 字段
```

**优化方案：覆盖索引**

```sql
-- 创建覆盖索引
CREATE INDEX idx_username_email ON users(username, email);

-- 无需回表
EXPLAIN SELECT id, username, email FROM users WHERE username = 'tom123';
-- Extra: Using index
```

## 二、联合索引设计

### 2.1 最左前缀原则

联合索引按照定义顺序构建，查询必须从最左列开始匹配。

```sql
-- 联合索引
CREATE INDEX idx_a_b_c ON t(a, b, c);

-- 索引结构（按 a, b, c 排序）
+-----+-----+-----+
|  a  |  b  |  c  |
+-----+-----+-----+
|  1  |  1  |  1  |
|  1  |  1  |  2  |
|  1  |  2  |  1  |
|  2  |  1  |  1  |
|  2  |  2  |  1  |
+-----+-----+-----+
```

**索引使用分析**：

| WHERE 条件 | 是否使用索引 | 使用部分 |
|-----------|-------------|---------|
| `WHERE a = 1` | ✅ | a |
| `WHERE a = 1 AND b = 2` | ✅ | a, b |
| `WHERE a = 1 AND b = 2 AND c = 1` | ✅ | a, b, c |
| `WHERE b = 2` | ❌ | 无 |
| `WHERE a = 1 AND c = 1` | ⚠️ | 仅 a |
| `WHERE a = 1 AND b > 2 AND c = 1` | ⚠️ | a, b（c 无法使用） |

### 2.2 联合索引设计原则

**原则一：区分度高的列放前面**

```sql
-- 区分度计算
SELECT 
    COUNT(DISTINCT status) / COUNT(*) as status_selectivity,
    COUNT(DISTINCT user_id) / COUNT(*) as user_selectivity,
    COUNT(DISTINCT create_time) / COUNT(*) as time_selectivity
FROM orders;

-- 假设结果：
-- status_selectivity: 0.001 (差)
-- user_selectivity: 0.8 (好)
-- time_selectivity: 0.95 (最好)

-- 推荐索引顺序
CREATE INDEX idx_user_status ON orders(user_id, status);  -- 而非 idx_status_user
```

**原则二：覆盖常用查询**

```sql
-- 常见查询模式
SELECT user_id, status FROM orders WHERE user_id = 100;
SELECT user_id, status, create_time FROM orders WHERE user_id = 100 AND status = 'pending';

-- 设计联合索引覆盖这些查询
CREATE INDEX idx_user_status_create ON orders(user_id, status, create_time);
```

**原则三：排序字段放最后**

```sql
-- 需要排序的查询
SELECT * FROM orders WHERE user_id = 100 ORDER BY create_time DESC LIMIT 10;

-- 索引设计：过滤字段 + 排序字段
CREATE INDEX idx_user_create ON orders(user_id, create_time DESC);
```

### 2.3 生产案例：联合索引优化

**场景**：电商订单列表查询慢

```sql
-- 慢查询（执行时间：8秒）
SELECT * FROM orders 
WHERE user_id = 12345 
  AND status IN ('pending', 'processing')
  AND create_time > '2022-01-01'
ORDER BY create_time DESC 
LIMIT 20;
```

**原执行计划**：

```
type: ref
key: idx_user
rows: 50000
Extra: Using where; Using filesort
```

**问题分析**：

1. 只有 `idx_user(user_id)` 单列索引
2. 需要过滤 status 和 create_time
3. 需要额外排序

**优化方案**：

```sql
-- 设计联合索引
CREATE INDEX idx_user_status_create ON orders(user_id, status, create_time DESC);

-- 优化后执行计划
EXPLAIN SELECT * FROM orders 
WHERE user_id = 12345 
  AND status IN ('pending', 'processing')
  AND create_time > '2022-01-01'
ORDER BY create_time DESC 
LIMIT 20;
```

```
type: range
key: idx_user_status_create
rows: 20
Extra: Using index condition; Backward index scan
```

执行时间降至 0.02 秒。

## 三、索引失效场景

### 3.1 常见索引失效场景

#### 场景1：LIKE 前导通配符

```sql
-- 索引失效
SELECT * FROM users WHERE username LIKE '%tom%';

-- 索引有效
SELECT * FROM users WHERE username LIKE 'tom%';
```

**解决方案**：使用全文索引或 Elasticsearch

```sql
-- 全文索引（适合文本搜索）
ALTER TABLE users ADD FULLTEXT INDEX ft_username(username);
SELECT * FROM users WHERE MATCH(username) AGAINST('tom' IN BOOLEAN MODE);
```

#### 场景2：对索引列使用函数

```sql
-- 索引失效
SELECT * FROM orders WHERE DATE(create_time) = '2022-04-30';

-- 索引有效
SELECT * FROM orders WHERE create_time >= '2022-04-30 00:00:00' 
                        AND create_time < '2022-05-01 00:00:00';
```

#### 场景3：隐式类型转换

```sql
-- 表结构
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    phone VARCHAR(20),
    INDEX idx_phone(phone)
);

-- 索引失效（phone 是字符串，比较时用了数字）
SELECT * FROM users WHERE phone = 13800138000;

-- 索引有效（使用字符串）
SELECT * FROM users WHERE phone = '13800138000';
```

#### 场景4：OR 条件

```sql
-- 索引可能失效
SELECT * FROM orders WHERE user_id = 100 OR status = 'pending';

-- 优化：使用 UNION
SELECT * FROM orders WHERE user_id = 100
UNION
SELECT * FROM orders WHERE status = 'pending';
```

#### 场景5：不等于条件

```sql
-- 索引可能失效
SELECT * FROM orders WHERE status != 'cancelled';

-- 优化：使用 IN
SELECT * FROM orders WHERE status IN ('pending', 'processing', 'completed');
```

#### 场景6：索引列参与计算

```sql
-- 索引失效
SELECT * FROM orders WHERE user_id + 1 = 101;

-- 索引有效
SELECT * FROM orders WHERE user_id = 100;
```

#### 场景7：IS NULL / IS NOT NULL

```sql
-- 可能不使用索引（取决于数据分布）
SELECT * FROM orders WHERE status IS NULL;

-- 优化：设置默认值，避免 NULL
ALTER TABLE orders MODIFY status VARCHAR(20) DEFAULT 'unknown';
```

### 3.2 索引失效排查清单

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       索引失效排查清单                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   □ LIKE 是否以前导通配符开头？                                          │
│   □ 索引列是否使用了函数？                                               │
│   □ 是否存在隐式类型转换？                                               │
│   □ OR 条件两侧是否都有索引？                                            │
│   □ 是否使用了 != 或 <> 操作符？                                         │
│   □ 索引列是否参与了计算？                                               │
│   □ 是否大量查询 NULL 值？                                               │
│   □ 联合索引是否满足最左前缀？                                           │
│   □ 数据分布是否导致优化器放弃索引？                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 生产案例：隐式转换导致慢查询

**场景**：用户登录查询慢

```sql
-- 表结构
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    phone VARCHAR(20),
    password_hash VARCHAR(64),
    INDEX idx_phone(phone)
);

-- 慢查询（执行时间：5秒）
SELECT * FROM users WHERE phone = 13800138000;
```

**执行计划**：

```
type: ALL
key: NULL
rows: 5000000
Extra: Using where
```

**问题分析**：

`phone` 是 VARCHAR 类型，传入数字参数，MySQL 会进行隐式转换，相当于：

```sql
SELECT * FROM users WHERE CAST(phone AS SIGNED) = 13800138000;
```

对索引列进行 CAST 函数操作，导致索引失效。

**解决方案**：

```sql
-- 应用层传入字符串参数
SELECT * FROM users WHERE phone = '13800138000';
```

```
type: ref
key: idx_phone
rows: 1
```

执行时间降至 0.001 秒。

## 四、覆盖索引

### 4.1 概念

覆盖索引是指查询的所有字段都包含在索引中，无需回表读取数据行。

```sql
-- 普通索引查询（需要回表）
SELECT * FROM orders WHERE user_id = 100;
-- Extra: NULL

-- 覆盖索引查询（无需回表）
SELECT user_id, status FROM orders WHERE user_id = 100;
-- Extra: Using index
```

### 4.2 优势

| 优势 | 说明 |
|------|------|
| 减少 IO | 只需扫描索引，无需回表 |
| 减少内存 | 索引数据量小于表数据 |
| 避免锁竞争 | 索引扫描锁定更少行 |

### 4.3 生产案例：覆盖索引优化

**场景**：订单状态统计

```sql
-- 慢查询（执行时间：3秒）
SELECT COUNT(*) FROM orders WHERE status = 'pending' AND create_time > '2022-01-01';
```

**原执行计划**：

```
type: ref
key: idx_status
rows: 500000
Extra: Using where
```

**问题**：需要回表检查 create_time 条件。

**优化方案**：

```sql
-- 创建覆盖索引
CREATE INDEX idx_status_create ON orders(status, create_time);

-- 优化后
EXPLAIN SELECT COUNT(*) FROM orders WHERE status = 'pending' AND create_time > '2022-01-01';
```

```
type: range
key: idx_status_create
rows: 50000
Extra: Using where; Using index
```

执行时间降至 0.1 秒。

## 五、索引下推（ICP）

### 5.1 概念

Index Condition Pushdown（索引下推）是 MySQL 5.6 引入的优化，将 WHERE 条件的过滤下推到存储引擎层，减少回表次数。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       索引下推优化示意                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   无 ICP（MySQL 5.5）                                                   │
│   ┌───────────┐      ┌───────────┐      ┌───────────┐                  │
│   │ 存储引擎  │ ───► │ 服务层    │ ───► │ 检查条件  │                  │
│   │ 索引扫描  │ 回表 │ 整理数据  │ 过滤 │ 保留/丢弃 │                  │
│   └───────────┘      └───────────┘      └───────────┘                  │
│   回表次数 = 匹配行数                                                    │
│                                                                         │
│   有 ICP（MySQL 5.6+）                                                  │
│   ┌───────────────────────┐      ┌───────────┐                        │
│   │ 存储引擎              │      │ 服务层    │                        │
│   │ 索引扫描 + 条件过滤    │ ───► │ 整理数据  │                        │
│   │ 只回表满足条件的行    │      └───────────┘                        │
│   └───────────────────────┘                                            │
│   回表次数 = 满足条件的行数                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 使用条件

- 联合索引的部分字段在 WHERE 条件中
- 条件可以在索引上判断
- MySQL 5.6+ 版本

### 5.3 生产案例

**场景**：

```sql
-- 表结构
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT,
    status VARCHAR(20),
    create_time DATETIME,
    INDEX idx_user_status(user_id, status)
);

-- 查询
SELECT * FROM orders WHERE user_id = 100 AND status LIKE 'pend%';
```

**无 ICP**：

```
1. 存储引擎：扫描 idx_user_status，找到 user_id = 100 的所有行（假设 1000 行）
2. 回表 1000 次，获取完整行数据
3. 服务层：过滤 status LIKE 'pend%'，假设剩余 100 行
4. 返回 100 行结果
```

**有 ICP**：

```
1. 存储引擎：扫描 idx_user_status，找到 user_id = 100 且 status LIKE 'pend%' 的行（100 行）
2. 只回表 100 次
3. 服务层：返回 100 行结果
```

**执行计划对比**：

```sql
-- 无 ICP（关闭 ICP）
SET optimizer_switch='index_condition_pushdown=off';
EXPLAIN SELECT * FROM orders WHERE user_id = 100 AND status LIKE 'pend%';
-- Extra: Using where

-- 有 ICP（开启 ICP）
SET optimizer_switch='index_condition_pushdown=on';
EXPLAIN SELECT * FROM orders WHERE user_id = 100 AND status LIKE 'pend%';
-- Extra: Using index condition
```

## 六、索引优化最佳实践

### 6.1 索引设计清单

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       索引设计清单                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   设计阶段                                                               │
│   □ WHERE 条件列是否有索引？                                            │
│   □ JOIN 关联列是否有索引？                                             │
│   □ ORDER BY 列是否可以考虑加入索引？                                   │
│   □ GROUP BY 列是否可以考虑加入索引？                                   │
│   □ 联合索引顺序是否按区分度排列？                                       │
│   □ 是否存在冗余索引？                                                  │
│                                                                         │
│   维护阶段                                                               │
│   □ 定期检查未使用的索引（sys.schema_unused_indexes）                   │
│   □ 定期更新统计信息（ANALYZE TABLE）                                   │
│   □ 监控索引碎片（ANALYZE TABLE）                                       │
│   □ 评估索引大小与收益                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 查找冗余索引

```sql
-- 查找冗余索引
SELECT 
    s.table_schema,
    s.table_name,
    s.index_name AS redundant_index,
    s.column_name AS redundant_column,
    r.index_name AS covered_by_index,
    r.column_name AS covered_by_column
FROM statistics s
JOIN statistics r ON s.table_schema = r.table_schema
    AND s.table_name = r.table_name
    AND s.index_name != r.index_name
    AND s.seq_in_index <= r.seq_in_index
    AND s.column_name = r.column_name
WHERE s.table_schema NOT IN ('mysql', 'information_schema', 'performance_schema')
GROUP BY s.table_schema, s.table_name, s.index_name, s.column_name;
```

### 6.3 索引优化建议表

| 场景 | 建议索引 | 示例 |
|------|---------|------|
| 等值查询 | 单列索引 | `WHERE user_id = 100` |
| 多条件查询 | 联合索引 | `WHERE user_id = 100 AND status = 'pending'` |
| 范围查询 | 联合索引（范围列放最后） | `WHERE user_id = 100 AND create_time > '2022-01-01'` |
| 排序查询 | 联合索引（含排序列） | `WHERE user_id = 100 ORDER BY create_time` |
| 分组统计 | 联合索引（含分组列） | `WHERE user_id = 100 GROUP BY status` |
| 只查索引列 | 覆盖索引 | `SELECT user_id, status FROM orders WHERE user_id = 100` |

## 总结

本章深入讲解了索引优化实战：

1. **索引原理**：B+ 树结构、聚簇索引与非聚簇索引
2. **联合索引**：最左前缀原则、设计三原则
3. **索引失效**：7 种常见失效场景及解决方案
4. **覆盖索引**：减少回表，提升性能
5. **索引下推**：减少回表次数的优化技术

下一章将讲解 SQL 语句优化技巧。

## 参考文献

- [MySQL 8.0 Optimization and Indexes](https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html)
- [InnoDB Buffer Pool](https://dev.mysql.com/doc/refman/8.0/en/innodb-buffer-pool.html)

## 下一章预告

**第4章：SQL 语句优化技巧**

- 分页查询优化（深分页问题）
- JOIN 优化策略
- 子查询优化
- 大数据量更新优化
