---
title: "从零到一实现mini-opencode（一）：项目概述与架构设计"
date: "2026-03-03 09:00:00"
excerpt: "深入分析OpenCode源代码架构，设计mini-opencode项目的技术选型和核心模块，为构建AI编程助手奠定基础。"
tags: ["AI", "LLM", "CLI", "TypeScript", "开源项目"]
---

# 从零到一实现mini-opencode（一）：项目概述与架构设计

## 前言

在AI辅助编程领域，Claude Code、Cursor、GitHub Copilot等工具已经深入人心。OpenCode作为一款开源的AI Coding Agent，提供了完整的终端编程助手解决方案。本系列将从零开始，逐步实现一个mini版本的opencode，深入理解AI编程助手的核心原理。

## OpenCode是什么？

OpenCode是一款开源的AI Coding Agent，具有以下特点：

- **100%开源** - 完全透明的代码实现
- **Provider无关** - 支持Anthropic、OpenAI、Google等多种LLM
- **内置LSP支持** - 智能代码补全和诊断
- **终端优先** - 专为终端用户设计的TUI界面
- **MCP协议** - 支持Model Context Protocol扩展

## 核心架构分析

通过分析OpenCode源代码，我们将其架构抽象为以下核心模块：

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Entry                            │
│                    (yargs command parser)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Agent     │  │   Session   │  │   Config    │        │
│  │   System    │  │   Manager   │  │   System    │        │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘        │
│         │                │                                  │
│         ▼                ▼                                  │
│  ┌─────────────────────────────────────────────────┐       │
│  │                  Tool System                     │       │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │       │
│  │  │bash │ │read │ │write│ │edit │ │glob │ ...   │       │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │       │
│  └─────────────────────────────────────────────────┘       │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────┐       │
│  │               Provider System                    │       │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │       │
│  │  │Anthropic │ │  OpenAI  │ │  iFlow   │        │       │
│  │  └──────────┘ └──────────┘ └──────────┘        │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    Session Storage                          │
│                    (Memory Map)                             │
└─────────────────────────────────────────────────────────────┘
```

### 1. CLI入口层

OpenCode使用yargs构建命令行界面，支持多种命令：

```typescript
// 核心命令结构
const commands = [
  RunCommand,      // 运行交互式会话
  GenerateCommand, // 代码生成
  AuthCommand,     // 认证管理
  AgentCommand,    // Agent配置
  ServeCommand,    // 服务器模式
  McpCommand,      // MCP管理
]
```

### 2. Agent系统

Agent是OpenCode的核心抽象，定义了AI助手的行为模式：

```typescript
interface AgentInfo {
  name: string                    // Agent名称
  description: string             // 描述
  mode: 'primary' | 'subagent'    // 运行模式
  permission: PermissionRuleset   // 权限配置
  prompt?: string                 // 系统提示词
  model?: { providerID, modelID } // 指定模型
}
```

OpenCode内置了多种Agent：

| Agent | 模式 | 用途 |
|-------|------|------|
| build | primary | 默认模式，完整权限，适合开发工作 |
| plan | primary | 只读模式，适合代码分析与规划 |
| general | subagent | 复杂搜索和多步骤任务 |
| explore | subagent | 快速代码库探索 |

### 3. Tool系统

Tool是Agent与外部世界交互的桥梁。每个工具都遵循统一接口：

```typescript
interface ToolInfo {
  id: string                              // 工具ID
  init: (ctx?) => Promise<{
    description: string                   // 工具描述
    parameters: ZodSchema                 // 参数schema
    execute: (args, ctx) => Promise<{
      title: string
      metadata: Record<string, any>
      output: string
    }>
  }>
}
```

核心工具列表：

| 工具 | 功能 | 关键特性 |
|------|------|----------|
| bash | 执行shell命令 | 超时控制、权限检查 |
| read | 读取文件内容 | 支持图片、PDF、分页 |
| write | 写入文件 | 原子写入、备份 |
| edit | 编辑文件 | 精确替换、上下文匹配 |
| glob | 文件模式匹配 | 按修改时间排序 |
| grep | 内容搜索 | 正则表达式支持 |
| webfetch | 获取网页 | 内容提取 |

### 4. Provider系统

Provider系统实现了对多种LLM的统一封装：

```typescript
interface ProviderInfo {
  id: string                    // Provider ID
  name: string                  // 显示名称
  env: string[]                 // 环境变量
  models: Record<string, Model> // 支持的模型
}

