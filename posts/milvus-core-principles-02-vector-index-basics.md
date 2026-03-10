---
title: "Milvus底层原理（二）：向量索引算法基础"
date: "2026-03-10"
excerpt: "深入理解向量相似度搜索的核心算法，掌握暴力搜索、向量量化、索引评估等基础知识，为后续学习高级索引算法奠定理论基础。"
tags: ["Milvus", "向量数据库", "向量索引", "ANN", "算法"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 2
---

## 前言

在上一篇中，我们从宏观视角了解了 Milvus 的整体架构设计。从本章开始，我们将深入探讨向量索引的核心算法。向量索引是向量数据库性能的关键，理解其原理对于正确选择和调优索引至关重要。

本文将介绍向量相似度搜索的理论基础，包括相似度度量的数学原理、暴力搜索算法、向量量化技术，以及索引性能评估方法，为后续学习 IVF、HNSW、DiskANN 等高级索引算法奠定基础。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 相似度度量原理 | ⭐⭐ | 高频考点 | ✅ |
| 暴力搜索优化 | ⭐⭐⭐ | 进阶考点 | ✅ |
| 向量量化（PQ/SQ） | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| 召回率与延迟权衡 | ⭐⭐⭐ | 架构设计 | ✅ |
| SIMD 向量化计算 | ⭐⭐⭐⭐ | 性能优化 | ✅ |

## 面试考点

1. 向量相似度有哪些度量方法？各自的适用场景是什么？
2. 什么是 ANN（近似最近邻）？为什么需要 ANN？
3. 向量量化的原理是什么？PQ 如何实现压缩？
4. 如何评估向量索引的性能？召回率和延迟如何权衡？
5. SIMD 如何加速向量计算？

## 一、相似度度量深入解析

### 1.1 距离度量的数学基础

在向量空间中，距离度量定义了两个向量之间的"远近"关系。一个有效的距离度量需要满足以下四个公理：

```
┌─────────────────────────────────────────────────────────────────┐
│                    距离度量公理                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  设 d(x, y) 为向量 x 和 y 之间的距离，则：                       │
│                                                                 │
│  1. 非负性：d(x, y) ≥ 0                                         │
│     距离不能为负                                                │
│                                                                 │
│  2. 同一性：d(x, y) = 0 ⟺ x = y                                 │
│     同一向量的距离为 0，反之亦然                                 │
│                                                                 │
│  3. 对称性：d(x, y) = d(y, x)                                   │
│     距离与方向无关                                              │
│                                                                 │
│  4. 三角不等式：d(x, z) ≤ d(x, y) + d(y, z)                     │
│     直线距离最短                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 L2 距离（欧氏距离）

L2 距离是最直观的距离度量，表示两点之间的直线距离：

$$d_{L2}(x, y) = \sqrt{\sum_{i=1}^{D}(x_i - y_i)^2} = \|x - y\|_2$$

```python
import numpy as np

def l2_distance(x: np.ndarray, y: np.ndarray) -> float:
    """计算 L2 距离"""
    diff = x - y
    return np.sqrt(np.dot(diff, diff))

# 或使用 numpy 内置函数
def l2_distance_numpy(x: np.ndarray, y: np.ndarray) -> float:
    return np.linalg.norm(x - y)

# 示例
x = np.array([1.0, 2.0, 3.0])
y = np.array([4.0, 5.0, 6.0])
print(f"L2 距离: {l2_distance(x, y):.4f}")  # 5.1962
```

**L2 距离的特点：**

| 特点 | 说明 |
|------|------|
| **几何直观** | 欧氏空间中的直线距离 |
| **物理意义** | 适合有物理距离含义的数据 |
| **归一化敏感** | 向量长度影响距离 |
| **计算复杂度** | O(D)，D 为维度 |

### 1.3 内积（Inner Product）

内积度量两个向量的"对齐程度"，值越大表示越相似：

$$s_{IP}(x, y) = \sum_{i=1}^{D} x_i \cdot y_i = x^T y$$

```python
def inner_product(x: np.ndarray, y: np.ndarray) -> float:
    """计算内积"""
    return np.dot(x, y)

# 示例
x = np.array([1.0, 2.0, 3.0])
y = np.array([4.0, 5.0, 6.0])
print(f"内积: {inner_product(x, y):.4f}")  # 32.0
```

**内积与余弦相似度的关系：**

$$\cos(x, y) = \frac{x^T y}{\|x\| \|y\|}$$

```python
def cosine_similarity(x: np.ndarray, y: np.ndarray) -> float:
    """计算余弦相似度"""
    return np.dot(x, y) / (np.linalg.norm(x) * np.linalg.norm(y))

# 归一化向量的内积 = 余弦相似度
x_norm = x / np.linalg.norm(x)
y_norm = y / np.linalg.norm(y)
print(f"归一化后内积: {np.dot(x_norm, y_norm):.4f}")
print(f"余弦相似度: {cosine_similarity(x, y):.4f}")  # 两者相等
```

### 1.4 余弦相似度

余弦相似度度量两个向量方向的相似程度，与向量长度无关：

$$s_{cos}(x, y) = \frac{x \cdot y}{\|x\| \|y\|} = \frac{\sum_{i=1}^{D} x_i y_i}{\sqrt{\sum_{i=1}^{D} x_i^2} \sqrt{\sum_{i=1}^{D} y_i^2}}$$

```python
def cosine_similarity(x: np.ndarray, y: np.ndarray) -> float:
    """计算余弦相似度"""
    norm_x = np.sqrt(np.dot(x, x))
    norm_y = np.sqrt(np.dot(y, y))
    if norm_x == 0 or norm_y == 0:
        return 0.0
    return np.dot(x, y) / (norm_x * norm_y)

# 余弦距离 = 1 - 余弦相似度
def cosine_distance(x: np.ndarray, y: np.ndarray) -> float:
    return 1 - cosine_similarity(x, y)
```

**余弦相似度的特点：**

```
┌─────────────────────────────────────────────────────────────────┐
│                    余弦相似度特点                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  优势：                                                         │
│  • 不受向量长度影响，只关注方向                                 │
│  • 适合文本语义相似度（文本长度变化大）                         │
│  • 值域明确：[-1, 1]                                           │
│                                                                 │
│  劣势：                                                         │
│  • 不考虑向量长度信息                                           │
│  • 需要额外的归一化计算                                        │
│                                                                 │
│  适用场景：                                                      │
│  • 文本 Embedding 相似度                                       │
│  • 用户兴趣相似度                                              │
│  • 文档检索                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.5 度量方法选择指南

```
┌─────────────────────────────────────────────────────────────────┐
│                    度量方法选择决策树                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      数据特征？                                 │
│                          │                                      │
│              ┌───────────┴───────────┐                         │
│              ▼                       ▼                         │
│         归一化向量              非归一化向量                    │
│              │                       │                         │
│              ▼                       ▼                         │
│     ┌────────┴────────┐      ┌────────┴────────┐              │
│     ▼                 ▼      ▼                 ▼              │
│  文本语义        其他场景   物理距离相关    其他场景           │
│     │                 │      │                 │              │
│     ▼                 ▼      ▼                 ▼              │
│  COSINE/IP         IP/L2     L2            IP/COSINE         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| 场景 | 推荐度量 | 原因 |
|------|----------|------|
| 文本语义搜索 | COSINE | 关注语义方向，不受文本长度影响 |
| 图像特征匹配 | L2/COSINE | 取决于特征是否归一化 |
| 推荐系统 | IP | 用户/物品向量通常已归一化 |
| 音频相似度 | COSINE | 信号强度变化大 |
| 地理位置计算 | L2 | 有实际物理距离意义 |

## 二、暴力搜索（FLAT）算法

### 2.1 算法原理

暴力搜索（Brute Force / FLAT）是最直接的相似度搜索方法，计算查询向量与数据库中所有向量的距离，然后排序返回 Top-K。

```
┌─────────────────────────────────────────────────────────────────┐
│                    暴力搜索流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  输入：查询向量 q，数据库向量集 V = {v₁, v₂, ..., vₙ}，K        │
│                                                                 │
│  步骤：                                                         │
│  1. for each vᵢ in V:                                          │
│  2.     计算距离 dᵢ = distance(q, vᵢ)                          │
│  3. 将所有 (vᵢ, dᵢ) 按距离排序                                 │
│  4. 返回 Top-K 结果                                            │
│                                                                 │
│  时间复杂度：O(N × D + N log N)                                 │
│  • N: 向量数量                                                  │
│  • D: 向量维度                                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 基础实现

```python
import numpy as np
from typing import List, Tuple

def brute_force_search(
    query: np.ndarray,
    database: np.ndarray,
    k: int = 10,
    metric: str = "l2"
) -> Tuple[np.ndarray, np.ndarray]:
    """
    暴力搜索实现
    
    Args:
        query: 查询向量 (D,)
        database: 数据库向量 (N, D)
        k: 返回数量
        metric: 距离度量 ["l2", "ip", "cosine"]
    
    Returns:
        indices: Top-K 索引 (k,)
        distances: Top-K 距离 (k,)
    """
    # 计算所有距离
    if metric == "l2":
        # 批量计算 L2 距离
        diff = database - query  # (N, D)
        distances = np.sqrt(np.sum(diff ** 2, axis=1))  # (N,)
        
    elif metric == "ip":
        # 内积（越大越相似）
        distances = -np.dot(database, query)  # 取负，统一为"越小越好"
        
    elif metric == "cosine":
        # 余弦距离
        norms = np.linalg.norm(database, axis=1)
        similarities = np.dot(database, query) / (norms * np.linalg.norm(query))
        distances = 1 - similarities
    else:
        raise ValueError(f"Unknown metric: {metric}")
    
    # 使用 argpartition 高效获取 Top-K（不完全排序）
    if k < len(distances):
        indices = np.argpartition(distances, k)[:k]
        # 对 Top-K 结果排序
        order = np.argsort(distances[indices])
        indices = indices[order]
    else:
        indices = np.argsort(distances)[:k]
    
    return indices, distances[indices]


# 示例
np.random.seed(42)
database = np.random.randn(10000, 128).astype(np.float32)  # 1万向量，128维
query = np.random.randn(128).astype(np.float32)

indices, distances = brute_force_search(query, database, k=10, metric="l2")
print(f"Top-10 索引: {indices}")
print(f"Top-10 距离: {distances}")
```

### 2.3 性能优化技术

#### 2.3.1 批量矩阵运算

利用矩阵运算代替循环，充分利用 NumPy/BLAS 优化：

```python
def batch_l2_distance(query: np.ndarray, database: np.ndarray) -> np.ndarray:
    """
    批量计算 L2 距离（优化版）
    
    利用公式：||x - y||² = ||x||² + ||y||² - 2*x·y
    """
    # ||q - v||² = ||q||² + ||v||² - 2*q·v
    q_norm = np.dot(query, query)  # 标量
    v_norms = np.sum(database ** 2, axis=1)  # (N,)
    dot_products = np.dot(database, query)  # (N,)
    
    distances_sq = q_norm + v_norms - 2 * dot_products
    return np.sqrt(np.maximum(distances_sq, 0))  # 处理浮点误差
```

#### 2.3.2 SIMD 向量化加速

SIMD（Single Instruction Multiple Data）指令集可同时处理多个浮点数：

```python
# 使用 NumPy 的 SIMD 优化（自动启用）
import numpy as np

# 确保使用优化 BLAS 库
np.show_config()  # 查看使用的 BLAS 库

# 推荐使用 OpenBLAS 或 MKL
# pip install numpy-mkl  # Intel MKL 版本

def simd_optimized_search(
    queries: np.ndarray,  # (B, D) 批量查询
    database: np.ndarray,  # (N, D)
    k: int = 10
) -> Tuple[np.ndarray, np.ndarray]:
    """
    SIMD 优化的批量搜索
    """
    # 批量计算距离矩阵 (B, N)
    # 利用矩阵乘法，自动使用 SIMD
    # ||q - v||² = ||q||² + ||v||² - 2*q·v
    q_norms = np.sum(queries ** 2, axis=1, keepdims=True)  # (B, 1)
    v_norms = np.sum(database ** 2, axis=1)  # (N,)
    dot_products = np.dot(queries, database.T)  # (B, N) 使用 BLAS 矩阵乘
    
    distances_sq = q_norms + v_norms - 2 * dot_products  # 广播
    distances = np.sqrt(np.maximum(distances_sq, 0))
    
    # 批量 Top-K
    indices = np.argpartition(distances, k, axis=1)[:, :k]
    
    return indices, distances[:, :k]
```

#### 2.3.3 使用 Faiss 加速

Facebook 的 Faiss 库提供了高度优化的暴力搜索实现：

```python
import faiss

def faiss_flat_search(
    database: np.ndarray,
    queries: np.ndarray,
    k: int = 10,
    metric: str = "l2"
) -> Tuple[np.ndarray, np.ndarray]:
    """
    使用 Faiss 进行优化的暴力搜索
    """
    n, d = database.shape
    
    # 创建索引
    if metric == "l2":
        index = faiss.IndexFlatL2(d)
    elif metric == "ip":
        index = faiss.IndexFlatIP(d)
    else:
        raise ValueError(f"Unsupported metric: {metric}")
    
    # 添加向量
    index.add(database)
    
    # 搜索
    distances, indices = index.search(queries, k)
    
    return indices, distances


# 性能对比
import time

database = np.random.randn(100000, 768).astype(np.float32)
queries = np.random.randn(100, 768).astype(np.float32)

# 纯 NumPy
start = time.time()
indices, distances = simd_optimized_search(queries, database, k=10)
print(f"NumPy: {time.time() - start:.3f}s")

# Faiss
start = time.time()
indices, distances = faiss_flat_search(database, queries, k=10)
print(f"Faiss: {time.time() - start:.3f}s")
```

### 2.4 暴力搜索的适用场景

```
┌─────────────────────────────────────────────────────────────────┐
│                    暴力搜索适用场景分析                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  优势：                                                         │
│  ✅ 精确搜索，召回率 100%                                       │
│  ✅ 无需构建索引，无额外内存开销                                │
│  ✅ 支持任意距离度量                                            │
│  ✅ 实现简单，易于调试                                          │
│                                                                 │
│  劣势：                                                         │
│  ❌ 时间复杂度 O(N×D)，大规模数据慢                             │
│  ❌ 随数据量线性增长                                            │
│                                                                 │
│  适用场景：                                                      │
│  • 数据量 < 10 万                                               │
│  • 对召回率要求极高（100%）                                     │
│  • 快速原型验证                                                 │
│  • 作为基准测试对比                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 三、近似最近邻搜索（ANN）

### 3.1 为什么需要 ANN

当数据量达到百万甚至十亿级别时，暴力搜索变得不可接受：

```
┌─────────────────────────────────────────────────────────────────┐
│                    暴力搜索性能瓶颈                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  示例：1 亿向量，768 维，单次查询                               │
│                                                                 │
│  计算量 = 100,000,000 × 768 = 76.8 亿次浮点运算                 │
│                                                                 │
│  单核 CPU (~10 GFLOPS): ~0.8 秒/查询                            │
│  实际（内存带宽限制）: ~5-10 秒/查询                            │
│                                                                 │
│  QPS 要求 100 的场景：需要 50-100 个核心并行                    │
│                                                                 │
│  解决方案：近似最近邻搜索（ANN）                                 │
│  • 牺牲少量精度（召回率 95-99%）                                │
│  • 换取数量级的性能提升                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 ANN 的核心思想

ANN 算法的核心是通过某种数据结构"组织"向量，使得搜索时不需要遍历所有向量：

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANN 核心思想                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  暴力搜索：遍历所有向量 → O(N)                                  │
│                                                                 │
│  ANN 思路：                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. 空间划分：将向量空间划分为若干区域                    │   │
│  │     • 树结构：KD-Tree, Ball Tree, Annoy                 │   │
│  │     • 聚类：IVF (Inverted File Index)                   │   │
│  │     • 图：HNSW, DiskANN                                 │   │
│  │                                                         │   │
│  │  2. 量化压缩：减少向量存储和计算开销                     │   │
│  │     • 标量量化 (SQ)                                     │   │
│  │     • 乘积量化 (PQ)                                     │   │
│  │                                                         │   │
│  │  3. 剪枝搜索：只搜索可能包含答案的区域                   │   │
│  │     • 时间复杂度：O(log N) 或 O(√N)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 ANN 算法分类

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANN 算法分类                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  基于树的索引                            │   │
│  │                                                         │   │
│  │  KD-Tree: 递归划分空间（适合低维）                       │   │
│  │  Ball Tree: 使用超球体划分                               │   │
│  │  Annoy: 多棵随机投影树                                   │   │
│  │                                                         │   │
│  │  特点：构建快，高维效果差                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  基于聚类的索引                          │   │
│  │                                                         │   │
│  │  IVF-Flat: K-Means 聚类 + 倒排索引                       │   │
│  │  IVF-PQ: 聚类 + 乘积量化                                 │   │
│  │  IVF-SQ8: 聚类 + 标量量化                                │   │
│  │                                                         │   │
│  │  特点：内存可控，需调参                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  基于图的索引                            │   │
│  │                                                         │   │
│  │  NSW: 可导航小世界图                                     │   │
│  │  HNSW: 分层可导航小世界图                                │   │
│  │  DiskANN: 磁盘友好的图索引                               │   │
│  │                                                         │   │
│  │  特点：高召回率，低延迟，内存消耗大                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  基于哈希的索引                          │   │
│  │                                                         │   │
│  │  LSH: 局部敏感哈希                                       │   │
│  │  Multi-probe LSH: 多探针 LSH                             │   │
│  │                                                         │   │
│  │  特点：适合高召回率场景，精度较低                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 四、向量量化技术

### 4.1 量化的概念

量化（Quantization）是将连续值映射到离散值的过程，核心目的是压缩向量存储和加速距离计算。

```
┌─────────────────────────────────────────────────────────────────┐
│                    量化基本原理                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  原始向量：[0.123, 0.456, 0.789, ...]  (float32, 4 bytes/维)    │
│                                                                 │
│  量化后：[12, 46, 79, ...]  (uint8, 1 byte/维)                  │
│                                                                 │
│  压缩比：4x                                                      │
│  精度损失：取决于量化方法                                        │
│                                                                 │
│  量化目标：                                                      │
│  • 减少内存占用                                                  │
│  • 加速距离计算                                                  │
│  • 保持相似度排序的正确性                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 标量量化（Scalar Quantization, SQ）

标量量化将每个维度独立量化，通常映射到 uint8：

```python
import numpy as np

class ScalarQuantizer:
    """标量量化器"""
    
    def __init__(self):
        self.min_val = None
        self.max_val = None
    
    def train(self, data: np.ndarray):
        """
        训练量化器，确定量化范围
        
        Args:
            data: (N, D) 训练数据
        """
        self.min_val = np.min(data, axis=0)  # 每维最小值
        self.max_val = np.max(data, axis=0)  # 每维最大值
        self.scale = (self.max_val - self.min_val) / 255.0
    
    def encode(self, data: np.ndarray) -> np.ndarray:
        """
        编码：float32 -> uint8
        
        Args:
            data: (N, D) 原始数据
        Returns:
            codes: (N, D) uint8 编码
        """
        # 线性映射到 [0, 255]
        normalized = (data - self.min_val) / (self.max_val - self.min_val)
        return np.clip(normalized * 255, 0, 255).astype(np.uint8)
    
    def decode(self, codes: np.ndarray) -> np.ndarray:
        """
        解码：uint8 -> float32
        
        Args:
            codes: (N, D) uint8 编码
        Returns:
            data: (N, D) 解码数据
        """
        return codes.astype(np.float32) * self.scale + self.min_val
    
    def compute_distance(
        self,
        query: np.ndarray,
        codes: np.ndarray
    ) -> np.ndarray:
        """
        计算距离（使用量化编码）
        
        Args:
            query: (D,) 查询向量
            codes: (N, D) 数据库编码
        Returns:
            distances: (N,) 距离
        """
        # 解码后计算
        decoded = self.decode(codes)
        diff = decoded - query
        return np.sqrt(np.sum(diff ** 2, axis=1))


# 使用示例
data = np.random.randn(10000, 128).astype(np.float32)

# 训练量化器
sq = ScalarQuantizer()
sq.train(data)

# 编码
codes = sq.encode(data)
print(f"原始大小: {data.nbytes / 1024:.2f} KB")
print(f"编码后大小: {codes.nbytes / 1024:.2f} KB")
print(f"压缩比: {data.nbytes / codes.nbytes:.1f}x")
```

**SQ8 的特点：**

| 特性 | 说明 |
|------|------|
| **压缩比** | 4x（float32 → uint8） |
| **精度损失** | 中等，取决于数据分布 |
| **计算速度** | 解码后计算，速度提升有限 |
| **适用场景** | 内存受限，精度要求不高 |

### 4.3 乘积量化（Product Quantization, PQ）

乘积量化将向量划分为多个子向量，对每个子向量独立量化：

```
┌─────────────────────────────────────────────────────────────────┐
│                    乘积量化原理                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  原始向量 x ∈ R^D                                               │
│                                                                 │
│  划分为 M 个子向量：                                            │
│  x = [x¹, x², ..., x^M]                                        │
│  每个子向量维度 D/M                                             │
│                                                                 │
│  每个子空间有 K 个中心点（码本）：                               │
│  C^m = {c^m_1, c^m_2, ..., c^m_K}                             │
│                                                                 │
│  量化：                                                         │
│  q(x) = [c¹_{i₁}, c²_{i₂}, ..., c^M_{i_M}]                    │
│                                                                 │
│  编码：只需存储 M 个索引（每个索引 log₂K 位）                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```python
import numpy as np
from typing import Tuple

class ProductQuantizer:
    """乘积量化器"""
    
    def __init__(self, m: int = 8, k: int = 256):
        """
        Args:
            m: 子向量数量
            k: 每个子空间的中心点数量（通常 256）
        """
        self.m = m
        self.k = k
        self.centroids = None  # (M, K, D/M)
        self.sub_dim = None
    
    def train(self, data: np.ndarray, n_iter: int = 20):
        """
        训练码本
        
        Args:
            data: (N, D) 训练数据
            n_iter: K-Means 迭代次数
        """
        n, d = data.shape
        assert d % self.m == 0, "维度必须能被子向量数整除"
        
        self.sub_dim = d // self.m
        self.centroids = np.zeros((self.m, self.k, self.sub_dim), dtype=np.float32)
        
        # 对每个子空间独立训练 K-Means
        for m in range(self.m):
            # 提取子向量
            sub_vectors = data[:, m * self.sub_dim:(m + 1) * self.sub_dim]
            
            # K-Means 聚类
            self.centroids[m] = self._kmeans(sub_vectors, self.k, n_iter)
    
    def _kmeans(self, data: np.ndarray, k: int, n_iter: int) -> np.ndarray:
        """简化的 K-Means 实现"""
        n, d = data.shape
        
        # 随机初始化中心点
        indices = np.random.choice(n, k, replace=False)
        centroids = data[indices].copy()
        
        for _ in range(n_iter):
            # 分配到最近的中心点
            distances = self._compute_distances(data, centroids)
            labels = np.argmin(distances, axis=1)
            
            # 更新中心点
            for i in range(k):
                mask = labels == i
                if np.any(mask):
                    centroids[i] = np.mean(data[mask], axis=0)
        
        return centroids
    
    def _compute_distances(self, data: np.ndarray, centroids: np.ndarray) -> np.ndarray:
        """计算点到中心点距离"""
        # data: (N, D), centroids: (K, D)
        # 使用广播计算距离矩阵
        diff = data[:, np.newaxis, :] - centroids[np.newaxis, :, :]
        return np.sum(diff ** 2, axis=2)
    
    def encode(self, data: np.ndarray) -> np.ndarray:
        """
        编码向量
        
        Args:
            data: (N, D) 原始向量
        Returns:
            codes: (N, M) uint8 编码
        """
        n = data.shape[0]
        codes = np.zeros((n, self.m), dtype=np.uint8)
        
        for m in range(self.m):
            # 提取子向量
            sub_vectors = data[:, m * self.sub_dim:(m + 1) * self.sub_dim]
            
            # 找到最近的中心点
            distances = self._compute_distances(sub_vectors, self.centroids[m])
            codes[:, m] = np.argmin(distances, axis=1)
        
        return codes
    
    def decode(self, codes: np.ndarray) -> np.ndarray:
        """
        解码向量
        
        Args:
            codes: (N, M) uint8 编码
        Returns:
            data: (N, D) 解码向量
        """
        n = codes.shape[0]
        data = np.zeros((n, self.m * self.sub_dim), dtype=np.float32)
        
        for m in range(self.m):
            # 使用编码索引对应的中心点
            data[:, m * self.sub_dim:(m + 1) * self.sub_dim] = self.centroids[m, codes[:, m]]
        
        return data
    
    def compute_distance_table(self, query: np.ndarray) -> np.ndarray:
        """
        计算距离表（用于加速搜索）
        
        Args:
            query: (D,) 查询向量
        Returns:
            distance_table: (M, K) 距离表
        """
        table = np.zeros((self.m, self.k), dtype=np.float32)
        
        for m in range(self.m):
            sub_query = query[m * self.sub_dim:(m + 1) * self.sub_dim]
            # 计算子查询向量到所有中心点的距离
            diff = self.centroids[m] - sub_query
            table[m] = np.sum(diff ** 2, axis=1)
        
        return table
    
    def asymmetric_distance(
        self,
        query: np.ndarray,
        codes: np.ndarray
    ) -> np.ndarray:
        """
        非对称距离计算（ADC）
        
        查询向量不量化，数据库向量量化
        
        Args:
            query: (D,) 查询向量
            codes: (N, M) 数据库编码
        Returns:
            distances: (N,) 距离
        """
        # 预计算距离表
        table = self.compute_distance_table(query)
        
        # 查表累加
        n = codes.shape[0]
        distances = np.zeros(n, dtype=np.float32)
        
        for m in range(self.m):
            distances += table[m, codes[:, m]]
        
        return distances


# 使用示例
data = np.random.randn(100000, 128).astype(np.float32)
query = np.random.randn(128).astype(np.float32)

# 训练 PQ
pq = ProductQuantizer(m=8, k=256)  # 8 个子向量，256 个中心点
pq.train(data)

# 编码
codes = pq.encode(data)

# 压缩比计算
original_size = data.nbytes
compressed_size = codes.nbytes + pq.centroids.nbytes
print(f"原始大小: {original_size / 1024 / 1024:.2f} MB")
print(f"压缩后大小: {compressed_size / 1024 / 1024:.2f} MB")
print(f"压缩比: {original_size / compressed_size:.1f}x")

# 搜索
distances = pq.asymmetric_distance(query, codes)
top_k_indices = np.argsort(distances)[:10]
print(f"Top-10 索引: {top_k_indices}")
```

### 4.4 PQ 压缩比分析

```
┌─────────────────────────────────────────────────────────────────┐
│                    PQ 压缩比计算                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  原始向量：D 维 float32 = 4D bytes                              │
│                                                                 │
│  PQ 编码：M 个 uint8 索引 = M bytes                             │
│  码本：M × K × (D/M) × 4 bytes                                  │
│                                                                 │
│  示例：D=128, M=8, K=256, N=100万                               │
│                                                                 │
│  原始大小：N × 4D = 100万 × 512 = 488 MB                        │
│  编码大小：N × M = 100万 × 8 = 8 MB                             │
│  码本大小：M × K × D/M × 4 = 8 × 256 × 16 × 4 = 0.125 MB        │
│                                                                 │
│  总压缩大小：~8 MB                                              │
│  压缩比：~61x                                                   │
│                                                                 │
│  注意：码本大小与 N 无关，数据量越大压缩比越高                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.5 非对称距离计算（ADC）

PQ 的关键优势是使用距离表进行快速距离计算：

```python
def asymmetric_distance_computation(query, codes, centroids):
    """
    非对称距离计算（ADC）流程
    
    1. 预计算查询向量到各子空间中心点的距离
    2. 通过查表累加得到距离
    """
    M, K, sub_dim = centroids.shape
    
    # Step 1: 构建距离表 (M, K)
    distance_table = np.zeros((M, K))
    for m in range(M):
        sub_query = query[m * sub_dim:(m + 1) * sub_dim]
        diff = centroids[m] - sub_query
        distance_table[m] = np.sum(diff ** 2, axis=1)
    
    # Step 2: 查表累加 (N 次查表，而非 N×D 次乘法)
    distances = np.zeros(len(codes))
    for m in range(M):
        distances += distance_table[m, codes[:, m]]
    
    return distances

# ADC vs 暴力计算复杂度对比
# 暴力：O(N × D) 次乘法
# ADC：O(M × K) 预计算 + O(N × M) 次查表
# 当 K << N 时，ADC 有巨大优势
```

## 五、索引性能评估

### 5.1 评估指标

向量索引的性能评估需要考虑多个维度：

```
┌─────────────────────────────────────────────────────────────────┐
│                    索引性能评估指标                              │
├───────────────┬─────────────────────────────────────────────────┤
│ 指标          │ 说明                                             │
├───────────────┼─────────────────────────────────────────────────┤
│ Recall@K      │ 召回率：返回的 Top-K 中正确结果的比例            │
│               │ = |结果 ∩ 真实 Top-K| / K                        │
├───────────────┼─────────────────────────────────────────────────┤
│ Latency       │ 查询延迟：单次查询的响应时间（ms）               │
├───────────────┼─────────────────────────────────────────────────┤
│ QPS           │ 每秒查询数：系统吞吐量                           │
├───────────────┼─────────────────────────────────────────────────┤
│ Memory        │ 内存占用：索引结构所需内存                       │
├───────────────┼─────────────────────────────────────────────────┤
│ Build Time    │ 构建时间：索引构建所需时间                       │
├───────────────┼─────────────────────────────────────────────────┤
│ Index Size    │ 索引大小：磁盘存储占用                           │
└───────────────┴─────────────────────────────────────────────────┘
```

### 5.2 召回率计算

```python
def compute_recall(
    predicted_indices: np.ndarray,  # (Q, K) 预测的 Top-K 索引
    ground_truth_indices: np.ndarray,  # (Q, K) 真实的 Top-K 索引
    k: int = None
) -> float:
    """
    计算召回率 Recall@K
    
    Args:
        predicted_indices: 预测结果
        ground_truth_indices: 真实结果
        k: 计算 Recall@k，默认使用全部
    
    Returns:
        recall: 平均召回率
    """
    if k is not None:
        predicted_indices = predicted_indices[:, :k]
        ground_truth_indices = ground_truth_indices[:, :k]
    
    recalls = []
    for pred, gt in zip(predicted_indices, ground_truth_indices):
        # 计算交集大小
        intersection = len(set(pred) & set(gt))
        recalls.append(intersection / len(gt))
    
    return np.mean(recalls)


# 完整评估流程
def evaluate_index(
    index,
    queries: np.ndarray,
    ground_truth: np.ndarray,
    k: int = 10
) -> dict:
    """
    评估索引性能
    
    Args:
        index: 向量索引对象
        queries: (Q, D) 查询向量
        ground_truth: (Q, k) 真实 Top-K 索引
        k: Top-K
    
    Returns:
        metrics: 性能指标字典
    """
    import time
    
    # 查询延迟
    start = time.time()
    predicted_indices, distances = index.search(queries, k)
    latency = (time.time() - start) / len(queries) * 1000  # ms per query
    
    # 召回率
    recall = compute_recall(predicted_indices, ground_truth, k)
    
    # QPS
    qps = len(queries) / (latency / 1000 * len(queries))
    
    return {
        "recall": recall,
        "latency_ms": latency,
        "qps": qps,
        "memory_mb": index.get_memory_usage() / 1024 / 1024,
    }
```

### 5.3 召回率与延迟的权衡

```
┌─────────────────────────────────────────────────────────────────┐
│                    Recall vs Latency 权衡曲线                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Recall                                                         │
│    1.0 ─┬───────────────────────────────────────────────       │
│        │                  ╱ HNSW                               │
│    0.95├─────────────────╱───────────────────────              │
│        │              ╱                                         │
│    0.90├───────────╱─────────────── IVF                        │
│        │        ╱                                               │
│    0.85├─────╱───────────────────────────────                  │
│        │  ╱         LSH                                        │
│    0.80├╱                                                        │
│        │                                                        │
│        └─────────────────────────────────────────────► Latency │
│              1ms    5ms    10ms    50ms    100ms               │
│                                                                 │
│  一般规律：                                                      │
│  • 召回率越高，延迟越大                                         │
│  • 不同索引类型的曲线形状不同                                   │
│  • 需要根据业务需求选择合适的工作点                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 不同索引的性能对比

```python
# 性能对比示例（伪代码）
"""
数据集：SIFT-1M (100万向量，128维)
硬件：Intel i7, 32GB RAM
K = 10
"""

results = {
    "FLAT": {
        "recall": 1.000,
        "latency_ms": 15.0,
        "memory_gb": 0.5,
        "build_time_s": 0,
    },
    "IVF-Flat (nlist=4096, nprobe=64)": {
        "recall": 0.985,
        "latency_ms": 0.8,
        "memory_gb": 0.5,
        "build_time_s": 30,
    },
    "IVF-PQ (m=16, nlist=4096)": {
        "recall": 0.920,
        "latency_ms": 0.3,
        "memory_gb": 0.08,
        "build_time_s": 60,
    },
    "HNSW (M=32, efSearch=64)": {
        "recall": 0.995,
        "latency_ms": 0.5,
        "memory_gb": 1.2,
        "build_time_s": 300,
    },
    "DiskANN (R=64, L=100)": {
        "recall": 0.950,
        "latency_ms": 2.0,
        "memory_gb": 0.3,  # 大部分在磁盘
        "build_time_s": 600,
    },
}

# 打印对比表
print("| 索引 | Recall | Latency (ms) | Memory (GB) |")
print("|------|--------|--------------|-------------|")
for name, m in results.items():
    print(f"| {name} | {m['recall']:.3f} | {m['latency_ms']:.1f} | {m['memory_gb']:.2f} |")
```

## 六、SIMD 向量化加速

### 6.1 SIMD 原理

SIMD（Single Instruction Multiple Data）允许一条指令同时处理多个数据：

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIMD 原理示意                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  标量处理（逐个处理）：                                          │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐                                       │
│  │ a │ │ b │ │ c │ │ d │  ──►  4 次乘法                        │
│  └───┘ └───┘ └───┘ └───┘                                       │
│    ×     ×     ×     ×                                         │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐                                       │
│  │ e │ │ f │ │ g │ │ h │                                       │
│  └───┘ └───┘ └───┘ └───┘                                       │
│                                                                 │
│  SIMD 处理（并行处理）：                                         │
│  ┌───────────────────┐                                         │
│  │ a │ b │ c │ d │  ──►  1 次向量乘法                          │
│  └───────────────────┘                                         │
│           ×                                                     │
│  ┌───────────────────┐                                         │
│  │ e │ f │ g │ h │                                             │
│  └───────────────────┘                                         │
│                                                                 │
│  加速比 = SIMD 宽度（AVX-256: 8x float32）                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 使用 NumPy 的 SIMD 优化

NumPy 自动使用 SIMD 加速，但需要正确配置：

```python
import numpy as np

# 检查 BLAS 配置
np.show_config()

# 确保数据连续存储（SIMD 友好）
def ensure_contiguous(arr: np.ndarray) -> np.ndarray:
    """确保数组是 C 连续的"""
    if not arr.flags['C_CONTIGUOUS']:
        return np.ascontiguousarray(arr)
    return arr

# 批量点积（SIMD 优化）
def batch_dot_product(
    queries: np.ndarray,  # (B, D)
    database: np.ndarray  # (N, D)
) -> np.ndarray:
    """
    批量计算点积
    
    利用矩阵乘法自动使用 SIMD
    """
    # 确保连续存储
    queries = ensure_contiguous(queries)
    database = ensure_contiguous(database)
    
    # 矩阵乘法（BLAS 会使用 SIMD）
    return np.dot(queries, database.T)

# 批量 L2 距离
def batch_l2_distance(
    queries: np.ndarray,  # (B, D)
    database: np.ndarray  # (N, D)
) -> np.ndarray:
    """
    批量计算 L2 距离
    
    利用公式：||q - v||² = ||q||² + ||v||² - 2*q·v
    """
    q_sq = np.sum(queries ** 2, axis=1, keepdims=True)  # (B, 1)
    v_sq = np.sum(database ** 2, axis=1)  # (N,)
    qv = np.dot(queries, database.T)  # (B, N) - SIMD 加速
    
    distances_sq = q_sq + v_sq - 2 * qv
    return np.sqrt(np.maximum(distances_sq, 0))
```

### 6.3 Faiss 的 SIMD 优化

Faiss 库针对 SIMD 进行了深度优化：

```python
import faiss
import numpy as np

# 创建使用 SIMD 优化的索引
d = 128
n = 1000000

# 生成数据
data = np.random.randn(n, d).astype(np.float32)

# IndexFlatL2 使用 SIMD 优化的暴力搜索
index_flat = faiss.IndexFlatL2(d)
index_flat.add(data)

# 批量搜索（自动并行）
queries = np.random.randn(100, d).astype(np.float32)
distances, indices = index_flat.search(queries, k=10)

# 使用 AVX 指令集
# Faiss 编译时会检测 CPU 支持的指令集
print(f"Faiss 使用 AVX: {faiss.get_num_gpus() >= 0}")  # 检查是否可用

# 对于 CPU 密集型操作，可以设置线程数
faiss.omp_set_num_threads(8)  # 使用 8 个 OpenMP 线程
```

### 6.4 手写 SIMD（进阶）

对于极致性能，可以使用 Cython 或 C++ 编写 SIMD 代码：

```cpp
// 使用 AVX2 加速点积
#include <immintrin.h>

float dot_product_avx2(const float* a, const float* b, int dim) {
    __m256 sum = _mm256_setzero_ps();
    
    // 每次处理 8 个 float
    for (int i = 0; i < dim; i += 8) {
        __m256 va = _mm256_loadu_ps(a + i);
        __m256 vb = _mm256_loadu_ps(b + i);
        sum = _mm256_fmadd_ps(va, vb, sum);  // FMA: sum += va * vb
    }
    
    // 水平求和
    __m128 hi = _mm256_extractf128_ps(sum, 1);
    __m128 lo = _mm256_castps256_ps128(sum);
    __m128 sum128 = _mm_add_ps(hi, lo);
    sum128 = _mm_hadd_ps(sum128, sum128);
    sum128 = _mm_hadd_ps(sum128, sum128);
    
    return _mm_cvtss_f32(sum128);
}
```

## 七、实践：从零实现简单 ANN 索引

### 7.1 实现一个简单的 IVF 索引

```python
import numpy as np
from typing import Tuple, Optional

class SimpleIVFIndex:
    """
    简单的 IVF (Inverted File Index) 实现
    
    原理：
    1. 使用 K-Means 将向量聚类到 nlist 个桶
    2. 搜索时只搜索最近的 nprobe 个桶
    """
    
    def __init__(self, d: int, nlist: int = 100, metric: str = "l2"):
        """
        Args:
            d: 向量维度
            nlist: 聚类中心数量（桶数）
            metric: 距离度量
        """
        self.d = d
        self.nlist = nlist
        self.metric = metric
        self.centroids = None  # (nlist, d)
        self.inverted_lists = None  # List[np.ndarray]
    
    def train(self, data: np.ndarray, n_iter: int = 20):
        """
        训练索引：K-Means 聚类
        
        Args:
            data: (N, D) 训练数据
            n_iter: K-Means 迭代次数
        """
        n = data.shape[0]
        
        # 随机初始化中心点
        indices = np.random.choice(n, self.nlist, replace=False)
        self.centroids = data[indices].copy()
        
        # K-Means 迭代
        for _ in range(n_iter):
            # 分配到最近的中心点
            distances = self._compute_distances(data, self.centroids)
            labels = np.argmin(distances, axis=1)
            
            # 更新中心点
            for i in range(self.nlist):
                mask = labels == i
                if np.any(mask):
                    self.centroids[i] = np.mean(data[mask], axis=0)
    
    def add(self, data: np.ndarray):
        """
        添加向量到索引
        
        Args:
            data: (N, D) 向量数据
        """
        # 分配到桶
        distances = self._compute_distances(data, self.centroids)
        labels = np.argmin(distances, axis=1)
        
        # 构建倒排列表
        self.inverted_lists = [[] for _ in range(self.nlist)]
        for idx, label in enumerate(labels):
            self.inverted_lists[label].append(idx)
        
        # 转换为 numpy 数组并存储向量
        self.inverted_lists = [np.array(lst, dtype=np.int64) for lst in self.inverted_lists]
        self.data = data
    
    def search(
        self,
        query: np.ndarray,
        k: int = 10,
        nprobe: int = 10
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        搜索最近邻
        
        Args:
            query: (D,) 查询向量
            k: 返回数量
            nprobe: 搜索的桶数
        
        Returns:
            indices: (k,) 索引
            distances: (k,) 距离
        """
        # 找到最近的 nprobe 个桶
        centroid_distances = self._compute_distances(query.reshape(1, -1), self.centroids)[0]
        nearest_buckets = np.argpartition(centroid_distances, nprobe)[:nprobe]
        
        # 收集候选向量
        candidates = []
        for bucket in nearest_buckets:
            candidates.extend(self.inverted_lists[bucket])
        candidates = np.array(candidates, dtype=np.int64)
        
        if len(candidates) == 0:
            return np.array([], dtype=np.int64), np.array([], dtype=np.float32)
        
        # 计算候选向量的距离
        candidate_vectors = self.data[candidates]
        distances = self._compute_distances(query.reshape(1, -1), candidate_vectors)[0]
        
        # 返回 Top-K
        if len(candidates) <= k:
            order = np.argsort(distances)
        else:
            order = np.argpartition(distances, k)[:k]
            order = order[np.argsort(distances[order])]
        
        return candidates[order], distances[order]
    
    def _compute_distances(
        self,
        queries: np.ndarray,
        database: np.ndarray
    ) -> np.ndarray:
        """计算距离矩阵"""
        if self.metric == "l2":
            # ||q - v||² = ||q||² + ||v||² - 2*q·v
            q_sq = np.sum(queries ** 2, axis=1, keepdims=True)
            v_sq = np.sum(database ** 2, axis=1)
            qv = np.dot(queries, database.T)
            return np.sqrt(np.maximum(q_sq + v_sq - 2 * qv, 0))
        elif self.metric == "ip":
            return -np.dot(queries, database.T)
        else:
            raise ValueError(f"Unknown metric: {self.metric}")


# 使用示例
np.random.seed(42)

# 生成数据
n, d = 100000, 128
data = np.random.randn(n, d).astype(np.float32)
query = np.random.randn(d).astype(np.float32)

# 创建并训练索引
index = SimpleIVFIndex(d=d, nlist=100)
index.train(data)
index.add(data)

# 搜索
indices, distances = index.search(query, k=10, nprobe=10)
print(f"Top-10 索引: {indices}")
print(f"Top-10 距离: {distances}")
```

### 7.2 性能对比测试

```python
import time

def benchmark_index(
    data: np.ndarray,
    queries: np.ndarray,
    k: int = 10
):
    """对比测试不同索引的性能"""
    n, d = data.shape
    
    # 1. 暴力搜索
    start = time.time()
    for q in queries:
        distances = np.linalg.norm(data - q, axis=1)
        _ = np.argpartition(distances, k)[:k]
    flat_time = time.time() - start
    
    # 2. IVF 索引
    index = SimpleIVFIndex(d=d, nlist=100)
    
    # 训练时间
    start = time.time()
    index.train(data)
    train_time = time.time() - start
    
    # 添加时间
    start = time.time()
    index.add(data)
    add_time = time.time() - start
    
    # 搜索时间
    start = time.time()
    for q in queries:
        index.search(q, k=k, nprobe=10)
    ivf_time = time.time() - start
    
    print(f"暴力搜索: {flat_time:.3f}s")
    print(f"IVF 训练: {train_time:.3f}s")
    print(f"IVF 添加: {add_time:.3f}s")
    print(f"IVF 搜索: {ivf_time:.3f}s")
    print(f"加速比: {flat_time / ivf_time:.1f}x")


# 运行测试
data = np.random.randn(100000, 128).astype(np.float32)
queries = np.random.randn(100, 128).astype(np.float32)
benchmark_index(data, queries)
```

## 总结

本文介绍了向量索引的基础知识，包括：

1. **相似度度量**：L2 距离、内积、余弦相似度的原理和适用场景
2. **暴力搜索**：算法原理、性能优化技术（SIMD、Faiss）
3. **ANN 概念**：为什么需要 ANN、算法分类
4. **向量量化**：标量量化（SQ）、乘积量化（PQ）的原理和实现
5. **性能评估**：召回率、延迟、QPS 等指标
6. **SIMD 加速**：利用向量指令提升计算性能

下一章将深入分析 IVF（倒排文件索引）家族，包括 IVF-Flat、IVF-PQ、IVF-SQ8 等索引的原理、实现和调优方法。

## 参考资料

- [Faiss: A library for efficient similarity search](https://github.com/facebookresearch/faiss)
- [Product Quantization for Nearest Neighbor Search](https://lear.inrialpes.fr/pubs/2011/JDS11/jegou_searching_with_quantization.pdf)
- [Scalable Nearest Neighbor Search with Vantage Point Trees](https://papers.nips.cc/paper/2012/file/be215796bb15e2b9b8f2e3f509943af3-Paper.pdf)
- [Milvus Documentation](https://milvus.io/docs)
