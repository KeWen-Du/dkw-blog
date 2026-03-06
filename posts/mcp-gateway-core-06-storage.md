---
title: "从零到一实现生产级 MCP Gateway（六）：存储层设计"
date: "2025-03-27"
excerpt: "深入实现基于 SQLAlchemy 的异步存储层和仓储模式，构建可扩展的持久化数据访问架构。"
tags: ["AI", "MCP", "SQLAlchemy", "Repository Pattern", "Python", "Async"]
series:
  slug: "mcp-gateway-core"
  title: "从零到一实现生产级 MCP Gateway"
  order: 6
---

# 从零到一实现生产级 MCP Gateway（六）：存储层实现

## 前言

存储层是 MCP Gateway 的数据持久化基础设施，负责管理 API Key、工具注册、审计日志等数据的存取。本章将深入实现基于 SQLAlchemy 的异步存储层和仓储模式，确保数据访问的可扩展性和可维护性。

## 存储层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Storage Architecture                            │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Application Layer                          │  │
│  │  Auth Composer │ Tool Registry │ Audit Service                │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Repository Layer                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │
│  │  │ API Key     │  │ Tool Reg    │  │ Audit Log   │           │  │
│  │  │ Repository  │  │ Repository  │  │ Repository  │           │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     ORM Layer (SQLAlchemy)                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │
│  │  │ APIKey      │  │ ToolReg     │  │ AuditLog    │           │  │
│  │  │ Model       │  │ Model       │  │ Model       │           │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Database Layer                             │  │
│  │         SQLite (dev)  │  PostgreSQL (prod)                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 数据库连接管理

### 异步引擎配置

```python
# storage/database.py

from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from ..config import get_config

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """SQLAlchemy 声明式基类"""
    pass


class DatabaseManager:
    """数据库连接管理器
    
    功能：
    - 异步引擎管理
    - 会话工厂
    - 连接池配置
    - 生命周期管理
    
    Example:
        db = DatabaseManager("sqlite+aiosqlite:///./app.db")
        async with db.session() as session:
            # 使用 session
            pass
    """
    
    def __init__(
        self,
        database_url: str,
        echo: bool = False,
        pool_size: int = 5,
        max_overflow: int = 10,
    ):
        # 判断数据库类型
        self.is_sqlite = database_url.startswith("sqlite")
        
        # 创建异步引擎
        engine_kwargs = {
            "echo": echo,
            "future": True,
        }
        
        # PostgreSQL 连接池配置
        if not self.is_sqlite:
            engine_kwargs.update({
                "pool_size": pool_size,
                "max_overflow": max_overflow,
                "pool_pre_ping": True,
            })
        
        self.engine = create_async_engine(database_url, **engine_kwargs)
        
        # 创建会话工厂
        self.session_factory = async_sessionmaker(
            bind=self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    
    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """获取数据库会话"""
        session = self.session_factory()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
    
    async def create_tables(self) -> None:
        """创建所有表"""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created")
    
    async def drop_tables(self) -> None:
        """删除所有表（仅用于测试）"""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        logger.info("Database tables dropped")
    
    async def close(self) -> None:
        """关闭连接池"""
        await self.engine.dispose()
        logger.info("Database connection closed")


# 全局数据库管理器
_db_manager: DatabaseManager | None = None


async def init_db() -> DatabaseManager:
    """初始化数据库"""
    global _db_manager
    
    config = get_config()
    _db_manager = DatabaseManager(
        database_url=config.db.url,
        echo=config.db.echo,
    )
    
    await _db_manager.create_tables()
    return _db_manager


async def close_db() -> None:
    """关闭数据库连接"""
    global _db_manager
    if _db_manager:
        await _db_manager.close()
        _db_manager = None


def get_db() -> DatabaseManager:
    """获取数据库管理器"""
    if _db_manager is None:
        raise RuntimeError("Database not initialized")
    return _db_manager
```

## 数据模型定义

### API Key 模型

