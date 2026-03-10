---
title: "Flink 底层原理系列（四）：时间与窗口"
date: "2021-02-02"
excerpt: "深入解析 Flink 时间语义与窗口机制，包括 Watermark 生成传播源码、窗口分配器实现、触发器机制以及窗口状态管理。"
tags: ["Flink", "流处理", "时间语义", "窗口"]
series:
  slug: "flink-core-principles"
  title: "Flink 底层原理系列"
  order: 4
---

## 前言

时间语义和窗口机制是 Flink 流处理的核心特性。理解 Event Time、Watermark 的生成与传播机制，以及窗口触发器的实现原理，对于正确处理乱序数据至关重要。本章将从源码层面深入解析这些核心机制。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 时间语义 | ⭐⭐⭐ | 高频考点 | ✅ |
| Watermark 源码 | ⭐⭐⭐⭐⭐ | 高频考点 | ✅ |
| 窗口分配器 | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| 触发器机制 | ⭐⭐⭐⭐⭐ | 进阶考点 | ✅ |

## 面试考点

1. Event Time 和 Processing Time 有什么区别？底层如何实现？
2. Watermark 是如何生成和传播的？
3. 窗口是如何分配和触发计算的？
4. Trigger 的实现原理是什么？

## 时间语义底层实现

### 三种时间语义

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Flink 时间语义                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  1. Processing Time（处理时间）                                 │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • 数据被处理时的机器时间                                  │ │   │
│  │  │  • 最简单，延迟最低                                        │ │   │
│  │  │  • 不确定性：依赖处理速度、网络延迟                        │ │   │
│  │  │  • 适用于：实时监控、低延迟要求场景                        │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  2. Event Time（事件时间）                                      │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • 数据本身携带的时间戳                                    │ │   │
│  │  │  • 确定性：结果不依赖处理顺序                              │ │   │
│  │  │  • 需要 Watermark 配合                                     │ │   │
│  │  │  • 适用于：乱序数据处理、精确结果要求                      │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  3. Ingestion Time（摄入时间）                                  │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • 数据进入 Flink 时的机器时间                             │ │   │
│  │  │  • 介于 Processing Time 和 Event Time 之间                 │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### TimeService 实现

```java
// 位于 org.apache.flink.streaming.api.operators.TimerService

/**
 * TimerService 是 Flink 时间服务的核心接口
 * 提供时间获取和定时器注册能力
 */
public interface TimerService {
    
    // 错误信息：仅支持 Processing Time
    String UNSUPPORTED_REGISTER_TIMER_MSG = 
        "Setting timers is only supported on a keyed streams.";
    
    // 获取当前 Processing Time
    long currentProcessingTime();
    
    // 获取当前 Watermark（Event Time 进度）
    long currentWatermark();
    
    // 注册 Event Time 定时器
    void registerEventTimeTimer(long time) throws Exception;
    
    // 注册 Processing Time 定时器
    void registerProcessingTimeTimer(long time) throws Exception;
    
    // 删除 Event Time 定时器
    void deleteEventTimeTimer(long time);
    
    // 删除 Processing Time 定时器
    void deleteProcessingTimeTimer(long time);
}

// SystemProcessingTimeService 实现
public class SystemProcessingTimeService implements TimerService {
    
    // 定时器队列（按触发时间排序）
    private final PriorityQueue<TimerHeapInternalTimer<Long, VoidNamespace>> processingTimeTimers;
    
    // 定时器执行器
    private final ScheduledThreadPoolExecutor timerExecutor;
    
    @Override
    public long currentProcessingTime() {
        return System.currentTimeMillis();
    }
    
    @Override
    public long currentWatermark() {
        return Long.MIN_VALUE;  // Processing Time 不使用 Watermark
    }
    
    @Override
    public void registerProcessingTimeTimer(long time) {
        TimerHeapInternalTimer<Long, VoidNamespace> timer = 
            new TimerHeapInternalTimer<>(time, getCurrentKey(), VoidNamespace.get());
        
        processingTimeTimers.add(timer);
        
        // 注册到 ScheduledExecutor
        long delay = time - currentProcessingTime();
        if (delay > 0) {
            timerExecutor.schedule(
                () -> triggerTimer(timer),
                delay,
                TimeUnit.MILLISECONDS);
        }
    }
    
    private void triggerTimer(TimerHeapInternalTimer<Long, VoidNamespace> timer) {
        // 触发定时器回调
        if (target instanceof Triggerable) {
            ((Triggerable<?, ?>) target).onProcessingTime(timer.getTimestamp());
        }
    }
}
```

### InternalTimerService 实现

