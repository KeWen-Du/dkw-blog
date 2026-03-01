---
title: "iFlow-Run：一个强大的 iFlow CLI 会话可视化与管理工具"
date: "2026-03-01"
excerpt: "iflow-run 是一个基于 Node.js + Express 的 Web 应用，用于可视化和管理 iFlow CLI 的会话历史。"
tags: ["iFlow CLI", "Node.js", "工具开发"]
---

# iFlow-Run：一个强大的 iFlow CLI 会话可视化与管理工具

## 前言

在使用 iFlow CLI 进行日常开发时，我们经常会遇到这样的问题：

- 如何快速回顾之前的会话记录？
- 如何搜索特定问题的解决方案？
- 如何查看 Token 使用情况和成本统计？
- 如何导出会话用于文档或分享？

为了解决这些问题，我开发了一个开源项目 **iflow-run**，它提供了一个可视化的 Web 界面，让你能够方便地查看、搜索和管理 iFlow CLI 的所有会话历史。

## 项目简介

**iflow-run** 是一个基于 Node.js + Express 的 Web 应用，通过纯前端技术实现，无需复杂的构建过程。它能够自动读取你系统中的 iFlow CLI 会话数据，并提供丰富的查看和管理功能。

### 项目地址

- **GitHub**: https://github.com/KeWen-Du/iflow-run
- **npm**: https://www.npmjs.com/package/iflow-run
- **当前版本**: 1.0.5
- **许可证**: MIT

## 核心功能

### 1. 项目与会话管理

自动扫描并显示所有 iFlow CLI 创建的项目，每个项目下的所有会话一目了然：

- 会话预览：快速预览会话的第一条消息内容
- 时间排序：按修改时间排序，方便找到最近的会话
- 会话统计：显示每个项目的会话数量

### 2. 消息详情查看

完整展示会话中的所有消息，包括：

- **用户消息**：清晰标注用户输入
- **助手响应**：显示 AI 的完整回复
- **工具调用**：展示工具名称、输入参数
- **工具结果**：显示工具执行的输出结果

### 3. 智能搜索功能

强大的搜索能力，支持：

- **关键词搜索**：在所有消息中搜索关键词
- **类型筛选**：按消息类型筛选（用户/助手/工具调用）
- **时间范围**：按时间范围过滤会话
- **分页显示**：大量结果分页展示，提升性能

### 4. Token 统计与成本分析

自动统计每次会话的 Token 使用情况：

- 模型名称显示
- 输入/输出 Token 数量
- 执行时间统计
- 预估成本计算

### 5. 环境追踪

自动检测并显示环境变更：

- 工作目录变更提示
- Git 分支切换提示
- 版本信息显示

### 6. 导出功能

支持将会话导出为多种格式：

- **Markdown 格式**：适合文档和分享
- **JSON 格式**：适合数据处理和二次开发

## 技术架构

### 技术栈

```
后端：Node.js + Express
前端：HTML5 + CSS3 + JavaScript（无框架）
样式：自定义 CSS，暗色主题
模块系统：CommonJS
```

### 项目结构

```
iflow-run/
├── server.js              # Express 服务器主文件
├── package.json           # 项目配置和依赖
├── bin/
│   └── iflow-run.js      # CLI 入口文件（全局安装使用）
├── public/                # 前端静态文件
│   ├── index.html         # 主页面
│   ├── app.js             # 前端应用逻辑
│   ├── styles.css         # 样式文件
│   └── test.html          # 测试页面
└── test_screenshot.py     # 自动化测试脚本
```

### 核心技术亮点

#### 1. 性能优化

使用 Map 数据结构优化工具结果查找，从 O(n²) 优化到 O(1)

#### 2. 缓存机制

项目列表缓存 5 分钟，减少磁盘 I/O

#### 3. 异步文件操作

使用 fs.promises 替代同步操作，提升并发处理能力

#### 4. 预览优化

只读取前 2 行生成预览，大幅提升加载速度

## 快速开始

### 方式一：全局安装（推荐）

```bash
# 1. 全局安装
npm install -g iflow-run

# 2. 启动服务
iflow-run

# 3. 访问应用
# 打开浏览器访问 http://localhost:3000
```

### 方式二：本地运行

```bash
# 1. 克隆项目
git clone https://github.com/KeWen-Du/iflow-run.git
cd iflow-run

# 2. 安装依赖
npm install

# 3. 启动服务
npm start

# 4. 访问应用
# 打开浏览器访问 http://localhost:3000
```

## 高级配置

### 命令行参数

```bash
# 指定端口
iflow-run --port=8080

# 指定 iflow 数据目录
iflow-run --dir=/path/to/.iflow

# 后台运行
iflow-run --daemon

# 停止后台服务
iflow-run --stop

# 查看帮助
iflow-run --help

# 查看版本
iflow-run --version
```

### 环境变量配置

```bash
# Linux/Mac
export IFLOW_RUN_PORT=8080
export IFLOW_RUN_DIR=/path/to/.iflow
iflow-run

# Windows
set IFLOW_RUN_PORT=8080
set IFLOW_RUN_DIR=C:\path\to\.iflow
iflow-run
```

## API 接口

### 获取所有项目

```http
GET /api/projects
```

响应示例：

