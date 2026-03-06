---
title: "上下文工程：让 LLM 发挥最大潜能的系统化方法"
date: "2026-03-06"
excerpt: "深入讲解上下文工程的核心概念和实践方法，包括上下文窗口管理、多源上下文融合、上下文压缩与优化、长期记忆策略等，帮助你系统性地设计和优化 LLM 的上下文信息。"
tags: ["Context Engineering", "LLM", "Prompt Engineering", "RAG", "AI应用开发"]
---

# 上下文工程：让 LLM 发挥最大潜能的系统化方法

## 前言

在大模型应用开发领域，有一个越来越受关注的核心理念：**上下文工程（Context Engineering）**。如果说 Prompt Engineering 是"如何向 LLM 提问"，那么 Context Engineering 就是"如何让 LLM 知道它需要知道的一切"。

本文将系统性地讲解上下文工程的核心理念：
- 什么是上下文工程，为什么它如此重要
- 上下文窗口的本质与限制
- 多源上下文的融合策略
- 上下文压缩与优化技术
- 长期记忆与持久化方案

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 上下文工程核心理念 | ⭐⭐⭐ | 高频考点 | ✅ |
| 上下文窗口管理 | ⭐⭐⭐ | 高频考点 | ✅ |
| 多源上下文融合 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 上下文压缩技术 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 长期记忆策略 | ⭐⭐⭐⭐⭐ | 前沿技术 | ✅ |

## 面试考点

1. 什么是上下文工程？它与 Prompt Engineering 有什么区别和联系？
2. 上下文窗口的限制有哪些？如何有效管理上下文窗口？
3. 如何融合多个来源的上下文信息？
4. 上下文压缩有哪些常用技术？
5. 如何实现 LLM 应用的长期记忆？

## 一、上下文工程概述

### 1.1 从 Prompt Engineering 到 Context Engineering

**Prompt Engineering** 关注的是：如何设计有效的提示词，让模型输出期望的结果。

```
Prompt Engineering 的核心问题：
"我该怎么问，才能得到我想要的答案？"
```

**Context Engineering** 关注的是：如何系统性地设计和管理输入给模型的所有上下文信息。

```
Context Engineering 的核心问题：
"模型需要知道什么，才能给出最好的答案？"
```

### 1.2 为什么需要上下文工程

```
┌─────────────────────────────────────────────────────────────────┐
│                      LLM 的输入组成                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ 系统提示词   │  │ 对话历史    │  │ 用户输入    │            │
│  │ System      │  │ Conversation│  │ User Input  │            │
│  │ Prompt      │  │ History     │  │             │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ 检索内容    │  │ 工具描述    │  │ 示例/模板   │            │
│  │ RAG Docs    │  │ Tools       │  │ Examples    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│                    ↓ 所有这些组成「上下文」 ↓                     │
│                                                                 │
│              ┌─────────────────────────┐                        │
│              │      大语言模型 (LLM)    │                        │
│              └─────────────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**核心挑战**：
1. **窗口限制**：模型能接收的 Token 数量有限
2. **信息质量**：不是所有信息都对当前任务有用
3. **信息冲突**：不同来源的信息可能矛盾
4. **成本控制**：Token 消耗直接影响 API 成本

### 1.3 上下文工程的三个层次

| 层次 | 关注点 | 典型技术 |
|------|--------|----------|
| 基础层 | 上下文格式化 | 模板设计、分隔符、结构化输入 |
| 优化层 | 上下文效率 | 压缩、筛选、优先级排序 |
| 系统层 | 上下文架构 | 记忆管理、多源融合、动态组装 |

## 二、上下文窗口的本质

### 2.1 什么是上下文窗口

**上下文窗口（Context Window）** 是模型一次能处理的最大 Token 数量，包括输入和输出。

```
上下文窗口分配示意：

┌────────────────────────────────────────────────────┐
│                  上下文窗口 (128K tokens)            │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────┐     │
│  │           输入上下文 (Input)               │     │
│  │                                          │     │
│  │  System Prompt: 500 tokens               │     │
│  │  Conversation History: 10,000 tokens     │     │
│  │  Retrieved Documents: 20,000 tokens      │     │
│  │  User Query: 200 tokens                  │     │
│  │  ─────────────────────────               │     │
│  │  Total Input: ~30,700 tokens             │     │
│  └──────────────────────────────────────────┘     │
│                                                    │
│  ┌──────────────────────────────────────────┐     │
│  │           输出预留 (Output Buffer)         │     │
│  │                                          │     │
│  │  Reserved for model response: 4,000 tokens│     │
│  └──────────────────────────────────────────┘     │
│                                                    │
│  剩余可用：128K - 30.7K - 4K ≈ 93K tokens         │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 2.2 主流模型的上下文窗口

