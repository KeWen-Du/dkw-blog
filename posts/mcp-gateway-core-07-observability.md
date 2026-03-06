---
title: "从零到一实现生产级 MCP Gateway（七）：可观测性"
date: "2025-04-07"
excerpt: "深入实现结构化日志、Prometheus 指标和 OpenTelemetry 分布式追踪，构建完整的可观测性体系。"
tags: ["AI", "MCP", "Observability", "OpenTelemetry", "Prometheus", "Python"]
series:
  slug: "mcp-gateway-core"
  title: "从零到一实现生产级 MCP Gateway"
  order: 7
---

# 从零到一实现生产级 MCP Gateway（七）：可观测性实现

## 前言

可观测性是生产级系统的重要保障，包括日志（Logging）、指标（Metrics）和追踪（Tracing）三大支柱。本章将深入实现结构化日志、Prometheus 指标和 OpenTelemetry 分布式追踪，为 MCP Gateway 构建完整的可观测性体系。

## 可观测性架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Observability Architecture                        │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     MCP Gateway                                │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │
│  │  │  Logging    │  │  Metrics    │  │  Tracing    │           │  │
│  │  │  (JSON)     │  │ (Prometheus)│  │ (OpenTel)   │           │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │  │
│  │         │                │                │                   │  │
│  └─────────┼────────────────┼────────────────┼───────────────────┘  │
│            │                │                │                       │
│            ▼                ▼                ▼                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │    ELK      │  │ Prometheus  │  │   Jaeger    │                 │
│  │   Stack     │  │ + Grafana   │  │   Tempo     │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Unified Dashboard                           │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  Grafana Dashboard (Logs + Metrics + Traces)            │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 结构化日志

### JSON 日志实现

```python
# observability/logging.py

from __future__ import annotations
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from ..config import get_config


class JSONFormatter(logging.Formatter):
    """JSON 格式化器
    
    输出结构化的 JSON 日志，便于日志聚合和分析。
    """
    
    def format(self, record: logging.LogRecord) -> str:
        """格式化日志记录为 JSON"""
        # 基础字段
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # 添加位置信息
        log_data["location"] = {
            "file": record.filename,
            "line": record.lineno,
            "function": record.funcName,
        }
        
        # 添加额外字段
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        
        if hasattr(record, "trace_id"):
            log_data["trace_id"] = record.trace_id
        
        if hasattr(record, "span_id"):
            log_data["span_id"] = record.span_id
        
        # 添加异常信息
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": self.formatException(record.exc_info),
            }
        
        # 添加额外属性
        extra_attrs = {}
        for key, value in record.__dict__.items():
            if key not in {
                "name", "msg", "args", "created", "filename", "funcName",
                "levelname", "levelno", "lineno", "module", "msecs",
                "pathname", "process", "processName", "relativeCreated",
                "stack_info", "exc_info", "exc_text", "message",
                "request_id", "user_id", "trace_id", "span_id",
            }:
                try:
                    json.dumps(value)  # 检查是否可序列化
                    extra_attrs[key] = value
                except (TypeError, ValueError):
                    extra_attrs[key] = str(value)
        
        if extra_attrs:
            log_data["extra"] = extra_attrs
        
        return json.dumps(log_data)


class ContextFilter(logging.Filter):
    """上下文过滤器
    
    从上下文变量中提取请求 ID、用户 ID 等信息。
    """
    
    def filter(self, record: logging.LogRecord) -> bool:
        """添加上下文信息到日志记录"""
        # 尝试从上下文获取信息
        from .tracing import get_current_span
        
        span = get_current_span()
        if span:
            record.trace_id = span.trace_id
            record.span_id = span.span_id
        
        return True


def setup_logging(
    level: str = "INFO",
    json_format: bool = True,
) -> None:
    """设置日志
    
    Args:
        level: 日志级别
        json_format: 是否使用 JSON 格式
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # 移除已有的处理器
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # 创建控制台处理器
    console_handler = logging.StreamHandler(sys.stdout)
    
    if json_format:
        console_handler.setFormatter(JSONFormatter())
    else:
        console_handler.setFormatter(
            logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            )
        )
    
    # 添加上下文过滤器
    console_handler.addFilter(ContextFilter())
    
    root_logger.addHandler(console_handler)


def get_logger(name: str) -> logging.Logger:
    """获取日志器"""
    return logging.getLogger(name)
```

