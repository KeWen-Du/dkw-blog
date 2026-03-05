---
title: "MySQL 慢查询优化实战（四）：SQL 语句优化技巧"
date: "2022-04-27"
excerpt: "掌握分页优化、JOIN 优化、子查询重写等 SQL 优化技巧，通过真实生产案例学会处理深分页、大表关联、批量更新等复杂场景。"
tags: ["MySQL", "性能优化", "SQL优化", "数据库"]
series:
  slug: "mysql-slow-query-optimization"
  title: "MySQL 慢查询优化实战"
  order: 4
---

## 前言

索引优化是性能调优的基础，但 SQL 语句的写法同样重要。同样的业务需求，不同的 SQL 写法可能有数十倍的性能差异。本章聚焦常见 SQL 场景的优化技巧，帮助你写出高性能的 SQL。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 实现章节 |
|--------|------|----------|----------|
| 深分页优化 | ⭐⭐⭐⭐ | 高频考点 | 本章 |
| JOIN 优化 | ⭐⭐⭐⭐ | 高频考点 | 本章 |
| 子查询优化 | ⭐⭐⭐⭐ | 中频考点 | 本章 |
| 批量更新优化 | ⭐⭐⭐ | 实战考点 | 本章 |
| COUNT 优化 | ⭐⭐⭐ | 中频考点 | 本章 |

## 面试题覆盖

- MySQL 深分页问题如何解决？
- LEFT JOIN 和 INNER JOIN 性能有什么区别？
- 子查询和 JOIN 哪个性能更好？
- 如何优化大数据量的批量更新？
- COUNT(*)、COUNT(1)、COUNT(列名) 有什么区别？

## 一、分页查询优化

### 1.1 深分页问题

**问题场景**：

```sql
-- 查询第 100 万页，每页 20 条
SELECT * FROM orders ORDER BY id LIMIT 1000000, 20;
```

**执行过程**：

```
1. 扫描前 1000020 行
2. 丢弃前 1000000 行
3. 返回后 20 行

扫描行数：1000020 行
实际返回：20 行
效率比：0.002%
```

**执行计划**：

```sql
EXPLAIN SELECT * FROM orders ORDER BY id LIMIT 1000000, 20;
```

```
type: index
key: PRIMARY
rows: 1000020
Extra: NULL
```

### 1.2 优化方案一：基于游标分页

**原理**：记录上一页最后一条记录的 ID，下次查询从该 ID 开始。

```sql
-- 第一页
SELECT * FROM orders WHERE id > 0 ORDER BY id LIMIT 20;
-- 假设最后一条 id = 20

-- 第二页（从 id = 20 开始）
SELECT * FROM orders WHERE id > 20 ORDER BY id LIMIT 20;
-- 假设最后一条 id = 40

-- 第 N 页（已知上一页最后 id = 1000000）
SELECT * FROM orders WHERE id > 1000000 ORDER BY id LIMIT 20;
```

**执行计划**：

```
type: range
key: PRIMARY
rows: 20
Extra: Using where
```

**优点**：
- 稳定的 O(1) 性能
- 无论翻到第几页，扫描行数固定

**缺点**：
- 无法跳页（必须顺序翻页）
- 需要前端配合

### 1.3 优化方案二：延迟关联

**原理**：先通过子查询获取符合条件的 ID，再关联获取完整数据。

```sql
-- 原始慢查询
SELECT * FROM orders ORDER BY id LIMIT 1000000, 20;

-- 优化：延迟关联
SELECT o.* 
FROM orders o
INNER JOIN (
    SELECT id FROM orders ORDER BY id LIMIT 1000000, 20
) t ON o.id = t.id;
```

**原理分析**：

```
子查询：只扫描主键索引，获取 20 个 ID
       主键索引更小，IO 更少
关联：  只回表 20 次，获取完整数据
```

**性能对比**：

| 方案 | 执行时间 | 扫描行数 |
|------|---------|---------|
| 原始 LIMIT | 12.5 秒 | 1000020 |
| 延迟关联 | 0.8 秒 | 1000020（只扫描索引）+ 20（回表） |

### 1.4 优化方案三：业务折衷

**场景**：用户不太可能翻到第 100 万页

