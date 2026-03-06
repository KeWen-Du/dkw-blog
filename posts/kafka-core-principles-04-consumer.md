---
title: "Kafka核心原理（四）：消费者核心原理"
date: "2020-05-11"
excerpt: "深入理解Kafka消费者的工作机制、消费者组Rebalance原理、Offset管理与消费语义，掌握高效可靠的消息消费策略。"
tags: ["Kafka", "消息队列", "Consumer", "分布式系统"]
series:
  slug: "kafka-core-principles"
  title: "Kafka核心原理"
  order: 4
---

# Kafka核心原理（四）：消费者核心原理

## 前言

Kafka 消费者是消息系统的出口，负责从 Kafka 集群拉取消息并进行业务处理。本章将深入剖析消费者的工作原理，理解消费者组、Rebalance 机制、Offset 管理等核心概念。

## 消费者架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Kafka Consumer 架构                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        Consumer Client                            │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                   ConsumerCoordinator                        │ │  │
│  │  │  ├── Consumer Group 管理                                     │ │  │
│  │  │  ├── Rebalance 协调                                          │ │  │
│  │  │  └── Offset 提交管理                                         │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                              │                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                   Fetcher (拉取器)                           │ │  │
│  │  │  ├── 发送 FetchRequest                                       │ │  │
│  │  │  ├── 接收 FetchResponse                                      │ │  │
│  │  │  └── 解析消息记录                                            │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                              │                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                   CompletedFetch Queue                       │ │  │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │ │  │
│  │  │  │ Fetch 1 │ │ Fetch 2 │ │ Fetch 3 │ ...                   │ │  │
│  │  │  └─────────┘ └─────────┘ └─────────┘                       │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                              │                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                   Deserializer (反序列化器)                  │ │  │
│  │  │  ├── KeyDeserializer                                         │ │  │
│  │  │  └── ValueDeserializer                                       │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                              │                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                   ConsumerInterceptors                       │ │  │
│  │  │  ┌───────────┐   ┌───────────┐   ┌───────────┐             │ │  │
│  │  │  │Interceptor│──►│Interceptor│──►│Interceptor│             │ │  │
│  │  │  │    1      │   │    2      │   │    N      │             │ │  │
│  │  │  └───────────┘   └───────────┘   └───────────┘             │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                              │                                    │  │
│  └──────────────────────────────┼────────────────────────────────────┘  │
│                                 │                                       │
│                                 ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      Network Client                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                 │                                       │
│                                 ▼                                       │
│                        ┌─────────────────┐                              │
│                        │  Kafka Broker   │                              │
│                        └─────────────────┘                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 核心组件说明

```
Consumer 核心组件：
├── ConsumerCoordinator
│   ├── 与 Group Coordinator 通信
│   ├── 管理 Consumer Group 成员关系
│   ├── 协调 Rebalance 过程
│   └── 管理 Offset 提交
│
├── Fetcher
│   ├── 构建发送 FetchRequest
│   ├── 处理 FetchResponse
│   ├── 管理拉取缓冲区
│   └── 解析消息记录
│
├── ConsumerNetworkClient
│   ├── 网络连接管理
│   ├── 心跳发送
│   └── 请求超时处理
│
└── Deserializer
    ├── Key 反序列化
    └── Value 反序列化
```

## 消费者组（Consumer Group）

