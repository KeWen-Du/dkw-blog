---
title: "Dubbo 底层原理系列（七）：集群容错"
date: "2020-09-03"
excerpt: "深入解析 Dubbo 集群容错原理，包括 Failover、Failfast、Failsafe、Failback、Forking、Broadcast 等容错模式。"
tags: ["Dubbo", "RPC", "集群容错", "微服务"]
series:
  slug: "dubbo-core-principles"
  title: "Dubbo 底层原理系列"
  order: 7
---

## 前言

集群容错是 Dubbo 保证服务可靠性的核心机制，提供了多种容错策略应对不同的故障场景。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Failover | ⭐⭐⭐ | 高频考点 | ✅ |
| Failfast | ⭐⭐⭐ | 高频考点 | ✅ |
| Failsafe | ⭐⭐⭐ | 进阶考点 | ✅ |
| Failback | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Forking | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Broadcast | ⭐⭐⭐ | 进阶考点 | ✅ |

## 面试考点

1. Dubbo 支持哪些集群容错模式？
2. Failover 失败重试是如何实现的？
3. Failback 失败自动恢复的原理是什么？
4. 各容错模式适用于什么场景？

## 集群容错接口

### Cluster 接口

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cluster 接口                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  @SPI("failover")                                               │   │
│  │  public interface Cluster {                                    │   │
│  │      @Adaptive                                                  │   │
│  │      <T> Invoker<T> join(Directory<T> directory);               │   │
│  │  }                                                              │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  容错模式：                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  模式          说明                     适用场景                 │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Failover     失败重试（默认）        幂等操作                   │   │
│  │  Failfast     快速失败                非幂等操作                 │   │
│  │  Failsafe     失败安全                日志、审计                 │   │
│  │  Failback     失败自动恢复            消息通知                   │   │
│  │  Forking      并行调用                实时性要求高               │   │
│  │  Broadcast    广播调用                状态更新                   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  配置方式：                                                             │
│  <dubbo:reference cluster="failover" retries="2" />                    │
│  <dubbo:service cluster="failfast" />                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### AbstractClusterInvoker

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AbstractClusterInvoker                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  public abstract class AbstractClusterInvoker<T>                │   │
│  │      implements Invoker<T> {                                    │   │
│  │                                                                 │   │
│  │      protected final Directory<T> directory;                    │   │
│  │                                                                 │   │
│  │      @Override                                                  │   │
│  │      public Result invoke(Invocation invocation) throws RpcException {│
│  │          // 检查是否已销毁                                       │   │
│  │          checkDestroyed();                                      │   │
│  │                                                                 │   │
│  │          // 获取 Invoker 列表                                    │   │
│  │          List<Invoker<T>> invokers = directory.list(invocation);│   │
│  │                                                                 │   │
│  │          // 获取负载均衡策略                                     │   │
│  │          LoadBalance loadbalance = initLoadBalance(invokers, invocation);│
│  │                                                                 │   │
│  │          // 子类实现具体容错逻辑                                 │   │
│  │          return doInvoke(invocation, invokers, loadbalance);    │   │
│  │      }                                                          │   │
│  │                                                                 │   │
│  │      // 子类实现                                                 │   │
│  │      protected abstract Result doInvoke(                        │   │
│  │          Invocation invocation, List<Invoker<T>> invokers,      │   │
│  │          LoadBalance loadbalance) throws RpcException;          │   │
│  │  }                                                              │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Failover 失败重试

### 原理与流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Failover 失败重试                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：调用失败后，切换到其他服务器重试                                   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求流程：                                                     │   │
│  │                                                                 │   │
│  │  ┌─────────┐     调用失败      ┌─────────┐     重试            │   │
│  │  │ Server A│ ───────────────► │ Server B│ ───────────────►    │   │
│  │  └─────────┘                   └─────────┘                     │   │
│  │       │                             │                          │   │
│  │       │ 成功                        │ 失败                     │   │
│  │       ▼                             ▼                          │   │
│  │   返回结果                     ┌─────────┐                     │   │
│  │                                │ Server C│ ──► 返回结果        │   │
│  │                                └─────────┘                     │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  配置参数：                                                             │
│  • retries：重试次数（默认 2，不含第一次调用）                            │
│  • 对非业务异常重试                                                     │
│                                                                         │
│  适用场景：                                                             │
│  • 幂等操作（查询、更新）                                               │
│  • 对实时性要求不高                                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 源码实现

