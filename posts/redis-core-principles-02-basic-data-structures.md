---
title: "Redis底层原理（二）：基础数据结构实现"
date: "2020-01-23"
excerpt: "深入分析Redis三大基础数据结构——SDS简单动态字符串、链表、字典的底层实现原理，理解Redis高性能的基础。"
tags: ["Redis", "数据结构", "SDS", "字典", "源码分析"]
series:
  slug: "redis-core-principles"
  title: "Redis 底层原理"
  order: 2
---

## 前言

在上一章中，我们从宏观角度了解了 Redis 的整体架构。从本章开始，我们将深入 Redis 的底层实现，首先探索 Redis 的基础数据结构。

Redis 没有直接使用 C 语言原生数据结构，而是针对特定场景自己实现了一套高效的数据结构。本章将详细分析 SDS（简单动态字符串）、链表、字典这三种基础数据结构的设计与实现。

## 一、SDS 简单动态字符串

### 1.1 为什么不用 C 原生字符串？

C 原生字符串存在以下问题：

```
┌──────────────────────────────────────────────────────────────┐
│                    C 字符串的局限性                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 获取长度 O(N)                                            │
│     char* str = "hello world";                               │
│     int len = strlen(str);  // 需要遍历整个字符串             │
│                                                              │
│  2. 二进制不安全                                             │
│     char* str = "hello\0world";  // \0 被当作结束符          │
│     strlen(str);  // 返回 5，而非 11                         │
│                                                              │
│  3. 内存操作不安全                                           │
│     char buf[5];                                             │
│     strcpy(buf, "hello world");  // 缓冲区溢出！             │
│                                                              │
│  4. 修改操作效率低                                           │
│     strcat(str, "append");  // 需要重新分配内存              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 SDS 结构定义

Redis 定义了 SDS（Simple Dynamic String）来解决上述问题：

```c
// sds.h - SDS 结构定义
struct sdshdr {
    int len;        // 已使用长度
    int free;       // 剩余可用长度
    char buf[];     // 柔性数组，存储实际字符串
};
```

实际源码中，Redis 定义了多种 SDS 类型以节省内存：

```c
// sds.h - Redis 5.0+ 的 SDS 类型
typedef char *sds;

// 不同长度的 SDS 类型
struct __attribute__ ((__packed__)) sdshdr5 {
    unsigned char flags;
    char buf[];
};

struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len;        // 已使用长度
    uint8_t alloc;      // 总分配长度
    unsigned char flags; // 低 3 位存储类型
    char buf[];
};

struct __attribute__ ((__packed__)) sdshdr16 {
    uint16_t len;
    uint16_t alloc;
    unsigned char flags;
    char buf[];
};

struct __attribute__ ((__packed__)) sdshdr32 {
    uint32_t len;
    uint32_t alloc;
    unsigned char flags;
    char buf[];
};

struct __attribute__ ((__packed__)) sdshdr64 {
    uint64_t len;
    uint64_t alloc;
    unsigned char flags;
    char buf[];
};

// 类型标识
#define SDS_TYPE_5  0
#define SDS_TYPE_8  1
#define SDS_TYPE_16 2
#define SDS_TYPE_32 3
#define SDS_TYPE_64 4
```

### 1.3 SDS 内存布局

```
┌──────────────────────────────────────────────────────────────┐
│                    SDS 内存布局示意图                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  创建字符串 "Redis"                                          │
│                                                              │
│  ┌────────┬────────┬───────┬─────────────────────────────┐  │
│  │ len=5  │alloc=5 │flags │ R │ e │ d │ i │ s │ \0       │  │
│  └────────┴────────┴───────┴─────────────────────────────┘  │
│                                                              │
│  追加字符串 "Cluster" 后                                     │
│                                                              │
│  ┌────────┬────────┬───────┬────────────────────────────────┐│
│  │len=12  │alloc=20│flags │ R │ e │ d │ i │ s │ C │ l │... ││
│  └────────┴────────┴───────┴────────────────────────────────┘│
│                               ↑                               │
│                        预留空间（free=8）                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.4 SDS 核心操作

#### 1.4.1 创建 SDS

