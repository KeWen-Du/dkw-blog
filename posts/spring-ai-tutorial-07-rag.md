---
title: "Spring AI 实战教程（七）：RAG 检索增强生成"
date: "2025-09-02"
excerpt: "深入理解 RAG 架构原理，掌握 Spring AI 的 RAG 组件，构建企业级知识库问答系统。"
tags: ["Spring", "AI", "Java", "LLM", "教程"]
series:
  slug: "spring-ai-tutorial"
  title: "Spring AI 实战教程"
  order: 7
---

# Spring AI 实战教程（七）：RAG 检索增强生成

## 前言

RAG（Retrieval-Augmented Generation，检索增强生成）是当前解决 LLM 知识局限性的主流方案。通过将外部知识库与 LLM 结合，RAG 可以生成更准确、更及时的回答。本章将深入探讨 RAG 架构，并使用 Spring AI 构建企业级知识库问答系统。

## RAG 原理

### 为什么需要 RAG？

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM 的局限性                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 知识截止                                                │
│     • 训练数据有时间截止点                                   │
│     • 无法回答最新发生的事件                                 │
│                                                             │
│  2. 幻觉问题                                                │
│     • 对不熟悉的问题可能编造答案                             │
│     • 缺乏事实核查能力                                      │
│                                                             │
│  3. 领域知识缺失                                            │
│     • 企业内部知识不公开                                    │
│     • 专业领域知识有限                                      │
│                                                             │
│  4. 上下文限制                                              │
│     • 无法处理大量文档                                      │
│     • Token 数量有限制                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### RAG 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       RAG 架构流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                              │
│  │  用户问题     │                                              │
│  │ "如何配置Redis?"│                                             │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────┐                  │
│  │           1. 问题理解与改写               │                  │
│  │  • 提取关键词                             │                  │
│  │  • 问题扩展/改写                          │                  │
│  └──────────────────────────────────────────┘                  │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────┐                  │
│  │           2. 向量检索                     │                  │
│  │  • 问题向量化                             │                  │
│  │  • 在知识库中搜索相关文档                  │                  │
│  │  • 返回 Top-K 相关片段                    │                  │
│  └──────────────────────────────────────────┘                  │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────┐                  │
│  │           3. 上下文构建                   │                  │
│  │  • 整合检索到的文档片段                    │                  │
│  │  • 按相关性排序                           │                  │
│  │  • 控制总 Token 数                        │                  │
│  └──────────────────────────────────────────┘                  │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────┐                  │
│  │           4. LLM 生成                     │                  │
│  │  • 系统提示 + 用户问题 + 检索上下文        │                  │
│  │  • 基于上下文生成准确回答                  │                  │
│  └──────────────────────────────────────────┘                  │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │   最终回答    │                                              │
│  │ "根据文档..." │                                              │
│  └──────────────┘                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### RAG vs 微调

| 特性 | RAG | 微调 |
|------|-----|------|
| 知识更新 | 实时更新 | 需重新训练 |
| 成本 | 较低 | 较高 |
| 可解释性 | 高（可引用来源） | 低 |
| 领域适应 | 灵活 | 固定 |
| 实时性 | 高 | 低 |
| 适用场景 | 知识密集型问答 | 特定任务优化 |

## Spring AI RAG 组件

### 核心组件概览

```
┌─────────────────────────────────────────────────────────────┐
│                  Spring AI RAG 组件                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  文档处理层：                                                │
│  ├── DocumentReader - 文档读取器                            │
│  ├── DocumentTransformer - 文档转换器（分块等）              │
│  └── TextSplitter - 文本分割器                              │
│                                                             │
│  向量处理层：                                                │
│  ├── EmbeddingModel - 嵌入模型                              │
│  └── VectorStore - 向量存储                                 │
│                                                             │
│  检索增强层：                                                │
│  ├── QuestionAnswerAdvisor - RAG Advisor                    │
│  ├── RetrievalAugmentationAdvisor - 增强检索                │
│  └── DocumentRetriever - 文档检索器                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 使用 QuestionAnswerAdvisor

最简单的 RAG 实现：

```java
@Service
public class SimpleRagService {
    
    private final ChatClient chatClient;
    
