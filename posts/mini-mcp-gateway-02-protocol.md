---
title: "从零到一实现mini-mcp-gateway（二）：MCP协议深度解析"
date: "2026-02-29 10:00:00"
excerpt: "深入解析MCP协议的技术规范，包括JSON-RPC消息格式、传输层协议、核心能力定义，为实现MCP Gateway奠定理论基础。"
tags: ["AI", "MCP", "JSON-RPC", "Protocol", "Python"]
series:
  slug: "mini-mcp-gateway"
  title: "从零到一实现 mini-mcp-gateway"
  order: 2
---

# 从零到一实现mini-mcp-gateway（二）：MCP协议深度解析

## 前言

MCP（Model Context Protocol）是基于JSON-RPC 2.0构建的应用层协议，专门为AI应用与外部工具的交互而设计。理解MCP协议的技术细节是实现MCP Gateway的基础。本章将深入解析MCP协议的核心规范。

## MCP架构模型

MCP采用Client-Server架构，定义了三种核心角色：

```
┌─────────────────────────────────────────────────────────────┐
│                         MCP 架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐         ┌─────────────┐                   │
│  │    Host     │────────▶│   Client    │                   │
│  │             │         │             │                   │
│  │ AI应用      │         │ 连接器      │                   │
│  │ (Claude/GPT)│         │ (MCP Client)│                   │
│  └─────────────┘         └──────┬──────┘                   │
│                                 │                           │
│                                 │ MCP Protocol              │
│                                 │ (JSON-RPC over Transport) │
│                                 │                           │
│                          ┌──────▼──────┐                   │
│                          │   Server    │                   │
│                          │             │                   │
│                          │ MCP Server  │                   │
│                          │ (工具提供方) │                   │
│                          └──────┬──────┘                   │
│                                 │                           │
│          ┌──────────────────────┼──────────────────────┐   │
│          ▼                      ▼                      ▼   │
│     ┌─────────┐           ┌─────────┐           ┌─────────┐│
│     │ Tools   │           │Resources│           │ Prompts ││
│     │ 工具    │           │ 资源    │           │ 提示词  ││
│     └─────────┘           └─────────┘           └─────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 角色定义

| 角色 | 职责 | 示例 |
|------|------|------|
| **Host** | AI应用，发起连接，管理用户交互 | Claude Desktop、VSCode + Cline |
| **Client** | 连接器，管理与Server的连接 | Claude内置的MCP Client |
| **Server** | 服务提供者，暴露工具、资源、提示词 | GitHub MCP Server、Slack MCP Server |

### 连接生命周期

```
┌────────┐                              ┌────────┐
│ Client │                              │ Server │
└───┬────┘                              └───┬────┘
    │                                       │
    │  ──────────── initialize ───────────▶ │
    │  {protocolVersion, capabilities}      │
    │                                       │
    │  ◀──────── initialized ─────────────  │
    │  {capabilities}                       │
    │                                       │
    │  ══════════ 正常通信阶段 ═══════════  │
    │                                       │
    │  ─────── tools/list ───────────────▶  │
    │                                       │
    │  ◀────── tools/list response ───────  │
    │                                       │
    │  ─────── tools/call ───────────────▶  │
    │                                       │
    │  ◀────── tools/call response ──────  │
    │                                       │
    │  ══════════════════════════════════   │
    │                                       │
    │  ──────────── shutdown ────────────▶  │
    │                                       │
    │  ◀──────── shutdown response ───────  │
    │                                       │
```

## JSON-RPC 2.0消息格式

MCP基于JSON-RPC 2.0，定义了请求、响应、通知三种消息类型。

### 请求消息（Request）

```json
{
  "jsonrpc": "2.0",
  "id": "request-001",
  "method": "tools/call",
  "params": {
    "name": "search_repositories",
    "arguments": {
      "query": "mcp-gateway"
    }
  }
}
```

**字段说明**：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| jsonrpc | string | 是 | 固定值 "2.0" |
| id | string/number | 是 | 请求标识，用于匹配响应 |
| method | string | 是 | 方法名称 |
| params | object | 否 | 方法参数 |

### 响应消息（Response）

**成功响应**：

```json
{
  "jsonrpc": "2.0",
  "id": "request-001",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 42 repositories matching 'mcp-gateway'"
      }
    ]
  }
}
```

**错误响应**：

```json
{
  "jsonrpc": "2.0",
  "id": "request-001",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "field": "query",
      "reason": "required field missing"
    }
  }
}
```

**标准错误码**：

| 错误码 | 含义 | 说明 |
|--------|------|------|
| -32700 | Parse error | JSON解析失败 |
| -32600 | Invalid Request | 无效请求 |
| -32601 | Method not found | 方法不存在 |
| -32602 | Invalid params | 无效参数 |
| -32603 | Internal error | 内部错误 |
| -32000 to -32099 | Server error | 服务器自定义错误 |

### 通知消息（Notification）

通知不需要响应，用于单向通信：

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///path/to/file"
  }
}
```