```java
public class FailoverClusterInvoker<T> extends AbstractClusterInvoker<T> {

    @Override
    protected Result doInvoke(Invocation invocation, List<Invoker<T>> invokers, 
                               LoadBalance loadbalance) throws RpcException {
        // 获取重试次数
        int len = getUrl().getMethodParameter(invocation.getMethodName(), 
                    RETRIES_KEY, DEFAULT_RETRIES) + 1;
        
        if (len <= 0) {
            len = 1;
        }
        
        // 记录已调用的 Invoker
        List<Invoker<T>> invoked = new ArrayList<>();
        Set<String> providers = new HashSet<>();
        
        RpcException le = null;
        Result result = null;
        
        // 重试循环
        for (int i = 0; i < len; i++) {
            Invoker<T> invoker = select(loadbalance, invocation, invokers, invoked);
            invoked.add(invoker);
            
            try {
                result = invoker.invoke(invocation);
                return result;
            } catch (RpcException e) {
                // 记录异常，继续重试
                le = e;
                providers.add(invoker.getUrl().getAddress());
            } finally {
                // 清除已调用记录
                invoked.clear();
            }
        }
        
        throw new RpcException("Failed to invoke " + len + " times");
    }
}
```

## Failfast 快速失败

### 原理与实现

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Failfast 快速失败                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：调用失败立即报错，不重试                                          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求流程：                                                     │   │
│  │                                                                 │   │
│  │  ┌─────────┐                                                   │   │
│  │  │ Server A│ ──► 成功 ──► 返回结果                              │   │
│  │  └─────────┘                                                   │   │
│  │       │                                                         │   │
│  │       │ 失败                                                    │   │
│  │       ▼                                                         │   │
│  │   立即抛出异常                                                   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  适用场景：                                                             │
│  • 非幂等操作（新增、写入）                                             │
│  • 对实时性要求高                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

```java
public class FailfastClusterInvoker<T> extends AbstractClusterInvoker<T> {

    @Override
    protected Result doInvoke(Invocation invocation, List<Invoker<T>> invokers, 
                               LoadBalance loadbalance) throws RpcException {
        // 选择一个 Invoker
        Invoker<T> invoker = select(loadbalance, invocation, invokers, null);
        
        try {
            // 直接调用，不重试
            return invoker.invoke(invocation);
        } catch (Throwable e) {
            // 立即抛出异常
            throw new RpcException("Failfast invoke " + invocation.getMethodName() 
                + " failed", e);
        }
    }
}
```

## Failsafe 失败安全

### 原理与实现

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Failsafe 失败安全                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：调用失败时，忽略异常，返回空结果                                   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求流程：                                                     │   │
│  │                                                                 │   │
│  │  ┌─────────┐                                                   │   │
│  │  │ Server A│ ──► 成功 ──► 返回结果                              │   │
│  │  └─────────┘                                                   │   │
│  │       │                                                         │   │
│  │       │ 失败                                                    │   │
│  │       ▼                                                         │   │
│  │   记录日志，返回空结果                                           │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  适用场景：                                                             │
│  • 日志记录                                                             │
│  • 审计跟踪                                                             │
│  • 非核心业务                                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

```java
public class FailsafeClusterInvoker<T> extends AbstractClusterInvoker<T> {

    @Override
    protected Result doInvoke(Invocation invocation, List<Invoker<T>> invokers, 
                               LoadBalance loadbalance) throws RpcException {
        Invoker<T> invoker = select(loadbalance, invocation, invokers, null);
        
        try {
            return invoker.invoke(invocation);
        } catch (Throwable e) {
            // 记录日志
            logger.error("Failsafe ignore exception: " + e.getMessage(), e);
            // 返回空结果
            return AsyncRpcResult.newDefaultAsyncResult(null, null, invocation);
        }
    }
}
```