interface Model {
  id: string
  providerID: string
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
  }
  cost: { input, output, cache }
  limit: { context, output }
}
```

支持的Provider包括：

- **Anthropic** - Claude系列模型
- **OpenAI** - GPT系列模型
- **Google** - Gemini系列模型
- **OpenRouter** - 多模型聚合
- **Amazon Bedrock** - AWS托管服务
- **Azure** - 微软Azure OpenAI

### 5. Session系统

Session管理用户与AI的交互会话：

```typescript
interface SessionInfo {
  id: string
  title: string
  projectID: string
  directory: string
  time: {
    created: number
    updated: number
  }
  summary?: {
    additions: number
    deletions: number
    files: number
  }
}
```

消息结构采用Parts模式：

```typescript
interface Message {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  parts: Part[]  // 内容分片
}

type Part = 
  | TextPart      // 文本内容
  | ToolCallPart  // 工具调用
  | ToolResultPart // 工具结果
  | FilePart      // 文件附件
```

### 6. MCP协议

Model Context Protocol允许动态扩展工具集：

```typescript
interface MCPConfig {
  type: 'local' | 'remote'
  command?: string[]      // 本地MCP服务器命令
  url?: string           // 远程MCP服务器URL
  environment?: Record<string, string>
  timeout?: number
}
```

## mini-opencode设计目标

基于以上架构分析，我们为mini-opencode设定以下目标：

### 核心功能

1. **CLI交互** - 支持基本的命令行交互
2. **多Provider支持** - 至少支持Anthropic和OpenAI
3. **基础工具集** - 实现read、write、edit、bash核心工具
4. **会话管理** - 支持会话持久化和历史记录
5. **权限系统** - 基本的工具调用权限控制

### 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js / Bun | 兼容性好、TypeScript支持 |
| 语言 | TypeScript | 类型安全、生态丰富 |
| CLI框架 | yargs | 功能完善、生态成熟 |
| 参数验证 | Zod | 类型推导、schema验证 |
| LLM SDK | @anthropic-ai/sdk, openai | 官方SDK、完整API支持 |
| TUI框架 | ink + React | 声明式UI、组件化开发 |

### 简化策略

相比完整版OpenCode，mini版做以下简化：

| 模块 | OpenCode | mini-opencode |
|------|----------|---------------|
| Agent类型 | 多种（build/plan/explore等） | 单一默认Agent |
| MCP支持 | 完整支持 | 暂不支持 |
| LSP集成 | 内置支持 | 暂不支持 |
| Session存储 | SQLite持久化 | 内存Map |
| TUI | 完整终端UI | 简化版Ink界面 |
| Provider | 20+ | 2个核心（Anthropic/OpenAI） |

## 项目结构规划

```
mini-opencode/
├── src/
│   ├── index.ts           # 主导出
│   ├── cli.ts             # CLI入口
│   ├── agent/
│   │   ├── agent.ts       # Agent核心
│   │   └── index.ts
│   ├── tool/
│   │   ├── tool.ts        # 工具接口定义
│   │   ├── registry.ts    # 工具注册表
│   │   ├── read.ts        # 文件读取
│   │   ├── write.ts       # 文件写入
│   │   ├── edit.ts        # 文件编辑
│   │   ├── bash.ts        # Shell命令
│   │   ├── glob.ts        # 文件搜索
│   │   └── index.ts
│   ├── provider/
│   │   ├── provider.ts    # Provider接口
│   │   ├── anthropic.ts   # Anthropic Claude
│   │   ├── openai.ts      # OpenAI GPT
│   │   ├── registry.ts    # Provider注册表
│   │   └── index.ts
│   ├── permission/
│   │   ├── permission.ts  # 权限管理
│   │   └── index.ts
│   ├── session/
│   │   ├── session.ts     # 会话管理
│   │   └── index.ts
│   ├── config/
│   │   ├── config.ts      # 配置管理
│   │   └── index.ts
│   ├── tui/
│   │   ├── app.tsx        # TUI主组件
│   │   └── index.ts
│   └── util/
│       └── logger.ts      # 日志系统
├── dist/                  # 构建输出
├── package.json
└── tsconfig.json
```

## 小结

本章我们分析了OpenCode的核心架构，理解了AI编程助手的设计原理，并制定了mini-opencode的技术选型和功能范围。

下一章我们将从CLI框架搭建开始，逐步构建mini-opencode的核心功能。

## 参考资料

- [OpenCode GitHub](https://github.com/sst/opencode)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Drizzle ORM](https://orm.drizzle.team/)