```java
// 位于 org.apache.flink.streaming.api.operators.InternalTimerService

/**
 * InternalTimerService 提供完整的定时器管理能力
 * 支持 Keyed Stream 的 Event Time 和 Processing Time 定时器
 */
public class InternalTimerServiceImpl<K, N> implements InternalTimerService<N> {
    
    // Event Time 定时器队列
    private final KeyGroupedInternalPriorityQueue<TimerHeapInternalTimer<K, N>> eventTimeTimersQueue;
    
    // Processing Time 定时器队列
    private final KeyGroupedInternalPriorityQueue<TimerHeapInternalTimer<K, N>> processingTimeTimersQueue;
    
    // 当前 Watermark
    private long currentWatermark = Long.MIN_VALUE;
    
    // 当前 Processing Time
    private long currentProcessingTime;
    
    // 定时器回调目标
    private Triggerable<K, N> triggerTarget;
    
    @Override
    public long currentWatermark() {
        return currentWatermark;
    }
    
    @Override
    public void registerEventTimeTimer(N namespace, long time) {
        // 创建定时器
        TimerHeapInternalTimer<K, N> timer = 
            new TimerHeapInternalTimer<>(time, (K) keyContext.getCurrentKey(), namespace);
        
        // 添加到优先队列
        eventTimeTimersQueue.add(timer);
    }
    
    @Override
    public void registerProcessingTimeTimer(N namespace, long time) {
        TimerHeapInternalTimer<K, N> timer = 
            new TimerHeapInternalTimer<>(time, (K) keyContext.getCurrentKey(), namespace);
        
        processingTimeTimersQueue.add(timer);
        
        // 注册到系统定时器
        long delay = time - currentProcessingTime;
        if (delay > 0) {
            timerService.registerProcessingTimeTimer(time);
        }
    }
    
    // 处理 Watermark 推进，触发 Event Time 定时器
    public void advanceWatermark(long watermark) throws Exception {
        this.currentWatermark = watermark;
        
        // 从队列中取出所有到期的定时器
        TimerHeapInternalTimer<K, N> timer;
        while ((timer = eventTimeTimersQueue.peek()) != null 
               && timer.getTimestamp() <= watermark) {
            
            eventTimeTimersQueue.poll();
            
            // 设置当前 Key
            keyContext.setCurrentKey(timer.getKey());
            
            // 触发定时器回调
            triggerTarget.onEventTime(timer);
        }
    }
    
    // 处理 Processing Time 推进，触发 Processing Time 定时器
    public void onProcessingTime(long timestamp) throws Exception {
        this.currentProcessingTime = timestamp;
        
        TimerHeapInternalTimer<K, N> timer;
        while ((timer = processingTimeTimersQueue.peek()) != null 
               && timer.getTimestamp() <= timestamp) {
            
            processingTimeTimersQueue.poll();
            
            keyContext.setCurrentKey(timer.getKey());
            
            triggerTarget.onProcessingTime(timer);
        }
    }
}
```

## Watermark 生成与传播

### WatermarkStrategy 接口

```java
// 位于 org.apache.flink.api.common.eventtime.WatermarkStrategy

/**
 * WatermarkStrategy 是 Watermark 生成的核心接口
 * 定义了 Watermark 生成器和时间戳提取器
 */
@Public
public interface WatermarkStrategy<T> extends Serializable {
    
    // 创建 Watermark 生成器
    WatermarkGenerator<T> createWatermarkGenerator(WatermarkGeneratorSupplier.Context context);
    
    // 创建时间戳分配器
    default TimestampAssigner<T> createTimestampAssigner(
            TimestampAssignerSupplier.Context context) {
        return (element, recordTimestamp) -> recordTimestamp;
    }
    
    // 带有乱序容忍的 Watermark 策略
    static <T> WatermarkStrategy<T> forBoundedOutOfOrderness(Duration maxOutOfOrderness) {
        return (ctx) -> new BoundedOutOfOrdernessWatermarks<>(maxOutOfOrderness);
    }
    
    // 单调递增的 Watermark 策略
    static <T> WatermarkStrategy<T> forMonotonousTimestamps() {
        return (ctx) -> new AscendingWatermarks<>();
    }
}
```

### WatermarkGenerator 接口实现

