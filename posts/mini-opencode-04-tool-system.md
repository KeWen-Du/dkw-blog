---
title: "从零到一实现mini-opencode（四）：Tool系统实现"
date: "2026-03-03 12:00:00"
excerpt: "实现mini-opencode的Tool系统，定义工具接口，实现read、write、edit、bash等核心工具，建立权限控制机制。"
tags: ["AI", "LLM", "TypeScript", "Tools"]
---

# 从零到一实现mini-opencode（四）：Tool系统实现

## 前言

Tool系统是AI编程助手的核心能力之一，它让AI能够与外部世界交互——读取文件、执行命令、修改代码。本章将实现mini-opencode的Tool系统，包括工具定义接口、核心工具实现和权限控制机制。

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

  register(tool: ToolDefinition): void {
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
  // 简化实现，实际可使用zod-to-json-schema库
  const def = schema._def
  
  if (def.typeName === "ZodObject") {
    const properties: Record<string, any> = {}
    const required: string[] = []
    
    for (const [key, value] of Object.entries(def.shape())) {
      properties[key] = zodToJsonSchema(value as z.ZodType)
      // 检查是否可选
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
    // 安全检查：确保路径在工作目录内
    const absolutePath = resolve(params.path)
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }

    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }

    const fileStat = await stat(absolutePath)
    
    // 检查文件大小
    if (fileStat.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${fileStat.size} bytes (max: ${MAX_FILE_SIZE})`)
    }

    // 检测文件类型
    const ext = absolutePath.split('.').pop()?.toLowerCase()
    
    // 图片文件
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

    // 添加行号
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
    // 安全检查
    const absolutePath = resolve(params.path)
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }

    // 确保目录存在
    const dir = dirname(absolutePath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    // 写入文件
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
    // 安全检查
    const absolutePath = resolve(params.path)
    if (!absolutePath.startsWith(ctx.workingDirectory)) {
      throw new Error(`Path must be within working directory: ${ctx.workingDirectory}`)
    }

    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }

    // 读取文件内容
    const content = await readFile(absolutePath, 'utf-8')

    // 查找并替换
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
    
    // 写入文件
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

      // 超时处理
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

  // 检查权限
  check(request: PermissionRequest): PermissionAction {
    for (const rule of this.rules) {
      if (this.matchesRule(request, rule)) {
        return rule.action
      }
    }
    // 默认询问
    return "ask"
  }

  private matchesRule(request: PermissionRequest, rule: PermissionRule): boolean {
    // 检查工具名称
    if (rule.tool !== "*" && rule.tool !== request.tool) {
      return false
    }

    // 如果没有pattern要求，直接匹配
    if (!rule.patterns || rule.patterns.length === 0) {
      return true
    }

    // 检查pattern匹配
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
    // 简单的通配符匹配
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
    )
    return regex.test(value)
  }

  // 添加规则
  addRule(rule: PermissionRule): void {
    this.rules.unshift(rule)  // 新规则优先
  }
}
```

### 默认权限配置

```typescript
// src/permission/default.ts
import { PermissionRule } from "./permission"

export const DEFAULT_RULES: PermissionRule[] = [
  // 默认允许读取
  { tool: "read", action: "allow" },
  { tool: "glob", action: "allow" },
  
  // 写入需要确认
  { tool: "write", action: "ask" },
  { tool: "edit", action: "ask" },
  
  // bash命令需要确认
  { tool: "bash", action: "ask" },
  
  // 危险命令拒绝
  { 
    tool: "bash", 
    action: "deny",
    patterns: ["rm -rf /", "rm -rf ~", ":(){ :|:& };:"]
  },
]

// 只读模式规则
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
```

## 工具执行器

```typescript
// src/tool/executor.ts
import { toolRegistry } from "./registry"
import { PermissionManager, PermissionRequest } from "@/permission/permission"
import { ToolContext, ToolResult } from "./tool"
import { Logger } from "@/util/logger"

const log = Logger.create({ service: "tool-executor" })

export interface ExecutorOptions {
  sessionId: string
  messageId: string
  workingDirectory: string
  permission: PermissionManager
  onAsk?: (request: PermissionRequest) => Promise<boolean>
}

export class ToolExecutor {
  constructor(private options: ExecutorOptions) {}

  async execute(
    toolName: string,
    params: Record<string, any>
  ): Promise<ToolResult> {
    const tool = toolRegistry.get(toolName)
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`)
    }

    // 参数验证
    const validatedParams = tool.parameters.parse(params)

    // 权限检查
    const request: PermissionRequest = {
      tool: toolName,
      params: validatedParams,
      patterns: this.extractPatterns(toolName, validatedParams),
    }

    const action = this.options.permission.check(request)

    if (action === "deny") {
      throw new Error(`Tool ${toolName} is denied by permission rules`)
    }

    if (action === "ask" && this.options.onAsk) {
      const approved = await this.options.onAsk(request)
      if (!approved) {
        throw new Error(`Tool ${toolName} was not approved by user`)
      }
    }

    log.info("Executing tool", { tool: toolName, params: validatedParams })

    // 执行工具
    const ctx: ToolContext = {
      sessionId: this.options.sessionId,
      messageId: this.options.messageId,
      workingDirectory: this.options.workingDirectory,
      abortSignal: new AbortController().signal,
    }

    return tool.execute(validatedParams, ctx)
  }

  private extractPatterns(tool: string, params: any): string[] | undefined {
    switch (tool) {
      case "read":
      case "write":
      case "edit":
        return params.path ? [params.path] : undefined
      case "bash":
        return params.command ? [params.command] : undefined
      default:
        return undefined
    }
  }
}
```

## 小结

本章我们实现了mini-opencode的Tool系统：

1. **Tool接口** - 统一的工具定义规范
2. **工具注册表** - 管理和发现工具
3. **核心工具** - read、write、edit、bash、glob
4. **权限系统** - allow/deny/ask三级权限控制
5. **工具执行器** - 安全执行工具调用

下一章我们将实现Agent系统，将LLM和Tool整合起来，实现AI编程助手的核心能力。

## 参考资料

- [OpenCode Tool实现](https://github.com/sst/opencode/tree/main/packages/opencode/src/tool)
- [Claude Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
