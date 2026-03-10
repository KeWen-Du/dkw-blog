---
title: "Flink 底层原理系列（六）：容错机制"
date: "2021-02-23"
excerpt: "深入解析 Flink 容错机制，包括 Checkpoint Barrier 源码、Barrier 对齐算法、CheckpointCoordinator 工作流程以及两阶段提交状态机实现。"
tags: ["Flink", "流处理", "容错", "Checkpoint"]
series:
  slug: "flink-core-principles"
  title: "Flink 底层原理系列"
  order: 6
---

## 前言

容错机制是 Flink 实现高可用的核心。通过 Checkpoint 机制，Flink 能够在故障发生时恢复状态并继续处理，同时保证精确一次语义。本章将从源码层面深入解析 Checkpoint 的实现原理。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Checkpoint Barrier | ⭐⭐⭐⭐⭐ | 高频考点 | ✅ |
| Barrier 对齐算法 | ⭐⭐⭐⭐⭐ | 高频考点 | ✅ |
| CheckpointCoordinator | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 两阶段提交状态机 | ⭐⭐⭐⭐⭐ | 进阶考点 | ✅ |

## 面试考点

1. Flink 的 Checkpoint 是如何实现的？
2. Barrier 对齐算法是如何工作的？
3. CheckpointCoordinator 的工作流程是什么？
4. 如何实现端到端 Exactly-Once？

## Checkpoint 整体架构

### 核心组件关系

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Checkpoint 核心架构                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  JobManager                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  CheckpointCoordinator                                          │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • 触发 Checkpoint                                         │ │   │
│  │  │  • 协调 Barrier 注入                                       │ │   │
│  │  │  • 收集 Ack 响应                                           │ │   │
│  │  │  • 管理 Checkpoint 元数据                                  │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                              │                                  │   │
│  │                              │ RPC                              │   │
│  │                              ▼                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  TaskManager 1                    TaskManager 2                        │
│  ┌─────────────────┐             ┌─────────────────┐                  │
│  │                 │             │                 │                  │
│  │  Task           │             │  Task           │                  │
│  │  ┌───────────┐  │             │  ┌───────────┐  │                  │
│  │  │ InputGate │  │             │  │ InputGate │  │                  │
│  │  │ BarrierHandler              │  │ BarrierHandler                │  │
│  │  └───────────┘  │             │  └───────────┘  │                  │
│  │                 │             │                 │                  │
│  │  State Backend  │             │  State Backend  │                  │
│  │                 │             │                 │                  │
│  └─────────────────┘             └─────────────────┘                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Checkpoint 执行流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Checkpoint 执行流程                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. CheckpointCoordinator 触发 Checkpoint                               │
│     │                                                                   │
│     ▼                                                                   │
│  2. 向所有 Source Task 发送 CheckpointBarrier                          │
│     │                                                                   │
│     ▼                                                                   │
│  3. Barrier 随数据流流动                                                │
│     │                                                                   │
│     ▼                                                                   │
│  4. Task 收到 Barrier，进行对齐                                         │
│     │                                                                   │
│     ▼                                                                   │
│  5. 对齐后，触发状态快照                                                │
│     │                                                                   │
│     ▼                                                                   │
│  6. 向 CheckpointCoordinator 发送 Ack                                  │
│     │                                                                   │
│     ▼                                                                   │
│  7. 所有 Task Ack 后，Checkpoint 完成                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## CheckpointBarrier 源码

### Barrier 数据结构

```java
// 位于 org.apache.flink.runtime.checkpoint.CheckpointBarrier

/**
 * CheckpointBarrier 是 Checkpoint 的核心数据结构
 * 作为特殊事件随数据流流动
 */
public class CheckpointBarrier implements IOReadableWritable {
    
    // Checkpoint ID（唯一标识）
    private long id;
    
    // Checkpoint 时间戳
    private long timestamp;
    
    // Checkpoint 选项（存储位置、模式等）
    private CheckpointOptions checkpointOptions;
    
    public CheckpointBarrier(
            long id, 
            long timestamp, 
            CheckpointOptions checkpointOptions) {
        this.id = id;
        this.timestamp = timestamp;
        this.checkpointOptions = checkpointOptions;
    }
    
    // Checkpoint 类型
    public CheckpointType getCheckpointType() {
        return checkpointOptions.getCheckpointType();
    }
    
    // 是否是精确一次模式
    public boolean isExactlyOnce() {
        return checkpointOptions.getCheckpointType().isExactlyOnce();
    }
    
    // 是否需要对齐
    public boolean needsAlignment() {
        return checkpointOptions.getCheckpointType().needsAlignment();
    }
    
    // 是否是 Unaligned Checkpoint
    public boolean isUnalignedCheckpoint() {
        return checkpointOptions.isUnalignedCheckpoint();
    }
}

// CheckpointOptions 配置
public class CheckpointOptions implements Serializable {
    
    private final CheckpointType checkpointType;
    private final CheckpointStorageLocationReference targetLocation;
    private final boolean isExactlyOnce;
    private final long alignmentTimeout;
    
    // Checkpoint 类型枚举
    public enum CheckpointType {
        CHECKPOINT(true, true),           // 普通 Checkpoint
        SAVEPOINT(false, false),          // Savepoint
        SAVEPOINT_SUSPEND(false, false),  // 暂停 Savepoint
        SAVEPOINT_TERMINATE(false, false); // 终止 Savepoint
        
        private final boolean needsAlignment;
        private final boolean isExactlyOnce;
    }
}
```

