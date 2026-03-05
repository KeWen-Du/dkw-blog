---
title: "Redis底层原理（七）：复制与哨兵机制"
date: "2024-03-16"
excerpt: "深入理解Redis的主从复制原理和哨兵机制，掌握数据同步、故障检测、自动故障转移的实现细节，构建高可用Redis架构。"
tags: ["Redis", "主从复制", "哨兵", "高可用", "故障转移"]
series:
  slug: "redis-core-principles"
  title: "Redis 底层原理"
  order: 7
---

## 前言

在实际生产环境中，单点故障是不可接受的风险。Redis 通过主从复制实现数据冗余，通过哨兵机制实现自动故障转移，从而构建高可用架构。本章将深入分析 Redis 的复制与哨兵机制。

## 一、主从复制概述

### 1.1 主从复制的作用

```
┌──────────────────────────────────────────────────────────────┐
│                    主从复制的作用                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     数据冗余                             ││
│  │  多个节点保存相同数据，防止单点数据丢失                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     读写分离                             ││
│  │  主节点负责写操作，从节点负责读操作                      ││
│  │  分担主节点压力，提高读取吞吐量                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     高可用基础                           ││
│  │  为哨兵和集群提供基础                                    ││
│  │  主节点故障时可以切换到从节点                            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  架构示意：                                                  │
│                                                              │
│          客户端写入                 客户端读取               │
│              │                          │                    │
│              ▼                          ▼                    │
│         ┌─────────┐               ┌───────────┐             │
│         │  Master │               │  Slave 1  │             │
│         │ (写入)  │──────────────►│  (读取)   │             │
│         └─────────┘               └───────────┘             │
│              │                          ▲                    │
│              │                          │                    │
│              │        ┌───────────┐     │                    │
│              └───────►│  Slave 2  │─────┘                    │
│                       │  (读取)   │                          │
│                       └───────────┘                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 复制方式演进

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 复制方式演进                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Redis 2.8 之前：SYNC 同步                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • 全量同步：主节点执行 BGSAVE                            ││
│  │ • 从节点断开后重连需要完整同步                           ││
│  │ • 主节点开销大，不适合网络不稳定环境                     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Redis 2.8+：PSYNC 部分重同步                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • 支持部分重同步                                         ││
│  │ • 主节点维护复制积压缓冲区                               ││
│  │ • 短暂断连后只同步差异数据                               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Redis 4.0+：PSYNC2                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • 支持切换主节点后部分重同步                             ││
│  │ • 复制 ID 和偏移量机制                                   ││
│  │ • 哨兵切换后数据不丢失                                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 二、复制原理

### 2.1 复制流程

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 主从复制流程                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: 建立连接                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Slave                      Master                        ││
│  │   │                          │                           ││
│  │   │──── PING ───────────────►│                           ││
│  │   │◄─── PONG ───────────────│                           ││
│  │   │                          │                           ││
│  │   │──── REPLCONF ──────────►│  发送端口、ID等            ││
│  │   │◄─── OK ─────────────────│                           ││
│  │   │                          │                           ││
│  │   │──── PSYNC ? -1 ────────►│  请求同步                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Step 2: 全量同步                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Slave                      Master                        ││
│  │   │                          │                           ││
│  │   │◄─── FULLRESYNC ─────────│  返回 runid + offset      ││
│  │   │                          │                           ││
│  │   │                          │── 执行 BGSAVE            ││
│  │   │                          │                           ││
│  │   │◄─── RDB 数据 ───────────│  发送 RDB 文件            ││
│  │   │                          │                           ││
│  │   │◄─── 积压缓冲区数据 ─────│  发送缓冲区命令           ││
│  │   │                          │                           ││
│  │   │ 加载 RDB 文件           │                           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Step 3: 命令传播                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Slave                      Master                        ││
│  │   │                          │                           ││
│  │   │◄─── 写命令 ─────────────│  持续传播写命令           ││
│  │   │◄─── 写命令 ─────────────│                           ││
│  │   │◄─── 写命令 ─────────────│                           ││
│  │   │        ...               │                           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 部分重同步

```
┌──────────────────────────────────────────────────────────────┐
│                    部分重同步原理                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  核心组件：                                                  │
│                                                              │
│  1. 复制偏移量（replication offset）                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 主节点：offset = 10000                                   ││
│  │ 从节点：offset = 10000                                   ││
│  │                                                        ││
│  │ 写命令执行后，主从节点 offset 同步增加                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  2. 复制积压缓冲区（replication backlog）                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   复制积压缓冲区                         ││
│  │  ┌─────────────────────────────────────────────────┐   ││
│  │  │ offset=9500 │ offset=10000 │ offset=10500       │   ││
│  │  │  [cmd1]     │  [cmd2]     │  [cmd3]            │   ││
│  │  └─────────────────────────────────────────────────┘   ││
│  │                      ▲                                  ││
│  │                      │                                  ││
│  │             FIFO 队列，固定大小                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  3. 运行 ID（run ID）                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 主节点运行 ID：a1b2c3d4e5f6...                          ││
│  │ 从节点保存主节点 run ID，断线重连时用于判断              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  部分重同步判断流程：                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ PSYNC <runid> <offset>                                   ││
│  │                                                         ││
│  │ if (runid 匹配 && offset 在积压缓冲区中) {              ││
│  │     // 部分重同步                                       ││
│  │     发送 CONTINUE                                       ││
│  │     发送 offset 之后的数据                               ││
│  │ } else {                                                ││
│  │     // 全量同步                                         ││
│  │     发送 FULLRESYNC <runid> <offset>                    ││
│  │     执行 BGSAVE                                         ││
│  │ }                                                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 复制相关源码

