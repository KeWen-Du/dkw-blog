---
title: "从零到一实现mini-mcp-gateway（五）：工具注册中心"
date: "2026-02-29 13:00:00"
excerpt: "实现MCP Gateway的工具注册中心，支持工具动态注册、发现、执行和联邦化管理，是连接AI Agent与外部能力的桥梁。"
tags: ["AI", "MCP", "Registry", "Python", "架构设计"]
series:
  slug: "mini-mcp-gateway"
  title: "从零到一实现 mini-mcp-gateway"
  order: 5
---

# 从零到一实现mini-mcp-gateway（五）：工具注册中心

## 前言

工具注册中心（Tool Registry）是MCP Gateway的核心组件，负责管理所有工具的完整生命周期。它就像一个"工具市场"，AI Agent可以在这里发现、查询和调用各种工具。本文将深入介绍其设计与实现。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     Tool Registry                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Register   │    │   Discover   │    │   Execute    │  │
│  │   工具注册    │    │   工具发现    │    │   工具执行    │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│         ▼                   ▼                   ▼          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              RegisteredTool Storage                  │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │  │ Tool 1  │  │ Tool 2  │  │ Tool N  │             │   │
│  │  │ handler │  │ handler │  │ handler │             │   │
│  │  │ metadata│  │ metadata│  │ metadata│             │   │
│  │  └─────────┘  └─────────┘  └─────────┘             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 核心数据结构

```python
# src/mini_mcp_gateway/registry/tool_registry.py

from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

@dataclass
class RegisteredTool:
    """已注册工具的完整定义。"""
    tool: Tool                              # MCP工具定义
    handler: Callable[..., Awaitable[Any]]  # 异步执行函数
    server_id: str | None = None            # 所属服务器ID（联邦场景）
    metadata: dict[str, Any] = field(default_factory=dict)  # 扩展元数据


class ToolRegistry:
    """工具注册中心核心类。
    
    功能：
    - 工具注册与注销
    - 工具发现与查询
    - 工具执行与错误处理
    - 多服务器联邦支持
    """
    
    def __init__(self):
        self._tools: dict[str, RegisteredTool] = {}
        self._tools_by_server: dict[str, list[str]] = {}
        self._lock = asyncio.Lock()  # 并发安全
```

## 核心功能实现

### 1. 工具注册

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
    """注册一个新工具。
    
    Args:
        name: 工具唯一标识名
        description: 工具描述（AI理解用）
        input_schema: JSON Schema格式的参数定义
        handler: 异步执行函数
        annotations: 工具注解（只读/破坏性等提示）
        server_id: 所属服务器ID（联邦场景）
        metadata: 扩展元数据
        
    Returns:
        注册成功的Tool对象
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
        
        logger.info(f"Registered tool: {name}")
        return tool
```

### 2. 工具执行

```python
async def execute(
    self, 
    name: str, 
    arguments: dict[str, Any]
) -> CallToolResult:
    """执行工具并返回结果。
    
    包含完整的错误处理和结果转换。
    """
    registered = self._tools.get(name)
    
    if registered is None:
        return CallToolResult(
            content=[TextContent(text=f"Tool not found: {name}")],
            is_error=True,
        )
    
    try:
        # 调用实际的handler
        result = await registered.handler(**arguments)
        
        # 将结果转换为MCP Content格式
        content = self._convert_result(result)
        
        return CallToolResult(content=content, is_error=False)
        
    except Exception as e:
        logger.exception(f"Error executing tool: {name}")
        return CallToolResult(
            content=[TextContent(text=f"Error: {str(e)}")],
            is_error=True,
        )

def _convert_result(self, result: Any) -> list[ContentBlock]:
    """将各种类型的结果转换为MCP Content块。"""
    if isinstance(result, str):
        return [TextContent(text=result)]
    
    if isinstance(result, dict):
        import json
        return [TextContent(text=json.dumps(result, indent=2))]
    
    if isinstance(result, list):
        return [TextContent(text=str(item)) for item in result]
    
    return [TextContent(text=str(result))]
```

### 3. 工具发现

```python
def list_tools(
    self, 
    server_id: str | None = None,
    pattern: str | None = None,
) -> list[Tool]:
    """列出工具，支持过滤。
    
    Args:
        server_id: 按服务器ID过滤
        pattern: 按名称模式过滤（支持通配符）
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

## 实际使用示例

### 注册内置工具

```python
async def _register_builtin_tools(registry: ToolRegistry):
    """注册网关内置工具。"""
    
    # Echo工具 - 用于测试
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
        handler=_handle_echo,
    )
    
    # 服务器信息工具
    await registry.register(
        name="server_info",
        description="Get information about the MCP Gateway server",
        input_schema={"type": "object", "properties": {}},
        handler=_handle_server_info,
    )
```

### 通过MCP协议调用

```json
// AI Agent发送的请求
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "echo",
    "arguments": {
      "message": "Hello, MCP Gateway!"
    }
  }
}

// Gateway返回的结果
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {"type": "text", "text": "Hello, MCP Gateway!"}
    ],
    "isError": false
  }
}
```

## 设计亮点

| 特性 | 说明 | 面试价值 |
|------|------|----------|
| 异步安全 | 使用asyncio.Lock保护并发访问 | 并发编程能力 |
| 联邦支持 | 按server_id分组管理 | 分布式设计思维 |
| 结果转换 | 自动将各种类型转为MCP格式 | 协议适配能力 |
| 错误隔离 | 工具执行错误不影响网关 | 容错设计 |

## 小结

工具注册中心是MCP Gateway的"心脏"，连接了AI Agent与各种外部能力。下一章我们将实现REST适配器，将现有的REST API自动包装为MCP工具。
