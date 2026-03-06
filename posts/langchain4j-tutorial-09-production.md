---
title: "Langchain4J 实战教程（九）：可观测性与生产部署"
date: "2025-07-06"
excerpt: "深入掌握 Langchain4J 应用的可观测性建设、性能优化、安全实践及生产环境部署策略，构建企业级 AI 应用。"
tags: ["Java", "AI", "LLM", "Langchain4J", "生产", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 9
---

# Langchain4J 实战教程（九）：可观测性与生产部署

## 前言

将 AI 应用从原型推向生产环境，需要关注可观测性、性能优化、安全性和可靠性等多个方面。本章将深入探讨 Langchain4J 应用的生产就绪实践，助你构建企业级 AI 应用。

## 可观测性

### 日志配置

```xml
<!-- logback.xml -->
<configuration>
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/langchain4j.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>logs/langchain4j.%d{yyyy-MM-dd}.log</fileNamePattern>
            <maxHistory>30</maxHistory>
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <!-- Langchain4J 日志级别 -->
    <logger name="dev.langchain4j" level="DEBUG"/>
    <logger name="dev.langchain4j.service" level="TRACE"/>
    
    <root level="INFO">
        <appender-ref ref="FILE"/>
    </root>
</configuration>
```

### 模型调用日志

```java
@Configuration
public class LoggingConfig {
    
    @Bean
    public ChatLanguageModel chatModel() {
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .modelName("gpt-4o-mini")
            .logRequests(true)   // 记录请求
            .logResponses(true)  // 记录响应
            .build();
    }
}
```

### 自定义日志监听

```java
public class ChatMemoryListener implements ChatMemory.Listener {
    
    private static final Logger log = LoggerFactory.getLogger(ChatMemoryListener.class);
    
    @Override
    public void onMessageAdded(ChatMessage message) {
        log.info("Message added: type={}, content={}", 
            message.type(), 
            truncate(message.text(), 100));
    }
    
    private String truncate(String text, int maxLength) {
        if (text.length() <= maxLength) return text;
        return text.substring(0, maxLength) + "...";
    }
}
```

### 指标收集

```java
@Configuration
public class MetricsConfig {
    
    @Bean
    public MeterRegistry meterRegistry() {
        return new SimpleMeterRegistry();
    }
    
    @Bean
    public ChatLanguageModel chatModel(MeterRegistry registry) {
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .modelName("gpt-4o-mini")
            .listeners(new ChatModelListener() {
                @Override
                public void onRequest(ChatModelRequest request) {
                    registry.counter("langchain4j.chat.requests").increment();
                }
                
                @Override
                public void onResponse(ChatModelResponse response) {
                    registry.counter("langchain4j.chat.responses").increment();
                    registry.counter("langchain4j.chat.tokens.input")
                        .increment(response.tokenUsage().inputTokenCount());
                    registry.counter("langchain4j.chat.tokens.output")
                        .increment(response.tokenUsage().outputTokenCount());
                }
                
                @Override
                public void onError(Throwable error) {
                    registry.counter("langchain4j.chat.errors").increment();
                }
            })
            .build();
    }
}
```

### Prometheus 集成

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: prometheus, metrics, health
  metrics:
    tags:
      application: langchain4j-app
```

```java
@Component
public class Langchain4jMetrics {
    
    private final MeterRegistry registry;
    
    public Langchain4jMetrics(MeterRegistry registry) {
        this.registry = registry;
    }
    
    public void recordChatLatency(Duration duration) {
        registry.timer("langchain4j.chat.latency")
            .record(duration);
    }
    
    public void recordTokenUsage(int inputTokens, int outputTokens) {
        registry.counter("langchain4j.tokens.input").increment(inputTokens);
        registry.counter("langchain4j.tokens.output").increment(outputTokens);
    }
}
```

## 错误处理

### 异常类型

```java
// 自定义异常
public class AiServiceException extends RuntimeException {
    public AiServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}

public class ModelUnavailableException extends AiServiceException {
    public ModelUnavailableException(String provider, Throwable cause) {
        super("Model provider unavailable: " + provider, cause);
    }
}

public class RateLimitException extends AiServiceException {
    public RateLimitException(String provider) {
        super("Rate limit exceeded for: " + provider);
    }
}
```

### 重试策略

```java
public class RetryableChatModel implements ChatLanguageModel {
    
    private final ChatLanguageModel delegate;
    private final int maxRetries;
    private final Duration initialDelay;
    private final double multiplier;
    
    @Override
    public Response<AiMessage> generate(List<ChatMessage> messages) {
        int attempt = 0;
        Exception lastException = null;
        
        while (attempt < maxRetries) {
            try {
                return delegate.generate(messages);
            } catch (RateLimitException e) {
                lastException = e;
                attempt++;
                
                // 指数退避
                long delay = (long) (initialDelay.toMillis() * Math.pow(multiplier, attempt - 1));
                sleep(delay);
            } catch (Exception e) {
                // 非重试异常直接抛出
                throw e;
            }
        }
        
        throw new AiServiceException("Max retries exceeded", lastException);
    }
}
```

### 熔断器

```java
@Configuration
public class CircuitBreakerConfig {
    
    @Bean
    public CircuitBreaker circuitBreaker() {
        return CircuitBreaker.builder()
            .failureRateThreshold(50)
            .waitDurationInOpenState(Duration.ofSeconds(30))
            .permittedNumberOfCallsInHalfOpenState(3)
            .slidingWindowSize(10)
            .build();
    }
    
    @Bean
    public ChatLanguageModel chatModel(CircuitBreaker circuitBreaker) {
        return new CircuitBreakerChatModel(
            OpenAiChatModel.builder()
                .apiKey(apiKey)
                .modelName("gpt-4o-mini")
                .build(),
            circuitBreaker
        );
    }
}
```

### 优雅降级

```java
@Service
public class ResilientChatService {
    
    private final ChatLanguageModel primaryModel;
    private final ChatLanguageModel fallbackModel;
    private final ChatLanguageModel localModel;
    
    public String chat(String message) {
        try {
            return primaryModel.generate(message);
        } catch (ModelUnavailableException e) {
            log.warn("Primary model unavailable, using fallback");
            return fallbackModel.generate(message);
        } catch (Exception e) {
            log.error("All models unavailable, using local model");
            return localModel.generate(message);
        }
    }
}
```

## 性能优化

### 并发控制

```java
@Configuration
public class ConcurrencyConfig {
    
    @Bean
    public ExecutorService aiExecutor() {
        return Executors.newFixedThreadPool(
            Runtime.getRuntime().availableProcessors() * 2,
            new ThreadFactoryBuilder()
                .setNameFormat("ai-executor-%d")
                .build()
        );
    }
    
    @Bean
    public Semaphore rateLimiter() {
        // 限制并发请求数
        return new Semaphore(10);
    }
}

@Service
public class ConcurrentChatService {
    
    private final Semaphore rateLimiter;
    private final ChatLanguageModel model;
    
    public CompletableFuture<String> chatAsync(String message) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                rateLimiter.acquire();
                return model.generate(message);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("Interrupted", e);
            } finally {
                rateLimiter.release();
            }
        });
    }
}
```

### 批量处理

```java
@Service
public class BatchEmbeddingService {
    
