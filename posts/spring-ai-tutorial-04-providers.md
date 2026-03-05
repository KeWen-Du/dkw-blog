---
title: "Spring AI 实战教程（四）：多模型提供商集成"
date: "2025-08-17"
excerpt: "全面掌握 Spring AI 对多模型提供商的支持，包括 OpenAI、Anthropic、Google、Ollama 等模型的配置、切换和国产模型集成方案。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 4
---

# Spring AI 实战教程（四）：多模型提供商集成

## 前言

Spring AI 的核心优势之一是提供了统一的抽象层，让开发者可以轻松切换不同的 AI 模型提供商。本章将详细介绍如何集成和配置各种主流模型，实现真正的模型无关开发。

## 模型提供商概览

### 支持的提供商

```
┌─────────────────────────────────────────────────────────────┐
│                  Spring AI 模型提供商                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  国际主流：                                                  │
│  ├── OpenAI (GPT-4o, GPT-4, GPT-3.5)                       │
│  ├── Anthropic (Claude 3.5, Claude 3)                      │
│  ├── Google (Gemini Pro, Gemini Flash)                     │
│  ├── Microsoft Azure (Azure OpenAI)                        │
│  └── Amazon Bedrock (多模型聚合)                            │
│                                                             │
│  开源/本地：                                                 │
│  ├── Ollama (Llama, Qwen, Mistral, etc.)                   │
│  └── HuggingFace (开源模型)                                 │
│                                                             │
│  国内模型：                                                  │
│  ├── 阿里云通义千问 (Qwen)                                  │
│  ├── 智谱 AI (GLM-4)                                        │
│  ├── 百度文心一言 (ERNIE)                                   │
│  ├── 讯飞星火 (Spark)                                       │
│  └── 月之暗面 (Moonshot)                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 模型能力对比

| 提供商 | Chat | Embedding | Image | Audio | Tools | 特点 |
|--------|------|-----------|-------|-------|-------|------|
| OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | 最成熟，API 稳定 |
| Anthropic | ✅ | ✅ | ❌ | ❌ | ✅ | 长文本，安全性高 |
| Google | ✅ | ✅ | ✅ | ✅ | ✅ | 多模态，免费额度 |
| Ollama | ✅ | ✅ | ❌ | ❌ | ✅ | 本地部署，隐私保护 |
| 通义千问 | ✅ | ✅ | ✅ | ❌ | ✅ | 国内访问快 |
| 智谱 AI | ✅ | ✅ | ❌ | ❌ | ✅ | 国产领先 |

## OpenAI 集成

### 依赖配置

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>
```

### 基本配置

```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      base-url: https://api.openai.com  # 可选，默认值
      
      chat:
        enabled: true
        options:
          model: gpt-4o
          temperature: 0.7
          max-tokens: 4096
          top-p: 1.0
      
      embedding:
        enabled: true
        options:
          model: text-embedding-3-small
          dimensions: 1536
      
      image:
        enabled: true
        options:
          model: dall-e-3
          quality: standard
          size: 1024x1024
      
      audio:
        transcription:
          enabled: true
          options:
            model: whisper-1
        speech:
          enabled: true
          options:
            model: tts-1
            voice: alloy
```

### 多模型切换

```java
@Service
public class OpenAIService {
    
    private final ChatClient gpt4Client;
    private final ChatClient gpt4oMiniClient;
    
    public OpenAIService(ChatModel chatModel) {
        // 默认配置的模型
        this.gpt4Client = ChatClient.create(chatModel);
        
        // 指定其他模型
        this.gpt4oMiniClient = ChatClient.builder(chatModel)
                .defaultOptions(OpenAiChatOptions.builder()
                        .withModel("gpt-4o-mini")
                        .withTemperature(0.5)
                        .build())
                .build();
    }
    
    public String chatWithGPT4(String message) {
        return gpt4Client.prompt()
                .user(message)
                .call()
                .content();
    }
    
    public String chatWithGPT4oMini(String message) {
        return gpt4oMiniClient.prompt()
                .user(message)
                .call()
                .content();
    }
    
    // 动态切换模型
    public String chatWithModel(String message, String model) {
        return ChatClient.create(chatModel)
                .prompt()
                .user(message)
                .options(OpenAiChatOptions.builder()
                        .withModel(model)
                        .build())
                .call()
                .content();
    }
}
```