### 日志上下文管理

```python
import contextvars
from contextvars import ContextVar

# 上下文变量
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)


class LogContext:
    """日志上下文管理器"""
    
    def __init__(
        self,
        request_id: str | None = None,
        user_id: str | None = None,
        **extra: Any,
    ):
        self.request_id = request_id
        self.user_id = user_id
        self.extra = extra
        self._tokens: list = []
    
    def __enter__(self):
        if self.request_id:
            self._tokens.append(request_id_var.set(self.request_id))
        if self.user_id:
            self._tokens.append(user_id_var.set(self.user_id))
        return self
    
    def __exit__(self, *args):
        for token in reversed(self._tokens):
            try:
                contextvar = request_id_var if "request" in str(token) else user_id_var
                contextvar.reset(token)
            except Exception:
                pass


# 使用示例
def log_with_context():
    with LogContext(request_id="abc123", user_id="user1"):
        logger = get_logger("mcp")
        logger.info("Processing request")  # 自动包含 request_id 和 user_id
```

## Prometheus 指标

### 指标定义

```python
# observability/metrics.py

from __future__ import annotations
import logging
from typing import Any

from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    Info,
    CollectorRegistry,
    generate_latest,
    CONTENT_TYPE_LATEST,
)

logger = logging.getLogger(__name__)


class MCPMetrics:
    """MCP Gateway Prometheus 指标
    
    定义和暴露所有业务指标。
    """
    
    def __init__(self, namespace: str = "mcp"):
        self.namespace = namespace
        self.registry = CollectorRegistry()
        
        # 工具相关指标
        self.tools_total = Gauge(
            f"{namespace}_tools_total",
            "Total number of registered tools",
            registry=self.registry,
        )
        
        self.tool_calls_total = Counter(
            f"{namespace}_tool_calls_total",
            "Total number of tool calls",
            ["tool_name", "status"],
            registry=self.registry,
        )
        
        self.tool_call_duration = Histogram(
            f"{namespace}_tool_call_duration_seconds",
            "Tool call duration in seconds",
            ["tool_name"],
            buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
            registry=self.registry,
        )
        
        # 资源相关指标
        self.resources_total = Gauge(
            f"{namespace}_resources_total",
            "Total number of registered resources",
            registry=self.registry,
        )
        
        self.resource_reads_total = Counter(
            f"{namespace}_resource_reads_total",
            "Total number of resource reads",
            ["resource_type"],
            registry=self.registry,
        )
        
        # 提示词相关指标
        self.prompts_total = Gauge(
            f"{namespace}_prompts_total",
            "Total number of registered prompts",
            registry=self.registry,
        )
        
        # 请求相关指标
        self.requests_total = Counter(
            f"{namespace}_requests_total",
            "Total number of HTTP requests",
            ["method", "path", "status"],
            registry=self.registry,
        )
        
        self.request_duration = Histogram(
            f"{namespace}_request_duration_seconds",
            "HTTP request duration in seconds",
            ["method", "path"],
            buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
            registry=self.registry,
        )
        
        # 认证相关指标
        self.auth_attempts_total = Counter(
            f"{namespace}_auth_attempts_total",
            "Total number of authentication attempts",
            ["type", "status"],
            registry=self.registry,
        )
        
        # 限流相关指标
        self.rate_limit_hits_total = Counter(
            f"{namespace}_rate_limit_hits_total",
            "Total number of rate limit hits",
            ["client_type"],
            registry=self.registry,
        )
        
        # 错误指标
        self.errors_total = Counter(
            f"{namespace}_errors_total",
            "Total number of errors",
            ["type", "component"],
            registry=self.registry,
        )
        
        # 服务信息
        self.service_info = Info(
            f"{namespace}_service",
            "MCP Gateway service information",
            registry=self.registry,
        )
    
    def set_service_info(self, version: str, **labels: str) -> None:
        """设置服务信息"""
        self.service_info.info({
            "version": version,
            **labels,
        })
    
    def record_tool_call(
        self,
        tool_name: str,
        status: str,
        duration: float,
    ) -> None:
        """记录工具调用"""
        self.tool_calls_total.labels(
            tool_name=tool_name,
            status=status,
        ).inc()
        
        self.tool_call_duration.labels(
            tool_name=tool_name,
        ).observe(duration)
    
    def record_request(
        self,
        method: str,
        path: str,
        status: int,
        duration: float,
    ) -> None:
        """记录 HTTP 请求"""
        self.requests_total.labels(
            method=method,
            path=path,
            status=str(status),
        ).inc()
        
        self.request_duration.labels(
            method=method,
            path=path,
        ).observe(duration)
    
    def record_auth_attempt(
        self,
        auth_type: str,
        success: bool,
    ) -> None:
        """记录认证尝试"""
        self.auth_attempts_total.labels(
            type=auth_type,
            status="success" if success else "failure",
        ).inc()
    
    def record_rate_limit_hit(self, client_type: str = "ip") -> None:
        """记录限流命中"""
        self.rate_limit_hits_total.labels(
            client_type=client_type,
        ).inc()
    
    def record_error(
        self,
        error_type: str,
        component: str,
    ) -> None:
        """记录错误"""
        self.errors_total.labels(
            type=error_type,
            component=component,
        ).inc()
    
    def update_registry_counts(
        self,
        tools: int,
        resources: int,
        prompts: int,
    ) -> None:
        """更新注册中心计数"""
        self.tools_total.set(tools)
        self.resources_total.set(resources)
        self.prompts_total.set(prompts)
    
    def get_metrics(self) -> bytes:
        """获取指标数据"""
        return generate_latest(self.registry)
    
    def get_content_type(self) -> str:
        """获取内容类型"""
        return CONTENT_TYPE_LATEST


# 全局指标实例
_metrics: MCPMetrics | None = None


def setup_metrics(namespace: str = "mcp") -> MCPMetrics:
    """设置指标"""
    global _metrics
    _metrics = MCPMetrics(namespace=namespace)
    return _metrics


def get_metrics() -> MCPMetrics:
    """获取指标实例"""
    if _metrics is None:
        _metrics = MCPMetrics()
    return _metrics
```

