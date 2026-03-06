---
title: "从零到一实现 nano-agent（三）：Provider 抽象与多模型支持"
date: "2024-11-02"
excerpt: "实现多 LLM 提供商的统一接入，支持流式响应、工具调用和成本计算，构建 Provider 抽象层和注册表。"
tags: ["AI", "LLM", "TypeScript", "OpenAI", "Claude"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 3
---

# 从零到一实现 nano-agent（三）：Provider 系统

## 前言

Provider 系统是 AI Agent 与大语言模型交互的桥梁。不同的 LLM 提供商（Anthropic、OpenAI、国产大模型等）有不同的 API 设计，我们需要设计一个统一的抽象层，让上层代码无需关心底层差异。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Provider 抽象设计 | ⭐⭐⭐ | 接口设计能力 | ✅ |
| 流式响应处理 | ⭐⭐⭐⭐ | 异步编程能力 | ✅ |
| 工具调用适配 | ⭐⭐⭐⭐ | API 设计能力 | ✅ |
| 成本计算模型 | ⭐⭐⭐ | 工程实践 | ✅ |

## 面试考点

1. 如何设计 Provider 抽象层？
2. 流式响应如何处理？AsyncIterable 如何实现？
3. 不同 LLM 的工具调用格式如何统一？

## 设计思路：为什么需要 Provider 抽象层？

### 问题背景

当我们开发 AI Agent 时，面临一个核心挑战：**不同的 LLM 提供商 API 差异巨大**。

```
┌─────────────────────────────────────────────────────────────────────┐
│                    不同 Provider 的 API 差异                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Anthropic Claude:                                                   │
│  - 消息格式: { role, content: [{ type, text }] }                    │
│  - 工具调用: content 中 type: "tool_use"                            │
│  - 流式事件: message_start, content_block_delta, message_stop      │
│                                                                      │
│  OpenAI GPT:                                                         │
│  - 消息格式: { role, content: string }                              │
│  - 工具调用: separate tool_calls 数组                               │
│  - 流式事件: choices[{ delta: { content, tool_calls } }]           │
│                                                                      │
│  如果没有抽象层，Agent 代码需要这样写：                              │
│                                                                      │
│  if provider === "anthropic":                                        │
│      // 处理 Claude 特有格式...                                      │
│  elif provider === "openai":                                         │
│      // 处理 OpenAI 特有格式...                                      │
│  elif provider === "custom":                                         │
│      // 处理自定义格式...                                            │
│                                                                      │
│  问题：每次新增 Provider 都要修改 Agent 核心代码！                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 解决思路：统一抽象

**核心思想**：定义一套统一的接口，让不同 Provider 的差异在各自的适配器中消化。

```
不使用抽象层：
┌─────────┐     ┌──────────────────────────────────────┐
│  Agent  │────▶│ if-else 处理不同 Provider 的差异      │
└─────────┘     │ 代码耦合，难以维护                     │
                └──────────────────────────────────────┘

使用抽象层：
┌─────────┐     ┌─────────────┐     ┌──────────────────┐
│  Agent  │────▶│   Provider  │────▶│ AnthropicAdapter │
│         │     │   Interface │     ├──────────────────┤
│ 统一调用│     │   (统一)    │────▶│ OpenAIAdapter    │
└─────────┘     └─────────────┘     ├──────────────────┤
                                    │ CustomAdapter    │
                                    └──────────────────┘
```

**这样做的好处**：
1. Agent 代码与具体 Provider 解耦
2. 新增 Provider 只需实现适配器
3. 可以在不修改 Agent 的情况下切换 Provider

### 为什么选择 AsyncIterable 处理流式响应？

**方案对比**：

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| Callback 回调 | 简单直接 | 回调地狱，难以组合 | 简单场景 |
| Promise + 轮询 | 兼容性好 | 效率低，延迟高 | 不推荐 |
| **AsyncIterable** | 可组合、可中断、原生支持 | 需要 async/await | **推荐** |
| EventEmitter | Node.js 风格 | 不够类型安全 | Node.js 环境 |

**选择 AsyncIterable 的原因**：

```typescript
// Callback 方式：难以组合
api.chat({ onToken: (token) => { ... } })

// AsyncIterable 方式：可组合
for await (const event of provider.chatStream()) {
    if (event.type === "text") {
        yield event.text
    }
}

// 可以轻松组合其他操作
async function* processStream() {
    for await (const event of provider.chatStream()) {
        yield transform(event)  // 转换
        if (shouldStop()) break  // 中断
    }
}
```

## 方案对比：Provider 设计模式

### 方案一：直接调用 SDK

```typescript
// 最简单的实现，直接在 Agent 中调用 SDK
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    messages: [...],
})
```

**优点**：简单直接，无需额外抽象  
**缺点**：Agent 与 Provider 强耦合，难以切换  
**结论**：仅适用于单 Provider 项目

### 方案二：Provider 抽象层（本文方案）

```typescript
// 定义统一接口
interface Provider {
    chat(options: ChatOptions): Promise<ChatResponse>
    chatStream(options: ChatOptions): AsyncIterable<StreamEvent>
}

