---
title: "iFlow CLI AI Coding 最佳实践（五）：SubAgent 与 MCP 篇"
date: "2024-09-05"
excerpt: "探索 iFlow CLI 的扩展生态系统，学习如何使用 SubAgent 打造专业 AI 团队，以及通过 MCP 协议扩展 AI 的能力边界。"
tags: ["iFlow CLI", "AI Coding", "SubAgent", "MCP"]
series:
  slug: "iflow-cli-aicoding"
  title: "iFlow CLI AI Coding 最佳实践"
  order: 5
---

# iFlow CLI AI Coding 最佳实践（五）：SubAgent 与 MCP 篇

## 前言

如果说 iFlow CLI 是一个全能的 AI 助手，那么 **SubAgent** 就是它的专业团队，**MCP** 则是它连接外部世界的能力扩展。本篇将深入探讨如何通过这两大机制，让你的 AI 编程助手变得更加强大和专业。

## SubAgent：打造你的 AI 专家团队

### 什么是 SubAgent？

SubAgent 是一种特殊的工具，它拥有独立的专业能力和上下文窗口。通过 SubAgent，你可以将 iFlow CLI 从通用助手转变为专家团队。

```
┌─────────────────────────────────────────────────────────┐
│                    iFlow CLI 架构                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    ┌───────────┐                        │
│                    │  主 Agent  │                        │
│                    │ (通用助手) │                        │
│                    └─────┬─────┘                        │
│                          │                              │
│         ┌────────────────┼────────────────┐            │
│         │                │                │            │
│    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐        │
│    │ Code    │     │ Test    │     │ Doc     │        │
│    │ Review  │     │ Writer  │     │ Writer  │        │
│    │ Agent   │     │ Agent   │     │ Agent   │        │
│    └─────────┘     └─────────┘     └─────────┘        │
│         │                │                │            │
│    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐        │
│    │ Security│     │ Perform │     │ Trans   │        │
│    │ Scanner │     │ Analyzer│     │ lator   │        │
│    │ Agent   │     │ Agent   │     │ Agent   │        │
│    └─────────┘     └─────────┘     └─────────┘        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### SubAgent vs 普通工具

| 特性 | 普通工具 | SubAgent |
|------|----------|----------|
| 上下文 | 共享主上下文 | 独立上下文窗口 |
| 能力 | 单一功能 | 专业领域能力 |
| 交互 | 简单调用 | 可进行多轮对话 |
| 输出 | 固定格式 | 智能响应 |

### 内置 SubAgent

#### 1. Code Review Agent

专业代码审查，关注代码质量、安全性和最佳实践：

```bash
> 使用 code-review agent 审查 src/auth.ts

AI: [Code Review Agent] 开始审查...

📋 代码审查报告

## 整体评估
- 代码质量：B+ (良好)
- 安全性：C (需改进)
- 可维护性：B (良好)

## 发现的问题

### 🔴 严重问题
1. **安全漏洞** (第 45 行)
   ```typescript
   // 问题：密码明文比较
   if (user.password === password) {

   // 建议：使用 bcrypt
   if (await bcrypt.compare(password, user.password)) {
   ```

### 🟡 中等问题
2. **缺少输入验证** (第 23 行)
   - 建议添加 email 格式验证
   - 建议添加密码强度检查

### 🟢 改进建议
3. **可添加类型注释** (第 12 行)
   - 建议为 user 对象添加明确的类型定义

## 安全建议
- [ ] 实施密码哈希
- [ ] 添加登录频率限制
- [ ] 实施 CSRF 保护
```

#### 2. Test Generator Agent

自动生成高质量的测试用例：

```bash
> 使用 test-generator agent 为 src/utils/date.ts 生成测试

AI: [Test Generator Agent] 正在分析代码...

✅ 已生成测试文件：src/utils/__tests__/date.test.ts

```typescript
import { formatDate, parseDate, isValidDate } from '../date';

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2024-01-15T10:30:00');
    expect(formatDate(date)).toBe('2024-01-15 10:30:00');
  });

  it('should handle invalid date', () => {
    expect(formatDate(new Date('invalid'))).toBe('Invalid Date');
  });

  it('should handle null input', () => {
    expect(formatDate(null)).toBe('Invalid Date');
  });
});

describe('parseDate', () => {
  // ... 更多测试用例
});
```

