---
title: "从零到一实现 nano-agent（八）：子 Agent 协作"
date: "2024-12-26"
excerpt: "实现多 Agent 协作系统，支持任务委托、SubAgent 架构和专业 Agent 类型，构建强大的 Agent 编排能力。"
tags: ["AI", "Agent", "Multi-Agent", "TypeScript", "架构设计"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 8
---

# 从零到一实现 nano-agent（八）：多 Agent 协作

## 前言

单个 Agent 能力有限，通过多 Agent 协作可以处理更复杂的任务。本章将实现 SubAgent 架构，支持将任务委托给专业的子 Agent，实现真正的 Agent 编排能力。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| SubAgent 架构 | ⭐⭐⭐⭐⭐ | 架构设计能力 | ✅ |
| 任务委托模式 | ⭐⭐⭐⭐ | 模式设计 | ✅ |
| Agent 编排 | ⭐⭐⭐⭐ | 系统设计 | ✅ |
| 权限隔离 | ⭐⭐⭐ | 安全设计 | ✅ |

## 面试考点

1. 如何设计多 Agent 协作系统？
2. 主 Agent 和子 Agent 如何通信？
3. 如何实现 Agent 间的权限隔离？

## 多 Agent 架构

### 整体设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Multi-Agent System                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Primary Agent                       │   │
│  │  - 接收用户输入                                      │   │
│  │  - 规划任务分解                                      │   │
│  │  - 委托给 SubAgent                                   │   │
│  │  - 整合结果回复                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              │ task 工具                   │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Agent Orchestrator                      │   │
│  │  - 管理 SubAgent 实例                                │   │
│  │  - 路由任务到对应 Agent                              │   │
│  │  - 收集结果                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│          ┌───────────────────┼───────────────────┐         │
│          ▼                   ▼                   ▼         │
│     ┌─────────┐        ┌─────────┐        ┌─────────┐      │
│     │ explore │        │ general │        │  code   │      │
│     │ Agent   │        │ Agent   │        │ Agent   │      │
│     │         │        │         │        │         │      │
│     │ 只读    │        │ 部分权限│        │ 写入权限│      │
│     └─────────┘        └─────────┘        └─────────┘      │
│          │                   │                   │          │
│          └───────────────────┼───────────────────┘         │
│                              ▼                              │
│                        ┌─────────┐                          │
│                        │  plan   │                          │
│                        │ Agent   │                          │
│                        │         │                          │
│                        │ 分析规划│                          │
│                        └─────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### SubAgent 类型

| Agent 类型 | 功能 | 可用工具 | 权限级别 |
|------------|------|----------|----------|
| `explore` | 快速代码库探索 | read, glob | 只读 |
| `general` | 复杂搜索任务 | read, glob, bash | 部分权限 |
| `code` | 代码编写修改 | read, glob, write, edit, bash | 需确认 |
| `plan` | 分析与规划 | read, glob | 只读 |

## SubAgent 定义

```typescript
// src/agent/subagent.ts

import type { AgentConfig, AgentCallbacks, AgentState, Agent } from './agent'
import { PermissionManager, PermissionRule } from '../permission'
import { Logger } from '../util/logger'

const log = Logger.create({ service: 'subagent' })

/**
 * SubAgent 类型
 */
export type SubAgentType = 'explore' | 'general' | 'code' | 'plan'

/**
 * SubAgent 定义
 */
export interface SubAgentDefinition {
  type: SubAgentType
  name: string
  description: string
  systemPrompt: string
  tools: string[]
  maxIterations: number
  permissionRules: PermissionRule[]
}

/**
 * 预定义的 SubAgent 配置
 */
export const SUBAGENT_DEFINITIONS: Record<SubAgentType, SubAgentDefinition> = {
  explore: {
    type: 'explore',
    name: 'Explorer Agent',
    description: 'Quickly explore codebase and answer questions about code structure',
    systemPrompt: `You are an exploration agent. Your job is to quickly understand codebases.
- Use read and glob tools to explore
- Be concise and focused
- Report findings clearly
- Do not make changes to any files`,
    tools: ['read', 'glob'],
    maxIterations: 10,
    permissionRules: [
      { tool: 'read', action: 'allow' },
      { tool: 'glob', action: 'allow' },
      { tool: '*', action: 'deny' },
    ],
  },
  general: {
    type: 'general',
    name: 'General Agent',
    description: 'Handle complex search and multi-step tasks',
    systemPrompt: `You are a general-purpose agent for complex tasks.
- Break down complex problems into steps
- Use all available tools as needed
- Provide detailed reports
- Handle errors gracefully`,
    tools: ['read', 'glob', 'bash'],
    maxIterations: 15,
    permissionRules: [
      { tool: 'read', action: 'allow' },
      { tool: 'glob', action: 'allow' },
      { tool: 'bash', action: 'ask' },
      { tool: '*', action: 'deny' },
    ],
  },
  code: {
    type: 'code',
    name: 'Code Agent',
    description: 'Write and modify code with full tool access',
    systemPrompt: `You are a code agent. Your job is to write and modify code.
- Use write and edit tools to make changes
- Read files first to understand context
- Write clean, well-structured code
- Test your changes when possible`,
    tools: ['read', 'glob', 'write', 'edit', 'bash'],
    maxIterations: 20,
    permissionRules: [
      { tool: 'read', action: 'allow' },
      { tool: 'glob', action: 'allow' },
      { tool: 'write', action: 'ask' },
      { tool: 'edit', action: 'ask' },
      { tool: 'bash', action: 'ask' },
    ],
  },
  plan: {
    type: 'plan',
    name: 'Plan Agent',
    description: 'Analyze code and create implementation plans',
    systemPrompt: `You are a planning agent. Your job is to analyze and plan.
- Explore codebase thoroughly
- Understand architecture and patterns
- Create detailed implementation plans
- Do not make any file changes`,
    tools: ['read', 'glob'],
    maxIterations: 15,
    permissionRules: [
      { tool: 'read', action: 'allow' },
      { tool: 'glob', action: 'allow' },
      { tool: '*', action: 'deny' },
    ],
  },
}
```

## SubAgent 类实现

```typescript
// src/agent/subagent.ts (续)

/**
 * SubAgent - 使用组合模式包装 Agent
 */
export class SubAgent {
  private definition: SubAgentDefinition
  private agentInstance: Agent | null = null
  private agentConfig: Omit<AgentConfig, 'permission' | 'systemPrompt'>
  private permission: PermissionManager

  constructor(
    private subAgentType: SubAgentType,
    baseConfig: Omit<AgentConfig, 'permission' | 'systemPrompt'>
  ) {
    this.definition = SUBAGENT_DEFINITIONS[subAgentType]
    this.permission = new PermissionManager(this.definition.permissionRules)
    this.agentConfig = baseConfig
    log.info('SubAgent created', { type: subAgentType })
  }

  /**
   * 延迟初始化 Agent 实例，避免循环依赖
   */
  private async getAgent(): Promise<Agent> {
    if (!this.agentInstance) {
      // 动态导入避免循环依赖
      const AgentModule = await import('./agent')
      const AgentClass = AgentModule.Agent
      this.agentInstance = new AgentClass({
        ...this.agentConfig,
        permission: this.permission,
        systemPrompt: this.definition.systemPrompt,
      })
    }
    return this.agentInstance
  }

  getDefinition(): SubAgentDefinition {
    return this.definition
  }

  getType(): SubAgentType {
    return this.subAgentType
  }

  async sendMessage(content: string, callbacks: AgentCallbacks = {}): Promise<string> {
    const agent = await this.getAgent()
    return agent.sendMessage(content, callbacks)
  }

  getState(): AgentState {
    if (this.agentInstance) {
      return this.agentInstance.getState()
    }
    return {
      messages: [],
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
    }
  }

  reset(): void {
    if (this.agentInstance) {
      this.agentInstance.reset()
    }
  }
}
```

## Agent 编排器

```typescript
// src/agent/subagent.ts (续)

/**
 * 编排器配置
 */
export interface OrchestratorConfig {
  model: string
  provider: string
  workingDirectory: string
}

/**
 * Agent 编排器
 */
export class AgentOrchestrator {
  private primaryAgent: Agent | null = null
  private subAgents = new Map<SubAgentType, SubAgent>()
  private config: OrchestratorConfig

  constructor(config: OrchestratorConfig) {
    this.config = config
    log.info('AgentOrchestrator created')
  }

  /**
   * 获取主 Agent
   */
  private async getPrimaryAgent(): Promise<Agent> {
    if (!this.primaryAgent) {
      const AgentModule = await import('./agent')
      const AgentClass = AgentModule.Agent
      this.primaryAgent = new AgentClass({
        model: this.config.model,
        provider: this.config.provider,
        workingDirectory: this.config.workingDirectory,
        permission: new PermissionManager([
          { tool: 'read', action: 'allow' },
          { tool: 'glob', action: 'allow' },
          { tool: 'write', action: 'ask' },
          { tool: 'edit', action: 'ask' },
          { tool: 'bash', action: 'ask' },
        ]),
      })
    }
    return this.primaryAgent
  }

  /**
   * 获取或创建 SubAgent
   */
  getSubAgent(type: SubAgentType): SubAgent {
    if (!this.subAgents.has(type)) {
      const subAgent = new SubAgent(type, {
        model: this.config.model,
        provider: this.config.provider,
        workingDirectory: this.config.workingDirectory,
      })
      this.subAgents.set(type, subAgent)
    }
    return this.subAgents.get(type)!
  }

  /**
   * 委托任务给 SubAgent
   */
  async delegateTo(
    type: SubAgentType,
    task: string,
    callbacks: AgentCallbacks = {}
  ): Promise<{ response: string; state: AgentState }> {
    const subAgent = this.getSubAgent(type)
    log.info('Delegating to subagent', { type, task: task.slice(0, 50) })
    
    const response = await subAgent.sendMessage(task, callbacks)
    const state = subAgent.getState()
    
    return { response, state }
  }

  /**
   * 使用主 Agent 发送消息
   */
  async sendMessage(content: string, callbacks: AgentCallbacks = {}): Promise<string> {
    const agent = await this.getPrimaryAgent()
    return agent.sendMessage(content, callbacks)
  }

  /**
   * 获取所有 Agent 状态
   */
  async getAllStates(): Promise<{
    primary: AgentState
    subAgents: Record<SubAgentType, AgentState>
  }> {
    const primaryAgent = await this.getPrimaryAgent()
    const subAgentStates: Record<SubAgentType, AgentState> = {} as any
    for (const [type, agent] of this.subAgents) {
      subAgentStates[type] = agent.getState()
    }
    
    return {
      primary: primaryAgent.getState(),
      subAgents: subAgentStates,
    }
  }

  /**
   * 重置所有 Agent
   */
  async resetAll(): Promise<void> {
    const primaryAgent = await this.getPrimaryAgent()
    primaryAgent.reset()
    for (const agent of this.subAgents.values()) {
      agent.reset()
    }
    log.info('All agents reset')
  }
}
```

## Task 工具实现

```typescript
// src/tool/task.ts

import z from "zod"
import { ToolDefinition, ToolContext, ToolResult } from "./tool"
import { SubAgent, SubAgentType, SUBAGENT_DEFINITIONS } from "../agent/subagent"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "task" })

const SUBAGENT_TYPES = ["explore", "general", "code", "plan"] as const

function buildDescription(): string {
  const agentList = Object.entries(SUBAGENT_DEFINITIONS)
    .map(([type, def]) => `  - ${type}: ${def.description}`)
    .join("\n")

  return `Delegate a task to a specialized subagent.

Available subagents:
${agentList}

IMPORTANT:
- Always provide a clear, specific prompt for the subagent
- The subagent will work autonomously and return results
- Choose the appropriate subagent type for the task`
}

export const taskTool: ToolDefinition = {
  name: "task",
  description: buildDescription(),

  parameters: z.object({
    subagent_type: z
      .enum(SUBAGENT_TYPES)
      .describe("The type of specialized agent to use"),
    description: z
      .string()
      .describe("A short (3-5 words) description of the task"),
    prompt: z
      .string()
      .describe("The detailed task instructions for the subagent"),
  }),

  async execute(
    params: z.infer<typeof taskTool.parameters>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const { subagent_type, description, prompt } = params

    log.info("Starting subagent task", {
      type: subagent_type,
      description,
    })

    const definition = SUBAGENT_DEFINITIONS[subagent_type as SubAgentType]
    if (!definition) {
      throw new Error(
        `Unknown subagent type: ${subagent_type}. Available: ${SUBAGENT_TYPES.join(", ")}`
      )
    }

    // 创建 SubAgent
    const subAgent = new SubAgent(subagent_type, {
      model: "gpt-4o-mini",
      provider: "openai",
      workingDirectory: ctx.workingDirectory,
    })

    const startTime = Date.now()
    let result: string
    let success = true

    try {
      result = await subAgent.sendMessage(prompt, {
        onEvent: (event) => {
          if (event.type === "tool_use") {
            log.debug("Subagent tool call", { tool: event.toolName })
          } else if (event.type === "error") {
            log.warn("Subagent error event", { error: event.error })
          }
        },
      })
    } catch (error) {
      success = false
      result = `Subagent error: ${error instanceof Error ? error.message : String(error)}`
      log.error("Subagent task failed", { type: subagent_type, error: result })
    }

    const duration = Date.now() - startTime
    const state = subAgent.getState()

    const output = [
      `## Task: ${description}`,
      `**Agent**: ${definition.name} (${subagent_type})`,
      `**Duration**: ${duration}ms`,
      `**Tokens**: ${state.totalTokens.input} in / ${state.totalTokens.output} out`,
      `**Cost**: $${state.totalCost.toFixed(4)}`,
      "",
      "### Result",
      "",
      result,
    ].join("\n")

    log.info("Subagent task completed", {
      type: subagent_type,
      description,
      duration,
      success,
    })

    return {
      title: `${description} (${subagent_type})`,
      output,
      metadata: {
        subagentType: subagent_type,
        description,
        duration,
        success,
        tokens: state.totalTokens,
        cost: state.totalCost,
      },
    }
  },
}
```

## 使用示例

### 通过主 Agent 委托任务

```typescript
// 用户: "帮我探索这个项目的结构，并制定一个重构计划"