    public SimpleRagService(ChatModel chatModel, VectorStore vectorStore) {
        this.chatClient = ChatClient.builder(chatModel)
                .defaultAdvisors(new QuestionAnswerAdvisor(vectorStore))
                .defaultSystem("""
                        你是一个专业的技术支持助手。
                        请根据检索到的文档内容回答用户问题。
                        如果文档中没有相关信息，请诚实告知。
                        回答时请注明信息来源。
                        """)
                .build();
    }
    
    public String ask(String question) {
        return chatClient.prompt()
                .user(question)
                .call()
                .content();
    }
}
```

### 自定义检索配置

```java
@Service
public class ConfigurableRagService {
    
    private final ChatClient chatClient;
    
    public ConfigurableRagService(ChatModel chatModel, VectorStore vectorStore) {
        // 创建带配置的 Advisor
        QuestionAnswerAdvisor advisor = QuestionAnswerAdvisor.builder()
                .withVectorStore(vectorStore)
                .withTopK(5)                    // 返回 Top 5 相关文档
                .withSimilarityThreshold(0.7)    // 相似度阈值
                .withUserTextAdvise("""
                        上下文信息如下：
                        {question_answer_context}
                        
                        请基于以上上下文回答问题。
                        """)
                .build();
        
        this.chatClient = ChatClient.builder(chatModel)
                .defaultAdvisors(advisor)
                .build();
    }
    
    public String ask(String question) {
        return chatClient.prompt()
                .user(question)
                .call()
                .content();
    }
    
    // 带过滤条件的查询
    public String askWithContext(String question, String category) {
        return chatClient.prompt()
                .user(question)
                .advisors(advisor -> advisor
                        .param("filter", "category == '" + category + "'"))
                .call()
                .content();
    }
}
```

## 文档处理流水线

### ETL 流程

```
┌─────────────────────────────────────────────────────────────┐
│                    ETL 流水线                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   Extract   │───→│  Transform  │───→│    Load     │    │
│   │   文档读取   │    │   文档处理   │    │   向量存储   │    │
│   └─────────────┘    └─────────────┘    └─────────────┘    │
│                                                             │
│   支持格式：                                                 │
│   • PDF                                                     │
│   • Word (DOCX)                                             │
│   • Markdown                                                │
│   • HTML                                                    │
│   • TXT                                                     │
│   • JSON                                                    │
│                                                             │
│   处理步骤：                                                 │
│   1. 文档解析                                               │
│   2. 文本提取                                               │
│   3. 文档分块                                               │
│   4. 向量化                                                 │
│   5. 存储索引                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 文档读取器

```java
@Service
public class DocumentReaderService {
    
    // 读取文本文件
    public List<Document> readTextFile(Resource resource) throws IOException {
        TextReader reader = new TextReader(resource);
        reader.getCustomMetadata().put("source", resource.getFilename());
        return reader.get();
    }
    
    // 读取 PDF
    public List<Document> readPdf(Resource resource) {
        PagePdfDocumentReader reader = new PagePdfDocumentReader(resource);
        return reader.get();
    }
    
    // 读取 Markdown
    public List<Document> readMarkdown(Resource resource) throws IOException {
        String content = new String(resource.getInputStream().readAllBytes());
        
        return List.of(new Document(
                UUID.randomUUID().toString(),
                content,
                Map.of("source", resource.getFilename(), "type", "markdown")
        ));
    }
    
    // 读取 JSON
    public List<Document> readJson(Resource resource) throws IOException {
        JsonReader reader = new JsonReader(
                resource,
                "content",    // 内容字段
                "title"       // 元数据字段
        );
        return reader.get();
    }
}
```

### 文档分割器

```java
@Service
public class DocumentSplitterService {
    
    // Token 分割
    public List<Document> splitByToken(List<Document> documents, int chunkSize, int overlap) {
        TokenTextSplitter splitter = new TokenTextSplitter(
                chunkSize,           // 块大小
                overlap,             // 重叠大小
                5,                   // 最小块大小
                10000,               // 最大块大小
                true                 // 保持段落完整
        );
        
        return splitter.apply(documents);
    }
    
    // 段落分割
    public List<Document> splitByParagraph(List<Document> documents) {
        ParagraphTextSplitter splitter = new ParagraphTextSplitter();
        return splitter.apply(documents);
    }
    
    // 递归分割（推荐）
    public List<Document> splitRecursively(List<Document> documents) {
        RecursiveCharacterTextSplitter splitter = new RecursiveCharacterTextSplitter(
                512,     // 块大小
                128,     // 重叠大小
                List.of("\n\n", "\n", " ", "")  // 分隔符优先级
        );
        
        return splitter.apply(documents);
    }
}
```

