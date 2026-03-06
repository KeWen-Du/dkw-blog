---
title: "从零到一实现生产级 MCP Gateway（三）：服务注册与发现"
date: "2025-02-28"
excerpt: "深入实现工具、资源、提示词三大注册中心，掌握 MCP Gateway 的核心能力抽象与参数验证机制。"
tags: ["AI", "MCP", "Registry", "Python", "设计模式", "JSON Schema"]
series:
  slug: "mcp-gateway-core"
  title: "从零到一实现生产级 MCP Gateway"
  order: 3
---

# 从零到一实现生产级 MCP Gateway（三）：注册中心实现

## 前言

注册中心（Registry）是 MCP Gateway 的核心组件，负责管理工具（Tools）、资源（Resources）和提示词（Prompts）的完整生命周期。它就像一个"能力市场"，AI Agent 可以在这里发现、查询和调用各种能力。本章将深入介绍三大注册中心的设计与实现。

## 注册中心架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Registry Architecture                          │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     MCP Protocol Layer                         │  │
│  │  tools/list │ tools/call │ resources/* │ prompts/*            │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │                     Registry Layer                             │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │
│  │  │    Tool     │  │  Resource   │  │   Prompt    │           │  │
│  │  │  Registry   │  │  Registry   │  │  Registry   │           │  │
│  │  ├─────────────┤  ├─────────────┤  ├─────────────┤           │  │
│  │  │ • register  │  │ • register  │  │ • register  │           │  │
│  │  │ • deregister│  │ • read      │  │ • get       │           │  │
│  │  │ • list      │  │ • subscribe │  │ • list      │           │  │
│  │  │ • execute   │  │ • notify    │  │             │           │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │  │
│  │                                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │                     Handler Layer                              │  │
│  │  Async Functions │ REST Adapters │ MCP Servers                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 工具注册中心

### 核心数据结构

```python
# registry/tool_registry.py

from __future__ import annotations
import asyncio
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

import jsonschema
from jsonschema import ValidationError as JsonSchemaValidationError

from ..protocol import (
    Tool,
    ToolAnnotations,
    CallToolResult,
    TextContent,
    ContentBlock,
)

logger = logging.getLogger(__name__)


@dataclass
class RegisteredTool:
    """已注册工具的完整定义"""
    tool: Tool                              # MCP 工具定义
    handler: Callable[..., Awaitable[Any]]  # 异步执行函数
    server_id: str | None = None            # 所属服务器 ID（联邦场景）
    metadata: dict[str, Any] = field(default_factory=dict)


class ToolExecutor(ABC):
    """工具执行器抽象基类"""
    
    @abstractmethod
    async def execute(
        self, 
        name: str, 
        arguments: dict[str, Any]
    ) -> CallToolResult:
        """执行工具"""
        pass


class ToolRegistry:
    """工具注册中心
    
    功能：
    - 工具注册与注销
    - 工具发现（按名称、模式、服务器过滤）
    - 工具执行与参数验证
    - 多服务器联邦支持
    """
    
    def __init__(self):
        self._tools: dict[str, RegisteredTool] = {}
        self._tools_by_server: dict[str, list[str]] = {}
        self._lock = asyncio.Lock()
```

### 工具注册

```python
    async def register(
        self,
        name: str,
        description: str,
        input_schema: dict[str, Any],
        handler: Callable[..., Awaitable[Any]],
        annotations: ToolAnnotations | None = None,
        server_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Tool:
        """注册新工具
        
        Args:
            name: 工具唯一标识名
            description: 工具描述（供 AI 理解）
            input_schema: JSON Schema 格式的参数定义
            handler: 异步执行函数
            annotations: 工具注解（只读、破坏性等提示）
            server_id: 所属服务器 ID（联邦场景）
            metadata: 扩展元数据
            
        Returns:
            注册成功的 Tool 对象
            
        Raises:
            ValueError: 工具名已存在
        """
        async with self._lock:
            if name in self._tools:
                raise ValueError(f"Tool already registered: {name}")
            
            tool = Tool(
                name=name,
                description=description,
                input_schema=input_schema,
                annotations=annotations,
            )
            
            registered_tool = RegisteredTool(
                tool=tool,
                handler=handler,
                server_id=server_id,
                metadata=metadata or {},
            )
            
            self._tools[name] = registered_tool
            
            # 按服务器分组（联邦场景）
            if server_id:
                if server_id not in self._tools_by_server:
                    self._tools_by_server[server_id] = []
                self._tools_by_server[server_id].append(name)
            
            logger.info(f"Registered tool: {name}" + 
                       (f" (server: {server_id})" if server_id else ""))
            
            return tool
```

### 工具注销

```python
    async def deregister(self, name: str) -> bool:
        """注销工具
        
        Args:
            name: 工具名
            
        Returns:
            True 注销成功，False 工具不存在
        """
        async with self._lock:
            if name not in self._tools:
                return False
            
            registered_tool = self._tools.pop(name)
            
            # 清理服务器分组
            if registered_tool.server_id:
                server_tools = self._tools_by_server.get(
                    registered_tool.server_id, []
                )
                if name in server_tools:
                    server_tools.remove(name)
            
            logger.info(f"Deregistered tool: {name}")
            return True
    
    async def deregister_server(self, server_id: str) -> int:
        """注销服务器的所有工具（联邦场景）
        
        Args:
            server_id: 服务器 ID
            
        Returns:
            注销的工具数量
        """
        async with self._lock:
            tool_names = self._tools_by_server.pop(server_id, [])
            count = 0
            
            for name in tool_names:
                if name in self._tools:
                    del self._tools[name]
                    count += 1
            
            logger.info(f"Deregistered {count} tools from server: {server_id}")
            return count
```

### 参数验证

```python
    def validate_arguments(
        self, 
        tool: Tool, 
        arguments: dict[str, Any]
    ) -> tuple[bool, str | None]:
        """验证工具参数
        
        使用 JSON Schema 验证参数格式
        
        Args:
            tool: 工具定义
            arguments: 待验证参数
            
        Returns:
            (是否有效, 错误信息)
        """
        schema = tool.input_schema
        
        # 空 schema 表示无验证
        if not schema or schema == {"type": "object"}:
            return True, None
        
        try:
            jsonschema.validate(arguments, schema)
            return True, None
        except JsonSchemaValidationError as e:
            # 构建友好的错误信息
            path = ".".join(str(p) for p in e.absolute_path) 
            if e.absolute_path else "root"
            error_msg = f"Validation error at '{path}': {e.message}"
            return False, error_msg
```

### 工具执行

```python
    async def execute(
        self, 
        name: str, 
        arguments: dict[str, Any]
    ) -> CallToolResult:
        """执行工具
        
        Args:
            name: 工具名
            arguments: 工具参数（将被验证）
            
        Returns:
            CallToolResult 包含内容或错误
        """
        registered = self._tools.get(name)
        
        if registered is None:
            return CallToolResult(
                content=[TextContent(text=f"Tool not found: {name}")],
                is_error=True,
            )
        
        # 验证参数
        is_valid, error_msg = self.validate_arguments(
            registered.tool, arguments
        )
        if not is_valid:
            logger.warning(f"Invalid arguments for tool '{name}': {error_msg}")
            return CallToolResult(
                content=[TextContent(text=f"Invalid arguments: {error_msg}")],
                is_error=True,
            )
        
        try:
            # 执行处理器
            result = await registered.handler(**arguments)
            
            # 转换结果为内容块
            content = self._convert_result(result)
            
            return CallToolResult(content=content, is_error=False)
            
        except TypeError as e:
            logger.warning(f"Type error executing tool '{name}': {e}")
            return CallToolResult(
                content=[TextContent(text=f"Argument error: {str(e)}")],
                is_error=True,
            )
        except Exception as e:
            logger.exception(f"Error executing tool: {name}")
            return CallToolResult(
                content=[TextContent(text=f"Error: {str(e)}")],
                is_error=True,
            )
    
    def _convert_result(self, result: Any) -> list[ContentBlock]:
        """将各种类型结果转换为 MCP Content 块"""
        if isinstance(result, list):
            return [
                item if isinstance(item, (TextContent, ContentBlock)) 
                else TextContent(text=str(item))
                for item in result
            ]
        
        if isinstance(result, str):
            return [TextContent(text=result)]
        
        if isinstance(result, dict):
            return [TextContent(text=json.dumps(result, indent=2))]
        
        return [TextContent(text=str(result))]
```

### 工具发现

```python
    def get(self, name: str) -> RegisteredTool | None:
        """按名称获取工具"""
        return self._tools.get(name)
    
    def list_tools(
        self, 
        server_id: str | None = None,
        pattern: str | None = None,
    ) -> list[Tool]:
        """列出工具
        
        Args:
            server_id: 按服务器过滤
            pattern: 按名称模式过滤（支持通配符）
            
        Returns:
            Tool 对象列表
        """
        tools = []
        
        for name, registered in self._tools.items():
            # 服务器过滤
            if server_id and registered.server_id != server_id:
                continue
            
            # 模式匹配
            if pattern:
                import fnmatch
                if not fnmatch.fnmatch(name, pattern):
                    continue
            
            tools.append(registered.tool)
        
        return tools
```

### 全局实例

```python
# 全局注册中心实例
_registry: ToolRegistry | None = None


def get_registry() -> ToolRegistry:
    """获取全局工具注册中心"""
    global _registry
    if _registry is None:
        _registry = ToolRegistry()
    return _registry
```

## 资源注册中心

### 核心数据结构

```python
# registry/resource_registry.py

from __future__ import annotations
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

from ..protocol import (
    Resource,
    ResourceTemplate,
    ResourceContents,
    TextResourceContents,
    BlobResourceContents,
)

logger = logging.getLogger(__name__)


@dataclass
class RegisteredResource:
    """已注册资源的完整定义"""
    resource: Resource
    read_handler: Callable[[str], Awaitable[ResourceContents]]
    server_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass 
class Subscription:
    """资源订阅"""
    uri: str
    subscriber_id: str
    callback: Callable[[ResourceContents], Awaitable[None]] | None = None


class ResourceRegistry:
    """资源注册中心
    
    功能：
    - 资源注册与发现
    - 资源读取
    - 订阅/通知机制
    - 资源模板支持
    """
    
    def __init__(self):
        self._resources: dict[str, RegisteredResource] = {}
        self._templates: list[ResourceTemplate] = []
        self._subscriptions: dict[str, list[Subscription]] = {}
        self._lock = asyncio.Lock()
```

### 资源注册

```python
    async def register(
        self,
        uri: str,
        name: str,
        read_handler: Callable[[str], Awaitable[ResourceContents]],
        description: str | None = None,
        mime_type: str | None = None,
        server_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Resource:
        """注册资源
        
        Args:
            uri: 资源 URI
            name: 资源名称
            read_handler: 读取处理器
            description: 资源描述
            mime_type: MIME 类型
            server_id: 所属服务器 ID
            metadata: 扩展元数据
            
        Returns:
            注册成功的 Resource 对象
        """
        async with self._lock:
            if uri in self._resources:
                raise ValueError(f"Resource already registered: {uri}")
            
            resource = Resource(
                uri=uri,
                name=name,
                description=description,
                mime_type=mime_type,
            )
            
            registered = RegisteredResource(
                resource=resource,
                read_handler=read_handler,
                server_id=server_id,
                metadata=metadata or {},
            )
            
            self._resources[uri] = registered
            logger.info(f"Registered resource: {uri}")
            
            return resource
```

### 资源读取

```python
    async def read(self, uri: str) -> list[ResourceContents]:
        """读取资源内容
        
        Args:
            uri: 资源 URI
            
        Returns:
            资源内容列表
        """
        registered = self._resources.get(uri)
        
        if registered is None:
            # 尝试匹配模板
            registered = self._match_template(uri)
        
        if registered is None:
            raise ValueError(f"Resource not found: {uri}")
        
        try:
            contents = await registered.read_handler(uri)
            return [contents] if not isinstance(contents, list) else contents
        except Exception as e:
            logger.exception(f"Error reading resource: {uri}")
            raise
    
    def _match_template(self, uri: str) -> RegisteredResource | None:
        """匹配资源模板"""
        # TODO: 实现 URI 模板匹配
        return None
```

### 订阅机制

```python
    async def subscribe(
        self,
        uri: str,
        subscriber_id: str,
        callback: Callable[[ResourceContents], Awaitable[None]] | None = None,
    ) -> bool:
        """订阅资源变更
        
        Args:
            uri: 资源 URI
            subscriber_id: 订阅者 ID
            callback: 可选的变更回调
            
        Returns:
            订阅是否成功
        """
        if uri not in self._resources:
            return False
        
        async with self._lock:
            if uri not in self._subscriptions:
                self._subscriptions[uri] = []
            
            subscription = Subscription(
                uri=uri,
                subscriber_id=subscriber_id,
                callback=callback,
            )
            
            self._subscriptions[uri].append(subscription)
            logger.info(f"Subscribed to resource: {uri}")
            
            return True
    
    async def unsubscribe(
        self,
        uri: str,
        subscriber_id: str,
    ) -> bool:
        """取消订阅"""
        async with self._lock:
            if uri not in self._subscriptions:
                return False
            
            self._subscriptions[uri] = [
                s for s in self._subscriptions[uri]
                if s.subscriber_id != subscriber_id
            ]
            
            logger.info(f"Unsubscribed from resource: {uri}")
            return True
    
    async def notify_update(self, uri: str) -> None:
        """通知资源更新"""
        subscriptions = self._subscriptions.get(uri, [])
        
        for sub in subscriptions:
            if sub.callback:
                try:
                    contents = await self.read(uri)
                    for content in contents:
                        await sub.callback(content)
                except Exception as e:
                    logger.error(f"Error notifying subscriber: {e}")
```

### 全局实例

```python
_resource_registry: ResourceRegistry | None = None


def get_resource_registry() -> ResourceRegistry:
    """获取全局资源注册中心"""
    global _resource_registry
    if _resource_registry is None:
        _resource_registry = ResourceRegistry()
    return _resource_registry
```

## 提示词注册中心

### 核心数据结构

```python
# registry/prompt_registry.py

from __future__ import annotations
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

from ..protocol import (
    Prompt,
    PromptArgument,
    PromptMessage,
    GetPromptResult,
    TextContent,
)

logger = logging.getLogger(__name__)


@dataclass
class RegisteredPrompt:
    """已注册提示词的完整定义"""
    prompt: Prompt
    template: str | Callable[[dict[str, str]], Awaitable[str]]
    server_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class PromptRegistry:
    """提示词注册中心
    
    功能：
    - 提示词注册与发现
    - 参数渲染
    - 模板支持
    """
    
    def __init__(self):
        self._prompts: dict[str, RegisteredPrompt] = {}
        self._lock = asyncio.Lock()
```

### 提示词注册

```python
    async def register(
        self,
        name: str,
        template: str | Callable[[dict[str, str]], Awaitable[str]],
        description: str | None = None,
        arguments: list[PromptArgument] | None = None,
        server_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Prompt:
        """注册提示词
        
        Args:
            name: 提示词名称
            template: 模板字符串或渲染函数
            description: 提示词描述
            arguments: 参数定义
            server_id: 所属服务器 ID
            metadata: 扩展元数据
            
        Returns:
            注册成功的 Prompt 对象
        """
        async with self._lock:
            if name in self._prompts:
                raise ValueError(f"Prompt already registered: {name}")
            
            prompt = Prompt(
                name=name,
                description=description,
                arguments=arguments,
            )
            
            registered = RegisteredPrompt(
                prompt=prompt,
                template=template,
                server_id=server_id,
                metadata=metadata or {},
            )
            
            self._prompts[name] = registered
            logger.info(f"Registered prompt: {name}")
            
            return prompt
```

### 提示词获取与渲染

```python
    async def get(
        self,
        name: str,
        arguments: dict[str, str] | None = None,
    ) -> GetPromptResult:
        """获取渲染后的提示词
        
        Args:
            name: 提示词名称
            arguments: 渲染参数
            
        Returns:
            GetPromptResult 包含消息列表
        """
        registered = self._prompts.get(name)
        
        if registered is None:
            raise ValueError(f"Prompt not found: {name}")
        
        # 验证必需参数
        if registered.prompt.arguments:
            for arg in registered.prompt.arguments:
                if arg.required and (not arguments or arg.name not in arguments):
                    raise ValueError(f"Missing required argument: {arg.name}")
        
        # 渲染模板
        if callable(registered.template):
            text = await registered.template(arguments or {})
        else:
            text = self._render_template(registered.template, arguments or {})
        
        return GetPromptResult(
            description=registered.prompt.description,
            messages=[
                PromptMessage(
                    role="user",
                    content=TextContent(text=text),
                )
            ],
        )
    
    def _render_template(
        self, 
        template: str, 
        arguments: dict[str, str]
    ) -> str:
        """渲染模板字符串"""
        result = template
        for key, value in arguments.items():
            result = result.replace(f"{{{key}}}", value)
        return result
```

### 全局实例

```python
_prompt_registry: PromptRegistry | None = None


def get_prompt_registry() -> PromptRegistry:
    """获取全局提示词注册中心"""
    global _prompt_registry
    if _prompt_registry is None:
        _prompt_registry = PromptRegistry()
    return _prompt_registry
```

## 内置工具注册示例

```python
# 注册内置工具
async def _register_builtin_tools(registry: ToolRegistry):
    """注册网关内置工具"""
    
    # Echo 工具 - 用于测试
    async def handle_echo(message: str) -> str:
        return message
    
    await registry.register(
        name="echo",
        description="Echo back the input message",
        input_schema={
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Message to echo back"
                }
            },
            "required": ["message"]
        },
        handler=handle_echo,
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
        ),
    )
    
    # 服务器信息工具
    async def handle_server_info() -> dict[str, Any]:
        return {
            "name": "mcp-gateway-core",
            "version": "1.0.0",
            "tools_count": len(registry._tools),
        }
    
    await registry.register(
        name="server_info",
        description="Get information about the MCP Gateway server",
        input_schema={"type": "object", "properties": {}},
        handler=handle_server_info,
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
        ),
    )
```

## 使用示例

### 注册自定义工具

```python
from mcp_gateway_core import get_registry

async def my_tool(name: str, count: int = 1) -> str:
    """自定义工具实现"""
    return f"Hello, {name}! " * count

async def register():
    registry = get_registry()
    await registry.register(
        name="greet",
        description="Greet a person multiple times",
        input_schema={
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name to greet"
                },
                "count": {
                    "type": "integer",
                    "description": "Number of greetings",
                    "default": 1,
                    "minimum": 1,
                    "maximum": 10
                }
            },
            "required": ["name"]
        },
        handler=my_tool,
    )
```

### 注册资源

```python
from mcp_gateway_core.registry import get_resource_registry
from mcp_gateway_core.protocol import TextResourceContents

async def read_status(uri: str) -> TextResourceContents:
    """读取应用状态"""
    return TextResourceContents(
        uri=uri,
        mime_type="application/json",
        text='{"status": "ok", "uptime": 3600}'
    )

async def register():
    registry = get_resource_registry()
    await registry.register(
        uri="myapp://status",
        name="Application Status",
        read_handler=read_status,
        description="Current application status",
    )
```

### 注册提示词

```python
from mcp_gateway_core.registry import get_prompt_registry
from mcp_gateway_core.protocol import PromptArgument

async def register():
    registry = get_prompt_registry()
    await registry.register(
        name="summarize",
        description="Generate a summary prompt",
        arguments=[
            PromptArgument(
                name="text",
                description="Text to summarize",
                required=True
            ),
            PromptArgument(
                name="length",
                description="Summary length (short/medium/long)",
                required=False
            ),
        ],
        template="Please summarize the following text in a {length} manner:\n\n{text}",
    )
```

## 设计亮点

| 特性 | 说明 | 面试价值 |
|------|------|----------|
| 异步安全 | 使用 asyncio.Lock 保护并发访问 | 并发编程能力 |
| JSON Schema 验证 | 完整的参数验证机制 | API 设计规范 |
| 结果自动转换 | 将各种类型转换为 MCP Content 格式 | 协议适配能力 |
| 联邦支持 | 按 server_id 分组管理 | 分布式设计思维 |
| 订阅通知 | 资源变更通知机制 | 观察者模式 |

## 小结

本章详细实现了工具、资源、提示词三大注册中心。它们是 MCP Gateway 的核心组件，提供了完整的能力管理机制。

**关键要点**：

1. ToolRegistry 负责工具注册、发现、执行和参数验证
2. ResourceRegistry 支持资源读取和订阅通知机制
3. PromptRegistry 提供提示词模板和参数渲染
4. 使用 asyncio.Lock 保证并发安全
5. JSON Schema 提供严格的参数验证

下一章我们将实现认证授权模块，包括 JWT、API Key 和 RBAC 权限模型。

## 参考资料

- [JSON Schema Specification](https://json-schema.org/)
- [MCP Tools Specification](https://modelcontextprotocol.io/specification/2025-11-25#tools)
- [Python asyncio Synchronization Primitives](https://docs.python.org/3/library/asyncio-sync.html)
