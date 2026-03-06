---
title: "大模型应用开发教程（六）：构建第一个 AI 应用"
date: "2024-06-12"
excerpt: "从零开始构建一个完整的智能客服系统，涵盖需求分析、架构设计、前后端开发和部署上线全流程。"
tags: ["大模型", "AI应用", "智能客服", "全栈开发"]
series:
  slug: "llm-app-dev-tutorial"
  title: "大模型应用开发教程"
  order: 6
---

# 大模型应用开发教程（六）：构建第一个 AI 应用

## 前言

经过前面章节的学习，我们已经掌握了 API 调用、提示词工程和集成开发的核心技能。本章将通过一个完整的实战项目——智能客服系统，将所有知识融会贯通，从需求分析到部署上线，完整体验 AI 应用开发的全流程。

## 项目概述

### 需求分析

我们将开发一个**智能客服助手**，具备以下核心功能：

```
┌─────────────────────────────────────────────────────────┐
│                   智能客服系统功能                        │
├─────────────────────────────────────────────────────────┤
│  ✅ 智能问答：基于知识库回答用户问题                       │
│  ✅ 多轮对话：支持上下文关联的连续对话                     │
│  ✅ 意图识别：自动识别用户意图并分流                       │
│  ✅ 工单创建：复杂问题自动创建工单                        │
│  ✅ 满意度评价：收集用户反馈                              │
│  ✅ 数据统计：对话数据分析与可视化                        │
└─────────────────────────────────────────────────────────┘
```

### 技术选型

```
前端：Next.js 14 + React + Tailwind CSS
后端：FastAPI (Python)
AI引擎：OpenAI GPT-4o-mini
数据库：PostgreSQL + Redis
向量库：Pinecone / Chroma
部署：Vercel + Railway
```

## 项目架构

### 系统架构图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户端    │────→│  API 网关   │────→│  AI 服务    │
│  (Next.js)  │     │  (FastAPI)  │     │  (OpenAI)   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
          ┌───────────────┼───────────────┐
          ↓               ↓               ↓
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │ PostgreSQL│   │   Redis   │   │  向量库   │
    │  (数据)   │   │  (缓存)   │   │ (知识库)  │
    └───────────┘   └───────────┘   └───────────┘
```

### 目录结构

```
smart-customer-service/
├── frontend/                 # 前端项目
│   ├── app/
│   │   ├── page.tsx         # 首页
│   │   ├── chat/            # 对话页面
│   │   └── admin/           # 管理后台
│   ├── components/          # 组件
│   └── lib/                 # 工具函数
├── backend/                  # 后端项目
│   ├── app/
│   │   ├── main.py          # 入口
│   │   ├── routers/         # 路由
│   │   ├── services/        # 业务逻辑
│   │   ├── models/          # 数据模型
│   │   └── utils/           # 工具函数
│   └── requirements.txt
└── docker-compose.yml
```

## 后端开发

### 1. 项目初始化

```bash
# 创建项目目录
mkdir smart-customer-service
cd smart-customer-service

# 创建后端项目
mkdir backend
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 安装依赖
pip install fastapi uvicorn openai python-dotenv redis psycopg2-binary sqlalchemy pydantic
```

### 2. 核心代码实现

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat, admin, knowledge
from app.services.cache import init_redis

app = FastAPI(
    title="智能客服 API",
    description="基于大模型的智能客服系统",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])

@app.on_event("startup")
async def startup():
    await init_redis()

@app.get("/")
async def root():
    return {"message": "智能客服 API 运行中"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
```

```python
# backend/app/routers/chat.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.services.chat_service import ChatService

router = APIRouter()
chat_service = ChatService()

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    user_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    intent: Optional[str] = None
    confidence: Optional[float] = None

@router.post("/message", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """发送消息并获取回复"""
    try:
        result = await chat_service.process_message(
            message=request.message,
            conversation_id=request.conversation_id,
            user_id=request.user_id
        )
        return ChatResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{conversation_id}")
async def get_history(conversation_id: str):
    """获取对话历史"""
    history = await chat_service.get_history(conversation_id)
    return {"history": history}

@router.post("/feedback")
async def submit_feedback(
    conversation_id: str,
    rating: int,
    comment: Optional[str] = None
):
    """提交满意度评价"""
    await chat_service.save_feedback(conversation_id, rating, comment)
    return {"message": "感谢您的反馈！"}
```

