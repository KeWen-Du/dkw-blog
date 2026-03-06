---
title: "提示词工程（六）：RAG 提示优化"
date: "2026-03-06"
excerpt: "深入讲解 RAG（检索增强生成）系统的提示词优化技巧，包括检索结果筛选、上下文压缩、多文档整合、引用标注等方法，让 LLM 更好地利用外部知识。"
tags: ["Prompt Engineering", "RAG", "Retrieval-Augmented Generation", "LLM", "知识检索"]
series:
  slug: "prompt-engineering-tutorial"
  title: "提示词工程实战教程"
  order: 6
---

# 提示词工程（六）：RAG 提示优化

## 前言

RAG（Retrieval-Augmented Generation，检索增强生成）是当前最流行的 LLM 应用架构之一。它将外部知识检索与大语言模型生成相结合，有效解决了模型幻觉和知识时效性问题。

然而，**检索到的内容如何有效地传递给模型**，是 RAG 系统效果的关键。本文将深入探讨 RAG 系统的提示词优化技巧，帮助你构建更智能、更可靠的知识问答系统。

本文涵盖的核心内容：
- RAG 的基本原理和架构
- 检索结果的筛选与排序
- 上下文窗口的优化管理
- 多文档信息的整合技巧
- 引用标注与可验证性

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| RAG 基础架构 | ⭐⭐ | 高频考点 | ✅ |
| 检索结果筛选 | ⭐⭐⭐ | 高频考点 | ✅ |
| 上下文压缩 | ⭐⭐⭐ | 进阶考点 | ✅ |
| 多文档整合 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| 引用标注 | ⭐⭐⭐ | 实用技巧 | ✅ |

## 面试考点

1. 什么是 RAG？它解决了 LLM 的什么问题？
2. RAG 系统中如何选择和排序检索结果？
3. 上下文窗口有限时，如何处理大量检索结果？
4. 如何让模型生成带引用的回答？
5. RAG 和微调（Fine-tuning）相比有什么优劣？

## 一、RAG 基础回顾

### 1.1 什么是 RAG

**RAG** 是一种将信息检索与文本生成相结合的架构：

```
┌─────────────────────────────────────────────────────────────┐
│                     RAG 架构                                │
│                                                             │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│   │  User    │─────▶│ Retrieve │─────▶│ Generate │        │
│   │  Query   │      │  (检索)   │      │  (生成)   │        │
│   └──────────┘      └────┬─────┘      └──────────┘        │
│                          │                                  │
│                          ▼                                  │
│                   ┌───────────────┐                         │
│                   │ Knowledge Base│                         │
│                   │  (知识库)      │                         │
│                   │ • Documents   │                         │
│                   │ • Vector DB   │                         │
│                   └───────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 RAG 的核心流程

```
1. 用户输入查询
2. 将查询转换为向量（Embedding）
3. 在向量数据库中检索相似文档
4. 将检索结果与原始查询组合成 Prompt
5. LLM 基于检索内容生成回答
```

### 1.3 为什么需要 RAG 提示优化

| 挑战 | 说明 |
|------|------|
| **噪声问题** | 检索结果中可能包含不相关的内容 |
| **冗余问题** | 多个检索结果内容重复 |
| **长度限制** | 上下文窗口无法容纳所有检索结果 |
| **信息冲突** | 不同文档提供矛盾的信息 |
| **幻觉风险** | 模型可能忽略检索内容，依赖内部知识 |

## 二、基础 RAG Prompt 设计

### 2.1 最简单的 RAG Prompt

```
基于以下信息回答问题：

{检索到的文档内容}

问题：{用户问题}

回答：
```

### 2.2 改进的基础 Prompt

```
你是一个专业的问答助手。请基于以下提供的参考信息回答问题。

重要提示：
- 请优先使用参考信息中的内容
- 如果参考信息不足以回答问题，请明确说明
- 不要编造参考信息中没有的内容

参考信息：
{文档内容}

用户问题：{用户问题}