```c
// sds.c
sds sdsnewlen(const void *init, size_t initlen) {
    void *sh;
    sds s;
    char type = sdsReqType(initlen);  // 根据长度选择类型
    
    // 计算需要的头部大小
    int hdrlen = sdsHdrSize(type);
    unsigned char *fp;  // flags 指针
    
    // 分配内存
    sh = s_malloc(hdrlen + initlen + 1);  // +1 是为了 \0
    if (!init)
        memset(sh, 0, hdrlen + initlen + 1);
    
    s = (char*)sh + hdrlen;
    fp = ((unsigned char*)s) - 1;  // flags 在 buf 前面
    
    // 设置各字段
    switch(type) {
        case SDS_TYPE_8: {
            struct sdshdr8 *sh = (void*)sh;
            sh->len = initlen;
            sh->alloc = initlen;
            sh->flags = type;
            if (initlen && init)
                memcpy(sh->buf, init, initlen);
            sh->buf[initlen] = '\0';
            break;
        }
        // ... 其他类型类似
    }
    return s;
}
```

#### 1.4.2 扩容策略

SDS 的扩容策略是性能优化的关键：

```c
// sds.c
sds sdsMakeRoomFor(sds s, size_t addlen) {
    void *sh, *newsh;
    size_t avail = sdsavail(s);  // 可用空间
    size_t len, newlen;
    char type, oldtype = s[-1] & SDS_TYPE_MASK;
    
    // 空间足够，直接返回
    if (avail >= addlen) return s;
    
    len = sdslen(s);
    newlen = (len + addlen);
    
    // 扩容策略
    if (newlen < SDS_MAX_PREALLOC)
        newlen *= 2;  // 小于 1MB，翻倍
    else
        newlen += SDS_MAX_PREALLOC;  // 大于 1MB，每次增加 1MB
    
    // 重新分配内存
    type = sdsReqType(newlen);
    hdrlen = sdsHdrSize(type);
    
    if (oldtype == type) {
        // 类型没变，直接 realloc
        newsh = s_realloc(sh, hdrlen + newlen + 1);
    } else {
        // 类型变了，需要移动数据
        newsh = s_malloc(hdrlen + newlen + 1);
        memcpy(newsh + hdrlen, s, len + 1);
        s_free(sh);
    }
    
    return newsh;
}
```

扩容策略示意图：

```
┌──────────────────────────────────────────────────────────────┐
│                    SDS 扩容策略                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  当前：len=5, alloc=5, 需要追加 10 字节                      │
│                                                              │
│  Step 1: 计算新长度 = 5 + 10 = 15                            │
│                                                              │
│  Step 2: 判断是否小于 SDS_MAX_PREALLOC (1MB)                 │
│          15 < 1MB → 新长度 = 15 * 2 = 30                     │
│                                                              │
│  Step 3: 分配内存                                            │
│          alloc = 30, free = 30 - 15 = 15                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ len=15 │alloc=30│ R │ e │ d │ i │ s │ ... │  free  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  优势：                                                      │
│  • 空间预分配减少内存重分配次数                              │
│  • 小于 1MB 翻倍增长，快速扩容                               │
│  • 大于 1MB 线性增长，避免浪费                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.5 SDS vs C 字符串对比

| 特性 | C 字符串 | SDS |
|------|----------|-----|
| 获取长度 | O(N) | O(1) |
| 二进制安全 | ❌ | ✅ |
| 缓冲区溢出 | 可能 | 自动扩容 |
| 内存重分配 | 每次都需要 | 预分配策略 |
| 兼容 C 函数 | ✅ | ✅ |

```c
// SDS 兼容 C 字符串函数示例
sds s = sdsnew("Hello World");
printf("%s\n", s);          // 可以直接使用 printf
strcmp(s, "Hello World");   // 可以使用 strcmp
```

## 二、链表

### 2.1 链表结构定义

Redis 的链表是双向链表，定义如下：

```c
// adlist.h - 链表节点
typedef struct listNode {
    struct listNode *prev;  // 前驱节点
    struct listNode *next;  // 后继节点
    void *value;            // 值（void* 可以存储任意类型）
} listNode;

