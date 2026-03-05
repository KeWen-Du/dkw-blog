---
title: "Langchain4J 实战教程（六）：Chat Memory 对话记忆"
date: "2025-07-23"
excerpt: "深入掌握 Chat Memory 的核心概念和实现策略，学习持久化存储、多会话管理及记忆优化技巧，构建具备上下文理解能力的 AI 应用。"
tags: ["Java", "AI", "LLM", "Langchain4J", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 6
---

# Langchain4J 实战教程（六）：Chat Memory 对话记忆

## 前言

对话记忆（Chat Memory）是构建智能对话系统的关键组件。它让 AI 能够"记住"之前的对话内容，实现连贯的多轮对话。本章将深入探索 Langchain4J 的 Chat Memory 机制，掌握各种记忆策略的实现与应用。

## Chat Memory 概述

### 为什么需要对话记忆？

```
┌─────────────────────────────────────────────────────────────────┐
│                    对话记忆的重要性                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  无记忆对话：                                                    │
│  ──────────                                                     │
│  用户：我叫张三                                                  │
│  AI：你好，张三！有什么可以帮你的？                               │
│                                                                 │
│  用户：我叫什么名字？                                            │
│  AI：抱歉，我不知道你的名字。  ← 无法记住之前的信息              │
│                                                                 │
│  有记忆对话：                                                    │
│  ──────────                                                     │
│  用户：我叫张三                                                  │
│  AI：你好，张三！有什么可以帮你的？                               │
│                                                                 │
│  用户：我叫什么名字？                                            │
│  AI：你叫张三。  ← 记住了之前的对话                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Chat Memory 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chat Memory 架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户消息 ──→ AI Services ──→ Chat Memory ──→ 构建完整提示词    │
│                    │                │                           │
│                    │                ├── 消息存储                 │
│                    │                ├── 驱逐策略                 │
│                    │                └── 持久化                   │
│                    │                                            │
│                    ▼                                            │
│              LLM 调用                                           │
│                    │                                            │
│                    ▼                                            │
│              AI 响应 ──→ 存入 Chat Memory                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心接口

### ChatMemory 接口

```java
public interface ChatMemory {
    
    // 添加消息
    void add(ChatMessage message);
    
    // 获取所有消息
    List<ChatMessage> messages();
    
    // 清空记忆
    void clear();
    
    // 获取记忆 ID
    Object id();
}
```

### 消息类型

```java
// 系统消息 - 定义 AI 角色
SystemMessage system = SystemMessage.from("你是一个助手");

// 用户消息 - 用户的输入
UserMessage user = UserMessage.from("你好");

// AI 消息 - AI 的响应
AiMessage ai = AiMessage.from("你好！有什么可以帮你的？");

// 工具执行消息 - 工具调用结果
ToolExecutionResultMessage toolResult = ToolExecutionResultMessage.from(
    toolExecutionId,
    "tool-name",
    "result"
);
```

## 记忆策略

### 1. 消息窗口记忆（MessageWindowChatMemory）

保留最近 N 条消息，适合大多数场景：

```java
import dev.langchain4j.memory.chat.MessageWindowChatMemory;

// 保留最近 10 条消息
ChatMemory memory = MessageWindowChatMemory.withMaxMessages(10);

// 使用
memory.add(SystemMessage.from("你是一个助手"));
memory.add(UserMessage.from("你好"));
memory.add(AiMessage.from("你好！"));

List<ChatMessage> messages = memory.messages(); // 获取所有消息
```

### 2. Token 窗口记忆（TokenWindowChatMemory）

保留最近 N 个 Token，精确控制上下文大小：

```java
import dev.langchain4j.memory.chat.TokenWindowChatMemory;

// 保留最近 4000 个 Token
ChatMemory memory = TokenWindowChatMemory.withMaxTokens(4000);

// 使用自定义的 Token 计数器
ChatMemory memory = TokenWindowChatMemory.builder()
    .maxTokens(4000)
    .tokenCountEstimator(tokenizer)  // 自定义 Token 计算器
    .build();
```

### 3. 混合策略

```java
// 组合多种策略
public class HybridChatMemory implements ChatMemory {
    
    private final int maxMessages;
    private final int maxTokens;
    private final List<ChatMessage> messages = new ArrayList<>();
    
    @Override
    public void add(ChatMessage message) {
        messages.add(message);
        
        // 先按消息数量裁剪
        while (messages.size() > maxMessages) {
            messages.remove(0);
        }
        
        // 再按 Token 数量裁剪
        while (estimateTokens() > maxTokens) {
            messages.remove(0);
        }
    }
    
    private int estimateTokens() {
        // 估算 Token 数量
        return messages.stream()
            .mapToInt(m -> m.text().length() / 4)  // 粗略估算
            .sum();
    }
}
```

## AI Services 集成

### 单一会话记忆

```java
interface Assistant {
    String chat(String message);
}

// 单一会话，所有用户共享记忆
Assistant assistant = AiServices.builder(Assistant.class)
    .chatLanguageModel(chatModel)
    .chatMemory(MessageWindowChatMemory.withMaxMessages(10))
    .build();
```

### 多会话记忆

```java
interface MultiSessionAssistant {
    String chat(@MemoryId String sessionId, String message);
}

// 每个会话独立记忆
MultiSessionAssistant assistant = AiServices.builder(MultiSessionAssistant.class)
    .chatLanguageModel(chatModel)
    .chatMemoryProvider(id -> MessageWindowChatMemory.withMaxMessages(10))
    .build();

// 使用 - 不同会话有独立的记忆
assistant.chat("session-1", "我叫张三");
assistant.chat("session-2", "我叫李四");
assistant.chat("session-1", "我叫什么？"); // AI 知道是张三
assistant.chat("session-2", "我叫什么？"); // AI 知道是李四
```

### 自定义记忆提供者

```java
public class CustomChatMemoryProvider implements ChatMemoryProvider {
    
    private final ChatMemoryStore store;
    private final int maxMessages;
    
    @Override
    public ChatMemory get(Object memoryId) {
        // 从存储加载历史消息
        List<ChatMessage> history = store.getMessages(memoryId);
        
        ChatMemory memory = MessageWindowChatMemory.builder()
            .maxMessages(maxMessages)
            .id(memoryId)
            .build();
        
        // 恢复历史
        history.forEach(memory::add);
        
        return memory;
    }
}

// 使用
MultiSessionAssistant assistant = AiServices.builder(MultiSessionAssistant.class)
    .chatLanguageModel(chatModel)
    .chatMemoryProvider(new CustomChatMemoryProvider(store, 20))
    .build();
```

## 持久化存储

### 内存存储

```java
import dev.langchain4j.store.memory.chat.InMemoryChatMemoryStore;

ChatMemoryStore store = new InMemoryChatMemoryStore();
```

### 数据库存储

```java
import dev.langchain4j.store.memory.chat.ChatMemoryStore;

public class JpaChatMemoryStore implements ChatMemoryStore {
    
    private final ChatMessageRepository repository;
    
    @Override
    public List<ChatMessage> getMessages(Object memoryId) {
        List<ChatMessageEntity> entities = repository.findBySessionIdOrderByCreatedAt(
            memoryId.toString()
        );
        
        return entities.stream()
            .map(this::toChatMessage)
            .collect(Collectors.toList());
    }
    
    @Override
    public void updateMessages(Object memoryId, List<ChatMessage> messages) {
        // 删除旧消息
        repository.deleteBySessionId(memoryId.toString());
        
        // 保存新消息
        List<ChatMessageEntity> entities = messages.stream()
            .map(msg -> toEntity(memoryId.toString(), msg))
            .collect(Collectors.toList());
        repository.saveAll(entities);
    }
    
    @Override
    public void deleteMessages(Object memoryId) {
        repository.deleteBySessionId(memoryId.toString());
    }
    
    private ChatMessage toChatMessage(ChatMessageEntity entity) {
        return switch (entity.getType()) {
            case "SYSTEM" -> SystemMessage.from(entity.getContent());
            case "USER" -> UserMessage.from(entity.getContent());
            case "AI" -> AiMessage.from(entity.getContent());
            default -> throw new IllegalArgumentException("Unknown type: " + entity.getType());
        };
    }
    
    private ChatMessageEntity toEntity(String sessionId, ChatMessage message) {
        ChatMessageEntity entity = new ChatMessageEntity();
        entity.setSessionId(sessionId);
        entity.setType(message.type().name());
        entity.setContent(message.text());
        entity.setCreatedAt(LocalDateTime.now());
        return entity;
    }
}
```

### Redis 存储

```java
public class RedisChatMemoryStore implements ChatMemoryStore {
    
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;
    private final Duration ttl;
    
    public RedisChatMemoryStore(RedisTemplate<String, String> redisTemplate,
                                Duration ttl) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = new ObjectMapper();
        this.ttl = ttl;
    }
    
    @Override
    public List<ChatMessage> getMessages(Object memoryId) {
        String key = getKey(memoryId);
        String json = redisTemplate.opsForValue().get(key);
        
        if (json == null) {
            return new ArrayList<>();
        }
        
        try {
            return objectMapper.readValue(json,
                new TypeReference<List<ChatMessageDto>>() {})
                .stream()
                .map(this::toChatMessage)
                .collect(Collectors.toList());
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize messages", e);
        }
    }
    
    @Override
    public void updateMessages(Object memoryId, List<ChatMessage> messages) {
        String key = getKey(memoryId);
        
        List<ChatMessageDto> dtos = messages.stream()
            .map(this::toDto)
            .collect(Collectors.toList());
        
        try {
            String json = objectMapper.writeValueAsString(dtos);
            redisTemplate.opsForValue().set(key, json, ttl);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize messages", e);
        }
    }
    
    @Override
    public void deleteMessages(Object memoryId) {
        redisTemplate.delete(getKey(memoryId));
    }
    
    private String getKey(Object memoryId) {
        return "chat:memory:" + memoryId;
    }
}
```

## 记忆优化技巧

### 1. 智能摘要

```java
public class SummarizingChatMemory implements ChatMemory {
    