测试覆盖率预估：92%
```

#### 3. Doc Writer Agent

生成专业的技术文档：

```bash
> 使用 doc-writer agent 为 API 生成文档

AI: [Doc Writer Agent] 正在生成 API 文档...

✅ 已创建 docs/api/users.md

```markdown
# Users API

## 概述
用户管理 API，提供用户注册、登录、信息管理等功能。

## 端点

### POST /api/users/register
注册新用户

**请求体**
| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| email | string | 是 | 用户邮箱 |
| password | string | 是 | 密码（至少 8 位）|
| name | string | 否 | 用户名 |

**响应**
```json
{
  "code": 200,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John"
  }
}
```

**错误码**
| 代码 | 描述 |
|------|------|
| 400 | 参数错误 |
| 409 | 邮箱已存在 |
```
```

### 心流开放市场

iFlow CLI 内置开放市场，可以一键安装 SubAgent 和 MCP 工具：

```bash
# 查看和管理 Agent
> /agent

# 查看更多预配置代理
AI: 可用的 SubAgent：
├── code-review        代码审查专家
├── test-generator     测试生成专家
├── doc-writer         文档写作专家
├── security-scanner   安全扫描专家
└── ...更多可在心流开放市场查看
```

> **提示**：访问 [心流开放平台](https://platform.iflow.cn) 可以浏览完整的开放市场，获取更多 SubAgent 和 MCP 工具。

### 安装和管理 SubAgent

```bash
# 查看可用的 SubAgent
> /agent

# 查看帮助了解如何使用 Agent
> /agent -h

# 在心流开放平台安装 Agent 后，可以直接使用
> 使用 code-review agent 审查代码
```

> **说明**：SubAgent 的安装和管理主要通过心流开放平台进行。访问 [心流开放平台](https://platform.iflow.cn/agents) 可以浏览和安装各种专业 Agent。

## MCP：扩展 AI 能力边界

### 什么是 MCP？

**MCP (Model Context Protocol)** 是一种标准化的协议，允许 AI 模型与外部工具和服务进行交互。通过 MCP，iFlow CLI 可以：

- 访问外部数据库
- 调用第三方 API
- 操作文件系统
- 执行自定义脚本

### MCP 架构

```
┌─────────────────────────────────────────────────────────┐
│                      MCP 架构                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌─────────────┐         ┌─────────────┐              │
│   │  iFlow CLI  │◄───────►│ MCP Client  │              │
│   └─────────────┘         └──────┬──────┘              │
│                                  │                      │
│                    ┌─────────────┼─────────────┐        │
│                    │             │             │        │
│              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐  │
│              │   File    │ │ Database  │ │   Web     │  │
│              │  Server   │ │  Server   │ │  Server   │  │
│              └───────────┘ └───────────┘ └───────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 常用 MCP 工具

#### 1. Filesystem MCP

增强的文件系统操作：

```bash
# 安装
> /mcp install @modelcontextprotocol/server-filesystem

# 使用
> 使用 filesystem 工具搜索所有包含 "TODO" 的文件

AI: [Filesystem MCP] 搜索中...

找到 15 个文件包含 "TODO"：
- src/auth.ts (3 处)
- src/api/users.ts (2 处)
- src/utils/helper.ts (5 处)
...
```

#### 2. GitHub MCP

与 GitHub 深度集成：

```bash
# 安装
> /mcp install @modelcontextprotocol/server-github

# 使用
> 创建一个 PR，将当前分支合并到 main

AI: [GitHub MCP] 正在创建 PR...

✅ PR 已创建: #42
标题: feat: Add user authentication
链接: https://github.com/user/repo/pull/42
```

#### 3. Database MCP

数据库操作支持：

```bash
# 安装
> /mcp install @modelcontextprotocol/server-postgres

# 使用
> 查询用户表中最近 7 天注册的用户数量

AI: [Postgres MCP] 执行查询...

查询结果：
| 日期 | 注册数量 |
|------|----------|
| 2024-01-15 | 23 |
| 2024-01-14 | 18 |
| 2024-01-13 | 31 |
| ... | ... |
| 总计 | 156 |
```

### MCP 配置

