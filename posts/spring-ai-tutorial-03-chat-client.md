---
title: "Spring AI 实战教程（三）：ChatClient API 详解"
date: "2025-08-16"
excerpt: "深入掌握 ChatClient API 的完整功能，包括提示词模板、多轮对话、Advisor 机制和流式响应处理。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 3
---

# Spring AI 实战教程（三）：ChatClient API 详解

## 前言

ChatClient 是 Spring AI 最核心的 API，它提供了与 LLM 交互的统一接口。本章将深入探讨 ChatClient 的完整功能，包括提示词模板、多轮对话管理、Advisor 机制等高级特性。

## ChatClient 概述

### 设计理念

ChatClient 的设计灵感来源于 Spring 的 `WebClient` 和 `RestClient`，采用流畅的 API 风格：

```
┌─────────────────────────────────────────────────────────────┐
│                    ChatClient 工作流程                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ChatClient.builder()                                      │
│        │                                                    │
│        ▼                                                    │
│   ┌─────────────────────────────────────────┐              │
│   │  配置阶段 (Builder)                      │              │
│   │  • defaultSystem() - 默认系统提示        │              │
│   │  • defaultOptions() - 默认模型选项       │              │
│   │  • defaultAdvisors() - 默认顾问         │              │
│   │  • defaultFunctions() - 默认函数        │              │
│   └─────────────────────────────────────────┘              │
│        │                                                    │
│        ▼                                                    │
│   ┌─────────────────────────────────────────┐              │
│   │  请求阶段 (Prompt)                       │              │
│   │  • system() - 系统提示                   │              │
│   │  • user() - 用户消息                    │              │
│   │  • messages() - 消息列表                │              │
│   │  • functions() - 启用函数               │              │
│   │  • advisors() - 启用顾问                │              │
│   └─────────────────────────────────────────┘              │
│        │                                                    │
│        ▼                                                    │
│   ┌─────────────────────────────────────────┐              │
│   │  执行阶段 (Call/Stream)                  │              │
│   │  • call() - 同步调用                    │              │
│   │  • stream() - 流式调用                  │              │
│   └─────────────────────────────────────────┘              │
│        │                                                    │
│        ▼                                                    │
│   ┌─────────────────────────────────────────┐              │
│   │  响应处理                                │              │
│   │  • content() - 获取文本内容              │              │
│   │  • entity() - 结构化输出                │              │
│   │  • chatResponse() - 完整响应对象         │              │
│   └─────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 核心接口

```java
public interface ChatClient {
    
    // 创建请求规格
    ChatClientRequestSpec prompt();
    
    // 创建带预设内容的请求
    ChatClientRequestSpec prompt(String content);
    
    // 创建带 Prompt 对象的请求
    ChatClientRequestSpec prompt(Prompt prompt);
    
    // 构建器
    static Builder builder(ChatModel chatModel) {
        return new Builder(chatModel);
    }
    
    // 快速创建
    static ChatClient create(ChatModel chatModel) {
        return builder(chatModel).build();
    }
}
```

## 创建 ChatClient

### 方式一：快速创建

```java
@Service
public class QuickChatService {
    
    private final ChatClient chatClient;
    
    public QuickChatService(ChatModel chatModel) {
        // 最简单的方式 - 无默认配置
        this.chatClient = ChatClient.create(chatModel);
    }
    
    public String chat(String message) {
        return chatClient.prompt()
                .user(message)
                .call()
                .content();
    }
}
```

### 方式二：Builder 模式

```java
@Configuration
public class ChatClientConfig {
    
    @Bean
    public ChatClient chatClient(ChatModel chatModel) {
        return ChatClient.builder(chatModel)
                // 默认系统提示
                .defaultSystem("""
                        你是一个专业的技术顾问。
                        请用清晰、简洁的语言回答问题。
                        回答时适当提供代码示例。
                        """)
                // 默认模型选项
                .defaultOptions(ChatOptionsBuilder.builder()
                        .withModel("gpt-4o")
                        .withTemperature(0.7)
                        .withMaxTokens(2000)
                        .build())
                // 默认 Advisor（如对话记忆）
                .defaultAdvisors(new MessageChatMemoryAdvisor(chatMemory))
                .build();
    }
}
```

### 方式三：从配置文件加载

```yaml
# application.yml
spring:
  ai:
    openai:
      chat:
        options:
          model: gpt-4o
          temperature: 0.7
