---
title: "Dubbo 底层原理系列（六）：负载均衡"
date: "2020-08-25"
excerpt: "深入解析 Dubbo 负载均衡原理，包括 Random、RoundRobin、LeastActive、ConsistentHash 策略的实现细节。"
tags: ["Dubbo", "RPC", "负载均衡", "微服务"]
series:
  slug: "dubbo-core-principles"
  title: "Dubbo 底层原理系列"
  order: 6
---

## 前言

负载均衡是分布式系统的核心能力，Dubbo 提供了多种负载均衡策略，能够在多个服务提供者之间合理分配请求。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Random 策略 | ⭐⭐⭐ | 高频考点 | ✅ |
| RoundRobin 策略 | ⭐⭐⭐ | 高频考点 | ✅ |
| LeastActive 策略 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| ConsistentHash 策略 | ⭐⭐⭐⭐⭐ | 高频考点 | ✅ |

## 面试考点

1. Dubbo 支持哪些负载均衡策略？
2. 加权随机算法是如何实现的？
3. 一致性 Hash 的原理是什么？
4. 最少活跃调用数策略如何实现？

## 负载均衡接口

### LoadBalance 接口

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LoadBalance 接口                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  @SPI("random")                                                 │   │
│  │  public interface LoadBalance {                                │   │
│  │                                                                 │   │
│  │      @Adaptive("loadbalance")                                  │   │
│  │      <T> Invoker<T> select(List<Invoker<T>> invokers,          │   │
│  │                            URL url,                             │   │
│  │                            Invocation invocation);              │   │
│  │  }                                                              │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  实现类：                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  AbstractLoadBalance                                           │   │
│  │      │                                                          │   │
│  │      ├──► RandomLoadBalance      加权随机（默认）               │   │
│  │      ├──► RoundRobinLoadBalance  加权轮询                       │   │
│  │      ├──► LeastActiveLoadBalance 最少活跃调用数                 │   │
│  │      └──► ConsistentHashLoadBalance 一致性 Hash                 │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  配置方式：                                                             │
│  <dubbo:reference loadbalance="random" />                              │
│  <dubbo:service loadbalance="roundrobin" />                            │
│  <dubbo:method name="getUser" loadbalance="leastactive" />             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### AbstractLoadBalance

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AbstractLoadBalance                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  public abstract class AbstractLoadBalance implements LoadBalance {│
│  │                                                                 │   │
│  │      @Override                                                  │   │
│  │      public <T> Invoker<T> select(List<Invoker<T>> invokers,   │   │
│  │                                    URL url,                      │   │
│  │                                    Invocation invocation) {      │   │
│  │          if (invokers == null || invokers.isEmpty()) {         │   │
│  │              return null;                                       │   │
│  │          }                                                      │   │
│  │          if (invokers.size() == 1) {                            │   │
│  │              return invokers.get(0);                            │   │
│  │          }                                                      │   │
│  │          return doSelect(invokers, url, invocation);            │   │
│  │      }                                                          │   │
│  │                                                                 │   │
│  │      // 子类实现具体选择逻辑                                     │   │
│  │      protected abstract <T> Invoker<T> doSelect(                │   │
│  │          List<Invoker<T>> invokers, URL url, Invocation invocation);│
│  │                                                                 │   │
│  │      // 获取权重                                                 │   │
│  │      protected int getWeight(Invoker<?> invoker, Invocation invocation) {│
│  │          int weight = invoker.getUrl().getMethodParameter(      │   │
│  │              invocation.getMethodName(), WEIGHT_KEY,            │   │
│  │              DEFAULT_WEIGHT);                                   │   │
│  │          // 预热权重计算                                         │   │
│  │          if (weight > 0) {                                      │   │
│  │              long timestamp = invoker.getUrl().getParameter(...);│
│  │              if (timestamp > 0) {                               │   │
│  │                  int uptime = (int)(System.currentTimeMillis() - timestamp);│
│  │                  int warmup = ...;                              │   │
│  │                  if (uptime < warmup) {                         │   │
│  │                      weight = calculateWarmupWeight(uptime, warmup, weight);│
│  │                  }                                              │   │
│  │              }                                                  │   │
│  │          }                                                      │   │
│  │          return weight >= 0 ? weight : 0;                       │   │
│  │      }                                                          │   │
│  │  }                                                              │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  权重预热：服务刚启动时，逐渐增加权重，避免瞬时流量过大                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Random 加权随机

