---
title: "Flink 底层原理系列（八）：内存管理"
date: "2021-03-18"
excerpt: "深入解析 Flink 内存管理机制，包括 MemorySegment 实现、内存分配器架构、托管内存使用以及内存配置优化策略。"
tags: ["Flink", "流处理", "内存管理", "JVM"]
series:
  slug: "flink-core-principles"
  title: "Flink 底层原理系列"
  order: 8
---

## 前言

Flink 自主管理内存，避免了 JVM 内存管理的诸多问题（如 GC 停顿、对象开销等）。理解 Flink 的内存模型和 MemorySegment 机制对于调优和排查内存问题至关重要。本章将从源码层面深入解析这些核心机制。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 内存模型 | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| MemorySegment | ⭐⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 内存分配器 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 托管内存 | ⭐⭐⭐ | 实战价值 | ✅ |

## 面试考点

1. Flink 的内存模型是怎样的？为什么要自己管理内存？
2. MemorySegment 是如何实现的？
3. Flink 的内存分配器架构是怎样的？
4. 托管内存是如何使用的？

## 为什么需要自主内存管理

### JVM 内存问题

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        JVM 内存问题                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  问题 1: 对象开销                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Java 对象额外开销：                                            │   │
│  │  • 对象头 (Object Header): 12-16 bytes                         │   │
│  │  • 引用指针: 4-8 bytes                                          │   │
│  │  • 对齐填充: 可变                                               │   │
│  │                                                                 │   │
│  │  示例：存储 1 亿个 Long 对象                                     │   │
│  │  • Long 值: 8 bytes                                             │   │
│  │  • 对象开销: ~16 bytes                                          │   │
│  │  • 总计: 24 bytes * 1亿 = 2.4 GB (实际只需 0.8 GB)              │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  问题 2: GC 停顿                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  大数据量场景下：                                               │   │
│  │  • Full GC 可能导致秒级停顿                                     │   │
│  │  • 影响流处理的低延迟要求                                       │   │
│  │  • 内存碎片问题                                                 │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Flink 解决方案：                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  1. 使用 MemorySegment 替代 Java 对象                           │   │
│  │     • 固定大小的内存块                                          │   │
│  │     • 零拷贝序列化                                              │   │
│  │     • 堆内/堆外内存统一抽象                                     │   │
│  │                                                                 │   │
│  │  2. 使用托管内存（Managed Memory）                              │   │
│  │     • 堆外内存，不受 GC 影响                                    │   │
│  │     • 用于排序、Hash Join、RocksDB                              │   │
│  │                                                                 │   │
│  │  3. 内存池化管理                                                │   │
│  │     • 预分配、复用                                              │   │
│  │     • 减少分配/释放开销                                         │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## MemorySegment 实现

### MemorySegment 接口