// 主 Agent 分析后:
// 1. 委托给 explore agent 探索代码库
// 2. 委托给 plan agent 制定计划

// 第一次 tool_call
{
  name: "task",
  input: {
    subagent_type: "explore",
    description: "Explore project structure",
    prompt: "Explore this codebase and provide a summary of:\n1. Project structure\n2. Key components\n3. Dependencies\n4. Code patterns used"
  }
}

// 第二次 tool_call
{
  name: "task",
  input: {
    subagent_type: "plan",
    description: "Create refactor plan",
    prompt: "Based on the codebase exploration, create a detailed refactoring plan to improve:\n1. Code organization\n2. Performance\n3. Maintainability"
  }
}
```

### 直接使用 Orchestrator

```typescript
import { AgentOrchestrator } from './agent/subagent'

const orchestrator = new AgentOrchestrator({
  model: 'gpt-4o-mini',
  provider: 'openai',
  workingDirectory: '/project',
})

// 委托给 code agent
const { response, state } = await orchestrator.delegateTo(
  'code',
  'Implement a UserService class with CRUD operations',
  {
    onEvent: (event) => {
      if (event.type === 'tool_use') {
        console.log(`Code agent using: ${event.toolName}`)
      }
    },
  }
)

console.log('Result:', response)
console.log('Tokens used:', state.totalTokens)
```

## 小结

本章实现了多 Agent 协作系统，包括：

1. **SubAgent 定义** - 四种专业 Agent 类型
2. **SubAgent 类** - 组合模式封装 Agent
3. **Agent 编排器** - 管理和路由任务
4. **Task 工具** - 集成到工具系统

**关键要点**：

- 多 Agent 协作让复杂任务分解更清晰
- 不同 Agent 有不同的权限级别
- 编排器统一管理 Agent 生命周期
- 延迟初始化避免循环依赖

下一章我们将实现并行工具执行。

## 参考资料

- [Multi-Agent Systems](https://www.deeplearning.ai/the-batch/multi-agent-systems-are-transforming-ai/)
- [AutoGPT Architecture](https://docs.agpt.co/)
- [LangChain Agent Types](https://python.langchain.com/docs/modules/agents/agent_types/)
