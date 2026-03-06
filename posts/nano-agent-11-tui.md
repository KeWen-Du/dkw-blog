---
title: "从零到一实现 nano-agent（十一）：TUI 界面"
date: "2025-01-26"
excerpt: "使用 Ink + React 构建交互式终端界面，实现消息显示、输入处理和实时流式输出，打造优秀的命令行体验。"
tags: ["AI", "TUI", "React", "Ink", "CLI"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 11
---

# 从零到一实现 nano-agent（十一）：TUI 终端界面

## 前言

终端用户界面（TUI）是 AI 编程助手与用户交互的窗口。一个好的 TUI 需要支持实时流式输出、清晰的对话历史和便捷的输入体验。本章将使用 Ink + React 构建交互式终端界面。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| React TUI 开发 | ⭐⭐⭐ | 前端能力扩展 | ✅ |
| Ink 框架 | ⭐⭐⭐ | 现代化 CLI | ✅ |
| 流式输出处理 | ⭐⭐⭐ | 实时更新 | ✅ |
| 键盘交互 | ⭐⭐ | 交互设计 | ✅ |

## 面试考点

1. 如何用 React 构建终端界面？
2. 如何实现流式输出的实时显示？
3. 如何处理键盘输入和快捷键？

## TUI 架构设计

### 组件结构

```
┌─────────────────────────────────────────────────────────────┐
│                        App                                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Header                            │   │
│  │  nano-agent | GPT-4o Mini                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Message List                       │   │
│  │                                                      │   │
│  │  You: 帮我读取 package.json                          │   │
│  │                                                      │   │
│  │  AI: 好的，我来读取...                               │   │
│  │  [Tool: read] Reading package.json...               │   │
│  │  文件内容如下：...                                    │   │
│  │                                                      │   │
│  │  ⠋ Processing...                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Input Box                          │   │
│  │  > Type your message..._                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Status Bar                         │   │
│  │  Tokens: 1500 in / 800 out | Cost: $0.0012          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 安装依赖

```bash
npm install ink ink-text-input ink-spinner react
npm install -D @types/react
```

## 主应用组件

```typescript
// src/tui/app.tsx

import React, { useState, useCallback, useEffect } from "react"
import { Box, Text, useApp, useInput } from "ink"
import TextInput from "ink-text-input"
import Spinner from "ink-spinner"
import { Session, SessionMetadata } from "../session"
import { AgentEvent } from "../agent"

/**
 * 消息类型
 */
interface Message {
  id: string
  role: "user" | "assistant" | "tool" | "error"
  content: string
  toolName?: string
}

/**
 * App 组件属性
 */
interface AppProps {
  session: Session
  workingDirectory: string
  model: string
}

/**
 * 主应用组件
 */
export function App({ session, workingDirectory, model }: AppProps) {
  const { exit } = useApp()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null)

  // 初始化欢迎消息
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Welcome to nano-agent!\n\nModel: ${model}\nWorking Directory: ${workingDirectory}\n\nType your message and press Enter to chat.\nPress Ctrl+C or Escape to exit.`,
      },
    ])
  }, [model, workingDirectory])

  /**
   * 处理 Agent 事件
   */
  const handleEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "text":
        // 文本输出 - 追加到最后一条消息
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === "assistant" && !last.toolName) {
            // 追加到最后一条消息
            return [...prev.slice(0, -1), { 
              ...last, 
              content: last.content + event.content 
            }]
          }
          // 创建新消息
          return [...prev, { 
            id: String(Date.now()), 
            role: "assistant", 
            content: event.content! 
          }]
        })
        break

      case "tool_use":
        // 工具调用
        setMessages(prev => [
          ...prev,
          { 
            id: String(Date.now()), 
            role: "tool", 
            content: `Using ${event.toolName}...`, 
            toolName: event.toolName 
          },
        ])
        break

      case "tool_result":
        // 工具结果
        setMessages(prev => [
          ...prev,
          { 
            id: String(Date.now()), 
            role: "tool", 
            content: event.toolResult?.slice(0, 200) + "...", 
            toolName: event.toolName 
          },
        ])
        break

      case "error":
        // 错误
        setMessages(prev => [
          ...prev,
          { 
            id: String(Date.now()), 
            role: "error", 
            content: `Error: ${event.error}` 
          },
        ])
        break

      case "done":
        // 完成
        setIsProcessing(false)
        setMetadata(session.getMetadata())
        break
    }
  }, [session])

  /**
   * 处理提交
   */
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return

    const userMessage = input.trim()
    setInput("")
    
    // 添加用户消息
    setMessages(prev => [
      ...prev,
      { id: String(Date.now()), role: "user", content: userMessage },
    ])
    
    setIsProcessing(true)

    try {
      await session.sendMessage(userMessage, {
        onEvent: handleEvent,
        onToolCall: async (name, params) => {
          // 工具确认（可以添加交互式确认）
          setMessages(prev => [
            ...prev,
            { 
              id: String(Date.now()), 
              role: "tool", 
              content: `Tool ${name} confirmed`, 
              toolName: name 
            },
          ])
          return true
        },
      })
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { 
          id: String(Date.now()), 
          role: "error", 
          content: `Error: ${error instanceof Error ? error.message : String(error)}` 
        },
      ])
      setIsProcessing(false)
    }
  }, [input, isProcessing, session, handleEvent])

  /**
   * 处理键盘输入
   */
  useInput((_, key) => {
    if (key.escape) {
      exit()
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">nano-agent</Text>
        <Text dimColor> | {model}</Text>
      </Box>

      {/* Message List */}
      <Box flexDirection="column" marginBottom={1} minHeight={10}>
        {messages.slice(-10).map(msg => (
          <Box key={msg.id} marginBottom={1} flexDirection="column">
            <Box>
              <Box width={10} justifyContent="flex-end" paddingRight={1}>
                {msg.role === "user" && <Text bold color="green">You:</Text>}
                {msg.role === "assistant" && <Text bold color="blue">AI:</Text>}
                {msg.role === "tool" && <Text bold color="yellow">Tool:</Text>}
                {msg.role === "error" && <Text bold color="red">Error:</Text>}
              </Box>
              <Box flexGrow={1}>
                <Text wrap="wrap" dimColor={msg.role === "tool"}>
                  {msg.content}
                </Text>
              </Box>
            </Box>
          </Box>
        ))}
        
        {/* Processing Indicator */}
        {isProcessing && (
          <Box>
            <Text dimColor>
              <Spinner type="dots" /> Processing...
            </Text>
          </Box>
        )}
      </Box>

      {/* Input Box */}
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

      {/* Status Bar */}
      {metadata && (
        <Box marginTop={1}>
          <Text dimColor>
            Tokens: {metadata.totalTokens.input} in / {metadata.totalTokens.output} out | 
            Cost: ${metadata.totalCost.toFixed(4)}
          </Text>
        </Box>
      )}
    </Box>
  )
}
```

## 消息组件

```typescript
// src/tui/components/MessageItem.tsx

import React from "react"
import { Box, Text } from "ink"

interface MessageItemProps {
  role: "user" | "assistant" | "tool" | "error"
  content: string
  toolName?: string
}

export function MessageItem({ role, content, toolName }: MessageItemProps) {
  const colors = {
    user: "green",
    assistant: "blue",
    tool: "yellow",
    error: "red",
  }

  const labels = {
    user: "You",
    assistant: "AI",
    tool: toolName || "Tool",
    error: "Error",
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Box width={12}>
          <Text bold color={colors[role]}>
            {labels[role]}:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text wrap="wrap" dimColor={role === "tool"}>
            {content}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
```

## 工具确认对话框

```typescript
// src/tui/components/ConfirmDialog.tsx

import React, { useState } from "react"
import { Box, Text } from "ink"
import TextInput from "ink-text-input"

interface ConfirmDialogProps {
  tool: string
  params: Record<string, unknown>
  onConfirm: (approved: boolean, remember?: boolean) => void
}

export function ConfirmDialog({ tool, params, onConfirm }: ConfirmDialogProps) {
  const [input, setInput] = useState("")

  const handleSubmit = () => {
    const lower = input.toLowerCase()
    if (lower === "y" || lower === "yes") {
      onConfirm(true)
    } else if (lower === "ya") {
      onConfirm(true, true)
    } else {
      onConfirm(false)
    }
  }

  // 简化参数显示
  const displayParams = JSON.stringify(params, null, 0)
  const truncatedParams = displayParams.length > 100 
    ? displayParams.slice(0, 100) + "..." 
    : displayParams

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Text bold color="yellow">Tool Permission Required</Text>
      <Text></Text>
      <Text>Tool: <Text bold>{tool}</Text></Text>
      <Text dimColor>Params: {truncatedParams}</Text>
      <Text></Text>
      <Text>Allow? (y = Yes, ya = Yes always, n = No)</Text>
      <TextInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        placeholder="y/n/ya"
      />
    </Box>
  )
}
```

## 进度显示组件

```typescript
// src/tui/components/ProgressBar.tsx

import React from "react"
import { Box, Text } from "ink"

interface ProgressBarProps {
  current: number
  total: number
  label?: string
  width?: number
}

export function ProgressBar({ 
  current, 
  total, 
  label = "Progress", 
  width = 30 
}: ProgressBarProps) {
  const percent = Math.min(current / total, 1)
  const filled = Math.round(width * percent)
  const empty = width - filled

  const bar = "█".repeat(filled) + "░".repeat(empty)

  return (
    <Box flexDirection="column">
      <Text>{label}: [{bar}] {Math.round(percent * 100)}%</Text>
      <Text dimColor>{current} / {total}</Text>
    </Box>
  )
}
```

## 渲染入口

```typescript
// src/tui/index.ts

export { App } from './app'
export { MessageItem } from './components/MessageItem'
export { ConfirmDialog } from './components/ConfirmDialog'
export { ProgressBar } from './components/ProgressBar'
```

## CLI 集成

```typescript
// src/cli.ts (部分)

import { render } from "ink"
import React from "react"
import { App } from "./tui"

// ... 解析命令行参数 ...

// 创建会话
const session = sessionManager.create({
  model: argv.model,
  provider: argv.provider,
  workingDirectory: argv.directory,
})

// 渲染 TUI
const { waitUntilExit } = render(
  React.createElement(App, {
    session,
    workingDirectory: argv.directory,
    model: model.name,
  })
)

// 等待退出
await waitUntilExit()
```

## 样式指南

### 颜色使用

```typescript
// 状态颜色
const STATUS_COLORS = {
  success: "green",
  warning: "yellow",
  error: "red",
  info: "blue",
  dim: "gray",
}

// 角色颜色
const ROLE_COLORS = {
  user: "green",
  assistant: "blue",
  tool: "yellow",
  error: "red",
  system: "magenta",
}
```

### 布局规范

```typescript
// 间距
const PADDING = 1
const MARGIN = 1

// 边框样式
const BORDER_STYLES = {
  header: "round",
  input: "single",
  dialog: "round",
}

// 宽度
const LABEL_WIDTH = 10
const MAX_CONTENT_WIDTH = 80
```

## 小结

本章实现了 TUI 终端界面，包括：

1. **主应用组件** - App 组件整合所有 UI
2. **消息显示** - 实时流式输出
3. **输入处理** - TextInput 组件
4. **工具确认** - 交互式对话框

**关键要点**：

- Ink 让 React 开发终端界面变得简单
- 流式输出需要正确处理状态更新
- 良好的颜色和布局提升用户体验
- 键盘交互增强控制能力

下一章我们将讨论生产级实践。

## 参考资料

- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [React Hooks](https://react.dev/reference/react)
- [Terminal Colors](https://gist.github.com/vratiu/9780109)
- [CLI Design Guidelines](https://clig.dev/)
