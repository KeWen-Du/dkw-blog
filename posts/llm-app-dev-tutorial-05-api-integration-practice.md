---
title: "大模型应用开发教程（五）：大模型 API 集成开发实战"
date: "2026-03-04 13:00:00"
excerpt: "通过实战项目掌握大模型 API 的完整集成流程，包括对话管理、工具调用、多模型切换等核心功能。"
tags: ["大模型", "API集成", "Python", "实战项目"]
---

# 大模型应用开发教程（五）：大模型 API 集成开发实战

## 前言

在前几章中，我们学习了 API 调用基础和提示词工程。本章将通过一个完整的实战项目，将这些知识融会贯通，构建一个功能完善的大模型应用框架。

## 项目概述

我们将开发一个 **AI 助手应用框架**，具备以下核心功能：

```
┌─────────────────────────────────────────────────────────┐
│                    AI 助手应用框架                       │
├─────────────────────────────────────────────────────────┤
│  ✅ 多模型支持（OpenAI、Claude、本地模型）                │
│  ✅ 对话历史管理                                         │
│  ✅ 工具调用（Function Calling）                         │
│  ✅ 流式输出                                             │
│  ✅ Token 统计与成本追踪                                 │
│  ✅ 错误处理与重试                                       │
│  ✅ 缓存机制                                             │
└─────────────────────────────────────────────────────────┘
```

## 项目架构设计

### 目录结构

```
ai-assistant/
├── src/
│   ├── __init__.py
│   ├── config.py           # 配置管理
│   ├── models/
│   │   ├── __init__.py
│   │   ├── base.py         # 模型基类
│   │   ├── openai_model.py # OpenAI 实现
│   │   └── claude_model.py # Claude 实现
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── base.py         # 工具基类
│   │   └── builtins.py     # 内置工具
│   ├── memory/
│   │   ├── __init__.py
│   │   └── conversation.py # 对话管理
│   └── assistant.py        # 主入口
├── tests/
│   └── test_assistant.py
├── requirements.txt
├── .env.example
└── README.md
```

## 核心代码实现

### 1. 配置管理

```python
# src/config.py
import os
from dataclasses import dataclass, field
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

@dataclass
class ModelConfig:
    """模型配置"""
    provider: str = "openai"
    model_name: str = "gpt-4o-mini"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 0.7
    
    def __post_init__(self):
        if self.api_key is None:
            if self.provider == "openai":
                self.api_key = os.getenv("OPENAI_API_KEY")
            elif self.provider == "anthropic":
                self.api_key = os.getenv("ANTHROPIC_API_KEY")

@dataclass
class AppConfig:
    """应用配置"""
    model: ModelConfig = field(default_factory=ModelConfig)
    enable_cache: bool = True
    cache_ttl: int = 3600  # 缓存过期时间（秒）
    max_retries: int = 3
    retry_delay: float = 1.0
    enable_cost_tracking: bool = True
    
    @classmethod
    def from_env(cls) -> "AppConfig":
        """从环境变量加载配置"""
        return cls(
            model=ModelConfig(
                provider=os.getenv("AI_PROVIDER", "openai"),
                model_name=os.getenv("AI_MODEL", "gpt-4o-mini"),
            ),
            enable_cache=os.getenv("ENABLE_CACHE", "true").lower() == "true",
        )
```

### 2. 模型基类与实现