### Barrier 注入机制

```java
// 位于 org.apache.flink.runtime.source.coordinator.SourceCoordinator

/**
 * Source 接收 Checkpoint 触发请求，注入 Barrier
 */
public class SourceCoordinator<SplitT extends SourceSplit, EnumChkT> {
    
    private final OperatorCoordinator.Context context;
    private final SplitEnumerator<SplitT, EnumChkT> enumerator;
    
    // 接收 Checkpoint 触发
    public void checkpointCoordinator(long checkpointId, long checkpointTimestamp) 
            throws Exception {
        
        // 1. 枚举器创建 Checkpoint
        EnumChkT checkpoint = enumerator.snapshotState(checkpointId);
        
        // 2. 存储枚举器状态
        context.getCheckpointStore().storeCheckpoint(checkpointId, checkpoint);
        
        // 3. 向所有 SourceReader 发送 Barrier
        for (int subtask : context.getParallelSubtasks()) {
            CheckpointBarrier barrier = new CheckpointBarrier(
                checkpointId,
                checkpointTimestamp,
                checkpointOptions);
            
            // 发送到 SourceReader
            context.sendEventToOperator(subtask, barrier);
        }
    }
}
```

## Barrier 对齐算法

### 对齐核心问题

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Barrier 对齐问题                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  多输入场景：                                                           │
│                                                                         │
│  Input 1: ──Data──Data──Barrier──Data──►                              │
│                          │                                              │
│                          ▼                                              │
│                    Task (等待对齐)                                      │
│                          │                                              │
│                          ▲                                              │
│  Input 2: ──Data──Data──Data──Barrier──►                              │
│                                                                         │
│  问题：                                                                 │
│  • Barrier 到达时间不同                                                │
│  • 对齐期间如何处理数据？                                               │
│  • 如何保证 Exactly-Once？                                             │
│                                                                         │
│  解决方案：                                                             │
│  • Exactly-Once: 等待所有 Barrier，缓存先到 Barrier 的通道的数据        │
│  • At-Least-Once: 不等待，直接处理                                     │
│  • Unaligned: 不等待，将数据也写入快照                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### BarrierHandler 接口

```java
// 位于 org.apache.flink.streaming.runtime.io.BarrierHandler

/**
 * BarrierHandler 处理 Barrier 对齐
 */
public interface BarrierHandler {
    
    // 处理 Barrier
    BarrierHandlerAction barrierReceived(
        CheckpointBarrier barrier,
        int channelIndex,
        long bufferBytes) throws IOException;
    
    // 检查是否所有通道的 Barrier 都已到达
    boolean isCheckpointPending();
    
    // 获取当前 Checkpoint ID
    long getPendingCheckpointId();
    
    // 检查通道是否阻塞
    boolean isChannelBlocked(int channelIndex);
    
    // 获取阻塞的数据
    BufferSpiller getChannelBlockedData(int channelIndex);
}

// Barrier 处理动作
public enum BarrierHandlerAction {
    CONTINUE,     // 继续处理
    TRIGGER,      // 触发 Checkpoint
    ANNOUNCE      // 声明（用于 Unaligned）
}
```

### BarrierTracker 实现（At-Least-Once）

