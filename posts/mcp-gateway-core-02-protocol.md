---
title: "从零到一实现生产级 MCP Gateway（二）：MCP 协议深度解析"
date: "2025-02-19"
excerpt: "深入理解 MCP 协议的 JSON-RPC 2.0 消息格式、类型系统设计和方法路由机制，掌握协议层核心实现原理。"
tags: ["AI", "MCP", "JSON-RPC", "Python", "Pydantic", "协议设计"]
series:
  slug: "mcp-gateway-core"
  title: "从零到一实现生产级 MCP Gateway"
  order: 2
---

# 从零到一实现生产级 MCP Gateway（二）：MCP 协议与 JSON-RPC 实现

## 前言

MCP (Model Context Protocol) 基于 JSON-RPC 2.0 构建，定义了一套完整的类型系统和方法规范。理解协议层的实现是构建 MCP Gateway 的基础。本章将深入解析 MCP 协议的类型定义、消息处理和方法路由机制。

## 设计思路：为什么 MCP 基于 JSON-RPC？

### 问题背景

在 AI Agent 与外部工具交互的场景中，存在多种协议选择：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    协议选择的考量                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  需求分析：                                                          │
│  1. 双向通信 - Agent 发请求，工具返回结果                            │
│  2. 标准化 - 不同厂商的工具可以互通                                  │
│  3. 扩展性 - 容易添加新的能力                                        │
│  4. 语言无关 - 支持多种编程语言实现                                  │
│                                                                      │
│  可选协议：                                                          │
│                                                                      │
│  选项 A：REST API                                                    │
│  - 优点：简单，广泛支持                                              │
│  - 缺点：语义不够丰富，难以表达复杂操作                              │
│  - 示例：POST /tools/call { name: "read", args: {...} }             │
│                                                                      │
│  选项 B：GraphQL                                                     │
│  - 优点：灵活查询，类型系统                                          │
│  - 缺点：学习曲线陡，对工具调用场景过度设计                          │
│                                                                      │
│  选项 C：gRPC                                                        │
│  - 优点：高性能，强类型                                              │
│  - 缺点：需要 protobuf 定义，浏览器支持差                            │
│                                                                      │
│  选项 D：JSON-RPC                                                    │
│  - 优点：简单、标准化、支持通知、语言无关                            │
│  - 缺点：功能相对简单                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 为什么选择 JSON-RPC？

