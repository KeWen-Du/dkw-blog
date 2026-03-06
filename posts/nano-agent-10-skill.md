---
title: "从零到一实现 nano-agent（十）：技能系统"
date: "2025-01-15"
excerpt: "实现可插拔的 Skill 技能系统，支持技能发现、动态加载和模板注入，让 Agent 获得领域专业知识。"
tags: ["AI", "Skill", "Plugin", "TypeScript", "扩展系统"]
series:
  slug: "nano-agent"
  title: "从零到一实现 nano-agent"
  order: 10
---

# 从零到一实现 nano-agent（十）：Skill 技能系统

## 前言

Skill 系统让 Agent 能够获得特定领域的专业知识。通过加载技能包，Agent 可以学习最佳实践、使用代码模板、遵循特定规范。本章将实现一个可插拔的 Skill 系统。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 插件化设计 | ⭐⭐⭐⭐ | 架构设计 | ✅ |
| 技能发现机制 | ⭐⭐⭐ | 自动化设计 | ✅ |
| Frontmatter 解析 | ⭐⭐ | 文本处理 | ✅ |
| 动态加载 | ⭐⭐⭐ | 运行时扩展 | ✅ |

## 面试考点

1. 如何设计可扩展的插件系统？
2. 技能发现和加载的流程是什么？
3. 如何让 Agent 动态获得新能力？

## Skill 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Skill System                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Skill Manager                       │   │
│  │  - discover(baseDir) → void                         │   │
│  │  - get(name) → SkillInfo                            │   │
│  │  - list() → SkillInfo[]                             │   │
│  │  - search(query) → SkillInfo[]                      │   │
│  │  - formatSkill(skill) → string                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Skill Discovery                       │   │
│  │                                                      │   │
│  │  扫描目录:                                           │   │
│  │  - .nano-agent/skills/                              │   │
│  │  - .agents/skills/                                  │   │
│  │  - .claude/skills/                                  │   │
│  │  - ~/.nano-agent/skills/                            │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Skill Package                       │   │
│  │                                                      │   │
│  │  react-component/                                    │   │
│  │  ├── SKILL.md           # 技能元数据和指令           │   │
│  │  └── templates/                                     │   │
│  │      ├── component.tsx  # 组件模板                  │   │
│  │      └── test.tsx       # 测试模板                  │     │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Skill 类型定义

```typescript
// src/skill/skill.ts

import fs from "fs/promises"
import path from "path"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "skill" })

/**
 * Skill 元数据
 */
export interface SkillMeta {
  name: string
  description: string
  version?: string
  author?: string
  tags?: string[]
}

/**
 * Skill 完整信息
 */
export interface SkillInfo extends SkillMeta {
  location: string           // SKILL.md 文件路径
  content: string            // 技能指令内容
  templates?: Map<string, string>  // 模板文件
}
```

## Frontmatter 解析

```typescript
// src/skill/skill.ts (续)

/**
 * 简单的 frontmatter 解析器
 * 支持 YAML 格式的元数据
 */
function parseFrontmatter(content: string): { meta: SkillMeta; body: string } {
  // 匹配 --- 包围的 frontmatter
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    // 没有 frontmatter，使用整个内容作为 body
    return {
      meta: { name: "", description: "" },
      body: content,
    }
  }

  const frontmatter = match[1]
  const body = match[2]

  // 解析 YAML 键值对
  const meta: SkillMeta = { name: "", description: "" }
  const lines = frontmatter.split("\n")

  for (const line of lines) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value: string = line.slice(colonIndex + 1).trim()

    // 移除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    // 解析数组 [item1, item2]
    if (value.startsWith("[") && value.endsWith("]")) {
      const items = value
        .slice(1, -1)
        .split(",")
        .map(s => s.trim().replace(/^['"]|['"]$/g, ""))
      ;(meta as any)[key] = items
      continue
    }

    // 赋值
    if (key === "name") meta.name = value
    else if (key === "description") meta.description = value
    else if (key === "version") meta.version = value
    else if (key === "author") meta.author = value
    else if (key === "tags") {
      meta.tags = value.split(",").map(s => s.trim().replace(/^['"]|['"]$/g, ""))
    }
  }

  return { meta, body }
}
```

## SkillManager 实现