### 算法原理

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Random 加权随机算法                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：按权重分配随机概率范围，随机数落在哪个范围就选择哪个 Invoker        │
│                                                                         │
│  示例：                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Invoker    权重    范围                                         │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  A           100     [0, 100)                                   │   │
│  │  B           200     [100, 300)                                 │   │
│  │  C           50      [300, 350)                                 │   │
│  │                                                                 │   │
│  │  总权重 = 100 + 200 + 50 = 350                                  │   │
│  │                                                                 │   │
│  │  随机数 = random.nextInt(350)                                   │   │
│  │                                                                 │   │
│  │  随机数 = 50  → 落在 [0, 100)   → 选择 A                         │   │
│  │  随机数 = 150 → 落在 [100, 300) → 选择 B                         │   │
│  │  随机数 = 320 → 落在 [300, 350) → 选择 C                         │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  概率分布：                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  A 被选中概率 = 100/350 ≈ 28.6%                                 │   │
│  │  B 被选中概率 = 200/350 ≈ 57.1%                                 │   │
│  │  C 被选中概率 = 50/350 ≈ 14.3%                                  │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 源码实现

```java
public class RandomLoadBalance extends AbstractLoadBalance {

    @Override
    protected <T> Invoker<T> doSelect(List<Invoker<T>> invokers, 
                                       URL url, Invocation invocation) {
        int length = invokers.size();
        boolean sameWeight = true;
        int[] weights = new int[length];
        
        // 计算每个 Invoker 的权重
        int totalWeight = 0;
        for (int i = 0; i < length; i++) {
            int weight = getWeight(invokers.get(i), invocation);
            weights[i] = weight;
            totalWeight += weight;
            
            // 检查权重是否相同
            if (sameWeight && i > 0 && weight != weights[i - 1]) {
                sameWeight = false;
            }
        }
        
        // 权重不同，按权重随机
        if (totalWeight > 0 && !sameWeight) {
            int offset = ThreadLocalRandom.current().nextInt(totalWeight);
            for (int i = 0; i < length; i++) {
                offset -= weights[i];
                if (offset < 0) {
                    return invokers.get(i);
                }
            }
        }
        
        // 权重相同，简单随机
        return invokers.get(ThreadLocalRandom.current().nextInt(length));
    }
}
```

## RoundRobin 加权轮询

### 算法原理

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RoundRobin 加权轮询算法                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：平滑加权轮询，避免连续请求同一服务器                               │
│                                                                         │
│  示例：权重 A=5, B=1, C=1                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求序号   currentWeight (A, B, C)   选中   更新后 weight      │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │     1         (5, 1, 1)              A      (-2, 1, 1)          │   │
│  │     2         (3, 2, 2)              A      (-4, 2, 2)          │   │
│  │     3         (1, 3, 3)              B       (1, -4, 3)         │   │
│  │     4         (6, -3, 4)             A      (-1, -3, 4)         │   │
│  │     5         (4, -2, 5)             C       (4, -2, -2)        │   │
│  │     6         (9, -1, -1)            A       (2, -1, -1)        │   │
│  │     7         (7, 0, 0)              A       (0, 0, 0)          │   │
│  │                                                                 │   │
│  │  选中序列：A, A, B, A, C, A, A                                   │   │
│  │  分布均匀，避免连续选中 A                                         │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  算法步骤：                                                             │
│  1. 每个 Invoker 有两个权重：weight（固定）和 currentWeight（动态）      │
│  2. 每次请求，所有 currentWeight += weight                              │
│  3. 选择 currentWeight 最大的 Invoker                                   │
│  4. 选中后，currentWeight -= totalWeight                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 源码实现

