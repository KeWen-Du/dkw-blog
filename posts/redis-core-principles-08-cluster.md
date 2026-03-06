---
title: "Redis底层原理（八）：集群原理"
date: "2020-03-24"
excerpt: "深入理解Redis Cluster的数据分片、节点通信、故障检测与自动故障转移机制，掌握分布式Redis架构的核心原理。"
tags: ["Redis", "集群", "数据分片", "分布式", "高可用"]
series:
  slug: "redis-core-principles"
  title: "Redis 底层原理"
  order: 8
---

## 前言

Redis Cluster 是 Redis 的分布式解决方案，支持数据自动分片、自动故障转移和在线扩容。相比哨兵模式，Cluster 提供了更高的写入能力和更大的数据容量。本章将深入分析 Redis Cluster 的核心原理。

## 一、集群概述

### 1.1 集群架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis Cluster 架构                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  客户端请求                                                  │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    16384 个槽位                         ││
│  │  ┌─────────┬─────────┬─────────┬─────────┬─────────┐   ││
│  │  │ 0-5460  │ 5461-   │ 10923-  │ ...     │ 16383   │   ││
│  │  │         │ 10922   │ 16383   │         │         │   ││
│  │  └────┬────┴────┬────┴────┬────┴─────────┴─────────┘   ││
│  └───────┼─────────┼─────────┼─────────────────────────────┘│
│          │         │         │                               │
│          ▼         ▼         ▼                               │
│     ┌─────────┐ ┌─────────┐ ┌─────────┐                     │
│     │ Master1 │ │ Master2 │ │ Master3 │                     │
│     │ (Node1) │ │ (Node2) │ │ (Node3) │                     │
│     └────┬────┘ └────┬────┘ └────┬────┘                     │
│          │           │           │                           │
│     ┌────┴────┐ ┌────┴────┐ ┌────┴────┐                     │
│     │ Slave1  │ │ Slave2  │ │ Slave3  │                     │
│     └─────────┘ └─────────┘ └─────────┘                     │
│                                                              │
│  特点：                                                      │
│  • 无中心架构，所有节点互联                                  │
│  • 数据按槽位分散存储                                        │
│  • 支持主从复制和自动故障转移                                │
│  • 最少需要 3 个主节点                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 集群特点

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis Cluster 特点                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  优势：                                                      │
│  ✅ 水平扩展：支持海量数据存储                               │
│  ✅ 高写入能力：多主节点并行写入                             │
│  ✅ 高可用：自动故障转移                                     │
│  ✅ 无中心：去中心化架构                                     │
│  ✅ 在线扩容：支持动态添加/删除节点                          │
│                                                              │
│  限制：                                                      │
│  ❌ 不支持多键操作（跨槽位）                                 │
│  ❌ 不支持多键事务                                           │
│  ❌ Lua 脚本需限制在单槽位                                   │
│  ❌ 数据迁移时性能下降                                       │
│                                                              │
│  适用场景：                                                  │
│  • 数据量超过单机内存                                        │
│  • 需要高写入吞吐                                            │
│  • 需要高可用                                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 二、数据分片

### 2.1 槽位分配

Redis Cluster 使用哈希槽（Hash Slot）进行数据分片：

```c
// cluster.c
#define CLUSTER_SLOTS 16384  // 总槽位数

// 键的槽位计算
unsigned int keyHashSlot(char *key, int keylen) {
    int s, e;  // start, end
    
    // 查找 {} 标记
    for (s = 0; s < keylen; s++)
        if (key[s] == '{') break;
    
    if (s == keylen) {
        // 没有 {} 标记，对整个 key 哈希
        return crc16(key, keylen) & 0x3FFF;
    }
    
    for (e = s + 1; e < keylen; e++)
        if (key[e] == '}') break;
    
    if (e == keylen || e == s + 1) {
        // {} 为空或只有一个字符，对整个 key 哈希
        return crc16(key, keylen) & 0x3FFF;
    }
    
    // 对 {} 内的内容哈希
    return crc16(key + s + 1, e - s - 1) & 0x3FFF;
}
```