```sql
-- 限制最大页数
SELECT * FROM orders ORDER BY id LIMIT 100000, 20;  -- 最多到第 5000 页

-- 前端提示：已展示全部结果，请使用搜索缩小范围
```

### 1.5 生产案例：电商订单列表

**原始 SQL**：

```sql
-- 慢查询（执行时间：8秒）
SELECT o.*, u.username 
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE o.user_id = 12345
ORDER BY o.create_time DESC
LIMIT 10000, 20;
```

**问题分析**：

1. 深分页问题
2. 关联查询增加复杂度

**优化方案**：

```sql
-- 方案1：基于游标（已知上一页最后时间）
SELECT o.*, u.username 
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE o.user_id = 12345 AND o.create_time < '2022-04-29 10:00:00'
ORDER BY o.create_time DESC
LIMIT 20;

-- 方案2：延迟关联
SELECT o.*, u.username 
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE o.id IN (
    SELECT id FROM orders 
    WHERE user_id = 12345 
    ORDER BY create_time DESC 
    LIMIT 10000, 20
);
```

执行时间降至 0.1 秒。

## 二、JOIN 优化

### 2.1 JOIN 执行原理

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Nested-Loop Join 执行过程                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   FOR each row in 驱动表:                                               │
│       FOR each row in 被驱动表:                                         │
│           IF 匹配条件:                                                   │
│               输出结果行                                                 │
│                                                                         │
│   优化版本（Block Nested-Loop）：                                       │
│   FOR each block of rows in 驱动表:                                     │
│       加载到 Join Buffer                                                │
│       FOR each row in 被驱动表:                                         │
│           IF 匹配 Join Buffer 中的行:                                   │
│               输出结果行                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 驱动表选择原则

**核心原则**：小表驱动大表

```sql
-- 假设 users: 1万行，orders: 1000万行

-- 差的写法（大表驱动小表）
SELECT u.*, o.*
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.level = 'vip';

-- 优化：小表驱动大表
SELECT u.*, o.*
FROM users u
INNER JOIN orders o ON u.id = o.user_id
WHERE u.level = 'vip';
```

**原理**：

- 驱动表需要全表扫描
- 被驱动表可以通过索引快速查找
- 驱动表越小，循环次数越少

### 2.3 JOIN 优化技巧

#### 技巧1：确保关联字段有索引

```sql
-- 确保 orders.user_id 有索引
CREATE INDEX idx_user_id ON orders(user_id);

-- 确保 users.id 是主键（默认有索引）
```

#### 技巧2：减少 JOIN 表数量

```sql
-- 差：多表 JOIN
SELECT o.*, u.username, p.product_name, c.category_name, s.supplier_name
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN products p ON o.product_id = p.id
JOIN categories c ON p.category_id = c.id
JOIN suppliers s ON p.supplier_id = s.id
WHERE o.id = 1001;

-- 优化：应用层多次查询
-- 1. 查询订单
SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = 1001;
-- 2. 查询商品信息
SELECT p.product_name, c.category_name, s.supplier_name 
FROM products p 
JOIN categories c ON p.category_id = c.id 
JOIN suppliers s ON p.supplier_id = s.id 
WHERE p.id = ?;
```

#### 技巧3：使用 EXISTS 替代 JOIN 判断存在性

```sql
-- 差：使用 JOIN + DISTINCT
SELECT DISTINCT u.* 
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.create_time > '2022-01-01';

-- 优化：使用 EXISTS
SELECT u.* 
FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.user_id = u.id AND o.create_time > '2022-01-01'
);
```

### 2.4 生产案例：大表 JOIN 优化

**场景**：用户画像标签统计

```sql
-- 表结构
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(50),
    level VARCHAR(20)
);

CREATE TABLE user_tags (
    id BIGINT PRIMARY KEY,
    user_id BIGINT,
    tag_id INT,
    INDEX idx_user(user_id),
    INDEX idx_tag(tag_id)
);

CREATE TABLE tags (
    id INT PRIMARY KEY,
    tag_name VARCHAR(50)
);

-- 慢查询（执行时间：15秒）
SELECT u.id, u.username, GROUP_CONCAT(t.tag_name) as tags
FROM users u
LEFT JOIN user_tags ut ON u.id = ut.user_id
LEFT JOIN tags t ON ut.tag_id = t.id
GROUP BY u.id, u.username
LIMIT 1000;
```

