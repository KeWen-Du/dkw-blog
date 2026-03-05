---
title: "从零到一实现mini-opencode（二）：CLI框架搭建"
date: "2026-01-16"
excerpt: "搭建mini-opencode的CLI框架，实现命令行解析、配置管理和日志系统，为后续功能开发奠定基础。"
tags: ["AI", "LLM", "CLI", "TypeScript", "Bun"]
series:
  slug: "mini-opencode"
  title: "从零到一实现 mini-opencode"
  order: 2
---

# 从零到一实现mini-opencode（二）：CLI框架搭建

## 前言

上一章我们分析了OpenCode的整体架构并设计了mini-opencode的技术选型。本章将从CLI框架开始，搭建项目的基础骨架，包括命令行解析、配置管理和日志系统。

## 项目初始化

### 创建项目

使用Bun初始化项目：

```bash
mkdir mini-opencode
cd mini-opencode
bun init
```

配置`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 安装依赖

```bash
# CLI框架
bun add yargs
bun add -D @types/yargs

# 参数验证
bun add zod

# 日志
bun add picocolors
```

## CLI入口设计

### 命令结构

mini-opencode支持以下命令：

| 命令 | 功能 | 示例 |
|------|------|------|
| (默认) | 启动交互式会话 | `mini-opencode` |
| models | 列出可用模型 | `mini-opencode models` |
| version | 显示版本 | `mini-opencode version` |

支持的选项：

| 选项 | 说明 | 默认值 |
|------|------|--------|
| -m, --model | 指定模型 | deepseek-chat |
| -p, --provider | 指定Provider | iflow |
| -d, --directory | 工作目录 | 当前目录 |
| --log-level | 日志级别 | info |

### 入口实现

`src/cli.ts`：

```typescript
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { render } from "ink"
import React from "react"
import { App } from "./tui"
import { SessionManager } from "./session"
import { initializeTools } from "./tool"
import { registry } from "./provider"
import { loadConfig } from "./config/config"
import { Logger } from "./util/logger"

// 初始化工具
initializeTools()

const sessionManager = new SessionManager()

const cli = yargs(hideBin(process.argv))
  .scriptName("mini-opencode")
  .usage("$0 [options]")
  .option("model", {
    alias: "m",
    type: "string",
    description: "Model to use",
    default: "deepseek-chat",
  })
  .option("provider", {
    alias: "p",
    type: "string",
    description: "Provider to use",
    default: "iflow",
  })
  .option("directory", {
    alias: "d",
    type: "string",
    description: "Working directory",
    default: process.cwd(),
  })
  .option("log-level", {
    type: "string",
    choices: ["debug", "info", "warn", "error"],
    description: "Log level",
    default: "info",
  })
  .command(
    "$0",
    "Start interactive session",
    () => {},
    async (argv) => {
      const logLevel = argv["log-level"] as "debug" | "info" | "warn" | "error"
      Logger.setLevel(logLevel)

      const provider = registry.get(argv.provider)
      if (!provider) {
        console.error(`Provider not found: ${argv.provider}`)
        console.error(`Available providers: ${registry.listProviders().join(", ")}`)
        process.exit(1)
      }

      const model = provider.models.find(m => m.id === argv.model)
      if (!model) {
        console.error(`Model not found: ${argv.model}`)
        console.error(`Available models: ${provider.models.map(m => m.id).join(", ")}`)
        process.exit(1)
      }

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
    "models",
    "List available models",
    () => {},
    () => {
      console.log("Available models:")
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
    "version",
    "Show version",
    () => {},
    () => {
      console.log("mini-opencode v0.1.0")
    }
  )
  .help()
  .alias("help", "h")
  .strict()
  .parse()
```

### Run命令实现

`src/cli/commands/run.ts`：

```typescript
import { CommandModule } from "yargs"
import z from "zod"
import { Session } from "@/session/session"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Logger } from "@/util/logger"
import { REPL } from "../repl"

const log = Logger.create({ service: "run-command" })

const Options = z.object({
  model: z.string().optional(),
  provider: z.string().optional(),
  prompt: z.string().optional(),
})

type Options = z.infer<typeof Options>

export const RunCommand: CommandModule<{}, Options> = {
  command: "run [prompt]",
  describe: "Start an interactive coding session",
  builder: {
    model: {
      type: "string",
      description: "Model to use (e.g., deepseek-chat, claude-sonnet-4)",
    },
    provider: {
      type: "string",
      description: "Provider to use (e.g., iflow, anthropic, openai)",
    },
    prompt: {
      type: "string",
      description: "Initial prompt to send",
    },
  },
  handler: async (argv) => {
    const options = Options.parse(argv)
    log.info("Starting session", { options })

    // 加载配置
    const config = await Config.load()
    
    // 确定使用的模型
    const model = options.model ?? config.defaultModel ?? "deepseek-chat"
    const provider = options.provider ?? config.defaultProvider ?? "iflow"

    // 创建会话
    const session = await Session.create({
      model,
      provider,
    })

    // 启动REPL
    const repl = new REPL(session)
    
    if (options.prompt) {
      // 如果提供了初始prompt，直接执行
      await repl.execute(options.prompt)
    }
    
    // 进入交互模式
    await repl.start()
  },
}
```

## 配置管理系统

### 配置文件结构

OpenCode使用JSON配置文件，我们采用类似设计：

```typescript
// src/config/config.ts
import z from "zod"
import { existsSync } from "fs"
import { readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

export const ConfigSchema = z.object({
  // 默认模型配置
  defaultModel: z.string().optional(),
  defaultProvider: z.string().optional(),
  
  // Provider配置
  providers: z.record(z.string(), z.object({
    apiKey: z.string().optional(),
    baseURL: z.string().optional(),
    models: z.array(z.string()).optional(),
  })).optional(),
  
  // 权限配置
  permissions: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    ask: z.array(z.string()).optional(),
  }).optional(),
  
  // Agent配置
  agent: z.object({
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
  }).optional(),
})

