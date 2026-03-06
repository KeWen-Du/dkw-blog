---
title: "从零到一实现 nano-agent（九）：并行执行"
date: "2025-01-08"
excerpt: "实现并行工具执行引擎，使用 Promise.allSettled 处理并发工具调用，显著提升 Agent 执行效率。"
tags: ["AI", "Parallel", "Async", "TypeScript", "并发编程"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 9
---

# 从零到一实现 nano-agent（九）：并行工具执行

## 前言

当 Agent 需要读取多个文件时，串行执行效率低下。并行工具执行可以让 Agent 一次发起多个独立操作，显著提升效率。本章将实现 batch 工具，支持并发执行多个工具调用。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Promise.allSettled | ⭐⭐⭐ | 并发编程 | ✅ |
| 并发控制 | ⭐⭐⭐⭐ | 性能优化 | ✅ |
| 错误隔离 | ⭐⭐⭐ | 容错设计 | ✅ |
| 工具编排 | ⭐⭐⭐ | 系统设计 | ✅ |

## 面试考点

1. Promise.all 和 Promise.allSettled 的区别？
2. 如何控制并发数量？
3. 并行执行中如何处理部分失败？

## 设计思路：为什么需要并行执行？

### 问题背景

在 Agent 工作流中，经常遇到可以并行执行的场景：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    串行执行的效率问题                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  典型场景：用户说 "对比这三个文件的实现"                              │
│                                                                      │
│  串行执行：                                                          │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                     │
│  │ read a.ts│────▶│ read b.ts│────▶│ read c.ts│                     │
│  │  1.5s    │     │  1.2s    │     │  1.3s    │                     │
│  └──────────┘     └──────────┘     └──────────┘                     │
│  总耗时 = 1.5 + 1.2 + 1.3 = 4.0s                                    │
│                                                                      │
│  并行执行：                                                          │
│  ┌──────────┐                                                       │
│  │ read a.ts│──┐                                                    │
│  │  1.5s    │  │                                                   │
│  └──────────┘  │   ┌─────────────────────────────────┐              │
│  ┌──────────┐  ├──▶│ 所有结果一起返回                 │              │
│  │ read b.ts│──┤   │ 总耗时 = max(1.5, 1.2, 1.3) = 1.5s │             │
│  │  1.2s    │  │   └─────────────────────────────────┘              │
│  └──────────┘  │                                                    │
│  ┌──────────┐  │                                                    │
│  │ read c.ts│──┘                                                    │
│  │  1.3s    │                                                       │
│  └──────────┘                                                       │
│                                                                      │
│  效率提升 = 4.0 / 1.5 ≈ 2.67 倍                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 为什么 LLM 天然支持并行调用？

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LLM 的并行能力                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  LLM 返回格式：                                                      │
│  {                                                                   │
│    "content": "我来读取这三个文件...",                               │
│    "tool_calls": [                                                   │
│      { "id": "1", "name": "read", "input": { "path": "/a.ts" } },   │
│      { "id": "2", "name": "read", "input": { "path": "/b.ts" } },   │
│      { "id": "3", "name": "read", "input": { "path": "/c.ts" } }    │
│    ]                                                                 │
│  }                                                                   │
│                                                                      │
│  观察：                                                              │
│  - LLM 一次可以返回多个 tool_calls                                  │
│  - 这些调用之间没有依赖关系                                         │
│  - 天然适合并行执行                                                 │
│                                                                      │
│  问题：Agent 框架通常怎么处理？                                      │
│  - 简单实现：for 循环串行执行                                        │
│  - 优化实现：Promise.all 并行执行                                   │
│                                                                      │
│  为什么有些框架串行执行？                                            │
│  - 实现简单                                                         │
│  - 错误处理容易                                                     │
│  - 结果顺序确定                                                     │
│                                                                      │
│  但这浪费了 LLM 的能力！                                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 为什么选择 Promise.allSettled 而不是 Promise.all？

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Promise.all vs Promise.allSettled                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Promise.all：                                                       │
│  - 任意一个 reject，整个 Promise reject                             │
│  - 无法获取部分成功的结果                                           │
│  - 适用于"全部成功才算成功"的场景                                   │
│                                                                      │
│  Promise.allSettled：                                                │
│  - 等待所有 Promise 完成，无论成功失败                              │
│  - 返回每个 Promise 的状态和结果                                    │
│  - 适用于"部分失败也要继续"的场景                                   │
│                                                                      │
│  Agent 场景分析：                                                    │
│  - 读取 3 个文件，其中 1 个不存在                                    │
│  - Promise.all：整个操作失败，LLM 得不到任何结果                    │
│  - Promise.allSettled：成功读取 2 个，失败的告知原因                 │
│                                                                      │
│  结论：Agent 场景更适合 Promise.allSettled                          │
│  - LLM 可以根据部分结果继续工作                                     │
│  - 失败的信息帮助 LLM 调整策略                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 方案对比：并发控制策略

### 方案一：无限制并行（本文基础方案）

```typescript
const results = await Promise.allSettled(
    toolCalls.map(call => executeTool(call))
)
```

**优点**：简单，最大并发  
**缺点**：可能超过系统限制（文件描述符、内存）  
**适用**：少量并发

### 方案二：限制并发数量（本文推荐方案）

```typescript
async function parallelLimit<T>(
    tasks: (() => Promise<T>)[],
    limit: number
): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = []
    const executing: Promise<void>[] = []
    
    for (const [index, task] of tasks.entries()) {
        const promise = task().then(result => {
            results[index] = { status: "fulfilled", value: result }
        }).catch(error => {
            results[index] = { status: "rejected", reason: error }
        })
        
        executing.push(promise)
        
        if (executing.length >= limit) {
            await Promise.race(executing)
            executing.splice(executing.findIndex(p => p !== promise), 1)
        }
    }
    
    await Promise.all(executing)
    return results
}

// 使用：最多 5 个并发
const results = await parallelLimit(tasks, 5)
```

**优点**：可控的资源使用  
**缺点**：实现稍复杂  
**适用**：大量并发任务

### 方案三：动态并发控制

```typescript
// 根据系统负载动态调整并发数
class AdaptiveConcurrency {
    private limit = 5
    private successCount = 0
    private failureCount = 0
    
    onSuccess() {
        this.successCount++
        if (this.successCount > 10 && this.limit < 10) {
            this.limit++
            this.successCount = 0
        }
    }
    
    onFailure() {
        this.failureCount++
        if (this.failureCount > 2 && this.limit > 1) {
            this.limit--
            this.failureCount = 0
        }
    }
}
```

**优点**：自动适应系统负载  
**缺点**：实现复杂，调优困难  
**适用**：高性能场景

## 常见陷阱与解决方案

### 陷阱一：并行结果顺序错乱

**问题描述**：
```typescript
// 调用顺序
tool_calls: [
    { id: "1", name: "read", input: { path: "/a.ts" } },
    { id: "2", name: "read", input: { path: "/b.ts" } },
]

// 并行执行，结果顺序可能相反
results: [
    { tool_use_id: "2", content: "b.ts content" },  // 先返回
    { tool_use_id: "1", content: "a.ts content" },  // 后返回
]

// 问题：LLM 可能混淆哪个结果对应哪个文件
```

**解决方案**：保持 ID 关联

```typescript
// 使用原始请求的 ID
const results = await Promise.allSettled(
    toolCalls.map(async (call) => {
        const result = await executeTool(call)
        return {
            tool_use_id: call.id,  // 使用原始 ID
            tool_name: call.name,
            content: result.output,
        }
    })
)

// 结果始终包含正确的 ID
results.forEach(result => {
    console.log(`Tool ${result.tool_use_id}: ${result.content}`)
})
```

### 陷阱二：一个工具失败影响整体

**问题描述**：
```typescript
// 使用 Promise.all
const results = await Promise.all([
    readTool({ path: "/exists.ts" }),
    readTool({ path: "/not-exists.ts" }),  // 这个会 reject
])

// 结果：整个 Promise reject，第一个文件的结果也丢失了
```

**解决方案**：使用 Promise.allSettled + 错误包装

```typescript
const results = await Promise.allSettled(
    toolCalls.map(call => executeToolSafe(call))
)

// 处理结果
const toolResults = results.map((result, index) => {
    if (result.status === "fulfilled") {
        return result.value
    } else {
        // 失败也返回结构化结果
        return {
            tool_use_id: toolCalls[index].id,
            content: `Error: ${result.reason.message}`,
            is_error: true,
        }
    }
})
```

### 陷阱三：并发数过高导致系统崩溃

**问题描述**：
```typescript
// LLM 返回 50 个工具调用
const toolCalls = [...50 个调用]

// 无限制并行
await Promise.all(toolCalls.map(execute))  // 可能崩溃

// 问题：
// - 文件描述符耗尽
// - 内存溢出
// - API 限流
```

**解决方案**：限制并发数

```typescript
import pLimit from "p-limit"

const limit = pLimit(5)  // 最多 5 个并发

const results = await Promise.allSettled(
    toolCalls.map(call => limit(() => executeTool(call)))
)

// 或者自己实现
async function* batchExecute(
    calls: ToolCall[],
    batchSize: number
): AsyncGenerator<ToolResult[]> {
    for (let i = 0; i < calls.length; i += batchSize) {
        const batch = calls.slice(i, i + batchSize)
        yield await Promise.allSettled(batch.map(executeTool))
    }
}
```

### 陷阱四：忘记传递正确的上下文给 LLM

**问题描述**：
```typescript
// 并行执行成功，但结果格式不对
const results = [
    "file content...",  // 只有内容
    "another content...",
]

// LLM 不知道哪个结果对应哪个工具
```

**解决方案**：结构化返回结果

```typescript
// 正确的返回格式
const toolResults = results.map((result, index) => ({
    type: "tool_result",
    tool_use_id: toolCalls[index].id,  // 关联 ID
    content: result.status === "fulfilled" 
        ? result.value.output 
        : `Error: ${result.reason.message}`,
    is_error: result.status === "rejected",
}))

// 构建消息
messages.push({
    role: "user",
    content: toolResults,
})
```

### 陷阱五：并行执行时权限检查遗漏

**问题描述**：
```typescript
// 串行时每次都检查权限
for (const call of toolCalls) {
    if (!await checkPermission(user, call)) {
        throw new Error("Permission denied")
    }
    await executeTool(call)
}

// 并行时忘记检查
await Promise.all(toolCalls.map(executeTool))  // 跳过权限检查
```

**解决方案**：在执行前统一检查或包装执行函数

```typescript
async function executeWithPermission(
    user: User,
    call: ToolCall
): Promise<ToolResult> {
    // 先检查权限
    if (!await checkPermission(user, call)) {
        return {
            tool_use_id: call.id,
            content: `Permission denied: ${call.name}`,
            is_error: true,
        }
    }
    
    // 再执行
    return await executeTool(call)
}

// 安全的并行执行
const results = await Promise.allSettled(
    toolCalls.map(call => executeWithPermission(user, call))
)
```

## 并行执行架构

### 串行 vs 并行

```
串行执行:
┌─────────────────────────────────────────────────────────────┐
│  Tool 1 ──────────────▶  Result 1                          │
│                          │                                   │
│                          ▼                                   │
│  Tool 2 ──────────────▶  Result 2                          │
│                          │                                   │
│                          ▼                                   │
│  Tool 3 ──────────────▶  Result 3                          │
│                                                             │
│  总时间 = T1 + T2 + T3                                      │
└─────────────────────────────────────────────────────────────┘

并行执行:
┌─────────────────────────────────────────────────────────────┐
│  Tool 1 ──────────────▶  Result 1                          │
│  Tool 2 ──────────────▶  Result 2                          │
│  Tool 3 ──────────────▶  Result 3                          │
│                                                             │
│  总时间 = max(T1, T2, T3)                                   │
└─────────────────────────────────────────────────────────────┘
```

### Batch 工具设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Batch Tool Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  输入:                                                      │
│  {                                                          │
│    tool_calls: [                                            │
│      { tool: "read", parameters: { path: "/a.ts" } },      │
│      { tool: "read", parameters: { path: "/b.ts" } },      │
│      { tool: "glob", parameters: { pattern: "*.md" } }     │
│    ]                                                        │
│  }                                                          │
│                                                             │
│  处理:                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Promise.allSettled([                               │   │
│  │    executeTool("read", { path: "/a.ts" }),          │   │
│  │    executeTool("read", { path: "/b.ts" }),          │   │
│  │    executeTool("glob", { pattern: "*.md" })         │   │
│  │  ])                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  输出:                                                      │
│  [                                                          │
│    { status: "fulfilled", value: Result1 },                │
│    { status: "fulfilled", value: Result2 },                │
│    { status: "rejected", reason: Error }                   │
│  ]                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Batch 工具实现

```typescript
// src/tool/batch.ts

import z from "zod"
import { ToolDefinition, ToolContext, ToolResult } from "./tool"
import { toolRegistry } from "./registry"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "batch" })

/**
 * 禁止在 batch 中使用的工具
 */
const DISALLOWED_TOOLS = new Set(["batch"])

export const batchTool: ToolDefinition = {
  name: "batch",
  description: `Execute multiple tools in parallel for better performance.

IMPORTANT:
- Use this tool when you need to call multiple independent tools
- Tools are executed in parallel, improving efficiency
- Each tool call gets its own result
- Maximum 10 tools per batch

Example: Read multiple files at once, or search for patterns in multiple directories.`,

  parameters: z.object({
    tool_calls: z
      .array(
        z.object({
          tool: z.string().describe("The name of the tool to execute"),
          parameters: z.record(z.unknown()).describe("Parameters for the tool"),
        })
      )
      .min(1, "Provide at least one tool call")
      .max(10, "Maximum 10 tools per batch")
      .describe("Array of tool calls to execute in parallel"),
  }),

  async execute(
    params: z.infer<typeof batchTool.parameters>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const { tool_calls } = params
    const startTime = Date.now()

    log.info("Executing batch", { count: tool_calls.length })

    // 并行执行所有工具调用
    const results = await Promise.allSettled(
      tool_calls.map(async (call) => {
        // 检查是否在禁止列表中
        if (DISALLOWED_TOOLS.has(call.tool)) {
          throw new Error(
            `Tool '${call.tool}' is not allowed in batch. ` +
            `Disallowed: ${Array.from(DISALLOWED_TOOLS).join(", ")}`
          )
        }

        const tool = toolRegistry.get(call.tool)
        if (!tool) {
          throw new Error(
            `Unknown tool: ${call.tool}. ` +
            `Available: ${toolRegistry.list().map(t => t.name).join(", ")}`
          )
        }

        // Zod 参数验证
        const validatedParams = tool.parameters.parse(call.parameters)

        // 执行工具
        const result = await tool.execute(validatedParams, ctx)

        return {
          tool: call.tool,
          success: true as const,
          output: result.output,
          metadata: result.metadata,
        }
      })
    )

    // 统计结果
    const successful = results.filter((r) => r.status === "fulfilled")
    const failed = results.filter((r) => r.status === "rejected")

    const duration = Date.now() - startTime

    // 构建输出
    const outputLines: string[] = [
      `Batch executed ${results.length} tools in ${duration}ms`,
      `Success: ${successful.length}, Failed: ${failed.length}`,
      "",
    ]

    results.forEach((r, i) => {
      const toolName = tool_calls[i].tool
      if (r.status === "fulfilled") {
        const output = r.value.output
        const truncated = output.length > 500 
          ? output.slice(0, 500) + "...\n[truncated]" 
          : output
        outputLines.push(`[${toolName}] ✓`)
        outputLines.push(truncated)
        outputLines.push("")
      } else {
        const errorMsg = r.reason instanceof Error 
          ? r.reason.message 
          : String(r.reason)
        outputLines.push(`[${toolName}] ✗ Error: ${errorMsg}`)
        outputLines.push("")
      }
    })

    log.info("Batch completed", {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      duration,
    })

    return {
      title: `Batch (${successful.length}/${results.length} successful)`,
      output: outputLines.join("\n"),
      metadata: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        duration,
        details: results.map((r, i) => ({
          tool: tool_calls[i].tool,
          success: r.status === "fulfilled",
        })),
      },
    }
  },
}
```

## 并发控制

### 限制并发数量

```typescript
// src/util/concurrency.ts

/**
 * 并发控制器
 */
export class ConcurrencyLimiter {
  private running = 0
  private queue: Array<() => void> = []

  constructor(private maxConcurrent: number) {}

  /**
   * 获取执行槽
   */
  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++
      return
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++
        resolve()
      })
    })
  }

  /**
   * 释放执行槽
   */
  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) {
      next()
    }
  }

  /**
   * 使用限制执行异步函数
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

/**
 * 带并发限制的批量执行
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const limiter = new ConcurrencyLimiter(limit)
  
  return Promise.allSettled(
    items.map(item => limiter.run(() => fn(item)))
  )
}
```

### 带超时的并行执行

```typescript
// src/util/timeout.ts

/**
 * 带超时的 Promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ])
}

/**
 * 带超时的批量执行
 */
export async function batchWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(
    promises.map(p => withTimeout(p, timeoutMs))
  )
}
```

## 使用示例

### Agent 使用 batch 工具

```
用户: "帮我读取 src 目录下的所有 TypeScript 文件"

Agent 思考:
我需要先找到所有文件，然后批量读取

Tool Call 1:
{
  name: "glob",
  input: { pattern: "src/**/*.ts" }
}

Result: 找到 5 个文件

Tool Call 2:
{
  name: "batch",
  input: {
    tool_calls: [
      { tool: "read", parameters: { path: "/src/index.ts" } },
      { tool: "read", parameters: { path: "/src/utils.ts" } },
      { tool: "read", parameters: { path: "/src/types.ts" } },
      { tool: "read", parameters: { path: "/src/api.ts" } },
      { tool: "read", parameters: { path: "/src/config.ts" } }
    ]
  }
}

Result: 
Batch executed 5 tools in 450ms
Success: 5, Failed: 0
[所有文件内容...]
```

### 性能对比

```typescript
// 串行执行
async function serialRead(paths: string[]): Promise<string[]> {
  const results = []
  for (const path of paths) {
    results.push(await readFile(path))
  }
  return results
}

// 并行执行
async function parallelRead(paths: string[]): Promise<string[]> {
  return Promise.all(paths.map(path => readFile(path)))
}

// 使用 batch 工具（推荐）
async function batchRead(paths: string[], ctx: ToolContext): Promise<ToolResult> {
  return batchTool.execute({
    tool_calls: paths.map(path => ({
      tool: "read",
      parameters: { path },
    })),
  }, ctx)
}

// 性能对比（假设每个文件读取 100ms）
// 串行: 5 files * 100ms = 500ms
// 并行: max(100ms) = 100ms
// 提升: 5x
```

## 错误处理策略

### 部分失败处理

```typescript
// Promise.allSettled 返回的结果类型
type SettledResult<T> = 
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: any }

// 处理结果
function processResults<T>(results: SettledResult<T>[]): {
  successful: T[]
  failed: Error[]
} {
  const successful: T[] = []
  const failed: Error[] = []

  for (const result of results) {
    if (result.status === "fulfilled") {
      successful.push(result.value)
    } else {
      failed.push(
        result.reason instanceof Error 
          ? result.reason 
          : new Error(String(result.reason))
      )
    }
  }

  return { successful, failed }
}

// 使用示例
const results = await Promise.allSettled([
  readTool.execute({ path: "/a.ts" }, ctx),
  readTool.execute({ path: "/b.ts" }, ctx),  // 这个可能失败
  readTool.execute({ path: "/c.ts" }, ctx),
])

const { successful, failed } = processResults(results)
console.log(`成功: ${successful.length}, 失败: ${failed.length}`)
```

### 重试策略

```typescript
/**
 * 带重试的执行
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (i < maxRetries - 1) {
        await sleep(delayMs * (i + 1))  // 指数退避
      }
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

## 小结

本章实现了并行工具执行系统，包括：

1. **Batch 工具** - 支持一次执行多个工具
2. **Promise.allSettled** - 正确处理部分失败
3. **并发控制** - 限制最大并发数
4. **错误隔离** - 单个失败不影响其他调用

**关键要点**：

- 并行执行显著提升 I/O 密集型操作效率
- Promise.allSettled 比 Promise.all 更适合部分失败场景
- 需要限制并发数避免资源耗尽
- 单个工具失败不应影响整个 batch

下一章我们将实现 Skill 技能系统。

## 参考资料

- [Promise.allSettled - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)
- [JavaScript Concurrency Patterns](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)
- [Async Pool](https://github.com/rxaviers/async-pool)
