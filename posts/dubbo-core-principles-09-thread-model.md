---
title: "Dubbo 底层原理系列（九）：线程模型"
date: "2021-01-10"
excerpt: "深入解析 Dubbo 线程模型原理，包括 IO 线程与业务线程、线程池模型、线程派发策略以及线程隔离。"
tags: ["Dubbo", "RPC", "线程模型", "并发"]
series:
  slug: "dubbo-core-principles"
  title: "Dubbo 底层原理系列"
  order: 9
---

## 前言

线程模型决定了 Dubbo 如何处理并发请求，合理的线程模型能够提高系统吞吐量和稳定性。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| IO 线程 | ⭐⭐⭐ | 高频考点 | ✅ |
| 业务线程池 | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| 派发策略 | ⭐⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 线程隔离 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |

## 面试考点

1. Dubbo 的 IO 线程和业务线程是如何分工的？
2. Dubbo 支持哪些线程派发策略？
3. 业务线程池是如何配置的？
4. 如何实现线程隔离？

## 线程模型架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Dubbo 线程模型架构                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Provider (服务端)                                              │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  ┌─────────────────────┐                                 │ │   │
│  │  │  │    Netty IO 线程     │                                 │ │   │
│  │  │  │   (Boss + Worker)   │                                 │ │   │
│  │  │  │  ┌───────┬───────┐  │                                 │ │   │
│  │  │  │  │Boss   │Worker │  │                                 │ │   │
│  │  │  │  │接收连接│处理IO │  │                                 │ │   │
│  │  │  │  └───────┴───┬───┘  │                                 │ │   │
│  │  │  └──────────────┼──────┘                                 │ │   │
│  │  │                 │ 解码、编码                              │ │   │
│  │  │                 ▼                                        │ │   │
│  │  │  ┌─────────────────────────────────────────────────────┐│ │   │
│  │  │  │              业务线程池                              ││ │   │
│  │  │  │  ┌─────────┬─────────┬─────────┬─────────┐         ││ │   │
│  │  │  │  │Thread-1 │Thread-2 │Thread-3 │  ...    │         ││ │   │
│  │  │  │  │  │  │  │  │         ││ │   │
│  │  │  │  └─────────┴─────────┴─────────┴─────────┘         ││ │   │
│  │  │  │                      │                              ││ │   │
│  │  │  │                      ▼                              ││ │   │
│  │  │  │              反射调用服务实现                         ││ │   │
│  │  │  └─────────────────────────────────────────────────────┘│ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  线程分工：                                                             │
│  • IO 线程：连接管理、编解码、IO 读写                                   │
│  • 业务线程：服务调用、业务逻辑执行                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 线程流转

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        请求处理线程流转                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求到达                                                       │   │
│  │      │                                                          │   │
│  │      ▼                                                          │   │
│  │  ┌─────────────────┐                                           │   │
│  │  │   IO 线程        │  1. 读取网络数据                          │   │
│  │  │   (Netty EventLoop)│  2. 解码请求                            │   │
│  │  └────────┬────────┘                                           │   │
│  │           │                                                     │   │
│  │           │ 根据派发策略决定                                     │   │
│  │           ▼                                                     │   │
│  │  ┌─────────────────┐                                           │   │
│  │  │   业务线程池     │  3. 执行业务逻辑                          │   │
│  │  │   (ThreadPool)  │  4. 反射调用服务                          │   │
│  │  └────────┬────────┘                                           │   │
│  │           │                                                     │   │
│  │           ▼                                                     │   │
│  │  ┌─────────────────┐                                           │   │
│  │  │   IO 线程        │  5. 编码响应                              │   │
│  │  │   (Netty EventLoop)│  6. 写回网络                            │   │
│  │  └─────────────────┘                                           │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 线程派发策略

### Dispatcher 接口

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Dispatcher 接口                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  @SPI("all")                                                    │   │
│  │  public interface Dispatcher {                                 │   │
│  │      @Adaptive                                                  │   │
│  │      ChannelHandler dispatch(ChannelHandler handler, URL url);  │   │
│  │  }                                                              │   │
│  │                                                                 │   │
│  │  实现类：                                                       │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  策略          说明                    适用场景            │ │   │
│  │  │  ─────────────────────────────────────────────────────── │ │   │
│  │  │  all          所有消息派发到线程池        通用（默认）     │ │   │
│  │  │  direct       所有消息在 IO 线程处理     快速轻量请求     │ │   │
│  │  │  message      仅请求消息派发到线程池      普通 RPC 调用    │ │   │
│  │  │  execution    仅请求消息派发到线程池      同 message       │ │   │
│  │  │  connection   连接事件在 IO 线程处理      连接密集场景     │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  配置方式：                                                             │
│  <dubbo:protocol dispatcher="all" />                                    │
│  <dubbo:provider dispatcher="message" />                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### AllDispatcher

