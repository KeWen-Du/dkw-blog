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
- **react-syntax-highlighter** - 代码高亮
- **remark-math / rehype-katex** - 数学公式支持

### 项目架构

```
dkw-blog/
├── app/                    # Next.js App Router 页面
│   ├── layout.tsx         # 根布局（导航栏、页脚、主题切换等）
│   ├── page.tsx           # 首页（Hero 区域、最新文章）
│   ├── about/             # 关于页面
│   ├── archive/           # 文章归档页面
│   ├── search/            # 搜索页面
│   ├── tags/              # 标签页面
│   │   ├── page.tsx       # 标签列表
│   │   └── [tag]/         # 单个标签详情
│   ├── rss/               # RSS 订阅
│   ├── robots.ts          # robots.txt
│   └── sitemap.ts         # 站点地图
├── components/            # React 组件
│   ├── Navigation.tsx     # 导航栏组件
│   ├── Footer.tsx         # 页脚组件
│   ├── Container.tsx      # 容器组件
│   ├── ErrorBoundary.tsx  # 错误边界
│   ├── MarkdownRenderer.tsx # Markdown 渲染器（支持代码高亮、公式、图片优化）
│   ├── ReadingProgress.tsx # 阅读进度条
│   ├── TableOfContents.tsx # 目录
│   ├── SearchInput.tsx    # 搜索输入框（支持模糊搜索和历史记录）
│   ├── ShareButtons.tsx   # 社交分享按钮
│   ├── ThemeToggle.tsx    # 主题切换
│   └── BackToTop.tsx      # 返回顶部
├── lib/                   # 工具函数
│   ├── posts.ts           # 文章数据获取和处理
│   ├── types.ts           # TypeScript 类型定义
│   ├── config.ts          # 网站配置
│   ├── search.ts          # 搜索功能（模糊搜索）
│   ├── tags.ts            # 标签管理
│   └── archive.ts         # 归档功能
├── posts/                 # Markdown 文章源文件
└── public/                # 静态资源
```

### 功能特性

- **博客文章系统**：支持 Markdown 格式的文章，包含标题、日期、摘要、标签等元数据
- **响应式设计**：使用 Tailwind CSS 实现移动端和桌面端适配
- **暗色模式支持**：内置暗色主题切换
- **静态生成**：所有页面和文章在构建时预渲染
- **字体优化**：使用 Next.js 字体优化功能（Geist 字体）
- **代码高亮**：支持多种语言的语法高亮（react-syntax-highlighter）
- **数学公式**：支持 LaTeX 数学公式渲染（KaTeX）
- **图片优化**：使用 Next.js Image 组件优化图片加载
- **阅读进度**：显示当前阅读进度条
- **目录导航**：自动生成文章目录
- **搜索功能**：支持模糊搜索和搜索历史
- **标签系统**：按标签分类浏览文章
- **归档功能**：按时间查看文章
- **社交分享**：支持 Twitter、Facebook、LinkedIn、微博分享
- **阅读时间**：自动估算文章阅读时间
- **相关文章**：基于标签推荐相关文章
- **RSS 订阅**：支持 RSS feed
- **SEO 优化**：Open Graph、Twitter Card、JSON-LD 结构化数据、robots.txt、sitemap.xml

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
- 类型定义集中在 `lib/types.ts`

### 样式规范

- 使用 Tailwind CSS 类名进行样式设计
- 支持暗色模式，所有颜色类需要同时包含 light 和 dark 模式变体
- 使用响应式前缀（sm:, md:, lg:）实现响应式布局

### 导航组件

- Navigation 组件包含主要链接：首页、文章、关于、搜索、归档
- 使用 Next.js Link 组件进行客户端导航
- 支持悬停状态和暗色模式
- 集成 ThemeToggle 组件

### 文章数据获取

使用 `lib/posts.ts` 中的函数处理文章数据：

- `getAllPosts()` - 获取所有文章，按日期降序排列
- `getPostBySlug(slug)` - 根据 slug 获取单篇文章
- `getAllPostSlugs()` - 获取所有文章的 slug 列表
- `getRelatedPosts(slug, tags, limit)` - 获取相关文章推荐
- `calculateReadingTime(content)` - 计算阅读时间

### 搜索功能

使用 `lib/search.ts` 中的搜索功能：

- `searchPosts(query)` - 模糊搜索文章
- 支持标题、内容、标签搜索
- 使用 Levenshtein 距离算法进行模糊匹配
- 搜索历史记录通过 localStorage 保存

### 性能优化

- 使用 React.lazy 懒加载 SyntaxHighlighter
- 项目列表缓存 5 分钟
- 图片使用 Next.js Image 组件优化
- 代码分割和动态导入

### SEO 优化

- Open Graph 元数据
- Twitter Card
- JSON-LD 结构化数据（BlogPosting）
- robots.txt
- sitemap.xml
- 语义化 HTML 标签

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

### 环境变量

创建 `.env.local` 文件配置环境变量：

```env
NEXT_PUBLIC_SITE_NAME=dkw-blog
NEXT_PUBLIC_SITE_URL=https://dkw-blog.vercel.app
NEXT_PUBLIC_AUTHOR_NAME=KeWen Du
NEXT_PUBLIC_GITHUB_URL=https://github.com/KeWen-Du
```

## 注意事项

- 所有新文章必须添加到 `posts/` 目录
- 修改文章元数据格式时需要同步更新 `lib/types.ts` 中的类型定义
- 添加新页面时需要确保在 Navigation 组件中添加相应的导航链接
- 使用 TypeScript 编写所有新代码，确保类型安全
- 标签包含特殊字符（如空格）时，使用 encodeURIComponent/decodeURIComponent 处理
- remarkPlugins 和 rehypePlugins 使用类型断言 `as any` 避免类型兼容性问题
- excerpt 和 tags 字段需要提供默认值，避免 undefined 类型错误