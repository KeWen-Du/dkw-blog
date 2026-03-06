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
