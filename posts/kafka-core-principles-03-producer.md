---
title: "Kafka核心原理（三）：生产者核心原理"
date: "2020-04-27"
excerpt: "深入理解Kafka生产者的发送机制、分区策略、ACK机制与性能优化，掌握高吞吐量消息发送的核心技术。"
tags: ["Kafka", "消息队列", "Producer", "分布式系统"]
series:
  slug: "kafka-core-principles"
  title: "Kafka核心原理"
  order: 3
---

# Kafka核心原理（三）：生产者核心原理

## 前言

Kafka 生产者是消息系统的入口，承担着将业务数据高效、可靠地发送到 Kafka 集群的重要职责。本章将深入剖析生产者的工作原理，理解其如何通过批量发送、异步处理等机制实现高吞吐量。

## 生产者架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Kafka Producer 架构                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        Producer Client                            │  │
│  │                                                                   │  │
│  │  ┌─────────────┐                                                │  │
│  │  │   send()    │                                                │  │
│  │  │   API       │                                                │  │
│  │  └──────┬──────┘                                                │  │
│  │         │                                                        │  │
│  │         ▼                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────┐│  │
│  │  │                   Interceptor Chain                         ││  │
│  │  │  ┌─────────┐   ┌─────────┐   ┌─────────┐                   ││  │
│  │  │  │Intercep-│──►│Intercep-│──►│Intercep-│                   ││  │
│  │  │  │  tor 1  │   │  tor 2  │   │  tor N  │                   ││  │
│  │  │  └─────────┘   └─────────┘   └─────────┘                   ││  │
│  │  └─────────────────────────┬───────────────────────────────────┘│  │
│  │                            │                                     │  │
│  │                            ▼                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐│  │
│  │  │              Serializer (Key & Value)                       ││  │
│  │  │              序列化器                                       ││  │
│  │  └─────────────────────────┬───────────────────────────────────┘│  │
│  │                            │                                     │  │
│  │                            ▼                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐│  │
│  │  │              Partitioner (分区器)                           ││  │
│  │  │              决定消息发送到哪个分区                          ││  │
│  │  └─────────────────────────┬───────────────────────────────────┘│  │
│  │                            │                                     │  │
│  │                            ▼                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐│  │
│  │  │              RecordAccumulator (消息累加器)                  ││  │
│  │  │  ┌─────────────────────────────────────────────────────┐   ││  │
│  │  │  │              TopicPartition Batches                 │   ││  │
│  │  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   ││  │
│  │  │  │  │Batch-P0  │ │Batch-P1  │ │Batch-P2  │ ...        │   ││  │
│  │  │  │  └──────────┘ └──────────┘ └──────────┘            │   ││  │
│  │  │  └─────────────────────────────────────────────────────┘   ││  │
│  │  └─────────────────────────┬───────────────────────────────────┘│  │
│  │                            │                                     │  │
│  │                            ▼                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐│  │
│  │  │              Sender Thread (发送线程)                        ││  │
│  │  │              后台线程，负责网络IO                            ││  │
│  │  └─────────────────────────┬───────────────────────────────────┘│  │
│  │                            │                                     │  │
│  └────────────────────────────┼─────────────────────────────────────┘  │
│                               │                                        │
│                               ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      Network Client                               │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │  │
│  │  │ Metadata    │    │ Connection  │    │ InFlightReq │          │  │
│  │  │ Cache       │    │ Pool        │    │ uests       │          │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                               │                                        │
│                               ▼                                        │
│                      ┌─────────────────┐                               │
│                      │  Kafka Broker   │                               │
│                      └─────────────────┘                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 核心组件详解

```
Producer 核心组件：
├── ProducerInterceptors
│   ├── 消息发送前拦截
│   ├── 消息发送后回调
│   └── 自定义处理逻辑
│
├── Serializer
│   ├── KeySerializer
│   ├── ValueSerializer
│   └── 支持自定义序列化
│
├── Partitioner
│   ├── DefaultPartitioner（默认）
│   ├── RoundRobinPartitioner
│   ├── UniformStickyPartitioner
│   └── 自定义分区器
│
├── RecordAccumulator
│   ├── 消息批量缓冲
│   ├── 按TopicPartition组织
│   └── 内存管理
│
├── Sender Thread
│   ├── 后台发送线程
│   ├── 批量拉取消息
│   └── 网络IO处理
│
└── NetworkClient
    ├── 元数据管理
    ├── 连接池管理
    └── 请求响应处理
```

