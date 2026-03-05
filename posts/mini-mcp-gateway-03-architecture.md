---
title: "从零到一实现mini-mcp-gateway（三）：架构设计与技术选型"
date: "2026-01-26"
excerpt: "深入分析MCP Gateway的架构设计，结合企业级生产场景进行技术选型决策，设计完整的代码框架和模块划分。"
tags: ["AI", "MCP", "Architecture", "Python", "FastAPI"]
series:
  slug: "mini-mcp-gateway"
  title: "从零到一实现 mini-mcp-gateway"
  order: 3
---

# 从零到一实现mini-mcp-gateway（三）：架构设计与技术选型

## 前言

前两章我们了解了MCP Gateway的应用场景和协议规范。本章将从生产实践角度出发，深入分析架构设计和技术选型，为后续的完整代码实现奠定基础。

## 生产场景分析

在设计架构之前，我们需要明确mini-mcp-gateway需要支撑的生产场景：

### 场景一：企业AI助手（中等规模）

```
┌─────────────────────────────────────────────────────────────┐
│                    场景特征分析                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户规模：500-2000人                                        │
│  日均调用量：10万-50万次                                     │
│  并发峰值：100-500 QPS                                       │
│                                                             │
│  MCP Server数量：10-30个                                     │
│  工具总数：100-500个                                         │
│                                                             │
│  核心需求：                                                  │
│  ✅ 统一认证（SSO集成）                                      │
│  ✅ 权限控制（部门/角色级别）                                │
│  ✅ 审计日志（合规要求）                                     │
│  ✅ 高可用（99.9% SLA）                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 场景二：智能客服平台（高并发）

```
┌─────────────────────────────────────────────────────────────┐
│                    场景特征分析                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户规模：日均10万+会话                                     │
│  日均调用量：100万-500万次                                   │
│  并发峰值：1000-5000 QPS                                     │
│                                                             │
│  MCP Server数量：5-15个（核心工具为主）                      │
│  工具总数：50-100个                                          │
│                                                             │
│  核心需求：                                                  │
│  ✅ 高并发处理                                               │
│  ✅ 低延迟（P99 < 200ms）                                    │
│  ✅ 熔断降级                                                 │
│  ✅ 限流保护                                                 │
│  ✅ 数据脱敏                                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 场景三：DevOps自动化（可靠优先）

```
┌─────────────────────────────────────────────────────────────┐
│                    场景特征分析                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户规模：50-200人（开发团队）                              │
│  日均调用量：1万-5万次                                       │
│  并发峰值：50-100 QPS                                        │
│                                                             │
│  MCP Server数量：20-50个（各类工具）                         │
│  工具总数：200-1000个                                        │
│                                                             │
│  核心需求：                                                  │
│  ✅ 操作审计（完整追溯）                                     │
│  ✅ 审批流程                                                 │
│  ✅ 工具隔离                                                 │
│  ✅ 灰度发布                                                 │
│  ✅ 回滚机制                                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 技术需求矩阵

| 需求维度 | 企业AI助手 | 智能客服 | DevOps自动化 | 优先级 |
|----------|------------|----------|--------------|--------|
| 高并发处理 | 中 | 高 | 低 | P0 |
| 高可用性 | 高 | 高 | 高 | P0 |
| 认证授权 | 高 | 中 | 高 | P0 |
| 审计日志 | 高 | 中 | 高 | P1 |
| 限流熔断 | 中 | 高 | 中 | P1 |
| 可观测性 | 中 | 高 | 高 | P1 |
| 工具联邦 | 高 | 低 | 高 | P1 |
| 协议适配 | 中 | 高 | 中 | P1 |

## 技术选型深度分析

### 1. 编程语言选择

**候选方案**：Python、Go、TypeScript/Node.js

| 维度 | Python | Go | TypeScript |
|------|--------|-----|------------|
| 开发效率 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 性能 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| AI生态 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| 异步支持 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 类型安全 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 部署便利 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 学习曲线 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

**决策：Python 3.11+**

**决策理由**：

1. **AI生态优势**：MCP生态中Python SDK最成熟，官方示例多使用Python
2. **开发效率**：快速迭代，适合教学项目
3. **异步支持**：asyncio + FastAPI已足够应对中等并发场景
4. **类型安全**：Pydantic V2提供强大的运行时类型验证

**性能优化策略**（应对高并发场景）：

```python
# 1. 使用uvicorn + uvloop提升异步性能
# uvloop性能接近Go，比默认asyncio快2-4倍
import uvloop
uvloop.install()

