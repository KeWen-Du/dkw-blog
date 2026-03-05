---
title: "Langchain4J 实战教程（八）：Tools 与 Agent 开发"
date: "2025-07-25"
excerpt: "深入掌握 Function Calling 和 Agent 开发的核心技术，学习工具定义、多工具协作及复杂 Agent 系统的设计与实现。"
tags: ["Java", "AI", "LLM", "Langchain4J", "Agent", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 8
---

# Langchain4J 实战教程（八）：Tools 与 Agent 开发

## 前言

Function Calling（函数调用）是现代大语言模型的核心能力之一，它让 LLM 能够调用外部工具完成复杂任务。Agent 则是更进一步，能够自主规划、决策并执行多步骤任务。本章将深入探索 Tools 与 Agent 开发的核心技术。

## Function Calling 原理

### 核心概念

```
┌─────────────────────────────────────────────────────────────────┐
│                   Function Calling 原理                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  传统对话：                                                     │
│  ──────────                                                     │
│  用户：北京今天天气怎么样？                                      │
│  AI：抱歉，我无法获取实时天气信息...                             │
│                                                                 │
│  Function Calling：                                             │
│  ─────────────────                                              │
│  用户：北京今天天气怎么样？                                      │
│  AI：[分析：需要调用天气工具]                                    │
│      [调用：getWeather("北京")]                                  │
│      [结果：{"temp": 25, "weather": "晴"}]                       │
│      北京今天天气晴朗，气温 25°C。                               │
│                                                                 │
│  流程：                                                         │
│  用户问题 ──→ LLM分析 ──→ 决定调用工具 ──→ 执行工具 ──→ LLM生成  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                   Function Calling 流程                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 用户提问                                                    │
│     "帮我查询订单 ORD123456 的状态"                              │
│                                                                 │
│  2. LLM 分析                                                    │
│     • 理解用户意图                                               │
│     • 匹配可用工具                                               │
│     • 提取参数                                                   │
│                                                                 │
│  3. 工具调用                                                    │
│     Tool: queryOrder                                            │
│     Args: {"orderId": "ORD123456"}                              │
│                                                                 │
│  4. 执行工具                                                    │
│     返回：{"status": "已发货", "tracking": "SF123"}              │
│                                                                 │
│  5. LLM 生成回复                                                │
│     "您的订单 ORD123456 已发货，快递单号 SF123"                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 工具定义

### @Tool 注解

```java
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.P;

public class WeatherTools {
    
    private final WeatherService weatherService;
    
    @Tool("获取指定城市的当前天气信息")
    public String getCurrentWeather(
        @P("城市名称，如：北京、上海、广州") String city,
        @P(value = "温度单位，可选：celsius 或 fahrenheit", required = false) String unit
    ) {
        return weatherService.fetchCurrentWeather(city, unit);
    }
    
    @Tool("获取未来几天的天气预报")
    public String getWeatherForecast(
        @P("城市名称") String city,
        @P("预报天数，范围 1-7") int days
    ) {
        return weatherService.fetchForecast(city, days);
    }
}
```

### 工具最佳实践

```java
public class OrderTools {
    
    private final OrderService orderService;
    
    // 好的工具定义：描述清晰、参数明确
    @Tool("""
        查询订单详细信息。
        返回订单状态、商品列表、支付状态、物流信息等。
        """)
    public String queryOrder(
        @P("订单号，格式：ORD + 数字，如 ORD123456") String orderId
    ) {
        Order order = orderService.getOrder(orderId);
        if (order == null) {
            return "订单不存在：" + orderId;
        }
        return formatOrderInfo(order);
    }
    
    @Tool("取消订单")
    public String cancelOrder(
        @P("订单号") String orderId,
        @P("取消原因") String reason
    ) {
        try {
            orderService.cancelOrder(orderId, reason);
            return "订单已成功取消";
        } catch (Exception e) {
            return "取消失败：" + e.getMessage();
        }
    }
    
    // 避免模糊的工具定义
    // @Tool("处理订单") // 太模糊，LLM 无法确定何时使用
    // public String processOrder(String data) { ... }
}
```

## 工具集成

### 基础集成

```java
interface SmartAssistant {
    
    @SystemMessage("""
        你是一个智能助手。
        当用户询问天气时，使用天气工具。
        当用户查询订单时，使用订单工具。
        """)
    String chat(String message);
}

SmartAssistant assistant = AiServices.builder(SmartAssistant.class)
    .chatLanguageModel(chatModel)
    .tools(new WeatherTools(weatherService))
    .tools(new OrderTools(orderService))
    .build();
```

### 动态工具注册

```java
public class DynamicToolRegistry {
    
    private final Map<String, Object> toolInstances = new ConcurrentHashMap<>();
    
    public void registerTool(String name, Object toolInstance) {
        toolInstances.put(name, toolInstance);
    }
    
    public Object[] getTools() {
        return toolInstances.values().toArray();
    }
}

// 使用
DynamicToolRegistry registry = new DynamicToolRegistry();
registry.registerTool("weather", new WeatherTools(weatherService));
registry.registerTool("order", new OrderTools(orderService));

SmartAssistant assistant = AiServices.builder(SmartAssistant.class)
    .chatLanguageModel(chatModel)
    .tools(registry.getTools())
    .build();
```

### 工具执行配置

```java
SmartAssistant assistant = AiServices.builder(SmartAssistant.class)
    .chatLanguageModel(chatModel)
    .tools(new WeatherTools(weatherService))
    // 最大连续工具调用次数（防止死循环）
    .maxSequentialToolsInvocations(10)
    // 自定义工具执行器
    .toolExecutor((toolName, args) -> {
        log.info("执行工具: {} with args: {}", toolName, args);
        // 可以添加权限检查、日志、监控等
        return executeTool(toolName, args);
    })
    .build();
```

## 复杂工具示例

### 数据库查询工具

```java
public class DatabaseTools {
    
    private final JdbcTemplate jdbcTemplate;
    
    @Tool("查询用户信息")
    public String queryUser(@P("用户ID") Long userId) {
        String sql = "SELECT * FROM users WHERE id = ?";
        Map<String, Object> user = jdbcTemplate.queryForMap(sql, userId);
        return formatResult(user);
    }
    
    @Tool("查询订单列表")
    public String queryOrders(
        @P(value = "用户ID", required = false) Long userId,
        @P(value = "订单状态", required = false) String status,
        @P(value = "返回数量，默认10", required = false) Integer limit
    ) {
        StringBuilder sql = new StringBuilder("SELECT * FROM orders WHERE 1=1");
        List<Object> params = new ArrayList<>();
        
        if (userId != null) {
            sql.append(" AND user_id = ?");
            params.add(userId);
        }
        if (status != null) {
            sql.append(" AND status = ?");
            params.add(status);
        }
        
        sql.append(" ORDER BY created_at DESC LIMIT ?");
        params.add(limit != null ? limit : 10);
        
        List<Map<String, Object>> orders = jdbcTemplate.queryForList(
            sql.toString(), 
            params.toArray()
        );
        return formatResult(orders);
    }
}
```

### HTTP API 工具

```java
public class HttpApiTools {
    
    private final WebClient webClient;
    
    @Tool("调用外部 API")
    public String callApi(
        @P("API URL") String url,
        @P("HTTP 方法：GET, POST, PUT, DELETE") String method,
        @P(value = "请求体（JSON 格式）", required = false) String body
    ) {
        try {
            return switch (method.toUpperCase()) {
                case "GET" -> webClient.get()
                    .uri(url)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();
                    
                case "POST" -> webClient.post()
                    .uri(url)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();
                    
                default -> throw new IllegalArgumentException("不支持的方法：" + method);
            };
        } catch (Exception e) {
            return "API 调用失败：" + e.getMessage();
        }
    }
}
```

### 文件操作工具

```java
public class FileTools {
    
    @Tool("读取文件内容")
    public String readFile(@P("文件路径") String filePath) {
        try {
            return Files.readString(Path.of(filePath));
        } catch (Exception e) {
            return "读取失败：" + e.getMessage();
        }
    }
    
    @Tool("写入文件")
    public String writeFile(
        @P("文件路径") String filePath,
        @P("文件内容") String content
    ) {
        try {
            Files.writeString(Path.of(filePath), content);
            return "文件写入成功";
        } catch (Exception e) {
            return "写入失败：" + e.getMessage();
        }
    }
    
    @Tool("列出目录内容")
    public String listDirectory(@P("目录路径") String dirPath) {
        try {
            return Files.list(Path.of(dirPath))
                .map(p -> p.getFileName().toString())
                .collect(Collectors.joining("\n"));
        } catch (Exception e) {
            return "列出失败：" + e.getMessage();
        }
    }
}
```

## Agent 架构

### Agent 概念

```
┌─────────────────────────────────────────────────────────────────┐
│                       Agent 架构                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agent = LLM + Tools + Planning + Execution                     │
│                                                                 │
│  特点：                                                         │
│  • 自主决策：根据目标选择行动                                    │
│  • 多步推理：分解复杂任务                                        │
│  • 工具使用：调用外部工具                                        │
│  • 自我反思：评估结果并调整                                      │
│                                                                 │
│  工作流程：                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │ 感知输入  │ ─→ │ 规划行动  │ ─→ │ 执行工具  │ ─→ │ 反思调整  │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘    │
│       │              │              │              │            │
│       └──────────────────────────────────────────────┘            │
│                         循环直到完成                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### ReAct Agent

```java
public class ReActAgent {
    
    private final ChatLanguageModel model;
    private final Map<String, ToolExecutor> tools;
    private final int maxIterations;
    
    public String execute(String task) {
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(SystemMessage.from("""
            你是一个智能代理，使用 ReAct 框架解决问题。
            
            格式：
            思考：分析当前情况
            行动：选择工具和参数
            观察：工具执行结果
            ...（重复直到解决）
            答案：最终答案
            """));
        messages.add(UserMessage.from(task));
        
        for (int i = 0; i < maxIterations; i++) {
            String response = model.generate(messages).content().text();
            messages.add(AiMessage.from(response));
            
            // 解析行动
            String action = parseAction(response);
            if (action == null) {
                // 没有行动，返回答案
                return parseAnswer(response);
            }
            
            // 执行工具
            String observation = executeTool(action);
            messages.add(UserMessage.from("观察：" + observation));
        }
        
        return "达到最大迭代次数，任务未完成";
    }
}
```

### Plan-and-Execute Agent

```java
public class PlanAndExecuteAgent {
    
    private final ChatLanguageModel plannerModel;
    private final ChatLanguageModel executorModel;
    private final Map<String, ToolExecutor> tools;
    
    interface Planner {
        @UserMessage("""
            制定执行以下任务的计划：
            {{task}}
            
            返回 JSON 格式的步骤列表：
            {"steps": ["步骤1", "步骤2", ...]}
            """)
        Plan plan(@V("task") String task);
    }
    
    interface Executor {
        @UserMessage("""
            执行以下步骤：
            {{step}}
            
            可用工具：{{tools}}
            
            如果需要工具，说明工具名称和参数。
            如果步骤完成，说明结果。
            """)
        String execute(@V("step") String step, @V("tools") String tools);
    }
    
    record Plan(List<String> steps) {}
    
    public String execute(String task) {
        // 1. 规划阶段
        Plan plan = planner.plan(task);
        
        // 2. 执行阶段
        List<String> results = new ArrayList<>();
        for (String step : plan.steps()) {
            String result = executor.execute(step, getToolDescriptions());
            results.add(result);
        }
        
        // 3. 汇总结果
        return summarizeResults(results);
    }
}
```

## 多工具协作

### 工具选择策略

```java
public class ToolSelectionStrategy {
    
    private final List<ToolInfo> toolInfos;
    
    // 基于相似度选择相关工具
    public List<Object> selectRelevantTools(String query, EmbeddingModel embeddingModel) {
        Embedding queryEmbedding = embeddingModel.embed(query).content();
        
        return toolInfos.stream()
            .sorted((a, b) -> Double.compare(
                cosineSimilarity(queryEmbedding, b.embedding()),
                cosineSimilarity(queryEmbedding, a.embedding())
            ))
            .limit(5)  // 选择最相关的 5 个工具
            .map(ToolInfo::instance)
            .collect(Collectors.toList());
    }
    
    record ToolInfo(
        String name,
        String description,
        Embedding embedding,
        Object instance
    ) {}
}
```

### 工具链

```java
public class ToolChain {
    
    private final List<ToolExecutor> chain;
    
    public String execute(String input) {
        String result = input;
        
        for (ToolExecutor tool : chain) {
            result = tool.execute(result);
            
            // 检查是否需要中断
            if (shouldStop(result)) {
                break;
            }
        }
        
        return result;
    }
}

// 使用示例
ToolChain chain = ToolChain.builder()
    .add(new SearchTool())
    .add(new FilterTool())
    .add(new FormatTool())
    .build();

String result = chain.execute("搜索关键词");
```

## 完整 Agent 示例

### 研究助手 Agent

```java
// 1. 定义工具
public class ResearchTools {
    
    @Tool("搜索网络获取信息")
    public String webSearch(@P("搜索关键词") String query) {
        // 调用搜索 API
        return searchService.search(query);
    }
    
    @Tool("访问网页获取详细内容")
    public String fetchWebPage(@P("网页 URL") String url) {
        return webClient.get()
            .uri(url)
            .retrieve()
            .bodyToMono(String.class)
            .block();
    }
    
    @Tool("保存研究结果到文件")
    public String saveToFile(
        @P("文件名") String filename,
        @P("内容") String content
    ) {
        try {
            Files.writeString(Path.of("research/" + filename), content);
            return "保存成功";
        } catch (Exception e) {
            return "保存失败：" + e.getMessage();
        }
    }
}

// 2. 定义 Agent
interface ResearchAgent {
    
    @SystemMessage("""
        你是一个研究助手，帮助用户收集和整理信息。
        
        工作流程：
        1. 使用 webSearch 搜索相关信息
        2. 使用 fetchWebPage 获取详细内容
        3. 整理并总结信息
        4. 使用 saveToFile 保存结果
        
        请自主决定需要调用哪些工具来完成用户的研究任务。
        """)
    String research(@UserMessage String task);
}

// 3. 构建 Agent
ResearchAgent agent = AiServices.builder(ResearchAgent.class)
    .chatLanguageModel(chatModel)
    .tools(new ResearchTools())
    .chatMemoryProvider(id -> MessageWindowChatMemory.withMaxMessages(20))
    .maxSequentialToolsInvocations(15)
    .build();

// 4. 使用
String result = agent.research("研究 Langchain4J 框架的主要特性和应用场景");
```

### 代码助手 Agent

```java
public class CodeTools {
    
    @Tool("读取代码文件")
    public String readFile(@P("文件路径") String path) {
        try {
            return Files.readString(Path.of(path));
        } catch (Exception e) {
            return "读取失败：" + e.getMessage();
        }
    }
    
    @Tool("写入代码文件")
    public String writeFile(@P("文件路径") String path, @P("代码内容") String code) {
        try {
            Files.writeString(Path.of(path), code);
            return "写入成功";
        } catch (Exception e) {
            return "写入失败：" + e.getMessage();
        }
    }
    
    @Tool("执行命令")
    public String executeCommand(@P("命令") String command) {
        try {
            Process process = Runtime.getRuntime().exec(command);
            String output = new String(process.getInputStream().readAllBytes());
            return output;
        } catch (Exception e) {
            return "执行失败：" + e.getMessage();
        }
    }
    
    @Tool("分析代码结构")
    public String analyzeCode(@P("代码内容") String code) {
        // 使用 LLM 分析代码
        return codeAnalyzer.analyze(code);
    }
}

interface CodeAgent {
    
    @SystemMessage("""
        你是一个代码助手，帮助用户编写、修改和调试代码。
        
        能力：
        - 读取和分析现有代码
        - 编写新代码
        - 修复 bug
        - 执行命令和测试
        
        请根据用户需求自主决定需要执行的操作。
        """)
    String assist(@UserMessage String task);
}
```

## 小结

本章我们学习了：

1. **Function Calling 原理**：概念、工作流程
2. **工具定义**：@Tool 注解、参数定义、最佳实践
3. **工具集成**：基础集成、动态注册、执行配置
4. **复杂工具**：数据库、HTTP API、文件操作
5. **Agent 架构**：概念、ReAct、Plan-and-Execute
6. **多工具协作**：选择策略、工具链
7. **完整示例**：研究助手、代码助手

## 练习

1. 创建一个带天气查询功能的智能助手
2. 实现一个能够执行多步操作的任务 Agent
3. 构建一个代码审查和修复 Agent

## 参考资料

- [Langchain4J Tools 文档](https://docs.langchain4j.dev/tutorials/tools)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [ReAct 论文](https://arxiv.org/abs/2210.03629)

## 下一章预告

在下一章《可观测性与生产部署》中，我们将深入探索：

- 日志与追踪
- 性能监控
- 错误处理
- 安全最佳实践
- 生产环境部署

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
