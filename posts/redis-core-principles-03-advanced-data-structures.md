---
title: "Redis底层原理（三）：核心数据结构实现"
date: "2020-02-01"
excerpt: "深入分析Redis跳跃表、整数集合、压缩列表三大核心数据结构的底层实现，理解Redis在内存效率和查询性能之间的精妙平衡。"
tags: ["Redis", "数据结构", "跳跃表", "压缩列表", "源码分析"]
series:
  slug: "redis-core-principles"
  title: "Redis 底层原理"
  order: 3
---

## 前言

在上一章中，我们分析了 Redis 的基础数据结构。本章将深入探索 Redis 的三种核心数据结构：跳跃表（Skip List）、整数集合（IntSet）和压缩列表（ZipList）。这些数据结构是 Redis 实现有序集合、小规模集合和列表的关键。

## 一、跳跃表（Skip List）

### 1.1 跳跃表简介

跳跃表是一种有序数据结构，通过在每个节点中维持多个指向其他节点的指针，实现快速访问。跳跃表支持平均 O(logN)、最坏 O(N) 的查找复杂度。

Redis 使用跳跃表作为有序集合（ZSET）的底层实现之一，原因如下：

```
┌──────────────────────────────────────────────────────────────┐
│                    为什么 Redis 选择跳跃表                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  对比维度         │  跳跃表          │  平衡树（如红黑树）   │
├───────────────────┼──────────────────┼───────────────────────┤
│ 实现复杂度        │ 简单             │ 复杂                  │
│ 范围查询          │ 高效             │ 需要中序遍历          │
│ 内存占用          │ 相对较高         │ 相对较低              │
│ 插入/删除复杂度   │ O(logN) 平均     │ O(logN)               │
│ 并发友好          │ 是               │ 需要复杂的锁机制      │
│                                                              │
│  Redis 选择跳跃表的原因：                                    │
│  1. 实现简单，易于理解和维护                                 │
│  2. 范围查询效率高（ZRANGE、ZRANK 等操作）                   │
│  3. 内存占用可接受（Redis 已优化）                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 跳跃表结构定义

```c
// server.h - 跳跃表节点
typedef struct zskiplistNode {
    sds ele;                        // 成员对象（Redis 5.0 后改为 SDS）
    double score;                   // 分值
    struct zskiplistNode *backward; // 后退指针
    struct zskiplistLevel {
        struct zskiplistNode *forward;  // 前进指针
        unsigned long span;              // 跨度（用于计算排名）
    } level[];                      // 层
} zskiplistNode;

// 跳跃表
typedef struct zskiplist {
    struct zskiplistNode *header, *tail;  // 头尾节点
    unsigned long length;                   // 节点数量
    int level;                              // 最大层数
} zskiplist;
```

### 1.3 跳跃表结构示意图

```
┌──────────────────────────────────────────────────────────────┐
│                    跳跃表结构示意图                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  header（头节点，不存储实际数据）                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ L4 │─────────────────────────────────────────────────┼──►│ NULL
│  │ L3 │───────────────────────┬─────────────────────────┼──►│ NULL
│  │ L2 │──────────┬────────────┼───────────┬─────────────┼──►│ NULL
│  │ L1 │────┬─────┼────┬───────┼─────┬─────┼──────┬──────┼──►│ NULL
│  │ L0 │────┼─────┼────┼───────┼─────┼─────┼──────┼──────┼──►│ NULL
│  └────┴─────┴────┴────┴───────┴─────┴─────┴──────┴──────┘    │
│        │     │    │        │     │     │      │             │
│        ▼     ▼    ▼        ▼     ▼     ▼      ▼             │
│       ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│       │score=1 │ │score=3 │ │score=5 │ │score=7 │           │
│       │ele="a" │ │ele="b" │ │ele="c" │ │ele="d" │           │
│       │back───►│ │back───►│ │back───►│ │back───►│ NULL      │
│       └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                              │
│  说明：                                                      │
│  • 每个节点随机生成 1-32 层                                  │
│  • 层越高，节点越稀疏                                        │
│  • span 记录跨度，用于计算排名                               │
│  • backward 指针用于从尾到头遍历                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.4 跳跃表核心操作

