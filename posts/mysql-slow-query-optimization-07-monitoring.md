---
title: "MySQL 慢查询优化实战（七）：监控与预防体系"
date: "2021-06-14"
excerpt: "建立完整的慢查询监控告警体系，构建性能基线，实现自动化 SQL 审核，从被动优化转向主动预防，打造可持续的性能管理体系。"
tags: ["MySQL", "性能优化", "监控", "DevOps"]
series:
  slug: "mysql-slow-query-optimization"
  title: "MySQL 慢查询优化实战"
  order: 7
---

## 前言

慢查询优化不应是救火式的被动响应，而应建立系统化的监控与预防体系。本章从监控告警、性能基线、自动化审核、效果跟踪四个维度，帮助你构建可持续的性能管理体系。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 实现章节 |
|--------|------|----------|----------|
| 慢查询监控体系 | ⭐⭐⭐ | 中频考点 | 本章 |
| 性能基线建设 | ⭐⭐⭐⭐ | 进阶考点 | 本章 |
| SQL 自动审核 | ⭐⭐⭐⭐ | 实战考点 | 本章 |
| 容量规划 | ⭐⭐⭐⭐ | 进阶考点 | 本章 |

## 面试题覆盖

- 如何建立数据库监控体系？
- 什么是性能基线？有什么作用？
- 如何实现 SQL 上线前的自动审核？
- 如何进行数据库容量规划？
- 如何跟踪优化效果？

## 一、监控体系架构

### 1.1 监控维度

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       数据库监控维度                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     应用层监控                                   │  │
│   │  接口响应时间、SQL 执行时间、连接池状态、事务状态               │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                  │                                      │
│                                  ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     数据库层监控                                 │  │
│   │  QPS/TPS、连接数、慢查询、锁等待、主从延迟                      │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                  │                                      │
│                                  ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     系统层监控                                   │  │
│   │  CPU、内存、磁盘 IO、网络带宽、磁盘空间                         │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 关键监控指标

#### 数据库指标

| 指标 | 说明 | 告警阈值建议 |
|------|------|-------------|
| QPS | 每秒查询数 | 基线的 80% |
| TPS | 每秒事务数 | 基线的 80% |
| Connections | 当前连接数 | max_connections 的 80% |
| Slow_queries | 慢查询数量 | > 10/分钟 |
| Threads_running | 运行中的线程 | > 50 |
| Innodb_row_lock_waits | 行锁等待次数 | > 100/分钟 |
| Innodb_row_lock_time_avg | 平均锁等待时间 | > 100ms |
| Seconds_Behind_Master | 主从延迟 | > 60s |

#### 系统指标

| 指标 | 说明 | 告警阈值建议 |
|------|------|-------------|
| CPU 使用率 | 数据库进程 CPU | > 80% |
| 内存使用率 | 数据库进程内存 | > 80% |
| 磁盘 IO 等待 | IO wait | > 50% |
| 磁盘使用率 | 数据目录磁盘 | > 85% |
| 网络流量 | 入站/出站流量 | 带宽的 80% |

### 1.3 监控方案选型

| 方案 | 特点 | 适用场景 |
|------|------|---------|
| Prometheus + Grafana | 开源、灵活、生态丰富 | 中大型企业 |
| PMM (Percona) | MySQL 专用、开箱即用 | MySQL 专项监控 |
| Zabbix | 传统监控、功能全面 | 传统运维环境 |
| 云厂商监控 | 托管服务、集成度高 | 云数据库 |

### 1.4 PMM 监控部署

**安装 PMM Server**：

```bash
# Docker 方式
docker run -d \
  -p 80:80 \
  -p 443:443 \
  --name pmm-server \
  percona/pmm-server:2
```

**安装 PMM Client**：

```bash
# Ubuntu/Debian
wget https://repo.percona.com/apt/percona-release_latest.$(lsb_release -sc)_all.deb
dpkg -i percona-release_latest.$(lsb_release -sc)_all.deb
apt-get update
apt-get install pmm2-client

# 配置连接
pmm-admin config --server-insecure-tls --server-url=https://admin:admin@pmm-server:443

# 添加 MySQL 监控
pmm-admin add mysql --username=pmm --password=pmm --query-source=slowlog mysql-instance
```