```python
# backend/app/services/chat_service.py
import os
from typing import Optional, List, Dict
from openai import AsyncOpenAI
from app.services.knowledge_service import KnowledgeService
from app.services.cache import CacheService
from app.services.intent_classifier import IntentClassifier

class ChatService:
    def __init__(self):
        self.client = AsyncOpenAI()
        self.knowledge_service = KnowledgeService()
        self.cache = CacheService()
        self.intent_classifier = IntentClassifier()
        
        self.system_prompt = """
你是一个专业的客服助手，负责回答用户的问题。

你的职责：
1. 友好、专业地回答用户问题
2. 如果问题超出你的知识范围，引导用户创建工单
3. 保持回答简洁明了
4. 必要时主动询问更多细节

当前可用工具：
- create_ticket: 创建工单（当无法解决问题时使用）
- transfer_human: 转接人工（当用户要求时使用）
"""

    async def process_message(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """处理用户消息"""
        
        # 1. 获取或创建对话
        if not conversation_id:
            conversation_id = self.cache.create_conversation(user_id)
        
        # 2. 获取历史消息
        history = await self.cache.get_history(conversation_id)
        
        # 3. 检索相关知识
        knowledge = await self.knowledge_service.search(message)
        
        # 4. 意图识别
        intent, confidence = await self.intent_classifier.classify(message)
        
        # 5. 构建消息
        messages = [
            {"role": "system", "content": self.system_prompt}
        ]
        
        if knowledge:
            messages[0]["content"] += f"\n\n相关知识：\n{knowledge}"
        
        messages.extend(history)
        messages.append({"role": "user", "content": message})
        
        # 6. 调用大模型
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=1024
        )
        
        assistant_message = response.choices[0].message.content
        
        # 7. 保存对话历史
        await self.cache.append_message(conversation_id, "user", message)
        await self.cache.append_message(conversation_id, "assistant", assistant_message)
        
        return {
            "response": assistant_message,
            "conversation_id": conversation_id,
            "intent": intent,
            "confidence": confidence
        }
    
    async def get_history(self, conversation_id: str) -> List[Dict]:
        """获取对话历史"""
        return await self.cache.get_history(conversation_id)
    
    async def save_feedback(
        self,
        conversation_id: str,
        rating: int,
        comment: Optional[str]
    ):
        """保存用户反馈"""
        await self.cache.save_feedback(conversation_id, rating, comment)
```

```python
# backend/app/services/intent_classifier.py
from openai import AsyncOpenAI
import json

class IntentClassifier:
    def __init__(self):
        self.client = AsyncOpenAI()
        self.intents = [
            "product_inquiry",    # 产品咨询
            "order_status",       # 订单查询
            "technical_support",  # 技术支持
            "complaint",          # 投诉建议
            "general_question",   # 一般问题
            "greeting",           # 问候
            "other"               # 其他
        ]
    
    async def classify(self, message: str) -> tuple[str, float]:
        """识别用户意图"""
        
        prompt = f"""
分析以下用户消息的意图，从以下选项中选择最合适的一个：
{json.dumps(self.intents, ensure_ascii=False)}

用户消息：{message}

请以 JSON 格式返回：
{{
    "intent": "意图名称",
    "confidence": 0.0-1.0
}}
"""
        
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        return result["intent"], result["confidence"]
```

## 前端开发

### 1. 项目初始化

```bash
# 创建前端项目
npx create-next-app@latest frontend
cd frontend

# 安装依赖
npm install @tailwindcss/typography react-markdown lucide-react
```

### 2. 核心组件实现

