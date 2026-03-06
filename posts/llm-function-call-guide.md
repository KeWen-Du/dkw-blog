---
title: "LLM Function Calling：让大模型调用外部工具的完整指南"
date: "2026-03-06"
excerpt: "深入讲解 LLM Function Calling 的核心原理和实践方法，包括 OpenAI、Claude、Gemini 等主流模型的实现方式，工具定义规范，多轮对话工具调用，以及 Agent 架构设计。"
tags: ["LLM", "Function Calling", "Tool Use", "AI Agent", "OpenAI API"]
---

# LLM Function Calling：让大模型调用外部工具的完整指南

## 前言

Function Calling（函数调用）是大语言模型从"对话机器"进化为"行动机器"的关键能力。通过 Function Calling，LLM 能够调用外部 API、查询数据库、执行代码，真正实现与现实世界的交互。

本文将系统性地讲解 Function Calling 的核心原理：
- Function Calling 的工作机制
- 主流模型的实现差异
- 工具定义的最佳实践
- 多轮对话中的工具调用
- 基于 Function Calling 的 Agent 架构

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Function Calling 原理 | ⭐⭐⭐ | 高频考点 | ✅ |
| OpenAI Function Calling | ⭐⭐⭐ | 高频考点 | ✅ |
| Claude Tool Use | ⭐⭐⭐ | 进阶考点 | ✅ |
| 多工具编排 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Agent 架构设计 | ⭐⭐⭐⭐⭐ | 前沿技术 | ✅ |

## 面试考点

1. 什么是 Function Calling？它解决了什么问题？
2. Function Calling 的执行流程是怎样的？
3. OpenAI 和 Claude 的 Function Calling 有什么区别？
4. 如何处理工具调用失败的情况？
5. 如何设计一个支持多工具的 Agent 系统？

## 一、Function Calling 概述

### 1.1 为什么需要 Function Calling

**LLM 的原生限制**：

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM 的能力边界                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ 能做的：                                                 │
│  • 理解和生成自然语言                                        │
│  • 知识问答（基于训练数据）                                  │
│  • 推理和规划                                                │
│  • 代码生成                                                  │
│                                                             │
│  ❌ 不能做的：                                               │
│  • 获取实时信息（天气、股价、新闻）                          │
│  • 访问外部系统（数据库、API）                               │
│  • 执行实际操作（发送邮件、创建订单）                        │
│  • 进行精确计算（复杂运算）                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Function Calling 的价值**：

```
┌─────────────────────────────────────────────────────────────┐
│                 Function Calling 架构                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                     ┌─────────────┐                         │
│                     │   用户请求   │                         │
│                     └──────┬──────┘                         │
│                            │                                │
│                            ▼                                │
│                     ┌─────────────┐                         │
│                     │    LLM      │                         │
│                     │  (决策中心)  │                         │
│                     └──────┬──────┘                         │
│                            │                                │
│              ┌─────────────┼─────────────┐                  │
│              │             │             │                  │
│              ▼             ▼             ▼                  │
│        ┌─────────┐   ┌─────────┐   ┌─────────┐             │
│        │ 天气API │   │ 搜索API │   │ 数据库  │             │
│        └─────────┘   └─────────┘   └─────────┘             │
│                                                             │
│  LLM 不直接执行，而是决定"调用什么"和"参数是什么"            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Function Calling 的核心概念

**核心流程**：

```
第 1 步：注册工具
┌─────────────────────────────────────────┐
│ 定义工具名称、描述、参数 Schema          │
└─────────────────────────────────────────┘
                    ↓
第 2 步：发送请求
┌─────────────────────────────────────────┐
│ 用户输入 + 工具定义 → LLM                │
└─────────────────────────────────────────┘
                    ↓
第 3 步：LLM 决策
┌─────────────────────────────────────────┐
│ LLM 分析是否需要调用工具                 │
│ • 不需要 → 直接回答                      │
│ • 需要 → 返回工具调用请求                │
└─────────────────────────────────────────┘
                    ↓
第 4 步：执行工具
┌─────────────────────────────────────────┐
│ 应用层根据 LLM 返回的信息执行实际调用    │
└─────────────────────────────────────────┘
                    ↓
第 5 步：返回结果
┌─────────────────────────────────────────┐
│ 将工具执行结果返回给 LLM                 │
│ LLM 基于结果生成最终回复                 │
└─────────────────────────────────────────┘
```

### 1.3 关键特性

| 特性 | 说明 |
|------|------|
| **声明式** | 开发者定义工具，LLM 自动决定何时调用 |
| **安全** | LLM 不直接执行，由应用层控制执行 |
| **可组合** | 支持多工具编排，实现复杂任务 |
| **可控** | 开发者可以验证、修改、拒绝工具调用 |

## 二、OpenAI Function Calling

### 2.1 基本用法

**定义工具**：

```python
from openai import OpenAI

client = OpenAI()

