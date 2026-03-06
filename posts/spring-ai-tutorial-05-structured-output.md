---
title: "Spring AI 实战教程（五）：结构化输出处理"
date: "2025-08-15"
excerpt: "深入掌握 Spring AI 的结构化输出功能，实现 LLM 输出到 Java POJO 的自动映射，构建可靠的数据提取流水线。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 5
---

# Spring AI 实战教程（五）：结构化输出处理

## 前言

LLM 默认输出的是非结构化文本，但在企业应用中，我们往往需要将输出映射为结构化数据。Spring AI 提供了强大的结构化输出功能，可以将 LLM 的响应自动转换为 Java 对象，大大简化了数据提取和处理的工作。

## 结构化输出概述

### 为什么需要结构化输出？

```
┌─────────────────────────────────────────────────────────────┐
│                    结构化输出需求场景                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 数据提取                                                │
│     从非结构化文本中提取结构化信息                           │
│     例：从简历提取姓名、技能、经验等                         │
│                                                             │
│  2. 表单填写                                                │
│     自动生成符合特定格式的数据                               │
│     例：生成用户注册表单数据                                 │
│                                                             │
│  3. API 响应                                                │
│     构建可靠的 API 接口                                      │
│     例：返回 JSON 格式的分析结果                             │
│                                                             │
│  4. 数据库存储                                              │
│     直接映射到数据库实体                                     │
│     例：提取产品信息存入数据库                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Spring AI 支持的方式

```
┌─────────────────────────────────────────────────────────────┐
│                  结构化输出方式对比                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. entity() 方法                                           │
│     • 最简单直接                                            │
│     • 自动生成 Prompt                                       │
│     • 支持 Record 和 POJO                                   │
│                                                             │
│  2. BeanOutputConverter                                     │
│     • 更灵活的控制                                          │
│     • 自定义格式说明                                        │
│     • 支持集合类型                                          │
│                                                             │
│  3. JSON Mode (OpenAI)                                      │
│     • 强制 JSON 输出                                        │
│     • 更高可靠性                                            │
│     • 模型特定功能                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 基本使用

### 简单 POJO 映射

```java
// 定义输出结构 (Java Record)
record PersonInfo(
    String name,
    int age,
    String email,
    List<String> skills
) {}

@Service
public class ExtractionService {
    
    private final ChatClient chatClient;
    
    public ExtractionService(ChatModel chatModel) {
        this.chatClient = ChatClient.create(chatModel);
    }
    
    public PersonInfo extractPersonInfo(String text) {
        return chatClient.prompt()
                .user(u -> u.text("""
                        从以下文本中提取人员信息：
                        
                        {text}
                        """)
                        .param("text", text))
                .call()
                .entity(PersonInfo.class);
    }
}

// 使用示例
String text = """
        张三是一名28岁的软件工程师，邮箱是zhangsan@example.com。
        他精通Java、Python和Go语言。
        """;

PersonInfo info = service.extractPersonInfo(text);
// info.name() = "张三"
// info.age() = 28
// info.email() = "zhangsan@example.com"
// info.skills() = ["Java", "Python", "Go"]
```

### 嵌套结构

```java
// 嵌套结构定义
record Address(
    String city,
    String street,
    String zipCode
) {}

record Company(
    String name,
    Address address,
    List<String> departments
) {}

record Employee(
    String name,
    String position,
    Company company,
    double salary
) {}

@Service
public class NestedExtractionService {
    
    private final ChatClient chatClient;
    
    public Employee extractEmployee(String description) {
        return chatClient.prompt()
                .user(u -> u.text("""
                        提取以下描述中的员工信息：
                        
                        {description}
                        """)
                        .param("description", description))
                .call()
                .entity(Employee.class);
    }
}

// 使用
String description = """
        李四是一名高级架构师，月薪50000元。
        他就职于科技有限公司，公司位于北京市海淀区中关村大街1号，邮编100080。
        公司有研发部、产品部、运营部三个部门。
        """;

Employee employee = service.extractEmployee(description);
// employee.name() = "李四"
// employee.position() = "高级架构师"
// employee.company().name() = "科技有限公司"
// employee.company().address().city() = "北京市"
```

### 集合类型

