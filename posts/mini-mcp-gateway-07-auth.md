---
title: "从零到一实现mini-mcp-gateway（七）：认证授权机制"
date: "2026-02-29 15:00:00"
excerpt: "实现完整的认证授权体系，包括JWT双令牌机制、RBAC细粒度权限控制、API Key管理，确保MCP Gateway的生产级安全性。"
tags: ["AI", "MCP", "Auth", "JWT", "RBAC", "API Key", "安全"]
series:
  slug: "mini-mcp-gateway"
  title: "从零到一实现 mini-mcp-gateway"
  order: 7
---

# 从零到一实现mini-mcp-gateway（七）：认证授权机制

## 前言

生产环境的MCP Gateway必须具备完善的认证授权机制。本章实现三重认证体系：JWT双令牌机制、RBAC细粒度权限控制、API Key管理，确保网关安全性。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                   Authentication Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Request ──▶ Rate Limit ──▶ Auth Check ──▶ RBAC ──▶ Tool    │
│                │                │           │          │     │
│                ▼                ▼           ▼          ▼     │
│         ┌───────────┐   ┌───────────┐ ┌───────┐ ┌─────────┐ │
│         │ Token     │   │ JWT/API   │ │ Role  │ │ Execute │ │
│         │ Bucket    │   │ Key       │ │ Check │ │ Handler │ │
│         │ Algorithm │   │ Verify    │ │ RBAC  │ │         │ │
│         └───────────┘   └───────────┘ └───────┘ └─────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 一、JWT双令牌机制

### 核心设计

```python
# src/mini_mcp_gateway/auth/jwt.py

from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)


class JWTManager:
    """JWT令牌管理器。
    
    实现双令牌机制：
    - Access Token: 短期令牌，用于API访问
    - Refresh Token: 长期令牌，用于刷新Access Token
    """
    
    def __init__(
        self,
        secret_key: str,
        algorithm: str = "HS256",
        access_token_expire_minutes: int = 30,
        refresh_token_expire_days: int = 7,
    ):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.access_token_expire_minutes = access_token_expire_minutes
        self.refresh_token_expire_days = refresh_token_expire_days
    
    def create_access_token(
        self,
        user_id: str,
        roles: list[str],
        permissions: list[str] | None = None,
        additional_claims: dict[str, Any] | None = None,
    ) -> str:
        """创建Access Token。
        
        包含用户标识、角色、权限等声明。
        """
        now = datetime.now(timezone.utc)
        expire = now + timedelta(minutes=self.access_token_expire_minutes)
        
        payload = {
            "sub": user_id,
            "roles": roles,
            "type": "access",
            "exp": expire,
            "iat": now,
        }
        
        if permissions:
            payload["permissions"] = permissions
        
        if additional_claims:
            payload.update(additional_claims)
        
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def create_refresh_token(self, user_id: str) -> str:
        """创建Refresh Token。
        
        仅包含用户标识，有效期更长。
        """
        now = datetime.now(timezone.utc)
        expire = now + timedelta(days=self.refresh_token_expire_days)
        
        payload = {
            "sub": user_id,
            "type": "refresh",
            "exp": expire,
            "iat": now,
        }
        
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def verify_token(self, token: str, expected_type: str = "access") -> dict:
        """验证令牌。"""
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
            )
            
            if payload.get("type") != expected_type:
                raise HTTPException(401, f"Invalid token type")
            
            return payload
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(401, "Token has expired")
        except jwt.InvalidTokenError as e:
            raise HTTPException(401, f"Invalid token: {str(e)}")
    
    def refresh_access_token(
        self,
        refresh_token: str,
        roles: list[str],
        permissions: list[str] | None = None,
    ) -> str:
        """使用Refresh Token刷新Access Token。"""
        payload = self.verify_token(refresh_token, expected_type="refresh")
        user_id = payload.get("sub")
        
        return self.create_access_token(
            user_id=user_id,
            roles=roles,
            permissions=permissions,
        )
```

### FastAPI依赖注入

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any]:
    """FastAPI依赖：获取当前认证用户。"""
    if credentials is None:
        raise HTTPException(401, "Not authenticated")
    
    config = get_config()
    manager = JWTManager(secret_key=config.auth.secret_key)
    return manager.verify_token(credentials.credentials)
```

## 二、RBAC权限控制

### 权限模型

```python
# src/mini_mcp_gateway/auth/rbac.py

class ResourceType(str, Enum):
    """资源类型。"""
    TOOL = "tool"
    RESOURCE = "resource"
    PROMPT = "prompt"
    SERVER = "server"


class Action(str, Enum):
    """操作类型。"""
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    DELETE = "delete"
    ADMIN = "admin"


@dataclass
class Permission:
    """权限定义。"""
    resource: str  # 资源类型或"*"
    action: str    # 操作类型或"*"
    condition: dict[str, Any] | None = None
    
    def matches(self, resource: str, action: str) -> bool:
        """检查是否匹配。"""
        resource_match = self.resource == "*" or self.resource == resource
        action_match = self.action == "*" or self.action == action
        return resource_match and action_match
