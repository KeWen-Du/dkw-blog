---
title: "Redis底层原理（五）：持久化机制详解"
date: "2024-03-18"
excerpt: "深入理解Redis的RDB快照和AOF日志两种持久化机制，掌握混合持久化的工作原理，为生产环境数据安全提供保障。"
tags: ["Redis", "持久化", "RDB", "AOF", "数据安全"]
---

## 前言

Redis 作为内存数据库，数据存储在内存中，一旦服务器退出，内存中的数据就会丢失。为了保证数据安全，Redis 提供了两种持久化机制：RDB（Redis Database）快照和 AOF（Append Only File）日志。本章将深入分析这两种持久化机制的实现原理。

## 一、持久化概述

### 1.1 为什么需要持久化？

```
┌──────────────────────────────────────────────────────────────┐
│                    持久化的必要性                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  内存数据                                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Key1 → Value1                                          ││
│  │  Key2 → Value2                                          ││
│  │  Key3 → Value3                                          ││
│  │  ...                                                    ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │           服务重启/崩溃 → 内存数据丢失                   ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              持久化机制 → 数据持久保存                   ││
│  │                                                         ││
│  │   方案一：RDB 快照       方案二：AOF 日志               ││
│  │   定时保存内存快照       记录每个写命令                 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 两种持久化方式对比

```
┌──────────────────────────────────────────────────────────────┐
│                    RDB vs AOF 对比                            │
├─────────────────┬──────────────────┬────────────────────────┤
│     特性        │       RDB        │         AOF            │
├─────────────────┼──────────────────┼────────────────────────┤
│ 持久化方式      │ 全量快照          │ 增量日志               │
│ 文件大小        │ 较小（压缩）      │ 较大                   │
│ 恢复速度        │ 快               │ 慢                     │
│ 数据安全性      │ 可能丢失几分钟数据 │ 最多丢失 1 秒数据      │
│ 系统资源消耗    │ fork 开销         │ 持续写入开销           │
│ 适用场景        │ 备份、容灾        │ 数据安全要求高         │
└─────────────────┴──────────────────┴────────────────────────┘

推荐配置：RDB + AOF 混合使用
```

## 二、RDB 持久化

### 2.1 RDB 简介

RDB 持久化是将当前内存中的数据生成快照保存到磁盘的二进制文件中。

```
┌──────────────────────────────────────────────────────────────┐
│                    RDB 工作原理                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  触发条件                                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 1. 手动触发：SAVE / BGSAVE 命令                         ││
│  │ 2. 自动触发：配置文件中设置 save 规则                   ││
│  │ 3. 主从复制：主节点自动执行 BGSAVE                      ││
│  │ 4. 关闭服务：SHUTDOWN 时（默认开启）                    ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    BGSAVE 执行流程                       ││
│  │                                                         ││
│  │  Redis 主进程                                           ││
│  │  ┌───────────────────────────────────────────────────┐ ││
│  │  │  1. fork() 创建子进程                              │ ││
│  │  │         ↓                                         │ ││
│  │  │  ┌─────────────┐    ┌─────────────┐              │ ││
│  │  │  │  主进程      │    │  子进程      │              │ ││
│  │  │  │  继续处理    │    │  生成 RDB    │              │ ││
│  │  │  │  客户端请求  │    │  文件        │              │ ││
│  │  │  └─────────────┘    └─────────────┘              │ ││
│  │  │                              │                     │ ││
│  │  │                              ▼                     │ ││
│  │  │                    ┌─────────────────┐            │ ││
│  │  │                    │ dump.rdb 文件    │            │ ││
│  │  │                    └─────────────────┘            │ ││
│  │  └───────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 RDB 文件结构