### 完整 ETL 流水线

```java
@Service
public class DocumentETLService {
    
    private final VectorStore vectorStore;
    private final EmbeddingModel embeddingModel;
    
    // 处理单个文件
    public void processFile(Resource file, Map<String, Object> metadata) throws IOException {
        // 1. 读取文档
        List<Document> documents = readDocument(file);
        
        // 2. 添加元数据
        documents.forEach(doc -> {
            doc.getMetadata().putAll(metadata);
            doc.getMetadata().put("filename", file.getFilename());
            doc.getMetadata().put("import_time", Instant.now().toString());
        });
        
        // 3. 分割文档
        TokenTextSplitter splitter = new TokenTextSplitter(512, 100, 20, 5000, true);
        List<Document> chunks = splitter.apply(documents);
        
        // 4. 存储到向量数据库
        vectorStore.add(chunks);
        
        log.info("Processed file {} with {} chunks", file.getFilename(), chunks.size());
    }
    
    // 批量处理目录
    public void processDirectory(String directoryPath, Map<String, Object> baseMetadata) {
        Resource[] resources = new PathMatchingResourcePatternResolver()
                .getResources("file:" + directoryPath + "/**/*.{txt,md,pdf}");
        
        for (Resource resource : resources) {
            try {
                processFile(resource, baseMetadata);
            } catch (Exception e) {
                log.error("Failed to process file: {}", resource.getFilename(), e);
            }
        }
    }
    
    private List<Document> readDocument(Resource resource) throws IOException {
        String filename = resource.getFilename();
        
        if (filename.endsWith(".pdf")) {
            return new PagePdfDocumentReader(resource).get();
        } else if (filename.endsWith(".md")) {
            String content = new String(resource.getInputStream().readAllBytes());
            return List.of(new Document(content));
        } else {
            return new TextReader(resource).get();
        }
    }
}
```

## 高级 RAG 技术

### 查询改写

```java
@Service
public class QueryRewriteService {
    
    private final ChatClient chatClient;
    
    // 多查询生成
    public List<String> generateMultiQueries(String originalQuery) {
        String response = chatClient.prompt()
                .system("""
                        你是一个查询扩展专家。
                        给定一个用户问题，生成3个语义相近但表述不同的问题。
                        这些问题将用于检索相关文档。
                        
                        输出格式：每行一个问题，不要编号。
                        """)
                .user(originalQuery)
                .call()
                .content();
        
        return Arrays.asList(response.split("\n"));
    }
    
    // HyDE (假设性文档嵌入)
    public String generateHypotheticalDocument(String query) {
        return chatClient.prompt()
                .system("""
                        你是一个技术文档写作专家。
                        给定一个问题，生成一段可能包含答案的假设性文档。
                        这段文档将用于检索相似的真实文档。
                        """)
                .user(query)
                .call()
                .content();
    }
}
```

### 重排序

```java
@Service
public class RerankingService {
    
    private final ChatClient chatClient;
    
    // LLM 重排序
    public List<Document> rerankWithLLM(String query, List<Document> documents, int topK) {
        String docList = IntStream.range(0, documents.size())
                .mapToObj(i -> String.format("[%d] %s", i, 
                        documents.get(i).getContent().substring(0, Math.min(200, documents.get(i).getContent().length()))))
                .collect(Collectors.joining("\n"));
        
        String response = chatClient.prompt()
                .system("""
                        你是一个相关性判断专家。
                        给定一个问题和多个文档片段，判断每个文档与问题的相关性。
                        
                        输出格式：返回最相关的文档编号列表，如：0,2,5
                        """)
                .user("""
                        问题：%s
                        
                        文档列表：
                        %s
                        
                        请返回最相关的%d个文档的编号。
                        """.formatted(query, docList, topK))
                .call()
                .content();
        
        // 解析结果并返回重排序后的文档
        List<Integer> indices = Arrays.stream(response.split(","))
                .map(String::trim)
                .map(Integer::parseInt)
                .toList();
        
        return indices.stream()
                .map(documents::get)
                .toList();
    }
    
    // 基于相似度的重排序
    public List<Document> rerankBySimilarity(
            String query, 
            List<Document> documents, 
            EmbeddingModel embeddingModel) {
        
        float[] queryEmbedding = embeddingModel.embed(query);
        
        return documents.stream()
                .map(doc -> new Pair<>(doc, 
                        cosineSimilarity(queryEmbedding, doc.getEmbedding())))
                .sorted(Comparator.comparingDouble(Pair<Document, Double>::getSecond).reversed())
                .map(Pair::getFirst)
                .toList();
    }
}
```