```java
public class RoundRobinLoadBalance extends AbstractLoadBalance {

    // WeightedRoundRobin 存储每个 Invoker 的权重状态
    private static class WeightedRoundRobin {
        private int weight;
        private AtomicLong current = new AtomicLong(0);
    }

    private ConcurrentMap<String, ConcurrentMap<String, WeightedRoundRobin>> 
        methodWeightMap = new ConcurrentHashMap<>();

    @Override
    protected <T> Invoker<T> doSelect(List<Invoker<T>> invokers, 
                                       URL url, Invocation invocation) {
        String key = invokers.get(0).getUrl().getServiceKey() + 
                     "." + invocation.getMethodName();
        
        ConcurrentMap<String, WeightedRoundRobin> map = methodWeightMap.computeIfAbsent(
            key, k -> new ConcurrentHashMap<>());
        
        int totalWeight = 0;
        long maxCurrent = Long.MIN_VALUE;
        Invoker<T> selectedInvoker = null;
        WeightedRoundRobin selectedWRR = null;
        
        for (Invoker<T> invoker : invokers) {
            String identifyString = invoker.getUrl().toIdentityString();
            int weight = getWeight(invoker, invocation);
            
            WeightedRoundRobin wrr = map.computeIfAbsent(
                identifyString, k -> new WeightedRoundRobin());
            wrr.setWeight(weight);
            
            // currentWeight += weight
            long cur = wrr.current.addAndGet(weight);
            
            if (cur > maxCurrent) {
                maxCurrent = cur;
                selectedInvoker = invoker;
                selectedWRR = wrr;
            }
            totalWeight += weight;
        }
        
        // currentWeight -= totalWeight
        if (selectedWRR != null) {
            selectedWRR.current.addAndGet(-totalWeight);
            return selectedInvoker;
        }
        
        return invokers.get(0);
    }
}
```

## LeastActive 最少活跃调用数

### 算法原理

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LeastActive 最少活跃调用数                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：选择当前正在处理请求最少的服务器，使慢服务收到更少请求              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Invoker    活跃数    权重                                       │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  A            10       100                                      │   │
│  │  B            5        100                                      │   │
│  │  C            5        200                                      │   │
│  │                                                                 │   │
│  │  最小活跃数 = 5 (B, C)                                          │   │
│  │                                                                 │   │
│  │  在活跃数相同的 B, C 中按权重随机选择：                           │   │
│  │  B 概率 = 100/300 = 33.3%                                       │   │
│  │  C 概率 = 200/300 = 66.7%                                       │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  活跃数计算：                                                           │
│  • 请求开始前：active++                                                 │
│  • 请求结束后：active--                                                 │
│  • 处理越快，活跃数越低，被选中概率越高                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 源码实现

```java
public class LeastActiveLoadBalance extends AbstractLoadBalance {

    @Override
    protected <T> Invoker<T> doSelect(List<Invoker<T>> invokers, 
                                       URL url, Invocation invocation) {
        int length = invokers.size();
        int leastActive = -1;
        int leastCount = 0;
        int[] leastIndexes = new int[length];
        int[] weights = new int[length];
        int totalWeight = 0;
        int firstWeight = 0;
        boolean sameWeight = true;
        
        for (int i = 0; i < length; i++) {
            Invoker<T> invoker = invokers.get(i);
            int active = RpcStatus.getStatus(invoker.getUrl(), 
                            invocation.getMethodName()).getActive();
            int weight = getWeight(invoker, invocation);
            
            // 发现更小的活跃数
            if (leastActive == -1 || active < leastActive) {
                leastActive = active;
                leastCount = 1;
                leastIndexes[0] = i;
                totalWeight = weight;
                firstWeight = weight;
                sameWeight = true;
            } 
            // 活跃数相同
            else if (active == leastActive) {
                leastIndexes[leastCount++] = i;
                totalWeight += weight;
                if (sameWeight && weight != firstWeight) {
                    sameWeight = false;
                }
            }
        }
        
        // 只有一个最小活跃数
        if (leastCount == 1) {
            return invokers.get(leastIndexes[0]);
        }
        
        // 多个最小活跃数，按权重随机
        if (!sameWeight && totalWeight > 0) {
            int offset = ThreadLocalRandom.current().nextInt(totalWeight);
            for (int i = 0; i < leastCount; i++) {
                int leastIndex = leastIndexes[i];
                offset -= weights[leastIndex];
                if (offset < 0) {
                    return invokers.get(leastIndex);
                }
            }
        }
        
        return invokers.get(leastIndexes[
            ThreadLocalRandom.current().nextInt(leastCount)]);
    }
}
```

## ConsistentHash 一致性 Hash

