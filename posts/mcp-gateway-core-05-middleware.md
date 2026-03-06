---
title: "从零到一实现生产级 MCP Gateway（五）：中间件与插件机制"
date: "2025-03-20"
excerpt: "深入实现 Token Bucket 限流算法和请求日志中间件，构建高可用、可观测的 MCP Gateway。"
tags: ["AI", "MCP", "Rate Limiting", "Middleware", "Python", "FastAPI"]
series:
  slug: "mcp-gateway-core"
  title: "从零到一实现生产级 MCP Gateway"
  order: 5
---

# 从零到一实现生产级 MCP Gateway（五）：中间件层实现

## 前言

中间件层是 MCP Gateway 的关键基础设施，负责请求预处理和后处理。本章将深入实现 Token Bucket 限流算法和结构化请求日志，确保网关的稳定性和可观测性。

## 中间件架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Middleware Pipeline                              │
│                                                                      │
│  Request ─────────────────────────────────────────────────────────▶ │
│                                                                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐         │
│  │  CORS   │───▶│  Rate   │───▶│  Auth   │───▶│ Logging │───▶ ... │
│  │ Policy  │    │ Limiter │    │  Check  │    │   Pre   │         │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘         │
│                                                                      │
│  ◀─────────────────────────────────────────────────────────────────  │
│                         Response                                     │
│                                                                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                         │
│  │ Logging │◀───│  Error  │◀───│ Handler │                         │
│  │  Post   │    │ Handler │    │         │                         │
│  └─────────┘    └─────────┘    └─────────┘                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Token Bucket 限流算法

### 算法原理

```
Token Bucket 算法示意图：

                    ┌─────────────────────────────────────┐
                    │           Token Bucket              │
                    │                                     │
   refill_rate ───▶ │  ┌───┬───┬───┬───┬───┬───┬───┐     │
   (tokens/sec)     │  │ T │ T │ T │   │   │   │   │     │
                    │  └───┴───┴───┴───┴───┴───┴───┘     │
                    │                                     │
                    │  capacity = 7 (max tokens)          │
                    │  current = 3 (available tokens)     │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
                            ┌─────────────────┐
                            │  Consume Token  │
                            │  if available   │
                            └─────────────────┘

特点：
1. 允许突发流量（bucket 中有预存的 token）
2. 长期来看限制在 refill_rate
3. 适用于 API 限流场景
```

### Token Bucket 实现

```python
# middleware/rate_limit.py

from __future__ import annotations
import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


@dataclass
class TokenBucket:
    """Token Bucket 限流算法实现
    
    Token Bucket 算法允许突发流量，同时保持长期的速率限制。
    
    Attributes:
        capacity: 桶的最大容量（最大 token 数）
        tokens: 当前 token 数量
        refill_rate: token 补充速率（token/秒）
        last_refill: 上次补充时间戳
        
    Example:
        bucket = TokenBucket(capacity=100, refill_rate=10)
        if bucket.consume(1):
            # 请求允许
            pass
        else:
            # 触发限流
            pass
    """
    
    capacity: int
    refill_rate: float  # tokens per second
    tokens: float = field(init=False)
    last_refill: float = field(default_factory=time.time)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    
    def __post_init__(self):
        self.tokens = float(self.capacity)
    
    def _refill(self) -> None:
        """基于时间流逝补充 token"""
        now = time.time()
        elapsed = now - self.last_refill
        
        # 计算应补充的 token 数量
        tokens_to_add = elapsed * self.refill_rate
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.last_refill = now
    
    async def consume(self, tokens: int = 1) -> bool:
        """尝试消费 token
        
        Args:
            tokens: 要消费的 token 数量
            
        Returns:
            True 消费成功，False token 不足
        """
        async with self._lock:
            self._refill()
            
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            
            return False
    
    async def wait_for_token(
        self, 
        tokens: int = 1, 
        timeout: float = 30.0
    ) -> bool:
        """等待直到有足够的 token 或超时
        
        Args:
            tokens: 需要的 token 数量
            timeout: 最大等待时间（秒）
            
        Returns:
            True 成功获取 token，False 超时
        """
        start_time = time.time()
        
        while True:
            if await self.consume(tokens):
                return True
            
            # 检查超时
            if time.time() - start_time > timeout:
                return False
            
            # 计算等待时间
            tokens_needed = tokens - self.tokens
            wait_time = tokens_needed / self.refill_rate
            
            await asyncio.sleep(min(wait_time, 0.1))
    
    def available_tokens(self) -> float:
        """获取当前可用 token 数量"""
        self._refill()
        return self.tokens
```