```java
// 位于 org.apache.flink.api.common.eventtime.WatermarkGenerator

/**
 * WatermarkGenerator 是实际生成 Watermark 的接口
 */
@Public
public interface WatermarkGenerator<T> {
    
    // 每个事件到达时调用
    void onEvent(T event, long eventTimestamp, WatermarkOutput output);
    
    // 周期性调用（由 WatermarkOutput 发射器控制）
    void onPeriodicEmit(WatermarkOutput output);
}

// BoundedOutOfOrdernessWatermarks 实现
public class BoundedOutOfOrdernessWatermarks<T> implements WatermarkGenerator<T> {
    
    // 最大乱序时间
    private final long maxOutOfOrderness;
    
    // 当前最大时间戳
    private long maxTimestamp;
    
    // 上一次发射的 Watermark
    private long lastEmittedWatermark = Long.MIN_VALUE;
    
    public BoundedOutOfOrdernessWatermarks(Duration maxOutOfOrderness) {
        this.maxOutOfOrderness = maxOutOfOrderness.toMillis();
        this.maxTimestamp = Long.MIN_VALUE + this.maxOutOfOrderness + 1;
    }
    
    @Override
    public void onEvent(T event, long eventTimestamp, WatermarkOutput output) {
        // 更新最大时间戳
        maxTimestamp = Math.max(maxTimestamp, eventTimestamp);
    }
    
    @Override
    public void onPeriodicEmit(WatermarkOutput output) {
        // 计算新的 Watermark
        long watermark = maxTimestamp - maxOutOfOrderness - 1;
        
        // Watermark 只能单调递增
        if (watermark > lastEmittedWatermark) {
            lastEmittedWatermark = watermark;
            output.emitWatermark(new Watermark(watermark));
        }
    }
}

// AscendingWatermarks 实现（单调递增时间戳）
public class AscendingWatermarks<T> implements WatermarkGenerator<T> {
    
    private long maxTimestamp;
    private long lastEmittedWatermark = Long.MIN_VALUE;
    
    @Override
    public void onEvent(T event, long eventTimestamp, WatermarkOutput output) {
        // 检测时间戳是否递减（异常情况）
        if (eventTimestamp < maxTimestamp) {
            // 可以选择输出警告或侧输出
            return;
        }
        maxTimestamp = eventTimestamp;
        
        // 立即发射 Watermark（滞后 1ms）
        long watermark = maxTimestamp - 1;
        if (watermark > lastEmittedWatermark) {
            lastEmittedWatermark = watermark;
            output.emitWatermark(new Watermark(watermark));
        }
    }
    
    @Override
    public void onPeriodicEmit(WatermarkOutput output) {
        // 单调递增模式不需要周期性发射
        // 因为 onEvent 中已经处理
    }
}
```

### Watermark 传播机制

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Watermark 传播流程                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Source                    Map                   Window                 │
│  ┌─────────┐           ┌─────────┐            ┌─────────┐              │
│  │         │           │         │            │         │              │
│  │ W(10)   │──────────►│ W(10)   │──────────►│ W(10)   │              │
│  │         │           │         │            │ 触发窗口 │              │
│  │ W(15)   │──────────►│ W(15)   │──────────►│ W(15)   │              │
│  │         │           │         │            │         │              │
│  └─────────┘           └─────────┘            └─────────┘              │
│                                                                         │
│  传播规则：                                                             │
│  1. Source 生成 Watermark                                              │
│  2. Watermark 作为特殊事件随数据流传播                                   │
│  3. 算子收到 Watermark 后更新内部时间服务                                │
│  4. 触发定时器和窗口计算                                                │
│  5. 向下游转发 Watermark                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Watermark 处理源码

```java
// 位于 org.apache.flink.streaming.api.operators.AbstractStreamOperator

public abstract class AbstractStreamOperator<OUT>
        implements StreamOperator<OUT>, Triggerable<Object, VoidNamespace> {
    
    // 时间服务
    protected InternalTimeServiceManager<?> timeServiceManager;
    
    // 处理 Watermark
    public void processWatermark(Watermark watermark) throws Exception {
        
        // 1. 更新内部时间服务的 Watermark
        if (timeServiceManager != null) {
            timeServiceManager.advanceWatermark(watermark);
        }
        
        // 2. 触发 Event Time 定时器
        //    在 advanceWatermark 中已经触发
        
        // 3. 向下游转发 Watermark
        if (output != null) {
            output.emitWatermark(watermark);
        }
    }
}

// TimestampsAndWatermarksOperator
// 专门负责生成 Watermark 的算子
public class TimestampsAndWatermarksOperator<T> 
        extends AbstractStreamOperator<T>
        implements OneInputStreamOperator<T, T> {
    
    private final WatermarkGenerator<T> watermarkGenerator;
    private final TimestampAssigner<T> timestampAssigner;
    
    // Watermark 输出
    private final WatermarkEmitter watermarkEmitter;
    
    @Override
    public void processElement(StreamRecord<T> element) throws Exception {
        // 1. 提取时间戳
        final long eventTimestamp = timestampAssigner.extractTimestamp(
            element.getValue(), 
            element.getTimestamp());
        
        // 更新记录的时间戳
        element.setTimestamp(eventTimestamp);
        
        // 2. 通知 Watermark 生成器
        watermarkGenerator.onEvent(
            element.getValue(), 
            eventTimestamp, 
            watermarkEmitter);
        
        // 3. 向下游转发数据
        output.collect(element);
    }
    
    @Override
    public void onProcessingTime(long timestamp) throws Exception {
        // 周期性生成 Watermark
        watermarkGenerator.onPeriodicEmit(watermarkEmitter);
        
        // 注册下一次周期性调用
        long now = getProcessingTimeService().getCurrentProcessingTime();
        long nextTime = now + watermarkInterval;
        getProcessingTimeService().registerTimer(nextTime, this);
    }
    
    // Watermark 发射器
    private class WatermarkEmitter implements WatermarkOutput {
        
        private long currentWatermark = Long.MIN_VALUE;
        
        @Override
        public void emitWatermark(Watermark watermark) {
            long timestamp = watermark.getTimestamp();
            
            // Watermark 必须单调递增
            if (timestamp > currentWatermark) {
                currentWatermark = timestamp;
                output.emitWatermark(watermark);
            }
        }
    }
}
```

