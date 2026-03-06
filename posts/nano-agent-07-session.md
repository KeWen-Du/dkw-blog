---
title: "从零到一实现 nano-agent（七）：会话管理"
date: "2024-12-15"
excerpt: "实现会话管理系统，包括会话状态管理、Token 统计、成本计算和持久化存储，支持多轮对话。"
tags: ["AI", "Session", "State", "TypeScript", "持久化"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 7
---

# 从零到一实现 nano-agent（七）：会话管理系统

## 前言

会话管理是 AI Agent 持续对话的基础。一个好的会话系统需要管理消息历史、统计 Token 使用、计算成本，并支持持久化存储。本章将实现完整的会话管理系统。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 会话状态管理 | ⭐⭐⭐ | 状态设计 | ✅ |
| Token 统计 | ⭐⭐ | 工程实践 | ✅ |
| 持久化存储 | ⭐⭐⭐ | 数据持久化 | ✅ |
| 上下文压缩 | ⭐⭐⭐⭐ | 优化策略 | ✅ |

## 面试考点

1. 如何设计会话状态管理？
2. Token 统计和成本计算如何实现？
3. 如何处理长对话的上下文压缩？

## 会话系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Session System                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Session Manager                     │   │
│  │  - create(config) → Session                         │   │
│  │  - get(id) → Session                                │   │
│  │  - getCurrent() → Session                           │   │
│  │  - list() → SessionMetadata[]                       │   │
│  │  - delete(id) → boolean                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Session                           │   │
│  │  - id: string                                       │   │
│  │  - agent: Agent                                     │   │
│  │  - permission: PermissionManager                    │   │
│  │  - metadata: SessionMetadata                        │   │
│  │                                                      │   │
│  │  + sendMessage(content, callbacks) → string         │   │
│  │  + getMetadata() → SessionMetadata                  │   │
│  │  + reset() → void                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Session Storage                       │   │
│  │  - save(session) → void                             │   │
│  │  - load(id) → SessionData                           │   │
│  │  - list() → SessionMetadata[]                       │   │
│  │  - delete(id) → void                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Session 类型定义

```typescript
// src/session/session.ts

import { Agent, AgentCallbacks } from "../agent"
import { PermissionManager, DEFAULT_RULES } from "../permission"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "session" })

/**
 * 会话配置
 */
export interface SessionConfig {
  id: string                 // 会话 ID
  model: string              // 模型名称
  provider: string           // 提供商
  workingDirectory: string   // 工作目录
  systemPrompt?: string      // 自定义系统提示词
}

/**
 * 会话元数据
 */
export interface SessionMetadata {
  id: string                 // 会话 ID
  createdAt: Date            // 创建时间
  updatedAt: Date            // 更新时间
  messageCount: number       // 消息数量
  totalTokens: {             // Token 统计
    input: number
    output: number
  }
  totalCost: number          // 累计成本
}
```

## Session 类实现

```typescript
// src/session/session.ts (续)

/**
 * 会话类
 */
export class Session {
  private agent: Agent
  private permission: PermissionManager
  private createdAt: Date = new Date()
  private updatedAt: Date = new Date()
  private messageCount: number = 0

  constructor(private config: SessionConfig) {
    // 创建权限管理器
    this.permission = new PermissionManager(DEFAULT_RULES)
    
    // 创建 Agent
    this.agent = new Agent({
      model: config.model,
      provider: config.provider,
      systemPrompt: config.systemPrompt,
      permission: this.permission,
      workingDirectory: config.workingDirectory,
    })
    
    log.info("Session created", { 
      id: config.id, 
      model: config.model 
    })
  }

  /**
   * 发送消息
   */
  async sendMessage(
    content: string, 
    callbacks: AgentCallbacks = {}
  ): Promise<string> {
    this.updatedAt = new Date()
    this.messageCount++
    
    const response = await this.agent.sendMessage(content, {
      ...callbacks,
      onEvent: (event) => {
        callbacks.onEvent?.(event)
        if (event.type === "done") {
          log.info("Message completed", { 
            messageCount: this.messageCount 
          })
        }
      },
    })
    
    return response
  }

  /**
   * 获取元数据
   */
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

  /**
   * 获取权限管理器
   */
  getPermission(): PermissionManager {
    return this.permission
  }

  /**
   * 获取 Agent 状态
   */
  getAgentState() {
    return this.agent.getState()
  }

  /**
   * 重置会话
   */
  reset(): void {
    this.agent.reset()
    this.messageCount = 0
    this.updatedAt = new Date()
    log.info("Session reset", { id: this.config.id })
  }
}
```

## SessionManager 实现

```typescript
// src/session/session.ts (续)

/**
 * 会话管理器
 */
export class SessionManager {
  private sessions = new Map<string, Session>()
  private currentSessionId: string | null = null

  /**
   * 创建新会话
   */
  create(config: Omit<SessionConfig, "id">): Session {
    const id = `session-${Date.now()}`
    const session = new Session({ ...config, id })
    this.sessions.set(id, session)
    this.currentSessionId = id
    return session
  }

  /**
   * 获取会话
   */
  get(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  /**
   * 获取当前会话
   */
  getCurrent(): Session | undefined {
    return this.currentSessionId 
      ? this.sessions.get(this.currentSessionId) 
      : undefined
  }

  /**
   * 列出所有会话元数据
   */
  list(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map(s => s.getMetadata())
  }

  /**
   * 删除会话
   */
  delete(id: string): boolean {
    if (this.currentSessionId === id) {
      this.currentSessionId = null
    }
    return this.sessions.delete(id)
  }

  /**
   * 设置当前会话
   */
  setCurrent(id: string): boolean {
    if (this.sessions.has(id)) {
      this.currentSessionId = id
      return true
    }
    return false
  }
}
```

## 会话持久化

### 存储接口

```typescript
// src/session/storage.ts

import fs from "fs/promises"
import path from "path"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "storage" })

/**
 * 会话数据（用于持久化）
 */
export interface SessionData {
  id: string
  config: {
    model: string
    provider: string
    workingDirectory: string
    systemPrompt?: string
  }
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string | any[]
  }>
  metadata: {
    createdAt: string
    updatedAt: string
    messageCount: number
    totalTokens: { input: number; output: number }
    totalCost: number
  }
}

/**
 * 会话存储类
 */
export class SessionStorage {
  private storageDir: string

  constructor(baseDir: string = ".nano-agent") {
    this.storageDir = path.join(baseDir, "sessions")
  }

  /**
   * 确保存储目录存在
   */
  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true })
    } catch {
      // 忽略错误
    }
  }

  /**
   * 保存会话
   */
  async save(sessionId: string, data: SessionData): Promise<void> {
    await this.ensureDir()
    const filePath = path.join(this.storageDir, `${sessionId}.json`)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
    log.debug("Session saved", { sessionId })
  }

  /**
   * 加载会话
   */
  async load(sessionId: string): Promise<SessionData | null> {
    try {
      const filePath = path.join(this.storageDir, `${sessionId}.json`)
      const content = await fs.readFile(filePath, "utf-8")
      return JSON.parse(content) as SessionData
    } catch {
      return null
    }
  }

  /**
   * 列出所有会话
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storageDir)
      return files
        .filter(f => f.endsWith(".json"))
        .map(f => f.replace(".json", ""))
    } catch {
      return []
    }
  }

  /**
   * 删除会话
   */
  async delete(sessionId: string): Promise<void> {
    const filePath = path.join(this.storageDir, `${sessionId}.json`)
    try {
      await fs.unlink(filePath)
      log.debug("Session deleted", { sessionId })
    } catch {
      // 忽略错误
    }
  }
}
```

## 上下文压缩

当对话过长时，需要进行上下文压缩以避免超出 Token 限制：

```typescript
// src/session/compaction.ts

import type { ChatMessage, ContentBlock } from "../provider"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "compaction" })

/**
 * 压缩配置
 */
export interface CompactionConfig {
  maxMessages: number       // 最大消息数量
  keepRecent: number        // 保留最近的消息数
  summaryPrompt: string     // 摘要提示词
}

const DEFAULT_CONFIG: CompactionConfig = {
  maxMessages: 50,
  keepRecent: 10,
  summaryPrompt: "Summarize the following conversation concisely:",
}

/**
 * 消息摘要
 */
export interface MessageSummary {
  role: "assistant"
  content: string
  isSummary: true
  originalMessageCount: number
}

/**
 * 上下文压缩器
 */
export class ContextCompactor {
  constructor(private config: CompactionConfig = DEFAULT_CONFIG) {}

  /**
   * 检查是否需要压缩
   */
  needsCompaction(messages: ChatMessage[]): boolean {
    return messages.length > this.config.maxMessages
  }

  /**
   * 压缩消息历史
   */
  async compact(
    messages: ChatMessage[],
    summarizer: (text: string) => Promise<string>
  ): Promise<ChatMessage[]> {
    if (!this.needsCompaction(messages)) {
      return messages
    }

    log.info("Compacting messages", {
      total: messages.length,
      keepRecent: this.config.keepRecent,
    })

    // 保留最近的消息
    const recentMessages = messages.slice(-this.config.keepRecent)
    
    // 需要压缩的历史消息
    const historyToCompact = messages.slice(0, -this.config.keepRecent)
    
    // 生成摘要
    const historyText = this.messagesToText(historyToCompact)
    const summary = await summarizer(`${this.config.summaryPrompt}\n\n${historyText}`)
    
    // 创建摘要消息
    const summaryMessage: ChatMessage = {
      role: "assistant",
      content: `[Conversation Summary]\n${summary}\n[End of Summary]`,
    }

    // 返回压缩后的消息
    return [summaryMessage, ...recentMessages]
  }

  /**
   * 将消息转换为文本
   */
  private messagesToText(messages: ChatMessage[]): string {
    return messages.map(msg => {
      const role = msg.role.toUpperCase()
      const content = typeof msg.content === "string" 
        ? msg.content 
        : JSON.stringify(msg.content)
      return `${role}: ${content}`
    }).join("\n\n")
  }
}
```

## 使用示例

### 创建和管理会话

```typescript
import { SessionManager } from './session'

const sessionManager = new SessionManager()

// 创建新会话
const session = sessionManager.create({
  model: 'gpt-4o-mini',
  provider: 'openai',
  workingDirectory: '/Users/example/project',
})

// 发送消息
const response = await session.sendMessage('帮我读取 package.json', {
  onEvent: (event) => {
    if (event.type === 'text') {
      process.stdout.write(event.content!)
    }
  },
})

// 获取统计信息
const metadata = session.getMetadata()
console.log(`Messages: ${metadata.messageCount}`)
console.log(`Tokens: ${metadata.totalTokens.input} in / ${metadata.totalTokens.output} out`)
console.log(`Cost: $${metadata.totalCost.toFixed(6)}`)

// 列出所有会话
const sessions = sessionManager.list()
sessions.forEach(s => {
  console.log(`${s.id}: ${s.messageCount} messages, $${s.totalCost.toFixed(4)}`)
})
```

### 持久化和恢复

```typescript
import { SessionStorage } from './session'

const storage = new SessionStorage()

// 保存会话
await storage.save(sessionId, {
  id: sessionId,
  config: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    workingDirectory: '/project',
  },
  messages: agentState.messages,
  metadata: {
    createdAt: metadata.createdAt.toISOString(),
    updatedAt: metadata.updatedAt.toISOString(),
    messageCount: metadata.messageCount,
    totalTokens: metadata.totalTokens,
    totalCost: metadata.totalCost,
  },
})

// 加载会话
const savedData = await storage.load(sessionId)
if (savedData) {
  console.log(`Loaded session with ${savedData.metadata.messageCount} messages`)
}
```

## 小结

本章实现了会话管理系统，包括：

1. **Session 类** - 封装 Agent 和权限管理
2. **SessionManager** - 管理多个会话
3. **持久化存储** - JSON 文件存储
4. **上下文压缩** - 长对话处理

**关键要点**：

- 会话封装了 Agent 和权限管理
- Token 统计和成本计算帮助用户了解消耗
- 持久化支持会话恢复
- 上下文压缩避免 Token 限制

下一章我们将实现多 Agent 协作系统。

## 参考资料

- [Conversation Memory in LLMs](https://www.pinecone.io/learn/conversational-memory/)
- [LangChain Memory](https://python.langchain.com/docs/modules/memory/)
- [Context Window Management](https://www.anthropic.com/index/claude-2-1-prompting)
