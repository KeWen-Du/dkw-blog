---
title: "从零到一实现 nano-agent（十二）：生产级实践"
date: "2025-02-03"
excerpt: "总结生产级 AI 编程助手的实践经验，包括错误恢复、可观测性、性能优化和部署策略，为项目画上圆满句号。"
tags: ["AI", "Production", "DevOps", "TypeScript", "最佳实践"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 12
---

# 从零到一实现 nano-agent（十二）：生产级实践

## 前言

经过前 11 章的实现，nano-agent 已经具备了 AI 编程助手的核心功能。本章将讨论生产级实践，包括错误恢复、可观测性、性能优化和部署策略，帮助你将项目推向生产环境。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 错误恢复机制 | ⭐⭐⭐⭐ | 系统健壮性 | ✅ |
| 可观测性设计 | ⭐⭐⭐⭐ | 生产级能力 | ✅ |
| 性能优化 | ⭐⭐⭐ | 优化能力 | ✅ |
| 部署策略 | ⭐⭐⭐ | DevOps | ✅ |

## 错误恢复机制

### 错误类型分类

```typescript
// src/error/index.ts

/**
 * 错误类型枚举
 */
export enum ErrorType {
  // API 错误
  API_KEY_INVALID = "API_KEY_INVALID",
  RATE_LIMIT = "RATE_LIMIT",
  MODEL_NOT_FOUND = "MODEL_NOT_FOUND",
  CONTEXT_TOO_LONG = "CONTEXT_TOO_LONG",
  
  // 网络错误
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT = "TIMEOUT",
  CONNECTION_RESET = "CONNECTION_RESET",
  
  // 工具错误
  TOOL_NOT_FOUND = "TOOL_NOT_FOUND",
  TOOL_EXECUTION_ERROR = "TOOL_EXECUTION_ERROR",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  
  // 内部错误
  INTERNAL_ERROR = "INTERNAL_ERROR",
  UNKNOWN = "UNKNOWN",
}

/**
 * 自定义错误类
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public type: ErrorType,
    public retryable: boolean = false,
    public originalError?: Error
  ) {
    super(message)
    this.name = "AgentError"
  }

  static fromError(error: unknown): AgentError {
    if (error instanceof AgentError) {
      return error
    }

    const message = error instanceof Error ? error.message : String(error)
    
    // 根据错误消息判断类型
    if (message.includes("API key") || message.includes("Unauthorized")) {
      return new AgentError(message, ErrorType.API_KEY_INVALID, false, error as Error)
    }
    if (message.includes("rate limit") || message.includes("429")) {
      return new AgentError(message, ErrorType.RATE_LIMIT, true, error as Error)
    }
    if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
      return new AgentError(message, ErrorType.TIMEOUT, true, error as Error)
    }
    if (message.includes("network") || message.includes("ECONNREFUSED")) {
      return new AgentError(message, ErrorType.NETWORK_ERROR, true, error as Error)
    }
    if (message.includes("context") || message.includes("token")) {
      return new AgentError(message, ErrorType.CONTEXT_TOO_LONG, false, error as Error)
    }

    return new AgentError(message, ErrorType.UNKNOWN, false, error as Error)
  }
}
```

### 重试策略

```typescript
// src/agent/recovery.ts

import { AgentError, ErrorType } from "../error"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "recovery" })

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors: ErrorType[]
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorType.RATE_LIMIT,
    ErrorType.TIMEOUT,
    ErrorType.NETWORK_ERROR,
    ErrorType.CONNECTION_RESET,
  ],
}

/**
 * 错误恢复管理器
 */
export class ErrorRecovery {
  constructor(private config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  /**
   * 判断错误是否可重试
   */
  isRetryable(error: AgentError): boolean {
    return error.retryable || this.config.retryableErrors.includes(error.type)
  }

  /**
   * 计算退避时间
   */
  calculateBackoff(attempt: number): number {
    const delay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt)
    return Math.min(delay, this.config.maxDelayMs)
  }

  /**
   * 带重试的执行
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: AgentError | null = null

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = AgentError.fromError(error)

        if (!this.isRetryable(lastError)) {
          throw lastError
        }

        const delay = this.calculateBackoff(attempt)
        log.warn(`Retryable error, waiting ${delay}ms before retry`, {
          attempt: attempt + 1,
          error: lastError.message,
          context,
        })

        await this.sleep(delay)
      }
    }

    throw lastError
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

## 可观测性设计

### 指标收集

```typescript
// src/observability/metrics.ts

import { Logger } from "../util/logger"

const log = Logger.create({ service: "metrics" })

/**
 * 指标类型
 */
export interface Metric {
  name: string
  value: number
  timestamp: Date
  tags?: Record<string, string>
}

/**
 * 指标收集器
 */
export class MetricsCollector {
  private metrics: Metric[] = []
  private counters = new Map<string, number>()
  private gauges = new Map<string, number>()
  private histograms = new Map<string, number[]>()

  /**
   * 计数器
   */
  increment(name: string, value = 1, tags?: Record<string, string>): void {
    const current = this.counters.get(name) || 0
    this.counters.set(name, current + value)
    this.record(name, current + value, tags)
  }

  /**
   * 仪表盘
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.gauges.set(name, value)
    this.record(name, value, tags)
  }

  /**
   * 直方图
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const values = this.histograms.get(name) || []
    values.push(value)
    this.histograms.set(name, values)
    this.record(name, value, tags)
  }

  /**
   * 记录计时
   */
  async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now()
    try {
      return await fn()
    } finally {
      const duration = Date.now() - start
      this.histogram(`${name}.duration`, duration)
    }
  }

  /**
   * 记录指标
   */
  private record(name: string, value: number, tags?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      timestamp: new Date(),
      tags,
    }
    this.metrics.push(metric)
    log.debug(`Metric: ${name} = ${value}`, tags)
  }

  /**
   * 获取统计信息
   */
  getStats(name: string): { count: number; sum: number; avg: number; min: number; max: number } | null {
    const values = this.histograms.get(name)
    if (!values || values.length === 0) return null

    const sum = values.reduce((a, b) => a + b, 0)
    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    }
  }

  /**
   * 导出指标
   */
  export(): Metric[] {
    return [...this.metrics]
  }
}

