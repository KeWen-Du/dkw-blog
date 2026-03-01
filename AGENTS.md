# dkw-blog 项目上下文

## 项目概述

dkw-blog 是一个基于 Next.js 16 构建的个人技术博客网站，采用 TypeScript 开发，使用 Tailwind CSS 进行样式设计。博客采用静态生成的方式，内容以 Markdown 文件形式存储在 `posts/` 目录中。

### 核心技术栈

- **Next.js 16.1.6** - React 框架，支持 App Router
- **React 19.2.3** - UI 库
- **TypeScript 5** - 类型安全的 JavaScript
- **Tailwind CSS 4** - 实用优先的 CSS 框架
- **gray-matter 4.0.3** - 解析 Markdown frontmatter
- **react-markdown 10.1.0** - Markdown 渲染组件

### 项目架构

```
dkw-blog/
├── app/                    # Next.js App Router 页面
│   ├── layout.tsx         # 根布局（导航栏、页脚）
│   ├── page.tsx           # 首页
│   ├── about/             # 关于页面
│   └── posts/             # 文章相关页面
│       ├── page.tsx       # 文章列表页
│       └── [slug]/        # 动态文章详情页
│           └── page.tsx
├── components/            # React 组件
│   ├── Navigation.tsx     # 导航栏组件
│   └── Footer.tsx         # 页脚组件
├── lib/                   # 工具函数
│   └── posts.ts           # 文章数据获取和处理
├── posts/                 # Markdown 文章源文件
│   ├── hello-world.md
│   ├── iflow-run-introduction.md
│   └── nextjs-introduction.md
└── public/                # 静态资源
```

### 功能特性

- **博客文章系统**：支持 Markdown 格式的文章，包含标题、日期、摘要、标签等元数据
- **响应式设计**：使用 Tailwind CSS 实现移动端和桌面端适配
- **暗色模式支持**：内置暗色主题切换
- **静态生成**：所有页面和文章在构建时预渲染
- **字体优化**：使用 Next.js 字体优化功能（Geist 字体）

## 构建和运行

### 开发环境

```bash
npm run dev
```

启动开发服务器，访问 http://localhost:3000

### 生产构建

```bash
npm run build
```

构建生产版本

### 启动生产服务器

```bash
npm start
```

启动生产服务器（需要先运行 `npm run build`）

### 代码检查

```bash
npm run lint
```

运行 ESLint 检查代码质量

## 开发约定

### 文件结构规范

- 所有页面组件放在 `app/` 目录下，遵循 Next.js App Router 约定
- 可复用组件放在 `components/` 目录下
- 工具函数和数据获取逻辑放在 `lib/` 目录下
- Markdown 文章放在 `posts/` 目录下，文件名使用 kebab-case 格式

### Markdown 文章格式

所有文章必须包含 frontmatter 元数据：

```markdown
---
title: "文章标题"
date: "YYYY-MM-DD"
excerpt: "文章摘要"
tags: ["标签1", "标签2"]
---

文章内容...
```

### TypeScript 配置

- 启用严格模式（strict: true）
- 使用路径别名 `@/*` 指向项目根目录
- 目标版本：ES2017

### 样式规范

- 使用 Tailwind CSS 类名进行样式设计
- 支持暗色模式，所有颜色类需要同时包含 light 和 dark 模式变体
- 使用响应式前缀（sm:, md:, lg:）实现响应式布局

### 导航组件

- Navigation 组件包含三个主要链接：首页、文章、关于
- 使用 Next.js Link 组件进行客户端导航
- 支持悬停状态和暗色模式

### 文章数据获取

使用 `lib/posts.ts` 中的函数处理文章数据：

- `getAllPosts()` - 获取所有文章，按日期降序排列
- `getPostBySlug(slug)` - 根据 slug 获取单篇文章
- `getAllPostSlugs()` - 获取所有文章的 slug 列表

### 字体使用

项目使用 Geist 字体家族：
- `geistSans` - 正文和标题
- `geistMono` - 等宽字体（代码等）

## 部署

### 生产环境

- **在线地址**: https://dkw-blog.vercel.app/
- **GitHub 仓库**: https://github.com/KeWen-Du/dkw-blog
- **部署平台**: Vercel
- **自动部署**: 每次推送到 master 分支后自动触发构建和部署

### 本地开发部署

项目设计为在 Vercel 上部署，支持零配置部署。也可以部署到其他支持 Next.js 的平台。

## 注意事项

- 所有新文章必须添加到 `posts/` 目录
- 修改文章元数据格式时需要同步更新 `lib/posts.ts` 中的类型定义
- 添加新页面时需要确保在 Navigation 组件中添加相应的导航链接
- 使用 TypeScript 编写所有新代码，确保类型安全