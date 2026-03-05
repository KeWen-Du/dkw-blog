---
title: "Dubbo 底层原理系列（十）：过滤器与路由"
date: "2021-01-11"
excerpt: "深入解析 Dubbo 过滤器与路由原理，包括 Filter 过滤器链、Router 路由规则、自定义扩展以及最佳实践。"
tags: ["Dubbo", "RPC", "过滤器", "路由"]
series:
  slug: "dubbo-core-principles"
  title: "Dubbo 底层原理系列"
  order: 10
---

## 前言

过滤器和路由是 Dubbo 服务治理的核心能力，通过扩展 Filter 和 Router 可以实现丰富的定制化需求。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Filter 过滤器 | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| 过滤器链 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Router 路由 | ⭐⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 自定义扩展 | ⭐⭐⭐⭐ | 实战价值 | ✅ |

## 面试考点

1. Dubbo Filter 过滤器链是如何构建的？
2. 如何自定义 Filter？
3. Router 路由规则是如何工作的？
4. 条件路由和脚本路由有什么区别？

## Filter 过滤器

### Filter 接口

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Filter 接口                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  @SPI                                                            │   │
│  │  public interface Filter {                                      │   │
│  │      Result invoke(Invoker<?> invoker, Invocation invocation)   │   │
│  │          throws RpcException;                                   │   │
│  │  }                                                              │   │
│  │                                                                 │   │
│  │  内置过滤器：                                                    │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  过滤器              功能                  作用域           │ │   │
│  │  │  ─────────────────────────────────────────────────────── │ │   │
│  │  │  ConsumerContext   设置上下文              Consumer        │ │   │
│  │  │  FutureFilter      异步调用回调            Consumer        │ │   │
│  │  │  MonitorFilter     监控统计                Provider        │ │   │
│  │  │  TimeoutFilter     超时警告                Provider        │ │   │
│  │  │  ExceptionFilter   异常处理                Provider        │ │   │
│  │  │  AccessLogFilter   访问日志                Provider        │ │   │
│  │  │  TokenFilter       令牌验证                Provider        │ │   │
│  │  │  TpsLimitFilter    TPS 限流                Provider        │ │   │
│  │  │  ExecuteLimitFilter 并发限制               Provider        │ │   │
│  │  │  CacheFilter       结果缓存                通用            │ │   │
│  │  │  ValidationFilter  参数校验                通用            │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 过滤器链构建

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        过滤器链构建流程                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ProtocolFilterWrapper.buildInvokerChain()                             │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1. 加载激活的过滤器                                             │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     ExtensionLoader.getExtensionLoader(Filter.class)            │   │
│  │         .getActivateExtension(url, key)                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  2. 构建 Invoker 链                                              │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     Invoker last = invoker;  // 原始 Invoker                    │   │
│  │     for (Filter filter : filters) {                             │   │
│  │         final Invoker next = last;                              │   │
│  │         last = new Invoker() {                                  │   │
│  │             public Result invoke(Invocation inv) {              │   │
│  │                 return filter.invoke(next, inv);                │   │
│  │             }                                                   │   │
│  │         };                                                      │   │
│  │     }                                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3. 过滤器链结构                                                 │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     Filter1.invoke()                                            │   │
│  │         │                                                       │   │
│  │         ├──► 前置处理                                           │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     Filter2.invoke()                                            │   │
│  │         │                                                       │   │
│  │         ├──► 前置处理                                           │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     Filter3.invoke()                                            │   │
│  │         │                                                       │   │
│  │         ├──► 前置处理                                           │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     原始 Invoker.invoke()  // 执行实际调用                       │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     Filter3 后置处理                                             │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     Filter2 后置处理                                             │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     Filter1 后置处理                                             │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     返回结果                                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 自定义 Filter

```java
// 1. 实现 Filter 接口
@Activate(group = {Constants.PROVIDER, Constants.CONSUMER})  // 激活条件
public class TraceFilter implements Filter {

    @Override
    public Result invoke(Invoker<?> invoker, Invocation invocation) 
            throws RpcException {
        // 前置处理：设置调用链追踪信息
        String traceId = RpcContext.getContext().getAttachment("traceId");
        if (traceId == null) {
            traceId = UUID.randomUUID().toString();
            RpcContext.getContext().setAttachment("traceId", traceId);
        }
        
        long startTime = System.currentTimeMillis();
        
        try {
            // 执行调用
            Result result = invoker.invoke(invocation);
            
            // 后置处理：记录成功日志
            long elapsed = System.currentTimeMillis() - startTime;
            logger.info("Trace: traceId={}, method={}, elapsed={}ms, success", 
                traceId, invocation.getMethodName(), elapsed);
            
            return result;
            
        } catch (RpcException e) {
            // 异常处理：记录失败日志
            long elapsed = System.currentTimeMillis() - startTime;
            logger.error("Trace: traceId={}, method={}, elapsed={}ms, failed: {}", 
                traceId, invocation.getMethodName(), elapsed, e.getMessage());
            
            throw e;
        }
    }
}

// 2. SPI 配置文件
// META-INF/dubbo/org.apache.dubbo.rpc.Filter
traceFilter=com.example.TraceFilter

// 3. 配置使用
<dubbo:reference filter="traceFilter" />
<dubbo:service filter="traceFilter" />
```