```java
// 位于 org.apache.flink.core.memory.MemorySegment

/**
 * MemorySegment 是 Flink 内存管理的核心抽象
 * 代表一段连续的内存，可以是堆内或堆外
 */
public abstract class MemorySegment {
    
    // 内存大小
    protected final int size;
    
    // 堆内存字节数组（堆内内存使用）
    protected byte[] heapMemory;
    
    // 堆外内存地址（堆外内存使用）
    protected long offHeapMemoryAddress;
    
    // 所有者
    protected Object owner;
    
    // ==================== 构造方法 ====================
    
    // 堆内存构造
    protected MemorySegment(byte[] buffer, Object owner) {
        this.size = buffer.length;
        this.heapMemory = buffer;
        this.offHeapMemoryAddress = 0;
        this.owner = owner;
    }
    
    // 堆外内存构造
    protected MemorySegment(long offHeapAddress, int size, Object owner) {
        this.size = size;
        this.heapMemory = null;
        this.offHeapMemoryAddress = offHeapAddress;
        this.owner = owner;
    }
    
    // ==================== 工厂方法 ====================
    
    // 分配堆内存
    public static MemorySegment allocateHeapMemory(int size) {
        return new HeapMemorySegment(new byte[size], null);
    }
    
    // 分配堆外内存
    public static MemorySegment allocateOffHeapMemory(int size) {
        long address = UNSAFE.allocateMemory(size);
        return new HybridMemorySegment(address, size, null);
    }
    
    // ==================== 数据访问方法 ====================
    
    // 获取大小
    public int size() {
        return size;
    }
    
    // 检查是否是堆内存
    public boolean isHeapMemory() {
        return heapMemory != null;
    }
    
    // 获取底层数组（仅堆内存）
    public byte[] getArray() {
        return heapMemory;
    }
    
    // 获取堆外内存地址
    public long getAddress() {
        return offHeapMemoryAddress;
    }
    
    // ==================== 数据读写 ====================
    
    // 读取单个字节
    public abstract byte get(int index);
    
    // 写入单个字节
    public abstract void put(int index, byte b);
    
    // 读取 short
    public abstract short getShort(int index);
    
    // 写入 short
    public abstract void putShort(int index, short value);
    
    // 读取 int
    public abstract int getInt(int index);
    
    // 写入 int
    public abstract void putInt(int index, int value);
    
    // 读取 long
    public abstract long getLong(int index);
    
    // 写入 long
    public abstract void putLong(int index, long value);
    
    // 批量读取
    public abstract void get(int index, byte[] dst, int offset, int length);
    
    // 批量写入
    public abstract void put(int index, byte[] src, int offset, int length);
    
    // 内存拷贝
    public abstract void copyTo(int offset, MemorySegment target, int targetOffset, int length);
    
    // 比较内存
    public abstract int compare(MemorySegment seg2, int offset1, int offset2, int len);
    
    // 交换字节序
    public abstract void swapBytes(byte[] tempBuffer, MemorySegment seg2, int offset1, int offset2, int len);
}
```

### HeapMemorySegment 实现

```java
// 位于 org.apache.flink.core.memory.HeapMemorySegment

/**
 * 堆内存 MemorySegment 实现
 */
public final class HeapMemorySegment extends MemorySegment {
    
    // 使用 byte[] 作为底层存储
    private byte[] memory;
    
    HeapMemorySegment(byte[] memory, Object owner) {
        super(memory, owner);
        this.memory = memory;
    }
    
    @Override
    public byte get(int index) {
        return memory[index];
    }
    
    @Override
    public void put(int index, byte b) {
        memory[index] = b;
    }
    
    @Override
    public short getShort(int index) {
        return (short) ((memory[index] << 8) | (memory[index + 1] & 0xff));
    }
    
    @Override
    public void putShort(int index, short value) {
        memory[index] = (byte) (value >> 8);
        memory[index + 1] = (byte) value;
    }
    
    @Override
    public int getInt(int index) {
        return (memory[index] << 24) |
               ((memory[index + 1] & 0xff) << 16) |
               ((memory[index + 2] & 0xff) << 8) |
               (memory[index + 3] & 0xff);
    }
    
    @Override
    public void putInt(int index, int value) {
        memory[index] = (byte) (value >> 24);
        memory[index + 1] = (byte) (value >> 16);
        memory[index + 2] = (byte) (value >> 8);
        memory[index + 3] = (byte) value;
    }
    
    @Override
    public long getLong(int index) {
        return ((long) memory[index] << 56) |
               ((long) (memory[index + 1] & 0xff) << 48) |
               ((long) (memory[index + 2] & 0xff) << 40) |
               ((long) (memory[index + 3] & 0xff) << 32) |
               ((long) (memory[index + 4] & 0xff) << 24) |
               ((long) (memory[index + 5] & 0xff) << 16) |
               ((long) (memory[index + 6] & 0xff) << 8) |
               ((long) (memory[index + 7] & 0xff));
    }
    
    @Override
    public void putLong(int index, long value) {
        memory[index] = (byte) (value >> 56);
        memory[index + 1] = (byte) (value >> 48);
        memory[index + 2] = (byte) (value >> 40);
        memory[index + 3] = (byte) (value >> 32);
        memory[index + 4] = (byte) (value >> 24);
        memory[index + 5] = (byte) (value >> 16);
        memory[index + 6] = (byte) (value >> 8);
        memory[index + 7] = (byte) value;
    }
    
    @Override
    public void get(int index, byte[] dst, int offset, int length) {
        System.arraycopy(memory, index, dst, offset, length);
    }
    
    @Override
    public void put(int index, byte[] src, int offset, int length) {
        System.arraycopy(src, offset, memory, index, length);
    }
    
    @Override
    public void copyTo(int offset, MemorySegment target, int targetOffset, int length) {
        System.arraycopy(memory, offset, target.heapMemory, targetOffset, length);
    }
}
```