```java
// 列表输出
record Book(
    String title,
    String author,
    int year
) {}

@Service
public class BookExtractionService {
    
    private final ChatClient chatClient;
    
    public List<Book> extractBooks(String text) {
        return chatClient.prompt()
                .user(u -> u.text("""
                        从以下文本中提取所有书籍信息：
                        
                        {text}
                        
                        返回书籍列表。
                        """)
                        .param("text", text))
                .call()
                .entity(new ParameterizedTypeReference<List<Book>>() {});
    }
}

// 使用
String text = """
        推荐几本好书：
        1. 《Java编程思想》by Bruce Eckel, 2007
        2. 《Effective Java》by Joshua Bloch, 2018
        3. 《深入理解Java虚拟机》by 周志明, 2019
        """;

List<Book> books = service.extractBooks(text);
// books.size() = 3
// books.get(0).title() = "Java编程思想"
```

## BeanOutputConverter

### 基本用法

```java
import org.springframework.ai.converter.BeanOutputConverter;

@Service
public class ConverterService {
    
    private final ChatModel chatModel;
    
    public PersonInfo extractWithConverter(String text) {
        // 创建转换器
        BeanOutputConverter<PersonInfo> converter = 
                new BeanOutputConverter<>(PersonInfo.class);
        
        // 获取格式说明（会添加到 Prompt 中）
        String format = converter.getFormat();
        
        String prompt = """
                从以下文本中提取人员信息。
                
                %s
                
                文本：
                %s
                """.formatted(format, text);
        
        // 调用模型
        String response = chatModel.call(new Prompt(prompt))
                .getResult()
                .getOutput()
                .getText();
        
        // 转换为对象
        return converter.convert(response);
    }
}
```

### 自定义格式说明

```java
public PersonInfo extractWithCustomFormat(String text) {
    BeanOutputConverter<PersonInfo> converter = 
            new BeanOutputConverter<>(PersonInfo.class);
    
    // 自定义格式说明
    String customFormat = """
            请以以下 JSON 格式返回结果：
            {
                "name": "姓名（字符串）",
                "age": 年龄（整数）,
                "email": "邮箱地址",
                "skills": ["技能1", "技能2", ...]
            }
            
            确保返回有效的 JSON 格式。
            """;
    
    String prompt = customFormat + "\n\n文本：" + text;
    
    String response = chatModel.call(new Prompt(prompt))
            .getResult()
            .getOutput()
            .getText();
    
    return converter.convert(response);
}
```

### 列表转换

```java
public List<Book> extractBookList(String text) {
    BeanOutputConverter<List<Book>> converter = 
            new BeanOutputConverter<>(
                    new ParameterizedTypeReference<List<Book>>() {}
            );
    
    String prompt = """
            从文本中提取书籍信息列表。
            
            %s
            
            文本：%s
            """.formatted(converter.getFormat(), text);
    
    String response = chatModel.call(new Prompt(prompt))
            .getResult()
            .getOutput()
            .getText();
    
    return converter.convert(response);
}
```

## JSON Schema 支持

### 使用 JsonSchema

```java
import org.springframework.ai.model.JsonSchema;

@Service
public class SchemaService {
    
    private final ChatClient chatClient;
    
    public Product extractProduct(String description) {
        // 定义 JSON Schema
        String schema = """
                {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "产品名称"
                        },
                        "price": {
                            "type": "number",
                            "description": "产品价格"
                        },
                        "category": {
                            "type": "string",
                            "enum": ["电子产品", "服装", "食品", "其他"],
                            "description": "产品类别"
                        },
                        "inStock": {
                            "type": "boolean",
                            "description": "是否有库存"
                        }
                    },
                    "required": ["name", "price"]
                }
                """;
        
        return chatClient.prompt()
                .user(u -> u.text("""
                        根据以下描述提取产品信息：
                        
                        {description}
                        """)
                        .param("description", description))
                .options(OpenAiChatOptions.builder()
                        .withResponseFormat(new ResponseFormat(
                                "json_schema",
                                Map.of("schema", schema)
                        ))
                        .build())
                .call()
                .entity(Product.class);
    }
}
```

### 自动生成 Schema

```java
@Component
public class SchemaGenerator {
    
    public String generateSchema(Class<?> clazz) {
        // Spring AI 可以自动从类生成 Schema
        return JsonSchema.from(clazz).toJson();
    }
}

// 使用
record Order(
    String orderId,
    List<OrderItem> items,
    double totalAmount,
    Address shippingAddress
) {}

String schema = schemaGenerator.generateSchema(Order.class);
```

## 枚举类型处理