#### 1.4.1 创建跳跃表

```c
// t_zset.c
zskiplist *zslCreate(void) {
    int j;
    zskiplist *zsl;
    
    zsl = zmalloc(sizeof(*zsl));
    zsl->level = 1;
    zsl->length = 0;
    zsl->header = zslCreateNode(ZSKIPLIST_MAXLEVEL, 0, NULL);
    
    // 初始化头节点的每一层
    for (j = 0; j < ZSKIPLIST_MAXLEVEL; j++) {
        zsl->header->level[j].forward = NULL;
        zsl->header->level[j].span = 0;
    }
    zsl->header->backward = NULL;
    zsl->tail = NULL;
    
    return zsl;
}

// 创建节点
zskiplistNode *zslCreateNode(int level, double score, sds ele) {
    zskiplistNode *zn = zmalloc(sizeof(*zn) + level * sizeof(struct zskiplistLevel));
    zn->score = score;
    zn->ele = ele;
    return zn;
}
```

#### 1.4.2 随机层数生成

Redis 使用幂次定律（power law）生成随机层数：

```c
// t_zset.c
#define ZSKIPLIST_P 0.25      // 晋升概率
#define ZSKIPLIST_MAXLEVEL 32  // 最大层数

int zslRandomLevel(void) {
    int level = 1;
    // 随机数小于 ZSKIPLIST_P * 0xFFFF 时晋升
    while ((random() & 0xFFFF) < (ZSKIPLIST_P * 0xFFFF))
        level += 1;
    return (level < ZSKIPLIST_MAXLEVEL) ? level : ZSKIPLIST_MAXLEVEL;
}
```

层数概率分布：

```
┌──────────────────────────────────────────────────────────────┐
│                    跳跃表层数概率分布                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  层数  │ 概率              │ 说明                            │
├────────┼───────────────────┼─────────────────────────────────┤
│  1     │ 75%               │ 基础层，所有节点都有             │
│  2     │ 18.75%            │ 75% * 25%                       │
│  3     │ 4.69%             │ 75% * 25% * 25%                 │
│  4     │ 1.17%             │ ...                             │
│  5     │ 0.29%             │ ...                             │
│  ...   │ ...               │ 逐层递减                        │
│  32    │ 极低              │ 理论最大层数                    │
│                                                              │
│  晋升概率 P = 0.25 意味着：                                  │
│  • 约 1/4 的节点有第 2 层                                    │
│  • 约 1/16 的节点有第 3 层                                   │
│  • 平均每个节点有 1/(1-0.25) = 1.33 个指针                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 1.4.3 插入节点

```c
// t_zset.c - 简化的插入逻辑
zskiplistNode *zslInsert(zskiplist *zsl, double score, sds ele) {
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL];  // 记录每层的前驱节点
    unsigned int rank[ZSKIPLIST_MAXLEVEL];       // 记录排名
    zskiplistNode *x;
    int i, level;
    
    x = zsl->header;
    
    // 从最高层向下查找插入位置
    for (i = zsl->level - 1; i >= 0; i--) {
        rank[i] = i == (zsl->level - 1) ? 0 : rank[i + 1];
        
        // 沿着当前层前进
        while (x->level[i].forward &&
               (x->level[i].forward->score < score ||
                (x->level[i].forward->score == score &&
                 sdscmp(x->level[i].forward->ele, ele) < 0))) {
            rank[i] += x->level[i].span;
            x = x->level[i].forward;
        }
        update[i] = x;  // 记录前驱节点
    }
    
    // 随机生成层数
    level = zslRandomLevel();
    
    // 如果新节点层数大于当前最大层数
    if (level > zsl->level) {
        for (i = zsl->level; i < level; i++) {
            rank[i] = 0;
            update[i] = zsl->header;
            update[i]->level[i].span = zsl->length;
        }
        zsl->level = level;
    }
    
    // 创建新节点
    x = zslCreateNode(level, score, ele);
    
    // 更新各层指针
    for (i = 0; i < level; i++) {
        x->level[i].forward = update[i]->level[i].forward;
        update[i]->level[i].forward = x;
        
        // 更新跨度
        x->level[i].span = update[i]->level[i].span - (rank[0] - rank[i]);
        update[i]->level[i].span = (rank[0] - rank[i]) + 1;
    }
    
    // 更新更高层的跨度
    for (i = level; i < zsl->level; i++) {
        update[i]->level[i].span++;
    }
    
    // 设置后退指针
    x->backward = (update[0] == zsl->header) ? NULL : update[0];
    if (x->level[0].forward)
        x->level[0].forward->backward = x;
    else
        zsl->tail = x;
    
    zsl->length++;
    return x;
}
```

### 1.5 跳跃表查询效率

```
┌──────────────────────────────────────────────────────────────┐
│                    跳跃表查询过程                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  查找 score=5 的节点                                        │
│                                                              │
│  Level 4: ────────────────────────────────────────────► NULL │
│                                                              │
│  Level 3: ──────────────────┬───────────────────────► NULL   │
│                            ▼                                 │
│  Level 2: ─────────┬───────┼───────┬───────────────► NULL    │
│                    ▼       │       ▼                          │
│  Level 1: ───┬─────┼───────┼───┬───┼───────┬───────► NULL    │
│              ▼     │       │   ▼   │       │                  │
│  Level 0: ───┼─────┼───────┼───┼───┼───────┼───► NULL        │
│              ▼     ▼       ▼   ▼   ▼       ▼                  │
│            [1]   [3]     [5] [5] [5]     [7]                  │
│                          ▲                                   │
│                          │                                   │
│                      找到目标                                │
│                                                              │
│  查找路径：从最高层开始，逐层下降                            │
│  时间复杂度：O(logN)                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 二、整数集合（IntSet）