# 定义工具
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的当前天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称，如：北京、上海"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "温度单位"
                    }
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "搜索互联网获取信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "返回结果数量",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }
    }
]
```

**调用模型**：

```python
def chat_with_tools(user_message: str):
    """使用工具的对话"""
    
    # 第一次调用
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "user", "content": user_message}
        ],
        tools=tools,
        tool_choice="auto"  # 自动决定是否调用工具
    )
    
    message = response.choices[0].message
    
    # 检查是否需要调用工具
    if message.tool_calls:
        # 执行工具调用
        tool_results = []
        
        for tool_call in message.tool_calls:
            function_name = tool_call.function.name
            arguments = json.loads(tool_call.function.arguments)
            
            # 执行对应的函数
            result = execute_tool(function_name, arguments)
            
            tool_results.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "content": json.dumps(result, ensure_ascii=False)
            })
        
        # 第二次调用，将工具结果返回给模型
        second_response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "user", "content": user_message},
                message,  # 模型的工具调用请求
                *tool_results  # 工具执行结果
            ]
        )
        
        return second_response.choices[0].message.content
    
    return message.content


def execute_tool(name: str, args: dict) -> dict:
    """执行工具"""
    if name == "get_weather":
        return get_weather(args["city"], args.get("unit", "celsius"))
    elif name == "search_web":
        return search_web(args["query"], args.get("num_results", 5))
    else:
        return {"error": f"Unknown tool: {name}"}


def get_weather(city: str, unit: str = "celsius") -> dict:
    """获取天气（模拟）"""
    # 实际应用中调用天气 API
    weather_data = {
        "北京": {"temp": 15, "condition": "晴"},
        "上海": {"temp": 20, "condition": "多云"},
        "广州": {"temp": 28, "condition": "晴"},
    }
    
    if city in weather_data:
        data = weather_data[city]
        if unit == "fahrenheit":
            data["temp"] = data["temp"] * 9/5 + 32
        return data
    return {"error": "城市未找到"}


def search_web(query: str, num_results: int = 5) -> dict:
    """搜索网页（模拟）"""
    # 实际应用中调用搜索 API
    return {
        "query": query,
        "results": [
            {"title": f"搜索结果 {i+1}", "snippet": f"关于 {query} 的内容..."}
            for i in range(num_results)
        ]
    }
```

### 2.2 完整的多轮对话实现

```python
import json
from typing import Callable
from openai import OpenAI

class OpenAIFunctionCaller:
    """OpenAI Function Calling 封装"""
    
    def __init__(self, model: str = "gpt-4o"):
        self.client = OpenAI()
        self.model = model
        self.tools: list[dict] = []
        self.tool_handlers: dict[str, Callable] = {}
        self.conversation_history: list[dict] = []
    
    def register_tool(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: Callable,
        required: list[str] = None
    ):
        """注册工具"""
        # 添加工具定义
        tool = {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters
            }
        }
        
        if required:
            tool["function"]["parameters"]["required"] = required
        
        self.tools.append(tool)
        self.tool_handlers[name] = handler
    
    def chat(self, user_message: str, max_tool_calls: int = 5) -> str:
        """
        处理用户消息
        
        Args:
            user_message: 用户输入
            max_tool_calls: 最大工具调用次数，防止无限循环
        """
        # 添加用户消息
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })
        
        tool_call_count = 0
        
        while tool_call_count < max_tool_calls:
            # 调用模型
            response = self.client.chat.completions.create(
                model=self.model,
                messages=self.conversation_history,
                tools=self.tools if self.tools else None,
                tool_choice="auto"
            )
            
            message = response.choices[0].message
            
            # 如果没有工具调用，返回结果
            if not message.tool_calls:
                self.conversation_history.append(message.model_dump())
                return message.content
            
            # 添加助手消息（包含工具调用）
            self.conversation_history.append(message.model_dump())
            
            # 处理工具调用
            for tool_call in message.tool_calls:
                tool_call_count += 1
                
                function_name = tool_call.function.name
                arguments = json.loads(tool_call.function.arguments)
                
                print(f"[工具调用] {function_name}({arguments})")
                
                # 执行工具
                try:
                    if function_name in self.tool_handlers:
                        result = self.tool_handlers[function_name](**arguments)
                    else:
                        result = {"error": f"未知工具: {function_name}"}
                except Exception as e:
                    result = {"error": str(e)}
                
                # 添加工具结果
                self.conversation_history.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })
        
        return "达到最大工具调用次数限制"
    
    def clear_history(self):
        """清空对话历史"""
        self.conversation_history = []


# 使用示例
if __name__ == "__main__":
    caller = OpenAIFunctionCaller()
    
    # 注册工具
    caller.register_tool(
        name="get_weather",
        description="获取指定城市的天气信息",
        parameters={
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "城市名称"
                }
            }
        },
        handler=lambda city: {"temp": 20, "condition": "晴"},
        required=["city"]
    )
    
    caller.register_tool(
        name="calculate",
        description="执行数学计算",
        parameters={
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "数学表达式，如：2+3*4"
                }
            }
        },
        handler=lambda expression: {"result": eval(expression)},
        required=["expression"]
    )
    
    # 对话
    response = caller.chat("北京今天天气怎么样？顺便帮我算一下 123 * 456")
    print(response)
```

### 2.3 tool_choice 参数详解

```python
# tool_choice 控制模型是否调用工具

# "auto" - 模型自动决定（默认）
response = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
    tool_choice="auto"
)

# "none" - 强制不使用工具
response = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
    tool_choice="none"
)

# "required" - 强制使用工具（必须调用至少一个）
response = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
    tool_choice="required"
)

