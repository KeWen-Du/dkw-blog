---
title: "Spring AI 实战教程（八）：Tools 与 Function Calling"
date: "2025-08-21"
excerpt: "深入理解 Function Calling 原理，掌握 Spring AI Tools API，构建具备外部调用能力的智能 Agent。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 8
---

# Spring AI 实战教程（八）：Tools 与 Function Calling

## 前言

Function Calling（函数调用）是让 LLM 与外部世界交互的关键能力。通过 Function Calling，LLM 可以调用预定义的函数获取实时数据、执行操作，从而突破自身知识的限制。本章将深入探讨 Spring AI 的 Tools API，构建具备外部调用能力的智能 Agent。

## Function Calling 原理

### 核心概念

```
┌─────────────────────────────────────────────────────────────────┐
│                  Function Calling 工作流程                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   用户问题："北京今天天气怎么样？"                               │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  1. LLM 分析问题，判断需要调用哪个函数                    │  │
│   │                                                          │  │
│   │  可用函数：                                               │  │
│   │  • get_weather(city: string) -> WeatherInfo             │  │
│   │  • get_stock_price(symbol: string) -> StockInfo         │  │
│   │  • send_email(to: string, subject: string, body: string)│  │
│   │                                                          │  │
│   │  决策：调用 get_weather(city="北京")                     │  │
│   └─────────────────────────────────────────────────────────┘  │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  2. 执行函数，获取结果                                    │  │
│   │                                                          │  │
│   │  get_weather("北京") -> {                                │  │
│   │    "city": "北京",                                       │  │
│   │    "temperature": 25,                                    │  │
│   │    "condition": "晴",                                    │  │
│   │    "humidity": 45                                        │  │
│   │  }                                                       │  │
│   └─────────────────────────────────────────────────────────┘  │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  3. LLM 基于函数结果生成自然语言回答                      │  │
│   │                                                          │  │
│   │  "北京今天天气晴朗，气温25度，湿度45%，                   │  │
│   │   适合外出活动。"                                         │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 支持的模型

| 模型 | Function Calling | 并行调用 | 流式 |
|------|------------------|----------|------|
| GPT-4o | ✅ | ✅ | ✅ |
| GPT-4 | ✅ | ✅ | ✅ |
| Claude 3.5 | ✅ | ✅ | ✅ |
| Gemini 1.5 | ✅ | ✅ | ✅ |
| Qwen | ✅ | ✅ | ❌ |
| Ollama | ✅ (部分模型) | ❌ | ❌ |

## Spring AI Tools API

### 基本使用

#### 方式一：@Bean + @Description 注解

```java
@Configuration
public class ToolsConfig {
    
    @Bean
    @Description("获取指定城市的当前天气信息")
    public Function<WeatherRequest, WeatherResponse> weatherFunction(
            WeatherService weatherService) {
        return request -> weatherService.getWeather(request.city());
    }
    
    @Bean
    @Description("查询股票实时价格")
    public Function<StockRequest, StockResponse> stockFunction(
            StockService stockService) {
        return request -> stockService.getStockPrice(request.symbol());
    }
    
    @Bean
    @Description("发送电子邮件")
    public Function<EmailRequest, EmailResponse> emailFunction(
            EmailService emailService) {
        return request -> emailService.sendEmail(
                request.to(),
                request.subject(),
                request.body()
        );
    }
}

// 请求/响应对象
record WeatherRequest(String city) {}
record WeatherResponse(String city, int temperature, String condition, int humidity) {}

record StockRequest(String symbol) {}
record StockResponse(String symbol, double price, double change, String currency) {}

record EmailRequest(String to, String subject, String body) {}
record EmailResponse(boolean success, String messageId) {}
```

#### 方式二：使用 ChatClient 注册

```java
@Service
public class ToolService {
    
    private final ChatClient chatClient;
    private final WeatherService weatherService;
    
    public ToolService(ChatModel chatModel, WeatherService weatherService) {
        this.weatherService = weatherService;
        
        this.chatClient = ChatClient.builder(chatModel)
                .defaultFunctions("weatherFunction", "stockFunction")
                .build();
    }
    
    public String chat(String message) {
        return chatClient.prompt()
                .user(message)
                .functions("weatherFunction")  // 动态启用函数
                .call()
                .content();
    }
}
```

#### 方式三：动态注册

```java
@Service
public class DynamicToolService {
    
    private final ChatClient chatClient;
    
    public DynamicToolService(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
                .build();
    }
    