// 全局指标收集器
export const metrics = new MetricsCollector()
```

### 结构化日志

```typescript
// src/util/logger.ts

export interface LogConfig {
  service: string
  level: "debug" | "info" | "warn" | "error"
}

export class Logger {
  private static level: "debug" | "info" | "warn" | "error" = "info"
  
  constructor(private config: LogConfig) {}

  static setLevel(level: "debug" | "info" | "warn" | "error"): void {
    Logger.level = level
  }

  static create(config: LogConfig): Logger {
    return new Logger(config)
  }

  private shouldLog(level: string): boolean {
    const levels = ["debug", "info", "warn", "error"]
    return levels.indexOf(level) >= levels.indexOf(Logger.level)
  }

  private formatMessage(level: string, message: string, data?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${this.config.service}] [${level.toUpperCase()}]`
    
    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`
    }
    return `${prefix} ${message}`
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, data))
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, data))
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, data))
    }
  }

  error(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, data))
    }
  }
}
```

## 性能优化

### Token 优化

```typescript
// 性能优化建议

/**
 * Token 优化策略
 */
export const TOKEN_OPTIMIZATION = {
  // 1. 使用更便宜的模型
  useCheaperModel: (task: string) => {
    // 简单任务使用 GPT-4o-mini
    // 复杂任务使用 GPT-4o
    const complexPatterns = ["重构", "架构设计", "性能优化"]
    const isComplex = complexPatterns.some(p => task.includes(p))
    return isComplex ? "gpt-4o" : "gpt-4o-mini"
  },

  // 2. 上下文压缩
  compressContext: (messages: ChatMessage[], maxSize: number) => {
    if (messages.length <= maxSize) return messages
    // 保留最近的消息，压缩历史
    const recent = messages.slice(-maxSize / 2)
    const history = messages.slice(0, -maxSize / 2)
    // 生成摘要...
    return recent
  },

  // 3. 缓存重复请求
  enableCaching: true,
}
```

### 缓存策略

```typescript
// src/util/cache.ts

/**
 * 简单的内存缓存
 */
export class Cache<T> {
  private store = new Map<string, { value: T; expires: number }>()

  constructor(private ttlMs: number = 60000) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    
    if (Date.now() > entry.expires) {
      this.store.delete(key)
      return undefined
    }
    
    return entry.value
  }

  set(key: string, value: T, ttlMs?: number): void {
    const expires = Date.now() + (ttlMs ?? this.ttlMs)
    this.store.set(key, { value, expires })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}
```

## 部署策略

### Docker 部署

```dockerfile
# Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN npm run build

# 运行时镜像
FROM node:20-alpine

WORKDIR /app

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 设置环境变量
ENV NODE_ENV=production