## OpenTelemetry 分布式追踪

### Span 数据结构

```python
# observability/tracing.py

from __future__ import annotations
import functools
import logging
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

# 上下文变量
current_span_var: ContextVar["Span | None"] = ContextVar("current_span", default=None)
trace_context_var: ContextVar[dict[str, Any]] = ContextVar("trace_context", default=None)

# OpenTelemetry 可选导入
try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.resources import Resource
    
    OTEL_AVAILABLE = True
except ImportError:
    OTEL_AVAILABLE = False
    trace = None

F = TypeVar("F", bound=Callable[..., Any])


@dataclass
class Span:
    """追踪 Span 数据结构
    
    代表一个工作单元的追踪信息。
    """
    trace_id: str
    span_id: str
    parent_span_id: str | None = None
    name: str = ""
    start_time: float = field(default_factory=time.perf_counter)
    end_time: float | None = None
    attributes: dict[str, Any] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)
    status: str = "OK"
    
    def set_attribute(self, key: str, value: Any) -> None:
        """设置属性"""
        self.attributes[key] = value
    
    def add_event(
        self, 
        name: str, 
        attributes: dict[str, Any] | None = None
    ) -> None:
        """添加事件"""
        self.events.append({
            "name": name,
            "timestamp": time.perf_counter(),
            "attributes": attributes or {},
        })
    
    def set_status(
        self, 
        status: str, 
        description: str | None = None
    ) -> None:
        """设置状态"""
        self.status = status
        if description:
            self.attributes["status_description"] = description
    
    def record_exception(self, exc: Exception) -> None:
        """记录异常"""
        self.set_status("ERROR", str(exc))
        self.add_event("exception", {
            "type": type(exc).__name__,
            "message": str(exc),
        })
    
    def finish(self) -> None:
        """结束 Span"""
        self.end_time = time.perf_counter()
    
    @property
    def duration_ms(self) -> float:
        """获取耗时（毫秒）"""
        if self.end_time is None:
            return 0.0
        return (self.end_time - self.start_time) * 1000
```

### Tracer 实现