### Rate Limiter 实现

```python
class RateLimiter:
    """多客户端限流器
    
    管理多个客户端的 Token Bucket，每个客户端由唯一的 key 标识
    （如 IP 地址、用户 ID）。
    
    Example:
        limiter = RateLimiter(
            requests_per_second=10,
            burst_size=50
        )
        
        if await limiter.is_allowed("192.168.1.1"):
            # 处理请求
            pass
        else:
            raise HTTPException(429, "Rate limit exceeded")
    """
    
    def __init__(
        self,
        requests_per_second: float = 100,
        burst_size: int | None = None,
        cleanup_interval: int = 60,
    ):
        self.requests_per_second = requests_per_second
        self.burst_size = burst_size or int(requests_per_second * 5)
        self.cleanup_interval = cleanup_interval
        
        self._buckets: dict[str, TokenBucket] = {}
        self._last_cleanup = time.time()
    
    def _cleanup(self) -> None:
        """清理过期的 bucket"""
        now = time.time()
        if now - self._last_cleanup < self.cleanup_interval:
            return
        
        # 移除长时间未使用的 bucket
        stale_threshold = now - self.cleanup_interval * 2
        stale_keys = [
            key for key, bucket in self._buckets.items()
            if bucket.last_refill < stale_threshold
        ]
        
        for key in stale_keys:
            del self._buckets[key]
        
        self._last_cleanup = now
        logger.debug(f"Cleaned up {len(stale_keys)} stale rate limit buckets")
    
    def get_bucket(self, key: str) -> TokenBucket:
        """获取或创建指定 key 的 bucket"""
        if key not in self._buckets:
            self._buckets[key] = TokenBucket(
                capacity=self.burst_size,
                refill_rate=self.requests_per_second,
            )
        return self._buckets[key]
    
    async def is_allowed(self, key: str, tokens: int = 1) -> bool:
        """检查请求是否被允许
        
        Args:
            key: 客户端标识
            tokens: 要消费的 token 数量
            
        Returns:
            True 允许，False 限流
        """
        self._cleanup()
        bucket = self.get_bucket(key)
        return await bucket.consume(tokens)
    
    async def get_wait_time(self, key: str, tokens: int = 1) -> float:
        """获取预计等待时间
        
        Args:
            key: 客户端标识
            tokens: 需要的 token 数量
            
        Returns:
            预计等待秒数
        """
        bucket = self.get_bucket(key)
        available = bucket.available_tokens()
        
        if available >= tokens:
            return 0.0
        
        tokens_needed = tokens - available
        return tokens_needed / self.requests_per_second
    
    def get_stats(self) -> dict[str, Any]:
        """获取限流器统计信息"""
        return {
            "active_clients": len(self._buckets),
            "requests_per_second": self.requests_per_second,
            "burst_size": self.burst_size,
        }
```

### FastAPI 中间件

```python
class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI 限流中间件
    
    基于 Token Bucket 算法对请求进行限流。
    
    Example:
        app = FastAPI()
        app.add_middleware(
            RateLimitMiddleware,
            requests_per_second=100,
            burst_size=50
        )
    """
    
    def __init__(
        self,
        app: FastAPI,
        requests_per_second: float = 100,
        burst_size: int | None = None,
        key_func: Callable[[Request], str] | None = None,
        exclude_paths: list[str] | None = None,
    ):
        super().__init__(app)
        self.limiter = RateLimiter(
            requests_per_second=requests_per_second,
            burst_size=burst_size,
        )
        self.key_func = key_func or self._default_key_func
        self.exclude_paths = set(exclude_paths or ["/health", "/metrics"])
    
    def _default_key_func(self, request: Request) -> str:
        """默认的 key 函数（使用客户端 IP）"""
        # 尝试从代理头获取真实 IP
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # 回退到直接客户端 IP
        return request.client.host if request.client else "unknown"
    
    async def dispatch(
        self, 
        request: Request, 
        call_next: Callable
    ) -> Response:
        """处理请求"""
        # 跳过排除路径
        if request.url.path in self.exclude_paths:
            return await call_next(request)
        
        # 获取限流 key
        key = self.key_func(request)
        
        # 检查限流
        if not await self.limiter.is_allowed(key):
            wait_time = await self.limiter.get_wait_time(key)
            
            logger.warning(f"Rate limit exceeded for {key}")
            
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "retry_after": wait_time,
                },
                headers={"Retry-After": str(int(wait_time) + 1)},
            )
        
        # 处理请求
        response = await call_next(request)
        
        # 添加限流响应头
        bucket = self.limiter.get_bucket(key)
        response.headers["X-RateLimit-Limit"] = str(self.limiter.burst_size)
        response.headers["X-RateLimit-Remaining"] = str(int(bucket.available_tokens()))
        
        return response
```

