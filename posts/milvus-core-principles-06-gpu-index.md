---
title: "Milvus底层原理（六）：GPU索引加速"
date: "2026-03-10"
excerpt: "深入理解 GPU 加速向量搜索的原理，掌握 CUDA 编程模型、GPU 索引实现和性能优化策略，利用 GPU 大规模并行计算能力实现高性能向量检索。"
tags: ["Milvus", "向量数据库", "GPU", "CUDA", "并行计算"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 6
---

## 前言

GPU（图形处理器）最初用于图形渲染，但其大规模并行计算能力使其成为深度学习和向量搜索的理想硬件。相比 CPU，GPU 拥有数千个计算核心，能够同时处理大量向量距离计算，实现数量级的性能提升。

本文将深入分析 GPU 加速向量搜索的原理，包括 CUDA 编程模型、GPU 索引实现、内存优化策略和 Milvus 中的 GPU 索引支持。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| CUDA 编程模型 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| GPU 内存层次 | ⭐⭐⭐⭐ | 架构设计 | ✅ |
| GPU IVF 实现 | ⭐⭐⭐⭐ | 源码级 | ✅ |
| 性能优化策略 | ⭐⭐⭐ | 实战技能 | ✅ |
| CPU vs GPU 对比 | ⭐⭐⭐ | 架构选型 | ✅ |

## 面试考点

1. GPU 为什么适合向量搜索？
2. CUDA 的线程层次结构是怎样的？
3. GPU 索引相比 CPU 索引有什么优势？
4. 如何优化 GPU 内存访问？
5. 什么场景适合使用 GPU 索引？

## 一、GPU 架构基础

### 1.1 GPU vs CPU 架构对比

```
┌─────────────────────────────────────────────────────────────────┐
│                    GPU vs CPU 架构对比                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CPU: 低延迟，强单线程                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐           │   │
│  │  │ Core 0│  │ Core 1│  │ Core 2│  │ Core 3│           │   │
│  │  │(强大) │  │(强大) │  │(强大) │  │(强大) │           │   │
│  │  └───────┘  └───────┘  └───────┘  └───────┘           │   │
│  │                    大缓存 (30MB+)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  GPU: 高吞吐，大规模并行                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐   │   │
│  │  │C││C││C││C││C││C││C││C││C││C││C││C││C││C││C││C│     │   │
│  │  └─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘   │   │
│  │  ... 数千个小核心 ...                                   │   │
│  │  ┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐   │   │
│  │  │C││C││C││C││C││C││C││C││C││C││C││C││C││C││C││C│     │   │
│  │  └─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘   │   │
│  │                  高带宽内存 (HBM)                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  关键差异：                                                      │
│  • CPU: 少量强核心，大缓存，低延迟                             │
│  • GPU: 大量弱核心，高带宽，高吞吐                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 GPU 适合向量搜索的原因

```
┌─────────────────────────────────────────────────────────────────┐
│                    GPU 适合向量搜索的原因                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  向量搜索的计算特点：                                            │
│  • 大量独立的距离计算                                           │
│  • 每次计算相同操作（点积、L2）                                 │
│  • 高度数据并行                                                 │
│                                                                 │
│  GPU 优势：                                                      │
│  • 数千核心并行计算距离                                         │
│  • 高内存带宽（A100: 2TB/s vs CPU: ~100GB/s）                  │
│  • 专用 Tensor Core 加速矩阵运算                                │
│                                                                 │
│  性能提升示例：                                                  │
│  • IVF 搜索：GPU 比 CPU 快 10-50x                              │
│  • 暴力搜索：GPU 比 CPU 快 100x+                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、CUDA 编程模型

### 2.1 线程层次结构

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUDA 线程层次结构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Grid (网格)                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Block (0,0)                          │   │
│  │  ┌──────────────────────────────────────────────────┐  │   │
│  │  │ Thread(0,0) Thread(1,0) Thread(2,0) ...          │  │   │
│  │  │ Thread(0,1) Thread(1,1) Thread(2,1) ...          │  │   │
│  │  │ Thread(0,2) Thread(1,2) Thread(2,2) ...          │  │   │
│  │  │ ...                                              │  │   │
│  │  └──────────────────────────────────────────────────┘  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                    Block (1,0)                          │   │
│  │  ┌──────────────────────────────────────────────────┐  │   │
│  │  │ ...                                              │  │   │
│  │  └──────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  层次关系：                                                      │
│  • Grid: 一个 kernel 启动的所有线程                            │
│  • Block: 线程块，共享内存，可同步                              │
│  • Thread: 最小执行单元                                        │
│                                                                 │
│  索引计算：                                                      │
│  • blockIdx: 块索引                                            │
│  • threadIdx: 线程索引                                         │
│  • blockDim: 块大小                                            │
│  • globalIdx = blockIdx * blockDim + threadIdx                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 内存层次结构

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUDA 内存层次结构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 全局内存 (Global Memory)                │   │
│  │                    容量大，延迟高                        │   │
│  │                   16-80 GB (A100)                       │   │
│  │                      带宽: 2 TB/s                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 共享内存 (Shared Memory)                │   │
│  │              块内共享，低延迟，用户管理                  │   │
│  │                   48-164 KB/SM                          │   │
│  │                    带宽: ~20 TB/s                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 寄存器 (Registers)                      │   │
│  │                  线程私有，最快                          │   │
│  │                  64K 32-bit/SM                          │   │
│  │                   带宽: ~100 TB/s                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  优化原则：                                                      │
│  • 减少全局内存访问（合并访问）                                 │
│  • 利用共享内存缓存热数据                                       │
│  • 充分利用寄存器                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 CUDA 向量距离计算示例

```cuda
// kernel_l2_distance.cu

// L2 距离计算 Kernel
__global__ void l2_distance_kernel(
    const float* __restrict__ queries,    // (batch, dim)
    const float* __restrict__ database,   // (n, dim)
    float* __restrict__ distances,        // (batch, n)
    int batch_size,
    int n_vectors,
    int dim
) {
    // 计算全局线程索引
    int batch_idx = blockIdx.y;
    int vec_idx = blockIdx.x * blockDim.x + threadIdx.x;
    
    if (batch_idx >= batch_size || vec_idx >= n_vectors) {
        return;
    }
    
    // 使用共享内存优化
    extern __shared__ float shared_query[];
    
    // 协作加载查询向量到共享内存
    for (int i = threadIdx.x; i < dim; i += blockDim.x) {
        shared_query[i] = queries[batch_idx * dim + i];
    }
    __syncthreads();
    
    // 计算 L2 距离
    float dist = 0.0f;
    for (int i = 0; i < dim; i++) {
        float diff = shared_query[i] - database[vec_idx * dim + i];
        dist += diff * diff;
    }
    
    // 写入结果
    distances[batch_idx * n_vectors + vec_idx] = sqrtf(dist);
}

// 主机端调用
void compute_l2_distances(
    const float* queries,
    const float* database,
    float* distances,
    int batch_size,
    int n_vectors,
    int dim
) {
    // 分配 GPU 内存
    float *d_queries, *d_database, *d_distances;
    cudaMalloc(&d_queries, batch_size * dim * sizeof(float));
    cudaMalloc(&d_database, n_vectors * dim * sizeof(float));
    cudaMalloc(&d_distances, batch_size * n_vectors * sizeof(float));
    
    // 拷贝数据到 GPU
    cudaMemcpy(d_queries, queries, batch_size * dim * sizeof(float), cudaMemcpyHostToDevice);
    cudaMemcpy(d_database, database, n_vectors * dim * sizeof(float), cudaMemcpyHostToDevice);
    
    // 配置 kernel
    dim3 blockSize(256);
    dim3 gridSize((n_vectors + 255) / 256, batch_size);
    size_t shared_mem = dim * sizeof(float);
    
    // 启动 kernel
    l2_distance_kernel<<<gridSize, blockSize, shared_mem>>>(
        d_queries, d_database, d_distances,
        batch_size, n_vectors, dim
    );
    
    // 拷贝结果回主机
    cudaMemcpy(distances, d_distances, batch_size * n_vectors * sizeof(float), cudaMemcpyDeviceToHost);
    
    // 释放内存
    cudaFree(d_queries);
    cudaFree(d_database);
    cudaFree(d_distances);
}
```

## 三、GPU IVF 索引实现

### 3.1 GPU IVF-Flat

```python
import faiss
import numpy as np

class GPU_IVFFlatIndex:
    """GPU IVF-Flat 索引"""
    
    def __init__(self, d: int, nlist: int, nprobe: int = 10):
        """
        Args:
            d: 向量维度
            nlist: 聚类中心数量
            nprobe: 搜索时扫描的桶数
        """
        self.d = d
        self.nlist = nlist
        self.nprobe = nprobe
        
        # 获取 GPU 资源
        self.res = faiss.StandardGpuResources()
        
        # 创建 CPU 索引
        self.cpu_index = faiss.IndexIVFFlat(faiss.IndexFlatL2(d), d, nlist)
        
        # 转移到 GPU
        self.gpu_index = faiss.index_cpu_to_gpu(self.res, 0, self.cpu_index)
        
        self.trained = False
    
    def train(self, data: np.ndarray):
        """训练索引"""
        self.gpu_index.train(data)
        self.trained = True
    
    def add(self, data: np.ndarray):
        """添加向量"""
        if not self.trained:
            self.train(data)
        self.gpu_index.add(data)
    
    def search(self, query: np.ndarray, k: int) -> tuple:
        """搜索"""
        self.gpu_index.nprobe = self.nprobe
        distances, indices = self.gpu_index.search(query, k)
        return indices, distances
    
    def to_cpu(self):
        """转移到 CPU"""
        return faiss.index_gpu_to_cpu(self.gpu_index)


# 使用示例
if __name__ == "__main__":
    # 准备数据
    n, d = 1000000, 768
    data = np.random.randn(n, d).astype(np.float32)
    query = np.random.randn(1, d).astype(np.float32)
    
    # 创建 GPU 索引
    index = GPU_IVFFlatIndex(d=d, nlist=1024, nprobe=64)
    
    # 训练和添加
    index.train(data[:10000])  # 用采样数据训练
    index.add(data)
    
    # 搜索
    indices, distances = index.search(query, k=10)
    print(f"Top-10 indices: {indices}")
    print(f"Top-10 distances: {distances}")
```

### 3.2 GPU IVF-PQ

```python
class GPU_IVFPQIndex:
    """GPU IVF-PQ 索引"""
    
    def __init__(self, d: int, nlist: int, m: int, nprobe: int = 10):
        """
        Args:
            d: 向量维度
            nlist: 聚类中心数量
            m: PQ 子向量数
            nprobe: 搜索时扫描的桶数
        """
        assert d % m == 0
        
        self.d = d
        self.nlist = nlist
        self.m = m
        self.nprobe = nprobe
        
        # GPU 资源
        self.res = faiss.StandardGpuResources()
        
        # 创建 CPU IVF-PQ 索引
        quantizer = faiss.IndexFlatL2(d)
        self.cpu_index = faiss.IndexIVFPQ(quantizer, d, nlist, m, 8)
        
        # 转移到 GPU
        self.gpu_index = faiss.index_cpu_to_gpu(self.res, 0, self.cpu_index)
        
        self.trained = False
    
    def train(self, data: np.ndarray):
        """训练索引"""
        self.gpu_index.train(data)
        self.trained = True
    
    def add(self, data: np.ndarray):
        """添加向量"""
        if not self.trained:
            self.train(data)
        self.gpu_index.add(data)
    
    def search(self, query: np.ndarray, k: int) -> tuple:
        """搜索"""
        self.gpu_index.nprobe = self.nprobe
        distances, indices = self.gpu_index.search(query, k)
        return indices, distances
```

### 3.3 多 GPU 支持

```python
class MultiGPU_IVFIndex:
    """多 GPU IVF 索引"""
    
    def __init__(self, d: int, nlist: int, nprobe: int = 10, gpu_ids: list = [0, 1]):
        """
        Args:
            d: 向量维度
            nlist: 聚类中心数量
            nprobe: 搜索时扫描的桶数
            gpu_ids: GPU ID 列表
        """
        self.d = d
        self.nlist = nlist
        self.nprobe = nprobe
        self.gpu_ids = gpu_ids
        
        # 创建多 GPU 资源
        self.resources = [faiss.StandardGpuResources() for _ in gpu_ids]
        
        # 创建索引副本
        self.indices = []
        for gpu_id in gpu_ids:
            quantizer = faiss.IndexFlatL2(d)
            index = faiss.IndexIVFFlat(quantizer, d, nlist)
            gpu_index = faiss.index_cpu_to_gpu(self.resources[gpu_id], gpu_id, index)
            self.indices.append(gpu_index)
    
    def add(self, data: np.ndarray):
        """分片添加向量到各 GPU"""
        n = len(data)
        shard_size = n // len(self.gpu_ids)
        
        for i, gpu_id in enumerate(self.gpu_ids):
            start = i * shard_size
            end = (i + 1) * shard_size if i < len(self.gpu_ids) - 1 else n
            self.indices[i].train(data[start:end])
            self.indices[i].add(data[start:end])
    
    def search(self, query: np.ndarray, k: int) -> tuple:
        """并行搜索并归并结果"""
        all_indices = []
        all_distances = []
        
        for index in self.indices:
            index.nprobe = self.nprobe
            distances, indices = index.search(query, k)
            all_indices.append(indices)
            all_distances.append(distances)
        
        # 归并结果
        # ... (实现归并逻辑)
        
        return merged_indices, merged_distances
```

## 四、GPU 内存优化

### 4.1 内存合并访问

```
┌─────────────────────────────────────────────────────────────────┐
│                    GPU 内存合并访问                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  非合并访问（低效）：                                            │
│  Thread 0: 读取 data[0]    │  内存事务 1                        │
│  Thread 1: 读取 data[128]  │  内存事务 2                        │
│  Thread 2: 读取 data[256]  │  内存事务 3                        │
│  ...                                                            │
│  问题：每次内存事务只传输少量数据                               │
│                                                                 │
│  合并访问（高效）：                                              │
│  Thread 0: 读取 data[0]    ┐                                    │
│  Thread 1: 读取 data[1]    │  单次内存事务                      │
│  Thread 2: 读取 data[2]    │  传输 128 字节                     │
│  ...                       ┘                                    │
│  优化：充分利用内存带宽                                         │
│                                                                 │
│  优化方法：                                                      │
│  • 确保相邻线程访问相邻内存                                     │
│  • 向量按列主序存储时需要转置                                   │
│  • 使用共享内存重排数据                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 共享内存优化

```cuda
// 使用共享内存优化矩阵乘法
__global__ void matrix_vector_mult(
    const float* __restrict__ matrix,  // (n, d)
    const float* __restrict__ vector,  // (d,)
    float* __restrict__ result,        // (n,)
    int n, int d
) {
    // 共享内存缓存向量
    __shared__ float shared_vec[TILE_SIZE];
    
    int row = blockIdx.x * blockDim.x + threadIdx.x;
    int tid = threadIdx.x;
    
    float sum = 0.0f;
    
    // 分块加载向量到共享内存
    for (int tile = 0; tile < (d + TILE_SIZE - 1) / TILE_SIZE; tile++) {
        int col = tile * TILE_SIZE + tid;
        if (col < d) {
            shared_vec[tid] = vector[col];
        }
        __syncthreads();
        
        // 计算部分结果
        if (row < n) {
            for (int i = 0; i < TILE_SIZE && tile * TILE_SIZE + i < d; i++) {
                sum += matrix[row * d + tile * TILE_SIZE + i] * shared_vec[i];
            }
        }
        __syncthreads();
    }
    
    if (row < n) {
        result[row] = sum;
    }
}
```

### 4.3 内存池管理

```python
class GPUMemoryPool:
    """GPU 内存池管理"""
    
    def __init__(self, total_memory_mb: int):
        """
        Args:
            total_memory_mb: 总内存大小（MB）
        """
        self.total_memory = total_memory_mb * 1024 * 1024
        self.used_memory = 0
        self.allocations = {}
    
    def allocate(self, size: int, name: str) -> int:
        """
        分配内存
        
        Args:
            size: 分配大小（字节）
            name: 分配名称
        
        Returns:
            ptr: 内存指针
        """
        if self.used_memory + size > self.total_memory:
            # 尝试释放不活跃的内存
            self._evict_lru()
        
        ptr = faiss.GpuMemoryAllocation(size)
        self.allocations[name] = {
            'ptr': ptr,
            'size': size,
            'last_used': time.time()
        }
        self.used_memory += size
        
        return ptr
    
    def free(self, name: str):
        """释放内存"""
        if name in self.allocations:
            alloc = self.allocations[name]
            faiss.GpuMemoryFree(alloc['ptr'])
            self.used_memory -= alloc['size']
            del self.allocations[name]
    
    def _evict_lru(self):
        """LRU 淘汰"""
        # 找到最久未使用的分配
        lru_name = min(self.allocations, key=lambda x: self.allocations[x]['last_used'])
        self.free(lru_name)
```

## 五、性能优化策略

### 5.1 批处理优化

```
┌─────────────────────────────────────────────────────────────────┐
│                    GPU 批处理优化                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  单次查询（低效）：                                              │
│  • 数据传输开销占比高                                           │
│  • GPU 利用率低                                                │
│                                                                 │
│  批量查询（高效）：                                              │
│  • 分摊数据传输开销                                             │
│  • 充分利用 GPU 并行能力                                       │
│                                                                 │
│  推荐批大小：                                                    │
│  • 小向量 (D=128): batch_size = 1000+                          │
│  • 中等向量 (D=768): batch_size = 100-500                      │
│  • 大向量 (D=1536): batch_size = 50-100                        │
│                                                                 │
│  吞吐量对比：                                                    │
│  单次查询: ~1000 QPS                                           │
│  批量查询 (batch=100): ~50000 QPS                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 精度与速度权衡

```python
# GPU 支持不同精度计算

# FP32 (默认，高精度)
index_fp32 = faiss.index_cpu_to_gpu(res, 0, faiss.IndexFlatL2(d))

# FP16 (半精度，更快)
index_fp16 = faiss.index_cpu_to_gpu(res, 0, faiss.IndexFlatL2(d))
index_fp16.setFloat16(true)

# INT8 (量化，最快)
# 需要训练量化器
quantizer = faiss.IndexScalarQuantizer(d, faiss.ScalarQuantizer.QT_8bit)
index_int8 = faiss.index_cpu_to_gpu(res, 0, quantizer)
```

## 六、Milvus GPU 索引

### 6.1 配置启用

```yaml
# Milvus GPU 配置
gpu:
  enabled: true
  
queryNode:
  config:
    gpu:
      # 启用 GPU 索引
      enableIndex: true
      # GPU 内存池大小
      memoryPoolSize: 8GB
      # 使用的 GPU 设备
      deviceIds: [0]
```

### 6.2 创建 GPU 索引

```python
from pymilvus import Collection

collection = Collection("example_collection")

# 创建 GPU IVF-Flat 索引
index_params = {
    "metric_type": "L2",
    "index_type": "GPU_IVF_FLAT",
    "params": {
        "nlist": 1024
    }
}
collection.create_index(field_name="embedding", index_params=index_params)

# 创建 GPU IVF-PQ 索引
index_params = {
    "metric_type": "L2",
    "index_type": "GPU_IVF_PQ",
    "params": {
        "nlist": 1024,
        "m": 16,
        "nbits": 8
    }
}
collection.create_index(field_name="embedding", index_params=index_params)
```

### 6.3 搜索配置

```python
# GPU 索引搜索
search_params = {
    "metric_type": "L2",
    "params": {
        "nprobe": 64
    }
}

# 批量搜索以充分利用 GPU
batch_queries = [query_vector] * 100
results = collection.search(
    data=batch_queries,
    anns_field="embedding",
    param=search_params,
    limit=10
)
```

## 七、CPU vs GPU 性能对比

```
┌─────────────────────────────────────────────────────────────────┐
│                    CPU vs GPU 性能对比                           │
├───────────────────────────────┬─────────────────────────────────┤
│ 指标                         │ CPU              │ GPU          │
├───────────────────────────────┼─────────────────────────────────┤
│ 单次查询延迟                  │ 1-5 ms          │ 0.5-2 ms     │
│ 批量 QPS (batch=100)         │ 5K-10K          │ 50K-100K     │
│ 构建速度                      │ 基准            │ 5-10x 快     │
│ 内存占用                      │ 灵活            │ 固定         │
│ 功耗                          │ 低              │ 高           │
│ 成本                          │ 低              │ 中高         │
│ 适用场景                      │ 小规模/低延迟   │ 大规模/高吞吐│
└───────────────────────────────┴─────────────────────────────────┘
```

## 总结

本文深入分析了 GPU 加速向量搜索的原理，包括：

1. **GPU 架构**：与 CPU 的区别、适合向量搜索的原因
2. **CUDA 编程**：线程层次、内存层次、Kernel 编写
3. **GPU IVF 实现**：IVF-Flat、IVF-PQ、多 GPU 支持
4. **内存优化**：合并访问、共享内存、内存池管理
5. **性能优化**：批处理、精度权衡
6. **Milvus GPU 支持**：配置、索引创建、搜索

下一章将深入分析 Milvus 的数据模型与存储系统。

## 参考资料

- [CUDA C++ Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)
- [Faiss GPU Documentation](https://github.com/facebookresearch/faiss/wiki/Faiss-on-the-GPU)
- [Milvus GPU Index Documentation](https://milvus.io/docs/gpu_index.md)