// 链表迭代器
typedef struct listIter {
    listNode *next;         // 下一个节点
    int direction;          // 迭代方向
} listIter;

// 链表结构
typedef struct list {
    listNode *head;         // 头节点
    listNode *tail;         // 尾节点
    
    // 函数指针，实现多态
    void *(*dup)(void *ptr);      // 复制函数
    void (*free)(void *ptr);      // 释放函数
    int (*match)(void *ptr, void *key); // 比较函数
    
    unsigned long len;      // 节点数量
} list;
```

### 2.2 链表内存布局

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 链表结构                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  list 结构                                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ head    │ tail    │ dup │ free │ match │ len=3        │ │
│  └────┬─────┴────┬────┴─────┴──────┴───────┴──────────────┘ │
│       │          │                                          │
│       ▼          ▼                                          │
│  ┌─────────┐                                        ┌─────────┐
│  │ prev=NULL│                                       │ prev    │
│  │ value=1 │◄─────────────────────────────────────►│ value=3 │
│  │ next    │─┐                                  ┌─►│ next=NULL│
│  └─────────┘ │                                  │  └─────────┘
│              │     ┌─────────┐                 │
│              └────►│ prev    │◄────────────────┘
│                    │ value=2 │
│                    │ next    │
│                    └─────────┘
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 链表核心操作

#### 2.3.1 创建链表

```c
// adlist.c
list *listCreate(void) {
    struct list *list;
    
    if ((list = zmalloc(sizeof(*list))) == NULL)
        return NULL;
    
    list->head = list->tail = NULL;
    list->len = 0;
    list->dup = NULL;
    list->free = NULL;
    list->match = NULL;
    
    return list;
}
```

#### 2.3.2 添加节点

```c
// 头插法
list *listAddNodeHead(list *list, void *value) {
    listNode *node;
    
    if ((node = zmalloc(sizeof(*node))) == NULL)
        return NULL;
    
    node->value = value;
    
    if (list->len == 0) {
        list->head = list->tail = node;
        node->prev = node->next = NULL;
    } else {
        node->prev = NULL;
        node->next = list->head;
        list->head->prev = node;
        list->head = node;
    }
    
    list->len++;
    return list;
}

// 尾插法
list *listAddNodeTail(list *list, void *value) {
    listNode *node;
    
    if ((node = zmalloc(sizeof(*node))) == NULL)
        return NULL;
    
    node->value = value;
    
    if (list->len == 0) {
        list->head = list->tail = node;
        node->prev = node->next = NULL;
    } else {
        node->prev = list->tail;
        node->next = NULL;
        list->tail->next = node;
        list->tail = node;
    }
    
    list->len++;
    return list;
}
```

#### 2.3.3 迭代器

```c
// 创建迭代器
listIter *listGetIterator(list *list, int direction) {
    listIter *iter;
    
    if ((iter = zmalloc(sizeof(*iter))) == NULL)
        return NULL;
    
    if (direction == AL_START_HEAD)
        iter->next = list->head;
    else
        iter->next = list->tail;
    
    iter->direction = direction;
    return iter;
}

// 获取下一个节点
listNode *listNext(listIter *iter) {
    listNode *current = iter->next;
    
    if (current != NULL) {
        if (iter->direction == AL_START_HEAD)
            iter->next = current->next;
        else
            iter->next = current->prev;
    }
    
    return current;
}
```

### 2.4 链表特性总结

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 链表特性                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ 双向链表：每个节点有 prev 和 next 指针                    │
│                                                              │
│  ✅ 无环：head.prev = NULL, tail.next = NULL                │
│                                                              │
│  ✅ 带长度计数：len 字段，O(1) 获取长度                      │
│                                                              │
│  ✅ 多态：使用 void* 和函数指针支持任意类型                   │
│                                                              │
│  ✅ 双端操作：head 和 tail 指针，O(1) 头尾操作               │
│                                                              │
│  应用场景：                                                  │
│  • 列表键的底层实现之一                                      │
│  • 发布订阅模式的消息队列                                    │
│  • 慢查询日志                                                │
│  • 监视器                                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 三、字典

### 3.1 字典结构定义

字典是 Redis 最核心的数据结构，用于实现数据库键空间、Hash 类型等。Redis 使用哈希表作为底层实现：

```c
// dict.h - 哈希表节点
typedef struct dictEntry {
    void *key;                  // 键
    union {
        void *val;              // 值（指针）
        uint64_t u64;           // 无符号整数
        int64_t s64;            // 有符号整数
        double d;               // 浮点数
    } v;
    struct dictEntry *next;     // 链地址法解决冲突
} dictEntry;

