---
title: "iFlow CLI AI Coding 最佳实践（二）：快速上手篇"
date: "2024-08-01"
excerpt: "详细介绍 iFlow CLI 的安装配置方法，包括不同操作系统的安装步骤、认证方式配置，以及基本命令的使用指南。"
tags: ["iFlow CLI", "AI Coding", "安装配置", "快速上手"]
series:
  slug: "iflow-cli-aicoding"
  title: "iFlow CLI AI Coding 最佳实践"
  order: 2
---

# iFlow CLI AI Coding 最佳实践（二）：快速上手篇

## 前言

在上一篇中，我们了解了 AI Coding 的发展历程和 iFlow CLI 的设计哲学。本篇将带你快速上手 iFlow CLI，从安装配置到第一个 AI 编程任务，让你快速体验 AI 编程的魅力。

## 系统要求

### 操作系统

| 系统 | 版本要求 | 备注 |
|------|----------|------|
| macOS | 10.15+ | 原生支持 |
| Linux | Ubuntu 20.04+ / Debian 10+ | 原生支持 |
| Windows | 10+ | 需要 WSL 或 Git for Windows |

### 硬件与软件

- **内存**：4GB+ 推荐 8GB+
- **Node.js**：22+ 版本必需
- **网络**：需要互联网连接用于认证和 AI 处理
- **Shell**：Bash、Zsh、Fish 或 PowerShell

### 检查 Node.js 版本

```bash
# 检查 Node.js 版本
node --version

# 如果版本低于 22，需要升级
# 推荐使用 nvm 管理 Node.js 版本
```

## 安装方式

### macOS / Linux 安装

#### 方式一：一键安装（推荐）

```bash
bash -c "$(curl -fsSL https://cloud.iflow.cn/iflow-cli/install.sh)"
```

#### 方式二：npm 安装

```bash
npm install -g @iflow-ai/iflow-cli
```

> **注意**：如果在中国大陆，推荐使用下方的国内镜像安装方式。

### Windows 安装

#### 方式一：标准安装

```powershell
# 1. 访问 https://nodejs.org/zh-cn/download 下载 Node.js
# 2. 安装 Node.js
# 3. 重启终端（CMD 或 PowerShell）
# 4. 安装 iFlow CLI
npm install -g @iflow-ai/iflow-cli

# 5. 启动
iflow
```

#### 方式二：国内镜像安装（推荐）

```powershell
# 1. 下载 nvm 安装程序
# 访问 https://cloud.iflow.cn/iflow-cli/nvm-setup.exe

# 2. 安装 nvm
# 运行下载的安装程序

# 3. 重启终端

# 4. 配置镜像
nvm node_mirror https://npmmirror.com/mirrors/node/
nvm npm_mirror https://npmmirror.com/mirrors/npm/

# 5. 安装 Node.js 22
nvm install 22
nvm use 22

# 6. 安装 iFlow CLI
npm install -g @iflow-ai/iflow-cli

# 7. 启动
iflow
```

### 验证安装

```bash
# 检查版本
iflow --version

# 查看帮助
iflow -h
```

## 认证配置

iFlow CLI 提供两种认证方式：

### 方式一：iFlow 原生认证（推荐）

适合大多数使用场景，支持网页认证：

```
┌─────────────────────────────────────────┐
│           认证方式选择                    │
│                                         │
│  1. iFlow 原生认证（推荐）               │
│  2. OpenAI 兼容 API                     │
│                                         │
│  请选择: 1                               │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│  正在打开浏览器进行认证...               │
│  请在浏览器中完成登录                    │
└─────────────────────────────────────────┘
```

首次运行 `iflow` 时，选择方式一会自动打开浏览器进行认证，完成后即可免费使用。

### 方式二：API Key 认证

适合服务器环境或无法打开浏览器的场景：

#### 获取 API Key

1. 注册 iFlow 账户
2. 进入个人设置页面
3. 点击"重置"生成新的 API 密钥

#### 配置使用

```bash
# 启动 iflow，选择方式二
iflow

# 粘贴 API Key
# Windows 用户注意：右键粘贴
```

### 配置文件说明

配置文件位于 `~/.iflow/settings.json`：

```json
{
  "theme": "Default",
  "selectedAuthType": "iflow",
  "apiKey": "your-iflow-key",
  "baseUrl": "https://apis.iflow.cn/v1",
  "modelName": "Qwen3-Coder",
  "searchApiKey": "your-iflow-key"
}
```

#### 可用模型

| 模型 | 特点 | 适用场景 |
|------|------|----------|
| Qwen3 Coder | 代码生成专精 | 编程任务 |
| Kimi K2 | 长上下文 | 大型项目分析 |
| DeepSeek v3 | 综合能力强 | 通用任务 |

> **提示**：更多模型可在心流开放平台的模型库中查看。

## 基本命令

### 启动与退出

```bash
# 启动 iFlow CLI
iflow

# 在指定目录启动
cd /path/to/project
iflow

# 恢复上一次会话
iflow --resume

# 退出
# 按 Ctrl+C 或输入 /exit
```

### 常用斜杠命令

| 命令 | 功能 | 使用场景 |
|------|------|----------|
| `/init` | 初始化项目分析 | 首次进入项目 |
| `/help` | 查看帮助 | 了解功能 |
| `/clear` | 清空对话 | 开始新任务 |
| `/chat` | 查看对话历史 | 回顾历史 |
| `/agent` | 管理 SubAgent | 扩展能力 |
| `/mcp` | 管理 MCP 工具 | 扩展能力 |
| `/exit` | 退出程序 | 结束使用 |

### 命令行参数

