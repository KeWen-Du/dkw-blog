---
title: "从零到一实现 nano-agent（一）：项目概述与架构设计"
date: "2024-10-09"
excerpt: "深入分析 AI 编程助手的核心架构，设计 nano-agent 项目的技术选型和核心模块，为构建生产级 AI Coding Agent 奠定基础。"
tags: ["AI", "LLM", "CLI", "TypeScript", "Agent"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 1
---

# 从零到一实现 nano-agent（一）：项目概述与架构设计

## 前言

AI 编程助手已经深刻改变了软件开发的方式。从 GitHub Copilot 到 Claude Code，这些工具展示了 LLM 与工具调用结合的强大能力。本系列将从零开始，实现一个生产级的 nano-agent，深入理解 AI Coding Agent 的核心原理。

nano-agent 是 opencode 的学习实践版本，代码量约 3800 行，保留了最核心的功能，非常适合学习 AI Agent 开发。

## 技术亮点概览

nano-agent 项目涵盖了大模型应用开发的核心技术点，是展示 Agent 开发能力的优秀项目：

### 核心技术亮点

| 技术点 | 难度 | 面试价值 | 实现章节 |
|--------|------|----------|----------|
| **Agent ReAct 循环** | ⭐⭐⭐⭐ | Agent 核心原理 | 第5章 |
| **多 Agent 协作** | ⭐⭐⭐⭐⭐ | 架构设计能力 | 第8章 |
| **并行工具执行** | ⭐⭐⭐⭐ | 并发编程能力 | 第9章 |
| **流式响应处理** | ⭐⭐⭐ | 异步编程能力 | 第3章 |
| **类型安全的工具系统** | ⭐⭐⭐ | TypeScript 深度应用 | 第4章 |
| **权限控制系统** | ⭐⭐⭐ | 安全意识 | 第6章 |
| **Skill 技能系统** | ⭐⭐⭐⭐ | 插件化设计 | 第10章 |

### 架构设计亮点

```
┌─────────────────────────────────────────────────────────────────┐
│                     nano-agent 架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    CLI Entry (yargs)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    TUI Layer (Ink + React)              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │ Session     │  │ Message     │  │ Input       │     │   │
│  │  │ Manager     │  │ Display     │  │ Handler     │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Agent Layer                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │ Primary     │  │ SubAgent    │  │ Context     │     │   │
│  │  │ Agent       │  │ Manager     │  │ Manager     │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Tool Layer                           │   │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │   │
│  │  │read │ │write│ │edit │ │bash │ │glob │ │batch│ ...  │   │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Provider Layer                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                │   │
│  │  │Anthropic │ │  OpenAI  │ │  iFlow   │                │   │
│  │  │ Claude   │ │   GPT    │ │ DeepSeek │                │   │
│  │  └──────────┘ └──────────┘ └──────────┘                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                Infrastructure Layer                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ Session  │ │Permission│ │ Skill    │ │ Config   │   │   │
│  │  │ Storage  │ │ System   │ │ Manager  │ │ System   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 面试常见问题覆盖

通过本系列文章，你将能够回答以下面试高频问题：

1. **Agent 架构设计**
   - 如何设计一个 AI Agent 的工具调用循环？
   - ReAct 模式是什么？如何实现？
   - 如何处理 Agent 状态管理和上下文传递？

2. **多 Agent 协作**
   - SubAgent 模式如何实现任务分解与协作？
   - 主 Agent 和子 Agent 如何通信？
   - 如何设计 Agent 的权限隔离？

3. **工具系统设计**
   - TypeScript 如何实现类型安全的工具系统？
   - Zod 如何用于参数验证和 JSON Schema 生成？
   - 并行工具执行如何设计？

4. **流式响应处理**
   - 如何处理 LLM 的流式响应？
   - 流式输出中的 tool_call 如何处理？
   - 如何实现 Token 统计和成本计算？

## 核心功能介绍

### 1. 多 LLM 提供商支持

nano-agent 支持三种主流 LLM 提供商：

| Provider | 模型 | 特点 |
|----------|------|------|
| Anthropic | Claude 系列 | 最强工具调用能力 |
| OpenAI | GPT 系列 | 生态最完善 |
| iFlow | 国产大模型 | 本土化支持 |

### 2. 核心工具集

| 工具 | 功能 | 关键特性 |
|------|------|----------|
| `read` | 读取文件内容 | 支持分页、行号 |
| `write` | 写入文件 | 原子写入 |
| `edit` | 精确编辑文件 | 上下文匹配 |
| `bash` | 执行 Shell 命令 | 超时控制 |
| `glob` | 文件模式匹配 | 按修改时间排序 |
| `grep` | 代码搜索 | 正则表达式支持 |
| `batch` | 并行执行多个工具 | 最大 10 并发 |
| `task` | 委托给子 Agent | 多种专业 Agent |
| `skill` | 加载技能包 | 动态知识注入 |

### 3. Agent 循环

Agent 的核心是 ReAct（Reasoning + Acting）循环：

```
┌─────────────────────────────────────────────────────────────┐
│                    ReAct Loop                               │
│                                                             │
│    ┌─────────┐    ┌─────────┐    ┌─────────┐              │
│    │  User   │───▶│   LLM   │───▶│ Parser  │              │
│    │ Message │    │  Call   │    │ Response │              │
│    └─────────┘    └─────────┘    └────┬────┘              │
│                                        │                    │
│                          ┌─────────────┼─────────────┐     │
│                          ▼             ▼             ▼     │
│                    ┌─────────┐   ┌─────────┐   ┌─────────┐ │
│                    │  Text   │   │Tool Call│   │  Done   │ │
│                    │ Output  │   │ Execute │   │  Event  │ │
│                    └─────────┘   └────┬────┘   └─────────┘ │
│                                       │                     │
│                                       ▼                     │
│                                 ┌─────────┐                │
│                                 │  Tool   │                │
│                                 │ Result  │────────────────┤
│                                 └─────────┘                │
│                                       │                     │
│                                       ▼                     │
│                              ┌────────────────┐            │
│                              │ Add to Context │            │
│                              │   Continue     │────────────┘
│                              └────────────────┘
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. 多 Agent 协作

nano-agent 支持 4 种专业子 Agent：

| Agent 类型 | 功能 | 可用工具 | 权限级别 |
|------------|------|----------|----------|
| `explore` | 快速代码库探索 | read, glob | 只读 |
| `general` | 复杂搜索任务 | read, glob, bash | 部分权限 |
| `code` | 代码编写修改 | read, glob, write, edit, bash | 需确认 |
| `plan` | 分析与规划 | read, glob | 只读 |

### 5. 权限控制系统

```typescript
// 权限规则示例
const DEFAULT_RULES: PermissionRule[] = [
  { tool: "read", action: "allow" },    // 读文件自动允许
  { tool: "glob", action: "allow" },    // 文件搜索自动允许
  { tool: "write", action: "ask" },     // 写文件需确认
  { tool: "edit", action: "ask" },      // 编辑文件需确认
  { tool: "bash", action: "ask" },      // Shell 命令需确认
]
```

### 6. Skill 技能系统

Skill 是可插拔的领域知识扩展：

```
.nano-agent/skills/
├── react-component/
│   ├── SKILL.md          # 技能元数据和指令
│   └── templates/
│       ├── component.tsx
│       └── test.tsx
└── api-design/
    └── SKILL.md
```

## 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js | 兼容性好、生态丰富 |
| 语言 | TypeScript | 类型安全、开发体验好 |
| CLI 框架 | yargs | 功能完善、生态成熟 |
| 参数验证 | Zod | 类型推导、JSON Schema 生成 |
| LLM SDK | @anthropic-ai/sdk, openai | 官方 SDK、完整 API 支持 |
| TUI 框架 | ink + React | 声明式 UI、组件化开发 |
| 配置管理 | dotenv | 环境变量管理 |

## 项目结构

```
nano-agent/
├── src/
│   ├── index.ts           # 主导出
│   ├── cli.ts             # CLI 入口
│   ├── agent/
│   │   ├── agent.ts       # Agent 核心（ReAct 循环）
│   │   ├── subagent.ts    # 多 Agent 协作
│   │   ├── context.ts     # 上下文管理
│   │   ├── recovery.ts    # 错误恢复
│   │   └── index.ts
│   ├── tool/
│   │   ├── tool.ts        # 工具接口定义
│   │   ├── registry.ts    # 工具注册表
│   │   ├── read.ts        # 文件读取
│   │   ├── write.ts       # 文件写入
│   │   ├── edit.ts        # 文件编辑
│   │   ├── bash.ts        # Shell 命令
│   │   ├── glob.ts        # 文件搜索
│   │   ├── grep.ts        # 代码搜索
│   │   ├── batch.ts       # 并行执行
│   │   ├── task.ts        # 子 Agent 任务
│   │   ├── skill.ts       # 技能加载
│   │   └── index.ts
│   ├── provider/
│   │   ├── provider.ts    # Provider 接口
│   │   ├── anthropic.ts   # Anthropic Claude
│   │   ├── openai.ts      # OpenAI GPT
│   │   ├── iflow.ts       # iFlow
│   │   ├── registry.ts    # Provider 注册表
│   │   └── index.ts
│   ├── permission/
│   │   ├── permission.ts  # 权限管理
│   │   └── index.ts
│   ├── session/
│   │   ├── session.ts     # 会话管理
│   │   ├── storage.ts     # 会话持久化
│   │   ├── compaction.ts  # 上下文压缩
│   │   └── index.ts
│   ├── skill/
│   │   ├── skill.ts       # 技能发现和管理
│   │   └── index.ts
│   ├── observability/
│   │   ├── metrics.ts     # 指标收集
│   │   └── index.ts
│   ├── config/
│   │   ├── config.ts      # 配置管理
│   │   └── index.ts
│   ├── error/
│   │   └── index.ts       # 错误处理
│   ├── tui/
│   │   ├── app.tsx        # TUI 主组件
│   │   └── index.ts
│   └── util/
│       ├── logger.ts      # 日志系统
│       └── index.ts
├── dist/                  # 构建输出
├── package.json
└── tsconfig.json
```

## 与 opencode 的对比

| 特性 | nano-agent | opencode |
|------|------------|----------|
| 代码量 | ~3800 行 | ~50000+ 行 |
| Agent 循环 | ✅ 完整实现 | ✅ 完整实现 |
| 并行工具调用 | ✅ batch 工具 | ✅ batch 工具 |
| 多 Agent 协作 | ✅ 4 种 SubAgent | ✅ 多种 Agent 类型 |
| 会话持久化 | ✅ JSON 文件 | ✅ SQLite |
| 上下文压缩 | ✅ 摘要压缩 | ✅ 智能压缩 |
| 错误恢复 | ✅ 重试机制 | ✅ 完整恢复 |
| Skill 系统 | ✅ 技能发现和加载 | ✅ 完整支持 |
| grep 搜索 | ✅ 原生实现 | ✅ ripgrep |
| LSP 集成 | ❌ | ✅ |
| MCP 完整支持 | 基础 | 完整 |
| 多语言支持 | ❌ | ✅ |
| 插件系统 | ❌ | ✅ |
| 适用场景 | 学习、轻量使用 | 生产环境 |

## 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/your-repo/nano-agent.git
cd nano-agent

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入 API Key

# 构建
npm run build
```

### 使用

```bash
# 交互模式
npm run dev

# 指定模型和提供商
node dist/cli.js --model gpt-4o-mini --provider openai

# 指定工作目录
node dist/cli.js -d /path/to/project

# 查看可用模型
node dist/cli.js models
```

### 环境变量配置

```env
# LLM 提供商: anthropic | openai | iflow
NANO_AGENT_PROVIDER=iflow

# 模型名称
NANO_AGENT_MODEL=iflow-rome-30ba3b

# 日志级别: debug | info | warn | error
NANO_AGENT_LOG_LEVEL=info

# API Key (根据提供商设置)
IFLOW_API_KEY=your_api_key
# OPENAI_API_KEY=your_api_key
# ANTHROPIC_API_KEY=your_api_key
```

## 系列文章规划

本系列将按以下顺序逐步实现 nano-agent：

| 章节 | 标题 | 核心内容 |
|------|------|----------|
| 第1章 | 项目概述与架构设计 | 项目定位、技术选型、架构设计 |
| 第2章 | CLI 框架搭建 | yargs 框架、配置管理、环境变量 |
| 第3章 | Provider 系统 | 多 LLM 适配、流式响应、统一接口 |
| 第4章 | 工具系统基础 | 工具接口、Zod 验证、注册表 |
| 第5章 | Agent 核心循环 | ReAct 模式、工具调用、消息处理 |
| 第6章 | 权限控制系统 | 权限规则、审批机制、安全防护 |
| 第7章 | 会话管理系统 | 会话状态、Token 统计、持久化 |
| 第8章 | 多 Agent 协作 | SubAgent 架构、任务委托 |
| 第9章 | 并行工具执行 | batch 工具、Promise.allSettled |
| 第10章 | Skill 技能系统 | 技能发现、动态加载、模板支持 |
| 第11章 | TUI 终端界面 | Ink + React、交互设计 |
| 第12章 | 生产级实践 | 错误恢复、可观测性、部署 |

## 小结

本章介绍了 nano-agent 项目的定位、核心架构和技术选型。作为 opencode 的学习实践版本，nano-agent 保留了 AI Coding Agent 的核心功能，代码量适中，非常适合学习 Agent 开发。

**关键要点**：

1. nano-agent 实现了 Agent 的核心 ReAct 循环
2. 支持多 LLM 提供商、多种工具、多 Agent 协作
3. 具备权限控制、会话管理、技能系统等生产级特性
4. 代码量约 3800 行，适合学习和二次开发

下一章我们将从 CLI 框架搭建开始，使用 yargs 构建命令行界面，实现配置管理和环境变量处理。

## 参考资料

- [OpenCode GitHub](https://github.com/sst/opencode)
- [Anthropic API Docs](https://docs.anthropic.com/)
- [OpenAI API Docs](https://platform.openai.com/docs/)
- [Ink - React for CLI](https://github.com/vadimdemedes/ink)
- [Zod - TypeScript Schema Validation](https://zod.dev/)