// 哈希表
typedef struct dictht {
    dictEntry **table;          // 哈希表数组
    unsigned long size;         // 哈希表大小
    unsigned long sizemask;     // 哈希表大小掩码，用于计算索引
    unsigned long used;         // 已有节点数量
} dictht;

// 字典
typedef struct dict {
    dictType *type;             // 类型特定函数
    void *privdata;             // 私有数据
    dictht ht[2];               // 两个哈希表（用于 rehash）
    long rehashidx;             // rehash 索引，-1 表示未进行
    unsigned long iterators;    // 迭代器数量
} dict;

// 字典类型函数
typedef struct dictType {
    uint64_t (*hashFunction)(const void *key);      // 哈希函数
    void *(*keyDup)(void *privdata, const void *key); // 键复制
    void *(*valDup)(void *privdata, const void *obj); // 值复制
    int (*keyCompare)(void *privdata, const void *key1, const void *key2); // 键比较
    void (*keyDestructor)(void *privdata, void *key);   // 键销毁
    void (*valDestructor)(void *privdata, void *obj);   // 值销毁
} dictType;
```

### 3.2 字典内存布局

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 字典结构                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  dict                                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ type │ privdata │    ht[0]    │    ht[1]    │rehashidx ││
│  └───────────────────────────────┴─────────────┴───────────┘│
│                                  │                           │
│                                  ▼                           │
│  dictht ht[0]                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ size=4 │sizemask=3│used=3 │         table               ││
│  └─────────────────────────────────────────────────────────┘│
│                              │                               │
│                              ▼                               │
│  table 数组（大小为 4）                                      │
│  ┌───────┬───────┬───────┬───────┐                         │
│  │ idx=0 │ idx=1 │ idx=2 │ idx=3 │                         │
│  └───┬───┴───┬───┴───┬───┴───────┘                         │
│      │       │       │                                       │
│      ▼       ▼       ▼                                       │
│    NULL    ┌─────┐ ┌─────┐                                   │
│             │ k1  │ │ k3  │                                  │
│             │ v1  │ │ v3  │                                  │
│             │next │ └─────┘                                  │
│             └──┬──┘                                           │
│                ▼                                              │
│             ┌─────┐                                          │
│             │ k2  │  ← 哈希冲突，链地址法                     │
│             │ v2  │                                          │
│             │NULL │                                          │
│             └─────┘                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 哈希函数

Redis 使用 SipHash 算法（从 4.0 开始）作为默认哈希函数，早期版本使用 MurmurHash2：

```c
// dict.c
static uint64_t dictGenHashFunction(const void *key, int len) {
    // 使用 SipHash 防止哈希碰撞攻击
    return siphash(key, len, dict_hash_function_seed);
}

// 计算索引
// index = hash & dict->ht[x].sizemask
```

### 3.4 哈希冲突解决

Redis 使用链地址法解决哈希冲突：

```
┌──────────────────────────────────────────────────────────────┐
│                    链地址法解决冲突                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  插入键值对 (k1, v1), (k2, v2), (k3, v3)                    │
│  假设 k1 和 k2 哈希到同一个索引                              │
│                                                              │
│  Step 1: 计算 k1 的索引 = hash(k1) & sizemask = 1           │
│          在 table[1] 处插入新节点                            │
│                                                              │
│  Step 2: 计算 k2 的索引 = hash(k2) & sizemask = 1           │
│          在 table[1] 处链表头部插入新节点（头插法）           │
│                                                              │
│  Step 3: 计算 k3 的索引 = hash(k3) & sizemask = 2           │
│          在 table[2] 处插入新节点                            │
│                                                              │
│  结果：                                                      │
│  table[0] → NULL                                             │
│  table[1] → [k2,v2] → [k1,v1] → NULL                        │
│  table[2] → [k3,v3] → NULL                                  │
│  table[3] → NULL                                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