## MCP核心能力

MCP Server可以向Client暴露三类核心能力：

### 1. Tools（工具）

工具是AI模型可以调用的函数：

```json
{
  "name": "search_repositories",
  "description": "Search GitHub repositories by query",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query"
      },
      "limit": {
        "type": "integer",
        "description": "Maximum results",
        "default": 10
      }
    },
    "required": ["query"]
  }
}
```

**工具定义结构**：

```python
from pydantic import BaseModel
from typing import Any

class Tool(BaseModel):
    name: str                    # 工具名称，全局唯一
    description: str             # 工具描述，AI理解用
    inputSchema: dict[str, Any]  # JSON Schema定义参数

class ToolResult(BaseModel):
    content: list[ContentBlock]  # 返回内容
    isError: bool = False        # 是否错误

class ContentBlock(BaseModel):
    type: str                    # "text" | "image" | "resource"
    text: str | None = None
    data: str | None = None      # base64 for image
    mimeType: str | None = None
```

### 2. Resources（资源）

资源是可读取的数据源：

```json
{
  "uri": "github://repos/owner/repo/issues",
  "name": "Repository Issues",
  "description": "List of issues in the repository",
  "mimeType": "application/json"
}
```

**资源类型**：

| 类型 | URI格式 | 说明 |
|------|---------|------|
| 文本资源 | `file:///path/to/file` | 本地文件 |
| HTTP资源 | `https://api.example.com/data` | Web资源 |
| 自定义资源 | `custom://resource/id` | 自定义协议 |

**资源模板**：

```json
{
  "uriTemplate": "github://repos/{owner}/{repo}/issues",
  "name": "Repository Issues",
  "description": "Issues for any repository",
  "mimeType": "application/json"
}
```

### 3. Prompts（提示词）

提示词是预定义的提示模板：

```json
{
  "name": "code_review",
  "description": "Generate code review suggestions",
  "arguments": [
    {
      "name": "file_path",
      "description": "Path to the file to review",
      "required": true
    },
    {
      "name": "focus",
      "description": "Focus area: security, performance, or style",
      "required": false
    }
  ]
}
```

## 传输层协议

MCP支持多种传输层，适用于不同场景：

### 1. stdio传输

最简单的传输方式，通过标准输入输出通信：

```python
import sys
import json

async def handle_stdio():
    """处理stdio传输的MCP消息"""
    for line in sys.stdin:
        try:
            message = json.loads(line)
            response = await process_message(message)
            if response:
                print(json.dumps(response), flush=True)
        except json.JSONDecodeError as e:
            error_response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32700,
                    "message": "Parse error"
                }
            }
            print(json.dumps(error_response), flush=True)
```

**适用场景**：
- 本地MCP Server
- Claude Desktop集成
- 命令行工具

### 2. SSE传输（Server-Sent Events）

HTTP长连接，适合Web环境：

```
Client Request:
POST /mcp HTTP/1.1
Content-Type: application/json

{"jsonrpc":"2.0","id":"1","method":"initialize","params":{...}}

Server Response:
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: message
data: {"jsonrpc":"2.0","id":"1","result":{...}}

event: message
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{...}}
```

**Python实现**：

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import json

app = FastAPI()

@app.post("/mcp")
async def mcp_endpoint(request: Request):
    """SSE传输的MCP端点"""
    message = await request.json()
    
    async def event_stream():
        # 处理请求
        response = await process_message(message)
        yield f"event: message\ndata: {json.dumps(response)}\n\n"
        
        # 可以发送多个事件
        notification = {
            "jsonrpc": "2.0",
            "method": "notifications/progress",
            "params": {"progress": 100}
        }
        yield f"event: message\ndata: {json.dumps(notification)}\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream"
    )
