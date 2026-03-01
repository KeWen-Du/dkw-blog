# dkw-blog

个人技术博客，基于 Next.js 16 构建，使用 TypeScript 和 Tailwind CSS 开发。

## 🚀 在线访问

- **博客地址**: https://dkw-blog.vercel.app/
- **GitHub 仓库**: https://github.com/KeWen-Du/dkw-blog

## ✨ 功能特性

- 📝 **Markdown 文章** - 支持完整的 Markdown 语法
- 🎨 **代码高亮** - 支持多种语言的语法高亮
- 🧮 **数学公式** - 支持 LaTeX 数学公式渲染
- 🖼️ **图片优化** - 自动优化图片加载
- 🌓 **暗色模式** - 内置主题切换
- 📱 **响应式设计** - 完美适配移动端和桌面端
- 🔍 **模糊搜索** - 智能搜索文章内容
- 🏷️ **标签系统** - 按标签分类浏览
- 📅 **归档功能** - 按时间查看文章
- 📖 **阅读进度** - 显示当前阅读进度
- 📑 **目录导航** - 自动生成文章目录
- 🔗 **社交分享** - 支持多平台分享
- ⏱️ **阅读时间** - 自动估算阅读时间
- 🎯 **相关文章** - 基于标签推荐相关文章
- 📡 **RSS 订阅** - 支持 RSS feed
- 🔍 **SEO 优化** - 完善的 SEO 支持

## 🛠️ 技术栈

- **Next.js 16** - React 框架，支持 App Router
- **React 19** - UI 库
- **TypeScript** - 类型安全
- **Tailwind CSS 4** - 实用优先的 CSS 框架
- **gray-matter** - Markdown frontmatter 解析
- **react-markdown** - Markdown 渲染
- **react-syntax-highlighter** - 代码高亮
- **remark-math / rehype-katex** - 数学公式支持

## 📦 安装依赖

```bash
npm install
```

## 🛠️ 开发

启动开发服务器：

```bash
npm run dev
```

访问 http://localhost:3000 查看结果。

## 🏗️ 构建

构建生产版本：

```bash
npm run build
```

启动生产服务器：

```bash
npm start
```

## 📝 添加新文章

在 `posts/` 目录下创建新的 Markdown 文件，文件格式如下：

```markdown
---
title: "文章标题"
date: "YYYY-MM-DD"
excerpt: "文章摘要"
tags: ["标签1", "标签2"]
---

文章内容...
```

## 🔧 代码检查

```bash
npm run lint
```

## 📁 项目结构

```
dkw-blog/
├── app/                    # Next.js App Router 页面
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 首页
│   ├── about/             # 关于页面
│   ├── archive/           # 归档页面
│   ├── search/            # 搜索页面
│   ├── tags/              # 标签页面
│   ├── rss/               # RSS 订阅
│   ├── robots.ts          # robots.txt
│   └── sitemap.ts         # 站点地图
├── components/            # React 组件
│   ├── Navigation.tsx     # 导航栏
│   ├── Footer.tsx         # 页脚
│   ├── MarkdownRenderer.tsx # Markdown 渲染器
│   ├── SearchInput.tsx    # 搜索输入
│   ├── ShareButtons.tsx   # 分享按钮
│   └── ...
├── lib/                   # 工具函数
│   ├── posts.ts           # 文章数据处理
│   ├── search.ts          # 搜索功能
│   ├── tags.ts            # 标签管理
│   └── ...
├── posts/                 # Markdown 文章
└── public/                # 静态资源
```

## 📄 许可证

MIT