    private final EmbeddingModel embeddingModel;
    private final int batchSize = 100;
    
    public List<Embedding> embedBatch(List<String> texts) {
        List<Embedding> results = new ArrayList<>();
        
        for (int i = 0; i < texts.size(); i += batchSize) {
            List<String> batch = texts.subList(i, Math.min(i + batchSize, texts.size()));
            List<TextSegment> segments = batch.stream()
                .map(TextSegment::from)
                .collect(Collectors.toList());
            
            List<Embedding> batchResults = embeddingModel.embedAll(segments).content();
            results.addAll(batchResults);
            
            // 避免触发速率限制
            sleep(100);
        }
        
        return results;
    }
}
```

### 缓存策略

```java
@Service
public class CachedChatService {
    
    private final ChatLanguageModel model;
    private final Cache<String, String> cache;
    
    public CachedChatService(ChatLanguageModel model) {
        this.model = model;
        this.cache = Caffeine.newBuilder()
            .maximumSize(10000)
            .expireAfterWrite(Duration.ofHours(1))
            .build();
    }
    
    public String chat(String message) {
        // 计算缓存键
        String cacheKey = DigestUtils.md5Hex(message);
        
        return cache.get(cacheKey, key -> {
            log.info("Cache miss, calling model");
            return model.generate(message);
        });
    }
    
