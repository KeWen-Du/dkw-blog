---
title: "从零到一实现mini-mcp-gateway（九）：生产部署与最佳实践"
date: "2026-02-01"
excerpt: "介绍MCP Gateway的生产部署方案，包括限流中间件、Docker容器化、Kubernetes编排、测试策略和运维最佳实践。"
tags: ["AI", "MCP", "Docker", "Kubernetes", "Rate Limit", "Testing", "生产"]
series:
  slug: "mini-mcp-gateway"
  title: "从零到一实现 mini-mcp-gateway"
  order: 9
---

# 从零到一实现mini-mcp-gateway（九）：生产部署与最佳实践

## 前言

本章介绍mini-mcp-gateway的生产部署方案，包括限流中间件、容器化部署、测试策略和运维最佳实践，确保系统稳定、可靠、可扩展。

## 一、限流中间件

### 令牌桶算法

```python
# src/mini_mcp_gateway/middleware/rate_limit.py

@dataclass
class TokenBucket:
    """令牌桶算法实现。
    
    核心思想：
    1. 桶以固定速率填充令牌
    2. 每个请求消耗一个令牌
    3. 桶满时令牌溢出
    4. 无令牌时请求被拒绝
    """
    
    capacity: int              # 桶容量（最大令牌数）
    refill_rate: float         # 填充速率（令牌/秒）
    tokens: float = field(init=False)
    last_refill: float = field(default_factory=time.time)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    
    def __post_init__(self):
        self.tokens = float(self.capacity)
    
    def _refill(self):
        """填充令牌。"""
        now = time.time()
        elapsed = now - self.last_refill
        tokens_to_add = elapsed * self.refill_rate
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.last_refill = now
    
    async def consume(self, tokens: int = 1) -> bool:
        """消费令牌。"""
        async with self._lock:
            self._refill()
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            return False
```

### 多客户端限流器

```python
class RateLimiter:
    """多客户端限流管理器。
    
    每个客户端（IP/用户ID）独立限流，
    自动清理过期桶。
    """
    
    def __init__(
        self,
        requests_per_second: float = 100,
        burst_size: int | None = None,
        cleanup_interval: int = 60,
    ):
        self.requests_per_second = requests_per_second
        self.burst_size = burst_size or int(requests_per_second * 5)
        self._buckets: dict[str, TokenBucket] = {}
    
    async def is_allowed(self, key: str, tokens: int = 1) -> bool:
        """检查是否允许请求。"""
        self._cleanup()
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = TokenBucket(
                capacity=self.burst_size,
                refill_rate=self.requests_per_second,
            )
            self._buckets[key] = bucket
        return await bucket.consume(tokens)
```

### FastAPI中间件

```python
class RateLimitMiddleware(BaseHTTPMiddleware):
    """限流中间件。
    
    功能：
    - 基于IP/用户ID限流
    - 返回429状态码和Retry-After头
    - 排除健康检查等路径
    """
    
    def __init__(
        self,
        app: FastAPI,
        requests_per_second: float = 100,
        burst_size: int | None = None,
        exclude_paths: list[str] | None = None,
    ):
        super().__init__(app)
        self.limiter = RateLimiter(requests_per_second, burst_size)
        self.exclude_paths = set(exclude_paths or ["/health", "/metrics"])
    
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in self.exclude_paths:
            return await call_next(request)
        
        # 获取客户端标识
        key = self._get_client_key(request)
        
        if not await self.limiter.is_allowed(key):
            wait_time = await self.limiter.get_wait_time(key)
            return JSONResponse(
                status_code=429,
                content={"error": "Rate limit exceeded", "retry_after": wait_time},
                headers={"Retry-After": str(int(wait_time) + 1)},
            )
        
        response = await call_next(request)
        
        # 添加限流信息头
        bucket = self.limiter.get_bucket(key)
        response.headers["X-RateLimit-Limit"] = str(self.limiter.burst_size)
        response.headers["X-RateLimit-Remaining"] = str(int(bucket.tokens))
        
        return response
```

## 二、测试策略

### 测试配置

```python
# tests/conftest.py

import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def test_client():
    """创建测试客户端。"""
    from mini_mcp_gateway.main import create_app
    app = create_app()
    with TestClient(app) as client:
        yield client

@pytest.fixture
def test_jwt_token():
    """创建测试JWT令牌。"""
    from mini_mcp_gateway.auth.jwt import JWTManager
    manager = JWTManager(secret_key="test-secret")
    return manager.create_access_token(
        user_id="test-user",
        roles=["admin"]
    )
```