### 2.2 槽位分配示例

```
┌──────────────────────────────────────────────────────────────┐
│                    槽位分配示例                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  16384 个槽位分配给 3 个主节点：                             │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Node1           │  Node2           │  Node3           ││
│  │  Slot 0-5460     │  Slot 5461-10922 │  Slot 10923-16383││
│  │  5461 个槽       │  5462 个槽       │  5461 个槽       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  键的槽位计算：                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  key = "user:1001"                                      ││
│  │  slot = CRC16("user:1001") % 16384                      ││
│  │        = 6872                                           ││
│  │  → 路由到 Node2                                         ││
│  │                                                         ││
│  │  key = "{user:1001}:profile"                            ││
│  │  slot = CRC16("user:1001") % 16384                      ││
│  │        = 6872                                           ││
│  │  → 使用 {} 内的内容计算槽位                             ││
│  │  → 保证相关键在同一个槽位                               ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  哈希标签（Hash Tag）：                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 通过 {} 指定计算槽位的部分：                             ││
│  │                                                         ││
│  │ {user:1001}:profile  → 使用 user:1001 计算              ││
│  │ {user:1001}:settings → 使用 user:1001 计算              ││
│  │ {user:1001}:orders   → 使用 user:1001 计算              ││
│  │                                                         ││
│  │ 这些键会在同一个槽位，支持多键操作                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 三、集群节点结构

### 3.1 节点数据结构

```c
// cluster.h
typedef struct clusterNode {
    mstime_t ctime;             // 节点创建时间
    char name[CLUSTER_NAMELEN]; // 节点名称（40 字节的 hex）
    int flags;                  // 节点标志
    uint64_t configEpoch;       // 配置纪元
    unsigned char slots[CLUSTER_SLOTS/8]; // 槽位位图
    sds slots_info;             // 槽位信息字符串
    int numslots;               // 负责的槽位数量
    int numslaves;              // 从节点数量
    struct clusterNode **slaves;// 从节点数组
    struct clusterNode *slaveof;// 所属主节点
    mstime_t ping_sent;         // 最后发送 PING 时间
    mstime_t pong_received;     // 最后收到 PONG 时间
    mstime_t fail_time;         // 下线时间
    mstime_t voted_time;        // 投票时间
    char ip[NET_IP_STR_LEN];    // IP 地址
    int port;                   // 端口
    int cport;                  // 集群端口
    connection *link;           // 连接
    list *fail_reports;         // 下线报告
} clusterNode;

// 集群状态
typedef struct clusterState {
    clusterNode *myself;        // 当前节点
    uint64_t currentEpoch;      // 当前纪元
    int state;                  // 集群状态
    int size;                   // 主节点数量
    dict *nodes;                // 节点字典
    dict *nodes_black_list;     // 黑名单
    clusterNode *migrating_slots_to[CLUSTER_SLOTS];  // 迁出槽位
    clusterNode *importing_slots_from[CLUSTER_SLOTS]; // 导入槽位
    clusterNode *slots[CLUSTER_SLOTS]; // 槽位到节点的映射
    zskiplist *slots_to_keys;   // 槽位到键的映射
} clusterState;
```

### 3.2 节点标志

```c
// cluster.h
#define CLUSTER_NODE_MASTER 1     // 主节点
#define CLUSTER_NODE_SLAVE 2      // 从节点
#define CLUSTER_NODE_PFAIL 4      // 主观下线
#define CLUSTER_NODE_FAIL 8       // 客观下线
#define CLUSTER_NODE_MYSELF 16    // 当前节点
#define CLUSTER_NODE_HANDSHAKE 32 // 握手状态
#define CLUSTER_NODE_NOADDR 64    // 无地址
#define CLUSTER_NODE_MEET 128     // MEET 状态
#define CLUSTER_NODE_MIGRATE_TO 256 // 迁移目标
```

## 四、节点通信

### 4.1 Gossip 协议

Redis Cluster 使用 Gossip 协议进行节点间通信：

```
┌──────────────────────────────────────────────────────────────┐
│                    Gossip 协议原理                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  消息类型：                                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ MEET    │ 请求加入集群                                   ││
│  │ PING    │ 心跳检测                                       ││
│  │ PONG    │ 响应消息                                       ││
│  │ FAIL    │ 故障通知                                       ││
│  │ PUBLISH │ 发布消息                                       ││
│  │ UPDATE  │ 配置更新                                       ││
│  │ MFSTART │ 手动故障转移开始                               ││
│  │ MODULE  │ 模块消息                                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Gossip 工作流程：                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  节点 A ──PING──► 节点 B（随机选择几个节点）            ││
│  │            │                                            ││
│  │            ├── 携带部分节点信息（Gossip 部分）          ││
│  │            │   • 随机选择的节点                         ││
│  │            │   • 状态信息                               ││
│  │            │                                            ││
│  │  节点 B ◄──PONG── 节点 A                                ││
│  │            │                                            ││
│  │            └── 更新节点状态信息                         ││
│  │                                                         ││
│  │  最终效果：所有节点状态趋于一致                         ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 消息结构