```java
// 位于 org.apache.flink.streaming.runtime.io.BarrierTracker

/**
 * BarrierTracker 用于 At-Least-Once 模式
 * 不等待对齐，直接处理
 */
public class BarrierTracker implements BarrierHandler {
    
    // 当前活跃的 Checkpoint
    private final ArrayDeque<Long> pendingCheckpoints;
    
    // 每个通道是否已收到 Barrier
    private final long[] barriersPerChannel;
    
    private final int numChannels;
    
    public BarrierTracker(int numChannels) {
        this.numChannels = numChannels;
        this.pendingCheckpoints = new ArrayDeque<>();
        this.barriersPerChannel = new long[numChannels];
    }
    
    @Override
    public BarrierHandlerAction barrierReceived(
            CheckpointBarrier barrier,
            int channelIndex,
            long bufferBytes) {
        
        long checkpointId = barrier.getId();
        
        // 检查是否已有此 Checkpoint
        if (pendingCheckpoints.isEmpty() 
            || pendingCheckpoints.getLast() != checkpointId) {
            // 新 Checkpoint，添加到队列
            pendingCheckpoints.addLast(checkpointId);
        }
        
        // 标记此通道已收到 Barrier
        barriersPerChannel[channelIndex] = checkpointId;
        
        // 检查是否所有通道都收到了 Barrier
        boolean allChannelsReceived = true;
        for (int i = 0; i < numChannels; i++) {
            if (barriersPerChannel[i] < checkpointId) {
                allChannelsReceived = false;
                break;
            }
        }
        
        if (allChannelsReceived) {
            // 所有通道都收到了，触发 Checkpoint
            pendingCheckpoints.removeFirstOccurrence(checkpointId);
            return BarrierHandlerAction.TRIGGER;
        }
        
        return BarrierHandlerAction.CONTINUE;
    }
    
    @Override
    public boolean isChannelBlocked(int channelIndex) {
        // At-Least-Once 模式不阻塞通道
        return false;
    }
}
```

### BarrierBuffer 实现（Exactly-Once）

```java
// 位于 org.apache.flink.streaming.runtime.io.BarrierBuffer

/**
 * BarrierBuffer 用于 Exactly-Once 模式
 * 等待所有 Barrier 到达，阻塞先到 Barrier 的通道
 */
public class BarrierBuffer implements BarrierHandler {
    
    // 输入通道
    private final InputGate inputGate;
    
    // 被阻塞的通道数据缓冲
    private final BufferSpiller[] blockedChannels;
    
    // 通道阻塞状态
    private final boolean[] channelBlocked;
    
    // 当前 Checkpoint 信息
    private long currentCheckpointId = -1;
    private int numBarriersReceived = 0;
    
    // 已处理的 Buffer 计数
    private long numBuffersProcessed = 0;
    
    public BarrierBuffer(InputGate inputGate, BufferSpiller bufferSpiller) {
        this.inputGate = inputGate;
        int numChannels = inputGate.getNumberOfInputChannels();
        this.blockedChannels = new BufferSpiller[numChannels];
        this.channelBlocked = new boolean[numChannels];
        
        for (int i = 0; i < numChannels; i++) {
            blockedChannels[i] = bufferSpiller;
        }
    }
    
    @Override
    public BarrierHandlerAction barrierReceived(
            CheckpointBarrier barrier,
            int channelIndex,
            long bufferBytes) throws IOException {
        
        long checkpointId = barrier.getId();
        
        // 情况 1: 更老的 Checkpoint Barrier（应该不会发生）
        if (checkpointId < currentCheckpointId) {
            // 忽略
            return BarrierHandlerAction.CONTINUE;
        }
        
        // 情况 2: 新 Checkpoint 的第一个 Barrier
        if (checkpointId > currentCheckpointId) {
            // 开始新的 Checkpoint
            currentCheckpointId = checkpointId;
            numBarriersReceived = 0;
            
            // 取消所有通道的阻塞
            Arrays.fill(channelBlocked, false);
        }
        
        // 计数增加
        numBarriersReceived++;
        
        // 标记通道阻塞
        channelBlocked[channelIndex] = true;
        
        // 检查是否所有通道都收到了 Barrier
        if (numBarriersReceived == inputGate.getNumberOfInputChannels()) {
            // 所有 Barrier 到达，触发 Checkpoint
            return BarrierHandlerAction.TRIGGER;
        } else {
            // 阻塞此通道（不处理后续数据）
            return BarrierHandlerAction.CONTINUE;
        }
    }
    
    // 处理被阻塞通道的数据
    public BufferOrEvent getNextNonBlocked() throws Exception {
        
        while (true) {
            // 优先处理阻塞通道的缓存数据
            Optional<BufferOrEvent> next = getBlockedData();
            if (next.isPresent()) {
                return next.get();
            }
            
            // 从 InputGate 获取下一个数据
            BufferOrEvent bufferOrEvent = inputGate.getNextBufferOrEvent();
            
            if (bufferOrEvent == null) {
                return null;
            }
            
            if (bufferOrEvent.isBuffer()) {
                // 普通数据
                int channel = bufferOrEvent.getChannelIndex();
                
                if (channelBlocked[channel]) {
                    // 通道已阻塞，缓存数据
                    blockedChannels[channel].add(bufferOrEvent);
                    continue;
                } else {
                    // 通道未阻塞，直接返回
                    return bufferOrEvent;
                }
            } else {
                // Barrier 或其他事件
                return bufferOrEvent;
            }
        }
    }
    
    // Checkpoint 完成后释放阻塞的数据
    public void releaseBlocksAndResetBarriers() {
        // Checkpoint 完成，所有通道解除阻塞
        Arrays.fill(channelBlocked, false);
        numBarriersReceived = 0;
        
        // 释放阻塞的数据到处理队列
        for (int i = 0; i < blockedChannels.length; i++) {
            blockedChannels[i].rollOver();
        }
    }
}
```

