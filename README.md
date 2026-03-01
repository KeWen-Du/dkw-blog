# dkw-blog

个人技术博客，基于 Next.js 16 构建，使用 TypeScript 和 Tailwind CSS 开发。

## 🚀 在线访问

- **博客地址**: https://dkw-blog.vercel.app/
- **GitHub 仓库**: https://github.com/KeWen-Du/dkw-blog

## ✨ 技术栈

- **Next.js 16** - React 框架
- **React 19** - UI 库
- **TypeScript** - 类型安全
- **Tailwind CSS 4** - 样式框架
- **gray-matter** - Markdown 解析
- **react-markdown** - Markdown 渲染

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

## 📄 许可证

MIT
