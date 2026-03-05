---
title: "Langchain4J 实战教程（二）：快速入门"
date: "2025-07-18 10:00:00"
excerpt: "从零开始搭建 Langchain4J 开发环境，构建你的第一个 Java AI 应用，掌握 AI Services 的核心用法。"
tags: ["Java", "AI", "LLM", "Langchain4J", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 2
---

# Langchain4J 实战教程（二）：快速入门

## 前言

在上一章中，我们了解了 Langchain4J 的整体架构和核心概念。现在，让我们动手实践，从零开始构建第一个 AI 应用。本章将带你：

- 搭建 Langchain4J 开发环境
- 配置第一个 AI 模型连接
- 构建一个完整的对话应用
- 理解 AI Services 的基本用法

## 环境搭建

### 项目创建

使用 Maven 创建一个新项目：

```xml
<!-- pom.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>langchain4j-demo</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <langchain4j.version>1.0.0</langchain4j.version>
    </properties>

    <dependencies>
        <!-- Langchain4J 核心 -->
        <dependency>
            <groupId>dev.langchain4j</groupId>
            <artifactId>langchain4j</artifactId>
            <version>${langchain4j.version}</version>
        </dependency>

        <!-- OpenAI 支持 -->
        <dependency>
            <groupId>dev.langchain4j</groupId>
            <artifactId>langchain4j-open-ai</artifactId>
            <version>${langchain4j.version}</version>
        </dependency>

        <!-- 日志支持 -->
        <dependency>
            <groupId>ch.qos.logback</groupId>
            <artifactId>logback-classic</artifactId>
            <version>1.4.14</version>
        </dependency>

        <!-- 测试 -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.10.1</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>17</source>
                    <target>17</target>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.codehaus.mojo</groupId>
                <artifactId>exec-maven-plugin</artifactId>
                <version>3.1.0</version>
                <configuration>
                    <mainClass>com.example.ChatApplication</mainClass>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

### 项目结构

```
langchain4j-demo/
├── pom.xml
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/example/
│   │   │       ├── ChatApplication.java
│   │   │       ├── Assistant.java
│   │   │       └── config/
│   │   │           └── ModelConfig.java
│   │   └── resources/
│   │       └── logback.xml
│   └── test/
│       └── java/
│           └── com/example/
│               └── AssistantTest.java
```

## 第一个 AI 应用

### 方式一：使用 OpenAI

```java
package com.example;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import java.util.Scanner;

public class ChatApplication {
    
    public static void main(String[] args) {
        // 1. 创建 OpenAI 模型
        ChatLanguageModel model = OpenAiChatModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("gpt-4o-mini")  // 使用性价比高的模型
            .temperature(0.7)
            .maxTokens(1000)
            .build();
        
        // 2. 简单对话
        Scanner scanner = new Scanner(System.in);
        System.out.println("AI 助手已启动，输入 'quit' 退出");
        System.out.println("----------------------------------------");
        
        while (true) {
            System.out.print("你: ");
            String userInput = scanner.nextLine();
            
            if ("quit".equalsIgnoreCase(userInput.trim())) {
                System.out.println("再见！");
                break;
            }
            
            // 发送消息并获取响应
            String response = model.generate(userInput);
            System.out.println("AI: " + response);
            System.out.println();
        }
        
        scanner.close();
    }
}
```

### 方式二：使用 Ollama 本地模型

如果不想使用付费 API，可以使用 Ollama 运行本地模型：

```bash
# 安装并启动 Ollama
ollama pull llama3.2
ollama serve
```

```java
package com.example;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.ollama.OllamaChatModel;
import java.util.Scanner;

public class ChatApplication {
    
    public static void main(String[] args) {
        // 使用 Ollama 本地模型
        ChatLanguageModel model = OllamaChatModel.builder()
            .baseUrl("http://localhost:11434")
            .modelName("llama3.2")
            .temperature(0.7)
            .build();
        
        // ... 其余代码相同
    }
}
```

### 方式三：使用 AI Services（推荐）

AI Services 是 Langchain4J 的核心特性，提供更优雅的接口定义：

```java
package com.example;

import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;

// 1. 定义 AI 服务接口
interface Assistant {
    
    @SystemMessage("""
        你是一个专业的技术顾问。
        请用简洁、清晰的语言回答问题。
        如果不确定，请诚实告知。
        """)
    String chat(@UserMessage String userMessage);
}

// 2. 创建应用
public class ChatApplication {
    
    public static void main(String[] args) {
        // 创建模型
        ChatLanguageModel model = OpenAiChatModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("gpt-4o-mini")
            .build();
        
        // 构建 AI 服务
        Assistant assistant = AiServices.builder(Assistant.class)
            .chatLanguageModel(model)
            .build();
        
        // 使用
        Scanner scanner = new Scanner(System.in);
        System.out.println("AI 助手已启动，输入 'quit' 退出");
        
        while (true) {
            System.out.print("你: ");
            String input = scanner.nextLine();
            
            if ("quit".equalsIgnoreCase(input.trim())) {
                break;
            }
            
            String response = assistant.chat(input);
            System.out.println("AI: " + response);
        }
    }
}
```

## 运行应用

### 配置 API Key

```bash
# 设置环境变量（Linux/macOS）
export OPENAI_API_KEY="sk-your-api-key"

# Windows
set OPENAI_API_KEY=sk-your-api-key
```

### 运行

```bash
# 使用 Maven
mvn compile exec:java

# 或直接运行
mvn package
java -jar target/langchain4j-demo-1.0-SNAPSHOT.jar
```

### 示例对话

```
AI 助手已启动，输入 'quit' 退出
----------------------------------------
你: 什么是 Java Record？
AI: Java Record 是 Java 14 引入的一种特殊类类型，用于创建不可变数据对象。
它自动生成构造器、getter、equals、hashCode 和 toString 方法。
使用 record 可以大幅减少样板代码。

你: 给我一个例子
AI: 好的，这是一个简单的 Record 示例：

```java
public record Person(String name, int age) {
    // 自动生成所有方法
}

// 使用
Person person = new Person("张三", 25);
System.out.println(person.name());  // 输出: 张三
System.out.println(person.age());   // 输出: 25
```

Record 非常适合作为 DTO（数据传输对象）使用。

你: quit
再见！
```

## Spring Boot 集成

在企业级应用中，通常使用 Spring Boot。Langchain4J 提供了开箱即用的 Spring Boot Starter。

### Maven 依赖

```xml
<dependencies>
    <!-- Spring Boot -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>

    <!-- Langchain4J Spring Boot Starter -->
    <dependency>
        <groupId>dev.langchain4j</groupId>
        <artifactId>langchain4j-spring-boot-starter</artifactId>
        <version>1.0.0</version>
    </dependency>

    <!-- OpenAI 支持 -->
    <dependency>
        <groupId>dev.langchain4j</groupId>
        <artifactId>langchain4j-open-ai-spring-boot-starter</artifactId>
        <version>1.0.0</version>
    </dependency>
</dependencies>
```

### 配置文件

```yaml
# application.yml
langchain4j:
  open-ai:
    chat-model:
      api-key: ${OPENAI_API_KEY}
      model-name: gpt-4o-mini
      temperature: 0.7
      max-tokens: 1000
```

### 定义 AI 服务

```java
package com.example.assistant;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;

public interface Assistant {
    
    @SystemMessage("你是一个专业的技术顾问")
    String chat(@UserMessage String message);
}
```

### 服务配置

```java
package com.example.config;

import com.example.assistant.Assistant;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.service.AiServices;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiConfig {
    
    @Bean
    public Assistant assistant(ChatLanguageModel chatModel) {
        return AiServices.builder(Assistant.class)
            .chatLanguageModel(chatModel)
            .build();
    }
}
```

### REST 控制器

```java
package com.example.controller;

import com.example.assistant.Assistant;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    
    private final Assistant assistant;
    
    public ChatController(Assistant assistant) {
        this.assistant = assistant;
    }
    
    @PostMapping
    public ChatResponse chat(@RequestBody ChatRequest request) {
        String response = assistant.chat(request.message());
        return new ChatResponse(response);
    }
    
    public record ChatRequest(String message) {}
    public record ChatResponse(String response) {}
}
```

### 测试 API

```bash
# 发送请求
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "什么是 Spring Boot？"}'
```

## 流式响应

对于长回复，使用流式响应可以提升用户体验：

### 定义流式接口

```java
interface StreamingAssistant {
    
