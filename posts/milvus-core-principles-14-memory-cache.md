---
title: "Milvus底层原理（十四）：内存与缓存管理"
date: "2026-03-10"
excerpt: "深入理解 Milvus 的内存与缓存管理机制，掌握内存池设计、Chunk Cache、查询缓存策略和内存优化技巧，提升系统性能和资源利用率。"
tags: ["Milvus", "向量数据库", "内存管理", "缓存", "性能优化"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 14
---

## 前言

内存管理是高性能数据库系统的关键，直接影响查询延迟和系统吞吐。Milvus 通过内存池、Chunk Cache、查询缓存等多层缓存机制，实现了高效的内存利用和低延迟查询。理解内存与缓存管理对于系统调优和容量规划至关重要。

本文将深入分析 Milvus 的内存与缓存管理机制，包括内存池设计、Chunk Cache、查询缓存和内存优化策略。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 内存池设计 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Chunk Cache | ⭐⭐⭐ | 架构设计 | ✅ |
| 查询缓存 | ⭐⭐⭐ | 实战技能 | ✅ |
| LRU 淘汰策略 | ⭐⭐⭐ | 算法设计 | ✅ |
| 内存优化技巧 | ⭐⭐⭐ | 实战技能 | ✅ |

## 面试考点

1. Milvus 如何管理内存？
2. Chunk Cache 的作用是什么？
3. 查询缓存如何提高性能？
4. 内存淘汰策略是什么？
5. 如何优化内存使用？

## 一、内存管理概述

### 1.1 内存使用分布

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 内存使用分布                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Query Node 内存分布：                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │         向量数据 (最大部分)                       │   │   │
│  │  │         60-80%                                   │   │   │
│  │  │         • Segment 数据                           │   │   │
│  │  │         • 向量索引                               │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │         Chunk Cache                              │   │   │
│  │  │         10-20%                                   │   │   │
│  │  │         • 热数据缓存                             │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │         查询缓存                                 │   │   │
│  │  │         5-10%                                    │   │   │
│  │  │         • 查询结果缓存                           │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │         运行时开销                               │   │   │
│  │  │         5-10%                                    │   │   │
│  │  │         • Go 运行时                              │   │   │
│  │  │         • 执行计划                               │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 内存管理目标

```
┌─────────────────────────────────────────────────────────────────┐
│                    内存管理目标                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 低延迟：                                                     │
│  • 热数据常驻内存                                              │
│  • 减少磁盘访问                                                │
│  • 优化内存分配效率                                            │
│                                                                 │
│  2. 高利用率：                                                   │
│  • 充分利用可用内存                                            │
│  • 避免内存浪费                                                │
│  • 智能缓存策略                                                │
│                                                                 │
│  3. 稳定性：                                                     │
│  • 避免 OOM                                                    │
│  • 内存使用可预测                                              │
│  • 优雅降级                                                    │
│                                                                 │
│  4. 公平性：                                                     │
│  • 多 Collection 公平共享                                      │
│  • 避免热点问题                                                │
│  • 资源隔离                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、内存池设计

### 2.1 内存池架构

```go
// 内存池实现

type MemoryPool struct {
    totalSize    int64
    usedSize     int64
    reservedSize int64
    
    chunks      map[int64]*Chunk
    freeList    *FreeList
    
    mutex       sync.RWMutex
}

type Chunk struct {
    ID     int64
    Size   int64
    Data   []byte
    InUse  bool
}

// 分配内存
func (p *MemoryPool) Allocate(size int64) (*Chunk, error) {
    p.mutex.Lock()
    defer p.mutex.Unlock()
    
    // 检查是否有足够空间
    if p.usedSize+size > p.totalSize-p.reservedSize {
        // 尝试释放内存
        p.evict(size)
        
        if p.usedSize+size > p.totalSize-p.reservedSize {
            return nil, ErrOutOfMemory
        }
    }
    
    // 从空闲列表查找合适的块
    chunk := p.freeList.FindBestFit(size)
    if chunk != nil {
        chunk.InUse = true
        p.usedSize += chunk.Size
        return chunk, nil
    }
    
    // 分配新块
    chunk = &Chunk{
        ID:    p.nextID(),
        Size:  size,
        Data:  make([]byte, size),
        InUse: true,
    }
    
    p.chunks[chunk.ID] = chunk
    p.usedSize += size
    
    return chunk, nil
}

// 释放内存
func (p *MemoryPool) Free(chunk *Chunk) {
    p.mutex.Lock()
    defer p.mutex.Unlock()
    
    chunk.InUse = false
    p.usedSize -= chunk.Size
    
    // 加入空闲列表
    p.freeList.Add(chunk)
}

// 内存淘汰
func (p *MemoryPool) evict(requiredSize int64) {
    // 使用 LRU 策略淘汰
    evicted := int64(0)
    
    for evicted < requiredSize {
        victim := p.freeList.EvictLRU()
        if victim == nil {
            break
        }
        
        p.usedSize -= victim.Size
        evicted += victim.Size
        delete(p.chunks, victim.ID)
    }
}
```

### 2.2 内存限制配置

```yaml
# Milvus 内存配置

queryNode:
  # 内存限制
  memory:
    # 硬限制（超过则拒绝请求）
    hardLimit: 16GB
    # 软限制（超过则触发淘汰）
    softLimit: 12GB
    # 预留内存
    reserved: 2GB
    
  # Chunk Cache 配置
  cache:
    enabled: true
    size: 4GB
    evictionPolicy: lru
    
dataNode:
  # 内存限制
  memory:
    hardLimit: 8GB
    softLimit: 6GB
```

## 三、Chunk Cache

### 3.1 Chunk Cache 设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chunk Cache 架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Chunk Cache 缓存热数据，减少磁盘/网络访问                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Chunk Cache                          │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │            Cache Layers                         │   │   │
│  │  │                                                 │   │   │
│  │  │  Layer 1 (Hot): 最近访问的数据                  │   │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐          │   │   │
│  │  │  │ Chunk 1 │ │ Chunk 2 │ │ Chunk 3 │          │   │   │
│  │  │  │ (Pin)   │ │ (Pin)   │ │         │          │   │   │
│  │  │  └─────────┘ └─────────┘ └─────────┘          │   │   │
│  │  │                                                 │   │   │
│  │  │  Layer 2 (Warm): 较长时间未访问                 │   │   │
│  │  │  ┌─────────┐ ┌─────────┐                       │   │   │
│  │  │  │ Chunk 4 │ │ Chunk 5 │                       │   │   │
│  │  │  └─────────┘ └─────────┘                       │   │   │
│  │  │                                                 │   │   │
│  │  │  Layer 3 (Cold): 很长时间未访问，待淘汰        │   │   │
│  │  │  ┌─────────┐                                   │   │   │
│  │  │  │ Chunk 6 │                                   │   │   │
│  │  │  └─────────┘                                   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  元数据：                                                │   │
│  │  • 访问计数                                              │   │
│  │  • 最后访问时间                                          │   │
│  │  • 数据大小                                              │   │
│  │  • Pin 状态（是否被锁定）                               │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Chunk Cache 实现

```go
// Chunk Cache 实现

type ChunkCache struct {
    maxSize    int64
    usedSize   int64
    chunks     map[string]*CacheEntry
    lruList    *list.List
    
    mutex      sync.RWMutex
    stats      CacheStats
}

type CacheEntry struct {
    Key         string
    Data        []byte
    Size        int64
    AccessCount int64
    LastAccess  time.Time
    Pinned      bool
    
    lruElement  *list.Element
}

type CacheStats struct {
    Hits      int64
    Misses    int64
    Evictions int64
}

// 获取缓存
func (c *ChunkCache) Get(key string) ([]byte, bool) {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    entry, ok := c.chunks[key]
    if !ok {
        c.stats.Misses++
        return nil, false
    }
    
    // 更新访问信息
    entry.AccessCount++
    entry.LastAccess = time.Now()
    
    // 移动到 LRU 列表头部
    c.lruList.MoveToFront(entry.lruElement)
    
    c.stats.Hits++
    return entry.Data, true
}

// 设置缓存
func (c *ChunkCache) Set(key string, data []byte) error {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    size := int64(len(data))
    
    // 检查是否需要淘汰
    for c.usedSize+size > c.maxSize {
        if !c.evictOne() {
            return ErrCacheFull
        }
    }
    
    // 创建缓存条目
    entry := &CacheEntry{
        Key:        key,
        Data:       data,
        Size:       size,
        AccessCount: 1,
        LastAccess: time.Now(),
    }
    
    // 添加到缓存
    entry.lruElement = c.lruList.PushFront(key)
    c.chunks[key] = entry
    c.usedSize += size
    
    return nil
}

// LRU 淘汰
func (c *ChunkCache) evictOne() bool {
    // 从 LRU 列表尾部开始淘汰
    for c.lruList.Len() > 0 {
        element := c.lruList.Back()
        key := element.Value.(string)
        entry := c.chunks[key]
        
        // 跳过被 Pin 的条目
        if entry.Pinned {
            c.lruList.MoveToFront(element)
            continue
        }
        
        // 淘汰
        c.lruList.Remove(element)
        delete(c.chunks, key)
        c.usedSize -= entry.Size
        c.stats.Evictions++
        
        return true
    }
    
    return false
}

// Pin/Unpin
func (c *ChunkCache) Pin(key string) {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    if entry, ok := c.chunks[key]; ok {
        entry.Pinned = true
    }
}

func (c *ChunkCache) Unpin(key string) {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    if entry, ok := c.chunks[key]; ok {
        entry.Pinned = false
    }
}

// 命中率
func (c *ChunkCache) HitRate() float64 {
    c.mutex.RLock()
    defer c.mutex.RUnlock()
    
    total := c.stats.Hits + c.stats.Misses
    if total == 0 {
        return 0
    }
    return float64(c.stats.Hits) / float64(total)
}
```

## 四、查询缓存

### 4.1 查询缓存设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    查询缓存设计                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  缓存查询结果，避免重复计算                                      │
│                                                                 │
│  缓存 Key 构成：                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Key = hash(                                            │   │
│  │      collection_name,                                   │   │
│  │      query_vector,                                      │   │
│  │      search_params,                                     │   │
│  │      filter_expression,                                 │   │
│  │      timestamp                                          │   │
│  │  )                                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  缓存失效条件：                                                  │
│  • 数据写入/删除                                               │
│  • 索引重建                                                    │
│  • 时间戳变化                                                  │
│  • TTL 过期                                                    │
│                                                                 │
│  适用场景：                                                      │
│  • 相同查询频繁（如热门搜索）                                  │
│  • 数据更新不频繁                                              │
│  • 查询延迟要求高                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 查询缓存实现

```go
// 查询缓存实现

type QueryCache struct {
    maxSize   int64
    usedSize  int64
    entries   map[string]*QueryCacheEntry
    lruList   *list.List
    
    ttl       time.Duration
    
    mutex     sync.RWMutex
}

type QueryCacheEntry struct {
    Key        string
    Result     *SearchResult
    Size       int64
    CreatedAt  time.Time
    ExpiresAt  time.Time
    
    lruElement *list.Element
}

type QueryCacheKey struct {
    CollectionName string
    QueryVector    []float32
    SearchParams   SearchParams
    FilterExpr     string
    Timestamp      uint64
}

// 生成缓存 Key
func (c *QueryCache) generateKey(k *QueryCacheKey) string {
    h := sha256.New()
    h.Write([]byte(k.CollectionName))
    h.Write(binary.LittleEndian.AppendUint32(nil, uint32(len(k.QueryVector))))
    for _, v := range k.QueryVector {
        binary.Write(h, binary.LittleEndian, v)
    }
    h.Write([]byte(k.FilterExpr))
    binary.Write(h, binary.LittleEndian, k.Timestamp)
    
    return hex.EncodeToString(h.Sum(nil))
}

// 查询缓存
func (c *QueryCache) Get(key string) (*SearchResult, bool) {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    entry, ok := c.entries[key]
    if !ok {
        return nil, false
    }
    
    // 检查是否过期
    if time.Now().After(entry.ExpiresAt) {
        c.removeEntry(entry)
        return nil, false
    }
    
    // 更新 LRU
    c.lruList.MoveToFront(entry.lruElement)
    
    return entry.Result, true
}

// 设置缓存
func (c *QueryCache) Set(key string, result *SearchResult) error {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    // 估算结果大小
    size := c.estimateSize(result)
    
    // 淘汰直到有足够空间
    for c.usedSize+size > c.maxSize {
        if !c.evictOne() {
            return ErrCacheFull
        }
    }
    
    entry := &QueryCacheEntry{
        Key:       key,
        Result:    result,
        Size:      size,
        CreatedAt: time.Now(),
        ExpiresAt: time.Now().Add(c.ttl),
    }
    
    entry.lruElement = c.lruList.PushFront(key)
    c.entries[key] = entry
    c.usedSize += size
    
    return nil
}

// 数据更新时失效缓存
func (c *QueryCache) InvalidateCollection(collectionName string) {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    for key, entry := range c.entries {
        if strings.HasPrefix(key, collectionName) {
            c.removeEntry(entry)
            delete(c.entries, key)
        }
    }
}
```

## 五、内存优化策略

### 5.1 数据压缩

```
┌─────────────────────────────────────────────────────────────────┐
│                    数据压缩策略                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 向量压缩                                                    │
│  • PQ 量化：压缩比 16-32x                                      │
│  • SQ8 量化：压缩比 4x                                         │
│  • 适用于内存受限场景                                          │
│                                                                 │
│  2. 标量压缩                                                    │
│  • 字典编码：VARCHAR 类型                                       │
│  • 位打包：整数类型                                            │
│  • RLE：重复值                                                 │
│                                                                 │
│  3. 冷热分离                                                    │
│  • 热数据：内存中，无压缩                                      │
│  • 温数据：内存中，压缩存储                                    │
│  • 冷数据：磁盘，高压缩比                                      │
│                                                                 │
│  示例：                                                          │
│  原始向量：768 维 × 4 bytes = 3072 bytes                       │
│  PQ(M=32)：32 bytes → 压缩比 96x                               │
│  SQ8：768 bytes → 压缩比 4x                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 内存监控

```go
// 内存监控

type MemoryMonitor struct {
    interval time.Duration
    alerts   chan MemoryAlert
}

type MemoryAlert struct {
    Type      AlertType
    Usage     float64
    Timestamp time.Time
}

func (m *MemoryMonitor) Start() {
    ticker := time.NewTicker(m.interval)
    
    for range ticker.C {
        m.check()
    }
}

func (m *MemoryMonitor) check() {
    var memStats runtime.MemStats
    runtime.ReadMemStats(&memStats)
    
    usedMB := memStats.Alloc / 1024 / 1024
    totalMB := memStats.Sys / 1024 / 1024
    usage := float64(usedMB) / float64(totalMB)
    
    // 警告阈值
    if usage > 0.9 {
        m.alerts <- MemoryAlert{
            Type:      AlertCritical,
            Usage:     usage,
            Timestamp: time.Now(),
        }
    } else if usage > 0.8 {
        m.alerts <- MemoryAlert{
            Type:      AlertWarning,
            Usage:     usage,
            Timestamp: time.Now(),
        }
    }
    
    // 记录指标
    metrics.RecordMemoryUsage(usedMB, totalMB)
}
```

### 5.3 内存优化配置

```yaml
# 内存优化配置

queryNode:
  # 内存管理
  memory:
    # 启用内存限制
    enableMemoryLimit: true
    # 最大内存使用比例
    maxMemoryUsageRatio: 0.8
    
  # Chunk Cache
  cache:
    enabled: true
    size: 4GB
    evictionPolicy: lru
    # Pin 策略：最近访问的数据
    pinStrategy: recent
    
  # 查询缓存
  queryCache:
    enabled: true
    size: 1GB
    ttl: 300s
    
  # Segment 加载策略
  segment:
    # 预加载热点 Segment
    preloadHot: true
    # 懒加载
    lazyLoad: true
```

## 总结

本文深入分析了 Milvus 的内存与缓存管理机制，包括：

1. **内存管理概述**：内存分布、管理目标
2. **内存池设计**：分配、释放、淘汰机制
3. **Chunk Cache**：架构设计、实现细节
4. **查询缓存**：缓存策略、失效机制
5. **内存优化策略**：压缩、监控、配置

下一章将深入分析生产环境实践。

## 参考资料

- [Milvus Memory Management](https://milvus.io/docs/performance_faq.md)
- [Milvus Cache Configuration](https://milvus.io/docs/configure_querynode.md)
- [Go Memory Model](https://go.dev/ref/mem)