# 指定特定工具 - 强制调用该工具
response = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
    tool_choice={"type": "function", "function": {"name": "get_weather"}}
)
```

### 2.4 并行工具调用

OpenAI 支持在一次响应中返回多个工具调用：

```python
def handle_parallel_tool_calls(message):
    """处理并行工具调用"""
    if not message.tool_calls:
        return []
    
    results = []
    
    # 并行执行所有工具调用
    import concurrent.futures
    
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = []
        for tool_call in message.tool_calls:
            future = executor.submit(
                execute_tool,
                tool_call.function.name,
                json.loads(tool_call.function.arguments)
            )
            futures.append((tool_call.id, future))
        
        for tool_call_id, future in futures:
            result = future.result()
            results.append({
                "tool_call_id": tool_call_id,
                "role": "tool",
                "content": json.dumps(result)
            })
    
    return results
```

## 三、Claude Tool Use

### 3.1 Claude 的工具使用方式

Claude 使用不同的 API 结构，但核心概念类似：

```python
from anthropic import Anthropic

client = Anthropic()

# 定义工具
tools = [
    {
        "name": "get_weather",
        "description": "获取指定城市的当前天气",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "城市名称"
                }
            },
            "required": ["city"]
        }
    }
]


def chat_with_claude(user_message: str):
    """使用 Claude 工具"""
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        tools=tools,
        messages=[
            {"role": "user", "content": user_message}
        ]
    )
    
    # 处理响应
    for block in response.content:
        if block.type == "text":
            print(block.text)
        
        elif block.type == "tool_use":
            # 执行工具
            tool_name = block.name
            tool_input = block.input
            
            print(f"[工具调用] {tool_name}({tool_input})")
            
            result = execute_tool(tool_name, tool_input)
            
            # 继续对话，返回工具结果
            continue_response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                tools=tools,
                messages=[
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": response.content},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps(result)
                            }
                        ]
                    }
                ]
            )
            
            return continue_response.content[0].text
    
    return response.content[0].text
```

### 3.2 Claude Tool Use 完整封装

```python
from anthropic import Anthropic
from typing import Callable
import json

class ClaudeToolCaller:
    """Claude Tool Use 封装"""
    
    def __init__(self, model: str = "claude-sonnet-4-20250514"):
        self.client = Anthropic()
        self.model = model
        self.tools: list[dict] = []
        self.tool_handlers: dict[str, Callable] = {}
        self.conversation_history: list[dict] = []
    
    def register_tool(
        self,
        name: str,
        description: str,
        input_schema: dict,
        handler: Callable
    ):
        """注册工具"""
        tool = {
            "name": name,
            "description": description,
            "input_schema": input_schema
        }
        self.tools.append(tool)
        self.tool_handlers[name] = handler
    
    def chat(self, user_message: str, max_iterations: int = 5) -> str:
        """处理对话"""
        
        # 添加用户消息
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })
        
        iteration = 0
        
        while iteration < max_iterations:
            iteration += 1
            
            # 调用 Claude
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                tools=self.tools if self.tools else None,
                messages=self.conversation_history
            )
            
            # 检查是否有工具调用
            tool_uses = [b for b in response.content if b.type == "tool_use"]
            
            if not tool_uses:
                # 没有工具调用，返回文本
                text_blocks = [b for b in response.content if b.type == "text"]
                if text_blocks:
                    return text_blocks[0].text
                return ""
            
            # 添加助手响应
            self.conversation_history.append({
                "role": "assistant",
                "content": response.content
            })
            
            # 执行工具并收集结果
            tool_results = []
            for tool_use in tool_uses:
                print(f"[工具调用] {tool_use.name}({tool_use.input})")
                
                try:
                    if tool_use.name in self.tool_handlers:
                        result = self.tool_handlers[tool_use.name](**tool_use.input)
                    else:
                        result = {"error": f"未知工具: {tool_use.name}"}
                except Exception as e:
                    result = {"error": str(e)}
                
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })
            
            # 添加工具结果
            self.conversation_history.append({
                "role": "user",
                "content": tool_results
            })
        
        return "达到最大迭代次数"


# 使用示例
if __name__ == "__main__":
    caller = ClaudeToolCaller()
    
    caller.register_tool(
        name="get_current_time",
        description="获取当前时间",
        input_schema={
            "type": "object",
            "properties": {
                "timezone": {
                    "type": "string",
                    "description": "时区，如 Asia/Shanghai"
                }
            }
        },
        handler=lambda timezone="Asia/Shanghai": {
            "time": "2026-03-06 10:30:00",
            "timezone": timezone
        }
    )
    
    response = caller.chat("现在几点了？")
    print(response)
```

### 3.3 OpenAI vs Claude 对比

| 特性 | OpenAI | Claude |
|------|--------|--------|
| 工具定义字段 | `parameters` | `input_schema` |
| 响应中工具调用 | `tool_calls` 数组 | `tool_use` content block |
| 工具结果格式 | `role: "tool"` 消息 | `tool_result` content block |
| 并行调用 | 支持 | 支持 |
| 强制调用 | `tool_choice: "required"` | 系统提示引导 |
| 强制特定工具 | `tool_choice: {function}` | 系统提示引导 |

## 四、工具定义最佳实践

### 4.1 清晰的工具描述

```python
# ❌ 差的描述
tools = [
    {
        "type": "function",
        "function": {
            "name": "search",
            "description": "搜索",
            "parameters": {
                "type": "object",
                "properties": {
                    "q": {"type": "string"}
                }
            }
        }
    }
]