| 模型 | 上下文窗口 | 特点 |
|------|-----------|------|
| GPT-4 Turbo | 128K | 支持长文档，成本较高 |
| GPT-4o | 128K | 性价比高，速度快 |
| Claude 3.5 Sonnet | 200K | 超长上下文，适合文档分析 |
| Gemini 1.5 Pro | 1M+ | 百万级窗口，适合视频/代码库 |
| DeepSeek V3 | 64K | 性价比高，国产首选 |

### 2.3 窗口限制的应对策略

**策略 1：优先级截断**

```python
def truncate_by_priority(contexts: list[Context], max_tokens: int) -> list[Context]:
    """
    按优先级截断上下文
    
    优先级：系统提示 > 当前输入 > 最近对话 > 检索文档
    """
    priority_order = ['system', 'user_input', 'recent_conversation', 'retrieved_docs']
    
    sorted_contexts = sorted(contexts, key=lambda x: priority_order.index(x.type))
    
    result = []
    current_tokens = 0
    
    for ctx in sorted_contexts:
        if current_tokens + ctx.tokens <= max_tokens:
            result.append(ctx)
            current_tokens += ctx.tokens
        else:
            # 尝试压缩或截断
            remaining = max_tokens - current_tokens
            if remaining > 100:  # 最小有效长度
                truncated = ctx.truncate(remaining)
                result.append(truncated)
            break
    
    return result
```

**策略 2：滑动窗口**

```python
def sliding_window_conversation(
    messages: list[Message], 
    window_size: int = 10,
    keep_first: int = 2
) -> list[Message]:
    """
    滑动窗口：保留最早的几轮 + 最近的 N 轮对话
    """
    if len(messages) <= window_size:
        return messages
    
    # 保留系统消息和最早的几轮
    preserved = messages[:keep_first]
    
    # 取最近的对话
    recent = messages[-(window_size - keep_first):]
    
    return preserved + recent
```

**策略 3：摘要压缩**

```python
async def summarize_and_compress(
    messages: list[Message],
    model: LLM,
    target_tokens: int
) -> list[Message]:
    """
    将早期对话压缩为摘要
    """
    # 分离需要压缩的消息
    to_compress = messages[:-4]  # 保留最近 4 条
    to_keep = messages[-4:]
    
    # 生成摘要
    summary_prompt = f"""
    请将以下对话历史压缩为简洁的摘要，保留关键信息：
    
    {format_messages(to_compress)}
    
    摘要要求：
    1. 保留关键决策和结论
    2. 保留重要的事实信息
    3. 控制在 200 字以内
    """
    
    summary = await model.generate(summary_prompt)
    
    # 构建新的消息列表
    return [
        Message(role="system", content=f"[历史对话摘要]\n{summary}")
    ] + to_keep
```

## 三、多源上下文融合

### 3.1 上下文的来源

```
┌─────────────────────────────────────────────────────────────┐
│                     上下文来源图谱                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│  │   用户侧    │     │   系统侧    │     │   外部侧    │  │
│  ├─────────────┤     ├─────────────┤     ├─────────────┤  │
│  │ • 当前输入  │     │ • 系统提示  │     │ • RAG 文档  │  │
│  │ • 对话历史  │     │ • 角色设定  │     │ • API 数据  │  │
│  │ • 用户画像  │     │ • 工具描述  │     │ • 数据库    │  │
│  │ • 偏好设置  │     │ • 输出模板  │     │ • 实时信息  │  │
│  └─────────────┘     └─────────────┘     └─────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 上下文融合策略

#### 策略 1：层级式融合

```
层级结构：

第一层：系统层（最高优先级）
├── 角色定义
├── 能力边界
└── 输出规范

第二层：知识层
├── RAG 检索文档
├── 知识库信息
└── 领域知识

第三层：交互层
├── 对话历史
├── 用户偏好
└── 上下文状态