// Agent 只依赖接口
const response = await provider.chat({ model, messages })
```

**优点**：解耦、可扩展、可测试  
**缺点**：需要额外抽象层代码  
**结论**：**推荐用于生产环境**

### 方案三：LangChain 模式

```typescript
// LangChain 的 BaseChatModel 抽象
import { ChatAnthropic } from "@langchain/anthropic"
import { ChatOpenAI } from "@langchain/openai"

const model = new ChatAnthropic()  // 或 new ChatOpenAI()
const response = await model.invoke(messages)
```

**优点**：生态完整，开箱即用  
**缺点**：依赖重、定制性差、黑盒多  
**结论**：适合快速开发，不适合深度定制

### 最终选择

nano-agent 选择**方案二**，原因：
1. 代码量可控（约 500 行）
2. 完全可控，便于学习和定制
3. 支持流式响应和工具调用
4. 易于添加新的 Provider

## 常见陷阱与解决方案

### 陷阱一：流式响应中的工具调用参数不完整

**问题描述**：
```
LLM 返回工具调用时，参数可能分多个 chunk 传输：
Chunk 1: { tool_calls: [{ id: "1", function: { name: "read" } }] }
Chunk 2: { tool_calls: [{ function: { arguments: "{\"path" } }] }
Chunk 3: { tool_calls: [{ function: { arguments: "\": \"/src\"}" } }] }

如果直接解析每个 chunk，会报 JSON 解析错误！
```

**解决方案**：累积 arguments 后再解析

```typescript
let currentToolCall: { id: string; name: string; arguments: string } | null = null

for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    
    if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
            if (tc.function?.name) {
                // 新工具调用开始
                currentToolCall = {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: "",
                }
            } else if (currentToolCall && tc.function?.arguments) {
                // 追加参数
                currentToolCall.arguments += tc.function.arguments
            }
        }
    }
}

// 循环结束后解析完整参数
const input = JSON.parse(currentToolCall.arguments)
```

### 陷阱二：不同 Provider 的 Token 统计方式不同

**问题描述**：
- OpenAI: `usage.prompt_tokens`, `usage.completion_tokens`
- Anthropic: `usage.input_tokens`, `usage.output_tokens`

**解决方案**：统一字段命名

```typescript
interface Usage {
    inputTokens: number   // 统一使用 inputTokens
    outputTokens: number  // 统一使用 outputTokens
}

// OpenAI 适配器
return {
    usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
    }
}

// Anthropic 适配器
return {
    usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
    }
}
```

### 陷阱三：忘记处理流式响应中的错误

**问题描述**：流式响应中可能中途出错，但代码没有处理

**解决方案**：使用 try-finally 确保资源释放

```typescript
async function* safeStream() {
    const stream = provider.chatStream(options)
    
    try {
        for await (const event of stream) {
            yield event
        }
    } catch (error) {
        // 记录错误并重新抛出
        logger.error("Stream error", { error })
        throw error
    } finally {
        // 确保清理资源
        logger.info("Stream completed")
    }
}
```

### 陷阱四：成本计算缺少精度

**问题描述**：直接使用浮点数计算成本，精度丢失

**解决方案**：使用整数计算，最后转换

```typescript
// 错误：浮点数精度问题
const cost = (inputTokens / 1000) * 0.003  // 可能丢失精度

