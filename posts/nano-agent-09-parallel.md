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