### 1.5 自定义监控脚本

```bash
#!/bin/bash
# slow_query_monitor.sh - 慢查询监控脚本

MYSQL_HOST="localhost"
MYSQL_PORT="3306"
MYSQL_USER="monitor"
MYSQL_PASS="monitor123"
SLOW_THRESHOLD=10  # 每分钟慢查询阈值
ALERT_WEBHOOK="https://hooks.slack.com/services/xxx"

# 获取当前慢查询数
current_time=$(date +%s)
one_min_ago=$((current_time - 60))

slow_count=$(mysql -h$MYSQL_HOST -P$MYSQL_PORT -u$MYSQL_USER -p$MYSQL_PASS -N -e "
    SELECT COUNT(*) 
    FROM performance_schema.events_statements_history_long
    WHERE TIMER_WAIT/1000000000000 > 1
    AND EVENT_ID > (
        SELECT MAX(EVENT_ID) - 10000 
        FROM performance_schema.events_statements_history_long
    )
    AND TIMER_START/1000000000000 > $one_min_ago
")

if [ "$slow_count" -gt "$SLOW_THRESHOLD" ]; then
    # 获取 Top 5 慢查询
    top_slow=$(mysql -h$MYSQL_HOST -P$MYSQL_PORT -u$MYSQL_USER -p$MYSQL_PASS -N -e "
        SELECT DIGEST_TEXT, ROUND(TIMER_WAIT/1000000000000, 2) as time_s
        FROM performance_schema.events_statements_summary_by_digest
        ORDER BY SUM_TIMER_WAIT DESC
        LIMIT 5
    " | tr '\n' '\\n')
    
    # 发送告警
    curl -X POST $ALERT_WEBHOOK \
        -H 'Content-Type: application/json' \
        -d "{
            \"text\": \"MySQL 慢查询告警\",
            \"attachments\": [{
                \"color\": \"danger\",
                \"fields\": [{
                    \"title\": \"慢查询数量\",
                    \"value\": \"$slow_count / 分钟\",
                    \"short\": true
                }, {
                    \"title\": \"阈值\",
                    \"value\": \"$SLOW_THRESHOLD / 分钟\",
                    \"short\": true
                }, {
                    \"title\": \"Top 5 慢查询\",
                    \"value\": \"$top_slow\",
                    \"short\": false
                }]
            }]
        }"
fi
```

## 二、性能基线建设

### 2.1 什么是性能基线

性能基线是指在正常业务负载下，各项性能指标的参考值。通过对比基线，可以快速发现异常。

### 2.2 基线维度

| 维度 | 指标 | 采集方式 |
|------|------|---------|
| 时间维度 | 小时、日、周、月均值 | 定时采集统计 |
| 业务维度 | 按业务模块统计 | 应用层埋点 |
| SQL 维度 | Top SQL 执行时间 | 慢查询日志 |
| 资源维度 | CPU、内存、IO | 系统监控 |

### 2.3 基线采集脚本

```sql
-- 创建基线数据表
CREATE TABLE performance_baseline (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    metric_name VARCHAR(50),
    metric_value DECIMAL(12,2),
    time_period VARCHAR(20),  -- hour, day, week
    hour_of_day TINYINT,
    day_of_week TINYINT,
    collect_time DATETIME,
    INDEX idx_metric_time(metric_name, time_period, collect_time)
);

-- 定时采集脚本
INSERT INTO performance_baseline
SELECT 
    NULL,
    'qps',
    (SELECT VARIABLE_VALUE FROM performance_schema.global_status 
     WHERE VARIABLE_NAME = 'Questions') / 60,
    'minute',
    HOUR(NOW()),
    DAYOFWEEK(NOW()),
    NOW();
```

### 2.4 基线分析 SQL