```c
// cluster.h
typedef struct {
    char nodename[CLUSTER_NAMELEN]; // 节点名称
    uint32_t ping_sent;             // PING 发送时间
    uint32_t pong_received;         // PONG 接收时间
    char ip[NET_IP_STR_LEN];        // IP 地址
    uint16_t port;                  // 端口
    uint16_t cport;                 // 集群端口
    uint16_t flags;                 // 标志
    uint32_t notused1;              // 未使用
} clusterMsgDataGossip;

typedef struct {
    uint16_t count;                 // 槽位数量
    uint8_t slots[CLUSTER_SLOTS/8]; // 槽位位图
} clusterMsgDataUpdate;

// 消息头
typedef struct {
    uint32_t totlen;        // 消息总长度
    uint16_t type;          // 消息类型
    uint16_t count;         // Gossip 节点数量
    uint64_t currentEpoch;  // 当前纪元
    uint64_t configEpoch;   // 配置纪元
    uint64_t offset;        // 复制偏移量
    char sender[CLUSTER_NAMELEN]; // 发送者名称
    char myip[NET_IP_STR_LEN];    // 发送者 IP
    uint16_t myport;        // 发送者端口
    uint16_t cport;         // 集群端口
    uint16_t flags;         // 发送者标志
    unsigned char state;    // 集群状态
    unsigned char mflags[3];// 消息标志
    union {
        clusterMsgDataGossip gossip[1];
        clusterMsgDataUpdate update;
    } data;
} clusterMsg;
```

### 4.3 心跳机制

```c
// cluster.c
void clusterSendPing(clusterLink *link, int type) {
    unsigned char *buf;
    clusterMsg *hdr;
    int gossipcount = 0;
    
    // 分配消息缓冲区
    buf = zmalloc(sizeof(clusterMsg));
    hdr = (clusterMsg*) buf;
    
    // 填充消息头
    hdr->type = htons(type);
    hdr->currentEpoch = htonu64(server.cluster->currentEpoch);
    hdr->configEpoch = htonu64(server.cluster->myself->configEpoch);
    memcpy(hdr->sender, server.cluster->myself->name, CLUSTER_NAMELEN);
    
    // 选择 Gossip 节点
    int freshnodes = dictSize(server.cluster->nodes) - 2;
    int wanted = floor(dictSize(server.cluster->nodes) / 10);
    if (wanted < 3) wanted = 3;
    if (wanted > freshnodes) wanted = freshnodes;
    
    // 填充 Gossip 数据
    dictIterator *di = dictGetRandomKeys(server.cluster->nodes, wanted);
    dictEntry *de;
    while ((de = dictNext(di)) != NULL && gossipcount < wanted) {
        clusterNode *node = dictGetVal(de);
        if (node->flags & (CLUSTER_NODE_MYSELF | CLUSTER_NODE_HANDSHAKE))
            continue;
        
        clusterMsgDataGossip *gossip = &hdr->data.gossip[gossipcount];
        memcpy(gossip->nodename, node->name, CLUSTER_NAMELEN);
        gossip->ping_sent = htonl(node->ping_sent / 1000);
        gossip->pong_received = htonl(node->pong_received / 1000);
        memcpy(gossip->ip, node->ip, sizeof(gossip->ip));
        gossip->port = htons(node->port);
        gossip->cport = htons(node->cport);
        gossip->flags = htons(node->flags);
        gossipcount++;
    }
    dictReleaseIterator(di);
    
    hdr->count = htons(gossipcount);
    hdr->totlen = htonl(sizeof(clusterMsg) - sizeof(clusterMsgData) +
                        gossipcount * sizeof(clusterMsgDataGossip));
    
    // 发送消息
    clusterSendMessage(link, buf, ntohl(hdr->totlen));
    zfree(buf);
}
```

