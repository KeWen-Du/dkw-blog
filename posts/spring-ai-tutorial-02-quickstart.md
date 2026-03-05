---
title: "Spring AI 实战教程（二）：快速入门"
date: "2025-08-15"
excerpt: "从零开始搭建 Spring AI 开发环境，配置 AI 模型连接，构建第一个完整的对话应用，深入理解自动配置机制。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 2
---

# Spring AI 实战教程（二）：快速入门

## 前言

在上一章中，我们了解了 Spring AI 的整体架构和核心概念。本章将从实践出发，手把手搭建一个完整的 Spring AI 应用。通过构建一个智能对话服务，你将掌握 Spring AI 的核心开发流程。

## 项目初始化

### 方式一：Spring Initializr（推荐）

访问 [Spring Initializr](https://start.spring.io/)，配置如下：

```
项目配置：
├── Project: Maven
├── Language: Java
├── Spring Boot: 3.4.x
├── Packaging: Jar
├── Java: 21
│
├── Dependencies:
│   ├── Spring Web
│   ├── Spring AI OpenAI (或选择其他模型提供商)
│   └── Spring Boot DevTools (开发时热部署)
```

点击 "Generate" 下载项目压缩包，解压后导入 IDE。

### 方式二：命令行创建

```bash
# 使用 curl 下载
curl https://start.spring.io/starter.zip \
  -d type=maven-project \
  -d language=java \
  -d bootVersion=3.4.0 \
  -d baseDir=spring-ai-demo \
  -d groupId=com.example \
  -d artifactId=spring-ai-demo \
  -d name=spring-ai-demo \
  -d packageName=com.example.springai \
  -d javaVersion=21 \
  -d dependencies=web,openai,devtools \
  -o spring-ai-demo.zip

# 解压
unzip spring-ai-demo.zip -d .
cd spring-ai-demo
```

### 方式三：IDE 内置

**IntelliJ IDEA**：

1. File → New → Project
2. 选择 "Spring Initializr"
3. 填写项目信息
4. 在 Dependencies 中搜索并添加：
   - Spring Web
   - Spring AI OpenAI

## 项目结构

创建完成后的项目结构：

```
spring-ai-demo/
├── pom.xml                          # Maven 配置
├── src/
│   ├── main/
│   │   ├── java/com/example/springai/
│   │   │   ├── SpringAiDemoApplication.java  # 启动类
│   │   │   ├── controller/
│   │   │   │   └── ChatController.java       # REST 控制器
│   │   │   ├── service/
│   │   │   │   └── ChatService.java          # 聊天服务
│   │   │   └── config/
│   │   │       └── AiConfig.java             # AI 配置
│   │   └── resources/
│   │       ├── application.yml               # 应用配置
│   │       └── prompts/                      # 提示词模板
│   │           └── system-prompt.st
│   └── test/
│       └── java/com/example/springai/
│           └── SpringAiDemoApplicationTests.java
└── HELP.md
```

## 依赖配置

### pom.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.4.0</version>
        <relativePath/>
    </parent>
    
    <groupId>com.example</groupId>
    <artifactId>spring-ai-demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>spring-ai-demo</name>
    <description>Spring AI Demo Project</description>
    
    <properties>
        <java.version>21</java.version>
        <spring-ai.version>1.0.0</spring-ai.version>
    </properties>
    
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.ai</groupId>
                <artifactId>spring-ai-bom</artifactId>
                <version>${spring-ai.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
    
    <dependencies>
        <!-- Spring Web -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        
        <!-- Spring AI OpenAI -->
        <dependency>
            <groupId>org.springframework.ai</groupId>
            <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
        </dependency>
        
        <!-- 开发工具 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-devtools</artifactId>
            <scope>runtime</scope>
            <optional>true</optional>
        </dependency>
        
        <!-- 测试 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
    
</project>
```

### Gradle (build.gradle)

```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.4.0'
    id 'io.spring.dependency-management' version '1.1.6'
}

group = 'com.example'
version = '0.0.1-SNAPSHOT'

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
    maven { url 'https://repo.spring.io/milestone' }
}

ext {
    set('springAiVersion', "1.0.0")
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.ai:spring-ai-openai-spring-boot-starter'
    developmentOnly 'org.springframework.boot:spring-boot-devtools'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}

dependencyManagement {
    imports {
        mavenBom "org.springframework.ai:spring-ai-bom:${springAiVersion}"
    }
}