```
┌──────────────────────────────────────────────────────────────┐
│                    RDB 文件结构                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┬──────────┬──────────┬────────────────────────┐│
│  │  REDIS   │  VERSION │  SELECT  │   DATABASE DATA        ││
│  │  5 bytes │  4 bytes │  DB ID   │   ...                  ││
│  └──────────┴──────────┴──────────┴────────────────────────┘│
│  ┌──────────┬──────────┬──────────┬────────────────────────┐│
│  │  EOF     │  CHECKSUM│          │                        ││
│  │  1 byte  │  8 bytes │          │                        ││
│  └──────────┴──────────┴──────────┴────────────────────────┘│
│                                                              │
│  详细结构：                                                  │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ REDIS      │ 魔数，固定为 "REDIS"                       ││
│  ├────────────┼────────────────────────────────────────────┤│
│  │ VERSION    │ RDB 版本号，如 "0009"                      ││
│  ├────────────┼────────────────────────────────────────────┤│
│  │ SELECT     │ 数据库编号                                ││
│  ├────────────┼────────────────────────────────────────────┤│
│  │ RESIZEDB   │ 数据库大小信息（可选）                     ││
│  ├────────────┼────────────────────────────────────────────┤│
│  │ KEY-VALUE  │ 键值对数据                                ││
│  │   ├── KEY  │ 键名                                      ││
│  │   ├── TYPE │ 值类型                                    ││
│  │   └── VALUE│ 值数据                                    ││
│  ├────────────┼────────────────────────────────────────────┤│
│  │ EXPIRE     │ 过期时间（可选）                           ││
│  ├────────────┼────────────────────────────────────────────┤│
│  │ EOF        │ 结束标志                                  ││
│  ├────────────┼────────────────────────────────────────────┤│
│  │ CHECKSUM   │ 校验和                                    ││
│  └────────────┴────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 RDB 源码分析

#### 2.3.1 BGSAVE 命令实现

```c
// rdb.c
int rdbSaveBackground(char *filename, rdbSaveInfo *rsi) {
    pid_t childpid;
    
    // 已有子进程在执行
    if (server.rdb_child_pid != -1) return C_ERR;
    
    // 创建管道用于父子进程通信
    int fds[2];
    if (pipe(fds)) return C_ERR;
    
    server.child_type = CHILD_TYPE_RDB;
    
    // fork 子进程
    if ((childpid = redisFork(CHILD_TYPE_RDB)) == 0) {
        // 子进程
        int retval;
        closeListeningSockets(0);
        redisSetProcTitle("redis-rdb-bgsave");
        
        // 执行 RDB 保存
        retval = rdbSave(filename, rsi);
        
        // 发送完成信号给父进程
        if (retval == C_OK) {
            sendChildCOWInfo(CHILD_TYPE_RDB, 1, "RDB");
        }
        
        exitFromChild((retval == C_OK) ? 0 : 1);
    } else {
        // 父进程
        close(fds[1]);
        server.rdb_pipe_read = fds[0];
        server.rdb_child_pid = childpid;
        server.rdb_save_time_start = time(NULL);
        server.rdb_filename = zstrdup(filename);
        
        return C_OK;
    }
    return C_OK;
}
```

#### 2.3.2 RDB 保存实现

```c
// rdb.c
int rdbSave(char *filename, rdbSaveInfo *rsi) {
    char tmpfile[256];
    FILE *fp;
    rio rdb;
    int error = 0;
    
    // 生成临时文件名
    snprintf(tmpfile, 256, "temp-%d.rdb", (int)getpid());
    
    // 打开文件
    fp = fopen(tmpfile, "w");
    if (!fp) {
        serverLog(LL_WARNING, "Failed opening .rdb for saving: %s",
                  strerror(errno));
        return C_ERR;
    }
    
    // 初始化 rio 结构
    rioInitWithFile(&rdb, fp);
    
    // 设置自动同步
    if (server.rdb_save_incremental_fsync)
        rioSetAutoSync(&rdb, REDIS_AUTOSYNC_BYTES);
    
    // 写入 RDB 数据
    if (rdbSaveRio(&rdb, &error, RDBFLAGS_NONE, rsi) == C_ERR) {
        errno = error;
        goto werr;
    }
    
    // 确保数据写入磁盘
    if (fflush(fp)) goto werr;
    if (fsync(fileno(fp))) goto werr;
    if (fclose(fp)) goto werr;
    
    // 重命名文件
    if (rename(tmpfile, filename) == -1) {
        serverLog(LL_WARNING, "Error moving temp DB file on the final destination: %s",
                  strerror(errno));
        unlink(tmpfile);
        return C_ERR;
    }
    
    serverLog(LL_NOTICE, "DB saved on disk");
    server.dirty = 0;
    server.lastsave = time(NULL);
    server.lastbgsave_status = C_OK;
    
    return C_OK;

werr:
    serverLog(LL_WARNING, "Write error saving DB on disk: %s", strerror(errno));
    fclose(fp);
    unlink(tmpfile);
    return C_ERR;
}
```

#### 2.3.3 写入键值对

```c
// rdb.c
int rdbSaveRio(rio *rdb, int *error, int rdbflags, rdbSaveInfo *rsi) {
    // 写入魔数和版本
    if (rdbWriteRaw(rdb, magic, 9) == -1) goto werr;
    
    // 写入辅助字段
    if (rdbSaveInfoAuxFields(rdb, rdbflags, rsi) == -1) goto werr;
    
    // 遍历所有数据库
    for (j = 0; j < server.dbnum; j++) {
        redisDb *db = server.db + j;
        
        if (db->dict->used == 0) continue;
        
        // 写入 SELECTDB
        if (rdbSaveType(rdb, RDB_OPCODE_SELECTDB) == -1) goto werr;
        if (rdbSaveLen(rdb, j) == -1) goto werr;
        
        // 写入数据库大小
        uint64_t db_size = dictSize(db->dict);
        uint64_t expires_size = dictSize(db->expires);
        if (rdbSaveType(rdb, RDB_OPCODE_RESIZEDB) == -1) goto werr;
        if (rdbSaveLen(rdb, db_size) == -1) goto werr;
        if (rdbSaveLen(rdb, expires_size) == -1) goto werr;
        
        // 遍历并写入键值对
        while((de = dictNext(di)) != NULL) {
            sds keystr = dictGetKey(de);
            robj key, *o = dictGetVal(de);
            initStaticStringObject(key, keystr);
            
            // 写入过期时间
            expiretime = getExpire(db, &key);
            if (expiretime != -1) {
                if (rdbSaveType(rdb, RDB_OPCODE_EXPIRETIME_MS) == -1) goto werr;
                if (rdbSaveMillisecondTime(rdb, expiretime) == -1) goto werr;
            }
            
            // 写入键值对
            if (rdbSaveKeyValuePair(rdb, &key, o, expiretime) == -1) goto werr;
        }
    }
    
    // 写入 EOF
    if (rdbSaveType(rdb, RDB_OPCODE_EOF) == -1) goto werr;
    
    // 写入校验和
    uint64_t checksum = rdb->processed_bytes;
    if (rioWrite(rdb, &checksum, 8) == 0) goto werr;
    
    return C_OK;

werr:
    if (error) *error = errno;
    return C_ERR;
}
```

### 2.4 RDB 配置

```bash
# redis.conf