```java
// 定义枚举
enum Priority {
    HIGH, MEDIUM, LOW
}

enum Status {
    PENDING, IN_PROGRESS, COMPLETED, CANCELLED
}

record Task(
    String title,
    String description,
    Priority priority,
    Status status,
    LocalDateTime dueDate
) {}

@Service
public class TaskExtractionService {
    
    private final ChatClient chatClient;
    
    public Task extractTask(String text) {
        return chatClient.prompt()
                .user(u -> u.text("""
                        从以下文本中提取任务信息。
                        优先级可选值：HIGH, MEDIUM, LOW
                        状态可选值：PENDING, IN_PROGRESS, COMPLETED, CANCELLED
                        
                        文本：{text}
                        """)
                        .param("text", text))
                .call()
                .entity(Task.class);
    }
}

// 使用
String text = "明天下午3点前完成项目报告，这是高优先级任务，目前正在进行中";
Task task = service.extractTask(text);
// task.priority() = Priority.HIGH
// task.status() = Status.IN_PROGRESS
```

## 日期时间处理

```java
record Event(
    String name,
    LocalDateTime startTime,
    LocalDateTime endTime,
    Duration duration
) {}

@Service
public class EventExtractionService {
    
    private final ChatClient chatClient;
    
    public Event extractEvent(String text) {
        return chatClient.prompt()
                .user(u -> u.text("""
                        从文本中提取事件信息。
                        日期时间格式：yyyy-MM-dd HH:mm
                        
                        文本：{text}
                        """)
                        .param("text", text))
                .call()
                .entity(Event.class);
    }
}
```

## 实战案例

### 简历解析

```java
record Education(
    String school,
    String degree,
    String major,
    int startYear,
    int endYear
) {}

record WorkExperience(
    String company,
    String position,
    List<String> responsibilities,
    int startYear,
    int endYear
) {}

record Resume(
    String name,
    String email,
    String phone,
    List<String> skills,
    List<Education> education,
    List<WorkExperience> experience,
    String summary
) {}

@Service
public class ResumeParserService {
    
    private final ChatClient chatClient;
    
    public Resume parseResume(String resumeText) {
        return chatClient.prompt()
                .system("""
                        你是一个专业的简历解析助手。
                        请从简历文本中提取结构化信息。
                        如果某些信息缺失，对应字段设为 null。
                        """)
                .user(u -> u.text("""
                        解析以下简历：
                        
                        {resume}
                        """)
                        .param("resume", resumeText))
                .call()
                .entity(Resume.class);
    }
}
```

### 订单信息提取

```java
record OrderItem(
    String productName,
    int quantity,
    double unitPrice,
    double subtotal
) {}

record ShippingInfo(
    String recipient,
    String phone,
    String address,
    String city,
    String zipCode
) {}

record Order(
    String orderId,
    List<OrderItem> items,
    double subtotal,
    double shippingFee,
    double tax,
    double total,
    ShippingInfo shipping,
    String paymentMethod
) {}

@Service
public class OrderExtractionService {
    
    private final ChatClient chatClient;
    
    public Order extractOrder(String orderText) {
        return chatClient.prompt()
                .system("""
                        你是一个订单信息提取助手。
                        请准确提取订单中的所有信息，包括商品明细、金额计算和收货信息。
                        金额需要保留两位小数。
                        """)
                .user(u -> u.text("提取订单信息：\n{order}")
                        .param("order", orderText))
                .call()
                .entity(Order.class);
    }
}
```

### 数据分析报告

```java
record Metric(
    String name,
    double value,
    String unit,
    double changePercent
) {}

record ChartData(
    String title,
    String type,  // "line", "bar", "pie"
    List<String> labels,
    List<Double> values
) {}

record AnalysisReport(
    String summary,
    List<Metric> metrics,
    List<ChartData> charts,
    List<String> insights,
    List<String> recommendations
) {}

@Service
public class ReportGenerationService {
    
    private final ChatClient chatClient;
    
    public AnalysisReport generateReport(String dataDescription) {
        return chatClient.prompt()
                .system("""
                        你是一个数据分析专家。
                        根据提供的数据描述，生成结构化的分析报告。
                        包含关键指标、可视化建议和业务洞察。
                        """)
                .user(u -> u.text("""
                        分析以下数据：
                        
                        {data}
                        """)
                        .param("data", dataDescription))
                .call()
                .entity(AnalysisReport.class);
    }
}
```

## 错误处理与验证

### 处理转换失败

