---
title: "从零到一实现mini-opencode（六）：Session管理与上下文压缩"
date: "2026-03-03 14:00:00"
excerpt: "实现mini-opencode的Session管理系统，包括会话持久化、上下文智能压缩、滑动窗口算法和消息存储策略。"
tags: ["AI", "LLM", "Session", "Context", "TypeScript"]
series:
  slug: "mini-opencode"
  title: "从零到一实现 mini-opencode"
  order: 6
---

# 从零到一实现mini-opencode（六）：Session管理与上下文压缩

## 前言

Session管理系统负责管理用户与AI的交互会话，追踪消息历史和使用统计。随着对话的进行，消息历史会越来越长，最终超出模型的上下文窗口限制。本章将实现Session管理，包括一个重要的技术亮点——**上下文智能压缩**。

## Session架构设计

### 核心概念

mini-opencode的Session系统设计：

- **Session** - 单个对话会话，包含消息历史和使用统计
- **SessionManager** - 管理多个会话，支持创建、获取、删除
- **ContextManager** - 智能上下文压缩，处理超长对话
- **SessionStorage** - 会话持久化接口

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Session 管理架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   SessionManager                        │   │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐                │   │
│   │  │Session 1│  │Session 2│  │Session 3│  ...           │   │
│   │  └────┬────┘  └────┬────┘  └────┬────┘                │   │
│   └───────┼────────────┼────────────┼─────────────────────┘   │
│           │            │            │                          │
│           ▼            ▼            ▼                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  ContextManager                         │   │
│   │  ┌─────────────────┐  ┌─────────────────┐              │   │
│   │  │  SlidingWindow  │  │SummaryCompressor│              │   │
│   │  │  - 重要性保留   │  │  - 摘要生成     │              │   │
│   │  │  - 智能截断     │  │  - 关键信息提取 │              │   │
│   │  └─────────────────┘  └─────────────────┘              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  SessionStorage                         │   │
│   │  ┌─────────────────┐  ┌─────────────────┐              │   │
│   │  │ InMemoryStorage │  │ JSONFileStorage │              │   │
│   │  │  - 快速访问     │  │  - 持久化存储   │              │   │
│   │  └─────────────────┘  └─────────────────┘              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Session接口

```typescript
// src/session/session.ts
import { Agent, AgentCallbacks } from "@/agent"
import { PermissionManager, DEFAULT_RULES } from "@/permission"
import { Logger } from "@/util/logger"

export interface SessionConfig {
  id: string
  model: string
  provider: string
  workingDirectory: string
  systemPrompt?: string
}

export interface SessionMetadata {
  id: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
  totalTokens: { input: number; output: number }
  totalCost: number
}

export class Session {
  private agent: Agent
  private permission: PermissionManager
  private createdAt: Date = new Date()
  private updatedAt: Date = new Date()
  private messageCount: number = 0

  constructor(private config: SessionConfig) {
    this.permission = new PermissionManager(DEFAULT_RULES)
    this.agent = new Agent({
      model: config.model,
      provider: config.provider,
      systemPrompt: config.systemPrompt,
      permission: this.permission,
      workingDirectory: config.workingDirectory,
    })
  }

  async sendMessage(content: string, callbacks: AgentCallbacks = {}): Promise<string> {
    this.updatedAt = new Date()
    this.messageCount++
    
    const response = await this.agent.sendMessage(content, callbacks)
    return response
  }

  getMetadata(): SessionMetadata {
    const state = this.agent.getState()
    return {
      id: this.config.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messageCount: this.messageCount,
      totalTokens: state.totalTokens,
      totalCost: state.totalCost,
    }
  }

  getPermission(): PermissionManager {
    return this.permission
  }

  reset(): void {
    this.agent.reset()
    this.messageCount = 0
    this.updatedAt = new Date()
  }
}
```

## SessionManager实现

```typescript
// src/session/session.ts
export class SessionManager {
  private sessions = new Map<string, Session>()
  private currentSessionId: string | null = null

  create(config: Omit<SessionConfig, "id">): Session {
    const id = `session-${Date.now()}`
    const session = new Session({ ...config, id })
    this.sessions.set(id, session)
    this.currentSessionId = id
    return session
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  getCurrent(): Session | undefined {
    return this.currentSessionId ? this.sessions.get(this.currentSessionId) : undefined
  }

  list(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map(s => s.getMetadata())
  }

  delete(id: string): boolean {
    if (this.currentSessionId === id) {
      this.currentSessionId = null
    }
    return this.sessions.delete(id)
  }
}
```

