---
title: "Kafka核心原理（六）：消息可靠性保证"
date: "2025-05-23"
excerpt: "深入理解Kafka消息可靠性保证机制，掌握消息不丢失、Exactly Once语义与顺序性保证的核心技术。"
tags: ["Kafka", "消息队列", "可靠性", "分布式系统"]
series:
  slug: "kafka-core-principles"
  title: "Kafka核心原理"
  order: 6
---

# Kafka核心原理（六）：消息可靠性保证

## 前言

消息可靠性是分布式消息系统的核心要求。本章将深入剖析 Kafka 如何保证消息不丢失、实现精确一次语义以及保证消息顺序性。

## 可靠性概述

### 可靠性三要素

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Kafka 可靠性三要素                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 消息不丢失（Durability）                                            │
│     ├── 生产者确认机制                                                  │
│     ├── 副本冗余存储                                                    │
│     └── 消费者确认机制                                                  │
│                                                                         │
│  2. 消息不重复（Exactly Once）                                          │
│     ├── 幂等性生产者                                                    │
│     ├── 事务支持                                                        │
│     └── 消费者幂等处理                                                  │
│                                                                         │
│  3. 消息有序性（Ordering）                                              │
│     ├── 分区内顺序保证                                                  │
│     ├── 生产者顺序配置                                                  │
│     └── 消费者顺序处理                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 可靠性权衡