// 正确：使用整数计算
const costInMicros = (inputTokens * 3000) / 1000  // 微美元
const cost = costInMicros / 1000000  // 转换为美元
```

## Provider 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Layer                              │
│                    (调用 Provider)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 统一接口
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Provider Registry                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ get(providerId) → Provider                          │   │
│  │ listProviders() → string[]                          │   │
│  │ register(provider) → void                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ Anthropic   │       │   OpenAI    │       │   iFlow     │
│ Provider    │       │  Provider   │       │  Provider   │
│             │       │             │       │             │
│ Claude API  │       │  GPT API    │       │  REST API   │
└─────────────┘       └─────────────┘       └─────────────┘
```

### 核心接口定义

```typescript
// src/provider/provider.ts

import z from "zod"

/**
 * 模型信息
 */
export interface Model {
  id: string           // 模型标识符
  name: string         // 显示名称
  provider: string     // 所属 Provider
  contextWindow: number  // 上下文窗口大小
  maxOutput: number    // 最大输出 Token
  supportsTools: boolean  // 是否支持工具调用
  supportsVision: boolean // 是否支持图像输入
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string | ContentBlock[]
}

/**
 * 内容块 - 支持多模态和工具调用
 */
export type ContentBlock = 
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>  // JSON Schema
}

/**
 * 聊天请求选项
 */
export interface ChatOptions {
  model: string
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  system?: string
  maxTokens?: number
  temperature?: number
  onToken?: (token: string) => void  // 流式输出回调
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    input: Record<string, unknown>
  }>
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * 流式事件
 */
export type StreamEvent = 
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number } }

/**
 * Provider 接口
 */
export interface Provider {
  id: string           // Provider 标识符
  name: string         // 显示名称
  models: Model[]      // 支持的模型列表
  
  // 同步调用
  chat(options: ChatOptions): Promise<ChatResponse>
  
  // 流式调用 - 核心方法
  chatStream(options: ChatOptions): AsyncIterable<StreamEvent>
}
```

### 模型成本计算

```typescript
// src/provider/provider.ts

/**
 * 各模型的定价（美元/千Token）
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  
  // OpenAI
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  
  // iFlow
  'iflow-rome-30ba3b': { input: 0.001, output: 0.002 },
}

/**
 * 计算调用成本
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[modelId]
  if (!pricing) return 0
  
  const inputCost = (inputTokens / 1000) * pricing.input
  const outputCost = (outputTokens / 1000) * pricing.output
  
  return inputCost + outputCost
}
```

## Provider 注册表

```typescript
// src/provider/registry.ts

import type { Provider } from './provider'

class ProviderRegistry {
  private providers = new Map<string, Provider>()
  
  /**
   * 注册 Provider
   */
  register(provider: Provider): void {
    this.providers.set(provider.id, provider)
  }
  
  /**
   * 获取 Provider
   */
  get(id: string): Provider | undefined {
    return this.providers.get(id)
  }
  
  /**
   * 列出所有 Provider ID
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys())
  }
  
  /**
   * 获取所有模型
   */
  listAllModels(): Array<{ provider: string; model: string; name: string }> {
    const result: Array<{ provider: string; model: string; name: string }> = []
    
    for (const [providerId, provider] of this.providers) {
      for (const model of provider.models) {
        result.push({
          provider: providerId,
          model: model.id,
          name: model.name,
        })
      }
    }
    
    return result
  }
}

// 单例实例
export const registry = new ProviderRegistry()
```

## OpenAI Provider 实现

### 模型定义

```typescript
// src/provider/openai.ts

import OpenAI from "openai"
import { Provider, Model, ChatOptions, ChatResponse, StreamEvent, ChatMessage } from "./provider"

const OPENAI_MODELS: Model[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    contextWindow: 128000,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    contextWindow: 128000,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    contextWindow: 128000,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "openai",
    contextWindow: 16385,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: false,
  },
]
```

### OpenAI Provider 类