export type Config = z.infer<typeof ConfigSchema>

export namespace Config {
  const CONFIG_DIR = join(homedir(), ".mini-opencode")
  const CONFIG_FILE = join(CONFIG_DIR, "config.json")

  let cached: Config | null = null

  export async function load(): Promise<Config> {
    if (cached) return cached

    // 确保配置目录存在
    if (!existsSync(CONFIG_DIR)) {
      Bun.write(CONFIG_DIR, "")
    }

    // 读取或创建配置文件
    if (!existsSync(CONFIG_FILE)) {
      const defaultConfig: Config = {
        defaultProvider: "iflow",
        defaultModel: "deepseek-chat",
      }
      await save(defaultConfig)
      cached = defaultConfig
      return defaultConfig
    }

    const content = readFileSync(CONFIG_FILE, "utf-8")
    const parsed = JSON.parse(content)
    cached = ConfigSchema.parse(parsed)
    return cached
  }

  export async function save(config: Config): Promise<void> {
    const content = JSON.stringify(config, null, 2)
    writeFileSync(CONFIG_FILE, content, "utf-8")
    cached = config
  }

  export async function get<K extends keyof Config>(
    key: K
  ): Promise<Config[K] | undefined> {
    const config = await load()
    return config[key]
  }

  export async function set<K extends keyof Config>(
    key: K,
    value: Config[K]
  ): Promise<void> {
    const config = await load()
    config[key] = value
    await save(config)
  }
}
```

### 环境变量支持

除了配置文件，还支持环境变量：

```typescript
// src/config/env.ts
export namespace Env {
  export function get(key: string): string | undefined {
    return process.env[key]
  }

  export function getRequired(key: string): string {
    const value = get(key)
    if (!value) {
      throw new Error(`Environment variable ${key} is required`)
    }
    return value
  }

  // Provider API Key映射
  export const API_KEYS: Record<string, string> = {
    iflow: "IFLOW_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  }

  export function getApiKey(provider: string): string | undefined {
    const envKey = API_KEYS[provider]
    return envKey ? get(envKey) : undefined
  }
}
```

## 日志系统

### 日志设计

OpenCode的日志系统支持多级别、文件输出和结构化日志：

```typescript
// src/util/logger.ts
import pc from "picocolors"
import { writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

export type LogLevel = "debug" | "info" | "warn" | "error"

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  service?: string
  message: string
  data?: Record<string, any>
}

export class Logger {
  private static level: LogLevel = "info"
  private static logDir = join(homedir(), ".mini-opencode", "logs")
  private service?: string