### 单元测试

```python
# tests/test_protocol.py

class TestJSONRPCRequest:
    def test_create_request(self):
        request = JSONRPCRequest(
            id=1,
            method="initialize",
            params={"protocolVersion": "2025-11-25"}
        )
        assert request.jsonrpc == "2.0"
        assert request.method == "initialize"


# tests/test_auth.py

class TestJWTManager:
    def test_create_and_verify_token(self):
        manager = JWTManager(secret_key="test-secret")
        token = manager.create_access_token(
            user_id="user123",
            roles=["admin"]
        )
        payload = manager.verify_token(token)
        assert payload["sub"] == "user123"


# tests/test_rate_limit.py

class TestTokenBucket:
    @pytest.mark.asyncio
    async def test_consume_tokens(self):
        bucket = TokenBucket(capacity=100, refill_rate=10)
        result = await bucket.consume(10)
        assert result is True
        assert bucket.tokens == 90.0
```

### 集成测试

```python
# tests/test_integration.py

class TestMCPEndpoint:
    def test_initialize(self, test_client: TestClient):
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1.0"}
            }
        }
        response = test_client.post("/mcp", json=request)
        assert response.status_code == 200
        data = response.json()
        assert "result" in data
        assert "capabilities" in data["result"]
    
    def test_tools_call_echo(self, test_client: TestClient):
        request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "echo",
                "arguments": {"message": "Hello!"}
            }
        }
        response = test_client.post("/mcp", json=request)
        assert response.status_code == 200
        assert response.json()["result"]["isError"] is False
```

## 三、Docker容器化

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# 复制代码
COPY src/ src/

# 创建非root用户
RUN useradd -m mcp && chown -R mcp:mcp /app
USER mcp

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "-m", "mini_mcp_gateway.main"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  mcp-gateway:
    build: .
    ports:
      - "8000:8000"
    environment:
      - MCP_GATEWAY_HOST=0.0.0.0
      - MCP_AUTH_SECRET_KEY=${SECRET_KEY}
      - MCP_REDIS_URL=redis://redis:6379/0
    depends_on:
      - redis
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

## 四、Kubernetes部署

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-gateway
  template:
    spec:
      containers:
      - name: gateway
        image: mcp-gateway:latest
        ports:
        - containerPort: 8000
        resources:
          requests:
            cpu: "100m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 10
        env:
        - name: MCP_AUTH_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: mcp-gateway-secrets
              key: secret-key
```

### Service & HPA

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mcp-gateway
spec:
  selector:
    app: mcp-gateway
  ports:
  - port: 80
    targetPort: 8000

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-gateway
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## 五、生产最佳实践

### 性能优化

| 优化项 | 配置 | 效果 |
|--------|------|------|
| uvloop | `uvloop.install()` | 2-3x吞吐量提升 |
| 连接池 | `pool_size=20` | 减少50%连接开销 |
| Redis缓存 | 工具Schema缓存 | 减少重复解析 |

### 安全配置

```bash
# 必须配置的环境变量
MCP_AUTH_SECRET_KEY=<strong-random-key>    # JWT密钥
MCP_AUTH_ENABLED=true                       # 启用认证
MCP_RATE_LIMIT_ENABLED=true                 # 启用限流
MCP_RATE_LIMIT_REQUESTS_PER_SECOND=1000    # 限流阈值
```

### 监控告警

- Prometheus告警规则
- Grafana仪表板
- 日志聚合（ELK/Loki）

## 系列总结

本系列从零到一实现了mini-mcp-gateway，涵盖：

| 章节 | 主题 | 核心内容 |
|------|------|----------|
| 1 | 项目概述 | MCP协议背景、应用场景、技术选型 |
| 2 | 协议解析 | JSON-RPC 2.0、MCP类型系统 |
| 3 | 架构设计 | 三层架构、模块划分、技术选型 |
| 4 | 核心服务器 | FastAPI实现、传输协议、内置工具 |
| 5 | 工具注册中心 | 注册、发现、执行、联邦支持 |
| 6 | REST适配器 | OpenAPI解析、动态Schema、多认证 |
| 7 | 认证授权 | JWT双令牌、RBAC、API Key |
| 8 | 可观测性 | 日志、指标、追踪三支柱 |
| 9 | 生产部署 | 限流、测试、容器化、K8s |

## 项目地址

完整代码已开源：`F:\dev-code\iflow-project\mini-mcp-gateway`

感谢阅读本系列文章！如有问题欢迎交流讨论。
