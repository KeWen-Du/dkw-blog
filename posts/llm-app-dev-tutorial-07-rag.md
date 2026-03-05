---
title: "大模型应用开发教程（七）：RAG 检索增强生成"
date: "2026-03-04 15:00:00"
excerpt: "深入理解 RAG（检索增强生成）技术原理，掌握向量数据库、文档处理和知识库构建的核心技能。"
tags: ["大模型", "RAG", "向量数据库", "知识库"]
series:
  slug: "llm-app-dev-tutorial"
  title: "大模型应用开发教程"
  order: 7
---

# 大模型应用开发教程（七）：RAG 检索增强生成

## 前言

大语言模型虽然强大，但存在知识截止和幻觉问题。RAG（Retrieval-Augmented Generation，检索增强生成）技术通过将外部知识库与大模型结合，有效解决了这些问题，是当前企业级 AI 应用的核心技术之一。

## RAG 概述

### 什么是 RAG？

RAG 是一种将信息检索与文本生成相结合的技术架构：

```
┌─────────────────────────────────────────────────────────┐
│                    RAG 工作流程                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  用户问题 ──→ 检索相关文档 ──→ 构建增强提示 ──→ LLM 生成  │
│                 ↓               ↓                      │
│             向量数据库      上下文 + 问题                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 为什么需要 RAG？

| 问题 | RAG 解决方案 |
|------|-------------|
| 知识截止 | 实时检索最新信息 |
| 幻觉问题 | 基于真实文档回答 |
| 领域知识不足 | 注入专业知识库 |
| 数据隐私 | 本地部署知识库 |
| 成本问题 | 无需微调模型 |

## RAG 核心组件

### 1. 向量数据库

向量数据库是 RAG 的核心基础设施，用于存储和检索文档向量。

**主流向量数据库对比：**

| 数据库 | 特点 | 适用场景 |
|--------|------|----------|
| Pinecone | 托管服务，易用 | 快速原型 |
| Chroma | 轻量级，开源 | 本地开发 |
| Weaviate | 功能丰富 | 企业应用 |
| Milvus | 高性能 | 大规模部署 |
| Qdrant | Rust 实现 | 性能敏感 |

### 2. 文本嵌入模型

将文本转换为向量表示：

```python
from openai import OpenAI

client = OpenAI()

def get_embedding(text: str, model: str = "text-embedding-3-small") -> list[float]:
    """获取文本向量"""
    response = client.embeddings.create(
        input=text,
        model=model
    )
    return response.data[0].embedding

# 示例
text = "人工智能正在改变世界"
embedding = get_embedding(text)
print(f"向量维度: {len(embedding)}")  # 1536 维
```

### 3. 文档处理流程

```
原始文档 → 文档加载 → 文本切分 → 向量化 → 存储
```

## 实战：构建知识库系统

### 1. 项目结构

```
rag-knowledge-base/
├── src/
│   ├── document_loader.py    # 文档加载器
│   ├── text_splitter.py      # 文本切分
│   ├── embeddings.py         # 向量化
│   ├── vector_store.py       # 向量存储
│   └── retriever.py          # 检索器
├── data/                      # 原始文档
└── requirements.txt
```

### 2. 文档加载器

```python
# src/document_loader.py
from typing import List
from pathlib import Path
import json

class Document:
    def __init__(self, content: str, metadata: dict = None):
        self.content = content
        self.metadata = metadata or {}

class DocumentLoader:
    """文档加载器"""
    
    @staticmethod
    def load_text(filepath: str) -> Document:
        """加载纯文本文件"""
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return Document(
            content=content,
            metadata={"source": filepath}
        )
    
    @staticmethod
    def load_json(filepath: str) -> List[Document]:
        """加载 JSON 文件"""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        documents = []
        for item in data:
            documents.append(Document(
                content=item.get('content', ''),
                metadata=item.get('metadata', {})
            ))
        return documents
    
    @staticmethod
    def load_directory(directory: str, suffixes: List[str] = None) -> List[Document]:
        """加载目录下所有文档"""
        suffixes = suffixes or ['.txt', '.md', '.json']
        documents = []
        
        path = Path(directory)
        for file_path in path.rglob('*'):
            if file_path.suffix in suffixes:
                if file_path.suffix == '.json':
                    documents.extend(DocumentLoader.load_json(str(file_path)))
                else:
                    documents.append(DocumentLoader.load_text(str(file_path)))
        
        return documents