# 2. 使用连接池
from databases import Database

database = Database(
    "postgresql://user:pass@localhost/db",
    min_size=5,
    max_size=20
)

# 3. 使用缓存
from functools import lru_cache
import aiofiles

@lru_cache(maxsize=1000)
def parse_tool_schema(schema_json: str) -> dict:
    """缓存Schema解析结果"""
    return json.loads(schema_json)
```

### 2. Web框架选择

**候选方案**：FastAPI、Flask、Django、Starlette

| 维度 | FastAPI | Flask | Django | Starlette |
|------|---------|-------|--------|-----------|
| 异步支持 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 性能 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 类型集成 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 文档自动生成 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 中间件生态 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 学习曲线 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

**决策：FastAPI**

**决策理由**：

1. **原生异步**：完美契合MCP的异步通信模型
2. **自动文档**：OpenAPI文档自动生成，降低前端对接成本
3. **Pydantic集成**：请求/响应自动验证，类型安全
4. **性能优异**：基于Starlette，性能接近Go/Node.js

**SSE支持实现**：

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
import asyncio
import json

app = FastAPI()

@app.post("/mcp")
async def mcp_sse_endpoint(request: Request):
    """
    SSE传输的MCP端点
    支持：
    1. 单次请求-响应
    2. 流式响应（工具执行进度）
    3. 服务器推送（资源更新通知）
    """
    message = await request.json()
    
    async def event_generator():
        # 处理主请求
        result = await handle_mcp_message(message)
        yield {
            "event": "message",
            "data": json.dumps(result)
        }
        
        # 如果是长时间操作，推送进度
        if message.get("method") == "tools/call":
            tool_name = message.get("params", {}).get("name")
            async for progress in track_tool_progress(tool_name):
                yield {
                    "event": "progress",
                    "data": json.dumps(progress)
                }
    
    return EventSourceResponse(event_generator())
```

### 3. 数据存储选择

**候选方案**：SQLite、PostgreSQL、MongoDB、Redis

| 维度 | SQLite | PostgreSQL | MongoDB | Redis |
|------|--------|------------|---------|-------|
| 部署复杂度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 查询能力 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| 事务支持 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 扩展性 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 写入性能 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**决策：SQLite（开发/小规模）+ PostgreSQL（生产环境）**

**架构设计**：

```python
# 使用SQLAlchemy实现存储层抽象，支持多数据库后端
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager

class DatabaseConfig:
    """数据库配置"""
    
    @staticmethod
    def get_engine(database_url: str, async_mode: bool = True):
        """获取数据库引擎"""
        if async_mode:
            return create_async_engine(
                database_url,
                echo=False,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True  # 连接健康检查
            )
        return create_engine(database_url, echo=False)

# 存储层抽象接口
class ToolRegistryStore(ABC):
    """工具注册存储接口"""
    
    @abstractmethod
    async def save_tool(self, tool: Tool) -> str:
        """保存工具定义"""
        pass
    
    @abstractmethod
    async def get_tool(self, name: str) -> Tool | None:
        """获取工具定义"""
        pass
    
    @abstractmethod
    async def list_tools(self, filter: dict | None = None) -> list[Tool]:
        """列出工具"""
        pass

# SQLite实现
class SQLiteToolStore(ToolRegistryStore):
    """SQLite存储实现"""
    
    def __init__(self, db_path: str = "mcp_gateway.db"):
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
    
    async def save_tool(self, tool: Tool) -> str:
        async with self.async_session() as session:
            # 实现保存逻辑
            pass

# PostgreSQL实现
class PostgreSQLToolStore(ToolRegistryStore):
    """PostgreSQL存储实现"""
    
    def __init__(self, database_url: str):
        self.engine = create_async_engine(
            database_url,
            pool_size=10,
            max_overflow=20
        )
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
```

### 4. 认证授权方案

**候选方案**：JWT、OAuth2、API Key、Session

| 维度 | JWT | OAuth2 | API Key | Session |
|------|-----|--------|---------|---------|
| 无状态 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 安全性 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| SSO集成 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| 实现复杂度 | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 细粒度控制 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

**决策：JWT + OAuth2（可选）+ RBAC**

**架构设计**：