## 五、故障检测与转移

### 5.1 故障检测

```
┌──────────────────────────────────────────────────────────────┐
│                    集群故障检测流程                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 主观下线（PFAIL）                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  节点 A 定期向节点 B 发送 PING                          ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  超过 cluster-node-timeout 未收到响应                   ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  节点 A 标记节点 B 为 PFAIL                             ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  2. 客观下线（FAIL）                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  节点 A 在 Gossip 消息中传播节点 B 的 PFAIL 状态        ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  多数主节点（超过半数）标记节点 B 为 PFAIL               ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  节点 A 标记节点 B 为 FAIL                              ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  向集群广播 FAIL 消息                                   ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  3. 故障转移                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  从节点发现主节点下线                                   ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  发起故障转移请求                                       ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  其他主节点投票                                         ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  获得多数票的从节点升级为主节点                         ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 故障转移实现

```c
// cluster.c
void clusterHandleSlaveFailover(void) {
    mstime_t data_age;
    mstime_t auth_age;
    mstime_t auth_timeout;
    mstime_t auth_retry_time;
    mstime_t now = mstime();
    int needed_quorum;
    int j;
    clusterNode *master = server.cluster->myself->slaveof;
    
    // 检查是否可以进行故障转移
    if (server.cluster->myself->flags & CLUSTER_NODE_MASTER) return;
    if (master == NULL) return;
    if (!(master->flags & CLUSTER_NODE_FAIL)) return;
    if (server.cluster->state != CLUSTER_OK) return;
    
    // 计算数据年龄
    data_age = now - server.repl_down_since;
    if (data_age > server.repl_ping_slave_period * 1000)
        data_age -= server.repl_ping_slave_period * 1000;
    
    // 检查数据是否足够新
    if (data_age > server.cluster_node_timeout) {
        serverLog(LL_WARNING, "Data too old for failover");
        return;
    }
    
    // 发起故障转移
    server.cluster->failover_auth_time = now;
    server.cluster->failover_auth_count = 0;
    server.cluster->failover_auth_sent = 0;
    server.cluster->failover_auth_rank = 0;
    server.cluster->failover_auth_epoch = 0;
    
    // 广播故障转移请求
    clusterRequestFailoverAuth();
}

// 发送故障转移请求
void clusterRequestFailoverAuth(void) {
    clusterMsg *hdr;
    
    // 增加纪元
    server.cluster->currentEpoch++;
    server.cluster->failover_auth_epoch = server.cluster->currentEpoch;
    
    // 发送消息
    hdr = createClusterMessage(CLUSTERMSG_TYPE_FAILOVER_AUTH_REQUEST);
    if (hdr) {
        clusterBroadcastMessage(hdr);
        zfree(hdr);
    }
}