## 请求日志中间件

### 结构化日志实现

```python
# middleware/request_logger.py

from __future__ import annotations
import json
import logging
import time
import uuid
from typing import Any, Callable

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """请求日志中间件
    
    功能：
    - 生成唯一请求 ID
    - 记录请求/响应信息
    - 计算请求耗时
    - 结构化日志输出
    """
    
    def __init__(
        self,
        app: FastAPI,
        log_request_body: bool = False,
        log_response_body: bool = False,
        exclude_paths: list[str] | None = None,
    ):
        super().__init__(app)
        self.log_request_body = log_request_body
        self.log_response_body = log_response_body
        self.exclude_paths = set(exclude_paths or ["/health", "/metrics"])
    
    async def dispatch(
        self, 
        request: Request, 
        call_next: Callable
    ) -> Response:
        """处理请求并记录日志"""
        # 跳过排除路径
        if request.url.path in self.exclude_paths:
            return await call_next(request)
        
        # 生成请求 ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        
        # 记录开始时间
        start_time = time.perf_counter()
        
        # 构建请求日志
        request_log = {
            "event": "request_start",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "query": str(request.query_params),
            "client_ip": self._get_client_ip(request),
            "user_agent": request.headers.get("User-Agent", ""),
        }
        
        # 记录请求体（可选）
        if self.log_request_body and request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
                if body:
                    request_log["body_size"] = len(body)
                    if len(body) < 1024:  # 只记录小请求体
                        try:
                            request_log["body"] = json.loads(body)
                        except json.JSONDecodeError:
                            request_log["body"] = body.decode("utf-8", errors="replace")
            except Exception as e:
                request_log["body_error"] = str(e)
        
        logger.info(json.dumps(request_log))
        
        # 处理请求
        try:
            response = await call_next(request)
            
            # 计算耗时
            duration_ms = (time.perf_counter() - start_time) * 1000
            
            # 构建响应日志
            response_log = {
                "event": "request_end",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
            }
            
            # 添加响应头信息
            response_log["response_headers"] = dict(response.headers)
            
            # 记录响应体（可选）
            if self.log_response_body:
                # 注意：这会消耗响应体
                response_body = b""
                async for chunk in response.body_iterator:
                    response_body += chunk
                
                response_log["response_size"] = len(response_body)
                
                # 重新构建响应
                from fastapi.responses import Response as FastAPIResponse
                response = FastAPIResponse(
                    content=response_body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )
            
            # 根据状态码选择日志级别
            if response.status_code >= 500:
                logger.error(json.dumps(response_log))
            elif response.status_code >= 400:
                logger.warning(json.dumps(response_log))
            else:
                logger.info(json.dumps(response_log))
            
            # 添加请求 ID 到响应头
            response.headers["X-Request-ID"] = request_id
            
            return response
            
        except Exception as e:
            # 记录异常
            duration_ms = (time.perf_counter() - start_time) * 1000
            
            error_log = {
                "event": "request_error",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": round(duration_ms, 2),
                "error": str(e),
                "error_type": type(e).__name__,
            }
            
            logger.exception(json.dumps(error_log))
            raise
    
    def _get_client_ip(self, request: Request) -> str:
        """获取客户端 IP"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else "unknown"
```

## 中间件配置

```python
# main.py

from fastapi import FastAPI
from .middleware.rate_limit import RateLimitMiddleware
from .middleware.request_logger import RequestLoggerMiddleware
from .config import get_config

def create_app() -> FastAPI:
    """创建 FastAPI 应用"""
    config = get_config()
    
    app = FastAPI(
        title="MCP Gateway",
        version="1.0.0",
    )
    
    # 添加中间件（顺序重要：后添加的先执行）
    
    # 请求日志中间件
    app.add_middleware(
        RequestLoggerMiddleware,
        log_request_body=config.debug,
        log_response_body=config.debug,
        exclude_paths=["/health", "/metrics", "/ready", "/live"],
    )
    
    # 限流中间件
    if config.rate_limit.enabled:
        app.add_middleware(
            RateLimitMiddleware,
            requests_per_second=config.rate_limit.requests_per_second,
            burst_size=config.rate_limit.burst_size,
            exclude_paths=["/health", "/metrics", "/ready", "/live"],
        )
    
    return app
```

## 高级限流策略

### 分层限流