```python
# src/models/base.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, AsyncIterator
from dataclasses import dataclass

@dataclass
class Message:
    """消息数据类"""
    role: str
    content: str
    name: Optional[str] = None
    tool_calls: Optional[List[Dict]] = None
    tool_call_id: Optional[str] = None

@dataclass
class Usage:
    """Token 使用统计"""
    input_tokens: int
    output_tokens: int
    total_tokens: int

@dataclass
class Response:
    """响应数据类"""
    content: str
    usage: Usage
    model: str
    tool_calls: Optional[List[Dict]] = None
    finish_reason: str = "stop"

class BaseModel(ABC):
    """模型基类"""
    
    def __init__(self, config: ModelConfig):
        self.config = config
    
    @abstractmethod
    def chat(
        self,
        messages: List[Message],
        tools: Optional[List[Dict]] = None,
        **kwargs
    ) -> Response:
        """同步对话"""
        pass
    
    @abstractmethod
    async def achat(
        self,
        messages: List[Message],
        tools: Optional[List[Dict]] = None,
        **kwargs
    ) -> Response:
        """异步对话"""
        pass
    
    @abstractmethod
    def stream(
        self,
        messages: List[Message],
        tools: Optional[List[Dict]] = None,
        **kwargs
    ) -> AsyncIterator[str]:
        """流式输出"""
        pass
```

```python
# src/models/openai_model.py
from typing import List, Dict, Optional, AsyncIterator
from openai import OpenAI, AsyncOpenAI
from .base import BaseModel, Message, Response, Usage
from ..config import ModelConfig
import asyncio

class OpenAIModel(BaseModel):
    """OpenAI 模型实现"""
    
    def __init__(self, config: ModelConfig):
        super().__init__(config)
        self.client = OpenAI(
            api_key=config.api_key,
            base_url=config.base_url
        )
        self.async_client = AsyncOpenAI(
            api_key=config.api_key,
            base_url=config.base_url
        )
    
    def _convert_messages(self, messages: List[Message]) -> List[Dict]:
        """转换为 OpenAI 消息格式"""
        result = []
        for msg in messages:
            item = {"role": msg.role, "content": msg.content}
            if msg.name:
                item["name"] = msg.name
            if msg.tool_calls:
                item["tool_calls"] = msg.tool_calls
            if msg.tool_call_id:
                item["tool_call_id"] = msg.tool_call_id
            result.append(item)
        return result
    
    def chat(
        self,
        messages: List[Message],
        tools: Optional[List[Dict]] = None,
        **kwargs
    ) -> Response:
        """同步对话"""
        request_params = {
            "model": self.config.model_name,
            "messages": self._convert_messages(messages),
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
            "temperature": kwargs.get("temperature", self.config.temperature),
        }
        
        if tools:
            request_params["tools"] = tools
            request_params["tool_choice"] = kwargs.get("tool_choice", "auto")
        
        response = self.client.chat.completions.create(**request_params)
        
        return Response(
            content=response.choices[0].message.content or "",
            usage=Usage(
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens
            ),
            model=response.model,
            tool_calls=response.choices[0].message.tool_calls,
            finish_reason=response.choices[0].finish_reason
        )
    
    async def achat(
        self,
        messages: List[Message],
        tools: Optional[List[Dict]] = None,
        **kwargs
    ) -> Response:
        """异步对话"""
        request_params = {
            "model": self.config.model_name,
            "messages": self._convert_messages(messages),
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
            "temperature": kwargs.get("temperature", self.config.temperature),
        }
        
        if tools:
            request_params["tools"] = tools
            request_params["tool_choice"] = kwargs.get("tool_choice", "auto")
        
        response = await self.async_client.chat.completions.create(**request_params)
        
        return Response(
            content=response.choices[0].message.content or "",
            usage=Usage(
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens
            ),
            model=response.model,
            tool_calls=response.choices[0].message.tool_calls,
            finish_reason=response.choices[0].finish_reason
        )
    
    async def stream(
        self,
        messages: List[Message],
        tools: Optional[List[Dict]] = None,
        **kwargs
    ) -> AsyncIterator[str]:
        """流式输出"""
        request_params = {
            "model": self.config.model_name,
            "messages": self._convert_messages(messages),
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
            "temperature": kwargs.get("temperature", self.config.temperature),
            "stream": True,
        }
        
        if tools:
            request_params["tools"] = tools
            request_params["tool_choice"] = kwargs.get("tool_choice", "auto")
        
        stream = await self.async_client.chat.completions.create(**request_params)
        
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

### 3. 对话历史管理

```python
# src/memory/conversation.py
from typing import List, Optional
from datetime import datetime
from dataclasses import dataclass, field
import json