# ✅ 好的描述
tools = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": (
                "在商品数据库中搜索产品。"
                "当用户询问产品信息、价格、库存时使用此工具。"
                "支持按名称、类别、品牌进行搜索。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "搜索关键词，可以是产品名称、品牌或类别。"
                            "例如：'iPhone 15'、'运动鞋'、'耐克'"
                        )
                    },
                    "category": {
                        "type": "string",
                        "enum": ["电子产品", "服装", "食品", "家居"],
                        "description": "产品类别，可选"
                    },
                    "price_range": {
                        "type": "object",
                        "properties": {
                            "min": {"type": "number", "description": "最低价格"},
                            "max": {"type": "number", "description": "最高价格"}
                        },
                        "description": "价格范围，可选"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回结果数量限制，默认 10",
                        "default": 10
                    }
                },
                "required": ["query"]
            }
        }
    }
]
```

### 4.2 参数验证

```python
from pydantic import BaseModel, Field, validator
from typing import Optional
from enum import Enum

class CategoryEnum(str, Enum):
    ELECTRONICS = "电子产品"
    CLOTHING = "服装"
    FOOD = "食品"
    HOME = "家居"

class PriceRange(BaseModel):
    min: Optional[float] = Field(None, ge=0, description="最低价格")
    max: Optional[float] = Field(None, ge=0, description="最高价格")
    
    @validator('max')
    def max_greater_than_min(cls, v, values):
        if 'min' in values and v is not None and values['min'] is not None:
            if v < values['min']:
                raise ValueError('max 必须大于等于 min')
        return v

class SearchProductsInput(BaseModel):
    """搜索产品的输入参数"""
    query: str = Field(..., min_length=1, max_length=100, description="搜索关键词")
    category: Optional[CategoryEnum] = Field(None, description="产品类别")
    price_range: Optional[PriceRange] = Field(None, description="价格范围")
    limit: int = Field(10, ge=1, le=100, description="返回结果数量")


def search_products_with_validation(arguments: dict) -> dict:
    """带参数验证的工具执行"""
    try:
        # 验证参数
        input_data = SearchProductsInput(**arguments)
        
        # 执行搜索
        return do_search(
            query=input_data.query,
            category=input_data.category,
            price_range=input_data.price_range,
            limit=input_data.limit
        )
    except Exception as e:
        return {"error": f"参数验证失败: {str(e)}"}
```

### 4.3 错误处理

```python
class ToolExecutionError(Exception):
    """工具执行错误"""
    def __init__(self, tool_name: str, message: str, retryable: bool = False):
        self.tool_name = tool_name
        self.message = message
        self.retryable = retryable
        super().__init__(message)


def execute_tool_safely(
    name: str,
    arguments: dict,
    max_retries: int = 2
) -> dict:
    """安全的工具执行，带重试机制"""
    
    for attempt in range(max_retries + 1):
        try:
            if name not in TOOL_HANDLERS:
                return {
                    "success": False,
                    "error": f"未知工具: {name}",
                    "suggestion": "请检查工具名称是否正确"
                }
            
            result = TOOL_HANDLERS[name](**arguments)
            return {"success": True, "data": result}
        
        except ToolExecutionError as e:
            if e.retryable and attempt < max_retries:
                print(f"[重试] {name}, 第 {attempt + 1} 次")
                continue
            return {
                "success": False,
                "error": e.message,
                "retryable": e.retryable
            }
        
        except Exception as e:
            return {
                "success": False,
                "error": f"工具执行异常: {str(e)}",
                "retryable": False
            }
```

### 4.4 工具权限控制

```python
from dataclasses import dataclass
from typing import Set
from enum import Enum

class Permission(Enum):
    """工具权限"""
    READ = "read"           # 只读操作
    WRITE = "write"         # 写入操作
    EXECUTE = "execute"     # 执行操作
    ADMIN = "admin"         # 管理权限


@dataclass
class ToolMetadata:
    """工具元数据"""
    name: str
    description: str
    parameters: dict
    handler: callable
    required_permissions: Set[Permission]
    requires_confirmation: bool = False  # 是否需要用户确认
    rate_limit: int = 0  # 每分钟调用限制，0 表示无限制


class ToolRegistry:
    """工具注册中心，支持权限控制"""
    
    def __init__(self):
        self.tools: dict[str, ToolMetadata] = {}
        self.user_permissions: dict[str, Set[Permission]] = {}
        self.call_counts: dict[str, dict[str, int]] = {}  # user_id -> tool_name -> count
    
    def register(self, metadata: ToolMetadata):
        """注册工具"""
        self.tools[metadata.name] = metadata
    
    def set_user_permissions(self, user_id: str, permissions: Set[Permission]):
        """设置用户权限"""
        self.user_permissions[user_id] = permissions
    
    def can_execute(self, user_id: str, tool_name: str) -> tuple[bool, str]:
        """检查是否可以执行工具"""
        if tool_name not in self.tools:
            return False, f"工具 {tool_name} 不存在"
        
        tool = self.tools[tool_name]
        user_perms = self.user_permissions.get(user_id, set())
        
        # 检查权限
        if not tool.required_permissions.issubset(user_perms):
            missing = tool.required_permissions - user_perms
            return False, f"缺少权限: {missing}"
        
        # 检查频率限制
        if tool.rate_limit > 0:
            count = self.call_counts.get(user_id, {}).get(tool_name, 0)
            if count >= tool.rate_limit:
                return False, "已达到调用频率限制"
        
        return True, ""
    
    def execute(self, user_id: str, tool_name: str, arguments: dict) -> dict:
        """执行工具（带权限检查）"""
        can_run, reason = self.can_execute(user_id, tool_name)
        
        if not can_run:
            return {"error": reason, "permission_denied": True}
        
        tool = self.tools[tool_name]
        
        # 需要确认的操作
        if tool.requires_confirmation:
            return {
                "requires_confirmation": True,
                "tool_name": tool_name,
                "arguments": arguments,
                "message": f"此操作需要确认: {tool_name}"
            }
        
        # 更新调用计数
        if user_id not in self.call_counts:
            self.call_counts[user_id] = {}
        self.call_counts[user_id][tool_name] = self.call_counts[user_id].get(tool_name, 0) + 1
        
        # 执行
        try:
            result = tool.handler(**arguments)
            return {"success": True, "data": result}
        except Exception as e:
            return {"error": str(e)}


