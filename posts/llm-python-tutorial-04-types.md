---
title: "大模型应用开发者 Python 必修课（四）：类型系统篇"
date: "2026-03-04 13:00:00"
excerpt: "深入掌握 Python 类型注解、Pydantic 数据验证和 mypy 静态检查，为生产级大模型应用构建可靠的数据模型。"
tags: ["Python", "类型注解", "Pydantic", "大模型开发"]
series:
  slug: "llm-python-tutorial"
  title: "大模型应用开发者 Python 必修课"
  order: 4
---

# 大模型应用开发者 Python 必修课（四）：类型系统篇

## 前言

在大模型应用开发中，我们经常需要处理复杂的 JSON 数据结构：API 请求、响应、配置文件等。Python 的类型系统不仅能帮助我们写出更可靠的代码，还能配合 Pydantic 实现数据验证，这是大模型应用开发的核心技能之一。

本章将深入探讨 Python 类型系统的各个方面，重点介绍如何在大模型开发中应用这些知识。

## 类型注解基础

### 基本类型注解

```python
# 变量类型注解
name: str = "GPT-4"
version: float = 4.0
is_available: bool = True
models: list[str] = ["gpt-4", "gpt-3.5-turbo"]
prices: dict[str, float] = {"gpt-4": 0.03, "gpt-3.5-turbo": 0.0005}

# 函数类型注解
def greet(name: str) -> str:
    return f"Hello, {name}!"

def calculate_cost(tokens: int, price_per_token: float) -> float:
    return tokens * price_per_token

# 多返回值
def get_model_info(model: str) -> tuple[str, float, int]:
    return (model, 0.03, 8192)
```

### Python 3.10+ 类型联合

```python
# Python 3.9 及之前
from typing import Union, Optional

def process(content: Union[str, dict]) -> str:
    ...

def find_model(name: str) -> Optional[dict]:
    ...  # 返回 dict 或 None

# Python 3.10+ 简化写法
def process(content: str | dict) -> str:
    ...

def find_model(name: str) -> dict | None:
    ...
```

### 类型别名

```python
from typing import TypeAlias

# 简单类型别名
TokenCount: TypeAlias = int
Price: TypeAlias = float

# 复杂类型别名
Message: TypeAlias = dict[str, str]
Messages: TypeAlias = list[Message]

# Python 3.12+ 可以使用 type 语句
type ChatMessages = list[dict[str, str]]
type EmbeddingVector = list[float]
```

## typing 模块高级用法

### 容器类型

```python
from typing import List, Dict, Set, Tuple, FrozenSet

# 详细指定容器内类型
names: List[str] = ["Alice", "Bob"]
ages: Dict[str, int] = {"Alice": 30, "Bob": 25}
unique_ids: Set[int] = {1, 2, 3}
coordinates: Tuple[float, float, float] = (1.0, 2.0, 3.0)
frozen: FrozenSet[str] = frozenset({"a", "b"})

# 推荐：使用内置类型（Python 3.9+）
names: list[str] = ["Alice", "Bob"]
ages: dict[str, int] = {"Alice": 30, "Bob": 25}
```

### 可选类型和默认值

```python
from typing import Optional

# Optional[T] 等价于 T | None
def create_chat_completion(
    messages: list[dict],
    model: str = "gpt-4",
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    config = {"model": model, "messages": messages}
    if temperature is not None:
        config["temperature"] = temperature
    if max_tokens is not None:
        config["max_tokens"] = max_tokens
    return config
```

### Any 和 NoReturn

```python
from typing import Any, NoReturn

# Any：任意类型（慎用）
def process_data(data: Any) -> Any:
    return data

# NoReturn：函数永不返回（如抛出异常）
def raise_error(message: str) -> NoReturn:
    raise ValueError(message)
```

### Callable 类型

```python
from typing import Callable

# 函数类型注解
Handler = Callable[[str, dict], str]

def register_handler(handler: Callable[[str, dict], str]) -> None:
    ...

# 带默认值和可变参数
Callback = Callable[..., None]

def set_callback(callback: Callback) -> None:
    ...
```

### 泛型

```python
from typing import TypeVar, Generic, Sequence

T = TypeVar("T")

class Stack(Generic[T]):
    """泛型栈"""

    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

    def is_empty(self) -> bool:
        return len(self._items) == 0

# 使用
int_stack: Stack[int] = Stack()
int_stack.push(1)
int_stack.push(2)
value: int = int_stack.pop()  # 类型安全
```

