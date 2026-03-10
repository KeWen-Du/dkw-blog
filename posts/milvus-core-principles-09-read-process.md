---
title: "Milvus底层原理（九）：数据读取流程"
date: "2026-03-10"
excerpt: "深入理解 Milvus 的数据读取流程，掌握从查询请求到结果返回的完整链路，了解向量化执行引擎和查询优化策略。"
tags: ["Milvus", "向量数据库", "读取流程", "查询执行", "架构设计"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 9
---

## 前言

数据读取是向量数据库最核心的功能，直接决定了搜索性能和用户体验。Milvus 采用了向量化执行引擎和存算分离架构，通过 Query Coordinator 和 Query Node 的协作，实现高效的向量搜索和标量过滤。

本文将深入分析 Milvus 的数据读取流程，包括查询路径、执行引擎、向量化执行和查询优化策略。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 查询路径分析 | ⭐⭐⭐ | 架构设计 | ✅ |
| 向量化执行引擎 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 查询计划生成 | ⭐⭐⭐⭐ | 源码级 | ✅ |
| 结果归并策略 | ⭐⭐⭐ | 算法设计 | ✅ |
| 查询优化 | ⭐⭐⭐ | 实战技能 | ✅ |

## 面试考点

1. Milvus 的查询流程是怎样的？
2. 向量化执行引擎有什么优势？
3. 如何实现标量过滤与向量搜索的结合？
4. 查询结果如何归并？
5. 如何优化查询性能？

## 一、查询流程概览

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 查询流程架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                               │
│  │   Client    │                                               │
│  │  (SDK/REST) │                                               │
│  └──────┬──────┘                                               │
│         │ search(query, top_k, filter)                         │
│         ▼                                                       │
│  ┌─────────────┐      ┌─────────────────┐                     │
│  │    Proxy    │─────►│  Root Coordinator│                     │
│  │  (接入层)   │      │   (元数据管理)    │                     │
│  └──────┬──────┘      └─────────────────┘                     │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                           │
│  │ Query Coordinator│                                           │
│  │   (查询协调)     │                                           │
│  │  • 生成查询计划  │                                           │
│  │  • 分发查询任务  │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Query Nodes                          │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐          │   │
│  │  │ QueryNode1│  │ QueryNode2│  │ QueryNode3│          │   │
│  │  │ Shard 1-2 │  │ Shard 3-4 │  │ Shard 5-6 │          │   │
│  │  └───────────┘  └───────────┘  └───────────┘          │   │
│  │         │              │              │                │   │
│  │         └──────────────┼──────────────┘                │   │
│  │                        ▼                                │   │
│  │              结果归并 (Proxy 层)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Segment 数据                          │   │
│  │  • Growing Segments (内存)                              │   │
│  │  • Sealed Segments (对象存储)                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 查询流程时序

```
┌─────────────────────────────────────────────────────────────────┐
│                    查询流程时序图                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Client  Proxy  QueryCoord  QueryNode1  QueryNode2  Storage    │
│    │       │        │           │           │          │       │
│    │search │        │           │           │          │       │
│    │──────►│        │           │           │          │       │
│    │       │        │           │           │          │       │
│    │       │1.解析查询         │           │          │       │
│    │       │        │           │           │          │       │
│    │       │2.请求查询计划     │           │          │       │
│    │       │───────►│          │           │          │       │
│    │       │        │           │           │          │       │
│    │       │        │3.生成计划│           │          │       │
│    │       │        │          │           │          │       │
│    │       │◄───────│          │           │          │       │
│    │       │  plan  │           │           │          │       │
│    │       │        │           │           │          │       │
│    │       │4.分发查询到各Node  │           │          │       │
│    │       │───────────────────►│           │          │       │
│    │       │─────────────────────────────►│          │       │
│    │       │        │           │           │          │       │
│    │       │        │           │5.执行查询│          │       │
│    │       │        │           │──────────│────────►│       │
│    │       │        │           │           │          │       │
│    │       │        │           │◄──────────│─────────│       │
│    │       │        │           │  结果    │          │       │
│    │       │        │           │           │          │       │
│    │       │◄───────────────────│           │          │       │
│    │       │◄─────────────────────────────│          │       │
│    │       │        │           │           │          │       │
│    │       │6.归并结果         │           │          │       │
│    │       │        │           │           │          │       │
│    │◄──────│返回Top-K          │           │          │       │
│    │       │        │           │           │          │       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、查询计划生成

### 2.1 查询计划结构

```
┌─────────────────────────────────────────────────────────────────┐
│                    查询计划结构                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Query Plan = 算子树                                            │
│                                                                 │
│  示例查询：                                                      │
│  search(query, top_k=10, filter="category == 1")               │
│                                                                 │
│  查询计划：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Limit (10)                           │   │
│  │                         │                               │   │
│  │                         ▼                               │   │
│  │                   ANNSearch                             │   │
│  │              (向量搜索, nprobe=16)                       │   │
│  │                         │                               │   │
│  │                         ▼                               │   │
│  │                   Filter                               │   │
│  │              (category == 1)                            │   │
│  │                         │                               │   │
│  │                         ▼                               │   │
│  │                   SegmentScan                          │   │
│  │              (扫描 Segment 数据)                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  算子类型：                                                      │
│  • SegmentScan: 扫描 Segment 数据                              │
│  • Filter: 标量过滤                                            │
│  • ANNSearch: 向量搜索                                         │
│  • Limit: 结果限制                                             │
│  • Merge: 结果归并                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 查询计划生成代码

```go
// Query Plan 生成器

type QueryPlanner struct {
    meta *Meta
}

func (p *QueryPlanner) PlanQuery(req *SearchRequest) (*QueryPlan, error) {
    // 1. 获取 Collection 元数据
    collection := p.meta.GetCollection(req.CollectionName)
    
    // 2. 确定查询范围
    segments := p.determineSegments(collection, req.PartitionNames)
    
    // 3. 生成分片查询计划
    shardPlans := make([]*ShardQueryPlan, 0)
    for _, shard := range collection.Shards {
        plan := &ShardQueryPlan{
            ShardID:    shard.ID,
            Segments:   segments[shard.ID],
            SearchInfo: req.SearchInfo,
            Filter:     req.Filter,
        }
        shardPlans = append(shardPlans, plan)
    }
    
    // 4. 构建整体查询计划
    return &QueryPlan{
        ShardPlans: shardPlans,
        Limit:      req.TopK,
        Offset:     req.Offset,
    }, nil
}

func (p *QueryPlanner) determineSegments(collection *Collection, partitionNames []string) map[int64][]int64 {
    segments := make(map[int64][]int64)
    
    for _, partition := range collection.Partitions {
        // 过滤指定的 Partition
        if len(partitionNames) > 0 && !contains(partitionNames, partition.Name) {
            continue
        }
        
        // 获取 Growing 和 Sealed Segments
        for _, segment := range partition.Segments {
            if segment.State == Growing || segment.State == Sealed || segment.State == Indexed {
                segments[partition.ShardID] = append(segments[partition.ShardID], segment.ID)
            }
        }
    }
    
    return segments
}
```

## 三、向量化执行引擎

### 3.1 执行引擎架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    向量化执行引擎架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  执行流程：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Query Plan                           │   │
│  │                         │                               │   │
│  │                         ▼                               │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              Execution Pipeline                  │   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐        │   │   │
│  │  │  │Operator1│─►│Operator2│─►│Operator3│        │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘        │   │   │
│  │  │       │            │            │              │   │   │
│  │  │       ▼            ▼            ▼              │   │   │
│  │  │  ┌─────────────────────────────────────────┐  │   │   │
│  │  │  │          Column Data (Batch)            │  │   │   │
│  │  │  │  ┌─────┐ ┌─────┐ ┌─────┐              │  │   │   │
│  │  │  │  │ Col1│ │ Col2│ │ Col3│  ...         │  │   │   │
│  │  │  │  └─────┘ └─────┘ └─────┘              │  │   │   │
│  │  │  └─────────────────────────────────────────┘  │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                         │                           │   │
│  │                         ▼                           │   │
│  │                    Results                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  向量化执行特点：                                                │
│  • 批量处理数据（Batch）                                        │
│  • 列式数据布局                                                │
│  • SIMD 友好的计算                                             │
│  • 减少函数调用开销                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 执行算子实现

```go
// 向量搜索算子

type ANNSearchOperator struct {
    query      []float32
    topK       int
    nprobe     int
    metricType string
    
    // 输入输出
    input      *ColumnData
    output     *SearchResult
}

func (op *ANNSearchOperator) Execute(ctx context.Context) error {
    // 1. 获取索引
    index := op.input.Index
    
    // 2. 执行向量搜索
    ids, distances := index.Search(op.query, op.topK, op.nprobe)
    
    // 3. 构建输出
    op.output = &SearchResult{
        IDs:       ids,
        Distances: distances,
        RowIDs:    op.input.RowIDs[ids],
    }
    
    return nil
}

// 过滤算子

type FilterOperator struct {
    expression Expr
    
    input  *ColumnData
    output *ColumnData
}

func (op *FilterOperator) Execute(ctx context.Context) error {
    // 1. 评估过滤表达式
    mask := op.evaluateExpression(op.expression, op.input)
    
    // 2. 应用过滤
    op.output = op.input.Filter(mask)
    
    return nil
}

func (op *FilterOperator) evaluateExpression(expr Expr, data *ColumnData) []bool {
    switch e := expr.(type) {
    case *CompareExpr:
        left := op.evaluateColumn(e.Left, data)
        right := e.Right
        
        switch e.Op {
        case "==":
            return compareEqual(left, right)
        case ">":
            return compareGreater(left, right)
        case "<":
            return compareLess(left, right)
        }
        
    case *LogicalExpr:
        left := op.evaluateExpression(e.Left, data)
        right := op.evaluateExpression(e.Right, data)
        
        switch e.Op {
        case "AND":
            return logicalAnd(left, right)
        case "OR":
            return logicalOr(left, right)
        }
        
    case *ColumnExpr:
        return data.GetColumn(e.Name).([]bool)
    }
    
    return nil
}
```

### 3.3 批量处理优化

```go
// 批量处理实现

type BatchProcessor struct {
    batchSize int
}

func (p *BatchProcessor) ProcessBatch(data *ColumnData, operator Operator) *ColumnData {
    totalRows := data.RowCount()
    results := make([]*ColumnData, 0)
    
    // 分批处理
    for offset := 0; offset < totalRows; offset += p.batchSize {
        end := min(offset+p.batchSize, totalRows)
        batch := data.Slice(offset, end)
        
        // 执行算子
        result := operator.Execute(batch)
        results = append(results, result)
    }
    
    // 合并结果
    return p.mergeResults(results)
}

// SIMD 优化的距离计算
func computeDistancesSIMD(query []float32, vectors []float32, dim int) []float32 {
    n := len(vectors) / dim
    distances := make([]float32, n)
    
    // 使用 SIMD 指令加速
    // 实际实现会使用汇编或 CGO 调用优化库
    
    for i := 0; i < n; i++ {
        vec := vectors[i*dim : (i+1)*dim]
        distances[i] = l2DistanceSIMD(query, vec)
    }
    
    return distances
}
```

## 四、结果归并策略

### 4.1 分布式搜索归并

```
┌─────────────────────────────────────────────────────────────────┐
│                    分布式搜索结果归并                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  场景：3 个 Shard，每个返回 Top-5，最终需要 Top-10              │
│                                                                 │
│  Shard 1 结果:                                                  │
│  [(id: 1, dist: 0.1), (id: 2, dist: 0.2), ...]                 │
│                                                                 │
│  Shard 2 结果:                                                  │
│  [(id: 3, dist: 0.15), (id: 4, dist: 0.25), ...]               │
│                                                                 │
│  Shard 3 结果:                                                  │
│  [(id: 5, dist: 0.12), (id: 6, dist: 0.22), ...]               │
│                                                                 │
│  归并过程（最小堆）：                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. 初始化：从每个 Shard 取第一个元素                    │   │
│  │     Heap: [(0.1, shard1), (0.15, shard2), (0.12, shard3)]│  │
│  │                                                         │   │
│  │  2. 取出最小：(0.1, id:1, shard1)                       │   │
│  │     从 shard1 取下一个：(0.2, id:2)                     │   │
│  │     Heap: [(0.12, shard3), (0.15, shard2), (0.2, shard1)]│  │
│  │                                                         │   │
│  │  3. 取出最小：(0.12, id:5, shard3)                      │   │
│  │     从 shard3 取下一个：(0.22, id:6)                    │   │
│  │     Heap: [(0.15, shard2), (0.2, shard1), (0.22, shard3)]│  │
│  │                                                         │   │
│  │  4. 继续直到收集 Top-10                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  最终结果：                                                      │
│  [(id:1, 0.1), (id:5, 0.12), (id:3, 0.15), (id:2, 0.2), ...]  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 归并实现

```go
// 结果归并器

type ResultMerger struct {
    topK int
}

func (m *ResultMerger) Merge(shardResults []*SearchResult) *SearchResult {
    if len(shardResults) == 1 {
        return shardResults[0]
    }
    
    // 使用最小堆归并
    heap := &ResultHeap{}
    heap.Init()
    
    // 初始化：从每个 shard 取第一个元素
    cursors := make([]int, len(shardResults))
    for i, result := range shardResults {
        if len(result.IDs) > 0 {
            heap.Push(&ResultItem{
                Distance:   result.Distances[0],
                ID:         result.IDs[0],
                ShardIndex: i,
            })
        }
    }
    
    // 归并
    mergedIDs := make([]int64, 0, m.topK)
    mergedDistances := make([]float32, 0, m.topK)
    
    for len(mergedIDs) < m.topK && heap.Len() > 0 {
        // 取出最小距离的元素
        item := heap.Pop().(*ResultItem)
        mergedIDs = append(mergedIDs, item.ID)
        mergedDistances = append(mergedDistances, item.Distance)
        
        // 从对应 shard 取下一个元素
        cursors[item.ShardIndex]++
        result := shardResults[item.ShardIndex]
        if cursors[item.ShardIndex] < len(result.IDs) {
            heap.Push(&ResultItem{
                Distance:   result.Distances[cursors[item.ShardIndex]],
                ID:         result.IDs[cursors[item.ShardIndex]],
                ShardIndex: item.ShardIndex,
            })
        }
    }
    
    return &SearchResult{
        IDs:       mergedIDs,
        Distances: mergedDistances,
    }
}

// 堆元素
type ResultItem struct {
    Distance   float32
    ID         int64
    ShardIndex int
}

type ResultHeap []*ResultItem

func (h ResultHeap) Len() int           { return len(h) }
func (h ResultHeap) Less(i, j int) bool { return h[i].Distance < h[j].Distance }
func (h ResultHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }

func (h *ResultHeap) Push(x interface{}) {
    *h = append(*h, x.(*ResultItem))
}

func (h *ResultHeap) Pop() interface{} {
    old := *h
    n := len(old)
    x := old[n-1]
    *h = old[0 : n-1]
    return x
}
```

## 五、查询优化策略

### 5.1 标量过滤下推

```
┌─────────────────────────────────────────────────────────────────┐
│                    标量过滤下推                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  优化前：先向量搜索，后标量过滤                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  向量搜索 (top_k=1000)                                  │   │
│  │         │                                               │   │
│  │         ▼                                               │   │
│  │  标量过滤 (可能只剩余 100 条)                            │   │
│  │         │                                               │   │
│  │         ▼                                               │   │
│  │  返回 Top-10                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│  问题：向量搜索计算量大，很多结果被过滤掉                       │
│                                                                 │
│  优化后：先标量过滤，后向量搜索                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  标量过滤 (快速过滤大部分数据)                           │   │
│  │         │                                               │   │
│  │         ▼                                               │   │
│  │  向量搜索 (在过滤后的数据上搜索)                         │   │
│  │         │                                               │   │
│  │         ▼                                               │   │
│  │  返回 Top-10                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│  优势：减少向量搜索的数据量                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 分区裁剪

```python
# 只搜索特定分区，减少搜索范围

# 不推荐：搜索所有分区
results = collection.search(
    data=query,
    anns_field="embedding",
    param=search_params,
    limit=10
)

# 推荐：指定分区
results = collection.search(
    data=query,
    anns_field="embedding",
    param=search_params,
    limit=10,
    partition_names=["partition_2024_01"]  # 只搜索特定分区
)
```

### 5.3 索引选择优化

```
┌─────────────────────────────────────────────────────────────────┐
│                    索引选择策略                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  场景 1：高召回率需求                                           │
│  • 选择 HNSW 或 IVF-Flat                                       │
│  • 适当增加 nprobe/ef                                          │
│                                                                 │
│  场景 2：高吞吐需求                                             │
│  • 选择 IVF-PQ 或 HNSW (小 ef)                                 │
│  • 批量查询                                                    │
│                                                                 │
│  场景 3：内存受限                                               │
│  • 选择 IVF-PQ 或 DiskANN                                      │
│  • 增加压缩比                                                  │
│                                                                 │
│  场景 4：实时性要求高                                           │
│  • Growing Segment 直接搜索                                    │
│  • 减少索引构建延迟                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 六、查询性能调优

### 6.1 配置优化

```yaml
# Milvus 查询相关配置

queryNode:
  # 加载配置
  load:
    memoryLimit: 4GB
    
  # 搜索配置
  search:
    batchSize: 1024
    parallelism: 8
    
  # 缓存配置
  cache:
    enabled: true
    size: 2GB

queryCoord:
  # 任务调度
  task:
    timeout: 30s
    retryTimes: 3
```

### 6.2 监控指标

```
┌─────────────────────────────────────────────────────────────────┐
│                    查询性能监控指标                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  延迟指标：                                                      │
│  • search_latency_ms: 搜索延迟                                 │
│  • p50, p95, p99 延迟分布                                      │
│  • queue_wait_time: 队列等待时间                               │
│                                                                 │
│  吞吐指标：                                                      │
│  • search_qps: 每秒查询数                                      │
│  • search_batch_size: 批量查询大小                             │
│                                                                 │
│  资源指标：                                                      │
│  • cpu_usage: CPU 使用率                                       │
│  • memory_usage: 内存使用量                                    │
│  • io_wait: IO 等待时间                                        │
│                                                                 │
│  缓存指标：                                                      │
│  • cache_hit_rate: 缓存命中率                                  │
│  • cache_eviction: 缓存淘汰率                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 总结

本文深入分析了 Milvus 的数据读取流程，包括：

1. **查询流程架构**：Proxy → Query Coordinator → Query Node
2. **查询计划生成**：算子树结构和执行计划
3. **向量化执行引擎**：批量处理、SIMD 优化
4. **结果归并策略**：多 Shard 结果合并
5. **查询优化**：过滤下推、分区裁剪、索引选择

下一章将深入分析 Milvus 的分布式架构设计。

## 参考资料

- [Milvus Query Coord Documentation](https://github.com/milvus-io/milvus/tree/master/internal/querycoord)
- [Milvus Query Node Documentation](https://github.com/milvus-io/milvus/tree/master/internal/querynode)
- [Milvus Query Execution](https://milvus.io/docs/query.md)
