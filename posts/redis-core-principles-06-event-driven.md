---
title: "Redis底层原理（六）：事件驱动模型"
date: "2024-03-15"
excerpt: "深入理解Redis的事件驱动架构，掌握文件事件和时间事件的实现原理，理解Redis如何通过单线程事件循环实现高性能网络服务。"
tags: ["Redis", "事件驱动", "IO多路复用", "Reactor模式", "高性能"]
---

## 前言

Redis 作为一个高性能的内存数据库，其核心是一个基于事件驱动的网络服务器。Redis 采用 Reactor 模式，通过 IO 多路复用技术，在单线程中处理大量并发连接。本章将深入分析 Redis 的事件驱动模型。

## 一、事件驱动概述

### 1.1 Redis 事件类型

Redis 服务器需要处理两类事件：

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 事件类型                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     文件事件                            ││
│  │                                                         ││
│  │  定义：客户端的网络连接产生的事件                        ││
│  │  类型：可读事件（AE_READABLE）                          ││
│  │        可写事件（AE_WRITABLE）                          ││
│  │  处理：客户端连接、命令请求、命令回复                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     时间事件                            ││
│  │                                                         ││
│  │  定义：定时任务产生的事件                               ││
│  │  类型：单次执行、周期执行                               ││
│  │  处理：serverCron（定期任务）                           ││
│  │        过期键清理、字典 rehash                          ││
│  │        统计信息更新、客户端超时检查                     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     事件循环                            ││
│  │                                                         ││
│  │  while (!stop) {                                        ││
│  │      处理到达的文件事件（优先级更高）                    ││
│  │      处理到期的时间事件                                 ││
│  │  }                                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Reactor 模式

Redis 采用 Reactor 模式处理并发连接：

```
┌──────────────────────────────────────────────────────────────┐
│                    Reactor 模式架构                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     客户端连接                          ││
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐          ││
│  │  │ C1  │  │ C2  │  │ C3  │  │ C4  │  │ C5  │          ││
│  │  └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘          ││
│  └─────┼────────┼────────┼────────┼────────┼───────────────┘│
│        │        │        │        │        │                 │
│        ▼        ▼        ▼        ▼        ▼                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  IO 多路复用器                          ││
│  │              (epoll / kqueue / select)                  ││
│  │                                                         ││
│  │  同时监听多个文件描述符，返回就绪的事件                  ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    事件分发器                           ││
│  │                                                         ││
│  │  根据事件类型，分发给对应的事件处理器                    ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│           ┌───────────────┼───────────────┐                 │
│           ▼               ▼               ▼                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 连接处理器  │  │ 请求处理器  │  │ 回复处理器  │         │
│  │ acceptTcp  │  │ readQuery   │  │ sendReply   │         │
│  │ Handler    │  │ FromClient  │  │ ToClient    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 二、事件循环结构

### 2.1 aeEventLoop 结构

```c
// ae.h
typedef struct aeEventLoop {
    int maxfd;                    // 最大文件描述符
    int setsize;                  // 事件表大小
    long long timeEventNextId;    // 下一个时间事件 ID
    time_t lastTime;              // 上次处理时间事件的时间
    aeFileEvent *events;          // 注册的文件事件数组
    aeFiredEvent *fired;          // 已触发的事件数组
    aeTimeEvent *timeEventHead;   // 时间事件链表头
    int stop;                     // 停止标志
    void *apidata;                // IO 多路复用器数据
    aeBeforeSleepProc *beforesleep; // 事件循环前回调
    aeBeforeSleepProc *aftersleep;  // 事件循环后回调
} aeEventLoop;

// 文件事件结构
typedef struct aeFileEvent {
    int mask;           // 事件掩码（AE_READABLE | AE_WRITABLE）
    aeFileProc *rfileProc;  // 读事件处理器
    aeFileProc *wfileProc;  // 写事件处理器
    void *clientData;   // 客户端数据
} aeFileEvent;

// 已触发事件结构
typedef struct aeFiredEvent {
    int fd;     // 文件描述符
    int mask;   // 就绪的事件掩码
} aeFiredEvent;

