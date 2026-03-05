---
title: "Langchain4J 实战教程（一）：概述与架构设计"
date: "2025-07-18"
excerpt: "深入理解 Langchain4J 框架的设计理念、核心架构和关键概念，为构建企业级 Java AI 应用奠定坚实基础。"
tags: ["Java", "AI", "LLM", "Langchain4J", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 1
---

# Langchain4J 实战教程（一）：概述与架构设计

## 前言

在 AI 应用开发领域，Python 长期占据主导地位。LangChain、LlamaIndex 等优秀的 Python 框架让开发者能够快速构建 AI 应用。然而，企业级 Java 应用生态同样庞大，大量金融、电商、企业服务系统基于 Java 技术栈构建。如何让 Java 开发者也能便捷地开发 AI 应用？

Langchain4J 应运而生。它是一个专为 Java/Kotlin 设计的 AI 应用开发框架，汲取了 LangChain、Haystack、LlamaIndex 等项目的精华，为 Java 开发者提供了一套优雅、统一的 AI 应用开发体验。

本教程将带你从零开始，系统性地掌握 Langchain4J 的核心概念和实战技巧，助你在 Java 生态中构建生产级 AI 应用。

## 什么是 Langchain4J？

### 定义与定位

Langchain4J 是一个开源的 Java 库，其核心目标是：

> **简化大语言模型（LLM）集成到 Java 应用程序的过程。**

Langchain4J 的设计理念：

- **统一 API**：为 20+ LLM 提供商和 30+ 向量存储提供统一接口
- **全面工具箱**：从底层提示词模板到高层 RAG、Agent 模式
- **Java 优先**：与 Spring Boot、Quarkus、Micronaut 等框架无缝集成
- **实用主义**：聚焦生产级应用，而非实验性功能

### 发展历程

```
┌─────────────────────────────────────────────────────────────┐
│                    Langchain4J 发展历程                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  2023年初 ──→ ChatGPT 热潮中诞生                             │
│      │                                                      │
│      │   "Python 有 LangChain，Java 需要自己的 AI 框架"      │
│      │                                                      │
│      ▼                                                      │
│  2023年中 ──→ 核心功能逐步完善                               │
│      │        • 多模型提供商支持                             │
│      │        • 向量存储集成                                 │
│      │        • RAG 基础能力                                 │
│      │                                                      │
│      ▼                                                      │
│  2024年 ──→ 企业级功能增强                                   │
│      │        • Spring Boot 集成                             │
│      │        • Quarkus 集成                                 │
│      │        • Function Calling                             │
│      │                                                      │
│      ▼                                                      │
│  2025年 ──→ 生产就绪                                         │
│               • 多模态支持（图像、音频、视频）                 │
│               • MCP 协议支持                                 │
│               • 可观测性增强                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 与其他框架的对比

```
┌─────────────────────────────────────────────────────────────────┐
│                       AI 框架对比                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LangChain (Python)          Langchain4J (Java)                │
│  ─────────────────          ─────────────────                  │
│  • Python 生态                • Java/Kotlin 生态               │
│  • 社区最大                   • 企业级应用首选                  │
│  • 快速原型                   • 类型安全                        │
│  • 数据科学友好               • Spring/Quarkus 深度集成        │
│                                                                 │
│  Spring AI (Java)            Langchain4J (Java)                │
│  ─────────────────          ─────────────────                  │
│  • Spring 官方               • 社区驱动                        │
│  • Spring Boot 优先          • 框架无关                        │
│  • 配置驱动                   • API 更简洁                      │
│  • 与 Spring 生态紧密         • 更广泛的模型支持                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Langchain4J Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    AI Services Layer                     │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │              @AiService Interface                 │   │   │
│  │  │   • 声明式 AI 接口定义                            │   │   │
│  │  │   • 自动实现 LLM 调用逻辑                         │   │   │
│  │  │   • 支持记忆、工具、RAG 集成                      │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Core APIs                             │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │ ChatLanguage │ │  Embedding   │ │   Streaming  │     │   │
│  │  │    Model     │ │    Model     │ │   Response   │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │    Image     │ │    Audio     │ │  Moderation  │     │   │
│  │  │    Model     │ │    Model     │ │    Model     │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Supporting Components                    │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │   Prompt     │ │   Chat       │ │   Output     │     │   │
│  │  │  Templates   │ │   Memory     │ │   Parsers    │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │  Document    │ │   Content    │ │     RAG      │     │   │
│  │  │  Loaders     │ │   Retriever  │ │   Pipeline   │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │    Tools     │ │    MCP       │ │   Splitter   │     │   │
│  │  │  Functions   │ │   Support    │ │              │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Data Layer                              │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │              Embedding Store                      │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │   │
│  │  │PGVector│ │Pinecone│ │ Milvus │ │ Chroma │ ...       │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               Model Provider Layer                       │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │   │
│  │  │ OpenAI │ │Anthropic│ │ Google │ │ Azure  │           │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │   │
│  │  │ Ollama │ │ 阿里云  │ │ 智谱AI │ │ 百度   │           │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 核心模块详解

#### 1. AI Services

AI Services 是 Langchain4J 最核心的概念，提供声明式的 AI 接口定义：

```java
interface Assistant {
    
    @SystemMessage("你是一个专业的 Java 技术顾问")
    String chat(@MemoryId String conversationId, @UserMessage String userMessage);
}

// 使用
Assistant assistant = AiServices.builder(Assistant.class)
    .chatLanguageModel(chatModel)
    .chatMemoryProvider(id -> MessageWindowChatMemory.withMaxMessages(10))
    .build();

String response = assistant.chat("user-123", "什么是 Java Record？");
```

AI Services 自动处理：
- 提示词构建
- LLM 调用
- 响应解析
- 记忆管理
- 工具调用

#### 2. ChatLanguageModel

聊天语言模型是与 LLM 交互的核心接口：

```java
// 同步调用
ChatResponse response = chatModel.generate(
    SystemMessage.from("你是一个助手"),
    UserMessage.from("你好")
);

// 流式调用
TokenStream stream = chatModel.generate(
    messages,
    new StreamingResponseHandler<>() {
        @Override
        public void onNext(String token) {
            System.out.print(token);
        }
    }
);
```

#### 3. EmbeddingModel

嵌入模型将文本转换为向量：

```java
// 单个文本嵌入
Embedding embedding = embeddingModel.embed("Hello World").content();

// 批量嵌入
List<Embedding> embeddings = embeddingModel.embedAll(
    List.of("text1", "text2", "text3")
).content();

// 获取向量维度
int dimension = embeddingModel.dimension(); // 例如 1536
```

#### 4. EmbeddingStore

向量存储提供统一的持久化和检索接口：

```java
// 存储嵌入
EmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();
store.add(embedding, TextSegment.from("文档内容", metadata));

// 相似度搜索
List<EmbeddingMatch<TextSegment>> matches = store.findRelevant(
    queryEmbedding,
    5  // 返回 top 5
);
```

#### 5. Document Loaders

文档加载器支持多种格式：

```java
// PDF 文档
Document pdfDoc = new PdfDocumentLoader().load(Path.of("document.pdf"));

// 文本文件
Document textDoc = new TextDocumentLoader().load(Path.of("document.txt"));

// 从 URL 加载
Document webDoc = new UrlDocumentLoader().load("https://example.com/article");
```

#### 6. Tools / Function Calling

让 LLM 调用 Java 方法：

```java
class WeatherTools {
    
    @Tool("获取指定城市的当前天气")
    public String getWeather(@P("城市名称") String city) {
        // 调用天气 API
        return weatherService.fetchWeather(city);
    }
}

// 配置到 AI Service
Assistant assistant = AiServices.builder(Assistant.class)
    .chatLanguageModel(chatModel)
    .tools(new WeatherTools())
    .build();
```

## 核心概念

### Message（消息）

Langchain4J 定义了多种消息类型：

```java
// 系统消息 - 定义 AI 的角色和行为
SystemMessage system = SystemMessage.from("你是一个专业的技术顾问");

// 用户消息 - 用户的输入
UserMessage user = UserMessage.from("请解释 RAG 的原理");

// AI 消息 - AI 的响应
AiMessage ai = AiMessage.from("RAG 是 Retrieval-Augmented Generation...");

// 工具消息 - 工具调用的结果
ToolExecutionResultMessage toolResult = ToolExecutionResultMessage.from(
    toolExecutionId,
    "tool-name",
    "result"
);
```

### Prompt Template（提示词模板）

灵活的提示词模板系统：

```java
// 使用占位符
PromptTemplate template = PromptTemplate.from("""
    你是一个{{role}}，请用{{style}}的风格回答问题。
    
    问题：{{question}}
    """);

Prompt prompt = template.apply(Map.of(
    "role", "资深架构师",
    "style", "通俗易懂",
    "question", "如何设计微服务架构？"
));
```

### Chat Memory（对话记忆）

多种记忆策略：

```java
// 消息窗口记忆 - 保留最近 N 条消息
ChatMemory windowMemory = MessageWindowChatMemory.withMaxMessages(10);

// Token 窗口记忆 - 保留最近 N 个 Token
ChatMemory tokenMemory = TokenWindowChatMemory.withMaxTokens(4000);

// 持久化记忆
ChatMemory persistentMemory = PersistentChatMemory.builder()
    .storeId("conversation-123")
    .store(chatMemoryStore)
    .maxMessages(20)
    .build();
```

### Content Retriever（内容检索器）

RAG 的核心组件：

```java
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(embeddingStore)
    .embeddingModel(embeddingModel)
    .maxResults(5)
    .minScore(0.7)
    .build();

// 集成到 AI Service
Assistant assistant = AiServices.builder(Assistant.class)
    .chatLanguageModel(chatModel)
    .contentRetriever(retriever)
    .build();
```

## 支持的模型提供商

Langchain4J 支持几乎所有主流的 AI 模型提供商：

### 国际商业模型

| 提供商 | 支持的模型类型 | 特点 |
|--------|---------------|------|
| OpenAI | Chat, Embedding, Image, Audio, Moderation | 最成熟的 API |
| Anthropic | Chat | Claude 系列，擅长长文本 |
| Google | Chat, Embedding, Image | Gemini 系列，多模态支持 |
| Microsoft Azure | Chat, Embedding | OpenAI 模型的企业版 |
| Amazon Bedrock | Chat, Embedding | 多模型聚合平台 |

### 开源/本地模型

| 提供商 | 支持的模型类型 | 特点 |
|--------|---------------|------|
| Ollama | Chat, Embedding | 本地部署，支持 Llama、Qwen 等 |
| LocalAI | Chat, Embedding | OpenAI 兼容的本地服务 |
| vLLM | Chat | 高性能推理引擎 |

### 国内模型

Langchain4J 对国内 AI 服务有良好支持：

| 提供商 | 模型系列 | 特点 |
|--------|---------|------|
| 阿里云 | 通义千问 | 中文能力强 |
| 智谱 AI | GLM | 国产大模型领先 |
| 百度 | 文心一言 | 中文场景优化 |
| 讯飞 | 星火 | 语音+文本能力 |
| Minimax | abab | 多模态能力 |

## 支持的向量数据库

```
Langchain4J 支持的向量存储：
├── 内存存储
│   └── InMemoryEmbeddingStore（开发测试用）
├── 关系型数据库扩展
│   ├── PostgreSQL (PGVector)
│   ├── MySQL
│   └── H2
├── 云托管服务
│   ├── Pinecone
│   ├── Azure AI Search
│   ├── AWS OpenSearch
│   └── MongoDB Atlas
├── 开源向量数据库
│   ├── Milvus
│   ├── Chroma
│   ├── Qdrant
│   ├── Weaviate
│   └── Elasticsearch
└── 其他
    ├── Redis
    └── Neo4j
```

## 典型应用场景

### 1. 智能问答系统

```
┌─────────────────────────────────────────────────────────────┐
│                    智能问答架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户问题 ──→ 问题向量化 ──→ 向量检索 ──→ 上下文构建        │
│                  │              │                          │
│                  ▼              ▼                          │
│           EmbeddingModel   EmbeddingStore                  │
│                                     │                       │
│                                     ▼                       │
│                    LLM 生成回答 ──→ 返回用户                 │
│                                                             │
│  关键组件：                                                  │
│  • EmbeddingModel - 问题向量化                              │
│  • EmbeddingStore - 相似文档检索                            │
│  • ChatLanguageModel - 生成回答                             │
│  • ContentRetriever - RAG 流程封装                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. 企业知识库助手

```java
interface KnowledgeAssistant {
    
    @SystemMessage("""
        你是一个企业知识库助手。
        基于提供的知识库内容回答用户问题。
        如果知识库中没有相关信息，请诚实地告知用户。
        """)
    String chat(@MemoryId String userId, @UserMessage String question);
}

@Service
public class KnowledgeService {
    
    private final KnowledgeAssistant assistant;
    
    public KnowledgeService(ChatLanguageModel model, 
                           EmbeddingStore<TextSegment> store,
                           EmbeddingModel embeddingModel) {
        
        ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
            .embeddingStore(store)
            .embeddingModel(embeddingModel)
            .maxResults(5)
            .build();
            
        this.assistant = AiServices.builder(KnowledgeAssistant.class)
            .chatLanguageModel(model)
            .contentRetriever(retriever)
            .chatMemoryProvider(id -> MessageWindowChatMemory.withMaxMessages(10))
            .build();
    }
    
    public String ask(String userId, String question) {
        return assistant.chat(userId, question);
    }
}
```

### 3. 智能客服机器人

```java
interface CustomerServiceBot {
    
    @SystemMessage("""
        你是一个专业的客服代表。
        1. 礼貌友好地回答用户问题
        2. 对于订单查询，使用订单工具
        3. 对于物流查询，使用物流工具
        4. 如果无法处理，建议转人工
        """)
    String chat(@MemoryId String sessionId, @UserMessage String message);
}

// 配置工具
class ServiceTools {
    
    @Tool("查询订单状态")
    public OrderStatus checkOrder(@P("订单号") String orderId) {
        return orderService.getStatus(orderId);
    }
    
    @Tool("查询物流信息")
    public LogisticsInfo checkLogistics(@P("运单号") String trackingNumber) {
        return logisticsService.track(trackingNumber);
    }
}
```

### 4. 代码助手

```java
interface CodeAssistant {
    
    @SystemMessage("""
        你是一个专业的编程助手。
        提供代码示例、解释技术概念、帮助调试问题。
        代码示例要完整、可运行。
        """)
    String chat(@UserMessage String question);
    
    @Tool("执行 Java 代码")
    String executeCode(@P("Java 代码") String code);
    
    @Tool("搜索 Stack Overflow")
    List<String> searchSO(@P("搜索关键词") String query);
}
```

## 版本与兼容性

### Langchain4J 版本

| Langchain4J 版本 | Java 版本 | 状态 | 说明 |
|------------------|-----------|------|------|
| 1.0.x | 17+ | 稳定版 | 生产可用 |
| 1.1.x | 17+ | 最新稳定版 | 推荐使用 |

### 框架集成版本

| 框架 | Langchain4J 集成 | 特点 |
|------|------------------|------|
| Spring Boot | langchain4j-spring-boot-starter | 自动配置、注入 |
| Quarkus | quarkus-langchain4j | 原生编译支持 |
| Micronaut | micronaut-langchain4j | 轻量级集成 |
| Helidon | helidon-langchain4j | 云原生支持 |

### 依赖配置

```xml
<!-- Maven - 核心 -->
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j</artifactId>
    <version>1.0.0</version>
</dependency>

<!-- OpenAI 支持 -->
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-open-ai</artifactId>
    <version>1.0.0</version>
</dependency>

<!-- Spring Boot 集成 -->
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-spring-boot-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

```groovy
// Gradle
implementation 'dev.langchain4j:langchain4j:1.0.0'
implementation 'dev.langchain4j:langchain4j-open-ai:1.0.0'
```

## 企业级优势

### 1. 统一的抽象层

```java
// 切换模型只需更改配置
// OpenAI
ChatLanguageModel model = OpenAiChatModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("gpt-4")
    .build();

// 切换到 Anthropic Claude
ChatLanguageModel model = AnthropicChatModel.builder()
    .apiKey(System.getenv("ANTHROPIC_API_KEY"))
    .modelName("claude-3-opus-20240229")
    .build();

// 代码完全不变，只需更换实现
Assistant assistant = AiServices.builder(Assistant.class)
    .chatLanguageModel(model)
    .build();
```

### 2. Spring Boot 深度集成

```yaml
# application.yml
langchain4j:
  open-ai:
    chat-model:
      api-key: ${OPENAI_API_KEY}
      model-name: gpt-4
      temperature: 0.7
      max-tokens: 2000
      
  embedding-store:
    type: in-memory
```

```java
@Configuration
public class AiConfig {
    
    @Bean
    public Assistant assistant(ChatLanguageModel chatModel,
                               EmbeddingStore<TextSegment> store,
                               EmbeddingModel embeddingModel) {
        
        ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
            .embeddingStore(store)
            .embeddingModel(embeddingModel)
            .build();
            
        return AiServices.builder(Assistant.class)
            .chatLanguageModel(chatModel)
            .contentRetriever(retriever)
            .build();
    }
}
```

### 3. 类型安全

```java
// 输出自动映射为 Java 对象
record PersonInfo(
    String name,
    int age,
    List<String> skills
) {}

interface PersonExtractor {
    
    @UserMessage("从以下文本提取人员信息：{{text}}")
    PersonInfo extract(@V("text") String text);
}

PersonExtractor extractor = AiServices.builder(PersonExtractor.class)
    .chatLanguageModel(chatModel)
    .build();

PersonInfo person = extractor.extract(
    "张三，28岁，精通Java和Python"
);
// person.name() = "张三"
// person.age() = 28
// person.skills() = ["Java", "Python"]
```

### 4. 可观测性

Langchain4J 提供丰富的日志和追踪支持：

```java
// 配置日志级别查看详细信息
logging:
  level:
    dev.langchain4j: DEBUG
    
// 自定义监听器
ChatMemory memory = MessageWindowChatMemory.withMaxMessages(10);
memory.add(new ChatMemoryListener() {
    @Override
    public void onMessageAdded(ChatMessage message) {
        log.info("Message added: {}", message);
    }
});
```

## 本教程学习路径

```
第一阶段：基础篇
├── 第1章：概述与架构设计（本章）
├── 第2章：快速入门 - 第一个 AI 应用
└── 第3章：AI Services 核心详解

第二阶段：核心功能篇
├── 第4章：多模型提供商集成
├── 第5章：Prompt 模板工程
└── 第6章：Chat Memory 对话记忆

第三阶段：进阶应用篇
├── 第7章：RAG 检索增强生成
└── 第8章：Tools 与 Agent 开发

第四阶段：生产篇
└── 第9章：可观测性与生产部署
```

## 环境准备

在开始后续章节前，请确保准备以下环境：

### 开发环境

- **JDK 17+**（推荐 21+）
- **Maven 3.8+** 或 **Gradle 8.0+**
- **IDE**：IntelliJ IDEA（推荐）或 Eclipse
- **Docker**：用于本地运行向量数据库

### API 密钥

建议注册以下平台的 API 密钥：

1. **OpenAI**：https://platform.openai.com/
2. **Anthropic**：https://www.anthropic.com/
3. **Ollama**：本地部署，无需 API 密钥

### 项目初始化

```bash
# 使用 Maven Archetype
mvn archetype:generate \
  -DgroupId=com.example \
  -DartifactId=langchain4j-demo \
  -DarchetypeArtifactId=maven-archetype-quickstart \
  -DinteractiveMode=false

# 或使用 Spring Initializr
# https://start.spring.io
# 添加 Spring Web 依赖，然后手动添加 Langchain4J 依赖
```

### Ollama 本地模型

```bash
# 安装 Ollama
# macOS: brew install ollama
# Windows: https://ollama.ai/download

# 拉取模型
ollama pull llama3.2
ollama pull qwen2.5

# 启动服务
ollama serve
```

## 小结

本章我们学习了：

1. **Langchain4J 定位**：专为 Java 开发者设计的 AI 应用开发框架
2. **核心架构**：AI Services、ChatLanguageModel、EmbeddingModel、EmbeddingStore 等模块
3. **核心概念**：Message、Prompt Template、Chat Memory、Content Retriever
4. **生态支持**：20+ 模型提供商、30+ 向量数据库
5. **企业级优势**：统一抽象、Spring 集成、类型安全、可观测性

## 参考资料

- [Langchain4J 官方文档](https://docs.langchain4j.dev/)
- [Langchain4J GitHub](https://github.com/langchain4j/langchain4j)
- [Langchain4J Examples](https://github.com/langchain4j/langchain4j-examples)
- [LangChain (Python)](https://python.langchain.com/)
- [Ollama](https://ollama.ai/)

## 下一章预告

在下一章《快速入门》中，我们将：

- 搭建 Langchain4J 开发环境
- 配置第一个 AI 模型连接
- 构建一个完整的对话应用
- 理解 AI Services 的基本用法

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
