---
title: "从零到一实现 nano-agent（四）：工具系统设计"
date: "2024-11-14"
excerpt: "设计类型安全的工具系统，使用 Zod 实现参数验证和 JSON Schema 生成，构建可扩展的工具注册表。"
tags: ["AI", "LLM", "TypeScript", "Zod", "工具调用"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 4
---

# 从零到一实现 nano-agent（四）：工具系统基础

## 前言

工具系统是 AI Agent 与外部世界交互的核心。通过工具调用（Function Calling），LLM 可以读取文件、执行命令、搜索代码。本章将实现一个类型安全的工具系统，使用 Zod 进行参数验证，并自动生成 JSON Schema。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 工具接口设计 | ⭐⭐⭐ | API 设计能力 | ✅ |
| Zod 参数验证 | ⭐⭐⭐ | 类型安全实践 | ✅ |
| JSON Schema 生成 | ⭐⭐⭐ | 元编程能力 | ✅ |
| 工具注册表模式 | ⭐⭐ | 设计模式 | ✅ |

## 面试考点

1. 如何设计一个可扩展的工具系统？
2. Zod 如何实现类型推导和运行时验证？
3. 如何将 TypeScript 类型转换为 JSON Schema？

## 工具系统架构

### 整体设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool System                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Tool Registry                       │   │
│  │  - register(tool)                                   │   │
│  │  - get(name) → Tool                                 │   │
│  │  - list() → Tool[]                                  │   │
│  │  - toLLMTools() → LLMToolDefinition[]               │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Tool Interface                      │   │
│  │  - name: string                                     │   │
│  │  - description: string                              │   │
│  │  - parameters: ZodSchema                            │   │
│  │  - execute(params, ctx) → Promise<ToolResult>       │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│          ┌───────────────────┼───────────────────┐         │
│          ▼                   ▼                   ▼         │
│     ┌─────────┐        ┌─────────┐        ┌─────────┐      │
│     │  read   │        │  write  │        │  bash   │      │
│     │  Tool   │        │  Tool   │        │  Tool   │      │
│     └─────────┘        └─────────┘        └─────────┘      │
│          │                   │                   │          │
│          └───────────────────┼───────────────────┘         │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Tool Context                        │   │
│  │  - sessionId: string                                │   │
│  │  - messageId: string                                │   │
│  │  - workingDirectory: string                         │   │
│  │  - abortSignal: AbortSignal                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 工具调用流程

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool Call Flow                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. LLM 返回 tool_call                                      │
│     {                                                       │
│       name: "read",                                         │
│       input: { path: "/src/index.ts" }                     │
│     }                                                       │
│                                                             │
│  2. Agent 获取工具定义                                       │
│     tool = registry.get("read")                             │
│                                                             │
│  3. Zod 参数验证                                             │
│     validatedParams = tool.parameters.parse(input)          │
│                                                             │
│  4. 执行工具                                                 │
│     result = await tool.execute(validatedParams, ctx)       │
│                                                             │
│  5. 返回结果                                                 │
│     {                                                       │
│       title: "Read: /src/index.ts",                         │
│       metadata: { path: "...", lines: 100 },               │
│       output: "file content..."                             │
│     }                                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 工具接口定义

### 核心类型

```typescript
// src/tool/tool.ts

import z from "zod"

/**
 * 工具执行上下文
 */
export interface ToolContext {
  sessionId: string           // 会话 ID
  messageId: string           // 消息 ID
  workingDirectory: string    // 工作目录
  abortSignal: AbortSignal    // 中止信号
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  title: string                          // 结果标题
  metadata: Record<string, unknown>      // 元数据
  output: string                         // 输出内容
}

/**
 * 工具定义
 */
export interface ToolDefinition<P extends z.ZodType = z.ZodType> {
  name: string                           // 工具名称
  description: string                    // 工具描述
  parameters: P                          // 参数 Schema
  execute: (params: z.infer<P>, ctx: ToolContext) => Promise<ToolResult>
}

/**
 * 工具定义辅助函数
 * 提供类型推导
 */
export function defineTool<P extends z.ZodType>(
  config: ToolDefinition<P>
): ToolDefinition<P> {
  return config
}
```

### Zod 到 JSON Schema 转换

```typescript
// src/tool/tool.ts (续)

/**
 * 将 Zod Schema 转换为 JSON Schema
 * 用于 LLM Function Calling
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as any)._def
  
  // 对象类型
  if (def.typeName === "ZodObject") {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    
    for (const [key, value] of Object.entries(def.shape())) {
      properties[key] = zodToJsonSchema(value as z.ZodType)
      if ((value as any)._def.typeName !== "ZodOptional") {
        required.push(key)
      }
    }
    
    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    }
  }
  
  // 字符串类型
  if (def.typeName === "ZodString") {
    return { 
      type: "string", 
      description: def.description 
    }
  }
  
  // 数字类型
  if (def.typeName === "ZodNumber") {
    return { 
      type: "number", 
      description: def.description 
    }
  }
  
  // 布尔类型
  if (def.typeName === "ZodBoolean") {
    return { 
      type: "boolean", 
      description: def.description 
    }
  }
  
  // 数组类型
  if (def.typeName === "ZodArray") {
    return {
      type: "array",
      items: zodToJsonSchema(def.type),
      description: def.description,
    }
  }
  
  // 可选类型
  if (def.typeName === "ZodOptional") {
    return zodToJsonSchema(def.innerType)
  }
  
  // 默认返回空对象
  return {}
}
```

## 工具注册表

```typescript
// src/tool/registry.ts

import z from "zod"
import type { ToolDefinition, ToolResult, ToolContext } from "./tool"
import { zodToJsonSchema } from "./tool"

/**
 * 工具注册表
 */
class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()
  
  /**
   * 注册工具
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }
  
  /**
   * 获取工具
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }
  
  /**
   * 列出所有工具
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }
  
  /**
   * 转换为 LLM 工具定义格式
   */
  toLLMTools(): Array<{
    name: string
    description: string
    input_schema: Record<string, unknown>
  }> {
    return this.list().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.parameters),
    }))
  }
  
  /**
   * 执行工具
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`)
    }
    
    // Zod 参数验证
    const validatedParams = tool.parameters.parse(params)
    
    // 执行工具
    return tool.execute(validatedParams, ctx)
  }
}