## 消息发送流程

### 发送时序图

```
┌─────────┐     ┌─────────────┐     ┌──────────┐     ┌────────┐     ┌────────┐
│Producer │     │ Interceptor │     │Serializer│     │Partition│     │Accumu- │
│  Client │     │   Chain     │     │          │     │  er     │     │lator   │
└────┬────┘     └──────┬──────┘     └────┬─────┘     └───┬────┘     └───┬────┘
     │                 │                  │               │              │
     │  send(record)   │                  │               │              │
     │────────────────►│                  │               │              │
     │                 │                  │               │              │
     │                 │ onSend(record)   │               │              │
     │                 │─────────────────►│               │              │
     │                 │                  │               │              │
     │                 │                  │ serialize()   │              │
     │                 │                  │──────────────►│              │
     │                 │                  │               │              │
     │                 │                  │               │ partition()  │
     │                 │                  │               │─────────────►│
     │                 │                  │               │              │
     │                 │                  │               │  append()    │
     │                 │                  │               │─────────────►│
     │                 │                  │               │              │
     │  return Future  │                  │               │              │
     │◄────────────────│                  │               │              │
     │                 │                  │               │              │
     │                 │                  │               │              │
     │                 │                  │               │              │
┌────┴────┐     ┌──────┴──────┐     ┌────┴─────┐     ┌───┴────┐     ┌───┴────┐
│Producer │     │ Interceptor │     │Serializer│     │Partition│     │Accumu- │
│  Client │     │   Chain     │     │          │     │  er     │     │lator   │
└────┬────┘     └──────┬──────┘     └────┬─────┘     └───┬────┘     └───┬────┘
     │                 │                  │               │              │
     │                 │                  │               │              │
     │                 │                  │               │              │
     │                 │  Sender Thread (Background)      │              │
     │                 │                  │               │              │
     │                 │                  │               │   ready()    │
     │                 │                  │               │◄─────────────│
     │                 │                  │               │              │
     │                 │                  │               │   drain()    │
     │                 │                  │               │◄─────────────│
     │                 │                  │               │              │
     │                 │                  │  sendProduce │              │
     │                 │                  │  Request()   │              │
     │                 │                  │◄─────────────│              │
     │                 │                  │               │              │
     │                 │                  │  to Broker   │              │
     │                 │                  │─────────────────────────────►│
     │                 │                  │               │              │
```

### 发送模式

```java
// 1. 发后即忘（Fire-and-Forget）
// 最高性能，但可能丢失消息
ProducerRecord<String, String> record = 
    new ProducerRecord<>("topic", "key", "value");
producer.send(record);  // 不等待响应

// 2. 同步发送（Synchronous）
// 可靠性高，性能较低
try {
    RecordMetadata metadata = producer.send(record).get();
    System.out.printf("发送成功: partition=%d, offset=%d%n", 
        metadata.partition(), metadata.offset());
} catch (Exception e) {
    System.err.println("发送失败: " + e.getMessage());
}

// 3. 异步发送（Asynchronous）
// 平衡性能与可靠性
producer.send(record, new Callback() {
    @Override
    public void onCompletion(RecordMetadata metadata, Exception exception) {
        if (exception != null) {
            System.err.println("发送失败: " + exception.getMessage());
        } else {
            System.out.printf("发送成功: partition=%d, offset=%d%n",
                metadata.partition(), metadata.offset());
        }
    }
});
```

## 分区策略详解