```python
from datetime import datetime, timedelta
from typing import Any
import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# 密码加密
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 认证配置
class AuthConfig:
    SECRET_KEY: str = "your-secret-key"  # 生产环境从环境变量读取
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

# JWT令牌生成
def create_access_token(
    subject: str,
    scopes: list[str],
    expires_delta: timedelta | None = None
) -> str:
    """创建访问令牌"""
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=AuthConfig.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    to_encode = {
        "sub": subject,
        "scopes": scopes,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    }
    
    return jwt.encode(to_encode, AuthConfig.SECRET_KEY, algorithm=AuthConfig.ALGORITHM)

# 权限模型
class Permission(BaseModel):
    """权限定义"""
    resource: str      # 资源：tool, resource, prompt
    action: str        # 动作：read, write, execute
    scope: str = "*"   # 范围：* 表示所有，或具体名称

class Role(BaseModel):
    """角色定义"""
    name: str
    permissions: list[Permission]
    description: str | None = None

# RBAC实现
class RBACManager:
    """基于角色的访问控制"""
    
    def __init__(self):
        self.roles: dict[str, Role] = {}
        self._init_default_roles()
    
    def _init_default_roles(self):
        """初始化默认角色"""
        # 管理员 - 完全权限
        self.roles["admin"] = Role(
            name="admin",
            permissions=[
                Permission(resource="*", action="*"),
            ],
            description="系统管理员，拥有所有权限"
        )
        
        # 开发者 - 工具执行权限
        self.roles["developer"] = Role(
            name="developer",
            permissions=[
                Permission(resource="tool", action="execute"),
                Permission(resource="tool", action="read"),
                Permission(resource="resource", action="read"),
                Permission(resource="prompt", action="read"),
            ],
            description="开发者，可以执行工具和读取资源"
        )
        
        # 只读用户
        self.roles["viewer"] = Role(
            name="viewer",
            permissions=[
                Permission(resource="tool", action="read"),
                Permission(resource="resource", action="read"),
            ],
            description="只读用户，只能查看"
        )
    
    def check_permission(
        self,
        role: str,
        resource: str,
        action: str,
        scope: str = "*"
    ) -> bool:
        """检查权限"""
        if role not in self.roles:
            return False
        
        for perm in self.roles[role].permissions:
            if self._match_permission(perm, resource, action, scope):
                return True
        
        return False
    
    def _match_permission(
        self,
        perm: Permission,
        resource: str,
        action: str,
        scope: str
    ) -> bool:
        """匹配权限"""
        return (
            (perm.resource == "*" or perm.resource == resource) and
            (perm.action == "*" or perm.action == action) and
            (perm.scope == "*" or perm.scope == scope)
        )

# 认证中间件
security = HTTPBearer()
rbac = RBACManager()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict[str, Any]:
    """获取当前用户"""
    token = credentials.credentials
    
    try:
        payload = jwt.decode(
            token,
            AuthConfig.SECRET_KEY,
            algorithms=[AuthConfig.ALGORITHM]
        )
        
        user_id: str = payload.get("sub")
        scopes: list[str] = payload.get("scopes", [])
        
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的认证凭据"
            )
        
        return {
            "user_id": user_id,
            "scopes": scopes,
            "role": payload.get("role", "viewer")
        }
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌已过期"
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的令牌"
        )

def require_permission(resource: str, action: str):
    """权限装饰器"""
    async def permission_checker(
        current_user: dict = Depends(get_current_user)
    ) -> dict:
        role = current_user.get("role", "viewer")
        
        if not rbac.check_permission(role, resource, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"权限不足：需要 {resource}.{action} 权限"
            )
        
        return current_user
    
    return permission_checker
```

### 5. 限流熔断方案

**候选方案**：令牌桶、漏桶、滑动窗口

**决策：令牌桶 + 滑动窗口组合**