tasks.named('test') {
    useJUnitPlatform()
}
```

## 应用配置

### application.yml

```yaml
spring:
  application:
    name: spring-ai-demo
  
  # AI 配置
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}  # 从环境变量读取
      base-url: https://api.openai.com  # 可选，默认值
      
      # Chat 模型配置
      chat:
        enabled: true
        options:
          model: gpt-4o-mini  # 使用较便宜的模型进行测试
          temperature: 0.7
          max-tokens: 1000
      
      # Embedding 模型配置（可选）
      embedding:
        enabled: true
        options:
          model: text-embedding-3-small

# 服务配置
server:
  port: 8080

# 日志配置
logging:
  level:
    org.springframework.ai: DEBUG
    com.example.springai: DEBUG

# 生产环境可以创建 application-prod.yml
```

### 多环境配置

```yaml
# application-dev.yml - 开发环境
spring:
  ai:
    openai:
      chat:
        options:
          model: gpt-4o-mini  # 便宜的模型用于开发

# application-prod.yml - 生产环境
spring:
  ai:
    openai:
      chat:
        options:
          model: gpt-4o  # 生产使用更强模型
          temperature: 0.3  # 更稳定的输出
```

## 核心代码实现

### 1. 启动类

```java
package com.example.springai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SpringAiDemoApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpringAiDemoApplication.class, args);
    }
}
```

### 2. 聊天服务

```java
package com.example.springai.service;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

@Service
public class ChatService {

    private final ChatClient chatClient;