### 上下文压缩

```java
@Service
public class ContextCompressionService {
    
    private final ChatClient chatClient;
    
    // 压缩上下文以适应 Token 限制
    public String compressContext(List<Document> documents, String query, int maxTokens) {
        // 合并文档内容
        String fullContext = documents.stream()
                .map(Document::getContent)
                .collect(Collectors.joining("\n\n---\n\n"));
        
        // 如果内容已经足够短，直接返回
        int estimatedTokens = fullContext.length() / 4;  // 粗略估计
        if (estimatedTokens <= maxTokens) {
            return fullContext;
        }
        
        // 使用 LLM 压缩
        return chatClient.prompt()
                .system("""
                        你是一个信息提取专家。
                        从给定的文档内容中提取与问题最相关的信息。
                        保持信息的准确性和完整性，但删除无关内容。
                        压缩后的内容应在%d个Token以内。
                        """.formatted(maxTokens))
                .user("""
                        问题：%s
                        
                        文档内容：
                        %s
                        """.formatted(query, fullContext))
                .call()
                .content();
    }
}
```

## 企业级知识库实战

### 完整架构

```
┌─────────────────────────────────────────────────────────────────┐
│                  企业知识库问答系统架构                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     用户接口层                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │  Web 界面   │  │  API 接口   │  │  企业微信   │      │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     服务层                                │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │              KnowledgeBaseService                 │    │  │
│  │  │  • 问题理解                                       │    │  │
│  │  │  • 向量检索                                       │    │  │
│  │  │  • 上下文构建                                     │    │  │
│  │  │  • LLM 生成                                       │    │  │
│  │  └──────────────────────────────────────────────────┘    │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │              DocumentService                      │    │  │
│  │  │  • 文档上传                                       │    │  │
│  │  │  • 文档解析                                       │    │  │
│  │  │  • 向量化存储                                     │    │  │
│  │  └──────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     数据层                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │ VectorStore │  │ PostgreSQL  │  │   Redis     │      │  │
│  │  │   向量库    │  │  元数据     │  │   缓存      │      │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 核心服务实现

```java
@Service
public class KnowledgeBaseService {
    
    private final ChatClient chatClient;
    private final VectorStore vectorStore;
    private final ChatMemory chatMemory;
    private final QueryRewriteService queryRewriteService;
    private final RerankingService rerankingService;
    