```

### 3. WebSocket传输

双向通信，适合需要实时交互的场景：

```python
from fastapi import WebSocket
import json

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket传输的MCP端点"""
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            response = await process_message(message)
            if response:
                await websocket.send_json(response)
    except Exception as e:
        print(f"WebSocket error: {e}")
```

### 4. HTTP传输

简单的请求-响应模式：

```python
@app.post("/mcp")
async def http_endpoint(request: Request):
    """HTTP传输的MCP端点"""
    message = await request.json()
    response = await process_message(message)
    return response
```

## 协议交互流程

### 初始化握手

```python
# 1. Client发送initialize请求
initialize_request = {
    "jsonrpc": "2.0",
    "id": "init-1",
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-11-25",
        "capabilities": {
            "tools": {},
            "resources": {},
            "prompts": {}
        },
        "clientInfo": {
            "name": "mini-mcp-gateway",
            "version": "1.0.0"
        }
    }
}

# 2. Server响应capabilities
initialize_response = {
    "jsonrpc": "2.0",
    "id": "init-1",
    "result": {
        "protocolVersion": "2025-11-25",
        "capabilities": {
            "tools": {"listChanged": True},
            "resources": {"subscribe": True, "listChanged": True},
            "prompts": {"listChanged": True}
        },
        "serverInfo": {
            "name": "github-mcp-server",
            "version": "1.0.0"
        }
    }
}

# 3. Client发送initialized通知
initialized_notification = {
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
}
```

### 工具调用流程

```python
# 1. 获取工具列表
tools_list_request = {
    "jsonrpc": "2.0",
    "id": "tools-1",
    "method": "tools/list"
}

tools_list_response = {
    "jsonrpc": "2.0",
    "id": "tools-1",
    "result": {
        "tools": [
            {
                "name": "search_repositories",
                "description": "Search GitHub repositories",
                "inputSchema": {...}
            }
        ]
    }
}

# 2. 调用工具
tool_call_request = {
    "jsonrpc": "2.0",
    "id": "call-1",
    "method": "tools/call",
    "params": {
        "name": "search_repositories",
        "arguments": {
            "query": "mcp-gateway",
            "limit": 10
        }
    }
}

tool_call_response = {
    "jsonrpc": "2.0",
    "id": "call-1",
    "result": {
        "content": [
            {
                "type": "text",
                "text": "Found 42 repositories..."
            }
        ],
        "isError": False
    }
}
```

### 资源订阅流程

```python
# 1. 获取资源列表
resources_list_request = {
    "jsonrpc": "2.0",
    "id": "res-1",
    "method": "resources/list"
}

# 2. 订阅资源更新
subscribe_request = {
    "jsonrpc": "2.0",
    "id": "sub-1",
    "method": "resources/subscribe",
    "params": {
        "uri": "file:///path/to/watch"
    }
}

# 3. Server推送更新通知
update_notification = {
    "jsonrpc": "2.0",
    "method": "notifications/resources/updated",
    "params": {
        "uri": "file:///path/to/watch"
    }
}
```

## Python类型定义

基于以上协议分析，我们定义完整的类型系统：

```python
# src/protocol/types.py

from pydantic import BaseModel, Field
from typing import Any, Literal
from enum import Enum

# ==================== 基础类型 ====================

class JSONRPCVersion(str, Enum):
    V2_0 = "2.0"

class ErrorCode(int, Enum):
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603
    SERVER_ERROR_START = -32000
    SERVER_ERROR_END = -32099

# ==================== 消息类型 ====================

class JSONRPCRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: str | int | None = None
    method: str
    params: dict[str, Any] | None = None

class JSONRPCError(BaseModel):
    code: int
    message: str
    data: dict[str, Any] | None = None

class JSONRPCResponse(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: str | int | None = None
    result: dict[str, Any] | None = None
    error: JSONRPCError | None = None

class JSONRPCNotification(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    method: str
    params: dict[str, Any] | None = None

# ==================== 能力定义 ====================

class ClientCapabilities(BaseModel):
    """Client能力声明"""
    experimental: dict[str, Any] | None = None
    roots: dict[str, Any] | None = None
    sampling: dict[str, Any] | None = None

class ServerCapabilities(BaseModel):
    """Server能力声明"""
    experimental: dict[str, Any] | None = None
    tools: dict[str, Any] | None = None
    resources: dict[str, Any] | None = None
    prompts: dict[str, Any] | None = None
    logging: dict[str, Any] | None = None

class Implementation(BaseModel):
    """实现信息"""
    name: str
    version: str

# ==================== 工具定义 ====================

class ToolInputSchema(BaseModel):
    """工具输入Schema"""
    type: Literal["object"] = "object"
    properties: dict[str, Any]
    required: list[str] | None = None

class Tool(BaseModel):
    """工具定义"""
    name: str
    description: str
    inputSchema: ToolInputSchema
    annotations: dict[str, Any] | None = None

class TextContent(BaseModel):
    """文本内容块"""
    type: Literal["text"] = "text"
    text: str

class ImageContent(BaseModel):
    """图片内容块"""
    type: Literal["image"] = "image"
    data: str  # base64
    mimeType: str

class ResourceContent(BaseModel):
    """资源内容块"""
    type: Literal["resource"] = "resource"
    resource: dict[str, Any]

ContentBlock = TextContent | ImageContent | ResourceContent

class ToolResult(BaseModel):
    """工具调用结果"""
    content: list[ContentBlock]
    isError: bool = False

# ==================== 资源定义 ====================

class Resource(BaseModel):
    """资源定义"""
    uri: str
    name: str
    description: str | None = None
    mimeType: str | None = None

class ResourceTemplate(BaseModel):
    """资源模板"""
    uriTemplate: str
    name: str
    description: str | None = None
    mimeType: str | None = None

class ResourceContents(BaseModel):
    """资源内容"""
    uri: str
    mimeType: str | None = None
    text: str | None = None
    blob: str | None = None  # base64

# ==================== 提示词定义 ====================

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

# ==================== 初始化 ====================

class InitializeParams(BaseModel):
    """初始化参数"""
    protocolVersion: str
    capabilities: ClientCapabilities
    clientInfo: Implementation

class InitializeResult(BaseModel):
    """初始化结果"""
    protocolVersion: str
    capabilities: ServerCapabilities
    serverInfo: Implementation
    instructions: str | None = None
```

## 方法汇总

### Client→Server方法

| 方法 | 说明 | 参数 |
|------|------|------|
| `initialize` | 初始化连接 | protocolVersion, capabilities, clientInfo |
| `ping` | 心跳检测 | - |
| `tools/list` | 获取工具列表 | - |
| `tools/call` | 调用工具 | name, arguments |
| `resources/list` | 获取资源列表 | - |
| `resources/read` | 读取资源 | uri |
| `resources/subscribe` | 订阅资源 | uri |
| `resources/unsubscribe` | 取消订阅 | uri |
| `prompts/list` | 获取提示词列表 | - |
| `prompts/get` | 获取提示词 | name, arguments |
| `logging/setLevel` | 设置日志级别 | level |

### Server→Client通知

| 方法 | 说明 | 参数 |
|------|------|------|
| `notifications/initialized` | 初始化完成 | - |
| `notifications/tools/list_changed` | 工具列表变化 | - |
| `notifications/resources/list_changed` | 资源列表变化 | - |
| `notifications/resources/updated` | 资源更新 | uri |
| `notifications/prompts/list_changed` | 提示词列表变化 | - |
| `notifications/progress` | 进度通知 | progress, total |

## 小结

本章深入解析了MCP协议的技术规范：

**关键要点**：

1. MCP基于JSON-RPC 2.0，定义了请求、响应、通知三种消息类型
2. Server暴露三类核心能力：Tools（工具）、Resources（资源）、Prompts（提示词）
3. 支持四种传输层：stdio、SSE、WebSocket、HTTP
4. 初始化握手建立协议版本和能力协商
5. Python类型系统提供了完整的协议建模

下一章我们将基于这些协议知识，设计mini-mcp-gateway的整体架构。

## 参考资料

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [Pydantic Documentation](https://docs.pydantic.dev/)
