---
title: "Langchain4J 实战教程（七）：RAG 检索增强生成"
date: "2025-07-18 15:00:00"
excerpt: "深入掌握 RAG 检索增强生成的核心技术，学习文档处理、向量嵌入、相似度检索及完整 RAG 系统的实现方法。"
tags: ["Java", "AI", "LLM", "Langchain4J", "RAG", "教程"]
series:
  slug: "langchain4j-tutorial"
  title: "Langchain4J 实战教程"
  order: 7
---

# Langchain4J 实战教程（七）：RAG 检索增强生成

## 前言

RAG（Retrieval-Augmented Generation，检索增强生成）是目前最流行的 AI 应用架构之一。它通过检索外部知识库来增强 LLM 的能力，解决了 LLM 知识截止、幻觉等问题。本章将深入探索 RAG 的原理与实现，助你构建高质量的知识库问答系统。

## RAG 核心原理

### 什么是 RAG？

```
┌─────────────────────────────────────────────────────────────────┐
│                       RAG 核心原理                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  传统 LLM：                                                     │
│  ──────────                                                     │
│  用户问题 ──→ LLM ──→ 回答                                       │
│                                                                 │
│  问题：                                                         │
│  • 知识截止日期限制                                             │
│  • 无法访问私有数据                                             │
│  • 可能产生幻觉                                                 │
│                                                                 │
│  RAG 架构：                                                     │
│  ──────────                                                     │
│                                                                 │
│  用户问题 ──→ 向量化 ──→ 向量检索 ──→ 上下文构建 ──→ LLM ──→ 回答│
│                              │                                  │
│                              ▼                                  │
│                         知识库                                   │
│                        (向量存储)                                │
│                                                                 │
│  优势：                                                         │
│  • 可访问实时/私有数据                                           │
│  • 减少幻觉                                                     │
│  • 可追溯答案来源                                               │
│  • 无需微调模型                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### RAG 流程详解

```
┌─────────────────────────────────────────────────────────────────┐
│                    RAG 完整流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  离线阶段（索引构建）：                                          │
│  ───────────────────                                            │
│  文档 ──→ 文档加载 ──→ 文本分割 ──→ 向量嵌入 ──→ 向量存储        │
│                                                                 │
│  在线阶段（查询处理）：                                          │
│  ───────────────────                                            │
│  问题 ──→ 向量嵌入 ──→ 相似度检索 ──→ 上下文构建 ──→ LLM生成    │
│                                                                 │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                │
│  │ 文档处理  │ ──→ │ 向量存储  │ ──→ │ 检索增强  │                │
│  └──────────┘     └──────────┘     └──────────┘                │
│       │                │                │                       │
│       ▼                ▼                ▼                       │
│  Document         Embedding       Content                       │
│  Loaders          Store           Retriever                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 文档加载与处理

### 文档加载器

```java
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentLoader;
import dev.langchain4j.data.document.loader.FileSystemDocumentLoader;

// 从目录加载所有文档
List<Document> documents = FileSystemDocumentLoader.loadDocuments(
    Paths.get("/path/to/documents")
);

// 加载特定类型文档
List<Document> pdfDocuments = FileSystemDocumentLoader.loadDocuments(
    Paths.get("/path/to/documents"),
    glob -> glob.toString().endsWith(".pdf")
);

// 递归加载子目录
List<Document> allDocuments = FileSystemDocumentLoader.loadDocumentsRecursively(
    Paths.get("/path/to/documents")
);
```

### 特定格式加载

```java
// PDF 文档
import dev.langchain4j.data.document.loader.PdfDocumentLoader;
Document pdfDoc = PdfDocumentLoader.load(Paths.get("document.pdf"));

// 文本文档
import dev.langchain4j.data.document.loader.TextDocumentLoader;
Document textDoc = TextDocumentLoader.load(Paths.get("document.txt"));

// 从 URL 加载
import dev.langchain4j.data.document.loader.UrlDocumentLoader;
Document webDoc = UrlDocumentLoader.load("https://example.com/article");
```

### 文档分割

```java
import dev.langchain4j.data.document.splitter.DocumentSplitters;

// 按段落分割
DocumentSplitter splitter = DocumentSplitters.recursive(
    500,   // 最大段大小
    100    // 重叠大小（保持上下文连贯）
);

List<TextSegment> segments = splitter.split(document);

// 固定大小分割
DocumentSplitter fixedSplitter = DocumentSplitters.fixed(1000, 200);

// 按句子分割
DocumentSplitter sentenceSplitter = DocumentSplitters.sentence();
```

### 文档元数据

