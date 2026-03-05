---
title: "MySQL 慢查询优化实战（一）：概述与诊断工具"
date: "2022-04-24"
excerpt: "深入理解 MySQL 慢查询优化的核心方法论，掌握慢查询日志、pt-query-digest 等诊断工具的使用，建立系统化的性能问题排查思路。"
tags: ["MySQL", "性能优化", "慢查询", "数据库"]
series:
  slug: "mysql-slow-query-optimization"
  title: "MySQL 慢查询优化实战"
  order: 1
---

## 前言

凌晨3点，生产环境告警电话响起——核心订单接口响应时间超过30秒，数据库CPU飙升至95%。打开慢查询日志，发现一条看似简单的SQL执行了28秒。这是每个后端工程师都可能遇到的场景。

慢查询优化不是简单的"加索引"三板斧，而是一项需要系统方法论支撑的核心技能。本系列将从诊断工具、执行计划、索引优化、SQL重写、表结构设计到生产案例，全方位掌握慢查询优化实战。

**目标读者**：有一定MySQL使用经验的后端工程师、DBA，希望系统提升性能优化能力。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 实现章节 |
|--------|------|----------|----------|
| 慢查询日志配置与分析 | ⭐⭐ | 高频考点 | 本章 |
| pt-query-digest 工具使用 | ⭐⭐⭐ | 中频考点 | 本章 |
| Performance Schema 监控 | ⭐⭐⭐⭐ | 进阶考点 | 本章 |
| EXPLAIN 执行计划解读 | ⭐⭐⭐⭐ | 高频考点 | 第2章 |
| 索引优化策略 | ⭐⭐⭐⭐ | 高频考点 | 第3章 |

## 面试题覆盖

- 如何定位 MySQL 中的慢查询？
- 慢查询日志如何配置？有哪些关键参数？
- 如何分析慢查询日志找出问题 SQL？
- 除了慢查询日志，还有哪些方法定位性能问题？
- 生产环境如何安全地开启慢查询日志？

## 一、慢查询的本质

### 1.1 什么是慢查询

慢查询是指执行时间超过指定阈值的 SQL 语句。MySQL 默认阈值为 10 秒，生产环境通常设置为 1-3 秒。

```sql
-- 查看当前慢查询阈值
SHOW VARIABLES LIKE 'long_query_time';

-- 查看慢查询日志状态
SHOW VARIABLES LIKE 'slow_query_log';
```

### 1.2 慢查询的危害

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        慢查询的连锁反应                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   慢查询 ──► 数据库CPU飙升 ──► 连接池耗尽 ──► 服务不可用               │
│      │                                                                  │
│      └──► 锁等待时间增长 ──► 事务超时 ──► 业务失败                     │
│             │                                                           │
│             └──► 主从延迟 ──► 读写分离失效 ──► 数据不一致              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 慢查询产生的根本原因

| 原因类别 | 具体表现 | 占比（经验值） |
|---------|---------|---------------|
| 索引问题 | 无索引、索引失效、索引选择错误 | 60% |
| SQL 问题 | 复杂查询、不当写法、大量数据处理 | 20% |
| 表结构问题 | 数据类型不当、表过大、冗余字段 | 10% |
| 配置问题 | 内存配置不当、连接数限制 | 5% |
| 硬件瓶颈 | 磁盘IO、内存不足、CPU瓶颈 | 5% |

## 二、慢查询日志详解

### 2.1 开启慢查询日志

**开发环境配置**（立即生效，重启失效）：

```sql
-- 开启慢查询日志
SET GLOBAL slow_query_log = 'ON';

-- 设置阈值（单位：秒，可精确到微秒）
SET GLOBAL long_query_time = 1;

-- 记录没有使用索引的查询
SET GLOBAL log_queries_not_using_indexes = 'ON';

-- 设置日志文件路径
SET GLOBAL slow_query_log_file = '/var/log/mysql/mysql-slow.log';
```

**生产环境配置**（my.cnf，永久生效）：