    // 语义缓存（使用向量相似度）
    public String chatWithSemanticCache(String message, EmbeddingModel embeddingModel) {
        Embedding queryEmbedding = embeddingModel.embed(message).content();
        
        // 查找相似问题
        Optional<CacheEntry> similar = findSimilarEntry(queryEmbedding, 0.95);
        
        if (similar.isPresent()) {
            log.info("Semantic cache hit");
            return similar.get().response();
        }
        
        String response = model.generate(message);
        cacheEntry(queryEmbedding, message, response);
        return response;
    }
}
```

## 安全实践

### API Key 管理

```java
// 不要硬编码 API Key
// 错误：String apiKey = "sk-hardcoded-key";

// 正确：使用环境变量或密钥管理服务
@Configuration
public class SecurityConfig {
    
    @Bean
    public ChatLanguageModel chatModel(
            @Value("${OPENAI_API_KEY}") String apiKey) {
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .modelName("gpt-4o-mini")
            .build();
    }
    
    // 或使用 Vault 等
    @Bean
    public ChatLanguageModel chatModelFromVault(VaultTemplate vault) {
        String apiKey = vault.read("secret/ai/openai")
            .getData()
            .get("api_key")
            .toString();
        
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .build();
    }
}
```

### 输入验证

```java
@Service
public class InputValidationService {
    
    private static final int MAX_INPUT_LENGTH = 10000;
    private static final Pattern SENSITIVE_PATTERN = Pattern.compile(
        "(password|api_key|secret|token)\\s*[=:]\\s*\\S+",
        Pattern.CASE_INSENSITIVE
    );
    
    public void validateInput(String input) {
        if (input == null || input.isBlank()) {
            throw new IllegalArgumentException("Input cannot be empty");
        }
        
        if (input.length() > MAX_INPUT_LENGTH) {
            throw new IllegalArgumentException("Input too long");
        }
        
        // 检测敏感信息
        if (SENSITIVE_PATTERN.matcher(input).find()) {
            throw new IllegalArgumentException("Input contains sensitive information");
        }
    }
}
```

### 输出过滤

```java
@Service
public class OutputFilterService {
    
    private final ChatLanguageModel model;
    private final ModerationModel moderationModel;
    
    public String chatWithFilter(String message) {
        // 1. 输入审核
        Moderation moderation = moderationModel.moderate(message).content();
        if (moderation.flagged()) {
            throw new SecurityException("Input flagged: " + moderation.categories());
        }
        
        // 2. 生成响应
        String response = model.generate(message);
        
        // 3. 输出审核
        Moderation outputModeration = moderationModel.moderate(response).content();
        if (outputModeration.flagged()) {
            return "I cannot provide this information due to content policy.";
        }
        
        return response;
    }
}
```

### 访问控制

```java
@RestController
@RequestMapping("/api/chat")
public class SecureChatController {
    
    private final ChatService chatService;
    private final AuthService authService;
    
    @PostMapping
    public ResponseEntity<ChatResponse> chat(
            @RequestBody ChatRequest request,
            @RequestHeader("Authorization") String token) {
        
        // 1. 验证用户
        User user = authService.validateToken(token);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        
        // 2. 检查权限
        if (!user.hasPermission("chat:use")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        
        // 3. 检查配额
        if (!authService.checkQuota(user, "chat")) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(new ChatResponse("Quota exceeded"));
        }
        
        // 4. 处理请求
        String response = chatService.chat(user.getId(), request.message());
        
        return ResponseEntity.ok(new ChatResponse(response));
    }
}
```

## 部署策略

### Docker 部署

```dockerfile
# Dockerfile
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY target/langchain4j-app.jar app.jar

ENV JAVA_OPTS="-Xms512m -Xmx1024m"
ENV OPENAI_API_KEY=""

EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - SPRING_PROFILES_ACTIVE=prod
    depends_on:
      - redis
      - postgres
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
  
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=langchain4j
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=langchain4j
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  redis-data:
  postgres-data:
```

### Kubernetes 部署

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: langchain4j-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: langchain4j-app
  template:
    metadata:
      labels:
        app: langchain4j-app
    spec:
      containers:
      - name: app
        image: langchain4j-app:latest
        ports:
        - containerPort: 8080
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-secrets
              key: openai-api-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /actuator/health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: langchain4j-app
spec:
  selector:
    app: langchain4j-app
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

### 健康检查

```java
@Component
public class AiServiceHealthIndicator implements HealthIndicator {
    
    private final ChatLanguageModel chatModel;
    
    @Override
    public Health health() {
        try {
            // 简单的健康检查
            String response = chatModel.generate("health check");
            if (response != null && !response.isEmpty()) {
                return Health.up()
                    .withDetail("model", "available")
                    .build();
            }
        } catch (Exception e) {
            return Health.down()
                .withException(e)
                .build();
        }
        
        return Health.down().build();
    }
}
```

## 成本优化

### Token 使用监控

```java
@Service
public class TokenUsageService {
    
    private final MeterRegistry registry;
    
    public void recordUsage(String model, int inputTokens, int outputTokens) {
        registry.counter("ai.tokens.input", "model", model).increment(inputTokens);
        registry.counter("ai.tokens.output", "model", model).increment(outputTokens);
        
        // 计算成本
        double cost = calculateCost(model, inputTokens, outputTokens);
        registry.counter("ai.cost", "model", model).increment(cost);
    }
    
    private double calculateCost(String model, int inputTokens, int outputTokens) {
        // GPT-4o-mini 定价示例
        return (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000;
    }
}
```

### 模型选择优化

```java
@Service
public class CostOptimizedModelRouter {
    
    private final ChatLanguageModel premiumModel;
    private final ChatLanguageModel standardModel;
    private final ChatLanguageModel economyModel;
    
    public String chat(String message) {
        // 根据任务复杂度选择模型
        Complexity complexity = analyzeComplexity(message);
        
        return switch (complexity) {
            case HIGH -> premiumModel.generate(message);
            case MEDIUM -> standardModel.generate(message);
            case LOW -> economyModel.generate(message);
        };
    }
    
    private Complexity analyzeComplexity(String message) {
        // 简单启发式规则
        if (message.length() > 1000 || 
            message.contains("分析") || 
            message.contains("解释")) {
            return Complexity.HIGH;
        }
        
        if (message.length() > 500 || 
            message.contains("如何")) {
            return Complexity.MEDIUM;
        }
        
        return Complexity.LOW;
    }
    
    enum Complexity { HIGH, MEDIUM, LOW }
}
```

## 小结

本章我们学习了：

1. **可观测性**：日志、指标、追踪
2. **错误处理**：重试、熔断、降级
3. **性能优化**：并发控制、批量处理、缓存
4. **安全实践**：API Key 管理、输入输出验证、访问控制
5. **部署策略**：Docker、Kubernetes、健康检查
6. **成本优化**：Token 监控、模型选择

## 系列总结

恭喜你完成了 Langchain4J 实战教程系列！在这个系列中，我们学习了：

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| 第一章 | 概述与架构 | 框架定位、核心架构、环境准备 |
| 第二章 | 快速入门 | 项目搭建、第一个应用、Spring Boot 集成 |
| 第三章 | AI Services | 声明式接口、注解、记忆、工具集成 |
| 第四章 | 模型集成 | OpenAI、Anthropic、国内模型、Ollama |
| 第五章 | Prompt 模板 | 模板语法、Few-shot、CoT |
| 第六章 | Chat Memory | 记忆策略、持久化、多会话管理 |
| 第七章 | RAG | 文档处理、向量存储、检索增强 |
| 第八章 | Tools 与 Agent | Function Calling、Agent 架构 |
| 第九章 | 生产部署 | 可观测性、安全、性能优化 |

## 参考资料

- [Langchain4J 官方文档](https://docs.langchain4j.dev/)
- [Spring Boot 生产指南](https://spring.io/guides/gs/production-ready/)
- [Kubernetes 文档](https://kubernetes.io/docs/)
- [OpenAI API 参考](https://platform.openai.com/docs/)

## 下一步

- 深入学习 MCP 协议
- 探索多模态 AI 应用
- 研究 AI Agent 的高级模式
- 参与社区贡献

---

**感谢你的学习！祝你在 AI 应用开发之路上越走越远！**