请提供清晰、准确的回答：
```

### 2.3 结构化 RAG Prompt

```
## 角色设定
你是一位专业的知识库问答助手，擅长基于提供的参考资料回答用户问题。

## 任务说明
基于"参考文档"部分提供的信息，回答"用户问题"。

## 回答要求
1. 优先使用参考文档中的信息
2. 回答要准确、简洁
3. 如果信息不足，明确说明"根据提供的资料，无法回答这个问题"
4. 不要添加参考文档以外的内容

## 参考文档
{文档内容}

## 用户问题
{用户问题}

## 回答
```

## 三、检索结果筛选与排序

### 3.1 相关性过滤

```python
def filter_by_relevance(documents, query_embedding, threshold=0.7):
    """
    基于相似度阈值过滤检索结果
    
    Args:
        documents: 检索到的文档列表
        query_embedding: 查询向量
        threshold: 相似度阈值
    """
    filtered = []
    for doc in documents:
        similarity = cosine_similarity(
            [query_embedding], 
            [doc.embedding]
        )[0][0]
        
        if similarity >= threshold:
            filtered.append({
                'content': doc.content,
                'similarity': similarity
            })
    
    return filtered
```

### 3.2 多样性重排序

避免检索结果过于集中在同一主题：

```python
from sklearn.cluster import KMeans

def diversify_results(documents, embeddings, n_clusters=5):
    """
    使用聚类确保检索结果的多样性
    """
    if len(documents) <= n_clusters:
        return documents
    
    # 聚类
    kmeans = KMeans(n_clusters=n_clusters)
    clusters = kmeans.fit_predict(embeddings)
    
    # 从每个聚类中选择得分最高的文档
    diverse_results = []
    for i in range(n_clusters):
        cluster_indices = np.where(clusters == i)[0]
        if len(cluster_indices) > 0:
            # 选择相似度最高的
            best_idx = cluster_indices[np.argmax([
                documents[j]['similarity'] 
                for j in cluster_indices
            ])]
            diverse_results.append(documents[best_idx])
    
    return diverse_results
```

### 3.3 时间衰减排序

对于有时效性的内容（如新闻、文档）：

```python
def time_decay_score(similarity, timestamp, decay_rate=0.1):
    """
    考虑时间衰减的相关性分数
    
    Args:
        similarity: 原始相似度分数
        timestamp: 文档时间戳
        decay_rate: 衰减率
    """
    import time
    days_old = (time.time() - timestamp) / (24 * 3600)
    time_factor = np.exp(-decay_rate * days_old)
    
    return similarity * time_factor
```

### 3.4 综合排序策略

```python
def rank_documents(documents, query_embedding, top_k=5):
    """
    综合排序策略
    """
    scored_docs = []
    
    for doc in documents:
        # 基础相似度分数
        similarity = cosine_similarity(
            [query_embedding], 
            [doc.embedding]
        )[0][0]
        
        # 时间衰减
        if hasattr(doc, 'timestamp'):
            similarity = time_decay_score(
                similarity, 
                doc.timestamp
            )
        
        # 长度惩罚（过长或过短的文档降权）
        length = len(doc.content)
        if length < 100 or length > 2000:
            similarity *= 0.9
        
        scored_docs.append({
            'doc': doc,
            'score': similarity
        })
    
    # 排序并返回 Top-K
    scored_docs.sort(key=lambda x: x['score'], reverse=True)
    return [item['doc'] for item in scored_docs[:top_k]]
```

## 四、上下文压缩技术

### 4.1 文档摘要

当检索到的文档太长时，可以先进行摘要：

```python
class ContextCompressor:
    def __init__(self, llm):
        self.llm = llm
    
    def compress(self, documents, max_length=500):
        """
        压缩文档内容
        
        Args:
            documents: 文档列表
            max_length: 每个文档的最大长度
        """
        compressed = []
        
        for doc in documents:
            if len(doc.content) <= max_length:
                compressed.append(doc)
            else:
                # 使用 LLM 进行摘要
                summary = self._summarize(doc.content, max_length)
                compressed.append({
                    'content': summary,
                    'source': doc.source,
                    'is_summary': True
                })
        
        return compressed
    
    def _summarize(self, text, max_length):
        """使用 LLM 生成摘要"""
        prompt = f"""请将以下文本压缩到 {max_length} 字以内，保留关键信息：

{text}

摘要："""
        
        return self.llm.generate(prompt)