### 算法原理

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ConsistentHash 一致性 Hash                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  原理：相同参数的请求总是路由到同一服务器                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Hash 环：                                                      │   │
│  │                                                                 │   │
│  │          A1 ─────────────────── A                              │   │
│  │         /                         \                             │   │
│  │        /                           \                            │   │
│  │       B                   B1        \                           │   │
│  │        \                           /                            │   │
│  │         \                         /                             │   │
│  │          C1 ─────────────────── C                              │   │
│  │                                                                 │   │
│  │  • A, B, C 是真实节点                                           │   │
│  │  • A1, B1, C1 是虚拟节点（解决数据倾斜）                         │   │
│  │  • 请求 hash 值顺时针找第一个节点                                │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  请求路由示例：                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  请求参数：userId=1001                                          │   │
│  │  Hash 计算：hash(userId=1001) = 2300                            │   │
│  │  顺时针查找：2300 → A (选中 A)                                   │   │
│  │                                                                 │   │
│  │  请求参数：userId=1002                                          │   │
│  │  Hash 计算：hash(userId=1002) = 4500                            │   │
│  │  顺时针查找：4500 → B (选中 B)                                   │   │
│  │                                                                 │   │
│  │  同一 userId 总是路由到同一服务器                                 │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  配置参数：                                                             │
│  • hash.arguments：参与 hash 的参数索引                                 │
│  • hash.nodes：虚拟节点数（默认 160）                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 源码实现

```java
public class ConsistentHashLoadBalance extends AbstractLoadBalance {

    private final ConcurrentMap<String, ConsistentHashSelector<?>> selectors = 
        new ConcurrentHashMap<>();

    @Override
    protected <T> Invoker<T> doSelect(List<Invoker<T>> invokers, 
                                       URL url, Invocation invocation) {
        String methodName = invocation.getMethodName();
        String key = invokers.get(0).getUrl().getServiceKey() + "." + methodName;
        
        // 获取 selector，invokers 变化时重新创建
        ConsistentHashSelector<T> selector = (ConsistentHashSelector<T>) 
            selectors.computeIfAbsent(key, k -> 
                new ConsistentHashSelector<>(invokers, methodName));
        
        return selector.select(invocation);
    }

    private static final class ConsistentHashSelector<T> {
        private final TreeMap<Long, Invoker<T>> virtualInvokers = new TreeMap<>();
        private final int replicaNumber;
        private final int[] argumentIndex;

        ConsistentHashSelector(List<Invoker<T>> invokers, String methodName) {
            // 创建虚拟节点
            for (Invoker<T> invoker : invokers) {
                String address = invoker.getUrl().getAddress();
                for (int i = 0; i < replicaNumber / 4; i++) {
                    byte[] digest = md5(address + i);
                    for (int h = 0; h < 4; h++) {
                        long m = hash(digest, h);
                        virtualInvokers.put(m, invoker);
                    }
                }
            }
        }

        public Invoker<T> select(Invocation invocation) {
            // 根据参数计算 hash
            String key = toKey(invocation.getArguments());
            byte[] digest = md5(key);
            long hash = hash(digest, 0);
            
            // 顺时针查找
            Map.Entry<Long, Invoker<T>> entry = virtualInvokers.ceilingEntry(hash);
            if (entry == null) {
                entry = virtualInvokers.firstEntry();
            }
            return entry.getValue();
        }
    }
}
```

## 总结

本文介绍了 Dubbo 负载均衡原理：

| 策略 | 特点 | 适用场景 |
|------|------|----------|
| Random | 加权随机，简单高效 | 通用场景 |
| RoundRobin | 平滑加权轮询，均匀分布 | 需要均匀分布 |
| LeastActive | 最少活跃数，自动调节 | 性能差异大 |
| ConsistentHash | 一致性 Hash，相同参数路由 | 缓存、有状态服务 |

## 参考资料

- [Dubbo 负载均衡](https://dubbo.apache.org/zh/docs/v2.7/dev/source/loadbalance/)
- [LoadBalance 源码](https://github.com/apache/dubbo/tree/master/dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/loadbalance)

## 下一章预告

下一章将深入解析 **集群容错原理**，包括：
- Failover 失败重试
- Failfast 快速失败
- Failsafe 失败安全