# 使用示例
registry = ToolRegistry()

# 注册需要写权限的工具
registry.register(ToolMetadata(
    name="delete_file",
    description="删除文件",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "文件路径"}
        },
        "required": ["path"]
    },
    handler=lambda path: {"deleted": path},
    required_permissions={Permission.WRITE},
    requires_confirmation=True  # 删除操作需要确认
))

# 设置用户权限
registry.set_user_permissions("user_123", {Permission.READ, Permission.WRITE})
```

## 五、多工具编排

### 5.1 工具选择策略

```python
from typing import Literal

class ToolSelectionStrategy:
    """工具选择策略"""
    
    @staticmethod
    def by_relevance(query: str, tools: list[dict]) -> list[dict]:
        """基于相关性选择工具"""
        # 使用嵌入模型计算相关性
        # 简化示例：关键词匹配
        relevant_tools = []
        query_lower = query.lower()
        
        for tool in tools:
            description = tool["function"]["description"].lower()
            name = tool["function"]["name"].lower()
            
            if any(kw in query_lower for kw in description.split()):
                relevant_tools.append(tool)
        
        return relevant_tools if relevant_tools else tools
    
    @staticmethod
    def by_context_limit(
        tools: list[dict], 
        max_tokens: int
    ) -> list[dict]:
        """基于 Token 限制选择工具"""
        selected = []
        current_tokens = 0
        
        for tool in tools:
            tool_tokens = estimate_tokens(json.dumps(tool))
            if current_tokens + tool_tokens <= max_tokens:
                selected.append(tool)
                current_tokens += tool_tokens
        
        return selected


def estimate_tokens(text: str) -> int:
    """估算 Token 数量"""
    return len(text) // 4
```

### 5.2 工具链执行

```python
from dataclasses import dataclass
from typing import Any
import asyncio

@dataclass
class ToolStep:
    """工具调用步骤"""
    tool_name: str
    arguments: dict
    depends_on: list[str] = None  # 依赖的前置步骤 ID
    step_id: str = None


class ToolChain:
    """工具链执行器"""
    
    def __init__(self, tool_registry: dict):
        self.registry = tool_registry
        self.results: dict[str, Any] = {}
    
    async def execute(self, steps: list[ToolStep]) -> dict:
        """
        执行工具链
        
        支持依赖关系：后面的步骤可以使用前面步骤的结果
        """
        # 构建依赖图
        completed = set()
        
        while len(completed) < len(steps):
            # 找到可以执行的步骤
            executable = [
                step for step in steps
                if step.step_id not in completed
                and (not step.depends_on or all(d in completed for d in step.depends_on))
            ]
            
            if not executable:
                # 检查是否有循环依赖
                remaining = [s for s in steps if s.step_id not in completed]
                raise ValueError(f"检测到循环依赖: {remaining}")
            
            # 并行执行可执行的步骤
            tasks = [self._execute_step(step) for step in executable]
            await asyncio.gather(*tasks)
            
            for step in executable:
                completed.add(step.step_id)
        
        return self.results
    
    async def _execute_step(self, step: ToolStep):
        """执行单个步骤"""
        # 替换参数中的引用
        resolved_args = self._resolve_arguments(step.arguments)
        
        # 执行工具
        if step.tool_name in self.registry:
            result = await asyncio.to_thread(
                self.registry[step.tool_name],
                **resolved_args
            )
        else:
            result = {"error": f"Unknown tool: {step.tool_name}"}
        
        self.results[step.step_id] = result
    
    def _resolve_arguments(self, args: dict) -> dict:
        """解析参数中的引用"""
        resolved = {}
        
        for key, value in args.items():
            if isinstance(value, str) and value.startswith("$"):
                # 引用前一步骤的结果
                ref = value[1:]  # 去掉 $
                if "." in ref:
                    step_id, path = ref.split(".", 1)
                    result = self.results.get(step_id, {})
                    resolved[key] = get_nested_value(result, path)
                else:
                    resolved[key] = self.results.get(ref)
            elif isinstance(value, dict):
                resolved[key] = self._resolve_arguments(value)
            else:
                resolved[key] = value
        
        return resolved


def get_nested_value(obj: dict, path: str):
    """获取嵌套值"""
    keys = path.split(".")
    for key in keys:
        if isinstance(obj, dict):
            obj = obj.get(key)
        else:
            return None
    return obj