### 内置 Filter 示例

```java
// ExecuteLimitFilter - 服务端并发限制
@Activate(group = CommonConstants.PROVIDER, value = EXECUTE_KEY)
public class ExecuteLimitFilter implements Filter {

    @Override
    public Result invoke(Invoker<?> invoker, Invocation invocation) 
            throws RpcException {
        URL url = invoker.getUrl();
        String methodName = invocation.getMethodName();
        
        // 获取并发限制数
        int max = url.getMethodParameter(methodName, EXECUTE_KEY, 0);
        
        if (max > 0) {
            // 尝试获取信号量
            RpcStatus count = RpcStatus.getStatus(url, methodName);
            if (count.getActive() >= max) {
                throw new RpcException("Failed to invoke method " + methodName 
                    + " because exceed max concurrent limit: " + max);
            }
        }
        
        long begin = System.currentTimeMillis();
        boolean isException = false;
        RpcStatus.beginCount(url, methodName);
        
        try {
            Result result = invoker.invoke(invocation);
            return result;
        } catch (Throwable t) {
            isException = true;
            throw t;
        } finally {
            RpcStatus.endCount(url, methodName, 
                System.currentTimeMillis() - begin, isException);
        }
    }
}
```

## Router 路由

### Router 接口

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Router 接口                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  public interface Router extends Comparable<Router> {          │   │
│  │      URL getUrl();                                              │   │
│  │      <T> List<Invoker<T>> route(List<Invoker<T>> invokers,     │   │
│  │                                  URL url, Invocation invocation);│   │
│  │      boolean isRuntime();                                       │   │
│  │      boolean isForce();                                         │   │
│  │  }                                                              │   │
│  │                                                                 │   │
│  │  实现类：                                                       │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  路由器              功能                                  │ │   │
│  │  │  ─────────────────────────────────────────────────────── │ │   │
│  │  │  ConditionRouter    条件路由（最常用）                      │ │   │
│  │  │  ScriptRouter       脚本路由（JavaScript/Groovy）          │ │   │
│  │  │  TagRouter          标签路由                               │ │   │
│  │  │  MockInvokersRouter Mock 路由                             │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  路由规则配置：                                                         │
│  • 条件路由：condition://...                                            │
│  • 脚本路由：script://...                                               │
│  • 标签路由：tag://...                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 条件路由

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        条件路由规则                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  规则格式：                                                             │
│  => [服务提供者条件]                                                    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  示例 1：白名单                                                  │   │
│  │  host = 192.168.1.100 =>                                        │   │
│  │                                                                 │   │
│  │  含义：只有 IP 为 192.168.1.100 的消费者可以访问                 │   │
│  │                                                                 │   │
│  │  示例 2：黑名单                                                  │   │
│  │  host != 192.168.1.100 =>                                       │   │
│  │                                                                 │   │
│  │  含义：IP 为 192.168.1.100 的消费者不能访问                      │   │
│  │                                                                 │   │
│  │  示例 3：隔离                                                    │   │
│  │  => host != 192.168.1.100                                       │   │
│  │                                                                 │   │
│  │  含义：不调用 IP 为 192.168.1.100 的服务提供者                   │   │
│  │                                                                 │   │
│  │  示例 4：读写分离                                                │   │
│  │  method = find* => host = 192.168.1.101,192.168.1.102          │   │
│  │                                                                 │   │
│  │  含义：查询方法调用只读服务器                                    │   │
│  │                                                                 │   │
│  │  示例 5：灰度发布                                                │   │
│  │  host = 192.168.1.200 => host = 192.168.1.201                  │   │
│  │                                                                 │   │
│  │  含义：特定消费者调用灰度服务器                                  │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  条件表达式：                                                           │
│  • 等于：=                                                             │
│  • 不等于：!=                                                          │
│  • 匹配：*=                                                            │
│  • 多值：,（逗号分隔）                                                  │
│                                                                         │
│  支持的参数：                                                           │
│  • host：消费者/提供者 IP                                               │
│  • application：应用名                                                  │
│  • method：方法名                                                       │
│  • group：服务分组                                                      │
│  • version：服务版本                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### ConditionRouter 源码