// 时间事件结构
typedef struct aeTimeEvent {
    long long id;       // 时间事件 ID
    long when_sec;      // 秒
    long when_ms;       // 毫秒
    aeTimeProc *timeProc;   // 时间事件处理器
    aeEventFinalizerProc *finalizerProc; // 结束回调
    void *clientData;   // 客户端数据
    struct aeTimeEvent *prev;  // 前驱
    struct aeTimeEvent *next;  // 后继
} aeTimeEvent;
```

### 2.2 事件循环内存布局

```
┌──────────────────────────────────────────────────────────────┐
│                    aeEventLoop 内存布局                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  aeEventLoop                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ maxfd=1024 │ setsize=10240 │ timeEventNextId=100        ││
│  │ lastTime   │ stop=0        │ apidata                    ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ events ────────────────────────────────────────┐        ││
│  │ fired  ─────────────────────────────────────────│─┐      ││
│  │ timeEventHead ──────────────────────────────────│──┐    ││
│  └─────────────────────────────────────────────────┼──┼────┘│
│                                                    │  │      │
│  events 数组（文件事件表）                         │  │      │
│  ┌──────────────────────────────────────────────┐  │  │      │
│  │ fd=0  │ mask=R │ rfileProc │ wfileProc │... │  │  │      │
│  │ fd=1  │ mask=0 │ NULL      │ NULL      │... │  │  │      │
│  │ fd=2  │ mask=R │ acceptProc│ NULL      │... │  │  │      │
│  │ ...                                         │  │  │      │
│  │ fd=1024│ mask=RW│ readProc  │ writeProc │... │  │  │      │
│  └──────────────────────────────────────────────┘  │  │      │
│                                                    │  │      │
│  fired 数组（就绪事件）                             │  │      │
│  ┌──────────────────────────────────────────────┐  │  │      │
│  │ fd=5  │ mask=R │                              ◄──┘  │      │
│  │ fd=8  │ mask=W │                              ◄─────┘      │
│  └──────────────────────────────────────────────┘              │
│                                                                │
│  timeEventHead（时间事件链表）                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│  │ id=1     │───►│ id=2     │───►│ id=3     │                │
│  │ when=... │    │ when=... │    │ when=... │                │
│  │ proc=... │    │ proc=... │    │ proc=... │                │
│  └──────────┘    └──────────┘    └──────────┘                │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## 三、文件事件

### 3.1 IO 多路复用实现

Redis 支持多种 IO 多路复用实现，根据平台自动选择：

```c
// ae.c
#ifdef HAVE_EVPORT
#include "ae_evport.c"
#else
    #ifdef HAVE_EPOLL
    #include "ae_epoll.c"
    #else
        #ifdef HAVE_KQUEUE
        #include "ae_kqueue.c"
        #else
        #include "ae_select.c"
        #endif
    #endif
#endif
```

### 3.2 epoll 实现

Linux 系统使用 epoll 作为 IO 多路复用实现：

```c
// ae_epoll.c
typedef struct aeApiState {
    int epfd;           // epoll 实例
    struct epoll_event *events;  // 事件数组
} aeApiState;

// 创建 epoll 实例
static int aeApiCreate(aeEventLoop *eventLoop) {
    aeApiState *state = zmalloc(sizeof(aeApiState));
    if (!state) return -1;
    
    state->events = zmalloc(sizeof(struct epoll_event) * eventLoop->setsize);
    if (!state->events) {
        zfree(state);
        return -1;
    }
    
    // 创建 epoll 实例
    state->epfd = epoll_create(1024);
    if (state->epfd == -1) {
        zfree(state->events);
        zfree(state);
        return -1;
    }
    
    eventLoop->apidata = state;
    return 0;
}

// 添加/修改事件
static int aeApiAddEvent(aeEventLoop *eventLoop, int fd, int mask) {
    aeApiState *state = eventLoop->apidata;
    struct epoll_event ee = {0};
    
    int op = eventLoop->events[fd].mask == AE_NONE ? 
             EPOLL_CTL_ADD : EPOLL_CTL_MOD;
    
    ee.events = 0;
    mask |= eventLoop->events[fd].mask;  // 合并已有事件
    
    if (mask & AE_READABLE) ee.events |= EPOLLIN;
    if (mask & AE_WRITABLE) ee.events |= EPOLLOUT;
    
    ee.data.fd = fd;
    
    return epoll_ctl(state->epfd, op, fd, &ee);
}

// 等待事件
static int aeApiPoll(aeEventLoop *eventLoop, struct timeval *tvp) {
    aeApiState *state = eventLoop->apidata;
    int retval, numevents = 0;
    
    // 计算超时时间
    int timeout = tvp ? (tvp->tv_sec * 1000 + tvp->tv_usec / 1000) : -1;
    
    // 等待事件
    retval = epoll_wait(state->epfd, state->events, eventLoop->setsize, timeout);
    
    if (retval > 0) {
        numevents = retval;
        for (int j = 0; j < numevents; j++) {
            int mask = 0;
            struct epoll_event *e = state->events + j;
            
            if (e->events & EPOLLIN) mask |= AE_READABLE;
            if (e->events & EPOLLOUT) mask |= AE_WRITABLE;
            if (e->events & EPOLLERR) mask |= AE_WRITABLE | AE_READABLE;
            if (e->events & EPOLLHUP) mask |= AE_WRITABLE | AE_READABLE;
            
            eventLoop->fired[j].fd = e->data.fd;
            eventLoop->fired[j].mask = mask;
        }
    }
    
    return numevents;
}
```