```python
import time
from collections import defaultdict
from dataclasses import dataclass
from asyncio import Lock

@dataclass
class RateLimitConfig:
    """限流配置"""
    requests_per_second: int = 100      # 每秒请求数
    requests_per_minute: int = 1000     # 每分钟请求数
    requests_per_hour: int = 10000      # 每小时请求数
    burst_size: int = 50                # 突发容量

class TokenBucket:
    """令牌桶算法实现"""
    
    def __init__(self, rate: float, capacity: int):
        self.rate = rate           # 令牌生成速率（个/秒）
        self.capacity = capacity   # 桶容量
        self.tokens = capacity     # 当前令牌数
        self.last_update = time.time()
        self._lock = Lock()
    
    async def consume(self, tokens: int = 1) -> bool:
        """消费令牌"""
        async with self._lock:
            now = time.time()
            # 计算新产生的令牌
            elapsed = now - self.last_update
            new_tokens = elapsed * self.rate
            
            # 更新令牌数
            self.tokens = min(self.capacity, self.tokens + new_tokens)
            self.last_update = now
            
            # 尝试消费
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            
            return False
    
    async def wait_for_token(self, tokens: int = 1) -> float:
        """等待直到有足够令牌，返回等待时间"""
        async with self._lock:
            now = time.time()
            elapsed = now - self.last_update
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            self.last_update = now
            
            if self.tokens >= tokens:
                self.tokens -= tokens
                return 0.0
            
            # 计算需要等待的时间
            needed = tokens - self.tokens
            wait_time = needed / self.rate
            return wait_time

class SlidingWindowCounter:
    """滑动窗口计数器"""
    
    def __init__(self, window_size: int, max_requests: int):
        self.window_size = window_size      # 窗口大小（秒）
        self.max_requests = max_requests    # 窗口内最大请求数
        self.requests: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()
    
    async def is_allowed(self, key: str) -> tuple[bool, int]:
        """
        检查是否允许请求
        返回：(是否允许, 剩余配额)
        """
        async with self._lock:
            now = time.time()
            window_start = now - self.window_size
            
            # 清理过期记录
            self.requests[key] = [
                t for t in self.requests[key] if t > window_start
            ]
            
            current_count = len(self.requests[key])
            
            if current_count < self.max_requests:
                self.requests[key].append(now)
                return True, self.max_requests - current_count - 1
            
            return False, 0

class RateLimiter:
    """综合限流器"""
    
    def __init__(self, config: RateLimitConfig):
        self.config = config
        
        # 令牌桶 - 处理突发流量
        self.token_buckets: dict[str, TokenBucket] = {}
        
        # 滑动窗口 - 长期限流
        self.minute_limiter = SlidingWindowCounter(60, config.requests_per_minute)
        self.hour_limiter = SlidingWindowCounter(3600, config.requests_per_hour)
        
        self._lock = Lock()
    
    async def check_rate_limit(
        self,
        client_id: str,
        tool_name: str | None = None
    ) -> tuple[bool, dict[str, Any]]:
        """
        检查限流
        返回：(是否允许, 限流信息)
        """
        # 构建限流键
        key = f"{client_id}:{tool_name}" if tool_name else client_id
        
        # 获取或创建令牌桶
        async with self._lock:
            if key not in self.token_buckets:
                self.token_buckets[key] = TokenBucket(
                    rate=self.config.requests_per_second,
                    capacity=self.config.burst_size
                )
            bucket = self.token_buckets[key]
        
        # 检查令牌桶（突发限流）
        if not await bucket.consume():
            return False, {
                "reason": "rate_limit_exceeded",
                "detail": "请求过于频繁，请稍后重试",
                "retry_after": await bucket.wait_for_token()
            }
        
        # 检查分钟限流
        allowed, remaining = await self.minute_limiter.is_allowed(key)
        if not allowed:
            return False, {
                "reason": "minute_limit_exceeded",
                "detail": f"每分钟最多{self.config.requests_per_minute}次请求",
                "retry_after": 60
            }
        
        # 检查小时限流
        allowed, remaining = await self.hour_limiter.is_allowed(key)
        if not allowed:
            return False, {
                "reason": "hourly_limit_exceeded",
                "detail": f"每小时最多{self.config.requests_per_hour}次请求",
                "retry_after": 3600
            }
        
        return True, {
            "remaining": {
                "minute": remaining,
                "hour": remaining
            }
        }

# 熔断器实现
from enum import Enum
from dataclasses import dataclass, field

class CircuitState(Enum):
    CLOSED = "closed"       # 正常状态
    OPEN = "open"           # 熔断状态
    HALF_OPEN = "half_open" # 半开状态

@dataclass
class CircuitBreakerConfig:
    """熔断器配置"""
    failure_threshold: int = 5          # 失败阈值
    success_threshold: int = 3          # 恢复阈值
    timeout: float = 30.0               # 熔断超时（秒）
    
class CircuitBreaker:
    """熔断器"""
    
    def __init__(self, name: str, config: CircuitBreakerConfig):
        self.name = name
        self.config = config
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = 0.0
        self._lock = Lock()
    
    async def can_execute(self) -> bool:
        """检查是否可以执行"""
        async with self._lock:
            if self.state == CircuitState.CLOSED:
                return True
            
            if self.state == CircuitState.OPEN:
                # 检查是否可以进入半开状态
                if time.time() - self.last_failure_time >= self.config.timeout:
                    self.state = CircuitState.HALF_OPEN
                    self.success_count = 0
                    return True
                return False
            
            # HALF_OPEN 状态
            return True
    
    async def record_success(self):
        """记录成功"""
        async with self._lock:
            if self.state == CircuitState.HALF_OPEN:
                self.success_count += 1
                if self.success_count >= self.config.success_threshold:
                    self.state = CircuitState.CLOSED
                    self.failure_count = 0
            elif self.state == CircuitState.CLOSED:
                self.failure_count = max(0, self.failure_count - 1)
    
    async def record_failure(self):
        """记录失败"""
        async with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.OPEN
            elif self.failure_count >= self.config.failure_threshold:
                self.state = CircuitState.OPEN

# 使用装饰器包装工具调用
def with_circuit_breaker(circuit_breaker: CircuitBreaker):
    """熔断器装饰器"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            if not await circuit_breaker.can_execute():
                raise Exception(
                    f"服务 {circuit_breaker.name} 已熔断，请稍后重试"
                )
            
            try:
                result = await func(*args, **kwargs)
                await circuit_breaker.record_success()
                return result
            except Exception as e:
                await circuit_breaker.record_failure()
                raise
        
        return wrapper
    return decorator
```

