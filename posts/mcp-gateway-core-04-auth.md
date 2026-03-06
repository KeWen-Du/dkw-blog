---
title: "从零到一实现生产级 MCP Gateway（四）：认证与授权"
date: "2025-03-07"
excerpt: "深入实现 JWT Token、API Key 双认证机制和 RBAC 权限模型，构建企业级安全治理体系。"
tags: ["AI", "MCP", "JWT", "API Key", "RBAC", "安全", "Python"]
series:
  slug: "mcp-gateway-core"
  title: "从零到一实现生产级 MCP Gateway"
  order: 4
---

# 从零到一实现生产级 MCP Gateway（四）：认证授权实现

## 前言

在企业环境中，MCP Gateway 需要严格的认证授权机制来保护敏感工具和资源。本章将深入实现 JWT Token、API Key 双认证机制，以及基于角色的访问控制（RBAC）权限模型。

## 认证架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Authentication Architecture                      │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      Request                                  │  │
│  │  Authorization: Bearer <JWT>  或  X-API-Key: <API Key>       │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   Auth Middleware                             │  │
│  │  ┌─────────────┐     ┌─────────────┐                         │  │
│  │  │ JWT验证     │ 或  │ API Key验证 │                         │  │
│  │  │ • 解析Token │     │ • 查询DB    │                         │  │
│  │  │ • 验证签名  │     │ • 验证状态  │                         │  │
│  │  │ • 提取Claims│     │ • 提取角色  │                         │  │
│  │  └──────┬──────┘     └──────┬──────┘                         │  │
│  │         │                   │                                 │  │
│  │         └─────────┬─────────┘                                │  │
│  │                   ▼                                          │  │
│  │  ┌─────────────────────────────────────┐                    │  │
│  │  │          构建用户上下文              │                    │  │
│  │  │  {user_id, roles, permissions, ...} │                    │  │
│  │  └─────────────────┬───────────────────┘                    │  │
│  └────────────────────┼────────────────────────────────────────┘  │
│                       ▼                                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    RBAC 检查                                  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │ 资源权限    │  │ 操作权限    │  │ 条件权限    │          │  │
│  │  │ tool:xxx    │  │ tool:execute│  │ owner=user  │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## JWT Token 管理

### JWT Manager 实现

```python
# auth/jwt.py

from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from ..config import get_config

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


class JWTManager:
    """JWT Token 管理器
    
    功能：
    - Access Token 生成
    - Refresh Token 生成
    - Token 验证
    - Token 刷新
    
    Example:
        manager = JWTManager(secret_key="my-secret")
        token = manager.create_token(user_id="user123", roles=["admin"])
        payload = manager.verify_token(token)
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
        """创建 Access Token
        
        Args:
            user_id: 用户标识
            roles: 用户角色列表
            permissions: 特定权限列表
            additional_claims: 额外 JWT Claims
            
        Returns:
            编码后的 JWT Access Token
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
        
        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        logger.debug(f"Created access token for user: {user_id}")
        return token
    
    def create_refresh_token(self, user_id: str) -> str:
        """创建 Refresh Token
        
        Args:
            user_id: 用户标识
            
        Returns:
            编码后的 JWT Refresh Token
        """
        now = datetime.now(timezone.utc)
        expire = now + timedelta(days=self.refresh_token_expire_days)
        
        payload = {
            "sub": user_id,
            "type": "refresh",
            "exp": expire,
            "iat": now,
        }
        
        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        logger.debug(f"Created refresh token for user: {user_id}")
        return token
    
    def verify_token(
        self, 
        token: str, 
        expected_type: str = "access"
    ) -> dict[str, Any]:
        """验证并解码 JWT Token
        
        Args:
            token: JWT Token 字符串
            expected_type: 期望的 Token 类型
            
        Returns:
            解码后的 Token Payload
            
        Raises:
            HTTPException: Token 无效或已过期
        """
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
            )
            
            if payload.get("type") != expected_type:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid token type. Expected {expected_type}",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            return payload
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidTokenError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    def refresh_access_token(
        self,
        refresh_token: str,
        roles: list[str],
        permissions: list[str] | None = None,
    ) -> str:
        """使用 Refresh Token 刷新 Access Token
        
        Args:
            refresh_token: 有效的 Refresh Token
            roles: 用户角色（应从 DB 获取）
            permissions: 用户权限
            
        Returns:
            新的 Access Token
        """
        payload = self.verify_token(refresh_token, expected_type="refresh")
        user_id = payload.get("sub")
        
        return self.create_access_token(
            user_id=user_id,
            roles=roles,
            permissions=permissions,
        )
```