### 3.3 文件事件处理器

Redis 定义了多种文件事件处理器：

```c
// 连接处理器 - 处理新连接
void acceptTcpHandler(aeEventLoop *el, int fd, void *privdata, int mask) {
    int cport, cfd, max = MAX_ACCEPTS_PER_CALL;
    char cip[NET_IP_STR_LEN];
    
    while (max--) {
        // 接受连接
        cfd = anetTcpAccept(server.neterr, fd, cip, sizeof(cip), &cport);
        if (cfd == ANET_ERR) {
            if (errno != EWOULDBLOCK)
                serverLog(LL_WARNING, "Accepting client connection: %s",
                          server.neterr);
            return;
        }
        
        serverLog(LL_VERBOSE, "Accepted %s:%d", cip, cport);
        
        // 创建客户端
        acceptCommonHandler(connCreateAcceptedSocket(cfd), 0, cip);
    }
}

// 读事件处理器 - 处理客户端请求
void readQueryFromClient(connection *conn) {
    client *c = connGetPrivateData(conn);
    int nread, readlen;
    size_t qblen;
    
    // 读取数据
    readlen = PROTO_IOBUF_LEN;
    qblen = sdslen(c->querybuf);
    
    // 扩展缓冲区
    c->querybuf = sdsMakeRoomFor(c->querybuf, readlen);
    
    nread = connRead(conn, c->querybuf + qblen, readlen);
    
    if (nread == -1) {
        if (connGetState(conn) == CONN_STATE_CONNECTED) return;
        serverLog(LL_VERBOSE, "Reading from client: %s", connGetLastError(conn));
        freeClientAsync(c);
        return;
    } else if (nread == 0) {
        serverLog(LL_VERBOSE, "Client closed connection");
        freeClientAsync(c);
        return;
    }
    
    sdsIncrLen(c->querybuf, nread);
    c->lastinteraction = server.unixtime;
    
    // 处理命令
    if (processInputBuffer(c) == C_ERR) return;
}
```

### 3.4 文件事件处理流程

```
┌──────────────────────────────────────────────────────────────┐
│                    文件事件处理流程                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  客户端连接请求                                              │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Step 1: 监听套接字可读                                   ││
│  │         epoll_wait 返回监听 fd 的可读事件                ││
│  └─────────────────────────────────────────────────────────┘│
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Step 2: 调用 acceptTcpHandler                          ││
│  │         accept() 接受连接                               ││
│  │         创建 client 结构                                ││
│  │         注册客户端 fd 的可读事件                         ││
│  └─────────────────────────────────────────────────────────┘│
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Step 3: 客户端发送命令                                   ││
│  │         客户端 fd 可读                                   ││
│  │         调用 readQueryFromClient                        ││
│  │         读取数据到 querybuf                             ││
│  │         解析并执行命令                                   ││
│  └─────────────────────────────────────────────────────────┘│
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Step 4: 回复客户端                                       ││
│  │         如果有数据需要发送                               ││
│  │         注册客户端 fd 的可写事件                         ││
│  │         调用 sendReplyToClient                          ││
│  │         发送数据后取消可写事件                           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 四、时间事件

### 4.1 时间事件实现

```c
// ae.c - 创建时间事件
long long aeCreateTimeEvent(aeEventLoop *eventLoop, long long milliseconds,
                            aeTimeProc *proc, void *clientData,
                            aeEventFinalizerProc *finalizerProc) {
    long long id = eventLoop->timeEventNextId++;
    aeTimeEvent *te;
    
    te = zmalloc(sizeof(*te));
    if (te == NULL) return AE_ERR;
    
    te->id = id;
    aeAddMillisecondsToNow(milliseconds, &te->when_sec, &te->when_ms);
    te->timeProc = proc;
    te->finalizerProc = finalizerProc;
    te->clientData = clientData;
    te->prev = NULL;
    te->next = eventLoop->timeEventHead;
    
    if (te->next) te->next->prev = te;
    eventLoop->timeEventHead = te;
    
    return id;
}