### 2.1 整数集合简介

整数集合是 Redis 用于保存整数值的集合抽象数据结构，可以保存 int16_t、int32_t、int64_t 类型的整数值，并且保证集合中不出现重复元素。

```
┌──────────────────────────────────────────────────────────────┐
│                    整数集合特点                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ 有序：元素按从小到大排列                                 │
│  ✅ 无重复：自动去重                                         │
│  ✅ 编码升级：根据元素类型自动升级                           │
│  ✅ 内存紧凑：连续内存，无指针开销                           │
│                                                              │
│  应用场景：                                                  │
│  • Set 类型的底层实现之一（元素都是整数且数量较少时）         │
│  • 节省内存                                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 整数集合结构定义

```c
// intset.h
typedef struct intset {
    uint32_t encoding;  // 编码方式：int16、int32、int64
    uint32_t length;    // 元素数量
    int8_t contents[];  // 保存元素的数组（柔性数组）
} intset;

// 编码类型
#define INTSET_ENC_INT16 (sizeof(int16_t))  // 2 字节
#define INTSET_ENC_INT32 (sizeof(int32_t))  // 4 字节
#define INTSET_ENC_INT64 (sizeof(int64_t))  // 8 字节
```

### 2.3 整数集合内存布局

```
┌──────────────────────────────────────────────────────────────┐
│                    整数集合内存布局                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  intset 结构（encoding = INTSET_ENC_INT16）                  │
│  ┌──────────────┬──────────────┬───────────────────────────┐│
│  │ encoding=2   │ length=4     │ contents 数组              ││
│  └──────────────┴──────────────┴───────────────────────────┘│
│                                              │               │
│                                              ▼               │
│  contents 数组（每个元素 2 字节）：                          │
│  ┌────────┬────────┬────────┬────────┐                      │
│  │   1    │   2    │   3    │   5    │                      │
│  │ 2bytes │ 2bytes │ 2bytes │ 2bytes │                      │
│  └────────┴────────┴────────┴────────┘                      │
│    [0]     [1]     [2]     [3]                              │
│                                                              │
│  总内存：4 + 4 + 4 * 2 = 16 字节                             │
│                                                              │
│  如果用传统数组 + 指针：                                     │
│  4 * 8 (指针) + 4 * 2 (值) = 40 字节                         │
│                                                              │
│  内存节省：约 60%                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 编码升级