```
可靠性 vs 性能权衡：

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  低可靠性 ←─────────────────────────────────────────→ 高可靠性         │
│                                                                         │
│  acks=0                    acks=1                    acks=all          │
│  replication=1             replication=2             replication=3     │
│  min.insync.replicas=1     min.insync.replicas=1     min.insync=2      │
│                                                                         │
│  高性能 ←─────────────────────────────────────────→ 低性能             │
│                                                                         │
│  选择建议：                                                              │
│  ├── 日志收集：低可靠性，高吞吐量                                       │
│  ├── 用户行为分析：中等可靠性，中等吞吐量                               │
│  └── 金融交易：高可靠性，可接受性能损失                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 消息不丢失

### 生产者端保障

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    生产者端消息不丢失                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  关键配置：                                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  // 不丢消息的黄金配置                                          │    │
│  │  Properties props = new Properties();                          │    │
│  │                                                                 │    │
│  │  // 1. ACK 配置                                                 │    │
│  │  props.put("acks", "all");                                      │    │
│  │  // 等待所有 ISR 副本确认                                       │    │
│  │                                                                 │    │
│  │  // 2. 重试配置                                                 │    │
│  │  props.put("retries", Integer.MAX_VALUE);                       │    │
│  │  // 无限重试直到成功                                            │    │
│  │  props.put("retry.backoff.ms", 100);                            │    │
│  │  // 重试间隔                                                    │    │
│  │                                                                 │    │
│  │  // 3. 幂等性配置                                               │    │
│  │  props.put("enable.idempotence", "true");                       │    │
│  │  // 启用幂等性，防止重试导致的重复                               │    │
│  │                                                                 │    │
│  │  // 4. 顺序性配置                                               │    │
│  │  props.put("max.in.flight.requests.per.connection", 5);         │    │
│  │  // 幂等性模式下可以大于1                                       │    │
│  │                                                                 │    │
│  │  // 5. 超时配置                                                 │    │
│  │  props.put("request.timeout.ms", 30000);                        │    │
│  │  props.put("delivery.timeout.ms", 120000);                      │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  关键点：                                                                │
│  ├── acks=all：确保 ISR 所有副本确认                                   │
│  ├── retries：自动重试机制                                             │
│  ├── enable.idempotence：幂等性防止重复                                │
│  └── 回调处理：必须处理发送失败                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Broker 端保障

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Broker 端消息不丢失                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  关键配置：                                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  # 副本配置                                                     │    │
│  │  default.replication.factor=3      # 默认3副本                 │    │
│  │  min.insync.replicas=2             # 最小同步副本数            │    │
│  │                                                                 │    │
│  │  # ISR 配置                                                     │    │
│  │  replica.lag.time.max.ms=30000     # ISR 同步超时              │    │
│  │                                                                 │    │
│  │  # 选举配置                                                     │    │
│  │  unclean.leader.election.enable=false  # 禁止不完全选举        │    │
│  │  auto.leader.rebalance.enable=true     # 自动 Leader 平衡      │    │
│  │                                                                 │    │
│  │  # 日志配置                                                     │    │
│  │  log.flush.interval.messages=10000    # 消息数刷盘             │    │
│  │  log.flush.interval.ms=1000           # 时间刷盘               │    │
│  │                                                                 │    │
│  │  # 注意：通常依赖 OS Page Cache，不强制刷盘                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  关键机制：                                                              │
│  ├── 多副本冗余：至少 2 个副本在 ISR 中                                │
│  ├── HW 机制：消费者只能消费已提交的消息                               │
│  ├── Leader Epoch：防止数据不一致                                      │
│  └── 禁止不完全选举：ISR 为空时不可选举 Leader                         │
│                                                                         │
│  失败场景分析：                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  场景：acks=all, min.insync.replicas=2                         │    │
│  │                                                                 │    │
│  │  正常情况：                                                     │    │
│  │  ├── ISR = [Broker1, Broker2, Broker3]                        │    │
│  │  ├── Leader 收到消息，同步到 ISR                                │    │
│  │  └── 至少 2 个副本确认后返回成功                                │    │
│  │                                                                 │    │
│  │  ISR 收缩：                                                     │    │
│  │  ├── ISR = [Broker1] (Broker2,3 失效)                          │    │
│  │  ├── ISR 数量 < min.insync.replicas                            │    │
│  │  └── 抛出 NotEnoughReplicasException                           │    │
│  │                                                                 │    │
│  │  Leader 故障：                                                  │    │
│  │  ├── ISR 中其他副本被选为新 Leader                              │    │
│  │  ├── 新 Leader HW 作为消费起点                                  │    │
│  │  └── 未同步消息可能丢失（取决于配置）                           │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 消费者端保障

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    消费者端消息不丢失                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  关键配置：                                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Properties props = new Properties();                          │    │
│  │                                                                 │    │
│  │  // 禁用自动提交                                                │    │
│  │  props.put("enable.auto.commit", "false");                      │    │
│  │                                                                 │    │
│  │  // 处理完成后手动提交                                          │    │
│  │  // 先处理，再提交                                              │    │
│  │                                                                 │    │
│  │  // 处理超时配置                                                │    │
│  │  props.put("max.poll.interval.ms", 300000);                     │    │
│  │  // 确保处理时间不超过此值                                      │    │
│  │                                                                 │    │
│  │  // 单次拉取数量                                                │    │
│  │  props.put("max.poll.records", 100);                            │    │
│  │  // 控制单次处理量                                              │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  正确的消费模式：                                                        │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  while (running) {                                              │    │
│  │      ConsumerRecords<K, V> records = consumer.poll(...);        │    │
│  │                                                                 │    │
│  │      try {                                                      │    │
│  │          // 1. 处理消息                                         │    │
│  │          for (ConsumerRecord<K, V> record : records) {          │    │
│  │              process(record);                                   │    │
│  │          }                                                      │    │
│  │                                                                 │    │
│  │          // 2. 处理成功后提交 Offset                            │    │
│  │          consumer.commitSync();                                 │    │
│  │                                                                 │    │
│  │      } catch (Exception e) {                                    │    │
│  │          // 处理失败，不提交 Offset                             │    │
│  │          // 下次重新消费                                        │    │
│  │          log.error("Process failed", e);                        │    │
│  │      }                                                          │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  │  // 关闭前确保最后提交                                          │    │
│  │  try {                                                          │    │
│  │      consumer.commitSync();                                     │    │
│  │  } finally {                                                    │    │
│  │      consumer.close();                                          │    │
│  │  }                                                              │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Exactly Once 语义

### 语义层次

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Kafka 消息语义层次                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    语义对比                                      │   │
│  │                                                                  │   │
│  │  At Most Once        At Least Once        Exactly Once          │   │
│  │  最多一次            至少一次              精确一次              │   │
│  │                                                                  │   │
│  │  ┌─────────┐        ┌─────────┐          ┌─────────┐           │   │
│  │  │ 消息可能│        │ 消息可能│          │ 消息不丢│           │   │
│  │  │ 丢失    │        │ 重复    │          │ 失不重复│           │   │
│  │  └─────────┘        └─────────┘          └─────────┘           │   │
│  │                                                                  │   │
│  │  实现复杂度：低 ────────────────────────────────────→ 高        │   │
│  │  性能开销：  低 ────────────────────────────────────→ 高        │   │
│  │  可靠性：    低 ────────────────────────────────────→ 高        │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Kafka 默认：At Least Once                                              │
│  启用幂等性：单分区 Exactly Once                                        │
│  启用事务：跨分区 Exactly Once                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 幂等性生产者

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    幂等性生产者原理                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  核心概念：                                                              │
│  ├── PID (Producer ID)：每个生产者实例的唯一标识                        │
│  ├── Sequence Number：每个消息的序列号                                  │
│  └── Epoch：生产者纪元，用于区分新旧生产者                              │
│                                                                         │
│  工作原理：                                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  Producer                         Broker                       │    │
│  │     │                               │                          │    │
│  │     │  1. InitProducerId           │                          │    │
│  │     │  ─────────────────────────────►                          │    │
│  │     │  ◄───────────────────────────│                          │    │
│  │     │     (PID=1000, Epoch=0)      │                          │    │
│  │     │                               │                          │    │
│  │     │  2. Send (PID=1000, Seq=0)   │                          │    │
│  │     │  ─────────────────────────────►                          │    │
│  │     │                               │                          │    │
│  │     │  ◄─── ACK ──────────────────│                          │    │
│  │     │                               │                          │    │
│  │     │  3. Send (PID=1000, Seq=1)   │                          │    │
│  │     │  ─────────────────────────────►                          │    │
│  │     │     (网络超时)               │                          │    │
│  │     │                               │                          │    │
│  │     │  4. 重试 (PID=1000, Seq=1)   │                          │    │
│  │     │  ─────────────────────────────►                          │    │
│  │     │                               │  检查：PID=1000, Seq=1   │    │
│  │     │                               │  已存在，返回成功         │    │
│  │     │  ◄─── ACK (重复，已处理) ────│                          │    │
│  │     │                               │                          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Broker 端去重：                                                        │
│  ├── 为每个 <PID, Partition> 维护最后 5 个序列号                       │
│  ├── 收到消息时检查序列号                                               │
│  │   ├── 序列号 = 期望值：接受并处理                                   │
│  │   ├── 序列号 < 期望值：重复，丢弃                                   │
│  │   └── 序列号 > 期望值：乱序，等待                                   │
│  └── 重启后 PID 不变，Epoch 递增                                       │
│                                                                         │
│  配置：                                                                  │
│  enable.idempotence=true                                                │
│                                                                         │
│  限制：                                                                  │
│  ├── 只保证单分区幂等                                                   │
│  ├── 只保证单会话内幂等                                                 │
│  └── max.in.flight.requests.per.connection <= 5                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 事务支持

```java
// 事务生产者示例
public class TransactionalProducer {
    
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("transactional.id", "order-processor-1");  // 必须
        props.put("enable.idempotence", "true");             // 自动启用
        