### HybridMemorySegment 实现

```java
// 位于 org.apache.flink.core.memory.HybridMemorySegment

/**
 * 混合内存 MemorySegment 实现
 * 支持堆内存和堆外内存
 */
public final class HybridMemorySegment extends MemorySegment {
    
    // 堆内存引用
    private final byte[] heapMemoryRef;
    
    // 堆外内存地址
    private final long address;
    
    // 堆内存构造
    HybridMemorySegment(byte[] buffer, Object owner) {
        super(buffer, owner);
        this.heapMemoryRef = buffer;
        this.address = BYTE_ARRAY_BASE_OFFSET;
    }
    
    // 堆外内存构造
    HybridMemorySegment(long offHeapAddress, int size, Object owner) {
        super(offHeapAddress, size, owner);
        this.heapMemoryRef = null;
        this.address = offHeapAddress;
    }
    
    // 使用 Unsafe 访问内存
    @Override
    public byte get(int index) {
        return UNSAFE.getByte(address + index);
    }
    
    @Override
    public void put(int index, byte b) {
        UNSAFE.putByte(address + index, b);
    }
    
    @Override
    public short getShort(int index) {
        return UNSAFE.getShort(address + index);
    }
    
    @Override
    public void putShort(int index, short value) {
        UNSAFE.putShort(address + index, value);
    }
    
    @Override
    public int getInt(int index) {
        return UNSAFE.getInt(address + index);
    }
    
    @Override
    public void putInt(int index, int value) {
        UNSAFE.putInt(address + index, value);
    }
    
    @Override
    public long getLong(int index) {
        return UNSAFE.getLong(address + index);
    }
    
    @Override
    public void putLong(int index, long value) {
        UNSAFE.putLong(address + index, value);
    }
    
    @Override
    public void get(int index, byte[] dst, int offset, int length) {
        UNSAFE.copyMemory(
            heapMemoryRef,
            address + index,
            dst,
            BYTE_ARRAY_BASE_OFFSET + offset,
            length);
    }
    
    @Override
    public void put(int index, byte[] src, int offset, int length) {
        UNSAFE.copyMemory(
            src,
            BYTE_ARRAY_BASE_OFFSET + offset,
            heapMemoryRef,
            address + index,
            length);
    }
    
    @Override
    public void copyTo(int offset, MemorySegment target, int targetOffset, int length) {
        UNSAFE.copyMemory(
            heapMemoryRef,
            address + offset,
            target.heapMemory,
            target.getAddress() + targetOffset,
            length);
    }
    
    // Sun.misc.Unsafe 引用
    private static final sun.misc.Unsafe UNSAFE;
    private static final long BYTE_ARRAY_BASE_OFFSET;
    
    static {
        UNSAFE = getUnsafe();
        BYTE_ARRAY_BASE_OFFSET = UNSAFE.arrayBaseOffset(byte[].class);
    }
    
    private static sun.misc.Unsafe getUnsafe() {
        try {
            Field field = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
            field.setAccessible(true);
            return (sun.misc.Unsafe) field.get(null);
        } catch (Exception e) {
            throw new RuntimeException("Could not obtain Unsafe instance", e);
        }
    }
}
```

## 内存分配器架构

### MemoryManager 源码

