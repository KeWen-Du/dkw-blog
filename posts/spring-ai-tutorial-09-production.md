---
title: "Spring AI 实战教程（九）：可观测性与生产部署"
date: "2025-09-21"
excerpt: "全面掌握 Spring AI 应用的可观测性建设，包括监控指标、分布式追踪、日志管理，以及生产环境部署最佳实践。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 9
---

# Spring AI 实战教程（九）：可观测性与生产部署

## 前言

将 AI 应用部署到生产环境面临着独特的挑战：不可预测的响应时间、高昂的 API 成本、复杂的错误处理等。本章将详细介绍如何为 Spring AI 应用构建完善的可观测性体系，以及生产环境的最佳实践。

## 可观测性概述

### 三大支柱

```
┌─────────────────────────────────────────────────────────────┐
│                    可观测性三大支柱                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                    Metrics 指标                        │ │
│  │  • 请求延迟 (P50, P95, P99)                           │ │
│  │  • Token 使用量                                       │ │
│  │  • 成本统计                                           │ │
│  │  • 错误率                                             │ │
│  │  • 吞吐量                                             │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                   Tracing 追踪                         │ │
│  │  • 请求链路追踪                                        │ │
│  │  • LLM 调用详情                                        │ │
│  │  • 向量检索耗时                                        │ │
│  │  • 工具调用记录                                        │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                    Logging 日志                        │ │
│  │  • 请求/响应内容                                       │ │
│  │  • 错误详情                                           │ │
│  │  • 审计日志                                           │ │
│  │  • 调试信息                                           │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### AI 应用的特殊关注点

| 关注点 | 说明 | 监控方式 |
|--------|------|----------|
| Token 消耗 | API 调用的核心成本 | Counter 指标 |
| 响应质量 | 回答准确性和相关性 | 人工/自动评估 |
| 幻觉检测 | 错误信息生成 | 内容审核 |
| 成本控制 | API 费用统计 | Budget 指标 |
| 缓存效果 | 减少重复调用 | Hit Rate |

## Metrics 监控

### Spring AI 内置指标

Spring AI 自动收集以下指标：

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: prometheus, metrics, health
  metrics:
    tags:
      application: spring-ai-app
    distribution:
      percentiles-histogram:
        http.server.requests: true
      percentiles:
        http.server.requests: 0.5,0.95,0.99
```

### 自定义 Metrics

```java
@Service
public class AiMetricsService {
    
    private final MeterRegistry meterRegistry;
    private final Counter requestCounter;
    private final Counter tokenCounter;
    private final Counter costCounter;
    private final Timer responseTimer;
    
    public AiMetricsService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        
        // 请求计数
        this.requestCounter = Counter.builder("ai.requests")
                .description("AI 请求总数")
                .tag("provider", "openai")
                .register(meterRegistry);
        
        // Token 计数
        this.tokenCounter = Counter.builder("ai.tokens")
                .description("Token 使用量")
                .register(meterRegistry);
        
        // 成本计数
        this.costCounter = Counter.builder("ai.cost")
                .description("API 调用成本（美元）")
                .register(meterRegistry);
        
        // 响应时间
        this.responseTimer = Timer.builder("ai.response.time")
                .description("AI 响应时间")
                .register(meterRegistry);
    }
    
    public void recordRequest(String provider, String model) {
        requestCounter.increment();
        meterRegistry.counter("ai.requests", 
                "provider", provider, 
                "model", model)
                .increment();
    }
    
    public void recordTokenUsage(String provider, String model, 
                                   int promptTokens, int completionTokens) {
        tokenCounter.increment(promptTokens + completionTokens);
        
        meterRegistry.counter("ai.tokens.prompt", 
                "provider", provider, 
                "model", model)
                .increment(promptTokens);
        
        meterRegistry.counter("ai.tokens.completion", 
                "provider", provider, 
                "model", model)
                .increment(completionTokens);
    }
    
    public void recordCost(String provider, String model, double cost) {
        costCounter.increment(cost);
        meterRegistry.counter("ai.cost", 
                "provider", provider, 
                "model", model)
                .increment(cost);
    }
    
    public Timer.Sample startTimer() {
        return Timer.start(meterRegistry);
    }
    
    public void recordLatency(Timer.Sample sample, String provider, String model) {
        sample.stop(meterRegistry.timer("ai.latency", 
                "provider", provider, 
                "model", model));
    }
}
```

### 集成到 ChatService