  static setLevel(level: LogLevel) {
    Logger.level = level
  }

  static create(options: { service?: string } = {}): Logger {
    return new Logger(options.service)
  }

  constructor(service?: string) {
    this.service = service
    
    // 确保日志目录存在
    if (!existsSync(Logger.logDir)) {
      mkdirSync(Logger.logDir, { recursive: true })
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString()
  }

  private formatLevel(level: LogLevel): string {
    const colors = {
      debug: pc.gray,
      info: pc.blue,
      warn: pc.yellow,
      error: pc.red,
    }
    return colors[level](level.toUpperCase().padEnd(5))
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[Logger.level]
  }

  private write(entry: LogEntry): void {
    // 控制台输出
    const prefix = this.service ? `[${this.service}]` : ""
    const formatted = `${pc.gray(entry.timestamp)} ${this.formatLevel(entry.level)} ${prefix} ${entry.message}`
    
    if (entry.data) {
      console.log(formatted, entry.data)
    } else {
      console.log(formatted)
    }

    // 文件输出
    const logFile = join(Logger.logDir, `mini-opencode-${new Date().toISOString().split('T')[0]}.log`)
    const logLine = JSON.stringify(entry) + "\n"
    writeFileSync(logFile, logLine, { flag: "a" })
  }

  debug(message: string, data?: Record<string, any>): void {
    if (!this.shouldLog("debug")) return
    this.write({
      timestamp: this.formatTimestamp(),
      level: "debug",
      service: this.service,
      message,
      data,
    })
  }

  info(message: string, data?: Record<string, any>): void {
    if (!this.shouldLog("info")) return
    this.write({
      timestamp: this.formatTimestamp(),
      level: "info",
      service: this.service,
      message,
      data,
    })
  }

  warn(message: string, data?: Record<string, any>): void {
    if (!this.shouldLog("warn")) return
    this.write({
      timestamp: this.formatTimestamp(),
      level: "warn",
      service: this.service,
      message,
      data,
    })
  }

  error(message: string, data?: Record<string, any>): void {
    if (!this.shouldLog("error")) return
    this.write({
      timestamp: this.formatTimestamp(),
      level: "error",
      service: this.service,
      message,
      data,
    })
  }
}

// 默认logger
export const log = Logger.create()
```

### 日志使用示例

```typescript
import { Logger } from "@/util/logger"

const log = Logger.create({ service: "agent" })

log.debug("Processing message", { messageId: "123" })
log.info("Session started", { sessionId: "abc" })
log.warn("Rate limit approaching", { remaining: 10 })
log.error("Failed to call tool", { tool: "bash", error: "timeout" })
```

## REPL交互

### 简化版REPL实现

```typescript
// src/cli/repl.ts
import * as readline from "readline"
import { Session } from "@/session/session"
import { Logger } from "@/util/logger"

const log = Logger.create({ service: "repl" })

export class REPL {
  private rl: readline.Interface
  private running = false

  constructor(private session: Session) {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "> ",
    })
  }

  async start(): Promise<void> {
    this.running = true
    console.log("Mini OpenCode - AI Coding Assistant")
    console.log("Type your message and press Enter. Use Ctrl+C to exit.\n")

    this.rl.prompt()

    for await (const line of this.rl) {
      const input = line.trim()
      
      if (input === "exit" || input === "quit") {
        this.stop()
        break
      }

      if (input) {
        await this.execute(input)
      }

      this.rl.prompt()
    }
  }

  async execute(input: string): Promise<void> {
    try {
      log.info("User input", { input })
      
      // 显示思考状态
      process.stdout.write("Thinking...\r")
      
      // 调用Agent处理
      const response = await this.session.sendMessage(input)
      
      // 清除思考状态并显示响应
      process.stdout.write("\x1b[2K")  // 清除整行
      console.log(`\n${response}\n`)
      
    } catch (error) {
      log.error("Execution failed", { error: String(error) })
      console.error(`Error: ${error}`)
    }
  }