### FastAPI 依赖注入

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any]:
    """FastAPI 依赖：获取当前认证用户
    
    使用方式：
        @app.get("/protected")
        async def protected_route(user: dict = Depends(get_current_user)):
            return {"user_id": user["sub"]}
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    config = get_config()
    manager = JWTManager(secret_key=config.auth.secret_key)
    return manager.verify_token(credentials.credentials)
```

## API Key 管理

### API Key Manager 实现

```python
# auth/api_key.py

from __future__ import annotations
import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from ..config import get_config
from ..storage import APIKeyRepository

logger = logging.getLogger(__name__)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


@dataclass
class APIKeyInfo:
    """API Key 信息"""
    id: str
    name: str
    prefix: str                    # Key 前缀（用于识别）
    key_hash: str                  # Key 哈希（存储）
    roles: list[str]
    permissions: list[str]
    is_active: bool = True
    expires_at: datetime | None = None
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    metadata: dict[str, Any] | None = None


class APIKeyManager:
    """API Key 管理器
    
    功能：
    - API Key 生成
    - API Key 验证
    - API Key 撤销
    
    安全设计：
    - 使用前缀识别 Key
    - 只存储 Key 哈希
    - 原始 Key 只在生成时显示一次
    """
    
    KEY_PREFIX = "mcp_"           # Key 前缀
    KEY_LENGTH = 32               # Key 随机部分长度
    
    def __init__(self, repository: APIKeyRepository | None = None):
        self.repository = repository
    
    def generate_key(
        self,
        name: str,
        roles: list[str],
        permissions: list[str] | None = None,
        expires_days: int | None = None,
    ) -> tuple[str, APIKeyInfo]:
        """生成新的 API Key
        
        Args:
            name: Key 名称
            roles: 角色
            permissions: 权限
            expires_days: 过期天数
            
        Returns:
            (原始 Key, API Key 信息)
        """
        # 生成随机 Key
        raw_key = secrets.token_urlsafe(self.KEY_LENGTH)
        full_key = f"{self.KEY_PREFIX}{raw_key}"
        
        # 计算哈希
        key_hash = self._hash_key(full_key)
        
        # 提取前缀（前 8 个字符用于识别）
        prefix = full_key[:8]
        
        # 构建 Key 信息
        now = datetime.now()
        expires_at = None
        if expires_days:
            expires_at = now + timedelta(days=expires_days)
        
        api_key_info = APIKeyInfo(
            id=secrets.token_urlsafe(8),
            name=name,
            prefix=prefix,
            key_hash=key_hash,
            roles=roles,
            permissions=permissions or [],
            is_active=True,
            expires_at=expires_at,
            created_at=now,
        )
        
        logger.info(f"Generated API Key: {name} (prefix: {prefix})")
        
        return full_key, api_key_info
    
    def _hash_key(self, key: str) -> str:
        """计算 Key 哈希"""
        return hashlib.sha256(key.encode()).hexdigest()
    
    async def verify_key(
        self, 
        raw_key: str
    ) -> APIKeyInfo | None:
        """验证 API Key
        
        Args:
            raw_key: 原始 API Key
            
        Returns:
            验证成功返回 API Key 信息，失败返回 None
        """
        if not raw_key or not raw_key.startswith(self.KEY_PREFIX):
            return None
        
        # 计算哈希
        key_hash = self._hash_key(raw_key)
        
        # 从存储查询
        if self.repository:
            api_key = await self.repository.find_by_hash(key_hash)
            
            if api_key and api_key.is_active:
                # 检查过期
                if api_key.expires_at and api_key.expires_at < datetime.now():
                    return None
                
                # 更新最后使用时间
                await self.repository.update_last_used(api_key.id)
                
                return api_key
        
        return None
    
    async def revoke_key(self, key_id: str) -> bool:
        """撤销 API Key"""
        if self.repository:
            return await self.repository.deactivate(key_id)
        return False
```

### FastAPI 依赖注入

```python
async def get_current_user_from_api_key(
    api_key: str | None = Depends(api_key_header),
) -> dict[str, Any] | None:
    """FastAPI 依赖：从 API Key 获取用户信息"""
    if not api_key:
        return None
    
    manager = APIKeyManager()
    key_info = await manager.verify_key(api_key)
    
    if not key_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )
    
    return {
        "sub": key_info.id,
        "name": key_info.name,
        "roles": key_info.roles,
        "permissions": key_info.permissions,
    }
```

## RBAC 权限模型

### 权限模型设计

```python
# auth/rbac.py

from __future__ import annotations
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable

logger = logging.getLogger(__name__)


class ActionType(str, Enum):
    """操作类型"""
    EXECUTE = "execute"      # 执行工具
    READ = "read"            # 读取资源
    WRITE = "write"          # 写入资源
    ADMIN = "admin"          # 管理操作


@dataclass
class Permission:
    """权限定义"""
    resource: str              # 资源标识，如 "tool:*" 或 "tool:echo"
    action: ActionType         # 操作类型
    conditions: dict[str, Any] = field(default_factory=dict)  # 条件


@dataclass
class Role:
    """角色定义"""
    name: str
    description: str = ""
    permissions: list[Permission] = field(default_factory=list)
    inherits: list[str] = field(default_factory=list)  # 继承的角色


# 内置角色定义
BUILTIN_ROLES: dict[str, Role] = {
    "admin": Role(
        name="admin",
        description="Full access to all resources",
        permissions=[
            Permission(resource="*", action=ActionType.ADMIN),
        ],
    ),
    "developer": Role(
        name="developer",
        description="Execute and read tools/resources",
        permissions=[
            Permission(resource="tool:*", action=ActionType.EXECUTE),
            Permission(resource="resource:*", action=ActionType.READ),
            Permission(resource="prompt:*", action=ActionType.READ),
        ],
    ),
    "viewer": Role(
        name="viewer",
        description="Read-only access",
        permissions=[
            Permission(resource="tool:*", action=ActionType.READ),
            Permission(resource="resource:*", action=ActionType.READ),
        ],
    ),
    "agent": Role(
        name="agent",
        description="Execute tools only",
        permissions=[
            Permission(resource="tool:*", action=ActionType.EXECUTE),
        ],
    ),
}
```

### RBAC 检查器实现

```python
class RBACChecker:
    """RBAC 权限检查器
    
    功能：
    - 权限检查
    - 角色继承
    - 条件权限
    
    检查流程：
    1. 检查 Token 中的直接权限
    2. 检查用户角色的权限
    3. 检查条件权限
    4. 返回结果
    """
    
    def __init__(self, roles: dict[str, Role] | None = None):
        self.roles = roles or BUILTIN_ROLES
    
    def check_permission(
        self,
        user_context: dict[str, Any],
        resource: str,
        action: ActionType,
        resource_context: dict[str, Any] | None = None,
    ) -> bool:
        """检查权限
        
        Args:
            user_context: 用户上下文（包含 roles 和 permissions）
            resource: 资源标识
            action: 操作类型
            resource_context: 资源上下文（用于条件检查）
            
        Returns:
            是否有权限
        """
        # 1. 检查直接权限
        direct_permissions = user_context.get("permissions", [])
        for perm in direct_permissions:
            if self._match_permission(perm, resource, action):
                return True
        
        # 2. 检查角色权限
        user_roles = user_context.get("roles", [])
        for role_name in user_roles:
            if self._check_role_permission(role_name, resource, action, resource_context):
                return True
        
        logger.warning(
            f"Permission denied: user={user_context.get('sub')}, "
            f"resource={resource}, action={action}"
        )
        return False
    
    def _check_role_permission(
        self,
        role_name: str,
        resource: str,
        action: ActionType,
        resource_context: dict[str, Any] | None = None,
    ) -> bool:
        """检查角色权限"""
        role = self.roles.get(role_name)
        if not role:
            return False
        
        # 检查直接权限
        for perm in role.permissions:
            if self._match_permission(perm, resource, action):
                # 检查条件
                if perm.conditions:
                    if self._check_conditions(perm.conditions, resource_context):
                        return True
                else:
                    return True
        
        # 检查继承的角色
        for inherited_role in role.inherits:
            if self._check_role_permission(inherited_role, resource, action, resource_context):
                return True
        
        return False
    
    def _match_permission(
        self,
        permission: Permission | str,
        resource: str,
        action: ActionType,
    ) -> bool:
        """匹配权限"""
        if isinstance(permission, str):
            # 简单字符串权限格式：resource:action
            parts = permission.split(":")
            if len(parts) == 2:
                perm_resource, perm_action = parts
                return self._match_resource(perm_resource, resource) and perm_action == action.value
            return False
        
        return (
            self._match_resource(permission.resource, resource) and
            permission.action == action
        )
    
    def _match_resource(self, pattern: str, resource: str) -> bool:
        """匹配资源模式
        
        支持通配符：
        - * 匹配所有
        - tool:* 匹配所有工具
        - tool:echo 匹配特定工具
        """
        if pattern == "*":
            return True
        
        if "*" in pattern:
            # 前缀匹配
            prefix = pattern.rstrip("*")
            return resource.startswith(prefix.rstrip(":"))
        
        return pattern == resource
    
    def _check_conditions(
        self,
        conditions: dict[str, Any],
        resource_context: dict[str, Any] | None,
    ) -> bool:
        """检查条件权限"""
        if not resource_context:
            return False
        
        for key, value in conditions.items():
            if resource_context.get(key) != value:
                return False
        
        return True
```

### 权限检查装饰器

```python
def require_permission(
    resource: str,
    action: ActionType,
):
    """权限检查装饰器
    
    使用方式：
        @require_permission("tool:admin", ActionType.ADMIN)
        async def admin_endpoint():
            ...
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, _context: dict[str, Any] | None = None, **kwargs):
            if not _context:
                raise PermissionError("No user context provided")
            
            checker = RBACChecker()
            if not checker.check_permission(_context, resource, action):
                raise PermissionError(
                    f"Permission denied: {resource}:{action.value}"
                )
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator
```

## 认证组合器

```python
# auth/__init__.py

