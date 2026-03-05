---
title: "从零到一实现mini-opencode（三）：LLM Provider集成"
date: "2026-01-17"
excerpt: "实现mini-opencode的LLM Provider系统，集成Anthropic和OpenAI，支持流式响应和工具调用。"
tags: ["AI", "LLM", "TypeScript", "Anthropic", "OpenAI"]
series:
  slug: "mini-opencode"
  title: "从零到一实现 mini-opencode"
  order: 3
---

# 从零到一实现mini-opencode（三）：LLM Provider集成

## 前言

上一章我们搭建了CLI框架，本章将实现LLM Provider系统，这是AI编程助手的核心能力。我们将集成Anthropic和OpenAI两大主流Provider，实现统一的API调用、流式响应和工具调用支持。

## Provider架构设计

### 核心接口

OpenCode的Provider系统设计非常精妙，支持多种LLM的统一封装。我们简化后的接口如下：

```typescript
// src/provider/provider.ts
import z from "zod"

export const ModelSchema = z.object({
  id: string                    // 模型ID
  name: string                  // 显示名称
  provider: string              // Provider ID
  contextWindow: number         // 上下文窗口大小
  maxOutput: number             // 最大输出token
  supportsTools: boolean        // 是否支持工具调用
  supportsVision: boolean       // 是否支持视觉
})

export type Model = z.infer<typeof ModelSchema>

export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string | ContentBlock[]
}

export type ContentBlock = 
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, any>  // JSON Schema
}

export interface ChatOptions {
  model: string
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  system?: string
  maxTokens?: number
  temperature?: number
  onToken?: (token: string) => void
}

export interface ChatResponse {
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    input: Record<string, any>
  }>
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export interface Provider {
  id: string
  name: string
  models: Model[]
  
  chat(options: ChatOptions): Promise<ChatResponse>
  chatStream(options: ChatOptions): AsyncIterable<StreamEvent>
}

export type StreamEvent = 
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number } }
```

### Provider注册表

```typescript
// src/provider/registry.ts
import { Provider } from "./provider"

class ProviderRegistry {
  private providers = new Map<string, Provider>()

  register(provider: Provider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id)
  }

  list(): Provider[] {
    return Array.from(this.providers.values())
  }

  getModel(providerId: string, modelId: string): Model | undefined {
    const provider = this.get(providerId)
    return provider?.models.find(m => m.id === modelId)
  }
}

export const registry = new ProviderRegistry()
```

## Anthropic Provider实现

### 安装依赖

```bash
bun add @anthropic-ai/sdk
```

### 实现代码

```typescript
// src/provider/anthropic.ts
import Anthropic from "@anthropic-ai/sdk"
import { Provider, Model, ChatOptions, ChatResponse, StreamEvent } from "./provider"

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

  private client: Anthropic

  constructor(apiKey?: string) {
    const key = apiKey ?? Env.getApiKey("anthropic")
    if (!key) {
      throw new Error("Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable.")
    }
    this.client = new Anthropic({ apiKey: key })
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: options.model,
      messages: this.convertMessages(options.messages),
      system: options.system,
      max_tokens: options.maxTokens ?? 4096,
      tools: options.tools?.map(this.convertTool),
    })

    return this.convertResponse(response)
  }

  async *chatStream(options: ChatOptions): AsyncIterable<StreamEvent> {
    const stream = this.client.messages.stream({
      model: options.model,
      messages: this.convertMessages(options.messages),
      system: options.system,
      max_tokens: options.maxTokens ?? 4096,
      tools: options.tools?.map(this.convertTool),
    })

    for await (const event of stream) {
      const converted = this.convertStreamEvent(event)
      if (converted) {
        yield converted
        // 回调处理
        if (converted.type === "text" && options.onToken) {
          options.onToken(converted.text)
        }
      }
    }
  }

  private convertMessages(messages: ChatOptions["messages"]): Anthropic.MessageParam[] {
    return messages.map(msg => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: msg.content }
      }
      return { role: msg.role, content: msg.content as Anthropic.ContentBlock[] }
    })
  }

  private convertTool(tool: ToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool["input_schema"],
    }
  }

  private convertResponse(response: Anthropic.Message): ChatResponse {
    let content = ""
    const toolCalls: ChatResponse["toolCalls"] = []

    for (const block of response.content) {
      if (block.type === "text") {
        content += block.text
      } else if (block.type === "tool_use") {
        toolCalls?.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, any>,
        })
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }

  private convertStreamEvent(event: Anthropic.MessageStreamEvent): StreamEvent | null {
    switch (event.type) {
      case "content_block_delta":
        if (event.delta.type === "text_delta") {
          return { type: "text", text: event.delta.text }
        }
        return null

      case "content_block_start":
        if (event.content_block.type === "tool_use") {
          return {
            type: "tool_use",
            id: event.content_block.id,
            name: event.content_block.name,
            input: {},
          }
        }
        return null

      case "message_stop":
        return { type: "done" }

      default:
        return null
    }
  }
}
```

