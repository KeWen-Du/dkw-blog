---
title: "从零到一实现mini-mcp-gateway（四）：核心服务器实现"
date: "2026-02-29 12:00:00"
excerpt: "实现MCP Gateway的核心服务器，包括FastAPI应用搭建、HTTP/SSE端点、JSON-RPC消息处理和MCP方法路由。"
tags: ["AI", "MCP", "FastAPI", "Python", "Server"]
series:
  slug: "mini-mcp-gateway"
  title: "从零到一实现 mini-mcp-gateway"
  order: 4
---

# 从零到一实现mini-mcp-gateway（四）：核心服务器实现

## 前言

本章我们将实现mini-mcp-gateway的核心服务器，包括FastAPI应用搭建、多传输协议端点、JSON-RPC消息处理和MCP方法路由。所有代码都基于实际可运行的项目。

## FastAPI应用搭建

### 应用入口

``python
# src/mini_mcp_gateway/main.py

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from .config import get_config
from .protocol import (
    JSONRPCRequest,
    JSONRPCResponse,
    JSONRPCNotification,
    ErrorCode,
    InitializeParams,
    InitializeResult,
    ServerCapabilities,
    Implementation,
)
from .protocol.jsonrpc import JSONRPCHandler, JSONRPCParseError
from .registry.tool_registry import get_registry

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format=\"%(asctime)s - %(name)s - %(levelname)s - %(message)s\"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    \"\"\"应用生命周期管理\"\"\"
    config = get_config()
    logger.info(f\"Starting {config.server.app_name} v{config.server.app_version}\")
    
    # 初始化工具注册中心
    registry = get_registry()
    
    # 注册内置工具
    await _register_builtin_tools(registry)
    
    yield
    
    # 清理资源
    logger.info(\"Shutting down...\")


def create_app() -> FastAPI:
    \"\"\"创建并配置FastAPI应用\"\"\"
    config = get_config()
    
    app = FastAPI(
        title=config.server.app_name,
        version=config.server.app_version,
        description=\"A lightweight MCP Gateway for AI agents\",
        lifespan=lifespan,
    )
    
    # 配置CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.server.cors_origins,
        allow_credentials=config.server.cors_allow_credentials,
        allow_methods=config.server.cors_allow_methods,
        allow_headers=config.server.cors_allow_headers,
    )
    
    # 创建JSON-RPC处理器
    handler = JSONRPCHandler()
    
    # 注册MCP方法处理器
    handler.register_method(\"initialize\", handle_initialize)
    handler.register_method(\"ping\", handle_ping)
    handler.register_method(\"tools/list\", handle_tools_list)
    handler.register_method(\"tools/call\", handle_tools_call)
    
    # 存储处理器到应用状态
    app.state.jsonrpc_handler = handler
    
    # 注册路由
    register_routes(app, handler)
    
    return app


def register_routes(app: FastAPI, handler: JSONRPCHandler):
    \"\"\"注册API路由\"\"\"
    
    @app.post(\"/mcp\")
    async def mcp_endpoint(request: Request):
        \"\"\"MCP JSON-RPC端点（HTTP传输）\"\"\"
        return await _handle_mcp_request(request, handler)
    
    @app.post(\"/sse\")
    async def sse_endpoint(request: Request):
        \"\"\"SSE端点（流式传输）\"\"\"
        return await _handle_sse_request(request, handler)
    
    @app.get(\"/health\")
    async def health_check():
        \"\"\"健康检查端点\"\"\"
        config = get_config()
        return {\"status\": \"healthy\", \"version\": config.server.app_version}
    
    @app.get(\"/tools\")
    async def list_tools():
        \"\"\"列出所有已注册工具（REST API）\"\"\"
        registry = get_registry()
        tools = registry.list_tools()
        return {\"tools\": [t.model_dump(by_alias=True) for t in tools]}
``

### 配置管理

``python
# src/mini_mcp_gateway/config.py

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ServerConfig(BaseSettings):
    \"\"\"服务器配置\"\"\"
    model_config = SettingsConfigDict(
        env_prefix=\"MCP_GATEWAY_\",
        env_file=\".env\",
        env_file_encoding=\"utf-8\",
        extra=\"ignore\",
    )
    
    host: str = \"0.0.0.0\"
    port: int = 8000
    debug: bool = False
    workers: int = 1
    
    app_name: str = \"mini-mcp-gateway\"
    app_version: str = \"0.1.0\"
    protocol_version: str = \"2025-11-25\"
    
    cors_origins: list[str] = Field(default_factory=lambda: [\"*\"])


class AuthConfig(BaseSettings):
    \"\"\"认证配置\"\"\"
    model_config = SettingsConfigDict(
        env_prefix=\"MCP_AUTH_\",
        env_file=\".env\",
        extra=\"ignore\",
    )
    
    enabled: bool = True
    secret_key: str = \"your-secret-key-change-in-production\"
    algorithm: str = \"HS256\"
    access_token_expire_minutes: int = 30


class DatabaseConfig(BaseSettings):
    \"\"\"数据库配置\"\"\"
    model_config = SettingsConfigDict(
        env_prefix=\"MCP_DB_\",
        env_file=\".env\",
        extra=\"ignore\",
    )
    
    url: str = \"sqlite+aiosqlite:///./mcp_gateway.db\"
    echo: bool = False


class Config(BaseSettings):
    \"\"\"主配置\"\"\"
    model_config = SettingsConfigDict(
        env_file=\".env\",
        env_file_encoding=\"utf-8\",
        extra=\"ignore\",
    )
    
    server: ServerConfig = Field(default_factory=ServerConfig)
    auth: AuthConfig = Field(default_factory=AuthConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)


@lru_cache
def get_config() -> Config:
    \"\"\"获取缓存配置实例\"\"\"
    return Config()
``

## HTTP和SSE端点实现

### HTTP端点

``python
async def _handle_mcp_request(
    request: Request, 
    handler: JSONRPCHandler
) -> JSONResponse:
    \"\"\"处理单个MCP请求\"\"\"
    try:
        data = await request.json()
        message = handler.parse_message(data)
        response = await handler.handle_message(message)
        
        if response:
            return JSONResponse(response.model_dump(exclude_none=True))
        else:
            # 通知消息，无响应
            return JSONResponse({\"status\": \"ok\"})
            
    except JSONRPCParseError as e:
        return JSONResponse(
            JSONRPCResponse(
                id=None,
                error={\"code\": ErrorCode.PARSE_ERROR, \"message\": str(e)}
            ).model_dump(exclude_none=True),
            status_code=400,
        )
    except Exception as e:
        logger.exception(\"Error handling MCP request\")
        return JSONResponse(
            JSONRPCResponse(
                id=None,
                error={\"code\": ErrorCode.INTERNAL_ERROR, \"message\": str(e)}
            ).model_dump(exclude_none=True),
            status_code=500,
        )
``

### SSE端点

``python
async def _handle_sse_request(
    request: Request, 
    handler: JSONRPCHandler
):
    \"\"\"处理MCP请求（SSE流式传输）\"\"\"
    async def event_generator():
        try:
            data = await request.json()
            message = handler.parse_message(data)
            response = await handler.handle_message(message)
            
            if response:
                import json
                yield {
                    \"event\": \"message\",
                    \"data\": json.dumps(response.model_dump(exclude_none=True))
                }
        except Exception as e:
            import json
            yield {
                \"event\": \"error\",
                \"data\": json.dumps({\"error\": str(e)})
            }
    
    return EventSourceResponse(event_generator())
``

## MCP方法处理器

### Initialize处理器

``python
async def handle_initialize(**params) -> dict[str, Any]:
    \"\"\"处理initialize请求\"\"\"
    config = get_config()
    
    # 解析并验证参数
    init_params = InitializeParams(**params)
    logger.info(
        f\"Client connected: {init_params.client_info.name} \" 
        f\"v{init_params.client_info.version}\"
    )
    
    # 构建响应
    result = InitializeResult(
        protocol_version=config.server.protocol_version,
        capabilities=ServerCapabilities(
            tools={\"listChanged\": True},
            resources={\"subscribe\": True, \"listChanged\": True},
            prompts={\"listChanged\": True},
        ),
        server_info=Implementation(
            name=config.server.app_name,
            version=config.server.app_version,
        ),
        instructions=\"Welcome to mini-mcp-gateway! Use tools/list to see available tools.\",
    )
    
    return result.model_dump(by_alias=True)
``

### Tools处理器

``python
from .protocol import ListToolsResult, CallToolParams

async def handle_tools_list(**params) -> dict[str, Any]:
    \"\"\"处理tools/list请求\"\"\"
    registry = get_registry()
    tools = registry.list_tools()
    
    result = ListToolsResult(
        tools=tools,
        next_cursor=None,
    )
    
    return result.model_dump(by_alias=True)


async def handle_tools_call(**params) -> dict[str, Any]:
    \"\"\"处理tools/call请求\"\"\"
    call_params = CallToolParams(**params)
    registry = get_registry()
    
    result = await registry.execute(
        name=call_params.name,
        arguments=call_params.arguments or {},
    )
    
    return result.model_dump(by_alias=True)
``

## 内置工具实现

``python
async def _register_builtin_tools(registry):
    \"\"\"注册内置Gateway工具\"\"\"
    
    # Echo工具 - 用于测试
    await registry.register(
        name=\"echo\",
        description=\"Echo back the input message\",
        input_schema={
            \"type\": \"object\",
            \"properties\": {
                \"message\": {
                    \"type\": \"string\",
                    \"description\": \"Message to echo back\"
                }
            },
            \"required\": [\"message\"]
        },
        handler=_handle_echo,
    )
    
    # Server信息工具
    await registry.register(
        name=\"server_info\",
        description=\"Get information about the MCP Gateway server\",
        input_schema={\"type\": \"object\", \"properties\": {}},
        handler=_handle_server_info,
    )
    
    logger.info(\"Registered built-in tools: echo, server_info\")


async def _handle_echo(message: str) -> str:
    \"\"\"处理echo工具\"\"\"
    return message


async def _handle_server_info() -> dict[str, Any]:
    \"\"\"处理server_info工具\"\"\"
    config = get_config()
    registry = get_registry()
    
    return {
        \"name\": config.server.app_name,
        \"version\": config.server.app_version,
        \"protocol_version\": config.server.protocol_version,
        \"tools_count\": len(registry.list_tools()),
    }
``

## 启动服务器

``python
def main():
    \"\"\"主入口点\"\"\"
    import uvicorn
    
    config = get_config()
    
    uvicorn.run(
        \"mini_mcp_gateway.main:create_app\",
        host=config.server.host,
        port=config.server.port,
        workers=config.server.workers,
        reload=config.server.debug,
        factory=True,
    )


if __name__ == \"__main__\":
    main()
``

## 完整交互示例

### 启动服务器

``bash
# 安装依赖
pip install -e \".\"

# 启动服务器
python -m mini_mcp_gateway.main
``

### 初始化连接

``bash
curl -X POST http://localhost:8000/mcp \\
  -H \"Content-Type: application/json\" \\
  -d '{
    \"jsonrpc\": \"2.0\",
    \"id\": \"init-1\",
    \"method\": \"initialize\",
    \"params\": {
      \"protocolVersion\": \"2025-11-25\",
      \"capabilities\": {},
      \"clientInfo\": {\"name\": \"test-client\", \"version\": \"1.0.0\"}
    }
  }'
``

### 获取工具列表

``bash
curl -X POST http://localhost:8000/mcp \\
  -H \"Content-Type: application/json\" \\
  -d '{
    \"jsonrpc\": \"2.0\",
    \"id\": \"tools-1\",
    \"method\": \"tools/list\"
  }'
``

### 调用工具

``bash
curl -X POST http://localhost:8000/mcp \\
  -H \"Content-Type: application/json\" \\
  -d '{
    \"jsonrpc\": \"2.0\",
    \"id\": \"call-1\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"echo\",
      \"arguments\": {\"message\": \"Hello, MCP Gateway!\"}
    }
  }'
``

## 小结

本章实现了mini-mcp-gateway的核心服务器：

1. **FastAPI应用**：完整的生命周期管理和中间件配置
2. **多传输端点**：HTTP和SSE两种传输方式
3. **JSON-RPC处理**：消息解析、路由、响应生成
4. **MCP方法实现**：initialize、ping、tools/list、tools/call
5. **内置工具**：echo和server_info用于测试

下一章我们将实现工具注册中心，支持动态工具注册和联邦化管理。

## 参考资料

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SSE Starlette](https://github.com/sysid/sse-starlette)
- [Uvicorn](https://www.uvicorn.org/)