## 上下文智能压缩

### 问题背景

随着对话的进行，消息历史会不断增长：

1. **上下文窗口限制** - 模型有最大token限制（如Claude 200K、GPT-4 128K）
2. **成本问题** - 每次请求都要发送完整历史，token消耗线性增长
3. **响应延迟** - 更长的上下文意味着更长的处理时间

### 压缩策略

我们实现两种互补的压缩策略：

1. **滑动窗口（Sliding Window）** - 保留最重要的消息，丢弃旧消息
2. **摘要压缩（Summary Compression）** - 将旧消息压缩为摘要

### 滑动窗口算法

```typescript
// src/agent/context.ts
import { ChatMessage, ContentBlock } from "@/provider/provider"
import { Logger } from "@/util/logger"

const log = Logger.create({ service: 'context' })

/**
 * 消息重要性评分
 */
interface MessageScore {
  message: ChatMessage
  score: number
  index: number
}

/**
 * 滑动窗口上下文管理器
 * 
 * 核心算法：
 * 1. 为每条消息计算重要性分数
 * 2. 保留高分数消息
 * 3. 智能截断低分数消息
 */
export class SlidingWindow {
  private maxTokens: number
  private keepRecent: number  // 始终保留的最近消息数

  constructor(options: { maxTokens?: number; keepRecent?: number } = {}) {
    this.maxTokens = options.maxTokens ?? 100000
    this.keepRecent = options.keepRecent ?? 4
  }

  /**
   * 应用滑动窗口压缩
   */
  apply(messages: ChatMessage[]): ChatMessage[] {
    const estimated = this.estimateTokens(messages)
    
    if (estimated <= this.maxTokens) {
      return messages
    }

    log.info('Applying sliding window', { 
      total: estimated, 
      max: this.maxTokens 
    })

    // 分离需要保留的消息
    const recent = messages.slice(-this.keepRecent)
    const older = messages.slice(0, -this.keepRecent)

    if (older.length === 0) {
      return recent
    }

    // 计算每条旧消息的重要性
    const scored = older.map((msg, idx) => ({
      message: msg,
      score: this.calculateImportance(msg, idx, messages.length),
      index: idx,
    }))

    // 按重要性排序
    scored.sort((a, b) => b.score - a.score)

    // 计算保留多少旧消息
    const recentTokens = this.estimateTokens(recent)
    const availableTokens = this.maxTokens - recentTokens
    let keptTokens = 0
    const kept: ChatMessage[] = []

    for (const item of scored) {
      const msgTokens = this.estimateTokens([item.message])
      if (keptTokens + msgTokens <= availableTokens) {
        kept.push(item.message)
        keptTokens += msgTokens
      }
    }

    // 恢复原始顺序
    kept.sort((a, b) => {
      const aIdx = older.indexOf(a)
      const bIdx = older.indexOf(b)
      return aIdx - bIdx
    })

    return [...kept, ...recent]
  }

  /**
   * 计算消息重要性分数
   */
  private calculateImportance(
    message: ChatMessage, 
    index: number, 
    total: number
  ): number {
    let score = 0

    // 位置权重 - 最近的消息更重要
    const positionWeight = index / total
    score += positionWeight * 30

    // 内容类型权重
    if (typeof message.content === 'string') {
      // 文本消息
      const content = message.content
      
      // 包含代码块
      if (content.includes('```')) {
        score += 20
      }
      
      // 包含错误信息
      if (content.toLowerCase().includes('error')) {
        score += 15
      }
      
      // 包含关键决策
      if (content.toLowerCase().includes('decided') || 
          content.toLowerCase().includes('important')) {
        score += 10
      }

      // 长度权重 - 过短或过长都不太好
      const len = content.length
      if (len > 100 && len < 5000) {
        score += 10
      }
    } else {
      // 多块内容
      for (const block of message.content as ContentBlock[]) {
        if (block.type === 'tool_use') {
          score += 15  // 工具调用很重要
        }
        if (block.type === 'tool_result') {
          score += 10  // 工具结果也重要
        }
      }
    }

    // 角色权重
    if (message.role === 'user') {
      score += 10  // 用户消息更重要
    }

    return score
  }

  /**
   * 估算token数量
   */
  private estimateTokens(messages: ChatMessage[]): number {
    let chars = 0
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        chars += msg.content.length
      } else {
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === 'text') {
            chars += block.text.length
          } else if (block.type === 'tool_result') {
            chars += block.content.length
          }
        }
      }
    }
    // 粗略估算：4字符 ≈ 1 token
    return Math.ceil(chars / 4)
  }
}
```

### 摘要压缩算法

```typescript
// src/agent/context.ts (continued)

