---
title: "Milvus底层原理（五）：DiskANN磁盘索引"
date: "2026-03-10"
excerpt: "深入理解 DiskANN 磁盘索引的设计原理，掌握 Vamana 图算法、磁盘友好存储布局和混合查询策略，解决超大规模向量数据的存储与检索问题。"
tags: ["Milvus", "向量数据库", "DiskANN", "磁盘索引", "ANN"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 5
---

## 前言

随着向量数据规模从百万级增长到十亿级，纯内存索引面临巨大的成本压力。DiskANN（Disk-based Approximate Nearest Neighbor）是一种专门为磁盘存储优化的向量索引，通过精心设计的存储布局和搜索策略，在保持高召回率的同时大幅降低内存需求，是处理超大规模向量数据的理想选择。

本文将深入分析 DiskANN 的核心原理，包括 Vamana 图算法、磁盘友好的存储布局、混合查询策略和性能优化方法。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Vamana 图算法 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 磁盘友好布局 | ⭐⭐⭐⭐ | 架构设计 | ✅ |
| PQ + 图混合索引 | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| 搜索策略优化 | ⭐⭐⭐ | 实战技能 | ✅ |
| Milvus DiskANN 实现 | ⭐⭐⭐⭐ | 源码级 | ✅ |

## 面试考点

1. DiskANN 解决了什么问题？
2. Vamana 图算法与 HNSW 有什么区别？
3. DiskANN 如何实现磁盘友好的存储布局？
4. DiskANN 的搜索流程是怎样的？
5. DiskANN 适用于什么场景？

## 一、磁盘索引的挑战

### 1.1 内存索引的局限

```
┌─────────────────────────────────────────────────────────────────┐
│                    内存索引的成本挑战                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  示例：10 亿向量，768 维                                        │
│                                                                 │
│  原始向量存储：                                                  │
│  10亿 × 768 × 4 bytes = 2.86 TB                                │
│                                                                 │
│  HNSW 索引内存（M=16）：                                        │
│  向量：2.86 TB                                                  │
│  图结构：10亿 × 16 × 4 × 2 = 128 GB                            │
│  总计：~3 TB 内存                                               │
│                                                                 │
│  成本估算（云服务器内存约 $10/GB/月）：                          │
│  3 TB × $10 = $30,000/月                                       │
│                                                                 │
│  解决方案：将数据存储在磁盘，仅保留少量热数据在内存              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 磁盘访问的特性

```
┌─────────────────────────────────────────────────────────────────┐
│                    磁盘 vs 内存性能对比                          │
├───────────────────┬─────────────────────────────────────────────┤
│ 特性              │ 内存 (RAM)      │ SSD            │ HDD      │
├───────────────────┼─────────────────────────────────────────────┤
│ 随机读取延迟      │ ~100 ns        │ ~100 μs       │ ~10 ms   │
│ 顺序读取带宽      │ ~20 GB/s       │ ~3 GB/s       │ ~200 MB/s│
│ 随机 IOPS         │ 极高           │ ~100K         │ ~100     │
│ 成本/GB           │ ~$10           │ ~$0.1         │ ~$0.03   │
└───────────────────┴─────────────────────────────────────────────┘
│                                                                 │
│  关键洞察：                                                      │
│  • 随机访问：磁盘比内存慢 1000-100000 倍                        │
│  • 顺序访问：差距小得多，SSD 可达 3 GB/s                        │
│  • 设计原则：最大化顺序读取，最小化随机访问                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 DiskANN 的设计目标

```
┌─────────────────────────────────────────────────────────────────┐
│                    DiskANN 设计目标                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 低内存占用                                                   │
│     • 仅存储 PQ 编码和图结构在内存                              │
│     • 原始向量存储在磁盘                                        │
│     • 内存占用 < 原始数据的 5%                                  │
│                                                                 │
│  2. 高查询性能                                                   │
│     • 利用磁盘顺序读取高带宽                                    │
│     • 限制随机磁盘访问次数                                      │
│     • 延迟 < 10ms @ 95% 召回率                                  │
│                                                                 │
│  3. 高召回率                                                     │
│     • 使用 Vamana 图保证图质量                                  │
│     • 召回率 > 95%                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、Vamana 图算法

### 2.1 算法概述

Vamana 是 DiskANN 的核心图构建算法，与 HNSW 的关键区别是：先构建图，再优化布局。

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vamana 算法流程                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  输入：向量集 V，最大度数 R，搜索宽度 L，剪枝阈值 α              │
│                                                                 │
│  步骤 1：初始化                                                  │
│  • 计算所有向量的中心点作为入口                                 │
│  • 初始化随机图结构                                             │
│                                                                 │
│  步骤 2：图构建                                                  │
│  • 随机排列向量顺序                                             │
│  • 对每个向量 v：                                               │
│    - 从入口点搜索 v 的最近邻                                    │
│    - 将 v 连接到搜索路径上的节点                                │
│                                                                 │
│  步骤 3：图优化（多次迭代）                                      │
│  • 对每个节点：                                                 │
│    - 使用贪心搜索找到最优邻居                                   │
│    - 应用剪枝策略限制度数                                       │
│                                                                 │
│  输出：优化后的图结构                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 剪枝策略

Vamana 使用 α 参数控制剪枝强度：

```python
def robust_prune(node: int, candidates: list, R: int, alpha: float) -> list:
    """
    Robust Prune 剪枝策略
    
    Args:
        node: 当前节点
        candidates: 候选邻居列表 [(distance, neighbor_id), ...]
        R: 最大邻居数
        alpha: 剪枝参数（通常为 1.2）
    
    Returns:
        selected: 选中的邻居列表
    """
    if len(candidates) <= R:
        return [c[1] for c in candidates]
    
    selected = []
    candidates = sorted(candidates)  # 按距离排序
    
    while candidates and len(selected) < R:
        # 选择最近的候选
        _, nearest = candidates[0]
        selected.append(nearest)
        candidates = candidates[1:]
        
        # 剪枝：移除被"遮挡"的候选
        new_candidates = []
        for dist, cand in candidates:
            # 计算 nearest 到 cand 的距离
            cand_dist = distance(vectors[nearest], vectors[cand])
            
            # 如果 nearest 到 cand 的距离 < alpha × (node 到 cand 的距离)
            # 则 cand 被 nearest 遮挡，移除
            if cand_dist >= alpha * dist:
                new_candidates.append((dist, cand))
        
        candidates = new_candidates
    
    return selected
```

### 2.3 Vamana vs HNSW

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vamana vs HNSW 对比                           │
├───────────────────┬─────────────────────────────────────────────┤
│ 特性              │ Vamana              │ HNSW                  │
├───────────────────┼─────────────────────────────────────────────┤
│ 图结构            │ 单层图              │ 多层图                │
│ 构建策略          │ 先建图再优化        │ 增量构建              │
│ 剪枝方法          │ Robust Prune        │ 简单距离排序          │
│ 构建复杂度        │ 较高（需多次迭代）  │ 较低                  │
│ 图质量            │ 更优                │ 较优                  │
│ 磁盘友好性        │ 专门优化            │ 未专门优化            │
│ 增量更新          │ 困难                │ 容易                  │
└───────────────────┴─────────────────────────────────────────────┘
```

## 三、磁盘友好存储布局

### 3.1 关键洞察

磁盘访问的成本取决于访问模式，DiskANN 的关键创新是将图遍历转化为顺序读取：

```
┌─────────────────────────────────────────────────────────────────┐
│                    DiskANN 存储布局洞察                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  传统图索引存储（随机访问）：                                    │
│  节点 1 → 节点 5 → 节点 2 → 节点 8 → ...                       │
│  每次跳转需要一次随机磁盘访问                                   │
│  延迟 = 跳转次数 × 随机访问延迟 = O(log N) × 100μs             │
│                                                                 │
│  DiskANN 存储（顺序访问）：                                      │
│  将图节点按搜索路径排序                                         │
│  节点 1, 节点 5, 节点 2, 节点 8, ... 连续存储                   │
│  跳转变为顺序读取                                               │
│  延迟 = 顺序读取时间 << 随机访问时间                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 存储布局设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    DiskANN 存储布局                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    磁盘存储（原始向量）                  │   │
│  │                                                         │   │
│  │  Sector 0: [Vector 0, Vector 1, ..., Vector k-1]       │   │
│  │  Sector 1: [Vector k, Vector k+1, ...]                 │   │
│  │  ...                                                    │   │
│  │                                                         │   │
│  │  特点：                                                  │   │
│  │  • 向量按搜索路径顺序排列                               │   │
│  │  • 一个磁盘扇区包含多个向量                             │   │
│  │  • 搜索时顺序读取                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    内存存储（索引结构）                  │   │
│  │                                                         │   │
│  │  1. PQ 编码：N × M bytes (高度压缩)                     │   │
│  │  2. 图邻接表：N × R × 4 bytes (R=最大度数)              │   │
│  │  3. 位置映射：节点ID → 磁盘位置                         │   │
│  │                                                         │   │
│  │  示例：N=10亿, D=768, M=32, R=64                        │   │
│  │  PQ 编码：10亿 × 32 = 32 GB                             │   │
│  │  图邻接表：10亿 × 64 × 4 = 256 GB (可压缩)              │   │
│  │  总计：~50 GB (压缩后)                                  │   │
│  │                                                         │   │
│  │  压缩比：2.86 TB → 50 GB ≈ 57x                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 节点重排序

DiskANN 通过节点重排序实现顺序读取优化：

```python
def reorder_nodes(graph, vectors, entry_point):
    """
    节点重排序：按 BFS 顺序重新排列节点
    
    目的：使得图遍历时的访问模式接近顺序读取
    """
    # BFS 遍历图
    visited = set()
    queue = [entry_point]
    new_order = []
    
    while queue:
        node = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        new_order.append(node)
        
        # 添加邻居到队列
        for neighbor in graph.get_neighbors(node):
            if neighbor not in visited:
                queue.append(neighbor)
    
    # 创建映射：旧ID -> 新ID
    old_to_new = {old: new for new, old in enumerate(new_order)}
    
    # 重排向量和图结构
    new_vectors = [vectors[old] for old in new_order]
    new_graph = remap_graph(graph, old_to_new)
    
    return new_vectors, new_graph, old_to_new
```

## 四、混合查询策略

### 4.1 两阶段搜索

DiskANN 使用内存 PQ 编码 + 磁盘原始向量的混合查询策略：

```
┌─────────────────────────────────────────────────────────────────┐
│                    DiskANN 搜索流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  阶段 1：内存中快速过滤（PQ 距离表）                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 使用 PQ 编码计算近似距离                             │   │
│  │  • 在图上进行贪心搜索                                   │   │
│  │  • 获取 L 个候选结果                                    │   │
│  │  • 时间复杂度：O(L) 次内存访问                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  阶段 2：磁盘精确验证（原始向量）                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  • 读取 L 个候选的原始向量（顺序读取）                  │   │
│  │  • 计算精确距离                                         │   │
│  │  • 返回 Top-K 结果                                      │   │
│  │  • 时间复杂度：O(L/D_per_sector) 次磁盘读取             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  关键参数：                                                      │
│  • L (搜索宽度)：控制召回率与延迟的权衡                        │
│  • L 越大 → 召回率越高，延迟越高                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 实现代码

```python
import numpy as np

class DiskANNIndex:
    """DiskANN 索引实现"""
    
    def __init__(
        self,
        d: int,
        R: int = 64,
        L: int = 100,
        alpha: float = 1.2,
        pq_m: int = 32
    ):
        """
        Args:
            d: 向量维度
            R: 图最大度数
            L: 搜索宽度
            alpha: Vamana 剪枝参数
            pq_m: PQ 子向量数
        """
        self.d = d
        self.R = R
        self.L = L
        self.alpha = alpha
        self.pq_m = pq_m
        
        # 内存结构
        self.pq_codes = None      # (N, pq_m) uint8
        self.pq_centroids = None  # (pq_m, 256, d/pq_m)
        self.graph = None         # 邻接表
        self.entry_point = None
        
        # 磁盘映射
        self.disk_offsets = None  # 节点ID → 磁盘偏移
        self.disk_file = None
    
    def build(self, vectors: np.ndarray, disk_path: str):
        """
        构建索引
        
        Args:
            vectors: (N, D) 向量数据
            disk_path: 磁盘存储路径
        """
        n = vectors.shape[0]
        
        # Step 1: 训练 PQ
        self._train_pq(vectors)
        
        # Step 2: 构建 Vamana 图
        self._build_vamana_graph(vectors)
        
        # Step 3: 节点重排序
        vectors, self.graph, mapping = self._reorder_nodes(vectors)
        
        # Step 4: 存储到磁盘
        self._save_to_disk(vectors, disk_path)
    
    def search(self, query: np.ndarray, k: int, L: int = None) -> list:
        """
        搜索
        
        Args:
            query: (D,) 查询向量
            k: 返回数量
            L: 搜索宽度
        
        Returns:
            results: [(node_id, distance), ...]
        """
        L = L or self.L
        
        # 阶段 1：内存 PQ 搜索
        candidates = self._pq_search(query, L)
        
        # 阶段 2：磁盘精确验证
        results = self._verify_from_disk(query, candidates, k)
        
        return results
    
    def _train_pq(self, vectors: np.ndarray):
        """训练 PQ 码本"""
        n, d = vectors.shape
        sub_dim = d // self.pq_m
        
        self.pq_centroids = np.zeros((self.pq_m, 256, sub_dim), dtype=np.float32)
        self.pq_codes = np.zeros((n, self.pq_m), dtype=np.uint8)
        
        for m in range(self.pq_m):
            sub_vectors = vectors[:, m * sub_dim:(m + 1) * sub_dim]
            # K-Means 聚类
            centroids, labels = self._kmeans(sub_vectors, 256)
            self.pq_centroids[m] = centroids
            self.pq_codes[:, m] = labels
    
    def _pq_search(self, query: np.ndarray, L: int) -> list:
        """使用 PQ 在内存中进行图搜索"""
        # 构建距离表
        distance_table = self._build_distance_table(query)
        
        # 图遍历
        visited = set()
        candidates = [(0, self.entry_point)]
        results = []
        
        while candidates and len(results) < L:
            _, current = candidates.pop(0)
            
            if current in visited:
                continue
            visited.add(current)
            
            # 计算 PQ 距离
            dist = self._pq_distance(current, distance_table)
            results.append((dist, current))
            
            # 探索邻居
            for neighbor in self.graph[current]:
                if neighbor not in visited:
                    cand_dist = self._pq_distance(neighbor, distance_table)
                    candidates.append((cand_dist, neighbor))
            
            candidates.sort()
        
        return sorted(results)[:L]
    
    def _build_distance_table(self, query: np.ndarray) -> np.ndarray:
        """构建 PQ 距离表"""
        sub_dim = self.d // self.pq_m
        table = np.zeros((self.pq_m, 256), dtype=np.float32)
        
        for m in range(self.pq_m):
            sub_query = query[m * sub_dim:(m + 1) * sub_dim]
            diff = self.pq_centroids[m] - sub_query
            table[m] = np.sum(diff ** 2, axis=1)
        
        return table
    
    def _pq_distance(self, node_id: int, distance_table: np.ndarray) -> float:
        """使用距离表计算 PQ 近似距离"""
        codes = self.pq_codes[node_id]
        return np.sqrt(sum(distance_table[m, codes[m]] for m in range(self.pq_m)))
    
    def _verify_from_disk(self, query: np.ndarray, candidates: list, k: int) -> list:
        """从磁盘读取原始向量并验证"""
        # 收集候选节点ID
        node_ids = [node_id for _, node_id in candidates]
        
        # 批量读取原始向量（顺序读取）
        vectors = self._read_vectors_from_disk(node_ids)
        
        # 计算精确距离
        results = []
        for node_id, vector in zip(node_ids, vectors):
            dist = np.linalg.norm(query - vector)
            results.append((node_id, dist))
        
        # 返回 Top-K
        results.sort(key=lambda x: x[1])
        return results[:k]
```

## 五、性能优化

### 5.1 SSD 优化

```
┌─────────────────────────────────────────────────────────────────┐
│                    SSD 优化策略                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 对齐存储                                                     │
│  • 向量按 SSD 页大小（4KB）对齐                                 │
│  • 避免跨页读取                                                 │
│                                                                 │
│  2. 预取优化                                                     │
│  • 利用 SSD 内部并行性                                          │
│  • 发起多个并发读取请求                                         │
│                                                                 │
│  3. 缓存热数据                                                   │
│  • 入口点附近的向量缓存在内存                                   │
│  • 使用 LRU 缓存策略                                            │
│                                                                 │
│  4. 批量处理                                                     │
│  • 合并多个小请求为一个大请求                                   │
│  • 减少系统调用开销                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 参数调优

```
┌─────────────────────────────────────────────────────────────────┐
│                    DiskANN 参数调优                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  R (最大度数)：                                                  │
│  • R = 32-64: 平衡选择                                          │
│  • R 越大 → 召回率越高，内存占用越高                            │
│                                                                 │
│  L (搜索宽度)：                                                  │
│  • L = 50-200: 典型配置                                         │
│  • L/k = 10-20: 经验比值                                        │
│                                                                 │
│  α (剪枝参数)：                                                  │
│  • α = 1.2: 默认值                                              │
│  • α 越大 → 图更稀疏，搜索更快，召回率略降                      │
│                                                                 │
│  PQ 子向量数 (M)：                                               │
│  • M = 16-32: 典型配置                                          │
│  • M 越大 → 精度越高，内存占用越高                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 六、Milvus DiskANN 实现

### 6.1 索引创建

```python
from pymilvus import Collection

collection = Collection("example_collection")

# 创建 DiskANN 索引
index_params = {
    "metric_type": "L2",
    "index_type": "DISKANN",
    "params": {}
}

collection.create_index(
    field_name="embedding",
    index_params=index_params
)
```

### 6.2 搜索配置

```python
# DiskANN 搜索
search_params = {
    "metric_type": "L2",
    "params": {
        "search_list": 100  # 搜索宽度 L
    }
}

results = collection.search(
    data=[query_vector],
    anns_field="embedding",
    param=search_params,
    limit=10
)
```

### 6.3 配置要求

```yaml
# Milvus DiskANN 配置

# 数据节点配置
dataNode:
  config:
    # 启用磁盘索引
    diskIndex:
      enable: true
      # 磁盘索引路径
      indexPath: /var/lib/milvus/disk_index

# 存储配置
minio:
  # 使用本地 SSD 存储提升性能
  storageClass: local-ssd
```

## 七、DiskANN vs HNSW 对比

```
┌─────────────────────────────────────────────────────────────────┐
│                    DiskANN vs HNSW 性能对比                      │
├───────────────┬─────────────────────────────────────────────────┤
│ 特性          │ DiskANN              │ HNSW                    │
├───────────────┼─────────────────────────────────────────────────┤
│ 内存占用      │ 极低 (<5%)           │ 高 (100%+)              │
│ 延迟          │ 中 (1-10ms)          │ 低 (亚毫秒)             │
│ 召回率        │ 高 (95%+)            │ 高 (98%+)               │
│ 构建时间      │ 长                   │ 中                      │
│ 适用规模      │ 十亿级+              │ 百万到十亿              │
│ 成本          │ 低                   │ 高                      │
│ 适用场景      │ 超大规模、成本敏感   │ 高性能、内存充足        │
└───────────────┴─────────────────────────────────────────────────┘
```

## 总结

本文深入分析了 DiskANN 磁盘索引的核心原理，包括：

1. **磁盘索引挑战**：内存成本、磁盘访问特性
2. **Vamana 图算法**：Robust Prune 剪枝策略
3. **存储布局设计**：节点重排序、顺序读取优化
4. **混合查询策略**：PQ 内存过滤 + 磁盘精确验证
5. **性能优化**：SSD 优化、参数调优

下一章将分析 GPU 索引加速，探索如何利用 GPU 的大规模并行计算能力加速向量搜索。

## 参考资料

- [DiskANN: Fast Accurate Billion-point Nearest Neighbor Search](https://papers.nips.cc/paper/9527-diskann-fast-accurate-billion-point-nearest-neighbor-search-on-a-single-node)
- [Milvus DiskANN Documentation](https://milvus.io/docs/disk_index.md)
- [Fresh-DiskANN: A Fast and Accurate Graph-Based ANN Index](https://arxiv.org/abs/2104.08323)
