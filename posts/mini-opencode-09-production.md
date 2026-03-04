---
title: "从零到一实现mini-opencode（九）：生产部署与优化"
date: "2026-03-03 17:00:00"
excerpt: "mini-opencode的生产部署与优化实践，包括错误处理、性能优化、安全考量和发布流程。"
tags: ["AI", "LLM", "Production", "DevOps", "TypeScript"]
---

# 从零到一实现mini-opencode（九）：生产部署与优化

## 前言

本章将讨论mini-opencode的生产化实践，包括错误处理策略、性能优化技巧、安全考量以及发布流程，帮助读者将项目从原型推向生产。

## 错误处理

### 统一错误类型

```typescript
// src/error/index.ts
import z from "zod"

export const AppError = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("provider"),
    message: z.string(),
    provider: z.string(),
    code: z.string().optional(),
    retryable: z.boolean(),
  }),
  z.object({
    type: z.literal("tool"),
    message: z.string(),
    tool: z.string(),
    input: z.record(z.any()).optional(),
  }),
  z.object({
    type: z.literal("permission"),
    message: z.string(),
    resource: z.string(),
    action: z.string(),
  }),
  z.object({
    type: z.literal("validation"),
    message: z.string(),
    field: z.string().optional(),
  }),
  z.object({
    type: z.literal("internal"),
    message: z.string(),
    stack: z.string().optional(),
  }),
])

export type AppError = z.infer<typeof AppError>

export function createError(
  type: AppError["type"],
  details: Omit<AppError, "type">
): AppError {
  return { type, ...details } as AppError
}

// 错误格式化
export function formatError(error: AppError | Error): string {
  if ("type" in error) {
    switch (error.type) {
      case "provider":
        return `[${error.provider}] ${error.message}`
      case "tool":
        return `Tool "${error.tool}" failed: ${error.message}`
      case "permission":
        return `Permission denied: ${error.action} on ${error.resource}`
      case "validation":
        return `Validation error: ${error.message}`
      case "internal":
        return error.message
    }
  }
  return error.message
}
```

### 重试策略

```typescript
// src/util/retry.ts
export interface RetryOptions {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  shouldRetry?: (error: Error) => boolean
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = isRetryableError,
  } = options

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (!shouldRetry(lastError) || attempt === maxAttempts) {
        throw lastError
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
      await sleep(delay)
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableError(error: Error): boolean {
  // 网络错误、超时、5xx错误可重试
  const message = error.message.toLowerCase()
  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("rate limit")
  )
}
```

## 性能优化

### Token缓存

```typescript
// src/cache/token-cache.ts
import { createHash } from "crypto"

interface CacheEntry {
  response: string
  timestamp: number
  hits: number
}

export class TokenCache {
  private cache = new Map<string, CacheEntry>()
  private maxEntries = 100
  private ttl = 3600000  // 1小时

  private hash(messages: any[], system?: string): string {
    const content = JSON.stringify({ messages, system })
    return createHash("sha256").update(content).digest("hex")
  }

  get(messages: any[], system?: string): string | null {
    const key = this.hash(messages, system)
    const entry = this.cache.get(key)

    if (!entry) return null

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }

    entry.hits++
    return entry.response
  }

  set(messages: any[], system: string | undefined, response: string): void {
    const key = this.hash(messages, system)

    // LRU淘汰
    if (this.cache.size >= this.maxEntries) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
      this.cache.delete(oldest[0])
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hits: 0,
    })
  }
}
```

### 并发控制

```typescript
// src/util/concurrency.ts
export class ConcurrencyLimiter {
  private running = 0
  private queue: Array<() => void> = []

  constructor(private maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++
      return Promise.resolve()
    }

    return new Promise(resolve => {
      this.queue.push(resolve)
    })
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.running--
    }
  }
}

// 使用示例
const limiter = new ConcurrencyLimiter(5)  // 最多5个并发

const results = await Promise.all(
  tasks.map(task => limiter.run(() => processTask(task)))
)
```

### 消息截断

