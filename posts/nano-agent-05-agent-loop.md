---
title: "从零到一实现 nano-agent（五）：Agent 循环与对话管理"
date: "2024-11-24"
excerpt: "实现 AI Agent 的核心 ReAct 循环，处理工具调用、消息状态管理和流式响应，构建完整的 Agent 执行引擎。"
tags: ["AI", "LLM", "Agent", "ReAct", "TypeScript"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 5
---

# 从零到一实现 nano-agent（五）：Agent 核心循环

## 前言

Agent 核心循环是 AI Coding Agent 的心脏。它实现了 ReAct（Reasoning + Acting）模式：模型先思考，然后采取行动（调用工具），观察结果，再继续思考。本章将实现完整的 Agent 循环，整合 Provider 和 Tool 系统。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| ReAct 模式实现 | ⭐⭐⭐⭐ | Agent 核心原理 | ✅ |
| 流式响应处理 | ⭐⭐⭐⭐ | 异步编程能力 | ✅ |
| 工具调用循环 | ⭐⭐⭐⭐ | 状态机设计 | ✅ |
| 消息状态管理 | ⭐⭐⭐ | 数据结构设计 | ✅ |

## 面试考点

1. ReAct 模式的核心流程是什么？
2. 如何处理 LLM 返回的多个工具调用？
3. Agent 循环如何避免无限迭代？

## 设计思路：为什么 Agent 需要循环？

### 问题背景

传统程序是**确定性的**：给定输入，输出是确定的。但 AI Agent 不同：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    传统程序 vs AI Agent                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  传统程序（确定性）：                                                │
│  输入 ──▶ 处理 ──▶ 输出                                             │
│  "读取 package.json" ──▶ readFile() ──▶ 文件内容                    │
│                                                                      │
│  AI Agent（不确定性）：                                              │
│  输入 ──▶ LLM 思考 ──▶ 可能调用工具 ──▶ 观察结果 ──▶ 继续思考？      │
│                                                                      │
│  示例：用户说 "帮我分析这个项目的依赖"                                │
│                                                                      │
│  第一轮：LLM 思考 "需要先读取 package.json"                          │
│         LLM 决定调用 read({ path: "package.json" })                  │
│         工具返回文件内容                                             │
│                                                                      │
│  第二轮：LLM 观察结果，思考 "发现依赖列表，需要分析每个依赖"          │
│         LLM 决定调用 grep({ pattern: "import.*from" })               │
│         工具返回导入语句                                             │
│                                                                      │
│  第三轮：LLM 观察结果，思考 "分析完成，可以回复用户"                  │
│         LLM 输出最终答案                                             │
│                                                                      │
│  关键：LLM 需要多次思考-行动-观察，直到任务完成                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### ReAct 模式的本质

ReAct（Reasoning + Acting）模式的核心思想：

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ReAct 本质                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Reasoning（思考）：                                                 │
│  - 分析当前情况                                                      │
│  - 决定下一步行动                                                    │
│  - 选择合适的工具                                                    │
│                                                                      │
│  Acting（行动）：                                                    │
│  - 执行工具调用                                                      │
│  - 获取执行结果                                                      │
│                                                                      │
│  Observation（观察）：                                               │
│  - 分析工具返回的结果                                                │
│  - 更新对任务的理解                                                  │
│  - 决定是否继续                                                      │
│                                                                      │
│  循环终止条件：                                                      │
│  1. LLM 不再调用工具，直接输出答案                                   │
│  2. 达到最大迭代次数                                                 │
│  3. 发生错误                                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 为什么需要最大迭代次数？

```
┌─────────────────────────────────────────────────────────────────────┐
│                    无限循环的风险                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  风险场景 1：LLM 陷入死循环                                          │
│  - LLM 不断重复调用同一个工具                                        │
│  - 消耗大量 Token 和费用                                             │
│                                                                      │
│  风险场景 2：任务无法完成                                            │
│  - 用户给出不可能完成的任务                                          │
│  - LLM 永远在尝试                                                    │
│                                                                      │
│  风险场景 3：工具返回异常                                            │
│  - LLM 不断重试失败的工具                                            │
│                                                                      │
│  解决方案：设置合理的最大迭代次数（如 20 次）                         │
│  - 大多数任务在 10 次内完成                                          │
│  - 复杂任务可能需要更多                                              │
│  - 超过限制时强制终止，返回当前结果                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 方案对比：Agent 循环实现

### 方案一：简单循环

```typescript
async function runLoop(userInput: string) {
    const messages = [{ role: "user", content: userInput }]
    
    while (true) {  // 危险：可能无限循环
        const response = await llm.chat(messages)
        
        if (response.toolCalls) {
            for (const call of response.toolCalls) {
                const result = await executeTool(call)
                messages.push({ role: "tool", content: result })
            }
        } else {
            return response.content
        }
    }
}
```

**优点**：简单直观  
**缺点**：无迭代限制、无错误处理、无权限检查  
**结论**：仅适用于原型验证

### 方案二：带限制的循环（本文方案）

```typescript
async function runLoop(userInput: string, maxIterations = 20) {
    const messages = [{ role: "user", content: userInput }]
    
    for (let i = 0; i < maxIterations; i++) {
        try {
            const response = await llm.chat(messages)
            
            if (!response.toolCalls?.length) {
                return response.content
            }
            
            for (const call of response.toolCalls) {
                if (!await checkPermission(call)) continue
                
                const result = await executeTool(call)
                messages.push({ role: "tool", content: result })
            }
        } catch (error) {
            // 错误处理
        }
    }
    
    return "达到最大迭代次数"
}
```

**优点**：安全限制、错误处理、权限检查  
**缺点**：代码量增加  
**结论**：**推荐用于生产环境**

### 方案三：状态机模式

```typescript
enum State { IDLE, THINKING, EXECUTING, DONE, ERROR }

class AgentStateMachine {
    private state: State = State.IDLE
    
    async run(input: string) {
        while (this.state !== State.DONE && this.state !== State.ERROR) {
            switch (this.state) {
                case State.IDLE:
                    this.state = State.THINKING
                    break
                case State.THINKING:
                    // ...
                    break
            }
        }
    }
}
```

**优点**：状态清晰，易于调试  
**缺点**：复杂度高，对于简单场景过度设计  
**结论**：适用于复杂状态转换场景

## 常见陷阱与解决方案

### 陷阱一：消息历史格式错误导致 LLM 混淆

**问题描述**：
```typescript
// 错误：工具结果没有正确关联到工具调用
messages.push({ role: "assistant", content: "调用工具..." })
messages.push({ role: "user", content: "工具结果..." })  // 应该是 tool 类型

// LLM 不知道这是工具调用结果，可能误解为用户输入
```

**解决方案**：使用正确的消息类型

```typescript
// 正确：使用 tool_use 和 tool_result
messages.push({
    role: "assistant",
    content: [
        { type: "text", text: "我来读取文件..." },
        { type: "tool_use", id: "1", name: "read", input: { path: "..." } }
    ]
})

messages.push({
    role: "user",
    content: [
        { type: "tool_result", tool_use_id: "1", content: "文件内容..." }
    ]
})
```

### 陷阱二：并行工具调用的结果顺序问题

**问题描述**：
```typescript
// LLM 可能一次返回多个工具调用
const toolCalls = [
    { id: "1", name: "read", input: { path: "/a.ts" } },
    { id: "2", name: "read", input: { path: "/b.ts" } },
]

// 错误：按顺序执行，浪费时间
for (const call of toolCalls) {
    results.push(await executeTool(call))
}

// 错误：并行执行，但结果顺序不对应
const results = await Promise.all(toolCalls.map(executeTool))
// results[0] 可能对应 toolCalls[1] 的结果
```

**解决方案**：保持 ID 关联

```typescript
// 使用 Promise.allSettled 并行执行
const settled = await Promise.allSettled(
    toolCalls.map(call => executeTool(call))
)

// 构建正确关联的结果
const toolResults = settled.map((result, i) => ({
    type: "tool_result",
    tool_use_id: toolCalls[i].id,  // 使用原始 ID
    content: result.status === "fulfilled" ? result.value.output : result.reason.message,
}))
```

### 陷阱三：工具执行失败时没有正确反馈给 LLM

**问题描述**：
```typescript
// 错误：工具失败时直接抛出异常，中断整个循环
const result = await executeTool(call)  // 抛出异常

// 结果：整个 Agent 循环中断
```

**解决方案**：将错误作为结果返回给 LLM

```typescript
try {
    const result = await executeTool(call)
    messages.push({
        role: "user",
        content: [{
            type: "tool_result",
            tool_use_id: call.id,
            content: result.output,
        }]
    })
} catch (error) {
    // 让 LLM 知道发生了错误，可以尝试其他方案
    messages.push({
        role: "user",
        content: [{
            type: "tool_result",
            tool_use_id: call.id,
            content: `Error: ${error.message}`,
            is_error: true,  // 标记为错误
        }]
    })
}
```

### 陷阱四：忘记处理 LLM 返回的文本内容

**问题描述**：
```typescript
// LLM 可能同时返回文本和工具调用
{
    content: "让我先读取文件内容...",
    toolCalls: [{ name: "read", ... }]
}

// 错误：只处理工具调用，忽略文本
if (response.toolCalls) {
    // 处理工具调用，忽略 response.content
}

// 结果：用户看不到 LLM 的思考过程
```

**解决方案**：同时记录文本内容

```typescript
const assistantBlocks = []

// 先记录文本
if (response.content) {
    assistantBlocks.push({ type: "text", text: response.content })
    callbacks.onEvent?.({ type: "text", content: response.content })
}

// 再记录工具调用
if (response.toolCalls) {
    for (const call of response.toolCalls) {
        assistantBlocks.push({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.input,
        })
    }
}

// 完整的消息
messages.push({ role: "assistant", content: assistantBlocks })
```

### 陷阱五：上下文爆炸导致超出 Token 限制

**问题描述**：
```
随着对话进行，消息历史越来越长：
第 1 轮：1000 tokens
第 5 轮：5000 tokens
第 10 轮：15000 tokens  // 超出模型限制！
```

**解决方案**：上下文压缩或截断

```typescript
// 策略 1：保留最近 N 条消息
if (messages.length > MAX_MESSAGES) {
    messages = [messages[0], ...messages.slice(-MAX_MESSAGES + 1)]
}

// 策略 2：压缩历史消息为摘要
if (totalTokens > CONTEXT_LIMIT * 0.8) {
    const summary = await summarize(messages.slice(0, -5))
    messages = [
        { role: "assistant", content: `[历史摘要] ${summary}` },
        ...messages.slice(-5)
    ]
}

// 策略 3：使用支持长上下文的模型
// 或者让用户手动清除历史
```

## ReAct 模式解析

### 什么是 ReAct？

ReAct（Reasoning + Acting）是 AI Agent 的核心范式：

```
┌─────────────────────────────────────────────────────────────┐
│                    ReAct Loop                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌─────────┐                                              │
│    │  用户   │                                              │
│    │  输入   │                                              │
│    └────┬────┘                                              │
│         │                                                    │
│         ▼                                                    │
│    ┌─────────┐     ┌─────────┐     ┌─────────┐             │
│    │ Reason  │────▶│  Act    │────▶│ Observe │             │
│    │ (思考)  │     │ (行动)  │     │ (观察)  │             │
│    └─────────┘     └─────────┘     └────┬────┘             │
│         ▲                               │                   │
│         │         ┌─────────┐           │                   │
│         └─────────│继续思考 │◀──────────┘                   │
│                   └─────────┘                               │
│                                                             │
│    示例:                                                    │
│    用户: "帮我读取 package.json 的内容"                      │
│                                                             │
│    Reason: 用户想查看 package.json，我需要使用 read 工具     │
│    Act: 调用 read({ path: "/project/package.json" })        │
│    Observe: 返回文件内容                                     │
│    Reason: 已获取内容，可以回复用户                          │
│    Act: 返回结果给用户                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 消息流转

```
┌─────────────────────────────────────────────────────────────┐
│                    Message Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  消息列表:                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [0] user: "帮我读取 package.json"                    │   │
│  │                                                      │   │
│  │ [1] assistant: [                                     │   │
│  │       { type: "text", text: "好的，我来读取..." },   │   │
│  │       { type: "tool_use", id: "1", name: "read",    │   │
│  │         input: { path: "/project/package.json" } }  │   │
│  │     ]                                                │   │
│  │                                                      │   │
│  │ [2] user: [                                          │   │
│  │       { type: "tool_result", tool_use_id: "1",      │   │
│  │         content: "文件内容..." }                     │   │
│  │     ]                                                │   │
│  │                                                      │   │
│  │ [3] assistant: "package.json 的内容如下：..."        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Agent 接口定义

```typescript
// src/agent/agent.ts

import { registry, ChatMessage, ContentBlock, calculateCost } from "../provider"
import { toolRegistry } from "../tool"
import { PermissionManager, PermissionRequest } from "../permission"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "agent" })