### 多输入 Watermark 对齐

```java
// 位于 org.apache.flink.streaming.api.operators.AbstractStreamOperator

public abstract class AbstractStreamOperator<OUT> {
    
    // 多输入场景下的 Watermark 对齐
    // 使用 WatermarkGauge 计算
    protected class WatermarkGauge {
        
        // 每个输入通道的 Watermark
        private final Map<Integer, Long> inputWatermarks;
        
        // 对齐后的 Watermark（取最小值）
        public long getWatermark() {
            if (inputWatermarks.isEmpty()) {
                return Long.MIN_VALUE;
            }
            
            long minWatermark = Long.MAX_VALUE;
            for (Long watermark : inputWatermarks.values()) {
                minWatermark = Math.min(minWatermark, watermark);
            }
            return minWatermark;
        }
        
        // 更新特定输入通道的 Watermark
        public void updateInputWatermark(int inputIndex, long watermark) {
            inputWatermarks.put(inputIndex, watermark);
            
            // 检查是否可以推进对齐后的 Watermark
            long alignedWatermark = getWatermark();
            if (alignedWatermark > currentWatermark) {
                currentWatermark = alignedWatermark;
                // 触发时间推进
                processWatermark(new Watermark(alignedWatermark));
            }
        }
    }
}
```

## 窗口分配器实现原理

### WindowAssigner 接口

```java
// 位于 org.apache.flink.streaming.api.windowing.assigners.WindowAssigner

/**
 * WindowAssigner 负责将元素分配到一个或多个窗口
 */
@Public
public abstract class WindowAssigner<T, W extends Window> implements Serializable {
    
    // 将元素分配到窗口
    public abstract Collection<W> assignWindows(
        T element, 
        long timestamp, 
        WindowAssignerContext context);
    
    // 获取窗口触发器
    public abstract Trigger<T, W> getDefaultTrigger(StreamExecutionEnvironment env);
    
    // 获取窗口序列化器
    public abstract TypeSerializer<W> getWindowSerializer(ExecutionConfig executionConfig);
    
    // 是否是事件时间窗口
    public abstract boolean isEventTime();
}
```

### TumblingEventTimeWindows 实现

```java
// 滚动窗口实现
public class TumblingEventTimeWindows extends WindowAssigner<Object, TimeWindow> {
    
    // 窗口大小
    private final long size;
    
    // 窗口偏移量
    private final long offset;
    
    public TumblingEventTimeWindows(long size, long offset) {
        this.size = size;
        this.offset = offset;
    }
    
    @Override
    public Collection<TimeWindow> assignWindows(
            Object element, 
            long timestamp, 
            WindowAssignerContext context) {
        
        // 处理无时间戳的情况
        if (timestamp > Long.MIN_VALUE) {
            // 计算窗口起始时间
            // 将时间戳对齐到窗口边界
            long start = TimeWindow.getWindowStartWithOffset(timestamp, offset, size);
            
            // 创建窗口
            return Collections.singletonList(new TimeWindow(start, start + size));
        } else {
            // 无时间戳，分配到最大窗口
            return Collections.singletonList(
                new TimeWindow(Long.MIN_VALUE, Long.MAX_VALUE));
        }
    }
    
    @Override
    public Trigger<Object, TimeWindow> getDefaultTrigger(StreamExecutionEnvironment env) {
        return EventTimeTrigger.create();
    }
    
    @Override
    public boolean isEventTime() {
        return true;
    }
    
    // 计算窗口起始时间的工具方法
    public static long getWindowStartWithOffset(long timestamp, long offset, long windowSize) {
        // 公式: start = timestamp - (timestamp - offset + windowSize) % windowSize
        // 确保 timestamp 落在 [start, start + windowSize) 范围内
        return timestamp - (timestamp - offset + windowSize) % windowSize;
    }
}
```

### SlidingEventTimeWindows 实现