    public String chatWithTools(String message, List<String> functionNames) {
        return chatClient.prompt()
                .user(message)
                .functions(functionNames.toArray(new String[0]))
                .call()
                .content();
    }
}
```

### 自动函数注册

Spring AI 会自动扫描并注册带有 `@Bean` 和 `@Description` 注解的函数：

```
┌─────────────────────────────────────────────────────────────┐
│                    函数注册流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   @Bean                                                     │
│   @Description("函数描述")                                   │
│   public Function<Request, Response> myFunction() {         │
│       return request -> { ... };                            │
│   }                                                         │
│                                                             │
│         │                                                   │
│         ▼                                                   │
│   ┌─────────────────────────────────────────────────────┐  │
│   │  Spring AI 自动处理：                                 │  │
│   │  1. 提取函数名称 (bean name)                          │  │
│   │  2. 提取函数描述                                      │  │
│   │  3. 从 Request 类型推断参数 Schema                    │  │
│   │  4. 注册到 FunctionCallbackRegistry                   │  │
│   └─────────────────────────────────────────────────────┘  │
│         │                                                   │
│         ▼                                                   │
│   函数可在 ChatClient 中通过名称调用                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 自定义工具开发

### 复杂工具示例

```java
@Configuration
public class AdvancedToolsConfig {
    
    // 数据库查询工具
    @Bean
    @Description("""
            执行数据库查询并返回结果。
            支持的表：users, orders, products。
            只能执行 SELECT 查询。
            """)
    public Function<QueryRequest, QueryResponse> databaseQueryTool(
            JdbcTemplate jdbcTemplate) {
        return request -> {
            // 安全检查
            if (!request.sql().toUpperCase().startsWith("SELECT")) {
                return new QueryResponse(false, "只允许 SELECT 查询", List.of());
            }
            
            try {
                List<Map<String, Object>> results = jdbcTemplate
                        .queryForList(request.sql());
                return new QueryResponse(true, "查询成功", results);
            } catch (Exception e) {
                return new QueryResponse(false, e.getMessage(), List.of());
            }
        };
    }
    
    // HTTP 请求工具
    @Bean
    @Description("发送 HTTP 请求获取外部 API 数据")
    public Function<HttpRequest, HttpResponse> httpRequestTool(
            RestTemplate restTemplate) {
        return request -> {
            try {
                ResponseEntity<String> response = restTemplate.exchange(
                        request.url(),
                        request.method(),
                        new HttpEntity<>(request.body(), request.headers()),
                        String.class
                );
                return new HttpResponse(
                        true,
                        response.getStatusCode().value(),
                        response.getBody()
                );
            } catch (Exception e) {
                return new HttpResponse(false, 500, e.getMessage());
            }
        };
    }
    
    // 文件操作工具
    @Bean
    @Description("读取指定路径的文件内容")
    public Function<FileRequest, FileResponse> fileReadTool() {
        return request -> {
            try {
                Path path = Path.of(request.path());
                
                // 安全检查：防止路径遍历攻击
                if (!path.normalize().startsWith(request.allowedBasePath())) {
                    return new FileResponse(false, "路径不在允许范围内", null);
                }
                
                String content = Files.readString(path);
                return new FileResponse(true, "读取成功", content);
            } catch (Exception e) {
                return new FileResponse(false, e.getMessage(), null);
            }
        };
    }
}

record QueryRequest(String sql) {}
record QueryResponse(boolean success, String message, List<Map<String, Object>> data) {}

record HttpRequest(String url, HttpMethod method, String body, Map<String, String> headers) {}
record HttpResponse(boolean success, int statusCode, String body) {}

record FileRequest(String path, String allowedBasePath) {}
record FileResponse(boolean success, String message, String content) {}
```

### 工具上下文传递

```java
@Configuration
public class ContextualToolsConfig {
    
    // 需要用户上下文的工具
    @Bean
    @Description("查询当前用户的订单历史")
    public Function<OrderHistoryRequest, OrderHistoryResponse> orderHistoryTool(
            OrderService orderService) {
        return request -> {
            // 从工具上下文获取用户ID
            String userId = ToolContext.getCurrentUserId();
            return orderService.getOrderHistory(userId, request.limit());
        };
    }
    
    // 需要权限检查的工具
    @Bean
    @Description("执行系统管理操作")
    public Function<AdminRequest, AdminResponse> adminTool(
            AdminService adminService) {
        return request -> {
            // 权限检查
            if (!ToolContext.hasRole("ADMIN")) {
                return new AdminResponse(false, "权限不足");
            }
            
            return adminService.execute(request.action(), request.params());
        };
    }
}
```

## 多函数调用

### 并行调用

