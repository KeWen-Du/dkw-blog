---
title: "Milvus底层原理（十）：分布式架构详解"
date: "2026-03-10"
excerpt: "深入理解 Milvus 的分布式架构设计，掌握各组件职责、通信机制和扩展策略，了解云原生架构的设计思想。"
tags: ["Milvus", "向量数据库", "分布式架构", "云原生", "架构设计"]
series:
  slug: "milvus-core-principles"
  title: "Milvus 底层原理"
  order: 10
---

## 前言

Milvus 采用存算分离的云原生架构设计，支持弹性扩展、高可用和故障恢复。分布式架构是 Milvus 处理大规模向量数据的基础，理解其设计对于部署和运维至关重要。

本文将深入分析 Milvus 的分布式架构，包括组件职责、通信机制、扩展策略和云原生特性。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 存算分离架构 | ⭐⭐⭐⭐ | 架构设计 | ✅ |
| Coordinator 职责 | ⭐⭐⭐ | 进阶考点 | ✅ |
| 通信机制 | ⭐⭐⭐ | 架构设计 | ✅ |
| 弹性扩展 | ⭐⭐⭐⭐ | 实战技能 | ✅ |
| 云原生特性 | ⭐⭐⭐ | 架构选型 | ✅ |

## 面试考点

1. Milvus 的分布式架构是怎样的？
2. 存算分离有什么优势？
3. 各 Coordinator 的职责是什么？
4. 组件之间如何通信？
5. 如何实现弹性扩展？

## 一、整体架构

### 1.1 架构层次

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 分布式架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     接入层 (Access Layer)               │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Load Balancer (Nginx/HAProxy)                  │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                │   │
│  │  │ Proxy 1 │ │ Proxy 2 │ │ Proxy 3 │                │   │
│  │  └─────────┘ └─────────┘ └─────────┘                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   协调服务层 (Coordination)              │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │   │
│  │  │Root Coord   │ │Query Coord  │ │Data Coord   │      │   │
│  │  │(元数据管理) │ │(查询调度)   │ │(数据调度)   │      │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘      │   │
│  │  ┌─────────────┐                                      │   │
│  │  │Index Coord  │                                      │   │
│  │  │(索引调度)   │                                      │   │
│  │  └─────────────┘                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     执行层 (Worker Nodes)               │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │   │
│  │  │Query Node 1 │ │Query Node 2 │ │Query Node 3 │      │   │
│  │  │(查询执行)   │ │(查询执行)   │ │(查询执行)   │      │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘      │   │
│  │  ┌─────────────┐ ┌─────────────┐                      │   │
│  │  │Data Node 1  │ │Data Node 2  │                      │   │
│  │  │(数据写入)   │ │(数据写入)   │                      │   │
│  │  └─────────────┘ └─────────────┘                      │   │
│  │  ┌─────────────┐ ┌─────────────┐                      │   │
│  │  │Index Node 1 │ │Index Node 2 │                      │   │
│  │  │(索引构建)   │ │(索引构建)   │                      │   │
│  │  └─────────────┘ └─────────────┘                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     存储层 (Storage)                    │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │   │
│  │  │  Meta Store │ │  Log Broker │ │Object Store │      │   │
│  │  │  (etcd)     │ │ (Kafka/Pulsar)│ (MinIO/S3)  │      │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 存算分离优势

```
┌─────────────────────────────────────────────────────────────────┐
│                    存算分离优势                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 弹性扩展                                                    │
│  • 计算节点可以独立扩缩容                                       │
│  • 存储容量独立扩展                                            │
│  • 按需分配资源                                                │
│                                                                 │
│  2. 成本优化                                                    │
│  • 计算节点使用廉价实例                                        │
│  • 存储使用对象存储（低成本）                                  │
│  • 无数据时可以释放计算资源                                    │
│                                                                 │
│  3. 高可用                                                      │
│  • 计算节点无状态，可随时重启                                  │
│  • 数据持久化在对象存储                                        │
│  • 故障恢复快                                                  │
│                                                                 │
│  4. 多租户支持                                                  │
│  • 不同租户可隔离计算资源                                      │
│  • 共享存储降低成本                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 二、组件详解

### 2.1 Proxy

```go
// Proxy 组件职责