```ini
[mysqld]
# 开启慢查询日志
slow_query_log = 1

# 慢查询阈值（秒）
long_query_time = 2

# 日志文件路径
slow_query_log_file = /var/log/mysql/mysql-slow.log

# 记录未使用索引的查询
log_queries_not_using_indexes = 1

# 限制每分钟记录的未索引查询数量（防止日志爆炸）
log_throttle_queries_not_using_indexes = 60

# 记录管理语句
log_slow_admin_statements = 1

# 最小扫描行数阈值
min_examined_row_limit = 100
```

### 2.2 慢查询日志格式解析

```log
# Time: 2022-04-30T03:15:22.123456Z
# User@Host: app_user[app_user] @ 10.0.1.100 []
# Query_time: 28.456789  Lock_time: 0.000123  Rows_sent: 1000  Rows_examined: 5000000
SET timestamp=1651293322;
SELECT * FROM orders WHERE status = 'pending' AND create_time > '2022-01-01';
```

**关键字段说明**：

| 字段 | 含义 | 优化关注点 |
|------|------|-----------|
| Query_time | 查询总耗时 | 核心指标，超过阈值即为慢查询 |
| Lock_time | 锁等待时间 | 高锁等待说明存在锁竞争 |
| Rows_sent | 返回行数 | 结果集大小 |
| Rows_examined | 扫描行数 | 与 Rows_sent 比值过大说明效率低 |

### 2.3 生产案例：日志爆炸问题

**场景描述**：

某电商平台在开启 `log_queries_not_using_indexes` 后，慢查询日志在1小时内增长到 50GB，磁盘告警。

**问题分析**：

```sql
-- 发现大量简单查询被记录
SELECT id FROM products WHERE status = 1;  -- status 字段无索引，每秒执行1000次
```

**解决方案**：

```ini
# 限制记录频率
log_throttle_queries_not_using_indexes = 60

# 设置最小扫描行数
min_examined_row_limit = 100
```

## 三、pt-query-digest 分析工具

### 3.1 工具简介

pt-query-digest 是 Percona Toolkit 的一部分，是分析慢查询日志的神器。

**安装**：

```bash
# Ubuntu/Debian
sudo apt-get install percona-toolkit

# CentOS/RHEL
sudo yum install percona-toolkit

# 或直接下载
wget percona.com/get/pt-query-digest
chmod +x pt-query-digest
```

### 3.2 基本使用

```bash
# 分析慢查询日志
pt-query-digest /var/log/mysql/mysql-slow.log

# 分析最近1小时的慢查询
pt-query-digest --since '1h' /var/log/mysql/mysql-slow.log

# 分析特定时间范围
pt-query-digest --since '2022-04-30 00:00:00' --until '2022-04-30 06:00:00' /var/log/mysql/mysql-slow.log

# 输出到文件
pt-query-digest /var/log/mysql/mysql-slow.log > slow_report.txt
```

### 3.3 输出解读