// 删除时间事件
int aeDeleteTimeEvent(aeEventLoop *eventLoop, long long id) {
    aeTimeEvent *te = eventLoop->timeEventHead;
    
    while (te) {
        if (te->id == id) {
            te->id = AE_DELETED_EVENT_ID;
            return AE_OK;
        }
        te = te->next;
    }
    
    return AE_ERR;
}
```

### 4.2 serverCron 定时任务

Redis 最重要的时间事件是 serverCron：

```c
// server.c
int serverCron(struct aeEventLoop *eventLoop, long long id, void *clientData) {
    int j;
    UNUSED(eventLoop);
    UNUSED(id);
    UNUSED(clientData);
    
    // 1. 更新时间缓存
    server.ustime = ustime();
    server.mstime = server.ustime / 1000;
    server.unixtime = server.mstime / 1000;
    
    // 2. 更新内存统计
    if (server.stat_peak_memory < zmalloc_used_memory())
        server.stat_peak_memory = zmalloc_used_memory();
    
    // 3. 处理 SIGTERM
    if (server.shutdown_asap) {
        if (prepareForShutdown(SHUTDOWN_NOFLAGS) == C_OK) exit(0);
        server.shutdown_asap = 0;
    }
    
    // 4. 打印数据库信息
    run_with_period(5000) {
        for (j = 0; j < server.dbnum; j++) {
            long long size, used, vkeys;
            size = dictSlots(server.db[j].dict);
            used = dictSize(server.db[j].dict);
            vkeys = dictSize(server.db[j].expires);
            if (used || vkeys) {
                serverLog(LL_VERBOSE, "DB %d: %lld keys (%lld volatile) in %lld slots HT.", j, used, vkeys, size);
            }
        }
    }
    
    // 5. 处理客户端超时
    clientsCron();
    
    // 6. 处理数据库
    databasesCron();
    
    // 7. 处理 AOF 重写
    if (server.aof_rewrite_scheduled) {
        rewriteAppendOnlyFileBackground();
    }
    
    // 8. 处理 RDB 保存
    if (server.rdb_child_pid != -1 || server.aof_child_pid != -1) {
        // 等待子进程
    } else {
        // 检查是否需要 BGSAVE
        for (j = 0; j < server.saveparamslen; j++) {
            struct saveparam *sp = server.saveparams + j;
            if (server.dirty >= sp->changes &&
                server.unixtime - server.lastsave > sp->seconds) {
                rdbSaveBackground(server.rdb_filename, NULL);
                break;
            }
        }
        
        // 检查是否需要 AOF 重写
        if (server.aof_state == AOF_ON &&
            server.rdb_child_pid == -1 &&
            server.aof_child_pid == -1 &&
            server.aof_rewrite_perc &&
            server.aof_current_size >= server.aof_rewrite_min_size) {
            long long base = server.aof_rewrite_base_size ?
                             server.aof_rewrite_base_size : 1;
            long long growth = (server.aof_current_size * 100 / base) - 100;
            if (growth >= server.aof_rewrite_perc) {
                rewriteAppendOnlyFileBackground();
            }
        }
    }
    
    // 9. 过期键清理
    if (server.active_expire_enabled) {
        activeExpireCycle(ACTIVE_EXPIRE_CYCLE_SLOW);
    }
    
    // 10. 渐进式 rehash
    if (server.activerehashing) {
        for (j = 0; j < server.dbnum; j++) {
            int hashes = dictGetSomeKeys(server.db[j].dict);
            if (hashes) {
                if (dictRehash(server.db[j].dict, hashes)) break;
            }
        }
    }
    
    // 返回下次执行间隔（毫秒）
    return 1000 / server.hz;
}
```

### 4.3 时间事件处理流程

```c
// ae.c
static int processTimeEvents(aeEventLoop *eventLoop) {
    int processed = 0;
    aeTimeEvent *te;
    long long maxId;
    time_t now = time(NULL);
    
    // 系统时钟调整处理
    if (now < eventLoop->lastTime) {
        te = eventLoop->timeEventHead;
        while (te) {
            te->when_sec = 0;
            te = te->next;
        }
    }
    eventLoop->lastTime = now;
    
    te = eventLoop->timeEventHead;
    maxId = eventLoop->timeEventNextId - 1;
    
    while (te) {
        long now_sec, now_ms;
        long long id;
        
        // 跳过已删除的事件
        if (te->id == AE_DELETED_EVENT_ID) {
            aeTimeEvent *next = te->next;
            if (te->prev)
                te->prev->next = te->next;
            else
                eventLoop->timeEventHead = te->next;
            if (te->next) te->next->prev = te->prev;
            if (te->finalizerProc) te->finalizerProc(eventLoop, te->clientData);
            zfree(te);
            te = next;
            continue;
        }
        
        // 超过最大 ID，跳过
        if (te->id > maxId) {
            te = te->next;
            continue;
        }
        
        // 获取当前时间
        aeGetTime(&now_sec, &now_ms);
        
        // 检查是否到期
        if (te->when_sec < now_sec ||
            (te->when_sec == now_sec && te->when_ms <= now_ms)) {
            int retval;
            
            id = te->id;
            // 执行时间事件处理器
            retval = te->timeProc(eventLoop, id, te->clientData);
            processed++;
            
            if (retval != AE_NOMORE) {
                // 周期性事件，重新计算下次执行时间
                aeAddMillisecondsToNow(retval, &te->when_sec, &te->when_ms);
            } else {
                // 单次事件，标记删除
                te->id = AE_DELETED_EVENT_ID;
            }
        }
        
        te = te->next;
    }
    
    return processed;
}
```

## 五、事件循环主流程

### 5.1 aeMain 实现

```c
// ae.c
void aeMain(aeEventLoop *eventLoop) {
    eventLoop->stop = 0;
    
    while (!eventLoop->stop) {
        // 事件循环前回调
        if (eventLoop->beforesleep != NULL)
            eventLoop->beforesleep(eventLoop);
        
        // 处理事件
        aeProcessEvents(eventLoop, AE_ALL_EVENTS |
                                   AE_CALL_AFTER_SLEEP);
    }
}
```

### 5.2 aeProcessEvents 实现

```c
// ae.c
int aeProcessEvents(aeEventLoop *eventLoop, int flags) {
    int processed = 0, numevents;
    
    // 没有事件需要处理
    if (!(flags & AE_TIME_EVENTS) && !(flags & AE_FILE_EVENTS)) return 0;
    
    // 有文件事件或者需要处理时间事件
    if (eventLoop->maxfd != -1 ||
        ((flags & AE_TIME_EVENTS) && !(flags & AE_DONT_WAIT))) {
        
        int j;
        aeTimeEvent *shortest = NULL;
        struct timeval tv, *tvp;
        
        // 计算最近的时间事件
        if (flags & AE_TIME_EVENTS && !(flags & AE_DONT_WAIT))
            shortest = aeSearchNearestTimer(eventLoop);
        
        if (shortest) {
            long now_sec, now_ms;
            aeGetTime(&now_sec, &now_ms);
            tvp = &tv;
            
            // 计算距离最近时间事件的时间差
            long long ms = (shortest->when_sec - now_sec) * 1000 +
                           (shortest->when_ms - now_ms);
            
            if (ms > 0) {
                tvp->tv_sec = ms / 1000;
                tvp->tv_usec = (ms % 1000) * 1000;
            } else {
                tvp->tv_sec = 0;
                tvp->tv_usec = 0;
            }
        } else {
            // 没有时间事件，根据是否需要等待决定
            if (flags & AE_DONT_WAIT) {
                tv.tv_sec = tv.tv_usec = 0;
                tvp = &tv;
            } else {
                tvp = NULL;  // 无限等待
            }
        }
        
        // 等待文件事件
        numevents = aeApiPoll(eventLoop, tvp);
        
        // 事件循环后回调
        if (eventLoop->aftersleep != NULL && flags & AE_CALL_AFTER_SLEEP)
            eventLoop->aftersleep(eventLoop);
        
        // 处理文件事件
        for (j = 0; j < numevents; j++) {
            aeFileEvent *fe = &eventLoop->events[eventLoop->fired[j].fd];
            int mask = eventLoop->fired[j].mask;
            int fd = eventLoop->fired[j].fd;
            int fired = 0;
            
            // 读事件
            if (fe->mask & mask & AE_READABLE) {
                fe->rfileProc(eventLoop, fd, fe->clientData, mask);
                fired++;
            }
            
            // 写事件（未触发读事件或事件可同时读写）
            if (fe->mask & mask & AE_WRITABLE) {
                if (!fired || fe->wfileProc != fe->rfileProc) {
                    fe->wfileProc(eventLoop, fd, fe->clientData, mask);
                    fired++;
                }
            }
            
            processed++;
        }
    }
    
    // 处理时间事件
    if (flags & AE_TIME_EVENTS)
        processed += processTimeEvents(eventLoop);
    
    return processed;
}
```

### 5.3 事件循环流程图

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 事件循环流程                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    while (!stop)                        ││
│  │                                                         ││
│  │  ┌───────────────────────────────────────────────────┐ ││
│  │  │           beforesleep 回调                        │ ││
│  │  │  • 处理客户端输出缓冲区                           │ ││
│  │  │  • 处理 AOF 刷盘                                  │ ││
│  │  └───────────────────────────────────────────────────┘ ││
│  │                         │                               ││
│  │                         ▼                               ││
│  │  ┌───────────────────────────────────────────────────┐ ││
│  │  │        计算最近时间事件的超时时间                  │ ││
│  │  │                                                   │ ││
│  │  │  有时间事件？                                     │ ││
│  │  │    是 → 计算距离下次事件的时间差                  │ ││
│  │  │    否 → 无限等待或立即返回                        │ ││
│  │  └───────────────────────────────────────────────────┘ ││
│  │                         │                               ││
│  │                         ▼                               ││
│  │  ┌───────────────────────────────────────────────────┐ ││
│  │  │           aeApiPoll (epoll_wait)                  │ ││
│  │  │                                                   │ ││
│  │  │  • 等待文件事件就绪                              │ ││
│  │  │  • 超时后返回                                    │ ││
│  │  └───────────────────────────────────────────────────┘ ││
│  │                         │                               ││
│  │                         ▼                               ││
│  │  ┌───────────────────────────────────────────────────┐ ││
│  │  │            处理就绪的文件事件                     │ ││
│  │  │                                                   │ ││
│  │  │  for each fired event:                           │ ││
│  │  │    if (readable) rfileProc()                     │ ││
│  │  │    if (writable) wfileProc()                     │ ││
│  │  └───────────────────────────────────────────────────┘ ││
│  │                         │                               ││
│  │                         ▼                               ││
│  │  ┌───────────────────────────────────────────────────┐ ││
│  │  │            处理到期的时间事件                     │ ││
│  │  │                                                   │ ││
│  │  │  while (time event <= now) {                     │ ││
│  │  │    timeProc()                                    │ ││
│  │  │  }                                               │ ││
│  │  └───────────────────────────────────────────────────┘ ││
│  │                         │                               ││
│  │                         ▼                               ││
│  │                   ┌───────────┐                        ││
│  │                   │   stop?   │                        ││
│  │                   └─────┬─────┘                        ││
│  │                         │                               ││
│  │              ┌──────────┴──────────┐                   ││
│  │              ▼                     ▼                   ││
│  │            continue              break                  ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 六、beforesleep 回调

### 6.1 beforesleep 实现

```c
// server.c
void beforeSleep(struct aeEventLoop *eventLoop) {
    UNUSED(eventLoop);
    
    // 1. 处理未完成的线程任务
    handleClientsWithPendingWritesUsingThreads();
    
    // 2. 处理客户端输出缓冲区
    handleClientsWithPendingWrites();
    
    // 3. 处理客户端读缓冲区
    handleClientsBlockedOnKeys();
    
    // 4. 刷新 AOF 缓冲区
    if (server.aof_state == AOF_ON) {
        flushAppendOnlyFile(0);
    }
    
    // 5. 处理模块事件
    moduleHandleBlockedClients();
    
    // 6. 处理 cluster 消息
    if (server.cluster_enabled) {
        clusterBeforeSleep();
    }
}
```

### 6.2 为什么需要 beforesleep？

```
┌──────────────────────────────────────────────────────────────┐
│                    beforesleep 的作用                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  问题场景：                                                  │
│                                                              │
│  1. 客户端命令执行后，回复数据写入输出缓冲区                 │
│     但此时并没有注册可写事件                                 │
│     回复数据要等到下次事件循环才能发送                       │
│     → 增加延迟                                              │
│                                                              │
│  2. AOF 缓冲区中的命令没有及时刷盘                           │
│     → 数据安全性降低                                        │
│                                                              │
│  解决方案：                                                  │
│                                                              │
│  beforesleep 在每次事件循环开始前执行：                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • handleClientsWithPendingWrites                        ││
│  │   直接发送输出缓冲区数据（不用等待可写事件）             ││
│  │   如果发送不完，再注册可写事件                           ││
│  │                                                         ││
│  │ • flushAppendOnlyFile                                   ││
│  │   及时将 AOF 缓冲区数据刷盘                              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  效果：                                                      │
│  • 降低客户端延迟                                           │
│  • 提高数据安全性                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 七、Redis 6.0 多线程 IO

