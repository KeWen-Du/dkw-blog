---
title: "从零到一实现mini-opencode（六）：Session管理"
date: "2026-03-03 14:00:00"
excerpt: "实现mini-opencode的Session管理系统，包括会话持久化、消息存储、历史记录和上下文管理。"
tags: ["AI", "LLM", "Session", "SQLite", "TypeScript"]
---

# 从零到一实现mini-opencode（六）：Session管理

## 前言

Session管理系统负责管理用户与AI的交互会话，追踪消息历史和使用统计。本章将实现基于内存的简化Session管理。

## Session架构设计

### 核心概念

mini-opencode的Session系统简化设计：

- **Session** - 单个对话会话，包含消息历史和使用统计
- **SessionManager** - 管理多个会话，支持创建、获取、删除
- **内存存储** - 使用Map实现，适合单次运行场景

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

## 与TUI集成

Session在TUI中的使用：

```typescript
// src/cli.ts
import { SessionManager } from "./session"

const sessionManager = new SessionManager()

// 创建会话
const session = sessionManager.create({
  model: argv.model,
  provider: argv.provider,
  workingDirectory: argv.directory,
})

// 渲染TUI
const { waitUntilExit } = render(
  React.createElement(App, {
    session,
    workingDirectory: argv.directory,
    model: model.name,
  })
)

await waitUntilExit()
```

## TUI中的Session使用

```typescript
// src/tui/app.tsx
import { Session, SessionMetadata } from "@/session"

export function App({ session, workingDirectory, model }: AppProps) {
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null)

  const handleSubmit = useCallback(async () => {
    await session.sendMessage(userMessage, {
      onEvent: handleEvent,
      onToolCall: async (name, _params) => {
        return true  // 批准工具调用
      },
    })
    setMetadata(session.getMetadata())  // 更新统计信息
  }, [session])

  return (
    <Box>
      {/* 显示Token使用和成本 */}
      {metadata && (
        <Text dimColor>
          Tokens: {metadata.totalTokens.input} in / {metadata.totalTokens.output} out 
          | Cost: ${metadata.totalCost.toFixed(4)}
        </Text>
      )}
    </Box>
  )
}
```

## 小结

本章我们实现了mini-opencode的Session管理系统：

1. **Session类** - 封装Agent和权限管理
2. **SessionManager** - 管理多个会话实例
3. **内存存储** - 简化的Map实现
4. **元数据追踪** - Token使用和成本统计

> **扩展思考**：如果需要持久化存储，可以扩展为SQLite实现。完整版OpenCode使用Drizzle ORM进行数据持久化，支持会话恢复和历史查询。