### 对齐流程图解

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Barrier 对齐流程                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  初始状态：所有通道未阻塞                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Channel 0: ──D1──D2──Barrier──D3──D4──►                       │   │
│  │  Channel 1: ──D5──D6──D7──Barrier──D8──►                       │   │
│  │                                                                 │   │
│  │  状态: channelBlocked = [false, false]                         │   │
│  │        numBarriersReceived = 0                                  │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼ Channel 0 收到 Barrier                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Channel 0: ──D1──D2──[Barrier]──│D3──D4──► (阻塞)              │   │
│  │  Channel 1: ──D5──D6──D7───────Barrier──D8──► (未阻塞)          │   │
│  │                              │                                  │   │
│  │  状态: channelBlocked = [true, false]                          │   │
│  │        numBarriersReceived = 1                                  │   │
│  │        缓存: D3, D4                                             │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼ Channel 1 收到 Barrier                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Channel 0: ──D1──D2──[Barrier]──│D3──D4──│                    │   │
│  │  Channel 1: ──D5──D6──D7──[Barrier]──D8──│                     │   │
│  │                              │                                  │   │
│  │  状态: channelBlocked = [true, true]                           │   │
│  │        numBarriersReceived = 2 (全部到达!)                      │   │
│  │                                                                 │   │
│  │  动作: 触发 Checkpoint 快照                                     │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼ 快照完成后释放阻塞数据                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  释放缓存的数据继续处理:                                        │   │
│  │  D3, D4, D8 → 正常处理                                          │   │
│  │                                                                 │   │
│  │  状态: channelBlocked = [false, false]                         │   │
│  │        numBarriersReceived = 0                                  │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## CheckpointCoordinator 源码

### 核心数据结构

```java
// 位于 org.apache.flink.runtime.checkpoint.CheckpointCoordinator

/**
 * CheckpointCoordinator 是 Checkpoint 的协调者
 * 运行在 JobManager 上
 */
public class CheckpointCoordinator {
    
    // JobGraph
    private final JobGraph jobGraph;
    
    // Checkpoint 存储位置
    private final CheckpointStorageLocation checkpointStorageLocation;
    
    // Checkpoint ID 计数器
    private final AtomicLong checkpointIdCounter;
    
    // 活跃的 Checkpoint
    private final Map<Long, PendingCheckpoint> pendingCheckpoints;
    
    // 已完成的 Checkpoint
    private final CompletedCheckpointStore completedCheckpointStore;
    
    // 定时器（用于 Checkpoint 超时）
    private final ScheduledExecutor timerExecutor;
    
    // Checkpoint 配置
    private final CheckpointPlan checkpointPlan;
    private final long checkpointTimeout;
    private final long minPauseBetweenCheckpoints;
    private final int maxConcurrentCheckpoints;
}
```

### 触发 Checkpoint

```java
public class CheckpointCoordinator {
    
    // 触发 Checkpoint
    public CompletableFuture<CompletedCheckpoint> triggerCheckpoint(
            long timestamp,
            CheckpointProperties props) throws CheckpointException {
        
        // 1. 检查是否可以触发新 Checkpoint
        if (pendingCheckpoints.size() >= maxConcurrentCheckpoints) {
            throw new CheckpointException("Too many concurrent checkpoints");
        }
        
        // 2. 检查与上次 Checkpoint 的间隔
        long lastCheckpointCompletionTime = getLastCheckpointCompletionTime();
        if (timestamp - lastCheckpointCompletionTime < minPauseBetweenCheckpoints) {
            throw new CheckpointException("Minimum pause not reached");
        }
        
        // 3. 生成 Checkpoint ID
        long checkpointId = checkpointIdCounter.getAndIncrement();
        
        // 4. 创建 Checkpoint 存储位置
        CheckpointStorageLocation location = checkpointStorageLocation
            .decodeCheckpointInfo(props.getTargetLocation());
        
        // 5. 创建 PendingCheckpoint
        PendingCheckpoint checkpoint = new PendingCheckpoint(
            jobId,
            checkpointId,
            timestamp,
            props,
            location,
            checkpointPlan.getTasksToTrigger(),
            checkpointPlan.getTasksToWaitFor());
        
        pendingCheckpoints.put(checkpointId, checkpoint);
        
        // 6. 注册超时任务
        ScheduledFuture<?> timeoutFuture = timerExecutor.schedule(
            () -> handleCheckpointTimeout(checkpointId),
            checkpointTimeout,
            TimeUnit.MILLISECONDS);
        
        checkpoint.setTimeoutFuture(timeoutFuture);
        
        // 7. 向 Source Task 发送 Barrier
        for (ExecutionVertex vertex : checkpointPlan.getTasksToTrigger()) {
            ExecutionAttemptID attemptId = vertex.getCurrentExecutionAttempt().getAttemptId();
            
            // 构造 CheckpointBarrier
            CheckpointBarrier barrier = new CheckpointBarrier(
                checkpointId,
                timestamp,
                new CheckpointOptions(props.getCheckpointType(), location));
            
            // 发送到 Task
            taskExecutorGateway.triggerCheckpoint(
                attemptId,
                checkpointId,
                timestamp,
                checkpointOptions);
        }
        
        return checkpoint.getCompletionFuture();
    }
}
```