    private final ChatLanguageModel summaryModel;
    private final ChatMemory delegate;
    private final int summaryThreshold;
    
    private String summary = "";
    
    @Override
    public void add(ChatMessage message) {
        delegate.add(message);
        
        // 当消息数量超过阈值时，进行摘要
        if (delegate.messages().size() > summaryThreshold) {
            summarizeOldMessages();
        }
    }
    
    private void summarizeOldMessages() {
        List<ChatMessage> oldMessages = delegate.messages()
            .subList(0, delegate.messages().size() - summaryThreshold / 2);
        
        String summaryPrompt = """
            请总结以下对话内容，保留关键信息：
            
            %s
            
            当前进度：%s
            """.formatted(
                oldMessages.stream().map(ChatMessage::text).collect(Collectors.joining("\n")),
                summary
            );
        
        summary = summaryModel.generate(summaryPrompt);
        
        // 清空旧消息，添加摘要作为系统消息
        delegate.clear();
        delegate.add(SystemMessage.from("之前对话摘要：" + summary));
    }
}
```

### 2. 关键信息提取

```java
public class KeyInfoExtractor {
    
    interface InfoExtractor {
        @UserMessage("""
            从以下对话中提取关键信息（如姓名、偏好、上下文）：
            {{conversation}}
            
            以 JSON 格式返回。
            """)
        KeyInfo extract(@V("conversation") String conversation);
    }
    