```java
public class ConditionRouter extends AbstractRouter {

    private final Map<String, MatchPair> whenCondition;   // 消费者条件
    private final Map<String, MatchPair> thenCondition;   // 提供者条件

    @Override
    public <T> List<Invoker<T>> route(List<Invoker<T>> invokers, URL url, 
                                       Invocation invocation) {
        
        // 1. 检查消费者条件
        if (!matchWhen(url, invocation)) {
            return invokers;  // 不满足消费者条件，不过滤
        }
        
        List<Invoker<T>> result = new ArrayList<>();
        
        // 2. 匹配提供者条件
        for (Invoker<T> invoker : invokers) {
            if (matchThen(invoker.getUrl(), url)) {
                result.add(invoker);
            }
        }
        
        // 3. 强制路由检查
        if (result.isEmpty() && isForce()) {
            throw new RpcException("No available provider");
        }
        
        return result.isEmpty() ? invokers : result;
    }

    // 匹配消费者条件
    private boolean matchWhen(URL url, Invocation invocation) {
        if (whenCondition == null || whenCondition.isEmpty()) {
            return true;  // 没有消费者条件，所有都匹配
        }
        return doMatch(url, invocation, whenCondition);
    }

    // 匹配提供者条件
    private boolean matchThen(URL url, URL param) {
        if (thenCondition == null || thenCondition.isEmpty()) {
            return false;  // 没有提供者条件，都不匹配
        }
        return doMatch(url, null, thenCondition);
    }
}
```

### 标签路由

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        标签路由                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：通过标签将服务分组，消费者可以指定调用特定标签的服务               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Provider 配置：                                                 │   │
│  │  <dubbo:provider tag="gray" />                                  │   │
│  │  或                                                             │   │
│  │  <dubbo:service tag="stable" />                                 │   │
│  │                                                                 │   │
│  │  Consumer 配置：                                                 │   │
│  │  // 方式 1：通过 attachment 设置                                 │   │
│  │  RpcContext.getContext().setAttachment("dubbo.tag", "gray");    │   │
│  │                                                                 │   │
│  │  // 方式 2：通过环境变量设置                                      │   │
│  │  -Ddubbo.provider.tag=gray                                      │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  标签路由规则：                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  • consumer.tag = gray → 调用 tag=gray 的 provider             │   │
│  │  • consumer.tag 为空 → 调用无 tag 的 provider                   │   │
│  │  • 无匹配 tag → 调用无 tag 的 provider（降级）                   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  应用场景：                                                             │
│  • 灰度发布                                                             │
│  • 环境隔离（测试、预发、生产）                                         │
│  • 多机房路由                                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 路由与过滤器协作

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        路由与过滤器协作流程                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Cluster Invoker                                                │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  1. 获取 Invoker 列表                                     │   │   │
│  │  │         │                                                │   │   │
│  │  │         ▼                                                │   │   │
│  │  │     Directory.list(invocation)                           │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  2. 路由过滤                                               │   │   │
│  │  │         │                                                │   │   │
│  │  │         ├──► Router 1: 条件路由                           │   │   │
│  │  │         │                                                │   │   │
│  │  │         ├──► Router 2: 标签路由                           │   │   │
│  │  │         │                                                │   │   │
│  │  │         └──► Router 3: 脚本路由                           │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  3. 负载均衡选择                                           │   │   │
│  │  │         │                                                │   │   │
│  │  │         ▼                                                │   │   │
│  │  │     LoadBalance.select(invokers)                         │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  4. 过滤器链处理                                           │   │   │
│  │  │         │                                                │   │   │
│  │  │         ├──► Filter 1: ConsumerContext                   │   │   │
│  │  │         │                                                │   │   │
│  │  │         ├──► Filter 2: FutureFilter                      │   │   │
│  │  │         │                                                │   │   │
│  │  │         ├──► Filter 3: MonitorFilter                     │   │   │
│  │  │         │                                                │   │   │
│  │  │         └──► 实际调用                                     │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │         │                                                       │   │
│  │         ▼                                                       │   │
│  │     返回结果                                                    │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 系列总结

本系列深入解析了 Dubbo 底层实现原理：

| 章节 | 主题 | 核心内容 |
|------|------|----------|
| 01 | 架构概述 | 分层架构、核心组件、调用流程 |
| 02 | SPI 机制 | ExtensionLoader、自适应扩展、IOC/AOP |
| 03 | 服务暴露 | 本地暴露、远程暴露、注册中心注册 |
| 04 | 服务引用 | Directory、Cluster Invoker、代理创建 |
| 05 | 注册中心 | Registry 接口、Zookeeper 实现、订阅通知 |
| 06 | 负载均衡 | Random、RoundRobin、LeastActive、ConsistentHash |
| 07 | 集群容错 | Failover、Failfast、Failsafe、Failback |
| 08 | 网络通信 | Netty、Dubbo 协议、编解码器 |
| 09 | 线程模型 | IO 线程、业务线程池、派发策略 |
| 10 | 过滤器与路由 | Filter 链、Router 规则、自定义扩展 |

## 参考资料

- [Dubbo 过滤器](https://dubbo.apache.org/zh/docs/v2.7/dev/source/filter/)
- [Dubbo 路由规则](https://dubbo.apache.org/zh/docs/v2.7/user/demos/routing-rule/)

---

感谢阅读本系列文章！希望这些内容能帮助你深入理解 Dubbo 底层原理，并在实际工作中发挥作用。