### OpenAI 特有功能

```java
@Service
public class OpenAIAdvancedService {
    
    private final ChatClient chatClient;
    private final OpenAiImageModel imageModel;
    private final OpenAiAudioTranscriptionModel transcriptionModel;
    private final OpenAiAudioSpeechModel speechModel;
    
    // 图像生成
    public String generateImage(String prompt) {
        ImagePrompt imagePrompt = new ImagePrompt(prompt);
        ImageResponse response = imageModel.call(imagePrompt);
        return response.getResult().getOutput().getUrl();
    }
    
    // 语音转文字
    public String transcribeAudio(Resource audioFile) {
        AudioTranscriptionPrompt prompt = new AudioTranscriptionPrompt(audioFile);
        AudioTranscriptionResponse response = transcriptionModel.call(prompt);
        return response.getResult().getOutput();
    }
    
    // 文字转语音
    public Resource textToSpeech(String text) {
        SpeechPrompt prompt = new SpeechPrompt(text);
        SpeechResponse response = speechModel.call(prompt);
        return response.getResult().getOutput();
    }
    
    // JSON 模式
    public String chatWithJsonMode(String message) {
        return chatClient.prompt()
                .user(message)
                .options(OpenAiChatOptions.builder()
                        .withModel("gpt-4o")
                        .withResponseFormat(new ResponseFormat("json_object"))
                        .build())
                .call()
                .content();
    }
}
```

## Anthropic (Claude) 集成

### 依赖配置

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-anthropic-spring-boot-starter</artifactId>
</dependency>
```

### 配置

```yaml
spring:
  ai:
    anthropic:
      api-key: ${ANTHROPIC_API_KEY}
      base-url: https://api.anthropic.com
      
      chat:
        enabled: true
        options:
          model: claude-3-5-sonnet-20241022
          temperature: 0.7
          max-tokens: 4096
```

### 使用示例

```java
@Service
public class ClaudeService {
    
    private final ChatClient chatClient;
    