```c
// dict.c - 添加键值对
dictEntry *dictAddRaw(dict *d, void *key, dictEntry **existing) {
    long index;
    dictEntry *entry;
    dictht *ht;
    
    // 如果正在 rehash，执行一步 rehash
    if (dictIsRehashing(d)) _dictRehashStep(d);
    
    // 计算索引
    if ((index = _dictKeyIndex(d, key, dictHashKey(d, key), existing)) == -1)
        return NULL;
    
    // 选择哈希表（rehash 时用 ht[1]）
    ht = dictIsRehashing(d) ? &d->ht[1] : &d->ht[0];
    
    // 创建新节点（头插法）
    entry = zmalloc(sizeof(*entry));
    entry->next = ht->table[index];
    ht->table[index] = entry;
    ht->used++;
    
    // 设置键
    dictSetKey(d, entry, key);
    return entry;
}
```

### 3.5 渐进式 Rehash

当哈希表负载因子过高或过低时，需要对哈希表进行扩容或缩容。Redis 采用渐进式 rehash 策略：

```
┌──────────────────────────────────────────────────────────────┐
│                    渐进式 Rehash 过程                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  初始状态：rehashidx = -1                                    │
│  ┌─────────────────────────────────────────┐                │
│  │ ht[0]: size=4, used=4 (负载因子=1.0)    │                │
│  │ ht[1]: 未分配                           │                │
│  └─────────────────────────────────────────┘                │
│                                                              │
│  Step 1: 开始 rehash，为 ht[1] 分配空间                     │
│  ┌─────────────────────────────────────────┐                │
│  │ ht[0]: size=4, used=4                   │                │
│  │ ht[1]: size=8 (原来的 2 倍)             │                │
│  │ rehashidx = 0                           │                │
│  └─────────────────────────────────────────┘                │
│                                                              │
│  Step 2-5: 逐步迁移（每次操作迁移一部分）                    │
│  ┌─────────────────────────────────────────┐                │
│  │ ht[0]: table[0..rehashidx-1] 已迁移     │                │
│  │ ht[1]: 接收迁移的数据                   │                │
│  │ rehashidx 递增                          │                │
│  └─────────────────────────────────────────┘                │
│                                                              │
│  完成状态：rehashidx = -1                                    │
│  ┌─────────────────────────────────────────┐                │
│  │ ht[0]: size=0, used=0 (释放)            │                │
│  │ ht[1]: size=8, used=4                   │                │
│  │ 交换 ht[0] 和 ht[1]                     │                │
│  └─────────────────────────────────────────┘                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

```c
// dict.c - 渐进式 rehash
int dictRehash(dict *d, int n) {
    int empty_visits = n * 10;  // 最大访问空桶数
    
    // 只进行 n 步
    while (n-- && d->ht[0].used != 0) {
        dictEntry *de, *nextde;
        
        // 找到非空桶
        while (d->ht[0].table[d->rehashidx] == NULL) {
            d->rehashidx++;
            if (--empty_visits == 0) return 1;
        }
        
        de = d->ht[0].table[d->rehashidx];
        
        // 迁移该桶所有节点
        while (de) {
            uint64_t h;
            nextde = de->next;
            
            // 计算新索引
            h = dictHashKey(d, de->key) & d->ht[1].sizemask;
            
            // 头插法插入到 ht[1]
            de->next = d->ht[1].table[h];
            d->ht[1].table[h] = de;
            
            d->ht[0].used--;
            d->ht[1].used++;
            de = nextde;
        }
        
        d->ht[0].table[d->rehashidx] = NULL;
        d->rehashidx++;
    }
    
    // 检查是否完成
    if (d->ht[0].used == 0) {
        zfree(d->ht[0].table);
        d->ht[0] = d->ht[1];
        _dictReset(&d->ht[1]);
        d->rehashidx = -1;
        return 0;
    }
    
    return 1;
}