```java
@Service
public class ParallelToolService {
    
    private final ChatClient chatClient;
    
    public ParallelToolService(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultFunctions("weatherFunction", "stockFunction", "newsFunction")
                .build();
    }
    
    public String comprehensiveAnalysis(String query) {
        // LLM 可能会并行调用多个函数
        return chatClient.prompt()
                .user("""
                        分析以下信息：
                        1. 北京的天气情况
                        2. 阿里巴巴股票价格
                        3. 今日科技新闻
                        
                        综合分析后给出投资建议。
                        """)
                .call()
                .content();
    }
}
```

### 函数链式调用

```java
@Service
public class ChainedToolService {
    
    private final ChatClient chatClient;
    
    public ChainedToolService(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultFunctions(
                        "searchProducts",
                        "getProductDetails",
                        "addToCart",
                        "checkout"
                )
                .build();
    }
    
    public String shoppingAssistant(String request) {
        // LLM 会根据需要链式调用多个函数
        return chatClient.prompt()
                .system("""
                        你是一个购物助手。
                        帮助用户搜索商品、查看详情、添加购物车并完成购买。
                        每一步都要确认用户意图。
                        """)
                .user(request)
                .call()
                .content();
    }
}
```

## 实战案例

### 智能客服系统

```java
@Configuration
public class CustomerServiceTools {
    
    @Bean
    @Description("查询用户订单状态")
    public Function<OrderStatusRequest, OrderStatusResponse> orderStatusTool(
            OrderRepository orderRepository) {
        return request -> {
            Order order = orderRepository.findByOrderNo(request.orderNo());
            if (order == null) {
                return new OrderStatusResponse(false, "订单不存在", null);
            }
            return new OrderStatusResponse(true, "查询成功", order);
        };
    }
    
    @Bean
    @Description("创建售后服务工单")
    public Function<CreateTicketRequest, CreateTicketResponse> createTicketTool(
            TicketService ticketService) {
        return request -> {
            Ticket ticket = ticketService.createTicket(
                    request.orderNo(),
                    request.type(),
                    request.description(),
                    ToolContext.getCurrentUserId()
            );
            return new CreateTicketResponse(true, ticket.getId());
        };
    }
    
    @Bean
    @Description("查询物流信息")
    public Function<LogisticsRequest, LogisticsResponse> logisticsTool(
            LogisticsService logisticsService) {
        return request -> {
            LogisticsInfo info = logisticsService.track(request.trackingNo());
            return new LogisticsResponse(true, info);
        };
    }
    
    @Bean
    @Description("转接人工客服")
    public Function<TransferRequest, TransferResponse> transferTool() {
        return request -> {
            // 创建转接记录
            String sessionId = ToolContext.getSessionId();
            // 通知人工客服系统
            return new TransferResponse(true, sessionId, request.department());
        };
    }
}

@Service
public class CustomerServiceBot {
    
    private final ChatClient chatClient;
    
    public CustomerServiceBot(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        你是客服助手，帮助用户处理订单查询、售后问题等。
                        
                        工作流程：
                        1. 理解用户问题
                        2. 调用相应工具获取信息
                        3. 给出解决方案
                        4. 必要时转接人工
                        
                        注意事项：
                        - 保持友好专业
                        - 准确记录问题
                        - 无法解决时及时转接
                        """)
                .defaultFunctions(
                        "orderStatusTool",
                        "createTicketTool",
                        "logisticsTool",
                        "transferTool"
                )
                .build();
    }
    
    public String handle(String message, String sessionId, String userId) {
        return chatClient.prompt()
                .user(message)
                .advisors(advisor -> advisor
                        .param("sessionId", sessionId)
                        .param("userId", userId))
                .call()
                .content();
    }
}
```

### 数据分析助手

```java
@Configuration
public class DataAnalysisTools {
    
    @Bean
    @Description("执行 SQL 查询分析数据")
    public Function<SqlQueryRequest, SqlQueryResponse> sqlQueryTool(
            DataSource dataSource) {
        return request -> {
            // 安全检查
            if (containsDangerousOperations(request.sql())) {
                return new SqlQueryResponse(false, "SQL 包含危险操作", null);
            }
            
            try (Connection conn = dataSource.getConnection();
                 Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery(request.sql())) {
                
                List<Map<String, Object>> results = resultSetToList(rs);
                return new SqlQueryResponse(true, null, results);
            } catch (SQLException e) {
                return new SqlQueryResponse(false, e.getMessage(), null);
            }
        };
    }
    
    @Bean
    @Description("生成数据可视化图表")
    public Function<ChartRequest, ChartResponse> chartTool(
            ChartService chartService) {
        return request -> {
            String chartUrl = chartService.generateChart(
                    request.chartType(),
                    request.data(),
                    request.options()
            );
            return new ChartResponse(true, chartUrl);
        };
    }
    
    @Bean
    @Description("导出数据报告")
    public Function<ExportRequest, ExportResponse> exportTool(
            ReportService reportService) {
        return request -> {
            String reportUrl = reportService.generateReport(
                    request.format(),
                    request.data(),
                    request.template()
            );
            return new ExportResponse(true, reportUrl);
        };
    }
}

@Service
public class DataAnalysisAssistant {
    
    private final ChatClient chatClient;
    
    public DataAnalysisAssistant(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        你是数据分析助手。
                        帮助用户查询数据、生成图表、导出报告。
                        
                        分析流程：
                        1. 理解用户的数据需求
                        2. 构建合适的 SQL 查询
                        3. 生成可视化图表
                        4. 提供数据洞察
                        """)
                .defaultFunctions("sqlQueryTool", "chartTool", "exportTool")
                .build();
    }
    
    public String analyze(String query) {
        return chatClient.prompt()
                .user(query)
                .call()
                .content();
    }
}
```