**执行计划**：

```
+----+-------+------+---------------+------+----------+----------------------------------------------+
| id | table | type | key           | rows | filtered | Extra                                        |
+----+-------+------+---------------+------+----------+----------------------------------------------+
|  1 | u     | ALL  | NULL          | 10000|   100.00 | Using temporary; Using filesort              |
|  1 | ut    | ref  | idx_user      | 10   |   100.00 | NULL                                         |
|  1 | t     | eq_ref| PRIMARY      | 1    |   100.00 | NULL                                         |
+----+-------+------+---------------+------+----------+----------------------------------------------+
```

**问题**：

1. users 全表扫描
2. GROUP BY 使用临时表

**优化方案**：

```sql
-- 方案1：添加 WHERE 条件减少数据量
SELECT u.id, u.username, GROUP_CONCAT(t.tag_name) as tags
FROM users u
LEFT JOIN user_tags ut ON u.id = ut.user_id
LEFT JOIN tags t ON ut.tag_id = t.id
WHERE u.level = 'vip'  -- 添加筛选条件
GROUP BY u.id, u.username;

-- 方案2：应用层处理
-- 1. 查询用户
SELECT id, username FROM users LIMIT 1000;
-- 2. 批量查询标签
SELECT ut.user_id, GROUP_CONCAT(t.tag_name) as tags
FROM user_tags ut
JOIN tags t ON ut.tag_id = t.id
WHERE ut.user_id IN (1, 2, 3, ...)  -- 用户 ID 列表
GROUP BY ut.user_id;
```

执行时间降至 0.5 秒。

## 三、子查询优化

### 3.1 子查询类型与性能

| 类型 | 示例 | 性能影响 |
|------|------|---------|
| 标量子查询 | `SELECT (SELECT COUNT(*) FROM t)` | 通常可优化 |
| 列子查询 | `WHERE id IN (SELECT id FROM t)` | 看情况 |
| 行子查询 | `WHERE (a, b) = (SELECT a, b FROM t)` | 通常可优化 |
| 表子查询 | `FROM (SELECT * FROM t) AS sub` | 需要物化 |

### 3.2 子查询优化技巧

#### 技巧1：IN 子查询改写为 JOIN

```sql
-- 原始写法（可能慢）
SELECT * FROM orders 
WHERE user_id IN (
    SELECT id FROM users WHERE level = 'vip'
);

-- 优化：改写为 JOIN
SELECT o.* 
FROM orders o
INNER JOIN users u ON o.user_id = u.id
WHERE u.level = 'vip';
```

#### 技巧2：EXISTS 替代 IN（当子查询结果大时）

```sql
-- 场景：子查询结果集很大
SELECT * FROM orders 
WHERE user_id IN (
    SELECT user_id FROM user_activities WHERE activity_id = 100  -- 返回 100 万行
);

-- 优化：使用 EXISTS
SELECT o.* 
FROM orders o
WHERE EXISTS (
    SELECT 1 FROM user_activities ua 
    WHERE ua.user_id = o.user_id AND ua.activity_id = 100
);
```

**原则**：

- 子查询结果集小：用 IN
- 子查询结果集大：用 EXISTS

#### 技巧3：避免相关子查询

```sql
-- 差：相关子查询（每行都执行一次子查询）
SELECT u.*, 
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count
FROM users u;

-- 优化：使用 JOIN + GROUP BY
SELECT u.*, COALESCE(o.order_count, 0) as order_count
FROM users u
LEFT JOIN (
    SELECT user_id, COUNT(*) as order_count
    FROM orders
    GROUP BY user_id
) o ON u.id = o.user_id;
```

### 3.3 生产案例：复杂统计查询

**场景**：查询最近 30 天有下单的用户及其订单数

```sql
-- 慢查询（执行时间：25秒）
SELECT u.id, u.username,
       (SELECT COUNT(*) FROM orders WHERE user_id = u.id AND create_time > DATE_SUB(NOW(), INTERVAL 30 DAY)) as order_count
FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders 
    WHERE user_id = u.id AND create_time > DATE_SUB(NOW(), INTERVAL 30 DAY)
);
```

