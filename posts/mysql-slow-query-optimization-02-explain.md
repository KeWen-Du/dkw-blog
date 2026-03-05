---
title: "MySQL 慢查询优化实战（二）：EXPLAIN 执行计划深度解读"
date: "2022-04-30 10:00:00"
excerpt: "深入理解 EXPLAIN 执行计划的每个字段含义，掌握 type、key、Extra 等核心指标的分析方法，通过实战案例学会定位 SQL 性能瓶颈。"
tags: ["MySQL", "性能优化", "EXPLAIN", "执行计划"]
series:
  slug: "mysql-slow-query-optimization"
  title: "MySQL 慢查询优化实战"
  order: 2
---

## 前言

EXPLAIN 是 MySQL 提供的 SQL 执行计划分析工具，是慢查询优化的核心武器。正确解读 EXPLAIN 输出，才能精准定位性能瓶颈。本章将深入讲解每个字段的含义，配合大量实例帮助你建立执行计划分析能力。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 实现章节 |
|--------|------|----------|----------|
| EXPLAIN 输出字段解读 | ⭐⭐⭐ | 高频考点 | 本章 |
| type 访问类型分析 | ⭐⭐⭐⭐ | 高频考点 | 本章 |
| Extra 字段信息解读 | ⭐⭐⭐⭐ | 高频考点 | 本章 |
| 索引选择分析 | ⭐⭐⭐⭐ | 进阶考点 | 本章 |
| 执行计划优化案例 | ⭐⭐⭐⭐⭐ | 实战考点 | 本章 |

## 面试题覆盖

- EXPLAIN 的 type 字段有哪些值？效率从高到低排序？
- Extra 字段出现 "Using filesort" 意味着什么？
- 如何判断 SQL 是否使用了正确的索引？
- key 和 possible_keys 的区别是什么？
- rows 字段的值准确吗？如何理解？

## 一、EXPLAIN 基础

### 1.1 基本用法

```sql
-- 标准 EXPLAIN
EXPLAIN SELECT * FROM orders WHERE status = 'pending';

-- 扩展 EXPLAIN（MySQL 8.0.16+）
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';

-- 格式化输出
EXPLAIN FORMAT=JSON SELECT * FROM orders WHERE status = 'pending';
EXPLAIN FORMAT=TREE SELECT * FROM orders WHERE status = 'pending';
```

### 1.2 输出概览

```sql
EXPLAIN SELECT * FROM orders WHERE status = 'pending'\G
```

```
*************************** 1. row ***************************
           id: 1
  select_type: SIMPLE
        table: orders
   partitions: NULL
         type: ref
possible_keys: idx_status
          key: idx_status
      key_len: 1
          ref: const
         rows: 1523
     filtered: 100.00
        Extra: NULL
```

## 二、id 字段：查询标识符

### 2.1 含义

- id 相同：从上往下顺序执行
- id 不同：id 越大越先执行
- id 为 NULL：表示结果集，不需要执行

### 2.2 实例分析

**案例1：关联查询**

```sql
EXPLAIN SELECT o.*, u.username 
FROM orders o 
JOIN users u ON o.user_id = u.id 
WHERE o.status = 'pending';
```

```
+----+-------------+-------+------+---------------+------------+---------+--------------+
| id | select_type | table | type | possible_keys | key        | ref     | rows         |
+----+-------------+-------+------+---------------+------------+---------+--------------+
|  1 | SIMPLE      | o     | ref  | idx_status    | idx_status | const   | 1523         |
|  1 | SIMPLE      | u     | eq_ref| PRIMARY      | PRIMARY    | o.user_id| 1           |
+----+-------------+-------+------+---------------+------------+---------+--------------+
```

两行 id 相同，从上往下执行：先查 orders，再关联 users。

**案例2：子查询**

```sql
EXPLAIN SELECT * FROM orders 
WHERE user_id IN (SELECT id FROM users WHERE level > 5);
```

