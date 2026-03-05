---
title: "Langchain4J 实战教程（三）：AI Services 核心详解"
date: "2025-07-18 11:00:00"
excerpt: "深入理解 AI Services 的工作原理，掌握高级注解、记忆管理、工具集成等核心功能，构建更智能的 AI 应用。"
tags: ["Java", "AI", "LLM", "Langchain4J", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 3
---

# Langchain4J 实战教程（三）：AI Services 核心详解

## 前言

AI Services 是 Langchain4J 最核心、最强大的特性。它采用声明式编程范式，让开发者只需定义接口，框架自动处理 LLM 调用的所有细节。本章将深入探索 AI Services 的工作原理和高级用法，助你构建更智能的 AI 应用。

## AI Services 概述

### 核心理念

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Services 核心理念                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  传统方式：命令式编程                                        │
│  ─────────────────────                                      │
│  • 手动构建消息                                              │
│  • 手动调用模型                                              │
│  • 手动解析响应                                              │
│  • 手动管理记忆                                              │
│  • 代码量大，容易出错                                        │
│                                                             │
│  AI Services：声明式编程                                     │
│  ─────────────────────                                      │
│  • 定义接口 + 注解                                           │
│  • 框架自动实现                                              │
│  • 自动处理所有细节                                          │
│  • 代码简洁，类型安全                                        │
│                                                             │
│  接口定义 ──→ 框架实现 ──→ 直接使用                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 工作原理

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Services 工作原理                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户代码                        Langchain4J 框架               │
│  ────────                       ────────────────                │
│                                                                 │
│  Assistant assistant =          ┌─────────────────────┐        │
│    AiServices.builder(          │  动态代理生成        │        │
│      Assistant.class            │  (Proxy)            │        │
│    )                            └──────────┬──────────┘        │
│    .chatLanguageModel(model)               │                   │
│    .build();                    ┌──────────▼──────────┐        │
│                                 │  解析注解            │        │
│  assistant.chat("Hello");       │  @SystemMessage     │        │
│           │                     │  @UserMessage       │        │
│           │                     │  @Tool              │        │
│           │                     └──────────┬──────────┘        │
│           │                     ┌──────────▼──────────┐        │
│           │                     │  构建提示词          │        │
│           │                     │  + 系统消息          │        │
│           │                     │  + 用户消息          │        │
│           │                     │  + 历史记忆          │        │
│           │                     │  + 工具描述          │        │
│           │                     └──────────┬──────────┘        │
│           │                     ┌──────────▼──────────┐        │
│           └────────────────────►│  调用 LLM            │        │
│                                 │                     │        │
│                                 └──────────┬──────────┘        │
│                                 ┌──────────▼──────────┐        │
│                                 │  解析响应            │        │
│                                 │  + 工具调用处理      │        │
│                                 │  + 类型转换          │        │
│                                 └──────────┬──────────┘        │
│                                 ┌──────────▼──────────┐        │
│  String response = ◄─────────────────────── 返回结果           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 基础用法

### 简单接口

```java
interface SimpleAssistant {
    String chat(String message);
}

// 使用
SimpleAssistant assistant = AiServices.builder(SimpleAssistant.class)
    .chatLanguageModel(chatModel)
    .build();

String response = assistant.chat("Hello!");
```

### 系统消息注解

使用 `@SystemMessage` 定义 AI 的角色和行为：

```java
interface ProfessionalAssistant {
    
    @SystemMessage("""
        你是一个专业的技术顾问，具有以下特点：
        1. 回答简洁明了，避免冗余
        2. 提供具体的代码示例
        3. 必要时给出最佳实践建议
        4. 如果不确定，诚实告知
        """)
    String chat(String message);
}
```

### 用户消息注解

使用 `@UserMessage` 定义用户消息模板：

```java
interface TemplateAssistant {
    
    @UserMessage("""
        请解释以下技术概念：{{concept}}
        
        要求：
        1. 给出简单定义
        2. 说明应用场景
        3. 提供代码示例
        """)
    String explain(@V("concept") String concept);
}

// 使用
String response = assistant.explain("Java Stream API");
```

### 方法参数注解

```java
interface AdvancedAssistant {
    
    String chat(
        @MemoryId String conversationId,
        @UserMessage String message
    );
    
    @UserMessage("翻译以下{{sourceLang}}文本为{{targetLang}}：{{text}}")
    String translate(
        @V("sourceLang") String sourceLang,
        @V("targetLang") String targetLang,
        @V("text") String text
    );
}
```

## 高级注解

### @SystemMessage 高级用法

```java
interface SystemMessageAssistant {
    
    // 从资源文件加载系统消息
    @SystemMessage(fromResource = "/prompts/system-prompt.txt")
    String chat(String message);
    
    // 动态系统消息
    @SystemMessage("你是一个{{role}}，请用{{style}}的风格回答")
    String chatWithRole(
        @V("role") String role,
        @V("style") String style,
        @UserMessage String message
    );
}
```

`/prompts/system-prompt.txt`:
```
你是一个经验丰富的软件架构师。
你的职责是帮助开发者解决技术难题，提供架构建议。
回答时请：
1. 先分析问题的核心
2. 给出多种解决方案
3. 推荐最佳方案并说明理由
```

### @UserMessage 模板功能

```java
interface UserMessageAssistant {
    
    // 基础模板
    @UserMessage("分析以下代码的问题：{{code}}")
    String analyzeCode(@V("code") String code);
    
    // 复杂模板
    @UserMessage("""
        任务：{{task}}
        
        输入数据：
        {{input}}
        
        输出要求：
        - 格式：{{format}}
        - 语言：{{language}}
        """)
    String process(
        @V("task") String task,
        @V("input") String input,
        @V("format") String format,
        @V("language") String language
    );
    
    // 使用资源文件
    @UserMessage(fromResource = "/prompts/analyze-prompt.txt")
    String analyze(@V("content") String content);
}
```

### @Moderation 内容审核

```java
interface SafeAssistant {
    
    @Moderate  // 自动审核用户输入是否合规
    String chat(String message);
}

// 自定义审核模型
SafeAssistant assistant = AiServices.builder(SafeAssistant.class)
    .chatLanguageModel(chatModel)
    .moderationModel(OpenAiModerationModel.withApiKey(apiKey))
    .build();
```

## 返回类型

### 字符串返回

```java
interface StringAssistant {
    String chat(String message);
}
```

### 结构化输出

```java
interface StructuredAssistant {
    
    record PersonInfo(
        String name,
        int age,
        List<String> skills,
        String email
    ) {}
    
    // 返回 Java 对象
    PersonInfo extractPerson(@UserMessage String text);
    
    // 返回列表
    List<String> extractKeywords(@UserMessage String text);
    
    // 返回枚举
    enum Sentiment { POSITIVE, NEGATIVE, NEUTRAL }
    Sentiment analyzeSentiment(@UserMessage String text);
}
```

### 流式返回

```java
interface StreamingAssistant {
    
    // 返回 TokenStream
    TokenStream chatStream(String message);
    
    // 返回 CompletableFuture（适合异步场景）
    @UserMessage("生成一篇关于{{topic}}的文章")
    CompletableFuture<String> generateArticle(@V("topic") String topic);
}

// 使用
TokenStream stream = assistant.chatStream("Hello");
stream.onNext(token -> System.out.print(token))
      .onComplete(response -> System.out.println("\n完成！"))
      .onError(Throwable::printStackTrace)
      .start();
```

### 结果包装

```java
interface ResponseAssistant {
    
    // 返回 Response 包装，包含元数据
    Response<AiMessage> chatWithMetadata(String message);
    
    // 使用
    Response<AiMessage> response = assistant.chatWithMetadata("Hello");
    String content = response.content().text();
    TokenUsage tokens = response.tokenUsage();  // Token 使用量
    FinishReason finishReason = response.finishReason();  // 结束原因
}
```

## Chat Memory 集成

### 单一会话记忆

```java
interface MemoryAssistant {
    String chat(@MemoryId String conversationId, String message);
}

// 为每个对话提供独立的记忆
MemoryAssistant assistant = AiServices.builder(MemoryAssistant.class)
    .chatLanguageModel(chatModel)
    .chatMemoryProvider(id -> MessageWindowChatMemory.withMaxMessages(10))
    .build();

// 不同用户有独立的对话历史
assistant.chat("user-1", "我叫张三");
assistant.chat("user-2", "我叫李四");
assistant.chat("user-1", "我叫什么？");  // AI 知道是张三
assistant.chat("user-2", "我叫什么？");  // AI 知道是李四
```

### 记忆策略选择

```java
// 消息窗口记忆 - 保留最近 N 条消息
ChatMemory windowMemory = MessageWindowChatMemory.withMaxMessages(20);

// Token 窗口记忆 - 保留最近 N 个 Token
ChatMemory tokenMemory = TokenWindowChatMemory.withMaxTokens(4000);

// 持久化记忆
ChatMemoryStore store = new PersistentChatMemoryStore();
ChatMemory persistentMemory = PersistentChatMemory.builder()
    .storeId("conversation-123")
    .store(store)
    .maxMessages(50)
    .build();
```

### 记忆提供者配置

```java
MemoryAssistant assistant = AiServices.builder(MemoryAssistant.class)
    .chatLanguageModel(chatModel)
    // 方式1：使用提供者函数（推荐）
    .chatMemoryProvider(id -> MessageWindowChatMemory.withMaxMessages(10))
    // 方式2：使用单一记忆实例
    // .chatMemory(MessageWindowChatMemory.withMaxMessages(10))
    .build();
```

## Tools 集成

### 定义工具

```java
class WeatherTools {
    
    private final WeatherService weatherService;
    
    public WeatherTools(WeatherService weatherService) {
        this.weatherService = weatherService;
    }
    
    @Tool("获取指定城市的当前天气信息")
    public String getCurrentWeather(
        @P("城市名称，如：北京、上海") String city,
        @P(value = "温度单位", required = false) String unit
    ) {
        return weatherService.fetchWeather(city, unit);
    }
    
    @Tool("获取未来几天的天气预报")
    public String getWeatherForecast(
        @P("城市名称") String city,
        @P("预报天数，1-7") int days
    ) {
        return weatherService.fetchForecast(city, days);
    }
}
```

### 集成工具

```java
interface SmartAssistant {
    
    @SystemMessage("""
        你是一个智能助手。
        当用户询问天气相关问题时，使用天气工具获取实时数据。
        用自然语言回答用户问题。
        """)
    String chat(@UserMessage String message);
}

SmartAssistant assistant = AiServices.builder(SmartAssistant.class)
    .chatLanguageModel(chatModel)
    .tools(new WeatherTools(weatherService))
    .build();

// 使用 - AI 会自动判断何时调用工具
String response = assistant.chat("北京今天天气怎么样？");
// AI 会自动调用 getCurrentWeather("北京", null) 获取数据
```

### 工具执行配置

```java
SmartAssistant assistant = AiServices.builder(SmartAssistant.class)
    .chatLanguageModel(chatModel)
    .tools(new WeatherTools(weatherService))
    // 配置工具执行器
    .toolExecutor((toolName, args) -> {
        log.info("执行工具: {} with args: {}", toolName, args);
        // 自定义执行逻辑
        return executeTool(toolName, args);
    })
    // 配置最大工具调用次数（防止循环）
    .maxSequentialToolsInvocations(10)
    .build();
```

## RAG 集成

### 内容检索器

```java
interface RAGAssistant {
    
    @SystemMessage("""
        你是一个知识库助手。
        基于提供的知识库内容回答问题。
        如果知识库中没有相关信息，请诚实告知。
        """)
    String chat(@UserMessage String question);
}

// 创建内容检索器
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(embeddingStore)
    .embeddingModel(embeddingModel)
    .maxResults(5)           // 返回最多 5 个相关文档
    .minScore(0.7)           // 最低相似度分数
    .build();

RAGAssistant assistant = AiServices.builder(RAGAssistant.class)
    .chatLanguageModel(chatModel)
    .contentRetriever(retriever)
    .build();
```

### 增强器（Augmentor）

```java
// 自定义 RAG 增强器
class CustomAugmentor implements Augmentor {
    
    @Override
    public AugmentedMessage augment(UserMessage userMessage) {
        // 1. 检索相关内容
        List<Content> contents = retrieveRelevantContent(userMessage);
        
        // 2. 构建增强消息
        return AugmentedMessage.builder()
            .userMessage(userMessage)
            .contents(contents)
            .build();
    }
}

RAGAssistant assistant = AiServices.builder(RAGAssistant.class)
    .chatLanguageModel(chatModel)
    .augmentor(new CustomAugmentor())
    .build();
```

## 完整示例

### 智能客服机器人

```java
// 1. 定义接口
interface CustomerServiceBot {
    
    @SystemMessage("""
        你是电商平台的客服机器人。
        
        职责：
        1. 解答商品相关问题
        2. 处理订单查询（使用订单工具）
        3. 处理物流查询（使用物流工具）
        4. 处理退换货咨询
        
        规则：
        - 友好、专业的态度
        - 无法处理的问题建议转人工客服
        """)
    String chat(@MemoryId String sessionId, @UserMessage String message);
}

// 2. 定义工具
class ServiceTools {
    
    private final OrderService orderService;
    private final LogisticsService logisticsService;
    private final ProductService productService;
    
    @Tool("查询订单状态和详情")
    public String queryOrder(@P("订单号") String orderId) {
        Order order = orderService.getOrder(orderId);
        return formatOrderInfo(order);
    }
    
    @Tool("查询物流信息")
    public String queryLogistics(@P("运单号") String trackingNumber) {
        LogisticsInfo info = logisticsService.track(trackingNumber);
        return formatLogisticsInfo(info);
    }
    
    @Tool("查询商品信息")
    public String queryProduct(@P("商品名称或关键词") String keyword) {
        List<Product> products = productService.search(keyword);
        return formatProducts(products);
    }
    
    @Tool("创建退货申请")
    public String createReturnRequest(
        @P("订单号") String orderId,
        @P("退货原因") String reason
    ) {
        ReturnRequest request = orderService.createReturn(orderId, reason);
        return "退货申请已创建，退货单号：" + request.getId();
    }
}

// 3. 配置服务
@Configuration
public class BotConfig {
    
    @Bean
    public CustomerServiceBot customerServiceBot(
            ChatLanguageModel chatModel,
            OrderService orderService,
            LogisticsService logisticsService,
            ProductService productService) {
        
        return AiServices.builder(CustomerServiceBot.class)
            .chatLanguageModel(chatModel)
            .chatMemoryProvider(id -> MessageWindowChatMemory.withMaxMessages(20))
            .tools(new ServiceTools(orderService, logisticsService, productService))
            .build();
    }
}

// 4. 使用
@Service
public class CustomerService {
    
    private final CustomerServiceBot bot;
    
    public String handleMessage(String sessionId, String message) {
        return bot.chat(sessionId, message);
    }
}
```

### 测试用例

```java
@SpringBootTest
class CustomerServiceBotTest {
    
    @Autowired
    private CustomerServiceBot bot;
    
    @Test
    void testOrderQuery() {
        String response = bot.chat("session-1", "帮我查一下订单 ORD123456");
        assertNotNull(response);
        assertTrue(response.contains("订单") || response.contains("ORD123456"));
    }
    
    @Test
    void testMemory() {
        bot.chat("session-2", "我叫张三");
        String response = bot.chat("session-2", "我叫什么？");
        assertTrue(response.contains("张三"));
    }
}
```

## 调试技巧

### 启用日志

```xml
<!-- logback.xml -->
<logger name="dev.langchain4j" level="DEBUG"/>
<logger name="dev.langchain4j.service" level="TRACE"/>
```

### 使用监听器

```java
CustomerServiceBot bot = AiServices.builder(CustomerServiceBot.class)
    .chatLanguageModel(chatModel)
    .tools(new ServiceTools())
    .listeners(new ChatMemoryListener() {
        @Override
        public void onMessageAdded(ChatMessage message) {
            log.debug("Message added: {}", message);
        }
    })
    .build();
```

### 查看生成的提示词

```java
// 使用 debug 模式查看构建的完整提示词
AiServices.builder(Assistant.class)
    .chatLanguageModel(chatModel)
    .build();
// 日志会显示发送给 LLM 的完整消息
```

## 小结

本章我们学习了：

1. **AI Services 核心理念**：声明式接口定义，框架自动实现
2. **工作原理**：动态代理、注解解析、提示词构建
3. **高级注解**：@SystemMessage、@UserMessage、@Moderation
4. **返回类型**：字符串、结构化输出、流式响应
5. **Chat Memory**：单一会话、多会话、持久化记忆
6. **Tools 集成**：定义工具、自动调用、执行配置
7. **RAG 集成**：内容检索器、增强器

## 练习

1. 创建一个支持多语言的翻译助手
2. 实现一个带天气查询功能的对话机器人
3. 构建一个知识库问答系统

## 参考资料

- [Langchain4J AI Services 文档](https://docs.langchain4j.dev/tutorials/ai-services)
- [Langchain4J Tools 文档](https://docs.langchain4j.dev/tutorials/tools)
- [Langchain4J Chat Memory 文档](https://docs.langchain4j.dev/tutorials/chat-memory)

## 下一章预告

在下一章《模型集成》中，我们将深入探索：

- OpenAI 模型的高级配置
- Anthropic Claude 模型集成
- Google Gemini 模型集成
- 国内大模型集成
- 本地模型 Ollama 集成
- 模型选择最佳实践

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
