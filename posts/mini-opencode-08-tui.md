---
title: "从零到一实现mini-opencode（八）：TUI界面开发"
date: "2026-03-03 16:00:00"
excerpt: "实现mini-opencode的TUI（终端用户界面），使用ink和React构建交互式终端应用，提供友好的用户体验。"
tags: ["AI", "LLM", "TUI", "React", "Terminal"]
---

# 从零到一实现mini-opencode（八）：TUI界面开发

## 前言

好的用户体验是产品成功的关键。本章将使用ink框架（React for CLI）构建mini-opencode的终端用户界面，实现实时消息流、工具调用可视化和交互式输入。

## 技术选型

### 为什么选择ink

ink是React的终端渲染器，具有以下优势：

| 特性 | 说明 |
|------|------|
| React范式 | 熟悉的组件化开发 |
| 声明式UI | 状态驱动渲染 |
| Hooks支持 | 完整的React Hooks生态 |
| Flex布局 | CSS Flexbox子集 |

### 安装依赖

```bash
bun add ink ink-text-input ink-spinner ink-markdown
bun add react
bun add -D @types/react
```

## 基础组件

### 应用入口

```tsx
// src/tui/app.tsx
import React, { useState, useCallback, useEffect } from "react"
import { Box, Text, useApp, useInput } from "ink"
import { Session, SessionMetadata } from "@/session"
import { AgentEvent } from "@/agent"
import TextInput from "ink-text-input"
import Spinner from "ink-spinner"

interface Message {
  id: string
  role: "user" | "assistant" | "tool" | "error"
  content: string
  toolName?: string
}

interface AppProps {
  session: Session
  workingDirectory: string
  model: string
}

export function App({ session, workingDirectory, model }: AppProps) {
  const { exit } = useApp()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null)

  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Welcome to mini-opencode!\nModel: ${model}\nWorking Directory: ${workingDirectory}\n\nType your message and press Enter to chat.\nPress Ctrl+C to exit.`,
      },
    ])
  }, [])

  const handleEvent = useCallback((event: AgentEvent) => {
    if (event.type === "text" && event.content) {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === "assistant" && !last.toolName) {
          return [...prev.slice(0, -1), { ...last, content: last.content + event.content }]
        }
        return [...prev, { id: String(Date.now()), role: "assistant", content: event.content }]
      })
    } else if (event.type === "tool_use") {
      setMessages(prev => [
        ...prev,
        { id: String(Date.now()), role: "tool", content: `Using ${event.toolName}...`, toolName: event.toolName },
      ])
    } else if (event.type === "error") {
      setMessages(prev => [
        ...prev,
        { id: String(Date.now()), role: "error", content: `Error: ${event.error}` },
      ])
    } else if (event.type === "done") {
      setIsProcessing(false)
      setMetadata(session.getMetadata())
    }
  }, [session])

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return

    const userMessage = input.trim()
    setInput("")
    setMessages(prev => [
      ...prev,
      { id: String(Date.now()), role: "user", content: userMessage },
    ])
    setIsProcessing(true)

    try {
      await session.sendMessage(userMessage, {
        onEvent: handleEvent,
        onToolCall: async (name, _params) => {
          setMessages(prev => [
            ...prev,
            { id: String(Date.now()), role: "tool", content: `Tool ${name} requested`, toolName: name },
          ])
          return true
        },
      })
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { id: String(Date.now()), role: "error", content: `Error: ${error instanceof Error ? error.message : String(error)}` },
      ])
      setIsProcessing(false)
    }
  }, [input, isProcessing, session, handleEvent])

  useInput((_, key) => {
    if (key.escape) {
      exit()
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">mini-opencode</Text>
        <Text dimColor> | {model}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.slice(-10).map(msg => (
          <Box key={msg.id} marginBottom={1}>
            <Box width={10} justifyContent="flex-end" paddingRight={1}>
              {msg.role === "user" && <Text bold color="green">You:</Text>}
              {msg.role === "assistant" && <Text bold color="blue">AI:</Text>}
              {msg.role === "tool" && <Text bold color="yellow">Tool:</Text>}
              {msg.role === "error" && <Text bold color="red">Error:</Text>}
            </Box>
            <Box flexGrow={1}>
              <Text wrap="wrap" dimColor={msg.role === "tool"}>{msg.content}</Text>
            </Box>
          </Box>
        ))}
        {isProcessing && (
          <Box>
            <Text dimColor><Spinner type="dots" /> Processing...</Text>
          </Box>
        )}
      </Box>

      <Box borderStyle="single" borderColor="gray" marginTop={1}>
        <Box flexGrow={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type your message..."
          />
        </Box>
      </Box>

      {metadata && (
        <Box marginTop={1}>
          <Text dimColor>Tokens: {metadata.totalTokens.input} in / {metadata.totalTokens.output} out | Cost: ${metadata.totalCost.toFixed(4)}</Text>
        </Box>
      )}
    </Box>
  )
}
```

### 消息列表组件

```tsx
// src/tui/message-list.tsx
import React from "react"
import { Box, Text } from "ink"
import { Message } from "./app"

interface MessageListProps {
  messages: Message[]
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </Box>
  )
}