## 整体架构设计

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    mini-mcp-gateway                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   API Gateway Layer                  │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ HTTP    │ │ SSE     │ │ WebSocket│ │ stdio   │   │   │
│  │  │ Handler │ │ Handler │ │ Handler  │ │ Handler │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Protocol Layer                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │ JSON-RPC    │ │ Message     │ │ Capability  │   │   │
│  │  │ Handler     │ │ Router      │ │ Negotiator  │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Service Layer                       │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │   │
│  │  │ Tool      │ │ Resource  │ │ Prompt    │         │   │
│  │  │ Service   │ │ Service   │ │ Service   │         │   │
│  │  └───────────┘ └───────────┘ └───────────┘         │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │   │
│  │  │ Adapter   │ │ Federator │ │ Evaluator │         │   │
│  │  │ Service   │ │ Service   │ │ Service   │         │   │
│  │  └───────────┘ └───────────┘ └───────────┘         │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Infrastructure Layer                   │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ Auth    │ │ Rate    │ │ Circuit │ │ Audit   │   │   │
│  │  │ Manager │ │ Limiter │ │ Breaker │ │ Logger  │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ Cache   │ │ Storage │ │ Metrics │ │ Tracer  │   │   │
│  │  │ Manager │ │ Manager │ │ Exporter│ │ Exporter│   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 核心模块职责

| 模块 | 职责 | 关键类/函数 |
|------|------|-------------|
| **API Gateway** | 接收和处理HTTP/SSE/WS请求 | `HTTPHandler`, `SSEHandler`, `WebSocketHandler` |
| **Protocol** | MCP协议解析和路由 | `JSONRPCHandler`, `MessageRouter` |
| **Tool Service** | 工具注册、发现、执行 | `ToolRegistry`, `ToolExecutor` |
| **Resource Service** | 资源管理、订阅、推送 | `ResourceManager`, `ResourceSubscription` |
| **Adapter Service** | REST/gRPC协议适配 | `RESTAdapter`, `GRPCAdapter` |
| **Federator** | 多MCP Server联邦 | `ServerFederator`, `ServiceDiscovery` |
| **Auth Manager** | 认证授权管理 | `JWTManager`, `RBACManager` |
| **Rate Limiter** | 限流控制 | `TokenBucket`, `SlidingWindowCounter` |
| **Circuit Breaker** | 熔断保护 | `CircuitBreaker` |
| **Audit Logger** | 审计日志 | `AuditLogger`, `LogStore` |

## 完整项目结构

