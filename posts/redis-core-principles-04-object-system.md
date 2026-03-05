---
title: "Redis底层原理（四）：对象系统与类型系统"
date: "2024-03-13"
excerpt: "深入理解Redis的对象系统设计，掌握五种核心对象类型及其底层编码转换机制，理解Redis如何通过编码优化实现内存与性能的平衡。"
tags: ["Redis", "对象系统", "类型编码", "内存优化", "源码分析"]
series:
  slug: "redis-core-principles"
  title: "Redis 底层原理"
  order: 4
---

## 前言

在前三章中，我们详细分析了 Redis 的各种底层数据结构。然而，Redis 并没有直接暴露这些数据结构给用户使用，而是构建了一个对象系统，通过对象来封装底层数据结构。本章将深入分析 Redis 的对象系统设计，理解类型与编码的关系，以及 Redis 如何通过编码转换实现内存与性能的平衡。

## 一、Redis 对象系统概述

### 1.1 为什么需要对象系统？

```
┌──────────────────────────────────────────────────────────────┐
│                    对象系统的设计目标                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 统一接口                                                 │
│     ┌─────────────────────────────────────────────────────┐ │
│     │  用户命令: SET key value                            │ │
│     │     ↓                                               │ │
│     │  对象系统: 根据内容自动选择最优底层数据结构          │ │
│     │     ↓                                               │ │
│     │  底层实现: SDS / ZipList / Dict / ...              │ │
│     └─────────────────────────────────────────────────────┘ │
│                                                              │
│  2. 类型安全                                                 │
│     • 类型检查：确保命令与类型匹配                           │
│     • 多态：同一命令支持不同类型                             │
│                                                              │
│  3. 内存优化                                                 │
│     • 编码转换：根据数据特征自动选择最优编码                 │
│     • 内存共享：小整数对象共享                               │
│                                                              │
│  4. 生命周期管理                                             │
│     • 引用计数：自动内存回收                                 │
│     • LRU/LFU：支持内存淘汰策略                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Redis 对象结构

```c
// server.h - Redis 对象结构
typedef struct redisObject {
    unsigned type:4;        // 类型（4 bits）
    unsigned encoding:4;    // 编码（4 bits）
    unsigned lru:LRU_BITS;  // LRU 时间或 LFU 数据（24 bits）
    int refcount;           // 引用计数
    void *ptr;              // 指向底层实现数据结构的指针
} robj;

// 类型定义
#define OBJ_STRING 0     // 字符串对象
#define OBJ_LIST 1       // 列表对象
#define OBJ_SET 2        // 集合对象
#define OBJ_ZSET 3       // 有序集合对象
#define OBJ_HASH 4       // 哈希对象
#define OBJ_MODULE 5     // 模块对象
#define OBJ_STREAM 6     // 流对象

// 编码定义（部分）
#define OBJ_ENCODING_RAW 0        // SDS
#define OBJ_ENCODING_INT 1        // 整数
#define OBJ_ENCODING_HT 2         // 字典
#define OBJ_ENCODING_ZIPMAP 3     // 压缩字典（已废弃）
#define OBJ_ENCODING_LINKEDLIST 4 // 链表（已废弃）
#define OBJ_ENCODING_ZIPLIST 5    // 压缩列表
#define OBJ_ENCODING_INTSET 6     // 整数集合
#define OBJ_ENCODING_SKIPLIST 7   // 跳跃表 + 字典
#define OBJ_ENCODING_EMBSTR 8     // 嵌入式 SDS
#define OBJ_ENCODING_QUICKLIST 9  // 快速列表
#define OBJ_ENCODING_STREAM 10    // 流
#define OBJ_ENCODING_LISTPACK 11  // ListPack（替代 ZipList）
```

### 1.3 对象内存布局

```
┌──────────────────────────────────────────────────────────────┐
│                    redisObject 内存布局                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  64 位系统下的 redisObject（共 16 字节）：                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ type (4b) │ encoding (4b) │      lru (24b)            │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │                 refcount (32b)                         │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │                   ptr (64b)                            │ │
│  └────────────────────────────────────────────────────────┘ │
│      4 bytes         4 bytes        8 bytes                  │
│                                                              │
│  示例：一个 String 对象存储 "hello"                         │
│                                                              │
│  redisObject            SDS                  实际数据        │
│  ┌──────────┐         ┌──────────┐        ┌─────────┐       │
│  │type=0    │         │ len=5    │        │ h e l l o│       │
│  │encoding=0│ ──────► │ alloc=5  │ ─────► │         │       │
│  │lru=...   │         │ flags    │        │         │       │
│  │refcount=1│         └──────────┘        └─────────┘       │
│  │ptr ──────│                                              │
│  └──────────┘                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 二、字符串对象（String）