```java
public class AllDispatcher implements Dispatcher {

    @Override
    public ChannelHandler dispatch(ChannelHandler handler, URL url) {
        return new AllChannelHandler(handler, url);
    }
}

// 所有消息都派发到线程池
public class AllChannelHandler extends WrappedChannelHandler {

    @Override
    public void received(Channel channel, Object message) throws RemotingException {
        // 获取线程池
        ExecutorService executor = getExecutorService();
        
        try {
            // 所有消息都提交到线程池处理
            executor.execute(new ChannelEventRunnable(channel, handler, 
                ChannelState.RECEIVED, message));
        } catch (Throwable t) {
            // 线程池满，拒绝处理
            throw new ExecutionException("Failed to create channel message", t);
        }
    }

    @Override
    public void connected(Channel channel) throws RemotingException {
        ExecutorService executor = getExecutorService();
        executor.execute(new ChannelEventRunnable(channel, handler, 
            ChannelState.CONNECTED));
    }

    @Override
    public void disconnected(Channel channel) throws RemotingException {
        ExecutorService executor = getExecutorService();
        executor.execute(new ChannelEventRunnable(channel, handler, 
            ChannelState.DISCONNECTED));
    }
}
```

### DirectDispatcher

```java
public class DirectDispatcher implements Dispatcher {

    @Override
    public ChannelHandler dispatch(ChannelHandler handler, URL url) {
        return new DirectChannelHandler(handler, url);
    }
}

// 所有消息都在 IO 线程处理
public class DirectChannelHandler extends WrappedChannelHandler {

    @Override
    public void received(Channel channel, Object message) throws RemotingException {
        // 直接在 IO 线程处理
        handler.received(channel, message);
    }
}
```

### MessageDispatcher

```java
public class MessageDispatcher implements Dispatcher {

    @Override
    public ChannelHandler dispatch(ChannelHandler handler, URL url) {
        return new MessageOnlyChannelHandler(handler, url);
    }
}

// 仅请求消息派发到线程池
public class MessageOnlyChannelHandler extends WrappedChannelHandler {

    @Override
    public void received(Channel channel, Object message) throws RemotingException {
        if (message instanceof Request) {
            // 请求消息派发到线程池
            ExecutorService executor = getExecutorService();
            executor.execute(new ChannelEventRunnable(channel, handler, 
                ChannelState.RECEIVED, message));
        } else {
            // 其他消息在 IO 线程处理
            handler.received(channel, message);
        }
    }
}
```

## 线程池模型

### ThreadPool 接口

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ThreadPool 接口                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  @SPI("fixed")                                                  │   │
│  │  public interface ThreadPool {                                 │   │
│  │      @Adaptive                                                  │   │
│  │      Executor getExecutor(URL url);                            │   │
│  │  }                                                              │   │
│  │                                                                 │   │
│  │  实现类：                                                       │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  类型          说明                    特点                 │ │   │
│  │  │  ─────────────────────────────────────────────────────── │ │   │
│  │  │  fixed         固定大小线程池        推荐（默认）           │ │   │
│  │  │  cached        缓存线程池            线程数不限             │ │   │
│  │  │  limited       有限线程池            最大限制               │ │   │
│  │  │  eager         急切线程池            先扩容后排队           │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  配置参数：                                                             │
│  • threads: 线程池大小（默认 200）                                       │
│  • threadname: 线程名前缀                                               │
│  • queues: 队列大小（默认 0）                                            │
│  • alive: 线程存活时间                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### FixedThreadPool

```java
public class FixedThreadPool implements ThreadPool {

    @Override
    public Executor getExecutor(URL url) {
        String name = url.getParameter(THREAD_NAME_KEY, DEFAULT_THREAD_NAME);
        int threads = url.getParameter(THREADS_KEY, DEFAULT_THREADS);
        int queues = url.getParameter(QUEUES_KEY, DEFAULT_QUEUES);
        
        return new ThreadPoolExecutor(
            threads, threads,  // 核心线程数 = 最大线程数
            0, TimeUnit.MILLISECONDS,
            // 队列：0 = SynchronousQueue, >0 = LinkedBlockingQueue
            queues == 0 ? new SynchronousQueue<Runnable>() :
                new LinkedBlockingQueue<Runnable>(queues),
            new NamedThreadFactory(name, true),
            // 拒绝策略：记录日志并抛出异常
            new AbortPolicyWithReport(name, url)
        );
    }
}
```

### CachedThreadPool

```java
public class CachedThreadPool implements ThreadPool {

    @Override
    public Executor getExecutor(URL url) {
        String name = url.getParameter(THREAD_NAME_KEY, DEFAULT_THREAD_NAME);
        int cores = url.getParameter(CORE_THREADS_KEY, DEFAULT_CORE_THREADS);
        int threads = url.getParameter(THREADS_KEY, Integer.MAX_VALUE);
        int queues = url.getParameter(QUEUES_KEY, DEFAULT_QUEUES);
        int alive = url.getParameter(ALIVE_KEY, DEFAULT_ALIVE);
        
        return new ThreadPoolExecutor(
            cores, threads,
            alive, TimeUnit.MILLISECONDS,
            queues == 0 ? new SynchronousQueue<Runnable>() :
                new LinkedBlockingQueue<Runnable>(queues),
            new NamedThreadFactory(name, true),
            new AbortPolicyWithReport(name, url)
        );
    }
}
```

