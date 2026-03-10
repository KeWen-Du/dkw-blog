---
title: "Milvus底层原理（八）：数据写入流程"
date: "2026-03-10"
excerpt: "深入理解 Milvus 的数据写入流程，掌握从客户端请求到数据持久化的完整链路，了解写入优化策略和数据一致性保证机制。"
tags: ["Milvus", "向量数据库", "写入流程", "数据持久化", "架构设计"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 8
---

## 前言

数据写入是数据库系统的核心功能之一，写入性能直接影响系统的吞吐能力和用户体验。Milvus 采用了存算分离的架构设计，数据写入流程涉及 Proxy、Data Coordinator、Data Node、对象存储等多个组件的协作，通过 WAL 机制保证数据可靠性。

本文将深入分析 Milvus 的数据写入流程，包括写入路径、组件协作、数据持久化和写入优化策略。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 写入路径分析 | ⭐⭐⭐ | 架构设计 | ✅ |
| WAL 机制 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Segment 管理 | ⭐⭐⭐⭐ | 源码级 | ✅ |
| 写入优化策略 | ⭐⭐⭐ | 实战技能 | ✅ |
| 数据一致性保证 | ⭐⭐⭐⭐ | 架构设计 | ✅ |

## 面试考点

1. Milvus 的写入流程是怎样的？
2. 数据如何保证持久化？
3. Growing Segment 什么时候转换为 Sealed Segment？
4. 如何提高写入吞吐量？
5. Data Coordinator 和 Data Node 的职责是什么？

## 一、写入流程概览

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 写入流程架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                               │
│  │   Client    │                                               │
│  │  (SDK/REST) │                                               │
│  └──────┬──────┘                                               │
│         │ insert(data)                                         │
│         ▼                                                       │
│  ┌─────────────┐      ┌─────────────────┐                     │
│  │    Proxy    │─────►│  Root Coordinator│                     │
│  │  (接入层)   │      │   (元数据管理)    │                     │
│  └──────┬──────┘      └─────────────────┘                     │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                           │
│  │ Data Coordinator │                                           │
│  │   (数据协调)     │                                           │
│  │  • 分配 Segment  │                                           │
│  │  • 管理数据分布  │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐      ┌─────────────────┐                 │
│  │   Data Node     │─────►│  Message Queue   │                 │
│  │   (数据写入)    │      │    (Kafka/Pulsar)│                 │
│  │  • 消费消息     │      │   • WAL 日志     │                 │
│  │  • 构建索引     │      └─────────────────┘                 │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    对象存储 (MinIO/S3)                   │   │
│  │  • Segment 数据文件                                      │   │
│  │  • 索引文件                                              │   │
│  │  • 元数据文件                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 写入流程详解

```
┌─────────────────────────────────────────────────────────────────┐
│                    写入流程时序图                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Client    Proxy    DataCoord    DataNode    MQ      Storage   │
│    │         │          │           │         │         │       │
│    │ insert  │          │           │         │         │       │
│    │────────►│          │           │         │         │       │
│    │         │          │           │         │         │       │
│    │         │ 1.解析请求           │         │         │       │
│    │         │          │           │         │         │       │
│    │         │ 2.获取Segment分配   │         │         │       │
│    │         │─────────►│          │         │         │       │
│    │         │          │           │         │         │       │
│    │         │◄─────────│          │         │         │       │
│    │         │ segment_id           │         │         │       │
│    │         │          │           │         │         │       │
│    │         │ 3.写入MQ (WAL)       │         │         │       │
│    │         │─────────────────────►│         │         │       │
│    │         │          │           │         │         │       │
│    │◄────────│ 返回成功            │         │         │       │
│    │         │          │           │         │         │       │
│    │         │          │ 4.消费消息│         │         │       │
│    │         │          │           │◄────────│         │       │
│    │         │          │           │         │         │       │
│    │         │          │           │ 5.写入Segment       │
│    │         │          │           │─────────────────►│       │
│    │         │          │           │         │         │       │
│    │         │          │ 6.上报状态│         │         │       │
│    │         │          │◄──────────│         │         │       │
│    │         │          │           │         │         │       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、组件职责详解

### 2.1 Proxy 层

```go
// Proxy 写入处理流程（简化版）

func (p *Proxy) Insert(ctx context.Context, req *InsertRequest) (*InsertResult, error) {
    // 1. 参数校验
    if err := p.validateInsertRequest(req); err != nil {
        return nil, err
    }
    
    // 2. 获取 Collection 信息
    collection, err := p.getCollectionInfo(req.CollectionName)
    if err != nil {
        return nil, err
    }
    
    // 3. 获取 Segment 分配
    segmentAssignments, err := p.dataCoord.AssignSegments(ctx, &AssignSegmentRequest{
        CollectionID: collection.ID,
        PartitionID:  req.PartitionID,
        RowCount:     len(req.Data),
    })
    if err != nil {
        return nil, err
    }
    
    // 4. 组织数据并写入 MQ
    for _, assignment := range segmentAssignments {
        msg := &InsertMessage{
            SegmentID:  assignment.SegmentID,
            RowData:    req.Data[assignment.StartRow:assignment.EndRow],
            Timestamp:  time.Now().UnixNano(),
        }
        
        if err := p.messageQueue.Produce(ctx, msg); err != nil {
            return nil, err
        }
    }
    
    // 5. 返回结果
    return &InsertResult{
        InsertCount: len(req.Data),
        Timestamp:   time.Now().UnixNano(),
    }, nil
}
```

### 2.2 Data Coordinator

```go
// Data Coordinator Segment 分配

func (dc *DataCoordinator) AssignSegments(ctx context.Context, req *AssignSegmentRequest) ([]*SegmentAssignment, error) {
    // 1. 查找可用的 Growing Segment
    growingSegments := dc.getGrowingSegments(req.CollectionID, req.PartitionID)
    
    var assignments []*SegmentAssignment
    
    remainingRows := req.RowCount
    
    // 2. 分配到现有 Segment
    for _, segment := range growingSegments {
        availableSpace := segment.MaxRows - segment.RowCount
        if availableSpace <= 0 {
            continue
        }
        
        assignCount := min(availableSpace, remainingRows)
        assignments = append(assignments, &SegmentAssignment{
            SegmentID: segment.ID,
            StartRow:  req.RowCount - remainingRows,
            EndRow:    req.RowCount - remainingRows + assignCount,
        })
        
        segment.RowCount += assignCount
        remainingRows -= assignCount
        
        if remainingRows == 0 {
            break
        }
    }
    
    // 3. 如果还有剩余，创建新 Segment
    for remainingRows > 0 {
        newSegment := dc.createGrowingSegment(req.CollectionID, req.PartitionID)
        assignCount := min(newSegment.MaxRows, remainingRows)
        
        assignments = append(assignments, &SegmentAssignment{
            SegmentID: newSegment.ID,
            StartRow:  req.RowCount - remainingRows,
            EndRow:    req.RowCount - remainingRows + assignCount,
        })
        
        newSegment.RowCount = assignCount
        remainingRows -= assignCount
    }
    
    return assignments, nil
}

// Sealed Segment 触发条件
func (dc *DataCoordinator) checkSegmentSeal(segment *Segment) bool {
    // 条件 1：行数达到阈值
    if segment.RowCount >= dc.config.SegmentMaxRows {
        return true
    }
    
    // 条件 2：存在时间超过阈值
    if time.Since(segment.CreateTime) >= dc.config.SegmentMaxLifetime {
        return true
    }
    
    // 条件 3：手动触发
    if segment.SealRequested {
        return true
    }
    
    return false
}
```

### 2.3 Data Node

```go
// Data Node 数据消费与处理

func (dn *DataNode) Start() {
    // 启动消息消费
    go dn.consumeInsertMessages()
    go dn.consumeDeleteMessages()
    go dn.flushSegments()
}

func (dn *DataNode) consumeInsertMessages() {
    for msg := range dn.messageQueue.Consume() {
        switch msg.Type {
        case InsertMessageType:
            dn.handleInsertMessage(msg)
        case DeleteMessageType:
            dn.handleDeleteMessage(msg)
        }
    }
}

func (dn *DataNode) handleInsertMessage(msg *InsertMessage) {
    // 1. 获取或创建 Segment Buffer
    buffer := dn.getOrCreateBuffer(msg.SegmentID)
    
    // 2. 写入 Buffer
    buffer.Write(msg.RowData)
    
    // 3. 检查是否需要 Flush
    if buffer.ShouldFlush() {
        dn.flushBuffer(buffer)
    }
}

func (dn *DataNode) flushBuffer(buffer *SegmentBuffer) {
    // 1. 冻结 Buffer
    buffer.Freeze()
    
    // 2. 构建 Segment 文件
    segmentData := buffer.BuildSegmentFiles()
    
    // 3. 上传到对象存储
    if err := dn.uploadToStorage(segmentData); err != nil {
        log.Error("upload segment failed", err)
        return
    }
    
    // 4. 上报完成状态
    dn.reportFlushComplete(buffer.SegmentID)
}
```

## 三、WAL 机制

### 3.1 WAL 设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    WAL (Write-Ahead Log) 机制                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  设计原则：                                                      │
│  • 所有写入先记录日志，再执行操作                               │
│  • 日志持久化后才返回成功                                       │
│  • 通过日志重放恢复数据                                         │
│                                                                 │
│  Milvus WAL 实现：                                              │
│  • 使用 Kafka/Pulsar 作为 WAL 存储                             │
│  • 按 Collection 分区                                          │
│  • 保证消息顺序性                                              │
│                                                                 │
│  日志类型：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ InsertMessage: 插入操作日志                              │   │
│  │ DeleteMessage: 删除操作日志                              │   │
│  │ DDLMessage: DDL 操作日志（建表、建索引等）              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  消息格式：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ MessageHeader:                                           │   │
│  │   - Timestamp: 时间戳                                   │   │
│  │   - CollectionID: 集合ID                                │   │
│  │   - PartitionID: 分区ID                                 │   │
│  │   - SegmentID: 段ID                                     │   │
│  │ MessageBody:                                             │   │
│  │   - RowData: 行数据                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 时间戳管理

```go
// 时间戳分配与管理

type TimestampAllocator struct {
    phyTs      int64  // 物理时间戳
    logTs      int64  // 逻辑时间戳
    maxBits    int    // 逻辑时间戳位数
}

// 生成全局唯一时间戳
func (t *TimestampAllocator) Allocate() uint64 {
    // 时间戳结构：物理时间(高位) + 逻辑时间(低位)
    // 例如：18位物理时间 + 10位逻辑时间
    physical := time.Now().UnixNano()
    logical := atomic.AddInt64(&t.logTs, 1) % (1 << t.maxBits)
    
    return uint64(physical<<t.maxBits | logical)
}

// 时间戳用途：
// 1. 数据版本控制
// 2. 一致性读取
// 3. MVCC 实现
```

## 四、Segment 生命周期管理

### 4.1 状态转换

```
┌─────────────────────────────────────────────────────────────────┐
│                    Segment 状态转换                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                               │
│  │   Created   │  新创建的空 Segment                           │
│  └──────┬──────┘                                               │
│         │ 数据写入                                              │
│         ▼                                                       │
│  ┌─────────────┐                                               │
│  │   Growing   │  增长中，可继续写入                           │
│  │   (内存)    │  • 接收新数据                                 │
│  └──────┬──────┘  • 可直接查询                                 │
│         │ 达到密封条件                                          │
│         ▼                                                       │
│  ┌─────────────┐                                               │
│  │   Sealed    │  已密封，不再接受写入                         │
│  └──────┬──────┘  • 数据完整                                   │
│         │ 构建索引                                              │
│         ▼                                                       │
│  ┌─────────────┐                                               │
│  │   Indexed   │  已构建索引                                   │
│  │             │  • 可高效查询                                 │
│  │             │  • 持久化到存储                               │
│  └──────┬──────┘                                               │
│         │ Compaction                                           │
│         ▼                                                       │
│  ┌─────────────┐                                               │
│  │  Compacted  │  已压缩合并                                   │
│  │             │  • 小段合并                                   │
│  │             │  • 删除标记清理                               │
│  └──────┬──────┘                                               │
│         │ 过期清理                                              │
│         ▼                                                       │
│  ┌─────────────┐                                               │
│  │   Dropped   │  已删除                                       │
│  └─────────────┘                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Flush 机制

```go
// Segment Flush 触发条件

type FlushPolicy struct {
    // 基于行数
    MaxRows       int64  // 默认 1024 * 1024
    MinRows       int64  // 默认 1024
    
    // 基于时间
    MaxLifetime   time.Duration  // 默认 10 分钟
    
    // 基于大小
    MaxSize       int64  // 默认 512 MB
    
    // 手动触发
    ForceSeal     bool
}

func (p *FlushPolicy) ShouldFlush(segment *Segment) bool {
    // 条件 1：达到最大行数
    if segment.RowCount >= p.MaxRows {
        return true
    }
    
    // 条件 2：超过最大生存时间
    if time.Since(segment.CreateTime) >= p.MaxLifetime {
        // 且达到最小行数
        if segment.RowCount >= p.MinRows {
            return true
        }
    }
    
    // 条件 3：达到最大大小
    if segment.Size >= p.MaxSize {
        return true
    }
    
    // 条件 4：手动触发
    if p.ForceSeal {
        return true
    }
    
    return false
}
```

## 五、写入优化策略

### 5.1 批量写入

```python
# 推荐使用批量写入而非单条写入

# 不推荐：单条写入
for i in range(10000):
    collection.insert([single_data])

# 推荐：批量写入
batch_size = 1000
for i in range(0, 10000, batch_size):
    batch_data = prepare_batch(i, i + batch_size)
    collection.insert(batch_data)
```

### 5.2 写入缓冲

```
┌─────────────────────────────────────────────────────────────────┐
│                    写入缓冲优化                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  客户端缓冲：                                                    │
│  • SDK 内部缓冲区                                               │
│  • 达到阈值或超时后批量发送                                     │
│                                                                 │
│  Proxy 缓冲：                                                    │
│  • 合并多个客户端请求                                           │
│  • 减少对 Data Coordinator 的调用                               │
│                                                                 │
│  Data Node 缓冲：                                                │
│  • 内存 Buffer 合并写入                                         │
│  • 减少磁盘 IO 次数                                             │
│                                                                 │
│  推荐配置：                                                      │
│  • 批量大小：1000-10000 行                                     │
│  • 缓冲超时：1-5 秒                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Parallel写入

```python
import concurrent.futures

def parallel_insert(collection, all_data, num_workers=4):
    """
    并行写入数据
    
    Args:
        collection: Milvus Collection
        all_data: 全部数据
        num_workers: 并行数
    """
    batch_size = len(all_data) // num_workers
    
    def insert_batch(batch):
        collection.insert(batch)
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = []
        for i in range(num_workers):
            start = i * batch_size
            end = start + batch_size if i < num_workers - 1 else len(all_data)
            batch = all_data[start:end]
            futures.append(executor.submit(insert_batch, batch))
        
        concurrent.futures.wait(futures)
```

## 六、写入性能调优

### 6.1 配置参数

```yaml
# Milvus 写入相关配置

dataCoord:
  segment:
    # Segment 最大行数
    maxSize: 512  # MB
    # Segment 密封阈值
    sealProportion: 0.12
    # 最小密封行数
    minSizeToSeal: 512  # KB
    
dataNode:
  flush:
    # Flush 间隔
    interval: 10  # 秒
    # 批量大小
    batchSize: 16  # MB
    
common:
  # 消息队列配置
  mq:
    type: kafka
    bufferSize: 10240
```

### 6.2 性能监控指标

```
┌─────────────────────────────────────────────────────────────────┐
│                    写入性能监控指标                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  吞吐量指标：                                                    │
│  • insert_rate: 每秒插入行数                                   │
│  • insert_bytes_rate: 每秒插入字节数                           │
│                                                                 │
│  延迟指标：                                                      │
│  • insert_latency_ms: 插入延迟                                 │
│  • p50, p95, p99 延迟分布                                      │
│                                                                 │
│  资源指标：                                                      │
│  • memory_usage: 内存使用量                                    │
│  • disk_io: 磁盘 IO                                            │
│  • mq_lag: 消息队列延迟                                        │
│                                                                 │
│  Segment 指标：                                                 │
│  • growing_segments_count: Growing Segment 数量               │
│  • sealed_segments_count: Sealed Segment 数量                 │
│  • flush_duration: Flush 耗时                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 总结

本文深入分析了 Milvus 的数据写入流程，包括：

1. **写入流程架构**：Proxy → Data Coordinator → Data Node → Storage
2. **组件职责**：各组件在写入流程中的具体作用
3. **WAL 机制**：消息队列作为 WAL 实现数据持久化
4. **Segment 生命周期**：Created → Growing → Sealed → Indexed
5. **写入优化**：批量写入、缓冲、并行策略

下一章将深入分析 Milvus 的数据读取流程。

## 参考资料

- [Milvus Data Coord Documentation](https://github.com/milvus-io/milvus/tree/master/internal/datacoord)
- [Milvus Data Node Documentation](https://github.com/milvus-io/milvus/tree/master/internal/datanode)
- [Milvus Write Path Analysis](https://milvus.io/docs/architecture_overview.md)