第四层：输入层
├── 当前用户输入
└── 具体任务要求
```

**实现示例**

```python
class ContextFusion:
    def __init__(self, tokenizer):
        self.tokenizer = tokenizer
        self.max_tokens = 120000  # 为输出预留空间
    
    def build_context(
        self,
        system_prompt: str,
        retrieved_docs: list[str],
        conversation_history: list[dict],
        user_input: str,
        tools: list[dict] = None
    ) -> str:
        """
        层级式上下文构建
        """
        context_parts = []
        current_tokens = 0
        
        # 第一层：系统提示
        system_context = f"<system>\n{system_prompt}\n</system>\n\n"
        context_parts.append(system_context)
        current_tokens += self.count_tokens(system_context)
        
        # 第二层：工具定义（如果有）
        if tools:
            tools_context = self._format_tools(tools)
            context_parts.append(tools_context)
            current_tokens += self.count_tokens(tools_context)
        
        # 第三层：知识层（RAG 检索结果）
        remaining = self.max_tokens - current_tokens - 5000  # 预留空间
        docs_context = self._format_docs(retrieved_docs, remaining // 2)
        context_parts.append(docs_context)
        current_tokens += self.count_tokens(docs_context)
        
        # 第四层：对话历史
        remaining = self.max_tokens - current_tokens - 2000
        history_context = self._format_history(conversation_history, remaining)
        context_parts.append(history_context)
        current_tokens += self.count_tokens(history_context)
        
        # 第五层：当前输入
        input_context = f"<user>\n{user_input}\n</user>"
        context_parts.append(input_context)
        
        return "\n\n".join(context_parts)
    
    def _format_tools(self, tools: list[dict]) -> str:
        """格式化工具定义"""
        formatted = "<tools>\n可用工具：\n\n"
        for tool in tools:
            formatted += f"- {tool['name']}: {tool['description']}\n"
            formatted += f"  参数: {tool['parameters']}\n\n"
        formatted += "</tools>\n"
        return formatted
    
    def _format_docs(self, docs: list[str], max_tokens: int) -> str:
        """格式化检索文档"""
        formatted = "<knowledge>\n相关参考资料：\n\n"
        current_tokens = self.count_tokens(formatted)
        
        for i, doc in enumerate(docs, 1):
            doc_text = f"[文档 {i}]\n{doc}\n\n"
            doc_tokens = self.count_tokens(doc_text)
            
            if current_tokens + doc_tokens > max_tokens:
                break
            
            formatted += doc_text
            current_tokens += doc_tokens
        
        formatted += "</knowledge>\n"
        return formatted
    
    def _format_history(self, history: list[dict], max_tokens: int) -> str:
        """格式化对话历史"""
        formatted = "<conversation>\n历史对话：\n\n"
        current_tokens = self.count_tokens(formatted)
        
        # 从最近的对话开始
        for msg in reversed(history):
            role = "用户" if msg["role"] == "user" else "助手"
            msg_text = f"{role}: {msg['content']}\n\n"
            msg_tokens = self.count_tokens(msg_text)
            
            if current_tokens + msg_tokens > max_tokens:
                break
            
            formatted = msg_text + formatted  # prepend to maintain order
            current_tokens += msg_tokens
        
        formatted += "</conversation>\n"
        return formatted
    
    def count_tokens(self, text: str) -> int:
        """计算 Token 数量"""
        return len(self.tokenizer.encode(text))
```

#### 策略 2：基于相关性的动态融合

```python
from typing import Protocol
from dataclasses import dataclass

@dataclass
class ContextChunk:
    content: str
    source: str  # 'system', 'rag', 'history', 'user'
    relevance_score: float
    tokens: int

class RelevanceFusion:
    """基于相关性的动态上下文融合"""
    
    def __init__(self, embed_model, llm, max_tokens: int = 100000):
        self.embed_model = embed_model
        self.llm = llm
        self.max_tokens = max_tokens
    
    async def fuse(
        self,
        query: str,
        contexts: list[ContextChunk]
    ) -> str:
        """
        根据与查询的相关性动态选择上下文
        """
        # 1. 计算每个上下文块与查询的相关性
        query_embedding = await self.embed_model.embed(query)
        
        scored_contexts = []
        for ctx in contexts:
            if ctx.source == 'system':
                # 系统上下文总是保留
                ctx.relevance_score = 1.0
            else:
                ctx_embedding = await self.embed_model.embed(ctx.content)
                ctx.relevance_score = cosine_similarity(query_embedding, ctx_embedding)
            scored_contexts.append(ctx)
        
        # 2. 按相关性排序
        scored_contexts.sort(key=lambda x: x.relevance_score, reverse=True)
        
        # 3. 选择上下文直到达到 Token 限制
        selected = []
        total_tokens = 0
        
        for ctx in scored_contexts:
            if total_tokens + ctx.tokens <= self.max_tokens:
                selected.append(ctx)
                total_tokens += ctx.tokens
        
        # 4. 按逻辑顺序组装
        return self._assemble(selected)
    
    def _assemble(self, contexts: list[ContextChunk]) -> str:
        """按逻辑顺序组装上下文"""
        # 定义组装顺序
        order = ['system', 'rag', 'history', 'user']
        
        assembled = []
        for source_type in order:
            chunks = [c for c in contexts if c.source == source_type]
            for chunk in chunks:
                assembled.append(f"<{chunk.source}>\n{chunk.content}\n</{chunk.source}>")
        
        return "\n\n".join(assembled)
```

### 3.3 上下文冲突处理

当不同来源的信息存在冲突时：

```python
class ConflictResolver:
    """上下文冲突处理器"""
    
    def resolve(
        self,
        contexts: list[ContextChunk],
        conflict_detection: bool = True
    ) -> list[ContextChunk]:
        """
        检测并解决上下文冲突
        """
        if not conflict_detection:
            return contexts
        
        # 检测冲突
        conflicts = self._detect_conflicts(contexts)
        
        if not conflicts:
            return contexts
        
        # 解决策略
        resolved = []
        for ctx in contexts:
            if self._has_conflict(ctx, conflicts):
                # 标记冲突，让模型自行判断
                ctx.content = self._add_conflict_marker(ctx, conflicts)
            resolved.append(ctx)
        
        return resolved
    
    def _detect_conflicts(self, contexts: list[ContextChunk]) -> list[dict]:
        """检测事实性冲突"""
        conflicts = []
        # 实现冲突检测逻辑
        # 例如：不同文档对同一事实有不同描述
        return conflicts
    
    def _add_conflict_marker(self, ctx: ContextChunk, conflicts: list[dict]) -> str:
        """添加冲突标记"""
        return f"[注意：此信息与其他来源存在冲突，请谨慎参考]\n{ctx.content}"
```

## 四、上下文压缩与优化

### 4.1 为什么需要压缩

```
压缩的价值：

1. 成本节约
   - 1M tokens ≈ $10-30 (不同模型价格不同)
   - 压缩 50% → 成本减半

2. 性能提升
   - 更短的输入 → 更快的响应
   - 减少无关信息 → 更准确的输出

3. 容纳更多内容
   - 同样的窗口 → 更多的有效信息
   - 支持更长对话历史
```

### 4.2 压缩技术

#### 技术 1：语义摘要

```python
class SemanticCompressor:
    """语义摘要压缩器"""
    
    def __init__(self, llm, compression_ratio: float = 0.3):
        self.llm = llm
        self.compression_ratio = compression_ratio
    
    async def compress(self, text: str, target_tokens: int = None) -> str:
        """
        将文本压缩为语义等价的简短版本
        """
        # 计算目标长度
        original_tokens = self.count_tokens(text)
        if target_tokens is None:
            target_tokens = int(original_tokens * self.compression_ratio)
        
        # 如果已经足够短，直接返回
        if original_tokens <= target_tokens:
            return text
        
        prompt = f"""
请将以下内容压缩为原长度的 {self.compression_ratio*100:.0f}% 左右。
要求：
1. 保留所有关键信息和事实
2. 保持语义完整性
3. 删除冗余和重复内容
4. 保持逻辑连贯

原始内容：
{text}

压缩后的内容："""
        
        compressed = await self.llm.generate(prompt)
        return compressed
```

#### 技术 2：信息密度优化

```python
class DensityOptimizer:
    """信息密度优化器"""
    
    def optimize(self, text: str) -> str:
        """
        提高文本的信息密度
        """
        optimizations = [
            self._remove_redundancy,
            self._simplify_expressions,
            self._merge_similar_points,
            self._remove_fillers,
        ]
        
        result = text
        for opt in optimizations:
            result = opt(result)
        
        return result
    
    def _remove_redundancy(self, text: str) -> str:
        """移除冗余表达"""
        # "这个问题的答案是..." → "答案：..."
        # "首先，我们来看一下..." → ""
        pass
    
    def _simplify_expressions(self, text: str) -> str:
        """简化表达"""
        # 使用列表代替冗长的段落
        # 用符号代替文字描述
        pass
    
    def _merge_similar_points(self, text: str) -> str:
        """合并相似要点"""
        pass
    
    def _remove_fillers(self, text: str) -> str:
        """移除填充词"""
        fillers = ['嗯', '啊', '那个', '就是', '然后呢', '也就是说']
        for filler in fillers:
            text = text.replace(filler, '')
        return text
```

#### 技术 3：结构化压缩

```python
class StructuredCompressor:
    """结构化压缩：将自然语言转为结构化格式"""
    
    def compress(self, conversation: list[dict]) -> str:
        """
        将对话压缩为结构化摘要
        """
        # 提取关键信息
        topics = self._extract_topics(conversation)
        decisions = self._extract_decisions(conversation)
        facts = self._extract_facts(conversation)
        questions = self._extract_open_questions(conversation)
        
        # 结构化输出
        structured = f"""
[对话摘要]

主题：
{self._format_list(topics)}

关键决策：
{self._format_list(decisions)}

确认的事实：
{self._format_list(facts)}

待解决问题：
{self._format_list(questions)}
"""
        return structured
    
    def _extract_topics(self, conversation: list[dict]) -> list[str]:
        """提取讨论主题"""
        pass
    
    def _extract_decisions(self, conversation: list[dict]) -> list[str]:
        """提取已做出的决策"""
        pass
    
    def _extract_facts(self, conversation: list[dict]) -> list[str]:
        """提取确认的事实"""
        pass
    
    def _extract_open_questions(self, conversation: list[dict]) -> list[str]:
        """提取待解决问题"""
        pass
    
    def _format_list(self, items: list[str]) -> str:
        """格式化列表"""
        if not items:
            return "（无）"
        return "\n".join(f"- {item}" for item in items)
```

### 4.3 压缩策略选择

| 场景 | 推荐策略 | 原因 |
|------|----------|------|
| 对话历史过长 | 滑动窗口 + 摘要 | 保留最新和关键信息 |
| RAG 文档过多 | 相关性排序 + 截断 | 只保留最相关的内容 |
| 系统提示过长 | 结构化优化 | 提高信息密度 |
| 成本敏感 | 激进压缩 | 最大化节省 Token |

## 五、长期记忆与持久化

### 5.1 为什么需要长期记忆

```
LLM 的原生限制：

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  对话 1          对话 2          对话 3                     │
│  ───────         ───────         ───────                    │
│  上下文 A        上下文 B        上下文 C                    │
│                                                             │
│  ↓               ↓               ↓                          │
│                                                             │
│  [独立会话]      [独立会话]      [独立会话]                   │
│                                                             │
│  问题：每次对话都是"白纸"，模型不记得之前说过什么            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 记忆架构设计

```
长期记忆架构：

┌─────────────────────────────────────────────────────────────┐
│                      记忆层级                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  工作记忆 (Working Memory)                           │   │
│  │  • 当前会话上下文                                    │   │
│  │  • 临时状态信息                                      │   │
│  │  • 容量：有限 (上下文窗口)                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  情景记忆 (Episodic Memory)                          │   │
│  │  • 历史对话记录                                      │   │
│  │  • 会话摘要                                          │   │
│  │  • 容量：中等 (数据库)                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  语义记忆 (Semantic Memory)                          │   │
│  │  • 用户画像                                          │   │
│  │  • 知识库                                            │   │
│  │  • 习得知识                                          │   │
│  │  • 容量：无限 (向量数据库)                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 记忆系统实现

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import json

@dataclass
class Memory:
    """记忆单元"""
    id: str
    content: str
    memory_type: str  # 'episodic', 'semantic', 'working'
    importance: float  # 0-1
    created_at: datetime
    last_accessed: datetime
    access_count: int
    embedding: Optional[list[float]] = None
    metadata: dict = None


class LongTermMemory:
    """长期记忆系统"""
    
    def __init__(
        self,
        vector_store,  # 向量数据库
        llm,
        embed_model,
        max_working_memory: int = 10
    ):
        self.vector_store = vector_store
        self.llm = llm
        self.embed_model = embed_model
        self.max_working_memory = max_working_memory
    
    async def remember(self, user_id: str, content: str, memory_type: str = 'episodic'):
        """存储记忆"""
        # 1. 评估重要性
        importance = await self._evaluate_importance(content)
        
        # 2. 生成摘要（如果是长内容）
        if self.count_tokens(content) > 500:
            summary = await self._summarize(content)
        else:
            summary = content
        
        # 3. 生成向量
        embedding = await self.embed_model.embed(summary)
        
        # 4. 创建记忆对象
        memory = Memory(
            id=self._generate_id(),
            content=summary,
            memory_type=memory_type,
            importance=importance,
            created_at=datetime.now(),
            last_accessed=datetime.now(),
            access_count=0,
            embedding=embedding
        )
        
        # 5. 存储到向量数据库
        await self.vector_store.add(
            collection=f"user_{user_id}",
            document=memory.content,
            embedding=memory.embedding,
            metadata={
                'id': memory.id,
                'type': memory.memory_type,
                'importance': memory.importance,
                'created_at': memory.created_at.isoformat()
            }
        )
        
        return memory
    
    async def recall(
        self,
        user_id: str,
        query: str,
        limit: int = 5,
        memory_types: list[str] = None
    ) -> list[Memory]:
        """检索相关记忆"""
        # 1. 生成查询向量
        query_embedding = await self.embed_model.embed(query)
        
        # 2. 向量检索
        filter_dict = {}
        if memory_types:
            filter_dict['type'] = {'$in': memory_types}
        
        results = await self.vector_store.search(
            collection=f"user_{user_id}",
            query_embedding=query_embedding,
            limit=limit * 2,  # 多取一些，后续过滤
            filter=filter_dict
        )
        
        # 3. 构建 Memory 对象
        memories = []
        for result in results:
            memory = Memory(
                id=result['metadata']['id'],
                content=result['document'],
                memory_type=result['metadata']['type'],
                importance=result['metadata']['importance'],
                created_at=datetime.fromisoformat(result['metadata']['created_at']),
                last_accessed=datetime.now(),
                access_count=result['metadata'].get('access_count', 0) + 1
            )
            memories.append(memory)
        
        # 4. 按重要性和相关性综合排序
        memories.sort(
            key=lambda m: m.importance * 0.5 + result['score'] * 0.5,
            reverse=True
        )
        
        return memories[:limit]
    
    async def build_context(
        self,
        user_id: str,
        current_query: str,
        conversation_history: list[dict] = None
    ) -> str:
        """构建包含记忆的上下文"""
        # 1. 检索相关记忆
        episodic_memories = await self.recall(
            user_id, current_query, limit=3, memory_types=['episodic']
        )
        semantic_memories = await self.recall(
            user_id, current_query, limit=5, memory_types=['semantic']
        )
        
        # 2. 构建上下文
        context_parts = []
        
        # 用户画像（语义记忆）
        if semantic_memories:
            profile = self._format_semantic_memories(semantic_memories)
            context_parts.append(f"<user_profile>\n{profile}\n</user_profile>")
        
        # 相关历史（情景记忆）
        if episodic_memories:
            history = self._format_episodic_memories(episodic_memories)
            context_parts.append(f"<relevant_history>\n{history}\n</relevant_history>")
        
        # 当前对话
        if conversation_history:
            recent = self._format_recent_conversation(conversation_history)
            context_parts.append(f"<current_conversation>\n{recent}\n</current_conversation>")
        
        return "\n\n".join(context_parts)
    
    async def _evaluate_importance(self, content: str) -> float:
        """评估记忆重要性"""
        prompt = f"""
请评估以下信息的记忆重要性（0-1分）：

信息内容：
{content[:500]}

评分标准：
- 1.0 分：关键决策、重要事实、用户偏好
- 0.7 分：有用信息、上下文相关
- 0.4 分：一般对话、临时性信息
- 0.1 分：无关紧要、噪音信息

请只返回分数（如：0.8）："""
        
        response = await self.llm.generate(prompt)
        try:
            return float(response.strip())
        except:
            return 0.5
    
    async def _summarize(self, content: str) -> str:
        """生成记忆摘要"""
        prompt = f"""
请将以下内容压缩为简洁的记忆摘要，保留关键信息：

{content}

摘要："""
        return await self.llm.generate(prompt)
    
    def _format_semantic_memories(self, memories: list[Memory]) -> str:
        """格式化语义记忆"""
        lines = []
        for m in memories:
            lines.append(f"- {m.content}")
        return "\n".join(lines)
    
    def _format_episodic_memories(self, memories: list[Memory]) -> str:
        """格式化情景记忆"""
        lines = []
        for m in memories:
            date_str = m.created_at.strftime("%Y-%m-%d")
            lines.append(f"[{date_str}] {m.content}")
        return "\n".join(lines)
    
    def _format_recent_conversation(self, history: list[dict]) -> str:
        """格式化当前对话"""
        lines = []
        for msg in history[-6:]:  # 最近 6 条
            role = "用户" if msg["role"] == "user" else "助手"
            lines.append(f"{role}: {msg['content'][:200]}")
        return "\n".join(lines)
    
    def count_tokens(self, text: str) -> int:
        """计算 Token 数"""
        return len(text) // 4  # 简化估算
    
    def _generate_id(self) -> str:
        """生成唯一 ID"""
        import uuid
        return str(uuid.uuid4())
```

### 5.4 记忆遗忘机制

```python
class MemoryForgetting:
    """记忆遗忘机制"""
    
    def __init__(
        self,
        importance_threshold: float = 0.3,
        access_decay_days: float = 30.0
    ):
        self.importance_threshold = importance_threshold
        self.access_decay_days = access_decay_days
    
    def should_forget(self, memory: Memory) -> bool:
        """
        判断是否应该遗忘某个记忆
        基于 Ebbinghaus 遗忘曲线的简化模型
        """
        # 1. 重要性过低
        if memory.importance < self.importance_threshold:
            return True
        
        # 2. 长时间未访问且重要性一般
        days_since_access = (datetime.now() - memory.last_accessed).days
        if days_since_access > self.access_decay_days and memory.importance < 0.7:
            return True
        
        # 3. 访问次数过少
        if memory.access_count == 0 and days_since_access > 7:
            return True
        
        return False
    
    def calculate_retention(self, memory: Memory) -> float:
        """
        计算记忆保持强度（0-1）
        """
        import math
        
        # Ebbinghaus 遗忘曲线：R = e^(-t/S)
        # R = 保持强度，t = 时间，S = 稳定性
        days = (datetime.now() - memory.last_accessed).days
        
        # 重要性越高，稳定性越高
        stability = 10 + memory.importance * 20
        
        # 访问次数增加稳定性
        stability *= (1 + math.log(1 + memory.access_count))
        
        retention = math.exp(-days / stability)
        
        return retention
```

## 六、实战：构建完整的上下文管理系统

### 6.1 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Context Management System                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   输入层    │ ──→ │   处理层    │ ──→ │   输出层    │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│                              │                                  │
│                              ▼                                  │
│                     ┌─────────────────┐                        │
│                     │     记忆系统    │                        │
│                     │  ┌───────────┐  │                        │
│                     │  │ Working   │  │                        │
│                     │  │ Episodic  │  │                        │
│                     │  │ Semantic  │  │                        │
│                     │  └───────────┘  │                        │
│                     └─────────────────┘                        │
│                              │                                  │
│                              ▼                                  │
│                     ┌─────────────────┐                        │
│                     │    存储层       │                        │
│                     │ • Vector DB    │                        │
│                     │ • Redis Cache  │                        │
│                     │ • PostgreSQL   │                        │
│                     └─────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 完整实现

```python
from dataclasses import dataclass, field
from typing import Optional
import asyncio

@dataclass
class ContextConfig:
    """上下文配置"""
    max_tokens: int = 120000
    system_prompt_tokens: int = 500
    output_buffer_tokens: int = 4000
    memory_limit: int = 5
    conversation_limit: int = 10
    compression_enabled: bool = True
    compression_ratio: float = 0.3


class ContextManager:
    """
    完整的上下文管理系统
    """
    
    def __init__(
        self,
        llm,
        embed_model,
        vector_store,
        config: ContextConfig = None
    ):
        self.llm = llm
        self.embed_model = embed_model
        self.vector_store = vector_store
        self.config = config or ContextConfig()
        
        # 子系统
        self.memory = LongTermMemory(vector_store, llm, embed_model)
        self.compressor = SemanticCompressor(llm, config.compression_ratio)
        self.fusion = ContextFusion(llm)
    
    async def process_turn(
        self,
        user_id: str,
        user_input: str,
        conversation_id: str,
        system_prompt: str,
        tools: list[dict] = None,
        rag_docs: list[str] = None
    ) -> dict:
        """
        处理单轮对话
        """
        # 1. 获取历史对话
        history = await self._get_conversation_history(conversation_id)
        
        # 2. 检索相关记忆
        relevant_memories = await self.memory.recall(
            user_id, user_input, limit=self.config.memory_limit
        )
        
        # 3. 获取 RAG 文档
        if rag_docs is None:
            rag_docs = await self._retrieve_documents(user_input)
        
        # 4. 构建上下文
        context = await self._build_context(
            system_prompt=system_prompt,
            memories=relevant_memories,
            rag_docs=rag_docs,
            history=history,
            user_input=user_input,
            tools=tools
        )
        
        # 5. 调用 LLM
        response = await self.llm.generate(context)
        
        # 6. 存储记忆
        await self._store_memory(user_id, user_input, response)
        
        # 7. 更新对话历史
        await self._update_conversation(conversation_id, user_input, response)
        
        return {
            'response': response,
            'context_tokens': self._count_tokens(context),
            'memories_used': len(relevant_memories)
        }
    
    async def _build_context(
        self,
        system_prompt: str,
        memories: list[Memory],
        rag_docs: list[str],
        history: list[dict],
        user_input: str,
        tools: list[dict] = None
    ) -> str:
        """
        构建完整上下文
        """
        # 计算可用 Token 预算
        available_tokens = (
            self.config.max_tokens 
            - self.config.system_prompt_tokens 
            - self.config.output_buffer_tokens
        )
        
        # 分配 Token 预算
        budgets = self._allocate_budgets(available_tokens)
        
        context_parts = []
        
        # 1. 系统提示
        context_parts.append(f"<system>\n{system_prompt}\n</system>")
        
        # 2. 工具定义
        if tools:
            tools_text = self._format_tools(tools)
            context_parts.append(tools_text)
        
        # 3. 用户画像和记忆
        if memories:
            memory_text = self._format_memories(memories, budgets['memory'])
            context_parts.append(memory_text)
        
        # 4. RAG 文档
        if rag_docs:
            rag_text = self._format_rag_docs(rag_docs, budgets['rag'])
            context_parts.append(rag_text)
        
        # 5. 对话历史
        if history:
            history_text = self._format_history(history, budgets['history'])
            context_parts.append(history_text)
        
        # 6. 当前输入
        context_parts.append(f"<user>\n{user_input}\n</user>")
        
        return "\n\n".join(context_parts)
    
    def _allocate_budgets(self, total: int) -> dict:
        """分配 Token 预算"""
        return {
            'memory': int(total * 0.1),      # 10% 用于记忆
            'rag': int(total * 0.4),         # 40% 用于 RAG
            'history': int(total * 0.4),     # 40% 用于历史
            'tools': int(total * 0.1),       # 10% 用于工具
        }
    
    def _format_memories(self, memories: list[Memory], max_tokens: int) -> str:
        """格式化记忆"""
        lines = ["<memories>", "相关历史记忆：", ""]
        current_tokens = 50  # 基础开销
        
        for m in memories:
            line = f"- [{m.memory_type}] {m.content}"
            line_tokens = self._count_tokens(line)
            
            if current_tokens + line_tokens > max_tokens:
                break
            
            lines.append(line)
            current_tokens += line_tokens
        
        lines.append("</memories>")
        return "\n".join(lines)
    
    def _format_rag_docs(self, docs: list[str], max_tokens: int) -> str:
        """格式化 RAG 文档"""
        lines = ["<documents>", "参考资料：", ""]
        current_tokens = 50
        
        for i, doc in enumerate(docs, 1):
            section = f"[文档 {i}]\n{doc}\n"
            section_tokens = self._count_tokens(section)
            
            if current_tokens + section_tokens > max_tokens:
                # 尝试压缩
                remaining = max_tokens - current_tokens
                if remaining > 100:
                    compressed = doc[:remaining * 4]  # 粗略截断
                    lines.append(f"[文档 {i}]\n{compressed}...")
                break
            
            lines.append(section)
            current_tokens += section_tokens
        
        lines.append("</documents>")
        return "\n".join(lines)
    
    def _format_history(self, history: list[dict], max_tokens: int) -> str:
        """格式化对话历史"""
        lines = ["<history>", "对话历史：", ""]
        current_tokens = 50
        
        # 从最近开始
        for msg in reversed(history):
            role = "用户" if msg["role"] == "user" else "助手"
            line = f"{role}: {msg['content']}"
            line_tokens = self._count_tokens(line)
            
            if current_tokens + line_tokens > max_tokens:
                break
            
            lines.insert(3, line)  # 插入到开头
            current_tokens += line_tokens
        
        lines.append("</history>")
        return "\n".join(lines)
    
    def _format_tools(self, tools: list[dict]) -> str:
        """格式化工具定义"""
        lines = ["<tools>", "可用工具：", ""]
        
        for tool in tools:
            lines.append(f"### {tool['name']}")
            lines.append(f"描述: {tool['description']}")
            if 'parameters' in tool:
                lines.append(f"参数: {json.dumps(tool['parameters'], ensure_ascii=False)}")
            lines.append("")
        
        lines.append("</tools>")
        return "\n".join(lines)
    
    def _count_tokens(self, text: str) -> int:
        """计算 Token 数"""
        return len(text) // 4
    
    async def _get_conversation_history(self, conversation_id: str) -> list[dict]:
        """获取对话历史"""
        # 从数据库或缓存获取
        pass
    
    async def _retrieve_documents(self, query: str) -> list[str]:
        """检索相关文档"""
        # RAG 检索
        pass
    
    async def _store_memory(self, user_id: str, user_input: str, response: str):
        """存储记忆"""
        # 评估是否值得存储
        combined = f"用户: {user_input}\n助手: {response}"
        await self.memory.remember(user_id, combined, memory_type='episodic')
    
    async def _update_conversation(self, conversation_id: str, user_input: str, response: str):
        """更新对话历史"""
        # 存储到数据库
        pass
```

## 七、上下文工程最佳实践

### 7.1 设计原则

| 原则 | 说明 | 实践 |
|------|------|------|
| 最小必要 | 只包含必要信息 | 相关性筛选、优先级排序 |
| 结构清晰 | 使用标记和分隔符 | XML 标签、Markdown 格式 |
| 一致性 | 格式和顺序保持一致 | 模板化、标准化 |
| 可扩展 | 易于添加新上下文源 | 模块化设计 |

### 7.2 上下文模板示例

```
<system>
你是 {role}，专门负责 {domain} 领域的智能助手。

核心能力：
{capabilities}

行为规范：
{guidelines}
</system>

<user_context>
用户信息：
- 身份：{user_identity}
- 偏好：{user_preferences}
- 当前目标：{current_goal}
</user_context>

<knowledge>
{relevant_knowledge}
</knowledge>

<conversation>
{conversation_history}
</conversation>

<user>
{current_input}
</user>
```

### 7.3 常见问题与解决方案

**问题 1：上下文过载**

```
症状：模型输出质量下降，出现幻觉

解决方案：
1. 实施严格的上下文筛选
2. 使用分层压缩
3. 优先保证核心信息
```

**问题 2：上下文冲突**

```
症状：模型输出矛盾或不一致

解决方案：
1. 标记冲突来源
2. 设置信息优先级
3. 让模型明确说明信息来源
```

**问题 3：成本过高**

```
症状：Token 消耗超出预期

解决方案：
1. 启用压缩
2. 减少不必要的上下文
3. 使用缓存避免重复处理
```

## 总结

上下文工程是 LLM 应用开发的核心技能。本文系统性地介绍了：

1. **核心理念**：从 Prompt Engineering 到 Context Engineering 的思维转变
2. **窗口管理**：理解上下文窗口限制，实施有效的管理策略
3. **多源融合**：整合不同来源的上下文，解决信息冲突
4. **压缩优化**：提高上下文效率，降低成本
5. **长期记忆**：实现跨会话的记忆持久化

**关键要点**：
- 上下文质量直接决定 LLM 输出质量
- Token 是有限资源，需要精细管理
- 结构化设计提高上下文可维护性
- 记忆系统是实现智能应用的基础

上下文工程是一个快速发展的领域，随着模型能力的提升和新技术的出现，最佳实践也在不断演进。持续学习和实践是掌握这一技能的关键。

## 参考资料

- [Context Engineering for AI Agents](https://www.anthropic.com/research)
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)
- [LLM Memory Systems: A Survey](https://arxiv.org/abs/2404.01224)
- [Effective Context Management for LLM Applications](https://blog.langchain.dev/)
- [The Art of Prompt Design](https://www.promptingguide.ai/)
