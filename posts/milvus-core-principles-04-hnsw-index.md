---
title: "Milvus底层原理（四）：HNSW图索引"
date: "2026-03-10"
excerpt: "深入理解 HNSW（分层可导航小世界图）索引的核心原理，掌握图结构设计、搜索算法、构建过程和性能优化策略。"
tags: ["Milvus", "向量数据库", "HNSW", "图索引", "ANN"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 4
---

## 前言

HNSW（Hierarchical Navigable Small World）是目前性能最优的向量索引之一，通过构建多层图结构实现高效的近似最近邻搜索。相比 IVF 索引，HNSW 在保持高召回率的同时，能够实现更低的查询延迟，是高性能向量搜索的首选方案。

本文将深入分析 HNSW 图索引的核心原理，包括 NSW 图基础、分层结构设计、贪心搜索算法、索引构建过程和参数调优策略。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| NSW 图原理 | ⭐⭐⭐ | 高频考点 | ✅ |
| HNSW 分层设计 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 贪心搜索算法 | ⭐⭐⭐ | 算法设计 | ✅ |
| efConstruction/M 调优 | ⭐⭐⭐ | 实战技能 | ✅ |
| Milvus HNSW 实现 | ⭐⭐⭐⭐ | 源码级 | ✅ |

## 面试考点

1. HNSW 的核心思想是什么？
2. HNSW 与 IVF 索引有什么区别？
3. HNSW 的分层结构如何加速搜索？
4. M 和 efConstruction 参数如何影响性能？
5. HNSW 的内存占用如何计算？

## 一、小世界网络基础

### 1.1 六度分隔理论

小世界网络源于著名的"六度分隔理论"：地球上任意两个人之间，平均只需要 6 个中间人就能建立联系。

```
┌─────────────────────────────────────────────────────────────────┐
│                    小世界网络特性                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  小世界网络特点：                                                │
│                                                                 │
│  1. 高聚类系数：朋友的朋友也是朋友                              │
│                                                                 │
│  2. 短平均路径：任意两点间距离很短                              │
│                                                                 │
│  示例：                                                         │
│  ┌───┐     ┌───┐     ┌───┐     ┌───┐     ┌───┐              │
│  │ A │─────│ B │─────│ C │─────│ D │─────│ E │              │
│  └───┘     └───┘     └───┘     └───┘     └───┘              │
│    │         │         │         │         │                  │
│    │    ┌────┴────┐    │    ┌────┴────┐    │                  │
│    └────│ 长程边  │────┴────│ 长程边  │────┘                  │
│         └─────────┘         └─────────┘                       │
│                                                                 │
│  长程边使任意两点间距离从 O(N) 降到 O(log N)                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 可导航小世界图（NSW）

NSW（Navigable Small World）是将小世界网络应用于向量搜索的关键创新：

```python
class NSWGraph:
    """可导航小世界图实现"""
    
    def __init__(self, d: int, M: int = 16, ef_construction: int = 200):
        """
        Args:
            d: 向量维度
            M: 每个节点的最大连接数
            ef_construction: 构建时的搜索宽度
        """
        self.d = d
        self.M = M
        self.ef_construction = ef_construction
        
        self.vectors = []  # 向量存储
        self.neighbors = []  # 邻接表
        self.entry_point = -1  # 入口点
    
    def add(self, vector: np.ndarray):
        """添加向量到图中"""
        node_id = len(self.vectors)
        self.vectors.append(vector)
        self.neighbors.append(set())
        
        if self.entry_point == -1:
            # 第一个节点作为入口
            self.entry_point = node_id
            return
        
        # 从入口点搜索最近邻
        candidates = self._search(vector, self.ef_construction)
        
        # 与最近的 M 个节点建立连接
        for neighbor_id, _ in candidates[:self.M]:
            self._connect(node_id, neighbor_id)
        
        # 更新入口点（可选：选择最中心的节点）
    
    def search(self, query: np.ndarray, k: int, ef: int = 50) -> list:
        """搜索最近邻"""
        return self._search(query, ef)[:k]
    
    def _search(self, query: np.ndarray, ef: int) -> list:
        """
        贪心搜索
        
        Args:
            query: 查询向量
            ef: 搜索宽度
        
        Returns:
            candidates: [(node_id, distance), ...]
        """
        visited = {self.entry_point}
        entry_dist = self._distance(query, self.vectors[self.entry_point])
        
        # 候选集（最小堆）
        candidates = [(entry_dist, self.entry_point)]
        # 结果集（最大堆，保留最近的 ef 个）
        results = [(entry_dist, self.entry_point)]
        
        while candidates:
            # 取出距离最小的候选
            _, current = heapq.heappop(candidates)
            current_dist = self._distance(query, self.vectors[current])
            
            # 如果当前距离大于结果中最远的，停止搜索
            if current_dist > results[-1][0] if len(results) >= ef else float('inf'):
                break
            
            # 遍历邻居
            for neighbor in self.neighbors[current]:
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                
                dist = self._distance(query, self.vectors[neighbor])
                
                # 加入候选集
                heapq.heappush(candidates, (dist, neighbor))
                
                # 更新结果集
                if len(results) < ef:
                    heapq.heappush(results, (dist, neighbor))
                    results.sort(reverse=True)
                elif dist < results[0][0]:
                    heapq.heappop(results)
                    heapq.heappush(results, (dist, neighbor))
                    results.sort(reverse=True)
        
        return [(node, dist) for dist, node in sorted(results)]
    
    def _connect(self, node1: int, node2: int):
        """建立双向连接"""
        self.neighbors[node1].add(node2)
        self.neighbors[node2].add(node1)
        
        # 限制连接数
        if len(self.neighbors[node1]) > self.M:
            self._prune_connections(node1)
        if len(self.neighbors[node2]) > self.M:
            self._prune_connections(node2)
    
    def _prune_connections(self, node: int):
        """修剪连接，保留最近的 M 个"""
        neighbors = list(self.neighbors[node])
        distances = [(self._distance(self.vectors[node], self.vectors[n]), n) for n in neighbors]
        distances.sort()
        self.neighbors[node] = set(n for _, n in distances[:self.M])
    
    def _distance(self, a: np.ndarray, b: np.ndarray) -> float:
        """计算 L2 距离"""
        return np.linalg.norm(a - b)
```

### 1.3 NSW 的局限性

```
┌─────────────────────────────────────────────────────────────────┐
│                    NSW 的局限性                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  问题 1：搜索效率不稳定                                          │
│  • 单层图结构，搜索路径可能很长                                  │
│  • 复杂度最坏情况可达 O(N)                                      │
│                                                                 │
│  问题 2：对构建顺序敏感                                          │
│  • 先插入的点连接多，后插入的点连接少                            │
│  • 图结构依赖于插入顺序                                         │
│                                                                 │
│  问题 3：缺乏全局视图                                            │
│  • 贪心搜索容易陷入局部最优                                      │
│  • 需要多次随机起点来提高召回率                                  │
│                                                                 │
│  解决方案：HNSW（分层 NSW）                                      │
│  • 引入多层图结构                                               │
│  • 高层稀疏，低层稠密                                           │
│  • 类似跳表的思想                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、HNSW 分层结构

### 2.1 核心思想

HNSW 借鉴跳表的思想，构建多层图结构：

```
┌─────────────────────────────────────────────────────────────────┐
│                    HNSW 分层结构                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 2 (最稀疏，高层):                                        │
│  ┌───────────────────────────────────────────────────────┐     │
│  │                    [Node 1] ───────────── [Node 5]   │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                 │
│  Layer 1 (中等稀疏):                                            │
│  ┌───────────────────────────────────────────────────────┐     │
│  │         [Node 1] ─── [Node 3] ─── [Node 5]           │     │
│  │              │            │            │              │     │
│  │         [Node 2] ─── [Node 4] ─── [Node 6]           │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                 │
│  Layer 0 (最稠密，底层，包含所有节点):                          │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  [1]──[2]──[3]──[4]──[5]──[6]──[7]──[8]──[9]──[10]  │     │
│  │   │    │    │    │    │    │    │    │    │    │     │     │
│  │   └────┴────┴────┴────┴────┴────┴────┴────┴────┘     │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                 │
│  搜索过程：                                                     │
│  1. 从最高层入口开始                                            │
│  2. 在当前层贪心搜索到局部最优                                  │
│  3. 跳到下一层继续搜索                                          │
│  4. 在 Layer 0 找到最终结果                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 层级分配

每个节点被分配到一个最高层级，同时存在于所有更低的层级：

```python
import random
import math

def assign_layer(max_level: int, mL: float = 1.0 / math.log(16)) -> int:
    """
    为节点分配层级
    
    使用指数分布，使高层节点稀疏
    
    Args:
        max_level: 当前最高层
        mL: 层级分配参数（通常取 1/ln(M)）
    
    Returns:
        layer: 节点的最高层级
    """
    # 使用指数分布，使高层节点稀疏
    r = random.random()
    level = int(-math.log(r) * mL)
    return min(level, max_level + 1)

# 层级分布示例
"""
M = 16, mL = 1/ln(16) ≈ 0.36

层级分布（理论值）:
Layer 0: 100% 的节点
Layer 1: ~30% 的节点  
Layer 2: ~9% 的节点
Layer 3: ~3% 的节点
Layer 4: ~1% 的节点
...
"""
```

### 2.3 HNSW 结构实现

```python
import heapq
import random
import math
import numpy as np
from typing import List, Set, Tuple, Dict

class HNSW:
    """HNSW 图索引实现"""
    
    def __init__(
        self,
        d: int,
        M: int = 16,
        ef_construction: int = 200,
        mL: float = None
    ):
        """
        Args:
            d: 向量维度
            M: 每层每个节点的最大连接数（Layer 0 为 2*M）
            ef_construction: 构建时的搜索宽度
            mL: 层级分配参数，默认 1/ln(M)
        """
        self.d = d
        self.M = M
        self.M0 = 2 * M  # Layer 0 的最大连接数
        self.ef_construction = ef_construction
        self.mL = mL if mL else 1.0 / math.log(M)
        
        # 数据存储
        self.vectors: List[np.ndarray] = []
        
        # 图结构: neighbors[layer][node_id] = set of neighbor ids
        self.neighbors: Dict[int, Dict[int, Set[int]]] = {}
        
        # 元数据
        self.max_layer = -1
        self.entry_point = -1
        self.node_levels: List[int] = []  # 每个节点的最高层级
    
    def add(self, vector: np.ndarray):
        """添加向量"""
        node_id = len(self.vectors)
        self.vectors.append(vector)
        
        # 分配层级
        level = self._random_level()
        self.node_levels.append(level)
        
        # 初始化该节点在各层的邻居集合
        for l in range(level + 1):
            if l not in self.neighbors:
                self.neighbors[l] = {}
            self.neighbors[l][node_id] = set()
        
        # 如果是第一个节点
        if self.entry_point == -1:
            self.entry_point = node_id
            self.max_layer = level
            return
        
        # 从入口点开始搜索
        current_entry = self.entry_point
        
        # 在高层快速定位
        for l in range(self.max_layer, level, -1):
            candidates = self._search_layer(vector, [current_entry], ef=1, layer=l)
            current_entry = candidates[0][1]  # 最近的节点
        
        # 在节点层级及以下进行插入
        for l in range(min(level, self.max_layer), -1, -1):
            # 在当前层搜索最近邻
            candidates = self._search_layer(
                vector, 
                [current_entry], 
                ef=self.ef_construction, 
                layer=l
            )
            
            # 选择邻居并连接
            neighbors = self._select_neighbors(candidates, self.M if l > 0 else self.M0)
            self.neighbors[l][node_id] = set(n for _, n in neighbors)
            
            # 双向连接
            for _, neighbor_id in neighbors:
                self._connect_bidirectional(node_id, neighbor_id, l)
            
            # 更新入口点用于下一层
            if candidates:
                current_entry = candidates[0][1]
        
        # 更新全局入口点
        if level > self.max_layer:
            self.max_layer = level
            self.entry_point = node_id
    
    def search(self, query: np.ndarray, k: int, ef: int = 50) -> List[Tuple[int, float]]:
        """
        搜索最近邻
        
        Args:
            query: 查询向量
            k: 返回数量
            ef: 搜索宽度（ef >= k）
        
        Returns:
            results: [(node_id, distance), ...]
        """
        if self.entry_point == -1:
            return []
        
        # 从最高层开始
        current = self.entry_point
        
        # 在高层快速定位
        for l in range(self.max_layer, 0, -1):
            candidates = self._search_layer(query, [current], ef=1, layer=l)
            current = candidates[0][1]
        
        # 在 Layer 0 进行精细搜索
        candidates = self._search_layer(query, [current], ef=ef, layer=0)
        
        return candidates[:k]
    
    def _search_layer(
        self,
        query: np.ndarray,
        entry_points: List[int],
        ef: int,
        layer: int
    ) -> List[Tuple[float, int]]:
        """
        在指定层搜索
        
        Args:
            query: 查询向量
            entry_points: 入口点列表
            ef: 搜索宽度
            layer: 搜索层
        
        Returns:
            candidates: [(distance, node_id), ...] 按距离排序
        """
        visited = set(entry_points)
        
        # 候选集（最小堆）：存储待探索的节点
        candidates = []  # (distance, node_id)
        for ep in entry_points:
            dist = self._distance(query, self.vectors[ep])
            heapq.heappush(candidates, (dist, ep))
        
        # 结果集（最大堆）：存储最近的 ef 个结果
        results = []  # (-distance, node_id) 用负数模拟最大堆
        for ep in entry_points:
            dist = self._distance(query, self.vectors[ep])
            heapq.heappush(results, (-dist, ep))
        
        while candidates:
            # 取出最近的候选
            current_dist, current = heapq.heappop(candidates)
            
            # 获取当前结果中最远的距离
            furthest_dist = -results[0][0] if results else float('inf')
            
            # 如果当前候选比结果中最远的还远，搜索结束
            if current_dist > furthest_dist and len(results) >= ef:
                break
            
            # 探索邻居
            if layer in self.neighbors and current in self.neighbors[layer]:
                for neighbor in self.neighbors[layer][current]:
                    if neighbor in visited:
                        continue
                    visited.add(neighbor)
                    
                    dist = self._distance(query, self.vectors[neighbor])
                    
                    # 如果结果集未满或比最远的更近
                    if len(results) < ef or dist < -results[0][0]:
                        heapq.heappush(candidates, (dist, neighbor))
                        heapq.heappush(results, (-dist, neighbor))
                        
                        # 维持结果集大小
                        while len(results) > ef:
                            heapq.heappop(results)
        
        # 转换为排序列表
        result_list = [(-d, n) for d, n in results]
        result_list.sort()
        return result_list
    
    def _select_neighbors(
        self,
        candidates: List[Tuple[float, int]],
        M: int
    ) -> List[Tuple[float, int]]:
        """
        选择邻居
        
        简单启发式：选择最近的 M 个
        """
        return sorted(candidates)[:M]
    
    def _connect_bidirectional(self, node1: int, node2: int, layer: int):
        """建立双向连接，并修剪过多的连接"""
        # node1 -> node2
        self.neighbors[layer][node1].add(node2)
        if len(self.neighbors[layer][node1]) > (self.M if layer > 0 else self.M0):
            self._prune_neighbors(node1, layer)
        
        # node2 -> node1
        self.neighbors[layer][node2].add(node1)
        if len(self.neighbors[layer][node2]) > (self.M if layer > 0 else self.M0):
            self._prune_neighbors(node2, layer)
    
    def _prune_neighbors(self, node: int, layer: int):
        """修剪邻居，保留最近的"""
        node_vec = self.vectors[node]
        neighbors = list(self.neighbors[layer][node])
        
        # 计算距离并排序
        neighbor_dists = [(self._distance(node_vec, self.vectors[n]), n) for n in neighbors]
        neighbor_dists.sort()
        
        # 保留最近的
        max_conn = self.M if layer > 0 else self.M0
        self.neighbors[layer][node] = set(n for _, n in neighbor_dists[:max_conn])
    
    def _random_level(self) -> int:
        """随机分配层级"""
        r = random.random()
        level = int(-math.log(r) * self.mL)
        return level
    
    def _distance(self, a: np.ndarray, b: np.ndarray) -> float:
        """L2 距离"""
        return np.linalg.norm(a - b)
    
    def memory_usage(self) -> int:
        """计算内存占用"""
        # 向量存储
        vector_memory = len(self.vectors) * self.d * 4
        
        # 邻接表存储
        edge_count = sum(
            len(neighbors) 
            for layer_neighbors in self.neighbors.values() 
            for neighbors in layer_neighbors.values()
        )
        edge_memory = edge_count * 4  # int32
        
        return vector_memory + edge_memory
```

## 三、搜索算法详解

### 3.1 贪心搜索

HNSW 的核心搜索策略是贪心搜索：

```
┌─────────────────────────────────────────────────────────────────┐
│                    贪心搜索算法                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  输入：查询向量 q，入口点 ep，搜索宽度 ef                        │
│                                                                 │
│  1. 初始化                                                      │
│     visited = {ep}                                             │
│     candidates = min_heap([(dist(q, ep), ep)])                 │
│     results = max_heap([(dist(q, ep), ep)])                    │
│                                                                 │
│  2. 循环直到候选集为空                                          │
│     a. 取出 candidates 中距离最小的节点 c                       │
│     b. 如果 c 的距离 > results 中最大距离，停止                 │
│     c. 遍历 c 的所有邻居 n                                      │
│        - 如果 n 未访问过                                        │
│          - 标记为已访问                                         │
│          - 如果 dist(q, n) < results 中最大距离                 │
│            - 将 n 加入 candidates 和 results                   │
│            - 如果 results 大小 > ef，移除最远的                 │
│                                                                 │
│  3. 返回 results 中最近的 k 个                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 搜索复杂度分析

```
┌─────────────────────────────────────────────────────────────────┐
│                    HNSW 搜索复杂度                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  时间复杂度：O(log N × ef)                                      │
│                                                                 │
│  分析：                                                         │
│  1. 高层快速定位：O(log N)，每层常数时间跳转                    │
│  2. Layer 0 精细搜索：O(ef)，ef 通常为常数                      │
│                                                                 │
│  实际性能：                                                      │
│  • 延迟通常在亚毫秒级                                           │
│  • 对数级扩展性，支持十亿级向量                                 │
│                                                                 │
│  空间复杂度：O(N × M)                                           │
│  • 每个节点平均 M 条边                                          │
│  • 内存占用较高，是 HNSW 的主要劣势                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 四、参数调优

### 4.1 M 参数

```
┌─────────────────────────────────────────────────────────────────┐
│                    M 参数影响                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  M 值越大：                                                      │
│  ✅ 召回率更高（图连通性更好）                                  │
│  ✅ 搜索更稳定                                                  │
│  ❌ 内存占用更大                                                │
│  ❌ 构建时间更长                                                │
│  ❌ 搜索时需要检查更多邻居                                      │
│                                                                 │
│  推荐值：                                                        │
│  • M = 16: 平衡选择，适合大多数场景                             │
│  • M = 32: 高召回率需求                                         │
│  • M = 64: 极高召回率，内存充足                                 │
│  • M = 8: 内存受限场景                                          │
│                                                                 │
│  内存估算：                                                      │
│  内存 ≈ N × D × 4 + N × M × 4 × 2 (双向边)                      │
│       ≈ N × (4D + 8M) bytes                                     │
│                                                                 │
│  示例：N=100万, D=768, M=16                                     │
│  内存 ≈ 100万 × (3072 + 128) ≈ 3.2 GB                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 efConstruction 参数

```
┌─────────────────────────────────────────────────────────────────┐
│                    efConstruction 参数影响                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  efConstruction 值越大：                                        │
│  ✅ 图质量更好（召回率更高）                                    │
│  ✅ 搜索时效率更高                                              │
│  ❌ 构建时间更长                                                │
│  ❌ 构建时内存占用更高                                          │
│                                                                 │
│  推荐值：                                                        │
│  • efConstruction = 100-200: 标准选择                           │
│  • efConstruction = 400: 高质量图                               │
│  • efConstruction = 50: 快速构建                                │
│                                                                 │
│  经验法则：                                                      │
│  efConstruction ≈ M × 10 到 M × 20                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 ef (搜索) 参数

```
┌─────────────────────────────────────────────────────────────────┐
│                    ef (搜索) 参数影响                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ef 值越大：                                                     │
│  ✅ 召回率更高                                                  │
│  ❌ 搜索延迟更高                                                │
│                                                                 │
│  注意：ef 必须 >= k                                             │
│                                                                 │
│  推荐值：                                                        │
│  • ef = k: 最快搜索                                             │
│  • ef = k × 2: 平衡选择                                         │
│  • ef = k × 10: 高召回率                                        │
│                                                                 │
│  召回率 vs ef 关系 (M=16):                                      │
│  ef    │ 召回率                                                  │
│  ──────┼────────                                                │
│  10    │ 85-90%                                                 │
│  50    │ 95-98%                                                 │
│  100   │ 98-99%                                                 │
│  200   │ 99%+                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 五、Milvus HNSW 实现

### 5.1 索引创建

```python
from pymilvus import Collection

collection = Collection("example_collection")

# 创建 HNSW 索引
index_params = {
    "metric_type": "L2",  # 或 "IP", "COSINE"
    "index_type": "HNSW",
    "params": {
        "M": 16,              # 每层最大连接数
        "efConstruction": 200  # 构建时搜索宽度
    }
}

collection.create_index(
    field_name="embedding",
    index_params=index_params
)
```

### 5.2 搜索配置

```python
# HNSW 搜索
search_params = {
    "metric_type": "L2",
    "params": {
        "ef": 100  # 搜索时的搜索宽度
    }
}

results = collection.search(
    data=[query_vector],
    anns_field="embedding",
    param=search_params,
    limit=10
)
```

### 5.3 参数调优示例

```python
def tune_hnsw_params(
    data: np.ndarray,
    queries: np.ndarray,
    ground_truth: np.ndarray,
    target_recall: float = 0.95,
    k: int = 10
) -> dict:
    """
    HNSW 参数调优
    
    Returns:
        best_params: 最优参数配置
    """
    best_params = None
    best_latency = float('inf')
    
    # 搜索空间
    M_candidates = [8, 16, 32]
    ef_construction_candidates = [100, 200, 400]
    
    for M in M_candidates:
        for ef_construction in ef_construction_candidates:
            # 构建索引
            index = HNSW(d=data.shape[1], M=M, ef_construction=ef_construction)
            for vec in data:
                index.add(vec)
            
            # 二分搜索最小 ef 满足目标召回率
            low, high = k, 500
            while low < high:
                mid = (low + high) // 2
                
                # 测试召回率
                results = [index.search(q, k=k, ef=mid) for q in queries]
                indices = [[r[1] for r in res] for res in results]
                recall = compute_recall(np.array(indices), ground_truth)
                
                if recall >= target_recall:
                    high = mid
                else:
                    low = mid + 1
            
            # 测试延迟
            import time
            start = time.time()
            for q in queries:
                index.search(q, k=k, ef=low)
            latency = (time.time() - start) / len(queries) * 1000
            
            # 计算内存占用
            memory = index.memory_usage() / 1024 / 1024  # MB
            
            if latency < best_latency:
                best_latency = latency
                best_params = {
                    "M": M,
                    "ef_construction": ef_construction,
                    "ef": low,
                    "memory_mb": memory
                }
    
    return best_params
```

## 六、HNSW vs IVF 对比

```
┌─────────────────────────────────────────────────────────────────┐
│                    HNSW vs IVF 对比                              │
├───────────────┬─────────────────────────────────────────────────┤
│ 特性          │ HNSW                    │ IVF                  │
├───────────────┼─────────────────────────────────────────────────┤
│ 搜索复杂度    │ O(log N)               │ O(√N)                │
│ 召回率        │ 高 (95-99%)            │ 中 (90-98%)          │
│ 延迟          │ 低 (亚毫秒)            │ 中 (毫秒级)          │
│ 内存占用      │ 高 (N × M × 2)         │ 低 (可压缩)          │
│ 构建时间      │ 中                     │ 低                   │
│ 增量更新      │ 支持                    │ 需要重训练           │
│ 参数敏感度    │ 低                      │ 高 (nlist/nprobe)    │
│ 适用场景      │ 高性能查询             │ 内存受限             │
└───────────────┴─────────────────────────────────────────────────┘
```

## 总结

本文深入分析了 HNSW 图索引的核心原理，包括：

1. **小世界网络**：六度分隔理论与 NSW 图
2. **HNSW 分层结构**：多层图设计，高层稀疏低层稠密
3. **贪心搜索算法**：候选集和结果集的维护
4. **参数调优**：M、efConstruction、ef 的选择
5. **Milvus 实现**：索引创建和搜索配置

下一章将分析 DiskANN 磁盘索引，探索如何处理超大规模向量数据。

## 参考资料

- [Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs](https://arxiv.org/abs/1603.09320)
- [HNSWlib: efficient algorithm for ANN search](https://github.com/nmslib/hnswlib)
- [Milvus HNSW Index Documentation](https://milvus.io/docs/index.md#HNSW)
