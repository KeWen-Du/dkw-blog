---
title: "从零到一实现mini-opencode（五）：Agent系统构建"
date: "2026-03-03 13:00:00"
excerpt: "实现mini-opencode的Agent系统，整合LLM和Tool，实现消息处理、工具调用循环和多轮对话管理。"
tags: ["AI", "LLM", "Agent", "TypeScript"]
---

# 从零到一实现mini-opencode（五）：Agent系统构建

## 前言

Agent是AI编程助手的核心，它负责协调LLM和Tool，实现智能化的代码交互。本章将实现mini-opencode的Agent系统，包括消息处理、工具调用循环和多轮对话管理。

## Agent架构设计

### 核心概念

OpenCode的Agent架构包含以下核心概念：

```
┌─────────────────────────────────────────────────────────────┐
│                         Agent Loop                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   User Input ──▶ Build Message ──▶ Call LLM                │
│                                        │                    │
│                                        ▼                    │
│   ◀──────────────────────── Parse Response                  │
│          │                                                  │
│          ├── Text Response ──▶ Return to User              │
│          │                                                  │
│          └── Tool Calls ──▶ Execute Tools                  │
│                                    │                        │
│                                    ▼                        │
│                           Add Tool Results                  │
│                                    │                        │
│                                    └──────▶ Loop Back       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Agent接口

```typescript
// src/agent/agent.ts
import { registry, ChatMessage, ContentBlock, calculateCost } from "@/provider"
import { toolRegistry } from "@/tool"
import { PermissionManager, PermissionRequest } from "@/permission"
import { Logger } from "@/util/logger"

export interface AgentConfig {
  model: string
  provider: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  permission: PermissionManager
  workingDirectory: string
}

export interface AgentState {
  messages: ChatMessage[]
  totalTokens: { input: number; output: number }
  totalCost: number
}

export interface AgentEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "done"
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  error?: string
}

export interface AgentCallbacks {
  onEvent?: (event: AgentEvent) => void
  onToken?: (token: string) => void
  onToolCall?: (name: string, input: Record<string, unknown>) => Promise<boolean>
}
```

## Agent实现

### 核心Agent类

```typescript
// src/agent/agent.ts
const log = Logger.create({ service: "agent" })

export class Agent {
  private provider: ReturnType<typeof registry.get>
  private state: AgentState

  constructor(private config: AgentConfig) {
    const p = registry.get(config.provider)
    if (!p) {
      throw new Error(`Provider not found: ${config.provider}`)
    }
    this.provider = p
    this.state = {
      messages: [],
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
    }
  }

  async sendMessage(content: string, callbacks: AgentCallbacks = {}): Promise<string> {
    this.state.messages.push({ role: "user", content })
    return this.runLoop(callbacks)
  }