```java
// 滑动窗口实现
public class SlidingEventTimeWindows extends WindowAssigner<Object, TimeWindow> {
    
    // 窗口大小
    private final long size;
    
    // 滑动步长
    private final long slide;
    
    // 窗口偏移量
    private final long offset;
    
    @Override
    public Collection<TimeWindow> assignWindows(
            Object element, 
            long timestamp, 
            WindowAssignerContext context) {
        
        if (timestamp > Long.MIN_VALUE) {
            List<TimeWindow> windows = new ArrayList<>();
            
            // 计算最后一个包含该时间戳的窗口
            long lastStart = TimeWindow.getWindowStartWithOffset(timestamp, offset, slide);
            
            // 从最后一个窗口开始，向前遍历所有包含该时间戳的窗口
            // 窗口数量 = size / slide
            for (long start = lastStart; 
                 start > timestamp - size; 
                 start -= slide) {
                windows.add(new TimeWindow(start, start + size));
            }
            
            return windows;
        } else {
            return Collections.singletonList(
                new TimeWindow(Long.MIN_VALUE, Long.MAX_VALUE));
        }
    }
    
    @Override
    public Trigger<Object, TimeWindow> getDefaultTrigger(StreamExecutionEnvironment env) {
        return EventTimeTrigger.create();
    }
}
```

### EventTimeSessionWindows 实现

```java
// 会话窗口实现
public class EventTimeSessionWindows extends MergingWindowAssigner<Object, TimeWindow> {
    
    // 会话超时时间
    private final long sessionTimeout;
    
    @Override
    public Collection<TimeWindow> assignWindows(
            Object element, 
            long timestamp, 
            WindowAssignerContext context) {
        
        // 会话窗口初始只包含当前元素
        // 后续通过 merge 合并相邻的窗口
        return Collections.singletonList(new TimeWindow(timestamp, timestamp + sessionTimeout));
    }
    
    @Override
    public void mergeWindows(
            Collection<TimeWindow> windows, 
            MergeCallback<TimeWindow> callback) {
        
        // 按起始时间排序
        List<TimeWindow> sortedWindows = new ArrayList<>(windows);
        Collections.sort(sortedWindows);
        
        List<TimeWindow> mergedWindows = new ArrayList<>();
        TimeWindow currentMerge = null;
        
        for (TimeWindow window : sortedWindows) {
            if (currentMerge == null) {
                currentMerge = window;
            } else {
                // 检查窗口是否重叠或相邻
                if (currentMerge.maxTimestamp() >= window.getStart() - sessionTimeout) {
                    // 合并窗口
                    currentMerge = new TimeWindow(
                        currentMerge.getStart(), 
                        Math.max(currentMerge.maxTimestamp(), window.maxTimestamp()));
                } else {
                    // 不重叠，保存当前合并结果，开始新的合并
                    mergedWindows.add(currentMerge);
                    currentMerge = window;
                }
            }
        }
        
        if (currentMerge != null) {
            mergedWindows.add(currentMerge);
        }
        
        callback.merge(sortedWindows, mergedWindows);
    }
}
```

### 窗口分配示意图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        窗口分配示意图                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  滚动窗口（大小=5，offset=0）：                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  时间戳: 2        时间戳: 7        时间戳: 12                   │   │
│  │      │                │                │                        │   │
│  │      ▼                ▼                ▼                        │   │
│  │  ┌─────┐          ┌─────┐          ┌─────┐                    │   │
│  │  │0-5  │          │5-10 │          │10-15│                    │   │
│  │  └─────┘          └─────┘          └─────┘                    │   │
│  │  时间戳 2 → [0,5)  时间戳 7 → [5,10)  时间戳 12 → [10,15)     │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  滑动窗口（大小=10，slide=5）：                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  时间戳: 7                                                      │   │
│  │      │                                                          │   │
│  │      ▼                                                          │   │
│  │  ┌──────────┐                                                  │   │
│  │  │  0-10    │  ← 包含时间戳 7                                   │   │
│  │  │┌─────────┤                                                  │   │
│  │  ││  5-15   │← 包含时间戳 7                                    │   │
│  │  │└─────────┤                                                  │   │
│  │  └──────────┘                                                  │   │
│  │                                                                 │   │
│  │  时间戳 7 被分配到两个窗口: [0,10) 和 [5,15)                    │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  会话窗口（timeout=5）：                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  时间戳: 2, 4, 10, 15                                           │   │
│  │                                                                 │   │
│  │  ┌───────┐          ┌─────┐    ┌─────┐                        │   │
│  │  │ 2-9   │          │10-15│    │15-20│                        │   │
│  │  │(2,4)  │          │(10) │    │(15) │                        │   │
│  │  └───────┘          └─────┘    └─────┘                        │   │
│  │     │                                                        │   │
│  │     └─ 时间戳 2,4 合并为 [2,9)                                │   │
│  │                                                              │   │
│  │  时间戳 10 距离 4 超过 timeout=5，开启新会话                   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 窗口触发器机制