```

### 4.2 关键片段提取

只提取与查询最相关的片段：

```python
def extract_relevant_chunks(document, query, chunk_size=200, overlap=50):
    """
    提取文档中与查询最相关的片段
    
    Args:
        document: 长文档
        query: 查询
        chunk_size: 片段大小
        overlap: 片段重叠大小
    """
    # 分割文档
    chunks = []
    for i in range(0, len(document), chunk_size - overlap):
        chunk = document[i:i + chunk_size]
        chunks.append(chunk)
    
    # 计算每个片段与查询的相似度
    query_embedding = embed(query)
    chunk_scores = []
    
    for chunk in chunks:
        chunk_embedding = embed(chunk)
        score = cosine_similarity([query_embedding], [chunk_embedding])[0][0]
        chunk_scores.append((chunk, score))
    
    # 返回得分最高的片段
    chunk_scores.sort(key=lambda x: x[1], reverse=True)
    return [chunk for chunk, _ in chunk_scores[:3]]  # 返回 Top 3
```

### 4.3 基于 Map-Reduce 的压缩

```python
class MapReduceCompressor:
    """Map-Reduce 风格的上下文压缩"""
    
    def __init__(self, llm):
        self.llm = llm
    
    def compress(self, documents, query, map_size=3):
        """
        Map 阶段：分批处理文档
        Reduce 阶段：合并结果
        """
        # Map：每批文档生成中间摘要
        intermediate_summaries = []
        for i in range(0, len(documents), map_size):
            batch = documents[i:i + map_size]
            summary = self._map_step(batch, query)
            intermediate_summaries.append(summary)
        
        # Reduce：合并所有中间摘要
        final_context = self._reduce_step(
            intermediate_summaries, 
            query
        )
        
        return final_context
    
    def _map_step(self, batch, query):
        """处理一批文档"""
        docs_text = "\n\n".join([d.content for d in batch])
        
        prompt = f"""基于以下文档，提取与问题"{query}"相关的关键信息：

文档：
{docs_text}

关键信息（简洁）："""
        
        return self.llm.generate(prompt)
    
    def _reduce_step(self, summaries, query):
        """合并中间结果"""
        summaries_text = "\n\n".join(summaries)
        
        prompt = f"""基于以下提取的信息，整合成一个连贯的上下文，
用于回答问题"{query}"：

提取的信息：
{summaries_text}

整合后的上下文："""
        
        return self.llm.generate(prompt)
```

## 五、多文档信息整合

### 5.1 文档分块编号

让模型能够引用具体文档：

```
## 参考文档

[文档 1]
来源：产品手册 v2.1
内容：本产品支持多种数据导入方式，包括 CSV、JSON、Excel 等格式...

[文档 2]
来源：API 文档
内容：导入接口的调用限制为每分钟 100 次，超过限制将返回 429 错误...

[文档 3]
来源：常见问题
内容：如果导入失败，请检查文件编码是否为 UTF-8...
```

### 5.2 冲突信息处理

当多个文档提供矛盾信息时：

```
## 参考文档

[文档 1 - 发布于 2024-01-15]
来源：产品文档 v3.0
内容：免费版用户每月可使用 1000 次 API 调用。

[文档 2 - 发布于 2024-03-01]
来源：官方博客
内容：我们已将免费版 API 调用限制调整为每月 2000 次。

## 冲突说明
文档 1 和文档 2 提供了不同的 API 限制信息。
文档 2 发布日期更新，请以文档 2 为准。

用户问题：免费版有多少 API 调用额度？
```

### 5.3 结构化多文档 Prompt

```
## 任务
基于提供的多个参考文档，回答用户问题。如果文档间存在冲突，
优先使用最新发布的文档。