@dataclass
class Conversation:
    """对话管理类"""
    
    id: str
    created_at: datetime = field(default_factory=datetime.now)
    messages: List[dict] = field(default_factory=list)
    system_prompt: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    
    def add_message(self, role: str, content: str, **kwargs):
        """添加消息"""
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            **kwargs
        }
        self.messages.append(message)
    
    def get_messages(self, limit: Optional[int] = None) -> List[dict]:
        """获取消息历史"""
        messages = []
        
        if self.system_prompt:
            messages.append({
                "role": "system",
                "content": self.system_prompt
            })
        
        history = self.messages
        if limit:
            # 保留最近 N 条消息
            history = history[-limit:]
        
        messages.extend(history)
        return messages
    
    def clear(self):
        """清空对话历史"""
        self.messages = []
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat(),
            "messages": self.messages,
            "system_prompt": self.system_prompt,
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Conversation":
        """从字典创建"""
        return cls(
            id=data["id"],
            created_at=datetime.fromisoformat(data["created_at"]),
            messages=data["messages"],
            system_prompt=data.get("system_prompt"),
            metadata=data.get("metadata", {})
        )
    
    def save(self, filepath: str):
        """保存到文件"""
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)
    
    @classmethod
    def load(cls, filepath: str) -> "Conversation":
        """从文件加载"""
        with open(filepath, "r", encoding="utf-8") as f:
            return cls.from_dict(json.load(f))


class ConversationManager:
    """对话管理器"""
    
    def __init__(self):
        self.conversations: dict[str, Conversation] = {}
    
    def create(self, id: str, system_prompt: Optional[str] = None) -> Conversation:
        """创建新对话"""
        conv = Conversation(id=id, system_prompt=system_prompt)
        self.conversations[id] = conv
        return conv
    
    def get(self, id: str) -> Optional[Conversation]:
        """获取对话"""
        return self.conversations.get(id)
    
    def delete(self, id: str):
        """删除对话"""
        if id in self.conversations:
            del self.conversations[id]
    
    def list_all(self) -> List[Conversation]:
        """列出所有对话"""
        return list(self.conversations.values())
```

### 4. 工具调用系统

```python
# src/tools/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any, List
from dataclasses import dataclass

@dataclass
class ToolResult:
    """工具执行结果"""
    success: bool
    result: Any
    error: str = ""