```
# 3600ms user time, 30ms system time, 31.57M rss, 144.12M vsz
# Current date: Sat Apr 30 04:00:00 2022
# Hostname: mysql-prod-01
# Files: /var/log/mysql/mysql-slow.log

# Overall: 15.23k total, 1.02k unique, 42.31 QPS, 12.34x concurrency ________
# Time range: 2022-04-30 00:00:00 to 2022-04-30 04:00:00
# Attribute          total     min     max     avg     95%  stddev  median
# ============     ======= ======= ======= ======= ======= ======= =======
# Exec time         4432s     1s     128s   291ms   500ms   891ms    50ms
# Lock time            2s       0     5s   131us   233us   50ms    50us
# Rows sent        145.12k       0   1.00k    9.73   10.84   12.34    0.99
# Rows examine      12.34G       0 100.00M 853.58k   1.00M   5.00M       0

# Profile
# Rank Query ID                      Response time   Calls R/Call  Apdx
# ==== ============================= =============== ===== ======= =====
#    1 0x99B23A3A4C2B1D4E...         1234.56 27.8%  1234  1.0012  0.95
#    2 0xA1B2C3D4E5F6G7H8...          987.65 22.3%   567  1.7411  0.89
#    3 0xB2C3D4E5F6G7H8I9...          654.32 14.8%   890  0.7351  0.92

# Query 1: 34.23 QPS, 0.03x concurrency, ID 0x99B23A3A4C2B1D4E...
# Scores: Apdex=0.95 [1.0]
# Time range: 2022-04-30 00:00:00 to 2022-04-30 04:00:00
# Attribute    pct   total     min     max     avg     95%  stddev  median
# ============ === ======= ======= ======= ======= ======= ======= =======
# Count         27    1234
# Exec time     27   1234s   100ms     28s   1000ms   5000ms   2000ms   500ms
# Lock time     12   234ms    50us    10ms    189us   500us   800us   100us
# Rows sent     15  22.12k       0   1.00k   18.34   10.84   12.34    0.99
# Rows examine  25   3.12G   1.00k 100.00M   2.59M   5.00M   8.00M   1.00M
# Database      100  app_db
# Users         100  app_user@10.0.1.100
# Query abstract:
# SELECT * FROM orders WHERE status = ? AND create_time > ?

# Query sample:
# SELECT * FROM orders WHERE status = 'pending' AND create_time > '2022-01-01';
```

**关键指标解读**：

| 指标 | 含义 | 优化优先级判断 |
|------|------|---------------|
| Response time | 该类查询总响应时间 | 最高优先 |
| Calls | 执行次数 | 高频查询优先 |
| R/Call | 平均每次响应时间 | 单次耗时长的优先 |
| Rows examine | 扫描行数 | 扫描行数异常大的需要关注 |

### 3.4 实战：快速定位 Top 10 慢查询

```bash
# 按总响应时间排序，显示前10
pt-query-digest --limit 10 /var/log/mysql/mysql-slow.log

# 按执行次数排序
pt-query-digest --order-by Queries:sum /var/log/mysql/mysql-slow.log

# 只显示 SELECT 语句
pt-query-digest --filter '$event->{arg} =~ m/^select/i' /var/log/mysql/mysql-slow.log
```

## 四、Performance Schema 监控

### 4.1 概述

Performance Schema 是 MySQL 内置的性能监控引擎，提供比慢查询日志更细粒度的监控能力。

```sql
-- 检查是否启用
SHOW VARIABLES LIKE 'performance_schema';

-- 查看可用的事件表
USE performance_schema;
SHOW TABLES LIKE '%events_statements%';
```

### 4.2 查询当前执行的 SQL

```sql
-- 查看当前正在执行的语句
SELECT * FROM performance_schema.events_waits_current
WHERE EVENT_NAME LIKE 'statement%';

-- 查看最近执行的语句（需要开启历史记录）
SELECT 
    THREAD_ID,
    EVENT_ID,
    TIMER_WAIT/1000000000000 as 'Duration(s)',
    SQL_TEXT,
    CURRENT_SCHEMA
FROM performance_schema.events_statements_history_long
WHERE TIMER_WAIT > 1000000000000  -- 超过1秒
ORDER BY TIMER_WAIT DESC
LIMIT 10;
```

### 4.3 统计分析慢查询

```sql
-- 按SQL模板分组统计
SELECT 
    DIGEST_TEXT as 'SQL模板',
    COUNT_STAR as '执行次数',
    AVG_TIMER_WAIT/1000000000000 as '平均耗时(s)',
    SUM_TIMER_WAIT/1000000000000 as '总耗时(s)',
    SUM_ROWS_EXAMINED as '总扫描行数'
FROM performance_schema.events_statements_summary_by_digest
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 10;
```

### 4.4 生产案例：实时监控大事务

**场景**：需要监控执行时间超过 5 秒的事务