### Protocol（结构化子类型）

```python
from typing import Protocol

class ChatClient(Protocol):
    """聊天客户端协议"""

    async def chat(self, messages: list[dict]) -> str:
        ...

    async def close(self) -> None:
        ...

# 任何实现了 chat 和 close 方法的类都可以作为 ChatClient
class OpenAIClient:
    async def chat(self, messages: list[dict]) -> str:
        return "response"

    async def close(self) -> None:
        pass

def process_with_client(client: ChatClient) -> None:
    # 接受任何符合协议的对象
    ...
```

## dataclass 数据类

### 基本用法

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class ChatMessage:
    """聊天消息"""
    role: Literal["user", "assistant", "system"]
    content: str
    name: str | None = None

# 创建实例
msg = ChatMessage(role="user", content="Hello!")
print(msg.role)      # "user"
print(msg.content)   # "Hello!"
print(msg)           # ChatMessage(role='user', content='Hello!', name=None)
```

### 字段配置

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class ModelConfig:
    """模型配置"""
    name: str
    temperature: float = 0.7
    max_tokens: int = 4096

    # 默认工厂（用于可变默认值）
    stop_sequences: list[str] = field(default_factory=list)

    # 不参与比较
    internal_id: int = field(default=0, compare=False)

    # 不参与初始化
    _client: Any = field(init=False, repr=False)

    # 从其他字段计算
    full_name: str = field(init=False)

    def __post_init__(self) -> None:
        self.full_name = f"models/{self.name}"
        self._client = None

# 使用
config = ModelConfig(name="gpt-4")
print(config.full_name)  # "models/gpt-4"
```

### 大模型开发实战：消息模型

```python
from dataclasses import dataclass, asdict
from typing import Literal
import json

@dataclass
class ChatMessage:
    """聊天消息"""
    role: Literal["user", "assistant", "system"]
    content: str

    def to_openai_format(self) -> dict:
        return {"role": self.role, "content": self.content}

@dataclass
class ChatRequest:
    """聊天请求"""
    messages: list[ChatMessage]
    model: str = "gpt-4"
    temperature: float = 0.7
    max_tokens: int = 4096

    def to_api_payload(self) -> dict:
        return {
            "model": self.model,
            "messages": [msg.to_openai_format() for msg in self.messages],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

# 使用
request = ChatRequest(
    messages=[
        ChatMessage(role="system", content="You are a helpful assistant."),
        ChatMessage(role="user", content="Hello!"),
    ],
    model="gpt-4-turbo",
    temperature=0.9,
)

payload = request.to_api_payload()
# {'model': 'gpt-4-turbo', 'messages': [...], 'temperature': 0.9, 'max_tokens': 4096}
```

## Pydantic 数据验证

Pydantic 是大模型应用开发中最重要的库之一，它提供了强大的数据验证和序列化功能。

### 基本用法

```python
from pydantic import BaseModel, Field

class ChatMessage(BaseModel):
    """聊天消息"""
    role: str = Field(..., description="消息角色")
    content: str = Field(..., min_length=1, description="消息内容")

class ChatRequest(BaseModel):
    """聊天请求"""
    model: str = Field(default="gpt-4", description="模型名称")
    messages: list[ChatMessage] = Field(..., min_length=1)
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1, le=128000)

# 从字典创建
request = ChatRequest(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Hello!"},  # 自动转换为 ChatMessage
    ],
    temperature=0.9,
)

# 访问属性
print(request.model)       # "gpt-4"
print(request.temperature)  # 0.9

# 转换为字典
data = request.model_dump()
# {'model': 'gpt-4', 'messages': [...], 'temperature': 0.9, 'max_tokens': 4096}

# 转换为 JSON
json_str = request.model_dump_json()
```

### 字段验证器

```python
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str

    @field_validator("content")
    @classmethod
    def content_must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("content cannot be empty")
        return v

class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = 4096

    @field_validator("model")
    @classmethod
    def model_must_be_supported(cls, v: str) -> str:
        supported = ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus"]
        if v not in supported:
            raise ValueError(f"model must be one of {supported}")
        return v

    @model_validator(mode="after")
    def check_max_tokens_for_model(self) -> "ChatRequest":
        # GPT-4 支持更大的上下文
        if self.model == "gpt-4-turbo" and self.max_tokens > 128000:
            raise ValueError("max_tokens exceeds limit for gpt-4-turbo")
        return self
```