### 2.1 字符串对象编码

字符串对象有三种编码方式：

```
┌──────────────────────────────────────────────────────────────┐
│                    字符串对象编码选择                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      字符串对象                          ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│           ┌───────────────┼───────────────┐                 │
│           ▼               ▼               ▼                 │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│     │   INT    │    │  EMBSTR  │    │   RAW    │           │
│     │ 整数值   │    │ 短字符串 │    │ 长字符串 │           │
│     └──────────┘    └──────────┘    └──────────┘           │
│           │               │               │                 │
│     条件：          条件：           条件：                  │
│     可解析为        长度 <= 44      长度 > 44               │
│     long 类型       字节的字符串     字节的字符串           │
│                                                              │
│  编码转换：                                                  │
│  INT ←→ EMBSTR/Raw (根据值变化自动转换)                     │
│  EMBSTR → RAW (EMBSTR 是只读的，修改后变 RAW)               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 INT 编码

当字符串可以表示为整数时，直接存储整数值：

```c
// object.c
#define OBJ_SHARED_INTEGERS 10000  // 共享整数范围 0-9999

robj *createStringObjectFromLongLong(long long value) {
    robj *o;
    
    // 在共享范围内，直接返回共享对象
    if (value >= 0 && value < OBJ_SHARED_INTEGERS) {
        incrRefCount(shared.integers[value]);
        return shared.integers[value];
    } else {
        // 超出共享范围，创建新对象
        if (value >= LONG_MIN && value <= LONG_MAX) {
            o = createObject(OBJ_STRING, NULL);
            o->encoding = OBJ_ENCODING_INT;
            o->ptr = (void*)((long)value);
        } else {
            o = createObject(OBJ_STRING, sdsfromlonglong(value));
        }
    }
    return o;
}
```

```
┌──────────────────────────────────────────────────────────────┐
│                    整数对象共享机制                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Redis 启动时预创建 10000 个整数对象（0-9999）：             │
│                                                              │
│  shared.integers 数组：                                      │
│  ┌─────┬─────┬─────┬─────┬─────────┬────────┐               │
│  │  0  │  1  │  2  │  3  │  ...    │  9999  │               │
│  └─────┴─────┴─────┴─────┴─────────┴────────┘               │
│                                                              │
│  优势：                                                      │
│  • 避免重复创建常用整数对象                                  │
│  • 节省内存（多个引用共享同一对象）                          │
│  • 提高性能（无需分配内存）                                  │
│                                                              │
│  示例：                                                      │
│  SET counter 100  → 返回 shared.integers[100]               │
│  INCR counter     → 直接修改共享对象？不！会复制一份          │
│                                                              │
│  注意：共享对象是只读的，修改时会创建新对象                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 EMBSTR 编码

EMBSTR（Embedded String）是一种优化短字符串存储的编码：

```c
// EMBSTR 与 RAW 的区别

// RAW 编码：redisObject 和 SDS 分开分配
// ┌─────────────┐      ┌─────────────┐
// │ redisObject │ ───► │     SDS     │
// └─────────────┘      └─────────────┘
//  16 bytes              9+ bytes

// EMBSTR 编码：redisObject 和 SDS 一起分配
// ┌─────────────┬─────────────┐
// │ redisObject │     SDS     │
// └─────────────┴─────────────┘
//    16 bytes      9+ bytes

// object.c
#define OBJ_ENCODING_EMBSTR_SIZE_LIMIT 44

robj *createEmbeddedStringObject(const char *ptr, size_t len) {
    // 一次性分配 redisObject + SDS
    robj *o = zmalloc(sizeof(robj) + sizeof(struct sdshdr8) + len + 1);
    struct sdshdr8 *sh = (void*)(o + 1);
    
    o->type = OBJ_STRING;
    o->encoding = OBJ_ENCODING_EMBSTR;
    o->ptr = sh->buf;
    o->refcount = 1;
    
    sh->len = len;
    sh->alloc = len;
    sh->flags = SDS_TYPE_8;
    
    if (ptr == SDS_NOINIT) {
        sh->buf[len] = '\0';
    } else if (ptr) {
        memcpy(sh->buf, ptr, len);
        sh->buf[len] = '\0';
    } else {
        memset(sh->buf, 0, len + 1);
    }
    
    return o;
}
```