# RDB 自动触发条件
# 格式：save <秒数> <修改次数>
save 900 1      # 900 秒内至少 1 次修改
save 300 10     # 300 秒内至少 10 次修改
save 60 10000   # 60 秒内至少 10000 次修改

# 禁用 RDB
# save ""

# RDB 文件名
dbfilename dump.rdb

# RDB 文件存储目录
dir ./

# 压缩（默认开启）
rdbcompression yes

# 校验和（默认开启）
rdbchecksum yes

# 后台保存失败时停止写入
stop-writes-on-bgsave-error yes
```

### 2.5 RDB 的优缺点

```
┌──────────────────────────────────────────────────────────────┐
│                    RDB 优缺点分析                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  优点：                                                      │
│  ✅ 文件紧凑，适合备份和传输                                  │
│  ✅ 恢复速度快，直接加载到内存                               │
│  ✅ 对性能影响小，fork 后主进程继续服务                       │
│  ✅ 适合灾难恢复                                             │
│                                                              │
│  缺点：                                                      │
│  ❌ 数据安全性低，可能丢失几分钟数据                          │
│  ❌ fork 大数据集时可能阻塞（Copy-on-Write）                  │
│  ❌ 不适合实时持久化                                          │
│                                                              │
│  适用场景：                                                  │
│  • 允许少量数据丢失                                          │
│  • 数据量较大，对恢复速度有要求                               │
│  • 作为 AOF 的补充                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 三、AOF 持久化

### 3.1 AOF 简介

AOF（Append Only File）通过记录所有写命令来实现持久化。