```
+----+-------------+-------+------+---------------+------------+---------+------+
| id | select_type | table | type | possible_keys | key        | rows    | Extra|
+----+-------------+-------+------+---------------+------------+---------+------+
|  1 | SIMPLE      | users | range| PRIMARY,idx_level | idx_level | 500 | Using where; Using index |
|  1 | SIMPLE      | orders| ref  | idx_user_id   | idx_user_id| 10   | NULL |
+----+-------------+-------+------+---------------+------------+---------+------+
```

MySQL 8.0 优化器将子查询改写为半连接，两表 id 相同。

## 三、select_type 字段：查询类型

| select_type | 含义 | 性能影响 |
|-------------|------|---------|
| SIMPLE | 不包含子查询或 UNION | 最优 |
| PRIMARY | 外层查询 | 较优 |
| SUBQUERY | 子查询中的第一个 SELECT | 中等 |
| DERIVED | 派生表（FROM 子句中的子查询） | 需物化，较慢 |
| UNION | UNION 中的第二个及之后的 SELECT | 中等 |
| UNION RESULT | UNION 的结果 | 需临时表 |
| DEPENDENT SUBQUERY | 依赖外层的子查询 | 慢，可能优化 |

### 3.1 生产案例：派生表优化

**慢查询场景**：

```sql
-- 执行时间：8.5秒
SELECT o.* FROM (
    SELECT * FROM orders WHERE create_time > '2022-01-01'
) o
WHERE o.status = 'pending';
```

```
+----+-------------+------------+------+---------------+------+---------+------+--------+-------------+
| id | select_type | table      | type | possible_keys | key  | rows    | Extra                       |
+----+-------------+------------+------+---------------+------+---------+------+--------+-------------+
|  1 | PRIMARY     | <derived2> | ref  | <auto_key0>   | ...  | 1523    | NULL                        |
|  2 | DERIVED     | orders     | ALL  | idx_create    | NULL | 5000000 | Using where                 |
+----+-------------+------------+------+---------------+------+---------+------+--------+-------------+
```

**问题**：派生表导致全表扫描，无法利用索引。

**优化方案**：

```sql
-- 合并查询，执行时间：0.05秒
SELECT * FROM orders 
WHERE create_time > '2022-01-01' AND status = 'pending';
```

## 四、type 字段：访问类型（核心）

### 4.1 访问类型排序

从优到差：

```
system > const > eq_ref > ref > fulltext > ref_or_null > index_merge > 
range > index > ALL
```

### 4.2 各类型详解

#### system

表只有一行数据（系统表）。

```sql
EXPLAIN SELECT * FROM (SELECT 1) AS t;
-- type: system
```

#### const

主键或唯一索引等值查询，最多返回一行。

```sql
EXPLAIN SELECT * FROM orders WHERE id = 1001;
-- type: const
```

#### eq_ref

关联查询时，被关联表使用主键或唯一索引。

```sql
EXPLAIN SELECT o.*, u.username 
FROM orders o 
JOIN users u ON o.user_id = u.id;
-- users 表 type: eq_ref（主键关联）
```

#### ref

非唯一索引等值查询。

```sql
EXPLAIN SELECT * FROM orders WHERE status = 'pending';
-- type: ref（status 是普通索引）
```

#### ref_or_null

类似 ref，额外搜索 NULL 值。

```sql
EXPLAIN SELECT * FROM orders WHERE status = 'pending' OR status IS NULL;
-- type: ref_or_null
```

#### index_merge

多个索引合并使用。

```sql
EXPLAIN SELECT * FROM orders 
WHERE status = 'pending' OR user_id = 100;
-- type: index_merge（假设 status 和 user_id 都有索引）
```

#### range

索引范围扫描。

```sql
EXPLAIN SELECT * FROM orders WHERE id BETWEEN 1000 AND 2000;
EXPLAIN SELECT * FROM orders WHERE status IN ('pending', 'processing');
EXPLAIN SELECT * FROM orders WHERE create_time > '2022-01-01';
-- type: range
```

#### index

全索引扫描（遍历整个索引树）。

```sql
EXPLAIN SELECT id FROM orders;
-- type: index（id 是主键，扫描主键索引）
```