/**
 * Agent 配置
 */
export interface AgentConfig {
  model: string              // 模型名称
  provider: string           // 提供商
  systemPrompt?: string      // 系统提示词
  temperature?: number       // 温度参数
  maxTokens?: number         // 最大输出 Token
  permission: PermissionManager  // 权限管理器
  workingDirectory: string   // 工作目录
}

/**
 * Agent 状态
 */
export interface AgentState {
  messages: ChatMessage[]    // 消息历史
  totalTokens: { input: number; output: number }  // Token 统计
  totalCost: number          // 累计成本
}

/**
 * Agent 事件类型
 */
export interface AgentEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "done"
  content?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  error?: string
}

/**
 * Agent 回调函数
 */
export interface AgentCallbacks {
  onEvent?: (event: AgentEvent) => void       // 事件回调
  onToken?: (token: string) => void           // 流式 Token 回调
  onToolCall?: (name: string, input: Record<string, unknown>) => Promise<boolean>  // 工具确认
}
```

## Agent 类实现

### 构造函数和基本方法

```typescript
// src/agent/agent.ts (续)

export class Agent {
  private provider: ReturnType<typeof registry.get>
  private state: AgentState

  constructor(private config: AgentConfig) {
    // 获取 Provider 实例
    const p = registry.get(config.provider)
    if (!p) {
      throw new Error(`Provider not found: ${config.provider}`)
    }
    this.provider = p
    
    // 初始化状态
    this.state = {
      messages: [],
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(content: string, callbacks: AgentCallbacks = {}): Promise<string> {
    // 添加用户消息
    this.state.messages.push({ role: "user", content })
    
    // 运行循环
    return this.runLoop(callbacks)
  }

  /**
   * 获取当前状态
   */
  getState(): AgentState {
    return { ...this.state }
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = {
      messages: [],
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
    }
  }
}
```

### 核心循环实现

```typescript
// src/agent/agent.ts (续)

/**
 * 核心 ReAct 循环
 */
private async runLoop(callbacks: AgentCallbacks): Promise<string> {
  let finalResponse = ""
  let iterations = 0
  const maxIterations = 20  // 防止无限循环

  while (iterations < maxIterations) {
    iterations++
    
    try {
      // 调用 LLM
      const response = await this.callLLM(callbacks.onToken)
      
      // 更新 Token 统计
      if (response.usage) {
        this.state.totalTokens.input += response.usage.inputTokens
        this.state.totalTokens.output += response.usage.outputTokens
        this.state.totalCost += calculateCost(
          this.config.model,
          response.usage.inputTokens,
          response.usage.outputTokens
        )
      }

      // 构建助手消息的内容块
      const assistantBlocks: ContentBlock[] = []
      
      // 处理文本内容
      if (response.content) {
        assistantBlocks.push({ type: "text", text: response.content })
        callbacks.onEvent?.({ type: "text", content: response.content })
        finalResponse = response.content
      }

      // 处理工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults: ContentBlock[] = []

        for (const call of response.toolCalls) {
          // 记录工具调用
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

          // 检查权限
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

          // 执行工具
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

        // 添加助手消息（包含工具调用）
        this.state.messages.push({ role: "assistant", content: assistantBlocks })
        // 添加用户消息（工具结果）
        this.state.messages.push({ role: "user", content: toolResults })
        
        // 继续循环，让 LLM 处理工具结果
        continue
      }

      // 没有工具调用，循环结束
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

  // 达到最大迭代次数
  callbacks.onEvent?.({ type: "done" })
  return finalResponse
}
```

### LLM 调用

```typescript
// src/agent/agent.ts (续)

/**
 * 调用 LLM（流式）
 */
private async callLLM(onToken?: (token: string) => void): Promise<{
  content: string
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>
  usage?: { inputTokens: number; outputTokens: number }
}> {
  // 获取工具定义
  const tools = toolRegistry.toLLMTools()
  
  let content = ""
  let toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
  let usage: { inputTokens: number; outputTokens: number } | undefined

  try {
    // 流式调用
    for await (const event of this.provider!.chatStream({
      model: this.config.model,
      messages: this.state.messages,
      system: this.config.systemPrompt ?? this.getDefaultSystemPrompt(),
      tools: tools.length > 0 ? tools : undefined,
      maxTokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature,
      onToken: (token) => {
        content += token
        onToken?.(token)
      },
    })) {
      if (event.type === "tool_use") {
        toolCalls.push({ 
          id: event.id, 
          name: event.name, 
          input: event.input 
        })
      } else if (event.type === "done" && event.usage) {
        usage = event.usage
      }
    }
  } catch (error) {
    log.error("LLM call failed", { 
      error: error instanceof Error ? error.message : String(error) 
    })
    throw error
  }

  return { 
    content, 
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined, 
    usage 
  }
}
```

### 权限检查

```typescript
// src/agent/agent.ts (续)

/**
 * 检查工具调用权限
 */
private async checkPermission(
  toolName: string,
  input: Record<string, unknown>,
  callbacks: AgentCallbacks
): Promise<boolean> {
  const request: PermissionRequest = {
    tool: toolName,
    params: input,
    patterns: this.extractPatterns(toolName, input),
  }
  
  const action = this.config.permission.check(request)
  
  if (action === "deny") return false
  if (action === "allow") return true
  
  // 需要确认
  if (callbacks.onToolCall) {
    return callbacks.onToolCall(toolName, input)
  }
  
  return true
}

/**
 * 从工具参数中提取敏感模式
 */
private extractPatterns(tool: string, params: Record<string, unknown>): string[] | undefined {
  // 文件操作：提取路径
  if (["read", "write", "edit"].includes(tool) && params.path) {
    return [String(params.path)]
  }
  // Shell 命令：提取命令
  if (tool === "bash" && params.command) {
    return [String(params.command)]
  }
  return undefined
}
```

### 工具执行

```typescript
// src/agent/agent.ts (续)

/**
 * 执行工具
 */
private async executeTool(name: string, params: Record<string, unknown>) {
  const tool = toolRegistry.get(name)
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`)
  }
  
  // Zod 参数验证
  const validatedParams = tool.parameters.parse(params)
  
  // 执行工具
  return tool.execute(validatedParams, {
    sessionId: "default",
    messageId: "",
    workingDirectory: this.config.workingDirectory,
    abortSignal: new AbortController().signal,
  })
}
```

### 默认系统提示词

```typescript
// src/agent/agent.ts (续)

/**
 * 获取默认系统提示词
 */
private getDefaultSystemPrompt(): string {
  return `You are a helpful AI coding assistant with access to powerful tools.

## Available Tools

### File Operations
- read: Read file contents
- write: Write to files
- edit: Make precise edits to files
- glob: Find files by pattern

### Code Search
- grep: Search for patterns in files using regex

### Execution
- bash: Execute shell commands

### Parallel Execution
- batch: Execute multiple tools in parallel

### Multi-Agent Collaboration
- task: Delegate work to specialized subagents

### Skills
- skill: Load specialized domain knowledge

## Guidelines

- Always use absolute paths
- Be careful with destructive operations (write, edit, bash)
- Explain what you're doing before taking actions
- Use 'batch' tool for parallel file operations
- Use 'task' tool to delegate complex work to subagents`
}
```

## 状态流转图

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent State Machine                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌─────────┐                                              │
│    │  IDLE   │◀────────────────────────────────┐            │
│    └────┬────┘                                 │            │
│         │ sendMessage()                        │            │
│         ▼                                      │            │
│    ┌─────────┐                                 │            │
│    │ PENDING │                                 │            │
│    │ MESSAGE │                                 │            │
│    └────┬────┘                                 │            │
│         │ runLoop()                            │            │
│         ▼                                      │            │
│    ┌─────────┐     ┌─────────┐                │            │
│    │ CALLING │────▶│ PARSING │                │            │
│    │   LLM   │     │ RESPONSE │               │            │
│    └─────────┘     └────┬────┘                │            │
│                         │                      │            │
│              ┌──────────┴──────────┐          │            │
│              ▼                     ▼          │            │
│        ┌─────────┐          ┌─────────┐       │            │
│        │ EXECUTE │          │  DONE   │───────┘            │
│        │  TOOLS  │          │         │                    │
│        └────┬────┘          └─────────┘                    │
│             │                                              │
│             │ tool_results                                 │
│             │                                              │
│             └──────────────▶ [Continue Loop]               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 使用示例

```typescript
import { Agent } from './agent'
import { PermissionManager, DEFAULT_RULES } from './permission'

// 创建权限管理器
const permission = new PermissionManager(DEFAULT_RULES)

// 创建 Agent
const agent = new Agent({
  model: 'gpt-4o-mini',
  provider: 'openai',
  workingDirectory: '/Users/example/project',
  permission,
})

// 发送消息
const response = await agent.sendMessage(
  '帮我读取 package.json 并告诉我项目的依赖',
  {
    onEvent: (event) => {
      switch (event.type) {
        case 'text':
          process.stdout.write(event.content!)
          break
        case 'tool_use':
          console.log(`\n[Using tool: ${event.toolName}]`)
          break
        case 'tool_result':
          console.log(`\n[Tool result received]`)
          break
        case 'done':
          console.log('\n[Done]')
          break
      }
    },
    onToolCall: async (name, input) => {
      // 自定义权限确认
      console.log(`\nConfirm tool call: ${name}`)
      console.log(`Input:`, input)
      // 返回 true 允许，false 拒绝
      return true
    },
  }
)

// 获取统计信息
const state = agent.getState()
console.log(`Tokens: ${state.totalTokens.input} in / ${state.totalTokens.output} out`)
console.log(`Cost: $${state.totalCost.toFixed(6)}`)
```

## 错误处理

### 常见错误类型

```typescript
// 错误处理示例
try {
  const response = await agent.sendMessage(userInput, callbacks)
} catch (error) {
  if (error instanceof Error) {
    // API 错误
    if (error.message.includes('API key')) {
      console.error('Invalid API key')
    }
    // 速率限制
    else if (error.message.includes('rate limit')) {
      console.error('Rate limit exceeded, please wait')
    }
    // 模型错误
    else if (error.message.includes('model')) {
      console.error('Model not available')
    }
    // 工具错误
    else {
      console.error('Agent error:', error.message)
    }
  }
}
```

### 重试策略

```typescript
async function sendMessageWithRetry(
  agent: Agent,
  content: string,
  callbacks: AgentCallbacks,
  maxRetries = 3
): Promise<string> {
  let lastError: Error | null = null
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await agent.sendMessage(content, callbacks)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // 判断是否可重试
      if (isRetryableError(lastError)) {
        console.log(`Retry ${i + 1}/${maxRetries}...`)
        await sleep(1000 * (i + 1))  // 指数退避
        continue
      }
      throw lastError
    }
  }
  
  throw lastError
}

function isRetryableError(error: Error): boolean {
  const retryableMessages = ['rate limit', 'timeout', 'network', 'ECONNRESET']
  return retryableMessages.some(msg => 
    error.message.toLowerCase().includes(msg)
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

## 小结

本章实现了 Agent 的核心 ReAct 循环，包括：

1. **消息管理** - 维护对话历史和状态
2. **LLM 调用** - 流式响应处理和 Token 统计
3. **工具执行** - 权限检查和结果处理
4. **循环控制** - 最大迭代次数防止无限循环

**关键要点**：

- ReAct 模式是 Agent 的核心范式：思考 → 行动 → 观察
- 消息历史需要正确维护，包含工具调用和结果
- 流式响应提供更好的用户体验
- 权限检查是安全的关键环节

下一章我们将深入权限控制系统，实现更细粒度的权限管理。

## 参考资料

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [Anthropic Tool Use Guide](https://docs.anthropic.com/claude/docs/tool-use)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [AI Agent Design Patterns](https://www.deeplearning.ai/the-batch/how-to-build-an-ai-agent/)