### PendingCheckpoint 状态管理

```java
// 位于 org.apache.flink.runtime.checkpoint.PendingCheckpoint

/**
 * PendingCheckpoint 表示进行中的 Checkpoint
 */
public class PendingCheckpoint {
    
    // Checkpoint 基本信息
    private final long checkpointId;
    private final long timestamp;
    private final CheckpointProperties props;
    
    // 需要等待 Ack 的 Task
    private final Map<ExecutionAttemptID, TaskStateSnapshot> taskStates;
    private final Set<ExecutionAttemptID> notYetAcknowledgedTasks;
    
    // 是否已完成
    private volatile boolean isDisposed = false;
    
    // 完成回调
    private final CompletableFuture<CompletedCheckpoint> completionFuture;
    
    // 接收 Task 的 Ack
    public boolean acknowledgeTask(
            ExecutionAttemptID attemptId,
            TaskStateSnapshot taskState,
            CheckpointMetrics metrics) {
        
        // 检查是否已被处理
        if (isDisposed) {
            return false;
        }
        
        // 检查是否在等待列表中
        if (!notYetAcknowledgedTasks.remove(attemptId)) {
            // 不在等待列表，可能已经 Ack 或 Task 不存在
            return false;
        }
        
        // 存储状态
        if (taskState != null) {
            taskStates.put(attemptId, taskState);
        }
        
        // 检查是否所有 Task 都已 Ack
        if (notYetAcknowledgedTasks.isEmpty()) {
            // 所有 Task 都已 Ack，完成 Checkpoint
            finalizeCheckpoint();
            return true;
        }
        
        return false;
    }
    
    // 完成 Checkpoint
    private void finalizeCheckpoint() {
        if (isDisposed) {
            return;
        }
        
        isDisposed = true;
        
        // 构建完成的 Checkpoint
        CompletedCheckpoint completed = new CompletedCheckpoint(
            jobId,
            checkpointId,
            timestamp,
            System.currentTimeMillis(),
            taskStates,
            props);
        
        // 通知完成
        completionFuture.complete(completed);
    }
    
    // 处理超时
    public void abort(CheckpointFailureReason reason) {
        if (isDisposed) {
            return;
        }
        
        isDisposed = true;
        
        // 清理状态
        taskStates.clear();
        notYetAcknowledgedTasks.clear();
        
        // 通知失败
        completionFuture.completeExceptionally(
            new CheckpointException(reason));
    }
}
```

### Task 端 Checkpoint 处理