当添加的新元素类型比现有元素类型更大时，整数集合会进行升级：

```c
// intset.c - 升级并添加元素
static intset *intsetUpgradeAndAdd(intset *is, int64_t value) {
    uint8_t curenc = intrev32ifbe(is->encoding);
    uint8_t newenc = _intsetValueEncoding(value);
    int length = intrev32ifbe(is->length);
    int prepend = value < 0 ? 1 : 0;  // 新元素是负数则插入头部
    
    // 设置新编码
    is->encoding = intrev32ifbe(newenc);
    
    // 重新分配内存
    is = intsetResize(is, intrev32ifbe(is->length) + 1);
    
    // 从后向前移动元素（避免覆盖）
    while (length--)
        _intsetSet(is, length + prepend, 
                   _intsetGetEncoded(is, length, curenc));
    
    // 添加新元素
    if (prepend)
        _intsetSet(is, 0, value);
    else
        _intsetSet(is, intrev32ifbe(is->length), value);
    
    is->length = intrev32ifbe(intrev32ifbe(is->length) + 1);
    return is;
}
```

升级过程示意图：

```
┌──────────────────────────────────────────────────────────────┐
│                    整数集合升级过程                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  初始状态：encoding = INT16, 元素 [1, 2, 3]                  │
│  ┌────┬────┬───────────────────────┐                        │
│  │ 16 │ 3  │  1  │  2  │  3  │                              │
│  └────┴────┴───────────────────────┘                        │
│   编码  长度  2字节 2字节 2字节                               │
│                                                              │
│  添加元素：65535 (超过 INT16 范围，需要升级到 INT32)         │
│                                                              │
│  Step 1: 扩容（每个元素从 2 字节变成 4 字节）                │
│  ┌────┬────┬─────────────────────────────────────────┐      │
│  │ 32 │ 4  │    │    │    │    │    │    │    │      │      │
│  └────┴────┴─────────────────────────────────────────┘      │
│                                                              │
│  Step 2: 从后往前移动元素                                    │
│  ┌────┬────┬──────────┬──────────┬──────────┬──────────┐    │
│  │ 32 │ 4  │    1     │    2     │    3     │  65535   │    │
│  └────┴────┴──────────┴──────────┴──────────┴──────────┘    │
│   编码  长度   4字节      4字节      4字节      4字节         │
│                                                              │
│  升级特点：                                                  │
│  • 升级后不会降级（节省内存，避免频繁调整）                  │
│  • 升级是 O(N) 操作，但实际元素数量较少，影响不大            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.5 整数集合操作

#### 2.5.1 添加元素

```c
// intset.c
intset *intsetAdd(intset *is, int64_t value, uint8_t *success) {
    uint8_t valenc = _intsetValueEncoding(value);
    uint32_t pos;
    
    if (success) *success = 1;
    
    // 需要升级编码
    if (valenc > intrev32ifbe(is->encoding)) {
        return intsetUpgradeAndAdd(is, value);
    }
    
    // 查找插入位置（二分查找）
    if (intsetSearch(is, value, &pos)) {
        if (success) *success = 0;  // 元素已存在
        return is;
    }
    
    // 扩容并插入
    is = intsetResize(is, intrev32ifbe(is->length) + 1);
    if (pos < intrev32ifbe(is->length)) {
        // 移动元素腾出空间
        memmove(((int8_t*)is->contents) + (pos + 1) * intrev32ifbe(is->encoding),
                ((int8_t*)is->contents) + pos * intrev32ifbe(is->encoding),
                (intrev32ifbe(is->length) - pos) * intrev32ifbe(is->encoding));
    }
    
    _intsetSet(is, pos, value);
    is->length = intrev32ifbe(intrev32ifbe(is->length) + 1);
    return is;
}
```

#### 2.5.2 二分查找

```c
// intset.c
static uint8_t intsetSearch(intset *is, int64_t value, uint32_t *pos) {
    int min = 0, max = intrev32ifbe(is->length) - 1, mid = -1;
    int64_t cur = -1;
    
    // 空集合
    if (intrev32ifbe(is->length) == 0) {
        if (pos) *pos = 0;
        return 0;
    }
    
    // 检查边界
    if (value > _intsetGet(is, max)) {
        if (pos) *pos = intrev32ifbe(is->length);
        return 0;
    }
    if (value < _intsetGet(is, 0)) {
        if (pos) *pos = 0;
        return 0;
    }
    
    // 二分查找
    while (max >= min) {
        mid = ((unsigned int)min + (unsigned int)max) >> 1;
        cur = _intsetGet(is, mid);
        if (value > cur) {
            min = mid + 1;
        } else if (value < cur) {
            max = mid - 1;
        } else {
            break;
        }
    }
    
    if (value == cur) {
        if (pos) *pos = mid;
        return 1;
    } else {
        if (pos) *pos = min;
        return 0;
    }
}
```

### 2.6 整数集合操作时间复杂度

| 操作 | 时间复杂度 | 说明 |
|------|------------|------|
| 查找 | O(logN) | 二分查找 |
| 插入 | O(N) | 可能需要移动元素或升级 |
| 删除 | O(N) | 需要移动元素 |

## 三、压缩列表（ZipList）

### 3.1 压缩列表简介

压缩列表是 Redis 为了节约内存而开发的，由一系列特殊编码的连续内存块组成的顺序型数据结构。一个压缩列表可以包含任意多个节点，每个节点可以保存一个字节数组或一个整数值。

```
┌──────────────────────────────────────────────────────────────┐
│                    压缩列表特点                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ 内存紧凑：连续内存，无指针开销                           │
│  ✅ 双向遍历：每个节点记录前一节点长度                       │
│  ✅ 多种编码：根据数据类型和大小选择最优编码                 │
│  ❌ 连锁更新：中间节点长度变化可能引发连续更新               │
│                                                              │
│  应用场景：                                                  │
│  • List 类型的底层实现之一（元素较少时）                     │
│  • Hash 类型的底层实现（字段和值都较小时）                   │
│  • ZSET 的底层实现（元素较少时）                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 压缩列表结构定义