### 消费者组概念

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Consumer Group 工作原理                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  核心特性：                                                              │
│  ├── 同一组内的消费者分担消费分区                                       │
│  ├── 每个分区只能被组内一个消费者消费                                   │
│  └── 不同组可以独立消费同一主题                                         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Topic: orders (6分区)                         │   │
│  │                                                                  │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ │   │
│  │  │  P0    │ │  P1    │ │  P2    │ │  P3    │ │  P4    │ │  P5  │ │   │
│  │  └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ └───┬──┘ │   │
│  │       │          │          │          │          │         │    │   │
│  └───────┼──────────┼──────────┼──────────┼──────────┼─────────┼────┘   │
│          │          │          │          │          │         │        │
│          ▼          ▼          ▼          ▼          ▼         ▼        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                Consumer Group: order-processor                  │   │
│  │                                                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │   │
│  │  │  Consumer 1 │  │  Consumer 2 │  │  Consumer 3 │             │   │
│  │  │   (P0, P1)  │  │   (P2, P3)  │  │   (P4, P5)  │             │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘             │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                Consumer Group: order-analytics                   │   │
│  │                                                                  │   │
│  │  ┌─────────────────────┐  ┌─────────────────────┐              │   │
│  │  │    Consumer 1       │  │    Consumer 2       │              │   │
│  │  │    (P0, P1, P2)     │  │    (P3, P4, P5)     │              │   │
│  │  └─────────────────────┘  └─────────────────────┘              │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  说明：两个消费者组独立消费，各自维护自己的 Offset                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 消费者与分区分配

```
分区分配规则：
├── 消费者数量 < 分区数量
│   └── 部分消费者负责多个分区
│
├── 消费者数量 = 分区数量
│   └── 每个消费者负责一个分区
│
└── 消费者数量 > 分区数量
    └── 部分消费者空闲

示例：
Topic: events (4分区)

场景1：2个消费者
┌─────────────────────────────────────────┐
│  Consumer 1: P0, P1                     │
│  Consumer 2: P2, P3                     │
└─────────────────────────────────────────┘

场景2：4个消费者
┌─────────────────────────────────────────┐
│  Consumer 1: P0                         │
│  Consumer 2: P1                         │
│  Consumer 3: P2                         │
│  Consumer 4: P3                         │
└─────────────────────────────────────────┘

场景3：6个消费者
┌─────────────────────────────────────────┐
│  Consumer 1: P0                         │
│  Consumer 2: P1                         │
│  Consumer 3: P2                         │
│  Consumer 4: P3                         │
│  Consumer 5: 空闲                       │
│  Consumer 6: 空闲                       │
└─────────────────────────────────────────┘
```

## Rebalance 机制

### Rebalance 触发条件

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Rebalance 触发条件                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 消费者加入组                                                        │
│     └── 新消费者启动，加入 Consumer Group                               │
│                                                                         │
│  2. 消费者离开组                                                        │
│     ├── 消费者主动调用 unsubscribe()                                    │
│     └── 消费者崩溃或网络断开                                            │
│                                                                         │
│  3. 消费者心跳超时                                                      │
│     ├── session.timeout.ms 超时                                         │
│     └── Group Coordinator 认为消费者失效                                │
│                                                                         │
│  4. 主题分区数变化                                                      │
│     └── 新增分区触发 Rebalance                                          │
│                                                                         │
│  5. 订阅主题变化                                                        │
│     └── 消费者订阅新的主题                                              │
│                                                                         │
│  6. 最大处理时间超时                                                    │
│     └── max.poll.interval.ms 超时                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Rebalance 过程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Rebalance 协议流程                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  消费者组状态机：                                                        │
│  ┌──────────────┐                                                      │
│  │    Empty     │ ← 初始状态（无成员）                                 │
│  └──────┬───────┘                                                      │
│         │                                                              │
│         ▼                                                              │
│  ┌──────────────┐     ┌──────────────┐                                │
│  │   Preparing  │────►│   Completing │                                │
│  │  Rebalance   │     │  Rebalance   │                                │
│  └──────┬───────┘     └──────┬───────┘                                │
│         │                    │                                         │
│         │                    ▼                                         │
│         │            ┌──────────────┐                                  │
│         └───────────►│    Stable    │ ← 正常状态                       │
│                      └──────────────┘                                  │
│                                                                         │
│  Rebalance 详细流程：                                                   │
│                                                                         │
│  Consumer 1     Consumer 2     Group Coordinator                       │
│      │              │                │                                 │
│      │──JoinGroup──►│                │                                 │
│      │              │                │                                 │
│      │          JoinGroup───────────►│                                 │
│      │              │                │                                 │
│      │◄─────────────SyncGroup────────│                                 │
│      │              │                │                                 │
│      │              │◄──SyncGroup────│                                 │
│      │              │                │                                 │
│      │              │                │                                 │
│      │◀─────────────分配结果────────►│                                 │
│      │              │                │                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Rebalance 策略