```java
// 位于 org.apache.flink.runtime.taskmanager.Task

/**
 * Task 接收 Checkpoint 触发请求
 */
public class Task implements Runnable, TaskGateway {
    
    // 接收 Checkpoint 触发
    public void triggerCheckpoint(
            long checkpointId,
            long timestamp,
            CheckpointOptions checkpointOptions) {
        
        // 获取当前执行状态
        ExecutionState state = getExecutionState();
        if (state != ExecutionState.RUNNING) {
            // Task 不在运行状态，忽略
            return;
        }
        
        // 通知 StreamTask
        invokable.triggerCheckpoint(checkpointId, timestamp, checkpointOptions);
    }
}

// 位于 org.apache.flink.streaming.runtime.tasks.StreamTask

/**
 * StreamTask 处理 Checkpoint
 */
public abstract class StreamTask<OUT, OP extends StreamOperator<OUT>>
        extends Task {
    
    // 触发 Checkpoint
    public void triggerCheckpoint(
            long checkpointId,
            long timestamp,
            CheckpointOptions checkpointOptions) throws Exception {
        
        // 1. 执行 Checkpoint
        boolean success = performCheckpoint(
            checkpointId,
            timestamp,
            checkpointOptions);
        
        // 2. 发送 Ack
        if (success) {
            acknowledgeCheckpoint(checkpointId);
        }
    }
    
    // 执行 Checkpoint
    private boolean performCheckpoint(
            long checkpointId,
            long timestamp,
            CheckpointOptions checkpointOptions) throws Exception {
        
        // 1. 发送 Barrier 到下游
        //    Source Task 不需要等待 Barrier，直接注入
        //    非 Source Task 等待 Barrier 对齐后执行
        
        CheckpointBarrier barrier = new CheckpointBarrier(
            checkpointId,
            timestamp,
            checkpointOptions);
        
        // 广播 Barrier
        for (RecordWriterOutput<?> output : outputs) {
            output.broadcastEvent(barrier);
        }
        
        // 2. 快照算子状态
        OperatorChain<?, ?> operatorChain = this.operatorChain;
        Map<OperatorID, OperatorSnapshotFutures> snapshotFutures = 
            new HashMap<>();
        
        for (StreamOperator<?> operator : operatorChain.getAllOperators()) {
            if (operator != null) {
                OperatorSnapshotFutures futures = operator.snapshotState(
                    checkpointId,
                    timestamp,
                    checkpointOptions,
                    checkpointStorage);
                snapshotFutures.put(operator.getOperatorID(), futures);
            }
        }
        
        // 3. 构建状态快照
        TaskStateSnapshot taskStateSnapshot = new TaskStateSnapshot();
        for (Map.Entry<OperatorID, OperatorSnapshotFutures> entry : 
                snapshotFutures.entrySet()) {
            OperatorStateSnapshot operatorState = 
                entry.getValue().getCompletedSnapshot();
            taskStateSnapshot.putSubtaskState(entry.getKey(), operatorState);
        }
        
        // 4. 存储快照
        this.taskStateManager.reportTaskStateSnapshots(
            checkpointId,
            taskStateSnapshot);
        
        return true;
    }
}
```

## 两阶段提交协议实现

### TwoPhaseCommitSinkFunction 接口

```java
// 位于 org.apache.flink.streaming.api.functions.sink.TwoPhaseCommitSinkFunction

/**
 * TwoPhaseCommitSinkFunction 实现两阶段提交
 * 用于实现端到端 Exactly-Once
 */
public abstract class TwoPhaseCommitSinkFunction<IN, TXN, CONTEXT>
        extends RichSinkFunction<IN>
        implements CheckpointedFunction {
    
    // 当前事务
    private transient TXN currentTransaction;
    
    // 待提交的事务（按 Checkpoint ID 排序）
    private final TreeMap<Long, TXN> pendingCommitTransactions;
    
    // 状态描述符
    private final ListStateDescriptor<TXN> pendingTransactionsDescriptor;
    private transient ListState<TXN> pendingTransactionsState;
    
    // ==================== 抽象方法 ====================
    
    // 开始事务
    protected abstract TXN beginTransaction() throws Exception;
    
    // 写入数据（在事务中）
    protected abstract void invoke(TXN transaction, IN value, Context context) 
        throws Exception;
    
    // 预提交
    protected abstract void preCommit(TXN transaction) throws Exception;
    
    // 提交事务
    protected abstract void commit(TXN transaction);
    
    // 回滚事务
    protected abstract void abort(TXN transaction);
    
    // ==================== 实现方法 ====================
    
    @Override
    public void initializeState(FunctionInitializationContext context) 
            throws Exception {
        
        // 初始化状态
        pendingTransactionsState = context.getOperatorStateStore()
            .getListState(pendingTransactionsDescriptor);
        
        // 恢复待提交的事务
        if (context.isRestored()) {
            for (TXN txn : pendingTransactionsState.get()) {
                pendingCommitTransactions.put(txn.getCheckpointId(), txn);
            }
        }
        
        // 开始新事务
        currentTransaction = beginTransaction();
    }
    
    @Override
    public void invoke(IN value, Context context) throws Exception {
        // 在当前事务中写入数据
        invoke(currentTransaction, value, context);
    }
    
    @Override
    public void snapshotState(FunctionSnapshotContext context) 
            throws Exception {
        
        long checkpointId = context.getCheckpointId();
        
        // ===== Phase 1: 预提交 =====
        
        // 预提交当前事务
        preCommit(currentTransaction);
        
        // 将当前事务加入待提交列表
        pendingCommitTransactions.put(checkpointId, currentTransaction);
        
        // 开始新事务（用于下一个 Checkpoint）
        currentTransaction = beginTransaction();
        
        // 保存状态
        pendingTransactionsState.clear();
        pendingTransactionsState.addAll(pendingCommitTransactions.values());
    }
    
    @Override
    public void notifyCheckpointComplete(long checkpointId) throws Exception {
        
        // ===== Phase 2: 提交 =====
        
        // 提交所有早于当前 Checkpoint 的事务
        Iterator<Map.Entry<Long, TXN>> iterator = 
            pendingCommitTransactions.entrySet().iterator();
        
        while (iterator.hasNext()) {
            Map.Entry<Long, TXN> entry = iterator.next();
            long txnCheckpointId = entry.getKey();
            TXN txn = entry.getValue();
            
            if (txnCheckpointId <= checkpointId) {
                // 提交事务
                commit(txn);
                iterator.remove();
            }
        }
    }
    
    @Override
    public void notifyCheckpointAborted(long checkpointId) throws Exception {
        
        // 回滚所有早于当前 Checkpoint 的事务
        Iterator<Map.Entry<Long, TXN>> iterator = 
            pendingCommitTransactions.entrySet().iterator();
        
        while (iterator.hasNext()) {
            Map.Entry<Long, TXN> entry = iterator.next();
            long txnCheckpointId = entry.getKey();
            TXN txn = entry.getValue();
            
            if (txnCheckpointId <= checkpointId) {
                // 回滚事务
                abort(txn);
                iterator.remove();
            }
        }
    }
}
```