/**
 * 摘要压缩器
 * 
 * 将旧消息压缩为摘要，保留关键信息
 */
export class SummaryCompressor {
  private maxTokens: number

  constructor(maxTokens = 50000) {
    this.maxTokens = maxTokens
  }

  /**
   * 压缩消息为摘要
   */
  async compress(
    messages: ChatMessage[],
    summarizeFn?: (content: string) => Promise<string>
  ): Promise<ChatMessage[]> {
    if (messages.length <= 2) {
      return messages
    }

    const estimated = this.estimateTokens(messages)
    if (estimated <= this.maxTokens) {
      return messages
    }

    log.info('Compressing to summary', { 
      total: estimated, 
      target: this.maxTokens 
    })

    // 分割消息
    const keepRecent = 4
    const recent = messages.slice(-keepRecent)
    const older = messages.slice(0, -keepRecent)

    // 生成摘要
    const summary = await this.generateSummary(older, summarizeFn)

    // 构建压缩后的消息
    const summaryMessage: ChatMessage = {
      role: 'user',
      content: `[Earlier conversation summary]\n${summary}`,
    }

    return [summaryMessage, ...recent]
  }

  /**
   * 生成摘要
   */
  private async generateSummary(
    messages: ChatMessage[],
    summarizeFn?: (content: string) => Promise<string>
  ): Promise<string> {
    // 提取关键信息
    const keyPoints: string[] = []

    for (const msg of messages) {
      const content = this.extractText(msg.content)
      
      // 提取关键决策
      const decisions = this.extractDecisions(content)
      keyPoints.push(...decisions)

      // 提取代码引用
      const codeRefs = this.extractCodeReferences(content)
      keyPoints.push(...codeRefs)

      // 提取文件操作
      const fileOps = this.extractFileOperations(msg)
      keyPoints.push(...fileOps)
    }

    // 如果有摘要函数，使用LLM生成摘要
    if (summarizeFn && keyPoints.length > 0) {
      const summaryContent = keyPoints.join('\n')
      return summarizeFn(summaryContent)
    }

    // 否则返回简单的摘要
    if (keyPoints.length > 0) {
      return `Key points from earlier conversation:\n${keyPoints.slice(0, 10).join('\n')}`
    }

    return `[${messages.length} messages omitted]`
  }

  /**
   * 提取文本内容
   */
  private extractText(content: string | ContentBlock[]): string {
    if (typeof content === 'string') {
      return content
    }
    return content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('\n')
  }

  /**
   * 提取决策信息
   */
  private extractDecisions(content: string): string[] {
    const patterns = [
      /decided to (.+)/gi,
      /chose to (.+)/gi,
      /will (.+) because/gi,
      /the solution is (.+)/gi,
    ]

    const decisions: string[] = []
    for (const pattern of patterns) {
      const matches = content.matchAll(pattern)
      for (const match of matches) {
        decisions.push(`Decision: ${match[1]}`)
      }
    }
    return decisions
  }

  /**
   * 提取代码引用
   */
  private extractCodeReferences(content: string): string[] {
    const refs: string[] = []
    
    // 提取文件路径
    const filePattern = /(?:file|path|in)\s+([^\s]+\.[a-z]{1,4})/gi
    const matches = content.matchAll(filePattern)
    for (const match of matches) {
      refs.push(`File: ${match[1]}`)
    }

    return refs
  }

  /**
   * 提取文件操作
   */
  private extractFileOperations(message: ChatMessage): string[] {
    const ops: string[] = []

    if (typeof message.content !== 'string') {
      for (const block of message.content as ContentBlock[]) {
        if (block.type === 'tool_use') {
          const toolBlock = block as { name: string; input: Record<string, unknown> }
          if (['read', 'write', 'edit'].includes(toolBlock.name)) {
            ops.push(`Tool: ${toolBlock.name}(${toolBlock.input.path || ''})`)
          }
        }
      }
    }

    return ops
  }

