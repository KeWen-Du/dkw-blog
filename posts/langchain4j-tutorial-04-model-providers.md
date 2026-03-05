---
title: "Langchain4J 实战教程（四）：模型提供商集成"
date: "2025-07-21"
excerpt: "深入探索 Langchain4J 对各大模型提供商的支持，掌握 OpenAI、Anthropic、Google、国内大模型及本地模型的集成方法。"
tags: ["Java", "AI", "LLM", "Langchain4J", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 4
---

# Langchain4J 实战教程（四）：模型提供商集成

## 前言

Langchain4J 的核心优势之一是提供统一的 API 抽象，支持 20+ 主流大模型提供商。本章将深入探索各模型提供商的集成方法，帮助你根据业务需求选择合适的模型，并实现无缝切换。

## 模型提供商概览

```
┌─────────────────────────────────────────────────────────────────┐
│                   Langchain4J 支持的模型提供商                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  国际商业模型                                                    │
│  ─────────────                                                  │
│  ├── OpenAI        (GPT-4, GPT-4o, GPT-3.5)                     │
│  ├── Anthropic     (Claude 3.5 Sonnet, Claude 3 Opus)           │
│  ├── Google        (Gemini Pro, Gemini Flash)                   │
│  ├── Azure OpenAI  (GPT 系列企业版)                              │
│  ├── AWS Bedrock   (多模型聚合平台)                              │
│  └── Mistral AI    (Mistral Large, Medium, Small)               │
│                                                                 │
│  国内大模型                                                      │
│  ─────────────                                                  │
│  ├── 阿里云        (通义千问 Qwen)                               │
│  ├── 智谱 AI       (GLM-4, ChatGLM)                             │
│  ├── 百度          (文心一言 ERNIE)                              │
│  ├── 讯飞          (星火大模型)                                  │
│  └── Minimax       (abab 系列)                                  │
│                                                                 │
│  开源/本地模型                                                   │
│  ─────────────                                                  │
│  ├── Ollama        (Llama, Qwen, Mistral 本地部署)              │
│  ├── LocalAI       (OpenAI 兼容本地服务)                         │
│  ├── vLLM          (高性能推理引擎)                              │
│  └── HuggingFace   (开源模型托管)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## OpenAI 集成

### 依赖配置

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-open-ai</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Chat Model

```java
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;

// 基础配置
ChatLanguageModel model = OpenAiChatModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("gpt-4o-mini")
    .build();

// 完整配置
ChatLanguageModel model = OpenAiChatModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .baseUrl("https://api.openai.com/v1")  // 可自定义 API 端点
    .modelName("gpt-4o")
    .temperature(0.7)
    .topP(1.0)
    .maxTokens(4096)
    .timeout(Duration.ofSeconds(60))
    .maxRetries(3)
    .logRequests(true)
    .logResponses(true)
    .build();

String response = model.generate("Hello, how are you?");
```

### Streaming Chat Model

```java
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;

StreamingChatLanguageModel model = OpenAiStreamingChatModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("gpt-4o-mini")
    .build();

model.generate("Tell me a story", new StreamingResponseHandler<>() {
    @Override
    public void onNext(String token) {
        System.out.print(token);
    }
    
    @Override
    public void onComplete(Response<AiMessage> response) {
        System.out.println("\n完成！");
    }
    
    @Override
    public void onError(Throwable error) {
        error.printStackTrace();
    }
});
```

### Embedding Model

```java
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;

EmbeddingModel embeddingModel = OpenAiEmbeddingModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("text-embedding-3-small")  // 或 text-embedding-3-large
    .build();

// 单个文本嵌入
Embedding embedding = embeddingModel.embed("Hello World").content();

// 批量嵌入
List<Embedding> embeddings = embeddingModel.embedAll(
    List.of("text1", "text2", "text3")
).content();
```

### Image Model

```java
import dev.langchain4j.model.image.ImageModel;
import dev.langchain4j.model.openai.OpenAiImageModel;

ImageModel imageModel = OpenAiImageModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("dall-e-3")
    .size("1024x1024")
    .quality("standard")
    .style("vivid")
    .build();

Image image = imageModel.generate("A cute cat wearing a hat").content();
System.out.println(image.url());  // 图片 URL
```

### 模型选择建议

| 模型 | 适用场景 | 特点 |
|------|---------|------|
| gpt-4o | 复杂推理、高质量输出 | 最强能力，较贵 |
| gpt-4o-mini | 日常对话、简单任务 | 性价比最高 |
| gpt-4-turbo | 长文本分析 | 128K 上下文 |
| o1-preview | 复杂逻辑推理 | 深度思考 |

## Anthropic 集成

### 依赖配置

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-anthropic</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Chat Model

```java
import dev.langchain4j.model.anthropic.AnthropicChatModel;

ChatLanguageModel model = AnthropicChatModel.builder()
    .apiKey(System.getenv("ANTHROPIC_API_KEY"))
    .modelName("claude-3-5-sonnet-20241022")
    .temperature(0.7)
    .maxTokens(4096)
    .build();

String response = model.generate("Hello, Claude!");
```

### 模型选择

```java
// Claude 3.5 Sonnet - 最强性价比
AnthropicChatModel.builder()
    .modelName("claude-3-5-sonnet-20241022")
    .build();

// Claude 3 Opus - 最强能力
AnthropicChatModel.builder()
    .modelName("claude-3-opus-20240229")
    .build();

// Claude 3 Haiku - 快速响应
AnthropicChatModel.builder()
    .modelName("claude-3-haiku-20240307")
    .build();
```

### 特点与适用场景

| 模型 | 上下文 | 特点 | 适用场景 |
|------|--------|------|---------|
| Claude 3.5 Sonnet | 200K | 最佳性价比 | 大多数任务 |
| Claude 3 Opus | 200K | 最强能力 | 复杂推理、创意写作 |
| Claude 3 Haiku | 200K | 最快速度 | 简单任务、实时交互 |

## Google Gemini 集成

### 依赖配置

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-google-ai-gemini</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Chat Model

```java
import dev.langchain4j.model.googleai.GoogleAiGeminiChatModel;

ChatLanguageModel model = GoogleAiGeminiChatModel.builder()
    .apiKey(System.getenv("GOOGLE_AI_API_KEY"))
    .modelName("gemini-1.5-flash")
    .temperature(0.7)
    .maxOutputTokens(8192)
    .build();

String response = model.generate("Hello, Gemini!");
```

### 多模态支持

```java
// 处理图像
UserMessage message = UserMessage.from(
    TextContent.from("这张图片里有什么？"),
    ImageContent.from(new File("image.jpg"))
);

Response<AiMessage> response = model.generate(message);
```

### 模型选择

| 模型 | 上下文 | 特点 |
|------|--------|------|
| gemini-1.5-pro | 2M | 超长上下文、多模态 |
| gemini-1.5-flash | 1M | 快速、经济 |
| gemini-2.0-flash | 1M | 最新一代 |

## 国内大模型集成

### 阿里云通义千问

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-dashscope</artifactId>
    <version>1.0.0</version>
</dependency>
```

```java
import dev.langchain4j.model.dashscope.QwenChatModel;

ChatLanguageModel model = QwenChatModel.builder()
    .apiKey(System.getenv("DASHSCOPE_API_KEY"))
    .modelName("qwen-max")  // qwen-plus, qwen-turbo
    .temperature(0.7)
    .build();

String response = model.generate("你好，请介绍一下自己");
```

### 智谱 AI

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-zhipu-ai</artifactId>
    <version>1.0.0</version>
</dependency>
```

```java
import dev.langchain4j.model.zhipu.ZhipuAiChatModel;

ChatLanguageModel model = ZhipuAiChatModel.builder()
    .apiKey(System.getenv("ZHIPU_API_KEY"))
    .modelName("glm-4")  // glm-4-flash, glm-4-plus
    .temperature(0.7)
    .build();
```

### 百度文心一言

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-qianfan</artifactId>
    <version>1.0.0</version>
</dependency>
```

```java
import dev.langchain4j.model.qianfan.QianfanChatModel;

ChatLanguageModel model = QianfanChatModel.builder()
    .apiKey(System.getenv("QIANFAN_API_KEY"))
    .secretKey(System.getenv("QIANFAN_SECRET_KEY"))
    .modelName("ERNIE-4.0-8K")
    .build();
```

## Ollama 本地模型

### 安装与启动

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows - 下载安装包
# https://ollama.ai/download

# 启动服务
ollama serve

# 拉取模型
ollama pull llama3.2
ollama pull qwen2.5
ollama pull mistral
```

### 依赖配置

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-ollama</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Chat Model

```java
import dev.langchain4j.model.ollama.OllamaChatModel;

ChatLanguageModel model = OllamaChatModel.builder()
    .baseUrl("http://localhost:11434")
    .modelName("llama3.2")
    .temperature(0.7)
    .build();

String response = model.generate("Hello!");
```

### Embedding Model

```java
import dev.langchain4j.model.ollama.OllamaEmbeddingModel;

EmbeddingModel embeddingModel = OllamaEmbeddingModel.builder()
    .baseUrl("http://localhost:11434")
    .modelName("nomic-embed-text")  // 或 mxbai-embed-large
    .build();

Embedding embedding = embeddingModel.embed("Hello World").content();
```

### 推荐模型

| 模型 | 参数量 | 用途 | 硬件要求 |
|------|--------|------|---------|
| llama3.2:3b | 3B | 日常对话 | 8GB RAM |
| llama3.2:1b | 1B | 轻量级应用 | 4GB RAM |
| qwen2.5:7b | 7B | 中文对话 | 16GB RAM |
| mistral:7b | 7B | 英文对话 | 16GB RAM |
| codellama:7b | 7B | 代码生成 | 16GB RAM |

## Azure OpenAI 集成

### 依赖配置

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-azure-open-ai</artifactId>
    <version>1.0.0</version>
</dependency>
```

### 配置

```java
import dev.langchain4j.model.azure.AzureOpenAiChatModel;

ChatLanguageModel model = AzureOpenAiChatModel.builder()
    .endpoint("https://your-resource.openai.azure.com/")
    .apiKey(System.getenv("AZURE_OPENAI_API_KEY"))
    .deploymentName("gpt-4o-deployment")
    .temperature(0.7)
    .build();
```

### Spring Boot 配置

```yaml
langchain4j:
  azure-open-ai:
    chat-model:
      endpoint: https://your-resource.openai.azure.com/
      api-key: ${AZURE_OPENAI_API_KEY}
      deployment-name: gpt-4o-deployment
```

## 模型选择最佳实践

### 按场景选择

```
┌─────────────────────────────────────────────────────────────────┐
│                      模型选择决策树                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  是否需要本地部署？                                              │
│  ├── 是 ──→ Ollama (llama3.2, qwen2.5)                         │
│  │                                                              │
│  └── 否 ──→ 是否在中国大陆？                                     │
│             ├── 是 ──→ 通义千问 / 智谱 GLM / 文心一言            │
│             │                                                   │
│             └── 否 ──→ 任务类型？                                │
│                        ├── 复杂推理 ──→ GPT-4o / Claude 3 Opus  │
│                        ├── 日常对话 ──→ GPT-4o-mini              │
│                        ├── 长文本 ──→ Claude 3.5 Sonnet         │
│                        ├── 多模态 ──→ Gemini 1.5 Pro            │
│                        └── 代码生成 ──→ GPT-4o / Claude 3.5     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 成本优化

```java
// 策略1：根据任务复杂度选择模型
public class ModelRouter {
    
    private final ChatLanguageModel premiumModel;
    private final ChatLanguageModel standardModel;
    private final ChatLanguageModel economyModel;
    
    public String process(String input) {
        Complexity complexity = analyzeComplexity(input);
        
        return switch (complexity) {
            case HIGH -> premiumModel.generate(input);
            case MEDIUM -> standardModel.generate(input);
            case LOW -> economyModel.generate(input);
        };
    }
}

// 策略2：缓存常见问题
public class CachedModel {
    
    private final ChatLanguageModel model;
    private final Cache<String, String> cache = Caffeine.newBuilder()
        .maximumSize(1000)
        .expireAfterWrite(Duration.ofHours(1))
        .build();
    
    public String process(String input) {
        return cache.get(input, key -> model.generate(key));
    }
}
```

### 多模型配置

```java
@Configuration
public class ModelConfig {
    
    @Bean
    @Qualifier("openai")
    public ChatLanguageModel openAiModel() {
        return OpenAiChatModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("gpt-4o-mini")
            .build();
    }
    
    @Bean
    @Qualifier("anthropic")
    public ChatLanguageModel anthropicModel() {
        return AnthropicChatModel.builder()
            .apiKey(System.getenv("ANTHROPIC_API_KEY"))
            .modelName("claude-3-5-sonnet-20241022")
            .build();
    }
    
    @Bean
    @Qualifier("ollama")
    public ChatLanguageModel ollamaModel() {
        return OllamaChatModel.builder()
            .baseUrl("http://localhost:11434")
            .modelName("llama3.2")
            .build();
    }
    
    @Bean
    @Qualifier("qwen")
    public ChatLanguageModel qwenModel() {
        return QwenChatModel.builder()
            .apiKey(System.getenv("DASHSCOPE_API_KEY"))
            .modelName("qwen-max")
            .build();
    }
}
```

### Failover 策略

```java
public class FailoverModel implements ChatLanguageModel {
    
    private final List<ChatLanguageModel> models;
    private final int maxRetries;
    
    public FailoverModel(List<ChatLanguageModel> models, int maxRetries) {
        this.models = models;
        this.maxRetries = maxRetries;
    }
    
    @Override
    public Response<AiMessage> generate(List<ChatMessage> messages) {
        Exception lastException = null;
        
        for (int retry = 0; retry < maxRetries; retry++) {
            for (ChatLanguageModel model : models) {
                try {
                    return model.generate(messages);
                } catch (Exception e) {
                    log.warn("Model {} failed: {}", model.getClass().getSimpleName(), e.getMessage());
                    lastException = e;
                }
            }
        }
        
        throw new RuntimeException("All models failed", lastException);
    }
}

// 使用
ChatLanguageModel failoverModel = new FailoverModel(
    List.of(openAiModel, anthropicModel, ollamaModel),
    2
);
```

## Spring Boot 自动配置

### 配置文件

```yaml
# application.yml
langchain4j:
  # OpenAI
  open-ai:
    chat-model:
      api-key: ${OPENAI_API_KEY}
      model-name: gpt-4o-mini
      temperature: 0.7
    embedding-model:
      api-key: ${OPENAI_API_KEY}
      model-name: text-embedding-3-small
      
  # Anthropic
  anthropic:
    chat-model:
      api-key: ${ANTHROPIC_API_KEY}
      model-name: claude-3-5-sonnet-20241022
      
  # Ollama
  ollama:
    chat-model:
      base-url: http://localhost:11434
      model-name: llama3.2
    embedding-model:
      base-url: http://localhost:11434
      model-name: nomic-embed-text
```

### 条件注入

```java
@Configuration
public class AiConfig {
    
    @Bean
    @ConditionalOnProperty(name = "model.provider", havingValue = "openai")
    public Assistant openAiAssistant(ChatLanguageModel chatModel) {
        return createAssistant(chatModel);
    }
    
    @Bean
    @ConditionalOnProperty(name = "model.provider", havingValue = "anthropic")
    public Assistant anthropicAssistant(@Qualifier("anthropicChatModel") ChatLanguageModel chatModel) {
        return createAssistant(chatModel);
    }
}
```

## 小结

本章我们学习了：

1. **OpenAI 集成**：Chat、Streaming、Embedding、Image 模型
2. **Anthropic 集成**：Claude 系列模型配置
3. **Google Gemini 集成**：多模态支持
4. **国内大模型**：通义千问、智谱 AI、文心一言
5. **本地模型**：Ollama 安装与使用
6. **Azure OpenAI**：企业版配置
7. **最佳实践**：模型选择、成本优化、Failover 策略

## 练习

1. 配置 OpenAI 和 Anthropic 双模型支持
2. 实现一个基于 Ollama 的本地聊天应用
3. 创建一个带 Failover 机制的多模型服务

## 参考资料

- [OpenAI API 文档](https://platform.openai.com/docs/)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [Ollama 官网](https://ollama.ai/)
- [阿里云通义千问](https://help.aliyun.com/zh/dashscope/)

## 下一章预告

在下一章《Prompt 模板工程》中，我们将深入探索：

- PromptTemplate 高级用法
- 动态提示词构建
- Few-shot Learning
- Chain of Thought
- 提示词最佳实践

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
