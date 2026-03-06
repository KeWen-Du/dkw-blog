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

## 设计思路：为什么需要多 Agent 协作？

### 问题背景

单个 Agent 在处理复杂任务时存在明显局限：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    单 Agent 的局限性                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  问题 1：上下文过载                                                  │
│  - 一个 Agent 需要处理所有类型的问题                                │
│  - System Prompt 过长，影响理解                                      │
│  - 工具过多，LLM 难以选择                                            │
│                                                                      │
│  问题 2：专业性不足                                                  │
│  - 代码任务需要专注的代码 Agent                                      │
│  - 探索任务需要只读的探索 Agent                                      │
│  - 单 Agent 难以兼顾所有专业领域                                    │
│                                                                      │
│  问题 3：权限控制困难                                                │
│  - 有些操作需要高权限（如删除文件）                                  │
│  - 有些操作只需要只读权限                                            │
│  - 单 Agent 无法实现细粒度权限控制                                  │
│                                                                      │
│  问题 4：复杂任务分解能力有限                                        │
│  - 用户："帮我重构这个项目并添加测试"                                │
│  - 单 Agent 容易迷失在细节中                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 多 Agent 协作的核心思想

```
┌─────────────────────────────────────────────────────────────────────┐
│                    分而治之                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  类比：软件开发团队                                                  │
│  - 项目经理（Primary Agent）：接收需求、分解任务、整合结果           │
│  - 前端工程师（Code Agent）：专注前端代码实现                        │
│  - 测试工程师（Test Agent）：专注测试编写                            │
│  - 运维工程师（Ops Agent）：专注部署配置                             │
│                                                                      │
│  映射到 Agent 系统：                                                 │
│  - Primary Agent：理解用户意图，规划任务分解                         │
│  - SubAgent：专注特定领域，执行具体任务                              │
│                                                                      │
│  优势：                                                              │
│  1. 每个 Agent 有专注的 System Prompt                               │
│  2. 每个 Agent 只能访问相关工具                                     │
│  3. 每个 Agent 有独立的权限边界                                     │
│  4. 主 Agent 负责统筹，不陷入细节                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### SubAgent 类型设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent 类型及其职责                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Primary Agent（主 Agent）                                           │
│  - 权限：中等（可调用 task 工具委托任务）                            │
│  - 工具：task, read, grep, glob, list_directory                     │
│  - 职责：理解需求、分解任务、整合结果                                │
│                                                                      │
│  Code Agent（代码 Agent）                                            │
│  - 权限：高（可读写文件）                                            │
│  - 工具：read, write, replace, edit, bash                           │
│  - 职责：代码编写、重构、修复                                        │
│                                                                      │
│  Explore Agent（探索 Agent）                                         │
│  - 权限：低（只读）                                                  │
│  - 工具：read, grep, glob, list_directory                           │
│  - 职责：代码探索、理解、分析                                        │
│                                                                      │
│  Plan Agent（规划 Agent）                                            │
│  - 权限：低（只读）                                                  │
│  - 工具：read, grep, glob                                           │
│  - 职责：分析问题、制定计划                                          │
│                                                                      │
│  为什么这样设计？                                                    │
│  - 探索任务不应该有写权限：防止意外修改                              │
│  - 规划任务只需要理解代码：不需要执行权限                            │
│  - 代码任务需要完整权限：才能实现功能                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 方案对比：Agent 协作模式

### 方案一：层级委托模式（本文方案）

```typescript
// 主 Agent 通过 task 工具委托给子 Agent
const taskTool = {
    name: "task",
    description: "委托任务给专业 Agent",
    parameters: z.object({
        agent_type: z.enum(["code", "explore", "plan"]),
        task: z.string().describe("任务描述"),
    }),
    execute: async ({ agent_type, task }) => {
        const subAgent = createSubAgent(agent_type)
        return await subAgent.run(task)
    }
}
```

**优点**：清晰的责任划分，权限隔离  
**缺点**：实现复杂，需要协调机制  
**适用**：复杂任务场景

### 方案二：对等协作模式

```typescript
// 多个 Agent 平等协作，互相发送消息
class AgentNetwork {
    agents: Map<string, Agent>
    
    async broadcast(message: Message) {
        for (const agent of this.agents.values()) {
            await agent.receive(message)
        }
    }
}
```

**优点**：灵活，无中心化依赖  
**缺点**：协调困难，容易死锁  
**适用**：去中心化场景

### 方案三：工作流编排模式

```typescript
// 预定义工作流，按顺序执行
const workflow = [
    { agent: "explore", task: "分析代码结构" },
    { agent: "plan", task: "制定重构计划" },
    { agent: "code", task: "执行重构" },
]