```python
# storage/models.py

from __future__ import annotations
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class APIKey(Base):
    """API Key 模型
    
    存储已生成的 API Key 信息（不存储原始 Key）
    """
    __tablename__ = "api_keys"
    
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    
    # 权限信息
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)
    
    # 状态
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # 扩展元数据
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSON, nullable=True
    )
    
    # 索引
    __table_args__ = (
        Index("ix_api_keys_prefix_hash", "prefix", "key_hash"),
    )
    
    def __repr__(self) -> str:
        return f"<APIKey(id={self.id}, name={self.name})>"
```

### 工具注册模型

```python
class ToolRegistration(Base):
    """工具注册模型
    
    持久化存储工具注册信息
    """
    __tablename__ = "tool_registrations"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    
    # JSON Schema
    input_schema: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    
    # 注解
    annotations: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    
    # 来源
    server_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    
    # 状态
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # 扩展元数据
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSON, nullable=True
    )
    
    def __repr__(self) -> str:
        return f"<ToolRegistration(name={self.name})>"
```

### 审计日志模型

```python
class AuditLog(Base):
    """审计日志模型
    
    记录所有工具调用和敏感操作
    """
    __tablename__ = "audit_logs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 请求信息
    request_id: Mapped[str] = mapped_column(String(36), index=True)
    trace_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    
    # 用户信息
    user_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    api_key_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("api_keys.id"), nullable=True
    )
    client_ip: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # 操作信息
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # 请求/响应详情
    request_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    response_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    
    # 结果
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # 性能指标
    duration_ms: Mapped[float | None] = mapped_column(nullable=True)
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )
    
    # 索引
    __table_args__ = (
        Index("ix_audit_logs_user_action", "user_id", "action"),
        Index("ix_audit_logs_created_action", "created_at", "action"),
    )
    
    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action})>"
```

## 仓储模式实现

### 基础仓储

```python
# storage/repositories.py

from __future__ import annotations
import logging
from abc import ABC, abstractmethod
from typing import Any, Generic, TypeVar

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from .database import Base
from .models import APIKey, ToolRegistration, AuditLog

logger = logging.getLogger(__name__)

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(ABC, Generic[ModelType]):
    """仓储基类
    
    提供通用的 CRUD 操作
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    @abstractmethod
    def get_model_class(self) -> type[ModelType]:
        """获取模型类"""
        pass
    
    async def create(self, model: ModelType) -> ModelType:
        """创建记录"""
        self.session.add(model)
        await self.session.flush()
        return model
    
    async def get_by_id(self, id: Any) -> ModelType | None:
        """按 ID 获取"""
        model_class = self.get_model_class()
        result = await self.session.execute(
            select(model_class).where(model_class.id == id)
        )
        return result.scalar_one_or_none()
    
    async def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> list[ModelType]:
        """获取所有记录"""
        model_class = self.get_model_class()
        result = await self.session.execute(
            select(model_class).offset(skip).limit(limit)
        )
        return list(result.scalars().all())
    
    async def update(
        self,
        id: Any,
        **kwargs: Any,
    ) -> ModelType | None:
        """更新记录"""
        model_class = self.get_model_class()
        await self.session.execute(
            update(model_class).where(model_class.id == id).values(**kwargs)
        )
        return await self.get_by_id(id)
    
    async def delete(self, id: Any) -> bool:
        """删除记录"""
        model_class = self.get_model_class()
        result = await self.session.execute(
            delete(model_class).where(model_class.id == id)
        )
        return result.rowcount > 0
```

### API Key 仓储