```sql
-- 查看每小时的 QPS 基线
SELECT 
    hour_of_day,
    AVG(metric_value) as avg_qps,
    MIN(metric_value) as min_qps,
    MAX(metric_value) as max_qps,
    STDDEV(metric_value) as stddev
FROM performance_baseline
WHERE metric_name = 'qps'
  AND collect_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY hour_of_day
ORDER BY hour_of_day;

-- 对比当前值与基线
SELECT 
    HOUR(NOW()) as current_hour,
    (SELECT VARIABLE_VALUE FROM performance_schema.global_status 
     WHERE VARIABLE_NAME = 'Questions') / 60 as current_qps,
    (SELECT AVG(metric_value) FROM performance_baseline 
     WHERE metric_name = 'qps' AND hour_of_day = HOUR(NOW())) as baseline_qps;
```

### 2.5 异常检测规则

```sql
-- 创建异常检测函数
DELIMITER //
CREATE FUNCTION detect_anomaly(
    p_metric_name VARCHAR(50),
    p_current_value DECIMAL(12,2)
) RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    DECLARE v_baseline DECIMAL(12,2);
    DECLARE v_stddev DECIMAL(12,2);
    DECLARE v_zscore DECIMAL(12,4);
    
    -- 获取基线和标准差
    SELECT AVG(metric_value), STDDEV(metric_value)
    INTO v_baseline, v_stddev
    FROM performance_baseline
    WHERE metric_name = p_metric_name
      AND hour_of_day = HOUR(NOW())
      AND collect_time >= DATE_SUB(NOW(), INTERVAL 7 DAY);
    
    -- 计算 Z-score
    SET v_zscore = ABS((p_current_value - v_baseline) / v_stddev);
    
    -- 判断异常
    IF v_zscore > 3 THEN
        RETURN 'CRITICAL';
    ELSEIF v_zscore > 2 THEN
        RETURN 'WARNING';
    ELSE
        RETURN 'NORMAL';
    END IF;
END //
DELIMITER ;
```

## 三、SQL 自动审核

### 3.1 审核流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       SQL 审核流程                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   开发提交 SQL                                                           │
│        │                                                                │
│        ▼                                                                │
│   ┌─────────────┐                                                       │
│   │ 语法检查    │ ─── 不通过 ──► 退回修改                               │
│   └──────┬──────┘                                                       │
│          │ 通过                                                         │
│          ▼                                                              │
│   ┌─────────────┐                                                       │
│   │ 规则审核    │ ─── 高风险 ──► DBA 人工审核                           │
│   └──────┬──────┘                                                       │
│          │ 低风险                                                       │
│          ▼                                                              │
│   ┌─────────────┐                                                       │
│   │ 执行计划分析│ ─── 不通过 ──► 退回修改                               │
│   └──────┬──────┘                                                       │
│          │ 通过                                                         │
│          ▼                                                              │
│   ┌─────────────┐                                                       │
│   │ 测试环境执行│ ─── 失败 ──► 退回修改                                 │
│   └──────┬──────┘                                                       │
│          │ 成功                                                         │
│          ▼                                                              │
│   审核通过，待上线                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 审核规则

#### 规则分类

| 类别 | 规则 | 风险级别 |
|------|------|---------|
| 语法 | 无 WHERE 的 UPDATE/DELETE | 高 |
| 语法 | SELECT * | 中 |
| 索引 | 未使用索引 | 高 |
| 索引 | 索引失效 | 高 |
| 性能 | 全表扫描 | 高 |
| 性能 | 大表关联 | 中 |
| 安全 | 无 LIMIT 的 UPDATE/DELETE | 高 |
| 安全 | 权限过大 | 中 |

#### 规则配置表

```sql
CREATE TABLE sql_audit_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    rule_name VARCHAR(100),
    rule_type VARCHAR(20),     -- syntax, index, performance, security
    rule_pattern VARCHAR(500), -- 正则表达式或规则描述
    risk_level VARCHAR(10),    -- HIGH, MEDIUM, LOW
    suggestion TEXT,
    enabled TINYINT DEFAULT 1
);

-- 示例规则
INSERT INTO sql_audit_rules (rule_name, rule_type, rule_pattern, risk_level, suggestion) VALUES
('无 WHERE 的 DELETE', 'syntax', '^DELETE FROM \\w+;?$', 'HIGH', 'DELETE 必须有 WHERE 条件'),
('无 WHERE 的 UPDATE', 'syntax', '^UPDATE \\w+ SET', 'HIGH', 'UPDATE 必须有 WHERE 条件'),
('SELECT *', 'performance', 'SELECT \\*', 'MEDIUM', '避免使用 SELECT *，明确指定需要的字段'),
('无 LIMIT 的 UPDATE', 'security', 'UPDATE.*WHERE.*(?!LIMIT)', 'HIGH', 'UPDATE 语句建议加 LIMIT'),
('ORDER BY RAND', 'performance', 'ORDER BY RAND\\(\\)', 'HIGH', '避免使用 ORDER BY RAND()，性能极差');
```

