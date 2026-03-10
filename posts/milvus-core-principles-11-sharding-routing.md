---
title: "Milvus底层原理（十一）：分片与路由策略"
date: "2026-03-10"
excerpt: "深入理解 Milvus 的分片与路由机制，掌握数据分片策略、查询路由原理和负载均衡实现，优化大规模数据场景下的查询性能。"
tags: ["Milvus", "向量数据库", "分片", "路由", "负载均衡"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 11
---

## 前言

分片（Sharding）是分布式数据库处理大规模数据的核心技术。Milvus 通过数据分片和查询路由机制，将数据均匀分布到多个节点，实现水平扩展和负载均衡。理解分片与路由策略对于优化查询性能和规划集群规模至关重要。

本文将深入分析 Milvus 的分片与路由机制，包括数据分片策略、查询路由原理、负载均衡实现和优化实践。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 数据分片策略 | ⭐⭐⭐⭐ | 架构设计 | ✅ |
| 查询路由机制 | ⭐⭐⭐ | 进阶考点 | ✅ |
| 负载均衡实现 | ⭐⭐⭐⭐ | 实战技能 | ✅ |
| DML 路由 | ⭐⭐⭐ | 源码级 | ✅ |
| 分片优化策略 | ⭐⭐⭐ | 实战技能 | ✅ |

## 面试考点

1. Milvus 如何进行数据分片？
2. 查询如何路由到正确的节点？
3. 负载均衡是如何实现的？
4. 如何选择合适的分片数量？
5. 分片键的选择原则是什么？

## 一、数据分片概述

### 1.1 分片概念

```
┌─────────────────────────────────────────────────────────────────┐
│                    数据分片概念                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  分片（Sharding）：                                              │
│  将数据按照一定规则分散存储到多个节点                           │
│                                                                 │
│  目的：                                                          │
│  • 水平扩展：突破单节点容量限制                                 │
│  • 并行处理：多节点并行查询提高吞吐                             │
│  • 负载均衡：均匀分布数据和请求                                 │
│                                                                 │
│  Milvus 分片层次：                                               │
│  Collection                                                     │
│     │                                                          │
│     ├── Shard 1 ──► Query Node 1                               │
│     │    ├── Segment A                                         │
│     │    └── Segment B                                         │
│     │                                                          │
│     ├── Shard 2 ──► Query Node 2                               │
│     │    ├── Segment C                                         │
│     │    └── Segment D                                         │
│     │                                                          │
│     └── Shard 3 ──► Query Node 3                               │
│          ├── Segment E                                         │
│          └── Segment F                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 分片与 Partition 的区别

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shard vs Partition                            │
├───────────────┬─────────────────────────────────────────────────┤
│ 特性          │ Shard                  │ Partition             │
├───────────────┼─────────────────────────────────────────────────┤
│ 目的          │ 分布式扩展             │ 业务数据隔离          │
│ 划分依据      │ Hash(主键)             │ 业务字段              │
│ 自动创建      │ 是                     │ 否（手动创建）        │
│ 查询优化      │ 并行查询               │ 分区裁剪              │
│ 数据分布      │ 自动分布到节点         │ 可分布在同一节点      │
│ 适用场景      │ 大数据量               │ 时间分区、类别分区    │
└───────────────┴─────────────────────────────────────────────────┘
│                                                                 │
│  关系：                                                          │
│  一个 Collection = 多个 Shard                                  │
│  一个 Partition 包含所有 Shard 的部分数据                      │
│  Shard × Partition 形成完整的数据分布                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、分片策略

### 2.1 Hash 分片

```
┌─────────────────────────────────────────────────────────────────┐
│                    Hash 分片原理                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  分片计算：                                                      │
│  shard_id = hash(primary_key) % num_shards                     │
│                                                                 │
│  示例：                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Primary Key │    Hash    │ Shard (mod 3)              │   │
│  ├──────────────┼────────────┼────────────────────────────┤   │
│  │     1001     │  12345678  │     0                      │   │
│  │     1002     │  23456789  │     1                      │   │
│  │     1003     │  34567890  │     2                      │   │
│  │     1004     │  45678901  │     0                      │   │
│  │     1005     │  56789012  │     1                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  优点：                                                          │
│  • 数据分布均匀                                                │
│  • 实现简单                                                    │
│                                                                 │
│  缺点：                                                          │
│  • 范围查询需要扫描所有分片                                    │
│  • 扩容时需要数据迁移                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 分片数量选择

```
┌─────────────────────────────────────────────────────────────────┐
│                    分片数量选择原则                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  考虑因素：                                                      │
│  1. 数据量：分片数应使每个分片数据量适中                        │
│  2. 查询并行度：更多分片 = 更高并行度                           │
│  3. 节点数量：分片数应能均匀分布到各节点                        │
│  4. 写入压力：高写入场景需要更多分片                            │
│                                                                 │
│  推荐配置：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 数据量        │ 推荐分片数                              │   │
│  ├───────────────┼─────────────────────────────────────────┤   │
│  │ < 1000 万     │ 2-4                                     │   │
│  │ 1000 万 - 1 亿│ 4-8                                     │   │
│  │ 1 亿 - 10 亿  │ 8-16                                    │   │
│  │ > 10 亿       │ 16-64                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  经验公式：                                                      │
│  分片数 ≈ min(数据量 / 单分片最优大小, 节点数 × 2)             │
│  单分片最优大小：1000 万 - 5000 万行                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 创建分片

```python
from pymilvus import Collection

# 创建 Collection 时指定分片数
collection = Collection(
    name="example",
    schema=schema,
    shard_num=4  # 指定分片数量
)

# 查看分片信息
print(f"分片数量: {collection.num_shards}")
```

## 三、查询路由机制

### 3.1 路由架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    查询路由架构                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        查询请求                                  │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                       Proxy                             │   │
│  │  1. 解析查询请求                                        │   │
│  │  2. 获取 Collection 元数据                              │   │
│  │  3. 确定查询的分片范围                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Query Coordinator                      │   │
│  │  4. 获取分片到节点的映射                                │   │
│  │  5. 分发查询到各节点                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│          ┌────────────────┼────────────────┐                   │
│          ▼                ▼                ▼                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ Query Node 1│  │ Query Node 2│  │ Query Node 3│           │
│  │  Shard 1    │  │  Shard 2    │  │  Shard 3    │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
│          │                │                │                   │
│          └────────────────┼────────────────┘                   │
│                           ▼                                     │
│                    结果归并 (Proxy)                             │
│                           │                                     │
│                           ▼                                     │
│                      返回结果                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 路由实现

```go
// 查询路由实现

type QueryRouter struct {
    metaCache    *MetaCache
    shardManager *ShardManager
}

func (r *QueryRouter) Route(req *SearchRequest) ([]*ShardTarget, error) {
    // 1. 获取 Collection 信息
    collection := r.metaCache.GetCollection(req.CollectionName)
    
    // 2. 确定查询的分片范围
    shards := r.determineShards(collection, req.PartitionNames)
    
    // 3. 获取每个分片的目标节点
    targets := make([]*ShardTarget, 0, len(shards))
    for _, shard := range shards {
        node := r.shardManager.GetShardLeader(shard.ID)
        targets = append(targets, &ShardTarget{
            ShardID:    shard.ID,
            NodeID:     node.ID,
            NodeAddr:   node.Address,
        })
    }
    
    return targets, nil
}

func (r *QueryRouter) determineShards(collection *Collection, partitionNames []string) []*Shard {
    // 如果指定了 Partition，只查询相关分片
    if len(partitionNames) > 0 {
        return collection.GetShardsByPartitions(partitionNames)
    }
    
    // 否则查询所有分片
    return collection.GetAllShards()
}
```

### 3.3 DML 路由

```go
// DML (Insert/Delete) 路由

type DMLRouter struct {
    dataCoordClient DataCoordClient
    shardNum        int
}

func (r *DMLRouter) RouteInsert(primaryKeys []int64) map[int][]int {
    // 计算每行数据应该去的分片
    shardAssignments := make(map[int][]int)
    
    for i, pk := range primaryKeys {
        shardID := int(hash(pk) % uint32(r.shardNum))
        shardAssignments[shardID] = append(shardAssignments[shardID], i)
    }
    
    return shardAssignments
}

func hash(key int64) uint32 {
    // 使用 MurmurHash 或其他哈希算法
    h := uint32(key)
    h ^= h >> 16
    h *= 0x85ebca6b
    h ^= h >> 13
    h *= 0xc2b2ae35
    h ^= h >> 16
    return h
}

func (r *DMLRouter) RouteDelete(primaryKeys []int64) map[int][]int {
    // 删除路由与插入相同
    return r.RouteInsert(primaryKeys)
}
```

## 四、负载均衡

### 4.1 负载均衡策略

```
┌─────────────────────────────────────────────────────────────────┐
│                    负载均衡策略                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 基于 Segment 数量的均衡                                     │
│  • 每个 Query Node 加载的 Segment 数量相近                      │
│  • 简单直接，易于实现                                          │
│                                                                 │
│  2. 基于内存占用的均衡                                           │
│  • 每个 Query Node 的内存使用相近                              │
│  • 更精确的资源分配                                            │
│                                                                 │
│  3. 基于查询负载的均衡                                           │
│  • 根据查询频率调整 Segment 分布                               │
│  • 热点数据分布到不同节点                                      │
│                                                                 │
│  均衡触发条件：                                                  │
│  • 新节点加入                                                  │
│  • 节点故障                                                    │
│  • 负载差异超过阈值                                            │
│  • 手动触发                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 负载均衡实现

```go
// 负载均衡器

type LoadBalancer struct {
    threshold float64  // 负载差异阈值
}

type NodeLoad struct {
    NodeID      int64
    SegmentNum  int
    MemoryUsage int64
    QueryQPS    float64
}

func (lb *LoadBalancer) Balance(nodes []*NodeLoad) []*MigrationPlan {
    plans := make([]*MigrationPlan, 0)
    
    // 1. 计算平均负载
    avgSegmentNum := lb.calculateAvgSegmentNum(nodes)
    
    // 2. 找出过载和空闲节点
    overloaded := make([]*NodeLoad, 0)
    underloaded := make([]*NodeLoad, 0)
    
    for _, node := range nodes {
        ratio := float64(node.SegmentNum) / avgSegmentNum
        if ratio > 1+lb.threshold {
            overloaded = append(overloaded, node)
        } else if ratio < 1-lb.threshold {
            underloaded = append(underloaded, node)
        }
    }
    
    // 3. 生成迁移计划
    for _, src := range overloaded {
        excess := src.SegmentNum - int(avgSegmentNum)
        for i := 0; i < excess && len(underloaded) > 0; i++ {
            dst := underloaded[0]
            plans = append(plans, &MigrationPlan{
                SourceNode: src.NodeID,
                DestNode:   dst.NodeID,
            })
            
            dst.SegmentNum++
            if float64(dst.SegmentNum) >= avgSegmentNum {
                underloaded = underloaded[1:]
            }
        }
    }
    
    return plans
}

// Segment 迁移
func (qc *QueryCoord) migrateSegment(segmentID int64, srcNode, dstNode int64) error {
    // 1. 在目标节点加载 Segment
    err := qc.loadSegment(dstNode, segmentID)
    if err != nil {
        return err
    }
    
    // 2. 等待加载完成
    err = qc.waitForSegmentReady(dstNode, segmentID)
    if err != nil {
        return err
    }
    
    // 3. 更新路由
    qc.updateRoute(segmentID, dstNode)
    
    // 4. 在源节点释放 Segment
    qc.releaseSegment(srcNode, segmentID)
    
    return nil
}
```

### 4.3 热点检测与处理

```go
// 热点检测

type HotspotDetector struct {
    threshold   float64
    windowSize  int
    queryCounts map[int64]*SlidingWindow  // segmentID -> 查询计数
}

func (d *HotspotDetector) Detect() []int64 {
    hotspots := make([]int64, 0)
    
    // 计算平均查询频率
    totalCount := 0
    for _, window := range d.queryCounts {
        totalCount += window.Sum()
    }
    avgCount := float64(totalCount) / float64(len(d.queryCounts))
    
    // 找出热点 Segment
    for segmentID, window := range d.queryCounts {
        if float64(window.Sum()) > avgCount*d.threshold {
            hotspots = append(hotspots, segmentID)
        }
    }
    
    return hotspots
}

func (d *HotspotDetector) Handle(hotspots []int64, nodes []*QueryNodeInfo) {
    for _, segmentID := range hotspots {
        // 将热点 Segment 复制到多个节点
        // 实现查询负载分散
        replicaNum := d.calculateReplicaNum(segmentID)
        currentReplicas := d.getCurrentReplicas(segmentID)
        
        if currentReplicas < replicaNum {
            // 增加副本
            targetNodes := d.selectNodesForReplica(nodes, replicaNum-currentReplicas)
            for _, node := range targetNodes {
                d.loadReplica(node.ID, segmentID)
            }
        }
    }
}
```

## 五、路由优化策略

### 5.1 路由缓存

```go
// 路由缓存实现

type RouteCache struct {
    cache map[int64]*RouteInfo  // collectionID -> 路由信息
    mutex sync.RWMutex
    ttl   time.Duration
}

type RouteInfo struct {
    ShardLeaders map[int64]int64  // shardID -> nodeID
    ExpiresAt    time.Time
}

func (c *RouteCache) Get(collectionID int64) (*RouteInfo, bool) {
    c.mutex.RLock()
    defer c.mutex.RUnlock()
    
    info, ok := c.cache[collectionID]
    if !ok || time.Now().After(info.ExpiresAt) {
        return nil, false
    }
    
    return info, true
}

func (c *RouteCache) Set(collectionID int64, info *RouteInfo) {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    info.ExpiresAt = time.Now().Add(c.ttl)
    c.cache[collectionID] = info
}

func (c *RouteCache) Invalidate(collectionID int64) {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    delete(c.cache, collectionID)
}
```

### 5.2 查询亲和性

```
┌─────────────────────────────────────────────────────────────────┐
│                    查询亲和性优化                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  目的：减少跨节点通信开销                                       │
│                                                                 │
│  策略：                                                          │
│  1. 同一用户的查询路由到相同节点                                │
│  2. 相关数据尽量存储在同一节点                                  │
│  3. 利用本地缓存减少远程访问                                    │
│                                                                 │
│  实现方式：                                                      │
│  • 基于用户 ID 或会话 ID 的亲和性路由                          │
│  • 将用户数据集中在特定分片                                    │
│  • 查询时优先路由到缓存命中的节点                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 分片预分配

```python
# 创建 Collection 时预分配分片

def create_collection_with_shards(collection_name, schema, num_shards, num_nodes):
    """
    根据节点数量优化分片配置
    """
    # 分片数应为节点数的倍数，便于均匀分布
    optimal_shards = (num_shards // num_nodes) * num_nodes
    if optimal_shards < num_shards:
        optimal_shards += num_nodes
    
    collection = Collection(
        name=collection_name,
        schema=schema,
        shard_num=optimal_shards
    )
    
    return collection

# 示例：3 个 Query Node，分配 6 个分片
collection = create_collection_with_shards(
    "example",
    schema,
    num_shards=6,
    num_nodes=3
)
# 每个 Query Node 负责 2 个分片
```

## 总结

本文深入分析了 Milvus 的分片与路由机制，包括：

1. **数据分片**：Hash 分片原理、分片数量选择
2. **查询路由**：路由架构、路由实现、DML 路由
3. **负载均衡**：均衡策略、实现方法、热点处理
4. **路由优化**：路由缓存、查询亲和性、分片预分配

下一章将深入分析副本与高可用机制。

## 参考资料

- [Milvus Sharding Documentation](https://milvus.io/docs/architecture_data_processing.md)
- [Milvus Query Routing](https://milvus.io/docs/four_layers.md#query-coordinator)
- [Distributed Systems: Sharding](https://www.designgurus.io/course-play/grokking-the-system-interview/doc/sharding)