```bash
# 查看版本
iflow --version

# 查看帮助
iflow -h

# 恢复会话
iflow --resume

# 指定配置目录
iflow --config-dir /path/to/config

# 调试模式
iflow --debug
```

## 第一个任务

### 新项目场景

创建一个新项目，让 iFlow CLI 帮你实现：

```bash
# 创建项目目录
mkdir my-first-project
cd my-first-project

# 启动 iFlow CLI
iflow

# 输入你的需求
> 使用 HTML、CSS、JavaScript 创建一个待办事项应用，
> 需要支持添加、删除、标记完成功能，
> 数据保存在 localStorage 中
```

### 现有项目场景

在现有项目中使用 iFlow CLI：

```bash
# 进入项目目录
cd existing-project

# 启动 iFlow CLI
iflow

# 初始化项目分析
> /init

# 等待分析完成后，提出你的需求
> 帮我分析这个项目的架构，并添加一个用户登录功能
```

### `/init` 命令详解

`/init` 命令是使用 iFlow CLI 的关键第一步：

```
> /init

正在扫描项目结构...
分析 package.json...
分析代码文件...
生成项目文档...

已创建 IFLOW.md 文件，包含：
- 项目概述
- 技术栈
- 目录结构
- 主要功能
- 开发指南
```

**IFLOW.md 的作用**：
1. 帮助 AI 理解项目结构
2. 提供上下文信息
3. 作为项目文档

## 界面交互

### 四种运行模式

通过 `Shift + Tab` 切换运行模式：

| 模式 | 权限 | 适用场景 |
|------|------|----------|
| Default | 无权限 | 查询、分析 |
| Plan Mode | 仅规划 | 复杂任务规划 |
| Accepting Edits | 仅文件修改 | 安全的开发任务 |
| Yolo | 最高权限 | 快速开发、信任 AI |

### 模式选择建议

```
┌──────────────────────────────────────────────────────┐
│                    模式选择指南                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  🔍 只是询问问题？          → Default 模式            │
│                                                      │
│  📋 复杂任务需要规划？       → Plan Mode              │
│                                                      │
│  ✏️ 需要修改代码？          → Accepting Edits 模式    │
│                                                      │
│  🚀 快速开发，信任 AI？     → Yolo 模式               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 交互流程示例

```
用户: 帮我创建一个 React 组件，显示用户列表

AI: 我来帮你创建这个组件。首先，让我确认一下需求：

    1. 组件名称：UserList
    2. 数据来源：props 还是 API？
    3. 需要哪些功能：排序、筛选、分页？

用户: 组件名 UserList，数据从 props 获取，需要排序功能

AI: 好的，我将创建 UserList 组件，包含以下功能：
    - 接收 users 数组作为 props
    - 支持按名称排序
    - 响应式布局

    [创建文件 src/components/UserList.tsx]

    组件已创建完成，是否需要添加样式文件？
```

## 实用技巧

### 1. 提供清晰的上下文

```bash
# ❌ 不好的方式
> 写个函数

# ✅ 好的方式
> 在 src/utils/date.ts 中添加一个 formatDate 函数，
> 接收 Date 对象，返回 "YYYY-MM-DD HH:mm:ss" 格式的字符串，
> 需要处理无效日期的情况
```

### 2. 分步骤完成任务

```bash
# 对于复杂任务，分步骤进行
> 第一步：帮我分析现有的认证系统
> 第二步：设计新的权限管理方案
> 第三步：实现权限检查中间件
```

### 3. 利用项目上下文

```bash
# 先初始化项目分析
> /init

# 然后提出需求，AI 会参考项目结构
> 参考现有的 API 风格，添加一个用户管理模块
```

### 4. 多模态输入

```bash
# 粘贴图片进行分析
# Ctrl+V 粘贴截图
> 分析这个 UI 设计稿，帮我实现对应的组件
```

### 5. 会话管理

```bash
# 保存有价值的会话
# 会话自动保存在 ~/.iflow/projects/

# 恢复上次会话
iflow --resume
```

## 常见问题

### Q1: 安装后命令找不到？

```bash
# 检查 npm 全局安装路径
npm config get prefix

# 确保路径在 PATH 中
# Windows: 添加到系统环境变量
# Linux/Mac: 检查 ~/.bashrc 或 ~/.zshrc
```

### Q2: 认证失败？

```bash
# 检查网络连接
# 尝试重新认证
iflow
# 选择重新登录

# 或使用 API Key 方式
```

### Q3: 响应缓慢？

可能原因：
- 网络问题
- 模型负载高
- 上下文过长

解决方案：
- 切换模型
- 使用 `/clear` 清空对话
- 检查网络连接

### Q4: 如何更新？

```bash
# npm 方式更新
npm update -g @iflow-ai/iflow-cli

# 或重新安装
npm install -g @iflow-ai/iflow-cli
```

### Q5: 如何卸载？

```bash
npm uninstall -g @iflow-ai/iflow-cli
```

## 下一步

现在你已经掌握了 iFlow CLI 的基本使用方法。在下一篇中，我们将深入探讨 iFlow CLI 的核心功能，包括四种运行模式的详细使用、项目分析功能等。

---

**相关链接**：
- [iFlow CLI 官网](https://cli.iflow.cn)
- [GitHub 仓库](https://github.com/iflow-ai/iflow-cli)
- [问题反馈](https://github.com/iflow-ai/iflow-cli/issues)

**上一篇**：[iFlow CLI AI Coding 最佳实践（一）：概述篇](/posts/iflow-cli-aicoding-01-overview)

**下一篇**：[iFlow CLI AI Coding 最佳实践（三）：核心功能篇](/posts/iflow-cli-aicoding-03-core-features)