```

```java
@Service
public class ConfiguredChatService {
    
    private final ChatClient chatClient;
    
    public ConfiguredChatService(ChatModel chatModel) {
        // 自动使用配置文件中的选项
        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("你是一个助手。")
                .build();
    }
}
```

## Prompt 模板

### 基本用法

Spring AI 使用 StringTemplate (ST4) 语法作为模板引擎：

```java
@Service
public class PromptTemplateService {
    
    private final ChatClient chatClient;
    
    public PromptTemplateService(ChatModel chatModel) {
        this.chatClient = ChatClient.create(chatModel);
    }
    
    public String generateCode(String language, String task) {
        return chatClient.prompt()
                .user(u -> u.text("""
                        请用 {language} 语言实现以下功能：
                        {task}
                        
                        要求：
                        1. 代码简洁清晰
                        2. 添加必要注释
                        3. 考虑边界情况
                        """)
                        .param("language", language)
                        .param("task", task))
                .call()
                .content();
    }
}
```

### 使用 PromptTemplate 类

```java
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.ai.chat.prompt.Prompt;

@Service
public class TemplateService {
    
    private final ChatModel chatModel;
    
    public TemplateService(ChatModel chatModel) {
        this.chatModel = chatModel;
    }
    
    public String analyzeDocument(String documentType, String content) {
        // 创建模板
        String template = """
                你是一个专业的文档分析师。
                请分析以下{documentType}的内容：
                
                ---
                {content}
                ---
                
                请提供：
                1. 核心要点总结
                2. 关键数据提取
                3. 潜在问题识别
                """;
        
        PromptTemplate promptTemplate = new PromptTemplate(template);
        
        // 填充参数
        Prompt prompt = promptTemplate.create(Map.of(
                "documentType", documentType,
                "content", content
        ));
        
        // 执行
        return chatModel.call(prompt).getResult().getOutput().getText();
    }
}
```

### 外部模板文件

将模板存储在外部文件中，便于维护：

**resources/prompts/code-review.st**

```
你是一个资深的代码审查专家。
请审查以下代码：

语言：{language}
---
{code}
---

请从以下方面进行审查：
1. 代码质量
2. 安全问题
3. 性能优化建议
4. 最佳实践建议

请以结构化的方式输出审查结果。
```

```java
@Service
public class CodeReviewService {
    
    private final ChatClient chatClient;
    private final ResourceLoader resourceLoader;
    
    public CodeReviewService(ChatModel chatModel, ResourceLoader resourceLoader) {
        this.chatClient = ChatClient.create(chatModel);
        this.resourceLoader = resourceLoader;
    }
    
    public String reviewCode(String language, String code) throws IOException {
        // 加载外部模板
        Resource resource = resourceLoader.getResource("classpath:prompts/code-review.st");
        String template = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        
        return chatClient.prompt()
                .user(u -> u.text(template)
                        .param("language", language)
                        .param("code", code))
                .call()
                .content();
    }
}
```

### 条件模板

```java
public String generateResponse(String query, boolean detailed) {
    return chatClient.prompt()
            .user(u -> u.text("""
                    请回答以下问题：{query}
                    
                    {detailedInstruction}
                    """)
                    .param("query", query)
                    .param("detailedInstruction", 
                            detailed ? "请提供详细、全面的回答，包含示例。" 
                                   : "请简明扼要地回答。"))
            .call()
            .content();
}
```

## 多轮对话

### 理解对话上下文

LLM 本身是无状态的，多轮对话需要管理消息历史：

```
┌─────────────────────────────────────────────────────────────┐
│                    多轮对话流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  第一轮：                                                    │
│  User: "什么是 Java？"                                       │
│  Assistant: "Java 是一种面向对象的编程语言..."               │
│                                                             │
│  第二轮：                                                    │
│  User: "它有什么特点？"                                      │
│  Assistant: [需要上下文] "Java 的主要特点包括..."            │
│                                                             │
│  消息历史：                                                  │
│  [                                                          │
│    {role: "user", content: "什么是 Java？"},                 │
│    {role: "assistant", content: "Java 是..."},              │
│    {role: "user", content: "它有什么特点？"}                 │
│  ]                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 手动管理对话历史