```
┌──────────────────────────────────────────────────────────────┐
│                    AOF 工作原理                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  客户端发送命令                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  SET key1 value1                                        ││
│  │  LPUSH list a b c                                       ││
│  │  SADD set1 member1                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    AOF 写入流程                         ││
│  │                                                         ││
│  │  命令执行 ──► AOF 缓冲区 ──► AOF 文件                   ││
│  │                   │                                     ││
│  │                   ▼                                     ││
│  │              根据策略刷盘                                ││
│  │         ┌───────────────────────────┐                   ││
│  │         │ always  │ everysec │ no   │                   ││
│  │         │ 每次写入 │ 每秒     │系统决定│                   ││
│  │         └───────────────────────────┘                   ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ appendonly.aof 文件内容：                               ││
│  │                                                         ││
│  │ *3                                                      ││
│  │ $3                                                      ││
│  │ SET                                                      ││
│  │ $4                                                      ││
│  │ key1                                                     ││
│  │ $6                                                      ││
│  │ value1                                                   ││
│  │ ...                                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 AOF 文件格式

AOF 文件使用 RESP 协议格式存储命令：

```
┌──────────────────────────────────────────────────────────────┐
│                    AOF 文件格式（RESP 协议）                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  命令：SET mykey myvalue                                     │
│                                                              │
│  AOF 文件内容：                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ *3\r\n                   # 参数数量 = 3                  ││
│  │ $3\r\n                   # 第一个参数长度 = 3            ││
│  │ SET\r\n                  # 第一个参数值                  ││
│  │ $5\r\n                   # 第二个参数长度 = 5            ││
│  │ mykey\r\n                # 第二个参数值                  ││
│  │ $7\r\n                   # 第三个参数长度 = 7            ││
│  │ myvalue\r\n              # 第三个参数值                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  批量命令示例：                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ *3\r\n$3\r\nSET\r\n$4\r\ncity\r\n$7\r\nBeijing\r\n      ││
│  │ *4\r\n$5\r\nLPUSH\r\n$4\r\nlist\r\n$1\r\na\r\n$1\r\nb\r\n││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 AOF 源码分析

#### 3.3.1 命令追加

```c
// aof.c
void feedAppendOnlyFile(struct redisCommand *cmd, int dictid, robj **argv, int argc) {
    sds buf = sdsempty();
    robj *tmpargv[3];
    
    // 如果正在 SELECT 不同的数据库
    if (dictid != server.aof_selected_db) {
        char seldb[64];
        snprintf(seldb, sizeof(seldb), "%d", dictid);
        buf = sdscatprintf(buf, "*2\r\n$6\r\nSELECT\r\n$%lu\r\n%s\r\n",
                           (unsigned long)strlen(seldb), seldb);
        server.aof_selected_db = dictid;
    }
    
    // 过期时间处理
    if (cmd->proc == expireCommand || cmd->proc == pexpireCommand ||
        cmd->proc == expireatCommand || cmd->proc == pexpireatCommand) {
        // 将 EXPIRE 转换为 PEXPIREAT
        buf = catAppendOnlyExpireAtCommand(buf, cmd, argv[1], argv[2]);
    } else {
        // 普通命令，序列化为 RESP 格式
        buf = catAppendOnlyGenericCommand(buf, argc, argv);
    }
    
    // 追加到 AOF 缓冲区
    if (server.aof_state == AOF_ON) {
        server.aof_buf = sdscatlen(server.aof_buf, buf, sdslen(buf));
    }
    
    // 如果有 AOF 重写子进程，也追加到重写缓冲区
    if (server.aof_child_pid != -1) {
        aofRewriteBufferAppend((unsigned char *)buf, sdslen(buf));
    }
    
    sdsfree(buf);
}

// 将命令序列化为 RESP 格式
sds catAppendOnlyGenericCommand(sds dst, int argc, robj **argv) {
    char buf[32];
    int len, j;
    robj *o;
    
    // 写入参数数量
    len = ll2string(buf, sizeof(buf), argc);
    dst = sdscatlen(dst, "*", 1);
    dst = sdscatlen(dst, buf, len);
    dst = sdscatlen(dst, "\r\n", 2);
    
    // 写入每个参数
    for (j = 0; j < argc; j++) {
        o = getDecodedObject(argv[j]);
        len = ll2string(buf, sizeof(buf), sdslen(o->ptr));
        dst = sdscatlen(dst, "$", 1);
        dst = sdscatlen(dst, buf, len);
        dst = sdscatlen(dst, "\r\n", 2);
        dst = sdscatlen(dst, o->ptr, sdslen(o->ptr));
        dst = sdscatlen(dst, "\r\n", 2);
        decrRefCount(o);
    }
    
    return dst;
}
```