```json
[
  {
    "id": "project-id",
    "name": "项目名称",
    "sessionCount": 5,
    "sessions": [
      {
        "id": "session-1234567890",
        "file": "session-1234567890.jsonl",
        "mtime": "2024-01-01T12:00:00.000Z",
        "preview": "会话预览文本..."
      }
    ]
  }
]
```

### 获取会话详情

```http
GET /api/sessions/:projectId/:sessionId
```

响应示例：

```json
[
  {
    "uuid": "message-uuid",
    "type": "user",
    "timestamp": 1704110400000,
    "cwd": "/path/to/project",
    "gitBranch": "main",
    "message": {
      "content": "用户消息内容"
    }
  },
  {
    "uuid": "message-uuid",
    "type": "assistant",
    "timestamp": 1704110401000,
    "message": {
      "model": "glm-4.7",
      "usage": {
        "input_tokens": 1000,
        "output_tokens": 500
      },
      "content": [
        {
          "type": "text",
          "text": "助手响应文本"
        }
      ]
    }
  }
]
```

### 搜索会话

```http
GET /api/search?q=关键词&page=1&limit=20&type=all
```

查询参数：

- `q`: 搜索关键词
- `page`: 页码，默认 1
- `limit`: 每页结果数，默认 20
- `type`: 消息类型筛选（all/user/assistant），默认 all
- `startDate`: 开始时间戳（可选）
- `endDate`: 结束时间戳（可选）

响应示例：

```json
{
  "results": [
    {
      "projectId": "project-id",
      "projectName": "项目名称",
      "sessionId": "session-1234567890",
      "content": "消息内容预览...",
      "type": "user",
      "timestamp": 1704110400000,
      "uuid": "message-uuid"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

## 使用场景

### 场景 1：回顾会话记录

当你需要回顾之前与 iFlow CLI 的对话时，可以通过项目列表快速找到对应的会话，查看完整的对话内容。

### 场景 2：搜索解决方案

遇到问题时，可以在搜索框中输入关键词，快速找到之前相关的会话和解决方案。

### 场景 3：Token 成本分析

通过 Token 统计功能，了解每次会话的资源消耗，优化使用策略。

### 场景 4：导出文档

将有价值的会话导出为 Markdown 格式，用于编写文档或分享给团队成员。

## 界面展示

### 主界面

显示所有项目和会话列表，支持快速预览和搜索。

### 会话详情

完整展示会话中的所有消息，包括工具调用和结果。

### 搜索结果

显示搜索结果，支持分页和筛选。

## 常见问题

### Q1: 应用启动后无法读取项目数据？

**A**: 请检查以下几点：

1. 确认 `.iflow` 目录路径是否正确
2. 确认目录下是否有 `projects` 子目录
3. 确认项目目录中是否有 `session-*.jsonl` 文件
4. 尝试使用 `--dir` 参数指定正确的 iflow 目录

### Q2: 消息显示为空？

**A**: 可能的原因：

1. 会话文件格式不正确
2. 消息内容不包含可显示的文本
3. 使用了消息筛选功能，当前筛选条件下没有匹配的消息

### Q3: 启动时提示端口被占用怎么办？

**A**: 从 v1.0.1 版本开始，应用会自动检测端口占用情况。如果 3000 端口被占用，会自动使用下一个可用端口（3001、3002 等）。你也可以使用 `--port` 参数指定其他端口：

```bash
iflow-run --port=8080
```

### Q4: 如何在后台运行 iflow-run？

**A**: 使用后台运行模式：

```bash
# 启动后台服务
iflow-run --daemon

# 停止后台服务
iflow-run --stop
```

## 开发与贡献

### 本地开发

```bash
# 克隆项目
git clone https://github.com/KeWen-Du/iflow-run.git
cd iflow-run

# 安装依赖
npm install

# 启动开发服务器
npm start
```

### 提交代码

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

### 代码规范

- **前端**: 使用模块化函数组织代码，采用事件委托处理动态元素
- **后端**: RESTful API 风格，包含完善的错误处理
- **样式**: 使用 CSS 变量定义设计令牌，支持主题定制

## 未来规划

- [ ] 添加实时查看正在进行的会话功能
- [ ] 添加用户配置功能（自定义数据目录、主题、缓存时间等）
- [ ] 优化大量会话的性能（服务端分页加载）
- [ ] 添加更多筛选条件（按模型、按状态等）
- [ ] 支持批量操作（删除、导出多个会话）
- [ ] 添加数据可视化图表（Token 使用趋势、工具使用统计等）
- [ ] 支持多语言界面
- [ ] 添加键盘快捷键支持

## 总结

iflow-run 是一个简单易用但功能强大的 iFlow CLI 会话管理工具。它不仅提供了基本的会话查看功能，还包含搜索、统计、导出等高级功能，能够显著提升使用 iFlow CLI 的效率。

如果你也在使用 iFlow CLI，不妨试试这个工具，相信会给你带来更好的使用体验！

## 相关链接

- **GitHub**: https://github.com/KeWen-Du/iflow-run
- **npm**: https://www.npmjs.com/package/iflow-run
- **问题反馈**: https://github.com/KeWen-Du/iflow-run/issues

---

**欢迎 Star、Fork 和提 PR！** 如果这个项目对你有帮助，请不要吝啬你的 Star ⭐