---
title: "从零到一实现mini-opencode（四）：Tool系统实现"
date: "2026-03-03 12:00:00"
excerpt: "实现mini-opencode的Tool系统，定义工具接口，实现read、write、edit、bash等核心工具，建立权限控制机制，并实现并行工具执行引擎。"
tags: ["AI", "LLM", "TypeScript", "Tools"]
series:
  slug: "mini-opencode"
  title: "从零到一实现 mini-opencode"
  order: 4
---

# 从零到一实现mini-opencode（四）：Tool系统实现

## 前言

Tool系统是AI编程助手的核心能力之一，它让AI能够与外部世界交互——读取文件、执行命令、修改代码。本章将实现mini-opencode的Tool系统，包括工具定义接口、核心工具实现、权限控制机制，以及一个**并行工具执行引擎**。

## Tool架构设计

### 核心接口

OpenCode的Tool系统设计非常优雅，每个工具都遵循统一的接口定义：

```typescript
// src/tool/tool.ts
import z from "zod"

export interface ToolContext {
  sessionId: string
  messageId: string
  workingDirectory: string
  abortSignal: AbortSignal
}

export interface ToolResult {
  title: string           // 简短描述，用于UI显示
  metadata: Record<string, any>  // 元数据，用于日志
  output: string          // 详细输出，发送给LLM
}

export interface ToolDefinition<P extends z.ZodType = z.ZodType> {
  name: string
  description: string
  parameters: P
  execute: (params: z.infer<P>, ctx: ToolContext) => Promise<ToolResult>
}

// 工具定义辅助函数
export function defineTool<P extends z.ZodType>(
  config: ToolDefinition<P>
): ToolDefinition<P> {
  return config
}
```

### 工具注册表

```typescript
// src/tool/registry.ts
import { ToolDefinition } from "./tool"

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition<any>): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  // 转换为LLM可用的工具格式
  toLLMTools(): Array<{
    name: string
    description: string
    input_schema: Record<string, any>
  }> {
    return this.list().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.parameters),
    }))
  }
}

export const toolRegistry = new ToolRegistry()

// Zod Schema转JSON Schema
function zodToJsonSchema(schema: z.ZodType): Record<string, any> {
  const def = (schema as any)._def
  
  if (def.typeName === "ZodObject") {
    const properties: Record<string, any> = {}
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
  
  if (def.typeName === "ZodString") {
    return { type: "string", description: def.description }
  }
  
  if (def.typeName === "ZodNumber") {
    return { type: "number", description: def.description }
  }
  
  if (def.typeName === "ZodBoolean") {
    return { type: "boolean", description: def.description }
  }
  
  if (def.typeName === "ZodArray") {
    return {
      type: "array",
      items: zodToJsonSchema(def.type),
      description: def.description,
    }
  }
  
  if (def.typeName === "ZodOptional") {
    return zodToJsonSchema(def.innerType)
  }
  
  return {}
}
```

## 核心工具实现

### Read工具

```typescript
// src/tool/read.ts
import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { readFile, stat } from "fs/promises"
import { existsSync } from "fs"
import { join, resolve } from "path"

const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB

const Parameters = z.object({
  path: z.string().describe("The absolute path to the file to read"),
  offset: z.number().optional().describe("Line number to start reading from"),
  limit: z.number().optional().describe("Maximum number of lines to read"),
})

export const readTool = defineTool({
  name: "read",
  description: `Read the contents of a file. Supports text files.