## 工具执行控制

### 手动执行模式

```java
@Service
public class ManualExecutionService {
    
    private final ChatModel chatModel;
    private final FunctionCallbackRegistry functionRegistry;
    
    public ChatResponse processWithManualExecution(String message) {
        // 1. 发送请求，获取函数调用建议
        ChatResponse response = chatModel.call(new Prompt(
                message,
                OpenAiChatOptions.builder()
                        .withFunctions(functionRegistry.getFunctionNames())
                        .build()
        ));
        
        // 2. 检查是否需要调用函数
        AssistantMessage assistantMessage = response.getResult().getOutput();
        
        if (assistantMessage.getToolCalls() != null 
                && !assistantMessage.getToolCalls().isEmpty()) {
            
            // 3. 手动执行函数
            List<ToolResponseMessage> toolResponses = new ArrayList<>();
            
            for (ToolCall toolCall : assistantMessage.getToolCalls()) {
                // 权限检查
                if (!isAllowed(toolCall.name())) {
                    toolResponses.add(new ToolResponseMessage(
                            toolCall.id(),
                            toolCall.name(),
                            "Permission denied"
                    ));
                    continue;
                }
                
                // 执行函数
                FunctionCallback function = functionRegistry.getFunction(toolCall.name());
                String result = function.call(toolCall.arguments());
                
                toolResponses.add(new ToolResponseMessage(
                        toolCall.id(),
                        toolCall.name(),
                        result
                ));
            }
            
            // 4. 发送函数结果，获取最终响应
            return chatModel.call(new Prompt(
                    List.of(
                            new UserMessage(message),
                            assistantMessage,
                            toolResponses.get(0)
                    )
            ));
        }
        
        return response;
    }
}
```

### 超时与重试

```java
@Configuration
public class ResilientToolsConfig {
    
    @Bean
    @Description("调用外部 API（带超时和重试）")
    public Function<ApiRequest, ApiResponse> resilientApiTool(
            RestTemplate restTemplate) {
        return request -> {
            int maxRetries = 3;
            int timeout = 5000;  // 5秒超时
            
            for (int i = 0; i < maxRetries; i++) {
                try {
                    // 设置超时
                    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
                    factory.setConnectTimeout(timeout);
                    factory.setReadTimeout(timeout);
                    
                    ResponseEntity<String> response = restTemplate.exchange(
                            request.url(),
                            HttpMethod.valueOf(request.method()),
                            new HttpEntity<>(request.body()),
                            String.class
                    );
                    
                    return new ApiResponse(true, response.getBody(), null);
                    
                } catch (ResourceAccessException e) {
                    if (i == maxRetries - 1) {
                        return new ApiResponse(false, null, "请求超时");
                    }
                    // 等待后重试
                    try {
                        Thread.sleep(1000 * (i + 1));
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                } catch (Exception e) {
                    return new ApiResponse(false, null, e.getMessage());
                }
            }
            
            return new ApiResponse(false, null, "未知错误");
        };
    }
}
```

## 小结

本章我们学习了：

1. **Function Calling 原理**：工作流程、支持的模型
2. **Spring AI Tools API**：三种注册方式、自动注册
3. **自定义工具开发**：复杂工具、上下文传递
4. **多函数调用**：并行调用、链式调用
5. **实战案例**：智能客服、数据分析助手
6. **执行控制**：手动执行、超时重试

## 练习

1. **天气查询工具**：实现一个多城市天气对比的工具
2. **数据库助手**：构建一个安全的 SQL 查询助手
3. **邮件发送工具**：实现带模板的邮件发送功能
4. **多工具协作**：让多个工具协同完成复杂任务

## 下一章预告

在下一章《可观测性与生产部署》中，我们将探讨：

- Spring AI 可观测性架构
- Metrics 监控配置
- 分布式追踪集成
- 生产环境最佳实践

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
