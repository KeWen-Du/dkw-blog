---
title: "Spring AI 实战教程（一）：概述与架构设计"
date: "2025-08-22 09:00:00"
excerpt: "深入理解 Spring AI 框架的设计理念、核心架构和关键概念，为构建企业级 AI 应用奠定坚实基础。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 1
---

# Spring AI 实战教程（一）：概述与架构设计

## 前言

随着大语言模型（LLM）技术的飞速发展，越来越多的企业开始将 AI 能力集成到自己的应用中。然而，直接调用 LLM API 往往面临诸多挑战：不同供应商的 API 差异、复杂的提示词管理、向量数据库集成、RAG 架构实现等问题，让开发者望而却步。

Spring AI 应运而生，它为 Java/Kotlin 开发者提供了一套优雅、统一的 AI 应用开发框架。本教程将带你从零开始，系统性地掌握 Spring AI 的核心概念和实战技巧。

## 什么是 Spring AI？

### 定义与定位

Spring AI 是 Spring 官方推出的 AI 应用开发框架，其核心目标是：

> **解决 AI 集成的根本挑战：将企业数据和 API 与 AI 模型连接起来。**

Spring AI 的设计理念源自 Spring 生态系统的核心原则：

- **可移植性**：统一的 API 抽象，支持多个 AI 供应商
- **模块化设计**：各组件可独立使用、灵活组合
- **POJO 驱动**：使用 Plain Old Java Objects 作为构建块

### 与其他框架的关系

Spring AI 从 LangChain、LlamaIndex 等 Python 项目中汲取灵感，但并非简单的移植：

```
┌─────────────────────────────────────────────────────────────┐
│                    AI 框架对比                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LangChain (Python)    ←─ 灵感来源 ─→    Spring AI (Java)   │
│                                                             │
│  特点：                     特点：                          │
│  • Python 生态              • Spring 生态深度集成           │
│  • 快速原型开发             • 企业级架构设计                │
│  • 社区插件丰富             • 类型安全、可维护性强          │
│  • 适合数据科学             • 适合企业后端服务              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 核心架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      Spring AI Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Application Layer                     │   │
│  │         (Spring Boot Application / Services)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Core APIs                             │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │ ChatClient   │ │ Embedding    │ │ ImageClient  │     │   │
│  │  │   API        │ │   Model      │ │   API        │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │ Audio        │ │ Moderation   │ │ Tools/       │     │   │
│  │  │ Transcription│ │   Model      │ │ Functions    │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Supporting Components                    │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │   Prompt     │ │  Structured  │ │   Advisors   │     │   │
│  │  │  Template    │ │   Outputs    │ │    API       │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │  Conversation│ │    RAG       │ │ Observability│     │   │
│  │  │    Memory    │ │  Pipeline    │ │   Support    │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Data Layer                              │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │              Vector Store Abstraction             │   │   │
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
│  │  │ OpenAI │ │Anthropic│ │ Google │ │ Ollama │           │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │   │
│  │  │ Azure  │ │ Bedrock│ │ 阿里云  │ │ 智谱AI │           │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 核心模块详解

#### 1. ChatClient API

ChatClient 是 Spring AI 的核心 API，提供流畅的聊天交互接口：

```java
// 简单对话示例
String response = chatClient.prompt()
    .user("请解释一下什么是 RAG？")
    .call()
    .content();

// 带系统提示的对话
String response = chatClient.prompt()
    .system("你是一个专业的技术顾问，用简洁的语言回答问题。")
    .user("Spring AI 的优势是什么？")
    .call()
    .content();
```

ChatClient 的设计类似于 Spring 的 `WebClient` 和 `RestClient`，采用流式 API 风格，直观易用。

#### 2. Embedding Model

Embedding（嵌入）是将文本转换为向量的关键组件：

```java
// 文本嵌入
EmbeddingResponse embedding = embeddingModel.embed("这是一段需要向量化的文本");

// 获取向量数据
float[] vector = embedding.getResult().getOutput();
// 输出: [0.123, -0.456, 0.789, ...]
```

向量嵌入是 RAG（检索增强生成）架构的基础，使得语义搜索成为可能。

#### 3. Vector Store

Vector Store 提供统一的向量存储抽象：

```java
// 存储文档
vectorStore.add(List.of(
    new Document("Spring Boot 是 Spring 框架的快速开发工具"),
    new Document("Spring AI 是 Spring 生态的 AI 开发框架")
));

// 相似度搜索
List<Document> results = vectorStore.similaritySearch(
    SearchRequest.query("什么是 Spring AI？").withTopK(3)
);
```

#### 4. Tools / Function Calling

Spring AI 支持让 LLM 调用本地函数：

```java
@Configuration
public class ToolsConfig {
    
    @Bean
    @Description("获取指定城市的当前天气信息")
    public Function<WeatherRequest, WeatherResponse> weatherFunction() {
        return request -> {
            // 调用天气 API
            return weatherService.getWeather(request.city());
        };
    }
}