## Failback 失败自动恢复

### 原理与实现

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Failback 失败自动恢复                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：调用失败后，后台记录请求，定时重试                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求流程：                                                     │   │
│  │                                                                 │   │
│  │  ┌─────────┐                                                   │   │
│  │  │ Server A│ ──► 成功 ──► 返回结果                              │   │
│  │  └─────────┘                                                   │   │
│  │       │                                                         │   │
│  │       │ 失败                                                    │   │
│  │       ▼                                                         │   │
│  │   返回空结果，记录到重试队列                                     │   │
│  │       │                                                         │   │
│  │       ▼                                                         │   │
│  │   ┌───────────────────────────────────────────────┐            │   │
│  │   │           定时任务重试队列                      │            │   │
│  │   │  ┌────────┐  ┌────────┐  ┌────────┐          │            │   │
│  │   │  │ Request│  │ Request│  │ Request│ ...      │            │   │
│  │   │  └────────┘  └────────┘  └────────┘          │            │   │
│  │   │                    │                         │            │   │
│  │   │                    ▼                         │            │   │
│  │   │            定时重试执行                        │            │   │
│  │   └───────────────────────────────────────────────┘            │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  适用场景：                                                             │
│  • 消息通知                                                             │
│  • 异步操作                                                             │
│  • 最终一致性要求                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

```java
public class FailbackClusterInvoker<T> extends AbstractClusterInvoker<T> {

    private static final long RETRY_FAILED_PERIOD = 5 * 1000;
    
    private final ScheduledExecutorService scheduledExecutorService = 
        Executors.newScheduledThreadPool(2);
    
    private final ConcurrentMap<Invocation, AbstractClusterInvoker<?>> failed = 
        new ConcurrentHashMap<>();

    @Override
    protected Result doInvoke(Invocation invocation, List<Invoker<T>> invokers, 
                               LoadBalance loadbalance) throws RpcException {
        Invoker<T> invoker = select(loadbalance, invocation, invokers, null);
        
        try {
            return invoker.invoke(invocation);
        } catch (Throwable e) {
            // 记录失败请求
            failed.put(invocation, this);
            return AsyncRpcResult.newDefaultAsyncResult(null, null, invocation);
        }
    }
    
    // 定时重试
    public FailbackClusterInvoker(Directory<T> directory) {
        super(directory);
        scheduledExecutorService.scheduleAtFixedRate(() -> {
            for (Map.Entry<Invocation, AbstractClusterInvoker<?>> entry : failed.entrySet()) {
                try {
                    entry.getValue().invoke(entry.getKey());
                    failed.remove(entry.getKey());
                } catch (Throwable e) {
                    // 重试失败，保留在队列中
                }
            }
        }, RETRY_FAILED_PERIOD, RETRY_FAILED_PERIOD, TimeUnit.MILLISECONDS);
    }
}
```

## Forking 并行调用

### 原理与实现

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Forking 并行调用                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：同时调用多个服务器，一个成功即返回                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求流程：                                                     │   │
│  │                                                                 │   │
│  │                    ┌─────────┐                                 │   │
│  │              ┌────►│ Server A│──────► 失败                     │   │
│  │              │     └─────────┘                                  │   │
│  │  ┌────────┐  │                                                  │   │
│  │  │ Client │──┤     ┌─────────┐                                  │   │
│  │  └────────┘  └────►│ Server B│──────► 成功 ──► 返回结果        │   │
│  │                    └─────────┘                                  │   │
│  │                          │                                      │   │
│  │                    ┌─────────┐                                  │   │
│  │                    │ Server C│──────► 取消                     │   │
│  │                    └─────────┘                                  │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  配置参数：                                                             │
│  • forks：并行调用数量（默认 2）                                         │
│  • timeouts：超时时间                                                   │
│                                                                         │
│  适用场景：                                                             │
│  • 实时性要求高                                                         │
│  • 读操作                                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