    @SystemMessage("你是一个专业的技术顾问")
    TokenStream chat(@UserMessage String message);
}
```

### 使用流式响应

```java
package com.example;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import dev.langchain4j.model.output.Response;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.TokenStream;
import java.util.Scanner;
import java.util.concurrent.CompletableFuture;

public class StreamingChatApplication {
    
    public static void main(String[] args) {
        // 创建流式模型
        StreamingChatLanguageModel model = OpenAiStreamingChatModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("gpt-4o-mini")
            .build();
        
        // 构建流式服务
        StreamingAssistant assistant = AiServices.builder(StreamingAssistant.class)
            .streamingChatLanguageModel(model)
            .build();
        
        Scanner scanner = new Scanner(System.in);
        System.out.println("流式 AI 助手已启动");
        
        while (true) {
            System.out.print("你: ");
            String input = scanner.nextLine();
            
            if ("quit".equalsIgnoreCase(input.trim())) {
                break;
            }
            
            System.out.print("AI: ");
            
            // 使用 CompletableFuture 等待完成
            CompletableFuture<AiMessage> future = new CompletableFuture<>();
            
            TokenStream stream = assistant.chat(input);
            stream.onNext(token -> System.out.print(token))  // 实时输出
                   .onComplete(response -> {
                       System.out.println();  // 换行
                       future.complete(response.content());
                   })
                   .onError(Throwable::printStackTrace)
                   .start();
            
            future.join();  // 等待完成
            System.out.println();
        }
    }
}
```

### WebFlux 流式响应

```java
package com.example.controller;