  /**
   * 估算token数量
   */
  private estimateTokens(messages: ChatMessage[]): number {
    let chars = 0
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        chars += msg.content.length
      } else {
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === 'text') {
            chars += block.text.length
          }
        }
      }
    }
    return Math.ceil(chars / 4)
  }
}
```

### 上下文管理器

```typescript
// src/agent/context.ts (continued)

/**
 * 上下文管理器
 * 
 * 组合使用滑动窗口和摘要压缩
 */
export class ContextManager {
  private slidingWindow: SlidingWindow
  private summaryCompressor: SummaryCompressor
  private maxTokens: number

  constructor(options: {
    maxTokens?: number
    keepRecent?: number
  } = {}) {
    this.maxTokens = options.maxTokens ?? 100000
    this.slidingWindow = new SlidingWindow({
      maxTokens: this.maxTokens,
      keepRecent: options.keepRecent ?? 4,
    })
    this.summaryCompressor = new SummaryCompressor(this.maxTokens * 0.8)
  }

  /**
   * 管理上下文
   */
  async manage(
    messages: ChatMessage[],
    options: {
      summarizeFn?: (content: string) => Promise<string>
      preferSummary?: boolean
    } = {}
  ): Promise<ChatMessage[]> {
    const estimated = this.estimateTokens(messages)
    
    if (estimated <= this.maxTokens) {
      return messages
    }

    log.info('Context management triggered', {
      estimated,
      max: this.maxTokens,
    })

    // 首先尝试滑动窗口
    let result = this.slidingWindow.apply(messages)
    
    // 如果仍然超限，使用摘要压缩
    const newEstimated = this.estimateTokens(result)
    if (newEstimated > this.maxTokens) {
      result = await this.summaryCompressor.compress(result, options.summarizeFn)
    }

    return result
  }

  private estimateTokens(messages: ChatMessage[]): number {
    let chars = 0
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        chars += msg.content.length
      } else {
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === 'text') {
            chars += block.text.length
          }
        }
      }
    }
    return Math.ceil(chars / 4)
  }
}
```

### 压缩流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    上下文压缩流程                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   输入: ChatMessage[] (100K+ tokens)                           │
│                           │                                     │
│                           ▼                                     │
│   ┌─────────────────────────────────────────────────┐           │
│   │              Token 估算                          │           │
│   │  是否超过 maxTokens (100K)?                     │           │
│   └─────────────────────────────────────────────────┘           │
│                           │                                     │
│              ┌────────────┴────────────┐                        │
│              │                         │                        │
│              ▼                         ▼                        │
│           [否]                       [是]                       │
│              │                         │                        │
│              ▼                         ▼                        │
│        直接返回              ┌─────────────────────┐            │
│                              │   滑动窗口压缩       │            │
│                              │  - 计算重要性分数    │            │
│                              │  - 保留高分消息      │            │
│                              │  - 保留最近N条       │            │
│                              └──────────┬──────────┘            │
│                                         │                       │
│                                         ▼                       │
│                              ┌─────────────────────┐            │
│                              │  是否仍然超限?       │            │
│                              └──────────┬──────────┘            │
│                                    ┌────┴────┐                  │
│                                    │         │                  │
│                                 [否]       [是]                 │
│                                    │         │                  │
│                                    ▼         ▼                  │
│                               直接返回   ┌──────────────┐        │
│                                          │ 摘要压缩     │        │
│                                          │- 生成摘要   │        │
│                                          │- 保留关键点 │        │
│                                          └──────────────┘        │
│                                                                  │
│   输出: ChatMessage[] (< maxTokens)                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 会话持久化

### 存储接口

```typescript
// src/session/storage.ts
import { ChatMessage } from "../provider/provider"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "storage" })

export interface SessionStorage {
  saveSession(id: string, data: SessionData): Promise<void>
  loadSession(id: string): Promise<SessionData | null>
  listSessions(): Promise<StorageSessionMetadata[]>
  deleteSession(id: string): Promise<boolean>
}

export interface SessionData {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  messageCount: number
  totalTokens: { input: number; output: number }
  totalCost: number
}

export interface StorageSessionMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  totalTokens: { input: number; output: number }
  totalCost: number
}

/**
 * 内存存储实现
 * 
 * 快速访问，适合临时会话
 */
export class InMemoryStorage implements SessionStorage {
  private sessions = new Map<string, SessionData>()

  async saveSession(id: string, data: SessionData): Promise<void> {
    this.sessions.set(id, data)
    log.info("Session saved", { id, messageCount: data.messages.length })
  }