#### ALL

全表扫描（最差情况）。

```sql
EXPLAIN SELECT * FROM orders WHERE description LIKE '%iPhone%';
-- type: ALL（LIKE 前导通配符导致索引失效）
```

### 4.3 性能对比

| type | 扫描行数 | 级别 | 建议 |
|------|---------|------|------|
| system/const | 1 | 最优 | - |
| eq_ref | 1 | 最优 | 关联查询目标 |
| ref | 少量 | 良好 | 单表查询目标 |
| range | 范围内 | 可接受 | 范围查询目标 |
| index | 全索引 | 较差 | 需评估 |
| ALL | 全表 | 最差 | 必须优化 |

## 五、key 字段：索引使用情况

### 5.1 相关字段

| 字段 | 含义 |
|------|------|
| possible_keys | 可能使用的索引列表 |
| key | 实际使用的索引 |
| key_len | 使用的索引长度（字节） |
| ref | 索引比较的列或常量 |

### 5.2 key_len 计算规则

**计算公式**：

```
key_len = 列长度 + 是否允许NULL(1字节) + 变长字段长度(2字节)
```

**常用数据类型长度**：

| 类型 | 字节数 | 备注 |
|------|--------|------|
| TINYINT | 1 | - |
| INT | 4 | - |
| BIGINT | 8 | - |
| VARCHAR(N) | N × 字符集字节 | utf8mb4=4字节/字符 |
| DATE | 3 | - |
| DATETIME | 8 | - |

**案例分析**：

```sql
-- 假设索引 idx_user_status(user_id INT, status VARCHAR(20))
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    INDEX idx_user_status(user_id, status)
);

-- 只用 user_id
EXPLAIN SELECT * FROM orders WHERE user_id = 100;
-- key_len: 4 (INT = 4字节)

-- 用 user_id + status
EXPLAIN SELECT * FROM orders WHERE user_id = 100 AND status = 'pending';
-- key_len: 4 + 20*4 + 2 = 86 (INT + VARCHAR最大长度 + 变长标识)
```

### 5.3 生产案例：索引选择错误

**场景**：

```sql
-- 表结构
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    user_id INT,
    status VARCHAR(20),
    create_time DATETIME,
    INDEX idx_user(user_id),
    INDEX idx_status(status),
    INDEX idx_create(create_time)
);

-- 慢查询（执行时间：15秒）
SELECT * FROM orders 
WHERE user_id = 100 AND status = 'pending' AND create_time > '2022-01-01';
```

**执行计划**：

```
type: ref
possible_keys: idx_user,idx_status,idx_create
key: idx_status
rows: 500000
Extra: Using where
```

**问题分析**：

优化器选择了 `idx_status`，但 `status = 'pending'` 匹配了 50 万条记录。

**解决方案**：创建联合索引

```sql
CREATE INDEX idx_user_status_create ON orders(user_id, status, create_time);
```

**优化后执行计划**：

```
type: ref
key: idx_user_status_create
rows: 50
Extra: Using index condition
```

执行时间降至 0.02 秒。

## 六、rows 与 filtered 字段

### 6.1 rows 字段

预估需要扫描的行数，是优化器基于统计信息的估算值。

```sql
-- 更新统计信息
ANALYZE TABLE orders;

-- 查看统计信息
SHOW INDEX FROM orders;
```

### 6.2 filtered 字段

表示存储引擎返回的数据经过 WHERE 条件过滤后的百分比。

```sql
EXPLAIN SELECT * FROM orders WHERE user_id = 100 AND status LIKE '%pending%';
```

```
+----+-------+------+---------+------+----------+-------------+----------+-------+
| id | table | type | key     | ref  | rows     | filtered    | Extra                       |
+----+-------+------+---------+------+----------+-------------+----------+-------+
|  1 | orders| ref  | idx_user| const| 1000     | 10.00       | Using where                 |
+----+-------+------+---------+------+----------+-------------+----------+-------+
```

**解读**：
- `rows = 1000`：索引扫描 1000 行
- `filtered = 10%`：只有 10% 满足 LIKE 条件
- 实际返回：1000 × 10% = 100 行