```tsx
// frontend/app/chat/page.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversation_id: conversationId
        })
      })

      const data = await response.json()
      
      setConversationId(data.conversation_id)
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (error) {
      console.error('Error:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '抱歉，发生了错误，请稍后重试。' 
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-gray-900">智能客服</h1>
          <p className="text-sm text-gray-500">有什么可以帮助您的？</p>
        </div>
      </header>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white shadow-sm border'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-600" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-white shadow-sm border rounded-2xl px-4 py-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="输入您的问题..."
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

## 部署上线

### Docker 部署

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/customer_service
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=customer_service
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 启动命令

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 生产级安全设计

### 安全架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    生产级安全架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户请求                                                       │
│      │                                                         │
│      ↓                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │           WAF / API Gateway             │                   │
│  │  • DDoS 防护                            │                   │
│  │  • 请求限流                             │                   │
│  │  • SQL/XSS 过滤                         │                   │
│  └─────────────────────────────────────────┘                   │
│      │                                                         │
│      ↓                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │           身份认证层                     │                   │
│  │  • JWT Token 验证                       │                   │
│  │  • API Key 管理                         │                   │
│  │  • 权限控制 (RBAC)                      │                   │
│  └─────────────────────────────────────────┘                   │
│      │                                                         │
│      ↓                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │           内容安全层                     │                   │
│  │  • PII 检测与脱敏                       │                   │
│  │  • 敏感词过滤                           │                   │
│  │  • 提示词注入防护                       │                   │
│  └─────────────────────────────────────────┘                   │
│      │                                                         │
│      ↓                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │           审计日志层                     │                   │
│  │  • 请求/响应日志                        │                   │
│  │  • 异常行为检测                         │                   │
│  │  • 合规审计追踪                         │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 安全代码实现

```python
from dataclasses import dataclass
from typing import Optional, List
import re
import hashlib
from datetime import datetime

@dataclass
class SecurityConfig:
    """安全配置"""
    enable_pii_detection: bool = True
    enable_prompt_injection_detection: bool = True
    enable_content_filter: bool = True
    max_input_length: int = 10000
    sensitive_patterns: List[str] = None
    blocked_patterns: List[str] = None

class SecurityMiddleware:
    """安全中间件"""
    
    # PII 检测模式
    PII_PATTERNS = {
        "phone": r"1[3-9]\d{9}",
        "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
        "id_card": r"\d{17}[\dXx]",
        "bank_card": r"\d{16,19}",
        "ip_address": r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    }
    
    # 提示词注入模式
    INJECTION_PATTERNS = [
        r"ignore\s+(previous|all|above)\s+(instructions?|rules?)",
        r"system\s*:",
        r"<\|.*?\|>",
        r"you\s+are\s+now",
        r"disregard\s+",
    ]
    
    def __init__(self, config: SecurityConfig = None):
        self.config = config or SecurityConfig()
    
    def validate_input(self, user_input: str) -> tuple[bool, str, dict]:
        """验证用户输入"""
        
        issues = []
        
        # 1. 长度检查
        if len(user_input) > self.config.max_input_length:
            return False, "输入过长", {"max_length": self.config.max_input_length}
        
        # 2. PII 检测
        if self.config.enable_pii_detection:
            pii_found = self._detect_pii(user_input)
            if pii_found:
                issues.append(f"检测到敏感信息: {', '.join(pii_found.keys())}")
        
        # 3. 提示词注入检测
        if self.config.enable_prompt_injection_detection:
            injection_detected = self._detect_injection(user_input)
            if injection_detected:
                return False, "检测到潜在的提示词注入", {"patterns": injection_detected}
        
        # 4. 敏感词过滤
        if self.config.enable_content_filter:
            sensitive_words = self._filter_sensitive(user_input)
            if sensitive_words:
                issues.append(f"包含敏感词: {sensitive_words}")
        
        return len(issues) == 0, "; ".join(issues) if issues else "OK", {}
    
    def _detect_pii(self, text: str) -> dict:
        """检测 PII"""
        found = {}
        for pii_type, pattern in self.PII_PATTERNS.items():
            matches = re.findall(pattern, text)
            if matches:
                found[pii_type] = matches
        return found
    
    def _detect_injection(self, text: str) -> List[str]:
        """检测提示词注入"""
        detected = []
        for pattern in self.INJECTION_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                detected.append(pattern)
        return detected
    
    def sanitize_input(self, text: str) -> str:
        """清洗输入"""
        # 移除控制字符
        text = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', text)
        # 移除多余空白
        text = ' '.join(text.split())
        return text
    
    def mask_pii(self, text: str) -> str:
        """脱敏 PII"""
        masked = text
        for pii_type, pattern in self.PII_PATTERNS.items():
            masked = re.sub(pattern, f'[{pii_type.upper()}_MASKED]', masked)
        return masked