// 每次操作执行一步 rehash
static void _dictRehashStep(dict *d) {
    if (d->iterators == 0) dictRehash(d, 1);
}
```

### 3.6 Rehash 触发条件

```c
// dict.c - 扩容检查
static int _dictExpandIfNeeded(dict *d) {
    // 正在 rehash，直接返回
    if (dictIsRehashing(d)) return DICT_OK;
    
    // 哈希表为空，初始化
    if (d->ht[0].size == 0) return dictExpand(d, DICT_HT_INITIAL_SIZE);
    
    // 负载因子 = used / size
    // 扩容条件：负载因子 >= 1 且 (没有在 bgsave 或 bgrewriteaof 或 负载因子 >= 5)
    if (d->ht[0].used >= d->ht[0].size &&
        (dict_can_resize || d->ht[0].used / d->ht[0].size > dict_force_resize_ratio)) {
        return dictExpand(d, d->ht[0].used * 2);
    }
    
    return DICT_OK;
}
```

Rehash 条件总结：

| 操作 | 条件 | 说明 |
|------|------|------|
| 扩容 | 负载因子 >= 1 且没有 RDB/AOF | 正常扩容 |
| 强制扩容 | 负载因子 >= 5 | 无论是否在 RDB/AOF |
| 缩容 | 负载因子 < 0.1 | 元素少于 10% |

### 3.7 字典操作的时间复杂度

```
┌──────────────────────────────────────────────────────────────┐
│                    字典操作时间复杂度                         │
├────────────────┬─────────────────────────────────────────────┤
│ 操作           │ 时间复杂度                                  │
├────────────────┼─────────────────────────────────────────────┤
│ 添加键值对     │ O(1) 平均，最坏 O(N)                        │
│ 查找键         │ O(1) 平均，最坏 O(N)                        │
│ 删除键         │ O(1) 平均，最坏 O(N)                        │
│ 计算元素数量   │ O(1)                                        │
│ Rehash（单步） │ O(1)                                        │
│ Rehash（完整） │ O(N)                                        │
└────────────────┴─────────────────────────────────────────────┘
```

## 四、数据结构应用场景

### 4.1 SDS 应用

```c
// 1. 字符串键
SET mykey "hello world"
// SDS 存储值

// 2. 键名存储
SET user:1001 "张三"
// "user:1001" 使用 SDS 存储

// 3. 缓冲区
// 客户端查询缓冲区使用 SDS
client->querybuf = sdscatlen(client->querybuf, buf, len);
```

### 4.2 链表应用

```c
// 1. 列表键（早期版本，3.2 后使用 quicklist）
LPUSH mylist a b c

// 2. 发布订阅
// 订阅的频道存储在链表中

// 3. 慢查询日志
// 日志条目存储在链表中

// 4. 监视器
// 监视的键存储在链表中
```

### 4.3 字典应用

```c
// 1. 数据库键空间
// Redis 每个数据库就是一个字典
redisDb->dict = dictCreate(...);

// 2. Hash 键
HSET user:1001 name "张三" age 25
// Hash 类型的底层实现

// 3. 过期时间
redisDb->expires = dictCreate(...);

// 4. 集合
SADD myset a b c
// Set 类型的底层实现之一
```

## 五、总结

本章深入分析了 Redis 三种基础数据结构：

| 数据结构 | 特点 | 时间复杂度 | 应用场景 |
|----------|------|------------|----------|
| SDS | O(1)获取长度、二进制安全、自动扩容 | 操作 O(1) | 字符串键、缓冲区 |
| 链表 | 双向、无环、多态 | 增删查 O(1) | 列表键、消息队列 |
| 字典 | 哈希表、渐进式rehash | 平均 O(1) | 键空间、Hash键 |

下一章将深入分析 Redis 的核心数据结构：跳跃表、整数集合和压缩列表。

## 参考资料

- [Redis Source Code - sds.h](https://github.com/redis/redis/blob/unstable/src/sds.h)
- [Redis Source Code - adlist.h](https://github.com/redis/redis/blob/unstable/src/adlist.h)
- [Redis Source Code - dict.h](https://github.com/redis/redis/blob/unstable/src/dict.h)
- 《Redis设计与实现》- 黄健宏