```typescript
// src/skill/skill.ts (续)

/**
 * Skill 管理器
 */
export class SkillManager {
  private skills: Map<string, SkillInfo> = new Map()
  private searchPaths: string[]
  private loaded = false

  constructor(searchPaths: string[] = []) {
    // 默认搜索路径
    this.searchPaths = [
      ".nano-agent/skills",
      ".agents/skills",
      ".claude/skills",
      "~/.nano-agent/skills",
      ...searchPaths,
    ]
  }

  /**
   * 发现并加载所有 Skills
   */
  async discover(baseDir: string): Promise<void> {
    if (this.loaded) return

    log.info("Discovering skills...", { 
      baseDir, 
      searchPaths: this.searchPaths 
    })

    for (const searchPath of this.searchPaths) {
      let skillDir: string

      // 处理 ~ 开头的路径（用户主目录）
      if (searchPath.startsWith("~")) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || ""
        skillDir = path.join(homeDir, searchPath.slice(1))
      } else {
        skillDir = path.join(baseDir, searchPath)
      }

      await this.scanDirectory(skillDir)
    }

    this.loaded = true
    log.info("Skills discovered", { count: this.skills.size })
  }

  /**
   * 扫描目录查找 Skills
   */
  private async scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = path.join(dir, entry.name)
        const skillFile = path.join(skillPath, "SKILL.md")

        await this.loadSkill(skillFile, skillPath)
      }
    } catch (error: any) {
      // 目录不存在，忽略
      if (error.code !== "ENOENT") {
        log.debug("Could not scan directory", { 
          dir, 
          error: error.message 
        })
      }
    }
  }

  /**
   * 加载单个 Skill
   */
  private async loadSkill(skillFile: string, skillPath: string): Promise<void> {
    try {
      const content = await fs.readFile(skillFile, "utf-8")
      const { meta, body } = parseFrontmatter(content)

      if (!meta.name) {
        log.warn("Skill missing name", { file: skillFile })
        return
      }

      if (!meta.description) {
        meta.description = `Skill: ${meta.name}`
      }

      // 加载模板文件
      const templates = await this.loadTemplates(skillPath)

      const skillInfo: SkillInfo = {
        ...meta,
        location: skillFile,
        content: body.trim(),
        templates,
      }

      this.skills.set(meta.name, skillInfo)
      log.debug("Skill loaded", { name: meta.name, location: skillFile })
    } catch (error: any) {
      log.debug("Could not load skill", { 
        file: skillFile, 
        error: error.message 
      })
    }
  }

  /**
   * 加载模板文件
   */
  private async loadTemplates(skillPath: string): Promise<Map<string, string>> {
    const templates = new Map<string, string>()
    const templatesDir = path.join(skillPath, "templates")

    try {
      const entries = await fs.readdir(templatesDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isFile()) continue

        const templatePath = path.join(templatesDir, entry.name)
        const content = await fs.readFile(templatePath, "utf-8")
        templates.set(entry.name, content)
      }
    } catch {
      // 模板目录不存在，忽略
    }

    return templates
  }

  /**
   * 获取指定名称的 Skill
   */
  get(name: string): SkillInfo | undefined {
    return this.skills.get(name)
  }

  /**
   * 列出所有 Skills
   */
  list(): SkillInfo[] {
    return Array.from(this.skills.values())
  }

  /**
   * 按标签筛选 Skills
   */
  findByTag(tag: string): SkillInfo[] {
    return this.list().filter(skill =>
      skill.tags?.includes(tag)
    )
  }

  /**
   * 搜索 Skills
   */
  search(query: string): SkillInfo[] {
    const lowerQuery = query.toLowerCase()
    return this.list().filter(skill =>
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery) ||
      skill.tags?.some(t => t.toLowerCase().includes(lowerQuery))
    )
  }

  /**
   * 格式化 Skill 列表为文本
   */
  formatList(): string {
    const skills = this.list()

    if (skills.length === 0) {
      return "No skills found."
    }

    return skills.map(skill => {
      const tags = skill.tags?.length ? ` [${skill.tags.join(", ")}]` : ""
      return `- **${skill.name}**${tags}: ${skill.description}`
    }).join("\n")
  }

  /**
   * 格式化 Skill 内容（用于注入到系统提示词）
   */
  formatSkill(skill: SkillInfo): string {
    const lines: string[] = [
      `<skill name="${skill.name}">`,
      `# ${skill.name}`,
      "",
      skill.description,
      "",
    ]

    if (skill.version || skill.author) {
      lines.push("---")
      if (skill.version) lines.push(`Version: ${skill.version}`)
      if (skill.author) lines.push(`Author: ${skill.author}`)
      lines.push("")
    }

    lines.push(skill.content)

    if (skill.templates?.size) {
      lines.push("")
      lines.push("## Templates")
      for (const [name, content] of skill.templates) {
        lines.push("")
        lines.push(`### ${name}`)
        lines.push("```")
        lines.push(content)
        lines.push("```")
      }
    }

    lines.push("")
    lines.push("</skill>")

    return lines.join("\n")
  }
}
```

## 全局实例和初始化

```typescript
// src/skill/skill.ts (续)

// 全局 SkillManager 实例
let globalSkillManager: SkillManager | null = null

/**
 * 获取全局 SkillManager 实例
 */
export function getSkillManager(): SkillManager {
  if (!globalSkillManager) {
    globalSkillManager = new SkillManager()
  }
  return globalSkillManager
}

/**
 * 初始化并发现 Skills
 */
export async function initSkillManager(baseDir: string): Promise<SkillManager> {
  const manager = getSkillManager()
  await manager.discover(baseDir)
  return manager
}
```

## Skill 工具实现

```typescript
// src/tool/skill.ts

import z from "zod"
import { ToolDefinition, ToolContext, ToolResult } from "./tool"
import { getSkillManager } from "../skill"
import { Logger } from "../util/logger"