class AuditLogger:
    """审计日志"""
    
    def __init__(self, storage_backend=None):
        self.storage = storage_backend
    
    def log_request(
        self,
        request_id: str,
        user_id: str,
        endpoint: str,
        input_data: dict,
        metadata: dict = None
    ):
        """记录请求"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "request_id": request_id,
            "user_id": user_id,
            "endpoint": endpoint,
            "input_hash": self._hash_sensitive(input_data),
            "metadata": metadata
        }
        self._write_log(log_entry)
    
    def log_response(
        self,
        request_id: str,
        response_data: dict,
        latency_ms: float,
        tokens_used: int
    ):
        """记录响应"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "request_id": request_id,
            "response_hash": self._hash_sensitive(response_data),
            "latency_ms": latency_ms,
            "tokens_used": tokens_used
        }
        self._write_log(log_entry)
    
    def _hash_sensitive(self, data: dict) -> str:
        """哈希敏感数据"""
        return hashlib.sha256(str(data).encode()).hexdigest()[:16]
    
    def _write_log(self, entry: dict):
        """写入日志"""
        # 实现日志写入
        pass
```

## 数据备份与恢复方案

### 备份策略

```
┌─────────────────────────────────────────────────────────────────┐
│                    数据备份策略                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  备份层级：                                                     │
│  ├── L1: 实时备份 (Redis 主从复制)                              │
│  │   └── RPO: 0, RTO: 秒级                                     │
│  │                                                             │
│  ├── L2: 增量备份 (每 15 分钟)                                  │
│  │   └── PostgreSQL WAL 归档                                   │
│  │   └── 向量数据库增量同步                                     │
│  │                                                             │
│  ├── L3: 全量备份 (每日)                                        │
│  │   └── 数据库完整快照                                        │
│  │   └── 对象存储文件备份                                       │
│  │                                                             │
│  └── L4: 异地备份 (每周)                                        │
│      └── 跨区域复制                                            │
│      └── 冷存储归档                                            │
│                                                                 │
│  保留策略：                                                     │
│  ├── 日增量备份：保留 7 天                                      │
│  ├── 周全量备份：保留 4 周                                      │
│  └── 月归档备份：保留 12 个月                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 备份实现代码