// 处理故障转移投票
void clusterSendFailoverAuthIfNeeded(clusterNode *node, clusterMsg *request) {
    // 检查是否已经投过票
    if (server.cluster->lastVoteEpoch == request->currentEpoch) {
        return;
    }
    
    // 检查主节点是否下线
    if (!(node->flags & CLUSTER_NODE_FAIL)) {
        return;
    }
    
    // 检查从节点数据是否足够新
    if (request->slave_offset < node->repl_offset) {
        return;
    }
    
    // 投票
    server.cluster->lastVoteEpoch = request->currentEpoch;
    
    // 发送投票响应
    clusterSendFailoverAuth(node);
}
```

## 六、数据迁移

### 6.1 槽位迁移

```
┌──────────────────────────────────────────────────────────────┐
│                    槽位迁移流程                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  目标：将 Slot 1000 从 Node A 迁移到 Node B                  │
│                                                              │
│  Step 1: 设置迁移状态                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Node A: CLUSTER SETSLOT 1000 IMPORTING Node B           ││
│  │ Node B: CLUSTER SETSLOT 1000 MIGRATING Node A           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Step 2: 迁移数据                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │ while (keys in slot 1000) {                             ││
│  │     // 从源节点获取键                                   ││
│  │     keys = CLUSTER GETKEYSINSLOT 1000 count             ││
│  │                                                         ││
│  │     for key in keys:                                    ││
│  │         // 迁移单个键                                   ││
│  │         MIGRATE NodeB_ip NodeB_port key 0 timeout       ││
│  │ }                                                       ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Step 3: 更新槽位归属                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Node A: CLUSTER SETSLOT 1000 NODE Node B                ││
│  │ Node B: CLUSTER SETSLOT 1000 NODE Node B                ││
│  │                                                         ││
│  │ // 通知其他节点                                         ││
│  │ 广播槽位变更消息                                        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  迁移期间的请求处理：                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │ 客户端请求 Slot 1000 的键                               ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │ Node A 检查迁移状态                                     ││
│  │      │                                                  ││
│  │      ├─ 键仍存在 → 正常处理                             ││
│  │      │                                                  ││
│  │      └─ 键已迁移 → 返回 ASK 重定向                      ││
│  │                  -ASK Node B_ip:Node B_port             ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 重定向机制

```c
// cluster.c
int getNodeByQuery(client *c, struct redisCommand *cmd, robj **argv, int argc, int *hashslot, int *ask) {
    struct redisCommand *realcmd;
    int slot = 0;
    clusterNode *n = NULL;
    
    // 计算槽位
    slot = keyHashSlot(argv[1]->ptr, sdslen(argv[1]->ptr));
    if (hashslot) *hashslot = slot;
    
    // 获取负责该槽位的节点
    n = server.cluster->slots[slot];
    
    // 检查是否在迁移中
    if (n != server.cluster->myself) {
        // MOVED 重定向
        if (!server.cluster->migrating_slots_to[slot]) {
            addReplySds(c, sdscatprintf(sdsempty(),
                "-MOVED %d %s:%d\r\n",
                slot, n->ip, n->port));
            return NULL;
        }
    }
    
    // 检查是否在导入中
    if (server.cluster->importing_slots_from[slot] != NULL) {
        if (ask) *ask = 1;
        return server.cluster->importing_slots_from[slot];
    }
    
    return n;
}
```

### 6.3 MOVED vs ASK

```
┌──────────────────────────────────────────────────────────────┐
│                    MOVED vs ASK 重定向                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  MOVED 重定向：                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  含义：槽位已永久迁移到新节点                           ││
│  │  格式：-MOVED <slot> <ip>:<port>                        ││
│  │  客户端行为：更新本地槽位映射                           ││
│  │                                                         ││
│  │  示例：                                                 ││
│  │  -MOVED 1000 192.168.1.2:6379                          ││
│  │                                                         ││
│  │  触发场景：                                             ││
│  │  • 槽位迁移完成                                         ││
│  │  • 故障转移后主从切换                                   ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ASK 重定向：                                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  含义：槽位正在迁移中，特定键需要到新节点查找           ││
│  │  格式：-ASK <slot> <ip>:<port>                          ││
│  │  客户端行为：仅本次请求发送到新节点                     ││
│  │                                                         ││
│  │  示例：                                                 ││
│  │  -ASK 1000 192.168.1.2:6379                            ││
│  │                                                         ││
│  │  触发场景：                                             ││
│  │  • 槽位迁移进行中                                       ││
│  │  • 键已迁移但槽位未更新                                 ││
│  │                                                         ││
│  │  客户端需要先发送 ASKING 命令：                         ││
│  │  ASKING                                                 ││
│  │  GET key                                                ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 七、集群配置

### 7.1 集群配置文件

```bash
# redis.conf