    record KeyInfo(
        String userName,
        List<String> preferences,
        Map<String, String> context
    ) {}
    
    private final InfoExtractor extractor;
    
    public KeyInfo extractKeyInfo(List<ChatMessage> messages) {
        String conversation = messages.stream()
            .map(m -> m.type() + ": " + m.text())
            .collect(Collectors.joining("\n"));
        return extractor.extract(conversation);
    }
}
```

### 3. 滑动窗口 + 重要消息保留

```java
public class SmartChatMemory implements ChatMemory {
    
    private final int maxMessages;
    private final List<ChatMessage> messages = new ArrayList<>();
    private final List<ChatMessage> importantMessages = new ArrayList<>();
    
    @Override
    public void add(ChatMessage message) {
        // 检查是否是重要消息（包含关键信息）
        if (isImportant(message)) {
            importantMessages.add(message);
        }
        
        messages.add(message);
        
        // 裁剪，但保留重要消息
        while (messages.size() > maxMessages) {
            ChatMessage toRemove = messages.get(0);
            if (!importantMessages.contains(toRemove)) {
                messages.remove(0);
            } else {
                // 重要消息不删除，跳过
                break;
            }
        }
    }
    
    private boolean isImportant(ChatMessage message) {
        String text = message.text().toLowerCase();
        // 检查是否包含关键信息
        return text.contains("我叫") || 
               text.contains("我的") || 
               text.contains("记住") ||
               text.contains("偏好");
    }
}
```

## 完整示例

### 带持久化的多会话聊天

```java
// 1. 定义接口
interface PersistentAssistant {
    