### 默认分区策略（Sticky Partitioner）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Sticky Partitioner 工作原理                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Kafka 2.4+ 引入的粘性分区策略，解决无Key消息的批量问题                 │
│                                                                         │
│  工作流程：                                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  1. 选择一个分区并"粘住"                                        │    │
│  │     ┌─────────────────────────────────────────────────────┐   │    │
│  │     │  时间窗口内所有消息 → 同一分区                         │   │    │
│  │     │                                                       │   │    │
│  │     │  Batch 1: Partition-0                                 │   │    │
│  │     │  Batch 2: Partition-0                                 │   │    │
│  │     │  Batch 3: Partition-0  ← 批量积累直到batch.size      │   │    │
│  │     │  ...                                                  │   │    │
│  │     └─────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  │  2. 批次满后切换到下一个分区                                    │    │
│  │     ┌─────────────────────────────────────────────────────┐   │    │
│  │     │  Batch N: Partition-1                                │   │    │
│  │     │  Batch N+1: Partition-1                              │   │    │
│  │     │  ...                                                 │   │    │
│  │     └─────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  优点：                                                                  │
│  ├── 提高批量发送效率                                                   │
│  ├── 减少网络请求次数                                                   │
│  └── 更好的吞吐量                                                       │
│                                                                         │
│  切换条件：                                                              │
│  ├── batch.size 已满                                                    │
│  ├── linger.ms 超时                                                     │
│  └── 分区不可用                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 有Key分区策略

```java
// Key 决定分区分配
// 相同 Key 的消息始终进入同一分区，保证顺序性

public int partition(String topic, Object key, byte[] keyBytes,
                     Object value, byte[] valueBytes, Cluster cluster) {
    
    List<PartitionInfo> partitions = cluster.partitionsForTopic(topic);
    int numPartitions = partitions.size();
    
    if (keyBytes == null) {
        // 无Key使用粘性分区
        return stickyPartitionCache.partition(topic, cluster);
    }
    
    // 使用 murmur2 哈希算法
    // 保证相同Key始终映射到同一分区
    return Utils.toPositive(Utils.murmur2(keyBytes)) % numPartitions;
}

// Key 选择最佳实践：
// ├── 订单ID → 同一订单的所有事件顺序处理
// ├── 用户ID → 同一用户的所有操作顺序处理
// └── 设备ID → 同一设备的数据流顺序处理
```

### 自定义分区策略示例

```java
// 业务场景：热点Key处理
// 问题：某些Key（如热门商品ID）消息量过大，导致分区不均衡
// 解决：添加随机后缀，分散到不同分区

public class HotKeyPartitioner implements Partitioner {
    
    private static final Set<String> HOT_KEYS = Set.of(
        "product-001", "product-002", "product-003"
    );
    
    @Override
    public int partition(String topic, Object key, byte[] keyBytes,
                         Object value, byte[] valueBytes, Cluster cluster) {
        
        int partitionCount = cluster.partitionCountForTopic(topic);
        String keyStr = key != null ? key.toString() : "";
        
        if (HOT_KEYS.contains(keyStr)) {
            // 热点Key：添加随机后缀分散
            int randomSuffix = ThreadLocalRandom.current().nextInt(10);
            String dispersedKey = keyStr + "-" + randomSuffix;
            return Utils.toPositive(Utils.murmur2(dispersedKey.getBytes())) 
                   % partitionCount;
        } else {
            // 普通Key：正常分区
            return Utils.toPositive(Utils.murmur2(keyBytes)) % partitionCount;
        }
    }
    
    @Override
    public void configure(Map<String, ?> configs) {
        // 可从配置加载热点Key列表
    }
    
    @Override
    public void close() {}
}

// 消费端需要特殊处理：
// 需要订阅所有分区，按原始Key聚合处理
```

## ACK 机制与可靠性