### Trigger 接口

```java
// 位于 org.apache.flink.streaming.api.windowing.triggers.Trigger

/**
 * Trigger 决定窗口何时触发计算
 */
@Public
public abstract class Trigger<T, W extends Window> implements Serializable {
    
    // 元素进入窗口时调用
    public abstract TriggerResult onElement(
        T element, 
        long timestamp, 
        W window, 
        TriggerContext ctx) throws Exception;
    
    // Processing Time 定时器触发时调用
    public abstract TriggerResult onProcessingTime(
        long time, 
        W window, 
        TriggerContext ctx) throws Exception;
    
    // Event Time 定时器触发时调用（Watermark 到达时）
    public abstract TriggerResult onEventTime(
        long time, 
        W window, 
        TriggerContext ctx) throws Exception;
    
    // 窗口合并时调用（会话窗口）
    public void onMerge(W window, OnMergeContext ctx) throws Exception {}
    
    // 清除窗口状态
    public abstract void clear(W window, TriggerContext ctx) throws Exception;
}

// TriggerResult 触发结果
public enum TriggerResult {
    CONTINUE,       // 继续等待，不做任何事
    FIRE,           // 触发计算，保留窗口数据
    PURGE,          // 清除窗口数据，不触发计算
    FIRE_AND_PURGE; // 触发计算并清除窗口数据
    
    public boolean isFire() {
        return this == FIRE || this == FIRE_AND_PURGE;
    }
    
    public boolean isPurge() {
        return this == PURGE || this == FIRE_AND_PURGE;
    }
}
```

### EventTimeTrigger 实现

```java
// Event Time 触发器
public class EventTimeTrigger extends Trigger<Object, TimeWindow> {
    
    private static final long serialVersionUID = 1L;
    
    private EventTimeTrigger() {}
    
    @Override
    public TriggerResult onElement(
            Object element, 
            long timestamp, 
            TimeWindow window, 
            TriggerContext ctx) throws Exception {
        
        // 如果 Watermark 已经超过窗口结束时间，直接触发
        if (window.maxTimestamp() <= ctx.getCurrentWatermark()) {
            return TriggerResult.FIRE;
        } else {
            // 注册窗口结束时间的定时器
            ctx.registerEventTimeTimer(window.maxTimestamp());
            return TriggerResult.CONTINUE;
        }
    }
    
    @Override
    public TriggerResult onEventTime(
            long time, 
            TimeWindow window, 
            TriggerContext ctx) {
        
        // 当 Watermark 到达窗口结束时间时触发
        if (time == window.maxTimestamp()) {
            return TriggerResult.FIRE;
        } else {
            return TriggerResult.CONTINUE;
        }
    }
    
    @Override
    public TriggerResult onProcessingTime(
            long time, 
            TimeWindow window, 
            TriggerContext ctx) {
        // EventTimeTrigger 不处理 Processing Time
        return TriggerResult.CONTINUE;
    }
    
    @Override
    public void clear(TimeWindow window, TriggerContext ctx) {
        // 删除定时器
        ctx.deleteEventTimeTimer(window.maxTimestamp());
    }
    
    public static EventTimeTrigger create() {
        return new EventTimeTrigger();
    }
}
```

### ProcessingTimeTrigger 实现

```java
// Processing Time 触发器
public class ProcessingTimeTrigger extends Trigger<Object, TimeWindow> {
    
    @Override
    public TriggerResult onElement(
            Object element, 
            long timestamp, 
            TimeWindow window, 
            TriggerContext ctx) {
        
        // 注册窗口结束时间的 Processing Time 定时器
        ctx.registerProcessingTimeTimer(window.maxTimestamp());
        return TriggerResult.CONTINUE;
    }
    
    @Override
    public TriggerResult onProcessingTime(
            long time, 
            TimeWindow window, 
            TriggerContext ctx) {
        // 当 Processing Time 到达窗口结束时间时触发
        return TriggerResult.FIRE;
    }
    
    @Override
    public TriggerResult onEventTime(
            long time, 
            TimeWindow window, 
            TriggerContext ctx) {
        // ProcessingTimeTrigger 不处理 Event Time
        return TriggerResult.CONTINUE;
    }
    
    @Override
    public void clear(TimeWindow window, TriggerContext ctx) {
        ctx.deleteProcessingTimeTimer(window.maxTimestamp());
    }
}
```

### CountTrigger 实现