```java
// 添加元数据
Document document = Document.from(
    content,
    Metadata.from("source", "document.pdf")
        .add("author", "John Doe")
        .add("created_at", LocalDateTime.now())
);

// 分割后元数据继承
List<TextSegment> segments = splitter.split(document);
// 每个片段都包含原始文档的元数据
```

## 向量嵌入

### Embedding Model

```java
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;

// OpenAI Embedding
EmbeddingModel embeddingModel = OpenAiEmbeddingModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .modelName("text-embedding-3-small")
    .build();

// Ollama 本地 Embedding
import dev.langchain4j.model.ollama.OllamaEmbeddingModel;

EmbeddingModel embeddingModel = OllamaEmbeddingModel.builder()
    .baseUrl("http://localhost:11434")
    .modelName("nomic-embed-text")
    .build();

// 阿里云通义千问 Embedding
import dev.langchain4j.model.dashscope.QwenEmbeddingModel;

EmbeddingModel embeddingModel = QwenEmbeddingModel.builder()
    .apiKey(System.getenv("DASHSCOPE_API_KEY"))
    .modelName("text-embedding-v2")
    .build();
```

### 批量嵌入

```java
// 单个文本嵌入
Embedding embedding = embeddingModel.embed("Hello World").content();
float[] vector = embedding.vector();

// 批量嵌入
List<TextSegment> segments = List.of(
    TextSegment.from("文本1"),
    TextSegment.from("文本2"),
    TextSegment.from("文本3")
);

List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
```

## 向量存储

### 内存向量存储

```java
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;

// 创建内存存储
EmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();

// 添加嵌入
store.add(embedding, segment);

// 批量添加
List<String> ids = store.addAll(embeddings, segments);

// 相似度搜索
List<EmbeddingMatch<TextSegment>> matches = store.findRelevant(
    queryEmbedding,
    5  // 返回 top 5
);
```

### PGVector 存储

```xml
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-pgvector</artifactId>
    <version>1.0.0</version>
</dependency>
```

```java
import dev.langchain4j.store.embedding.pgvector.PgVectorEmbeddingStore;

EmbeddingStore<TextSegment> store = PgVectorEmbeddingStore.builder()
    .host("localhost")
    .port(5432)
    .database("langchain4j")
    .user("postgres")
    .password("password")
    .table("embeddings")
    .dimension(1536)  // 向量维度
    .build();
```

### Milvus 存储

```java
import dev.langchain4j.store.embedding.milvus.MilvusEmbeddingStore;

EmbeddingStore<TextSegment> store = MilvusEmbeddingStore.builder()
    .host("localhost")
    .port(19530)
    .collectionName("documents")
    .dimension(1536)
    .build();
```

### Elasticsearch 存储

```java
import dev.langchain4j.store.embedding.elasticsearch.ElasticsearchEmbeddingStore;

EmbeddingStore<TextSegment> store = ElasticsearchEmbeddingStore.builder()
    .serverUrl("http://localhost:9200")
    .indexName("documents")
    .build();
```

## 内容检索

### EmbeddingStoreContentRetriever

```java
import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;

ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(embeddingStore)
    .embeddingModel(embeddingModel)
    .maxResults(5)           // 返回最多 5 个结果
    .minScore(0.7)           // 最低相似度
    .build();

// 检索内容
List<Content> contents = retriever.retrieve(query);
```

### WebSearchContentRetriever

```java
import dev.langchain4j.rag.content.retriever.WebSearchContentRetriever;
import dev.langchain4j.web.search.WebSearchEngine;

ContentRetriever webRetriever = WebSearchContentRetriever.builder()
    .webSearchEngine(webSearchEngine)
    .maxResults(5)
    .build();
```

### 混合检索

```java
public class HybridContentRetriever implements ContentRetriever {
    
    private final ContentRetriever vectorRetriever;
    private final ContentRetriever keywordRetriever;
    private final double vectorWeight;
    
    @Override
    public List<Content> retrieve(Query query) {
        // 并行检索
        List<Content> vectorResults = vectorRetriever.retrieve(query);
        List<Content> keywordResults = keywordRetriever.retrieve(query);
        
        // 合并并重排序
        return mergeAndRerank(vectorResults, keywordResults, vectorWeight);
    }
    
    private List<Content> mergeAndRerank(
            List<Content> vectorResults,
            List<Content> keywordResults,
            double weight) {
        // 实现重排序逻辑
        Map<String, Double> scores = new HashMap<>();
        
        for (int i = 0; i < vectorResults.size(); i++) {
            Content content = vectorResults.get(i);
            double score = weight * (1.0 / (i + 1));
            scores.merge(content.textSegment().text(), score, Double::sum);
        }
        
        for (int i = 0; i < keywordResults.size(); i++) {
            Content content = keywordResults.get(i);
            double score = (1 - weight) * (1.0 / (i + 1));
            scores.merge(content.textSegment().text(), score, Double::sum);
        }
        
        // 按分数排序返回
        return scores.entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
            .limit(10)
            .map(entry -> Content.from(TextSegment.from(entry.getKey())))
            .collect(Collectors.toList());
    }
}
```