```python
class Tracer:
    """追踪器
    
    支持 native 实现和 OpenTelemetry SDK。
    """
    
    def __init__(
        self, 
        service_name: str = "mcp-gateway",
        use_otel: bool = True
    ):
        self.service_name = service_name
        self._spans: list[Span] = []
        self._otel_tracer = None
        
        if use_otel and OTEL_AVAILABLE:
            try:
                self._otel_tracer = trace.get_tracer(service_name)
            except Exception as e:
                logger.warning(f"Failed to initialize OpenTelemetry tracer: {e}")
    
    def _generate_id(self) -> str:
        """生成唯一 ID"""
        return uuid.uuid4().hex[:16]
    
    def start_span(
        self,
        name: str,
        parent: Span | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> Span:
        """创建新的 Span"""
        # 从上下文获取父 Span
        if parent is None:
            parent = current_span_var.get()
        
        span = Span(
            trace_id=parent.trace_id if parent else self._generate_id() + self._generate_id(),
            span_id=self._generate_id(),
            parent_span_id=parent.span_id if parent else None,
            name=name,
            attributes={"service": self.service_name, **(attributes or {})},
        )
        
        return span
    
    @contextmanager
    def trace(self, name: str, **attributes: Any):
        """追踪上下文管理器"""
        span = self.start_span(name, attributes=attributes)
        token = current_span_var.set(span)
        
        # OpenTelemetry Span
        otel_span = None
        if self._otel_tracer:
            try:
                otel_span = self._otel_tracer.start_as_current_span(name)
                for k, v in attributes.items():
                    otel_span.set_attribute(k, v)
            except Exception as e:
                logger.debug(f"Failed to start OpenTelemetry span: {e}")
        
        try:
            yield span
        except Exception as e:
            span.record_exception(e)
            if otel_span:
                try:
                    otel_span.record_exception(e)
                    otel_span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
                except Exception:
                    pass
            raise
        finally:
            span.finish()
            self._spans.append(span)
            current_span_var.reset(token)
            
            if otel_span:
                try:
                    otel_span.end()
                except Exception:
                    pass
    
    def get_traces(self) -> list[list[dict[str, Any]]]:
        """获取所有追踪数据"""
        traces = {}
        
        for span in self._spans:
            if span.trace_id not in traces:
                traces[span.trace_id] = []
            
            traces[span.trace_id].append({
                "trace_id": span.trace_id,
                "span_id": span.span_id,
                "parent_span_id": span.parent_span_id,
                "name": span.name,
                "duration_ms": span.duration_ms,
                "attributes": span.attributes,
                "events": span.events,
                "status": span.status,
            })
        
        return list(traces.values())
    
    def clear(self) -> None:
        """清空追踪数据"""
        self._spans.clear()


# 全局 Tracer
_tracer: Tracer | None = None


def setup_tracing(
    service_name: str = "mcp-gateway",
    use_otel: bool = True,
    otlp_endpoint: str | None = None,
) -> Tracer:
    """设置追踪"""
    global _tracer
    
    # 配置 OpenTelemetry
    if use_otel and OTEL_AVAILABLE and otlp_endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            
            resource = Resource.create({"service.name": service_name})
            provider = TracerProvider(resource=resource)
            
            exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
            provider.add_span_processor(BatchSpanProcessor(exporter))
            
            trace.set_tracer_provider(provider)
            logger.info(f"OpenTelemetry configured with OTLP: {otlp_endpoint}")
        except Exception as e:
            logger.warning(f"Failed to configure OTLP: {e}")
    
    _tracer = Tracer(service_name=service_name, use_otel=use_otel)
    return _tracer


def get_tracer() -> Tracer:
    """获取 Tracer"""
    global _tracer
    if _tracer is None:
        _tracer = Tracer()
    return _tracer


@contextmanager
def trace_span(name: str, **attributes: Any):
    """Span 上下文管理器"""
    tracer = get_tracer()
    with tracer.trace(name, **attributes) as span:
        yield span


def traced(
    name: str | None = None, 
    **attributes: Any
) -> Callable[[F], F]:
    """追踪装饰器
    
    Example:
        @traced("process_request")
        async def handle_request(request):
            ...
    """
    def decorator(func: F) -> F:
        span_name = name or func.__name__
        
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            with trace_span(span_name, **attributes) as span:
                span.set_attribute("function", func.__name__)
                span.set_attribute("module", func.__module__)
                
                try:
                    result = await func(*args, **kwargs)
                    return result
                except Exception as e:
                    span.record_exception(e)
                    raise
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            with trace_span(span_name, **attributes) as span:
                span.set_attribute("function", func.__name__)
                span.set_attribute("module", func.__module__)
                
                try:
                    result = func(*args, **kwargs)
                    return result
                except Exception as e:
                    span.record_exception(e)
                    raise
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


def get_current_span() -> Span | None:
    """获取当前 Span"""
    return current_span_var.get()


def set_span_attribute(key: str, value: Any) -> None:
    """设置当前 Span 属性"""
    span = get_current_span()
    if span:
        span.set_attribute(key, value)


def add_span_event(name: str, attributes: dict[str, Any] | None = None) -> None:
    """添加当前 Span 事件"""
    span = get_current_span()
    if span:
        span.add_event(name, attributes)
```