```java
// 1. RangeAssignor（默认）
// 按范围分配，可能导致不均衡
// 示例：7分区，3消费者 → [3,2,2]

// 2. RoundRobinAssignor
// 轮询分配，均衡性好
// 示例：7分区，3消费者 → [3,2,2]

// 3. StickyAssignor
// 粘性分配，最小化分区移动
// Rebalance时尽量保持原有分配

// 4. CooperativeStickyAssignor
// 协作粘性分配（Kafka 2.4+）
// 渐进式Rebalance，减少消费中断

// 配置方式
Properties props = new Properties();
props.put("partition.assignment.strategy", 
    "org.apache.kafka.clients.consumer.StickyAssignor");

// 推荐：使用 CooperativeStickyAssignor
props.put("partition.assignment.strategy",
    "org.apache.kafka.clients.consumer.CooperativeStickyAssignor");
```

### Rebalance 问题与优化

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Rebalance 问题与解决方案                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  问题1：消费暂停（Stop-the-World）                                      │
│  ├── 原因：Rebalance期间所有消费者停止消费                              │
│  └── 解决：使用 CooperativeStickyAssignor                              │
│                                                                         │
│  问题2：频繁Rebalance                                                   │
│  ├── 原因：心跳超时、处理时间过长                                       │
│  └── 解决：调整超时参数                                                 │
│                                                                         │
│  问题3：重复消费                                                        │
│  ├── 原因：Rebalance时Offset未提交                                      │
│  └── 解决：及时提交Offset                                               │
│                                                                         │
│  优化配置：                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  # 心跳配置                                                       │   │
│  │  heartbeat.interval.ms=3000         # 心跳间隔 3秒               │   │
│  │  session.timeout.ms=10000           # 会话超时 10秒              │   │
│  │                                                                   │   │
│  │  # 处理时间配置                                                   │   │
│  │  max.poll.interval.ms=300000        # 最大处理间隔 5分钟         │   │
│  │  max.poll.records=500              # 单次拉取记录数              │   │
│  │                                                                   │   │
│  │  # 分区分配策略                                                   │   │
│  │  partition.assignment.strategy=CooperativeStickyAssignor          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Offset 管理

### Offset 存储机制

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Offset 存储机制                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  存储位置：__consumer_offsets 主题                                      │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  __consumer_offsets 主题结构                                    │    │
│  │                                                                 │    │
│  │  分区数：50（可配置 offsets.topic.num.partitions）              │    │
│  │                                                                 │    │
│  │  Key 格式：                                                     │    │
│  │  ┌────────────────────────────────────────────────────────┐   │    │
│  │  │ <group.id>, <topic>, <partition>                       │   │    │
│  │  │ 示例：my-group, orders, 0                               │   │    │
│  │  └────────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  │  Value 格式：                                                   │    │
│  │  ┌────────────────────────────────────────────────────────┐   │    │
│  │  │ OffsetAndMetadata(offset, leaderEpoch, metadata)       │   │    │
│  │  │ 示例：{offset: 12345, leaderEpoch: 5, metadata: ""}     │   │    │
│  │  └────────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  分区计算：group.id.hashCode % 50                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Offset 提交策略