    public ClaudeService(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        你是 Claude，一个由 Anthropic 开发的 AI 助手。
                        你擅长分析和写作，能够处理长文本。
                        """)
                .build();
    }
    
    public String chat(String message) {
        return chatClient.prompt()
                .user(message)
                .call()
                .content();
    }
    
    // Claude 特有的长文本处理
    public String analyzeDocument(String document) {
        return chatClient.prompt()
                .user(u -> u.text("""
                        请分析以下文档，提取关键信息：
                        
                        {document}
                        """)
                        .param("document", document))
                .options(AnthropicChatOptions.builder()
                        .withModel("claude-3-5-sonnet-20241022")
                        .withMaxTokens(8000)  // Claude 支持更长输出
                        .build())
                .call()
                .content();
    }
}
```

### Claude 模型选择

```java
public class ClaudeModelSelector {
    
    // Claude 3.5 Sonnet - 性价比最高，适合大多数场景
    private static final String SONNET = "claude-3-5-sonnet-20241022";
    
    // Claude 3.5 Haiku - 最快最便宜，适合简单任务
    private static final String HAIKU = "claude-3-5-haiku-20241022";
    
    // Claude 3 Opus - 最强，适合复杂任务
    private static final String OPUS = "claude-3-opus-20240229";
    
    public String selectModel(TaskComplexity complexity) {
        return switch (complexity) {
            case SIMPLE -> HAIKU;
            case MEDIUM -> SONNET;
            case COMPLEX -> OPUS;
        };
    }
}
```

## Google Gemini 集成

### 依赖配置

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-vertex-ai-gemini-spring-boot-starter</artifactId>
</dependency>
```

### 配置

```yaml
spring:
  ai:
    vertex:
      ai:
        gemini:
          project-id: ${GOOGLE_CLOUD_PROJECT}
          location: us-central1
          
          chat:
            enabled: true
            options:
              model: gemini-1.5-pro
              temperature: 0.7
              maxOutputTokens: 8192
```

### 使用示例

```java
@Service
public class GeminiService {
    
    private final ChatClient chatClient;
    
    public GeminiService(ChatModel chatModel) {
        this.chatClient = ChatClient.create(chatModel);
    }
    
    // 多模态输入（图片理解）
    public String analyzeImage(Resource image, String question) {
        return chatClient.prompt()
                .user(u -> u
                        .text(question)
                        .media(image))  // 添加图片
                .call()
                .content();
    }
    
    // 长上下文处理
    public String processLongContext(String longText) {
        return chatClient.prompt()
                .user(longText)
                .options(VertexAiGeminiChatOptions.builder()
                        .withModel("gemini-1.5-pro")
                        .build())
                .call()
                .content();
    }
}
```

## Ollama 本地模型

### 安装 Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# 下载模型
ollama pull llama3.2
ollama pull qwen2.5
ollama pull mistral

# 启动服务
ollama serve

# 查看已安装模型
ollama list
```

### 依赖配置

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-ollama-spring-boot-starter</artifactId>
</dependency>
```

### 配置

```yaml
spring:
  ai:
    ollama:
      base-url: http://localhost:11434
      
      chat:
        enabled: true
        model: llama3.2
        options:
          temperature: 0.7
          num-predict: 2048
      
      embedding:
        enabled: true
        model: nomic-embed-text
        options:
          dimensions: 768
```

### 多模型管理

```java
@Service
public class OllamaService {
    
    private final OllamaChatModel chatModel;
    
    public OllamaService(OllamaChatModel chatModel) {
        this.chatModel = chatModel;
    }
    
    public String chatWithLlama(String message) {
        return ChatClient.builder(chatModel)
                .defaultOptions(OllamaOptions.builder()
                        .withModel("llama3.2")
                        .build())
                .build()
                .prompt()
                .user(message)
                .call()
                .content();
    }
    
    public String chatWithQwen(String message) {
        return ChatClient.builder(chatModel)
                .defaultOptions(OllamaOptions.builder()
                        .withModel("qwen2.5")
                        .build())
                .build()
                .prompt()
                .user(message)
                .call()
                .content();
    }
    
    // 动态模型选择
    public String chat(String message, String modelName) {
        return ChatClient.builder(chatModel)
                .defaultOptions(OllamaOptions.builder()
                        .withModel(modelName)
                        .build())
                .build()
                .prompt()
                .user(message)
                .call()
                .content();
    }
}
```

### Ollama 模型列表

```java
@Component
public class OllamaModelManager {
    
    private final OllamaApi ollamaApi;
    
    public List<String> listModels() {
        return ollamaApi.listModels()
                .models()
                .stream()
                .map(OllamaModel::name)
                .collect(Collectors.toList());
    }
    
    public void pullModel(String modelName) {
        ollamaApi.pullModel(modelName);
    }
}
```

## 国产模型集成

### 阿里云通义千问

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-alibaba-starter</artifactId>
</dependency>
```

```yaml
spring:
  ai:
    alibaba:
      api-key: ${ALIBABA_API_KEY}
      chat:
        enabled: true
        options:
          model: qwen-plus
          temperature: 0.7
```

```java
@Service
public class QwenService {
    
    private final ChatClient chatClient;
    
    public QwenService(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("你是一个专业的中文助手。")
                .build();
    }
    
    public String chat(String message) {
        return chatClient.prompt()
                .user(message)
                .call()
                .content();
    }
}
```

### 智谱 AI (GLM)

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-zhipuai-spring-boot-starter</artifactId>
</dependency>
```

```yaml
spring:
  ai:
    zhipuai:
      api-key: ${ZHIPU_API_KEY}
      chat:
        enabled: true
        options:
          model: glm-4
          temperature: 0.7
```

### OpenRouter (聚合平台)

OpenRouter 提供统一的 API 访问多种模型：

```xml
<!-- 使用 OpenAI 兼容接口 -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>
```

```yaml
spring:
  ai:
    openai:
      api-key: ${OPENROUTER_API_KEY}
      base-url: https://openrouter.ai/api/v1
      chat:
        options:
          model: anthropic/claude-3.5-sonnet  # 指定模型
```

## 多提供商切换策略

### 策略一：配置文件切换

```yaml
# application-openai.yml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o

# application-anthropic.yml
spring:
  ai:
    anthropic:
      api-key: ${ANTHROPIC_API_KEY}
      chat:
        options:
          model: claude-3-5-sonnet

# application-ollama.yml
spring:
  ai:
    ollama:
      base-url: http://localhost:11434
      chat:
        model: llama3.2
```

```bash
# 启动时选择配置
java -jar app.jar --spring.profiles.active=openai
java -jar app.jar --spring.profiles.active=anthropic
java -jar app.jar --spring.profiles.active=ollama
```

### 策略二：多 Bean 配置

```java
@Configuration
public class MultiProviderConfig {
    
    @Bean
    @Primary
    @ConditionalOnProperty(name = "ai.provider", havingValue = "openai", matchIfMissing = true)
    public ChatModel openaiChatModel(OpenAiChatModel model) {
        return model;
    }
    
    @Bean
    @ConditionalOnProperty(name = "ai.provider", havingValue = "anthropic")
    public ChatModel anthropicChatModel(AnthropicChatModel model) {
        return model;
    }
    
    @Bean
    @ConditionalOnProperty(name = "ai.provider", havingValue = "ollama")
    public ChatModel ollamaChatModel(OllamaChatModel model) {
        return model;
    }
}
```

### 策略三：动态路由

```java
@Service
public class ModelRoutingService {
    
    private final Map<String, ChatModel> models;
    
    public ModelRoutingService(
            @Qualifier("openaiChatModel") ChatModel openaiModel,
            @Qualifier("anthropicChatModel") ChatModel anthropicModel,
            @Qualifier("ollamaChatModel") ChatModel ollamaModel) {
        
        this.models = Map.of(
                "openai", openaiModel,
                "anthropic", anthropicModel,
                "ollama", ollamaModel
        );
    }
    
    public String chat(String provider, String message) {
        ChatModel model = models.get(provider);
        if (model == null) {
            throw new IllegalArgumentException("Unknown provider: " + provider);
        }
        
        return ChatClient.create(model)
                .prompt()
                .user(message)
                .call()
                .content();
    }
    
    // 根据任务类型自动选择
    public String smartChat(String message, TaskType taskType) {
        String provider = selectProvider(taskType);
        return chat(provider, message);
    }
    
    private String selectProvider(TaskType taskType) {
        return switch (taskType) {
            case CODE_GENERATION -> "openai";      // GPT-4 擅长代码
            case LONG_DOCUMENT -> "anthropic";     // Claude 长文本好
            case QUICK_RESPONSE -> "ollama";       // 本地快速响应
            case CHINESE_NLP -> "qwen";            // 通义千问中文好
        };
    }
}
```

### 策略四：故障转移

```java
@Service
public class FailoverChatService {
    
    private final List<ChatModel> models;
    private final CircuitBreaker circuitBreaker;
    
    public FailoverChatService(
            @Qualifier("openaiChatModel") ChatModel primaryModel,
            @Qualifier("anthropicChatModel") ChatModel fallbackModel,
            @Qualifier("ollamaChatModel") ChatModel localModel) {
        
        this.models = List.of(primaryModel, fallbackModel, localModel);
        this.circuitBreaker = CircuitBreaker.create();
    }
    
    public String chatWithFailover(String message) {
        for (ChatModel model : models) {
            try {
                return circuitBreaker.executeSupplier(() -> 
                        ChatClient.create(model)
                                .prompt()
                                .user(message)
                                .call()
                                .content()
                );
            } catch (Exception e) {
                log.warn("Model {} failed, trying next", model.getClass().getSimpleName(), e);
            }
        }
        throw new RuntimeException("All models failed");
    }
}
```

## 模型能力适配

### 处理不同模型的差异

```java
@Service
public class ModelCapabilityAdapter {
    
    private final ChatModel chatModel;
    private final ModelProvider provider;
    
    public String chat(String message) {
        ChatClient.Builder builder = ChatClient.builder(chatModel);
        
        // 根据提供商调整配置
        switch (provider) {
            case OPENAI:
                builder.defaultOptions(OpenAiChatOptions.builder()
                        .withModel("gpt-4o")
                        .build());
                break;
            case ANTHROPIC:
                builder.defaultOptions(AnthropicChatOptions.builder()
                        .withModel("claude-3-5-sonnet-20241022")
                        .withMaxTokens(4096)  // Claude 需要显式设置
                        .build());
                break;
            case OLLAMA:
                builder.defaultOptions(OllamaOptions.builder()
                        .withModel("llama3.2")
                        .build());
                break;
        }
        
        return builder.build()
                .prompt()
                .user(message)
                .call()
                .content();
    }
}
```

## 成本优化策略

### Token 使用监控

```java
@Component
public class TokenUsageMonitor {
    
    private final MeterRegistry meterRegistry;
    
    public void recordUsage(String provider, ChatResponse response) {
        Usage usage = response.getMetadata().getUsage();
        
        meterRegistry.counter("ai.tokens.prompt", "provider", provider)
                .increment(usage.getPromptTokens());
        meterRegistry.counter("ai.tokens.generation", "provider", provider)
                .increment(usage.getGenerationTokens());
        meterRegistry.counter("ai.tokens.total", "provider", provider)
                .increment(usage.getTotalTokens());
    }
}
```

### 成本对比

```
┌─────────────────────────────────────────────────────────────┐
│                    模型成本对比（2025年）                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  输入价格（每 1M tokens）：                                  │
│  ├── GPT-4o: $2.50                                         │
│  ├── GPT-4o-mini: $0.15                                    │
│  ├── Claude 3.5 Sonnet: $3.00                              │
│  ├── Claude 3.5 Haiku: $0.80                               │
│  ├── Gemini 1.5 Pro: $1.25                                 │
│  ├── Qwen-Plus: ¥0.004 (约 $0.0005)                        │
│  └── Ollama (本地): 免费                                    │
│                                                             │
│  输出价格（每 1M tokens）：                                  │
│  ├── GPT-4o: $10.00                                        │
│  ├── GPT-4o-mini: $0.60                                    │
│  ├── Claude 3.5 Sonnet: $15.00                             │
│  ├── Claude 3.5 Haiku: $4.00                               │
│  ├── Gemini 1.5 Pro: $5.00                                 │
│  ├── Qwen-Plus: ¥0.012 (约 $0.0017)                        │
│  └── Ollama (本地): 免费                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 成本优化建议

```java
@Service
public class CostOptimizedService {
    
    // 简单任务用便宜模型
    public String quickChat(String message) {
        return ChatClient.builder(chatModel)
                .defaultOptions(OpenAiChatOptions.builder()
                        .withModel("gpt-4o-mini")  // 便宜
                        .withMaxTokens(500)        // 限制输出
                        .build())
                .build()
                .prompt()
                .user(message)
                .call()
                .content();
    }
    
    // 复杂任务用强模型
    public String complexAnalysis(String document) {
        return ChatClient.builder(chatModel)
                .defaultOptions(OpenAiChatOptions.builder()
                        .withModel("gpt-4o")       // 强模型
                        .withMaxTokens(4000)
                        .build())
                .build()
                .prompt()
                .user(document)
                .call()
                .content();
    }
    
    // 本地处理隐私数据
    public String processSensitiveData(String data) {
        return ollamaClient.prompt()
                .user(data)
                .call()
                .content();
    }
}
```

## 小结

本章我们学习了：

1. **多提供商概览**：国际主流、开源本地、国产模型
2. **OpenAI 集成**：配置、多模型切换、特有功能
3. **Anthropic 集成**：Claude 模型使用、长文本处理
4. **Google Gemini 集成**：多模态、长上下文
5. **Ollama 本地部署**：安装、配置、多模型管理
6. **国产模型集成**：通义千问、智谱 AI
7. **切换策略**：配置文件、多 Bean、动态路由、故障转移
8. **成本优化**：Token 监控、模型选择

## 练习

1. **搭建本地 AI 环境**：使用 Ollama 部署 Llama3.2 和 Qwen2.5
2. **实现模型路由**：根据任务类型自动选择最优模型
3. **故障转移机制**：主模型不可用时自动切换备用模型
4. **成本监控面板**：统计各模型的 Token 使用和成本

## 下一章预告

在下一章《结构化输出处理》中，我们将探讨：

- 结构化输出的核心概念
- POJO 映射与 BeanOutputConverter
- JSON Schema 验证
- 复杂嵌套结构处理

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
