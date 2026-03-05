---
title: "Flink 底层原理系列（五）：状态管理"
date: "2024-01-06"
excerpt: "深入解析 Flink 状态管理机制，包括 Keyed State、Operator State、State Backend 以及状态一致性保证。"
tags: ["Flink", "流处理", "状态管理", "State Backend"]
series:
  slug: "flink-core-principles"
  title: "Flink 底层原理系列"
  order: 5
---

## 前言

状态管理是 Flink 的核心特性之一。通过状态管理，Flink 能够实现精确一次语义、支持复杂的业务逻辑，并在故障恢复后继续处理。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Keyed State | ⭐⭐⭐ | 高频考点 | ✅ |
| Operator State | ⭐⭐⭐ | 高频考点 | ✅ |
| State Backend | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| 状态一致性 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |

## 面试考点

1. Keyed State 和 Operator State 有什么区别？
2. Flink 有哪些 State Backend？如何选择？
3. 什么是状态后端？RocksDB 和 HashMap 有什么区别？
4. 如何保证状态一致性？

## 状态类型

### Keyed State 与 Operator State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Flink 状态类型                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Keyed State（键控状态）                                        │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • 绑定到 Key，只能在 KeyedStream 上使用                   │ │   │
│  │  │  • 每个 Key 有独立的状态实例                               │ │   │
│  │  │  • 自动分区，随 Key 迁移                                   │ │   │
│  │  │                                                           │ │   │
│  │  │  类型：                                                    │ │   │
│  │  │  • ValueState<T>: 单值状态                                 │ │   │
│  │  │  • ListState<T>: 列表状态                                  │ │   │
│  │  │  • MapState<K, V>: 映射状态                                │ │   │
│  │  │  • ReducingState<T>: 归约状态                              │ │   │
│  │  │  • AggregatingState<IN, OUT>: 聚合状态                     │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  Operator State（算子状态）                                     │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • 绑定到算子并行度，与 Key 无关                           │ │   │
│  │  │  • 每个并行实例有独立的状态                                 │ │   │
│  │  │  • 需要手动管理恢复方式                                     │ │   │
│  │  │                                                           │ │   │
│  │  │  类型：                                                    │ │   │
│  │  │  • ListState<T>: 列表状态                                  │ │   │
│  │  │  • UnionListState<T>: 联合列表状态                         │ │   │
│  │  │  • BroadcastState<K, V>: 广播状态                          │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  对比：                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  特性            Keyed State       Operator State               │   │
│  │  ────────────────────────────────────────────────────────────── │   │
│  │  绑定对象        Key               算子并行度                    │   │
│  │  使用限制        KeyedStream       任意算子                      │   │
│  │  分区方式        自动随 Key 迁移    手动定义恢复策略              │   │
│  │  典型场景        聚合、去重        Source Offset、广播维度       │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Keyed State 使用示例

```java
// Keyed State 使用示例
public class CountWindowFunction extends KeyedProcessFunction<String, Event, Result> {
    
    // 声明状态
    private ValueState<Long> countState;
    private ListState<Event> eventListState;
    
    @Override
    public void open(Configuration parameters) {
        // 初始化状态
        ValueStateDescriptor<Long> countDescriptor = 
            new ValueStateDescriptor<>("count", Long.class);
        countState = getRuntimeContext().getState(countDescriptor);
        
        ListStateDescriptor<Event> listDescriptor = 
            new ListStateDescriptor<>("events", Event.class);
        eventListState = getRuntimeContext().getListState(listDescriptor);
    }
    
    @Override
    public void processElement(Event event, Context ctx, Collector<Result> out) 
        throws Exception {
        
        // 读取状态
        Long count = countState.value();
        if (count == null) {
            count = 0L;
        }
        
        // 更新状态
        countState.update(count + 1);
        eventListState.add(event);
        
        // 输出结果
        out.collect(new Result(event.getKey(), count + 1));
    }
}
```

## State Backend