// 单例实例
export const toolRegistry = new ToolRegistry()
```

## 基础工具实现

### read 工具

```typescript
// src/tool/read.ts

import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { readFile, stat } from "fs/promises"
import { existsSync } from "fs"
import { resolve } from "path"

const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB

const Parameters = z.object({
  path: z.string().describe("The absolute path to the file to read"),
  offset: z.number().optional().describe("Line number to start reading from"),
  limit: z.number().optional().describe("Maximum number of lines to read"),
})

export const readTool = defineTool({
  name: "read",
  description: `Read the contents of a file. Supports text files. The path must be absolute.`,
  parameters: Parameters,
  
  execute: async (params, ctx: ToolContext): Promise<ToolResult> => {
    const absolutePath = resolve(params.path)
    
    // 安全检查：路径必须在工作目录内
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }
    
    // 检查文件是否存在
    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }
    
    // 检查文件大小
    const fileStat = await stat(absolutePath)
    if (fileStat.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${fileStat.size} bytes (max: ${MAX_FILE_SIZE})`)
    }
    
    // 读取文件内容
    const content = await readFile(absolutePath, "utf-8")
    const lines = content.split("\n")
    
    // 分页处理
    let offset = params.offset ?? 0
    let limit = params.limit ?? lines.length
    
    const selectedLines = lines.slice(offset, offset + limit)
    const numberedLines = selectedLines.map((line, i) => 
      `${String(offset + i + 1).padStart(6, " ")}\t${line}`
    ).join("\n")
    
    const header = offset > 0 || limit < lines.length
      ? `[Lines ${offset + 1}-${Math.min(offset + limit, lines.length)} of ${lines.length}]\n`
      : `[${lines.length} lines]\n`
    
    return {
      title: `Read: ${absolutePath}`,
      metadata: { path: absolutePath, lines: lines.length },
      output: header + numberedLines,
    }
  },
})
```

### write 工具

```typescript
// src/tool/write.ts

import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { writeFile, mkdir } from "fs/promises"
import { dirname, resolve } from "path"

const Parameters = z.object({
  path: z.string().describe("The absolute path to write the file to"),
  content: z.string().describe("The content to write to the file"),
})

export const writeTool = defineTool({
  name: "write",
  description: `Write content to a file. Creates the file if it doesn't exist, overwrites if it does. The path must be absolute.`,
  parameters: Parameters,
  
  execute: async (params, ctx: ToolContext): Promise<ToolResult> => {
    const absolutePath = resolve(params.path)
    
    // 安全检查
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }
    
    // 确保目录存在
    await mkdir(dirname(absolutePath), { recursive: true })
    
    // 写入文件
    await writeFile(absolutePath, params.content, "utf-8")
    
    return {
      title: `Write: ${absolutePath}`,
      metadata: { 
        path: absolutePath, 
        size: params.content.length,
        lines: params.content.split("\n").length,
      },
      output: `Successfully wrote ${params.content.length} bytes to ${absolutePath}`,
    }
  },
})
```

### edit 工具

```typescript
// src/tool/edit.ts

