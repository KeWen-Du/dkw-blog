---
title: "从零到一实现 nano-agent（六）：权限系统与安全机制"
date: "2024-12-03"
excerpt: "实现细粒度的权限控制系统，支持工具调用审批、路径模式匹配和只读模式，确保 AI Agent 安全操作。"
tags: ["AI", "Security", "Permission", "TypeScript", "安全"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 6
---

# 从零到一实现 nano-agent（六）：权限控制系统

## 前言

AI Agent 拥有强大的工具调用能力，但也带来了安全风险。一个不受控制的 Agent 可能会删除重要文件、执行危险命令。本章将实现一个细粒度的权限控制系统，确保 Agent 的行为在安全边界内。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 权限规则设计 | ⭐⭐⭐ | 安全意识 | ✅ |
| 模式匹配算法 | ⭐⭐⭐ | 算法实现 | ✅ |
| 审批流程设计 | ⭐⭐⭐ | 交互设计 | ✅ |
| 安全边界设计 | ⭐⭐⭐⭐ | 系统安全 | ✅ |

## 面试考点

1. 如何设计 AI Agent 的权限控制系统？
2. 如何实现路径模式匹配？
3. 如何防止路径遍历攻击？

## 权限系统架构

### 整体设计

```
┌─────────────────────────────────────────────────────────────┐
│                Permission System                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Permission Manager                    │   │
│  │                                                      │   │
│  │  check(request) → "allow" | "deny" | "ask"          │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Permission Rules                      │   │
│  │                                                      │   │
│  │  [                                                    │   │
│  │    { tool: "read", action: "allow" },                │   │
│  │    { tool: "write", action: "ask", patterns: [...] },│   │
│  │    { tool: "bash", action: "deny", patterns: [...] } │   │
│  │  ]                                                    │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Pattern Matcher                       │   │
│  │                                                      │   │
│  │  matchPattern(value, pattern) → boolean             │   │
│  │                                                      │   │
│  │  支持通配符:                                          │   │
│  │  - * : 任意字符（除 /）                              │   │
│  │  - ** : 任意字符（包含 /）                           │   │
│  │  - ? : 单个字符                                      │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 权限决策流程

```
┌─────────────────────────────────────────────────────────────┐
│                Permission Decision Flow                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  工具调用请求                                               │
│  { tool: "write", params: { path: "/src/a.ts" } }          │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 遍历权限规则（按优先级）                              │   │
│  │                                                      │   │
│  │  规则 1: { tool: "read", action: "allow" }          │   │
│  │  → 匹配 tool? ❌ (read ≠ write)                     │   │
│  │  → 继续下一条规则                                    │   │
│  │                                                      │   │
│  │  规则 2: { tool: "write", action: "ask",            │   │
│  │           patterns: ["/src/**"] }                    │   │
│  │  → 匹配 tool? ✅                                     │   │
│  │  → 匹配 pattern? ✅ ("/src/a.ts" 匹配 "/src/**")    │   │
│  │  → 返回 "ask"                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                        │                                    │
│                        ▼                                    │
│  返回 "ask" → 需要用户确认                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 权限类型定义

```typescript
// src/permission/permission.ts

/**
 * 权限动作类型
 */
export type PermissionAction = "allow" | "deny" | "ask"

/**
 * 权限规则
 */
export interface PermissionRule {
  tool: string | "*"       // 工具名称，"*" 表示所有工具
  action: PermissionAction  // 权限动作
  patterns?: string[]       // 匹配模式（可选）
}

/**
 * 权限请求
 */
export interface PermissionRequest {
  tool: string                              // 工具名称
  params: Record<string, unknown>           // 工具参数
  patterns?: string[]                       // 提取的模式（如文件路径）
}
```

## PermissionManager 实现

```typescript
// src/permission/permission.ts (续)

/**
 * 权限管理器
 */
export class PermissionManager {
  private rules: PermissionRule[] = []

  constructor(rules: PermissionRule[] = []) {
    this.rules = rules
  }

  /**
   * 检查权限
   */
  check(request: PermissionRequest): PermissionAction {
    for (const rule of this.rules) {
      if (this.matchesRule(request, rule)) {
        return rule.action
      }
    }
    // 默认需要确认
    return "ask"
  }

  /**
   * 判断请求是否匹配规则
   */
  private matchesRule(request: PermissionRequest, rule: PermissionRule): boolean {
    // 检查工具名称
    if (rule.tool !== "*" && rule.tool !== request.tool) {
      return false
    }
    
    // 没有模式限制，直接匹配
    if (!rule.patterns || rule.patterns.length === 0) {
      return true
    }
    
    // 检查模式匹配
    if (request.patterns) {
      for (const pattern of rule.patterns) {
        if (request.patterns.some(p => this.matchPattern(String(p), pattern))) {
          return true
        }
      }
    }
    
    return false
  }

  /**
   * 模式匹配
   * 支持 * (任意非 / 字符), ** (任意字符), ? (单个字符)
   */
  private matchPattern(value: string, pattern: string): boolean {
    // 将 glob 模式转换为正则表达式
    const regexStr = "^" + pattern
      .replace(/\*\*/g, "{{DOUBLESTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/\{\{DOUBLESTAR\}\}/g, ".*")
      .replace(/\?/g, ".") + "$"
    
    const regex = new RegExp(regexStr)
    return regex.test(value)
  }

  /**
   * 添加规则（插入到开头，优先级最高）
   */
  addRule(rule: PermissionRule): void {
    this.rules.unshift(rule)
  }

  /**
   * 移除规则
   */
  removeRule(rule: PermissionRule): void {
    const index = this.rules.indexOf(rule)
    if (index !== -1) {
      this.rules.splice(index, 1)
    }
  }

  /**
   * 清空所有规则
   */
  clearRules(): void {
    this.rules = []
  }

  /**
   * 获取所有规则
   */
  getRules(): PermissionRule[] {
    return [...this.rules]
  }
}
```

## 预定义规则集

```typescript
// src/permission/permission.ts (续)

/**
 * 默认规则集
 * - 读取操作自动允许
 * - 写入操作需要确认
 */
export const DEFAULT_RULES: PermissionRule[] = [
  { tool: "read", action: "allow" },
  { tool: "glob", action: "allow" },
  { tool: "grep", action: "allow" },
  { tool: "write", action: "ask" },
  { tool: "edit", action: "ask" },
  { tool: "bash", action: "ask" },
  { tool: "batch", action: "ask" },
  { tool: "task", action: "allow" },
  { tool: "skill", action: "allow" },
]

/**
 * 只读规则集
 * - 只允许读取操作
 * - 禁止所有修改操作
 */
export const READONLY_RULES: PermissionRule[] = [
  { tool: "read", action: "allow" },
  { tool: "glob", action: "allow" },
  { tool: "grep", action: "allow" },
  { tool: "*", action: "deny" },
]

/**
 * 完全信任规则集
 * - 允许所有操作（谨慎使用）
 */
export const TRUSTED_RULES: PermissionRule[] = [
  { tool: "*", action: "allow" },
]

/**
 * 高安全规则集
 * - 读取需要确认
 * - 禁止 shell 命令
 */
export const HIGH_SECURITY_RULES: PermissionRule[] = [
  { tool: "bash", action: "deny" },
  { tool: "read", action: "ask" },
  { tool: "glob", action: "ask" },
  { tool: "grep", action: "ask" },
  { tool: "write", action: "ask" },
  { tool: "edit", action: "ask" },
  { tool: "*", action: "deny" },
]
```

## 路径安全检查

### 防止路径遍历攻击

```typescript
// src/util/path.ts

import { resolve, normalize, relative } from "path"

/**
 * 安全路径解析
 * 防止路径遍历攻击
 */
export function safePath(
  inputPath: string,
  workingDirectory: string
): string {
  // 规范化路径
  const normalized = normalize(inputPath)
  
  // 解析为绝对路径
  const absolute = resolve(workingDirectory, normalized)
  
  // 检查是否在工作目录内
  const relativePath = relative(workingDirectory, absolute)
  if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
    throw new Error(`Path traversal detected: ${inputPath}`)
  }
  
  return absolute
}

/**
 * 检查路径是否在工作目录内
 */
export function isWithinWorkingDirectory(
  path: string,
  workingDirectory: string
): boolean {
  const absolute = resolve(path)
  const normalized = normalize(absolute)
  const relativePath = relative(workingDirectory, normalized)
  
  return !relativePath.startsWith("..") && !relativePath.startsWith("/")
}

/**
 * 检查敏感路径
 */
export function isSensitivePath(path: string): boolean {
  const sensitivePatterns = [
    "/etc/",
    "/root/",
    "/home/",
    ".ssh/",
    ".env",
    ".git/",
    "id_rsa",
    "credentials",
    "secrets",
  ]
  
  const normalized = normalize(path).toLowerCase()
  return sensitivePatterns.some(pattern => normalized.includes(pattern.toLowerCase()))
}
```

### 敏感命令检查

```typescript
// src/util/command.ts

/**
 * 危险命令模式
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/,           // 强制删除
  /:\(\)\{.*;\};/,      // Fork bomb
  />\s*\/dev\/sd/,      // 写入磁盘
  /mkfs/,               // 格式化
  /dd\s+if=/,           // dd 命令
  /chmod\s+777/,        // 危险权限
  /curl.*\|\s*bash/,    // 远程执行
  /wget.*\|\s*bash/,    // 远程执行
  /eval\s+/,            // eval 执行
  /exec\s+/,            // exec 执行
]

/**
 * 检查危险命令
 */
export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(command))
}

/**
 * 获取命令风险等级
 */
export function getCommandRiskLevel(command: string): "low" | "medium" | "high" {
  // 高风险：删除、格式化、远程执行
  if (/rm|mkfs|dd|curl.*bash|wget.*bash/i.test(command)) {
    return "high"
  }
  
  // 中风险：修改权限、网络操作
  if (/chmod|chown|curl|wget|scp|rsync/i.test(command)) {
    return "medium"
  }
  
  return "low"
}
```

## 与 Agent 集成

### 权限检查集成

```typescript
// 在 Agent 中的使用示例

import { PermissionManager, DEFAULT_RULES, PermissionRequest } from "../permission"
import { isSensitivePath, isWithinWorkingDirectory } from "../util/path"
import { isDangerousCommand, getCommandRiskLevel } from "../util/command"

// 创建权限管理器
const permission = new PermissionManager(DEFAULT_RULES)

// 检查权限
async function checkToolPermission(
  toolName: string,
  params: Record<string, unknown>,
  callbacks: AgentCallbacks
): Promise<boolean> {
  // 提取模式
  let patterns: string[] | undefined
  
  if (["read", "write", "edit"].includes(toolName) && params.path) {
    const path = String(params.path)
    
    // 安全检查：路径遍历
    if (!isWithinWorkingDirectory(path, workingDirectory)) {
      return false
    }
    
    // 敏感路径警告
    if (isSensitivePath(path)) {
      console.warn(`Warning: Accessing sensitive path: ${path}`)
    }
    
    patterns = [path]
  }
  
  if (toolName === "bash" && params.command) {
    const command = String(params.command)
    
    // 危险命令检查
    if (isDangerousCommand(command)) {
      console.error(`Dangerous command blocked: ${command}`)
      return false
    }
    
    patterns = [command]
  }
  
  const request: PermissionRequest = {
    tool: toolName,
    params,
    patterns,
  }
  
  const action = permission.check(request)
  
  if (action === "allow") return true
  if (action === "deny") return false
  
  // "ask" - 需要用户确认
  return callbacks.onToolCall?.(toolName, params) ?? false
}
```

## 用户确认交互

### TUI 中的确认对话框

```typescript
// 在 TUI 中实现确认对话框

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
      onConfirm(true, true)  // 记住选择
    } else {
      onConfirm(false)
    }
  }
  
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Text bold color="yellow">Tool Permission Required</Text>
      <Text></Text>
      <Text>Tool: <Text bold>{tool}</Text></Text>
      <Text>Parameters:</Text>
      <Box marginLeft={2}>
        <Text dimColor>{JSON.stringify(params, null, 2)}</Text>
      </Box>
      <Text></Text>
      <Text>Allow this action?</Text>
      <Text dimColor>y = Yes, ya = Yes (always), n = No</Text>
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

## 配置示例

### 通过配置文件定义规则

```json
// .nano-agent/permissions.json
{
  "rules": [
    {
      "tool": "read",
      "action": "allow"
    },
    {
      "tool": "write",
      "action": "ask",
      "patterns": ["/src/**", "/lib/**"]
    },
    {
      "tool": "write",
      "action": "deny",
      "patterns": ["/.env", "/config/secrets.*"]
    },
    {
      "tool": "bash",
      "action": "ask"
    },
    {
      "tool": "bash",
      "action": "deny",
      "patterns": ["rm -rf *", "rm -rf /"]
    }
  ]
}
```

### 加载配置

```typescript
import fs from "fs/promises"
import path from "path"

async function loadPermissionRules(projectDir: string): Promise<PermissionRule[]> {
  const configPath = path.join(projectDir, ".nano-agent", "permissions.json")
  
  try {
    const content = await fs.readFile(configPath, "utf-8")
    const config = JSON.parse(content)
    return config.rules
  } catch {
    // 配置文件不存在，使用默认规则
    return DEFAULT_RULES
  }
}
```

## 小结

本章实现了权限控制系统，包括：

1. **权限规则** - allow/deny/ask 三种动作
2. **模式匹配** - 支持 glob 风格的路径匹配
3. **安全检查** - 路径遍历防护和危险命令检测
4. **预定义规则** - 多种安全级别的规则集

**关键要点**：

- 权限系统是 AI Agent 安全的关键防线
- 模式匹配需要支持通配符和路径层级
- 敏感操作需要额外的检查和警告
- 用户确认是最后一道防线

下一章我们将实现会话管理系统，包括会话状态、Token 统计和持久化存储。

## 参考资料

- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Linux File Permissions](https://www.linux.com/training/understanding-linux-file-permissions/)
- [Glob Pattern Matching](https://en.wikipedia.org/wiki/Glob_(programming))
- [Principle of Least Privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege)