### LimitedThreadPool

```java
public class LimitedThreadPool implements ThreadPool {

    @Override
    public Executor getExecutor(URL url) {
        String name = url.getParameter(THREAD_NAME_KEY, DEFAULT_THREAD_NAME);
        int cores = url.getParameter(CORE_THREADS_KEY, DEFAULT_CORE_THREADS);
        int threads = url.getParameter(THREADS_KEY, DEFAULT_THREADS);
        int queues = url.getParameter(QUEUES_KEY, DEFAULT_QUEUES);
        
        return new ThreadPoolExecutor(
            cores, threads,
            Long.MAX_VALUE, TimeUnit.MILLISECONDS,  // 线程不回收
            queues == 0 ? new SynchronousQueue<Runnable>() :
                new LinkedBlockingQueue<Runnable>(queues),
            new NamedThreadFactory(name, true),
            new AbortPolicyWithReport(name, url)
        );
    }
}
```

### EagerThreadPool

```java
public class EagerThreadPool implements ThreadPool {

    @Override
    public Executor getExecutor(URL url) {
        String name = url.getParameter(THREAD_NAME_KEY, DEFAULT_THREAD_NAME);
        int cores = url.getParameter(CORE_THREADS_KEY, DEFAULT_CORE_THREADS);
        int threads = url.getParameter(THREADS_KEY, DEFAULT_THREADS);
        int queues = url.getParameter(QUEUES_KEY, DEFAULT_QUEUES);
        int alive = url.getParameter(ALIVE_KEY, DEFAULT_ALIVE);
        
        // TaskQueue 配合 EagerThreadPoolExecutor 实现先扩容后排队
        TaskQueue queue = new TaskQueue(queues);
        EagerThreadPoolExecutor executor = new EagerThreadPoolExecutor(
            cores, threads,
            alive, TimeUnit.MILLISECONDS,
            queue,
            new NamedThreadFactory(name, true),
            new AbortPolicyWithReport(name, url)
        );
        queue.setExecutor(executor);
        
        return executor;
    }
}

// 自定义队列：先尝试创建线程，满了才入队
public class TaskQueue extends LinkedBlockingQueue<Runnable> {
    
    private EagerThreadPoolExecutor executor;
    
    @Override
    public boolean offer(Runnable runnable) {
        // 当前线程数 < 最大线程数，返回 false 触发创建新线程
        if (executor.getPoolSize() < executor.getMaximumPoolSize()) {
            return false;
        }
        return super.offer(runnable);
    }
}
```

## 线程隔离

### 隔离策略

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        线程隔离策略                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 服务级隔离                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  每个服务使用独立的线程池：                                       │   │
│  │                                                                 │   │
│  │  ┌─────────────────┐   ┌─────────────────┐                     │   │
│  │  │ Service A       │   │ Service B       │                     │   │
│  │  │ ┌─────────────┐ │   │ ┌─────────────┐ │                     │   │
│  │  │ │ Thread Pool │ │   │ │ Thread Pool │ │                     │   │
│  │  │ │   (独立)    │ │   │ │   (独立)    │ │                     │   │
│  │  │ └─────────────┘ │   │ └─────────────┘ │                     │   │
│  │  └─────────────────┘   └─────────────────┘                     │   │
│  │                                                                 │   │
│  │  配置：                                                         │   │
│  │  <dubbo:service threadpool="fixed" threads="100" />             │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  2. 方法级隔离                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  每个方法使用独立的线程池：                                       │   │
│  │                                                                 │   │
│  │  <dubbo:service>                                                │   │
│  │      <dubbo:method name="getUser" threads="50" />              │   │
│  │      <dubbo:method name="listUsers" threads="100" />           │   │
│  │  </dubbo:service>                                               │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  3. 隔离的好处                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  • 慢服务不影响快服务                                            │   │
│  │  • 故障隔离，避免级联失败                                        │   │
│  │  • 资源独立，便于监控和管理                                      │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 总结

本文介绍了 Dubbo 线程模型原理：

| 概念 | 说明 |
|------|------|
| IO 线程 | 连接管理、编解码、IO 读写 |
| 业务线程 | 服务调用、业务逻辑执行 |
| 派发策略 | all/direct/message/execution/connection |
| 线程池 | fixed/cached/limited/eager |
| 线程隔离 | 服务级、方法级隔离 |

## 参考资料

- [Dubbo 线程模型](https://dubbo.apache.org/zh/docs/v2.7/user/demos/thread-model/)
- [ThreadPool 源码](https://github.com/apache/dubbo/tree/master/dubbo-common/src/main/java/org/apache/dubbo/common/threadpool)

## 下一章预告

下一章将深入解析 **过滤器与路由原理**，包括：
- Filter 过滤器链
- Router 路由规则
- 自定义扩展