```java
public class ForkingClusterInvoker<T> extends AbstractClusterInvoker<T> {

    @Override
    protected Result doInvoke(Invocation invocation, List<Invoker<T>> invokers, 
                               LoadBalance loadbalance) throws RpcException {
        int forks = getUrl().getParameter(FORKS_KEY, 2);
        int timeout = getUrl().getParameter(TIMEOUT_KEY, DEFAULT_TIMEOUT);
        
        List<Invoker<T>> selected = new ArrayList<>();
        
        // 选择 forks 个 Invoker
        for (int i = 0; i < forks; i++) {
            Invoker<T> invoker = select(loadbalance, invocation, invokers, selected);
            selected.add(invoker);
        }
        
        // 并行调用
        ExecutorService executor = Executors.newFixedThreadPool(forks);
        BlockingQueue<Result> queue = new LinkedBlockingQueue<>();
        
        for (Invoker<T> invoker : selected) {
            executor.submit(() -> {
                try {
                    Result result = invoker.invoke(invocation);
                    queue.offer(result);
                } catch (RpcException e) {
                    queue.offer(new AppResponse(e));
                }
            });
        }
        
        // 等待第一个成功结果
        try {
            Result result = queue.poll(timeout, TimeUnit.MILLISECONDS);
            if (result != null && !result.hasException()) {
                return result;
            }
            throw new RpcException("Failed to invoke");
        } catch (InterruptedException e) {
            throw new RpcException("Interrupted", e);
        } finally {
            executor.shutdownNow();
        }
    }
}
```

## Broadcast 广播调用

### 原理与实现

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Broadcast 广播调用                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：调用所有服务器，任意一个失败则失败                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求流程：                                                     │   │
│  │                                                                 │   │
│  │              ┌─────────┐                                       │   │
│  │              │ Server A│──────► 成功                           │   │
│  │              └─────────┘                                        │   │
│  │                    │                                            │   │
│  │  ┌────────┐       ┌─────────┐                                  │   │
│  │  │ Client │──────►│ Server B│──────► 成功 ──► 返回结果        │   │
│  │  └────────┘       └─────────┘                                  │   │
│  │                    │                                            │   │
│  │              ┌─────────┐                                       │   │
│  │              │ Server C│──────► 成功                           │   │
│  │              └─────────┘                                        │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  适用场景：                                                             │
│  • 缓存更新                                                             │
│  • 状态同步                                                             │
│  • 通知所有节点                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

```java
public class BroadcastClusterInvoker<T> extends AbstractClusterInvoker<T> {

    @Override
    protected Result doInvoke(Invocation invocation, List<Invoker<T>> invokers, 
                               LoadBalance loadbalance) throws RpcException {
        RpcException exception = null;
        Result result = null;
        
        // 逐个调用所有 Invoker
        for (Invoker<T> invoker : invokers) {
            try {
                result = invoker.invoke(invocation);
            } catch (RpcException e) {
                exception = e;
                logger.warn(e.getMessage(), e);
            }
        }
        
        // 任意一个失败，抛出异常
        if (exception != null) {
            throw exception;
        }
        
        return result;
    }
}
```

## 总结

本文介绍了 Dubbo 集群容错原理：

| 模式 | 特点 | 适用场景 |
|------|------|----------|
| Failover | 失败重试 | 幂等操作 |
| Failfast | 快速失败 | 非幂等操作 |
| Failsafe | 失败安全 | 日志、审计 |
| Failback | 失败自动恢复 | 消息通知 |
| Forking | 并行调用 | 高实时性读操作 |
| Broadcast | 广播调用 | 缓存更新、状态同步 |

## 参考资料

- [Dubbo 集群容错](https://dubbo.apache.org/zh/docs/v2.7/dev/source/cluster/)
- [Cluster 源码](https://github.com/apache/dubbo/tree/master/dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support)

## 下一章预告

下一章将深入解析 **网络通信原理**，包括：
- Netty 通信框架
- 编解码器
- Channel Handler