        KafkaProducer<String, String> producer = new KafkaProducer<>(props);
        
        // 初始化事务
        producer.initTransactions();
        
        try {
            while (true) {
                // 开始事务
                producer.beginTransaction();
                
                // 从源主题消费（需要配置 Consumer）
                ConsumerRecords<String, String> records = 
                    sourceConsumer.poll(Duration.ofMillis(100));
                
                // 处理并生产到目标主题
                for (ConsumerRecord<String, String> record : records) {
                    String processedValue = process(record.value());
                    producer.send(new ProducerRecord<>(
                        "target-topic", 
                        record.key(), 
                        processedValue
                    ));
                }
                
                // 将消费 Offset 纳入事务
                producer.sendOffsetsToTransaction(
                    getOffsetsToCommit(records),
                    sourceConsumer.groupMetadata()
                );
                
                // 提交事务
                producer.commitTransaction();
            }
            
        } catch (Exception e) {
            // 回滚事务
            producer.abortTransaction();
        } finally {
            producer.close();
        }
    }
}

// 事务消费者配置
Properties consumerProps = new Properties();
consumerProps.put("isolation.level", "read_committed");  // 关键配置
// 只读取已提交的事务消息

// 事务保证：
// 1. 原子性：事务内的所有消息要么全部可见，要么全部不可见
// 2. 跨分区：可以写入多个主题和分区
// 3. 消费-处理-生产：将消费 Offset 纳入事务
```

### 消费者幂等处理

```java
// 业务层幂等处理示例
public class IdempotentConsumer {
    