```java
// 位于 org.apache.flink.runtime.memory.MemoryManager

/**
 * MemoryManager 是 Flink 内存管理的核心组件
 * 管理所有托管内存（Managed Memory）
 */
public class MemoryManager {
    
    // 内存大小
    private final long totalMemorySize;
    
    // 每个内存页的大小
    private final int pageSize;
    
    // 总页数
    private final int totalNumPages;
    
    // 可用页数
    private final AtomicInteger availableMemoryPages;
    
    // 所有分配的 MemorySegment
    private final Set<MemorySegment> allocatedSegments;
    
    // 内存类型
    private final MemoryType memoryType;
    
    // 是否预分配
    private final boolean preAllocateMemory;
    
    public MemoryManager(
            long memorySize,
            int pageSize,
            MemoryType memoryType,
            boolean preAllocateMemory) {
        
        this.totalMemorySize = memorySize;
        this.pageSize = pageSize;
        this.totalNumPages = (int) (memorySize / pageSize);
        this.memoryType = memoryType;
        this.preAllocateMemory = preAllocateMemory;
        this.availableMemoryPages = new AtomicInteger(totalNumPages);
        this.allocatedSegments = Collections.newSetFromMap(new ConcurrentHashMap<>());
        
        // 预分配内存（可选）
        if (preAllocateMemory) {
            preAllocateMemory();
        }
    }
    
    // 分配内存页
    public List<MemorySegment> allocatePages(
            Object owner,
            int numPages) throws MemoryAllocationException {
        
        // 检查是否有足够的页
        if (availableMemoryPages.get() < numPages) {
            throw new MemoryAllocationException(
                "Not enough memory. Required: " + numPages + 
                ", available: " + availableMemoryPages.get());
        }
        
        // 减少可用页数
        availableMemoryPages.addAndGet(-numPages);
        
        // 分配 MemorySegment
        List<MemorySegment> segments = new ArrayList<>(numPages);
        for (int i = 0; i < numPages; i++) {
            MemorySegment segment = allocateNewSegment(owner);
            segments.add(segment);
            allocatedSegments.add(segment);
        }
        
        return segments;
    }
    
    // 分配单个 MemorySegment
    private MemorySegment allocateNewSegment(Object owner) {
        if (memoryType == MemoryType.HEAP) {
            return MemorySegment.allocateHeapMemory(pageSize);
        } else {
            return MemorySegment.allocateOffHeapMemory(pageSize);
        }
    }
    
    // 释放内存页
    public void release(List<MemorySegment> segments) {
        for (MemorySegment segment : segments) {
            release(segment);
        }
    }
    
    // 释放单个 MemorySegment
    public void release(MemorySegment segment) {
        if (allocatedSegments.remove(segment)) {
            availableMemoryPages.incrementAndGet();
            
            // 如果是堆外内存，需要手动释放
            if (!segment.isHeapMemory()) {
                UNSAFE.freeMemory(segment.getAddress());
            }
        }
    }
    
    // 获取可用内存大小
    public long getAvailableMemory() {
        return (long) availableMemoryPages.get() * pageSize;
    }
    
    // 获取总内存大小
    public long getTotalMemorySize() {
        return totalMemorySize;
    }
    
    // 获取页大小
    public int getPageSize() {
        return pageSize;
    }
    
    // 计算需要的页数
    public int computeNumberOfPages(long sizeInBytes) {
        return (int) ((sizeInBytes + pageSize - 1) / pageSize);
    }
    
    // 内存类型枚举
    public enum MemoryType {
        HEAP,      // 堆内存
        OFF_HEAP   // 堆外内存
    }
}
```

### MemorySegmentPool 接口

```java
// 位于 org.apache.flink.core.memory.MemorySegmentPool

/**
 * MemorySegmentPool 接口定义内存池的操作
 */
public interface MemorySegmentPool {
    
    // 请求一个 MemorySegment
    MemorySegment requestMemorySegment();
    
    // 返回一个 MemorySegment
    void returnMemorySegment(MemorySegment segment);
    
    // 返回多个 MemorySegment
    void returnMemorySegment(List<MemorySegment> segments);
    
    // 获取页大小
    int getPageSize();
    
    // 获取可用页数
    int getAvailableMemoryPages();
    
    // 获取所有者
    Object getOwner();
}
```