type Proxy struct {
    // 客户端连接管理
    connManager *ConnectionManager
    
    // 路由缓存
    routeCache *RouteCache
    
    // 各 Coordinator 客户端
    rootCoordClient  RootCoordClient
    queryCoordClient QueryCoordClient
    dataCoordClient  DataCoordClient
}

func (p *Proxy) Search(ctx context.Context, req *SearchRequest) (*SearchResult, error) {
    // 1. 参数校验
    if err := p.validateRequest(req); err != nil {
        return nil, err
    }
    
    // 2. 获取路由信息
    route, err := p.getRoute(req.CollectionName)
    if err != nil {
        return nil, err
    }
    
    // 3. 分发查询到 Query Nodes
    results := make([]*SearchResult, len(route.Shards))
    for i, shard := range route.Shards {
        result, err := p.queryCoordClient.Query(ctx, &QueryRequest{
            ShardID:    shard.ID,
            Query:      req.Query,
            TopK:       req.TopK,
            Filter:     req.Filter,
        })
        if err != nil {
            return nil, err
        }
        results[i] = result
    }
    
    // 4. 归并结果
    return p.mergeResults(results, req.TopK), nil
}
```

### 2.2 Root Coordinator

```
┌─────────────────────────────────────────────────────────────────┐
│                    Root Coordinator 职责                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  元数据管理：                                                    │
│  • Collection 创建/删除/描述                                   │
│  • Partition 创建/删除                                        │
│  • Schema 定义                                                │
│  • Database 管理 (2.3+)                                       │
│                                                                 │
│  全局时间戳分配：                                                │
│  • TSO (Timestamp Oracle)                                     │
│  • 全局唯一时间戳生成                                          │
│  • 用于 MVCC 和一致性                                          │
│                                                                 │
│  DDL 操作：                                                      │
│  • CreateCollection                                           │
│  • DropCollection                                             │
│  • CreatePartition                                            │
│  • DropPartition                                              │
│  • CreateIndex                                                │
│  • DropIndex                                                  │
│                                                                 │
│  权限管理 (2.0+)：                                               │
│  • 用户/角色管理                                               │
│  • 权限控制                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Query Coordinator

```go
// Query Coordinator 职责

type QueryCoord struct {
    // 集群管理
    nodes map[int64]*QueryNodeInfo
    
    // Segment 分配
    segmentAssignments map[int64]int64  // segmentID -> nodeID
    
    // 负载均衡
    balancer *LoadBalancer
}

// 关键职责：

// 1. Segment 分配
func (qc *QueryCoord) assignSegments(collection *Collection) error {
    for _, segment := range collection.Segments {
        // 选择负载最低的节点
        node := qc.balancer.SelectNode(segment.Size)
        qc.segmentAssignments[segment.ID] = node.ID
    }
    return nil
}

// 2. 负载均衡
func (qc *QueryCoord) rebalance() {
    // 检测负载不均衡
    imbalanced := qc.detectImbalance()
    
    // 迁移 Segment
    for _, migration := range imbalanced {
        qc.migrateSegment(migration.SegmentID, migration.FromNode, migration.ToNode)
    }
}

// 3. 查询路由
func (qc *QueryCoord) routeQuery(collectionID int64) ([]int64, error) {
    // 返回持有该 Collection 数据的 Query Nodes
    nodes := make([]int64, 0)
    for segmentID, nodeID := range qc.segmentAssignments {
        if qc.getSegmentCollection(segmentID) == collectionID {
            nodes = append(nodes, nodeID)
        }
    }
    return nodes, nil
}

// 4. 故障恢复
func (qc *QueryCoord) handleNodeFailure(nodeID int64) {
    // 重新分配该节点的 Segment
    for segmentID, nID := range qc.segmentAssignments {
        if nID == nodeID {
            newNode := qc.balancer.SelectNode(qc.getSegmentSize(segmentID))
            qc.migrateSegment(segmentID, nodeID, newNode.ID)
        }
    }
}
```