#### 3.3.2 AOF 刷盘

```c
// aof.c
void flushAppendOnlyFile(int force) {
    ssize_t nwritten;
    int sync_in_progress = 0;
    mstime_t latency;
    
    // 缓冲区为空
    if (sdslen(server.aof_buf) == 0) {
        // 检查是否需要同步
        if (server.aof_fsync == AOF_FSYNC_EVERYSEC &&
            server.aof_fsync_offset != server.aof_current_size &&
            server.unixtime > server.aof_last_fsync + 1) {
            aof_fsync(server.aof_fd);
            server.aof_fsync_offset = server.aof_current_size;
        }
        return;
    }
    
    // 检查是否有正在进行的同步
    if (server.aof_fsync == AOF_FSYNC_EVERYSEC) {
        sync_in_progress = aofFsyncInProgress();
    }
    
    // 如果有同步在进行且不需要强制
    if (sync_in_progress && !force) {
        if (server.aof_flush_postponed_start == 0) {
            server.aof_flush_postponed_start = server.unixtime;
            return;
        } else if (server.unixtime - server.aof_flush_postponed_start < 2) {
            return;
        }
        server.aof_delayed_fsync++;
    }
    
    // 写入 AOF 文件
    latencyStartMonitor(latency);
    nwritten = aofWrite(server.aof_fd, server.aof_buf, sdslen(server.aof_buf));
    latencyEndMonitor(latency);
    
    if (nwritten != (ssize_t)sdslen(server.aof_buf)) {
        // 写入失败处理
        // ...
    }
    
    server.aof_current_size += nwritten;
    
    // 清空缓冲区
    if ((nwritten + server.aof_rewrite_submitted) == 0) {
        sdsfree(server.aof_buf);
        server.aof_buf = sdsempty();
    } else {
        server.aof_buf = sdsrange(server.aof_buf, nwritten, -1);
    }
    
    // 根据策略同步
    if (server.aof_fsync == AOF_FSYNC_ALWAYS) {
        // 每次写入都同步
        aof_fsync(server.aof_fd);
        server.aof_fsync_offset = server.aof_current_size;
    } else if (server.aof_fsync == AOF_FSYNC_EVERYSEC) {
        // 每秒同步一次
        if (server.unixtime > server.aof_last_fsync + 1) {
            aof_background_fsync(server.aof_fd);
            server.aof_fsync_offset = server.aof_current_size;
        }
    }
    // AOF_FSYNC_NO: 由操作系统决定
}
```

### 3.4 AOF 重写

随着写操作的增加，AOF 文件会越来越大。Redis 提供了 AOF 重写机制来压缩文件。