### 7.1 多线程 IO 背景

Redis 6.0 引入了多线程 IO，但命令执行仍是单线程：

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 6.0 多线程 IO                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  为什么需要多线程 IO？                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • 单线程 IO 在高并发下成为瓶颈                          ││
│  │ • 网络数据读写占用大量 CPU                              ││
│  │ • 现代 CPU 多核，充分利用多核优势                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  架构设计：                                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  ┌─────────────────────────────────────────────────┐   ││
│  │  │           主线程（命令执行）                      │   ││
│  │  │           单线程处理命令                          │   ││
│  │  └─────────────────────────────────────────────────┘   ││
│  │                         ▲                               ││
│  │                         │                               ││
│  │  ┌─────────────────────────────────────────────────┐   ││
│  │  │           IO 线程组                              │   ││
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │   ││
│  │  │  │ IO 线程1│ │ IO 线程2│ │ IO 线程3│           │   ││
│  │  │  │ 读数据  │ │ 读数据  │ │ 读数据  │           │   ││
│  │  │  │ 写数据  │ │ 写数据  │ │ 写数据  │           │   ││
│  │  │  └─────────┘ └─────────┘ └─────────┘           │   ││
│  │  └─────────────────────────────────────────────────┘   ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  工作流程：                                                  │
│  1. IO 线程读取数据到缓冲区                                 │
│  2. 主线程执行命令                                          │
│  3. IO 线程发送响应数据                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 多线程 IO 配置

```bash
# redis.conf

# 开启多线程 IO
io-threads 4

# 开启读线程
io-threads-do-reads yes
```

## 八、总结

本章深入分析了 Redis 的事件驱动模型：

| 组件 | 功能 | 特点 |
|------|------|------|
| aeEventLoop | 事件循环 | 单线程处理所有事件 |
| 文件事件 | 网络IO | IO 多路复用 |
| 时间事件 | 定时任务 | serverCron 核心 |
| beforesleep | 预处理 | 降低延迟 |

Redis 通过精巧的事件驱动设计，在单线程中实现了高性能网络服务。下一章将深入分析 Redis 的复制与哨兵机制。

## 参考资料

- [Redis Source Code - ae.h](https://github.com/redis/redis/blob/unstable/src/ae.h)
- [Redis Source Code - ae.c](https://github.com/redis/redis/blob/unstable/src/ae.c)
- [Redis Source Code - ae_epoll.c](https://github.com/redis/redis/blob/unstable/src/ae_epoll.c)
- 《Redis设计与实现》- 黄健宏