### 2.4 编码转换

```c
// object.c - 尝试优化字符串编码
robj *tryObjectEncoding(robj *o) {
    long value;
    sds s = o->ptr;
    size_t len;
    
    // 检查是否可以编码为整数
    if (o->encoding == OBJ_ENCODING_RAW || o->encoding == OBJ_ENCODING_EMBSTR) {
        if (string2l(s, sdslen(s), &value)) {
            // 可以编码为整数
            if (value >= 0 && value < OBJ_SHARED_INTEGERS) {
                // 使用共享整数对象
                decrRefCount(o);
                incrRefCount(shared.integers[value]);
                return shared.integers[value];
            } else {
                // 创建新的整数对象
                if (o->encoding == OBJ_ENCODING_RAW) {
                    sdsfree(s);
                }
                o->encoding = OBJ_ENCODING_INT;
                o->ptr = (void*)value;
                return o;
            }
        }
    }
    return o;
}
```

## 三、列表对象（List）

### 3.1 列表对象编码

```
┌──────────────────────────────────────────────────────────────┐
│                    列表对象编码演进                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Redis 3.2 之前：                                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 元素少：ZipList  ←─────────────────────→ Linked List    ││
│  │ 元素多：Linked List                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Redis 3.2+（当前）：                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   QuickList（快速列表）                  ││
│  │  ┌───────────┐   ┌───────────┐   ┌───────────┐         ││
│  │  │ ZipList 1 │◄─►│ ZipList 2 │◄─►│ ZipList 3 │         ││
│  │  └───────────┘   └───────────┘   └───────────┘         ││
│  │       ↓               ↓               ↓                 ││
│  │   双向链表连接，每个节点是一个 ZipList                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Redis 7.0+：                                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              QuickList + ListPack 组合                   ││
│  │  ListPack 替代 ZipList，解决连锁更新问题                 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 QuickList 结构

```c
// quicklist.h
typedef struct quicklistNode {
    struct quicklistNode *prev;     // 前驱节点
    struct quicklistNode *next;     // 后继节点
    unsigned char *zl;              // 指向 ZipList 或 ListPack
    unsigned int sz;                // ZipList/ListPack 大小
    unsigned int count : 16;        // 元素数量
    unsigned int encoding : 2;      // 编码方式
    unsigned int container : 2;     // 容器类型
    unsigned int recompress : 1;    // 是否需要重新压缩
    unsigned int attempted_compress : 1;
    unsigned int extra : 10;        // 预留字段
} quicklistNode;

typedef struct quicklist {
    quicklistNode *head;            // 头节点
    quicklistNode *tail;            // 尾节点
    unsigned long count;            // 总元素数量
    unsigned long len;              // quicklistNode 数量
    int fill : QL_FILL_BITS;        // 每个 ZipList 的填充因子
    unsigned int compress : QL_COMP_BITS; // 压缩深度
    unsigned int bookmark_count : QL_BM_BITS;
    quicklistBookmark bookmarks[];
} quicklist;
```

### 3.3 QuickList 内存布局

```
┌──────────────────────────────────────────────────────────────┐
│                    QuickList 结构示意图                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  quicklist                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ head ────►│◄──── tail │ count=10 │ len=3               ││
│  └─────────────────────────────────────────────────────────┘│
│       │                                                      │
│       ▼                                                      │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐           │
│  │ prev=NULL │    │   prev    │    │   prev    │           │
│  │ next ─────────►│  next ─────────►│ next=NULL │           │
│  │ zl ───────│    │ zl ───────│    │ zl ───────│           │
│  │ count=3   │    │ count=4   │    │ count=3   │           │
│  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘           │
│        │                │                │                   │
│        ▼                ▼                ▼                   │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐           │
│  │ [a,b,c]   │    │ [d,e,f,g] │    │ [h,i,j]   │           │
│  │ ZipList   │    │ ZipList   │    │ ZipList   │           │
│  └───────────┘    └───────────┘    └───────────┘           │
│                                                              │
│  优势：                                                      │
│  • 结合了链表和 ZipList 的优点                               │
│  • 中间节点可以压缩，节省内存                                │
│  • 两头节点不压缩，保证两端操作效率                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 列表配置参数

```bash
# redis.conf

# 每个 ZipList 的最大大小
# -5: 64 KB
# -4: 32 KB
# -3: 16 KB
# -2: 8 KB（默认）
# -1: 4 KB
list-max-ziplist-size -2

# 压缩深度
# 0: 不压缩
# 1: 保留首尾各 1 个节点不压缩（默认）
# 2: 保留首尾各 2 个节点不压缩
list-compress-depth 1
```