```java
// 1. 自动提交（默认）
// 可能丢失消息（自动提交后处理失败）
Properties props = new Properties();
props.put("enable.auto.commit", "true");
props.put("auto.commit.interval.ms", "5000");  // 每5秒提交

// 2. 同步提交
// 阻塞等待提交完成，可靠但影响性能
while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        processRecord(record);
    }
    try {
        consumer.commitSync();  // 同步提交
    } catch (CommitFailedException e) {
        // 提交失败处理
        log.error("Commit failed", e);
    }
}

// 3. 异步提交
// 高性能，但可能提交失败
while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        processRecord(record);
    }
    consumer.commitAsync(new OffsetCommitCallback() {
        @Override
        public void onComplete(Map<TopicPartition, OffsetAndMetadata> offsets,
                               Exception exception) {
            if (exception != null) {
                log.error("Commit failed for offsets {}", offsets, exception);
            }
        }
    });
}

// 4. 混合提交（推荐）
// 正常异步提交，关闭前同步提交
try {
    while (true) {
        ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
        for (ConsumerRecord<String, String> record : records) {
            processRecord(record);
        }
        consumer.commitAsync();  // 异步提交
    }
} finally {
    try {
        consumer.commitSync();  // 关闭前同步提交
    } finally {
        consumer.close();
    }
}

// 5. 指定Offset提交
// 精确控制提交位置
Map<TopicPartition, OffsetAndMetadata> commitOffsets = new HashMap<>();
for (ConsumerRecord<String, String> record : records) {
    processRecord(record);
    commitOffsets.put(
        new TopicPartition(record.topic(), record.partition()),
        new OffsetAndMetadata(record.offset() + 1)
    );
}
consumer.commitSync(commitOffsets);
```

### Offset 重置策略

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Offset 重置策略                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  auto.offset.reset 配置：                                               │
│                                                                         │
│  1. earliest                                                            │
│     └── 从最早可用消息开始消费                                          │
│     └── 适用场景：新消费者组首次消费                                    │
│                                                                         │
│  2. latest（默认）                                                      │
│     └── 从最新消息开始消费                                              │
│     └── 适用场景：只关心新数据                                          │
│                                                                         │
│  3. none                                                                │
│     └── 抛出异常，不自动重置                                            │
│     └── 适用场景：需要明确Offset位置                                    │
│                                                                         │
│  触发条件：                                                              │
│  ├── 消费者组首次启动                                                   │
│  ├── Offset 被删除（过期）                                              │
│  └── Offset 不存在                                                      │
│                                                                         │
│  手动重置 Offset：                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  // 从最早开始                                                   │   │
│  │  consumer.seekToBeginning(partitions);                          │   │
│  │                                                                  │   │
│  │  // 从最新开始                                                   │   │
│  │  consumer.seekToEnd(partitions);                                │   │
│  │                                                                  │   │
│  │  // 指定位置                                                     │   │
│  │  consumer.seek(partition, offset);                              │   │
│  │                                                                  │   │
│  │  // 按时间戳查找                                                 │   │
│  │  Map<TopicPartition, Long> timestamps = ...;                    │   │
│  │  Map<TopicPartition, OffsetAndTimestamp> offsets =              │   │
│  │      consumer.offsetsForTimes(timestamps);                      │   │
│  │  for (Map.Entry<TopicPartition, OffsetAndTimestamp> entry :    │   │
│  │       offsets.entrySet()) {                                     │   │
│  │      consumer.seek(entry.getKey(), entry.getValue().offset());  │   │
│  │  }                                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 消费语义

### 三种消费语义

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    消费语义对比                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. At Most Once（最多一次）                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  特点：消息可能丢失，但不会重复                                   │   │
│  │                                                                  │   │
│  │  实现方式：                                                       │   │
│  │  ├── enable.auto.commit=true                                     │   │
│  │  ├── 先提交Offset，再处理消息                                     │   │
│  │  └── 处理失败后无法重试                                           │   │
│  │                                                                  │   │
│  │  适用场景：日志收集，丢失少量数据可接受                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  2. At Least Once（至少一次）                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  特点：消息不丢失，但可能重复                                     │   │
│  │                                                                  │   │
│  │  实现方式：                                                       │   │
│  │  ├── enable.auto.commit=false                                    │   │
│  │  ├── 先处理消息，再提交Offset                                     │   │
│  │  └── 处理成功但提交失败会重复消费                                 │   │
│  │                                                                  │   │
│  │  适用场景：业务处理，配合幂等性设计                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  3. Exactly Once（精确一次）                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  特点：消息不丢失、不重复                                         │   │
│  │                                                                  │   │
│  │  实现方式：                                                       │   │
│  │  ├── 方式一：消费者事务                                           │   │
│  │  │   └── 将消费和业务处理放入同一事务                            │   │
│  │  │                                                               │   │
│  │  ├── 方式二：外部存储                                             │   │
│  │  │   └── 将Offset和业务数据一起存储                              │   │
│  │  │                                                               │   │
│  │  └── 方式三：幂等性消费                                           │   │
│  │      └── 业务层面保证重复消费的幂等性                            │   │
│  │                                                                  │   │
│  │  适用场景：金融交易、订单处理等高可靠场景                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 幂等性消费实现

