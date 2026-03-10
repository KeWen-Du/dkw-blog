---
title: "Milvus底层原理（十三）：事务与一致性"
date: "2026-03-10"
excerpt: "深入理解 Milvus 的事务模型和一致性保证机制，掌握 MVCC 实现、时间戳管理、一致性级别配置和分布式事务处理原理。"
tags: ["Milvus", "向量数据库", "事务", "一致性", "MVCC"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 13
---

## 前言

事务和一致性是数据库系统的核心特性，直接决定数据的正确性和可靠性。Milvus 通过 MVCC（多版本并发控制）、全局时间戳分配和一致性级别配置，实现了灵活的一致性保证，在性能和一致性之间提供平衡选择。

本文将深入分析 Milvus 的事务模型和一致性机制，包括 MVCC 实现、时间戳管理、一致性级别和分布式事务处理。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| MVCC 实现 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 时间戳管理 | ⭐⭐⭐⭐ | 源码级 | ✅ |
| 一致性级别 | ⭐⭐⭐ | 架构设计 | ✅ |
| 分布式事务 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 快照隔离 | ⭐⭐⭐ | 数据库原理 | ✅ |

## 面试考点

1. Milvus 如何实现 MVCC？
2. 支持哪些一致性级别？
3. 全局时间戳如何分配？
4. 如何保证分布式一致性？
5. 不同一致性级别的适用场景？

## 一、事务模型概述

### 1.1 事务特性

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 事务特性                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ACID 特性在 Milvus 中的实现：                                   │
│                                                                 │
│  Atomicity (原子性)                                             │
│  • 单条 Insert/Delete 是原子的                                 │
│  • 批量操作通过 WAL 保证原子性                                 │
│                                                                 │
│  Consistency (一致性)                                           │
│  • 通过 MVCC 保证一致性读                                      │
│  • 支持多种一致性级别                                          │
│                                                                 │
│  Isolation (隔离性)                                             │
│  • 默认快照隔离（Snapshot Isolation）                          │
│  • 读取不阻塞写入，写入不阻塞读取                              │
│                                                                 │
│  Durability (持久性)                                            │
│  • WAL 机制保证数据持久化                                      │
│  • 对象存储持久化                                              │
│                                                                 │
│  注意：Milvus 不支持跨分片事务                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 MVCC 概念

```
┌─────────────────────────────────────────────────────────────────┐
│                    MVCC (多版本并发控制)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  核心思想：                                                      │
│  • 每次写入创建新版本，不覆盖旧版本                            │
│  • 读取时选择合适版本，避免加锁                                │
│  • 通过版本号实现可见性控制                                    │
│                                                                 │
│  版本链示例：                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Key: doc_001                                           │   │
│  │                                                         │   │
│  │  Version 1 (ts=100): {"title": "Hello"}                │   │
│  │       │                                                 │   │
│  │       ▼                                                 │   │
│  │  Version 2 (ts=200): {"title": "Hello World"}          │   │
│  │       │                                                 │   │
│  │       ▼                                                 │   │
│  │  Version 3 (ts=300): {"title": "Hello Milvus"}         │   │
│  │       │                                                 │   │
│  │       ▼                                                 │   │
│  │  Version 4 (ts=400): <deleted>                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  读取示例：                                                      │
│  • ts=150 读取 → Version 1                                     │
│  • ts=250 读取 → Version 2                                     │
│  • ts=500 读取 → Version 4 (已删除)                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、时间戳管理

### 2.1 TSO (Timestamp Oracle)

```go
// 时间戳分配器

type TSO struct {
    physical   int64  // 物理时间（毫秒）
    logical    int64  // 逻辑计数器
    maxLogical int64  // 逻辑计数器最大值
    mutex      sync.Mutex
}

type Timestamp struct {
    Physical int64  // 物理时间
    Logical  int64  // 逻辑时间
}

// 生成全局唯一时间戳
func (t *TSO) Allocate() *Timestamp {
    t.mutex.Lock()
    defer t.mutex.Unlock()
    
    now := time.Now().UnixMilli()
    
    if now > t.physical {
        // 物理时间更新，重置逻辑计数器
        t.physical = now
        t.logical = 0
    } else if t.logical >= t.maxLogical {
        // 逻辑计数器溢出，等待下一个物理时间
        for now <= t.physical {
            time.Sleep(time.Millisecond)
            now = time.Now().UnixMilli()
        }
        t.physical = now
        t.logical = 0
    } else {
        // 逻辑计数器递增
        t.logical++
    }
    
    return &Timestamp{
        Physical: t.physical,
        Logical:  t.logical,
    }
}

// 时间戳比较
func (t *Timestamp) Compare(other *Timestamp) int {
    if t.Physical != other.Physical {
        if t.Physical < other.Physical {
            return -1
        }
        return 1
    }
    
    if t.Logical < other.Logical {
        return -1
    } else if t.Logical > other.Logical {
        return 1
    }
    return 0
}

// 时间戳编码为 int64
func (t *Timestamp) ToInt64() uint64 {
    // 编码格式：高 46 位物理时间 + 低 18 位逻辑时间
    return uint64(t.Physical)<<18 | uint64(t.Logical)
}
```

### 2.2 时间戳类型

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 时间戳类型                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 写入时间戳 (Commit Timestamp)                               │
│  • 数据写入时分配                                              │
│  • 标识数据版本                                                │
│  • 用于可见性判断                                              │
│                                                                 │
│  2. 读取时间戳 (Read Timestamp)                                 │
│  • 查询时分配                                                  │
│  • 决定读取哪个版本的数据                                      │
│  • 用于快照隔离                                                │
│                                                                 │
│  3. Guarantor Timestamp                                         │
│  • 保证所有小于此时间戳的操作已完成                            │
│  • 用于一致性判断                                              │
│                                                                 │
│  时间戳使用示例：                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  T0: 客户端发起写入请求                                  │   │
│  │  T1: 分配写入时间戳 ts_write                            │   │
│  │  T2: 数据写入 WAL                                       │   │
│  │  T3: 数据持久化完成                                      │   │
│  │  T4: 客户端发起查询请求                                  │   │
│  │  T5: 分配读取时间戳 ts_read                             │   │
│  │  T6: 根据 ts_read 读取对应版本数据                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 三、一致性级别

### 3.1 一致性级别定义

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 一致性级别                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Strong (强一致性)                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 读取最新写入的数据                                   │   │
│  │  • 需要等待所有副本同步完成                             │   │
│  │  • 延迟最高，一致性最强                                 │   │
│  │  • 适用：金融、支付等对一致性要求极高的场景             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  2. Bounded Staleness (有界一致性)                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 允许一定时间内的数据滞后                             │   │
│  │  • 平衡延迟和一致性                                     │   │
│  │  • 适用：大多数业务场景                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  3. Session (会话一致性)                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 同一会话内保证读己之写                               │   │
│  │  • 不同会话间可能看到旧数据                             │   │
│  │  • 适用：用户个性化推荐                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  4. Eventual (最终一致性)                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 不保证读取最新数据                                   │   │
│  │  • 延迟最低，一致性最弱                                 │   │
│  │  • 适用：日志分析、推荐系统                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 一致性配置

```python
from pymilvus import Collection

collection = Collection("example")

# 不同一致性级别的搜索

# 强一致性
results = collection.search(
    data=[query],
    anns_field="embedding",
    param=search_params,
    limit=10,
    consistency_level="Strong"
)

# 有界一致性（允许 3 秒延迟）
from pymilvus import ConsistencyLevel
results = collection.search(
    data=[query],
    anns_field="embedding",
    param=search_params,
    limit=10,
    consistency_level=ConsistencyLevel.Bounded,
    graceful_time=3  # 允许 3 秒延迟
)

# 会话一致性
results = collection.search(
    data=[query],
    anns_field="embedding",
    param=search_params,
    limit=10,
    consistency_level="Session"
)

# 最终一致性
results = collection.search(
    data=[query],
    anns_field="embedding",
    param=search_params,
    limit=10,
    consistency_level="Eventually"
)

# 设置 Collection 默认一致性级别
collection.set_properties({"consistency_level": "Bounded"})
```

### 3.3 一致性实现

```go
// 一致性级别实现

type ConsistencyLevel int

const (
    ConsistencyLevelStrong ConsistencyLevel = iota
    ConsistencyLevelBounded
    ConsistencyLevelSession
    ConsistencyLevelEventually
)

// 根据一致性级别确定读取时间戳
func (q *QueryCoord) getReadTimestamp(level ConsistencyLevel) uint64 {
    switch level {
    case ConsistencyLevelStrong:
        // 强一致性：使用最新时间戳
        return q.tso.Allocate().ToInt64()
        
    case ConsistencyLevelBounded:
        // 有界一致性：使用 guarantor timestamp
        return q.getGuarantorTimestamp()
        
    case ConsistencyLevelSession:
        // 会话一致性：使用会话的最后写入时间戳
        return q.getSessionTimestamp()
        
    case ConsistencyLevelEventually:
        // 最终一致性：使用任意可用时间戳
        return q.getSafeTimestamp()
        
    default:
        return q.getGuarantorTimestamp()
    }
}

func (q *QueryCoord) getGuarantorTimestamp() uint64 {
    // Guarantor Timestamp: 保证所有小于此时间戳的操作已完成
    return q.guarantor.Load().(uint64)
}

func (q *QueryCoord) updateGuarantorTimestamp(ts uint64) {
    // 更新 Guarantor Timestamp
    for {
        old := q.guarantor.Load().(uint64)
        if ts <= old {
            return
        }
        if q.guarantor.CompareAndSwap(old, ts) {
            return
        }
    }
}
```

## 四、快照隔离

### 4.1 快照隔离原理

```
┌─────────────────────────────────────────────────────────────────┐
│                    快照隔离原理                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  定义：                                                          │
│  读取操作看到的是某个时间点的数据快照，不受并发写入影响         │
│                                                                 │
│  实现：                                                          │
│  1. 查询开始时获取读取时间戳                                    │
│  2. 只读取时间戳小于等于读取时间戳的数据                        │
│  3. 忽略之后写入的数据                                          │
│                                                                 │
│  示例：                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Timeline:                                              │   │
│  │                                                         │   │
│  │  T100: Insert [doc_001]                                 │   │
│  │  T150: Insert [doc_002]                                 │   │
│  │  T200: ──── Query starts (read_ts = 200) ────           │   │
│  │  T250: Insert [doc_003]                                 │   │
│  │  T300: Delete [doc_001]                                 │   │
│  │  T350: Query completes                                  │   │
│  │                                                         │   │
│  │  查询结果：[doc_001, doc_002]                           │   │
│  │  不包含：doc_003 (T250 > T200)                          │   │
│  │  包含：doc_001 (T100 < T200，删除在 T300)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  优势：                                                          │
│  • 读取不阻塞写入                                              │
│  • 写入不阻塞读取                                              │
│  • 实现简单，性能好                                            │
│                                                                 │
│  注意：                                                          │
│  • 不防止写偏序（Write Skew）                                  │
│  • Milvus 主要场景是搜索，影响较小                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 可见性判断

```go
// 数据可见性判断

type VisibilityChecker struct {
    readTimestamp uint64
}

func (c *VisibilityChecker) IsVisible(data *DataRecord) bool {
    // 1. 数据写入时间必须小于等于读取时间戳
    if data.CommitTimestamp > c.readTimestamp {
        return false
    }
    
    // 2. 数据未被删除，或删除时间大于读取时间戳
    if data.IsDeleted && data.DeleteTimestamp <= c.readTimestamp {
        return false
    }
    
    return true
}

// Segment 可见性判断
func (c *VisibilityChecker) IsSegmentVisible(segment *Segment) bool {
    // Segment 的可见性取决于其数据的可见性
    return segment.MaxTimestamp >= c.readTimestamp ||
           segment.MinTimestamp <= c.readTimestamp
}
```

## 五、分布式事务

### 5.1 写入事务流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    写入事务流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 客户端发起写入请求                                          │
│     │                                                          │
│     ▼                                                          │
│  2. Proxy 分配时间戳                                            │
│     │                                                          │
│     ▼                                                          │
│  3. 按分片分发数据                                              │
│     │                                                          │
│     ├───────────┬───────────┬───────────┐                      │
│     ▼           ▼           ▼           │                      │
│  Shard 1     Shard 2     Shard 3        │                      │
│  写入 MQ     写入 MQ     写入 MQ        │                      │
│     │           │           │           │                      │
│     ▼           ▼           ▼           │                      │
│  Data Node   Data Node   Data Node      │                      │
│  消费数据    消费数据    消费数据        │                      │
│     │           │           │           │                      │
│     └───────────┼───────────┘           │                      │
│                 ▼                       │                      │
│  4. 持久化到对象存储                      │                      │
│                 │                       │                      │
│                 ▼                       │                      │
│  5. 更新 Guarantor Timestamp             │                      │
│                 │                       │                      │
│                 ▼                       │                      │
│  6. 返回成功给客户端                      │                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 删除事务处理

```go
// 删除事务实现

type DeleteTransaction struct {
    collectionID int64
    partitionID  int64
    primaryKeys  []int64
    timestamp    uint64
}

func (t *DeleteTransaction) Execute() error {
    // 1. 分配删除时间戳
    t.timestamp = t.tso.Allocate().ToInt64()
    
    // 2. 记录删除日志到 WAL
    deleteMsg := &DeleteMessage{
        CollectionID: t.collectionID,
        PartitionID:  t.partitionID,
        PrimaryKeys:  t.primaryKeys,
        Timestamp:    t.timestamp,
    }
    
    if err := t.wal.Append(deleteMsg); err != nil {
        return err
    }
    
    // 3. 消费删除日志
    // 删除不是物理删除，而是标记删除
    // 在 Compaction 时才真正删除
    
    return nil
}

// 删除标记
type DeleteRecord struct {
    PrimaryKey      int64
    DeleteTimestamp uint64
}

// 查询时过滤已删除数据
func filterDeleted(records []*DataRecord, deletes []*DeleteRecord, readTs uint64) []*DataRecord {
    deleteMap := make(map[int64]uint64)
    for _, d := range deletes {
        if _, ok := deleteMap[d.PrimaryKey]; !ok || d.DeleteTimestamp < deleteMap[d.PrimaryKey] {
            deleteMap[d.PrimaryKey] = d.DeleteTimestamp
        }
    }
    
    result := make([]*DataRecord, 0)
    for _, r := range records {
        if delTs, ok := deleteMap[r.PrimaryKey]; ok {
            // 如果删除时间 <= 读取时间，则过滤掉
            if delTs <= readTs {
                continue
            }
        }
        result = append(result, r)
    }
    
    return result
}
```

## 六、一致性最佳实践

### 6.1 场景选择

```
┌─────────────────────────────────────────────────────────────────┐
│                    一致性级别选择指南                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  场景                          推荐一致性级别                   │
│  ────────────────────────────────────────────────────────────  │
│  实时推荐、搜索结果             Eventually / Bounded            │
│  用户个人数据                   Session                          │
│  金融、支付相关                 Strong                           │
│  日志分析、监控                 Eventually                       │
│  知识库问答                     Bounded                          │
│  数据同步、备份                 Strong                           │
│                                                                 │
│  权衡因素：                                                      │
│  • 延迟要求：延迟敏感选弱一致性                                 │
│  • 数据新鲜度：需要最新数据选强一致性                           │
│  • 并发量：高并发选弱一致性                                     │
│  • 业务容忍度：业务能容忍多久的延迟                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 性能优化

```python
# 批量操作减少时间戳分配开销

# 不推荐：多次小批量操作
for i in range(100):
    collection.insert([single_data])

# 推荐：批量操作
batch_data = prepare_large_batch()
collection.insert(batch_data)

# 使用会话一致性避免不必要的同步
collection.load()
# 后续查询使用会话一致性
results = collection.search(
    data=query,
    anns_field="embedding",
    param=search_params,
    limit=10,
    consistency_level="Session"
)
```

## 总结

本文深入分析了 Milvus 的事务与一致性机制，包括：

1. **事务模型**：ACID 特性在 Milvus 中的实现
2. **MVCC**：多版本并发控制原理
3. **时间戳管理**：TSO 分配、时间戳类型
4. **一致性级别**：Strong、Bounded、Session、Eventually
5. **快照隔离**：可见性判断、读写不阻塞
6. **分布式事务**：写入流程、删除处理

下一章将深入分析内存与缓存管理。

## 参考资料

- [Milvus Consistency](https://milvus.io/docs/consistency.md)
- [Milvus MVCC Implementation](https://github.com/milvus-io/milvus/blob/master/docs/design_docs/mvcc.md)
- [Time戳 Oracle Design](https://pddocs.pingcap.com/tidb/dev/time-to-reach-tso/)