# 使用示例：预订餐厅的完整流程
async def book_restaurant():
    """预订餐厅的完整流程"""
    
    chain = ToolChain(TOOL_HANDLERS)
    
    steps = [
        ToolStep(
            step_id="search",
            tool_name="search_restaurants",
            arguments={"cuisine": "意大利菜", "location": "市中心"}
        ),
        ToolStep(
            step_id="check_availability",
            tool_name="check_table_availability",
            arguments={
                "restaurant_id": "$search.data.0.id",  # 引用搜索结果
                "date": "2026-03-06",
                "time": "19:00"
            },
            depends_on=["search"]
        ),
        ToolStep(
            step_id="book",
            tool_name="create_reservation",
            arguments={
                "restaurant_id": "$search.data.0.id",
                "time": "19:00",
                "party_size": 4
            },
            depends_on=["search", "check_availability"]
        )
    ]
    
    results = await chain.execute(steps)
    return results
```

## 六、基于 Function Calling 的 Agent 架构

### 6.1 ReAct Agent

ReAct（Reasoning + Acting）是一种经典的 Agent 模式：

```python
from dataclasses import dataclass
from typing import Literal
import json

@dataclass
class AgentThought:
    """Agent 思考"""
    thought: str
    action: str = None
    action_input: dict = None


class ReActAgent:
    """ReAct Agent 实现"""
    
    SYSTEM_PROMPT = """你是一个能够使用工具的智能助手。

请按照以下格式回答：

思考: 分析当前情况，决定下一步行动
行动: [工具名称]
行动输入: {"参数名": "参数值"}
观察: 工具返回的结果
... (重复 思考/行动/观察 直到得出结论)
思考: 我现在知道最终答案了
最终答案: [回答]

可用工具：
{tools_description}

重要规则：
1. 每次只能调用一个工具
2. 仔细分析工具返回的结果
3. 如果工具调用失败，尝试其他方法
4. 当有足够信息时，给出最终答案
"""
    
    def __init__(self, llm_client, tools: list[dict], max_iterations: int = 10):
        self.llm = llm_client
        self.tools = {t["function"]["name"]: t for t in tools}
        self.tool_handlers = {}
        self.max_iterations = max_iterations
    
    def register_handler(self, tool_name: str, handler: callable):
        """注册工具处理器"""
        self.tool_handlers[tool_name] = handler
    
    def run(self, task: str) -> str:
        """执行任务"""
        tools_desc = self._format_tools()
        
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT.format(tools_description=tools_desc)},
            {"role": "user", "content": task}
        ]
        
        for iteration in range(self.max_iterations):
            # 调用 LLM
            response = self.llm.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                temperature=0
            )
            
            assistant_message = response.choices[0].message.content
            messages.append({"role": "assistant", "content": assistant_message})
            
            # 解析响应
            thought = self._parse_thought(assistant_message)
            
            # 检查是否完成
            if "最终答案:" in assistant_message:
                return self._extract_final_answer(assistant_message)
            
            # 执行工具
            if thought.action and thought.action in self.tool_handlers:
                result = self.tool_handlers[thought.action](**thought.action_input)
                
                observation = f"观察: {json.dumps(result, ensure_ascii=False)}"
                messages.append({"role": "user", "content": observation})
            else:
                messages.append({
                    "role": "user", 
                    "content": "观察: 无效的工具调用，请重试"
                })
        
        return "达到最大迭代次数，任务未完成"
    
    def _format_tools(self) -> str:
        """格式化工具描述"""
        lines = []
        for name, tool in self.tools.items():
            lines.append(f"- {name}: {tool['function']['description']}")
        return "\n".join(lines)
    
    def _parse_thought(self, message: str) -> AgentThought:
        """解析思考"""
        thought = AgentThought(thought=message)
        
        if "行动:" in message:
            action_start = message.find("行动:") + 3
            action_line = message[action_start:].split("\n")[0].strip()
            thought.action = action_line
        
        if "行动输入:" in message:
            input_start = message.find("行动输入:") + 5
            input_str = message[input_start:].split("\n")[0].strip()
            try:
                thought.action_input = json.loads(input_str)
            except:
                thought.action_input = {}
        
        return thought
    
    def _extract_final_answer(self, message: str) -> str:
        """提取最终答案"""
        if "最终答案:" in message:
            return message.split("最终答案:")[-1].strip()
        return message