### AbstractPagedInputView 实现

```java
// 位于 org.apache.flink.core.memory.DataInputViewStream

/**
 * 分页输入视图
 * 支持跨 MemorySegment 读取数据
 */
public abstract class AbstractPagedInputView implements DataInputView {
    
    // 当前 MemorySegment
    protected MemorySegment currentSegment;
    
    // 当前在 Segment 中的位置
    protected int positionInSegment;
    
    // Segment 中的限制位置
    protected int limitInSegment;
    
    // 获取下一个 Segment 的方法
    protected abstract MemorySegment nextSegment(MemorySegment current) throws EOFException;
    
    // 获取 Segment 的限制
    protected abstract int getLimitForSegment(MemorySegment segment);
    
    // 确保有足够的字节可读
    protected void ensurePageLoaded(int bytesNeeded) throws EOFException {
        if (positionInSegment + bytesNeeded > limitInSegment) {
            // 切换到下一个 Segment
            currentSegment = nextSegment(currentSegment);
            positionInSegment = 0;
            limitInSegment = getLimitForSegment(currentSegment);
        }
    }
    
    @Override
    public byte readByte() throws IOException {
        ensurePageLoaded(1);
        byte b = currentSegment.get(positionInSegment);
        positionInSegment++;
        return b;
    }
    
    @Override
    public short readShort() throws IOException {
        ensurePageLoaded(2);
        short s = currentSegment.getShort(positionInSegment);
        positionInSegment += 2;
        return s;
    }
    
    @Override
    public int readInt() throws IOException {
        ensurePageLoaded(4);
        int i = currentSegment.getInt(positionInSegment);
        positionInSegment += 4;
        return i;
    }
    
    @Override
    public long readLong() throws IOException {
        ensurePageLoaded(8);
        long l = currentSegment.getLong(positionInSegment);
        positionInSegment += 8;
        return l;
    }
    
    @Override
    public void read(byte[] b, int off, int len) throws IOException {
        int remaining = len;
        int offset = off;
        
        while (remaining > 0) {
            // 计算当前 Segment 可读的字节数
            int bytesInCurrentSegment = limitInSegment - positionInSegment;
            
            if (bytesInCurrentSegment == 0) {
                // 切换到下一个 Segment
                currentSegment = nextSegment(currentSegment);
                positionInSegment = 0;
                limitInSegment = getLimitForSegment(currentSegment);
                bytesInCurrentSegment = limitInSegment;
            }
            
            // 读取数据
            int bytesToRead = Math.min(remaining, bytesInCurrentSegment);
            currentSegment.get(positionInSegment, b, offset, bytesToRead);
            
            positionInSegment += bytesToRead;
            offset += bytesToRead;
            remaining -= bytesToRead;
        }
    }
}
```

## 托管内存使用

### 托管内存用途

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        托管内存用途                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  1. 排序操作                                                    │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • QuickSort/ExternalSort 使用托管内存                    │ │   │
│  │  │  • 避免大对象导致的 GC 问题                                │ │   │
│  │  │  • 支持内存不足时溢写到磁盘                                │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  2. Hash Join                                                  │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • 构建阶段使用托管内存存储 Hash 表                       │ │   │
│  │  │  • 内存不足时使用 Hybrid Hash Join                        │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  3. RocksDB State Backend                                      │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • RocksDB 使用托管内存作为 Write Buffer 和 Block Cache   │ │   │
│  │  │  • 每个 Slot 分配：managed_memory / num_slots             │ │   │
│  │  │  • 避免与 JVM 堆内存竞争                                   │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  4. Python Process                                             │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  • PyFlink 进程使用托管内存                               │ │   │
│  │  │  • Python UDF 的内存管理                                  │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### BinaryExternalSorter 实现