    private final RedisTemplate<String, String> redisTemplate;
    private final BusinessService businessService;
    
    public void consume(ConsumerRecord<String, String> record) {
        String messageId = buildMessageId(record);
        
        // 1. 检查是否已处理（Redis SETNX）
        Boolean isNew = redisTemplate.opsForValue()
            .setIfAbsent(
                "processed:" + messageId, 
                "1", 
                Duration.ofDays(7)
            );
        
        if (Boolean.FALSE.equals(isNew)) {
            log.info("Message already processed: {}", messageId);
            return;  // 已处理，跳过
        }
        
        try {
            // 2. 业务处理
            businessService.process(record.value());
            
        } catch (Exception e) {
            // 3. 处理失败，删除标记，允许重试
            redisTemplate.delete("processed:" + messageId);
            throw e;
        }
    }
    
    private String buildMessageId(ConsumerRecord<String, String> record) {
        return record.topic() + ":" + record.partition() + ":" + record.offset();
    }
}

// 数据库层幂等（唯一索引）
@Transactional
public void processWithDbIdempotent(ConsumerRecord<String, String> record) {
    String messageId = buildMessageId(record);
    
    try {
        // 插入处理记录（唯一索引）
        processedMessageRepository.insert(messageId, record.value());
        // 业务处理
        businessService.process(record.value());
    } catch (DuplicateKeyException e) {
        log.info("Duplicate message: {}", messageId);
        // 已处理，跳过
    }
}
```

## 消息顺序性

### 分区有序性

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Kafka 消息顺序性保证                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  核心原则：                                                              │
│  ├── 分区内有序：同一分区内的消息按写入顺序存储                         │
│  ├── 分区间无序：不同分区的消息顺序无法保证                             │
│  └── 相同 Key 保证进入同一分区                                         │
│                                                                         │
│  示例：订单状态变更                                                      │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  订单 1001: Created → Paid → Shipped → Completed              │    │
│  │                                                                 │    │
│  │  Key = "order-1001"                                            │    │
│  │                                                                 │    │
│  │  Partition 0:                                                  │    │
│  │  ┌────────────────────────────────────────────────────────┐   │    │
│  │  │ order-1001-Created │ order-1001-Paid │ ... │           │   │    │
│  │  │     (offset=0)      │    (offset=1)   │     │           │   │    │
│  │  └────────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  │  消费者按 offset 顺序消费，保证状态正确变更                     │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 生产者顺序保证

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    生产者顺序保证配置                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  问题场景：重试导致顺序错乱                                             │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  发送顺序：m1, m2, m3                                          │    │
│  │                                                                 │    │
│  │  m1 发送失败（重试中）                                          │    │
│  │  m2 发送成功                                                    │    │
│  │  m3 发送成功                                                    │    │
│  │  m1 重试成功                                                    │    │
│  │                                                                 │    │
│  │  Broker 收到顺序：m2, m3, m1  ← 顺序错乱！                      │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  解决方案 1：限制并发请求数                                             │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  // 幂等性关闭时                                                │    │
│  props.put("max.in.flight.requests.per.connection", 1);           │    │
│  // 一次只允许一个请求，保证顺序但性能差                            │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  解决方案 2：启用幂等性（推荐）                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  props.put("enable.idempotence", "true");                       │    │
│  props.put("max.in.flight.requests.per.connection", 5);           │    │
│  // 幂等性保证即使重试也不会乱序                                    │    │
│  │                                                                 │    │
│  │  Broker 端序列号检查：                                          │    │
│  │  m1 (seq=0) → m2 (seq=1) → m3 (seq=2)                          │    │
│  │  即使 m1 重试后到达，也会按序列号正确排序                       │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  最佳实践：                                                              │
│  ├── 启用 enable.idempotence=true                                      │
│  ├── 设置合理的 max.in.flight.requests.per.connection                 │
│  └── 使用 Key 确保相关消息进入同一分区                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 消费者顺序处理

```java
// 顺序消费最佳实践
public class OrderedConsumer {
    
    private final KafkaConsumer<String, String> consumer;
    private final BusinessService businessService;
    