### 3.3 审核脚本实现

```python
#!/usr/bin/env python3
# sql_audit.py - SQL 自动审核脚本

import re
import pymysql
from typing import List, Dict

class SQLAuditor:
    def __init__(self, db_config: Dict):
        self.db_config = db_config
        self.rules = self._load_rules()
    
    def _load_rules(self) -> List[Dict]:
        """加载审核规则"""
        conn = pymysql.connect(**self.db_config)
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM sql_audit_rules WHERE enabled = 1")
                return cursor.fetchall()
        finally:
            conn.close()
    
    def audit_syntax(self, sql: str) -> List[Dict]:
        """语法规则审核"""
        issues = []
        sql_upper = sql.upper().strip()
        
        for rule in self.rules:
            if rule['rule_type'] == 'syntax':
                if re.search(rule['rule_pattern'], sql, re.IGNORECASE):
                    issues.append({
                        'rule': rule['rule_name'],
                        'risk': rule['risk_level'],
                        'suggestion': rule['suggestion']
                    })
        
        return issues
    
    def audit_performance(self, sql: str) -> List[Dict]:
        """性能审核 - 分析执行计划"""
        issues = []
        
        conn = pymysql.connect(**self.db_config)
        try:
            with conn.cursor() as cursor:
                # 执行 EXPLAIN
                cursor.execute(f"EXPLAIN {sql}")
                rows = cursor.fetchall()
                
                for row in rows:
                    # 检查全表扫描
                    if row['type'] == 'ALL':
                        issues.append({
                            'rule': '全表扫描',
                            'risk': 'HIGH',
                            'suggestion': f"表 {row['table']} 使用全表扫描，考虑添加索引"
                        })
                    
                    # 检查未使用索引
                    if row['possible_keys'] and not row['key']:
                        issues.append({
                            'rule': '索引未使用',
                            'risk': 'MEDIUM',
                            'suggestion': f"表 {row['table']} 有可用索引但未使用"
                        })
                    
                    # 检查扫描行数过多
                    if row['rows'] and row['rows'] > 100000:
                        issues.append({
                            'rule': '扫描行数过多',
                            'risk': 'MEDIUM',
                            'suggestion': f"表 {row['table']} 预估扫描 {row['rows']} 行"
                        })
                    
                    # 检查 Using filesort
                    if 'Using filesort' in (row['Extra'] or ''):
                        issues.append({
                            'rule': '文件排序',
                            'risk': 'MEDIUM',
                            'suggestion': f"表 {row['table']} 需要额外排序，考虑优化索引"
                        })
        finally:
            conn.close()
        
        return issues
    
    def audit(self, sql: str) -> Dict:
        """完整审核"""
        return {
            'sql': sql,
            'syntax_issues': self.audit_syntax(sql),
            'performance_issues': self.audit_performance(sql),
            'passed': len(self.audit_syntax(sql)) == 0 and 
                      all(i['risk'] != 'HIGH' for i in self.audit_performance(sql))
        }


# 使用示例
if __name__ == '__main__':
    db_config = {
        'host': 'localhost',
        'port': 3306,
        'user': 'root',
        'password': 'password',
        'database': 'mysql_audit'
    }
    
    auditor = SQLAuditor(db_config)
    
    # 测试 SQL
    test_sql = "SELECT * FROM orders WHERE status = 'pending'"
    result = auditor.audit(test_sql)
    print(result)
```

### 3.4 集成到 CI/CD

```yaml
# .gitlab-ci.yml
sql_audit:
  stage: test
  script:
    - python sql_audit.py --sql-dir=./sql --report=./audit_report.json
    - if grep -q '"passed": false' ./audit_report.json; then exit 1; fi
  artifacts:
    paths:
      - audit_report.json
```