```sql
-- 查找长时间运行的事务
SELECT 
    trx_id,
    trx_state,
    trx_started,
    TIMESTAMPDIFF(SECOND, trx_started, NOW()) as '运行时间(s)',
    trx_mysql_thread_id,
    trx_query
FROM information_schema.INNODB_TRX
WHERE TIMESTAMPDIFF(SECOND, trx_started, NOW()) > 5
ORDER BY trx_started;
```

## 五、诊断工具对比与选择

### 5.1 工具对比

| 工具 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| 慢查询日志 | 低开销、持久化 | 有延迟、磁盘占用 | 持续监控 |
| pt-query-digest | 分析能力强 | 需要离线分析 | 事后分析 |
| Performance Schema | 实时、细粒度 | 有性能开销 | 深度诊断 |
| SHOW PROCESSLIST | 实时查看 | 信息有限 | 即时排查 |

### 5.2 推荐使用流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       问题诊断标准流程                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. 收到告警/用户反馈                                                  │
│         │                                                               │
│         ▼                                                               │
│   2. SHOW PROCESSLIST ──► 定位正在执行的慢查询                          │
│         │                                                               │
│         ▼                                                               │
│   3. EXPLAIN ──► 分析执行计划                                           │
│         │                                                               │
│         ▼                                                               │
│   4. 针对性优化（索引/SQL/配置）                                        │
│         │                                                               │
│         ▼                                                               │
│   5. pt-query-digest ──► 持续监控分析                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 六、最佳实践清单

### 6.1 配置清单

```ini
[mysqld]
# 慢查询配置
slow_query_log = 1
long_query_time = 2
slow_query_log_file = /var/log/mysql/mysql-slow.log
log_queries_not_using_indexes = 1
log_throttle_queries_not_using_indexes = 60
min_examined_row_limit = 100

# 日志轮转（配合 logrotate）
# /etc/logrotate.d/mysql
/var/log/mysql/mysql-slow.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    create 640 mysql adm
    postrotate
        mysqladmin flush-logs
    endscript
}
```

### 6.2 监控指标清单

| 指标 | 阈值 | 告警级别 |
|------|------|---------|
| 慢查询数量/分钟 | > 10 | 警告 |
| 慢查询数量/分钟 | > 50 | 严重 |
| 平均查询时间 | > 1s | 警告 |
| 单查询最大时间 | > 30s | 严重 |
| 慢查询日志大小增长 | > 100MB/小时 | 警告 |

### 6.3 故障排查清单

- [ ] 确认慢查询日志已开启
- [ ] 检查 `long_query_time` 设置是否合理
- [ ] 使用 `pt-query-digest` 分析 Top 10 慢查询
- [ ] 对每条慢查询执行 `EXPLAIN` 分析
- [ ] 检查相关表的索引情况
- [ ] 确认统计信息是否最新（`ANALYZE TABLE`）
- [ ] 检查是否有锁等待
- [ ] 检查系统资源（CPU、IO、内存）

## 总结

本文介绍了慢查询优化的基础方法论：

1. **理解本质**：慢查询是症状，根因在索引、SQL、表结构
2. **配置日志**：合理配置慢查询日志，避免日志爆炸
3. **善用工具**：pt-query-digest 是分析利器
4. **实时监控**：Performance Schema 提供细粒度诊断能力
5. **建立流程**：标准化的诊断流程提高效率

下一章将深入讲解 EXPLAIN 执行计划，这是分析慢查询的核心技能。

## 参考文献

- [MySQL 8.0 Reference Manual - The Slow Query Log](https://dev.mysql.com/doc/refman/8.0/en/slow-query-log.html)
- [Percona Toolkit Documentation](https://www.percona.com/doc/percona-toolkit/LATEST/pt-query-digest.html)
- [MySQL Performance Schema](https://dev.mysql.com/doc/refman/8.0/en/performance-schema.html)

## 下一章预告

**第2章：EXPLAIN 执行计划深度解读**

- EXPLAIN 输出字段详解
- type 字段与访问类型
- Extra 字段隐藏信息
- 执行计划优化案例分析