  async loadSession(id: string): Promise<SessionData | null> {
    const data = this.sessions.get(id)
    log.info("Session loaded", { id, found: !!data })
    return data || null
  }

  async listSessions(): Promise<StorageSessionMetadata[]> {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messageCount,
      totalTokens: s.totalTokens,
      totalCost: s.totalCost,
    }))
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = this.sessions.delete(id)
    log.info("Session deleted", { id, success: result })
    return result
  }
}

/**
 * JSON文件存储实现
 * 
 * 持久化存储，支持会话恢复
 */
export class JSONFileStorage implements SessionStorage {
  private dataDir: string
  private cache = new Map<string, SessionData>()

  constructor(dataDir: string) {
    this.dataDir = dataDir
  }

  async saveSession(id: string, data: SessionData): Promise<void> {
    this.cache.set(id, data)
    // 实际写入文件
    const filePath = `${this.dataDir}/${id}.json`
    const content = JSON.stringify(data, null, 2)
    // 在实际实现中使用 fs.writeFile
    log.info("Session saved to disk", { id, path: filePath })
  }

  async loadSession(id: string): Promise<SessionData | null> {
    // 先查缓存
    if (this.cache.has(id)) {
      return this.cache.get(id) || null
    }
    // 实际从文件读取
    const filePath = `${this.dataDir}/${id}.json`
    // 在实际实现中使用 fs.readFile
    log.info("Session loaded from disk", { id, path: filePath })
    return null
  }

  async listSessions(): Promise<StorageSessionMetadata[]> {
    // 实际实现中读取目录下的所有session文件
    return Array.from(this.cache.values()).map(s => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messageCount,
      totalTokens: s.totalTokens,
      totalCost: s.totalCost,
    }))
  }

  async deleteSession(id: string): Promise<boolean> {
    this.cache.delete(id)
    // 实际删除文件
    log.info("Session deleted from disk", { id })
    return true
  }
}
```

## 与TUI集成

Session在TUI中的使用：

```typescript
// src/cli.ts
import { SessionManager } from "./session"

const sessionManager = new SessionManager()

const session = sessionManager.create({
  model: argv.model,
  provider: argv.provider,
  workingDirectory: argv.directory,
})

const { waitUntilExit } = render(
  React.createElement(App, {
    session,
    workingDirectory: argv.directory,
    model: model.name,
  })
)

await waitUntilExit()
```

## 使用示例

### 上下文管理

```typescript
import { ContextManager } from "@/agent/context"

const contextManager = new ContextManager({
  maxTokens: 100000,
  keepRecent: 4,
})

// 在Agent中使用
const messages = agent.getState().messages
const compressed = await contextManager.manage(messages, {
  // 可选：使用LLM生成摘要
  summarizeFn: async (content) => {
    const response = await llm.chat({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "Summarize this conversation concisely:" },
        { role: "user", content },
      ],
    })
    return response.content
  },
})
```

### 会话持久化

```typescript
import { JSONFileStorage } from "@/session/storage"

const storage = new JSONFileStorage("~/.mini-opencode/sessions")

// 保存会话
await storage.saveSession("session-123", {
  id: "session-123",
  title: "Code Review Session",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [...],
  messageCount: 10,
  totalTokens: { input: 5000, output: 3000 },
  totalCost: 0.05,
})

// 加载会话
const data = await storage.loadSession("session-123")

// 列出所有会话
const sessions = await storage.listSessions()
```

## 小结

本章我们实现了mini-opencode的Session管理系统：

1. **Session类** - 封装Agent和权限管理
2. **SessionManager** - 管理多个会话实例
3. **滑动窗口算法** - 基于重要性的消息保留
4. **摘要压缩算法** - 关键信息提取和摘要生成
5. **上下文管理器** - 组合使用多种压缩策略
6. **会话持久化** - 内存存储和文件存储

**技术亮点**：上下文智能压缩是一个重要的工程实践，它展示了：
- 如何设计重要性评分算法
- 如何实现滑动窗口策略
- 如何提取关键信息生成摘要
- 如何组合多种压缩策略

下一章我们将讨论MCP协议支持（扩展内容）。

## 参考资料

- [Claude Context Windows](https://docs.anthropic.com/claude/docs/context-windows)
- [OpenAI Managing Context](https://platform.openai.com/docs/guides/prompt-engineering/six-strategies-for-getting-better-results)
- [Conversation Summarization](https://arxiv.org/abs/2305.10893)