MCP 配置文件位于 `~/.iflow/mcp.json`：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/directory"
      ]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-github-token"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/db"
      }
    }
  }
}
```

## 自定义扩展

### 创建自定义 SubAgent

在 `~/.iflow/agents/` 目录下创建自定义 Agent：

```markdown
<!-- ~/.iflow/agents/my-reviewer.md -->
# Code Reviewer Agent

## 角色定义
你是一位专业的代码审查专家，专注于：
- 代码质量
- 安全漏洞
- 性能优化
- 最佳实践

## 审查标准
1. 所有函数必须有 JSDoc 注释
2. 禁止使用 any 类型
3. 必须处理错误情况
4. 变量命名必须语义化

## 输出格式
使用 Markdown 格式，按严重程度分类问题。
```

使用自定义 Agent：

```bash
> 使用 my-reviewer agent 审查代码
```

### 创建自定义 MCP Server

使用 Node.js 创建 MCP Server：

```typescript
// my-mcp-server/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'my-custom-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// 注册工具
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'my_custom_tool',
      description: '自定义工具描述',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      }
    }
  ]
}));

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'my_custom_tool') {
    // 处理逻辑
    return { content: [{ type: 'text', text: '结果' }] };
  }
});

// 启动服务
const transport = new StdioServerTransport();
await server.connect(transport);
```

## 实践案例

### 案例 1：完整开发流程

```bash
# 1. 初始化项目
> /init

# 2. 设计 API
> 使用 doc-writer agent 设计 API 文档

# 3. 实现代码
> 根据文档实现 API

# 4. 代码审查
> 使用 code-review agent 审查代码

# 5. 生成测试
> 使用 test-generator agent 生成测试

# 6. 安全扫描
> 使用 security-scanner agent 扫描安全漏洞

# 7. 提交代码
> 使用 github MCP 创建 PR
```

### 案例 2：多团队协作

```bash
# 前端团队使用 frontend-specialist agent
> 使用 frontend-specialist agent 优化 React 组件

# 后端团队使用 backend-specialist agent
> 使用 backend-specialist agent 优化 API 性能

# DevOps 使用 devops agent
> 使用 devops agent 配置 CI/CD
```

### 案例 3：代码质量保障

```bash
# 设置自动化流程
> 配置 pre-commit hook：
> 1. 运行 code-review agent
> 2. 运行 security-scanner agent
> 3. 运行 test-generator agent

AI: 已配置 pre-commit hook，将在每次提交前自动运行检查。
```

## 最佳实践

### 1. 选择合适的 Agent

| 任务类型 | 推荐 Agent |
|----------|------------|
| 代码审查 | code-review |
| 测试编写 | test-generator |
| 文档编写 | doc-writer |
| 安全检查 | security-scanner |
| 性能优化 | performance-guru |

### 2. 组合使用 Agent

```bash
# 链式调用多个 Agent
> 先用 code-review agent 审查，
> 再用 test-generator agent 补充测试，
> 最后用 doc-writer agent 更新文档
```

### 3. 定制化配置

```bash
# 根据团队规范定制 Agent
> 修改 code-review agent 的审查标准，
> 添加团队特有的规范要求
```

### 4. 安全考虑

```bash
# MCP 权限控制
> 配置 filesystem MCP 只能访问项目目录

# 敏感信息保护
> 使用环境变量存储 API 密钥
```

## 小结

SubAgent 和 MCP 是 iFlow CLI 扩展能力的两大支柱：

- **SubAgent**：让 AI 从通用助手变成专家团队
- **MCP**：让 AI 能够连接外部世界

通过合理使用这两大机制，你可以构建一个强大的 AI 开发助手系统。

在下一篇中，我们将探讨企业级 AI Coding 实践，看看大型团队如何在生产环境中使用 iFlow CLI。

---

**相关链接**：
- [心流开放市场](https://platform.iflow.cn/agents)
- [MCP 官方文档](https://modelcontextprotocol.io)
- [iFlow CLI GitHub](https://github.com/iflow-ai/iflow-cli)

**上一篇**：[iFlow CLI AI Coding 最佳实践（四）：上下文工程篇](/posts/iflow-cli-aicoding-04-context-engineering)

**下一篇**：[iFlow CLI AI Coding 最佳实践（六）：企业级实践篇](/posts/iflow-cli-aicoding-06-enterprise)