```java
// 方式一：基于数据库唯一索引
public class IdempotentConsumer {
    
    public void process(ConsumerRecord<String, String> record) {
        String messageId = record.topic() + "-" + record.partition() 
                          + "-" + record.offset();
        
        try {
            // 插入消息ID，唯一索引保证幂等
            jdbcTemplate.update(
                "INSERT INTO processed_messages (message_id, data) VALUES (?, ?)",
                messageId, record.value()
            );
            // 业务处理...
        } catch (DuplicateKeyException e) {
            // 消息已处理，跳过
            log.info("Message already processed: {}", messageId);
        }
    }
}

// 方式二：基于Redis
public class RedisIdempotentConsumer {
    
    private final RedisTemplate<String, String> redisTemplate;
    
    public void process(ConsumerRecord<String, String> record) {
        String messageId = buildMessageId(record);
        
        // SETNX 保证原子性
        Boolean isNew = redisTemplate.opsForValue()
            .setIfAbsent(messageId, "1", Duration.ofHours(24));
        
        if (Boolean.TRUE.equals(isNew)) {
            // 新消息，处理业务
            doBusiness(record);
        } else {
            // 重复消息，跳过
            log.info("Duplicate message: {}", messageId);
        }
    }
}

// 方式三：Offset与业务数据同库存储
public class TransactionalConsumer {
    
    @Transactional
    public void consumeAndProcess() {
        ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
        
        for (ConsumerRecord<String, String> record : records) {
            // 1. 业务处理（同一事务）
            processBusiness(record);
            
            // 2. 存储Offset（同一事务）
            saveOffset(record.topic(), record.partition(), record.offset());
        }
        
        // 事务提交，Offset和业务数据一起持久化
    }
}
```

## 消费者性能优化

### 关键配置参数

```properties
# 拉取配置
fetch.min.bytes=1                  # 最小拉取字节数
fetch.max.bytes=52428800           # 最大拉取字节数 50MB
fetch.max.wait.ms=500              # 最大等待时间
max.partition.fetch.bytes=1048576 # 每分区最大拉取 1MB

# 处理配置
max.poll.records=500               # 单次拉取最大记录数
max.poll.interval.ms=300000        # 最大处理间隔 5分钟

# 连接配置
connections.max.idle.ms=540000     # 连接空闲超时
request.timeout.ms=30000           # 请求超时

# 心跳配置
heartbeat.interval.ms=3000         # 心跳间隔
session.timeout.ms=10000           # 会话超时
```

### 多线程消费模式