```java
@Service
public class MonitoredChatService {
    
    private final ChatClient chatClient;
    private final AiMetricsService metricsService;
    
    public MonitoredChatService(ChatModel chatModel, AiMetricsService metricsService) {
        this.chatClient = ChatClient.create(chatModel);
        this.metricsService = metricsService;
    }
    
    public String chat(String message) {
        Timer.Sample sample = metricsService.startTimer();
        String provider = "openai";
        String model = "gpt-4o";
        
        try {
            metricsService.recordRequest(provider, model);
            
            ChatResponse response = chatClient.prompt()
                    .user(message)
                    .call()
                    .chatResponse();
            
            // 记录指标
            Usage usage = response.getMetadata().getUsage();
            metricsService.recordTokenUsage(
                    provider, model,
                    usage.getPromptTokens(),
                    usage.getGenerationTokens()
            );
            
            // 计算并记录成本
            double cost = calculateCost(model, usage);
            metricsService.recordCost(provider, model, cost);
            
            return response.getResult().getOutput().getText();
            
        } finally {
            metricsService.recordLatency(sample, provider, model);
        }
    }
    
    private double calculateCost(String model, Usage usage) {
        // GPT-4o 价格（2025年）
        double inputCost = 0.0025;   // $/1K tokens
        double outputCost = 0.01;    // $/1K tokens
        
        return (usage.getPromptTokens() * inputCost / 1000) +
               (usage.getGenerationTokens() * outputCost / 1000);
    }
}
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Spring AI Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(ai_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Token Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(ai_tokens_total[5m])"
          }
        ]
      },
      {
        "title": "Response Latency",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(ai_latency_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Cost",
        "type": "stat",
        "targets": [
          {
            "expr": "ai_cost_total"
          }
        ]
      }
    ]
  }
}
```

## 分布式追踪

### OpenTelemetry 集成

```xml
<dependency>
    <groupId>io.opentelemetry.instrumentation</groupId>
    <artifactId>opentelemetry-spring-boot-starter</artifactId>
</dependency>
```

```yaml
# application.yml
otel:
  exporter:
    otlp:
      endpoint: http://localhost:4317
  traces:
    exporter: otlp
  metrics:
    exporter: otlp
```

### 自定义 Span

```java
@Service
public class TracedChatService {
    
    private final ChatClient chatClient;
    private final Tracer tracer;
    
    public TracedChatService(ChatModel chatModel, Tracer tracer) {
        this.chatClient = ChatClient.create(chatModel);
        this.tracer = tracer;
    }
    
    public String chat(String message) {
        Span span = tracer.spanBuilder("ai.chat")
                .setAttribute("message.length", message.length())
                .startSpan();
        
        try (Scope scope = span.makeCurrent()) {
            ChatResponse response = chatClient.prompt()
                    .user(message)
                    .call()
                    .chatResponse();
            
            // 记录追踪信息
            span.setAttribute("model", response.getMetadata().getModel());
            span.setAttribute("prompt.tokens", response.getMetadata().getUsage().getPromptTokens());
            span.setAttribute("completion.tokens", response.getMetadata().getUsage().getGenerationTokens());
            span.setAttribute("total.tokens", response.getMetadata().getUsage().getTotalTokens());
            
            return response.getResult().getOutput().getText();
            
        } catch (Exception e) {
            span.recordException(e);
            span.setStatus(StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            span.end();
        }
    }
    
    public String rag(String question) {
        Span span = tracer.spanBuilder("ai.rag")
                .startSpan();
        
        try (Scope scope = span.makeCurrent()) {
            // 1. 检索阶段
            Span retrievalSpan = tracer.spanBuilder("rag.retrieval").startSpan();
            List<Document> docs;
            try (Scope s = retrievalSpan.makeCurrent()) {
                docs = vectorStore.similaritySearch(SearchRequest.query(question).withTopK(5));
                retrievalSpan.setAttribute("documents.count", docs.size());
            } finally {
                retrievalSpan.end();
            }
            
            // 2. 生成阶段
            Span generationSpan = tracer.spanBuilder("rag.generation").startSpan();
            try (Scope s = generationSpan.makeCurrent()) {
                String answer = generateAnswer(question, docs);
                return answer;
            } finally {
                generationSpan.end();
            }
            
        } finally {
            span.end();
        }
    }
}
```

### Jaeger 集成

```yaml
# docker-compose.yml
version: '3'
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
```

## 日志管理

### 结构化日志