```typescript
// src/provider/openai.ts (续)

export class OpenAIProvider implements Provider {
  id = "openai"
  name = "OpenAI"
  models = OPENAI_MODELS

  private getClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required")
    }
    return new OpenAI({ apiKey })
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const client = this.getClient()
    
    const response = await client.chat.completions.create({
      model: options.model,
      messages: this.convertMessages(options.messages, options.system),
      tools: options.tools?.map(t => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
    })

    const choice = response.choices[0]
    const toolCalls = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    return {
      content: choice.message.content ?? "",
      toolCalls,
      usage: response.usage
        ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
        : undefined,
    }
  }

  async *chatStream(options: ChatOptions): AsyncIterable<StreamEvent> {
    const client = this.getClient()
    
    const stream = await client.chat.completions.create({
      model: options.model,
      messages: this.convertMessages(options.messages, options.system),
      tools: options.tools?.map(t => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
      stream: true,
    })

    let inputTokens = 0
    let outputTokens = 0
    let currentToolCall: { id: string; name: string; arguments: string } | null = null

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      
      // 处理文本内容
      if (delta?.content) {
        options.onToken?.(delta.content)
        yield { type: "text", text: delta.content }
      }
      
      // 处理工具调用
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            // 新的工具调用开始
            currentToolCall = {
              id: tc.id ?? "",
              name: tc.function.name,
              arguments: tc.function.arguments ?? "",
            }
          } else if (currentToolCall && tc.function?.arguments) {
            // 追加参数
            currentToolCall.arguments += tc.function.arguments
          }
          
          // 如果 ID 存在且有名称，发出事件
          if (tc.id && tc.function?.name) {
            yield {
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments ?? "{}"),
            }
          }
        }
      }
      
      // 处理 usage
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
    }

    yield { type: "done", usage: { inputTokens, outputTokens } }
  }

  /**
   * 转换消息格式为 OpenAI 格式
   */
  private convertMessages(
    messages: ChatMessage[],
    system?: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = []
    
    if (system) {
      result.push({ role: "system", content: system })
    }

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        result.push({
          role: msg.role === "system" ? "user" : msg.role,
          content: msg.content,
        })
      } else {
        // 处理多模态内容
        result.push({
          role: msg.role === "system" ? "user" : msg.role,
          content: msg.content.map(block => {
            if (block.type === "text") {
              return { type: "text" as const, text: block.text }
            }
            if (block.type === "image") {
              return {
                type: "image_url" as const,
                image_url: {
                  url: `data:${block.source.media_type};base64,${block.source.data}`,
                },
              }
            }
            return { type: "text" as const, text: "" }
          }),
        })
      }
    }

    return result
  }
}
```

## Anthropic Provider 实现

```typescript
// src/provider/anthropic.ts

import Anthropic from "@anthropic-ai/sdk"
import { Provider, Model, ChatOptions, ChatResponse, StreamEvent, ChatMessage, ContentBlock } from "./provider"

const ANTHROPIC_MODELS: Model[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutput: 16000,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutput: 8192,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: true,
  },
]

export class AnthropicProvider implements Provider {
  id = "anthropic"
  name = "Anthropic"
  models = ANTHROPIC_MODELS

  private getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required")
    }
    return new Anthropic({ apiKey })
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const client = this.getClient()
    
    const response = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.system,
      messages: this.convertMessages(options.messages),
      tools: options.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    })

    const textContent = response.content.find(c => c.type === "text")
    const toolUseContent = response.content.filter(c => c.type === "tool_use")

    return {
      content: textContent ? (textContent as any).text : "",
      toolCalls: toolUseContent.map(tc => ({
        id: (tc as any).id,
        name: (tc as any).name,
        input: (tc as any).input,
      })),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }

  async *chatStream(options: ChatOptions): AsyncIterable<StreamEvent> {
    const client = this.getClient()
    
    const stream = client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.system,
      messages: this.convertMessages(options.messages),
      tools: options.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    })

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const text = event.delta.text
        options.onToken?.(text)
        yield { type: "text", text }
      }
      
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        yield {
          type: "tool_use",
          id: event.content_block.id,
          name: event.content_block.name,
          input: event.content_block.input,
        }
      }
    }

    const finalMessage = await stream.finalMessage()
    yield {
      type: "done",
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      },
    }
  }

  private convertMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
    return messages.map(msg => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: msg.content }
      }
      
      return {
        role: msg.role,
        content: msg.content.map(block => {
          if (block.type === "text") {
            return { type: "text" as const, text: block.text }
          }
          if (block.type === "image") {
            return {
              type: "image" as const,
              source: {
                type: "base64",
                media_type: block.source.media_type,
                data: block.source.data,
              },
            }
          }
          if (block.type === "tool_use") {
            return {
              type: "tool_use" as const,
              id: block.id,
              name: block.name,
              input: block.input,
            }
          }
          if (block.type === "tool_result") {
            return {
              type: "tool_result" as const,
              tool_use_id: block.tool_use_id,
              content: block.content,
              is_error: block.is_error,
            }
          }
          return { type: "text" as const, text: "" }
        }),
      }
    })
  }
}
```