## RAG 集成到 AI Services

### 基础集成

```java
interface KnowledgeAssistant {
    
    @SystemMessage("""
        你是一个知识库助手。
        基于提供的知识库内容回答问题。
        如果知识库中没有相关信息，请诚实告知。
        """)
    String chat(String question);
}

KnowledgeAssistant assistant = AiServices.builder(KnowledgeAssistant.class)
    .chatLanguageModel(chatModel)
    .contentRetriever(retriever)
    .build();
```

### 带记忆的 RAG

```java
interface SmartAssistant {
    
    @SystemMessage("""
        你是一个智能知识库助手。
        基于知识库内容回答问题，并记住之前的对话上下文。
        """)
    String chat(@MemoryId String sessionId, @UserMessage String question);
}

SmartAssistant assistant = AiServices.builder(SmartAssistant.class)
    .chatLanguageModel(chatModel)
    .contentRetriever(retriever)
    .chatMemoryProvider(id -> MessageWindowChatMemory.withMaxMessages(10))
    .build();
```

### RAG 增强器

```java
import dev.langchain4j.rag.Augmentor;

public class CustomAugmentor implements Augmentor {
    
    private final ContentRetriever retriever;
    private final ContentInjector injector;
    
    @Override
    public AugmentedMessage augment(UserMessage userMessage) {
        // 1. 检索相关内容
        Query query = Query.from(userMessage.text());
        List<Content> contents = retriever.retrieve(query);
        
        // 2. 构建增强消息
        String augmentedPrompt = """
            基于以下知识库内容回答问题：
            
            知识库内容：
            %s
            
            问题：%s
            
            请基于知识库内容回答，如果知识库中没有相关信息，请说明。
            """.formatted(
                contents.stream()
                    .map(c -> c.textSegment().text())
                    .collect(Collectors.joining("\n\n")),
                userMessage.text()
            );
        
        return AugmentedMessage.builder()
            .userMessage(UserMessage.from(augmentedPrompt))
            .contents(contents)
            .build();
    }
}

// 使用
SmartAssistant assistant = AiServices.builder(SmartAssistant.class)
    .chatLanguageModel(chatModel)
    .augmentor(new CustomAugmentor(retriever))
    .build();
```

## 完整 RAG 系统

### 知识库索引服务

```java
@Service
public class KnowledgeIndexService {
    
    private final EmbeddingModel embeddingModel;
    private final EmbeddingStore<TextSegment> embeddingStore;
    private final DocumentSplitter splitter;
    
    // 索引文档
    public void indexDocument(MultipartFile file) {
        // 1. 加载文档
        Document document = loadDocument(file);
        
        // 2. 分割
        List<TextSegment> segments = splitter.split(document);
        
        // 3. 嵌入
        List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
        
        // 4. 存储
        embeddingStore.addAll(embeddings, segments);
    }
    
    // 批量索引目录
    public void indexDirectory(String directoryPath) {
        List<Document> documents = FileSystemDocumentLoader.loadDocumentsRecursively(
            Paths.get(directoryPath)
        );
        
        for (Document document : documents) {
            List<TextSegment> segments = splitter.split(document);
            List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
            embeddingStore.addAll(embeddings, segments);
        }
    }
    
    // 删除文档
    public void removeDocument(String documentId) {
        embeddingStore.removeAll(
            Filter.metadataKey("document_id").isEqualTo(documentId)
        );
    }
}
```

### 知识库问答服务

```java
@Service
public class KnowledgeQAService {
    
    private final KnowledgeAssistant assistant;
    
    public String ask(String sessionId, String question) {
        return assistant.chat(sessionId, question);
    }
    
    public AnswerWithSources askWithSources(String sessionId, String question) {
        String answer = assistant.chat(sessionId, question);
        
        // 获取来源
        List<Content> sources = retriever.retrieve(Query.from(question));
        
        return new AnswerWithSources(
            answer,
            sources.stream()
                .map(c -> new Source(
                    c.textSegment().text(),
                    c.textSegment().metadata("source"),
                    c.score()
                ))
                .collect(Collectors.toList())
        );
    }
    
    record AnswerWithSources(String answer, List<Source> sources) {}
    record Source(String content, String source, Double score) {}
}
```

### REST API

