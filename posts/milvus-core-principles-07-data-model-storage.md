---
title: "Milvus底层原理（七）：数据模型与存储"
date: "2026-03-10"
excerpt: "深入理解 Milvus 的数据模型设计，掌握 Collection、Partition、Segment 的层次结构，了解列式存储格式和 Schema 设计原则。"
tags: ["Milvus", "向量数据库", "数据模型", "存储", "架构设计"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 7
---

## 前言

数据模型是数据库系统的核心基础，决定了数据的组织方式、访问模式和存储效率。Milvus 作为云原生向量数据库，采用了层次化的数据模型设计，通过 Collection、Partition、Segment 三层结构实现数据的灵活管理和高效存储。

本文将深入分析 Milvus 的数据模型设计，包括层次结构、列式存储格式、Schema 设计原则和存储优化策略。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 层次化数据模型 | ⭐⭐⭐ | 架构设计 | ✅ |
| Segment 生命周期 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 列式存储原理 | ⭐⭐⭐ | 高频考点 | ✅ |
| Schema 设计 | ⭐⭐⭐ | 实战技能 | ✅ |
| 数据管理策略 | ⭐⭐⭐ | 实战技能 | ✅ |

## 面试考点

1. Milvus 的数据模型层次结构是什么？
2. Segment 的生命周期是怎样的？
3. 列式存储有什么优势？
4. 如何设计高效的 Schema？
5. Partition 和 Segment 有什么区别？

## 一、数据模型层次结构

### 1.1 三层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 数据模型层次                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Level 1: Collection (集合)                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  类似关系数据库的表                                      │   │
│  │  • 定义 Schema（字段类型、维度等）                      │   │
│  │  • 可以包含多个 Partition                               │   │
│  │  • 一个 Collection 对应一个向量列                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  Level 2: Partition (分区)                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Collection 的逻辑分区                                   │   │
│  │  • 按业务维度划分数据                                   │   │
│  │  • 提高搜索效率（只搜索相关分区）                       │   │
│  │  • 包含多个 Segment                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  Level 3: Segment (段)                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  数据存储的最小单元                                      │   │
│  │  • 列式存储格式                                         │   │
│  │  • 独立构建索引                                         │   │
│  │  • 是数据加载/卸载的基本单位                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Collection 设计

```python
from pymilvus import CollectionSchema, FieldSchema, DataType, Collection

# 定义 Schema
schema = CollectionSchema(
    fields=[
        # 主键字段
        FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=False),
        
        # 向量字段
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=768),
        
        # 标量字段
        FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=512),
        FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=65535),
        FieldSchema(name="category", dtype=DataType.INT32),
        FieldSchema(name="created_at", dtype=DataType.INT64),
        
        # 动态字段（2.3+ 支持）
        # FieldSchema(name="metadata", dtype=DataType.JSON),
    ],
    description="文档向量集合",
    enable_dynamic_field=True
)

# 创建 Collection
collection = Collection(name="documents", schema=schema)
```

### 1.3 Partition 策略

```
┌─────────────────────────────────────────────────────────────────┐
│                    Partition 设计策略                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  策略 1：按时间分区                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Collection: logs                                        │   │
│  │  ├── Partition: logs_2024_01                            │   │
│  │  ├── Partition: logs_2024_02                            │   │
│  │  └── Partition: logs_2024_03                            │   │
│  │                                                         │   │
│  │  优势：便于数据过期清理，查询时间范围明确               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  策略 2：按业务分区                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Collection: products                                    │   │
│  │  ├── Partition: electronics                             │   │
│  │  ├── Partition: clothing                                │   │
│  │  └── Partition: books                                   │   │
│  │                                                         │   │
│  │  优势：搜索时可限定分区，提高效率                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  策略 3：按用户/租户分区                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Collection: user_embeddings                             │   │
│  │  ├── Partition: user_001                                │   │
│  │  ├── Partition: user_002                                │   │
│  │  └── ...                                                │   │
│  │                                                         │   │
│  │  优势：多租户数据隔离                                   │   │
│  │  注意：Partition 数量有限制（默认 4096）                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```python
# 创建 Partition
collection.create_partition("logs_2024_01")
collection.create_partition("logs_2024_02")

# 指定 Partition 插入数据
collection.insert(data, partition_name="logs_2024_01")

# 指定 Partition 搜索
collection.search(
    data=[query],
    anns_field="embedding",
    param=search_params,
    limit=10,
    partition_names=["logs_2024_01"]  # 只搜索指定分区
)
```

## 二、Segment 详解

### 2.1 Segment 类型

```
┌─────────────────────────────────────────────────────────────────┐
│                    Segment 类型                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Growing Segment (增长段)                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 新写入的数据首先进入 Growing Segment                │   │
│  │  • 存储在内存中                                         │   │
│  │  • 可以追加写入                                         │   │
│  │  • 达到阈值后转换为 Sealed Segment                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  2. Sealed Segment (密封段)                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • Growing Segment 达到阈值后密封                       │   │
│  │  • 不再接受新写入                                       │   │
│  │  • 构建索引后持久化到对象存储                           │   │
│  │  • 可以被加载到内存进行查询                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  转换触发条件：                                                  │
│  • 行数达到 segment.maxRow (默认 1024*1024)                    │
│  • 创建时间超过 segment.maxLife (默认 10分钟)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Segment 生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                    Segment 生命周期                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│     数据写入                                                    │
│        │                                                        │
│        ▼                                                        │
│  ┌───────────┐     达到阈值      ┌───────────┐                │
│  │  Growing  │ ───────────────► │  Sealed    │                │
│  │  (内存)   │                   │  (持久化)  │                │
│  └───────────┘                   └─────┬─────┘                │
│       │                                │                       │
│       │ 可直接查询                     │ 构建索引              │
│       │                                ▼                       │
│       │                          ┌───────────┐                │
│       │                          │  Indexed  │                │
│       │                          │  Segment  │                │
│       │                          └─────┬─────┘                │
│       │                                │                       │
│       ▼                                ▼                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    查询执行                              │  │
│  │  • 合并 Growing 和 Sealed Segment 的结果               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                        │                       │
│                                        ▼                       │
│                                  ┌───────────┐                │
│                                  │   删除    │                │
│                                  │  (Compaction)│             │
│                                  └───────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Segment 内部结构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Segment 内部结构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Segment = 多个 Column (列) + 元数据                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Column Storage                       │   │
│  │                                                         │   │
│  │  Column "id" (INT64):                                  │   │
│  │  ┌───┬───┬───┬───┬───┬───────┐                        │   │
│  │  │ 1 │ 2 │ 3 │ 4 │ 5 │  ...  │  (连续存储)             │   │
│  │  └───┴───┴───┴───┴───┴───────┘                        │   │
│  │                                                         │   │
│  │  Column "embedding" (FLOAT_VECTOR, dim=768):           │   │
│  │  ┌─────────┬─────────┬─────────┬─────────┐            │   │
│  │  │ vec[0]  │ vec[1]  │ vec[2]  │  ...    │            │   │
│  │  └─────────┴─────────┴─────────┴─────────┘            │   │
│  │                                                         │   │
│  │  Column "title" (VARCHAR):                             │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │ offset table │ data (变长字符串)                │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  元数据：                                                        │
│  • Segment ID                                                  │
│  • 行数                                                         │
│  • 所属 Partition                                              │
│  • 创建时间                                                     │
│  • 索引信息                                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 三、列式存储原理

### 3.1 行式 vs 列式存储

```
┌─────────────────────────────────────────────────────────────────┐
│                    行式 vs 列式存储                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  行式存储：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Row 1: [id, embedding, title, category, ...]           │   │
│  │ Row 2: [id, embedding, title, category, ...]           │   │
│  │ Row 3: [id, embedding, title, category, ...]           │   │
│  └─────────────────────────────────────────────────────────┘   │
│  优点：单行读取高效                                            │
│  缺点：列分析需要读取大量无关数据                              │
│                                                                 │
│  列式存储：                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Column "id":          [1, 2, 3, ...]                   │   │
│  │ Column "embedding":   [vec1, vec2, vec3, ...]          │   │
│  │ Column "title":       ["a", "b", "c", ...]             │   │
│  │ Column "category":    [1, 2, 1, ...]                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  优点：                                                         │
│  • 列分析高效（只读需要的列）                                   │
│  • 同类数据压缩比高                                            │
│  • 向量化处理友好                                              │
│  缺点：单行读取需要多次 IO                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 为什么向量数据库选择列式存储

```
┌─────────────────────────────────────────────────────────────────┐
│                    向量数据库列式存储优势                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 向量搜索只访问向量列                                        │
│  • 不需要加载其他标量字段                                      │
│  • 减少 IO 和内存占用                                          │
│                                                                 │
│  2. 向量数据高压缩比                                            │
│  • 同一维度的数据相似性高                                      │
│  • 可使用专用压缩算法                                          │
│                                                                 │
│  3. 标量过滤高效                                                │
│  • 标量过滤先于向量搜索                                        │
│  • 只需读取过滤列                                              │
│                                                                 │
│  4. 索引构建高效                                                │
│  • 向量列独立构建索引                                          │
│  • 不影响其他列                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 数据类型与存储

```python
# Milvus 支持的数据类型

# 数值类型
DataType.BOOL        # 1 byte
DataType.INT8        # 1 byte
DataType.INT16       # 2 bytes
DataType.INT32       # 4 bytes
DataType.INT64       # 8 bytes
DataType.FLOAT       # 4 bytes
DataType.DOUBLE      # 8 bytes

# 字符串类型
DataType.VARCHAR     # 变长，最大 65535 bytes

# 向量类型
DataType.FLOAT_VECTOR      # float32 数组
DataType.BINARY_VECTOR     # binary vector (位向量)
DataType.FLOAT16_VECTOR    # float16 (2.3+)
DataType.BFLOAT16_VECTOR   # bfloat16 (2.3+)
DataType.SPARSE_FLOAT_VECTOR  # 稀疏向量 (2.4+)

# JSON 类型 (2.3+)
DataType.JSON        # JSON 文档

# 数组类型 (2.3+)
DataType.ARRAY       # 数组类型
```

## 四、Schema 设计原则

### 4.1 主键设计

```python
# 方式 1：自增主键
FieldSchema(
    name="id",
    dtype=DataType.INT64,
    is_primary=True,
    auto_id=True  # 自动生成
)

# 方式 2：自定义主键
FieldSchema(
    name="id",
    dtype=DataType.INT64,
    is_primary=True,
    auto_id=False  # 需要手动指定
)

# 方式 3：字符串主键
FieldSchema(
    name="doc_id",
    dtype=DataType.VARCHAR,
    max_length=64,
    is_primary=True,
    auto_id=False
)
```

### 4.2 向量字段设计

```python
# 标准 float 向量
FieldSchema(
    name="embedding",
    dtype=DataType.FLOAT_VECTOR,
    dim=768
)

# Binary 向量（适用于 Hamming 距离）
FieldSchema(
    name="binary_embedding",
    dtype=DataType.BINARY_VECTOR,
    dim=256  # 必须是 8 的倍数
)

# 稀疏向量（适用于 BM25 等）
FieldSchema(
    name="sparse_embedding",
    dtype=DataType.SPARSE_FLOAT_VECTOR
)
```

### 4.3 标量字段设计

```python
# 字符串字段
FieldSchema(
    name="title",
    dtype=DataType.VARCHAR,
    max_length=512  # 根据实际需求设置
)

# JSON 字段（灵活扩展）
FieldSchema(
    name="metadata",
    dtype=DataType.JSON
)

# 数组字段
FieldSchema(
    name="tags",
    dtype=DataType.ARRAY,
    element_type=DataType.VARCHAR,
    max_capacity=100,
    max_length=64
)
```

### 4.4 最佳实践

```
┌─────────────────────────────────────────────────────────────────┐
│                    Schema 设计最佳实践                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 主键选择                                                    │
│  • 使用业务唯一标识作为主键                                    │
│  • 避免使用 auto_id 除非不需要关联                             │
│                                                                 │
│  2. 向量维度                                                    │
│  • 根据嵌入模型确定（如 768, 1536）                            │
│  • 不要盲目增加维度                                            │
│                                                                 │
│  3. VARCHAR 长度                                                │
│  • 根据实际最大长度设置                                        │
│  • 过大浪费存储，过小截断数据                                  │
│                                                                 │
│  4. 动态字段                                                    │
│  • 适合不确定字段结构的场景                                    │
│  • 会增加存储和查询开销                                        │
│                                                                 │
│  5. Partition 键                                                │
│  • 选择查询常用的过滤字段                                      │
│  • 时间、类别、用户 ID 等                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 五、数据管理操作

### 5.1 数据插入

```python
# 批量插入
import numpy as np

# 准备数据
data = [
    np.arange(1000),  # id
    np.random.randn(1000, 768).astype(np.float32),  # embedding
    ["title_" + str(i) for i in range(1000)],  # title
    np.random.randint(0, 10, 1000),  # category
]

# 插入
insert_result = collection.insert(data)
print(f"插入 {len(insert_result.primary_keys)} 条数据")
```

### 5.2 数据删除

```python
# 按主键删除
collection.delete("id in [1, 2, 3]")

# 按条件删除
collection.delete("category == 5")

# 删除整个 Partition
collection.drop_partition("old_partition")
```

### 5.3 数据更新

```python
# Milvus 不支持原地更新，需要先删除再插入
# 或者使用 upsert（2.3+）

# 方式 1：delete + insert
collection.delete("id == 1")
collection.insert([new_data])

# 方式 2：upsert
collection.upsert([new_data])  # 如果存在则更新，不存在则插入
```

### 5.4 Compaction（压缩）

```python
# 手动触发压缩
collection.compact()

# 等待压缩完成
import time
while collection.get_compaction_state() != "completed":
    time.sleep(1)
```

## 六、存储优化

### 6.1 数据压缩

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 数据压缩                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  向量压缩：                                                      │
│  • PQ 量化：将向量压缩为编码                                    │
│  • 压缩比：16-32x                                              │
│  • 代价：召回率下降 5-10%                                      │
│                                                                 │
│  标量压缩：                                                      │
│  • 字典编码：VARCHAR 类型                                       │
│  • 位压缩：整数类型                                             │
│  • RLE：重复值压缩                                             │
│                                                                 │
│  压缩策略：                                                      │
│  • 热数据：不压缩，保持高性能                                  │
│  • 冷数据：高压缩比，降低存储成本                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 分片策略

```python
# 按 Partition 分片
def insert_with_partition(data, date_key):
    partition_name = f"logs_{date_key}"
    
    # 创建 Partition（如果不存在）
    if not collection.has_partition(partition_name):
        collection.create_partition(partition_name)
    
    # 插入数据
    collection.insert(data, partition_name=partition_name)

# 按 Hash 分片（客户端实现）
def get_partition_by_id(id, num_partitions):
    return f"shard_{hash(id) % num_partitions}"
```

## 总结

本文深入分析了 Milvus 的数据模型与存储设计，包括：

1. **数据模型层次**：Collection → Partition → Segment
2. **Segment 生命周期**：Growing → Sealed → Indexed
3. **列式存储**：优势与实现
4. **Schema 设计**：主键、向量、标量字段设计原则
5. **数据管理**：插入、删除、更新、压缩操作

下一章将深入分析 Milvus 的数据写入流程。

## 参考资料

- [Milvus Data Model Documentation](https://milvus.io/docs/data_model.md)
- [Milvus Schema Documentation](https://milvus.io/docs/schema.md)
- [Milvus Partition Documentation](https://milvus.io/docs/partition_key.md)