```

### 6.2 完整的 Agent 框架

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum
import time

class AgentState(Enum):
    """Agent 状态"""
    IDLE = "idle"
    THINKING = "thinking"
    ACTING = "acting"
    OBSERVING = "observing"
    FINISHED = "finished"
    ERROR = "error"


@dataclass
class AgentStep:
    """Agent 执行步骤"""
    step_type: str  # "thought", "action", "observation"
    content: str
    tool_name: Optional[str] = None
    tool_args: Optional[dict] = None
    tool_result: Optional[Any] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class AgentResult:
    """Agent 执行结果"""
    success: bool
    answer: str
    steps: list[AgentStep]
    total_tokens: int
    execution_time: float


class BaseAgent(ABC):
    """Agent 基类"""
    
    def __init__(
        self,
        name: str,
        llm_client,
        tools: list[dict],
        max_iterations: int = 10,
        verbose: bool = True
    ):
        self.name = name
        self.llm = llm_client
        self.tools = tools
        self.max_iterations = max_iterations
        self.verbose = verbose
        self.state = AgentState.IDLE
        self.steps: list[AgentStep] = []
        self.tool_handlers: dict[str, callable] = {}
    
    def register_tool(self, name: str, handler: callable):
        """注册工具处理器"""
        self.tool_handlers[name] = handler
    
    @abstractmethod
    def think(self, context: str) -> AgentStep:
        """思考阶段"""
        pass
    
    @abstractmethod
    def act(self, thought: AgentStep) -> AgentStep:
        """行动阶段"""
        pass
    
    @abstractmethod
    def observe(self, action: AgentStep) -> AgentStep:
        """观察阶段"""
        pass
    
    @abstractmethod
    def should_finish(self) -> bool:
        """判断是否完成"""
        pass
    
    def run(self, task: str) -> AgentResult:
        """执行任务"""
        start_time = time.time()
        total_tokens = 0
        self.steps = []
        
        try:
            context = task
            
            for iteration in range(self.max_iterations):
                # 思考
                self.state = AgentState.THINKING
                thought = self.think(context)
                self.steps.append(thought)
                if self.verbose:
                    print(f"[思考] {thought.content}")
                
                # 检查是否完成
                if self.should_finish():
                    self.state = AgentState.FINISHED
                    break
                
                # 行动
                self.state = AgentState.ACTING
                action = self.act(thought)
                self.steps.append(action)
                if self.verbose:
                    print(f"[行动] {action.tool_name}({action.tool_args})")
                
                # 观察
                self.state = AgentState.OBSERVING
                observation = self.observe(action)
                self.steps.append(observation)
                if self.verbose:
                    print(f"[观察] {observation.content[:200]}...")
                
                # 更新上下文
                context = f"{context}\n\n{thought.content}\n{action.content}\n{observation.content}"
            
            execution_time = time.time() - start_time
            
            return AgentResult(
                success=True,
                answer=self._extract_answer(),
                steps=self.steps,
                total_tokens=total_tokens,
                execution_time=execution_time
            )
        
        except Exception as e:
            self.state = AgentState.ERROR
            return AgentResult(
                success=False,
                answer=f"执行失败: {str(e)}",
                steps=self.steps,
                total_tokens=total_tokens,
                execution_time=time.time() - start_time
            )
    
    def _extract_answer(self) -> str:
        """从步骤中提取最终答案"""
        for step in reversed(self.steps):
            if step.step_type == "thought" and "答案" in step.content:
                return step.content
        return self.steps[-1].content if self.steps else ""


class ToolAgent(BaseAgent):
    """基于工具的 Agent"""
    
    SYSTEM_PROMPT = """你是一个智能助手，可以使用工具完成任务。

工具列表：
{tools}

请分析任务，决定是否需要使用工具。
如果需要使用工具，请以 JSON 格式输出：
{{
    "thought": "你的分析",
    "need_tool": true,
    "tool_name": "工具名称",
    "tool_args": {{...}}
}}

如果已经有足够信息给出答案，请输出：
{{
    "thought": "你的分析",
    "need_tool": false,
    "answer": "最终答案"
}}
"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._final_answer = None
    
    def think(self, context: str) -> AgentStep:
        """思考"""
        tools_desc = self._format_tools()
        
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT.format(tools=tools_desc)},
            {"role": "user", "content": context}
        ]
        
        response = self.llm.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0
        )
        
        content = response.choices[0].message.content
        
        return AgentStep(
            step_type="thought",
            content=content
        )
    
    def act(self, thought: AgentStep) -> AgentStep:
        """行动"""
        import re
        
        # 尝试提取 JSON
        json_match = re.search(r'\{[\s\S]*\}', thought.content)
        if json_match:
            decision = json.loads(json_match.group())
            
            if decision.get("need_tool"):
                return AgentStep(
                    step_type="action",
                    content=thought.content,
                    tool_name=decision["tool_name"],
                    tool_args=decision.get("tool_args", {})
                )
            else:
                self._final_answer = decision.get("answer", "")
        
        return AgentStep(
            step_type="action",
            content=thought.content,
            tool_name=None,
            tool_args=None
        )
    
    def observe(self, action: AgentStep) -> AgentStep:
        """观察"""
        if action.tool_name and action.tool_name in self.tool_handlers:
            try:
                result = self.tool_handlers[action.tool_name](**action.tool_args)
            except Exception as e:
                result = {"error": str(e)}
        else:
            result = None
        
        return AgentStep(
            step_type="observation",
            content=json.dumps(result, ensure_ascii=False) if result else "",
            tool_result=result
        )
    
    def should_finish(self) -> bool:
        """判断是否完成"""
        if self._final_answer:
            return True
        last_action = [s for s in self.steps if s.step_type == "action"]
        if last_action and last_action[-1].tool_name is None:
            return True
        return False
    
    def _format_tools(self) -> str:
        """格式化工具描述"""
        lines = []
        for tool in self.tools:
            func = tool["function"]
            lines.append(f"- {func['name']}: {func['description']}")
        return "\n".join(lines)
    
    def _extract_answer(self) -> str:
        """提取答案"""
        if self._final_answer:
            return self._final_answer
        return super()._extract_answer()
```

## 七、实战：构建智能助手

### 7.1 多功能助手示例

