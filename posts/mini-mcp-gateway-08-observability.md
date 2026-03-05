---
title: "从零到一实现mini-mcp-gateway（八）：可观测性与监控"
date: "2026-01-31"
excerpt: "实现MCP Gateway的可观测性三支柱：结构化日志、Prometheus指标、分布式追踪，确保生产环境的可监控性和故障定位能力。"
tags: ["AI", "MCP", "Observability", "OpenTelemetry", "Prometheus", "监控"]
series:
  slug: "mini-mcp-gateway"
  title: "从零到一实现 mini-mcp-gateway"
  order: 8
---

# 从零到一实现mini-mcp-gateway（八）：可观测性与监控

## 前言

生产环境的MCP Gateway必须具备完善的可观测性。本文实现可观测性三支柱：日志（Logs）、指标（Metrics）、追踪（Traces），确保系统可监控、可诊断、可优化。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                   Observability Stack                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Logs      │  │   Metrics   │  │   Traces    │         │
│  │   日志       │  │   指标      │  │   追踪      │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Structured  │  │ Prometheus  │  │ OpenTelemetry│        │
│  │ JSON Logs   │  │ Exporter    │  │ Compatible  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Loki/ELK    │  │ Grafana     │  │ Jaeger/     │         │
│  │             │  │ Dashboard   │  │ Zipkin      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 一、结构化日志

### 日志格式设计

```python
# src/mini_mcp_gateway/observability/logging.py

from contextvars import ContextVar
from datetime import datetime, timezone

# 请求上下文
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)


class StructuredFormatter(logging.Formatter):
    """JSON结构化日志格式化器。"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # 注入请求上下文
        request_id = request_id_var.get()
        if request_id:
            log_data["request_id"] = request_id
        
        user_id = user_id_var.get()
        if user_id:
            log_data["user_id"] = user_id
        
        # 异常信息
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        import json
        return json.dumps(log_data, ensure_ascii=False)


def setup_logging(level: str = "INFO", json_format: bool = True) -> None:
    """配置结构化日志。"""
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    
    handler = logging.StreamHandler(sys.stdout)
    
    if json_format:
        handler.setFormatter(StructuredFormatter())
    
    root_logger.addHandler(handler)
```

### 上下文日志

```python
class ContextLogger(logging.LoggerAdapter):
    """带上下文的日志适配器。"""
    
    def process(self, msg: str, kwargs: dict) -> tuple[str, dict]:
        extra = kwargs.get("extra", {})
        if self.extra:
            extra.update(self.extra)
        kwargs["extra"] = extra
        return msg, kwargs


def get_logger(name: str, **context) -> ContextLogger:
    """获取带上下文的日志器。"""
    logger = logging.getLogger(name)
    return ContextLogger(logger, extra=context)


def set_request_context(request_id: str | None = None, user_id: str | None = None):
    """设置请求上下文。"""
    if request_id:
        request_id_var.set(request_id)
    if user_id:
        user_id_var.set(user_id)
```

### 日志输出示例

```json
{
  "timestamp": "2026-02-29T16:00:00.000Z",
  "level": "INFO",
  "logger": "mini_mcp_gateway.registry",
  "message": "Tool executed successfully",
  "request_id": "abc123",
  "user_id": "user@example.com"
}
```

## 二、Prometheus指标

### 指标定义

```python
# src/mini_mcp_gateway/observability/metrics.py

class MetricsCollector:
    """Prometheus指标收集器。
    
    支持三种指标类型：
    - Counter: 单调递增计数器
    - Gauge: 可增可减的仪表
    - Histogram: 分布统计
    """
    
    def __init__(self, namespace: str = "mcp", subsystem: str = "gateway"):
        self.namespace = namespace
        self.subsystem = subsystem
        self._counters: dict[str, list[MetricValue]] = {}
        self._gauges: dict[str, list[MetricValue]] = {}
        self._histograms: dict[str, dict] = {}
        self._histogram_buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
    
    def counter(self, name: str, value: float = 1, labels: dict | None = None):
        """增加计数器。"""
        full_name = f"{self.namespace}_{self.subsystem}_{name}"
        # ... 实现
    
    def gauge(self, name: str, value: float, labels: dict | None = None):
        """设置仪表值。"""
        # ... 实现
    
    def histogram(self, name: str, value: float, labels: dict | None = None):
        """记录直方图观测值。"""
        # ... 实现
    
    @contextmanager
    def timeit(self, name: str, labels: dict | None = None):
        """计时上下文管理器。"""
        start = time.perf_counter()
        try:
            yield
        finally:
            duration = time.perf_counter() - start
            self.histogram(name, duration, labels)
    
    def export_prometheus(self) -> str:
        """导出Prometheus格式指标。"""
        lines = []
        
        # 导出计数器
        for name, metrics in self._counters.items():
            lines.append(f"# TYPE {name} counter")
            for m in metrics:
                labels_str = self._labels_to_str(m.labels)
                lines.append(f"{name}{labels_str} {m.value}")
        
        # 导出直方图
        # ...
        
        return "\n".join(lines)
```

### 核心指标定义