# 开启集群模式
cluster-enabled yes

# 集群配置文件（自动生成）
cluster-config-file nodes-6379.conf

# 节点超时时间
cluster-node-timeout 15000

# 从节点有效期
cluster-slave-validity-factor 10

# 故障转移后最小从节点数
cluster-migration-barrier 1

# 集群全量覆盖
cluster-require-full-coverage yes

# 集群公告 IP
cluster-announce-ip 192.168.1.1

# 集群端口
cluster-announce-port 6379

# 集群总线端口
cluster-announce-bus-port 16379
```

### 7.2 集群命令

```bash
# 创建集群
redis-cli --cluster create 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 \
           127.0.0.1:7004 127.0.0.1:7005 127.0.0.1:7006 \
           --cluster-replicas 1

# 检查集群状态
redis-cli --cluster check 127.0.0.1:7001

# 添加节点
redis-cli --cluster add-node 127.0.0.1:7007 127.0.0.1:7001

# 删除节点
redis-cli --cluster del-node 127.0.0.1:7001 <node-id>

# 重新分片
redis-cli --cluster reshard 127.0.0.1:7001

# 查看集群信息
redis-cli cluster info

# 查看节点信息
redis-cli cluster nodes
```

## 八、生产环境最佳实践

### 8.1 集群规划

```
┌──────────────────────────────────────────────────────────────┐
│                    集群规划建议                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 节点数量                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 最少：3 主 3 从                                         ││
│  │ 推荐：根据数据量和吞吐量计算                            ││
│  │ 公式：主节点数 = 数据量 / 单节点内存                    ││
│  │       从节点数 = 主节点数（每主一从）                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  2. 内存配置                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 每个节点内存不宜过大：                                  ││
│  │ • 建议 4-16 GB                                         ││
│  │ • 过大会影响故障转移速度                                ││
│  │ • 预留 20-30% 给复制缓冲区                             ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  3. 网络配置                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • 使用万兆网络                                          ││
│  │ • 节点间网络延迟 < 1ms                                  ││
│  │ • 避免跨机房部署                                        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  4. 超时配置                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ cluster-node-timeout: 根据网络延迟设置                  ││
│  │   • 内网环境：15000ms                                   ││
│  │   • 跨机房：30000ms+                                    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 客户端连接

```java
// Jedis 集群客户端示例
Set<HostAndPort> nodes = new HashSet<>();
nodes.add(new HostAndPort("192.168.1.1", 7001));
nodes.add(new HostAndPort("192.168.1.2", 7002));
nodes.add(new HostAndPort("192.168.1.3", 7003));

JedisCluster cluster = new JedisCluster(nodes,
    new JedisPoolConfig());

// 使用哈希标签保证多键操作
cluster.set("{user:1001}:profile", "张三");
cluster.set("{user:1001}:settings", "theme=dark");
cluster.mget("{user:1001}:profile", "{user:1001}:settings");
```

## 九、总结

本章深入分析了 Redis Cluster 的核心原理：

| 特性 | 实现机制 |
|------|----------|
| 数据分片 | 16384 个哈希槽，CRC16 计算 |
| 节点通信 | Gossip 协议，PING/PONG |
| 故障检测 | PFAIL → FAIL 投票机制 |
| 故障转移 | 从节点选举，多数派投票 |
| 数据迁移 | MIGRATE 命令，ASK 重定向 |

下一章将介绍 Redis 生产实践与最佳实践。

## 参考资料

- [Redis Source Code - cluster.h](https://github.com/redis/redis/blob/unstable/src/cluster.h)
- [Redis Source Code - cluster.c](https://github.com/redis/redis/blob/unstable/src/cluster.c)
- [Redis Cluster Specification](https://redis.io/topics/cluster-spec)
- 《Redis设计与实现》- 黄健宏