  stop(): void {
    this.running = false
    this.rl.close()
    console.log("\nGoodbye!")
  }
}
```

## Auth命令实现

```typescript
// src/cli/commands/auth.ts
import { CommandModule } from "yargs"
import * as readline from "readline"
import { Config } from "@/config/config"
import { Env } from "@/config/env"

const PROVIDERS = ["iflow", "anthropic", "openai"] as const

type Provider = typeof PROVIDERS[number]

interface Options {
  provider?: Provider
  list?: boolean
}

export const AuthCommand: CommandModule<{}, Options> = {
  command: "auth [provider]",
  describe: "Manage API keys for providers",
  builder: {
    provider: {
      type: "string",
      choices: PROVIDERS,
      description: "Provider to configure",
    },
    list: {
      type: "boolean",
      description: "List configured providers",
      default: false,
    },
  },
  handler: async (argv) => {
    if (argv.list) {
      console.log("Configured providers:\n")
      for (const provider of PROVIDERS) {
        const envKey = Env.API_KEYS[provider]
        const hasKey = !!process.env[envKey]
        const status = hasKey ? "✓ (via env)" : "✗"
        console.log(`  ${provider}: ${status}`)
      }
      return
    }

    if (!argv.provider) {
      console.log("Please specify a provider: iflow, anthropic, openai")
      return
    }

    const provider = argv.provider
    const envKey = Env.API_KEYS[provider]
    
    // 交互式输入API Key
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const apiKey = await new Promise<string>((resolve) => {
      rl.question(`Enter API key for ${provider}: `, (key) => {
        rl.close()
        resolve(key.trim())
      })
    })

    if (!apiKey) {
      console.log("No API key provided, cancelled.")
      return
    }

    // 保存到配置
    const config = await Config.load()
    config.providers = config.providers ?? {}
    config.providers[provider] = {
      ...config.providers[provider],
      apiKey,
    }
    await Config.save(config)

    console.log(`API key saved for ${provider}`)
    console.log(`Tip: You can also set ${envKey} environment variable`)
  },
}
```

## Config命令实现

```typescript
// src/cli/commands/config.ts
import { CommandModule } from "yargs"
import { Config } from "@/config/config"

type Options = {
  list?: boolean
  set?: string[]
  get?: string
}

export const ConfigCommand: CommandModule<{}, Options> = {
  command: "config",
  describe: "Manage configuration",
  builder: {
    list: {
      type: "boolean",
      description: "List all configuration",
      default: false,
    },
    set: {
      type: "array",
      description: "Set configuration value (key value)",
    },
    get: {
      type: "string",
      description: "Get configuration value",
    },
  },
  handler: async (argv) => {
    if (argv.list) {
      const config = await Config.load()
      console.log(JSON.stringify(config, null, 2))
      return
    }

    if (argv.get) {
      const value = await Config.get(argv.get as keyof typeof Config)
      console.log(value ?? "(not set)")
      return
    }

    if (argv.set && argv.set.length >= 2) {
      const [key, ...valueParts] = argv.set
      const value = valueParts.join(" ")
      
      // 解析值类型
      let parsedValue: any = value
      if (value === "true") parsedValue = true
      else if (value === "false") parsedValue = false
      else if (!isNaN(Number(value))) parsedValue = Number(value)
      
      await Config.set(key as any, parsedValue)
      console.log(`Set ${key} = ${JSON.stringify(parsedValue)}`)
      return
    }

    console.log("Use --list, --get <key>, or --set <key> <value>")
  },
}
```

## 运行测试

```bash
# 安装依赖
bun install

# 开发模式运行
bun run src/index.ts --help

# 认证配置
bun run src/index.ts auth iflow

# 查看配置
bun run src/index.ts config --list

# 设置默认模型
bun run src/index.ts config --set defaultModel deepseek-chat
```

## 小结

本章我们完成了mini-opencode的CLI框架搭建：

1. **CLI入口** - 使用yargs构建命令行界面
2. **配置管理** - JSON配置文件 + 环境变量支持
3. **日志系统** - 多级别日志、文件输出
4. **REPL交互** - 简化的交互式界面
5. **Auth/Config命令** - 认证和配置管理

下一章我们将实现LLM Provider系统，集成iFlow、Anthropic和OpenAI。

## 完整代码

项目代码将在系列结束后统一开源。关键实现细节已在文中展示，读者可自行尝试实现。