**JSON-RPC 的核心优势**：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    JSON-RPC 特性分析                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 请求-响应模型                                                    │
│     { "id": 1, "method": "tools/call", "params": {...} }            │
│     { "id": 1, "result": {...} }                                    │
│     → 天然适合工具调用场景                                           │
│                                                                      │
│  2. 通知机制                                                         │
│     { "method": "notifications/initialized" }  // 无 id，无需响应   │
│     → 适合事件通知、状态推送                                         │
│                                                                      │
│  3. 批量请求                                                         │
│     [ { "id": 1, ... }, { "id": 2, ... } ]                          │
│     → 支持并行工具调用                                               │
│                                                                      │
│  4. 标准错误码                                                       │
│     { "code": -32601, "message": "Method not found" }               │
│     → 统一的错误处理                                                 │
│                                                                      │
│  5. 语言无关                                                         │
│     → Python、TypeScript、Go 都有成熟实现                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### MCP 在 JSON-RPC 之上的扩展

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MCP 扩展内容                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  JSON-RPC 提供：                                                     │
│  - 消息格式标准                                                      │
│  - 请求/响应/通知机制                                                │
│  - 错误码定义                                                        │
│                                                                      │
│  MCP 扩展：                                                          │
│  - 方法命名空间（tools/*, resources/*, prompts/*）                  │
│  - 能力协商（initialize 时交换能力）                                  │
│  - 资源订阅（resources/subscribe）                                   │
│  - 变更通知（notifications/tools/list_changed）                      │
│  - 日志级别控制（logging/setLevel）                                  │
│                                                                      │
│  示例：能力协商                                                       │
│  客户端: { capabilities: { sampling: {} } }                          │
│  服务端: { capabilities: { tools: { listChanged: true } } }          │
│  → 双方知道对方支持什么能力                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 方案对比：类型系统设计

### 方案一：使用 Python dataclass

```python
@dataclass
class Tool:
    name: str
    description: str
    input_schema: dict
```

**优点**：Python 原生，简单  
**缺点**：无自动验证，无 JSON Schema 生成  
**结论**：适用于简单场景

### 方案二：使用 Pydantic（本文方案）

```python
class Tool(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any] = Field(alias="inputSchema")
    
    class Config:
        populate_by_name = True
```

**优点**：自动验证、JSON 序列化、别名支持  
**缺点**：需要学习 Pydantic  
**结论**：**推荐用于生产环境**

### 方案三：使用 TypedDict

```python
class Tool(TypedDict):
    name: str
    description: str
    inputSchema: dict
```

**优点**：类型提示，零依赖  
**缺点**：无运行时验证，无别名转换  
**结论**：适用于只读场景

## 常见陷阱与解决方案

### 陷阱一：JSON-RPC 版本号必须是 "2.0"

**问题描述**：
```json
{ "jsonrpc": "2.0.0", ... }  // 错误
{ "jsonrpc": 2.0, ... }       // 错误
{ "jsonrpc": "2.0", ... }     // 正确
```

**解决方案**：使用 Literal 类型严格限制

```python
from typing import Literal

class JSONRPCRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"  # 只允许 "2.0" 字符串
```

### 陷阱二：字段别名导致的序列化问题

**问题描述**：
```python
class Tool(BaseModel):
    input_schema: dict  # Python 风格命名

# JSON 中是 inputSchema
{ "inputSchema": {...} }  # LLM 返回这个格式

# 默认情况下 Pydantic 无法识别
tool = Tool(**json_data)  # ValidationError
```

**解决方案**：使用 Field alias

```python
class Tool(BaseModel):
    input_schema: dict = Field(alias="inputSchema")
    
    class Config:
        populate_by_name = True  # 允许使用两种名称

# 现在两种方式都可以
tool = Tool(inputSchema={...})  # 从 JSON 解析
tool = Tool(input_schema={...})  # Python 代码创建
```

### 陷阱三：通知消息没有 id 字段

**问题描述**：
```python
# 请求消息
{ "jsonrpc": "2.0", "id": 1, "method": "ping" }

# 通知消息（无 id）
{ "jsonrpc": "2.0", "method": "notifications/initialized" }

# 如何区分？
```

**解决方案**：使用不同的类型

```python
class JSONRPCRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: str | int          # 必须有 id
    method: str
    params: dict | None = None

class JSONRPCNotification(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    # 没有 id 字段
    method: str
    params: dict | None = None

# 解析时判断
def parse_message(data: dict):
    if "id" in data:
        return JSONRPCRequest(**data)
    else:
        return JSONRPCNotification(**data)
```

### 陷阱四：错误响应忘记设置 id

**问题描述**：
```python
# 错误响应必须包含 id
{ "jsonrpc": "2.0", "id": null, "error": {...} }

# 但如果解析失败，我们不知道原始 id
def handle_parse_error(data):
    return JSONRPCResponse(
        id=None,  # 只能设为 null
        error={"code": -32700, "message": "Parse error"}
    )
```

**解决方案**：按规范处理

```python
# JSON-RPC 规范：
# - 解析错误（无法解析 JSON）：id = null
# - 无效请求（JSON 格式错误）：id = null
# - 其他错误：id = 原始请求的 id

async def handle_message(raw_data: str):
    try:
        data = json.loads(raw_data)
    except json.JSONDecodeError:
        return JSONRPCResponse(
            id=None,
            error=JSONRPCError(code=-32700, message="Parse error")
        )
    
    try:
        request = JSONRPCRequest(**data)
    except ValidationError:
        return JSONRPCResponse(
            id=data.get("id"),  # 尝试获取 id
            error=JSONRPCError(code=-32600, message="Invalid Request")
        )
    
    # 正常处理...
```

### 陷阱五：方法不存在时返回错误码错误

**问题描述**：
```python
# 错误：使用通用错误码
{ "code": -32603, "message": "Internal error" }

# 正确：使用特定错误码
{ "code": -32601, "message": "Method not found" }
```

**解决方案**：定义标准错误码枚举

```python
class ErrorCode(int, Enum):
    PARSE_ERROR = -32700       # JSON 解析错误
    INVALID_REQUEST = -32600   # 无效请求
    METHOD_NOT_FOUND = -32601  # 方法不存在
    INVALID_PARAMS = -32602    # 无效参数
    INTERNAL_ERROR = -32603    # 内部错误

async def handle_request(request: JSONRPCRequest):
    handler = method_handlers.get(request.method)
    
    if handler is None:
        return JSONRPCResponse(
            id=request.id,
            error=JSONRPCError(
                code=ErrorCode.METHOD_NOT_FOUND,  # 使用正确错误码
                message=f"Method not found: {request.method}"
            )
        )
    
    # 处理请求...
```

## JSON-RPC 2.0 基础

### 消息类型

JSON-RPC 2.0 定义了三种消息类型：

```
┌─────────────────────────────────────────────────────────────────────┐
│                      JSON-RPC 2.0 消息类型                           │
├─────────────────┬───────────────────────────────────────────────────┤
│     类型        │                      特点                          │
├─────────────────┼───────────────────────────────────────────────────┤
│ Request         │ 包含 id，期望收到 Response                          │
│                 │ {"jsonrpc":"2.0", "id":1, "method":"xxx", ...}    │
├─────────────────┼───────────────────────────────────────────────────┤
│ Response        │ 对应 Request 的响应                                 │
│                 │ {"jsonrpc":"2.0", "id":1, "result":{...}}         │
│                 │ {"jsonrpc":"2.0", "id":1, "error":{...}}          │
├─────────────────┼───────────────────────────────────────────────────┤
│ Notification    │ 无 id，不期望响应                                   │
│                 │ {"jsonrpc":"2.0", "method":"xxx", ...}             │
└─────────────────┴───────────────────────────────────────────────────┘
```

### 错误码定义

```python
class ErrorCode(int, Enum):
    """JSON-RPC 标准错误码"""
    PARSE_ERROR = -32700       # 解析错误
    INVALID_REQUEST = -32600   # 无效请求
    METHOD_NOT_FOUND = -32601  # 方法不存在
    INVALID_PARAMS = -32602    # 无效参数
    INTERNAL_ERROR = -32603    # 内部错误
    SERVER_ERROR_START = -32000
    SERVER_ERROR_END = -32099
```

## MCP 类型系统

### 基础类型定义

```python
# protocol/types.py

from __future__ import annotations
from enum import Enum
from typing import Any, Literal, Union
from pydantic import BaseModel, Field


# ============================================================================
# JSON-RPC 2.0 基础类型
# ============================================================================

class JSONRPCVersion(str, Enum):
    """JSON-RPC 协议版本"""
    V2_0 = "2.0"


class JSONRPCRequest(BaseModel):
    """JSON-RPC 请求消息"""
    jsonrpc: Literal["2.0"] = "2.0"
    id: Union[str, int, None] = None
    method: str
    params: dict[str, Any] | None = None


class JSONRPCError(BaseModel):
    """JSON-RPC 错误对象"""
    code: int
    message: str
    data: dict[str, Any] | None = None


class JSONRPCResponse(BaseModel):
    """JSON-RPC 响应消息"""
    jsonrpc: Literal["2.0"] = "2.0"
    id: Union[str, int, None] = None
    result: dict[str, Any] | None = None
    error: JSONRPCError | None = None


class JSONRPCNotification(BaseModel):
    """JSON-RPC 通知消息（无 id，无响应）"""
    jsonrpc: Literal["2.0"] = "2.0"
    method: str
    params: dict[str, Any] | None = None
```

### 能力类型定义

```python
# ============================================================================
# MCP 核心类型 - 能力协商
# ============================================================================

class ClientCapabilities(BaseModel):
    """客户端支持的能力"""
    experimental: dict[str, Any] | None = None
    roots: dict[str, Any] | None = None      # 根目录列表能力
    sampling: dict[str, Any] | None = None   # LLM 采样能力


class ServerCapabilities(BaseModel):
    """服务端支持的能力"""
    experimental: dict[str, Any] | None = None
    tools: dict[str, Any] | None = None       # 工具能力
    resources: dict[str, Any] | None = None   # 资源能力
    prompts: dict[str, Any] | None = None     # 提示词能力
    logging: dict[str, Any] | None = None     # 日志能力


class Implementation(BaseModel):
    """实现信息"""
    name: str
    version: str
```

### 工具类型定义

```python
# ============================================================================
# MCP 核心类型 - 工具
# ============================================================================

class ToolAnnotations(BaseModel):
    """工具行为提示"""
    title: str | None = None
    read_only_hint: bool = False       # 是否只读
    destructive_hint: bool = True       # 是否可能产生破坏性操作
    idempotent_hint: bool = False       # 是否幂等
    open_world_hint: bool = True        # 是否访问外部世界


class Tool(BaseModel):
    """工具定义"""
    name: str
    description: str
    input_schema: dict[str, Any] = Field(alias="inputSchema")  # JSON Schema
    annotations: ToolAnnotations | None = None

    class Config:
        populate_by_name = True


class TextContent(BaseModel):
    """文本内容块"""
    type: Literal["text"] = "text"
    text: str


class ImageContent(BaseModel):
    """图片内容块"""
    type: Literal["image"] = "image"
    data: str           # base64 编码
    mime_type: str = Field(alias="mimeType")


class ResourceLink(BaseModel):
    """资源链接"""
    type: Literal["resource_link"] = "resource_link"
    uri: str
    name: str
    description: str | None = None
    mime_type: str | None = Field(None, alias="mimeType")


class EmbeddedResource(BaseModel):
    """嵌入资源"""
    type: Literal["resource"] = "resource"
    resource: dict[str, Any]


# 内容块联合类型
ContentBlock = Union[TextContent, ImageContent, ResourceLink, EmbeddedResource]


class CallToolResult(BaseModel):
    """工具调用结果"""
    content: list[ContentBlock]
    is_error: bool = Field(False, alias="isError")

    class Config:
        populate_by_name = True
```

### 资源类型定义

```python
# ============================================================================
# MCP 核心类型 - 资源
# ============================================================================

class Resource(BaseModel):
    """资源定义"""
    uri: str
    name: str
    description: str | None = None
    mime_type: str | None = Field(None, alias="mimeType")


class ResourceTemplate(BaseModel):
    """资源模板"""
    uri_template: str = Field(alias="uriTemplate")
    name: str
    description: str | None = None
    mime_type: str | None = Field(None, alias="mimeType")


class TextResourceContents(BaseModel):
    """文本资源内容"""
    uri: str
    mime_type: str | None = Field(None, alias="mimeType")
    text: str


class BlobResourceContents(BaseModel):
    """二进制资源内容"""
    uri: str
    mime_type: str | None = Field(None, alias="mimeType")
    blob: str  # base64 编码


ResourceContents = Union[TextResourceContents, BlobResourceContents]
```

### 提示词类型定义

```python
# ============================================================================
# MCP 核心类型 - 提示词
# ============================================================================

class PromptArgument(BaseModel):
    """提示词参数"""
    name: str
    description: str | None = None
    required: bool = False


class Prompt(BaseModel):
    """提示词定义"""
    name: str
    description: str | None = None
    arguments: list[PromptArgument] | None = None


class PromptMessage(BaseModel):
    """提示词消息"""
    role: Literal["user", "assistant"]
    content: ContentBlock


class GetPromptResult(BaseModel):
    """获取提示词结果"""
    description: str | None = None
    messages: list[PromptMessage]
```

### 方法枚举定义

```python
# ============================================================================
# MCP 方法名称
# ============================================================================

class MCPMethod(str, Enum):
    """MCP 方法名称枚举"""
    # 生命周期
    INITIALIZE = "initialize"
    PING = "ping"
    
    # 工具
    TOOLS_LIST = "tools/list"
    TOOLS_CALL = "tools/call"
    
    # 资源
    RESOURCES_LIST = "resources/list"
    RESOURCES_READ = "resources/read"
    RESOURCES_SUBSCRIBE = "resources/subscribe"
    RESOURCES_UNSUBSCRIBE = "resources/unsubscribe"
    RESOURCES_TEMPLATES_LIST = "resources/templates/list"
    
    # 提示词
    PROMPTS_LIST = "prompts/list"
    PROMPTS_GET = "prompts/get"
    
    # 日志
    LOGGING_SET_LEVEL = "logging/setLevel"
    
    # 通知
    NOTIFICATIONS_INITIALIZED = "notifications/initialized"
    NOTIFICATIONS_TOOLS_LIST_CHANGED = "notifications/tools/list_changed"
    NOTIFICATIONS_RESOURCES_LIST_CHANGED = "notifications/resources/list_changed"
    NOTIFICATIONS_RESOURCES_UPDATED = "notifications/resources/updated"
    NOTIFICATIONS_PROMPTS_LIST_CHANGED = "notifications/prompts/list_changed"
    NOTIFICATIONS_PROGRESS = "notifications/progress"
```

## JSON-RPC 处理器实现

### 核心处理器类

```python
# protocol/jsonrpc.py

from __future__ import annotations
import json
import logging
from typing import Any, Callable, Awaitable

from .types import (
    JSONRPCRequest,
    JSONRPCResponse,
    JSONRPCNotification,
    JSONRPCError,
    ErrorCode,
)

logger = logging.getLogger(__name__)


class JSONRPCParseError(Exception):
    """JSON-RPC 消息解析错误"""
    pass


class JSONRPCHandler:
    """JSON-RPC 2.0 消息处理器
    
    功能：
    - 消息解析与验证
    - 请求/响应关联
    - 错误处理
    - 通知处理
    - 上下文传递（用于认证授权）
    """
    
    def __init__(self):
        self._method_handlers: dict[str, Callable[..., Awaitable[Any]]] = {}
        self._notification_handlers: dict[str, Callable[..., Awaitable[None]]] = {}
    
    def register_method(
        self, 
        method: str, 
        handler: Callable[..., Awaitable[Any]]
    ) -> None:
        """注册方法处理器"""
        self._method_handlers[method] = handler
        logger.debug(f"Registered method handler: {method}")
    
    def register_notification(
        self, 
        method: str, 
        handler: Callable[..., Awaitable[None]]
    ) -> None:
        """注册通知处理器"""
        self._notification_handlers[method] = handler
        logger.debug(f"Registered notification handler: {method}")
```

### 消息解析

```python
    def parse_message(
        self, 
        data: str | bytes | dict
    ) -> JSONRPCRequest | JSONRPCNotification:
        """解析原始数据为 JSON-RPC 消息
        
        Args:
            data: 原始消息数据（字符串、字节或字典）
            
        Returns:
            解析后的 JSONRPCRequest 或 JSONRPCNotification
            
        Raises:
            JSONRPCParseError: 解析失败
        """
        try:
            if isinstance(data, bytes):
                data = data.decode('utf-8')
            
            if isinstance(data, str):
                obj = json.loads(data)
            else:
                obj = data
            
            # 判断是请求还是通知
            if 'id' in obj and obj['id'] is not None:
                return JSONRPCRequest(**obj)
            else:
                return JSONRPCNotification(**obj)
                
        except json.JSONDecodeError as e:
            raise JSONRPCParseError(f"JSON parse error: {e}")
        except Exception as e:
            raise JSONRPCParseError(f"Invalid message format: {e}")
```

### 消息处理

```python
    async def handle_message(
        self, 
        message: JSONRPCRequest | JSONRPCNotification,
        context: dict[str, Any] | None = None,
    ) -> JSONRPCResponse | None:
        """处理 JSON-RPC 消息
        
        Args:
            message: 解析后的 JSON-RPC 消息
            context: 可选上下文字典（如认证信息）
            
        Returns:
            请求返回 Response，通知返回 None
        """
        if isinstance(message, JSONRPCNotification):
            await self._handle_notification(message, context)
            return None
        
        return await self._handle_request(message, context)
    
    async def _handle_request(
        self, 
        request: JSONRPCRequest,
        context: dict[str, Any] | None = None,
    ) -> JSONRPCResponse:
        """处理 JSON-RPC 请求"""
        try:
            handler = self._method_handlers.get(request.method)
            
            if handler is None:
                return JSONRPCResponse(
                    id=request.id,
                    error=JSONRPCError(
                        code=ErrorCode.METHOD_NOT_FOUND,
                        message=f"Method not found: {request.method}"
                    )
                )
            
            # 构建参数
            params = request.params or {}
            kwargs = dict(params)
            
            # 添加上下文
            if context:
                kwargs["_context"] = context
            
            # 执行处理器
            result = await handler(**kwargs)
            
            return JSONRPCResponse(
                id=request.id,
                result=result
            )
            
        except PermissionError as e:
            return JSONRPCResponse(
                id=request.id,
                error=JSONRPCError(
                    code=ErrorCode.INTERNAL_ERROR,
                    message=f"Permission denied: {str(e)}"
                )
            )
        except TypeError as e:
            return JSONRPCResponse(
                id=request.id,
                error=JSONRPCError(
                    code=ErrorCode.INVALID_PARAMS,
                    message=f"Invalid parameters: {e}"
                )
            )
        except Exception as e:
            logger.exception(f"Error handling request: {request.method}")
            return JSONRPCResponse(
                id=request.id,
                error=JSONRPCError(
                    code=ErrorCode.INTERNAL_ERROR,
                    message=str(e)
                )
            )
    
    async def _handle_notification(
        self, 
        notification: JSONRPCNotification,
        context: dict[str, Any] | None = None,
    ) -> None:
        """处理 JSON-RPC 通知"""
        handler = self._notification_handlers.get(notification.method)
        
        if handler:
            try:
                params = notification.params or {}
                kwargs = dict(params)
                if context:
                    kwargs["_context"] = context
                await handler(**kwargs)
            except Exception as e:
                logger.exception(
                    f"Error handling notification: {notification.method}"
                )
        else:
            logger.warning(
                f"No handler for notification: {notification.method}"
            )
```

### 工具方法

```python
    @staticmethod
    def create_error_response(
        request_id: str | int | None,
        code: ErrorCode,
        message: str,
        data: dict[str, Any] | None = None
    ) -> JSONRPCResponse:
        """创建错误响应"""
        return JSONRPCResponse(
            id=request_id,
            error=JSONRPCError(code=code, message=message, data=data)
        )
    
    @staticmethod
    def create_success_response(
        request_id: str | int | None,
        result: dict[str, Any]
    ) -> JSONRPCResponse:
        """创建成功响应"""
        return JSONRPCResponse(id=request_id, result=result)
```

## 方法路由实现

### 初始化方法

```python
# handlers.py

class MCPHandler:
    """MCP 方法处理器"""
    
    def __init__(self, registry: ToolRegistry, config: Config):
        self.registry = registry
        self.config = config
        self._initialized = False
        self._client_capabilities: ClientCapabilities | None = None
    
    async def handle_initialize(
        self,
        protocolVersion: str,
        capabilities: dict[str, Any],
        clientInfo: dict[str, Any],
        _context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """处理 initialize 请求"""
        
        # 验证协议版本
        if protocolVersion != "2025-11-25":
            logger.warning(f"Unsupported protocol version: {protocolVersion}")
        
        # 解析客户端能力
        self._client_capabilities = ClientCapabilities(**capabilities)
        
        # 标记已初始化
        self._initialized = True
        
        # 返回服务端能力
        return {
            "protocolVersion": "2025-11-25",
            "capabilities": {
                "tools": {"listChanged": True},
                "resources": {"subscribe": True, "listChanged": True},
                "prompts": {"listChanged": True},
                "logging": {},
            },
            "serverInfo": {
                "name": "mcp-gateway-core",
                "version": "1.0.0",
            },
            "instructions": "This gateway provides unified access to enterprise tools and resources.",
        }
    
    async def handle_ping(
        self,
        _context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """处理 ping 请求"""
        return {}
```

### 工具方法

```python
    async def handle_tools_list(
        self,
        _context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """处理 tools/list 请求"""
        tools = self.registry.list_tools()
        return {
            "tools": [tool.model_dump(by_alias=True) for tool in tools]
        }
    
    async def handle_tools_call(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
        _context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """处理 tools/call 请求"""
        result = await self.registry.execute(name, arguments or {})
        return result.model_dump(by_alias=True)
```

### 资源方法

```python
    async def handle_resources_list(
        self,
        _context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """处理 resources/list 请求"""
        resources = self.resource_registry.list_resources()
        return {
            "resources": [r.model_dump(by_alias=True) for r in resources]
        }
    
    async def handle_resources_read(
        self,
        uri: str,
        _context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """处理 resources/read 请求"""
        contents = await self.resource_registry.read(uri)
        return {
            "contents": [c.model_dump(by_alias=True) for c in contents]
        }
```

### 提示词方法

```python
    async def handle_prompts_list(
        self,
        _context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """处理 prompts/list 请求"""
        prompts = self.prompt_registry.list_prompts()
        return {
            "prompts": [p.model_dump(by_alias=True) for p in prompts]
        }
    
    async def handle_prompts_get(
        self,
        name: str,
        arguments: dict[str, str] | None = None,
        _context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """处理 prompts/get 请求"""
        result = await self.prompt_registry.get(name, arguments or {})
        return result.model_dump(by_alias=True)
```

## 处理器注册

```python
def setup_handlers(
    jsonrpc_handler: JSONRPCHandler,
    mcp_handler: MCPHandler,
) -> None:
    """注册所有 MCP 方法处理器"""
    
    # 生命周期方法
    jsonrpc_handler.register_method("initialize", mcp_handler.handle_initialize)
    jsonrpc_handler.register_method("ping", mcp_handler.handle_ping)
    
    # 工具方法
    jsonrpc_handler.register_method("tools/list", mcp_handler.handle_tools_list)
    jsonrpc_handler.register_method("tools/call", mcp_handler.handle_tools_call)
    
    # 资源方法
    jsonrpc_handler.register_method("resources/list", mcp_handler.handle_resources_list)
    jsonrpc_handler.register_method("resources/read", mcp_handler.handle_resources_read)
    jsonrpc_handler.register_method("resources/templates/list", mcp_handler.handle_resources_templates_list)
    
    # 提示词方法
    jsonrpc_handler.register_method("prompts/list", mcp_handler.handle_prompts_list)
    jsonrpc_handler.register_method("prompts/get", mcp_handler.handle_prompts_get)
    
    # 通知处理器
    jsonrpc_handler.register_notification(
        "notifications/initialized", 
        mcp_handler.handle_initialized_notification
    )
```

## 完整请求处理流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                       请求处理流程                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  HTTP Request                                                        │
│      │                                                               │
│      ▼                                                               │
│  ┌───────────────────────────────────────┐                          │
│  │         FastAPI Endpoint (/mcp)        │                          │
│  └───────────────────┬───────────────────┘                          │
│                      │                                               │
│                      ▼                                               │
│  ┌───────────────────────────────────────┐                          │
│  │       Auth Middleware (Optional)       │                          │
│  │       - JWT 验证                       │                          │
│  │       - API Key 验证                   │                          │
│  │       - 构建用户上下文                 │                          │
│  └───────────────────┬───────────────────┘                          │
│                      │                                               │
│                      ▼                                               │
│  ┌───────────────────────────────────────┐                          │
│  │         JSONRPCHandler.parse_message   │                          │
│  │         - JSON 解析                    │                          │
│  │         - 类型验证 (Pydantic)          │                          │
│  └───────────────────┬───────────────────┘                          │
│                      │                                               │
│                      ▼                                               │
│  ┌───────────────────────────────────────┐                          │
│  │       JSONRPCHandler.handle_message    │                          │
│  │       - 方法路由                       │                          │
│  │       - 参数传递                       │                          │
│  │       - 上下文注入                     │                          │
│  └───────────────────┬───────────────────┘                          │
│                      │                                               │
│                      ▼                                               │
│  ┌───────────────────────────────────────┐                          │
│  │           MCPHandler.method            │                          │
│  │           - 业务逻辑                   │                          │
│  │           - 调用 Registry              │                          │
│  └───────────────────┬───────────────────┘                          │
│                      │                                               │
│                      ▼                                               │
│  ┌───────────────────────────────────────┐                          │
│  │         JSONRPCResponse                │                          │
│  │         - 结果序列化                   │                          │
│  └───────────────────┬───────────────────┘                          │
│                      │                                               │
│                      ▼                                               │
│               HTTP Response                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 实际请求示例

### 初始化请求

```json
// 请求
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "roots": { "listChanged": true }
    },
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    }
  }
}

// 响应
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true, "listChanged": true },
      "prompts": { "listChanged": true },
      "logging": {}
    },
    "serverInfo": {
      "name": "mcp-gateway-core",
      "version": "1.0.0"
    },
    "instructions": "This gateway provides unified access..."
  }
}
```

### 工具调用请求

```json
// 请求
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "echo",
    "arguments": {
      "message": "Hello, MCP!"
    }
  }
}

// 响应
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Hello, MCP!"
      }
    ],
    "isError": false
  }
}
```

### 错误响应

```json
// 请求 (调用不存在的工具)
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "nonexistent_tool",
    "arguments": {}
  }
}

// 响应
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32603,
    "message": "Tool not found: nonexistent_tool"
  }
}
```

## 设计亮点

| 特性 | 说明 | 面试价值 |
|------|------|----------|
| Pydantic 类型系统 | 完整的类型定义，自动验证 | 类型安全设计 |
| 上下文传递 | 支持认证信息注入到处理器 | 中间件设计模式 |
| 统一错误处理 | 集中处理各类异常 | 异常处理最佳实践 |
| 方法注册模式 | 解耦消息处理与业务逻辑 | 策略模式应用 |

## 小结

本章详细介绍了 MCP 协议的 JSON-RPC 2.0 实现细节，包括完整的类型系统、消息处理器和方法路由机制。通过 Pydantic 的类型系统确保了消息格式的正确性，通过上下文传递机制支持了认证授权的集成。

**关键要点**：

1. MCP 基于 JSON-RPC 2.0，定义了 Request、Response、Notification 三种消息类型
2. 类型系统使用 Pydantic 定义，支持自动验证和序列化
3. JSONRPCHandler 负责消息解析、方法路由和错误处理
4. 上下文传递机制支持认证信息注入

下一章我们将实现工具/资源/提示词的注册中心，这是 MCP Gateway 的核心组件。

## 参考资料

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Pydantic Documentation](https://docs.pydantic.dev/)