```java
// 位于 org.apache.flink.runtime.operators.sort.BinaryExternalSorter

/**
 * 二进制外部排序器
 * 使用托管内存进行排序
 */
public class BinaryExternalSorter<T> implements Sorter<T> {
    
    // MemoryManager
    private final MemoryManager memoryManager;
    
    // 内存池
    private final List<MemorySegment> memorySegments;
    
    // 排序缓冲区
    private final CircularQueues<MemorySegment> sortBuffers;
    
    // 溢写器
    private final SpillingBuffer spillingBuffer;
    
    // 是否内存足够（不需要溢写）
    private boolean allInMemory;
    
    // 内存阈值（超过则溢写）
    private final long memoryThreshold;
    
    public BinaryExternalSorter(
            MemoryManager memoryManager,
            List<MemorySegment> memory,
            TypeSerializer<T> serializer,
            TypeComparator<T> comparator) {
        
        this.memoryManager = memoryManager;
        this.memorySegments = memory;
        this.sortBuffers = new CircularQueues<>();
        
        // 计算内存阈值
        long totalMemory = memory.size() * memoryManager.getPageSize();
        this.memoryThreshold = (long) (totalMemory * 0.8);
        
        // 创建排序缓冲区
        for (MemorySegment segment : memory) {
            sortBuffers.add(new SortBuffer(segment));
        }
    }
    
    // 写入数据
    @Override
    public void write(T record) throws IOException {
        // 序列化记录
        MemorySegment segment = getSegmentForWrite();
        
        if (segment == null) {
            // 内存不足，溢写到磁盘
            spill();
            segment = getSegmentForWrite();
        }
        
        // 写入记录
        writeToBuffer(record, segment);
    }
    
    // 溢写到磁盘
    private void spill() throws IOException {
        allInMemory = false;
        
        // 将当前缓冲区写入磁盘
        for (MemorySegment segment : sortBuffers) {
            spillingBuffer.writeSegment(segment);
        }
        
        // 清空缓冲区
        sortBuffers.clear();
    }
    
    // 获取排序结果
    @Override
    public MutableObjectIterator<T> getIterator() throws IOException {
        if (allInMemory) {
            // 全部在内存中，直接排序
            return sortInMemory();
        } else {
            // 需要归并排序
            return mergeSort();
        }
    }
    
    // 内存中排序
    private MutableObjectIterator<T> sortInMemory() {
        // 使用快速排序
        quickSort(sortBuffers);
        return new MemoryIterator(sortBuffers);
    }
    
    // 归并排序
    private MutableObjectIterator<T> mergeSort() throws IOException {
        // 将内存中的数据也溢写
        spill();
        
        // 使用归并排序合并所有文件
        return new MergeIterator(spillingBuffer.getSpillFiles());
    }
}
```

### 托管内存分配

```java
// 位于 org.apache.flink.runtime.taskmanager.Task

/**
 * Task 中托管内存的分配
 */
public class Task implements Runnable {
    
    // 任务配置
    private final JobInformation jobInformation;
    private final TaskInformation taskInformation;
    
    // MemoryManager
    private final MemoryManager memoryManager;
    
    // 分配的内存段
    private List<MemorySegment> memorySegments;
    
    // 分配托管内存
    private void allocateManagedMemory() throws MemoryAllocationException {
        
        // 获取任务需要的托管内存
        // 从 TaskConfiguration 中读取配置
        int managedMemorySize = taskInformation.getManagedMemorySize();
        
        // 计算需要的页数
        int numPages = memoryManager.computeNumberOfPages(managedMemorySize);
        
        // 分配内存页
        memorySegments = memoryManager.allocatePages(this, numPages);
        
        // 创建内存池
        MemorySegmentPool memoryPool = new ListMemorySegmentPool(
            memorySegments, 
            memoryManager.getPageSize());
        
        // 将内存池传递给算子
        // ...
    }
    
    // 释放托管内存
    private void releaseManagedMemory() {
        if (memorySegments != null) {
            memoryManager.release(memorySegments);
            memorySegments = null;
        }
    }
    
    @Override
    public void run() {
        try {
            // 分配内存
            allocateManagedMemory();
            
            // 执行任务
            invokable.invoke();
            
        } finally {
            // 释放内存
            releaseManagedMemory();
        }
    }
}
```