```java
@Service
public class SafeExtractionService {
    
    private final ChatClient chatClient;
    private final ObjectMapper objectMapper;
    
    public <T> Optional<T> safeExtract(String text, Class<T> clazz) {
        try {
            T result = chatClient.prompt()
                    .user(u -> u.text("提取信息：{text}").param("text", text))
                    .call()
                    .entity(clazz);
            return Optional.ofNullable(result);
        } catch (Exception e) {
            log.error("Failed to extract {} from text", clazz.getSimpleName(), e);
            return Optional.empty();
        }
    }
    
    // 带重试
    public <T> T extractWithRetry(String text, Class<T> clazz, int maxRetries) {
        Exception lastException = null;
        
        for (int i = 0; i < maxRetries; i++) {
            try {
                return chatClient.prompt()
                        .user(u -> u.text("提取信息：{text}").param("text", text))
                        .call()
                        .entity(clazz);
            } catch (Exception e) {
                lastException = e;
                log.warn("Extraction attempt {} failed", i + 1, e);
            }
        }
        
        throw new ExtractionException("Failed after " + maxRetries + " attempts", lastException);
    }
}
```

### 数据验证

```java
import jakarta.validation.constraints.*;

record ValidatedPerson(
    @NotBlank(message = "姓名不能为空")
    String name,
    
    @Min(value = 0, message = "年龄不能为负数")
    @Max(value = 150, message = "年龄不合理")
    int age,
    
    @Email(message = "邮箱格式不正确")
    String email,
    
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    String phone
) {}

@Service
public class ValidatedExtractionService {
    
    private final ChatClient chatClient;
    private final Validator validator;
    
    public ValidatedPerson extractAndValidate(String text) {
        ValidatedPerson person = chatClient.prompt()
                .user(u -> u.text("提取人员信息：{text}").param("text", text))
                .call()
                .entity(ValidatedPerson.class);
        
        // 验证
        Set<ConstraintViolation<ValidatedPerson>> violations = validator.validate(person);
        
        if (!violations.isEmpty()) {
            String errors = violations.stream()
                    .map(ConstraintViolation::getMessage)
                    .collect(Collectors.joining(", "));
            throw new ValidationException("数据验证失败: " + errors);
        }
        
        return person;
    }
}
```

## 性能优化

### 缓存结构化输出

```java
@Service
public class CachedExtractionService {
    
    private final ChatClient chatClient;
    private final Cache<String, Object> cache;
    
    @Cacheable(value = "extractions", key = "#text.hashCode()")
    public <T> T extractCached(String text, Class<T> clazz) {
        return chatClient.prompt()
                .user(u -> u.text("提取信息：{text}").param("text", text))
                .call()
                .entity(clazz);
    }
}
```

### 批量处理

```java
@Service
public class BatchExtractionService {
    
    private final ChatClient chatClient;
    
    public <T> List<T> batchExtract(List<String> texts, Class<T> clazz) {
        return texts.parallelStream()
                .map(text -> chatClient.prompt()
                        .user(u -> u.text("提取信息：{text}").param("text", text))
                        .call()
                        .entity(clazz))
                .toList();
    }
    
    // 合并处理（减少 API 调用）
    public List<PersonInfo> batchExtractOptimized(List<String> texts) {
        String combinedText = String.join("\n---\n", texts);
        
        return chatClient.prompt()
                .user(u -> u.text("""
                        从以下多段文本中分别提取人员信息，每段用---分隔。
                        返回人员信息列表。
                        
                        {texts}
                        """)
                        .param("texts", combinedText))
                .call()
                .entity(new ParameterizedTypeReference<List<PersonInfo>>() {});
    }
}
```

## 小结

本章我们学习了：

1. **结构化输出概述**：需求场景和 Spring AI 支持方式
2. **基本使用**：POJO 映射、嵌套结构、集合类型
3. **BeanOutputConverter**：自定义格式、列表转换
4. **JSON Schema**：手动定义、自动生成
5. **特殊类型处理**：枚举、日期时间
6. **实战案例**：简历解析、订单提取、报告生成
7. **错误处理**：异常处理、数据验证
8. **性能优化**：缓存、批量处理

## 练习

1. **构建简历解析器**：从非结构化简历文本中提取结构化信息
2. **产品信息提取**：从电商描述中提取产品规格参数
3. **新闻分类器**：提取新闻的关键信息并进行分类
4. **表单自动填充**：根据描述生成符合验证规则的表单数据

## 下一章预告

在下一章《Embedding 与向量存储》中，我们将探讨：

- 文本嵌入的原理与应用
- 向量数据库的选择与配置
- 相似度搜索实现
- 向量索引优化

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