  private async runLoop(callbacks: AgentCallbacks): Promise<string> {
    let finalResponse = ""
    let iterations = 0
    const maxIterations = 20

    while (iterations < maxIterations) {
      iterations++
      
      try {
        const response = await this.callLLM(callbacks.onToken)
        
        if (response.usage) {
          this.state.totalTokens.input += response.usage.inputTokens
          this.state.totalTokens.output += response.usage.outputTokens
          this.state.totalCost += calculateCost(
            this.config.model,
            response.usage.inputTokens,
            response.usage.outputTokens
          )
        }

        const assistantBlocks: ContentBlock[] = []
        
        if (response.content) {
          assistantBlocks.push({ type: "text", text: response.content })
          callbacks.onEvent?.({ type: "text", content: response.content })
          finalResponse = response.content
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          const toolResults: ContentBlock[] = []

          for (const call of response.toolCalls) {
            assistantBlocks.push({
              type: "tool_use",
              id: call.id,
              name: call.name,
              input: call.input,
            })

            callbacks.onEvent?.({
              type: "tool_use",
              toolName: call.name,
              toolInput: call.input,
            })

            const approved = await this.checkPermission(call.name, call.input, callbacks)
            if (!approved) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: "Tool call was not approved",
                is_error: true,
              })
              continue
            }

            try {
              const result = await this.executeTool(call.name, call.input)
              toolResults.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: result.output,
              })
              callbacks.onEvent?.({
                type: "tool_result",
                toolName: call.name,
                toolResult: result.output,
              })
              log.info("Tool executed", { tool: call.name })
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error)
              toolResults.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: `Error: ${msg}`,
                is_error: true,
              })
              callbacks.onEvent?.({ type: "error", error: msg })
            }
          }

          this.state.messages.push({ role: "assistant", content: assistantBlocks })
          this.state.messages.push({ role: "user", content: toolResults })
          continue
        }

        this.state.messages.push({
          role: "assistant",
          content: assistantBlocks.length === 1 && assistantBlocks[0].type === "text"
            ? assistantBlocks[0].text
            : assistantBlocks,
        })

        callbacks.onEvent?.({ type: "done" })
        return finalResponse

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        callbacks.onEvent?.({ type: "error", error: msg })
        throw error
      }
    }

    callbacks.onEvent?.({ type: "done" })
    return finalResponse
  }

  private async callLLM(onToken?: (token: string) => void) {
    const messages: ChatMessage[] = []
    const systemPrompt = this.config.systemPrompt ?? this.getDefaultSystemPrompt()
    messages.push({ role: "system", content: systemPrompt })
    messages.push(...this.state.messages)

    const tools = toolRegistry.getAll().map(t => t.definition)

    return this.provider.createChatCompletion({
      model: this.config.model,
      messages,
      tools,
      temperature: this.config.temperature ?? 0.7,
      maxTokens: this.config.maxTokens ?? 4096,
    }, onToken)
  }

  private async checkPermission(
    toolName: string,
    input: Record<string, unknown>,
    callbacks: AgentCallbacks
  ): Promise<boolean> {
    const request: PermissionRequest = {
      tool: toolName,
      input,
      action: "ask",
    }

    const decision = this.config.permission.check(request)
    if (decision.action === "allow") return true
    if (decision.action === "deny") return false

    if (callbacks.onToolCall) {
      return callbacks.onToolCall(toolName, input)
    }
    return true
  }

  private async executeTool(name: string, input: Record<string, unknown>) {
    const tool = toolRegistry.get(name)
    if (!tool) {
      throw new Error(`Tool not found: ${name}`)
    }
    return tool.execute(input, { workingDirectory: this.config.workingDirectory })
  }

  private getDefaultSystemPrompt(): string {
    return `You are a helpful AI coding assistant. You can help with:
- Reading and writing files
- Running shell commands
- Answering programming questions

Use the available tools to complete tasks. Always explain what you're doing.`
  }

  getState(): AgentState {
    return { ...this.state }
  }

  reset(): void {
    this.state = {
      messages: [],
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
    }
  }
}
```

## 消息处理

### 消息构建器

```typescript
// src/agent/message-builder.ts
import { ChatMessage, ContentBlock } from "@/provider/provider"

export class MessageBuilder {
  private messages: ChatMessage[] = []

  addUserText(content: string): this {
    this.messages.push({ role: "user", content })
    return this
  }

  addAssistantText(content: string): this {
    this.messages.push({ role: "assistant", content })
    return this
  }

  addToolCall(
    id: string,
    name: string,
    input: Record<string, any>
  ): this {
    const lastMessage = this.messages[this.messages.length - 1]
    
    if (lastMessage?.role === "assistant") {
      // 追加到现有消息
      if (typeof lastMessage.content === "string") {
        lastMessage.content = [
          { type: "text", text: lastMessage.content },
          { type: "tool_use", id, name, input },
        ]
      } else {
        (lastMessage.content as ContentBlock[]).push({
          type: "tool_use",
          id,
          name,
          input,
        })
      }
    } else {
      // 创建新消息
      this.messages.push({
        role: "assistant",
        content: [{ type: "tool_use", id, name, input }],
      })
    }
    
    return this
  }

  addToolResult(
    toolUseId: string,
    content: string,
    isError = false
  ): this {
    const blocks: ContentBlock[] = this.messages
      .filter(m => m.role === "user" && Array.isArray(m.content))
      .flatMap(m => m.content as ContentBlock[])
      .filter(b => b.type === "tool_result")

    this.messages.push({
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: toolUseId,
        content,
        is_error: isError,
      }],
    })
    
    return this
  }

  build(): ChatMessage[] {
    return [...this.messages]
  }
}
```

### 消息压缩

当消息过长时，需要进行压缩：

```typescript
// src/agent/compaction.ts
import { ChatMessage, ContentBlock } from "@/provider/provider"
import { registry } from "@/provider/provider"

export class MessageCompactor {
  private maxTokens: number

  constructor(maxTokens = 100000) {
    this.maxTokens = maxTokens
  }

  async compact(messages: ChatMessage[]): Promise<ChatMessage[]> {
    // 估算当前token数
    const estimatedTokens = this.estimateTokens(messages)
    
    if (estimatedTokens <= this.maxTokens) {
      return messages
    }

    // 需要压缩
    const result: ChatMessage[] = []
    let keptTokens = 0

    // 保留最近的几条消息
    const recentCount = 4
    const recent = messages.slice(-recentCount)
    const older = messages.slice(0, -recentCount)

    // 对旧消息进行摘要
    if (older.length > 0) {
      const summary = await this.summarize(older)
      result.push({
        role: "user",
        content: `[Earlier conversation summary]\n${summary}`,
      })
      keptTokens += this.estimateTokens([result[0]])
    }

    // 添加最近的消息
    for (const msg of recent) {
      const msgTokens = this.estimateTokens([msg])
      if (keptTokens + msgTokens <= this.maxTokens) {
        result.push(msg)
        keptTokens += msgTokens
      }
    }

    return result
  }