    public KnowledgeBaseService(
            ChatModel chatModel,
            VectorStore vectorStore,
            ChatMemory chatMemory,
            QueryRewriteService queryRewriteService,
            RerankingService rerankingService) {
        
        this.vectorStore = vectorStore;
        this.chatMemory = chatMemory;
        this.queryRewriteService = queryRewriteService;
        this.rerankingService = rerankingService;
        
        // 创建带 RAG 的 ChatClient
        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        你是企业知识库助手。
                        请根据检索到的文档内容准确回答用户问题。
                        
                        回答要求：
                        1. 答案必须基于检索到的文档内容
                        2. 如果文档中没有相关信息，请明确告知
                        3. 回答要准确、简洁、有条理
                        4. 可以引用文档来源
                        """)
                .defaultAdvisors(new QuestionAnswerAdvisor(vectorStore))
                .build();
    }
    
    public AnswerResult ask(String sessionId, String question) {
        long startTime = System.currentTimeMillis();
        
        // 1. 查询改写（可选）
        List<String> queries = queryRewriteService.generateMultiQueries(question);
        queries.add(0, question);  // 原始查询放第一位
        
        // 2. 多查询检索
        List<Document> allDocs = new ArrayList<>();
        for (String q : queries) {
            List<Document> docs = vectorStore.similaritySearch(
                    SearchRequest.query(q).withTopK(5)
            );
            allDocs.addAll(docs);
        }
        
        // 3. 去重和重排序
        List<Document> uniqueDocs = deduplicate(allDocs);
        List<Document> rankedDocs = rerankingService.rerankWithLLM(question, uniqueDocs, 5);
        
        // 4. 构建上下文
        String context = rankedDocs.stream()
                .map(doc -> "【来源: " + doc.getMetadata().get("source") + "】\n" + doc.getContent())
                .collect(Collectors.joining("\n\n"));
        
        // 5. 生成回答
        String answer = chatClient.prompt()
                .user(u -> u.text("""
                        问题：{question}
                        
                        相关文档：
                        {context}
                        """)
                        .param("question", question)
                        .param("context", context))
                .advisors(advisor -> advisor
                        .param("chat_memory_conversation_id", sessionId))
                .call()
                .content();
        
        // 6. 返回结果
        return new AnswerResult(
                answer,
                rankedDocs.stream().map(this::toSource).toList(),
                System.currentTimeMillis() - startTime
        );
    }
    
    private List<Document> deduplicate(List<Document> documents) {
        return documents.stream()
                .collect(Collectors.toMap(
                        Document::getId,
                        doc -> doc,
                        (existing, replacement) -> existing
                ))
                .values()
                .stream()
                .toList();
    }
    
    private Source toSource(Document doc) {
        return new Source(
                (String) doc.getMetadata().get("source"),
                (String) doc.getMetadata().get("filename"),
                doc.getContent().substring(0, Math.min(100, doc.getContent().length()))
        );
    }
}

record AnswerResult(String answer, List<Source> sources, long latencyMs) {}
record Source(String id, String filename, String snippet) {}
```

### 文档管理服务

```java
@Service
public class DocumentManagementService {
    
    private final VectorStore vectorStore;
    private final DocumentRepository documentRepository;
    private final EmbeddingModel embeddingModel;
    
    // 上传文档
    @Transactional
    public DocumentEntity uploadDocument(MultipartFile file, String category, String uploader) {
        // 1. 保存元数据
        DocumentEntity entity = new DocumentEntity();
        entity.setFilename(file.getOriginalFilename());
        entity.setCategory(category);
        entity.setUploader(uploader);
        entity.setUploadTime(Instant.now());
        entity.setStatus("PROCESSING");
        
        entity = documentRepository.save(entity);
        
        // 2. 异步处理文档
        processDocumentAsync(entity.getId(), file);
        
        return entity;
    }
    
    @Async
    protected void processDocumentAsync(Long documentId, MultipartFile file) {
        try {
            DocumentEntity entity = documentRepository.findById(documentId).orElseThrow();
            
            // 读取文档内容
            String content = extractContent(file);
            
            // 分块
            List<String> chunks = splitIntoChunks(content, 512, 100);
            
            // 创建向量文档
            List<Document> vectorDocs = new ArrayList<>();
            for (int i = 0; i < chunks.size(); i++) {
                Map<String, Object> metadata = Map.of(
                        "document_id", documentId.toString(),
                        "filename", entity.getFilename(),
                        "category", entity.getCategory(),
                        "chunk_index", i
                );
                
                vectorDocs.add(new Document(
                        documentId + "_" + i,
                        chunks.get(i),
                        metadata
                ));
            }
            
            // 存储到向量数据库
            vectorStore.add(vectorDocs);
            
            // 更新状态
            entity.setStatus("COMPLETED");
            entity.setChunkCount(chunks.size());
            documentRepository.save(entity);
            
        } catch (Exception e) {
            DocumentEntity entity = documentRepository.findById(documentId).orElseThrow();
            entity.setStatus("FAILED");
            entity.setError(e.getMessage());
            documentRepository.save(entity);
        }
    }
    
    // 删除文档
    @Transactional
    public void deleteDocument(Long documentId) {
        // 删除向量
        // vectorStore.deleteByMetadata("document_id", documentId.toString());
        
        // 删除元数据
        documentRepository.deleteById(documentId);
    }
    
    private String extractContent(MultipartFile file) throws IOException {
        String filename = file.getOriginalFilename();
        byte[] bytes = file.getBytes();
        
        if (filename.endsWith(".pdf")) {
            // PDF 提取
            return extractPdfContent(bytes);
        } else if (filename.endsWith(".docx")) {
            // Word 提取
            return extractDocxContent(bytes);
        } else {
            // 默认文本
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }
    
    private List<String> splitIntoChunks(String content, int chunkSize, int overlap) {
        List<String> chunks = new ArrayList<>();
        int start = 0;
        
        while (start < content.length()) {
            int end = Math.min(start + chunkSize, content.length());
            chunks.add(content.substring(start, end));
            start = end - overlap;
        }
        
        return chunks;
    }
}
```

### REST API

```java
@RestController
@RequestMapping("/api/knowledge-base")
public class KnowledgeBaseController {
    
    private final KnowledgeBaseService knowledgeBaseService;
    private final DocumentManagementService documentService;
    
    // 问答接口
    @PostMapping("/ask")
    public ResponseEntity<AnswerResult> ask(
            @RequestParam String sessionId,
            @RequestBody QuestionRequest request) {
        
        AnswerResult result = knowledgeBaseService.ask(sessionId, request.question());
        return ResponseEntity.ok(result);
    }
    
    // 上传文档
    @PostMapping("/documents")
    public ResponseEntity<DocumentEntity> uploadDocument(
            @RequestParam MultipartFile file,
            @RequestParam String category,
            @RequestParam String uploader) {
        
        DocumentEntity entity = documentService.uploadDocument(file, category, uploader);
        return ResponseEntity.ok(entity);
    }
    
    // 删除文档
    @DeleteMapping("/documents/{id}")
    public ResponseEntity<Void> deleteDocument(@PathVariable Long id) {
        documentService.deleteDocument(id);
        return ResponseEntity.ok().build();
    }
    
    // 流式回答
    @GetMapping(value = "/ask/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> askStream(
            @RequestParam String sessionId,
            @RequestParam String question) {
        
        return knowledgeBaseService.askStream(sessionId, question);
    }
}

record QuestionRequest(String question) {}
```

## RAG 效果评估

### 评估指标

```java
@Service
public class RagEvaluationService {
    
    // 检索准确率
    public double calculateRetrievalAccuracy(
            List<String> queries,
            Map<String, List<String>> groundTruth,
            VectorStore vectorStore,
            int topK) {
        
        int correct = 0;
        int total = queries.size();
        
        for (String query : queries) {
            List<Document> retrieved = vectorStore.similaritySearch(
                    SearchRequest.query(query).withTopK(topK)
            );
            
            List<String> retrievedIds = retrieved.stream()
                    .map(doc -> (String) doc.getMetadata().get("document_id"))
                    .toList();
            
            List<String> expectedIds = groundTruth.get(query);
            
            // 计算召回率
            long matches = retrievedIds.stream()
                    .filter(expectedIds::contains)
                    .count();
            
            if (matches > 0) {
                correct++;
            }
        }
        
        return (double) correct / total;
    }
    
    // 生成质量评估
    public QualityMetrics evaluateAnswer(
            String question,
            String answer,
            String groundTruth,
            List<Document> sources) {
        
        return new QualityMetrics(
                calculateFaithfulness(answer, sources),
                calculateRelevance(question, answer),
                calculateCompleteness(answer, groundTruth),
                calculateConciseness(answer)
        );
    }
    
    private double calculateFaithfulness(String answer, List<Document> sources) {
        // 检查答案是否忠实于来源
        // 实现略
        return 0.9;
    }
    
    private double calculateRelevance(String question, String answer) {
        // 检查答案与问题的相关性
        // 实现略
        return 0.85;
    }
    
    private double calculateCompleteness(String answer, String groundTruth) {
        // 检查答案的完整性
        // 实现略
        return 0.8;
    }
    
    private double calculateConciseness(String answer) {
        // 检查答案的简洁性
        // 实现略
        return 0.75;
    }
}

record QualityMetrics(
    double faithfulness,
    double relevance,
    double completeness,
    double conciseness
) {}
```

## 小结

本章我们学习了：

1. **RAG 原理**：为什么需要 RAG、架构流程、与微调对比
2. **Spring AI RAG 组件**：QuestionAnswerAdvisor、自定义配置
3. **文档处理流水线**：ETL 流程、文档读取器、分割器
4. **高级 RAG 技术**：查询改写、重排序、上下文压缩
5. **企业级实战**：完整架构、核心服务、REST API
6. **效果评估**：检索准确率、生成质量

## 练习

1. **构建技术文档问答**：将技术文档向量化并实现问答系统
2. **实现多轮对话**：结合 ChatMemory 实现上下文感知的问答
3. **添加引用来源**：在回答中显示文档来源和位置
4. **效果优化**：尝试不同的分块策略和检索参数

## 下一章预告

在下一章《Tools 与 Function Calling》中，我们将探讨：

- Function Calling 原理
- Spring AI Tools API
- 自定义工具开发
- 实战：构建具备外部调用能力的 Agent

敬请期待！

---

**教程系列持续更新中，欢迎关注！**