### 2.4 Data Coordinator

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Coordinator 职责                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Segment 管理：                                                  │
│  • 分配 Growing Segment                                        │
│  • 触发 Segment Sealing                                        │
│  • 管理 Segment 生命周期                                       │
│                                                                 │
│  数据分布：                                                      │
│  • 管理 Segment 到 Data Node 的映射                            │
│  • 分配写入通道                                                │
│                                                                 │
│  Compaction：                                                    │
│  • 触发 Segment 压缩合并                                       │
│  • 清理已删除数据                                              │
│                                                                 │
│  Flush 管理：                                                    │
│  • 协调 Flush 操作                                             │
│  • 保证数据持久化                                              │
│                                                                 │
│  关键流程：                                                      │
│  1. 客户端请求插入数据                                         │
│  2. DataCoord 分配 Growing Segment                            │
│  3. 数据写入消息队列                                           │
│  4. Data Node 消费数据                                         │
│  5. Segment 达到条件后 Seal                                    │
│  6. Index Node 构建索引                                        │
│  7. Segment 可被 Query Node 加载                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.5 Index Coordinator

```go
// Index Coordinator 职责

type IndexCoord struct {
    // 索引任务管理
    tasks map[int64]*IndexTask
    
    // Index Nodes
    nodes map[int64]*IndexNodeInfo
}

// 索引构建流程：
func (ic *IndexCoord) buildIndex(segmentID int64, indexDef *IndexDef) error {
    // 1. 创建索引任务
    task := &IndexTask{
        SegmentID: segmentID,
        IndexDef:  indexDef,
        Status:    Pending,
    }
    ic.tasks[task.ID] = task
    
    // 2. 选择 Index Node
    node := ic.selectNode()
    
    // 3. 分配任务
    node.BuildIndex(task)
    
    // 4. 监控任务状态
    go ic.monitorTask(task.ID)
    
    return nil
}

func (ic *IndexCoord) monitorTask(taskID int64) {
    for {
        task := ic.tasks[taskID]
        
        switch task.Status {
        case Completed:
            // 索引构建完成，通知 Data Coord
            ic.notifyIndexComplete(task)
            return
            
        case Failed:
            // 重试或报错
            ic.retryTask(task)
            return
            
        default:
            time.Sleep(time.Second)
        }
    }
}
```

## 三、通信机制

### 3.1 通信协议

```
┌─────────────────────────────────────────────────────────────────┐
│                    Milvus 通信协议                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  gRPC：组件间通信                                                │
│  • 高性能 RPC 框架                                             │
│  • 基于 HTTP/2                                                │
│  • 支持流式传输                                                │
│  • Protocol Buffers 序列化                                     │
│                                                                 │
│  消息队列：数据流                                                │
│  • Kafka / Pulsar                                             │
│  • WAL 实现                                                    │
│  • 解耦组件                                                    │
│  • 支持重试和回放                                              │
│                                                                 │
│  etcd：元数据存储                                                │
│  • 分布式 KV 存储                                              │
│  • 服务注册与发现                                              │
│  • 分布式锁                                                    │
│  • 配置管理                                                    │
│                                                                 │
│  对象存储：数据持久化                                            │
│  • MinIO / S3 / Azure Blob                                    │
│  • Segment 数据文件                                            │
│  • 索引文件                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 服务发现

```go
// 服务发现实现

type ServiceDiscovery struct {
    etcdClient *clientv3.Client
}

func (sd *ServiceDiscovery) Register(serviceName string, addr string, ttl int64) error {
    // 注册服务
    key := fmt.Sprintf("/services/%s/%s", serviceName, addr)
    
    lease, err := sd.etcdClient.Grant(context.Background(), ttl)
    if err != nil {
        return err
    }
    
    _, err = sd.etcdClient.Put(context.Background(), key, addr, clientv3.WithLease(lease.ID))
    if err != nil {
        return err
    }
    
    // 保持心跳
    ch, err := sd.etcdClient.KeepAlive(context.Background(), lease.ID)
    go func() {
        for range ch {
            // 心跳响应
        }
    }()
    
    return nil
}