```java
// 计数触发器：元素数量达到阈值时触发
public class CountTrigger<W extends Window> extends Trigger<Object, W> {
    
    private final long maxCount;
    
    // 使用 ReducingState 计数
    private final ReducingStateDescriptor<Long> stateDesc = 
        new ReducingStateDescriptor<>(
            "count", 
            (a, b) -> a + b, 
            LongSerializer.INSTANCE);
    
    private CountTrigger(long maxCount) {
        this.maxCount = maxCount;
    }
    
    @Override
    public TriggerResult onElement(
            Object element, 
            long timestamp, 
            W window, 
            TriggerContext ctx) throws Exception {
        
        // 获取计数状态
        ReducingState<Long> count = ctx.getPartitionedState(stateDesc);
        
        // 增加计数
        count.add(1L);
        
        // 达到阈值时触发
        if (count.get() >= maxCount) {
            count.clear();
            return TriggerResult.FIRE;
        }
        
        return TriggerResult.CONTINUE;
    }
    
    @Override
    public TriggerResult onEventTime(long time, W window, TriggerContext ctx) {
        return TriggerResult.CONTINUE;
    }
    
    @Override
    public TriggerResult onProcessingTime(long time, W window, TriggerContext ctx) {
        return TriggerResult.CONTINUE;
    }
    
    @Override
    public void clear(W window, TriggerContext ctx) throws Exception {
        ctx.getPartitionedState(stateDesc).clear();
    }
}
```

### TriggerContext 接口

```java
// TriggerContext 提供触发器的上下文操作
public interface TriggerContext {
    
    // 获取当前 Watermark
    long getCurrentWatermark();
    
    // 获取度量组
    MetricGroup getMetricGroup();
    
    // 注册 Event Time 定时器
    void registerEventTimeTimer(long time);
    
    // 删除 Event Time 定时器
    void deleteEventTimeTimer(long time);
    
    // 注册 Processing Time 定时器
    void registerProcessingTimeTimer(long time);
    
    // 删除 Processing Time 定时器
    void deleteProcessingTimeTimer(long time);
    
    // 获取分区状态
    <S extends State> S getPartitionedState(StateDescriptor<S, ?> stateDescriptor);
}
```

## 窗口算子实现

### WindowOperator 核心逻辑

```java
// 位于 org.apache.flink.streaming.api.operators.window.WindowOperator

public class WindowOperator<K, IN, ACC, OUT, W extends Window>
        extends AbstractUdfStreamOperator<OUT, InternalWindowFunction<ACC, OUT, K, W>>
        implements OneInputStreamOperator<IN, OUT>, Triggerable<K, W> {
    
    // 窗口分配器
    private final WindowAssigner<? super IN, W> windowAssigner;
    
    // 触发器
    private final Trigger<? super IN, W> trigger;
    
    // 窗口函数
    private final InternalWindowFunction<ACC, OUT, K, W> windowFunction;
    
    // 窗口状态
    private transient InternalWindowState windowState;
    
    // 定时器服务
    private transient InternalTimerService<W> internalTimerService;
    
    @Override
    public void processElement(StreamRecord<IN> element) throws Exception {
        
        IN value = element.getValue();
        
        // 1. 获取当前 Key
        K key = (K) getCurrentKey();
        
        // 2. 将元素分配到窗口
        Collection<W> elementWindows = windowAssigner.assignWindows(
            value, 
            element.getTimestamp(), 
            windowAssignerContext);
        
        // 3. 获取实际的窗口集合（处理会话窗口合并）
        Collection<W> actualWindows = elementWindows;
        if (windowAssigner instanceof MergingWindowAssigner) {
            actualWindows = mergingWindowSet.getActualWindows(elementWindows);
        }
        
        // 4. 处理每个窗口
        for (W window : actualWindows) {
            // 检查窗口是否已过期（迟到数据）
            if (isWindowLate(window)) {
                // 侧输出或丢弃
                continue;
            }
            
            // 获取窗口状态
            windowState = getOrCreateWindowState(window);
            
            // 更新窗口状态（添加元素）
            windowState.add(element);
            
            // 调用触发器
            TriggerResult triggerResult = trigger.onElement(
                value, 
                element.getTimestamp(), 
                window, 
                triggerContext);
            
            // 处理触发结果
            if (triggerResult.isFire()) {
                // 触发窗口计算
                fireWindow(window);
            }
            
            if (triggerResult.isPurge()) {
                // 清除窗口状态
                windowState.clear();
            }
        }
    }
    
    // Event Time 定时器回调
    @Override
    public void onEventTime(InternalTimer<K, W> timer) throws Exception {
        
        K key = timer.getKey();
        W window = timer.getNamespace();
        
        // 设置当前 Key
        setCurrentKey(key);
        
        // 调用触发器
        TriggerResult triggerResult = trigger.onEventTime(
            timer.getTimestamp(), 
            window, 
            triggerContext);
        
        if (triggerResult.isFire()) {
            fireWindow(window);
        }
        
        if (triggerResult.isPurge()) {
            windowState.clear();
        }
    }
    
    // 触发窗口计算
    private void fireWindow(W window) throws Exception {
        
        // 获取窗口内容
        ACC contents = windowState.get();
        
        // 调用窗口函数
        OUT result = windowFunction.apply(
            getCurrentKey(), 
            window, 
            contents, 
            windowFunctionContext);
        
        // 输出结果
        output.collect(new StreamRecord<>(result));
    }
}
```