```java
// 模式一：一个消费者线程，多个工作线程
public class WorkerThreadConsumer {
    
    private final KafkaConsumer<String, String> consumer;
    private final ExecutorService executor;
    
    public WorkerThreadConsumer(int workerCount) {
        this.consumer = new KafkaConsumer<>(props);
        this.executor = Executors.newFixedThreadPool(workerCount);
    }
    
    public void run() {
        try {
            while (true) {
                ConsumerRecords<String, String> records = 
                    consumer.poll(Duration.ofMillis(100));
                
                List<Future<?>> futures = new ArrayList<>();
                for (ConsumerRecord<String, String> record : records) {
                    futures.add(executor.submit(() -> process(record)));
                }
                
                // 等待所有任务完成
                for (Future<?> future : futures) {
                    future.get();
                }
                
                // 所有处理完成后再提交
                consumer.commitSync();
            }
        } catch (Exception e) {
            // 异常处理
        } finally {
            executor.shutdown();
            consumer.close();
        }
    }
}

// 模式二：多个消费者实例（推荐）
public class MultiConsumerThread {
    
    public static void main(String[] args) {
        int consumerCount = 3;
        List<Thread> threads = new ArrayList<>();
        
        for (int i = 0; i < consumerCount; i++) {
            Thread thread = new Thread(new ConsumerWorker());
            threads.add(thread);
            thread.start();
        }
        
        // 等待所有线程
        for (Thread thread : threads) {
            thread.join();
        }
    }
}

class ConsumerWorker implements Runnable {
    
    @Override
    public void run() {
        Properties props = new Properties();
        props.put("group.id", "my-group");
        // ... 其他配置
        
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(Collections.singletonList("topic"));
            
            while (true) {
                ConsumerRecords<String, String> records = 
                    consumer.poll(Duration.ofMillis(100));
                
                for (ConsumerRecord<String, String> record : records) {
                    process(record);
                }
                
                consumer.commitAsync();
            }
        }
    }
}
```

## 消费者最佳实践

### 消费处理模板

```java
public class BestPracticeConsumer {
    
    private final KafkaConsumer<String, String> consumer;
    private volatile boolean running = true;
    
    public void start() {
        try {
            consumer.subscribe(Collections.singletonList("topic"));
            
            while (running) {
                try {
                    ConsumerRecords<String, String> records = 
                        consumer.poll(Duration.ofMillis(100));
                    
                    if (records.isEmpty()) {
                        continue;
                    }
                    
                    // 批量处理
                    processBatch(records);
                    
                    // 异步提交
                    consumer.commitAsync();
                    
                } catch (WakeupException e) {
                    // 正常退出
                    if (!running) break;
                } catch (Exception e) {
                    log.error("Processing error", e);
                    // 根据异常类型决定是否继续
                }
            }
        } finally {
            try {
                // 最后一次同步提交
                consumer.commitSync();
            } finally {
                consumer.close();
            }
        }
    }
    
    public void shutdown() {
        running = false;
        consumer.wakeup();  // 唤醒 poll
    }
    
    private void processBatch(ConsumerRecords<String, String> records) {
        // 批量处理逻辑
        // 可以利用并行流提高处理速度
        records.partitions().parallelStream().forEach(partition -> {
            for (ConsumerRecord<String, String> record : records.records(partition)) {
                process(record);
            }
        });
    }
}
```

### 监控指标

```
消费者关键监控指标：
├── consumer-lag
│   └── 消费延迟（最重要指标）
│
├── consumer-lead
│   └── 消费领先（距离日志末尾的距离）
│
├── records-consumed-rate
│   └── 消息消费速率
│
├── bytes-consumed-rate
│   └── 字节消费速率
│
├── fetch-rate
│   └── 拉取请求速率
│
├── commit-rate
│   └── Offset提交速率
│
├── join-rate
│   └── Rebalance次数
│
└── assigned-partitions
    └── 分配的分区数
```

## 小结

本章我们学习了：

1. **消费者架构**：ConsumerCoordinator、Fetcher、NetworkClient
2. **消费者组**：分区分配、组管理机制
3. **Rebalance机制**：触发条件、过程、优化策略
4. **Offset管理**：存储机制、提交策略、重置策略
5. **消费语义**：At Most Once、At Least Once、Exactly Once
6. **性能优化**：关键配置、多线程模式

## 参考资料

1. [Kafka Consumer Configuration](https://kafka.apache.org/documentation/#consumerconfigs)
2. [Kafka Consumer Internals](https://developer.confluent.io/courses/apache-kafka/consumer/)
3. [KIP-429: Kafka Consumer Incremental Rebalance](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429)

## 下一章预告

在下一章《Broker与副本机制》中，我们将深入探讨：

- Broker 核心组件与工作原理
- 副本机制与 ISR 管理
- Leader 选举与故障恢复
- Controller 选举与元数据管理

---

**Kafka 核心原理系列持续更新中，欢迎关注！**