func (sd *ServiceDiscovery) Discover(serviceName string) ([]string, error) {
    // 发现服务
    key := fmt.Sprintf("/services/%s/", serviceName)
    
    resp, err := sd.etcdClient.Get(context.Background(), key, clientv3.WithPrefix())
    if err != nil {
        return nil, err
    }
    
    addrs := make([]string, 0, len(resp.Kvs))
    for _, kv := range resp.Kvs {
        addrs = append(addrs, string(kv.Value))
    }
    
    return addrs, nil
}
```

## 四、扩展策略

### 4.1 水平扩展

```
┌─────────────────────────────────────────────────────────────────┐
│                    水平扩展策略                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Query Node 扩展：                                               │
│  • 增加 Query Node 数量                                        │
│  • 自动负载均衡                                                │
│  • Segment 自动重新分配                                        │
│  • 提升查询吞吐量                                              │
│                                                                 │
│  Data Node 扩展：                                                │
│  • 增加 Data Node 数量                                         │
│  • 并行写入不同 Partition                                      │
│  • 提升写入吞吐量                                              │
│                                                                 │
│  Index Node 扩展：                                               │
│  • 增加 Index Node 数量                                        │
│  • 并行构建索引                                                │
│  • 缩短索引构建时间                                            │
│                                                                 │
│  Proxy 扩展：                                                    │
│  • 无状态，可随意扩展                                          │
│  • 配合负载均衡器                                              │
│  • 提升连接处理能力                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 扩展命令

```yaml
# Kubernetes 扩展配置

# 扩展 Query Node
kubectl scale deployment milvus-querynode --replicas=5

# 扩展 Data Node
kubectl scale deployment milvus-datanode --replicas=3

# 使用 HPA 自动扩展
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: milvus-querynode-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: milvus-querynode
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## 五、云原生特性

### 5.1 Kubernetes 部署

```yaml
# Milvus Kubernetes 部署配置

apiVersion: apps/v1
kind: Deployment
metadata:
  name: milvus-querynode
spec:
  replicas: 3
  selector:
    matchLabels:
      app: milvus-querynode
  template:
    metadata:
      labels:
        app: milvus-querynode
    spec:
      containers:
      - name: querynode
        image: milvusdb/milvus:v2.3.0
        command: ["milvus", "run", "querynode"]
        resources:
          requests:
            memory: "4Gi"
            cpu: "2"
          limits:
            memory: "8Gi"
            cpu: "4"
        env:
        - name: ETCD_ENDPOINTS
          value: "milvus-etcd:2379"
        - name: MINIO_ADDRESS
          value: "milvus-minio:9000"
```

### 5.2 存储配置

```yaml
# 存储配置

# MinIO (对象存储)
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: milvus-minio
spec:
  serviceName: milvus-minio
  replicas: 4
  template:
    spec:
      containers:
      - name: minio
        image: minio/minio:latest
        args:
        - server
        - /data
        - --distributed
        env:
        - name: MINIO_ACCESS_KEY
          value: "minioadmin"
        - name: MINIO_SECRET_KEY
          value: "minioadmin"
        volumeMounts:
        - name: data
          mountPath: /data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 100Gi
```

## 总结

本文深入分析了 Milvus 的分布式架构，包括：

1. **架构层次**：接入层、协调服务层、执行层、存储层
2. **组件职责**：Proxy、Root Coord、Query Coord、Data Coord、Index Coord
3. **通信机制**：gRPC、消息队列、etcd、对象存储
4. **扩展策略**：水平扩展各组件
5. **云原生特性**：Kubernetes 部署、存储配置

下一章将深入分析分片与路由策略。

## 参考资料

- [Milvus Architecture Overview](https://milvus.io/docs/architecture_overview.md)
- [Milvus Components](https://milvus.io/docs/four_layers.md)
- [Deploy Milvus on Kubernetes](https://milvus.io/docs/install_cluster-milvusoperator.md)