```python
"""
智能助手：支持天气查询、计算、搜索、邮件发送等功能
"""

from openai import OpenAI
import json
from datetime import datetime
from typing import Optional

class SmartAssistant:
    """智能助手"""
    
    def __init__(self):
        self.client = OpenAI()
        self.tools = self._define_tools()
        self.handlers = {
            "get_weather": self._get_weather,
            "calculate": self._calculate,
            "search_web": self._search_web,
            "send_email": self._send_email,
            "create_reminder": self._create_reminder,
            "get_current_time": self._get_current_time,
        }
        self.history = []
    
    def _define_tools(self) -> list[dict]:
        """定义工具"""
        return [
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "获取指定城市的天气信息",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "city": {
                                "type": "string",
                                "description": "城市名称"
                            }
                        },
                        "required": ["city"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "calculate",
                    "description": "执行数学计算",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "expression": {
                                "type": "string",
                                "description": "数学表达式，如 2+3*4"
                            }
                        },
                        "required": ["expression"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "search_web",
                    "description": "搜索互联网获取信息",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "搜索关键词"
                            }
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "send_email",
                    "description": "发送邮件",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "to": {
                                "type": "string",
                                "description": "收件人邮箱"
                            },
                            "subject": {
                                "type": "string",
                                "description": "邮件主题"
                            },
                            "body": {
                                "type": "string",
                                "description": "邮件内容"
                            }
                        },
                        "required": ["to", "subject", "body"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_reminder",
                    "description": "创建提醒事项",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "content": {
                                "type": "string",
                                "description": "提醒内容"
                            },
                            "time": {
                                "type": "string",
                                "description": "提醒时间，格式 YYYY-MM-DD HH:MM"
                            }
                        },
                        "required": ["content", "time"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_current_time",
                    "description": "获取当前时间",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "timezone": {
                                "type": "string",
                                "description": "时区，默认 Asia/Shanghai"
                            }
                        }
                    }
                }
            }
        ]
    
    def chat(self, user_message: str) -> str:
        """处理用户消息"""
        self.history.append({"role": "user", "content": user_message})
        
        while True:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=self.history,
                tools=self.tools,
                tool_choice="auto"
            )
            
            message = response.choices[0].message
            
            if not message.tool_calls:
                self.history.append(message.model_dump())
                return message.content
            
            self.history.append(message.model_dump())
            
            for tool_call in message.tool_calls:
                func_name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)
                
                print(f"[调用工具] {func_name}({args})")
                
                result = self.handlers[func_name](**args)
                
                self.history.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })
    
    # 工具实现
    def _get_weather(self, city: str) -> dict:
        """获取天气（模拟）"""
        weather_db = {
            "北京": {"temp": 12, "condition": "晴", "humidity": 35},
            "上海": {"temp": 18, "condition": "多云", "humidity": 65},
            "广州": {"temp": 25, "condition": "晴", "humidity": 70},
            "深圳": {"temp": 26, "condition": "多云", "humidity": 75},
        }
        return weather_db.get(city, {"error": "城市未找到"})
    
    def _calculate(self, expression: str) -> dict:
        """计算"""
        try:
            # 安全起见，只允许基本数学运算
            allowed = set("0123456789+-*/().e ")
            if not all(c in allowed for c in expression):
                return {"error": "表达式包含不允许的字符"}
            result = eval(expression)
            return {"result": result}
        except Exception as e:
            return {"error": str(e)}
    
    def _search_web(self, query: str) -> dict:
        """搜索（模拟）"""
        return {
            "query": query,
            "results": [
                {"title": f"关于 {query} 的结果 1", "url": "https://example.com/1"},
                {"title": f"关于 {query} 的结果 2", "url": "https://example.com/2"},
            ]
        }
    
    def _send_email(self, to: str, subject: str, body: str) -> dict:
        """发送邮件（模拟）"""
        print(f"[邮件] 发送至: {to}")
        print(f"[邮件] 主题: {subject}")
        print(f"[邮件] 内容: {body[:100]}...")
        return {"success": True, "message_id": "msg_123456"}
    
    def _create_reminder(self, content: str, time: str) -> dict:
        """创建提醒（模拟）"""
        return {
            "success": True,
            "reminder_id": "rem_123456",
            "content": content,
            "time": time
        }
    
    def _get_current_time(self, timezone: str = "Asia/Shanghai") -> dict:
        """获取当前时间"""
        now = datetime.now()
        return {
            "time": now.strftime("%Y-%m-%d %H:%M:%S"),
            "timezone": timezone
        }


# 使用示例
if __name__ == "__main__":
    assistant = SmartAssistant()
    
    # 测试对话
    print(assistant.chat("现在几点了？"))
    print("---")
    print(assistant.chat("北京今天天气怎么样？"))
    print("---")
    print(assistant.chat("帮我算一下 (123 + 456) * 2"))
```

## 总结

本文系统性地讲解了 LLM Function Calling 的核心原理和实践方法：

1. **核心概念**：理解 Function Calling 的价值和执行流程
2. **OpenAI 实现**：掌握 OpenAI Function Calling 的完整用法
3. **Claude 实现**：了解 Claude Tool Use 的特点和差异
4. **最佳实践**：工具定义、参数验证、错误处理、权限控制
5. **多工具编排**：工具选择策略和工具链执行
6. **Agent 架构**：基于 Function Calling 构建 ReAct Agent

**关键要点**：
- Function Calling 让 LLM 从"对话者"变为"行动者"
- 工具定义的清晰度直接影响模型调用准确性
- 权限控制和错误处理是生产环境必备
- Agent 架构需要平衡自主性和可控性

Function Calling 是构建 AI Agent 的基础能力，掌握它将为你打开 LLM 应用开发的新世界。

## 参考资料

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [Toolformer: Language Models Can Teach Themselves to Use Tools](https://arxiv.org/abs/2302.04761)
- [LangChain Tools Documentation](https://python.langchain.com/docs/modules/tools/)