### 窗口状态管理

```java
// 窗口状态接口
public interface InternalWindowState {
    
    // 添加元素
    void add(StreamRecord<?> element) throws Exception;
    
    // 获取所有元素
    Iterable<StreamRecord<?>> get() throws Exception;
    
    // 清除状态
    void clear();
}

// ListWindowState 实现（存储窗口内所有元素）
public class ListWindowState implements InternalWindowState {
    
    private final ListState<StreamRecord<?>> listState;
    
    public ListWindowState(ListState<StreamRecord<?>> listState) {
        this.listState = listState;
    }
    
    @Override
    public void add(StreamRecord<?> element) throws Exception {
        listState.add(element);
    }
    
    @Override
    public Iterable<StreamRecord<?>> get() throws Exception {
        return listState.get();
    }
    
    @Override
    public void clear() {
        listState.clear();
    }
}

// AggregatingWindowState 实现（增量聚合）
public class AggregatingWindowState<IN, ACC> implements InternalWindowState {
    
    private final AggregatingState<IN, ACC> aggregatingState;
    
    @Override
    public void add(StreamRecord<?> element) throws Exception {
        aggregatingState.add((IN) element.getValue());
    }
    
    @Override
    public ACC get() throws Exception {
        return aggregatingState.get();
    }
}
```

## 迟到数据处理

### 侧输出实现

```java
// 迟到数据的侧输出处理
public class WindowOperator<K, IN, ACC, OUT, W extends Window> {
    
    // 侧输出标签
    private final OutputTag<IN> lateDataOutputTag;
    
    // 允许的延迟时间
    private final long allowedLateness;
    
    // 检查窗口是否迟到
    private boolean isWindowLate(W window) {
        return window.maxTimestamp() + allowedLateness 
            <= internalTimerService.currentWatermark();
    }
    
    @Override
    public void processElement(StreamRecord<IN> element) throws Exception {
        
        // ... 分配窗口 ...
        
        for (W window : actualWindows) {
            if (isWindowLate(window)) {
                // 迟到数据处理
                if (lateDataOutputTag != null) {
                    // 侧输出
                    output.collect(lateDataOutputTag, element);
                }
                continue;
            }
            
            // 正常处理...
        }
    }
}
```

### AllowedLateness 机制

```java
// 允许延迟的处理逻辑
public class WindowOperator<K, IN, ACC, OUT, W extends Window> {
    
    @Override
    public void onEventTime(InternalTimer<K, W> timer) throws Exception {
        
        W window = timer.getNamespace();
        
        // 检查是否在延迟时间内
        if (window.maxTimestamp() <= internalTimerService.currentWatermark()) {
            // 清除窗口的清理定时器
            // 允许延迟时间内继续处理迟到数据
            long cleanupTime = window.maxTimestamp() + allowedLateness;
            if (cleanupTime > internalTimerService.currentWatermark()) {
                // 注册清理定时器
                internalTimerService.registerEventTimeTimer(cleanupTime);
            }
        }
        
        // 触发窗口
        // ...
    }
}
```

## 总结

本章从源码层面深入解析了 Flink 时间与窗口机制：

| 概念 | 源码位置 | 核心机制 |
|------|----------|----------|
| TimerService | `operators.TimerService` | 定时器注册与管理 |
| WatermarkGenerator | `eventtime.WatermarkGenerator` | Watermark 生成策略 |
| WindowAssigner | `windowing.assigners.WindowAssigner` | 窗口分配策略 |
| Trigger | `windowing.triggers.Trigger` | 窗口触发控制 |
| WindowOperator | `operators.window.WindowOperator` | 窗口算子实现 |

**关键要点**：
1. Watermark 通过 WatermarkGenerator 生成，随数据流传播
2. 多输入算子取最小 Watermark 作为对齐值
3. WindowAssigner 决定元素属于哪些窗口
4. Trigger 通过定时器控制窗口触发时机
5. 窗口状态支持增量聚合和全量计算两种模式

## 参考资料

- [Event Time and Watermarks](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/)
- [Windows](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/operators/windows/)
- [Flink Window 源码](https://github.com/apache/flink/tree/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/api/windowing)

## 下一章预告

下一章将深入解析 **状态管理**，包括：
- Keyed State 底层实现
- State Backend 架构
- RocksDB 写入流程