## 参考文档

{% for doc in documents %}
[文档 {{ loop.index }}]
标题：{{ doc.title }}
来源：{{ doc.source }}
发布日期：{{ doc.publish_date }}
相关度：{{ doc.similarity }}

内容：
{{ doc.content }}

---
{% endfor %}

## 回答要求
1. 优先回答用户问题的核心内容
2. 如果信息来自特定文档，请标注 [文档 X]
3. 如果文档间有冲突，说明你的选择依据
4. 如果参考文档信息不足，明确说明

## 用户问题
{{ query }}

## 回答
```

## 六、引用标注与可验证性

### 6.1 基础引用标注

```
## 任务
基于提供的参考资料回答问题，并在回答中标注信息来源。

## 引用格式
使用 [^X^] 格式标注引用，其中 X 是文档编号。

## 示例
用户：产品有什么特点？
助手：产品支持多种数据格式 [^1^]，并且具有高性能处理能力 [^2^]。

## 参考文档
[^1^] 产品功能介绍：支持 CSV、JSON、Excel 等多种格式导入
[^2^] 性能测试报告：在标准配置下，处理速度可达 10000 条/秒

## 用户问题
{用户问题}

## 回答
```

### 6.2 结构化引用

```python
def build_citation_prompt(documents, query):
    """构建带引用要求的 Prompt"""
    
    # 构建文档部分
    docs_section = "## 参考文档\n\n"
    for i, doc in enumerate(documents, 1):
        docs_section += f"[{i}] {doc.title}\n"
        docs_section += f"    来源：{doc.source}\n"
        docs_section += f"    内容：{doc.content}\n\n"
    
    prompt = f"""基于以下参考文档回答问题。

## 回答要求
1. 每个事实性陈述后标注来源，格式：[编号]
2. 如果无法从文档中找到答案，回答"根据提供的资料，无法回答"
3. 不要引用文档以外的知识

{docs_section}

## 用户问题
{query}

## 回答格式
请按以下格式回答：

[你的回答，包含引用标注]

## 引用文档
[列出实际引用的文档编号和标题]

请回答："""
    
    return prompt
```

### 6.3 引用验证

```python
class CitationValidator:
    """验证回答中的引用是否正确"""
    
    def __init__(self, llm):
        self.llm = llm
    
    def validate(self, answer, documents):
        """
        验证回答中的引用
        
        Returns:
            {
                'valid_citations': [...],
                'invalid_citations': [...],
                'missing_citations': [...],
                'verified_answer': str
            }
        """
        # 提取回答中的引用
        citations = self._extract_citations(answer)
        
        # 验证每个引用
        valid = []
        invalid = []
        
        for citation in citations:
            doc_id = int(citation.strip('[]'))
            if doc_id <= len(documents):
                # 检查内容是否真实来自该文档
                is_valid = self._verify_citation(
                    answer, 
                    documents[doc_id - 1]
                )
                if is_valid:
                    valid.append(citation)
                else:
                    invalid.append(citation)
            else:
                invalid.append(citation)
        
        return {
            'valid_citations': valid,
            'invalid_citations': invalid,
            'citation_count': len(citations)
        }
    
    def _extract_citations(self, text):
        """提取引用标记"""
        import re
        return re.findall(r'\[\d+\]', text)
    
    def _verify_citation(self, statement, document):
        """验证引用内容是否准确"""
        prompt = f"""请判断以下陈述是否准确反映了文档内容。

文档内容：
{document.content}

陈述：
{statement}

判断：该陈述是否准确反映了文档内容？
回答：是/否
"""
        
        result = self.llm.generate(prompt).strip().lower()
        return '是' in result or 'yes' in result
```

## 七、减少模型幻觉

### 7.1 强制约束提示

```
## 严格约束

1. **知识边界**：你只能使用"参考文档"中提供的信息
2. **不确定性表达**：如果不确定，回答"根据提供的资料，我无法确定"
3. **禁止编造**：不要编造参考文档中没有的信息
4. **禁止推测**：不要基于文档内容进行推测
5. **引用要求**：每个事实都必须有对应的文档引用