    @SystemMessage("你是一个友好的助手，能够记住用户的偏好和历史对话。")
    String chat(@MemoryId String userId, @UserMessage String message);
}

// 2. 配置
@Configuration
public class ChatConfig {
    
    @Bean
    public ChatMemoryStore chatMemoryStore(RedisTemplate<String, String> redisTemplate) {
        return new RedisChatMemoryStore(redisTemplate, Duration.ofDays(7));
    }
    
    @Bean
    public PersistentAssistant assistant(
            ChatLanguageModel chatModel,
            ChatMemoryStore chatMemoryStore) {
        
        return AiServices.builder(PersistentAssistant.class)
            .chatLanguageModel(chatModel)
            .chatMemoryProvider(memoryId -> {
                ChatMemory memory = MessageWindowChatMemory.builder()
                    .maxMessages(20)
                    .id(memoryId)
                    .chatMemoryStore(chatMemoryStore)
                    .build();
                return memory;
            })
            .build();
    }
}

// 3. 控制器
@RestController
@RequestMapping("/api/chat")
public class ChatController {
    
    private final PersistentAssistant assistant;
    
    @PostMapping
    public ChatResponse chat(@RequestBody ChatRequest request,
                            @RequestHeader("X-User-Id") String userId) {
        String response = assistant.chat(userId, request.message());
        return new ChatResponse(response);
    }
    
    @DeleteMapping("/memory")
    public void clearMemory(@RequestHeader("X-User-Id") String userId,
                           ChatMemoryStore store) {
        store.deleteMessages(userId);
    }
    
    public record ChatRequest(String message) {}
    public record ChatResponse(String response) {}
}
```

### 记忆管理 API

```java
@RestController
@RequestMapping("/api/memory")
public class MemoryController {
    
    private final ChatMemoryStore chatMemoryStore;
    
    @GetMapping("/{sessionId}")
    public List<MessageDto> getMemory(@PathVariable String sessionId) {
        List<ChatMessage> messages = chatMemoryStore.getMessages(sessionId);
        return messages.stream()
            .map(this::toDto)
            .collect(Collectors.toList());
    }
    
    @DeleteMapping("/{sessionId}")
    public void clearMemory(@PathVariable String sessionId) {
        chatMemoryStore.deleteMessages(sessionId);
    }
    
    @GetMapping("/{sessionId}/export")
    public String exportMemory(@PathVariable String sessionId) {
        List<ChatMessage> messages = chatMemoryStore.getMessages(sessionId);
        return messages.stream()
            .map(m -> "[%s] %s".formatted(m.type(), m.text()))
            .collect(Collectors.joining("\n\n"));
    }
    
    private MessageDto toDto(ChatMessage message) {
        return new MessageDto(
            message.type().name(),
            message.text(),
            LocalDateTime.now()
        );
    }
    
    record MessageDto(String type, String content, LocalDateTime timestamp) {}
}
```

## 小结

本章我们学习了：

1. **Chat Memory 概念**：对话记忆的重要性和架构
2. **核心接口**：ChatMemory、消息类型
3. **记忆策略**：消息窗口、Token 窗口、混合策略
4. **AI Services 集成**：单一会话、多会话、自定义提供者
5. **持久化存储**：内存、数据库、Redis
6. **优化技巧**：智能摘要、关键信息提取、重要消息保留

## 练习

1. 实现一个基于 Redis 的持久化聊天记忆
2. 创建一个带摘要功能的长期记忆系统
3. 构建一个支持记忆管理的 REST API

## 参考资料

- [Langchain4J Chat Memory 文档](https://docs.langchain4j.dev/tutorials/chat-memory)
- [Chat Memory Store API](https://docs.langchain4j.dev/tutorials/chat-memory/persistence)

## 下一章预告

在下一章《RAG 检索增强生成》中，我们将深入探索：

- RAG 核心原理
- 文档加载与处理
- 向量嵌入与存储
- 相似度检索
- 完整 RAG 系统实现

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