## OpenAI Provider实现

### 安装依赖

```bash
bun add openai
```

### 实现代码

```typescript
// src/provider/openai.ts
import OpenAI from "openai"
import { Provider, Model, ChatOptions, ChatResponse, StreamEvent } from "./provider"

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
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "openai",
    contextWindow: 16385,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: false,
  },
]

export class OpenAIProvider implements Provider {
  id = "openai"
  name = "OpenAI"
  models = OPENAI_MODELS

  private client: OpenAI

  constructor(apiKey?: string) {
    const key = apiKey ?? Env.getApiKey("openai")
    if (!key) {
      throw new Error("OpenAI API key not found. Set OPENAI_API_KEY environment variable.")
    }
    this.client = new OpenAI({ apiKey: key })
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: this.convertMessages(options.messages, options.system),
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      tools: options.tools?.map(this.convertTool),
    })

    return this.convertResponse(response)
  }

  async *chatStream(options: ChatOptions): AsyncIterable<StreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages: this.convertMessages(options.messages, options.system),
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      tools: options.tools?.map(this.convertTool),
      stream: true,
    })

    for await (const chunk of stream) {
      const converted = this.convertStreamChunk(chunk)
      if (converted) {
        yield converted
        if (converted.type === "text" && options.onToken) {
          options.onToken(converted.text)
        }
      }
    }

    yield { type: "done" }
  }

  private convertMessages(
    messages: ChatOptions["messages"],
    system?: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = []

    if (system) {
      result.push({ role: "system", content: system })
    }

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        result.push({ role: msg.role, content: msg.content })
      } else {
        // 处理多模态内容
        const content = msg.content.map(block => {
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
          return null
        }).filter(Boolean)

        result.push({ role: msg.role, content: content as any })
      }
    }

    return result
  }

  private convertTool(tool: ToolDefinition): OpenAI.ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }
  }

  private convertResponse(response: OpenAI.ChatCompletion): ChatResponse {
    const choice = response.choices[0]
    const message = choice.message

    return {
      content: message.content ?? "",
      toolCalls: message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      })),
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      } : undefined,
    }
  }

  private convertStreamChunk(chunk: OpenAI.ChatCompletionChunk): StreamEvent | null {
    const delta = chunk.choices[0]?.delta
    if (!delta) return null

    if (delta.content) {
      return { type: "text", text: delta.content }
    }

    if (delta.tool_calls) {
      const tc = delta.tool_calls[0]
      if (tc) {
        return {
          type: "tool_use",
          id: tc.id ?? "",
          name: tc.function?.name ?? "",
          input: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
        }
      }
    }

    return null
  }
}
```

## iFlow Provider实现

iFlow 是一个支持多种开源模型的 Provider，包括 DeepSeek 系列模型。

```typescript
// src/provider/iflow.ts
import OpenAI from "openai"
import { Provider, Model, ChatOptions, ChatResponse, StreamEvent, ChatMessage } from "./provider"

const IFLOW_BASE_URL = "https://apis.iflow.cn/v1"

const IFLOW_MODELS: Model[] = [
  {
    id: "TBStars2-200B-A13B",
    name: "TBStars2-200B-A13B",
    provider: "iflow",
    contextWindow: 128000,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "iflow",
    contextWindow: 64000,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    provider: "iflow",
    contextWindow: 64000,
    maxOutput: 4096,
    supportsTools: true,
    supportsVision: false,
  },
]

export class iFlowProvider implements Provider {
  id = "iflow"
  name = "iFlow"
  models = IFLOW_MODELS

  private getClient(): OpenAI {
    const apiKey = process.env.IFLOW_API_KEY
    if (!apiKey) {
      throw new Error("IFLOW_API_KEY environment variable is required")
    }
    return new OpenAI({
      baseURL: IFLOW_BASE_URL,
      apiKey,
    })
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
      max_tokens: options.maxTokens,
      temperature: options.temperature,
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
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      })),
      stream: true,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    })

    let inputTokens = 0
    let outputTokens = 0

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (delta?.content) {
        options.onToken?.(delta.content)
        yield { type: "text", text: delta.content }
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            yield {
              type: "tool_use",
              id: tc.id ?? "",
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments ?? "{}"),
            }
          }
        }
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
    }

    yield { type: "done", usage: { inputTokens, outputTokens } }
  }

  private convertMessages(messages: ChatMessage[], system?: string): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = []
    if (system) result.push({ role: "system", content: system })
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        result.push({ role: msg.role, content: msg.content })
      } else {
        result.push({
          role: msg.role,
          content: msg.content.map(block => {
            if (block.type === "text") return { type: "text" as const, text: block.text }
            return { type: "text" as const, text: "" }
          }),
        })
      }
    }
    return result
  }
}
```