```
┌──────────────────────────────────────────────────────────────┐
│                    AOF 重写原理                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  原始 AOF 文件：                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ SET count 1                                             ││
│  │ INCR count              ──►  count = 2                  ││
│  │ INCR count              ──►  count = 3                  ││
│  │ INCR count              ──►  count = 4                  ││
│  │ LPUSH list a                                            ││
│  │ LPUSH list b            ──►  list = [b, a]              ││
│  │ LPUSH list c            ──►  list = [c, b, a]           ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                           ▼                                  │
│  重写后的 AOF 文件：                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ SET count 4              # 直接保存最终值                ││
│  │ RPUSH list c b a         # 一条命令重建列表              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  重写特点：                                                  │
│  • 读取当前内存数据生成新文件                                │
│  • 不需要分析原 AOF 文件                                    │
│  • 合并多条命令为一条                                        │
│  • 过期数据不会写入                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 3.4.1 AOF 重写实现

```c
// aof.c
int rewriteAppendOnlyFile(char *filename) {
    rio aof;
    FILE *fp;
    char tmpfile[256];
    
    // 创建临时文件
    snprintf(tmpfile, 256, "temp-rewriteaof-%d.aof", (int)getpid());
    fp = fopen(tmpfile, "w");
    if (!fp) return C_ERR;
    
    // 初始化 rio
    rioInitWithFile(&aof, fp);
    
    // 设置自动同步
    if (server.aof_rewrite_incremental_fsync)
        rioSetAutoSync(&aof, REDIS_AUTOSYNC_BYTES);
    
    // 遍历所有数据库
    for (j = 0; j < server.dbnum; j++) {
        char selectcmd[] = "*2\r\n$6\r\nSELECT\r\n";
        redisDb *db = server.db + j;
        dict *d = db->dict;
        
        if (dictSize(d) == 0) continue;
        
        // 写入 SELECT 命令
        if (rioWrite(&aof, selectcmd, sizeof(selectcmd) - 1) == 0) goto werr;
        if (rioWriteBulkLongLong(&aof, j) == 0) goto werr;
        
        // 遍历键值对
        di = dictGetSafeIterator(d);
        while ((de = dictNext(di)) != NULL) {
            sds keystr;
            robj key, *o;
            long long expiretime;
            
            keystr = dictGetKey(de);
            o = dictGetVal(de);
            initStaticStringObject(key, keystr);
            
            // 获取过期时间
            expiretime = getExpire(db, &key);
            
            // 跳过已过期的键
            if (expiretime != -1 && expiretime < server.unixtime) continue;
            
            // 根据类型写入命令
            if (o->type == OBJ_STRING) {
                // String 类型
                char cmd[] = "*3\r\n$3\r\nSET\r\n";
                if (rioWrite(&aof, cmd, sizeof(cmd) - 1) == 0) goto werr;
                if (rioWriteBulkObject(&aof, &key) == 0) goto werr;
                if (rioWriteBulkObject(&aof, o) == 0) goto werr;
            } else if (o->type == OBJ_LIST) {
                // List 类型
                if (rewriteListObject(&aof, &key, o) == 0) goto werr;
            } else if (o->type == OBJ_SET) {
                // Set 类型
                if (rewriteSetObject(&aof, &key, o) == 0) goto werr;
            } else if (o->type == OBJ_ZSET) {
                // ZSet 类型
                if (rewriteSortedSetObject(&aof, &key, o) == 0) goto werr;
            } else if (o->type == OBJ_HASH) {
                // Hash 类型
                if (rewriteHashObject(&aof, &key, o) == 0) goto werr;
            }
            
            // 写入过期时间
            if (expiretime != -1) {
                char cmd[] = "*3\r\n$9\r\nPEXPIREAT\r\n";
                if (rioWrite(&aof, cmd, sizeof(cmd) - 1) == 0) goto werr;
                if (rioWriteBulkObject(&aof, &key) == 0) goto werr;
                if (rioWriteBulkLongLong(&aof, expiretime) == 0) goto werr;
            }
        }
    }
    
    // 写入结束
    if (fflush(fp)) goto werr;
    if (fsync(fileno(fp))) goto werr;
    if (fclose(fp)) goto werr;
    
    // 重命名文件
    if (rename(tmpfile, filename) == -1) {
        unlink(tmpfile);
        return C_ERR;
    }
    
    return C_OK;

werr:
    fclose(fp);
    unlink(tmpfile);
    return C_ERR;
}
```

#### 3.4.2 AOF 重写期间的命令处理

```
┌──────────────────────────────────────────────────────────────┐
│                AOF 重写期间的命令处理                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      主进程                             ││
│  │                                                         ││
│  │  客户端命令 ──► 执行命令                                ││
│  │                    │                                    ││
│  │          ┌────────┴────────┐                           ││
│  │          ▼                 ▼                           ││
│  │    AOF 缓冲区      AOF 重写缓冲区                       ││
│  │    (追加命令)      (记录重写期间的新命令)                ││
│  │          │                 │                           ││
│  │          ▼                 │                           ││
│  │    原有 AOF 文件           │                           ││
│  └─────────────────────────────────────────────────────────┘│
│                              │                               │
│                              │ fork                          │
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      子进程                             ││
│  │                                                         ││
│  │  遍历内存数据 ──► 生成新 AOF 文件                       ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                              │                               │
│                              │ 完成                          │
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    重写完成                             ││
│  │                                                         ││
│  │  1. 将重写缓冲区命令追加到新 AOF 文件                   ││
│  │  2. 原子性地用新文件替换旧文件                          ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.5 AOF 配置