    public void consume() {
        consumer.subscribe(Collections.singletonList("orders"));
        
        while (true) {
            ConsumerRecords<String, String> records = 
                consumer.poll(Duration.ofMillis(100));
            
            // 按分区顺序处理
            for (TopicPartition partition : records.partitions()) {
                List<ConsumerRecord<String, String>> partitionRecords = 
                    records.records(partition);
                
                // 单线程顺序处理同一分区的消息
                for (ConsumerRecord<String, String> record : partitionRecords) {
                    try {
                        businessService.process(record.value());
                    } catch (Exception e) {
                        // 处理失败，不继续处理该分区后续消息
                        // 保证顺序性
                        log.error("Process failed at offset: {}", record.offset());
                        break;
                    }
                }
                
                // 提交该分区最后的 Offset
                long lastOffset = partitionRecords.get(partitionRecords.size() - 1).offset();
                consumer.commitSync(Collections.singletonMap(
                    partition, 
                    new OffsetAndMetadata(lastOffset + 1)
                ));
            }
        }
    }
}

// 多线程顺序处理（每个分区一个线程）
public class PartitionThreadConsumer {
    
    private final ExecutorService executor;
    private final Map<TopicPartition, Future<?>> activeTasks = new ConcurrentHashMap<>();
    
    public void consume() {
        while (true) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
            
            for (TopicPartition partition : records.partitions()) {
                // 每个分区一个处理任务
                Future<?> future = executor.submit(() -> {
                    for (ConsumerRecord<String, String> record : records.records(partition)) {
                        process(record);
                    }
                });
                activeTasks.put(partition, future);
            }
            
            // 等待所有任务完成
            for (Map.Entry<TopicPartition, Future<?>> entry : activeTasks.entrySet()) {
                entry.getValue().get();  // 等待完成
            }
            
            // 提交 Offset
            consumer.commitSync();
            activeTasks.clear();
        }
    }
}
```

## 可靠性最佳实践

### 配置清单

```properties
# ========== 生产者配置 ==========
# 可靠性
acks=all
enable.idempotence=true
retries=Integer.MAX_VALUE
max.in.flight.requests.per.connection=5

# 性能
batch.size=16384
linger.ms=5
compression.type=lz4
buffer.memory=33554432

# 超时
request.timeout.ms=30000
delivery.timeout.ms=120000

# ========== Broker 配置 ==========
# 副本
default.replication.factor=3
min.insync.replicas=2

# ISR
replica.lag.time.max.ms=30000

# 选举
unclean.leader.election.enable=false
auto.leader.rebalance.enable=true

# ========== 消费者配置 ==========
# Offset 管理
enable.auto.commit=false

# 处理
max.poll.records=500
max.poll.interval.ms=300000

# 心跳
session.timeout.ms=10000
heartbeat.interval.ms=3000
```

### 监控指标

```
可靠性监控指标：
├── 生产者
│   ├── record-send-rate（发送速率）
│   ├── record-error-rate（错误速率）
│   ├── record-retry-rate（重试速率）
│   └── commit-latency-avg（提交延迟）
│
├── Broker
│   ├── OfflinePartitionsCount（离线分区数）
│   ├── UnderReplicatedPartitions（副本不足分区）
│   ├── ISRShrinks/ISRExpands（ISR 变化）
│   └── ActiveControllerCount（活跃 Controller）
│
└── 消费者
    ├── consumer-lag（消费延迟）
    ├── commit-rate（提交速率）
    └── join-time-ms（Rebalance 时间）
```

## 小结

本章我们学习了：

1. **可靠性三要素**：消息不丢失、不重复、有序性
2. **消息不丢失**：生产者、Broker、消费者三端保障
3. **Exactly Once**：幂等性生产者、事务支持、消费者幂等处理
4. **消息顺序性**：分区有序、生产者配置、消费者处理
5. **最佳实践**：配置清单、监控指标

## 参考资料

1. [Kafka Reliability Guarantee](https://kafka.apache.org/documentation/#semantics)
2. [KIP-447: Producer scalability for exactly once semantics](https://cwiki.apache.org/confluence/display/KAFKA/KIP-447)
3. [Kafka Exactly Once Semantics](https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/)

## 下一章预告

在下一章《高性能设计原理》中，我们将深入探讨：

- 顺序写与零拷贝
- Page Cache 机制
- 批量处理与压缩
- 网络与 IO 优化

---

**Kafka 核心原理系列持续更新中，欢迎关注！**