### Kafka Sink 实现示例

```java
// Kafka 两阶段提交 Sink 实现
public class KafkaExactlyOnceSink<IN> extends TwoPhaseCommitSinkFunction<
        IN, 
        KafkaTransactionState, 
        KafkaTransactionContext> {
    
    private final FlinkKafkaProducer<IN> kafkaProducer;
    private final String topic;
    
    public KafkaExactlyOnceSink(String topic, Properties properties) {
        super();
        this.topic = topic;
        this.kafkaProducer = new FlinkKafkaProducer<>(topic, properties);
    }
    
    @Override
    protected KafkaTransactionState beginTransaction() throws Exception {
        // 开始 Kafka 事务
        FlinkKafkaProducer<byte[], byte[]> producer = 
            kafkaProducer.createTransactionalProducer();
        producer.beginTransaction();
        
        return new KafkaTransactionState(
            producer.getProducerId(),
            producer.getEpoch(),
            producer);
    }
    
    @Override
    protected void invoke(
            KafkaTransactionState txn, 
            IN value, 
            Context context) throws Exception {
        
        // 在事务中发送消息
        ProducerRecord<byte[], byte[]> record = new ProducerRecord<>(
            topic,
            serializeKey(value),
            serializeValue(value));
        
        txn.getProducer().send(record);
    }
    
    @Override
    protected void preCommit(KafkaTransactionState txn) throws Exception {
        // Kafka 预提交 = flush
        txn.getProducer().flush();
    }
    
    @Override
    protected void commit(KafkaTransactionState txn) {
        // 提交 Kafka 事务
        txn.getProducer().commitTransaction();
        txn.getProducer().close();
    }
    
    @Override
    protected void abort(KafkaTransactionState txn) {
        // 回滚 Kafka 事务
        txn.getProducer().abortTransaction();
        txn.getProducer().close();
    }
}

// Kafka 事务状态
class KafkaTransactionState {
    private final long producerId;
    private final short epoch;
    private final FlinkKafkaProducer<byte[], byte[]> producer;
    
    // ...
}
```

### 两阶段提交时序图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        两阶段提交时序                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  时间轴:                                                                │
│  ──────────────────────────────────────────────────────────────────►   │
│                                                                         │
│  Checkpoint 1:                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  T1: beginTransaction() ───► T1: invoke(data1) ───► ...        │   │
│  │                                                                 │   │
│  │  [Checkpoint 1 开始]                                            │   │
│  │       │                                                         │   │
│  │       ▼                                                         │   │
│  │  T1: preCommit() ───► snapshotState() ───► T2: beginTransaction()│   │
│  │       │                    │                                    │   │
│  │       │                    └─── 保存 T1 到 pendingTransactions  │   │
│  │       │                                                         │   │
│  │  [Checkpoint 1 完成]                                            │   │
│  │       │                                                         │   │
│  │       ▼                                                         │   │
│  │  notifyCheckpointComplete(1) ───► T1: commit() ───► 数据可见   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Checkpoint 2:                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  T2: invoke(data2) ───► T2: invoke(data3) ───► ...             │   │
│  │                                                                 │   │
│  │  [Checkpoint 2 开始]                                            │   │
│  │       │                                                         │   │
│  │       ▼                                                         │   │
│  │  T2: preCommit() ───► snapshotState() ───► T3: beginTransaction()│   │
│  │                                                                 │   │
│  │  [Checkpoint 2 完成]                                            │   │
│  │       │                                                         │   │
│  │       ▼                                                         │   │
│  │  notifyCheckpointComplete(2) ───► T2: commit() ───► 数据可见   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  关键点：                                                               │
│  • preCommit 在 snapshotState 之前调用                                  │
│  • commit 在 notifyCheckpointComplete 中调用                            │
│  • 每次快照开始新事务                                                   │
│  • 事务顺序提交，保证 Exactly-Once                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 故障恢复机制