// 使用
String response = chatClient.prompt()
    .user("北京今天天气怎么样？")
    .functions("weatherFunction")  // 注册函数
    .call()
    .content();
```

#### 5. Structured Outputs

将 LLM 输出映射为 Java 对象：

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

// person.name() = "张三"
// person.age() = 28
// person.skills() = ["Java", "Python"]
```

## 核心概念

### Prompt（提示词）

Prompt 是与 LLM 交互的核心载体。Spring AI 提供了强大的提示词模板支持：

```java
// 使用 StringTemplate 格式
PromptTemplate template = new PromptTemplate("""
    你是一个{role}，请用{style}的风格回答问题。
    
    问题：{question}
    """);

Prompt prompt = template.create(Map.of(
    "role", "资深架构师",
    "style", "通俗易懂",
    "question", "如何设计一个高并发系统？"
));

String response = chatClient.prompt(prompt).call().content();
```

### Advisor

Advisor 是 Spring AI 的切面式增强机制，用于封装常见的 AI 应用模式：

```java
// 对话记忆 Advisor
ChatClient client = ChatClient.builder(chatModel)
    .defaultAdvisors(new MessageChatMemoryAdvisor(chatMemory))
    .build();

// RAG Advisor
ChatClient client = ChatClient.builder(chatModel)
    .defaultAdvisors(new QuestionAnswerAdvisor(vectorStore))
    .build();
```

### Observation（可观测性）

Spring AI 集成了 Micrometer，提供开箱即用的可观测性支持：

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: prometheus, metrics
  metrics:
    tags:
      application: spring-ai-demo
```

自动收集的指标包括：
- 请求延迟（P50、P95、P99）
- Token 使用量
- 模型调用次数
- 错误率

## 支持的模型提供商

Spring AI 支持几乎所有主流的 AI 模型提供商：

### 商业模型

| 提供商 | 支持的模型类型 | 特点 |
|--------|---------------|------|
| OpenAI | Chat, Embedding, Image, Audio, Moderation | 最成熟的 API |
| Anthropic | Chat, Embedding | Claude 系列，擅长长文本 |
| Google | Chat, Embedding | Gemini 系列，多模态支持 |
| Microsoft Azure | Chat, Embedding | OpenAI 模型的企业版 |
| Amazon Bedrock | Chat, Embedding | 多模型聚合平台 |

### 开源/本地模型

| 提供商 | 支持的模型类型 | 特点 |
|--------|---------------|------|
| Ollama | Chat, Embedding | 本地部署，支持 Llama、Qwen 等 |
| HuggingFace | Chat | 开源模型聚合 |

### 国内模型

Spring AI 也支持国内的 AI 服务：
- 阿里云通义千问
- 智谱 AI (GLM)
- 百度文心一言
- 讯飞星火

## 支持的向量数据库

Spring AI 提供统一的 Vector Store 抽象，支持以下向量数据库：

```
支持的向量数据库：
├── 关系型数据库扩展
│   ├── PostgreSQL (PGVector)
│   ├── MariaDB
│   └── Oracle
├── 云托管服务
│   ├── Pinecone
│   ├── Azure Vector Search
│   ├── AWS OpenSearch
│   └── MongoDB Atlas
├── 开源向量数据库
│   ├── Milvus
│   ├── Chroma
│   ├── Qdrant
│   ├── Weaviate
│   └── Neo4j
└── 其他
    ├── Redis
    ├── Elasticsearch
    └── Apache Cassandra
```

## 典型应用场景

### 1. 智能问答系统

```
┌─────────────────────────────────────────────────────────────┐
│                    智能问答架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户问题 ──→ 问题理解 ──→ 向量检索 ──→ 上下文构建          │
│                               │                             │
│                               ▼                             │
│                         Vector Store                        │
│                               │                             │
│                               ▼                             │
│                    LLM 生成回答 ──→ 返回用户                 │
│                                                             │
│  关键组件：                                                  │
│  • EmbeddingModel - 问题向量化                              │
│  • VectorStore - 相似文档检索                               │
│  • ChatClient - 生成回答                                    │
│  • QuestionAnswerAdvisor - RAG 流程封装                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. 对话式客服

```java
@Service
public class CustomerServiceBot {
    
    private final ChatClient chatClient;
    
    public CustomerServiceBot(ChatClient.Builder builder, 
                              VectorStore knowledgeBase) {
        this.chatClient = builder
            .defaultSystem("""
                你是一个专业的客服代表。
                请基于知识库回答用户问题，如果知识库中没有相关信息，
                请诚实地告知用户你会帮助转接人工客服。
                """)
            .defaultAdvisors(new QuestionAnswerAdvisor(knowledgeBase))
            .build();
    }
    
    public String chat(String userId, String message) {
        return chatClient.prompt()
            .user(message)
            .advisors(advisor -> advisor
                .param("chat_memory_conversation_id", userId))
            .call()
            .content();
    }
}
```