const log = Logger.create({ service: "skill-tool" })

export const skillTool: ToolDefinition = {
  name: "skill",
  description: `Load and use specialized domain knowledge skills.

Commands:
- list: Show all available skills
- get <name>: Load a specific skill's instructions and templates
- search <query>: Find skills by name, description, or tag

Skills provide templates and best practices for specific tasks.`,

  parameters: z.object({
    action: z
      .enum(["list", "get", "search"])
      .describe("Action to perform"),
    name: z
      .string()
      .optional()
      .describe("Skill name (for 'get' action)"),
    query: z
      .string()
      .optional()
      .describe("Search query (for 'search' action)"),
  }),

  async execute(
    params: z.infer<typeof skillTool.parameters>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const manager = getSkillManager()

    switch (params.action) {
      case "list": {
        const output = manager.formatList()
        return {
          title: "Available Skills",
          output,
          metadata: { count: manager.list().length },
        }
      }

      case "get": {
        if (!params.name) {
          throw new Error("Skill name is required for 'get' action")
        }

        const skill = manager.get(params.name)
        if (!skill) {
          throw new Error(`Skill not found: ${params.name}`)
        }

        const output = manager.formatSkill(skill)
        log.info("Skill loaded", { name: params.name })

        return {
          title: `Skill: ${skill.name}`,
          output,
          metadata: {
            name: skill.name,
            description: skill.description,
            hasTemplates: skill.templates?.size ?? 0 > 0,
          },
        }
      }

      case "search": {
        if (!params.query) {
          throw new Error("Query is required for 'search' action")
        }

        const results = manager.search(params.query)
        const output = results.length > 0
          ? results.map(s => `**${s.name}**: ${s.description}`).join("\n")
          : "No skills found matching the query."

        return {
          title: `Search Results: "${params.query}"`,
          output,
          metadata: { 
            query: params.query,
            count: results.length 
          },
        }
      }

      default:
        throw new Error(`Unknown action: ${params.action}`)
    }
  },
}
```

## Skill 示例

### React 组件 Skill

```
// .nano-agent/skills/react-component/SKILL.md

---
name: react-component
description: Create React components following best practices
version: "1.0"
author: "nano-agent"
tags: ["react", "typescript", "frontend"]
---

## Creating React Components

When creating React components, follow these guidelines:

### Component Structure

1. Use functional components with hooks
2. Define props interface with TypeScript
3. Keep components focused and single-responsibility
4. Extract reusable logic into custom hooks

### Naming Conventions

- Component files: PascalCase (e.g., `UserProfile.tsx`)
- Props interface: ComponentNameProps
- Event handlers: handleEventName
- Boolean props: isXxx, hasXxx, shouldXxx

### Example

\`\`\`tsx
interface ButtonProps {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export function Button({ 
  label, 
  onClick, 
  variant = 'primary',
  disabled = false 
}: ButtonProps) {
  return (
    <button
      className={\`btn btn-\${variant}\`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}
\`\`\`

## Best Practices

1. Use TypeScript for type safety
2. Memoize expensive computations with useMemo
3. Use useCallback for event handlers passed as props
4. Keep component state as local as possible
```

### 模板文件

```
// .nano-agent/skills/react-component/templates/component.tsx

interface {{ComponentName}}Props {
  // TODO: Define props
}

export function {{ComponentName}}({ }: {{ComponentName}}Props) {
  return (
    <div className="{{component-name}}">
      {/* TODO: Implement component */}
    </div>
  )
}
```

## 使用示例

### Agent 加载 Skill

```
用户: "帮我创建一个 Button 组件"

Agent:
让我先加载 React 组件技能...

Tool Call:
{
  name: "skill",
  input: { action: "get", name: "react-component" }
}

Result: [技能内容，包括最佳实践和模板]

Agent:
根据技能指导，我来创建 Button 组件...

Tool Call:
{
  name: "write",
  input: {
    path: "/src/components/Button.tsx",
    content: "..." // 根据模板生成
  }
}
```

### 列出可用技能

```
用户: "有哪些技能可用？"

Tool Call:
{
  name: "skill",
  input: { action: "list" }
}

Result:
- **react-component** [react, typescript, frontend]: Create React components following best practices
- **api-design** [api, rest, design]: Design RESTful APIs
- **test-driven** [testing, tdd]: Write tests first
```

## 小结

本章实现了 Skill 技能系统，包括：

1. **Skill 元数据** - frontmatter 格式定义
2. **SkillManager** - 发现、加载、查询技能
3. **Skill 工具** - 集成到工具系统
4. **模板支持** - 代码模板注入

**关键要点**：

- Skill 系统让 Agent 获得领域专业知识
- 自动发现机制简化了技能管理
- 模板支持提高了代码生成质量
- 技能可跨项目共享

下一章我们将实现 TUI 终端界面。

## 参考资料

- [Vim Plugins Architecture](https://learnvimscriptthehardway.stevelosh.com/chapters/57.html)
- [VS Code Extensions](https://code.visualstudio.com/api)
- [Frontmatter Specification](https://jekyllrb.com/docs/front-matter/)