```python
class APIKeyRepository(BaseRepository[APIKey]):
    """API Key 仓储"""
    
    def get_model_class(self) -> type[APIKey]:
        return APIKey
    
    async def find_by_hash(self, key_hash: str) -> APIKey | None:
        """按哈希查找"""
        result = await self.session.execute(
            select(APIKey).where(APIKey.key_hash == key_hash)
        )
        return result.scalar_one_or_none()
    
    async def find_by_prefix(self, prefix: str) -> list[APIKey]:
        """按前缀查找"""
        result = await self.session.execute(
            select(APIKey).where(APIKey.prefix == prefix)
        )
        return list(result.scalars().all())
    
    async def find_active(self) -> list[APIKey]:
        """查找所有活跃的 Key"""
        result = await self.session.execute(
            select(APIKey).where(APIKey.is_active == True)
        )
        return list(result.scalars().all())
    
    async def deactivate(self, id: str) -> bool:
        """停用 Key"""
        result = await self.session.execute(
            update(APIKey)
            .where(APIKey.id == id)
            .values(is_active=False)
        )
        return result.rowcount > 0
    
    async def update_last_used(self, id: str) -> None:
        """更新最后使用时间"""
        from datetime import datetime
        await self.session.execute(
            update(APIKey)
            .where(APIKey.id == id)
            .values(last_used_at=datetime.utcnow())
        )
    
    async def find_by_user(
        self,
        user_id: str,
        active_only: bool = True,
    ) -> list[APIKey]:
        """查找用户的 Key"""
        query = select(APIKey)
        
        # 这里假设 metadata 中存储了 user_id
        # 实际可能需要根据具体设计调整
        if active_only:
            query = query.where(APIKey.is_active == True)
        
        result = await self.session.execute(query)
        return list(result.scalars().all())
```

### 工具注册仓储

```python
class ToolRegistrationRepository(BaseRepository[ToolRegistration]):
    """工具注册仓储"""
    
    def get_model_class(self) -> type[ToolRegistration]:
        return ToolRegistration
    
    async def find_by_name(self, name: str) -> ToolRegistration | None:
        """按名称查找"""
        result = await self.session.execute(
            select(ToolRegistration).where(ToolRegistration.name == name)
        )
        return result.scalar_one_or_none()
    
    async def find_by_server(self, server_id: str) -> list[ToolRegistration]:
        """按服务器查找"""
        result = await self.session.execute(
            select(ToolRegistration).where(
                ToolRegistration.server_id == server_id
            )
        )
        return list(result.scalars().all())
    
    async def find_active(self) -> list[ToolRegistration]:
        """查找所有活跃的工具"""
        result = await self.session.execute(
            select(ToolRegistration).where(
                ToolRegistration.is_active == True
            )
        )
        return list(result.scalars().all())
    
    async def deactivate_by_server(self, server_id: str) -> int:
        """停用服务器的所有工具"""
        result = await self.session.execute(
            update(ToolRegistration)
            .where(ToolRegistration.server_id == server_id)
            .values(is_active=False)
        )
        return result.rowcount
    
    async def upsert(
        self,
        name: str,
        description: str,
        input_schema: dict[str, Any],
        **kwargs: Any,
    ) -> ToolRegistration:
        """创建或更新工具"""
        existing = await self.find_by_name(name)
        
        if existing:
            # 更新
            await self.session.execute(
                update(ToolRegistration)
                .where(ToolRegistration.name == name)
                .values(
                    description=description,
                    input_schema=input_schema,
                    **kwargs,
                )
            )
            return await self.find_by_name(name)
        else:
            # 创建
            tool = ToolRegistration(
                name=name,
                description=description,
                input_schema=input_schema,
                **kwargs,
            )
            return await self.create(tool)
```

### 审计日志仓储