```java
@Configuration
public class LoggingConfig {
    
    @Bean
    public LoggerContext loggerContext() {
        LoggerContext context = new LoggerContext();
        
        // 配置 JSON 格式日志
        JsonEncoder encoder = new JsonEncoder();
        encoder.setContext(context);
        
        ConsoleAppender<ILoggingEvent> appender = new ConsoleAppender<>();
        appender.setEncoder(encoder);
        appender.setContext(context);
        appender.start();
        
        return context;
    }
}

@Service
@Slf4j
public class AuditLogService {
    
    public void logRequest(String userId, String message, String model) {
        log.info("AI Request: userId={}, model={}, messageLength={}",
                userId, model, message.length());
    }
    
    public void logResponse(String userId, String response, Usage usage, long latencyMs) {
        log.info("AI Response: userId={}, tokens={}, latencyMs={}",
                userId, usage.getTotalTokens(), latencyMs);
    }
    
    public void logError(String userId, String error, String stackTrace) {
        log.error("AI Error: userId={}, error={}", userId, error);
    }
}
```

### 敏感信息过滤

```java
@Component
public class SensitiveDataFilter implements Filter {
    
    private static final List<Pattern> SENSITIVE_PATTERNS = List.of(
            Pattern.compile("(api[_-]?key\\s*[=:]\\s*)[\\w-]+", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(password\\s*[=:]\\s*)\\S+", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(token\\s*[=:]\\s*)[\\w.-]+", Pattern.CASE_INSENSITIVE)
    );
    
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        
        ContentCachingRequestWrapper wrappedRequest = new ContentCachingRequestWrapper(
                (HttpServletRequest) request);
        ContentCachingResponseWrapper wrappedResponse = new ContentCachingResponseWrapper(
                (HttpServletResponse) response);
        
        chain.doFilter(wrappedRequest, wrappedResponse);
        
        // 记录日志（过滤敏感信息）
        String requestBody = filterSensitiveData(
                new String(wrappedRequest.getContentAsByteArray()));
        String responseBody = filterSensitiveData(
                new String(wrappedResponse.getContentAsByteArray()));
        
        log.info("Request: {} {}, Body: {}", 
                wrappedRequest.getMethod(), 
                wrappedRequest.getRequestURI(), 
                requestBody);
        
        wrappedResponse.copyBodyToResponse();
    }
    
    private String filterSensitiveData(String content) {
        for (Pattern pattern : SENSITIVE_PATTERNS) {
            content = pattern.matcher(content).replaceAll("$1***");
        }
        return content;
    }
}
```

## 告警配置

### Prometheus 告警规则

```yaml
# alerting_rules.yml
groups:
  - name: spring-ai-alerts
    rules:
      # 高延迟告警
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(ai_latency_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "AI 请求延迟过高"
          description: "P95 延迟超过 5 秒"
      
      # 错误率告警
      - alert: HighErrorRate
        expr: rate(ai_errors_total[5m]) / rate(ai_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "AI 错误率过高"
          description: "错误率超过 5%"
      
      # Token 消耗告警
      - alert: HighTokenUsage
        expr: rate(ai_tokens_total[1h]) > 1000000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Token 消耗过高"
          description: "每小时消耗超过 100万 tokens"
      
      # 成本告警
      - alert: HighCost
        expr: ai_cost_total > 100
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "API 成本过高"
          description: "累计成本超过 $100"
```

### 告警通知

```yaml
# alertmanager.yml
global:
  slack_api_url: 'https://hooks.slack.com/services/xxx'

route:
  receiver: 'team-notifications'
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 1h

receivers:
  - name: 'team-notifications'
    slack_configs:
      - channel: '#ai-alerts'
        send_resolved: true
        title: '{{ .Status | toUpper }}: {{ .CommonAnnotations.summary }}'
        text: '{{ .CommonAnnotations.description }}'
```

## 生产部署最佳实践

### 配置管理

```yaml
# application-prod.yml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o
          temperature: 0.3
          max-tokens: 2000
          
  # 连接池配置
  ai:
    openai:
      connect-timeout: 30000
      read-timeout: 60000
      
# 限流配置
resilience4j:
  ratelimiter:
    instances:
      ai-api:
        limitForPeriod: 100
        limitRefreshPeriod: 1m
        timeoutDuration: 10s
        
# 缓存配置
spring:
  cache:
    type: redis
    redis:
      time-to-live: 3600000
      
# 线程池配置
spring:
  task:
    execution:
      pool:
        core-size: 10
        max-size: 50
        queue-capacity: 100
```

### 健康检查

```java
@Component
public class AiHealthIndicator implements HealthIndicator {
    
    private final ChatModel chatModel;
    
    @Override
    public Health health() {
        try {
            // 简单的健康检查调用
            String response = chatModel.call("ping");
            if (response != null && !response.isEmpty()) {
                return Health.up()
                        .withDetail("provider", "openai")
                        .withDetail("status", "healthy")
                        .build();
            }
        } catch (Exception e) {
            return Health.down()
                    .withDetail("error", e.getMessage())
                    .build();
        }
        
        return Health.unknown().build();
    }
}
```

### 优雅关闭

