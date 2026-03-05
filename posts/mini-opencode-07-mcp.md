---
title: "从零到一实现mini-opencode（七）：MCP协议支持"
date: "2026-03-03 15:00:00"
excerpt: "实现mini-opencode的MCP（Model Context Protocol）协议支持，集成外部工具和服务，扩展AI能力边界。"
tags: ["AI", "LLM", "MCP", "Protocol", "TypeScript"]
series:
  slug: "mini-opencode"
  title: "从零到一实现 mini-opencode"
  order: 7
---

# 从零到一实现mini-opencode（七）：MCP协议支持

## 前言

MCP（Model Context Protocol）是Anthropic推出的开放协议，用于连接AI助手与外部工具和数据源。

> **注意**：本章为扩展内容。mini-opencode简化版当前未包含MCP支持，完整版OpenCode支持MCP协议。本章介绍MCP的设计理念和实现思路，供读者参考扩展。

## MCP协议概述

### 核心概念

```
┌──────────────────┐          ┌──────────────────┐
│   mini-opencode  │  ◄────►  │   MCP Server     │
│    (Client)      │   MCP    │   (Tools/Data)   │
└──────────────────┘  Protocol└──────────────────┘
```

MCP定义了三种资源类型：

| 类型 | 说明 | 示例 |
|------|------|------|
| Tools | 可调用的函数 | 文件操作、API调用 |
| Resources | 可读取的数据 | 文件内容、数据库记录 |
| Prompts | 预定义提示词 | 代码审查模板 |

### 传输方式

MCP支持两种传输方式：

1. **Stdio** - 通过标准输入/输出通信
2. **HTTP+SSE** - 通过HTTP和Server-Sent Events通信

## MCP客户端实现

### 安装依赖

```bash
bun add @modelcontextprotocol/sdk
```

### MCP客户端类

```typescript
// src/mcp/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import {
  ListToolsResultSchema,
  CallToolResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { Logger } from "@/util/logger"

const log = Logger.create({ service: "mcp-client" })

export interface MCPServerConfig {
  name: string
  type: "stdio" | "sse"
  command?: string[]       // for stdio
  url?: string             // for sse
  env?: Record<string, string>
  timeout?: number
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, any>
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export class MCPClient {
  private client: Client | null = null
  private transport: StdioClientTransport | SSEClientTransport | null = null
  private config: MCPServerConfig

  constructor(config: MCPServerConfig) {
    this.config = config
  }

  // 连接到MCP服务器
  async connect(): Promise<void> {
    log.info("Connecting to MCP server", { name: this.config.name, type: this.config.type })

    if (this.config.type === "stdio") {
      const [command, ...args] = this.config.command ?? []
      this.transport = new StdioClientTransport({
        command,
        args,
        env: {
          ...process.env,
          ...this.config.env,
        },
      })
    } else {
      this.transport = new SSEClientTransport(
        new URL(this.config.url!)
      )
    }

    this.client = new Client(
      { name: "mini-opencode", version: "1.0.0" },
      { capabilities: {} }
    )

    await this.client.connect(this.transport)
    log.info("Connected to MCP server", { name: this.config.name })
  }

  // 断开连接
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
      this.transport = null
    }
  }

  // 列出可用工具
  async listTools(): Promise<MCPTool[]> {
    if (!this.client) throw new Error("Not connected")

    const result = await this.client.request(
      { method: "tools/list", params: {} },
      ListToolsResultSchema
    )

    return result.tools.map(tool => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema as Record<string, any>,
    }))
  }

  // 调用工具
  async callTool(
    name: string,
    args: Record<string, any>
  ): Promise<{
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
    isError?: boolean
  }> {
    if (!this.client) throw new Error("Not connected")

    log.info("Calling MCP tool", { name, args })

    const result = await this.client.request(
      {
        method: "tools/call",
        params: { name, arguments: args },
      },
      CallToolResultSchema
    )

    return {
      content: result.content.map(c => {
        if (c.type === "text") {
          return { type: "text", text: c.text }
        }
        if (c.type === "image") {
          return { type: "image", data: c.data, mimeType: c.mimeType }
        }
        return { type: c.type }
      }),
      isError: result.isError,
    }
  }

  // 列出资源
  async listResources(): Promise<MCPResource[]> {
    if (!this.client) throw new Error("Not connected")

    const result = await this.client.request(
      { method: "resources/list", params: {} },
      ListResourcesResultSchema
    )

    return result.resources.map(r => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    }))
  }

  // 读取资源
  async readResource(uri: string): Promise<Array<{
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }>> {
    if (!this.client) throw new Error("Not connected")

    const result = await this.client.request(
      { method: "resources/read", params: { uri } },
      ReadResourceResultSchema
    )

    return result.contents.map(c => ({
      uri: c.uri,
      mimeType: c.mimeType,
      text: c.text,
      blob: c.blob,
    }))
  }
}
```

## MCP工具集成

### 工具转换器