## 内存配置

### TaskManager 内存模型

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TaskManager 内存模型                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Total Process Memory (进程总内存)                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Total Flink Memory (Flink 总内存)                              │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  JVM Heap (堆内存)                                        │ │   │
│  │  │  ┌─────────────────────────────────────────────────────┐ │ │   │
│  │  │  │ Framework Heap (框架堆)                              │ │ │   │
│  │  │  │   • 默认: 128MB                                      │ │ │   │
│  │  │  │   • Flink 框架内部对象                                │ │ │   │
│  │  │  ├─────────────────────────────────────────────────────┤ │ │   │
│  │  │  │ Task Heap (任务堆)                                   │ │ │   │
│  │  │  │   • 用户代码、算子对象                                │ │ │   │
│  │  │  │   • = Total Flink - 其他组件                         │ │ │   │
│  │  │  └─────────────────────────────────────────────────────┘ │ │   │
│  │  │                                                           │ │   │
│  │  │  Off-Heap (堆外内存)                                      │ │   │
│  │  │  ┌─────────────────────────────────────────────────────┐ │ │   │
│  │  │  │ Managed Memory (托管内存)                            │ │ │   │
│  │  │  │   • 默认: 40% of Total Flink                        │ │ │   │
│  │  │  │   • 用于: RocksDB、排序、Hash Join                   │ │ │   │
│  │  │  ├─────────────────────────────────────────────────────┤ │ │   │
│  │  │  │ Network Memory (网络内存)                            │ │ │   │
│  │  │  │   • 默认: 10% of Total Flink                        │ │ │   │
│  │  │  │   • 用于: 网络缓冲区                                  │ │ │   │
│  │  │  ├─────────────────────────────────────────────────────┤ │ │   │
│  │  │  │ Framework Off-heap (框架堆外)                        │ │ │   │
│  │  │  │   • 默认: 128MB                                      │ │ │   │
│  │  │  │   • Flink 框架堆外对象                                │ │ │   │
│  │  │  └─────────────────────────────────────────────────────┘ │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  JVM Overhead (JVM 开销)                                       │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │ • Thread Stacks (线程栈)                                  │ │   │
│  │  │ • GC Structures (GC 结构)                                 │ │   │
│  │  │ • Code Cache (代码缓存)                                   │ │   │
│  │  │ • 默认: 10% of Total Flink                                │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 内存配置示例

```yaml
# flink-conf.yaml

# 方式一：指定进程总内存
taskmanager.memory.process.size: 4096m

# 方式二：指定 Flink 总内存
# taskmanager.memory.flink.size: 3072m

# 托管内存占比（用于 RocksDB、排序等）
taskmanager.memory.managed.fraction: 0.4

# 网络内存占比（用于网络缓冲区）
taskmanager.memory.network.fraction: 0.1
taskmanager.memory.network.min: 64mb
taskmanager.memory.network.max: 1gb

# 框架堆内存
taskmanager.memory.framework.heap.size: 128mb

# 框架堆外内存
taskmanager.memory.framework.off-heap.size: 128mb

# JVM Metaspace
taskmanager.memory.jvm-metaspace.size: 256mb

# JVM 开销占比
taskmanager.memory.jvm-overhead.fraction: 0.1
taskmanager.memory.jvm-overhead.min: 192mb
taskmanager.memory.jvm-overhead.max: 1gb

# 每个任务槽的托管内存
# taskmanager.memory.managed.size: 512mb
```

