---
title: "从零到一实现mini-opencode（五）：Agent系统构建"
date: "2026-01-19"
excerpt: "实现mini-opencode的Agent系统，整合LLM和Tool，实现消息处理、工具调用循环、SubAgent多Agent协作和上下文管理。"
tags: ["AI", "LLM", "Agent", "TypeScript"]
series:
  slug: "mini-opencode"
  title: "从零到一实现 mini-opencode"
  order: 5
---

# 从零到一实现mini-opencode（五）：Agent系统构建

## 前言

Agent是AI编程助手的核心，它负责协调LLM和Tool，实现智能化的代码交互。本章将实现mini-opencode的Agent系统，包括消息处理、工具调用循环，以及一个重要的技术亮点——**SubAgent多Agent协作模式**。

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

    const tools = toolRegistry.list().map(t => ({
      name: t.name,
      description: t.description,
      input_schema: zodToJsonSchema(t.parameters),
    }))

    return this.provider.chat({
      model: this.config.model,
      messages,
      tools,
      temperature: this.config.temperature ?? 0.7,
      maxTokens: this.config.maxTokens ?? 4096,
      onToken,
    })
  }

  private async checkPermission(
    toolName: string,
    input: Record<string, unknown>,
    callbacks: AgentCallbacks
  ): Promise<boolean> {
    const request: PermissionRequest = {
      tool: toolName,
      params: input,
    }

    const action = this.config.permission.check(request)
    if (action === "allow") return true
    if (action === "deny") return false

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
    const validatedInput = tool.parameters.parse(input)
    return tool.execute(validatedInput, { 
      workingDirectory: this.config.workingDirectory 
    } as any)
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

## SubAgent多Agent协作模式

### 设计思路

在复杂的编程任务中，单个Agent可能难以高效完成所有工作。SubAgent模式允许：

1. **任务分解** - 将复杂任务分解为子任务
2. **专业化处理** - 不同类型的Agent专注于不同领域
3. **并行执行** - 多个SubAgent可以并行处理独立任务
4. **上下文隔离** - 每个SubAgent有独立的消息历史

### SubAgent类型

```typescript
// src/agent/subagent.ts
import { Agent, AgentConfig, AgentCallbacks } from "./agent"
import { PermissionManager, READONLY_RULES, DEFAULT_RULES } from "@/permission"
import { Logger } from "@/util/logger"

const log = Logger.create({ service: "subagent" })

/**
 * SubAgent类型定义
 * 
 * 不同类型的SubAgent有不同的权限和提示词
 */
export type SubAgentType = 'explore' | 'general' | 'code' | 'plan'

export interface SubAgentConfig {
  type: SubAgentType
  task: string
  workingDirectory: string
  model?: string
  provider?: string
}

/**
 * SubAgent类型配置
 */
const SUBAGENT_CONFIGS: Record<SubAgentType, {
  systemPrompt: string
  permissionRules: typeof DEFAULT_RULES
  description: string
}> = {
  explore: {
    systemPrompt: `You are an exploration agent. Your job is to quickly search and understand codebases.
Focus on:
- Finding relevant files and patterns
- Understanding code structure
- Reporting findings concisely

Do NOT make any changes to files. Only read and analyze.`,
    permissionRules: READONLY_RULES,
    description: 'Quick codebase exploration and search',
  },
  general: {
    systemPrompt: `You are a general-purpose agent for complex tasks.
Handle multi-step operations that don't fit other categories.
Report progress and findings clearly.`,
    permissionRules: DEFAULT_RULES,
    description: 'Complex search and multi-step tasks',
  },
  code: {
    systemPrompt: `You are a code agent. Your job is to write and modify code.
Focus on:
- Implementing requested features
- Fixing bugs
- Refactoring code

Make minimal, focused changes. Test your work.`,
    permissionRules: DEFAULT_RULES,
    description: 'Code implementation and modification',
  },
  plan: {
    systemPrompt: `You are a planning agent. Your job is to analyze and plan.
Focus on:
- Understanding requirements
- Breaking down tasks
- Creating implementation plans

Do NOT make any changes. Only analyze and plan.`,
    permissionRules: READONLY_RULES,
    description: 'Code analysis and planning',
  },
}

/**
 * SubAgent类
 * 
 * SubAgent是一个独立的Agent实例，用于处理特定类型的任务
 */
export class SubAgent extends Agent {
  readonly type: SubAgentType
  readonly task: string

  constructor(config: SubAgentConfig) {
    const typeConfig = SUBAGENT_CONFIGS[config.type]
    
    const agentConfig: AgentConfig = {
      model: config.model ?? 'deepseek-chat',
      provider: config.provider ?? 'iflow',
      systemPrompt: typeConfig.systemPrompt,
      permission: new PermissionManager(typeConfig.permissionRules),
      workingDirectory: config.workingDirectory,
    }

    super(agentConfig)
    this.type = config.type
    this.task = config.task
  }

  /**
   * 运行SubAgent直到完成
   */
  async run(callbacks?: AgentCallbacks): Promise<string> {
    log.info('SubAgent started', { type: this.type, task: this.task })
    
    const result = await this.sendMessage(this.task, callbacks)
    
    log.info('SubAgent completed', { type: this.type })
    return result
  }
}
```

### Agent编排器

```typescript
// src/agent/subagent.ts (continued)

/**
 * Agent编排器
 * 
 * 管理Primary Agent和SubAgents之间的协作
 */
export class AgentOrchestrator {
  private primaryAgent: Agent
  private subAgents: Map<string, SubAgent> = new Map()
  private workingDirectory: string

  constructor(config: {
    model: string
    provider: string
    workingDirectory: string
    permission: PermissionManager
  }) {
    this.primaryAgent = new Agent({
      model: config.model,
      provider: config.provider,
      permission: config.permission,
      workingDirectory: config.workingDirectory,
      systemPrompt: this.getPrimarySystemPrompt(),
    })
    this.workingDirectory = config.workingDirectory
  }

  /**
   * 创建SubAgent处理子任务
   */
  createSubAgent(type: SubAgentType, task: string): SubAgent {
    const subAgent = new SubAgent({
      type,
      task,
      workingDirectory: this.workingDirectory,
    })

    const id = `${type}-${Date.now()}`
    this.subAgents.set(id, subAgent)

    log.info('SubAgent created', { id, type })
    return subAgent
  }

  /**
   * 并行运行多个SubAgent
   */
  async runSubAgentsParallel(
    tasks: Array<{ type: SubAgentType; task: string }>
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>()

    // 创建所有SubAgent
    const subAgents = tasks.map(({ type, task }) => ({
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      agent: this.createSubAgent(type, task),
    }))

    // 并行执行
    const promises = subAgents.map(async ({ id, agent }) => {
      try {
        const result = await agent.run()
        results.set(id, result)
      } catch (error) {
        results.set(id, `Error: ${error}`)
      }
    })

    await Promise.all(promises)
    return results
  }

  /**
   * Primary Agent处理用户消息
   */
  async sendMessage(content: string, callbacks?: AgentCallbacks): Promise<string> {
    return this.primaryAgent.sendMessage(content, callbacks)
  }

  /**
   * 获取Primary Agent状态
   */
  getState() {
    return this.primaryAgent.getState()
  }

  /**
   * Primary Agent系统提示词
   */
  private getPrimarySystemPrompt(): string {
    return `You are a primary AI coding agent. You coordinate with specialized subagents.

When dealing with complex tasks:
1. Break down the task into subtasks
2. Delegate appropriate subtasks to specialized agents
3. Aggregate and synthesize results

Available subagent types:
- explore: Quick codebase exploration and search (read-only)
- general: Complex search and multi-step tasks
- code: Code implementation and modification
- plan: Code analysis and planning (read-only)

Always explain your reasoning and coordinate effectively.`
  }
}
```

### 协作流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    SubAgent 协作架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     ┌─────────────────┐                         │
│                     │  Primary Agent  │                         │
│                     │   (Coordinator) │                         │
│                     └────────┬────────┘                         │
│                              │                                  │
│           ┌──────────────────┼──────────────────┐               │
│           │                  │                  │               │
│           ▼                  ▼                  ▼               │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│   │   Explore     │  │    Code       │  │     Plan      │      │
│   │   SubAgent    │  │   SubAgent    │  │   SubAgent    │      │
│   │               │  │               │  │               │      │
│   │ - 只读权限    │  │ - 完整权限    │  │ - 只读权限    │      │
│   │ - 快速搜索    │  │ - 代码修改    │  │ - 分析规划    │      │
│   │ - 结构理解    │  │ - 功能实现    │  │ - 任务分解    │      │
│   └───────────────┘  └───────────────┘  └───────────────┘      │
│           │                  │                  │               │
│           └──────────────────┼──────────────────┘               │
│                              │                                  │
│                              ▼                                  │
│                     ┌─────────────────┐                         │
│                     │  结果聚合       │                         │
│                     │  & 响应生成     │                         │
│                     └─────────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 使用示例

```typescript
import { AgentOrchestrator, SubAgentType } from "@/agent/subagent"
import { PermissionManager, DEFAULT_RULES } from "@/permission"

const orchestrator = new AgentOrchestrator({
  model: "deepseek-chat",
  provider: "iflow",
  workingDirectory: process.cwd(),
  permission: new PermissionManager(DEFAULT_RULES),
})

// 示例1: 使用Primary Agent直接处理
const response = await orchestrator.sendMessage(
  "Read the package.json and tell me about the dependencies",
  {
    onToken: (token) => process.stdout.write(token),
  }
)

// 示例2: 创建专门的SubAgent
const exploreAgent = orchestrator.createSubAgent(
  'explore',
  'Find all TypeScript files that import React'
)
const exploreResult = await exploreAgent.run()

// 示例3: 并行运行多个SubAgent
const parallelResults = await orchestrator.runSubAgentsParallel([
  { type: 'explore', task: 'Find all API endpoints in the codebase' },
  { type: 'explore', task: 'Find all database models' },
  { type: 'plan', task: 'Analyze the authentication flow' },
])

for (const [id, result] of parallelResults) {
  console.log(`[${id}]: ${result.slice(0, 100)}...`)
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

  processToken(token: string): void {
    this.buffer += token
    this.onToken?.(token)
  }

  complete(): string {
    this.onComplete?.(this.buffer)
    const result = this.buffer
    this.buffer = ""
    return result
  }

  getBuffer(): string {
    return this.buffer
  }

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
  model: "deepseek-chat",
  provider: "iflow",
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
      return true  // 返回true批准，false拒绝
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
4. **SubAgent多Agent协作** - 任务分解与专业化处理
5. **Agent编排器** - 管理Primary Agent和SubAgents
6. **流式响应** - 实时输出和进度指示

**技术亮点**：SubAgent多Agent协作模式是一个重要的架构设计亮点，它展示了：
- 如何设计Agent层次结构
- 如何实现任务分解和专业化处理
- 如何管理多个Agent实例
- 并行执行和结果聚合

下一章我们将实现Session管理，包括上下文压缩和会话持久化。

## 参考资料

- [OpenCode Agent实现](https://github.com/sst/opencode/tree/main/packages/opencode/src/agent)
- [Claude Agent模式](https://docs.anthropic.com/claude/docs/agent-patterns)
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)