    public ChatService(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        你是一个友好、专业的AI助手。
                        请用简洁、清晰的语言回答用户的问题。
                        如果不确定答案，请诚实地说明。
                        """)
                .build();
    }

    /**
     * 简单对话
     */
    public String chat(String message) {
        return chatClient.prompt()
                .user(message)
                .call()
                .content();
    }

    /**
     * 带系统提示的对话
     */
    public String chatWithSystem(String systemPrompt, String message) {
        return ChatClient.create(chatClient.getChatModel())
                .prompt()
                .system(systemPrompt)
                .user(message)
                .call()
                .content();
    }

    /**
     * 流式响应
     */
    public Flux<String> chatStream(String message) {
        return chatClient.prompt()
                .user(message)
                .stream()
                .content();
    }
}
```

### 3. REST 控制器

```java
package com.example.springai.controller;

import com.example.springai.service.ChatService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    /**
     * 简单对话接口
     * POST /api/chat
     * Body: { "message": "你好" }
     */
    @PostMapping
    public ChatResponse chat(@RequestBody ChatRequest request) {
        String response = chatService.chat(request.message());
        return new ChatResponse(response);
    }

    /**
     * 流式对话接口 (SSE)
     * GET /api/chat/stream?message=你好
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatStream(@RequestParam String message) {
        return chatService.chatStream(message);
    }

    /**
     * 带角色设定的对话
     * POST /api/chat/role
     */
    @PostMapping("/role")
    public ChatResponse chatWithRole(@RequestBody RoleChatRequest request) {
        String response = chatService.chatWithSystem(
                "你是一个" + request.role() + "，请以该身份回答问题。",
                request.message()
        );
        return new ChatResponse(response);
    }

    // DTOs
    public record ChatRequest(String message) {}
    public record ChatResponse(String content) {}
    public record RoleChatRequest(String role, String message) {}
}
```

### 4. 配置类（可选）

```java
package com.example.springai.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiConfig {

    @Bean
    public ChatClient chatClient(ChatModel chatModel) {
        return ChatClient.builder(chatModel)
                .defaultSystem("""
                        你是一个专业的技术顾问。
                        请用清晰、专业的方式回答技术问题。
                        必要时提供代码示例。
                        """)
                .build();
    }
}
```

## 运行与测试

### 启动应用

```bash
# 设置环境变量
export OPENAI_API_KEY=your-api-key-here

# 启动应用
mvn spring-boot:run

# 或使用 Gradle
gradle bootRun
```

### 测试 API

**方式一：curl 命令**

```bash
# 简单对话
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，请介绍一下 Spring AI"}'

# 流式对话
curl -N http://localhost:8080/api/chat/stream?message=讲一个笑话

# 角色对话
curl -X POST http://localhost:8080/api/chat/role \
  -H "Content-Type: application/json" \
  -d '{"role": "资深Java开发者", "message": "如何学习Spring框架？"}'
```

**方式二：HTTP 文件（IntelliJ IDEA）**

```http
### 简单对话
POST http://localhost:8080/api/chat
Content-Type: application/json

{
  "message": "什么是 RAG？请简单解释。"
}

### 流式对话
GET http://localhost:8080/api/chat/stream?message=给我讲个笑话
Accept: text/event-stream

### 角色对话
POST http://localhost:8080/api/chat/role
Content-Type: application/json

{
  "role": "资深架构师",
  "message": "如何设计一个高并发系统？"
}
```

## 自动配置原理

Spring AI 的自动配置机制是其核心特性之一：

### 自动配置类

```
Spring AI 自动配置流程：
┌─────────────────────────────────────────────────────────────┐
│                    spring.factories                          │
│   org.springframework.ai.autoconfigure.openai.OpenAiAuto     │
│   Configuration                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 检测配置属性 (spring.ai.openai.*)                       │
│                    ↓                                        │
│   2. 创建 OpenAiApi (API 客户端)                            │
│                    ↓                                        │
│   3. 创建 ChatModel (聊天模型)                               │
│                    ↓                                        │
│   4. 创建 EmbeddingModel (嵌入模型)                          │
│                    ↓                                        │
│   5. 注入到 Spring 容器                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 条件装配

```java
// Spring AI 内部实现示意
@AutoConfiguration
@ConditionalOnClass(OpenAiApi.class)
@ConditionalOnProperty(prefix = "spring.ai.openai", name = "api-key")
public class OpenAiAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public OpenAiApi openAiApi(OpenAiConnectionProperties properties) {
        return new OpenAiApi(properties.getBaseUrl(), properties.getApiKey());
    }

    @Bean
    @ConditionalOnMissingBean
    public ChatModel chatModel(OpenAiApi api, OpenAiChatProperties properties) {
        return new OpenAiChatModel(api, properties.getOptions());
    }
}
```

### 自定义覆盖

你可以通过定义自己的 Bean 来覆盖默认配置：

```java
@Configuration
public class CustomAiConfig {

    @Bean
    public ChatClient.Builder chatClientBuilder(ChatModel chatModel) {
        return ChatClient.builder(chatModel)
                .defaultOptions(ChatOptionsBuilder.builder()
                        .withModel("gpt-4o")
                        .withTemperature(0.5)
                        .build());
    }
}
```

## 使用 Ollama 本地模型

如果没有 OpenAI API Key，可以使用 Ollama 运行本地模型：

### 安装 Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# 下载模型
ollama pull llama3.2
ollama pull qwen2.5

# 启动服务
ollama serve
```

### 添加依赖

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
        model: llama3.2
        options:
          temperature: 0.7
```

## 常见问题排查

### 1. API Key 配置问题

```bash
# 错误信息
"API key not found"

# 解决方案
# 方式一：环境变量
export OPENAI_API_KEY=sk-xxx

# 方式二：配置文件（不推荐生产使用）
spring:
  ai:
    openai:
      api-key: sk-xxx

# 方式三：启动参数
java -jar app.jar --spring.ai.openai.api-key=sk-xxx
```

### 2. 网络超时

```yaml
spring:
  ai:
    openai:
      chat:
        options:
          connect-timeout: 60000  # 连接超时 60s
          read-timeout: 120000    # 读取超时 120s
```

### 3. Token 超限

```java
// 控制输出长度
chatClient.prompt()
    .user(message)
    .call()
    .content();

// 或在配置中设置
spring:
  ai:
    openai:
      chat:
        options:
          max-tokens: 500
```

### 4. 响应为空

检查日志级别，开启 DEBUG 日志：

```yaml
logging:
  level:
    org.springframework.ai: DEBUG
    org.springframework.web.client: DEBUG
```

## 单元测试

```java
package com.example.springai;

import com.example.springai.service.ChatService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest
class ChatServiceTest {

    @MockBean
    private ChatModel chatModel;

    @Autowired
    private ChatService chatService;

    @Test
    void testChat() {
        // Mock 响应
        when(chatModel.call(any(Prompt.class)))
                .thenReturn(new ChatResponse(List.of(
                        new Generation("这是一个测试响应")
                )));

        // 执行测试
        String response = chatService.chat("测试问题");

        // 验证
        assertNotNull(response);
        assertTrue(response.contains("测试响应"));
        verify(chatModel, times(1)).call(any(Prompt.class));
    }
}
```

## 小结

本章我们完成了：

1. **项目初始化**：使用 Spring Initializr 快速创建项目
2. **依赖配置**：配置 Spring AI BOM 和 Starter
3. **核心代码**：实现 ChatService、ChatController
4. **自动配置**：理解 Spring AI 的自动配置原理
5. **本地模型**：使用 Ollama 运行本地大模型
6. **问题排查**：常见问题的解决方案

## 练习

1. **扩展对话接口**：添加对话历史记录功能
2. **实现流式输出**：前端使用 SSE 接收流式响应
3. **切换模型**：尝试使用 Ollama 的不同模型
4. **添加限流**：使用 Spring RateLimiter 限制请求频率

## 下一章预告

在下一章《ChatClient API 详解》中，我们将深入探讨：

- ChatClient 的完整 API
- Prompt 模板的使用
- 多轮对话管理
- Advisor 机制详解

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