```c
// 压缩列表没有显式的结构体定义，而是通过字节序列来组织
// 整体结构：
// zlbytes | zltail | zllen | entries | zlend

/*
 * zlbytes: 4 字节，整个压缩列表占用的字节数
 * zltail:  4 字节，尾节点偏移量
 * zllen:   2 字节，节点数量（超过 65535 需要遍历统计）
 * entries: 节点列表
 * zlend:   1 字节，0xFF，结束标记
 */
```

### 3.3 压缩列表内存布局

```
┌──────────────────────────────────────────────────────────────┐
│                    压缩列表内存布局                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┬─────────┬─────────┬──────────┬─────────┐       │
│  │ zlbytes │ zltail  │ zllen   │ entries  │  zlend  │       │
│  │ 4 bytes │ 4 bytes │ 2 bytes │  ...     │ 1 byte  │       │
│  └─────────┴─────────┴─────────┴──────────┴─────────┘       │
│                                        │                     │
│                                        ▼                     │
│  entries 区域（节点列表）：                                  │
│  ┌──────────────────┬──────────────────┬──────────────────┐ │
│  │    entry 1       │    entry 2       │    entry 3       │ │
│  │ "hello"          │   100            │   "world"        │ │
│  └──────────────────┴──────────────────┴──────────────────┘ │
│                                                              │
│  示例：存储 ["hello", 100, "world"]                         │
│  总内存：4 + 4 + 2 + (1+1+5) + (1+2) + (1+1+5) + 1 = 23 字节 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 压缩列表节点结构

每个压缩列表节点由三部分组成：

```c
/*
 * 节点结构：
 * +----------------+----------------+----------------+
 * | previous_entry |   encoding     |     content    |
 * |     length     |                |                |
 * +----------------+----------------+----------------+
 */

// previous_entry_length: 记录前一节点的长度，用于从后向前遍历
//    - 如果前一节点长度 < 254 字节，占用 1 字节
//    - 如果前一节点长度 >= 254 字节，占用 5 字节（第一字节为 0xFE）