## 四、集合对象（Set）

### 4.1 集合对象编码

```
┌──────────────────────────────────────────────────────────────┐
│                    集合对象编码选择                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      集合对象                            ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│           ┌───────────────┴───────────────┐                 │
│           ▼                               ▼                 │
│     ┌──────────┐                    ┌──────────┐           │
│     │  INTSET  │                    │    HT    │           │
│     │ 整数集合 │                    │   字典   │           │
│     └──────────┘                    └──────────┘           │
│                                                              │
│  使用 INTSET 的条件：                                        │
│  1. 所有元素都是整数值                                      │
│  2. 元素数量 <= set-max-intset-entries（默认 512）          │
│                                                              │
│  转换为 HT 的触发条件：                                      │
│  1. 添加非整数元素                                          │
│  2. 元素数量超过配置阈值                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 编码转换示例

```c
// t_set.c - 添加元素时检查编码转换
int setTypeAdd(robj *subject, sds value) {
    long long llval;
    
    if (subject->encoding == OBJ_ENCODING_HT) {
        // 字典编码，直接添加
        dict *ht = subject->ptr;
        dictEntry *de = dictAddRaw(ht, value, NULL);
        if (de) {
            dictSetKey(ht, de, sdsdup(value));
            dictSetVal(ht, de, NULL);
            return 1;
        }
    } else if (subject->encoding == OBJ_ENCODING_INTSET) {
        // 整数集合编码
        if (isSdsRepresentableAsLongLong(value, &llval) == C_OK) {
            uint8_t success;
            subject->ptr = intsetAdd(subject->ptr, llval, &success);
            if (success) {
                // 检查是否需要转换为字典
                if (intsetLen(subject->ptr) > server.set_max_intset_entries)
                    setTypeConvert(subject, OBJ_ENCODING_HT);
                return 1;
            }
        } else {
            // 非整数，需要转换为字典
            setTypeConvert(subject, OBJ_ENCODING_HT);
            return setTypeAdd(subject, value);  // 重新添加
        }
    }
    return 0;
}
```

### 4.3 集合操作复杂度

| 操作 | INTSET | HT |
|------|--------|-----|
| SADD | O(N) | O(1) |
| SISMEMBER | O(logN) | O(1) |
| SREM | O(N) | O(1) |
| SCARD | O(1) | O(1) |
| SMEMBERS | O(N) | O(N) |

## 五、有序集合对象（ZSet）

### 5.1 有序集合对象编码

```
┌──────────────────────────────────────────────────────────────┐
│                    有序集合对象编码选择                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    有序集合对象                          ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│           ┌───────────────┴───────────────┐                 │
│           ▼                               ▼                 │
│     ┌──────────┐                    ┌──────────┐           │
│     │ ZIPLIST  │                    │ SKIPLIST │           │
│     │ 压缩列表 │                    │跳跃表+字典│           │
│     └──────────┘                    └──────────┘           │
│                                                              │
│  使用 ZIPLIST 的条件：                                       │
│  1. 元素数量 <= zset-max-ziplist-entries（默认 128）        │
│  2. 所有元素长度 <= zset-max-ziplist-value（默认 64 字节）  │
│                                                              │
│  SKIPLIST 编码结构：                                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              zset 结构                                 │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │  *dict     │  *zsl                               │  │ │
│  │  └─────┬─────┴──────┬──────────────────────────────┘  │ │
│  │        │            │                                  │ │
│  │        ▼            ▼                                  │ │
│  │   ┌─────────┐  ┌─────────┐                            │ │
│  │   │  字典   │  │ 跳跃表  │                            │ │
│  │   │ member  │  │ score   │                            │ │
│  │   │ →score  │  │ order   │                            │ │
│  │   └─────────┘  └─────────┘                            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 SKIPLIST 编码结构

```c
// server.h
typedef struct zset {
    dict *dict;      // 字典：member -> score
    zskiplist *zsl;  // 跳跃表：按 score 排序
} zset;
```

为什么需要同时维护字典和跳跃表？