```bash
# redis.conf

# 开启 AOF
appendonly yes

# AOF 文件名
appendfilename "appendonly.aof"

# 刷盘策略
# always: 每次写入都同步，最安全但最慢
# everysec: 每秒同步一次，推荐（默认）
# no: 由操作系统决定，最快但最不安全
appendfsync everysec

# AOF 重写期间是否禁用 fsync
no-appendfsync-on-rewrite no

# AOF 重写触发条件
auto-aof-rewrite-percentage 100   # 文件大小比上次重写后增长 100%
auto-aof-rewrite-min-size 64mb    # 文件最小 64MB 才触发重写

# 加载损坏的 AOF 文件
aof-load-truncated yes

# 使用 RDB-AOF 混合持久化
aof-use-rdb-preamble yes
```

## 四、混合持久化

### 4.1 混合持久化原理

Redis 4.0 引入了 RDB-AOF 混合持久化，结合了两者的优点：

```
┌──────────────────────────────────────────────────────────────┐
│                    混合持久化原理                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  混合持久化文件结构：                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    混合 AOF 文件                        ││
│  │  ┌─────────────────────────┬─────────────────────────┐ ││
│  │  │      RDB 格式数据       │    AOF 格式增量命令     │ ││
│  │  │    （基础数据快照）      │  （重写期间的新命令）    │ ││
│  │  └─────────────────────────┴─────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  重写过程：                                                  │
│                                                              │
│  Step 1: fork 子进程                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  主进程：继续处理命令，记录到重写缓冲区                  ││
│  │  子进程：生成 RDB 格式快照写入新文件                     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Step 2: RDB 快照完成                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  子进程：将重写缓冲区的 AOF 命令追加到新文件             ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Step 3: 原子替换                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  主进程：用新文件替换旧 AOF 文件                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  优势：                                                      │
│  • RDB 部分加载快，快速恢复基础数据                          │
│  • AOF 部分保证数据完整性                                    │
│  • 文件大小适中                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 混合持久化配置

```bash
# redis.conf

# 开启混合持久化（需要同时开启 AOF）
aof-use-rdb-preamble yes
```

## 五、持久化恢复

### 5.1 恢复流程

```
┌──────────────────────────────────────────────────────────────┐
│                    Redis 启动恢复流程                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Redis 启动                                                 │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 检查是否开启 AOF                                         ││
│  │ (appendonly = yes?)                                      ││
│  └─────────────────────────────────────────────────────────┘│
│       │                                                      │
│       ├── 是 ──► 加载 AOF 文件恢复数据                       │
│       │                  │                                   │
│       │                  ▼                                   │
│       │           ┌───────────────────────────────────┐     │
│       │           │ 检查 AOF 文件开头是否为 RDB 格式   │     │
│       │           │ (混合持久化)                      │     │
│       │           └───────────────────────────────────┘     │
│       │                    │                                 │
│       │                    ├── 是 ──► 先加载 RDB 部分        │
│       │                    │          再加载 AOF 部分        │
│       │                    │                                 │
│       │                    └── 否 ──► 直接加载 AOF 命令      │
│       │                                                      │
│       └── 否 ──► 加载 RDB 文件恢复数据                       │
│                                                              │
│  注意：                                                      │
│  • AOF 优先级高于 RDB                                        │
│  • 文件不存在时正常启动                                       │
│  • 文件损坏时会启动失败                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 数据恢复时间对比

| 数据量 | RDB 恢复 | AOF 恢复 | 混合恢复 |
|--------|----------|----------|----------|
| 1GB | ~10s | ~30s | ~15s |
| 10GB | ~100s | ~300s | ~150s |
| 100GB | ~1000s | ~3000s | ~1500s |

## 六、生产环境最佳实践

### 6.1 持久化策略选择