**问题分析**：

1. 相关子查询导致每行都执行 COUNT
2. EXISTS 子查询也需要执行

**优化方案**：

```sql
-- 优化：一次查询完成
SELECT u.id, u.username, o.order_count
FROM users u
INNER JOIN (
    SELECT user_id, COUNT(*) as order_count
    FROM orders
    WHERE create_time > DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY user_id
) o ON u.id = o.user_id;
```

执行时间降至 0.3 秒。

## 四、批量操作优化

### 4.1 批量插入

```sql
-- 差：循环单条插入
INSERT INTO orders (user_id, status) VALUES (1, 'pending');
INSERT INTO orders (user_id, status) VALUES (2, 'pending');
-- ... 循环 1000 次

-- 优化：批量插入
INSERT INTO orders (user_id, status) VALUES 
(1, 'pending'), (2, 'pending'), (3, 'pending'), ...
-- 一次插入 1000 条
```

**性能对比**：

| 方案 | 1000 条插入时间 | 原因 |
|------|----------------|------|
| 循环单条 | 15 秒 | 1000 次网络往返 + 1000 次事务提交 |
| 批量插入 | 0.5 秒 | 1 次网络往返 + 1 次事务提交 |

**批量插入最佳实践**：

```sql
-- 分批次插入（每批 500-1000 条）
-- 避免单次插入过多导致锁等待或内存问题
INSERT INTO orders (user_id, status) VALUES 
(1, 'pending'), (2, 'pending'), ..., (500, 'pending');

INSERT INTO orders (user_id, status) VALUES 
(501, 'pending'), (502, 'pending'), ..., (1000, 'pending');
```

### 4.2 批量更新

**场景**：批量更新订单状态

```sql
-- 差：循环单条更新
UPDATE orders SET status = 'completed' WHERE id = 1;
UPDATE orders SET status = 'completed' WHERE id = 2;
-- ... 循环 10000 次

-- 优化1：批量 UPDATE（同一状态）
UPDATE orders SET status = 'completed' WHERE id IN (1, 2, 3, ..., 10000);

-- 优化2：CASE WHEN（不同值）
UPDATE orders SET status = CASE id
    WHEN 1 THEN 'completed'
    WHEN 2 THEN 'cancelled'
    WHEN 3 THEN 'pending'
    ELSE status
END
WHERE id IN (1, 2, 3);
```

### 4.3 大表更新优化

**场景**：更新 1000 万条记录的状态

```sql
-- 危险操作：长时间锁表
UPDATE orders SET status = 'archived' WHERE create_time < '2020-01-01';
-- 影响行数：1000 万行，执行时间：30 分钟

-- 优化：分批更新
-- 应用层循环执行
UPDATE orders 
SET status = 'archived' 
WHERE create_time < '2020-01-01' 
AND status != 'archived'
LIMIT 1000;

-- 每次更新 1000 条，循环执行直到影响行数为 0
```

**分批更新注意事项**：

1. 每批之间添加延迟，避免持续锁表
2. 使用索引确保每次快速定位
3. 监控执行进度

## 五、COUNT 优化

### 5.1 COUNT 用法对比

| 用法 | 含义 | 性能 |
|------|------|------|
| COUNT(*) | 统计总行数 | 最优（InnoDB 优化） |
| COUNT(1) | 统计总行数 | 与 COUNT(*) 相同 |
| COUNT(id) | 统计 id 非 NULL 的行数 | 需要扫描 |
| COUNT(status) | 统计 status 非 NULL 的行数 | 需要扫描 |

### 5.2 COUNT 优化技巧

#### 技巧1：使用覆盖索引

```sql
-- 差：全表扫描
SELECT COUNT(*) FROM orders WHERE status = 'pending';

-- 优化：使用覆盖索引
CREATE INDEX idx_status ON orders(status);
-- COUNT 可以在索引上完成，无需扫描表
```

#### 技巧2：估算总数

```sql
-- 精确但慢
SELECT COUNT(*) FROM orders;  -- 大表可能需要几秒

-- 快速估算（使用统计信息）
SHOW TABLE STATUS LIKE 'orders';
-- 或
SELECT TABLE_ROWS FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'mydb' AND TABLE_NAME = 'orders';
```