### 大模型开发实战：完整的 API 请求/响应模型

```python
from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime

# ========== 请求模型 ==========

class ChatMessage(BaseModel):
    """聊天消息"""
    role: Literal["user", "assistant", "system"]
    content: str
    name: str | None = None

class ChatCompletionRequest(BaseModel):
    """聊天完成请求"""
    model: str = Field(default="gpt-4")
    messages: list[ChatMessage] = Field(..., min_length=1)
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1)
    top_p: float = Field(default=1.0, ge=0, le=1)
    stream: bool = Field(default=False)

    class Config:
        json_schema_extra = {
            "example": {
                "model": "gpt-4",
                "messages": [
                    {"role": "user", "content": "Hello!"}
                ],
                "temperature": 0.7
            }
        }

# ========== 响应模型 ==========

class ChatCompletionChoice(BaseModel):
    """聊天完成选项"""
    index: int
    message: ChatMessage
    finish_reason: Literal["stop", "length", "content_filter"]

class Usage(BaseModel):
    """使用量统计"""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class ChatCompletionResponse(BaseModel):
    """聊天完成响应"""
    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: list[ChatCompletionChoice]
    usage: Usage

    @property
    def content(self) -> str:
        """获取第一个选择的内容"""
        return self.choices[0].message.content

# ========== 使用示例 ==========

# 解析 API 响应
api_response = {
    "id": "chatcmpl-123",
    "object": "chat.completion",
    "created": 1677652288,
    "model": "gpt-4",
    "choices": [{
        "index": 0,
        "message": {
            "role": "assistant",
            "content": "Hello! How can I help you?"
        },
        "finish_reason": "stop"
    }],
    "usage": {
        "prompt_tokens": 10,
        "completion_tokens": 20,
        "total_tokens": 30
    }
}

response = ChatCompletionResponse.model_validate(api_response)
print(response.content)  # "Hello! How can I help you?"
print(response.usage.total_tokens)  # 30
```

### Pydantic 与 FastAPI 集成

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class ChatRequest(BaseModel):
    messages: list[dict]
    model: str = "gpt-4"