```typescript
// src/agent/truncation.ts
export class MessageTruncator {
  private maxTokens: number

  constructor(maxTokens = 100000) {
    this.maxTokens = maxTokens
  }

  truncate(messages: ChatMessage[]): ChatMessage[] {
    const estimated = this.estimateTokens(messages)
    
    if (estimated <= this.maxTokens) {
      return messages
    }

    // 策略：保留首尾，压缩中间
    const result: ChatMessage[] = []
    const keepFirst = 2
    const keepLast = 4

    // 保留开头的系统消息
    result.push(...messages.slice(0, keepFirst))

    // 压缩中间消息
    const middle = messages.slice(keepFirst, -keepLast)
    if (middle.length > 0) {
      result.push({
        role: "user",
        content: `[${middle.length} earlier messages summarized]`,
      })
    }

    // 保留最后的消息
    result.push(...messages.slice(-keepLast))

    return result
  }

  private estimateTokens(messages: ChatMessage[]): number {
    let chars = 0
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        chars += msg.content.length
      } else {
        for (const block of msg.content) {
          if (block.type === "text") chars += block.text.length
          else if (block.type === "tool_result") chars += block.content.length
        }
      }
    }
    return Math.ceil(chars / 4)  // 粗略估算
  }
}
```

## 安全考量

### 路径安全

```typescript
// src/security/path.ts
import { resolve, normalize, relative } from "path"

export function validatePath(
  requestedPath: string,
  allowedBase: string
): string {
  const absolute = resolve(requestedPath)
  const normalized = normalize(absolute)
  const base = resolve(allowedBase)

  // 检查是否在允许的目录内
  const relativePath = relative(base, normalized)
  
  if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
    throw new Error(`Access denied: path outside working directory`)
  }

  return normalized
}

// 检查敏感文件
const SENSITIVE_PATTERNS = [
  /\.env$/,
  /\.env\./,
  /id_rsa/,
  /id_ed25519/,
  /\.pem$/,
  /\.key$/,
  /credentials/,
  /secrets?/,
]

export function isSensitiveFile(path: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(path))
}
```

### 输入验证

```typescript
// src/security/input.ts
import z from "zod"

// 命令注入检测
const DANGEROUS_PATTERNS = [
  /[;&|`$]/,           // Shell特殊字符
  /\$\(/,              // 命令替换
  /`.*`/,              // 反引号命令替换
  /\|\|/,              // 命令链
  /&&/,                // 命令链
  />\s*\//,            // 重定向到根目录
]