### 内存计算示例

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        内存计算示例                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  配置: process.size = 4GB                                               │
│                                                                         │
│  计算过程:                                                              │
│                                                                         │
│  1. JVM Metaspace = 256MB (固定)                                        │
│                                                                         │
│  2. JVM Overhead = 4GB * 10% = 400MB (默认占比)                         │
│                                                                         │
│  3. Total Flink Memory = 4GB - 256MB - 400MB = 3.4GB                   │
│                                                                         │
│  4. Framework Heap = 128MB (固定)                                       │
│                                                                         │
│  5. Framework Off-heap = 128MB (固定)                                   │
│                                                                         │
│  6. Network Memory = 3.4GB * 10% = 340MB                               │
│                                                                         │
│  7. Managed Memory = 3.4GB * 40% = 1.36GB                              │
│                                                                         │
│  8. Task Heap = 3.4GB - 128MB - 128MB - 340MB - 1.36GB ≈ 1.44GB        │
│                                                                         │
│  最终分配:                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Task Heap:        1.44 GB                                      │   │
│  │  Framework Heap:   128 MB                                       │   │
│  │  Managed Memory:   1.36 GB                                      │   │
│  │  Network Memory:   340 MB                                       │   │
│  │  Framework Off-heap: 128 MB                                     │   │
│  │  JVM Metaspace:    256 MB                                       │   │
│  │  JVM Overhead:     400 MB                                       │   │
│  │  ─────────────────────────                                      │   │
│  │  Total:            4 GB                                         │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 内存优化策略

### 常见问题与解决

```yaml
# 问题 1: GC 频繁
# 解决: 减少 Task Heap，使用 RocksDB + 托管内存

# 问题 2: 网络缓冲区不足
# 解决: 增加网络内存
taskmanager.memory.network.fraction: 0.15

# 问题 3: 状态过大
# 解决: 增加托管内存
taskmanager.memory.managed.fraction: 0.5

# 问题 4: 内存碎片
# 解决: 使用堆外内存
taskmanager.memory.managed.off-heap: true

# 问题 5: Buffer Debloat
# 启用自适应网络缓冲区调整
taskmanager.network.memory.buffer-debloat.enabled: true
taskmanager.network.memory.buffer-debloat.target: 100ms
```

### RocksDB 内存优化

```yaml
# RocksDB 内存配置
state.backend.rocksdb.memory.managed: true

# Block Cache 大小（默认使用托管内存）
state.backend.rocksdb.block.cache-size: 256m

# Write Buffer 大小
state.backend.rocksdb.writebuffer.size: 64m

# Write Buffer 数量
state.backend.rocksdb.writebuffer.count: 4

# 启用 Bloom Filter
state.backend.rocksdb.filter: true

# Compaction 配置
state.backend.rocksdb.compaction.style: universal
```

## 总结

本章从源码层面深入解析了 Flink 内存管理：

| 概念 | 源码位置 | 核心机制 |
|------|----------|----------|
| MemorySegment | `core.memory.MemorySegment` | 内存块抽象，统一堆内/堆外 |
| MemoryManager | `runtime.memory.MemoryManager` | 托管内存管理 |
| HybridMemorySegment | `core.memory.HybridMemorySegment` | 堆内/堆外内存访问 |
| BinaryExternalSorter | `operators.sort.BinaryExternalSorter` | 托管内存排序 |

**关键要点**：
1. MemorySegment 统一了堆内存和堆外内存的访问
2. MemoryManager 管理所有托管内存，支持按页分配
3. 托管内存用于排序、Hash Join、RocksDB 等
4. 合理配置内存各组件占比是优化的关键

## 参考资料

- [Memory Configuration](https://nightlies.apache.org/flink/flink-docs-stable/docs/deployment/memory/mem_setup/)
- [Memory Tuning](https://nightlies.apache.org/flink/flink-docs-stable/docs/deployment/memory/mem_tuning/)
- [Flink Memory 源码](https://github.com/apache/flink/tree/master/flink-core/src/main/java/org/apache/flink/core/memory)

## 下一章预告

下一章将深入解析 **部署模式**，包括：
- Session 模式
- Per-Job 模式
- Application 模式
- Kubernetes 部署