```c
// replication.c - PSYNC 命令处理
void syncCommand(client *c) {
    // 已经在同步中
    if (c->flags & CLIENT_SLAVE) return;
    
    // 判断是否可以部分重同步
    if (!strcasecmp(c->argv[0]->ptr, "psync")) {
        if (masterTryPartialResynchronization(c) == C_OK) {
            server.stat_sync_partial_ok++;
            return;  // 部分重同步成功
        } else {
            server.stat_sync_partial_err++;
        }
    }
    
    // 执行全量同步
    c->replstate = SLAVE_STATE_WAIT_BGSAVE_END;
    
    // 如果有 BGSAVE 正在进行
    if (server.rdb_child_pid != -1) {
        // 检查是否可以复用
        if (server.rdb_child_type == CHILD_TYPE_RDB) {
            // 复用正在进行的 BGSAVE
            if (server.repl_backlog_size > 0) {
                // 等待 BGSAVE 完成
            }
        }
    } else {
        // 启动新的 BGSAVE
        if (rdbSaveToSlavesSockets() == C_OK) {
            return;
        }
    }
}

// 尝试部分重同步
int masterTryPartialResynchronization(client *c) {
    long long psync_offset, psync_len;
    char *master_runid = c->argv[1]->ptr;
    char buf[128];
    
    // 解析 offset
    if (getLongLongFromObjectOrReply(c, c->argv[2], &psync_offset, NULL) != C_OK)
        return C_ERR;
    
    // 检查 runid
    if (strcasecmp(master_runid, server.replid)) {
        // runid 不匹配，需要全量同步
        goto need_full_sync;
    }
    
    // 检查 offset 是否在积压缓冲区中
    if (!server.repl_backlog ||
        psync_offset < server.repl_backlog_off ||
        psync_offset > (server.repl_backlog_off + server.repl_backlog_histlen)) {
        // offset 不在缓冲区中，需要全量同步
        goto need_full_sync;
    }
    
    // 部分重同步
    c->flags |= CLIENT_SLAVE;
    c->replstate = SLAVE_STATE_ONLINE;
    c->repl_ack_time = server.unixtime;
    c->repl_put_online_on_ack = 0;
    
    // 发送 CONTINUE
    addReply(c, shared.cont);
    addReplySds(c, sdsnew("+CONTINUE\r\n"));
    
    // 发送积压缓冲区中的数据
    psync_len = addReplyReplicationBacklog(c, psync_offset);
    
    serverLog(LL_NOTICE, "Partial resynchronization request from %s accepted. Sending %lld bytes of backlog starting from offset %lld.",
              replicationGetSlaveName(c), psync_len, psync_offset);
    
    return C_OK;

need_full_sync:
    return C_ERR;
}
```