## 七、Extra 字段：额外信息（重要）

### 7.1 常见值解读

| Extra 值 | 含义 | 性能影响 |
|---------|------|---------|
| Using index | 覆盖索引，不回表 | 最优 |
| Using where | WHERE 过滤 | 正常 |
| Using index condition | 索引条件下推 | 较优 |
| Using temporary | 使用临时表 | 需优化 |
| Using filesort | 文件排序 | 需优化 |
| Using join buffer | 使用连接缓存 | 可优化 |
| Using union | 索引合并 | 正常 |

### 7.2 生产案例详解

#### 案例1：Using filesort 导致慢查询

**场景**：

```sql
-- 慢查询（执行时间：5秒）
SELECT * FROM orders WHERE user_id = 100 ORDER BY create_time DESC LIMIT 10;
```

**执行计划**：

```
type: ref
key: idx_user
rows: 50000
Extra: Using where; Using filesort
```

**问题**：使用了 `idx_user` 索引，但排序需要 filesort。

**解决方案**：

```sql
CREATE INDEX idx_user_create ON orders(user_id, create_time DESC);

-- 优化后
EXPLAIN SELECT * FROM orders WHERE user_id = 100 ORDER BY create_time DESC LIMIT 10;
```

```
type: ref
key: idx_user_create
rows: 10
Extra: Using index condition; Backward index scan
```

执行时间降至 0.01 秒。

#### 案例2：Using temporary 导致慢查询

**场景**：

```sql
-- 慢查询（执行时间：12秒）
SELECT status, COUNT(*) FROM orders GROUP BY status;
```

**执行计划**：

```
type: ALL
rows: 5000000
Extra: Using temporary; Using filesort
```

**问题**：无索引，需要创建临时表进行分组。

**解决方案**：

```sql
CREATE INDEX idx_status ON orders(status);

-- 优化后
EXPLAIN SELECT status, COUNT(*) FROM orders GROUP BY status;
```

```
type: index
key: idx_status
rows: 100
Extra: Using index
```

#### 案例3：Using index 覆盖索引

**场景**：

```sql
-- 只查询索引列
SELECT user_id, status FROM orders WHERE user_id = 100;
```

**执行计划**：

```
type: ref
key: idx_user_status
Extra: Using index
```

**解读**：查询只需要索引列，不需要回表读取数据行，性能最优。

### 7.3 Extra 优化建议

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Extra 字段优化决策树                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Extra = Using filesort ?                                              │
│       │                                                                 │
│       ├─ Yes ──► 检查 ORDER BY 列是否可以加入索引                       │
│       │                                                                 │
│       └─ No                                                              │
│           │                                                             │
│           └─ Extra = Using temporary ?                                  │
│               │                                                         │
│               ├─ Yes ──► 检查 GROUP BY 列是否可以加入索引               │
│               │                                                         │
│               └─ No ──► 检查是否可以优化为 Using index                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 八、EXPLAIN ANALYZE（MySQL 8.0.18+）

### 8.1 概述

`EXPLAIN ANALYZE` 不仅显示执行计划，还实际执行查询并返回真实的时间统计。

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';
```

```
-> Filter: (orders.status = 'pending')  (cost=1523.50 rows=1523) (actual time=0.045..12.345 rows=1523 loops=1)
    -> Index lookup on orders using idx_status (status='pending')  (cost=1523.50 rows=1523) (actual time=0.042..10.234 rows=1523 loops=1)
```

### 8.2 输出解读

| 字段 | 含义 |
|------|------|
| cost | 优化器估算成本 |
| rows | 估算行数 |
| actual time | 实际执行时间（毫秒） |
| rows (actual) | 实际返回行数 |
| loops | 循环次数 |

### 8.3 生产案例

**场景**：优化器选择错误索引

```sql
EXPLAIN ANALYZE SELECT * FROM orders 
WHERE user_id = 100 AND status = 'pending';
```

```
-> Filter: (orders.status = 'pending')  (actual time=0.05..850.23 rows=50 loops=1)
    -> Index lookup on orders using idx_user (user_id=100)  (actual time=0.04..800.15 rows=50000 loops=1)
