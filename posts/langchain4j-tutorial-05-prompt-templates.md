---
title: "Langchain4J 实战教程（五）：Prompt 模板工程"
date: "2025-05-26"
excerpt: "深入掌握 Prompt 模板工程的核心技巧，学习动态提示词构建、Few-shot Learning、Chain of Thought 等高级技术。"
tags: ["Java", "AI", "LLM", "Langchain4J", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 5
---

# Langchain4J 实战教程（五）：Prompt 模板工程

## 前言

提示词（Prompt）是与大语言模型交互的核心载体。精心设计的提示词可以显著提升 AI 应用的输出质量和一致性。本章将深入探索 Langchain4J 的 Prompt 模板系统，掌握从基础到高级的提示词工程技巧。

## PromptTemplate 基础

### 基本用法

```java
import dev.langchain4j.model.input.PromptTemplate;

// 创建模板
PromptTemplate template = PromptTemplate.from("""
    你是一个{{role}}。
    
    请回答以下问题：{{question}}
    """);

// 填充变量
Prompt prompt = template.apply(Map.of(
    "role", "资深 Java 开发者",
    "question", "什么是 Java Record？"
));

// 获取提示词
String text = prompt.text();
// 或直接获取消息列表
List<ChatMessage> messages = prompt.toUserMessage();
```

### 变量类型

```java
// 字符串变量
PromptTemplate template = PromptTemplate.from("你好，{{name}}！");

// 数字变量
PromptTemplate template = PromptTemplate.from("请列出 {{count}} 个建议");

// 列表变量（自动格式化）
PromptTemplate template = PromptTemplate.from("""
    请分析以下项目：
    {{#each items}}
    - {{this}}
    {{/each}}
    """);
```

### 从资源文件加载

```java
// 从类路径加载模板
PromptTemplate template = PromptTemplate.fromResource("prompts/expert-prompt.txt");

Prompt prompt = template.apply(Map.of(
    "role", "架构师",
    "question", "如何设计微服务？"
));
```

`src/main/resources/prompts/expert-prompt.txt`:
```
你是一个经验丰富的{{role}}。

请用专业但易懂的语言回答以下问题：
{{question}}

回答要求：
1. 给出明确的答案
2. 提供具体示例
3. 指出注意事项
```

## AI Services 中的模板

### @UserMessage 注解

```java
interface Assistant {
    
    @UserMessage("请解释{{concept}}的概念")
    String explain(@V("concept") String concept);
    
    @UserMessage("""
        你是一个{{role}}。
        请回答：{{question}}
        """)
    String ask(
        @V("role") String role,
        @V("question") String question
    );
}
```

### @SystemMessage 注解

```java
interface Assistant {
    
    @SystemMessage("""
        你是一个专业的技术顾问。
        你的回答应该：
        1. 简洁明了
        2. 包含代码示例
        3. 提供最佳实践
        """)
    String chat(String message);
}
```

### 动态系统消息

```java
interface Assistant {
    
    @SystemMessage("你是一个{{domain}}领域的专家")
    String chat(
        @V("domain") String domain,
        @UserMessage String message
    );
}

// 使用
assistant.chat("Java并发编程", "如何避免死锁？");
assistant.chat("数据库优化", "如何优化慢查询？");
```

## 高级模板功能

### 条件渲染

```java
PromptTemplate template = PromptTemplate.from("""
    任务：{{task}}
    
    {{#if detailed}}
    请提供详细的分析和多个示例。
    {{else}}
    请简洁回答。
    {{/if}}
    """);

Prompt detailedPrompt = template.apply(Map.of(
    "task", "解释 Java Stream API",
    "detailed", true
));

Prompt simplePrompt = template.apply(Map.of(
    "task", "解释 Java Stream API",
    "detailed", false
));
```

### 循环渲染

```java
PromptTemplate template = PromptTemplate.from("""
    请分析以下技术栈的优缺点：
    
    {{#each technologies}}
    {{@index}}. {{name}}: {{description}}
    {{/each}}
    """);

List<Map<String, String>> techs = List.of(
    Map.of("name", "Spring Boot", "description", "快速开发框架"),
    Map.of("name", "Quarkus", "description", "云原生框架"),
    Map.of("name", "Micronaut", "description", "轻量级框架")
);

Prompt prompt = template.apply(Map.of("technologies", techs));
```

### 嵌套模板

```java
String exampleTemplate = """
    示例：
    输入：{{input}}
    输出：{{output}}
    """;

PromptTemplate mainTemplate = PromptTemplate.from("""
    请按照以下格式回答问题：
    
    {{examples}}
    
    现在请处理：
    输入：{{question}}
    """);
```

## Few-shot Learning

### 在提示词中提供示例

```java
interface SentimentAnalyzer {
    
    @UserMessage("""
        分析以下文本的情感倾向（正面/负面/中性）。
        
        示例：
        文本："这个产品太棒了，我非常喜欢！"
        情感：正面
        
        文本："服务态度很差，再也不会来了。"
        情感：负面
        
        文本："今天天气不错。"
        情感：中性
        
        现在请分析：
        文本："{{text}}"
        情感：
        """)
    String analyze(@V("text") String text);
}
```

### 动态 Few-shot

```java
interface DynamicFewShotAssistant {
    
    String chat(String message);
}

// 动态构建示例
public class FewShotProvider {
    
    private List<Example> examples;
    
    public String buildPrompt(String question) {
        // 检索相关示例
        List<Example> relevantExamples = retrieveRelevantExamples(question, 3);
        
        StringBuilder sb = new StringBuilder();
        sb.append("请按照以下示例的格式回答问题：\n\n");
        
        for (Example example : relevantExamples) {
            sb.append("问题：").append(example.question()).append("\n");
            sb.append("回答：").append(example.answer()).append("\n\n");
        }
        
        sb.append("问题：").append(question).append("\n");
        sb.append("回答：");
        
        return sb.toString();
    }
}
```

## Chain of Thought (CoT)

### 基础 CoT

```java
interface ReasoningAssistant {
    
    @UserMessage("""
        请逐步思考并回答以下问题。
        
        问题：{{question}}
        
        请按照以下格式回答：
        思考过程：
        1. 首先...
        2. 然后...
        3. 最后...
        
        答案：...
        """)
    String thinkAndAnswer(@V("question") String question);
}
```

### 结构化 CoT

```java
record ReasoningResult(
    List<String> steps,
    String conclusion,
    double confidence
) {}

interface StructuredReasoningAssistant {
    
    @UserMessage("""
        分析问题并提供结构化的推理过程。
        
        问题：{{question}}
        
        要求：
        1. 将推理过程分解为清晰的步骤
        2. 每个步骤都要有明确的理由
        3. 给出最终结论和置信度（0-1）
        """)
    ReasoningResult analyze(@V("question") String question);
}
```

### 自我反思 (Self-Reflection)

```java
interface SelfReflectAssistant {
    
    @UserMessage("""
        请回答以下问题，并进行自我检查：
        
        问题：{{question}}
        
        步骤：
        1. 给出初步答案
        2. 检查答案是否正确
        3. 如果发现问题，进行修正
        4. 给出最终答案
        
        初步答案：
        [你的答案]
        
        自我检查：
        [检查过程]
        
        最终答案：
        [修正后的答案]
        """)
    String answerWithReflection(@V("question") String question);
}
```

## 提示词最佳实践

### 1. 角色设定

```java
// 好的角色设定
@SystemMessage("""
    你是一位资深软件架构师，具有 15 年的企业级系统设计经验。
    你擅长：
    - 微服务架构设计
    - 高并发系统优化
    - 分布式系统设计
    
    回答风格：
    - 先给出核心观点
    - 再详细解释原因
    - 最后提供具体建议
    """)
String chat(String message);

// 避免模糊的角色设定
// @SystemMessage("你是一个助手") // 太模糊
```

### 2. 明确输出格式

```java
interface FormattedAssistant {
    
    @UserMessage("""
        分析以下代码，按 JSON 格式返回结果：
        
        {{code}}
        
        返回格式：
        {
          "language": "编程语言",
          "issues": ["问题1", "问题2"],
          "suggestions": ["建议1", "建议2"],
          "score": 8
        }
        
        只返回 JSON，不要其他内容。
        """)
    String analyzeCode(@V("code") String code);
}
```

### 3. 约束与边界

```java
interface ConstrainedAssistant {
    
    @UserMessage("""
        回答以下问题，遵守以下约束：
        
        问题：{{question}}
        
        约束：
        1. 回答不超过 200 字
        2. 使用专业术语
        3. 如果不确定，说"我不确定"
        4. 不猜测数据，只基于已知信息
        
        回答：
        """)
    String answerWithConstraints(@V("question") String question);
}
```

### 4. 分步骤引导

```java
interface StepByStepAssistant {
    
    @UserMessage("""
        作为一名技术顾问，请帮我解决以下问题。
        
        问题：{{problem}}
        
        请按以下步骤回答：
        
        ## 1. 问题分析
        [分析问题的核心是什么]
        
        ## 2. 解决方案
        [提供 2-3 个可行的解决方案]
        
        ## 3. 推荐方案
        [推荐最佳方案并说明理由]
        
        ## 4. 实施步骤
        [列出具体的实施步骤]
        
        ## 5. 注意事项
        [列出需要注意的风险和问题]
        """)
    String solveProblem(@V("problem") String problem);
}
```

## 提示词管理

### 资源文件组织

```
src/main/resources/
└── prompts/
    ├── system/
    │   ├── default-assistant.txt
    │   ├── code-expert.txt
    │   └── data-analyst.txt
    ├── user/
    │   ├── code-review.txt
    │   ├── translation.txt
    │   └── summarization.txt
    └── templates/
        ├── few-shot/
        │   └── sentiment-examples.txt
        └── structured/
            └── analysis-format.txt
```

### 模板管理类

```java
@Component
public class PromptManager {
    
    private final Map<String, PromptTemplate> templates = new ConcurrentHashMap<>();
    
    @PostConstruct
    public void init() {
        loadTemplates("prompts/system");
        loadTemplates("prompts/user");
    }
    
    private void loadTemplates(String path) {
        // 加载所有模板文件
        Resource[] resources = resolver.getResources("classpath:" + path + "/**/*.txt");
        for (Resource resource : resources) {
            String name = resource.getFilename().replace(".txt", "");
            String content = IOUtils.toString(resource.getInputStream(), StandardCharsets.UTF_8);
            templates.put(name, PromptTemplate.from(content));
        }
    }
    
    public Prompt getPrompt(String templateName, Map<String, Object> variables) {
        PromptTemplate template = templates.get(templateName);
        if (template == null) {
            throw new IllegalArgumentException("Template not found: " + templateName);
        }
        return template.apply(variables);
    }
}

// 使用
@Autowired
private PromptManager promptManager;

Prompt prompt = promptManager.getPrompt("code-expert", Map.of(
    "question", "如何优化 SQL 查询？"
));
```

### 版本化管理

```java
@Component
public class VersionedPromptManager {
    
    private final Map<String, Map<Integer, PromptTemplate>> versionedTemplates = new ConcurrentHashMap<>();
    
    public Prompt getPrompt(String name, int version, Map<String, Object> variables) {
        Map<Integer, PromptTemplate> versions = versionedTemplates.get(name);
        PromptTemplate template = versions.get(version);
        return template.apply(variables);
    }
    
    public Prompt getLatestPrompt(String name, Map<String, Object> variables) {
        Map<Integer, PromptTemplate> versions = versionedTemplates.get(name);
        int latestVersion = versions.keySet().stream().max(Integer::compare).orElse(1);
        return versions.get(latestVersion).apply(variables);
    }
}
```

## 提示词调试

### 日志记录

```java
@Configuration
public class PromptLoggingConfig {
    
    @Bean
    public ChatLanguageModel chatModel() {
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .modelName("gpt-4o-mini")
            .logRequests(true)
            .logResponses(true)
            .build();
    }
}
```

### 提示词可视化

```java
@Service
public class PromptDebugger {
    
    private static final Logger log = LoggerFactory.getLogger(PromptDebugger.class);
    
    public void debugPrompt(Prompt prompt) {
        log.info("=== Prompt Debug ===");
        log.info("Variables: {}", prompt.variables());
        log.info("Content:\n{}", prompt.text());
        log.info("====================");
    }
    
    public void debugMessages(List<ChatMessage> messages) {
        log.info("=== Messages Debug ===");
        for (int i = 0; i < messages.size(); i++) {
            ChatMessage msg = messages.get(i);
            log.info("[{}] {}: {}", i, msg.type(), msg.text());
        }
        log.info("=====================");
    }
}
```

## 小结

本章我们学习了：

1. **PromptTemplate 基础**：变量填充、资源加载
2. **AI Services 模板**：@UserMessage、@SystemMessage 注解
3. **高级功能**：条件渲染、循环渲染、嵌套模板
4. **Few-shot Learning**：示例引导学习
5. **Chain of Thought**：逐步推理与自我反思
6. **最佳实践**：角色设定、输出格式、约束边界
7. **提示词管理**：资源组织、版本化管理、调试技巧

## 练习

1. 创建一个支持多种角色的 AI 助手
2. 实现 Few-shot 情感分析器
3. 构建一个带自我反思的问答系统

## 参考资料

- [Langchain4J PromptTemplate 文档](https://docs.langchain4j.dev/tutorials/prompt-templates)
- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [Chain of Thought Paper](https://arxiv.org/abs/2201.11903)

## 下一章预告

在下一章《Chat Memory 对话记忆》中，我们将深入探索：

- Chat Memory 核心概念
- 多种记忆策略
- 持久化存储
- 多会话管理
- 记忆优化技巧

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