### 2.4 复制配置

```bash
# 从节点配置
replicaof <masterip> <masterport>  # 设置主节点地址

# 复制相关配置
masterauth <password>              # 主节点密码
replica-serve-stale-data yes       # 断开复制后是否继续响应
replica-read-only yes              # 从节点只读
repl-diskless-sync no              # 无盘复制
repl-diskless-sync-delay 5         # 无盘复制延迟
repl-backlog-size 1mb              # 积压缓冲区大小
repl-timeout 60                    # 复制超时
```

## 三、心跳检测

### 3.1 心跳机制

```c
// replication.c - 从节点发送心跳
void sendCackToMaster(void) {
    if (server.masterhost && server.master) {
        char buf[64];
        int offset = server.master->reploff + 1;
        
        snprintf(buf, sizeof(buf), "REPLCONF ACK %ld", offset);
        addReplyString(server.master, buf, strlen(buf));
    }
}

// 主节点检测从节点状态
void clientsCron(void) {
    // ...
    // 检查从节点超时
    if (c->flags & CLIENT_SLAVE) {
        if (server.unixtime - c->repl_ack_time > server.repl_timeout) {
            serverLog(LL_WARNING, "Disconnecting timedout replica: %s",
                      replicationGetSlaveName(c));
            freeClient(c);
        }
    }
}
```

### 3.2 心跳检测作用

```
┌──────────────────────────────────────────────────────────────┐
│                    心跳检测作用                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 检测主从连接状态                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 从节点每秒发送 REPLCONF ACK <offset>                    ││
│  │ 主节点超时未收到则断开连接                               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  2. 检测数据同步状态                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 通过 offset 判断主从数据是否一致                         ││
│  │ 用于 min-slaves 配置                                    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  3. 辅助实现 min-slaves 功能                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ # 至少有 3 个从节点延迟小于 10 秒                        ││
│  │ min-slaves-to-write 3                                   ││
│  │ min-slaves-max-lag 10                                   ││
│  │                                                         ││
│  │ 条件不满足时，主节点拒绝写入                             ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 四、哨兵机制概述

### 4.1 哨兵的作用

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis Sentinel 作用                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     监控（Monitoring）                   ││
│  │  持续检查主从节点是否正常运行                            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     通知（Notification）                 ││
│  │  当节点状态变化时通知客户端或管理员                      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                 自动故障转移（Failover）                 ││
│  │  主节点故障时自动选择从节点升级为主节点                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │               配置提供者（Configuration Provider）       ││
│  │  为客户端提供当前主节点地址                              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  架构图：                                                    │
│                                                              │
│          ┌─────────────────────────────────────────────┐    │
│          │              Sentinel 集群                   │    │
│          │  ┌─────────┐ ┌─────────┐ ┌─────────┐       │    │
│          │  │Sentinel1│ │Sentinel2│ │Sentinel3│       │    │
│          │  └────┬────┘ └────┬────┘ └────┬────┘       │    │
│          └───────┼───────────┼───────────┼────────────┘    │
│                  │           │           │                  │
│                  └───────────┼───────────┘                  │
│                              │                              │
│              ┌───────────────┼───────────────┐              │
│              ▼               ▼               ▼              │
│         ┌─────────┐    ┌─────────┐    ┌─────────┐          │
│         │ Master  │───►│ Slave 1 │    │ Slave 2 │          │
│         └─────────┘    └─────────┘    └─────────┘          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 哨兵结构定义

```c
// sentinel.c
typedef struct sentinelRedisInstance {
    int flags;                  // 实例标志（SRI_MASTER, SRI_SLAVE, SRI_SENTINEL）
    char *name;                 // 实例名称
    char *runid;                // 运行 ID
    uint64_t config_epoch;      // 配置纪元
    sentinelAddr *addr;         // 地址
    mstime_t down_after_period; // 主观下线时间
    mstime_t info_refresh;      // INFO 刷新时间
    
    // 主节点特有属性
    dict *sentinels;            // 监控同一主节点的其他哨兵
    dict *slaves;               // 该主节点的从节点
    unsigned int quorum;        // 判定客观下线需要的票数
    int failover_timeout;       // 故障转移超时
    
    // 故障转移状态
    int failover_state;         // 故障转移状态
    uint64_t failover_epoch;    // 故障转移纪元
    sentinelRedisInstance *leader; // 领导者
    char *leader_epoch;         // 领导者纪元
    
    // 从节点特有属性
    sentinelRedisInstance *master; // 所属主节点
    mstime_t master_link_down_time; // 主从断开时间
    mstime_t slave_reconf_sent_time; // 重配置发送时间
} sentinelRedisInstance;