```
mini-mcp-gateway/
├── pyproject.toml              # 项目配置
├── README.md                   # 项目说明
├── Dockerfile                  # Docker构建
├── docker-compose.yml          # 本地开发环境
├── .env.example                # 环境变量示例
│
├── src/
│   ├── __init__.py
│   ├── main.py                 # 应用入口
│   ├── config.py               # 配置管理
│   │
│   ├── api/                    # API层
│   │   ├── __init__.py
│   │   ├── http.py            # HTTP端点
│   │   ├── sse.py             # SSE端点
│   │   ├── websocket.py       # WebSocket端点
│   │   ├── admin.py           # 管理API
│   │   └── dependencies.py    # 依赖注入
│   │
│   ├── protocol/               # 协议层
│   │   ├── __init__.py
│   │   ├── types.py           # 类型定义
│   │   ├── jsonrpc.py         # JSON-RPC处理
│   │   ├── router.py          # 消息路由
│   │   └── handlers.py        # 请求处理器
│   │
│   ├── services/               # 服务层
│   │   ├── __init__.py
│   │   ├── tool_service.py    # 工具服务
│   │   ├── resource_service.py # 资源服务
│   │   ├── prompt_service.py  # 提示词服务
│   │   ├── adapter_service.py # 适配器服务
│   │   └── federator.py       # 联邦服务
│   │
│   ├── registry/               # 注册中心
│   │   ├── __init__.py
│   │   ├── tool_registry.py   # 工具注册
│   │   ├── resource_registry.py # 资源注册
│   │   ├── server_registry.py # MCP服务器注册
│   │   └── store.py           # 存储实现
│   │
│   ├── adapters/               # 协议适配器
│   │   ├── __init__.py
│   │   ├── base.py            # 适配器基类
│   │   ├── rest.py            # REST适配器
│   │   └── schema_generator.py # Schema生成器
│   │
│   ├── auth/                   # 认证授权
│   │   ├── __init__.py
│   │   ├── jwt.py             # JWT处理
│   │   ├── rbac.py            # RBAC实现
│   │   ├── middleware.py      # 认证中间件
│   │   └── oauth.py           # OAuth集成（可选）
│   │
│   ├── middleware/             # 中间件
│   │   ├── __init__.py
│   │   ├── rate_limiter.py    # 限流
│   │   ├── circuit_breaker.py # 熔断
│   │   ├── audit.py           # 审计
│   │   └── error_handler.py   # 错误处理
│   │
│   ├── observability/          # 可观测性
│   │   ├── __init__.py
│   │   ├── logging.py         # 日志
│   │   ├── metrics.py         # 指标
│   │   └── tracing.py         # 链路追踪
│   │
│   ├── storage/                # 存储层
│   │   ├── __init__.py
│   │   ├── database.py        # 数据库连接
│   │   ├── models.py          # 数据模型
│   │   └── repositories.py    # 数据仓库
│   │
│   └── utils/                  # 工具函数
│       ├── __init__.py
│       ├── cache.py           # 缓存
│       └── helpers.py         # 辅助函数
│
├── tests/                      # 测试
│   ├── __init__.py
│   ├── conftest.py            # 测试配置
│   ├── test_protocol.py       # 协议测试
│   ├── test_services.py       # 服务测试
│   ├── test_adapters.py       # 适配器测试
│   └── test_api.py            # API测试
│
├── examples/                   # 示例
│   ├── basic_usage.py         # 基础用法
│   ├── custom_tool.py         # 自定义工具
│   ├── rest_adapter.py        # REST适配示例
│   └── federated_servers.py   # 联邦示例
│
└── docs/                       # 文档
    ├── getting-started.md
    ├── api-reference.md
    └── deployment.md
```

## 小结

本章从生产场景出发，深入分析了mini-mcp-gateway的架构设计和技术选型：

**技术选型决策**：

| 组件 | 选择 | 核心理由 |
|------|------|----------|
| 语言 | Python 3.11+ | AI生态优势、开发效率、asyncio性能提升 |
| Web框架 | FastAPI | 原生异步、自动文档、Pydantic集成 |
| 存储 | SQLite/PostgreSQL | 开发便利性与生产可靠性的平衡 |
| 认证 | JWT + RBAC | 无状态、细粒度权限控制 |
| 限流 | 令牌桶 + 滑动窗口 | 应对突发流量、长期限流保护 |

**架构特点**：

1. 分层架构：API Gateway → Protocol → Service → Infrastructure
2. 模块化设计：每个模块职责清晰，易于测试和维护
3. 可扩展性：支持水平扩展、插件式适配器

下一章我们将开始核心服务器的代码实现，从MCP协议处理和消息路由开始。

## 参考资料

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/)
- [Pydantic V2 Documentation](https://docs.pydantic.dev/latest/)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Rate Limiting Patterns](https://blog.bytebytego.com/p/rate-limiting-fundamentals)