### State Backend 类型

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        State Backend 类型                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. HashMapStateBackend                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  特点：                                                         │   │
│  │  • 状态存储在 JVM 堆内存                                        │   │
│  │  • 访问速度快                                                   │   │
│  │  • 受 GC 影响                                                   │   │
│  │  • 状态大小受限于内存                                           │   │
│  │                                                                 │   │
│  │  适用场景：                                                     │   │
│  │  • 状态较小（< 几GB）                                           │   │
│  │  • 对延迟敏感                                                   │   │
│  │                                                                 │   │
│  │  Checkpoint 存储：                                              │   │
│  │  • Memory: JobManager 内存（不推荐生产）                        │   │
│  │  • FileSystem: 外部文件系统（推荐）                             │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  2. EmbeddedRocksDBStateBackend                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  特点：                                                         │   │
│  │  • 状态存储在 RocksDB（嵌入式 KV 存储）                         │   │
│  │  • 支持超大状态（> 内存限制）                                   │   │
│  │  • 访问速度较慢（序列化/反序列化）                              │   │
│  │  • 不受 GC 影响                                                 │   │
│  │  • 支持增量 Checkpoint                                          │   │
│  │                                                                 │   │
│  │  适用场景：                                                     │   │
│  │  • 状态较大（> 几GB）                                           │   │
│  │  • 需要增量 Checkpoint                                          │   │
│  │  • 窗口较长、状态 TTL 较长                                      │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  选择建议：                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  状态大小 < 1GB    → HashMapStateBackend                       │   │
│  │  状态大小 > 1GB    → RocksDBStateBackend                       │   │
│  │  需要增量 Checkpoint → RocksDBStateBackend                     │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Backend 配置

```java
// 配置 HashMapStateBackend
env.setStateBackend(new HashMapStateBackend());
env.getCheckpointConfig().setCheckpointStorage("file:///checkpoints");

// 配置 RocksDBStateBackend
env.setStateBackend(new EmbeddedRocksDBStateBackend());
env.getCheckpointConfig().setCheckpointStorage("hdfs:///checkpoints");

// 启用增量 Checkpoint（仅 RocksDB 支持）
EmbeddedRocksDBStateBackend rocksDBBackend = new EmbeddedRocksDBStateBackend();
rocksDBBackend.setIncrementalCheckpointingEnabled(true);
env.setStateBackend(rocksDBBackend);
```

## 状态一致性

### 一致性保证

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        状态一致性保证                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Flink 通过 Checkpoint 机制保证状态一致性：                              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Checkpoint 一致性保证：                                        │   │
│  │                                                                 │   │
│  │  1. Barrier 对齐                                               │   │
│  │     • Align: 等待所有输入的 Barrier                            │   │
│  │     • 保证状态一致性                                           │   │
│  │     • 可能增加延迟                                             │   │
│  │                                                                 │   │
│  │  2. Exactly-Once 语义                                          │   │
│  │     • 状态只更新一次                                           │   │
│  │     • 配合 Barrier 对齐实现                                    │   │
│  │                                                                 │   │
│  │  3. At-Least-Once 语义                                         │   │
│  │     • 不等待 Barrier 对齐                                      │   │
│  │     • 可能重复处理                                             │   │
│  │     • 延迟更低                                                 │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  配置 Checkpoint 模式：                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  // Exactly-Once 模式                                          │   │
│  │  env.getCheckpointConfig().setCheckpointingMode(               │   │
│  │      CheckpointingMode.EXACTLY_ONCE);                          │   │
│  │                                                                 │   │
│  │  // At-Least-Once 模式                                         │   │
│  │  env.getCheckpointConfig().setCheckpointingMode(               │   │
│  │      CheckpointingMode.AT_LEAST_ONCE);                         │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 状态 TTL

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        状态 TTL（Time To Live）                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  状态 TTL 用于自动清理过期状态：                                         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  配置示例：                                                     │   │
│  │                                                                 │   │
│  │  StateTtlConfig ttlConfig = StateTtlConfig                     │   │
│  │      .newBuilder(Time.hours(24))                                │   │
│  │      .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)│   │
│  │      .setStateVisibility(StateTtlConfig.StateVisibility.NeverReturnExpired)│   │
│  │      .cleanupInRocksdbCompactFilter(1000)                      │   │
│  │      .build();                                                  │   │
│  │                                                                 │   │
│  │  ValueStateDescriptor<String> descriptor =                     │   │
│  │      new ValueStateDescriptor<>("state", String.class);        │   │
│  │  descriptor.enableTimeToLive(ttlConfig);                       │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  TTL 配置项：                                                           │
│  • UpdateType: 何时更新 TTL（创建/读取/写入）                           │
│  • StateVisibility: 过期状态是否可见                                   │
│  • CleanupStrategy: 清理策略（全量扫描/增量清理/RocksDB Compact）       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 总结

本章深入解析了 Flink 状态管理：

| 概念 | 说明 |
|------|------|
| Keyed State | 绑定到 Key，自动分区 |
| Operator State | 绑定到算子并行度 |
| HashMapStateBackend | 内存存储，速度快 |
| RocksDBStateBackend | 磁盘存储，支持大状态 |

## 参考资料

- [State Backends](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/state_backends/)
- [Working with State](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/fault-tolerance/state/)

## 下一章预告

下一章将深入解析 **容错机制**，包括：
- Checkpoint 原理
- Savepoint 使用
- Exactly-Once 实现