## 指标端点

```python
# api/metrics.py

from fastapi import APIRouter, Response

from ..observability.metrics import get_metrics

router = APIRouter()


@router.get("/metrics")
async def prometheus_metrics() -> Response:
    """Prometheus 指标端点"""
    metrics = get_metrics()
    return Response(
        content=metrics.get_metrics(),
        media_type=metrics.get_content_type(),
    )
```

## 使用示例

### 记录工具调用指标

```python
from mcp_gateway_core.observability import get_metrics, trace_span
import time

async def execute_tool(name: str, arguments: dict):
    metrics = get_metrics()
    
    start_time = time.time()
    status = "success"
    
    try:
        with trace_span(f"tool.{name}", tool_name=name) as span:
            span.set_attribute("arguments", str(arguments))
            
            # 执行工具
            result = await tool_handler(**arguments)
            
            span.set_attribute("result_size", len(str(result)))
            return result
            
    except Exception as e:
        status = "error"
        raise
    finally:
        duration = time.time() - start_time
        metrics.record_tool_call(name, status, duration)
```

### 日志输出示例

```json
{
  "timestamp": "2026-03-06T10:30:00+00:00",
  "level": "INFO",
  "logger": "mcp_gateway.http",
  "message": "POST /mcp - 200 - 15.23ms",
  "request_id": "ccf710cf-0850-4233-8b3f-4e6c5d2a1f9e",
  "user_id": "user123",
  "trace_id": "abc123def456",
  "span_id": "span789"
}
```

### Prometheus 指标示例

```
# HELP mcp_tools_total Total number of registered tools
# TYPE mcp_tools_total gauge
mcp_tools_total 4

# HELP mcp_tool_calls_total Total number of tool calls
# TYPE mcp_tool_calls_total counter
mcp_tool_calls_total{tool_name="echo",status="success"} 150
mcp_tool_calls_total{tool_name="echo",status="error"} 2

# HELP mcp_tool_call_duration_seconds Tool call duration in seconds
# TYPE mcp_tool_call_duration_seconds histogram
mcp_tool_call_duration_seconds_bucket{tool_name="echo",le="0.01"} 100
mcp_tool_call_duration_seconds_bucket{tool_name="echo",le="0.05"} 145
mcp_tool_call_duration_seconds_bucket{tool_name="echo",le="0.1"} 148
mcp_tool_call_duration_seconds_bucket{tool_name="echo",le="+Inf"} 150
```

## 设计亮点

| 特性 | 说明 | 面试价值 |
|------|------|----------|
| JSON 结构化日志 | 便于聚合和分析 | 日志最佳实践 |
| Prometheus 指标 | 标准指标格式 | 监控系统集成 |
| OpenTelemetry | 厂商中立的追踪标准 | 分布式追踪 |
| 上下文传播 | 自动关联请求信息 | 全链路追踪 |

## 小结

本章实现了完整的可观测性体系，包括结构化日志、Prometheus 指标和 OpenTelemetry 分布式追踪。

**关键要点**：

1. JSON 格式日志便于日志聚合和分析
2. Prometheus 指标提供实时监控能力
3. OpenTelemetry 追踪支持分布式系统调试
4. 三者结合实现全链路可观测性

下一章我们将讨论生产实践，包括部署、配置和安全加固。

## 参考资料

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Structured Logging Guide](https://www.honeycomb.io/blog/structured-logging-vs-unstructured-logging)