```python
class AuditLogRepository(BaseRepository[AuditLog]):
    """审计日志仓储"""
    
    def get_model_class(self) -> type[AuditLog]:
        return AuditLog
    
    async def log(
        self,
        request_id: str,
        action: str,
        resource_type: str,
        status: str,
        **kwargs: Any,
    ) -> AuditLog:
        """记录审计日志"""
        log = AuditLog(
            request_id=request_id,
            action=action,
            resource_type=resource_type,
            status=status,
            **kwargs,
        )
        return await self.create(log)
    
    async def find_by_request_id(self, request_id: str) -> list[AuditLog]:
        """按请求 ID 查找"""
        result = await self.session.execute(
            select(AuditLog)
            .where(AuditLog.request_id == request_id)
            .order_by(AuditLog.created_at)
        )
        return list(result.scalars().all())
    
    async def find_by_user(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 100,
    ) -> list[AuditLog]:
        """按用户查找"""
        result = await self.session.execute(
            select(AuditLog)
            .where(AuditLog.user_id == user_id)
            .order_by(AuditLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
    
    async def find_by_date_range(
        self,
        start_date,
        end_date,
        action: str | None = None,
    ) -> list[AuditLog]:
        """按日期范围查找"""
        query = select(AuditLog).where(
            AuditLog.created_at >= start_date,
            AuditLog.created_at <= end_date,
        )
        
        if action:
            query = query.where(AuditLog.action == action)
        
        result = await self.session.execute(
            query.order_by(AuditLog.created_at)
        )
        return list(result.scalars().all())
    
    async def get_statistics(
        self,
        start_date,
        end_date,
    ) -> dict[str, Any]:
        """获取统计数据"""
        from sqlalchemy import func
        
        # 总请求数
        total_result = await self.session.execute(
            select(func.count(AuditLog.id))
            .where(
                AuditLog.created_at >= start_date,
                AuditLog.created_at <= end_date,
            )
        )
        total = total_result.scalar()
        
        # 按状态统计
        status_result = await self.session.execute(
            select(AuditLog.status, func.count(AuditLog.id))
            .where(
                AuditLog.created_at >= start_date,
                AuditLog.created_at <= end_date,
            )
            .group_by(AuditLog.status)
        )
        by_status = dict(status_result.all())
        
        # 按操作统计
        action_result = await self.session.execute(
            select(AuditLog.action, func.count(AuditLog.id))
            .where(
                AuditLog.created_at >= start_date,
                AuditLog.created_at <= end_date,
            )
            .group_by(AuditLog.action)
        )
        by_action = dict(action_result.all())
        
        return {
            "total": total,
            "by_status": by_status,
            "by_action": by_action,
        }
```

## 使用示例

### 初始化数据库

```python
from mcp_gateway_core.storage import init_db, close_db, get_db

# 应用启动时
async def startup():
    await init_db()

# 应用关闭时
async def shutdown():
    await close_db()
```

### 使用仓储

```python
from mcp_gateway_core.storage import get_db, APIKeyRepository, AuditLogRepository

async def create_api_key():
    db = get_db()
    
    async with db.session() as session:
        repo = APIKeyRepository(session)
        
        # 创建 API Key
        api_key = await repo.create(APIKey(
            id="key123",
            name="my-agent",
            prefix="mcp_abc",
            key_hash="...",
            roles=["agent"],
            permissions=["tool:execute"],
        ))
        
        # 查询
        found = await repo.find_by_hash("...")
        
        # 更新最后使用时间
        await repo.update_last_used("key123")
```

### 记录审计日志

```python
async def log_tool_call(
    request_id: str,
    user_id: str,
    tool_name: str,
    arguments: dict,
    result: dict,
    duration_ms: float,
):
    db = get_db()
    
    async with db.session() as session:
        repo = AuditLogRepository(session)
        
        await repo.log(
            request_id=request_id,
            user_id=user_id,
            action="tool_call",
            resource_type="tool",
            resource_id=tool_name,
            request_data={"arguments": arguments},
            response_data={"result": result},
            status="success",
            duration_ms=duration_ms,
        )
```

## 设计亮点

| 特性 | 说明 | 面试价值 |
|------|------|----------|
| 异步 ORM | 使用 SQLAlchemy 2.0 异步 API | 现代数据库编程 |
| 仓储模式 | 分离数据访问与业务逻辑 | DDD 设计思想 |
| 连接池 | PostgreSQL 连接池配置 | 性能优化 |
| 多数据库 | 支持 SQLite 和 PostgreSQL | 环境适配 |

## 小结

本章实现了基于 SQLAlchemy 的异步存储层，包括数据库连接管理、数据模型定义和仓储模式实现。

**关键要点**：

1. 使用 SQLAlchemy 2.0 的异步 API 进行数据库操作
2. 仓储模式分离数据访问逻辑，提高可测试性
3. 支持多种数据库（开发用 SQLite，生产用 PostgreSQL）
4. 审计日志提供完整的操作追踪能力

下一章我们将实现可观测性模块，包括结构化日志、Prometheus 指标和 OpenTelemetry 追踪。

## 参考资料

- [SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- [Async SQLAlchemy Best Practices](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