## 四、容量规划

### 4.1 容量规划指标

| 指标 | 计算方式 | 预警阈值 |
|------|---------|---------|
| 数据增长速率 | 日均新增数据量 | 基于预测模型 |
| 磁盘使用率 | 已用/总量 | 70% 预警，85% 告警 |
| 连接数增长 | 月均增长 | max_connections 的 70% |
| QPS 增长 | 月均增长 | 峰值 QPS 的 70% |

### 4.2 容量预测脚本

```sql
-- 创建容量统计表
CREATE TABLE capacity_stats (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    stat_date DATE,
    table_name VARCHAR(100),
    table_rows BIGINT,
    data_size_mb DECIMAL(12,2),
    index_size_mb DECIMAL(12,2),
    total_size_mb DECIMAL(12,2),
    qps DECIMAL(12,2),
    connections INT,
    collect_time DATETIME
);

-- 每日采集
INSERT INTO capacity_stats
SELECT 
    NULL,
    CURDATE(),
    TABLE_NAME,
    TABLE_ROWS,
    DATA_LENGTH / 1024 / 1024,
    INDEX_LENGTH / 1024 / 1024,
    (DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024,
    (SELECT VARIABLE_VALUE FROM performance_schema.global_status 
     WHERE VARIABLE_NAME = 'Questions') / 86400,
    (SELECT VARIABLE_VALUE FROM performance_schema.global_status 
     WHERE VARIABLE_NAME = 'Threads_connected'),
    NOW()
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'mydb';
```

### 4.3 容量预测查询

```sql
-- 预测 3 个月后的数据量
SELECT 
    table_name,
    table_rows as current_rows,
    table_rows + (table_rows - prev_rows) * 90 as predicted_rows_3m,
    total_size_mb as current_size_mb,
    total_size_mb + (total_size_mb - prev_size) * 90 as predicted_size_mb_3m
FROM (
    SELECT 
        c.table_name,
        c.table_rows,
        c.total_size_mb,
        (SELECT total_size_mb FROM capacity_stats 
         WHERE table_name = c.table_name 
         AND stat_date = DATE_SUB(c.stat_date, INTERVAL 30 DAY)) as prev_size,
        (SELECT table_rows FROM capacity_stats 
         WHERE table_name = c.table_name 
         AND stat_date = DATE_SUB(c.stat_date, INTERVAL 30 DAY)) as prev_rows
    FROM capacity_stats c
    WHERE c.stat_date = CURDATE()
) t;
```

## 五、优化效果跟踪

### 5.1 效果跟踪表

```sql
CREATE TABLE optimization_records (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    sql_fingerprint VARCHAR(64),  -- SQL 指纹
    original_sql TEXT,
    optimized_sql TEXT,
    optimization_type VARCHAR(50), -- index, rewrite, architecture
    before_time_ms DECIMAL(12,2),
    after_time_ms DECIMAL(12,2),
    improvement_pct DECIMAL(5,2),
    optimizer VARCHAR(50),
    optimize_date DATETIME,
    verify_date DATETIME,
    status VARCHAR(20),  -- pending, verified, rolled_back
    notes TEXT
);
```

### 5.2 效果验证脚本

```sql
-- 验证优化效果
SELECT 
    sql_fingerprint,
    original_sql,
    optimization_type,
    before_time_ms,
    after_time_ms,
    improvement_pct,
    CASE 
        WHEN improvement_pct > 50 THEN '优秀'
        WHEN improvement_pct > 30 THEN '良好'
        WHEN improvement_pct > 10 THEN '一般'
        ELSE '需关注'
    END as effect_level
FROM optimization_records
WHERE status = 'verified'
ORDER BY optimize_date DESC;
```

### 5.3 定期回顾报告

```sql
-- 月度优化报告
SELECT 
    DATE_FORMAT(optimize_date, '%Y-%m') as month,
    COUNT(*) as total_optimizations,
    AVG(improvement_pct) as avg_improvement,
    SUM(CASE WHEN improvement_pct > 50 THEN 1 ELSE 0 END) as excellent_count,
    optimization_type,
    GROUP_CONCAT(DISTINCT optimizer) as optimizers
FROM optimization_records
WHERE status = 'verified'
GROUP BY DATE_FORMAT(optimize_date, '%Y-%m'), optimization_type
ORDER BY month DESC;
```