```python
class TieredRateLimiter:
    """分层限流器
    
    支持多级限流：
    1. 全局限流 - 保护整体系统
    2. 用户限流 - 防止单用户滥用
    3. 工具限流 - 保护敏感工具
    """
    
    def __init__(
        self,
        global_rate: float = 1000,
        user_rate: float = 100,
        tool_rates: dict[str, float] | None = None,
    ):
        self.global_limiter = RateLimiter(
            requests_per_second=global_rate,
            burst_size=int(global_rate * 2),
        )
        self.user_limiters: dict[str, RateLimiter] = {}
        self.user_rate = user_rate
        self.tool_rates = tool_rates or {}
    
    async def check(
        self,
        user_id: str,
        tool_name: str | None = None,
    ) -> tuple[bool, str | None]:
        """检查是否允许请求
        
        Returns:
            (是否允许, 限流原因)
        """
        # 1. 全局限流检查
        if not await self.global_limiter.is_allowed("global"):
            return False, "Global rate limit exceeded"
        
        # 2. 用户限流检查
        if user_id not in self.user_limiters:
            self.user_limiters[user_id] = RateLimiter(
                requests_per_second=self.user_rate,
                burst_size=int(self.user_rate * 2),
            )
        
        if not await self.user_limiters[user_id].is_allowed(user_id):
            return False, f"User rate limit exceeded for {user_id}"
        
        # 3. 工具限流检查
        if tool_name and tool_name in self.tool_rates:
            tool_rate = self.tool_rates[tool_name]
            # 创建或获取工具限流器
            tool_key = f"tool:{tool_name}"
            # 简化实现：使用全局工具限流器
            # 实际可按用户+工具组合限流
            pass
        
        return True, None
```

### 限流键策略

```python
def get_rate_limit_key(request: Request) -> str:
    """获取限流键（支持多种策略）"""
    config = get_config()
    
    # 策略 1: 按 IP 限流
    if config.rate_limit.key_strategy == "ip":
        return _get_client_ip(request)
    
    # 策略 2: 按用户 ID 限流
    if config.rate_limit.key_strategy == "user":
        user = getattr(request.state, "user", None)
        if user:
            return user.get("sub", _get_client_ip(request))
        return _get_client_ip(request)
    
    # 策略 3: 按 API Key 限流
    if config.rate_limit.key_strategy == "api_key":
        api_key = request.headers.get("X-API-Key")
        if api_key:
            return f"apikey:{api_key[:8]}"
        return _get_client_ip(request)
    
    # 默认: IP + User Agent 组合
    client_ip = _get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")[:32]
    return f"{client_ip}:{hash(user_agent) % 10000}"
```

## 实际应用示例

### 配置限流参数

```python
# .env
MCP_RATE_LIMIT_ENABLED=true
MCP_RATE_LIMIT_REQUESTS_PER_SECOND=100
MCP_RATE_LIMIT_BURST_SIZE=50
```

### 限流响应示例

```json
// HTTP 429 Response
{
  "error": "Rate limit exceeded",
  "retry_after": 0.5
}

// Response Headers
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 0
Retry-After: 1
```

### 日志输出示例

```json
{
  "event": "request_end",
  "request_id": "abc123-def456",
  "method": "POST",
  "path": "/mcp",
  "status_code": 200,
  "duration_ms": 45.23,
  "client_ip": "192.168.1.100",
  "user_agent": "claude-desktop/1.0.0"
}
```

## 设计亮点

| 特性 | 说明 | 面试价值 |
|------|------|----------|
| Token Bucket | 允许突发流量，长期限流 | 经典限流算法 |
| 多客户端管理 | 每个客户端独立 bucket | 分布式限流思维 |
| 自动清理 | 定期清理过期 bucket | 内存管理 |
| 结构化日志 | JSON 格式，便于分析 | 可观测性设计 |
| 请求 ID | 全链路追踪基础 | 分布式追踪 |

## 小结

本章实现了中间件层的核心组件：Token Bucket 限流器和结构化请求日志。这些中间件为 MCP Gateway 提供了基本的稳定性和可观测性保障。

**关键要点**：

1. Token Bucket 算法允许突发流量，适合 API 限流场景
2. 多客户端管理支持按 IP、用户等维度限流
3. 结构化日志提供完整的请求追踪能力
4. 中间件顺序影响执行效果

下一章我们将实现存储层，使用 SQLAlchemy 和仓储模式管理持久化数据。

## 参考资料

- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
- [Rate Limiting Patterns](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
- [Structured Logging Best Practices](https://www.honeycomb.io/blog/structured-logging-vs-unstructured-logging)