// Sentinel 状态
struct sentinelState {
    char myid[CONFIG_RUN_ID_SIZE + 1];  // 哨兵 ID
    uint64_t current_epoch;              // 当前纪元
    dict *masters;                       // 监控的主节点
    int tilt;                            // 是否进入 TILT 模式
    int running_scripts;                 // 运行中的脚本数
    mstime_t tilt_start_time;           // TILT 开始时间
    mstime_t previous_time;             // 上次执行时间
    list *scripts_queue;                // 脚本队列
} sentinel;
```

## 五、哨兵监控原理

### 5.1 信息获取

```
┌──────────────────────────────────────────────────────────────┐
│                    哨兵信息获取机制                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Sentinel                                                    │
│       │                                                      │
│       ├──────────────────────────────────────────────────┐   │
│       │                                                  │   │
│       ▼                                                  ▼   │
│  ┌─────────┐                                      ┌─────────┐│
│  │ Master  │                                      │ Slave   ││
│  └─────────┘                                      └─────────┘│
│       │                                                  │   │
│       │ 1. PING（每秒）                                  │   │
│       │◄────────────────────────────────────────────────►│   │
│       │                                                  │   │
│       │ 2. INFO（每 10 秒）                              │   │
│       │◄────────────────────────────────────────────────►│   │
│       │   获取：runid、role、主从关系                     │   │
│       │                                                  │   │
│       │ 3. 发布订阅（每 2 秒）                            │   │
│       │◄────────────────────────────────────────────────►│   │
│       │   频道：__sentinel__:hello                       │   │
│       │   内容：哨兵信息、主节点配置                      │   │
│       │                                                  │   │
│  Sentinel 之间：                                          │   │
│       │                                                  │   │
│       │  通过发布订阅发现其他哨兵                        │   │
│       │  通过 INFO 发现从节点                            │   │
│       │                                                  │   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    定时任务                             ││
│  │                                                         ││
│  │  • 1 Hz: PING 所有实例                                  ││
│  │  • 2 Hz: 发布订阅消息                                   ││
│  │  • 10 Hz: INFO 主从节点                                 ││
│  │  • 1 Hz: 检查客观下线                                   ││
│  │  • 1 Hz: 故障转移状态检查                               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 下线检测