## 六、最佳实践清单

### 6.1 监控体系清单

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       监控体系建设清单                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   基础监控                                                               │
│   □ 部署监控采集器（PMM/Prometheus）                                    │
│   □ 配置数据库核心指标采集                                               │
│   □ 配置系统资源指标采集                                                 │
│   □ 搭建可视化仪表盘（Grafana）                                         │
│                                                                         │
│   告警配置                                                               │
│   □ 配置慢查询告警（> 10/分钟）                                         │
│   □ 配置连接数告警（> 80%）                                             │
│   □ 配置主从延迟告警（> 60s）                                           │
│   □ 配置磁盘空间告警（> 85%）                                           │
│   □ 配置告警通知渠道（Slack/钉钉/邮件）                                 │
│                                                                         │
│   基线建设                                                               │
│   □ 采集至少 2 周的性能数据                                             │
│   □ 建立各时间段的性能基线                                              │
│   □ 配置异常检测规则                                                    │
│   □ 定期更新基线（每月）                                                │
│                                                                         │
│   自动审核                                                               │
│   □ 建立审核规则库                                                      │
│   □ 开发审核脚本                                                        │
│   □ 集成到 CI/CD 流程                                                  │
│   □ 建立人工审核流程                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 日常运维清单

| 频率 | 任务 | 说明 |
|------|------|------|
| 每日 | 检查慢查询日志 | 分析 Top 10 慢查询 |
| 每日 | 检查告警记录 | 处理未关闭告警 |
| 每周 | 分析优化机会 | 识别可优化 SQL |
| 每周 | 更新统计信息 | ANALYZE TABLE |
| 每月 | 容量规划评估 | 预测资源需求 |
| 每月 | 性能回顾会议 | 总结优化效果 |

## 系列总结

### 知识体系回顾

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   MySQL 慢查询优化知识体系                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   第1章：概述与诊断工具                                                  │
│   ├── 慢查询日志配置                                                    │
│   ├── pt-query-digest 分析                                              │
│   └── Performance Schema 监控                                           │
│                                                                         │
│   第2章：EXPLAIN 执行计划                                                │
│   ├── type 访问类型分析                                                 │
│   ├── Extra 字段解读                                                    │
│   └── EXPLAIN ANALYZE 实战                                              │
│                                                                         │
│   第3章：索引优化实战                                                    │
│   ├── 联合索引设计                                                      │
│   ├── 索引失效场景                                                      │
│   └── 覆盖索引与索引下推                                                │
│                                                                         │
│   第4章：SQL 语句优化                                                    │
│   ├── 深分页优化                                                        │
│   ├── JOIN 优化                                                         │
│   └── 批量操作优化                                                      │
│                                                                         │
│   第5章：表结构与数据优化                                                │
│   ├── 数据类型选择                                                      │
│   ├── 分区与分表                                                        │
│   └── 反范式设计                                                        │
│                                                                         │
│   第6章：生产案例分析                                                    │
│   ├── 电商订单系统                                                      │
│   ├── 社交动态流                                                        │
│   └── 日志与交易系统                                                    │
│                                                                         │
│   第7章：监控与预防体系                                                  │
│   ├── 监控告警                                                          │
│   ├── 性能基线                                                          │
│   └── 自动审核                                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 优化能力进阶

| 级别 | 能力 | 标志 |
|------|------|------|
| 入门 | 能使用 EXPLAIN 分析 | 读懂执行计划 |
| 熟练 | 能进行索引优化 | 解决常见慢查询 |
| 精通 | 能进行架构优化 | 分库分表、读写分离 |
| 专家 | 能建设预防体系 | 监控、审核、基线 |

## 参考文献

- [MySQL 8.0 Reference Manual](https://dev.mysql.com/doc/refman/8.0/en/)
- [Percona Monitoring and Management](https://www.percona.com/doc/percona-monitoring-and-management/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [High Performance MySQL, 4th Edition](https://www.oreilly.com/library/view/high-performance-mysql/9781492077650/)