### TaskManager 故障恢复

```java
// 位于 org.apache.flink.runtime.jobmaster.JobMaster

/**
 * JobMaster 处理 TaskManager 故障
 */
public class JobMaster {
    
    // TaskManager 故障处理
    public void notifyTaskFailure(
            ExecutionAttemptID attemptId,
            Throwable error) {
        
        // 1. 获取 ExecutionVertex
        ExecutionVertex vertex = executionGraph.getVertex(attemptId);
        
        // 2. 更新状态
        vertex.getCurrentExecutionAttempt().fail(error);
        
        // 3. 检查是否需要重启
        if (executionGraph.canRestart()) {
            // 从最近的 Checkpoint 恢复
            restartFromCheckpoint();
        } else {
            // 作业失败
            executionGraph.fail(error);
        }
    }
    
    // 从 Checkpoint 恢复
    private void restartFromCheckpoint() {
        // 1. 获取最近的 Checkpoint
        CompletedCheckpoint checkpoint = 
            checkpointCoordinator.getLatestCheckpoint();
        
        if (checkpoint == null) {
            // 没有 Checkpoint，从头开始
            executionGraph.restart();
            return;
        }
        
        // 2. 重新调度所有 Task
        for (ExecutionVertex vertex : executionGraph.getAllVertices()) {
            // 设置初始状态
            TaskStateSnapshot taskState = checkpoint.getTaskState(vertex.getID());
            vertex.setInitialState(taskState);
        }
        
        // 3. 重新部署
        executionGraph.scheduleForExecution();
    }
}
```

### JobManager HA

```java
// 位于 org.apache.flink.runtime.highavailability.HighAvailabilityServices

/**
 * JobManager HA 服务
 */
public interface HighAvailabilityServices {
    
    // 获取 Leader 选举服务
    LeaderElectionService getLeaderElectionService();
    
    // 获取 Leader 检索服务
    LeaderRetrievalService getLeaderRetrievalService();
    
    // 获取 Checkpoint ID 计数器
    CheckpointIDCounter getCheckpointIDCounter(JobID jobId);
    
    // 获取已完成 Checkpoint 存储
    CompletedCheckpointStore getCompletedCheckpointStore(JobID jobId);
}

// ZooKeeper Leader 选举
public class ZooKeeperLeaderElectionService 
        implements LeaderElectionService, LeaderLatchListener {
    
    private final CuratorFramework client;
    private final String latchPath;
    private final LeaderLatch leaderLatch;
    
    @Override
    public void start(LeaderContender contender) {
        this.contender = contender;
        leaderLatch.start();
    }
    
    @Override
    public void isLeader() {
        // 成为 Leader
        String leaderAddress = generateLeaderAddress();
        contender.grantLeadership(leaderAddress);
    }
    
    @Override
    public void notLeader() {
        // 失去 Leader
        contender.revokeLeadership();
    }
}
```

## 总结

本章从源码层面深入解析了 Flink 容错机制：

| 概念 | 源码位置 | 核心机制 |
|------|----------|----------|
| CheckpointBarrier | `checkpoint.CheckpointBarrier` | Checkpoint 标记，随数据流流动 |
| BarrierBuffer | `io.BarrierBuffer` | Exactly-Once 模式的 Barrier 对齐 |
| CheckpointCoordinator | `checkpoint.CheckpointCoordinator` | Checkpoint 协调器，管理生命周期 |
| TwoPhaseCommitSinkFunction | `functions.sink.TwoPhaseCommitSinkFunction` | 两阶段提交，端到端 Exactly-Once |

**关键要点**：
1. Barrier 随数据流流动，标记 Checkpoint 边界
2. Exactly-Once 需要 Barrier 对齐，阻塞先到 Barrier 的通道
3. CheckpointCoordinator 协调所有 Task 完成快照
4. 两阶段提交实现端到端 Exactly-Once

## 参考资料

- [Checkpoints](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/checkpoints/)
- [Savepoints](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/savepoints/)
- [Flink Checkpoint 源码](https://github.com/apache/flink/tree/master/flink-runtime/src/main/java/org/apache/flink/runtime/checkpoint)

## 下一章预告

下一章将深入解析 **网络与反压**，包括：
- Network Buffer 管理
- Credit-based 流控源码
- 反压传播机制