// encoding: 记录当前节点的数据类型和长度
//    - 字节数组编码：
//      00xxxxxx: 长度 < 64 字节，6 位存储长度
//      01xxxxxx xxxxxxxx: 长度 < 16384 字节，14 位存储长度
//      10xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx: 更长数组
//    - 整数编码：
//      11000000: int16_t (2 字节)
//      11010000: int32_t (4 字节)
//      11100000: int64_t (8 字节)
//      11110000: 24 位有符号整数
//      11111110: 8 位有符号整数
//      1111xxxx: 4 位无符号整数（0-12），xxxx 存储值
```

节点编码示意图：

```
┌──────────────────────────────────────────────────────────────┐
│                    压缩列表节点编码                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  字节数组编码：                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 00xxxxxx    │ 长度 0-63 的字节数组                       ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 01xxxxxx xxxxxxxx │ 长度 0-16383 的字节数组             ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  整数编码：                                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 11000000 │ int16_t (2 字节整数)                         ││
│  │ 11010000 │ int32_t (4 字节整数)                         ││
│  │ 11100000 │ int64_t (8 字节整数)                         ││
│  │ 11110000 │ 24 位有符号整数                               ││
│  │ 11111110 │ 8 位有符号整数                                ││
│  │ 1111xxxx │ 4 位无符号整数 (0-12)，xxxx 直接存储值        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.5 连锁更新问题

压缩列表的 `previous_entry_length` 字段可能导致连锁更新：