```java
@Configuration
public class GracefulShutdownConfig {
    
    @Bean
    public GracefulShutdown gracefulShutdown() {
        return new GracefulShutdown();
    }
    
    @Bean
    public ServletWebServerFactory servletWebServerFactory() {
        TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory();
        factory.addConnectorCustomizers(connector -> {
            connector.setProperty("maxThreads", "200");
            connector.setProperty("minSpareThreads", "20");
            connector.setProperty("acceptCount", "100");
        });
        return factory;
    }
}

@Component
class GracefulShutdown implements ApplicationListener<ContextClosedEvent> {
    
    private static final Logger log = LoggerFactory.getLogger(GracefulShutdown.class);
    
    @Override
    public void onApplicationEvent(ContextClosedEvent event) {
        log.info("Received shutdown signal, waiting for in-flight requests to complete...");
        
        // 等待正在处理的请求完成
        try {
            Thread.sleep(30000);  // 30秒等待时间
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

### 容器化部署

```dockerfile
# Dockerfile
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY target/spring-ai-app.jar app.jar

ENV JAVA_OPTS="-Xms512m -Xmx1024m -XX:+UseG1GC"
ENV SPRING_PROFILES_ACTIVE=prod

EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

```yaml
# kubernetes/deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spring-ai-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: spring-ai-app
  template:
    metadata:
      labels:
        app: spring-ai-app
    spec:
      containers:
        - name: spring-ai-app
          image: spring-ai-app:latest
          ports:
            - containerPort: 8080
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          env:
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: ai-secrets
                  key: openai-api-key
            - name: SPRING_PROFILES_ACTIVE
              value: "prod"
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: spring-ai-service
spec:
  selector:
    app: spring-ai-app
  ports:
    - port: 80
      targetPort: 8080
  type: LoadBalancer
```

### 成本控制

```java
@Service
public class CostControlService {
    
    private final MeterRegistry meterRegistry;
    private final RedisTemplate<String, String> redisTemplate;
    
    @Value("${ai.budget.daily:100}")
    private double dailyBudget;
    
    public boolean checkBudget(String userId) {
        String today = LocalDate.now().toString();
        String key = "ai:cost:" + today;
        
        String currentCost = redisTemplate.opsForValue().get(key);
        double cost = currentCost != null ? Double.parseDouble(currentCost) : 0;
        
        return cost < dailyBudget;
    }
    
    public void recordCost(double cost) {
        String today = LocalDate.now().toString();
        String key = "ai:cost:" + today;
        
        redisTemplate.opsForValue().increment(key, cost);
        redisTemplate.expire(key, Duration.ofDays(2));
    }
    
    public void checkAndThrow(String userId) {
        if (!checkBudget(userId)) {
            throw new BudgetExceededException(
                    "Daily budget exceeded. Current budget: $" + dailyBudget);
        }
    }
}
```

## 小结

本章我们学习了：

1. **可观测性概述**：三大支柱、AI 应用特殊关注点
2. **Metrics 监控**：内置指标、自定义指标、Grafana 集成
3. **分布式追踪**：OpenTelemetry 集成、自定义 Span、Jaeger
4. **日志管理**：结构化日志、敏感信息过滤
5. **告警配置**：Prometheus 规则、通知渠道
6. **生产部署**：配置管理、健康检查、容器化、成本控制

## 系列总结

通过这九章的学习，我们从零开始掌握了 Spring AI 的完整知识体系：

```
┌─────────────────────────────────────────────────────────────┐
│                  Spring AI 知识体系                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  基础篇：                                                   │
│  ├── 第1章：概述与架构 - 理解 Spring AI 设计理念           │
│  ├── 第2章：快速入门 - 搭建第一个应用                      │
│  └── 第3章：ChatClient API - 掌握核心接口                  │
│                                                             │
│  核心功能篇：                                               │
│  ├── 第4章：多模型提供商 - 模型切换与配置                  │
│  ├── 第5章：结构化输出 - 数据提取与映射                    │
│  └── 第6章：Embedding与向量存储 - 语义搜索基础             │
│                                                             │
│  进阶应用篇：                                               │
│  ├── 第7章：RAG检索增强生成 - 企业知识库                   │
│  └── 第8章：Tools与Function Calling - Agent能力            │
│                                                             │
│  生产篇：                                                   │
│  └── 第9章：可观测性与生产部署 - 生产就绪                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 继续学习

- **Spring AI 官方文档**：https://docs.spring.io/spring-ai/reference/
- **Spring AI GitHub**：https://github.com/spring-projects/spring-ai
- **示例项目**：https://github.com/spring-projects/spring-ai-examples

感谢您的学习，祝您在 AI 应用开发的道路上越走越远！

---

**Spring AI 实战教程系列完结！**