### ACK 级别

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ACK 机制详解                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  acks=0（最低可靠性，最高性能）                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  Producer                      Broker                          │    │
│  │     │                            │                             │    │
│  │     │─────── send ────────────►│                             │    │
│  │     │                           │                             │    │
│  │     │      (不等待确认)          │                             │    │
│  │     │                           │                             │    │
│  │                                                                 │    │
│  │  特点：                                                         │    │
│  │  ├── 生产者不等待任何确认                                       │    │
│  │  ├── 可能丢失消息（网络问题、Broker故障）                       │    │
│  │  └── 最高吞吐量                                                 │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  acks=1（中等可靠性，中等性能）                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  Producer                 Leader Broker       Followers         │    │
│  │     │                          │                  │             │    │
│  │     │─────── send ──────────►│                  │             │    │
│  │     │                          │                  │             │    │
│  │     │◄───── ack ────────────│                  │             │    │
│  │     │                    (异步同步)              │             │    │
│  │     │                          │                  │             │    │
│  │                                                                 │    │
│  │  特点：                                                         │    │
│  │  ├── Leader 确认后立即返回                                      │    │
│  │  ├── Leader 故障可能丢失消息（未同步到Follower）                │    │
│  │  └── 性能和可靠性的平衡                                         │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  acks=all / acks=-1（最高可靠性，最低性能）                             │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  Producer                 Leader Broker       Followers         │    │
│  │     │                          │                  │             │    │
│  │     │─────── send ──────────►│                  │             │    │
│  │     │                          │                  │             │    │
│  │     │                          │── sync ─────────►│             │    │
│  │     │                          │── sync ─────────►│             │    │
│  │     │                          │                  │             │    │
│  │     │◄───── ack ────────────│                  │             │    │
│  │     │      (ISR全部同步)       │                  │             │    │
│  │     │                          │                  │             │    │
│  │                                                                 │    │
│  │  特点：                                                         │    │
│  │  ├── 等待 ISR 中所有副本确认                                    │    │
│  │  ├── 最高可靠性（配合 min.insync.replicas）                     │    │
│  │  └── 性能开销最大                                               │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### min.insync.replicas 配置

```properties
# 服务端配置
min.insync.replicas=2

# 生产者配置
acks=all

# 含义：至少有 min.insync.replicas 个副本同步成功才认为写入成功
# 如果 ISR 中副本数 < min.insync.replicas，则抛出异常
```

```java
// 可靠性配置最佳实践
Properties props = new Properties();
props.put("bootstrap.servers", "localhost:9092");
props.put("acks", "all");                        // 最高可靠性
props.put("retries", Integer.MAX_VALUE);         // 无限重试
props.put("max.in.flight.requests.per.connection", 1);  // 保证顺序
props.put("enable.idempotence", "true");         // 幂等性
props.put("min.insync.replicas", 2);             // 至少2副本同步

// 不丢消息的黄金组合：
// acks=all + min.insync.replicas>=2 + enable.idempotence=true
```

## 幂等性与事务

### 幂等性生产者

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    幂等性生产者原理                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  问题：网络超时导致重试，Broker 可能收到重复消息                        │
│                                                                         │
│  解决：为每个生产者分配唯一ID，每个消息分配序列号                       │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  Producer ID (PID) + Sequence Number                           │    │
│  │                                                                 │    │
│  │  Producer A (PID=1000)                                         │    │
│  │  ├── 消息1: PID=1000, Seq=0                                    │    │
│  │  ├── 消息2: PID=1000, Seq=1                                    │    │
│  │  └── 消息3: PID=1000, Seq=2                                    │    │
│  │                                                                 │    │
│  │  Broker 端检查：                                                │    │
│  │  ├── 收到 PID=1000, Seq=0 → 接受                               │    │
│  │  ├── 收到 PID=1000, Seq=1 → 接受                               │    │
│  │  ├── 收到 PID=1000, Seq=1 → 重复，丢弃                         │    │
│  │  └── 收到 PID=1000, Seq=2 → 接受                               │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  配置：                                                                  │
│  enable.idempotence=true                                                │
│                                                                         │
│  限制：                                                                  │
│  ├── 只能保证单分区幂等                                                 │
│  ├── 只能保证单个生产者会话内幂等                                       │
│  └── 跨分区、跨会话需要事务支持                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 事务支持

