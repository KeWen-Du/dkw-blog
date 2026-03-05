---
title: "Spring AI 实战教程（六）：Embedding 与向量存储"
date: "2025-08-19"
excerpt: "深入理解文本嵌入原理，掌握向量数据库的配置与使用，实现高效的语义搜索和相似度匹配。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 6
---

# Spring AI 实战教程（六）：Embedding 与向量存储

## 前言

Embedding（嵌入）是将文本转换为高维向量的技术，是实现语义搜索、推荐系统和 RAG 的基础。本章将深入探讨文本嵌入的原理，以及如何在 Spring AI 中使用向量数据库进行高效的向量存储和检索。

## 文本嵌入原理

### 什么是 Embedding？

Embedding 是将离散的文本转换为连续的向量表示：

```
┌─────────────────────────────────────────────────────────────┐
│                    文本嵌入过程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  输入文本                      嵌入向量                      │
│  ┌─────────────────┐          ┌─────────────────────┐      │
│  │ "人工智能很强大" │   ───→   │ [0.123, -0.456, ...]│      │
│  └─────────────────┘          │     1536 维          │      │
│                               └─────────────────────┘      │
│                                                             │
│  核心特性：                                                  │
│  • 语义相似的文本 → 向量距离近                              │
│  • 语义不同的文本 → 向量距离远                              │
│  • 支持向量运算（类比推理）                                  │
│                                                             │
│  示例：                                                      │
│  vec("国王") - vec("男人") + vec("女人") ≈ vec("女王")       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 相似度计算

常用的向量相似度计算方法：

```java
// 余弦相似度（最常用）
public double cosineSimilarity(float[] vec1, float[] vec2) {
    double dotProduct = 0.0;
    double norm1 = 0.0;
    double norm2 = 0.0;
    
    for (int i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// 欧氏距离
public double euclideanDistance(float[] vec1, float[] vec2) {
    double sum = 0.0;
    for (int i = 0; i < vec1.length; i++) {
        sum += Math.pow(vec1[i] - vec2[i], 2);
    }
    return Math.sqrt(sum);
}
```

### 嵌入模型对比

| 模型 | 维度 | 提供商 | 特点 |
|------|------|--------|------|
| text-embedding-3-small | 1536 | OpenAI | 性价比高 |
| text-embedding-3-large | 3072 | OpenAI | 高质量 |
| text-embedding-ada-002 | 1536 | OpenAI | 经典模型 |
| claude-3-embedding | 1536 | Anthropic | 与 Claude 配合好 |
| nomic-embed-text | 768 | Ollama | 本地部署 |
| bge-large-zh | 1024 | 本地 | 中文优化 |

## Spring AI Embedding API

### 基本使用

```java
@Service
public class EmbeddingService {
    
    private final EmbeddingModel embeddingModel;
    
    public EmbeddingService(EmbeddingModel embeddingModel) {
        this.embeddingModel = embeddingModel;
    }
    
    // 单文本嵌入
    public float[] embed(String text) {
        EmbeddingResponse response = embeddingModel.embedForResponse(List.of(text));
        return response.getResult().getOutput();
    }
    
    // 批量嵌入
    public List<float[]> embedBatch(List<String> texts) {
        EmbeddingResponse response = embeddingModel.embedForResponse(texts);
        return response.getResults().stream()
                .map(Embedding::getOutput)
                .toList();
    }
    
    // 获取嵌入维度
    public int dimensions() {
        return embeddingModel.dimensions();
    }
}
```

### 配置选项

```yaml
spring:
  ai:
    openai:
      embedding:
        enabled: true
        options:
          model: text-embedding-3-small
          dimensions: 1536  # 可选，指定输出维度
```

```java
// 动态配置
@Service
public class DynamicEmbeddingService {
    
    private final EmbeddingModel embeddingModel;
    
    public float[] embedWithOptions(String text) {
        EmbeddingRequest request = new EmbeddingRequest(
                List.of(text),
                OpenAiEmbeddingOptions.builder()
                        .withModel("text-embedding-3-large")
                        .withDimensions(3072)
                        .build()
        );
        
        EmbeddingResponse response = embeddingModel.call(request);
        return response.getResult().getOutput();
    }
}
```

### 文本分块

长文本需要分块后再嵌入：

```java
@Service
public class TextChunkingService {
    
    private final EmbeddingModel embeddingModel;
    
    // 简单分块
    public List<float[]> embedLongText(String text, int chunkSize) {
        List<String> chunks = splitText(text, chunkSize);
        return embedBatch(chunks);
    }
    
    private List<String> splitText(String text, int chunkSize) {
        List<String> chunks = new ArrayList<>();
        int length = text.length();
        
        for (int i = 0; i < length; i += chunkSize) {
            int end = Math.min(i + chunkSize, length);
            chunks.add(text.substring(i, end));
        }
        
        return chunks;
    }
    
    // 智能分块（按段落/句子）
    public List<TextChunk> smartChunk(String text, int maxChunkSize, int overlap) {
        List<TextChunk> chunks = new ArrayList<>();
        
        // 按段落分割
        String[] paragraphs = text.split("\n\n");
        StringBuilder currentChunk = new StringBuilder();
        int startPosition = 0;
        
        for (String paragraph : paragraphs) {
            if (currentChunk.length() + paragraph.length() > maxChunkSize 
                    && currentChunk.length() > 0) {
                // 保存当前块
                chunks.add(new TextChunk(
                        currentChunk.toString().trim(),
                        startPosition,
                        startPosition + currentChunk.length()
                ));
                
                // 处理重叠
                String overlapText = getOverlapText(currentChunk.toString(), overlap);
                startPosition += currentChunk.length() - overlap.length();
                currentChunk = new StringBuilder(overlapText);
            }
            
            currentChunk.append(paragraph).append("\n\n");
        }
        
        // 添加最后一块
        if (currentChunk.length() > 0) {
            chunks.add(new TextChunk(
                    currentChunk.toString().trim(),
                    startPosition,
                    startPosition + currentChunk.length()
            ));
        }
        
        return chunks;
    }
    
    private String getOverlapText(String text, int overlapSize) {
        if (text.length() <= overlapSize) {
            return text;
        }
        return text.substring(text.length() - overlapSize);
    }
}

record TextChunk(String content, int startPosition, int endPosition) {}
```

## 向量数据库

### 支持的向量数据库

```
┌─────────────────────────────────────────────────────────────┐
│                    向量数据库选择                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  关系型扩展：                                                │
│  ├── PGVector (PostgreSQL) - 最简单，适合已有 PG 环境       │
│  └── MariaDB - 轻量级选择                                   │
│                                                             │
│  云托管服务：                                                │
│  ├── Pinecone - 专注向量，易于使用                          │
│  ├── MongoDB Atlas - 适合已有 MongoDB                       │
│  ├── Azure Vector Search - Azure 原生                       │
│  └── Amazon OpenSearch - AWS 原生                           │
│                                                             │
│  开源专用：                                                  │
│  ├── Milvus - 高性能，生产级                                │
│  ├── Chroma - Python 生态，简单易用                         │
│  ├── Qdrant - Rust 实现，高性能                             │
│  └── Weaviate - 语义丰富，内置向量化                        │
│                                                             │
│  缓存/搜索：                                                │
│  ├── Redis - 利用现有基础设施                               │
│  └── Elasticsearch - 全文+向量混合搜索                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### PGVector 配置

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-pgvector-store-spring-boot-starter</artifactId>
</dependency>
```

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/vectordb
    username: postgres
    password: postgres
    
  ai:
    vectorstore:
      pgvector:
        index-type: HNSW           # 索引类型
        distance-type: COSINE_DISTANCE  # 距离计算方式
        dimensions: 1536           # 向量维度
        initialize-schema: true    # 自动创建表
```

### 使用 VectorStore

```java
@Service
public class VectorStoreService {
    
    private final VectorStore vectorStore;
    private final EmbeddingModel embeddingModel;
    
    // 添加文档
    public void addDocument(String id, String content, Map<String, Object> metadata) {
        Document document = new Document(id, content, metadata);
        vectorStore.add(List.of(document));
    }
    
    // 批量添加
    public void addDocuments(List<Document> documents) {
        vectorStore.add(documents);
    }
    
    // 相似度搜索
    public List<Document> search(String query, int topK) {
        return vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(topK)
        );
    }
    
    // 带过滤条件的搜索
    public List<Document> searchWithFilter(String query, int topK, String filter) {
        return vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(topK)
                        .withSimilarityThreshold(0.7)
                        .withFilterExpression(filter)
        );
    }
    
    // 删除文档
    public void deleteDocument(String id) {
        vectorStore.delete(List.of(id));
    }
}
```

### 文档加载与处理

```java
@Service
public class DocumentIngestionService {
    
    private final VectorStore vectorStore;
    private final Tokenizer tokenizer;
    
    // 从文本加载
    public void ingestText(String text, Map<String, Object> metadata) {
        // 分块
        List<String> chunks = splitIntoChunks(text, 500, 50);
        
        // 创建文档列表
        List<Document> documents = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            Map<String, Object> chunkMetadata = new HashMap<>(metadata);
            chunkMetadata.put("chunk_index", i);
            chunkMetadata.put("total_chunks", chunks.size());
            
            documents.add(new Document(
                    UUID.randomUUID().toString(),
                    chunks.get(i),
                    chunkMetadata
            ));
        }
        
        // 存储到向量数据库
        vectorStore.add(documents);
    }
    
    // 从文件加载
    public void ingestFile(Resource file, Map<String, Object> metadata) throws IOException {
        String content = new String(file.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        ingestText(content, metadata);
    }
    
    private List<String> splitIntoChunks(String text, int chunkSize, int overlap) {
        List<String> chunks = new ArrayList<>();
        int start = 0;
        
        while (start < text.length()) {
            int end = Math.min(start + chunkSize, text.length());
            
            // 尝试在句子边界处分块
            if (end < text.length()) {
                int lastPeriod = text.lastIndexOf('。', end);
                int lastNewline = text.lastIndexOf('\n', end);
                int boundary = Math.max(lastPeriod, lastNewline);
                
                if (boundary > start) {
                    end = boundary + 1;
                }
            }
            
            chunks.add(text.substring(start, end).trim());
            start = end - overlap;
        }
        
        return chunks;
    }
}
```

### 元数据过滤

```java
@Service
public class FilteredSearchService {
    
    private final VectorStore vectorStore;
    
    // 按类别过滤
    public List<Document> searchByCategory(String query, String category, int topK) {
        return vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(topK)
                        .withFilterExpression("category == '" + category + "'")
        );
    }
    
    // 多条件过滤
    public List<Document> searchWithMultipleFilters(
            String query, 
            String category, 
            String author,
            LocalDate afterDate,
            int topK) {
        
        String filter = String.format(
                "category == '%s' && author == '%s' && date >= '%s'",
                category, author, afterDate
        );
        
        return vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(topK)
                        .withFilterExpression(filter)
        );
    }
    
    // 数值范围过滤
    public List<Document> searchByRating(String query, double minRating, int topK) {
        return vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(topK)
                        .withFilterExpression("rating >= " + minRating)
        );
    }
}
```

## 高级应用

### 混合检索

结合向量搜索和关键词搜索：

```java
@Service
public class HybridSearchService {
    
    private final VectorStore vectorStore;
    private final EmbeddingModel embeddingModel;
    private final FullTextSearchService fullTextService;
    
    public List<SearchResult> hybridSearch(String query, int topK) {
        // 1. 向量搜索
        List<Document> vectorResults = vectorStore.similaritySearch(
                SearchRequest.query(query).withTopK(topK * 2)
        );
        
        // 2. 关键词搜索
        List<Document> keywordResults = fullTextService.search(query, topK * 2);
        
        // 3. 合并结果（RRF - Reciprocal Rank Fusion）
        return mergeResults(vectorResults, keywordResults, topK);
    }
    
    private List<SearchResult> mergeResults(
            List<Document> vectorResults, 
            List<Document> keywordResults,
            int topK) {
        
        Map<String, Double> scores = new HashMap<>();
        double k = 60.0;  // RRF 参数
        
        // 计算向量搜索分数
        for (int i = 0; i < vectorResults.size(); i++) {
            String id = vectorResults.get(i).getId();
            scores.merge(id, 1.0 / (k + i + 1), Double::sum);
        }
        
        // 计算关键词搜索分数
        for (int i = 0; i < keywordResults.size(); i++) {
            String id = keywordResults.get(i).getId();
            scores.merge(id, 1.0 / (k + i + 1), Double::sum);
        }
        
        // 排序并返回
        return scores.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(topK)
                .map(entry -> new SearchResult(entry.getKey(), entry.getValue()))
                .toList();
    }
}

record SearchResult(String documentId, double score) {}
```

### 增量更新

```java
@Service
public class IncrementalUpdateService {
    
    private final VectorStore vectorStore;
    private final DocumentRepository documentRepository;
    
    // 更新单个文档
    public void updateDocument(String documentId, String newContent) {
        // 删除旧向量
        vectorStore.delete(List.of(documentId));
        
        // 添加新向量
        Document document = new Document(documentId, newContent);
        vectorStore.add(List.of(document));
        
        // 更新元数据
        documentRepository.updateTimestamp(documentId, Instant.now());
    }
    
    // 批量更新
    @Scheduled(cron = "0 0 2 * * ?")  // 每天凌晨2点执行
    public void scheduledUpdate() {
        List<DocumentEntity> outdatedDocs = documentRepository.findOutdated();
        
        for (DocumentEntity entity : outdatedDocs) {
            String newContent = fetchLatestContent(entity.getSourceUrl());
            updateDocument(entity.getId(), newContent);
        }
    }
}
```

### 多语言支持

```java
@Service
public class MultiLanguageService {
    
    private final VectorStore vectorStore;
    private final EmbeddingModel embeddingModel;
    
    // 多语言嵌入（使用支持多语言的模型）
    public void storeMultiLanguage(String id, Map<String, String> translations) {
        // 为每种语言创建向量
        for (Map.Entry<String, String> entry : translations.entrySet()) {
            String language = entry.getKey();
            String content = entry.getValue();
            
            Map<String, Object> metadata = Map.of(
                    "language", language,
                    "document_id", id
            );
            
            Document document = new Document(
                    id + "_" + language,
                    content,
                    metadata
            );
            
            vectorStore.add(List.of(document));
        }
    }
    
    // 跨语言搜索
    public List<Document> crossLanguageSearch(String query, String sourceLanguage, int topK) {
        return vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(topK)
        );
    }
}
```

## 性能优化

### 批量操作

```java
@Service
public class BatchVectorService {
    
    private final VectorStore vectorStore;
    
    // 批量添加（优化性能）
    public void batchAdd(List<Document> documents, int batchSize) {
        Lists.partition(documents, batchSize)
                .forEach(batch -> {
                    vectorStore.add(batch);
                    log.info("Added batch of {} documents", batch.size());
                });
    }
}
```

### 索引优化

```sql
-- PGVector 索引优化
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 或使用 IVFFlat 索引
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 缓存策略

```java
@Service
public class CachedVectorSearchService {
    
    private final VectorStore vectorStore;
    private final Cache<String, List<Document>> searchCache;
    
    @Cacheable(value = "vectorSearch", key = "#query.hashCode()")
    public List<Document> cachedSearch(String query, int topK) {
        return vectorStore.similaritySearch(
                SearchRequest.query(query).withTopK(topK)
        );
    }
}
```

## 小结

本章我们学习了：

1. **嵌入原理**：文本到向量的转换、相似度计算
2. **Embedding API**：基本使用、批量处理、文本分块
3. **向量数据库**：选择指南、配置方式
4. **VectorStore 操作**：CRUD、搜索、过滤
5. **高级应用**：混合检索、增量更新、多语言支持
6. **性能优化**：批量操作、索引优化、缓存策略

## 练习

1. **构建文档检索系统**：将 PDF 文档向量化并实现语义搜索
2. **实现混合检索**：结合向量搜索和关键词搜索
3. **多语言搜索**：支持中英文跨语言检索
4. **性能优化**：对比不同向量数据库的性能

## 下一章预告

在下一章《RAG 检索增强生成》中，我们将探讨：

- RAG 架构设计
- 文档加载与处理
- Spring AI RAG 组件
- 实战：构建企业知识库问答系统

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