```

### 角色管理

```python
class Role:
    """角色定义。"""
    
    def __init__(self, name: str, permissions: list[Permission]):
        self.name = name
        self.permissions = permissions
    
    def has_permission(self, resource: str, action: str) -> bool:
        return any(p.matches(resource, action) for p in self.permissions)


# 预定义角色
DEFAULT_ROLES: dict[str, Role] = {
    "admin": Role(
        name="admin",
        permissions=[Permission(resource="*", action="*")],
    ),
    "developer": Role(
        name="developer",
        permissions=[
            Permission(resource="tool", action="read"),
            Permission(resource="tool", action="execute"),
            Permission(resource="resource", action="read"),
        ],
    ),
    "viewer": Role(
        name="viewer",
        permissions=[
            Permission(resource="tool", action="read"),
        ],
    ),
    "agent": Role(
        name="agent",
        permissions=[
            Permission(resource="tool", action="execute"),
            Permission(resource="tool", action="read"),
        ],
    ),
}


class RBACManager:
    """RBAC管理器。"""
    
    def __init__(self, roles: dict[str, Role] | None = None):
        self.roles = roles or DEFAULT_ROLES
    
    def check_permission(
        self,
        user_roles: list[str],
        resource: str,
        action: str,
    ) -> bool:
        """检查用户是否有指定权限。"""
        for role_name in user_roles:
            role = self.roles.get(role_name)
            if role and role.has_permission(resource, action):
                return True
        return False
```

### FastAPI权限装饰器

```python
def require_permission(resource: str, action: str):
    """FastAPI依赖工厂：权限检查。"""
    
    async def permission_checker(
        user: dict[str, Any] = Depends(get_current_user)
    ) -> dict[str, Any]:
        rbac = RBACManager()
        user_roles = user.get("roles", [])
        
        # 检查令牌中的直接权限
        user_permissions = user.get("permissions", [])
        for perm_str in user_permissions:
            parts = perm_str.split(":")
            if len(parts) == 2:
                if parts[0] in ("*", resource) and parts[1] in ("*", action):
                    return user
        
        # 检查角色权限
        if rbac.check_permission(user_roles, resource, action):
            return user
        
        raise HTTPException(403, f"Permission denied: {resource}.{action}")
    
    return permission_checker


# 使用示例
@app.post("/mcp")
async def mcp_endpoint(
    request: Request,
    user: dict = Depends(require_permission("tool", "execute"))
):
    return await handle_mcp_request(request)
```

## 三、API Key管理

```python
# src/mini_mcp_gateway/auth/api_key.py

@dataclass
class APIKey:
    """API Key定义。"""
    key: str
    name: str
    roles: list[str] = field(default_factory=list)
    permissions: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: datetime | None = None
    is_active: bool = True


class APIKeyManager:
    """API Key管理器。
    
    适用于服务间调用或简单集成场景。
    """
    
    def generate_key(
        self,
        name: str,
        roles: list[str] | None = None,
        permissions: list[str] | None = None,
        expires_days: int | None = None,
    ) -> tuple[str, APIKey]:
        """生成API Key。
        
        格式: mcp_<32位随机字符串>
        """
        import secrets
        raw_key = f"mcp_{secrets.token_urlsafe(32)}"
        
        expires_at = None
        if expires_days:
            from datetime import timedelta
            expires_at = datetime.utcnow() + timedelta(days=expires_days)
        
        api_key = APIKey(
            key=raw_key,
            name=name,
            roles=roles or [],
            permissions=permissions or [],
            expires_at=expires_at,
        )
        
        self._keys[raw_key] = api_key
        return raw_key, api_key
    
    def validate_key(self, key: str) -> APIKey:
        """验证API Key。"""
        api_key = self._keys.get(key)
        
        if api_key is None:
            raise HTTPException(401, "Invalid API key")
        
        if not api_key.is_active:
            raise HTTPException(401, "API key is disabled")
        
        if api_key.is_expired():
            raise HTTPException(401, "API key has expired")
        
        return api_key
```

## 认证流程图

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│  Auth    │────▶│  RBAC    │────▶│   Tool   │
│          │     │  Check   │     │  Check   │     │ Handler  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
      │               │                │                │
      │ JWT/API Key   │                │                │
      │               ▼                ▼                │
      │         ┌──────────┐     ┌──────────┐          │
      │         │  Verify  │     │  Check   │          │
      │         │  Token   │     │  Roles   │          │
      │         └──────────┘     └──────────┘          │
      │                                                   │
      └───────────────────────────────────────────────────┘
                         Access Token / API Key
```

## 技术亮点

| 特性 | 实现方式 | 面试价值 |
|------|----------|----------|
| 双令牌机制 | Access+Refresh Token分离 | 安全架构能力 |
| RBAC模型 | 资源×操作×条件三维权限 | 权限设计能力 |
| API Key | 安全随机生成+过期机制 | 服务集成能力 |
| 依赖注入 | FastAPI Depends模式 | 框架理解能力 |

## 小结

本章实现了生产级的认证授权体系，支持JWT双令牌、RBAC权限控制、API Key三种认证方式。下一章我们将实现可观测性系统。