```python
# 工具调用指标
def record_tool_call(tool_name: str, status: str, duration: float):
    metrics = get_metrics()
    metrics.counter("tool_calls_total", 1, {"tool": tool_name, "status": status})
    metrics.histogram("tool_duration_seconds", duration, {"tool": tool_name})


# HTTP请求指标
def record_request(method: str, path: str, status: int, duration: float):
    metrics = get_metrics()
    metrics.counter("http_requests_total", 1, {
        "method": method,
        "path": path,
        "status": str(status)
    })
    metrics.histogram("http_request_duration_seconds", duration, {
        "method": method,
        "path": path
    })
```

### Prometheus端点

```python
from fastapi.responses import PlainTextResponse

async def metrics_endpoint(request: Request) -> Response:
    """Prometheus指标采集端点。"""
    metrics = get_metrics()
    return PlainTextResponse(
        content=metrics.export_prometheus(),
        media_type="text/plain; version=0.0.4",
    )

# 注册路由
@app.get("/metrics")
async def metrics():
    return await metrics_endpoint(request)
```

### 指标输出示例

```
# TYPE mcp_gateway_tool_calls_total counter
mcp_gateway_tool_calls_total{tool="echo",status="success"} 42
mcp_gateway_tool_calls_total{tool="echo",status="error"} 3

# TYPE mcp_gateway_tool_duration_seconds histogram
mcp_gateway_tool_duration_seconds_bucket{tool="echo",le="0.005"} 20
mcp_gateway_tool_duration_seconds_bucket{tool="echo",le="0.01"} 35
mcp_gateway_tool_duration_seconds_sum 0.234
mcp_gateway_tool_duration_seconds_count 45
```

## 三、分布式追踪

### Span定义

```python
# src/mini_mcp_gateway/observability/tracing.py

@dataclass
class Span:
    """追踪Span，代表一个工作单元。"""
    trace_id: str
    span_id: str
    parent_span_id: str | None = None
    name: str = ""
    start_time: float = field(default_factory=time.perf_counter)
    end_time: float | None = None
    attributes: dict[str, Any] = field(default_factory=dict)
    events: list[dict] = field(default_factory=list)
    status: str = "OK"
    
    def set_attribute(self, key: str, value: Any):
        """设置属性。"""
        self.attributes[key] = value
    
    def add_event(self, name: str, attributes: dict | None = None):
        """添加事件。"""
        self.events.append({
            "name": name,
            "timestamp": time.perf_counter(),
            "attributes": attributes or {},
        })
    
    def set_status(self, status: str, description: str | None = None):
        """设置状态。"""
        self.status = status
        if description:
            self.attributes["status_description"] = description
```

### Tracer实现

```python
class Tracer:
    """分布式追踪器。"""
    
    def __init__(self, service_name: str = "mcp-gateway"):
        self.service_name = service_name
        self._spans: list[Span] = []
    
    @contextmanager
    def trace(self, name: str, **attributes):
        """追踪上下文管理器。"""
        span = self.start_span(name, attributes=attributes)
        token = current_span_var.set(span)
        
        try:
            yield span
        except Exception as e:
            span.set_status("ERROR", str(e))
            span.set_attribute("error.type", type(e).__name__)
            raise
        finally:
            span.finish()
            self._spans.append(span)
            current_span_var.reset(token)


# 全局函数
@contextmanager
def trace_span(name: str, **attributes):
    """使用全局Tracer追踪。"""
    tracer = get_tracer()
    with tracer.trace(name, **attributes) as span:
        yield span
```

### 追踪使用示例

```python
async def handle_tool_call(name: str, arguments: dict):
    with trace_span("tool_call", tool_name=name) as span:
        span.set_attribute("tool.name", name)
        span.set_attribute("tool.args", json.dumps(arguments))
        
        result = await execute_tool(name, arguments)
        
        span.set_attribute("tool.result_size", len(str(result)))
        return result
```

### 追踪上下文传播

```python
def inject_trace_headers(headers: dict[str, str]) -> None:
    """注入追踪上下文到HTTP头。"""
    span = get_current_span()
    if span:
        # W3C Trace Context格式
        headers["traceparent"] = f"00-{span.trace_id}-{span.span_id}-01"


def extract_trace_headers(headers: dict[str, str]) -> Span | None:
    """从HTTP头提取追踪上下文。"""
    traceparent = headers.get("traceparent")
    if traceparent:
        parts = traceparent.split("-")
        if len(parts) >= 3:
            return Span(trace_id=parts[1], span_id=parts[2])
    return None
```

## Grafana仪表板建议

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Gateway Dashboard                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Request Rate     │  │ Error Rate       │                │
│  │ 1.2k req/s      │  │ 0.03%           │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Tool Call Duration (P99)                 │  │
│  │  ──────────────────────────────────────────────────  │  │
│  │  echo: 12ms  github_list_issues: 234ms              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Active Tools     │  │ Active Clients   │                │
│  │ 15              │  │ 127             │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 技术亮点

| 特性 | 实现方式 | 面试价值 |
|------|----------|----------|
| 结构化日志 | JSON格式+上下文注入 | 日志治理能力 |
| Prometheus | Counter/Gauge/Histogram | 指标设计能力 |
| 分布式追踪 | W3C Trace Context | 链路追踪能力 |
| 上下文传播 | HTTP Header注入 | 微服务通信能力 |

## 小结

本章实现了完整的可观测性三支柱，让MCP Gateway在生产环境中可监控、可诊断。下一章我们将介绍生产部署与最佳实践。