### 3. 文档分析助手

```java
@Service
public class DocumentAnalyzer {
    
    private final ChatClient chatClient;
    private final VectorStore vectorStore;
    
    public AnalysisResult analyze(MultipartFile file, String question) {
        // 1. 文档向量化存储
        List<Document> documents = documentReader.read(file);
        vectorStore.add(documents);
        
        // 2. 基于问题检索相关内容
        List<Document> relevant = vectorStore.similaritySearch(
            SearchRequest.query(question).withTopK(5)
        );
        
        // 3. 生成分析结果
        String context = relevant.stream()
            .map(Document::getContent)
            .collect(Collectors.joining("\n\n"));
            
        return chatClient.prompt()
            .user("""
                基于以下文档内容回答问题：
                
                {context}
                
                问题：{question}
                """)
            .call()
            .entity(AnalysisResult.class);
    }
}
```

## 版本与兼容性

### Spring AI 版本

| Spring AI 版本 | Spring Boot 版本 | Java 版本 | 状态 |
|----------------|------------------|-----------|------|
| 1.0.x | 3.3.x / 3.4.x | 17+ | 稳定版 |
| 1.1.x | 3.5.x | 17+ | 最新稳定版 |
| 2.0.x | 4.x | 21+ | 里程碑版本 |

### 依赖配置

```xml
<!-- Maven -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.ai</groupId>
            <artifactId>spring-ai-bom</artifactId>
            <version>1.0.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <!-- OpenAI 支持 -->
    <dependency>
        <groupId>org.springframework.ai</groupId>
        <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
    </dependency>
    
    <!-- PGVector 支持 -->
    <dependency>
        <groupId>org.springframework.ai</groupId>
        <artifactId>spring-ai-pgvector-store-spring-boot-starter</artifactId>
    </dependency>
</dependencies>
```

```groovy
// Gradle
implementation platform('org.springframework.ai:spring-ai-bom:1.0.0')
implementation 'org.springframework.ai:spring-ai-openai-spring-boot-starter'
```

## 企业级优势

### 1. 统一的抽象层

```java
// 切换模型只需更改配置，代码无需修改
// OpenAI
spring.ai.openai.api-key=${OPENAI_API_KEY}
spring.ai.openai.chat.options.model=gpt-4

// 切换到 Anthropic
spring.ai.anthropic.api-key=${ANTHROPIC_API_KEY}
spring.ai.anthropic.chat.options.model=claude-3-opus
```

### 2. Spring 生态集成

- **Spring Boot Auto-Configuration**：零配置启动
- **Spring Security**：安全的 API 访问控制
- **Spring Data**：与 JPA、MongoDB 等无缝集成
- **Spring Cloud**：微服务架构支持
- **Spring Actuator**：健康检查和监控

### 3. 生产就绪

```yaml
# 生产环境配置示例
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        enabled: true
        options:
          model: gpt-4-turbo
          temperature: 0.7
          max-tokens: 2000
          
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  tracing:
    enabled: true
    sampling:
      probability: 1.0
```

## 本教程学习路径

```
第一阶段：基础篇
├── 第1章：概述与架构设计（本章）
├── 第2章：快速入门 - 第一个 AI 应用
└── 第3章：ChatClient API 详解

第二阶段：核心功能篇
├── 第4章：多模型提供商集成
├── 第5章：结构化输出处理
└── 第6章：Embedding 与向量存储

第三阶段：进阶应用篇
├── 第7章：RAG 检索增强生成
└── 第8章：Tools 与 Function Calling

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

使用 Spring Initializr 快速创建项目：

```bash
# 使用 curl
curl https://start.spring.io/starter.zip \
  -d dependencies=web,openai \
  -d type=maven-project \
  -d javaVersion=21 \
  -o spring-ai-demo.zip

# 或访问 https://start.spring.io
# 搜索并添加 "Spring AI" 相关依赖
```

## 小结

本章我们学习了：

1. **Spring AI 定位**：解决企业 AI 集成的核心框架
2. **核心架构**：ChatClient、Embedding、Vector Store、Tools 等模块
3. **核心概念**：Prompt、Advisor、Observation
4. **生态支持**：丰富的模型提供商和向量数据库支持
5. **企业级优势**：统一抽象、Spring 集成、生产就绪

## 参考资料

- [Spring AI 官方文档](https://docs.spring.io/spring-ai/reference/)
- [Spring AI GitHub](https://github.com/spring-projects/spring-ai)
- [Spring Initializr](https://start.spring.io/)
- [LangChain (Python)](https://python.langchain.com/)

## 下一章预告

在下一章《快速入门》中，我们将：

- 搭建 Spring AI 开发环境
- 配置第一个 AI 模型连接
- 构建一个完整的对话应用
- 理解 Spring AI 的自动配置机制

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