from __future__ import annotations
import logging
from typing import Any

from fastapi import Depends, HTTPException, status

from .jwt import JWTManager, get_current_user
from .api_key import APIKeyManager, get_current_user_from_api_key
from .rbac import RBACChecker, ActionType
from ..config import get_config

logger = logging.getLogger(__name__)


async def get_authenticated_user(
    jwt_user: dict[str, Any] | None = Depends(get_current_user),
    api_key_user: dict[str, Any] | None = Depends(get_current_user_from_api_key),
) -> dict[str, Any]:
    """获取已认证用户（支持 JWT 和 API Key 双认证）
    
    优先级：JWT > API Key
    """
    config = get_config()
    
    if not config.auth.enabled:
        # 认证禁用，返回默认用户
        return {
            "sub": "anonymous",
            "roles": ["agent"],
            "permissions": [],
        }
    
    # 优先使用 JWT
    if jwt_user:
        return jwt_user
    
    # 其次使用 API Key
    if api_key_user:
        return api_key_user
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


class AuthComposer:
    """认证组合器
    
    整合 JWT、API Key 和 RBAC 的统一接口
    """
    
    def __init__(self):
        config = get_config()
        self.jwt_manager = JWTManager(
            secret_key=config.auth.secret_key,
            algorithm=config.auth.algorithm,
            access_token_expire_minutes=config.auth.access_token_expire_minutes,
        )
        self.api_key_manager = APIKeyManager()
        self.rbac_checker = RBACChecker()
    
    def create_token(
        self,
        user_id: str,
        roles: list[str],
        permissions: list[str] | None = None,
    ) -> str:
        """创建 Access Token"""
        return self.jwt_manager.create_access_token(
            user_id=user_id,
            roles=roles,
            permissions=permissions,
        )
    
    def verify_token(self, token: str) -> dict[str, Any]:
        """验证 Token"""
        return self.jwt_manager.verify_token(token)
    
    def generate_api_key(
        self,
        name: str,
        roles: list[str],
        permissions: list[str] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """生成 API Key"""
        raw_key, key_info = self.api_key_manager.generate_key(
            name=name,
            roles=roles,
            permissions=permissions,
        )
        return raw_key, {
            "id": key_info.id,
            "name": key_info.name,
            "prefix": key_info.prefix,
            "roles": key_info.roles,
        }
    
    def check_permission(
        self,
        user_context: dict[str, Any],
        resource: str,
        action: ActionType,
    ) -> bool:
        """检查权限"""
        return self.rbac_checker.check_permission(
            user_context=user_context,
            resource=resource,
            action=action,
        )
    
    def require_permission(
        self,
        user_context: dict[str, Any],
        resource: str,
        action: ActionType,
    ) -> None:
        """要求权限（无权限抛出异常）"""
        if not self.check_permission(user_context, resource, action):
            raise PermissionError(
                f"Permission denied: {resource}:{action.value}"
            )
```

## 使用示例

### 生成 Token

```python
from mcp_gateway_core.auth import AuthComposer

auth = AuthComposer()

# 为用户创建 Token
token = auth.create_token(
    user_id="user123",
    roles=["developer"],
    permissions=["tool:custom_tool"],
)

# 为 Agent 生成 API Key
raw_key, key_info = auth.generate_api_key(
    name="my-agent",
    roles=["agent"],
)

print(f"API Key: {raw_key}")  # 只显示一次
print(f"Key Info: {key_info}")
```

### 在请求中使用

```bash
# 使用 JWT Token
curl -H "Authorization: Bearer eyJ..." http://localhost:8000/mcp

# 使用 API Key
curl -H "X-API-Key: mcp_xxx..." http://localhost:8000/mcp
```

### 权限检查

```python
from mcp_gateway_core.auth import RBACChecker, ActionType

checker = RBACChecker()

user = {
    "sub": "user123",
    "roles": ["developer"],
    "permissions": ["tool:admin_tool"],
}

# 检查权限
if checker.check_permission(user, "tool:echo", ActionType.EXECUTE):
    print("允许执行 echo 工具")

if checker.check_permission(user, "tool:admin_tool", ActionType.EXECUTE):
    print("允许执行 admin_tool 工具")
```

## 角色权限矩阵

| 角色 | tool:execute | tool:read | resource:read | resource:write | admin |
|------|--------------|-----------|---------------|----------------|-------|
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| developer | ✅ | ✅ | ✅ | ❌ | ❌ |
| viewer | ❌ | ✅ | ✅ | ❌ | ❌ |
| agent | ✅ | ❌ | ❌ | ❌ | ❌ |

## 设计亮点

| 特性 | 说明 | 面试价值 |
|------|------|----------|
| 双认证支持 | 同时支持 JWT 和 API Key | 灵活的认证设计 |
| API Key 安全 | 只存哈希，前缀识别 | 安全最佳实践 |
| RBAC 模型 | 角色-权限-条件三维模型 | 权限系统设计 |
| 条件权限 | 支持资源级别条件判断 | 细粒度权限控制 |

## 小结

本章实现了完整的认证授权体系，包括 JWT Token、API Key 双认证机制和 RBAC 权限模型。

**关键要点**：

1. JWT Manager 提供 Token 的生成、验证和刷新功能
2. API Key Manager 使用安全的哈希存储机制
3. RBAC 支持角色继承和条件权限
4. AuthComposer 提供统一的认证接口

下一章我们将实现中间件层，包括限流和请求日志。

## 参考资料

- [JWT.io](https://jwt.io/)
- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [NIST API Security Guidelines](https://csrc.nist.gov/publications/detail/sp/800-204/final)