#### 技巧3：缓存计数

```sql
-- 创建计数表
CREATE TABLE table_counts (
    table_name VARCHAR(50) PRIMARY KEY,
    row_count BIGINT,
    updated_at DATETIME
);

-- 通过触发器或应用层维护计数
INSERT INTO table_counts VALUES ('orders', 0, NOW());

-- 触发器方式
CREATE TRIGGER after_order_insert
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
    UPDATE table_counts SET row_count = row_count + 1, updated_at = NOW() 
    WHERE table_name = 'orders';
END;
```

### 5.3 生产案例：实时统计优化

**场景**：首页显示待处理订单数

```sql
-- 原始查询（每次请求执行）
SELECT COUNT(*) FROM orders WHERE status = 'pending';
-- 执行时间：2 秒（表有 5000 万行）
```

**优化方案**：

```sql
-- 方案1：Redis 缓存
-- 订单状态变更时更新 Redis 计数
INCR order:pending:count
DECR order:pending:count

-- 方案2：计数表 + 定时更新
CREATE TABLE order_stats (
    status VARCHAR(20) PRIMARY KEY,
    count BIGINT,
    updated_at DATETIME
);

-- 定时任务每分钟更新
INSERT INTO order_stats (status, count, updated_at)
SELECT status, COUNT(*), NOW() FROM orders GROUP BY status
ON DUPLICATE KEY UPDATE count = VALUES(count), updated_at = VALUES(updated_at);

-- 查询时直接读计数表
SELECT count FROM order_stats WHERE status = 'pending';
```

## 六、SQL 优化最佳实践清单

### 6.1 查询优化清单

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       SQL 优化检查清单                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   分页查询                                                               │
│   □ 是否存在深分页问题？考虑游标分页或延迟关联                           │
│   □ 是否有不必要的 ORDER BY？                                           │
│                                                                         │
│   JOIN 查询                                                             │
│   □ 关联字段是否有索引？                                                │
│   □ 是否遵循小表驱动大表原则？                                          │
│   □ JOIN 表数量是否过多（建议 < 5）？                                   │
│                                                                         │
│   子查询                                                                 │
│   □ 是否可以改写为 JOIN？                                               │
│   □ 相关子查询是否可以优化为非相关子查询？                               │
│   □ IN 子查询结果集大小？考虑使用 EXISTS                                 │
│                                                                         │
│   批量操作                                                               │
│   □ 是否使用批量插入替代循环单条插入？                                   │
│   □ 大批量更新是否分批执行？                                            │
│                                                                         │
│   COUNT 查询                                                            │
│   □ 是否使用 COUNT(*) 而非 COUNT(列)？                                  │
│   □ 是否可以使用缓存或估算？                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 常见反模式

| 反模式 | 问题 | 正确做法 |
|--------|------|---------|
| `SELECT *` | 返回不必要字段 | 只查询需要的字段 |
| `LIMIT 1000000, 20` | 深分页问题 | 游标分页或延迟关联 |
| `WHERE LEFT(name, 3) = 'Tom'` | 索引失效 | `WHERE name LIKE 'Tom%'` |
| `OR` 条件连接不同列 | 可能不走索引 | 使用 UNION |
| `ORDER BY RAND()` | 大表性能差 | 应用层随机选择 |

## 总结

本章讲解了常见 SQL 场景的优化技巧：

1. **分页优化**：游标分页、延迟关联解决深分页问题
2. **JOIN 优化**：小表驱动大表、确保关联字段有索引
3. **子查询优化**：改写为 JOIN、使用 EXISTS、避免相关子查询
4. **批量操作**：批量插入、分批更新大表
5. **COUNT 优化**：使用覆盖索引、缓存计数

下一章将讲解表结构与数据优化。

## 参考文献

- [MySQL 8.0 Optimization Techniques](https://dev.mysql.com/doc/refman/8.0/en/optimization.html)
- [MySQL Internals: Nested-Loop Join](https://dev.mysql.com/doc/internals/en/nested-loop-join.html)

## 下一章预告

**第5章：表结构与数据优化**

- 数据类型选择原则
- 表分区策略
- 分库分表实践
- 反范式设计