import com.example.assistant.StreamingAssistant;
import dev.langchain4j.service.TokenStream;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api/chat")
public class StreamingChatController {
    
    private final StreamingAssistant assistant;
    
    public StreamingChatController(StreamingAssistant assistant) {
        this.assistant = assistant;
    }
    
    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatStream(@RequestBody ChatRequest request) {
        return Flux.create(emitter -> {
            TokenStream stream = assistant.chat(request.message());
            stream.onNext(emitter::next)
                  .onComplete(response -> emitter.complete())
                  .onError(emitter::error)
                  .start();
        });
    }
    
    public record ChatRequest(String message) {}
}
```

## 多模型切换

Langchain4J 的统一 API 让模型切换变得简单：

```java
package com.example.config;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.anthropic.AnthropicChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.ollama.OllamaChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ModelConfig {
    
    @Value("${model.provider:openai}")
    private String modelProvider;
    
    @Bean
    public ChatLanguageModel chatModel() {
        return switch (modelProvider) {
            case "openai" -> OpenAiChatModel.builder()
                .apiKey(System.getenv("OPENAI_API_KEY"))
                .modelName("gpt-4o-mini")
                .build();
                
            case "anthropic" -> AnthropicChatModel.builder()
                .apiKey(System.getenv("ANTHROPIC_API_KEY"))
                .modelName("claude-3-5-sonnet-20241022")
                .build();
                
            case "ollama" -> OllamaChatModel.builder()
                .baseUrl("http://localhost:11434")
                .modelName("llama3.2")
                .build();
                
            default -> throw new IllegalArgumentException("Unknown provider: " + modelProvider);
        };
    }
}
```

只需更改配置即可切换模型：

```yaml
# 使用 OpenAI
model:
  provider: openai

# 或使用本地 Ollama
model:
  provider: ollama
```

## 最佳实践

### 1. API Key 安全

```java
// 不要硬编码 API Key
// 错误示范
String apiKey = "sk-hardcoded-key";  // 危险！

// 正确做法：使用环境变量
String apiKey = System.getenv("OPENAI_API_KEY");

// 或使用配置文件（生产环境使用 Vault 等）
@Value("${openai.api-key}")
private String apiKey;
```

### 2. 超时设置

```java
ChatLanguageModel model = OpenAiChatModel.builder()
    .apiKey(apiKey)
    .modelName("gpt-4o-mini")
    .timeout(Duration.ofSeconds(60))  // 设置超时
    .maxRetries(3)                     // 设置重试次数
    .build();
```

### 3. 错误处理

```java
try {
    String response = assistant.chat(message);
    return response;
} catch (Exception e) {
    log.error("AI 调用失败", e);
    // 返回友好的错误消息
    return "抱歉，AI 服务暂时不可用，请稍后再试。";
}
```

### 4. 日志配置

```xml
<!-- logback.xml -->
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    
    <!-- Langchain4J 日志级别 -->
    <logger name="dev.langchain4j" level="DEBUG"/>
    
    <root level="INFO">
        <appender-ref ref="STDOUT"/>
    </root>
</configuration>
```

## 完整示例项目

### 项目结构

```
langchain4j-spring-demo/
├── pom.xml
├── src/main/
│   ├── java/com/example/
│   │   ├── Application.java
│   │   ├── assistant/
│   │   │   └── Assistant.java
│   │   ├── config/
│   │   │   └── AiConfig.java
│   │   └── controller/
│   │       └── ChatController.java
│   └── resources/
│       └── application.yml
└── src/test/
    └── java/com/example/
        └── AssistantTest.java
```

### 主启动类

```java
package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

### 测试类

```java
package com.example;

import com.example.assistant.Assistant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class AssistantTest {
    
    @Autowired
    private Assistant assistant;
    
    @Test
    void testChat() {
        String response = assistant.chat("Hello, who are you?");
        assertNotNull(response);
        assertFalse(response.isEmpty());
        System.out.println("Response: " + response);
    }
}
```

## 小结

本章我们学习了：

1. **环境搭建**：Maven 依赖配置和项目结构
2. **基本用法**：三种方式实现简单对话
3. **AI Services**：声明式接口定义的优势
4. **Spring Boot 集成**：自动配置和依赖注入
5. **流式响应**：提升用户体验
6. **多模型切换**：统一 API 的便利性
7. **最佳实践**：安全、超时、错误处理

## 练习

1. 创建一个简单的命令行聊天程序
2. 将程序改造为 REST API 服务
3. 添加流式响应支持
4. 尝试切换不同的模型提供商

## 参考资料

- [Langchain4J 官方文档](https://docs.langchain4j.dev/)
- [Langchain4J Examples](https://github.com/langchain4j/langchain4j-examples)
- [Spring Boot 官方文档](https://spring.io/projects/spring-boot)
- [Ollama 官网](https://ollama.ai/)

## 下一章预告

在下一章《AI Services 核心详解》中，我们将深入探索：

- AI Services 的工作原理
- 高级注解使用
- 记忆管理集成
- 工具函数集成
- RAG 集成

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
