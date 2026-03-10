---
title: "Milvus底层原理（十二）：副本与高可用"
date: "2026-03-10"
excerpt: "深入理解 Milvus 的副本机制和高可用设计，掌握多副本部署、故障检测与恢复、读写分离等核心能力，构建生产级向量数据库系统。"
tags: ["Milvus", "向量数据库", "高可用", "副本", "容灾"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 12
---

## 前言

高可用（High Availability）是生产系统的核心要求，直接影响服务的可靠性和用户体验。Milvus 通过多副本机制、故障检测与自动恢复、Leader Election 等技术，实现了秒级故障恢复和 99.9% 以上的可用性。

本文将深入分析 Milvus 的副本与高可用机制，包括多副本架构、故障检测、自动恢复和容灾策略。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 多副本架构 | ⭐⭐⭐⭐ | 架构设计 | ✅ |
| Leader Election | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 故障检测机制 | ⭐⭐⭐ | 系统设计 | ✅ |
| 自动恢复 | ⭐⭐⭐⭐ | 实战技能 | ✅ |
| 容灾策略 | ⭐⭐⭐⭐ | 架构设计 | ✅ |

## 面试考点

1. Milvus 如何实现高可用？
2. 多副本的数据同步机制是什么？
3. 如何检测和处理节点故障？
4. Leader Election 如何实现？
5. 跨机房容灾如何设计？

## 一、高可用概述

### 1.1 高可用目标

```
┌─────────────────────────────────────────────────────────────────┐
│                    高可用目标                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  可用性指标：                                                    │
│  • 99.9% = 年故障时间 < 8.76 小时                              │
│  • 99.99% = 年故障时间 < 52.6 分钟                             │
│  • 99.999% = 年故障时间 < 5.26 分钟                            │
│                                                                 │
│  Milvus 高可用目标：                                            │
│  • 单节点故障：秒级恢复（< 30 秒）                             │
│  • 多节点故障：分钟级恢复（< 5 分钟）                          │
│  • 机房故障：分钟级切换（跨机房部署）                          │
│  • 数据丢失：0（同步复制）                                     │
│                                                                 │
│  设计原则：                                                      │
│  • 消除单点故障（SPOF）                                        │
│  • 快速故障检测                                                │
│  • 自动故障恢复                                                │
│  • 数据持久化                                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 高可用架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 高可用架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Load Balancer                        │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  HA Proxy / Nginx / Cloud LB                    │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                │
│         ▼                  ▼                  ▼                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   Proxy 1   │    │   Proxy 2   │    │   Proxy 3   │        │
│  │   (Active)  │    │   (Active)  │    │   (Active)  │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│         │                  │                  │                │
│         └──────────────────┼──────────────────┘                │
│                            │                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Coordinator Layer                       │   │
│  │  ┌─────────────┐    ┌─────────────┐                    │   │
│  │  │ Root Coord  │    │ Root Coord  │   (Leader/Follower)│   │
│  │  │  (Leader)   │    │ (Follower)  │                    │   │
│  │  └─────────────┘    └─────────────┘                    │   │
│  │  ┌─────────────┐    ┌─────────────┐                    │   │
│  │  │ Query Coord │    │ Query Coord │                    │   │
│  │  │  (Leader)   │    │ (Follower)  │                    │   │
│  │  └─────────────┘    └─────────────┘                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Worker Layer                           │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │   │
│  │  │Query Node 1 │    │Query Node 2 │    │Query Node 3 │ │   │
│  │  │ (Shard 1,2) │    │ (Shard 2,3) │    │ (Shard 1,3) │ │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘ │   │
│  │        数据副本分布，任一节点故障不影响服务              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Storage Layer                          │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │   │
│  │  │   etcd 1    │    │   etcd 2    │    │   etcd 3    │ │   │
│  │  │  (Leader)   │    │ (Follower)  │    │ (Follower)  │ │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │           MinIO / S3 (多副本存储)               │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、多副本机制

### 2.1 Query Node 副本

```
┌─────────────────────────────────────────────────────────────────┐
│                    Query Node 多副本                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  概念：                                                          │
│  Replica Group = 一组 Query Nodes，共同持有完整数据             │
│                                                                 │
│  示例：3 个分片，2 个副本                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Replica Group 0          Replica Group 1              │   │
│  │  ┌─────────────────┐     ┌─────────────────┐          │   │
│  │  │ Query Node 1    │     │ Query Node 4    │          │   │
│  │  │ • Shard 1       │     │ • Shard 1       │          │   │
│  │  │ • Shard 2       │     │ • Shard 2       │          │   │
│  │  └─────────────────┘     └─────────────────┘          │   │
│  │  ┌─────────────────┐     ┌─────────────────┐          │   │
│  │  │ Query Node 2    │     │ Query Node 5    │          │   │
│  │  │ • Shard 2       │     │ • Shard 2       │          │   │
│  │  │ • Shard 3       │     │ • Shard 3       │          │   │
│  │  └─────────────────┘     └─────────────────┘          │   │
│  │  ┌─────────────────┐     ┌─────────────────┐          │   │
│  │  │ Query Node 3    │     │ Query Node 6    │          │   │
│  │  │ • Shard 3       │     │ • Shard 3       │          │   │
│  │  │ • Shard 1       │     │ • Shard 1       │          │   │
│  │  └─────────────────┘     └─────────────────┘          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  优势：                                                          │
│  • 读负载分散到多个副本                                        │
│  • 任一副本故障不影响服务                                      │
│  • 可实现读写分离                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 副本配置

```python
from pymilvus import Collection

collection = Collection("example")

# 加载时指定副本数
collection.load(replica_number=2)  # 2 个副本

# 查看副本信息
replicas = collection.get_replicas()
for replica in replicas:
    print(f"Replica ID: {replica.replica_id}")
    print(f"Node IDs: {replica.node_ids}")
```

### 2.3 读写分离

```
┌─────────────────────────────────────────────────────────────────┐
│                    读写分离架构                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  写入请求：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Client ──► Proxy ──► Data Coord ──► Data Node         │   │
│  │                                       │                 │   │
│  │                                       ▼                 │   │
│  │                              Object Storage             │   │
│  │                                       │                 │   │
│  │                    ┌──────────────────┼──────────────┐ │   │
│  │                    ▼                  ▼              ▼ │   │
│  │              Query Node 1      Query Node 2    Query Node 3│
│  │              (Replica 0)       (Replica 0)     (Replica 1)│
│  │                    数据同步（从 Object Storage 加载）      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  查询请求：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Client ──► Proxy ──► Query Coord                       │   │
│  │                          │                               │   │
│  │         ┌────────────────┼────────────────┐             │   │
│  │         ▼                ▼                ▼             │   │
│  │   Query Node 1    Query Node 2    Query Node 3          │   │
│  │   (Replica 0)     (Replica 0)     (Replica 1)           │   │
│  │         │                │                │             │   │
│  │         └────────────────┼────────────────┘             │   │
│  │                          ▼                               │   │
│  │                    结果归并                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  读写分离策略：                                                  │
│  • 写请求：主副本写入，异步同步到从副本                        │
│  • 读请求：可读任意副本，提高读吞吐量                          │
│  • 一致性：支持不同一致性级别                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 三、Leader Election

### 3.1 Coordinator 高可用

```go
// Coordinator Leader Election

type Coordinator struct {
    id       int64
    role     Role  // Leader, Follower, Candidate
    etcd     *clientv3.Client
    election *concurrency.Election
}

func (c *Coordinator) Campaign() error {
    // 使用 etcd 选举
    session, err := concurrency.NewSession(c.etcd)
    if err != nil {
        return err
    }
    
    c.election = concurrency.NewElection(session, "/coordinators/leader/")
    
    // 竞选 Leader
    if err := c.election.Campaign(context.Background(), fmt.Sprintf("%d", c.id)); err != nil {
        return err
    }
    
    c.role = Leader
    log.Info("became leader", "id", c.id)
    
    // 监控 Leader 状态
    go c.watchLeadership()
    
    return nil
}

func (c *Coordinator) watchLeadership() {
    // 检测 Leader 失效
    ch := c.election.Observe(context.Background())
    
    for {
        select {
        case resp := <-ch:
            if len(resp.Kvs) == 0 {
                // Leader 失效，重新选举
                c.role = Candidate
                c.Campaign()
            }
        }
    }
}

func (c *Coordinator) Resign() error {
    // 主动让出 Leader
    if c.role == Leader {
        return c.election.Resign(context.Background())
    }
    return nil
}
```

### 3.2 选举流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Leader Election 流程                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  初始状态：所有 Coordinator 都是 Follower                       │
│                                                                 │
│  Step 1: 发现 Leader 缺失                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Follower 定期心跳检测 Leader                           │   │
│  │  超时未收到响应，转为 Candidate                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Step 2: 发起选举                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Candidate 向 etcd 发起选举请求                         │   │
│  │  etcd 使用 Raft 协议保证选举安全                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Step 3: 选举结果                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  获得多数票的 Candidate 成为 Leader                     │   │
│  │  其他节点成为 Follower                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Step 4: Leader 任期                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Leader 定期发送心跳维持权威                            │   │
│  │  Follower 响应心跳                                      │   │
│  │  心跳失败则重新选举                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  选举时间线：                                                    │
│  T+0s:   Leader 故障检测                                       │
│  T+1s:   发起选举                                              │
│  T+2s:   新 Leader 上任                                        │
│  T+5s:   服务恢复正常                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 四、故障检测与恢复

### 4.1 故障检测

```go
// 故障检测实现

type HealthChecker struct {
    checkInterval time.Duration
    timeout       time.Duration
    nodes         map[int64]*NodeHealth
}

type NodeHealth struct {
    NodeID       int64
    LastHeartbeat time.Time
    Status       NodeStatus
}

func (hc *HealthChecker) Start() {
    ticker := time.NewTicker(hc.checkInterval)
    
    for range ticker.C {
        hc.checkNodes()
    }
}

func (hc *HealthChecker) checkNodes() {
    now := time.Now()
    
    for nodeID, health := range hc.nodes {
        // 检查心跳超时
        if now.Sub(health.LastHeartbeat) > hc.timeout {
            hc.markNodeDown(nodeID)
        }
    }
}

func (hc *HealthChecker) markNodeDown(nodeID int64) {
    log.Warn("node down detected", "node_id", nodeID)
    
    // 触发故障恢复
    hc.recoveryHandler(nodeID)
}

// 心跳接收
func (hc *HealthChecker) ReceiveHeartbeat(nodeID int64) {
    if health, ok := hc.nodes[nodeID]; ok {
        health.LastHeartbeat = time.Now()
        health.Status = NodeHealthy
    }
}
```

### 4.2 自动恢复

```
┌─────────────────────────────────────────────────────────────────┐
│                    故障自动恢复流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Query Node 故障恢复：                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. 检测到 Query Node 故障                              │   │
│  │  2. Query Coord 更新节点状态                            │   │
│  │  3. 将该节点的 Segment 分配到其他节点                   │   │
│  │  4. 更新路由表                                          │   │
│  │  5. 恢复查询服务                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Data Node 故障恢复：                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. 检测到 Data Node 故障                               │   │
│  │  2. Data Coord 重新分配 Segment 写入                    │   │
│  │  3. 从消息队列重放数据                                  │   │
│  │  4. 恢复写入服务                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Coordinator 故障恢复：                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. etcd 检测到 Leader 失效                             │   │
│  │  2. 发起新一轮选举                                      │   │
│  │  3. 新 Leader 上任                                      │   │
│  │  4. 恢复元数据服务                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 恢复代码实现

```go
// Query Node 故障恢复

func (qc *QueryCoord) recoverFromNodeFailure(nodeID int64) error {
    // 1. 获取故障节点负责的 Segment
    segments := qc.getSegmentsByNode(nodeID)
    
    // 2. 选择新节点
    for _, segment := range segments {
        newNode := qc.selectNodeForSegment(segment)
        
        // 3. 在新节点加载 Segment
        if err := qc.loadSegment(newNode.ID, segment.ID); err != nil {
            log.Error("load segment failed", "segment", segment.ID, "error", err)
            continue
        }
        
        // 4. 更新路由
        qc.updateSegmentAssignment(segment.ID, newNode.ID)
    }
    
    // 5. 移除故障节点
    qc.removeNode(nodeID)
    
    return nil
}

func (qc *QueryCoord) selectNodeForSegment(segment *Segment) *QueryNodeInfo {
    // 选择负载最低的节点
    nodes := qc.getHealthyNodes()
    
    var bestNode *QueryNodeInfo
    minLoad := int64(math.MaxInt64)
    
    for _, node := range nodes {
        load := node.GetLoad()
        if load < minLoad {
            minLoad = load
            bestNode = node
        }
    }
    
    return bestNode
}
```

## 五、容灾策略

### 5.1 同机房多可用区

```
┌─────────────────────────────────────────────────────────────────┐
│                    同机房多可用区部署                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  可用区 A              可用区 B              可用区 C            │
│  ┌─────────┐          ┌─────────┐          ┌─────────┐        │
│  │ Proxy   │          │ Proxy   │          │ Proxy   │        │
│  │ Query   │          │ Query   │          │ Query   │        │
│  │ Node    │          │ Node    │          │ Node    │        │
│  │ Data    │          │ Data    │          │ Data    │        │
│  │ Node    │          │ Node    │          │ Node    │        │
│  └─────────┘          └─────────┘          └─────────┘        │
│       │                    │                    │              │
│       └────────────────────┼────────────────────┘              │
│                            │                                    │
│                     ┌──────┴──────┐                            │
│                     │ Shared etcd │                            │
│                     │ & MinIO     │                            │
│                     └─────────────┘                            │
│                                                                 │
│  优势：                                                          │
│  • 单可用区故障不影响服务                                      │
│  • 低延迟（同一城市）                                          │
│  • 成本较低                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 跨机房容灾

```
┌─────────────────────────────────────────────────────────────────┐
│                    跨机房容灾架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  机房 A (主)                    机房 B (备)                     │
│  ┌───────────────────┐         ┌───────────────────┐          │
│  │ Milvus Cluster    │         │ Milvus Cluster    │          │
│  │ ┌───────────────┐ │         │ ┌───────────────┐ │          │
│  │ │  Proxy × 3    │ │         │ │  Proxy × 3    │ │          │
│  │ ├───────────────┤ │         │ ├───────────────┤ │          │
│  │ │ Query Node×6  │ │         │ │ Query Node×6  │ │          │
│  │ ├───────────────┤ │         │ ├───────────────┤ │          │
│  │ │ Data Node×3   │ │         │ │ Data Node×3   │ │          │
│  │ └───────────────┘ │         │ └───────────────┘ │          │
│  └─────────┬─────────┘         └─────────┬─────────┘          │
│            │                             │                     │
│            │    ┌──────────────────┐    │                     │
│            └───►│ S3 Cross-Region  │◄───┘                     │
│                 │   Replication    │                          │
│                 └──────────────────┘                          │
│                                                                 │
│  容灾策略：                                                      │
│  • 数据：S3 跨区域复制                                         │
│  • 元数据：etcd 跨区域部署                                     │
│  • 切换：DNS / 负载均衡器切换                                  │
│  • RPO：< 1 分钟                                               │
│  • RTO：< 5 分钟                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 总结

本文深入分析了 Milvus 的副本与高可用机制，包括：

1. **高可用目标**：可用性指标、设计原则
2. **多副本机制**：Query Node 副本、读写分离
3. **Leader Election**：Coordinator 高可用、选举流程
4. **故障检测与恢复**：健康检查、自动恢复
5. **容灾策略**：多可用区、跨机房

下一章将深入分析事务与一致性机制。

## 参考资料

- [Milvus High Availability](https://milvus.io/docs/high_availability.md)
- [Milvus Replica](https://milvus.io/docs/replica.md)
- [etcd Raft Implementation](https://etcd.io/docs/v3.5/learning/design-learner/)