import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { readFile, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { resolve } from "path"

const Parameters = z.object({
  path: z.string().describe("The absolute path to the file to edit"),
  old_string: z.string().describe("The exact text to replace"),
  new_string: z.string().describe("The text to replace it with"),
})

export const editTool = defineTool({
  name: "edit",
  description: `Make precise edits to a file by replacing specific text. The old_string must match exactly.`,
  parameters: Parameters,
  
  execute: async (params, ctx: ToolContext): Promise<ToolResult> => {
    const absolutePath = resolve(params.path)
    
    // 安全检查
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }
    
    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }
    
    // 读取文件
    const content = await readFile(absolutePath, "utf-8")
    
    // 查找并替换
    const index = content.indexOf(params.old_string)
    if (index === -1) {
      throw new Error(`Could not find the text to replace in ${absolutePath}`)
    }
    
    // 检查是否唯一
    const secondIndex = content.indexOf(params.old_string, index + 1)
    if (secondIndex !== -1) {
      throw new Error(`Found multiple occurrences of the text to replace. Please provide more context.`)
    }
    
    // 执行替换
    const newContent = content.slice(0, index) + params.new_string + content.slice(index + params.old_string.length)
    
    // 写入文件
    await writeFile(absolutePath, newContent, "utf-8")
    
    return {
      title: `Edit: ${absolutePath}`,
      metadata: { 
        path: absolutePath,
        replacements: 1,
      },
      output: `Successfully replaced text in ${absolutePath}`,
    }
  },
})
```

### bash 工具

```typescript
// src/tool/bash.ts

import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { spawn } from "child_process"

const DEFAULT_TIMEOUT = 120000  // 2分钟

const Parameters = z.object({
  command: z.string().describe("The shell command to execute"),
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 120000)"),
})

export const bashTool = defineTool({
  name: "bash",
  description: `Execute a shell command. Use with caution as it can modify the filesystem.`,
  parameters: Parameters,
  
  execute: async (params, ctx: ToolContext): Promise<ToolResult> => {
    const timeout = params.timeout ?? DEFAULT_TIMEOUT
    const startTime = Date.now()
    
    return new Promise((resolve, reject) => {
      const proc = spawn(params.command, [], {
        cwd: ctx.workingDirectory,
        shell: true,
        timeout,
      })
      
      let stdout = ""
      let stderr = ""
      
      proc.stdout.on("data", (data) => {
        stdout += data.toString()
      })
      
      proc.stderr.on("data", (data) => {
        stderr += data.toString()
      })
      
      proc.on("close", (code) => {
        const duration = Date.now() - startTime
        
        resolve({
          title: `Bash: ${params.command.slice(0, 50)}...`,
          metadata: {
            command: params.command,
            exitCode: code,
            duration,
          },
          output: [
            `Exit Code: ${code}`,
            `Duration: ${duration}ms`,
            "",
            "STDOUT:",
            stdout || "(empty)",
            "",
            "STDERR:",
            stderr || "(empty)",
          ].join("\n"),
        })
      })
      
      proc.on("error", (err) => {
        reject(err)
      })
      
      // 支持中止
      ctx.abortSignal.addEventListener("abort", () => {
        proc.kill()
        reject(new Error("Command was aborted"))
      })
    })
  },
})
```

### glob 工具

```typescript
// src/tool/glob.ts

import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { glob as globAsync } from "glob"
import { stat } from "fs/promises"