for (const step of workflow) {
    const agent = createAgent(step.agent)
    await agent.run(step.task)
}
```

**优点**：流程清晰，易于调试  
**缺点**：不够灵活，无法动态调整  
**适用**：固定流程场景

## 常见陷阱与解决方案

### 陷阱一：SubAgent 结果未正确传递给主 Agent

**问题描述**：
```typescript
// 错误：SubAgent 结果没有加入主 Agent 的消息历史
const result = await subAgent.run(task)
// 主 Agent 不知道 SubAgent 做了什么

// 下一步主 Agent 可能重复执行相同任务
```

**解决方案**：将结果作为工具返回值

```typescript
execute: async ({ agent_type, task }) => {
    const subAgent = createSubAgent(agent_type)
    const result = await subAgent.run(task)
    
    // 返回结构化结果，让主 Agent 理解
    return {
        title: `${agent_type} Agent 完成任务`,
        output: result.summary || result.output,
        metadata: {
            agent_type,
            files_modified: result.files_modified,
            tools_used: result.tools_used,
        }
    }
}
```

### 陷阱二：无限递归委托

**问题描述**：
```
Primary Agent 委托任务给 Code Agent
Code Agent 遇到问题，又委托给另一个 Agent
...
无限循环
```

**解决方案**：设置委托深度限制

```typescript
const MAX_DELEGATION_DEPTH = 3

function createSubAgent(type: string, depth: number = 0) {
    if (depth >= MAX_DELEGATION_DEPTH) {
        throw new Error("委托深度超限，请在当前上下文中解决问题")
    }
    
    const agent = new Agent({ type, depth: depth + 1 })
    
    // 只有 depth < MAX_DELEGATION_DEPTH 时才有 task 工具
    if (agent.depth < MAX_DELEGATION_DEPTH) {
        agent.tools.push(createTaskTool(agent.depth + 1))
    }
    
    return agent
}
```

### 陷阱三：权限隔离不彻底

**问题描述**：
```typescript
// SubAgent 配置了只读工具
const exploreAgent = new Agent({
    tools: [readTool, grepTool],  // 只有只读工具
})

// 但 SubAgent 的 System Prompt 可以访问敏感信息
// 或者 SubAgent 可以读取敏感文件
```

**解决方案**：多层级权限控制

```typescript
// 1. 工具级别：只提供必要工具
const exploreAgent = new Agent({
    tools: [readTool, grepTool],  // 只有只读
})

// 2. 文件级别：限制可访问路径
const readTool = defineTool({
    name: "read",
    execute: async ({ path }) => {
        // 检查路径权限
        if (!isPathAllowed(agent.type, path)) {
            return { error: `路径 ${path} 不允许访问` }
        }
        return await readFile(path)
    }
})

// 3. 操作级别：记录所有操作
const auditLog = new AuditLog()
agent.onToolCall((tool, params, result) => {
    auditLog.record({ agent: agent.type, tool, params, result })
})
```

### 陷阱四：主 Agent 不知道何时委托

**问题描述**：
```typescript
// 主 Agent 收到任务，但不知道应该自己做还是委托
// 可能导致：
// 1. 万事都委托，效率低下
// 2. 万事都自己做，超出能力范围
```

**解决方案**：在 System Prompt 中明确指导

```typescript
const primarySystemPrompt = `
你是一个主 Agent，负责理解用户需求并协调执行。

何时委托给 SubAgent：
- 需要修改文件 → 委托给 code Agent
- 只需要阅读理解代码 → 委托给 explore Agent
- 需要制定计划 → 委托给 plan Agent

何时自己执行：
- 简单的文件读取
- 快速的代码搜索
- 整合 SubAgent 结果
`

// 或者使用自动分类
function shouldDelegate(task: string): boolean {
    const keywords = ["修改", "重构", "实现", "创建"]
    return keywords.some(k => task.includes(k))
}
```

### 陷阱五：SubAgent 上下文爆炸

**问题描述**：
```
Primary Agent 的消息历史：100 条消息
委托给 Code Agent 时，需要传递上下文
→ Code Agent 也要处理 100 条消息？太浪费了
```

**解决方案**：上下文压缩和选择性传递

```typescript
function prepareSubAgentContext(
    primaryHistory: Message[],
    task: string
): Message[] {
    // 1. 只保留相关消息
    const relevantMessages = filterRelevant(primaryHistory, task)
    
    // 2. 压缩历史为摘要
    if (relevantMessages.length > 10) {
        const summary = await summarize(relevantMessages)
        return [
            { role: "user", content: `背景信息：${summary}` },
            { role: "user", content: `任务：${task}` }
        ]
    }
    
    // 3. 添加任务消息
    return [...relevantMessages, { role: "user", content: task }]
}

const subAgent = createSubAgent(type)
const context = prepareSubAgentContext(history, task)
return await subAgent.run(context)
```

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