违反以上任何一条都视为回答无效。

## 参考文档
{文档内容}

## 用户问题
{用户问题}
```

### 7.2 不确定性检测

```python
class UncertaintyHandler:
    """处理不确定情况的策略"""
    
    def __init__(self, llm):
        self.llm = llm
    
    def generate_with_uncertainty(self, query, documents):
        """生成回答并标记不确定性"""
        
        prompt = f"""基于参考文档回答问题，并标记你的确定性等级。

确定性等级：
- 高：文档中有明确答案
- 中：文档中有相关信息，但需要少量推断
- 低：文档中信息不足

参考文档：
{documents}

用户问题：{query}

请按以下格式回答：

确定性等级：[高/中/低]

回答：
[你的回答]

如果确定性等级为"低"，请说明：
- 缺少什么信息
- 需要哪些额外资料才能回答
"""
        
        return self.llm.generate(prompt)
```

### 7.3 多模型验证

```python
class MultiModelValidation:
    """使用多个模型验证回答"""
    
    def __init__(self, models):
        """
        Args:
            models: 多个 LLM 实例的列表
        """
        self.models = models
    
    def generate_consensus(self, prompt, threshold=0.8):
        """
        基于多个模型的共识生成最终答案
        
        Args:
            prompt: 输入提示
            threshold: 共识阈值
        """
        # 获取所有模型的回答
        answers = [model.generate(prompt) for model in self.models]
        
        # 嵌入向量化
        answer_embeddings = [embed(ans) for ans in answers]
        
        # 计算相似度矩阵
        similarities = cosine_similarity(answer_embeddings)
        
        # 找出最一致的回答
        consensus_scores = similarities.sum(axis=1)
        best_idx = np.argmax(consensus_scores)
        
        if consensus_scores[best_idx] / len(self.models) >= threshold:
            return {
                'answer': answers[best_idx],
                'consensus_score': consensus_scores[best_idx],
                'all_answers': answers
            }
        else:
            return {
                'answer': None,
                'message': '模型间共识度不足，需要人工审核',
                'all_answers': answers
            }
```

## 八、实战：构建一个生产级 RAG 系统

### 8.1 完整架构

```python
class ProductionRAGSystem:
    """生产级 RAG 系统"""
    
    def __init__(self, llm, embedding_model, vector_store):
        self.llm = llm
        self.embedding_model = embedding_model
        self.vector_store = vector_store
        
        # 初始化各个组件
        self.retriever = SmartRetriever(embedding_model, vector_store)
        self.reranker = Reranker()
        self.compressor = ContextCompressor(llm)
        self.prompt_builder = RAGPromptBuilder()
        self.citation_validator = CitationValidator(llm)
    
    def query(self, user_query, top_k=5):
        """
        执行 RAG 查询
        
        Args:
            user_query: 用户查询
            top_k: 检索文档数量
            
        Returns:
            {
                'answer': str,
                'sources': list,
                'citations': list,
                'confidence': float
            }
        """
        # 1. 检索
        retrieved_docs = self.retriever.retrieve(
            user_query, 
            top_k=top_k * 2  # 检索更多，后续筛选
        )
        
        # 2. 重排序
        reranked_docs = self.reranker.rerank(
            user_query, 
            retrieved_docs
        )[:top_k]
        
        # 3. 上下文压缩
        compressed_docs = self.compressor.compress(
            reranked_docs,
            max_tokens=2000
        )
        
        # 4. 构建 Prompt
        prompt = self.prompt_builder.build(
            user_query,
            compressed_docs,
            style='detailed_with_citations'
        )
        
        # 5. 生成回答
        raw_answer = self.llm.generate(prompt)
        
        # 6. 验证引用
        validation = self.citation_validator.validate(
            raw_answer,
            compressed_docs
        )
        
        # 7. 计算置信度
        confidence = self._calculate_confidence(
            validation,
            reranked_docs
        )
        
        return {
            'answer': raw_answer,
            'sources': [doc.source for doc in reranked_docs],
            'citations': validation['valid_citations'],
            'confidence': confidence,
            'validation': validation
        }
    
    def _calculate_confidence(self, validation, documents):
        """计算回答置信度"""
        # 基于引用有效性、文档相关性等计算
        citation_ratio = len(validation['valid_citations']) / max(validation['citation_count'], 1)
        avg_doc_score = np.mean([doc.score for doc in documents])
        
        return (citation_ratio * 0.6 + avg_doc_score * 0.4)