  private estimateTokens(messages: ChatMessage[]): number {
    // 简单估算：4字符 ≈ 1 token
    let chars = 0
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        chars += msg.content.length
      } else {
        for (const block of msg.content) {
          if (block.type === "text") {
            chars += block.text.length
          } else if (block.type === "tool_result") {
            chars += block.content.length
          }
        }
      }
    }
    return Math.ceil(chars / 4)
  }

  private async summarize(messages: ChatMessage[]): Promise<string> {
    // 构建摘要请求
    const content = messages.map(m => {
      if (typeof m.content === "string") {
        return `${m.role}: ${m.content.slice(0, 500)}`
      }
      return `${m.role}: [complex content]`
    }).join("\n\n")

    // 使用LLM生成摘要
    // 这里简化处理，实际应该调用LLM
    return `Previous conversation covered:\n${content.slice(0, 1000)}...`
  }
}
```

## 流式响应处理

### 流式输出管理器

```typescript
// src/agent/stream-manager.ts
import { Logger } from "@/util/logger"

const log = Logger.create({ service: "stream-manager" })

export class StreamManager {
  private buffer = ""
  private onToken?: (token: string) => void
  private onComplete?: (fullText: string) => void

  constructor(callbacks: {
    onToken?: (token: string) => void
    onComplete?: (fullText: string) => void
  }) {
    this.onToken = callbacks.onToken
    this.onComplete = callbacks.onComplete
  }

  // 处理token
  processToken(token: string): void {
    this.buffer += token
    this.onToken?.(token)
  }

  // 完成
  complete(): string {
    this.onComplete?.(this.buffer)
    const result = this.buffer
    this.buffer = ""
    return result
  }

  // 获取当前缓冲区
  getBuffer(): string {
    return this.buffer
  }

  // 清空缓冲区
  clear(): void {
    this.buffer = ""
  }
}
```

### 进度指示器

```typescript
// src/agent/progress.ts
import pc from "picocolors"

export class ProgressIndicator {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  private frameIndex = 0
  private interval?: NodeJS.Timeout
  private message = ""

  start(message: string): void {
    this.message = message
    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex]
      process.stdout.write(`\r${pc.cyan(frame)} ${this.message}`)
      this.frameIndex = (this.frameIndex + 1) % this.frames.length
    }, 80)
  }

  update(message: string): void {
    this.message = message
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
    process.stdout.write("\r" + " ".repeat(this.message.length + 10) + "\r")
  }
}
```

## 使用示例

### 基础使用

```typescript
import { Agent } from "@/agent/agent"
import { PermissionManager, DEFAULT_RULES } from "@/permission/permission"

const agent = new Agent({
  model: "claude-3-opus",
  provider: "anthropic",
  workingDirectory: process.cwd(),
  permission: new PermissionManager(DEFAULT_RULES),
})

// 简单对话
const response = await agent.sendMessage("What files are in this directory?")
console.log(response)
```

### 带回调的使用

```typescript
const response = await agent.sendMessage("Read the package.json file", {
  onToken: (token) => process.stdout.write(token),
  onEvent: (event) => {
    switch (event.type) {
      case "tool_use":
        console.log(`\n[Calling tool: ${event.toolName}]`)
        break
      case "tool_result":
        console.log(`[Tool completed]`)
        break
      case "error":
        console.error(`\nError: ${event.error}`)
        break
    }
  },
  onToolCall: async (name, input) => {
    // 自定义权限确认
    if (name === "bash") {
      console.log(`\nAbout to run: ${input.command}`)
      // 返回true批准，false拒绝
      return true
    }
    return true
  },
})
```

### 检查使用量

```typescript
// 获取状态
const state = agent.getState()
console.log(`Total tokens: ${state.totalTokens.input + state.totalTokens.output}`)
console.log(`Estimated cost: $${state.totalCost.toFixed(4)}`)

// 重置会话
agent.reset()
```

## 小结

本章我们实现了mini-opencode的Agent系统：

1. **Agent类** - 协调LLM和Tool的核心组件
2. **消息处理** - 多类型消息的构建和管理
3. **工具调用循环** - 自动执行工具并处理结果
4. **消息压缩** - 处理超长上下文
5. **流式响应** - 实时输出和进度指示

下一章我们将实现Session管理，包括会话持久化和历史记录。

## 参考资料

- [OpenCode Agent实现](https://github.com/sst/opencode/tree/main/packages/opencode/src/agent)
- [Claude Agent模式](https://docs.anthropic.com/claude/docs/agent-patterns)
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