```
┌──────────────────────────────────────────────────────────────┐
│                    下线检测流程                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 主观下线（Subjectively Down, S_DOWN）                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  Sentinel 发送 PING 命令                                ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  在 down-after-milliseconds 内未收到有效响应            ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  标记实例为 S_DOWN                                      ││
│  │                                                         ││
│  │  有效响应：+PONG, -LOADING, -MASTERDOWN                 ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  2. 客观下线（Objectively Down, O_DOWN）                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  主节点被标记为主观下线                                 ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  向其他 Sentinel 发送 SENTINEL is-master-down-by-addr   ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  收到足够多（>= quorum）的确认                          ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  标记实例为 O_DOWN                                      ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  判断流程：                                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  PING 超时 → 主观下线                                   ││
│  │       │                                                 ││
│  │       ▼                                                 ││
│  │  询问其他 Sentinel                                      ││
│  │       │                                                 ││
│  │       ├─ 不够 quorum ─► 保持主观下线                    ││
│  │       │                                                 ││
│  │       └─ 够 quorum ──► 客观下线                         ││
│  │                      │                                  ││
│  │                      ▼                                  ││
│  │                 开始故障转移                            ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 六、故障转移

### 6.1 故障转移流程

```
┌──────────────────────────────────────────────────────────────┐
│                    故障转移流程                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  阶段 1: 选举领导者                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  发现主节点客观下线的 Sentinel 发起选举                  ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  向其他 Sentinel 发送 SENTINEL is-master-down-by-addr   ││
│  │  携带自己的 runid 和 config_epoch                       ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  其他 Sentinel 投票（先到先得）                         ││
│  │      │                                                  ││
│  │      ▼                                                  ││
│  │  获得多数票的 Sentinel 成为领导者                       ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  阶段 2: 选择新主节点                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  从所有从节点中选择最佳候选者：                         ││
│  │                                                         ││
│  │  优先级排序：                                           ││
│  │  1. 排除已下线的从节点                                  ││
│  │  2. 排除最近断开连接的从节点                            ││
│  │  3. 优先选择 replica-priority 最低的                    ││
│  │  4. 优先选择复制偏移量最大的                            ││
│  │  5. 优先选择 runid 最小的                               ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  阶段 3: 升级新主节点                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  领导者向新主节点发送：                                 ││
│  │      SLAVEOF NO ONE                                     ││
│  │                                                         ││
│  │  新主节点响应后：                                       ││
│  │      状态更新为主节点                                   ││
│  │      config_epoch 增加                                  ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  阶段 4: 更新其他从节点                                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  向其他从节点发送：                                     ││
│  │      SLAVEOF <new_master_ip> <new_master_port>          ││
│  │                                                         ││
│  │  从节点开始复制新主节点                                 ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  阶段 5: 更新客户端                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  Sentinel 更新配置                                      ││
│  │  客户端获取最新主节点地址                               ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 故障转移源码

```c
// sentinel.c
void sentinelFailoverStateMachine(sentinelRedisInstance *ri) {
    serverAssert(ri->flags & SRI_MASTER);
    
    switch (ri->failover_state) {
        case SENTINEL_FAILOVER_STATE_WAIT_START:
            sentinelFailoverWaitStart(ri);
            break;
        case SENTINEL_FAILOVER_STATE_SELECT_SLAVE:
            sentinelFailoverSelectSlave(ri);
            break;
        case SENTINEL_FAILOVER_STATE_SEND_SLAVEOF_NOONE:
            sentinelFailoverSendSlaveofNoOne(ri);
            break;
        case SENTINEL_FAILOVER_STATE_WAIT_PROMOTION:
            sentinelFailoverWaitPromotion(ri);
            break;
        case SENTINEL_FAILOVER_STATE_RECONF_SLAVES:
            sentinelFailoverReconfNextSlave(ri);
            break;
    }
}

// 选择从节点
void sentinelFailoverSelectSlave(sentinelRedisInstance *ri) {
    sentinelRedisInstance *slave = sentinelSelectSlave(ri);
    
    if (slave == NULL) {
        sentinelEvent(LL_WARNING, "-failover-abort-no-good-slave",
                      ri, "%@");
        sentinelAbortFailover(ri);
    } else {
        sentinelEvent(LL_NOTICE, "+selected-slave", slave, "%@");
        slave->flags |= SRI_PROMOTED;
        ri->promoted_slave = slave;
        ri->failover_state = SENTINEL_FAILOVER_STATE_SEND_SLAVEOF_NOONE;
        ri->failover_state_change_time = mstime();
        sentinelEvent(LL_NOTICE, "+failover-state-send-slaveof-noone",
                      slave, "%@");
    }
}

// 选择最佳从节点
sentinelRedisInstance *sentinelSelectSlave(sentinelRedisInstance *master) {
    sentinelRedisInstance **instance =
        zmalloc(sizeof(instance[0]) * dictSize(master->slaves));
    sentinelRedisInstance *selected = NULL;
    int instances = 0;
    dictIterator *di;
    dictEntry *de;
    
    di = dictGetIterator(master->slaves);
    while ((de = dictNext(di)) != NULL) {
        sentinelRedisInstance *slave = dictGetVal(de);
        instance[instances++] = slave;
    }
    dictReleaseIterator(di);
    
    // 排序并选择最佳
    qsort(instance, instances, sizeof(sentinelRedisInstance *),
          compareSlavesForPromotion);
    
    if (instances > 0) {
        selected = instance[0];
    }
    
    zfree(instance);
    return selected;
}
```