```java
@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {
    
    private final KnowledgeIndexService indexService;
    private final KnowledgeQAService qaService;
    
    // 上传文档
    @PostMapping("/documents")
    public ResponseEntity<String> uploadDocument(@RequestParam("file") MultipartFile file) {
        indexService.indexDocument(file);
        return ResponseEntity.ok("Document indexed successfully");
    }
    
    // 批量索引
    @PostMapping("/index")
    public ResponseEntity<String> indexDirectory(@RequestParam("path") String path) {
        indexService.indexDirectory(path);
        return ResponseEntity.ok("Directory indexed successfully");
    }
    
    // 问答
    @PostMapping("/ask")
    public QAResponse ask(@RequestBody QARequest request,
                         @RequestHeader(value = "X-Session-Id", defaultValue = "default") String sessionId) {
        AnswerWithSources result = qaService.askWithSources(sessionId, request.question());
        return new QAResponse(result.answer(), result.sources());
    }
    
    record QARequest(String question) {}
    record QAResponse(String answer, List<Source> sources) {}
    record Source(String content, String source, Double score) {}
}
```

## RAG 最佳实践

### 1. 文档预处理

```java
public class DocumentPreprocessor {
    
    public Document preprocess(Document document) {
        String content = document.text();
        
        // 1. 清理空白
        content = content.replaceAll("\\s+", " ").trim();
        
        // 2. 移除页眉页脚（PDF）
        content = removeHeadersFooters(content);
        
        // 3. 处理特殊字符
        content = normalizeSpecialChars(content);
        
        return Document.from(content, document.metadata());
    }
}
```

### 2. 智能分割

```java
public class SmartSplitter implements DocumentSplitter {
    
    private final int maxSegmentSize;
    private final int overlapSize;
    
    @Override
    public List<TextSegment> split(Document document) {
        String content = document.text();
        
        // 按段落分割
        List<String> paragraphs = splitByParagraphs(content);
        
        List<TextSegment> segments = new ArrayList<>();
        StringBuilder currentSegment = new StringBuilder();
        
        for (String paragraph : paragraphs) {
            if (currentSegment.length() + paragraph.length() > maxSegmentSize) {
                if (currentSegment.length() > 0) {
                    segments.add(TextSegment.from(
                        currentSegment.toString(),
                        document.metadata()
                    ));
                }
                currentSegment = new StringBuilder(paragraph);
            } else {
                if (currentSegment.length() > 0) {
                    currentSegment.append("\n\n");
                }
                currentSegment.append(paragraph);
            }
        }
        
        if (currentSegment.length() > 0) {
            segments.add(TextSegment.from(currentSegment.toString(), document.metadata()));
        }
        
        return segments;
    }
}
```

### 3. 重排序

```java
public class Reranker {
    
    private final ChatLanguageModel chatModel;
    
    public List<Content> rerank(List<Content> contents, String query) {
        // 使用 LLM 对检索结果进行重排序
        String prompt = """
            对以下文档片段与查询问题的相关性进行评分（1-10）：
            
            查询：%s
            
            文档片段：
            %s
            
            返回 JSON 格式：[{"index": 0, "score": 8}, ...]
            """.formatted(query, 
                contents.stream()
                    .map(c -> c.textSegment().text())
                    .collect(Collectors.joining("\n---\n"))
            );
        
        String response = chatModel.generate(prompt);
        List<RerankResult> results = parseResults(response);
        
        // 按分数排序
        return results.stream()
            .sorted(Comparator.comparingInt(RerankResult::score).reversed())
            .map(r -> contents.get(r.index()))
            .collect(Collectors.toList());
    }
    
    record RerankResult(int index, int score) {}
}
```

## 小结

本章我们学习了：

1. **RAG 核心原理**：架构、流程、优势
2. **文档处理**：加载器、分割器、元数据
3. **向量嵌入**：Embedding Model、批量处理
4. **向量存储**：内存、PGVector、Milvus、Elasticsearch
5. **内容检索**：向量检索、混合检索
6. **AI Services 集成**：ContentRetriever、Augmentor
7. **完整系统**：索引服务、问答服务、REST API

## 练习

1. 实现一个基于 PDF 文档的知识库问答系统
2. 构建一个带重排序功能的 RAG 系统
3. 创建一个支持增量更新的知识库管理服务

## 参考资料

- [Langchain4J RAG 文档](https://docs.langchain4j.dev/tutorials/rag)
- [Embedding Store 文档](https://docs.langchain4j.dev/tutorials/embedding-stores)
- [PGVector 官方文档](https://github.com/pgvector/pgvector)

## 下一章预告

在下一章《Tools 与 Agent 开发》中，我们将深入探索：

- Function Calling 原理
- Tools 定义与集成
- Agent 架构设计
- 多工具协作
- 复杂 Agent 实现

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