```

### 8.2 Prompt 模板库

```python
class RAGPromptBuilder:
    """RAG Prompt 构建器"""
    
    TEMPLATES = {
        'basic': """基于以下信息回答问题：

{context}

问题：{query}

回答：""",
        
        'detailed': """## 角色
你是一位专业的知识库问答助手。

## 任务
基于"参考文档"回答"用户问题"。

## 约束
- 只使用参考文档中的信息
- 如果不确定，明确说明"无法回答"
- 不要编造信息

## 参考文档
{context}

## 用户问题
{query}

## 回答
""",
        
        'detailed_with_citations': """## 角色
你是一位专业的知识库问答助手。

## 任务
基于"参考文档"回答"用户问题"。

## 约束
- 只使用参考文档中的信息
- 每个事实性陈述后标注来源 [X]
- 如果不确定，明确说明"无法回答"
- 不要编造信息

## 引用格式
使用 [X] 格式标注引用，X 是文档编号。

## 参考文档
{context}

## 用户问题
{query}

## 回答
""",
        
        'cautious': """## 角色
你是一位谨慎的知识库问答助手。

## 严格约束
1. 只能使用"参考文档"中明确陈述的信息
2. 任何不确定的信息都要标注"不确定"
3. 不要进行任何推测
4. 每个事实必须标注来源
5. 如果无法回答，直接说"根据提供的资料，我无法回答这个问题"

## 参考文档
{context}

## 用户问题
{query}

## 回答（严格遵守以上约束）
"""
    }
    
    def build(self, query, documents, style='detailed'):
        """构建 Prompt"""
        template = self.TEMPLATES.get(style, self.TEMPLATES['detailed'])
        
        # 格式化文档
        context = self._format_documents(documents)
        
        return template.format(context=context, query=query)
    
    def _format_documents(self, documents):
        """格式化文档列表"""
        formatted = []
        for i, doc in enumerate(documents, 1):
            formatted.append(f"[{i}] {doc.title}\n{doc.content}")
        return "\n\n".join(formatted)
```

## 总结

本文深入探讨了 RAG 系统的提示词优化技巧：

1. **检索结果筛选**：通过相似度阈值、多样性重排序、时间衰减等方法筛选最相关的文档

2. **上下文压缩**：使用文档摘要、关键片段提取、Map-Reduce 等技术处理长文档

3. **多文档整合**：通过文档编号、冲突处理、结构化展示等方法有效整合多源信息

4. **引用标注**：实现回答的可验证性，让用户能够追溯信息来源

5. **减少幻觉**：通过强制约束、不确定性检测、多模型验证等方法提高回答可靠性

**核心要点**：
- 检索只是第一步，如何让模型有效利用检索内容才是关键
- 结构化 Prompt 能显著提升 RAG 系统的效果
- 引用标注不仅提升可信度，也便于验证和调试

在下一篇文章中，我们将探讨 **多模态提示工程**，学习如何处理文本、图像、音频等多种模态的输入。

## 参考资料

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)
- [LangChain RAG Documentation](https://python.langchain.com/docs/use_cases/question_answering/)
- [LlamaIndex RAG Guide](https://docs.llamaindex.ai/en/stable/getting_started/concepts.html)
- [RAG Survey: Retrieval-Augmented Generation for Large Language Models](https://arxiv.org/abs/2312.10997)
- [Precise Zero-Shot Dense Retrieval without Relevance Labels](https://arxiv.org/abs/2212.10496)