```java
// 事务生产者：跨分区原子写入
public class TransactionalProducer {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("transactional.id", "my-transactional-id");  // 必须配置
        props.put("enable.idempotence", "true");               // 自动启用
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        // 初始化事务
        producer.initTransactions();
        
        try {
            // 开始事务
            producer.beginTransaction();
            
            // 发送多条消息到多个分区/主题
            producer.send(new ProducerRecord<>("topic-A", "key1", "value1"));
            producer.send(new ProducerRecord<>("topic-A", "key2", "value2"));
            producer.send(new ProducerRecord<>("topic-B", "key3", "value3"));
            
            // 发送消费偏移量（消费-处理-生产模式）
            producer.sendOffsetsToTransaction(
                Collections.singletonMap(
                    new TopicPartition("source-topic", 0),
                    new OffsetAndMetadata(100L)
                ),
                "consumer-group-id"
            );
            
            // 提交事务
            producer.commitTransaction();
            
        } catch (Exception e) {
            // 回滚事务
            producer.abortTransaction();
            e.printStackTrace();
        } finally {
            producer.close();
        }
    }
}

// 事务保证：
// ├── 原子性：所有消息要么全部成功，要么全部失败
// ├── 跨主题：支持写入多个主题
// ├── 跨分区：支持写入多个分区
// └── 消费-处理-生产：支持将消费偏移量纳入事务
```

## 批量发送与性能优化

### 批量发送机制

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    批量发送原理                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  RecordAccumulator 内存结构                                             │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  TopicPartition → Deque<ProducerBatch>                         │    │
│  │                                                                 │    │
│  │  topic-A-partition-0:                                          │    │
│  │  ┌────────────────┐                                            │    │
│  │  │   Batch 1      │  batch.size=16KB                          │    │
│  │  │ [msg][msg]...  │  linger.ms=5ms                             │    │
│  │  └────────────────┘                                            │    │
│  │  ┌────────────────┐                                            │    │
│  │  │   Batch 2      │  (正在写入)                                │    │
│  │  │ [msg][msg]...  │                                            │    │
│  │  └────────────────┘                                            │    │
│  │                                                                 │    │
│  │  topic-A-partition-1:                                          │    │
│  │  ┌────────────────┐                                            │    │
│  │  │   Batch 1      │                                            │    │
│  │  │ [msg][msg]...  │                                            │    │
│  │  └────────────────┘                                            │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  批次发送条件（满足任一即发送）：                                       │
│  ├── batch.size：批次大小已满                                          │
│  ├── linger.ms：等待时间已到                                           │
│  └── buffer.memory：内存不足，需要发送释放                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 关键配置参数

```properties
# 批量发送配置
batch.size=16384                  # 批次大小 16KB（默认）
linger.ms=0                       # 等待时间 0ms（默认）
buffer.memory=33554432            # 缓冲区大小 32MB（默认）

# 性能优化配置
compression.type=lz4              # 压缩类型（none/gzip/snappy/lz4/zstd）
max.in.flight.requests.per.connection=5  # 最大未确认请求数

# 重试配置
retries=Integer.MAX_VALUE        # 重试次数
retry.backoff.ms=100             # 重试间隔

# 网络配置
send.buffer.bytes=131072         # 发送缓冲区
request.timeout.ms=30000         # 请求超时
connections.max.idle.ms=540000   # 连接空闲超时
```

### 性能调优实践

```java
// 高吞吐量配置
Properties highThroughputProps = new Properties();
highThroughputProps.put("batch.size", 65536);           // 64KB批次
highThroughputProps.put("linger.ms", 10);               // 等待10ms
highThroughputProps.put("compression.type", "lz4");     // LZ4压缩
highThroughputProps.put("buffer.memory", 67108864);     // 64MB缓冲
highThroughputProps.put("max.in.flight.requests.per.connection", 10);

// 低延迟配置
Properties lowLatencyProps = new Properties();
lowLatencyProps.put("batch.size", 4096);                // 4KB小批次
lowLatencyProps.put("linger.ms", 0);                    // 不等待
lowLatencyProps.put("compression.type", "none");        // 不压缩
lowLatencyProps.put("max.in.flight.requests.per.connection", 1);

// 高可靠性配置
Properties highReliabilityProps = new Properties();
highReliabilityProps.put("acks", "all");
highReliabilityProps.put("retries", Integer.MAX_VALUE);
highReliabilityProps.put("max.in.flight.requests.per.connection", 1);
highReliabilityProps.put("enable.idempotence", "true");
```