```

### 3. 文本切分器

```python
# src/text_splitter.py
from typing import List

class TextSplitter:
    """文本切分器"""
    
    def __init__(
        self,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        separators: List[str] = None
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", "。", ".", " ", ""]
    
    def split_text(self, text: str) -> List[str]:
        """切分文本"""
        chunks = []
        current_chunk = ""
        
        # 按段落切分
        paragraphs = text.split("\n\n")
        
        for para in paragraphs:
            if len(current_chunk) + len(para) <= self.chunk_size:
                current_chunk += para + "\n\n"
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = para + "\n\n"
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def split_documents(self, documents: List[Document]) -> List[Document]:
        """切分文档列表"""
        split_docs = []
        
        for doc in documents:
            chunks = self.split_text(doc.content)
            for i, chunk in enumerate(chunks):
                split_docs.append(Document(
                    content=chunk,
                    metadata={
                        **doc.metadata,
                        "chunk_index": i,
                        "total_chunks": len(chunks)
                    }
                ))
        
        return split_docs
```

### 4. 向量存储

```python
# src/vector_store.py
from typing import List, Dict, Optional
import chromadb
from chromadb.config import Settings
from .document_loader import Document
from .embeddings import get_embedding

class VectorStore:
    """向量存储"""
    
    def __init__(self, persist_directory: str = "./chroma_db"):
        self.client = chromadb.PersistentClient(path=persist_directory)
        self.collection = None
    
    def create_collection(self, name: str):
        """创建集合"""
        self.collection = self.client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"}
        )
    
    def add_documents(self, documents: List[Document], batch_size: int = 100):
        """添加文档"""
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            
            ids = [f"doc_{i}_{j}" for j in range(len(batch))]
            embeddings = [get_embedding(doc.content) for doc in batch]
            contents = [doc.content for doc in batch]
            metadatas = [doc.metadata for doc in batch]
            
            self.collection.add(
                ids=ids,
                embeddings=embeddings,
                documents=contents,
                metadatas=metadatas
            )
    
    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        """相似度搜索"""
        query_embedding = get_embedding(query)
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"]
        )
        
        return [
            {
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i]
            }
            for i in range(len(results["documents"][0]))
        ]
```

### 5. RAG 检索器

```python
# src/retriever.py
from typing import List, Dict
from openai import OpenAI
from .vector_store import VectorStore

class RAGRetriever:
    """RAG 检索器"""
    
    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store
        self.client = OpenAI()
    
    def retrieve(self, query: str, top_k: int = 5) -> List[Dict]:
        """检索相关文档"""
        return self.vector_store.search(query, top_k)
    
    def generate_response(
        self,
        query: str,
        context_docs: List[Dict],
        system_prompt: str = None
    ) -> str:
        """生成回答"""
        
        # 构建上下文
        context = "\n\n".join([
            f"文档 {i+1}:\n{doc['content']}"
            for i, doc in enumerate(context_docs)
        ])
        
        # 默认系统提示
        if not system_prompt:
            system_prompt = """你是一个专业的问答助手。请基于提供的参考资料回答用户问题。

规则：
1. 只使用参考资料中的信息回答
2. 如果参考资料中没有相关信息，请明确说明
3. 引用信息时注明来源文档
4. 保持回答简洁准确"""

        # 构建消息
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""参考资料：
{context}

问题：{query}