```java
@Service
public class ManualChatService {
    
    private final ChatClient chatClient;
    // 使用内存存储对话历史（生产环境应使用持久化存储）
    private final Map<String, List<Message>> conversationHistory = new ConcurrentHashMap<>();
    
    public ManualChatService(ChatModel chatModel) {
        this.chatClient = ChatClient.create(chatModel);
    }
    
    public String chat(String sessionId, String userMessage) {
        // 获取或创建对话历史
        List<Message> history = conversationHistory.computeIfAbsent(
                sessionId, k -> new ArrayList<>()
        );
        
        // 构建请求，包含历史消息
        ChatResponse response = chatClient.prompt()
                .messages(history)  // 添加历史消息
                .user(userMessage)  // 添加当前用户消息
                .call()
                .chatResponse();
        
        // 获取响应内容
        String assistantMessage = response.getResult().getOutput().getText();
        
        // 更新对话历史
        history.add(new UserMessage(userMessage));
        history.add(new AssistantMessage(assistantMessage));
        
        return assistantMessage;
    }
    
    public void clearHistory(String sessionId) {
        conversationHistory.remove(sessionId);
    }
}
```

### 使用 ChatMemory（推荐）

Spring AI 提供了 `ChatMemory` 接口来管理对话历史：

```java
@Configuration
public class ChatMemoryConfig {
    
    @Bean
    public ChatMemory chatMemory() {
        // 内存存储（开发环境）
        return new InMemoryChatMemory();
        
        // 生产环境可使用持久化实现
        // return new PersistentChatMemory(repository);
    }
}
```

```java
@Service
public class MemoryChatService {
    
    private final ChatClient chatClient;
    
    public MemoryChatService(ChatModel chatModel, ChatMemory chatMemory) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultAdvisors(new MessageChatMemoryAdvisor(chatMemory))
                .defaultSystem("你是一个友好的AI助手。")
                .build();
    }
    
    public String chat(String sessionId, String message) {
        return chatClient.prompt()
                .user(message)
                .advisors(advisor -> advisor
                        .param("chat_memory_conversation_id", sessionId)
                        .param("chat_memory_response_size", 10))  // 保留最近10条消息
                .call()
                .content();
    }
    
    public void clearSession(String sessionId) {
        // 清除会话历史
        chatMemory.clear(sessionId);
    }
}
```

### 对话记忆存储策略

```
┌─────────────────────────────────────────────────────────────┐
│                    对话记忆策略                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 内存存储 (InMemoryChatMemory)                           │
│     • 适合开发测试                                          │
│     • 服务重启后丢失                                        │
│     • 不适合分布式部署                                      │
│                                                             │
│  2. 数据库存储 (自定义实现)                                  │
│     • 适合生产环境                                          │
│     • 持久化保存                                            │
│     • 支持分布式                                            │
│                                                             │
│  3. Redis 存储                                              │
│     • 高性能                                                │
│     • 支持过期策略                                          │
│     • 适合高并发场景                                        │
│                                                             │
│  4. 向量存储 (VectorStoreChatMemory)                        │
│     • 语义搜索历史对话                                      │
│     • 智能召回相关上下文                                    │
│     • 适合长期记忆场景                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 自定义持久化 ChatMemory

```java
@Entity
@Table(name = "chat_messages")
public class ChatMessageEntity {
    @Id
    @GeneratedValue
    private Long id;
    