export function sanitizeCommand(command: string): string {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Potentially dangerous command detected`)
    }
  }
  return command
}

// 路径遍历检测
export function sanitizePath(path: string): string {
  if (path.includes("..")) {
    throw new Error(`Path traversal detected`)
  }
  if (path.includes("\0")) {
    throw new Error(`Null byte injection detected`)
  }
  return path
}
```

## 发布流程

### 构建配置

```json
// package.json
{
  "name": "mini-opencode",
  "version": "0.1.0",
  "description": "A minimal AI coding assistant CLI",
  "type": "module",
  "bin": {
    "mini-opencode": "./dist/cli.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "bun run src/cli.ts",
    "start": "node dist/cli.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "glob": "^11.0.0",
    "ink": "^5.0.1",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^6.0.0",
    "openai": "^4.85.0",
    "react": "^18.3.1",
    "yargs": "^17.7.2",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^22.13.5",
    "@types/react": "^18.3.18",
    "@types/yargs": "^17.0.33",
    "bun-types": "^1.2.4",
    "typescript": "^5.7.3"
  },
  "files": ["dist"]
}
```

### 发布脚本

```bash
#!/bin/bash
# scripts/release.sh

set -e

# 版本检查
VERSION=$(node -p "require('./package.json').version")
echo "Releasing version $VERSION"

# 运行测试
bun test

# 构建
bun run build

# 检查构建产物
if [ ! -d "dist" ]; then
  echo "Build failed: dist directory not found"
  exit 1
fi

# 发布到npm
npm publish --access public

# 创建Git标签
git tag "v$VERSION"
git push --tags

echo "Released version $VERSION successfully!"
```

### CI/CD配置

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - run: bun install
      
      - run: bun test
      
      - run: bun run build
      
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          registry-url: "https://registry.npmjs.org"
      
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 监控与日志

### 结构化日志

```typescript
// src/util/structured-log.ts
import { writeFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

interface LogEntry {
  timestamp: string
  level: "debug" | "info" | "warn" | "error"
  service?: string
  message: string
  data?: Record<string, any>
  duration?: number
}

export class StructuredLogger {
  private service: string
  private logFile: string

  constructor(service: string) {
    this.service = service
    this.logFile = join(homedir(), ".mini-opencode", "logs", "app.log")
  }

  log(level: LogEntry["level"], message: string, data?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      data,
    }

    // 文件输出
    this.writeToFile(entry)

    // 控制台输出（开发模式）
    if (process.env.DEBUG) {
      console.log(JSON.stringify(entry))
    }
  }

  private writeToFile(entry: LogEntry) {
    try {
      writeFileSync(this.logFile, JSON.stringify(entry) + "\n", { flag: "a" })
    } catch {
      // 忽略日志写入错误
    }
  }

  // 性能计时
  time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now()
    return fn().finally(() => {
      const duration = Date.now() - start
      this.log("debug", `${label} completed`, { duration })
    })
  }
}
```

### 使用统计

```typescript
// src/stats/usage.ts
interface UsageStats {
  totalSessions: number
  totalMessages: number
  totalTokens: { input: number; output: number }
  totalCost: number
  toolUsage: Record<string, number>
  modelUsage: Record<string, number>
}

export class UsageTracker {
  private stats: UsageStats = {
    totalSessions: 0,
    totalMessages: 0,
    totalTokens: { input: 0, output: 0 },
    totalCost: 0,
    toolUsage: {},
    modelUsage: {},
  }

  recordMessage(model: string, inputTokens: number, outputTokens: number, cost: number) {
    this.stats.totalMessages++
    this.stats.totalTokens.input += inputTokens
    this.stats.totalTokens.output += outputTokens
    this.stats.totalCost += cost
    this.stats.modelUsage[model] = (this.stats.modelUsage[model] ?? 0) + 1
  }

  recordToolCall(tool: string) {
    this.stats.toolUsage[tool] = (this.stats.toolUsage[tool] ?? 0) + 1
  }

  getStats(): UsageStats {
    return { ...this.stats }
  }
}
```

## 小结

本章我们讨论了mini-opencode的生产化实践：

1. **错误处理** - 统一错误类型和重试策略
2. **性能优化** - Token缓存、并发控制、消息截断
3. **安全考量** - 路径安全、输入验证
4. **发布流程** - 构建配置、CI/CD
5. **监控日志** - 结构化日志、使用统计

## 系列总结

恭喜你完成了"从零到一实现mini-opencode"系列！我们覆盖了：

1. 架构设计与技术选型
2. CLI框架搭建（yargs命令解析）
3. LLM Provider集成（Anthropic/OpenAI）
4. Tool系统实现（文件操作、Shell命令）
5. Agent系统构建（工具调用循环）
6. Session管理（内存存储）
7. MCP协议支持（扩展内容，简化版未实现）
8. TUI界面开发（Ink/React）
9. 生产部署与优化

mini-opencode虽然简化，但包含了AI编程助手的核心能力：
- 多Provider支持（Anthropic Claude、OpenAI GPT）
- 文件读写和编辑工具
- Shell命令执行
- 权限管理系统
- 实时流式输出
- Token使用和成本统计

希望这个系列能帮助你理解OpenCode等项目的内部工作原理。完整版OpenCode还包含MCP协议支持、SQLite持久化、更多工具类型等高级功能。

## 参考资料

- [OpenCode源码](https://github.com/sst/opencode)
- [Claude API最佳实践](https://docs.anthropic.com/claude/docs/api-best-practices)
- [Node.js安全最佳实践](https://nodejs.org/en/docs/guides/security/)