# 入口
ENTRYPOINT ["node", "dist/cli.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  nano-agent:
    build: .
    container_name: nano-agent
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NANO_AGENT_PROVIDER=${NANO_AGENT_PROVIDER:-openai}
      - NANO_AGENT_MODEL=${NANO_AGENT_MODEL:-gpt-4o-mini}
    volumes:
      - ./workspace:/workspace
    working_dir: /workspace
    stdin_open: true
    tty: true
```

### 构建和发布

```json
// package.json

{
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "start": "node dist/cli.js",
    "lint": "eslint src/",
    "test": "vitest",
    "docker:build": "docker build -t nano-agent:latest .",
    "docker:run": "docker run -it --rm -v $(pwd):/workspace nano-agent:latest"
  }
}
```

## 系列总结

### 架构回顾

```
┌─────────────────────────────────────────────────────────────┐
│                   nano-agent 架构总览                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CLI Layer                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│  │ yargs   │ │ dotenv  │ │  TUI    │                       │
│  │ 命令解析 │ │ 配置加载 │ │ Ink/React│                      │
│  └─────────┘ └─────────┘ └─────────┘                       │
│                                                             │
│  Agent Layer                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ Agent   │ │SubAgent │ │ Session │ │Permission│          │
│  │ ReAct   │ │ 多Agent │ │ 状态管理 │ │ 权限控制 │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                             │
│  Tool Layer                                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ read    │ │ write   │ │ bash    │ │ batch   │          │
│  │ edit    │ │ glob    │ │ grep    │ │ task    │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                             │
│  Provider Layer                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│  │Anthropic│ │ OpenAI  │ │ iFlow   │                       │
│  └─────────┘ └─────────┘ └─────────┘                       │
│                                                             │
│  Infrastructure                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ Logger  │ │ Metrics │ │ Error   │ │ Cache   │          │
│  │ 日志    │ │ 指标    │ │ 恢复    │ │ 缓存    │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 核心能力总结

| 章节 | 核心内容 | 关键技术 |
|------|----------|----------|
| 第1章 | 项目概述与架构 | ReAct、Agent 架构 |
| 第2章 | CLI 框架 | yargs、配置管理 |
| 第3章 | Provider 系统 | 多 LLM、流式响应 |
| 第4章 | 工具系统 | Zod、JSON Schema |
| 第5章 | Agent 核心 | ReAct 循环、消息管理 |
| 第6章 | 权限控制 | 权限规则、模式匹配 |
| 第7章 | 会话管理 | 状态管理、持久化 |
| 第8章 | 多 Agent 协作 | SubAgent、编排器 |
| 第9章 | 并行执行 | Promise.allSettled |
| 第10章 | Skill 系统 | 插件化、动态加载 |
| 第11章 | TUI 界面 | Ink、React |
| 第12章 | 生产实践 | 错误恢复、可观测性 |

### 面试高频问题解答

1. **ReAct 模式的核心是什么？**
   - Reasoning（思考）+ Acting（行动）循环
   - 模型先分析任务，然后调用工具，观察结果后继续思考

2. **如何实现多 LLM 提供商支持？**
   - 定义统一的 Provider 接口
   - 实现流式响应的 AsyncIterable 模式
   - 适配不同 API 的消息格式

3. **工具系统如何设计？**
   - 统一的工具定义接口
   - Zod 参数验证 + JSON Schema 生成
   - 工具注册表管理

4. **如何实现多 Agent 协作？**
   - 定义专业化的 SubAgent 类型
   - 通过 task 工具委托任务
   - 权限隔离确保安全

## 扩展方向

1. **MCP 协议支持** - 完整实现 Model Context Protocol
2. **LSP 集成** - 代码补全和诊断
3. **多语言支持** - Python、Rust 等
4. **Web UI** - 基于 Web 的图形界面
5. **RAG 支持** - 检索增强生成

## 小结

本系列从零开始实现了一个生产级 AI 编程助手 nano-agent，涵盖了 Agent 开发的核心技术和最佳实践。

**关键收获**：

1. Agent 架构设计的核心是 ReAct 循环
2. 工具系统需要类型安全和可扩展性
3. 权限控制是安全的关键
4. 多 Agent 协作提升复杂任务处理能力
5. 可观测性是生产环境必备能力

希望这个系列能帮助你深入理解 AI Agent 的原理，为你的 AI 应用开发之路打下坚实基础。

## 参考资料

- [OpenCode GitHub](https://github.com/sst/opencode)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [OpenAI API](https://platform.openai.com/docs/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Ink - React for CLI](https://github.com/vadimdemedes/ink)