```python
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
import boto3
from dataclasses import dataclass

@dataclass
class BackupConfig:
    """备份配置"""
    postgres_host: str
    postgres_port: int
    postgres_user: str
    postgres_password: str
    postgres_db: str
    redis_host: str
    redis_port: int
    s3_bucket: str
    s3_prefix: str
    retention_days: int = 30

class BackupManager:
    """备份管理器"""
    
    def __init__(self, config: BackupConfig):
        self.config = config
        self.s3_client = boto3.client('s3')
    
    def backup_postgresql(self) -> str:
        """备份 PostgreSQL"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = f"/tmp/postgres_backup_{timestamp}.sql"
        
        # 使用 pg_dump 备份
        cmd = [
            "pg_dump",
            "-h", self.config.postgres_host,
            "-p", str(self.config.postgres_port),
            "-U", self.config.postgres_user,
            "-d", self.config.postgres_db,
            "-F", "c",  # 自定义格式
            "-f", backup_file
        ]
        
        env = {"PGPASSWORD": self.config.postgres_password}
        subprocess.run(cmd, env=env, check=True)
        
        # 上传到 S3
        s3_key = f"{self.config.s3_prefix}/postgresql/{timestamp}.sql"
        self.s3_client.upload_file(backup_file, self.config.s3_bucket, s3_key)
        
        # 清理本地文件
        Path(backup_file).unlink()
        
        return s3_key
    
    def backup_redis(self) -> str:
        """备份 Redis"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = f"/tmp/redis_backup_{timestamp}.rdb"
        
        # 触发 Redis BGSAVE
        # 然后复制 RDB 文件
        # 实现略...
        
        s3_key = f"{self.config.s3_prefix}/redis/{timestamp}.rdb"
        self.s3_client.upload_file(backup_file, self.config.s3_bucket, s3_key)
        
        return s3_key
    
    def backup_vector_db(self) -> str:
        """备份向量数据库"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 导出向量数据
        # 实现取决于具体向量数据库
        
        s3_key = f"{self.config.s3_prefix}/vectordb/{timestamp}"
        return s3_key
    
    def restore_postgresql(self, backup_key: str):
        """恢复 PostgreSQL"""
        # 下载备份文件
        local_file = "/tmp/restore.sql"
        self.s3_client.download_file(
            self.config.s3_bucket, 
            backup_key, 
            local_file
        )
        
        # 恢复数据库
        cmd = [
            "pg_restore",
            "-h", self.config.postgres_host,
            "-p", str(self.config.postgres_port),
            "-U", self.config.postgres_user,
            "-d", self.config.postgres_db,
            "-c",  # 清理现有数据
            local_file
        ]
        
        env = {"PGPASSWORD": self.config.postgres_password}
        subprocess.run(cmd, env=env, check=True)
    
    def cleanup_old_backups(self):
        """清理过期备份"""
        cutoff_date = datetime.now() - timedelta(days=self.config.retention_days)
        
        # 列出所有备份
        response = self.s3_client.list_objects_v2(
            Bucket=self.config.s3_bucket,
            Prefix=self.config.s3_prefix
        )
        
        for obj in response.get('Contents', []):
            last_modified = obj['LastModified'].replace(tzinfo=None)
            if last_modified < cutoff_date:
                self.s3_client.delete_object(
                    Bucket=self.config.s3_bucket,
                    Key=obj['Key']
                )


# 定时备份任务
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

@scheduler.scheduled_job('cron', hour=2, minute=0)  # 每天凌晨 2 点
async def daily_backup():
    """每日备份任务"""
    backup_manager = BackupManager(config)
    
    # 执行备份
    pg_backup = backup_manager.backup_postgresql()
    redis_backup = backup_manager.backup_redis()
    vector_backup = backup_manager.backup_vector_db()
    
    # 发送通知
    await send_notification(f"备份完成:\n- PostgreSQL: {pg_backup}\n- Redis: {redis_backup}")

scheduler.start()
```

### 灾难恢复计划

```yaml
# disaster_recovery.yml
recovery_plan:
  name: "生产环境灾难恢复计划"
  
  scenarios:
    - name: "数据库故障"
      rto: 15m  # 恢复时间目标
      rpo: 5m   # 恢复点目标
      steps:
        - "检测故障并告警"
        - "切换到备用数据库"
        - "验证数据完整性"
        - "更新 DNS 指向新主库"
        - "通知相关团队"
    
    - name: "服务完全不可用"
      rto: 30m
      rpo: 15m
      steps:
        - "激活灾难恢复环境"
        - "从最新备份恢复数据"
        - "启动所有服务"
        - "验证系统功能"
        - "切换流量到恢复环境"
  
  contacts:
    - role: "On-call Engineer"
      primary: "+86-xxx-xxxx-xxxx"
      backup: "+86-xxx-xxxx-xxxx"
    - role: "DBA"
      primary: "+86-xxx-xxxx-xxxx"
  
  runbook_url: "https://wiki.company.com/dr-runbook"
```

## 小结

本章我们完成了一个完整的智能客服系统：

1. **需求分析**：明确功能需求和技术选型
2. **后端开发**：FastAPI + OpenAI 实现核心逻辑
3. **前端开发**：Next.js 构建用户界面
4. **部署上线**：Docker 容器化部署

## 下一章预告

在下一章《RAG 检索增强生成》中，我们将深入学习：

- 向量数据库原理与选型
- 文档切分与向量化
- 相似度检索与重排序
- RAG 架构最佳实践

---

**教程系列持续更新中，欢迎关注！**