## Provider 初始化

```typescript
// src/provider/index.ts

import { registry } from './registry'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { IFlowProvider } from './iflow'

// 导出类型
export * from './provider'

// 注册所有 Provider
registry.register(new AnthropicProvider())
registry.register(new OpenAIProvider())
registry.register(new IFlowProvider())

export { registry }
```

## 流式响应处理详解

### AsyncIterable 模式

```typescript
// 使用 for await...of 处理流式响应
async function handleStream(provider: Provider, options: ChatOptions) {
  let fullContent = ""
  let toolCalls: Array<{ id: string; name: string; input: any }> = []
  let usage: { inputTokens: number; outputTokens: number } | undefined

  for await (const event of provider.chatStream(options)) {
    switch (event.type) {
      case "text":
        fullContent += event.text
        // 实时输出
        process.stdout.write(event.text)
        break
        
      case "tool_use":
        toolCalls.push({
          id: event.id,
          name: event.name,
          input: event.input,
        })
        console.log(`\n[Tool: ${event.name}]`)
        break
        
      case "done":
        usage = event.usage
        break
    }
  }

  return { content: fullContent, toolCalls, usage }
}
```

### 流式响应的挑战

```
┌─────────────────────────────────────────────────────────────┐
│                    流式响应处理流程                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LLM API ─────────▶ Chunk 1 ────▶ Chunk 2 ────▶ Chunk 3    │
│                         │            │            │         │
│                         ▼            ▼            ▼         │
│                    ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│                    │ delta:  │ │ delta:  │ │ delta:  │     │
│                    │"Hello"  │ │" World" │ │ [DONE]  │     │
│                    └────┬────┘ └────┬────┘ └────┬────┘     │
│                         │            │            │         │
│                         ▼            ▼            ▼         │
│                    累积文本: "Hello World"                   │
│                                                             │
│  工具调用特殊处理:                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Chunk 1: tool_calls[{id: "1", function: {name:...}}]│   │
│  │ Chunk 2: tool_calls[{arguments: "{\"path\":"}]      │   │
│  │ Chunk 3: tool_calls[{arguments: "\"test\"}"}]       │   │
│  │                                                      │   │
│  │ 需要累积 arguments 后再解析 JSON                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 成本计算实践

```typescript
// 使用示例
import { calculateCost } from './provider'

// 一次调用后的统计
const usage = {
  inputTokens: 1500,
  outputTokens: 800,
}

const cost = calculateCost('gpt-4o-mini', usage.inputTokens, usage.outputTokens)
console.log(`Cost: $${cost.toFixed(6)}`)  // Cost: $0.000705
```

### 成本优化建议

| 策略 | 描述 | 预期节省 |
|------|------|----------|
| 使用更便宜的模型 | 简单任务用 GPT-4o-mini | 90%+ |
| 上下文压缩 | 压缩历史消息 | 30-50% |
| 缓存 | 缓存重复请求 | 视情况 |
| 批量处理 | 合并多个小请求 | 20-30% |

## 小结

本章实现了 Provider 系统，包括：

1. **统一接口** - Provider 接口定义，支持同步和流式调用
2. **多 Provider 支持** - OpenAI、Anthropic 适配实现
3. **流式响应** - AsyncIterable 模式处理流式输出
4. **成本计算** - 基于 Token 使用量计算调用成本

**关键要点**：

- Provider 接口屏蔽了不同 LLM 的 API 差异
- 流式响应用 AsyncIterable 处理，支持实时输出
- 工具调用需要处理参数的分块传输
- 成本计算帮助用户了解 API 消耗

下一章我们将实现工具系统，包括工具接口定义、参数验证和工具注册表。

## 参考资料

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic API Reference](https://docs.anthropic.com/claude/reference)
- [AsyncIterable - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncIterable)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