The path must be absolute, not relative.`,
  parameters: Parameters,
  execute: async (params, ctx): Promise<ToolResult> => {
    const absolutePath = resolve(params.path)
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }

    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }

    const fileStat = await stat(absolutePath)
    
    if (fileStat.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${fileStat.size} bytes (max: ${MAX_FILE_SIZE})`)
    }

    const ext = absolutePath.split('.').pop()?.toLowerCase()
    
    // 图片文件处理
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
      const buffer = await readFile(absolutePath)
      const base64 = buffer.toString('base64')
      const mimeType = ext === 'png' ? 'image/png' : 
                       ext === 'gif' ? 'image/gif' :
                       ext === 'webp' ? 'image/webp' : 'image/jpeg'
      
      return {
        title: `Read image: ${absolutePath}`,
        metadata: { path: absolutePath, type: 'image', mimeType },
        output: `[Image: ${absolutePath}]\n<image data: ${mimeType}, ${buffer.length} bytes>`,
      }
    }

    // 文本文件
    const content = await readFile(absolutePath, 'utf-8')
    const lines = content.split('\n')
    
    let selectedLines = lines
    let offset = params.offset ?? 0
    let limit = params.limit ?? lines.length
    
    if (offset > 0 || limit < lines.length) {
      selectedLines = lines.slice(offset, offset + limit)
    }

    const numberedLines = selectedLines.map((line, i) => 
      `${String(offset + i + 1).padStart(6, ' ')}\t${line}`
    ).join('\n')

    const header = offset > 0 || limit < lines.length
      ? `[Lines ${offset + 1}-${Math.min(offset + limit, lines.length)} of ${lines.length}]\n`
      : `[${lines.length} lines]\n`

    return {
      title: `Read: ${absolutePath}`,
      metadata: { 
        path: absolutePath, 
        lines: lines.length,
        offset,
        limit,
      },
      output: header + numberedLines,
    }
  },
})
```

### Write工具

```typescript
// src/tool/write.ts
import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { writeFile, mkdir } from "fs/promises"
import { dirname, resolve } from "path"
import { existsSync } from "fs"

const Parameters = z.object({
  path: z.string().describe("The absolute path where the file should be written"),
  content: z.string().describe("The content to write to the file"),
})

export const writeTool = defineTool({
  name: "write",
  description: `Write content to a file. 
This will create the file if it doesn't exist, or overwrite it if it does.
The path must be absolute, not relative.
Use this tool when you need to create new files or completely replace existing content.`,
  parameters: Parameters,
  execute: async (params, ctx): Promise<ToolResult> => {
    const absolutePath = resolve(params.path)
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }

    const dir = dirname(absolutePath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    await writeFile(absolutePath, params.content, 'utf-8')

    const lines = params.content.split('\n').length
    const bytes = Buffer.byteLength(params.content, 'utf-8')

    return {
      title: `Write: ${absolutePath}`,
      metadata: { 
        path: absolutePath, 
        lines,
        bytes,
        created: !existsSync(absolutePath),
      },
      output: `Successfully wrote ${lines} lines (${bytes} bytes) to ${absolutePath}`,
    }
  },
})
```

### Edit工具

```typescript
// src/tool/edit.ts
import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { readFile, writeFile } from "fs/promises"
import { resolve } from "path"
import { existsSync } from "fs"

const Parameters = z.object({
  path: z.string().describe("The absolute path to the file to edit"),
  old_string: z.string().describe("The exact text to replace"),
  new_string: z.string().describe("The text to replace it with"),
})

export const editTool = defineTool({
  name: "edit",
  description: `Edit a file by replacing specific text.
This tool requires an exact match of the old_string parameter.
Use this for precise modifications to existing files.
NEVER escape special characters - provide the exact literal text.`,
  parameters: Parameters,
  execute: async (params, ctx): Promise<ToolResult> => {
    const absolutePath = resolve(params.path)
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }

    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }

    const content = await readFile(absolutePath, 'utf-8')

    const occurrences = content.split(params.old_string).length - 1
    
    if (occurrences === 0) {
      throw new Error(`String not found in file: "${params.old_string.slice(0, 50)}..."`)
    }
    
    if (occurrences > 1) {
      throw new Error(
        `Found ${occurrences} occurrences. Please provide more context to uniquely identify the location.`
      )
    }

    const newContent = content.replace(params.old_string, params.new_string)
    
    await writeFile(absolutePath, newContent, 'utf-8')

    return {
      title: `Edit: ${absolutePath}`,
      metadata: { 
        path: absolutePath, 
        occurrences: 1,
        oldLength: params.old_string.length,
        newLength: params.new_string.length,
      },
      output: `Successfully edited ${absolutePath}`,
    }
  },
})
```

### Bash工具

```typescript
// src/tool/bash.ts
import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { spawn } from "child_process"
import { resolve } from "path"