```
┌──────────────────────────────────────────────────────────────┐
│                    持久化策略选择指南                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  场景一：允许分钟级数据丢失                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 推荐配置：只开 RDB                                       ││
│  │ save 900 1                                               ││
│  │ save 300 10                                              ││
│  │ appendonly no                                            ││
│  │                                                         ││
│  │ 优点：性能最优，文件最小                                 ││
│  │ 缺点：可能丢失几分钟数据                                 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  场景二：数据安全要求高                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 推荐配置：AOF + 混合持久化                               ││
│  │ appendonly yes                                           ││
│  │ appendfsync everysec                                     ││
│  │ aof-use-rdb-preamble yes                                 ││
│  │                                                         ││
│  │ 优点：最多丢失 1 秒数据                                  ││
│  │ 缺点：文件较大，恢复稍慢                                 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  场景三：兼顾性能和数据安全                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 推荐配置：RDB + AOF 混合                                 ││
│  │ save 900 1                                               ││
│  │ save 300 10                                              ││
│  │ save 60 10000                                            ││
│  │ appendonly yes                                           ││
│  │ appendfsync everysec                                     ││
│  │ aof-use-rdb-preamble yes                                 ││
│  │                                                         ││
│  │ 优点：RDB 用于快速恢复，AOF 用于数据完整性               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 监控指标

```bash
# 查看 RDB 状态
INFO persistence
# 关注指标：
# rdb_last_save_time: 上次保存时间
# rdb_changes_since_last_save: 上次保存后的修改次数
# rdb_last_bgsave_status: 上次 BGSAVE 状态
# rdb_last_bgsave_time_sec: 上次 BGSAVE 耗时

# 查看 AOF 状态
INFO persistence
# 关注指标：
# aof_enabled: AOF 是否开启
# aof_current_size: AOF 文件大小
# aof_base_size: 上次重写时的大小
# aof_pending_rewrite: 是否有待执行的重写
# aof_last_rewrite_time_sec: 上次重写耗时
```

### 6.3 故障恢复流程

```
┌──────────────────────────────────────────────────────────────┐
│                    故障恢复流程                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. AOF 文件损坏                                            │
│     ┌─────────────────────────────────────────────────────┐ │
│     │ # 使用 redis-check-aof 工具修复                     │ │
│     │ redis-check-aof --fix appendonly.aof                │ │
│     │                                                     │ │
│     │ # 如果有 RDB 备份，可以使用 RDB 恢复                │ │
│     │ cp dump.rdb dump.rdb.bak                            │ │
│     │ cp backup/dump.rdb ./                               │ │
│     └─────────────────────────────────────────────────────┘ │
│                                                              │
│  2. RDB 文件损坏                                            │
│     ┌─────────────────────────────────────────────────────┐ │
│     │ # 使用 redis-check-rdb 检查                         │ │
│     │ redis-check-rdb dump.rdb                            │ │
│     │                                                     │ │
│     │ # RDB 损坏通常无法修复，需要使用备份                │ │
│     └─────────────────────────────────────────────────────┘ │
│                                                              │
│  3. 完全灾难恢复                                            │
│     ┌─────────────────────────────────────────────────────┐ │
│     │ # 1. 停止 Redis                                     │ │
│     │ # 2. 从备份恢复数据文件                             │ │
│     │ # 3. 启动 Redis                                     │ │
│     │ # 4. 验证数据完整性                                 │ │
│     └─────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 七、总结

本章深入分析了 Redis 的持久化机制：

| 特性 | RDB | AOF | 混合持久化 |
|------|-----|-----|------------|
| 数据安全 | 低 | 高 | 高 |
| 恢复速度 | 快 | 慢 | 较快 |
| 文件大小 | 小 | 大 | 中等 |
| 系统开销 | 低（fork） | 中（持续写入） | 中 |
| 推荐场景 | 备份/容灾 | 数据安全 | 综合 |

下一章将深入分析 Redis 的事件驱动模型。

## 参考资料

- [Redis Source Code - rdb.c](https://github.com/redis/redis/blob/unstable/src/rdb.c)
- [Redis Source Code - aof.c](https://github.com/redis/redis/blob/unstable/src/aof.c)
- [Redis Persistence Documentation](https://redis.io/topics/persistence)
- 《Redis设计与实现》- 黄健宏