    private String sessionId;
    private String role;  // "user" or "assistant"
    
    @Column(length = 10000)
    private String content;
    
    private Instant createdAt;
    
    // getters, setters
}

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessageEntity, Long> {
    List<ChatMessageEntity> findBySessionIdOrderByCreatedAtAsc(String sessionId);
    void deleteBySessionId(String sessionId);
}

@Component
public class PersistentChatMemory implements ChatMemory {
    
    private final ChatMessageRepository repository;
    
    public PersistentChatMemory(ChatMessageRepository repository) {
        this.repository = repository;
    }
    
    @Override
    public void add(String conversationId, List<Message> messages) {
        messages.forEach(msg -> {
            ChatMessageEntity entity = new ChatMessageEntity();
            entity.setSessionId(conversationId);
            entity.setRole(msg.getMessageType().getValue());
            entity.setContent(msg.getContent());
            entity.setCreatedAt(Instant.now());
            repository.save(entity);
        });
    }
    
    @Override
    public List<Message> get(String conversationId, int lastN) {
        List<ChatMessageEntity> entities = repository
                .findBySessionIdOrderByCreatedAtAsc(conversationId);
        
        return entities.stream()
                .skip(Math.max(0, entities.size() - lastN))
                .map(this::toMessage)
                .collect(Collectors.toList());
    }
    
    @Override
    public void clear(String conversationId) {
        repository.deleteBySessionId(conversationId);
    }
    
    private Message toMessage(ChatMessageEntity entity) {
        return switch (entity.getRole()) {
            case "user" -> new UserMessage(entity.getContent());
            case "assistant" -> new AssistantMessage(entity.getContent());
            default -> throw new IllegalArgumentException("Unknown role: " + entity.getRole());
        };
    }
}
```

## Advisor 机制

### Advisor 概述

Advisor 是 Spring AI 的切面式增强机制，用于封装跨切面关注点：

```
┌─────────────────────────────────────────────────────────────┐
│                    Advisor 工作原理                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   用户请求                                                   │
│       │                                                     │
│       ▼                                                     │
│   ┌──────────────────────────────────────┐                  │
│   │  Advisor Chain (责任链)               │                  │
│   │                                       │                  │
│   │  ┌─────────────────────────────────┐ │                  │
│   │  │ 1. ChatMemoryAdvisor            │ │                  │
│   │  │    • 添加历史消息到请求          │ │                  │
│   │  │    • 保存响应到历史              │ │                  │
│   │  └─────────────────────────────────┘ │                  │
│   │                 │                     │                  │
│   │                 ▼                     │                  │
│   │  ┌─────────────────────────────────┐ │                  │
│   │  │ 2. QuestionAnswerAdvisor (RAG)  │ │                  │
│   │  │    • 检索相关文档                │ │                  │
│   │  │    • 添加上下文到提示            │ │                  │
│   │  └─────────────────────────────────┘ │                  │
│   │                 │                     │                  │
│   │                 ▼                     │                  │
│   │  ┌─────────────────────────────────┐ │                  │
│   │  │ 3. SafeGuardAdvisor             │ │                  │
│   │  │    • 内容安全检查                │ │                  │
│   │  │    • 敏感信息过滤                │ │                  │
│   │  └─────────────────────────────────┘ │                  │
│   │                 │                     │                  │
│   └─────────────────┼────────────────────┘                  │
│                     │                                       │
│                     ▼                                       │
│               LLM Model                                     │
│                     │                                       │
│                     ▼                                       │
│               返回响应                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 内置 Advisor

#### 1. MessageChatMemoryAdvisor

```java
// 管理对话记忆
ChatClient client = ChatClient.builder(chatModel)
        .defaultAdvisors(new MessageChatMemoryAdvisor(chatMemory))
        .build();

// 使用时指定会话ID
client.prompt()
        .user(message)
        .advisors(advisor -> advisor
                .param("chat_memory_conversation_id", sessionId))
        .call()
        .content();
```

