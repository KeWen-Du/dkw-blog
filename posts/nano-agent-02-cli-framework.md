---
title: "从零到一实现 nano-agent（二）：CLI 框架与配置管理"
date: "2024-10-20"
excerpt: "使用 yargs 构建命令行界面，实现配置管理、环境变量处理和多级配置优先级，为 AI 编程助手奠定基础。"
tags: ["AI", "CLI", "TypeScript", "yargs", "Node.js"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 2
---

# 从零到一实现 nano-agent（二）：CLI 框架搭建

## 前言

CLI（Command Line Interface）是 AI 编程助手与用户交互的入口。一个好的 CLI 框架需要支持多种命令、灵活的配置管理、清晰的帮助信息。本章将使用 yargs 构建 nano-agent 的命令行界面。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| yargs 命令定义 | ⭐⭐ | CLI 开发能力 | ✅ |
| 多级配置优先级 | ⭐⭐⭐ | 配置管理经验 | ✅ |
| 环境变量处理 | ⭐⭐ | 工程实践 | ✅ |
| 类型安全配置 | ⭐⭐⭐ | TypeScript 应用 | ✅ |

## 面试考点

1. 如何设计 CLI 应用的配置优先级？
2. yargs 的命令和选项如何定义？
3. 如何处理环境变量和配置文件的冲突？

## CLI 框架概述

### 为什么选择 yargs？

yargs 是 Node.js 生态中最成熟的 CLI 框架之一：

| 特性 | yargs | commander | oclif |
|------|-------|-----------|-------|
| 学习曲线 | 低 | 低 | 高 |
| 子命令支持 | ✅ | ✅ | ✅ |
| 自动生成帮助 | ✅ | ✅ | ✅ |
| 参数验证 | ✅ 强大 | ⭐ 基础 | ✅ |
| 生态成熟度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 适合项目 | 中小型 | 中小型 | 大型企业 |

### CLI 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Architecture                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Entry Point (cli.ts)                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Configuration Layer                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │ CLI Args │ │ Env Vars │ │ .env File│            │   │
│  │  │(Priority │ │(Priority │ │(Priority │            │   │
│  │  │    1)    │ │    2)    │ │    3)    │            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Command Router (yargs)                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │   run    │ │  models  │ │  version │            │   │
│  │  │ (default)│ │ (list)   │ │ (info)   │            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Application Layer                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │ Session  │ │   TUI    │ │  Logger  │            │   │
│  │  │ Manager  │ │   App    │ │  System  │            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 配置管理实现

### 配置接口定义

首先定义配置的类型：

```typescript
// src/config/config.ts

export interface Config {
  // LLM 配置
  provider: string      // 提供商: anthropic | openai | iflow
  model: string         // 模型名称
  
  // 运行时配置
  workingDirectory: string  // 工作目录
  logLevel: LogLevel        // 日志级别
  maxIterations: number     // 最大迭代次数
  
  // 可选配置
  systemPrompt?: string     // 自定义系统提示词
  temperature?: number      // 温度参数
  maxTokens?: number        // 最大输出 Token
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const DEFAULT_CONFIG: Config = {
  provider: 'iflow',
  model: 'iflow-rome-30ba3b',
  workingDirectory: process.cwd(),
  logLevel: 'info',
  maxIterations: 20,
}
```

### 多级配置优先级

配置按以下优先级从高到低加载：

```
优先级 1: 命令行参数    (最高)
    ↓
优先级 2: 系统环境变量
    ↓
优先级 3: .env 文件
    ↓
优先级 4: 代码默认值    (最低)
```

```typescript
// src/config/config.ts

import dotenv from 'dotenv'
import path from 'path'

// 加载 .env 文件（只加载一次）
dotenv.config()

export function loadConfig(overrides: Partial<Config> = {}): Config {
  return {
    // 优先级 4: 默认值
    ...DEFAULT_CONFIG,
    
    // 优先级 3: .env 文件（已通过 dotenv.config() 加载到 process.env）
    provider: process.env.NANO_AGENT_PROVIDER ?? DEFAULT_CONFIG.provider,
    model: process.env.NANO_AGENT_MODEL ?? DEFAULT_CONFIG.model,
    logLevel: (process.env.NANO_AGENT_LOG_LEVEL as LogLevel) ?? DEFAULT_CONFIG.logLevel,
    
    // 优先级 1: 命令行覆盖
    ...overrides,
    
    // 工作目录始终使用绝对路径
    workingDirectory: path.resolve(overrides.workingDirectory ?? process.cwd()),
  }
}
```

### 配置验证

```typescript
// src/config/config.ts

import z from 'zod'

const ConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'iflow']),
  model: z.string().min(1),
  workingDirectory: z.string(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  maxIterations: z.number().int().min(1).max(100),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
})

export function validateConfig(config: Config): Config {
  return ConfigSchema.parse(config)
}
```

## yargs CLI 实现

### 基础结构

```typescript
// src/cli.ts

import 'dotenv/config'  // 确保环境变量加载
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { render } from 'ink'
import React from 'react'
import { App } from './tui'
import { SessionManager } from './session'
import { initializeTools } from './tool'
import { registry } from './provider'
import { loadConfig, validateConfig } from './config/config'
import { Logger } from './util/logger'

// 初始化工具系统
initializeTools()

// 创建会话管理器
const sessionManager = new SessionManager()

const cli = yargs(hideBin(process.argv))
  .scriptName('nano-agent')
  .usage('$0 [options]')
  .strict()
  .help()
  .alias('help', 'h')
```

### 全局选项定义

```typescript
// src/cli.ts (续)

.option('model', {
  alias: 'm',
  type: 'string',
  description: 'Model to use',
  demandOption: false,
})
.option('provider', {
  alias: 'p',
  type: 'string',
  description: 'Provider to use',
  choices: ['anthropic', 'openai', 'iflow'],
  demandOption: false,
})
.option('directory', {
  alias: 'd',
  type: 'string',
  description: 'Working directory',
  demandOption: false,
})
.option('log-level', {
  type: 'string',
  choices: ['debug', 'info', 'warn', 'error'],
  description: 'Log level',
  demandOption: false,
})
```

### 默认命令（交互模式）

```typescript
// src/cli.ts (续)

.command(
  '$0',  // 默认命令
  'Start interactive session',
  () => {},  // 无额外 builder
  async (argv) => {
    // 加载配置（命令行参数优先）
    const config = validateConfig(loadConfig({
      provider: argv.provider,
      model: argv.model,
      workingDirectory: argv.directory,
      logLevel: argv['log-level'] as any,
    }))
    
    // 设置日志级别
    Logger.setLevel(config.logLevel)
    
    // 验证 Provider 和 Model
    const provider = registry.get(config.provider)
    if (!provider) {
      console.error(`Provider not found: ${config.provider}`)
      console.error(`Available providers: ${registry.listProviders().join(', ')}`)
      process.exit(1)
    }
    
    const model = provider.models.find(m => m.id === config.model)
    if (!model) {
      console.error(`Model not found: ${config.model}`)
      console.error(`Available models: ${provider.models.map(m => m.id).join(', ')}`)
      process.exit(1)
    }
    
    // 显示启动信息
    console.log(`Starting nano-agent...`)
    console.log(`Provider: ${provider.name}`)
    console.log(`Model: ${model.name}`)
    console.log(`Working Directory: ${config.workingDirectory}`)
    
    // 创建会话
    const session = sessionManager.create({
      model: config.model,
      provider: config.provider,
      workingDirectory: config.workingDirectory,
      systemPrompt: config.systemPrompt,
    })
    
    // 渲染 TUI
    const { waitUntilExit } = render(
      React.createElement(App, {
        session,
        workingDirectory: config.workingDirectory,
        model: model.name,
      })
    )
    
    await waitUntilExit()
  }
)
```

### models 命令

```typescript
// src/cli.ts (续)

.command(
  'models',
  'List available models',
  () => {},
  () => {
    console.log('Available models:\n')
    
    for (const providerName of registry.listProviders()) {
      const provider = registry.get(providerName)!
      console.log(`${provider.name}:`)
      
      for (const model of provider.models) {
        const contextInfo = `${(model.contextWindow / 1000).toFixed(0)}k context`
        const toolSupport = model.supportsTools ? '✓ tools' : '✗ tools'
        console.log(`  ${model.id.padEnd(20)} - ${model.name} (${contextInfo}, ${toolSupport})`)
      }
      console.log()
    }
  }
)
```

### version 命令

```typescript
// src/cli.ts (续)

.command(
  'version',
  'Show version',
  () => {},
  () => {
    const pkg = require('../package.json')
    console.log(`nano-agent v${pkg.version}`)
    console.log(`Node.js ${process.version}`)
    console.log(`Platform: ${process.platform} ${process.arch}`)
  }
)
```

### 解析入口

```typescript
// src/cli.ts (续)

.parse()
```

## 完整 CLI 实现

```typescript
// src/cli.ts - 完整代码

import 'dotenv/config'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { render } from 'ink'
import React from 'react'
import { App } from './tui'
import { SessionManager } from './session'
import { initializeTools } from './tool'
import { registry } from './provider'
import { loadConfig } from './config/config'
import { Logger } from './util/logger'

initializeTools()

const sessionManager = new SessionManager()
const config = loadConfig()

const cli = yargs(hideBin(process.argv))
  .scriptName('nano-agent')
  .usage('$0 [options]')
  .option('model', {
    alias: 'm',
    type: 'string',
    description: 'Model to use',
    default: config.model,
  })
  .option('provider', {
    alias: 'p',
    type: 'string',
    description: 'Provider to use',
    default: config.provider,
  })
  .option('directory', {
    alias: 'd',
    type: 'string',
    description: 'Working directory',
    default: process.cwd(),
  })
  .option('log-level', {
    type: 'string',
    choices: ['debug', 'info', 'warn', 'error'],
    description: 'Log level',
    default: config.logLevel,
  })
  .command(
    '$0',
    'Start interactive session',
    () => {},
    async (argv) => {
      const logLevel = argv['log-level'] as 'debug' | 'info' | 'warn' | 'error'
      Logger.setLevel(logLevel)

      const provider = registry.get(argv.provider)
      if (!provider) {
        console.error(`Provider not found: ${argv.provider}`)
        console.error(`Available providers: ${registry.listProviders().join(', ')}`)
        process.exit(1)
      }

      const model = provider.models.find(m => m.id === argv.model)
      if (!model) {
        console.error(`Model not found: ${argv.model}`)
        console.error(`Available models: ${provider.models.map(m => m.id).join(', ')}`)
        process.exit(1)
      }

      console.log(`Starting nano-agent...`)
      console.log(`Provider: ${provider.name}`)
      console.log(`Model: ${model.name}`)
      console.log(`Working Directory: ${argv.directory}`)

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
    }
  )
  .command(
    'models',
    'List available models',
    () => {},
    () => {
      console.log('Available models:')
      for (const provider of registry.listProviders()) {
        const p = registry.get(provider)!
        console.log(`\n${p.name}:`)
        for (const model of p.models) {
          console.log(`  ${model.id} - ${model.name}`)
        }
      }
    }
  )
  .command(
    'version',
    'Show version',
    () => {},
    () => {
      console.log('nano-agent v0.1.0')
    }
  )
  .help()
  .alias('help', 'h')
  .strict()
  .parse()
```

## 环境变量配置

### .env.example 模板

```env
# LLM 提供商: anthropic | openai | iflow
NANO_AGENT_PROVIDER=iflow

# 模型名称
NANO_AGENT_MODEL=iflow-rome-30ba3b

# 日志级别: debug | info | warn | error
NANO_AGENT_LOG_LEVEL=info

# API Keys (根据提供商配置)
# Anthropic
# ANTHROPIC_API_KEY=your_anthropic_key

# OpenAI
# OPENAI_API_KEY=your_openai_key

# iFlow
IFLOW_API_KEY=your_iflow_key
```

### 配置优先级示例

```bash
# 方式 1: 命令行参数（最高优先级）
npm run dev -- -m gpt-4o-mini -p openai

# 方式 2: 系统环境变量
export NANO_AGENT_MODEL=gpt-4o-mini
export OPENAI_API_KEY=your_key
npm run dev

# 方式 3: .env 文件
# 编辑 .env 后直接运行
npm run dev

# 方式 4: 使用默认值
npm run dev  # 使用 iflow-rome-30ba3b
```

## package.json 配置

```json
{
  "name": "nano-agent",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "nano-agent": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "dotenv": "^16.4.0",
    "ink": "^4.4.1",
    "react": "^18.2.0",
    "yargs": "^17.7.2",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/yargs": "^17.0.32",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

## 运行效果

### 帮助信息

```
$ nano-agent --help

nano-agent [options]

Options:
  -m, --model <string>     Model to use (default: "iflow-rome-30ba3b")
  -p, --provider <string>  Provider to use (choices: "anthropic", "openai",
                           "iflow", default: "iflow")
  -d, --directory <string> Working directory (default: current directory)
  --log-level <string>     Log level (choices: "debug", "info", "warn",
                           "error", default: "info")
  -h, --help               display help for command

Commands:
  models                   List available models
  version                  Show version
```

### 启动交互模式

```
$ nano-agent -m gpt-4o-mini -p openai

Starting nano-agent...
Provider: OpenAI
Model: GPT-4o Mini
Working Directory: /Users/example/project

┌─────────────────────────────────────────┐
│ nano-agent | GPT-4o Mini                │
└─────────────────────────────────────────┘

AI: Welcome to nano-agent! I can help you with:
- Reading and writing files
- Executing shell commands
- Searching code patterns
- And much more!

Type your message and press Enter to chat.
Press Ctrl+C to exit.

┌─────────────────────────────────────────┐
│ Type your message...                    │
└─────────────────────────────────────────┘

Tokens: 0 in / 0 out | Cost: $0.0000
```

### 列出可用模型

```
$ nano-agent models

Available models:

Anthropic:
  claude-sonnet-4-20250514 - Claude Sonnet 4
  claude-3-5-sonnet-20241022 - Claude 3.5 Sonnet
  claude-3-haiku-20240307 - Claude 3 Haiku

OpenAI:
  gpt-4o - GPT-4o
  gpt-4o-mini - GPT-4o Mini
  gpt-4-turbo - GPT-4 Turbo
  gpt-3.5-turbo - GPT-3.5 Turbo

iFlow:
  iflow-rome-30ba3b - iFlow Rome
```

## 小结

本章实现了 nano-agent 的 CLI 框架，包括：

1. **配置管理** - 多级优先级配置系统
2. **yargs 命令** - 交互模式、models、version 命令
3. **环境变量** - dotenv 集成和 API Key 管理

**关键要点**：

- 配置优先级：命令行 > 环境变量 > .env > 默认值
- yargs 提供了强大的命令解析和帮助生成
- 类型安全的配置验证确保运行时正确性

下一章我们将实现 Provider 系统，支持多种 LLM 提供商的统一接入。

## 参考资料

- [yargs Documentation](https://yargs.js.org/)
- [dotenv GitHub](https://github.com/motdotla/dotenv)
- [Zod Documentation](https://zod.dev/)
- [Node.js CLI Best Practices](https://github.com/lirantal/nodejs-cli-apps-best-practices)