```
┌──────────────────────────────────────────────────────────────┐
│                ZSet 双重结构的原因                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              zset（有序集合）                            ││
│  │                                                         ││
│  │   dict（字典）              zsl（跳跃表）                ││
│  │   ┌─────────────┐          ┌─────────────┐             ││
│  │   │ "a" → 1.0   │          │ 1.0 → "a"   │             ││
│  │   │ "b" → 2.0   │          │ 2.0 → "b"   │             ││
│  │   │ "c" → 3.0   │          │ 3.0 → "c"   │             ││
│  │   └─────────────┘          └─────────────┘             ││
│  │         │                          │                    ││
│  │         ▼                          ▼                    ││
│  │   O(1) 成员查询               O(logN) 范围查询          ││
│  │   ZSCORE                      ZRANGE, ZRANK            ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  优势：                                                      │
│  • 字典：O(1) 查找成员分数（ZSCORE 命令）                    │
│  • 跳跃表：O(logN) 范围查询（ZRANGE、ZRANK 命令）            │
│  • 两者共享元素对象，内存开销可接受                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Ziplist 编码布局

```
┌──────────────────────────────────────────────────────────────┐
│                ZSet 的 ZipList 编码                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ZipList 中按 score 排序存储元素：                           │
│                                                              │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┬──────┐│
│  │ member1 │ score1  │ member2 │ score2  │ member3 │score3││
│  │  "a"    │  1.0    │  "b"    │  2.0    │  "c"    │ 3.0  ││
│  └─────────┴─────────┴─────────┴─────────┴─────────┴──────┘│
│                                                              │
│  特点：                                                      │
│  • 元素按 score 从小到大排列                                 │
│  • member 和 score 成对出现                                  │
│  • 新增元素需要移动后续所有元素                              │
│  • 适合小规模数据                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 六、哈希对象（Hash）

### 6.1 哈希对象编码

```
┌──────────────────────────────────────────────────────────────┐
│                    哈希对象编码选择                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      哈希对象                            ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│           ┌───────────────┴───────────────┐                 │
│           ▼                               ▼                 │
│     ┌──────────┐                    ┌──────────┐           │
│     │ ZIPLIST  │                    │    HT    │           │
│     │ 压缩列表 │                    │   字典   │           │
│     └──────────┘                    └──────────┘           │
│                                                              │
│  使用 ZIPLIST 的条件：                                       │
│  1. 字段数量 <= hash-max-ziplist-entries（默认 512）        │
│  2. 字段名和值长度 <= hash-max-ziplist-value（默认 64 字节）│
│                                                              │
│  Redis 7.0+ 使用 ListPack 替代 ZipList                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Hash 的 ZipList 编码

```
┌──────────────────────────────────────────────────────────────┐
│                    Hash 的 ZipList 编码                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  存储：HSET user name "张三" age 25 city "北京"             │
│                                                              │
│  ZipList 布局：                                              │
│  ┌────────┬────────┬────────┬────────┬────────┬────────┐   │
│  │  name  │  张三  │   age  │   25   │  city  │  北京  │   │
│  └────────┴────────┴────────┴────────┴────────┴────────┘   │
│    field    value   field    value   field    value        │
│                                                              │
│  特点：                                                      │
│  • field-value 成对存储                                      │
│  • 新字段追加到末尾                                          │
│  • 查找需要遍历                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 配置参数

```bash
# redis.conf

# Hash 对象 ZipList 阈值
hash-max-ziplist-entries 512
hash-max-ziplist-value 64

# Set 对象 IntSet 阈值
set-max-intset-entries 512

# ZSet 对象 ZipList 阈值
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
```

## 七、对象共享与引用计数

### 7.1 引用计数机制

```c
// server.h
typedef struct redisObject {
    // ...
    int refcount;  // 引用计数
    // ...
} robj;

// object.c
void incrRefCount(robj *o) {
    if (o->refcount != OBJ_SHARED_REFCOUNT) {
        o->refcount++;
    }
}

void decrRefCount(robj *o) {
    if (o->refcount == 1) {
        // 引用计数为 1，释放对象
        switch(o->type) {
            case OBJ_STRING: freeStringObject(o); break;
            case OBJ_LIST: freeListObject(o); break;
            case OBJ_SET: freeSetObject(o); break;
            case OBJ_ZSET: freeZsetObject(o); break;
            case OBJ_HASH: freeHashObject(o); break;
            // ...
        }
        zfree(o);
    } else {
        o->refcount--;
    }
}
```