class ChatResponse(BaseModel):
    response: str
    tokens_used: int

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """聊天接口"""
    # Pydantic 自动验证请求数据
    try:
        result = await call_llm(request.messages, request.model)
        return ChatResponse(
            response=result.content,
            tokens_used=result.usage.total_tokens
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## mypy 静态类型检查

### 安装和配置

```bash
# 安装 mypy
pip install mypy

# 运行检查
mypy src/

# 生成配置文件
# mypy.ini
[mypy]
python_version = 3.10
strict = true
warn_return_any = true
warn_unused_configs = true

# 忽略特定库的类型检查
[mypy-openai.*]
ignore_missing_imports = true
```

### 常见类型错误

```python
# 错误 1：类型不匹配
def greet(name: str) -> str:
    return f"Hello, {name}!"

greet(123)  # mypy 错误：Argument 1 to "greet" has incompatible type "int"

# 错误 2：可选类型未处理
from typing import Optional

def get_length(text: Optional[str]) -> int:
    return len(text)  # mypy 错误：Argument 1 to "len" has incompatible type "Optional[str]"

# 正确写法
def get_length(text: Optional[str]) -> int:
    if text is None:
        return 0
    return len(text)

# 错误 3：列表元素类型
def double_numbers(numbers: list[int]) -> list[int]:
    return [n * 2 for n in numbers]

double_numbers([1, 2, "3"])  # mypy 错误：List item 2 has incompatible type "str"
```

### 类型忽略

```python
# 忽略特定行的类型检查
result = some_untyped_library.function()  # type: ignore

# 忽略特定错误
value = risky_operation()  # type: ignore[assignment]
```

### 类型存根（Stub Files）

为无类型注解的库创建类型存根：

```python
# my_stubs/external_lib.pyi
def process(data: dict[str, str]) -> str: ...
def validate(content: str) -> bool: ...

# mypy.ini
[mypy]
mypy_path = ./my_stubs
```

## 实战：完整的 LLM 客户端类型系统

```python
from pydantic import BaseModel, Field
from typing import Literal, AsyncIterator
from dataclasses import dataclass
from abc import ABC, abstractmethod

# ========== 类型定义 ==========

type ModelName = Literal["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus"]
type MessageRole = Literal["user", "assistant", "system"]

# ========== 数据模型 ==========

@dataclass
class TokenUsage:
    """Token 使用量"""
    prompt: int
    completion: int
    total: int

class Message(BaseModel):
    """消息模型"""
    role: MessageRole
    content: str

class CompletionConfig(BaseModel):
    """完成配置"""
    model: ModelName = "gpt-4"
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1)

class CompletionResult(BaseModel):
    """完成结果"""
    message: Message
    usage: TokenUsage
    model: str
    finish_reason: Literal["stop", "length", "content_filter"]

# ========== 客户端接口 ==========

class LLMClient(ABC):
    """LLM 客户端抽象基类"""

    @abstractmethod
    async def complete(
        self,
        messages: list[Message],
        config: CompletionConfig,
    ) -> CompletionResult:
        """完成聊天"""
        ...

    @abstractmethod
    async def stream_complete(
        self,
        messages: list[Message],
        config: CompletionConfig,
    ) -> AsyncIterator[str]:
        """流式完成"""
        ...

    @abstractmethod
    async def close(self) -> None:
        """关闭客户端"""
        ...

# ========== OpenAI 实现示例 ==========

class OpenAIClient(LLMClient):
    """OpenAI 客户端实现"""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._client: Any = None

    async def __aenter__(self) -> "OpenAIClient":
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI(api_key=self._api_key)
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def complete(
        self,
        messages: list[Message],
        config: CompletionConfig,
    ) -> CompletionResult:
        response = await self._client.chat.completions.create(
            model=config.model,
            messages=[m.model_dump() for m in messages],
            temperature=config.temperature,
            max_tokens=config.max_tokens,
        )

        return CompletionResult(
            message=Message(
                role=response.choices[0].message.role,
                content=response.choices[0].message.content,
            ),
            usage=TokenUsage(
                prompt=response.usage.prompt_tokens,
                completion=response.usage.completion_tokens,
                total=response.usage.total_tokens,
            ),
            model=response.model,
            finish_reason=response.choices[0].finish_reason,
        )

    async def stream_complete(
        self,
        messages: list[Message],
        config: CompletionConfig,
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=config.model,
            messages=[m.model_dump() for m in messages],
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def close(self) -> None:
        if self._client:
            await self._client.close()

# ========== 使用示例 ==========

async def main() -> None:
    async with OpenAIClient(api_key="sk-xxx") as client:
        messages = [
            Message(role="system", content="You are a helpful assistant."),
            Message(role="user", content="Hello!"),
        ]

        config = CompletionConfig(model="gpt-4", temperature=0.9)

        # 非流式
        result = await client.complete(messages, config)
        print(result.message.content)

        # 流式
        async for chunk in client.stream_complete(messages, config):
            print(chunk, end="", flush=True)
```

## 小结

本章我们学习了：

1. **类型注解基础**：变量、函数、类型别名
2. **typing 模块**：Optional、Union、Callable、Generic、Protocol
3. **dataclass**：简洁的数据类定义
4. **Pydantic**：强大的数据验证和序列化
5. **mypy**：静态类型检查工具

这些知识在大模型开发中的应用：

| 技术 | 应用场景 |
|------|---------|
| 类型注解 | API 请求/响应模型定义 |
| Pydantic | 数据验证、配置管理、API 集成 |
| dataclass | 简单数据结构、内部模型 |
| mypy | 确保代码类型安全 |

## 参考资料

1. [Python typing 文档](https://docs.python.org/3/library/typing.html)
2. [Pydantic 官方文档](https://docs.pydantic.dev/)
3. [mypy 官方文档](https://mypy.readthedocs.io/)
4. [PEP 484 - Type Hints](https://peps.python.org/pep-0484/)
5. [PEP 604 - Union Types](https://peps.python.org/pep-0604/)

## 下一章预告

在下一章《异步编程篇》中，我们将深入学习：

- asyncio 基础和事件循环
- async/await 语法详解
- 并发控制和信号量
- 异步上下文管理器
- 大模型 API 并发调用实战

---

**系列持续更新中，欢迎关注！**