> **提示**：iFlow 使用 OpenAI 兼容的 API 格式，因此可以复用 OpenAI SDK。这是国产模型服务的常见做法。

## Provider初始化

```typescript
// src/provider/index.ts
import { registry } from "./registry"
import { AnthropicProvider } from "./anthropic"
import { OpenAIProvider } from "./openai"
import { iFlowProvider } from "./iflow"

export function initializeProviders(): void {
  // 注册Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    registry.register(new AnthropicProvider())
  }

  // 注册OpenAI
  if (process.env.OPENAI_API_KEY) {
    registry.register(new OpenAIProvider())
  }

  // 注册iFlow（默认Provider）
  if (process.env.IFLOW_API_KEY) {
    registry.register(new iFlowProvider())
  }
}

export { registry }
export * from "./provider"
```

> **注意**：mini-opencode 默认使用 `iflow` provider 和 `deepseek-chat` 模型。确保设置 `IFLOW_API_KEY` 环境变量。
```

## 使用示例

### 基础聊天

```typescript
import { registry, initializeProviders } from "@/provider"

async function main() {
  await initializeProviders()
  
  const provider = registry.get("anthropic")
  if (!provider) throw new Error("Anthropic provider not available")

  const response = await provider.chat({
    model: "claude-3-opus",
    messages: [
      { role: "user", content: "Hello, Claude!" }
    ],
  })

  console.log(response.content)
}
```

### 流式响应

```typescript
async function streamChat() {
  const provider = registry.get("anthropic")!
  
  for await (const event of provider.chatStream({
    model: "claude-3-opus",
    messages: [{ role: "user", content: "Tell me a story" }],
    onToken: (token) => process.stdout.write(token),
  })) {
    if (event.type === "done") {
      console.log("\n[completed]")
    }
  }
}
```

### 工具调用

```typescript
async function toolCall() {
  const provider = registry.get("anthropic")!
  
  const response = await provider.chat({
    model: "claude-3-opus",
    messages: [
      { role: "user", content: "What's the weather in Tokyo?" }
    ],
    tools: [
      {
        name: "get_weather",
        description: "Get the current weather in a location",
        input_schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and country, e.g., Tokyo, Japan",
            },
          },
          required: ["location"],
        },
      },
    ],
  })

  if (response.toolCalls) {
    for (const call of response.toolCalls) {
      console.log(`Tool: ${call.name}`)
      console.log(`Input: ${JSON.stringify(call.input)}`)
    }
  }
}
```

## 错误处理

### 统一错误类型

```typescript
// src/provider/error.ts
export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

export class RateLimitError extends ProviderError {
  constructor(provider: string, public retryAfter?: number) {
    super("Rate limit exceeded", provider, "RATE_LIMIT", 429)
    this.name = "RateLimitError"
  }
}

export class ModelNotFoundError extends ProviderError {
  constructor(provider: string, model: string) {
    super(`Model ${model} not found`, provider, "MODEL_NOT_FOUND", 404)
    this.name = "ModelNotFoundError"
  }
}

export class AuthenticationError extends ProviderError {
  constructor(provider: string) {
    super("Authentication failed", provider, "AUTH_ERROR", 401)
    this.name = "AuthenticationError"
  }
}
```

### 重试机制

```typescript
// src/provider/retry.ts
import { ProviderError, RateLimitError } from "./error"

interface RetryOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000 } = options
  
  let lastError: Error | undefined
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      // 不可重试的错误
      if (error instanceof AuthenticationError) {
        throw error
      }
      
      // 速率限制
      if (error instanceof RateLimitError) {
        const delay = error.retryAfter ?? baseDelay * Math.pow(2, attempt)
        await sleep(Math.min(delay, maxDelay))
        continue
      }
      
      // 其他错误，指数退避重试
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt)
        await sleep(Math.min(delay, maxDelay))
      }
    }
  }
  
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

## 成本计算

```typescript
// src/provider/registry.ts
import { Provider, Model } from "./provider"

// 价格（每百万token）
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
}

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[modelId]
  if (!pricing) return 0

  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output

  return inputCost + outputCost
}
```

## 小结

本章我们实现了mini-opencode的Provider系统：

1. **Provider接口** - 统一的API定义
2. **Anthropic Provider** - Claude系列模型支持
3. **OpenAI Provider** - GPT系列模型支持
4. **流式响应** - 实时token输出
5. **工具调用** - Function Calling支持
6. **错误处理** - 重试机制和错误类型
7. **成本计算** - Token使用统计

下一章我们将实现Tool系统，让AI能够与文件系统和shell交互。

## 参考资料

- [Anthropic API文档](https://docs.anthropic.com/)
- [OpenAI API文档](https://platform.openai.com/docs/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