```
┌──────────────────────────────────────────────────────────────┐
│                    连锁更新问题                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  初始状态：多个连续节点，每个长度约 250 字节                 │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ e1      │ │ e2      │ │ e3      │ │ e4      │            │
│  │ 250字节 │ │ 250字节 │ │ 250字节 │ │ 250字节 │            │
│  │ prev=1  │ │ prev=1  │ │ prev=1  │ │ prev=1  │            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                                              │
│  在 e1 前插入一个大节点（长度 300 字节）：                   │
│                                                              │
│  Step 1: e1 的 prev 从 1 字节变成 5 字节                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ new     │ │ e1      │ │ e2      │ │ e3      │            │
│  │ 300字节 │ │ 250+4   │ │ 250字节 │ │ 250字节 │            │
│  │ prev=1  │ │ prev=5! │ │ prev=1  │ │ prev=1  │            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                         │                                    │
│                         ▼                                    │
│  Step 2: e1 长度变长，e2 的 prev 也要从 1 变成 5 字节        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ new     │ │ e1      │ │ e2      │ │ e3      │            │
│  │ 300字节 │ │ 254字节 │ │ 250+4   │ │ 250字节 │            │
│  │ prev=1  │ │ prev=5  │ │ prev=5! │ │ prev=1  │            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                   │                          │
│                                   ▼                          │
│  Step 3: 连锁更新继续...                                     │
│                                                              │
│  最坏情况：O(N²) 的时间复杂度                                │
│  实际情况：概率很低，Redis 认为可接受                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.6 压缩列表操作

#### 3.6.1 创建压缩列表

```c
// ziplist.c
unsigned char *ziplistNew(void) {
    unsigned int bytes = ZIPLIST_HEADER_SIZE + ZIPLIST_END_SIZE;
    unsigned char *zl = zmalloc(bytes);
    
    // 设置各字段
    ZIPLIST_BYTES(zl) = intrev32ifbe(bytes);
    ZIPLIST_TAIL_OFFSET(zl) = intrev32ifbe(ZIPLIST_HEADER_SIZE);
    ZIPLIST_LENGTH(zl) = 0;
    
    // 设置结束标记
    zl[bytes - 1] = ZIP_END;
    
    return zl;
}
```

#### 3.6.2 插入元素

```c
// ziplist.c - 简化的插入逻辑
unsigned char *ziplistInsert(unsigned char *zl, unsigned char *p, 
                             unsigned char *s, unsigned int slen) {
    size_t curlen = intrev32ifbe(ZIPLIST_BYTES(zl));
    unsigned int prevlensize, prevlen;
    unsigned int reqlen;
    unsigned char encoding = 0;
    
    // 获取前一节点长度
    zipPrevLenByteDiff(p, &prevlensize, &prevlen);
    
    // 计算需要的空间
    if (slen == 0 || s == NULL) {
        // 整数
        reqlen = zipTryEncoding(s, slen, &encoding);
    } else {
        // 字节数组
        reqlen = slen;
    }
    reqlen += zipStorePrevEntryLength(NULL, prevlen);
    reqlen += zipStoreEntryEncoding(NULL, encoding, slen);
    
    // 检查是否需要连锁更新
    int forcelarge = 0;
    unsigned int newprevlen = reqlen;
    unsigned char *next = p + reqlen;
    
    // 重新分配内存并插入
    zl = ziplistResize(zl, curlen + reqlen);
    memmove(p + reqlen, p, curlen - (p - zl));
    
    // 写入新节点
    p += zipStorePrevEntryLength(p, prevlen);
    p += zipStoreEntryEncoding(p, encoding, slen);
    if (s != NULL) {
        memcpy(p, s, slen);
    }
    
    // 更新后继节点的 prevlen
    // ... 连锁更新处理
    
    ZIPLIST_INCR_LENGTH(zl, 1);
    return zl;
}
```

### 3.7 ListPack（压缩列表的改进版）

Redis 7.0 引入了 ListPack 来替代 ZipList，解决了连锁更新问题：

```
┌──────────────────────────────────────────────────────────────┐
│                    ListPack vs ZipList                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ZipList 节点结构：                                          │
│  ┌────────────────┬──────────┬───────────┐                  │
│  │ prev_node_len  │ encoding │  content  │                  │
│  └────────────────┴──────────┴───────────┘                  │
│         ↑                                                    │
│   记录前一节点长度 → 连锁更新的根源                          │
│                                                              │
│  ListPack 节点结构：                                         │
│  ┌──────────┬───────────┬───────────────┐                   │
│  │ encoding │  content  │ backlen       │                   │
│  └──────────┴───────────┴───────────────┘                   │
│                              ↑                               │
│                   记录当前节点长度（用于回溯）               │
│                                                              │
│  优势：                                                      │
│  • 消除了连锁更新问题                                        │
│  • 节点独立，修改不影响其他节点                              │
│  • 内存效率更高                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 四、数据结构对比总结

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 核心数据结构对比                     │
├───────────────┬──────────────┬───────────────┬───────────────┤
│ 数据结构      │ 时间复杂度   │ 内存效率      │ 应用场景      │
├───────────────┼──────────────┼───────────────┼───────────────┤
│ 跳跃表        │ O(logN)      │ 中等          │ ZSET          │
│ 整数集合      │ O(logN)~O(N) │ 高            │ SET（小整数） │
│ 压缩列表      │ O(N)         │ 极高          │ 小规模数据    │
│ ListPack      │ O(N)         │ 极高          │ 替代压缩列表  │
└───────────────┴──────────────┴───────────────┴───────────────┘
```

## 五、总结

本章深入分析了 Redis 三种核心数据结构：

| 数据结构 | 核心特点 | 时间复杂度 | 主要用途 |
|----------|----------|------------|----------|
| 跳跃表 | 多层索引、随机层数 | O(logN) | 有序集合 |
| 整数集合 | 编码升级、二分查找 | O(logN)~O(N) | 小整数集合 |
| 压缩列表 | 内存紧凑、连锁更新 | O(N) | 小规模数据存储 |

这些数据结构体现了 Redis 在内存效率和查询性能之间的精妙平衡。下一章将深入分析 Redis 的对象系统。

## 参考资料

- [Redis Source Code - server.h](https://github.com/redis/redis/blob/unstable/src/server.h)
- [Redis Source Code - intset.h](https://github.com/redis/redis/blob/unstable/src/intset.h)
- [Redis Source Code - ziplist.c](https://github.com/redis/redis/blob/unstable/src/ziplist.c)
- [Redis Source Code - listpack.c](https://github.com/redis/redis/blob/unstable/src/listpack.c)
- 《Redis设计与实现》- 黄健宏