const DEFAULT_TIMEOUT = 120000  // 2分钟

const Parameters = z.object({
  command: z.string().describe("The command to execute"),
  description: z.string().describe("Brief description of what this command does"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
  workdir: z.string().optional().describe("Working directory for the command"),
})

export const bashTool = defineTool({
  name: "bash",
  description: `Execute a shell command.
Commands run in a non-interactive shell. Be aware of platform differences (Windows vs Unix).
Always provide a clear description of what the command does.
Use workdir instead of 'cd' commands when possible.`,
  parameters: Parameters,
  execute: async (params, ctx): Promise<ToolResult> => {
    const cwd = params.workdir ? resolve(params.workdir) : ctx.workingDirectory
    const timeout = params.timeout ?? DEFAULT_TIMEOUT

    return new Promise((resolve, reject) => {
      const proc = spawn(params.command, [], {
        shell: true,
        cwd,
        env: process.env,
      })

      let stdout = ""
      let stderr = ""
      let timedOut = false

      const timeoutId = setTimeout(() => {
        timedOut = true
        proc.kill()
      }, timeout)

      proc.stdout.on("data", (data) => {
        stdout += data.toString()
      })

      proc.stderr.on("data", (data) => {
        stderr += data.toString()
      })

      proc.on("close", (code) => {
        clearTimeout(timeoutId)
        
        let output = ""
        if (stdout) output += stdout
        if (stderr) output += `\n[stderr]\n${stderr}`
        
        if (timedOut) {
          output += `\n\nCommand timed out after ${timeout}ms`
        }
        
        if (code !== 0 && !timedOut) {
          output += `\n\nExit code: ${code}`
        }

        resolve({
          title: params.description,
          metadata: {
            command: params.command,
            exitCode: code,
            timedOut,
          },
          output,
        })
      })

      proc.on("error", (error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
    })
  },
})
```

### Glob工具

```typescript
// src/tool/glob.ts
import z from "zod"
import { defineTool, ToolContext, ToolResult } from "./tool"
import { glob as globAsync } from "glob"
import { resolve } from "path"

const Parameters = z.object({
  pattern: z.string().describe("Glob pattern to match files"),
  path: z.string().optional().describe("Directory to search in (defaults to working directory)"),
})

export const globTool = defineTool({
  name: "glob",
  description: `Find files matching a glob pattern.
Results are sorted by modification time (newest first).
Useful for finding files by name or extension.
Examples: "**/*.ts", "src/**/*.tsx", "**/test*.js"`,
  parameters: Parameters,
  execute: async (params, ctx): Promise<ToolResult> => {
    const cwd = params.path ? resolve(params.path) : ctx.workingDirectory

    const files = await globAsync(params.pattern, {
      cwd,
      absolute: true,
      nodir: true,
      ignore: ["**/node_modules/**", "**/.git/**"],
    })

    const { stat } = await import("fs/promises")
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

    const output = filesWithStats.length > 0
      ? filesWithStats.map(f => f.file).join("\n")
      : "No files found matching the pattern."

    return {
      title: `Glob: ${params.pattern}`,
      metadata: { 
        pattern: params.pattern,
        count: files.length,
      },
      output,
    }
  },
})
```

## 并行工具执行引擎

### 设计思路

当LLM返回多个工具调用时，如果这些工具之间没有依赖关系，可以并行执行以提高效率。并行执行引擎需要：

1. **依赖分析** - 分析工具调用之间的依赖关系
2. **拓扑排序** - 确定执行顺序
3. **并发控制** - 限制最大并发数
4. **速率限制** - Token Bucket算法控制请求速率

### 实现

```typescript
// src/tool/parallel.ts
import { ToolDefinition } from "./tool"
import { Logger } from "../util/logger"

const log = Logger.create({ service: 'parallel-tool' })

export interface ToolExecutionResult {
  tool: string
  input: Record<string, unknown>
  output: string
  error?: string
  duration: number
  success: boolean
}

export interface ToolCall {
  name: string
  id: string
  input: Record<string, unknown>
  dependencies?: string[]  // 依赖的其他工具调用ID
}

/**
 * 并行工具执行引擎
 * 
 * 核心算法：
 * 1. 分析工具调用依赖关系
 * 2. 构建依赖图
 * 3. 拓扑排序确定执行顺序
 * 4. 并行执行无依赖的工具
 */
export class ParallelToolExecutor {
  private toolRegistry: Map<string, ToolDefinition>
  private maxConcurrency: number

  constructor(tools: ToolDefinition[], maxConcurrency = 5) {
    this.toolRegistry = new Map()
    tools.forEach(t => this.toolRegistry.set(t.name, t))
    this.maxConcurrency = maxConcurrency
  }

  /**
   * 分析工具调用的依赖关系
   * 
   * 依赖规则：
   * - write/edit 依赖于 read 同一路径的结果
   * - 后续工具可能依赖前面工具的输出
   */
  analyzeDependencies(calls: ToolCall[]): {
    independent: ToolCall[]
    dependent: Map<string, string[]>
  } {
    const independent: ToolCall[] = []
    const dependent = new Map<string, string[]>()

    // 跟踪已操作的资源
    const resourceMap = new Map<string, string>()  // resource -> callId

    for (const call of calls) {
      const resource = this.extractResource(call.name, call.input)
      
      if (resource && resourceMap.has(resource)) {
        // 发现依赖
        const dependsOn = resourceMap.get(resource)!
        dependent.set(call.id, [dependsOn])
      } else {
        independent.push(call)
      }

      // 记录资源操作
      if (resource) {
        resourceMap.set(resource, call.id)
      }
    }

    return { independent, dependent }
  }

  /**
   * 从工具调用中提取资源标识
   */
  private extractResource(toolName: string, input: Record<string, unknown>): string | null {
    switch (toolName) {
      case 'read':
      case 'write':
      case 'edit':
        return input.path as string
      case 'bash':
        return input.workdir as string || null
      default:
        return null
    }
  }

  /**
   * 并行执行工具调用
   */
  async executeParallel(
    toolCalls: ToolCall[],
    context: { workingDirectory: string }
  ): Promise<ToolExecutionResult[]> {
    log.info('Parallel execution', { total: toolCalls.length })

    const { independent, dependent } = this.analyzeDependencies(toolCalls)
    const results: ToolExecutionResult[] = []
    const completed = new Set<string>()

    // 首先并行执行独立的工具
    const independentResults = await this.executeBatch(
      independent,
      context
    )
    results.push(...independentResults)
    independentResults.forEach(r => completed.add(r.tool))

    // 然后执行有依赖的工具
    const remaining = toolCalls.filter(c => dependent.has(c.id))
    
    while (remaining.length > 0) {
      // 找出所有依赖已满足的工具
      const ready = remaining.filter(c => {
        const deps = dependent.get(c.id) || []
        return deps.every(d => completed.has(d))
      })

      if (ready.length === 0) {
        // 可能存在循环依赖，强制执行剩余的
        log.warn('Possible circular dependency detected')
        break
      }

      const batchResults = await this.executeBatch(ready, context)
      results.push(...batchResults)
      batchResults.forEach(r => completed.add(r.tool))

      // 从剩余列表中移除已执行的
      ready.forEach(c => {
        const idx = remaining.findIndex(r => r.id === c.id)
        if (idx >= 0) remaining.splice(idx, 1)
      })
    }

    return results
  }

  /**
   * 批量执行工具（带并发控制）
   */
  private async executeBatch(
    calls: ToolCall[],
    context: { workingDirectory: string }
  ): Promise<ToolExecutionResult[]> {
    // 限制并发数
    const batches: ToolCall[][] = []
    for (let i = 0; i < calls.length; i += this.maxConcurrency) {
      batches.push(calls.slice(i, i + this.maxConcurrency))
    }

    const results: ToolExecutionResult[] = []
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(call => this.executeSingle(call, context))
      )
      results.push(...batchResults)
    }

    return results
  }

  /**
   * 执行单个工具
   */
  private async executeSingle(
    call: ToolCall,
    context: { workingDirectory: string }
  ): Promise<ToolExecutionResult> {
    const start = Date.now()
    
    try {
      const tool = this.toolRegistry.get(call.name)
      if (!tool) {
        throw new Error(`Unknown tool: ${call.name}`)
      }

      const validatedInput = tool.parameters.parse(call.input)
      const result = await tool.execute(validatedInput, {
        sessionId: 'default',
        messageId: '',
        workingDirectory: context.workingDirectory,
        abortSignal: new AbortController().signal,
      })

      return {
        tool: call.name,
        input: call.input,
        output: result.output,
        duration: Date.now() - start,
        success: true,
      }
    } catch (error) {
      return {
        tool: call.name,
        input: call.input,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - start,
        success: false,
      }
    }
  }
}

/**
 * Token Bucket 速率限制器
 * 
 * 经典的速率限制算法，用于控制工具调用频率
 */
export class TokenBucket {
  private tokens: number
  private lastRefill: number
  private refillRate: number  // tokens per second
  private maxTokens: number

  constructor(options: { tokens: number; refillRate: number }) {
    this.tokens = options.tokens
    this.maxTokens = options.tokens
    this.refillRate = options.refillRate
    this.lastRefill = Date.now()
  }

  /**
   * 尝试获取token
   */
  take(count = 1): boolean {
    this.refill()
    
    if (this.tokens >= count) {
      this.tokens -= count
      return true
    }
    
    return false
  }

  /**
   * 获取当前可用token数
   */
  available(): number {
    this.refill()
    return this.tokens
  }

  /**
   * 等待直到有足够的token
   */
  async waitFor(count = 1): Promise<void> {
    while (!this.take(count)) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  /**
   * 按速率补充token
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    const tokensToAdd = Math.floor(elapsed * this.refillRate)
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }
}
```

### 使用示例

```typescript
import { ParallelToolExecutor, TokenBucket } from "./parallel"
import { toolRegistry } from "./registry"

// 创建执行器
const executor = new ParallelToolExecutor(toolRegistry.list(), 3)

// 工具调用列表
const calls = [
  { name: "read", id: "1", input: { path: "/project/src/index.ts" } },
  { name: "read", id: "2", input: { path: "/project/src/utils.ts" } },
  { name: "read", id: "3", input: { path: "/project/package.json" } },
  { name: "edit", id: "4", input: { path: "/project/src/index.ts", old_string: "old", new_string: "new" } },
]

// 并行执行
const results = await executor.executeParallel(calls, {
  workingDirectory: "/project"
})

// 速率限制
const bucket = new TokenBucket({ tokens: 10, refillRate: 2 })

for (const call of calls) {
  await bucket.waitFor(1)
  // 执行工具...
}
```

### 并行执行流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    并行工具执行引擎                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   输入: ToolCall[]                                              │
│         ┌─────────────────────────────────────────┐             │
│         │ read /src/a.ts  (id: 1)                 │             │
│         │ read /src/b.ts  (id: 2)                 │             │
│         │ read /src/c.ts  (id: 3)                 │             │
│         │ edit /src/a.ts  (id: 4, depends: 1)     │             │
│         └─────────────────────────────────────────┘             │
│                           │                                     │
│                           ▼                                     │
│   ┌─────────────────────────────────────────────────┐           │
│   │              依赖分析                            │           │
│   │  - 提取资源标识 (path, workdir)                  │           │
│   │  - 构建依赖图                                    │           │
│   │  - 拓扑排序                                      │           │
│   └─────────────────────────────────────────────────┘           │
│                           │                                     │
│                           ▼                                     │
│   ┌─────────────────────────────────────────────────┐           │
│   │         第一批: 独立工具并行执行                  │           │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │           │
│   │  │read a.ts│ │read b.ts│ │read c.ts│           │           │
│   │  │  (1)    │ │  (2)    │ │  (3)    │           │           │
│   │  └─────────┘ └─────────┘ └─────────┘           │           │
│   │       ↓ 并发控制 (maxConcurrency: 3)            │           │
│   └─────────────────────────────────────────────────┘           │
│                           │                                     │
│                           ▼                                     │
│   ┌─────────────────────────────────────────────────┐           │
│   │         第二批: 依赖工具顺序执行                  │           │
│   │  ┌─────────────────────────────────┐             │           │
│   │  │ edit a.ts (依赖 read a.ts 完成)  │             │           │
│   │  └─────────────────────────────────┘             │           │
│   └─────────────────────────────────────────────────┘           │
│                           │                                     │
│                           ▼                                     │
│   输出: ToolExecutionResult[]                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 权限控制

### 权限模型

```typescript
// src/permission/permission.ts
import z from "zod"

export type PermissionAction = "allow" | "deny" | "ask"

export interface PermissionRule {
  tool: string | "*"       // 工具名称，* 表示所有工具
  action: PermissionAction
  patterns?: string[]      // 参数模式匹配
}

export interface PermissionRequest {
  tool: string
  params: Record<string, any>
  patterns?: string[]
}

export class PermissionManager {
  private rules: PermissionRule[] = []

  constructor(rules: PermissionRule[] = []) {
    this.rules = rules
  }

  check(request: PermissionRequest): PermissionAction {
    for (const rule of this.rules) {
      if (this.matchesRule(request, rule)) {
        return rule.action
      }
    }
    return "ask"
  }

  private matchesRule(request: PermissionRequest, rule: PermissionRule): boolean {
    if (rule.tool !== "*" && rule.tool !== request.tool) {
      return false
    }

    if (!rule.patterns || rule.patterns.length === 0) {
      return true
    }

    if (request.patterns) {
      for (const pattern of rule.patterns) {
        if (request.patterns.some(p => this.matchPattern(p, pattern))) {
          return true
        }
      }
    }

    return false
  }

  private matchPattern(value: string, pattern: string): boolean {
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
    )
    return regex.test(value)
  }

  addRule(rule: PermissionRule): void {
    this.rules.unshift(rule)
  }
}
```

### 默认权限配置

```typescript
// src/permission/default.ts
import { PermissionRule } from "./permission"

export const DEFAULT_RULES: PermissionRule[] = [
  { tool: "read", action: "allow" },
  { tool: "glob", action: "allow" },
  { tool: "write", action: "ask" },
  { tool: "edit", action: "ask" },
  { tool: "bash", action: "ask" },
  { 
    tool: "bash", 
    action: "deny",
    patterns: ["rm -rf /", "rm -rf ~", ":(){ :|:& };:"]
  },
]

export const READONLY_RULES: PermissionRule[] = [
  { tool: "read", action: "allow" },
  { tool: "glob", action: "allow" },
  { tool: "*", action: "deny" },
]
```

## 工具初始化

```typescript
// src/tool/index.ts
import { toolRegistry } from "./registry"
import { readTool } from "./read"
import { writeTool } from "./write"
import { editTool } from "./edit"
import { bashTool } from "./bash"
import { globTool } from "./glob"

export function initializeTools(): void {
  toolRegistry.register(readTool)
  toolRegistry.register(writeTool)
  toolRegistry.register(editTool)
  toolRegistry.register(bashTool)
  toolRegistry.register(globTool)
}

export { toolRegistry }
export * from "./tool"
export * from "./parallel"
```

## 小结

本章我们实现了mini-opencode的Tool系统：

1. **Tool接口** - 统一的工具定义规范
2. **工具注册表** - 管理和发现工具
3. **核心工具** - read、write、edit、bash、glob
4. **并行执行引擎** - 依赖分析、拓扑排序、并发控制
5. **Token Bucket** - 经典速率限制算法
6. **权限系统** - allow/deny/ask三级权限控制

**技术亮点**：并行工具执行引擎是一个重要的技术亮点，它展示了：
- 依赖分析算法设计
- 拓扑排序应用
- 并发控制和速率限制
- 生产级工程实践

下一章我们将实现Agent系统，将LLM和Tool整合起来，实现AI编程助手的核心能力。

## 参考资料

- [OpenCode Tool实现](https://github.com/sst/opencode/tree/main/packages/opencode/src/tool)
- [Claude Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Token Bucket算法](https://en.wikipedia.org/wiki/Token_bucket)