class BaseTool(ABC):
    """工具基类"""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """工具名称"""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """工具描述"""
        pass
    
    @property
    @abstractmethod
    def parameters(self) -> Dict:
        """参数定义"""
        pass
    
    @abstractmethod
    def execute(self, **kwargs) -> ToolResult:
        """执行工具"""
        pass
    
    def to_openai_format(self) -> Dict:
        """转换为 OpenAI 工具格式"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }
```

```python
# src/tools/builtins.py
import json
import requests
from typing import Dict, Any
from .base import BaseTool, ToolResult

class CalculatorTool(BaseTool):
    """计算器工具"""
    
    @property
    def name(self) -> str:
        return "calculator"
    
    @property
    def description(self) -> str:
        return "执行数学计算表达式"
    
    @property
    def parameters(self) -> Dict:
        return {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "数学表达式，如 '2 + 3 * 4'"
                }
            },
            "required": ["expression"]
        }
    
    def execute(self, expression: str) -> ToolResult:
        try:
            # 安全计算（仅允许基本数学运算）
            allowed_chars = set("0123456789+-*/().% ")
            if not all(c in allowed_chars for c in expression):
                return ToolResult(
                    success=False,
                    result=None,
                    error="表达式包含非法字符"
                )
            
            result = eval(expression)
            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))


class WebSearchTool(BaseTool):
    """网络搜索工具"""
    
    @property
    def name(self) -> str:
        return "web_search"
    
    @property
    def description(self) -> str:
        return "搜索网络获取信息"
    
    @property
    def parameters(self) -> Dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词"
                }
            },
            "required": ["query"]
        }
    
    def execute(self, query: str) -> ToolResult:
        try:
            # 使用搜索 API（示例，需要替换为实际 API）
            # response = requests.get(f"https://api.search.com/search?q={query}")
            # results = response.json()
            
            # 模拟返回
            return ToolResult(
                success=True,
                result=f"搜索 '{query}' 的结果：[模拟搜索结果]"
            )
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))


class ToolRegistry:
    """工具注册中心"""
    
    def __init__(self):
        self.tools: Dict[str, BaseTool] = {}
        self._register_builtin_tools()
    
    def _register_builtin_tools(self):
        """注册内置工具"""
        self.register(CalculatorTool())
        self.register(WebSearchTool())
    
    def register(self, tool: BaseTool):
        """注册工具"""
        self.tools[tool.name] = tool
    
    def get(self, name: str) -> BaseTool:
        """获取工具"""
        return self.tools.get(name)
    
    def get_openai_tools(self) -> List[Dict]:
        """获取 OpenAI 格式的工具列表"""
        return [tool.to_openai_format() for tool in self.tools.values()]
    
    def execute(self, name: str, **kwargs) -> ToolResult:
        """执行工具"""
        tool = self.get(name)
        if not tool:
            return ToolResult(success=False, result=None, error=f"工具 '{name}' 不存在")
        return tool.execute(**kwargs)
```

### 5. 主助手类

```python
# src/assistant.py
from typing import Optional, List, Dict, AsyncIterator
from .config import AppConfig, ModelConfig
from .models.base import Message, Response
from .models.openai_model import OpenAIModel
from .memory.conversation import ConversationManager
from .tools.builtins import ToolRegistry
import asyncio
import time

class AIAssistant:
    """AI 助手主类"""
    
    def __init__(self, config: Optional[AppConfig] = None):
        self.config = config or AppConfig.from_env()
        
        # 初始化组件
        self.model = self._init_model()
        self.conversation_manager = ConversationManager()
        self.tool_registry = ToolRegistry()
        
        # 统计信息
        self.total_tokens = 0
        self.total_cost = 0.0
    
    def _init_model(self):
        """初始化模型"""
        if self.config.model.provider == "openai":
            return OpenAIModel(self.config.model)
        # 可以添加其他模型支持
        raise ValueError(f"不支持的模型提供商: {self.config.model.provider}")
    
    def create_conversation(
        self,
        conversation_id: str,
        system_prompt: Optional[str] = None
    ):
        """创建对话"""
        return self.conversation_manager.create(conversation_id, system_prompt)
    
    def chat(
        self,
        message: str,
        conversation_id: str = "default",
        use_tools: bool = True,
        **kwargs
    ) -> str:
        """同步对话"""
        conv = self.conversation_manager.get(conversation_id)
        if not conv:
            conv = self.create_conversation(conversation_id)
        
        # 添加用户消息
        conv.add_message("user", message)
        
        # 获取历史消息
        messages = [
            Message(role=m["role"], content=m["content"])
            for m in conv.get_messages()
        ]
        
        # 准备工具
        tools = None
        if use_tools:
            tools = self.tool_registry.get_openai_tools()
        
        # 调用模型
        response = self.model.chat(messages, tools=tools, **kwargs)
        
        # 处理工具调用
        if response.tool_calls:
            return self._handle_tool_calls(response, conv, messages, **kwargs)
        
        # 添加助手回复
        conv.add_message("assistant", response.content)
        
        # 更新统计
        self._update_stats(response.usage)
        
        return response.content
    
    def _handle_tool_calls(
        self,
        response: Response,
        conv,
        messages: List[Message],
        **kwargs
    ) -> str:
        """处理工具调用"""
        # 添加助手的工具调用消息
        conv.add_message(
            "assistant",
            response.content,
            tool_calls=response.tool_calls
        )
        
        # 执行每个工具调用
        for tool_call in response.tool_calls:
            tool_name = tool_call.function.name
            tool_args = tool_call.function.arguments
            
            # 执行工具
            result = self.tool_registry.execute(tool_name, **tool_args)
            
            # 添加工具结果消息
            conv.add_message(
                "tool",
                str(result.result) if result.success else result.error,
                name=tool_name,
                tool_call_id=tool_call.id
            )
        
        # 继续对话获取最终回复
        messages = [
            Message(
                role=m["role"],
                content=m["content"],
                name=m.get("name"),
                tool_calls=m.get("tool_calls"),
                tool_call_id=m.get("tool_call_id")
            )
            for m in conv.get_messages()
        ]
        
        final_response = self.model.chat(messages, **kwargs)
        conv.add_message("assistant", final_response.content)
        
        self._update_stats(final_response.usage)
        
        return final_response.content
    
    async def stream_chat(
        self,
        message: str,
        conversation_id: str = "default",
        **kwargs
    ) -> AsyncIterator[str]:
        """流式对话"""
        conv = self.conversation_manager.get(conversation_id)
        if not conv:
            conv = self.create_conversation(conversation_id)
        
        conv.add_message("user", message)
        
        messages = [
            Message(role=m["role"], content=m["content"])
            for m in conv.get_messages()
        ]
        
        full_content = ""
        async for chunk in self.model.stream(messages, **kwargs):
            full_content += chunk
            yield chunk
        
        conv.add_message("assistant", full_content)
    
    def _update_stats(self, usage):
        """更新统计信息"""
        self.total_tokens += usage.total_tokens
        # 简化的成本计算
        self.total_cost += usage.total_tokens * 0.000001
    
    def get_stats(self) -> Dict:
        """获取统计信息"""
        return {
            "total_tokens": self.total_tokens,
            "total_cost": self.total_cost,
            "conversation_count": len(self.conversation_manager.list_all())
        }
```

## 使用示例

### 基础对话

```python
from src.assistant import AIAssistant
from src.config import AppConfig, ModelConfig

# 创建助手
config = AppConfig(
    model=ModelConfig(
        provider="openai",
        model_name="gpt-4o-mini"
    )
)
assistant = AIAssistant(config)

# 简单对话
response = assistant.chat("你好，请介绍一下你自己")
print(response)

# 多轮对话
assistant.chat("你刚才提到了什么？", conversation_id="default")
```

### 使用系统提示

```python
# 创建带系统提示的对话
assistant.create_conversation(
    "coding",
    system_prompt="你是一位 Python 专家，擅长代码优化和调试。"
)

response = assistant.chat(
    "这段代码有什么问题？def add(a, b): return a + b",
    conversation_id="coding"
)
```

### 使用工具

```python
# 启用工具的对话
response = assistant.chat(
    "帮我计算 (123 + 456) * 2",
    use_tools=True
)
print(response)
```

### 流式输出

```python
import asyncio

async def stream_example():
    async for chunk in assistant.stream_chat("写一首关于春天的诗"):
        print(chunk, end="", flush=True)

asyncio.run(stream_example())
```

## 小结

本章我们实现了一个完整的 AI 助手框架，包括：

1. **配置管理**：灵活的配置系统支持多种模型
2. **模型抽象**：统一的接口支持多模型切换
3. **对话管理**：完整的对话历史管理功能
4. **工具系统**：可扩展的工具调用机制
5. **流式输出**：实时响应提升用户体验

## 下一章预告

在下一章《构建第一个 AI 应用》中，我们将基于这个框架开发一个完整的实际项目——智能客服系统，包括：

- Web 界面开发
- 知识库集成
- 用户管理
- 部署上线

---

**教程系列持续更新中，欢迎关注！**