#### 2. QuestionAnswerAdvisor (RAG)

```java
// RAG 检索增强
ChatClient client = ChatClient.builder(chatModel)
        .defaultAdvisors(new QuestionAnswerAdvisor(vectorStore))
        .build();

// 自动检索相关文档并注入上下文
client.prompt()
        .user("Spring AI 是什么？")
        .call()
        .content();
```

#### 3. SimpleLoggerAdvisor

```java
// 日志记录
ChatClient client = ChatClient.builder(chatModel)
        .defaultAdvisors(new SimpleLoggerAdvisor())
        .build();
```

### 自定义 Advisor

```java
public class ContentFilterAdvisor implements CallAroundAdvisor {
    
    private final List<String> blockedWords;
    
    public ContentFilterAdvisor(List<String> blockedWords) {
        this.blockedWords = blockedWords;
    }
    
    @Override
    public String getName() {
        return "ContentFilterAdvisor";
    }
    
    @Override
    public int getOrder() {
        return 100;  // 执行顺序
    }
    
    @Override
    public AdvisedResponse aroundCall(AdvisedRequest advisedRequest, CallAroundAdvisorChain chain) {
        // 前置处理：检查用户输入
        String userMessage = advisedRequest.userText();
        for (String word : blockedWords) {
            if (userMessage.contains(word)) {
                throw new ContentFilterException("消息包含敏感内容：" + word);
            }
        }
        
        // 调用下一个 Advisor
        AdvisedResponse response = chain.nextAroundCall(advisedRequest);
        
        // 后置处理：检查响应内容
        String content = response.response().getResult().getOutput().getText();
        for (String word : blockedWords) {
            if (content.contains(word)) {
                // 过滤敏感词
                content = content.replace(word, "***");
            }
        }
        
        return response;
    }
}
```

### 组合多个 Advisor

```java
@Configuration
public class AdvisorConfig {
    
    @Bean
    public ChatClient chatClient(ChatModel chatModel, 
                                 ChatMemory chatMemory,
                                 VectorStore vectorStore) {
        return ChatClient.builder(chatModel)
                .defaultSystem("你是一个专业的AI助手。")
                .defaultAdvisors(
                        // 对话记忆
                        new MessageChatMemoryAdvisor(chatMemory),
                        // RAG 检索
                        new QuestionAnswerAdvisor(vectorStore),
                        // 内容过滤
                        new ContentFilterAdvisor(List.of("敏感词1", "敏感词2")),
                        // 日志记录
                        new SimpleLoggerAdvisor()
                )
                .build();
    }
}
```

## 流式响应

### 基本流式响应

```java
@Service
public class StreamChatService {
    
    private final ChatClient chatClient;
    
    public StreamChatService(ChatModel chatModel) {
        this.chatClient = ChatClient.create(chatModel);
    }
    
    public Flux<String> streamChat(String message) {
        return chatClient.prompt()
                .user(message)
                .stream()
                .content();
    }
}
```

### WebFlux 控制器

```java
@RestController
@RequestMapping("/api/chat")
public class StreamChatController {
    
    private final StreamChatService chatService;
    
    public StreamChatController(StreamChatService chatService) {
        this.chatService = chatService;
    }
    
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamChat(@RequestParam String message) {
        return chatService.streamChat(message)
                .map(chunk -> ServerSentEvent.<String>builder()
                        .data(chunk)
                        .build())
                .concatWith(Flux.just(
                        ServerSentEvent.<String>builder()
                                .event("complete")
                                .data("[DONE]")
                                .build()
                ));
    }
}
```

### 流式响应处理

```java
public Flux<String> processStream(String message) {
    StringBuilder fullResponse = new StringBuilder();
    
    return chatClient.prompt()
            .user(message)
            .stream()
            .content()
            .doOnNext(chunk -> {
                fullResponse.append(chunk);
                // 可以在这里做实时处理
                log.info("收到片段: {}", chunk);
            })
            .doOnComplete(() -> {
                log.info("完整响应: {}", fullResponse);
            })
            .doOnError(error -> {
                log.error("流式响应错误", error);
            });
}
```