function MessageItem({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={isUser ? "green" : "blue"}>
          {isUser ? "You" : "Assistant"}
        </Text>
        <Text dimColor>:</Text>
      </Box>
      
      <Box paddingLeft={2}>
        <Text>{message.content}</Text>
      </Box>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box paddingLeft={2} flexDirection="column">
          {message.toolCalls.map((tc, i) => (
            <ToolCallDisplay key={i} {...tc} />
          ))}
        </Box>
      )}
    </Box>
  )
}
```

### 工具调用显示

```tsx
// src/tui/tool-call-display.tsx
import React from "react"
import { Box, Text } from "ink"
import Spinner from "ink-spinner"

interface ToolCallDisplayProps {
  name: string
  status: "pending" | "running" | "done" | "error"
  output?: string
}

export function ToolCallDisplay({ name, status, output }: ToolCallDisplayProps) {
  const statusIcon = {
    pending: "○",
    running: <Spinner type="dots" />,
    done: "✓",
    error: "✗",
  }

  const statusColor = {
    pending: "gray",
    running: "yellow",
    done: "green",
    error: "red",
  }

  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color={statusColor[status]}>
          {status === "running" ? statusIcon.running : statusIcon[status]}
        </Text>
        <Text> </Text>
        <Text dimColor>Tool:</Text>
        <Text> {name}</Text>
      </Box>
      
      {output && (
        <Box paddingLeft={3}>
          <Text dimColor dimWrap>
            {output.slice(0, 200)}
            {output.length > 200 ? "..." : ""}
          </Text>
        </Box>
      )}
    </Box>
  )
}
```

### 输入组件

```tsx
// src/tui/input-area.tsx
import React from "react"
import { Box, Text } from "ink"
import TextInput from "ink-text-input"

interface InputAreaProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  disabled?: boolean
}

export function InputArea({ value, onChange, onSubmit, disabled }: InputAreaProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">
        {">"}
      </Text>
      <Box marginLeft={1}>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={disabled ? "Processing..." : "Type your message..."}
          showCursor={!disabled}
        />
      </Box>
    </Box>
  )
}
```

### 状态栏组件

```tsx
// src/tui/status-bar.tsx
import React from "react"
import { Box, Text } from "ink"
import Spinner from "ink-spinner"
import { Agent } from "@/agent/agent"

interface StatusBarProps {
  isProcessing: boolean
  agent: Agent
}

export function StatusBar({ isProcessing, agent }: StatusBarProps) {
  const state = agent.getState()
  const totalTokens = state.totalTokens.input + state.totalTokens.output

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box>
        {isProcessing ? (
          <>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text> Processing...</Text>
          </>
        ) : (
          <Text dimColor>Ready</Text>
        )}
      </Box>
      
      <Box>
        <Text dimColor>
          Tokens: {totalTokens.toLocaleString()} | Cost: ${state.totalCost.toFixed(4)}
        </Text>
      </Box>
    </Box>
  )
}
```

## 启动TUI

```typescript
// src/cli.ts
import React from "react"
import { render } from "ink"
import { App } from "./tui"
import { SessionManager } from "./session"
import { registry } from "./provider"
import { initializeTools } from "./tool"
import { Logger } from "./util/logger"

initializeTools()

const sessionManager = new SessionManager()

// 在yargs命令处理器中
const session = sessionManager.create({
  model: argv.model,
  provider: argv.provider,
  workingDirectory: argv.directory,
})

const { waitUntilExit } = render(
  React.createElement(App, {
    session,
    workingDirectory: argv.directory,
    model: model.name,
  })
)

await waitUntilExit()
```

## 运行效果

```
┌─────────────────────────────────────────────────────────────┐
│ mini-opencode - AI Coding Assistant                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ You:                                                        │
│   Read the package.json file                                │
│                                                             │
│ Assistant:                                                  │
│   I'll read the package.json file for you.                  │
│                                                             │
│   ● Tool: read                                              │
│     Reading package.json...                                 │
│                                                             │
│   The package.json contains:                                │
│   - name: "my-project"                                      │
│   - version: "1.0.0"                                        │
│   - dependencies: react, typescript                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Ready                              Tokens: 1,234 | Cost: $0.02│
├─────────────────────────────────────────────────────────────┤
│ > _                                                         │
└─────────────────────────────────────────────────────────────┘
```

## 小结

本章我们实现了mini-opencode的TUI界面：

1. **ink框架** - React范式开发终端UI
2. **消息组件** - 用户和助手消息展示
3. **工具调用可视化** - 实时显示工具执行状态
4. **输入组件** - 交互式文本输入
5. **状态栏** - 显示Token使用和成本

下一章我们将讨论生产部署与优化。

## 参考资料

- [ink文档](https://github.com/vadimdemedes/ink)
- [ink-text-input](https://github.com/vadimdemedes/ink-text-input)
- [ink-spinner](https://github.com/vadimdemedes/ink-spinner)