## 七、哨兵配置

### 7.1 哨兵配置文件

```bash
# sentinel.conf

# 监控主节点
# sentinel monitor <master-name> <ip> <port> <quorum>
sentinel monitor mymaster 127.0.0.1 6379 2

# 主节点密码
sentinel auth-pass mymaster yourpassword

# 主观下线时间
sentinel down-after-milliseconds mymaster 30000

# 故障转移超时
sentinel failover-timeout mymaster 180000

# 同时可重新配置的从节点数量
sentinel parallel-syncs mymaster 1

# 通知脚本
sentinel notification-script mymaster /path/to/script.sh

# 客户端重新配置脚本
sentinel client-reconfig-script mymaster /path/to/script.sh
```

### 7.2 客户端连接哨兵

```java
// Jedis 客户端示例
Set<String> sentinels = new HashSet<>();
sentinels.add("sentinel1:26379");
sentinels.add("sentinel2:26379");
sentinels.add("sentinel3:26379");

JedisSentinelPool pool = new JedisSentinelPool("mymaster", sentinels);

try (Jedis jedis = pool.getResource()) {
    jedis.set("key", "value");
}
```

## 八、生产环境最佳实践

### 8.1 主从复制优化

```
┌──────────────────────────────────────────────────────────────┐
│                    主从复制优化建议                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 积压缓冲区大小                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ # 根据网络延迟和写命令速率计算                           ││
│  │ # 公式：写速率(MB/s) * 断线时间(s) * 2                  ││
│  │ repl-backlog-size 100mb                                 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  2. 无盘复制                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ # 低带宽环境使用                                         ││
│  │ repl-diskless-sync yes                                  ││
│  │ repl-diskless-sync-delay 5                              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  3. 从节点只读                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ replica-read-only yes                                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  4. 防止主节点过早超时                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ # 计算公式：max(从节点数量 * 超时时间, 积压缓冲区大小)   ││
│  │ repl-timeout 60                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 哨兵部署建议

```
┌──────────────────────────────────────────────────────────────┐
│                    哨兵部署建议                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 哨兵节点数量                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 推荐：奇数个，至少 3 个                                  ││
│  │ 原因：多数派投票，避免脑裂                               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  2. 部署位置                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • 不同物理机/虚拟机                                      ││
│  │ • 不同可用区（如果使用云服务）                           ││
│  │ • 避免与 Redis 节点混用                                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  3. quorum 设置                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 推荐：(哨兵数量 / 2) + 1                                 ││
│  │ 3 个哨兵：quorum = 2                                     ││
│  │ 5 个哨兵：quorum = 3                                     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  4. 监控配置                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ down-after-milliseconds: 30s（根据网络延迟调整）        ││
│  │ failover-timeout: 3min                                   ││
│  │ parallel-syncs: 1（避免大量从节点同时同步）             ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 九、总结

本章深入分析了 Redis 的复制与哨兵机制：

| 特性 | 主从复制 | 哨兵机制 |
|------|----------|----------|
| 作用 | 数据冗余、读写分离 | 高可用、自动故障转移 |
| 核心机制 | PSYNC 部分重同步 | 投票选举、故障转移 |
| 关键参数 | backlog-size, timeout | quorum, down-after |

下一章将深入分析 Redis 集群原理。

## 参考资料

- [Redis Source Code - replication.c](https://github.com/redis/redis/blob/unstable/src/replication.c)
- [Redis Source Code - sentinel.c](https://github.com/redis/redis/blob/unstable/src/sentinel.c)
- [Redis Sentinel Documentation](https://redis.io/topics/sentinel)
- 《Redis设计与实现》- 黄健宏