```

**分析**：`idx_user` 返回 50000 行，但最终只要 50 行，效率低。

**优化**：

```sql
CREATE INDEX idx_user_status ON orders(user_id, status);

EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 100 AND status = 'pending';
```

```
-> Index lookup on orders using idx_user_status (user_id=100, status='pending')  (actual time=0.04..0.52 rows=50 loops=1)
```

## 九、实战演练

### 9.1 案例：电商订单查询优化

**原始 SQL**：

```sql
SELECT o.*, u.username, u.phone
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE o.status = 'pending'
  AND o.create_time > '2022-01-01'
ORDER BY o.create_time DESC
LIMIT 20;
```

**执行计划分析**：

```sql
EXPLAIN SELECT o.*, u.username, u.phone
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE o.status = 'pending'
  AND o.create_time > '2022-01-01'
ORDER BY o.create_time DESC
LIMIT 20;
```

```
+----+-------+------+---------------+------+----------+----------------------------------------------+
| id | table | type | key           | rows | filtered | Extra                                        |
+----+-------+------+---------------+------+----------+----------------------------------------------+
|  1 | o     | ref  | idx_status    | 5000 |    50.00 | Using where; Using filesort                  |
|  1 | u     | eq_ref| PRIMARY      |    1 |   100.00 | NULL                                         |
+----+-------+------+---------------+------+----------+----------------------------------------------+
```

**问题诊断**：

1. `type = ref`，使用 `idx_status` 索引
2. `rows = 5000`，扫描行数较多
3. `Extra = Using filesort`，需要额外排序

**优化方案**：

```sql
-- 创建联合索引
CREATE INDEX idx_status_create ON orders(status, create_time DESC);

-- 优化后执行计划
EXPLAIN SELECT ... \G
```

```
           id: 1
  select_type: SIMPLE
        table: o
         type: ref
possible_keys: idx_status,idx_status_create
          key: idx_status_create
         rows: 20
        Extra: Using index condition; Backward index scan
```

## 十、最佳实践

### 10.1 EXPLAIN 使用清单

- [ ] 所有慢查询必须先 EXPLAIN 分析
- [ ] 关注 type 字段，目标达到 ref 或以上
- [ ] 关注 rows 字段，扫描行数应尽量少
- [ ] 关注 Extra 字段，避免 filesort 和 temporary
- [ ] 对比 possible_keys 和 key，确认索引选择
- [ ] 使用 EXPLAIN ANALYZE 验证实际执行情况

### 10.2 常见问题排查表

| 现象 | 可能原因 | 解决方案 |
|------|---------|---------|
| type = ALL | 无索引或索引失效 | 添加索引，检查索引失效原因 |
| key = NULL | 未使用索引 | 检查 WHERE 条件列是否有索引 |
| rows 过大 | 索引区分度低 | 优化索引列顺序或添加列 |
| Using filesort | ORDER BY 列无索引 | 添加联合索引包含排序列 |
| Using temporary | GROUP BY 无索引 | 添加索引包含分组列 |

## 总结

本章深入讲解了 EXPLAIN 执行计划的各个字段：

1. **type 字段**：从 system 到 ALL，性能递减
2. **key 字段**：关注实际使用的索引和 key_len
3. **rows 字段**：预估扫描行数，越小越好
4. **Extra 字段**：Using filesort/temporary 需要优化

掌握 EXPLAIN 分析是慢查询优化的基础能力，下一章将深入索引优化实战。

## 参考文献

- [MySQL 8.0 EXPLAIN Output Format](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html)
- [MySQL 8.0 EXPLAIN ANALYZE](https://dev.mysql.com/doc/refman/8.0/en/explain-extended.html)

## 下一章预告

**第3章：索引优化实战**

- 索引设计原则与最佳实践
- 联合索引与最左前缀原则
- 索引失效的常见场景
- 生产案例：索引优化全过程