### 性能监控指标

```
关键监控指标：
├── record-send-rate
│   └── 消息发送速率（条/秒）
│
├── byte-rate
│   └── 字节发送速率（字节/秒）
│
├── record-queue-time-avg
│   └── 消息在队列中平均等待时间
│
├── record-queue-time-max
│   └── 消息在队列中最大等待时间
│
├── batch-size-avg
│   └── 平均批次大小
│
├── record-retry-rate
│   └── 重试速率
│
├── record-error-rate
│   └── 错误速率
│
└── io-wait-time-ns-avg
    └── 网络IO等待时间
```

## 生产者最佳实践

### 异常处理

```java
public class ProducerWithRetry {
    
    private final KafkaProducer<String, String> producer;
    private final int maxRetries = 3;
    private final long retryBackoffMs = 100;
    
    public void sendWithRetry(String topic, String key, String value) {
        int attempt = 0;
        while (attempt <= maxRetries) {
            try {
                producer.send(
                    new ProducerRecord<>(topic, key, value),
                    (metadata, exception) -> {
                        if (exception != null) {
                            // 记录失败，异步重试或存储到死信队列
                            handleSendFailure(key, value, exception);
                        }
                    }
                );
                return; // 成功则返回
                
            } catch (Exception e) {
                attempt++;
                if (attempt > maxRetries) {
                    // 超过最大重试次数，存储到死信队列
                    sendToDeadLetterQueue(topic, key, value, e);
                    return;
                }
                
                // 指数退避
                try {
                    Thread.sleep(retryBackoffMs * (1L << attempt));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }
    
    private void sendToDeadLetterQueue(String topic, String key, 
                                        String value, Exception e) {
        ProducerRecord<String, String> dlqRecord = new ProducerRecord<>(
            topic + "-dlq",
            key,
            String.format("{\"value\":\"%s\",\"error\":\"%s\"}", 
                          value, e.getMessage())
        );
        producer.send(dlqRecord);
    }
}
```

### 资源管理

```java
// 使用 try-with-resources 确保资源释放
try (KafkaProducer<String, String> producer = new KafkaProducer<>(props)) {
    // 发送消息
    for (int i = 0; i < 100; i++) {
        producer.send(new ProducerRecord<>("topic", "key-" + i, "value-" + i));
    }
    // 确保所有消息发送完成
    producer.flush();
}

// 或者手动管理
KafkaProducer<String, String> producer = null;
try {
    producer = new KafkaProducer<>(props);
    // ... 发送消息
    producer.flush();
} finally {
    if (producer != null) {
        producer.close(Duration.ofSeconds(10)); // 等待最多10秒完成
    }
}
```

## 小结

本章我们学习了：

1. **生产者架构**：拦截器、序列化器、分区器、累加器、发送线程
2. **发送模式**：发后即忘、同步发送、异步发送
3. **分区策略**：粘性分区、Key分区、自定义分区
4. **ACK机制**：acks=0/1/all 三种级别
5. **可靠性保证**：幂等性、事务支持
6. **性能优化**：批量发送、压缩、缓冲区配置

## 参考资料

1. [Kafka Producer Configuration](https://kafka.apache.org/documentation/#producerconfigs)
2. [Kafka Producer Internals](https://developer.confluent.io/courses/apache-kafka/producer/)
3. [KIP-447: Producer scalability for exactly once semantics](https://cwiki.apache.org/confluence/display/KAFKA/KIP-447)

## 下一章预告

在下一章《消费者核心原理》中，我们将深入探讨：

- 消费者组与 Rebalance 机制
- 消费者 Offset 管理
- 消费模型与消费语义
- 消费者性能优化

---

**Kafka 核心原理系列持续更新中，欢迎关注！**