请基于参考资料回答问题。"""}
        ]
        
        # 调用大模型
        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.3
        )
        
        return response.choices[0].message.content
    
    def query(self, question: str, top_k: int = 5) -> Dict:
        """完整查询流程"""
        # 1. 检索相关文档
        docs = self.retrieve(question, top_k)
        
        # 2. 生成回答
        answer = self.generate_response(question, docs)
        
        return {
            "answer": answer,
            "sources": docs,
            "query": question
        }
```

### 6. 完整示例

```python
# main.py
from src.document_loader import DocumentLoader
from src.text_splitter import TextSplitter
from src.vector_store import VectorStore
from src.retriever import RAGRetriever

def main():
    # 1. 加载文档
    loader = DocumentLoader()
    documents = loader.load_directory("./data", [".txt", ".md"])
    print(f"加载了 {len(documents)} 个文档")
    
    # 2. 切分文档
    splitter = TextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(documents)
    print(f"切分为 {len(chunks)} 个文本块")
    
    # 3. 创建向量存储
    vector_store = VectorStore("./chroma_db")
    vector_store.create_collection("knowledge_base")
    vector_store.add_documents(chunks)
    print("文档已向量化存储")
    
    # 4. 创建检索器
    retriever = RAGRetriever(vector_store)
    
    # 5. 查询示例
    while True:
        question = input("\n请输入问题（输入 'quit' 退出）: ")
        if question.lower() == 'quit':
            break
        
        result = retriever.query(question)
        print(f"\n回答: {result['answer']}")
        print(f"\n参考来源: {len(result['sources'])} 个文档")

if __name__ == "__main__":
    main()
```

## RAG 优化技巧

### 1. 文档切分优化

```python
class SemanticSplitter:
    """语义切分器 - 按语义边界切分"""
    
    def __init__(self, min_chunk_size: int = 200, max_chunk_size: int = 1000):
        self.min_chunk_size = min_chunk_size
        self.max_chunk_size = max_chunk_size
    
    def split_text(self, text: str) -> List[str]:
        """基于语义边界切分"""
        # 实现基于句子相似度的切分
        sentences = self._split_sentences(text)
        chunks = []
        current_chunk = []
        current_size = 0
        
        for sentence in sentences:
            sentence_size = len(sentence)
            
            if current_size + sentence_size > self.max_chunk_size:
                if current_chunk:
                    chunks.append(" ".join(current_chunk))
                current_chunk = [sentence]
                current_size = sentence_size
            else:
                current_chunk.append(sentence)
                current_size += sentence_size
        
        if current_chunk:
            chunks.append(" ".join(current_chunk))
        
        return chunks
```

### 2. 混合检索

```python
class HybridRetriever:
    """混合检索器 - 结合关键词和向量检索"""
    
    def __init__(self, vector_store, keyword_index):
        self.vector_store = vector_store
        self.keyword_index = keyword_index
    
    def search(self, query: str, top_k: int = 5, alpha: float = 0.5):
        """混合检索"""
        # 向量检索
        vector_results = self.vector_store.search(query, top_k=top_k * 2)
        
        # 关键词检索
        keyword_results = self.keyword_index.search(query, top_k=top_k * 2)
        
        # 合并结果
        merged = self._merge_results(vector_results, keyword_results, alpha)
        
        return merged[:top_k]
    
    def _merge_results(self, vector_results, keyword_results, alpha):
        """合并并重排序"""
        scores = {}
        
        for i, result in enumerate(vector_results):
            doc_id = result['id']
            scores[doc_id] = scores.get(doc_id, 0) + alpha * (1 / (i + 1))
        
        for i, result in enumerate(keyword_results):
            doc_id = result['id']
            scores[doc_id] = scores.get(doc_id, 0) + (1 - alpha) * (1 / (i + 1))
        
        # 排序并返回
        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
        return sorted_ids
```

### 3. 重排序（Reranking）

```python
class Reranker:
    """重排序器"""
    
    def __init__(self, model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
        from sentence_transformers import CrossEncoder
        self.model = CrossEncoder(model)
    
    def rerank(self, query: str, documents: List[Dict], top_k: int = 5) -> List[Dict]:
        """重排序"""
        pairs = [(query, doc['content']) for doc in documents]
        scores = self.model.predict(pairs)
        
        # 按分数排序
        ranked = sorted(
            zip(documents, scores),
            key=lambda x: x[1],
            reverse=True
        )
        
        return [doc for doc, score in ranked[:top_k]]
```

## 向量数据库生产级优化

### 大规模向量存储优化

```
┌─────────────────────────────────────────────────────────────────┐
│              向量数据库生产级优化策略                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  存储优化：                                                     │
│  ├── 分片策略 (Sharding)                                       │
│  │   └── 按业务域/时间分片，降低单分片压力                      │
│  ├── 量化压缩 (Quantization)                                   │
│  │   └── PQ/SQ 量化，减少内存占用 75%                          │
│  └── 索引优化 (Indexing)                                       │
│      └── HNSW/IVF 索引，平衡精度与速度                          │
│                                                                 │
│  查询优化：                                                     │
│  ├── 预计算查询向量                                            │
│  ├── 批量查询合并                                              │
│  └── 缓存热门查询结果                                          │
│                                                                 │
│  扩展性设计：                                                   │
│  ├── 水平扩展：多节点分布式部署                                │
│  ├── 读写分离：主从架构                                        │
│  └── 弹性伸缩：根据负载自动扩缩容                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 生产级向量存储实现

```python
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import asyncio
from concurrent.futures import ThreadPoolExecutor

@dataclass
class VectorDBConfig:
    """向量数据库配置"""
    collection_name: str
    embedding_dim: int = 1536
    index_type: str = "HNSW"  # HNSW, IVF, FLAT
    metric: str = "cosine"    # cosine, euclidean, dot
    n_lists: int = 100        # IVF 聚类数量
    m: int = 16               # HNSW 连接数
    ef_construct: int = 200   # HNSW 构建参数
    quantization: str = None  # None, PQ, SQ

class ProductionVectorStore:
    """生产级向量存储"""
    
    def __init__(self, config: VectorDBConfig):
        self.config = config
        self.executor = ThreadPoolExecutor(max_workers=10)
        self.cache = LRUCache(maxsize=10000)
    
    async def upsert_batch(
        self,
        documents: List[Dict],
        batch_size: int = 100
    ) -> Dict:
        """批量插入/更新文档"""
        
        results = {"success": 0, "failed": 0, "errors": []}
        
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            
            try:
                # 并行生成向量
                embeddings = await asyncio.gather(*[
                    self._get_embedding(doc["content"])
                    for doc in batch
                ])
                
                # 批量插入
                points = [
                    {
                        "id": doc["id"],
                        "vector": emb,
                        "payload": doc.get("metadata", {}),
                        "content": doc["content"]
                    }
                    for doc, emb in zip(batch, embeddings)
                ]
                
                await self._insert_points(points)
                results["success"] += len(batch)
                
            except Exception as e:
                results["failed"] += len(batch)
                results["errors"].append(str(e))
        
        return results
    
    async def search_with_rerank(
        self,
        query: str,
        top_k: int = 20,
        rerank_top_k: int = 5,
        filters: Dict = None
    ) -> List[Dict]:
        """带重排序的搜索"""
        
        # 检查缓存
        cache_key = self._make_cache_key(query, filters)
        cached = self.cache.get(cache_key)
        if cached:
            return cached[:rerank_top_k]
        
        # 生成查询向量
        query_vector = await self._get_embedding(query)
        
        # 向量检索
        results = await self._search_vectors(
            query_vector,
            top_k=top_k,
            filters=filters
        )
        
        # 重排序
        reranked = await self._rerank(query, results, rerank_top_k)
        
        # 缓存结果
        self.cache.set(cache_key, reranked)
        
        return reranked
    
    async def hybrid_search(
        self,
        query: str,
        top_k: int = 10,
        vector_weight: float = 0.7,
        keyword_weight: float = 0.3
    ) -> List[Dict]:
        """混合检索（向量 + 关键词）"""
        
        # 并行执行两种检索
        vector_results, keyword_results = await asyncio.gather(
            self._vector_search(query, top_k * 2),
            self._keyword_search(query, top_k * 2)
        )
        
        # 合并分数
        merged_scores = {}
        
        for i, result in enumerate(vector_results):
            doc_id = result["id"]
            merged_scores[doc_id] = {
                "doc": result,
                "score": vector_weight * (1 / (i + 1))
            }
        
        for i, result in enumerate(keyword_results):
            doc_id = result["id"]
            if doc_id in merged_scores:
                merged_scores[doc_id]["score"] += keyword_weight * (1 / (i + 1))
            else:
                merged_scores[doc_id] = {
                    "doc": result,
                    "score": keyword_weight * (1 / (i + 1))
                }
        
        # 排序返回
        sorted_results = sorted(
            merged_scores.values(),
            key=lambda x: x["score"],
            reverse=True
        )
        
        return [r["doc"] for r in sorted_results[:top_k]]
```

### 大规模文档处理流水线

```python
from dataclasses import dataclass
from typing import Iterator, AsyncIterator
import asyncio
from concurrent.futures import ThreadPoolExecutor

@dataclass
class DocumentPipelineConfig:
    """文档处理流水线配置"""
    chunk_size: int = 500
    chunk_overlap: int = 50
    batch_size: int = 100
    max_workers: int = 8
    enable_parallel: bool = True

class DocumentPipeline:
    """大规模文档处理流水线"""
    
    def __init__(
        self,
        config: DocumentPipelineConfig,
        vector_store: ProductionVectorStore
    ):
        self.config = config
        self.vector_store = vector_store
        self.executor = ThreadPoolExecutor(max_workers=config.max_workers)
    
    async def process_documents(
        self,
        documents: Iterator[Dict],
        show_progress: bool = True
    ) -> Dict:
        """处理文档流"""
        
        stats = {
            "total_documents": 0,
            "total_chunks": 0,
            "successful": 0,
            "failed": 0,
            "errors": []
        }
        
        batch = []
        
        async for chunk in self._process_stream(documents):
            batch.append(chunk)
            stats["total_chunks"] += 1
            
            if len(batch) >= self.config.batch_size:
                result = await self.vector_store.upsert_batch(batch)
                stats["successful"] += result["success"]
                stats["failed"] += result["failed"]
                stats["errors"].extend(result["errors"])
                batch = []
                
                if show_progress:
                    print(f"已处理: {stats['total_chunks']} 个文本块")
        
        # 处理剩余
        if batch:
            result = await self.vector_store.upsert_batch(batch)
            stats["successful"] += result["success"]
            stats["failed"] += result["failed"]
        
        return stats
    
    async def _process_stream(
        self,
        documents: Iterator[Dict]
    ) -> AsyncIterator[Dict]:
        """流式处理文档"""
        
        for doc in documents:
            try:
                # 切分文档
                chunks = self._chunk_document(doc)
                
                for i, chunk in enumerate(chunks):
                    yield {
                        "id": f"{doc['id']}_chunk_{i}",
                        "content": chunk,
                        "metadata": {
                            **doc.get("metadata", {}),
                            "source_id": doc["id"],
                            "chunk_index": i,
                            "total_chunks": len(chunks)
                        }
                    }
                    
            except Exception as e:
                # 记录错误但继续处理
                print(f"处理文档 {doc.get('id')} 出错: {e}")
    
    def _chunk_document(self, doc: Dict) -> List[str]:
        """智能切分文档"""
        content = doc.get("content", "")
        
        # 基于语义边界切分
        if self._is_structured(content):
            return self._chunk_by_structure(content)
        else:
            return self._chunk_by_semantic(content)
    
    def _is_structured(self, content: str) -> bool:
        """判断是否结构化文档"""
        # 检测 Markdown、JSON、XML 等结构
        pass
    
    def _chunk_by_structure(self, content: str) -> List[str]:
        """按结构切分"""
        # 按标题、段落、列表等结构切分
        pass
    
    def _chunk_by_semantic(self, content: str) -> List[str]:
        """按语义切分"""
        # 使用嵌入相似度进行语义切分
        pass
```

### 增量更新策略

```python
class IncrementalUpdater:
    """增量更新器"""
    
    def __init__(self, vector_store: ProductionVectorStore):
        self.vector_store = vector_store
        self.change_log = ChangeLogStore()
    
    async def sync_changes(
        self,
        source_db,  # 源数据库
        last_sync_time: datetime
    ) -> Dict:
        """同步增量变更"""
        
        stats = {"added": 0, "updated": 0, "deleted": 0}
        
        # 获取变更记录
        changes = await source_db.get_changes_since(last_sync_time)
        
        for change in changes:
            if change["type"] == "insert":
                await self._handle_insert(change)
                stats["added"] += 1
            elif change["type"] == "update":
                await self._handle_update(change)
                stats["updated"] += 1
            elif change["type"] == "delete":
                await self._handle_delete(change)
                stats["deleted"] += 1
        
        # 更新同步时间
        await self.change_log.update_sync_time()
        
        return stats
    
    async def _handle_insert(self, change: Dict):
        """处理新增"""
        doc = change["document"]
        await self.vector_store.upsert_batch([{
            "id": doc["id"],
            "content": doc["content"],
            "metadata": doc.get("metadata", {})
        }])
    
    async def _handle_update(self, change: Dict):
        """处理更新"""
        # 先删除旧的
        await self.vector_store.delete(change["document_id"])
        # 再插入新的
        await self._handle_insert(change)
    
    async def _handle_delete(self, change: Dict):
        """处理删除"""
        await self.vector_store.delete(change["document_id"])
```

## 小结

本章我们学习了：

1. **RAG 原理**：检索增强生成的核心概念和优势
2. **向量数据库**：主流数据库对比和选择
3. **文档处理**：加载、切分、向量化的完整流程
4. **实战构建**：完整的知识库系统实现
5. **优化技巧**：语义切分、混合检索、重排序

## 下一章预告

在下一章《Agent 智能体开发》中，我们将学习：

- Agent 架构与原理
- 工具调用与规划
- 多智能体协作
- 实战项目开发

---

**教程系列持续更新中，欢迎关注！**