```typescript
// src/mcp/tool-adapter.ts
import { MCPTool } from "./client"
import { ToolDefinition, defineTool, ToolContext, ToolResult } from "@/tool/tool"
import { MCPClient } from "./client"
import z from "zod"

export function convertMCPToolToNative(
  mcpTool: MCPTool,
  client: MCPClient,
  serverName: string
): ToolDefinition {
  // 从inputSchema创建Zod schema
  const parameters = schemaToZod(mcpTool.inputSchema)

  return defineTool({
    name: `mcp_${serverName}_${mcpTool.name}`,
    description: mcpTool.description,
    parameters,
    execute: async (params, ctx): Promise<ToolResult> => {
      const result = await client.callTool(mcpTool.name, params)

      // 处理结果
      let output = ""
      for (const content of result.content) {
        if (content.type === "text") {
          output += content.text
        } else if (content.type === "image") {
          output += `\n[Image: ${content.mimeType}]`
        }
      }

      if (result.isError) {
        output = `[Error] ${output}`
      }

      return {
        title: `MCP: ${mcpTool.name}`,
        metadata: { server: serverName, tool: mcpTool.name },
        output,
      }
    },
  })
}

// JSON Schema转Zod
function schemaToZod(schema: Record<string, any>): z.ZodType {
  if (!schema || !schema.type) {
    return z.object({})
  }

  switch (schema.type) {
    case "string":
      return z.string().describe(schema.description ?? "")
    case "number":
    case "integer":
      return z.number().describe(schema.description ?? "")
    case "boolean":
      return z.boolean().describe(schema.description ?? "")
    case "array":
      return z.array(schemaToZod(schema.items ?? {})).describe(schema.description ?? "")
    case "object": {
      const shape: Record<string, z.ZodType> = {}
      const required = new Set(schema.required ?? [])

      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        const zodType = schemaToZod(value as Record<string, any>)
        shape[key] = required.has(key) ? zodType : zodType.optional()
      }

      return z.object(shape).describe(schema.description ?? "")
    }
    default:
      return z.any()
  }
}
```

### MCP管理器

```typescript
// src/mcp/manager.ts
import { MCPClient, MCPServerConfig } from "./client"
import { convertMCPToolToNative } from "./tool-adapter"
import { toolRegistry } from "@/tool/registry"
import { Config } from "@/config/config"
import { Logger } from "@/util/logger"

const log = Logger.create({ service: "mcp-manager" })

export class MCPManager {
  private clients = new Map<string, MCPClient>()
  private tools = new Map<string, string[]>()  // server -> tool names

  // 初始化所有MCP服务器
  async initialize(): Promise<void> {
    const config = await Config.load()
    const mcpConfig = config.mcp ?? {}

    for (const [name, cfg] of Object.entries(mcpConfig)) {
      if (cfg.enabled === false) continue

      try {
        await this.addServer(name, cfg as MCPServerConfig)
      } catch (error) {
        log.error("Failed to initialize MCP server", { name, error })
      }
    }
  }

  // 添加MCP服务器
  async addServer(name: string, config: MCPServerConfig): Promise<void> {
    const client = new MCPClient(config)
    await client.connect()

    this.clients.set(name, client)

    // 获取并注册工具
    const tools = await client.listTools()
    const toolNames: string[] = []

    for (const tool of tools) {
      const nativeTool = convertMCPToolToNative(tool, client, name)
      toolRegistry.register(nativeTool)
      toolNames.push(nativeTool.name)
    }

    this.tools.set(name, toolNames)
    log.info("MCP server initialized", { name, toolCount: tools.length })
  }

  // 移除MCP服务器
  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name)
    if (client) {
      await client.disconnect()
      this.clients.delete(name)
      this.tools.delete(name)
    }
  }

  // 获取所有MCP工具名称
  getMCPToolNames(): string[] {
    return Array.from(this.tools.values()).flat()
  }

  // 获取服务器状态
  getStatus(): Record<string, { connected: boolean; toolCount: number }> {
    const result: Record<string, { connected: boolean; toolCount: number }> = {}

    for (const [name, client] of this.clients) {
      const toolNames = this.tools.get(name) ?? []
      result[name] = {
        connected: !!client,
        toolCount: toolNames.length,
      }
    }

    return result
  }

  // 清理
  async cleanup(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect()
    }
    this.clients.clear()
    this.tools.clear()
  }
}

// 全局实例
export const mcpManager = new MCPManager()
```

## 配置示例

### MCP配置格式

```json
// ~/.mini-opencode/config.json
{
  "mcp": {
    "filesystem": {
      "type": "stdio",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
      "enabled": true
    },
    "github": {
      "type": "stdio",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-token"
      },
      "enabled": true
    },
    "postgres": {
      "type": "stdio",
      "command": ["npx", "-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://..."
      },
      "enabled": false
    }
  }
}
```

## 使用示例

```typescript
import { initializeProviders } from "@/provider"
import { initializeTools } from "@/tool"
import { mcpManager } from "@/mcp/manager"
import { Agent } from "@/agent/agent"

async function main() {
  // 初始化Provider和内置工具
  await initializeProviders()
  initializeTools()

  // 初始化MCP服务器
  await mcpManager.initialize()

  // 查看状态
  console.log("MCP Status:", mcpManager.getStatus())

  // 创建Agent（MCP工具已自动注册）
  const agent = new Agent({
    model: "claude-3-opus",
    provider: "anthropic",
    workingDirectory: process.cwd(),
  })

  // 现在可以使用MCP工具
  const response = await agent.sendMessage(
    "Use the filesystem tool to list files in the current directory"
  )
  console.log(response)

  // 清理
  await mcpManager.cleanup()
}
```

## 小结

本章我们实现了mini-opencode的MCP协议支持：

1. **MCP客户端** - 连接MCP服务器
2. **工具转换** - 将MCP工具转换为原生工具
3. **MCP管理器** - 管理多个MCP服务器
4. **配置支持** - JSON配置文件格式

下一章我们将实现TUI（终端用户界面）。

## 参考资料

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Servers](https://github.com/modelcontextprotocol/servers)