const Parameters = z.object({
  pattern: z.string().describe("The glob pattern to match files against"),
  path: z.string().optional().describe("The directory to search in (default: working directory)"),
})

export const globTool = defineTool({
  name: "glob",
  description: `Find files matching a glob pattern. Results are sorted by modification time (newest first).`,
  parameters: Parameters,
  
  execute: async (params, ctx: ToolContext): Promise<ToolResult> => {
    const searchPath = params.path ? resolve(params.path) : ctx.workingDirectory
    
    // 安全检查
    if (!searchPath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }
    
    // 执行 glob 搜索
    const files = await globAsync(params.pattern, {
      cwd: searchPath,
      absolute: true,
      nodir: true,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    })
    
    // 按修改时间排序
    const filesWithStats = await Promise.all(
      files.map(async (file) => {
        try {
          const s = await stat(file)
          return { file, mtime: s.mtimeMs }
        } catch {
          return { file, mtime: 0 }
        }
      })
    )
    
    filesWithStats.sort((a, b) => b.mtime - a.mtime)
    
    const output = filesWithStats
      .map((f, i) => `${i + 1}. ${f.file}`)
      .join("\n")
    
    return {
      title: `Glob: ${params.pattern}`,
      metadata: {
        pattern: params.pattern,
        path: searchPath,
        count: files.length,
      },
      output: output || "No files found",
    }
  },
})
```

## 工具初始化

```typescript
// src/tool/index.ts

import { toolRegistry } from './registry'
import { readTool } from './read'
import { writeTool } from './write'
import { editTool } from './edit'
import { bashTool } from './bash'
import { globTool } from './glob'
import { grepTool } from './grep'
import { batchTool } from './batch'
import { taskTool } from './task'
import { skillTool } from './skill'

// 导出类型
export * from './tool'
export { toolRegistry }

/**
 * 初始化所有工具
 */
export function initializeTools(): void {
  // 基础工具
  toolRegistry.register(readTool)
  toolRegistry.register(writeTool)
  toolRegistry.register(editTool)
  toolRegistry.register(bashTool)
  toolRegistry.register(globTool)
  toolRegistry.register(grepTool)
  
  // 高级工具
  toolRegistry.register(batchTool)
  toolRegistry.register(taskTool)
  toolRegistry.register(skillTool)
}
```

## 工具使用示例

### 生成 LLM 工具定义

```typescript
import { toolRegistry } from './tool'

// 获取所有工具的 LLM 格式定义
const llmTools = toolRegistry.toLLMTools()

console.log(JSON.stringify(llmTools[0], null, 2))
// 输出:
// {
//   "name": "read",
//   "description": "Read the contents of a file...",
//   "input_schema": {
//     "type": "object",
//     "properties": {
//       "path": { "type": "string", "description": "The absolute path..." },
//       "offset": { "type": "number", "description": "Line number..." },
//       "limit": { "type": "number", "description": "Maximum number..." }
//     },
//     "required": ["path"],
//     "additionalProperties": false
//   }
// }
```

### 执行工具调用

```typescript
import { toolRegistry } from './tool'

const ctx: ToolContext = {
  sessionId: 'session-123',
  messageId: 'msg-456',
  workingDirectory: '/Users/example/project',
  abortSignal: new AbortController().signal,
}

// 执行 read 工具
const result = await toolRegistry.execute('read', {
  path: '/Users/example/project/src/index.ts',
  limit: 50,
}, ctx)

console.log(result.output)
```

## 小结

本章实现了工具系统的基础架构，包括：

1. **工具接口** - 统一的工具定义和执行接口
2. **Zod 参数验证** - 类型安全的参数定义和验证
3. **JSON Schema 生成** - 自动生成 LLM Function Calling 格式
4. **基础工具** - read、write、edit、bash、glob 实现

**关键要点**：

- Zod 提供了类型推导和运行时验证的双重保障
- 工具注册表模式实现了工具的统一管理和发现
- 工具执行上下文提供了必要的环境信息和控制能力
- 安全检查确保工具只能操作工作目录内的文件

下一章我们将实现 Agent 核心循环，将 Provider 和 Tool 系统整合起来，实现完整的 ReAct 循环。

## 参考资料

- [Zod Documentation](https://zod.dev/)
- [JSON Schema Specification](https://json-schema.org/)
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Node.js File System API](https://nodejs.org/api/fs.html)