### 7.2 对象共享

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 对象共享机制                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Redis 启动时预创建的共享对象：                              │
│                                                              │
│  1. 整数对象（0-9999）                                       │
│     shared.integers[0] ~ shared.integers[9999]              │
│                                                              │
│  2. 常用字符串对象                                           │
│     shared.crlf      = "\r\n"                               │
│     shared.ok        = "+OK\r\n"                            │
│     shared.err       = "-ERR"                               │
│     shared.emptybulk = "$0\r\n\r\n"                         │
│     shared.nullbulk  = "$-1\r\n"                            │
│     shared.nullarray = "*-1\r\n"                            │
│     shared.emptyarray = "*0\r\n"                            │
│     shared.pong      = "+PONG\r\n"                          │
│     shared.queued    = "+QUEUED\r\n"                        │
│                                                              │
│  3. 小整数范围可配置                                         │
│     # redis.conf                                            │
│     activerehashing yes                                     │
│     动态调整共享对象范围（用于内存优化）                      │
│                                                              │
│  优势：                                                      │
│  • 避免重复创建常用对象                                      │
│  • 节省内存                                                  │
│  • 提高响应速度                                              │
│                                                              │
│  限制：                                                      │
│  • 共享对象是只读的                                          │
│  • 修改时会创建新对象                                        │
│  • Redis 7.0+ 不再共享复杂对象（只共享小整数）               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 八、对象类型检查与多态

### 8.1 类型检查

```c
// Redis 命令执行前的类型检查
int checkType(client *c, robj *o, int type) {
    if (o->type != type) {
        addReplyErrorObject(c, shared.wrongtypeerr);
        return 1;
    }
    return 0;
}

// 示例：LPUSH 命令的类型检查
void lpushCommand(client *c) {
    robj *o = lookupKeyWrite(c->db, c->argv[1]);
    
    if (o != NULL && checkType(c, o, OBJ_LIST)) {
        return;  // 类型错误，返回
    }
    
    // 执行 LPUSH 逻辑...
}
```

### 8.2 多态命令

```c
// t_set.c - SCARD 命令的多态实现
void scardCommand(client *c) {
    robj *set;
    
    if ((set = lookupKeyReadOrReply(c, c->argv[1], shared.null[c->resp])) == NULL ||
        checkType(c, set, OBJ_SET))
        return;
    
    // 根据编码选择不同的实现
    if (set->encoding == OBJ_ENCODING_HT) {
        addReplyLongLong(c, dictSize((dict*)set->ptr));
    } else if (set->encoding == OBJ_ENCODING_INTSET) {
        addReplyLongLong(c, intsetLen((intset*)set->ptr));
    } else {
        serverPanic("Unknown set encoding");
    }
}
```

## 九、编码转换总结

```
┌──────────────────────────────────────────────────────────────┐
│                    编码转换触发条件总结                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  String:                                                     │
│  INT ←→ EMBSTR/Raw（根据值是否可解析为整数）                 │
│  EMBSTR → RAW（修改 EMBSTR 对象时）                          │
│                                                              │
│  List:                                                       │
│  统一使用 QuickList，内部自动管理 ZipList/ListPack           │
│                                                              │
│  Set:                                                        │
│  INTSET → HT（元素数量超限或添加非整数元素）                  │
│                                                              │
│  ZSet:                                                       │
│  ZIPLIST → SKIPLIST（元素数量或元素长度超限）                │
│                                                              │
│  Hash:                                                       │
│  ZIPLIST → HT（字段数量或字段长度超限）                       │
│                                                              │
│  注意：                                                      │
│  • 编码转换是单向的（小 → 大）                               │
│  • 转换后不会自动转回                                        │
│  • 转换是渐进式的，不阻塞服务                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 十、总结

本章深入分析了 Redis 的对象系统：

| 对象类型 | 可用编码 | 编码转换条件 |
|----------|----------|--------------|
| String | INT、EMBSTR、RAW | 值类型和长度 |
| List | QuickList | - |
| Set | INTSET、HT | 元素类型和数量 |
| ZSet | ZIPLIST、SKIPLIST | 元素数量和长度 |
| Hash | ZIPLIST、HT | 字段数量和长度 |

理解对象系统对于 Redis 调优至关重要，合理配置编码转换阈值可以在内存使用和性能之间取得平衡。

下一章将深入分析 Redis 的持久化机制。

## 参考资料

- [Redis Source Code - server.h](https://github.com/redis/redis/blob/unstable/src/server.h)
- [Redis Source Code - object.c](https://github.com/redis/redis/blob/unstable/src/object.c)
- [Redis Source Code - quicklist.h](https://github.com/redis/redis/blob/unstable/src/quicklist.h)
- 《Redis设计与实现》- 黄健宏