## 响应处理

### 获取完整响应信息

```java
public void detailedResponse(String message) {
    ChatResponse response = chatClient.prompt()
            .user(message)
            .call()
            .chatResponse();
    
    // 获取响应内容
    String content = response.getResult().getOutput().getText();
    
    // 获取元数据
    ChatResponseMetadata metadata = response.getMetadata();
    String model = metadata.getModel();
    Integer promptTokens = metadata.getUsage().getPromptTokens();
    Integer generationTokens = metadata.getUsage().getGenerationTokens();
    Integer totalTokens = metadata.getUsage().getTotalTokens();
    
    log.info("模型: {}, Token 使用: 输入={}, 输出={}, 总计={}", 
            model, promptTokens, generationTokens, totalTokens);
}
```

### 结构化输出

```java
// 定义输出结构
record PersonInfo(
    String name,
    int age,
    List<String> skills,
    String email
) {}

// 获取结构化输出
PersonInfo person = chatClient.prompt()
        .user("提取以下文本中的人员信息：张三，28岁，精通Java和Python，邮箱zhangsan@example.com")
        .call()
        .entity(PersonInfo.class);

System.out.println(person.name());     // 张三
System.out.println(person.age());      // 28
System.out.println(person.skills());   // [Java, Python]
```

## 最佳实践

### 1. 合理设置默认配置

```java
@Bean
public ChatClient chatClient(ChatModel chatModel) {
    return ChatClient.builder(chatModel)
            // 设置合理的默认系统提示
            .defaultSystem("""
                    你是一个专业的技术顾问。
                    请遵循以下原则：
                    1. 回答准确、清晰
                    2. 必要时提供代码示例
                    3. 不确定时诚实说明
                    """)
            // 设置合理的默认选项
            .defaultOptions(ChatOptionsBuilder.builder()
                    .withTemperature(0.7)
                    .withMaxTokens(2000)
                    .build())
            .build();
}
```

### 2. 模板与代码分离

```java
// 不推荐：硬编码模板
chatClient.prompt()
        .user("你是" + role + "，请回答：" + question)
        .call();

// 推荐：使用模板文件或常量
private static final String SYSTEM_TEMPLATE = """
        你是一个{role}。
        请用专业的角度回答问题。
        """;

chatClient.prompt()
        .system(s -> s.text(SYSTEM_TEMPLATE).param("role", role))
        .user(question)
        .call();
```

### 3. 错误处理

```java
public String safeChat(String message) {
    try {
        return chatClient.prompt()
                .user(message)
                .call()
                .content();
    } catch (Exception e) {
        log.error("Chat request failed", e);
        return "抱歉，服务暂时不可用，请稍后再试。";
    }
}
```

### 4. 超时控制

```java
// 配置超时
spring:
  ai:
    openai:
      chat:
        options:
          connect-timeout: 30000
          read-timeout: 60000
```

## 小结

本章我们深入学习了：

1. **ChatClient 创建**：快速创建、Builder 模式、配置文件
2. **Prompt 模板**：基本用法、外部模板、条件模板
3. **多轮对话**：手动管理、ChatMemory、持久化存储
4. **Advisor 机制**：内置 Advisor、自定义 Advisor、责任链
5. **流式响应**：基本流式、WebFlux 集成、响应处理

## 练习

1. **实现客服机器人**：使用 ChatMemory 管理多轮对话
2. **创建自定义 Advisor**：实现敏感词过滤
3. **构建流式聊天界面**：前端使用 SSE 接收流式响应
4. **持久化对话历史**：将对话存储到数据库

## 下一章预告

在下一章《多模型提供商集成》中，我们将探讨：

- OpenAI、Anthropic、Google 等模型集成
- 模型切换与配置
- 本地模型 Ollama 深度使用
- 国产模型集成（通义千问、智谱等）

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
