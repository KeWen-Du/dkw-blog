---
title: "大模型应用开发教程（三）：API 调用基础"
date: "2026-02-17"
excerpt: "掌握大模型 API 调用的核心技术，包括认证安全、请求格式、响应处理、流式输出和错误处理的最佳实践。"
tags: ["大模型", "API", "OpenAI", "Claude", "开发实践"]
series:
  slug: "llm-app-dev-tutorial"
  title: "大模型应用开发教程"
  order: 3
---

# 大模型应用开发教程（三）：API 调用基础

## 前言

在前两章中，我们了解了大模型的基本概念和主流模型的特点。本章将进入实战环节，深入学习大模型 API 调用的核心技术。无论是使用 OpenAI、Claude 还是其他模型，掌握 API 调用的最佳实践是开发高质量 AI 应用的基础。

## API 认证与安全

### API Key 管理最佳实践

**永远不要在代码中硬编码 API Key！** 这是一个常见但危险的安全漏洞。

```python
# ❌ 错误示例：硬编码 API Key
api_key = "sk-proj-xxxxxxxxxxxx"  # 千万不要这样做！

# ✅ 正确做法：使用环境变量
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY")
)
```

### 环境变量配置

**方式一：系统环境变量**

```bash
# Linux/Mac
export OPENAI_API_KEY="sk-proj-your-key-here"
export ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Windows PowerShell
$env:OPENAI_API_KEY="sk-proj-your-key-here"
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Windows CMD
set OPENAI_API_KEY=sk-proj-your-key-here
```

**方式二：.env 文件**

```bash
# 创建 .env 文件
OPENAI_API_KEY=sk-proj-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

```python
# 使用 python-dotenv 加载
from dotenv import load_dotenv
import os

load_dotenv()  # 加载 .env 文件

api_key = os.getenv("OPENAI_API_KEY")
```

**重要：** 将 `.env` 添加到 `.gitignore`：

```gitignore
# .gitignore
.env
.env.local
*.pem
```

### API Key 安全检查清单

```
✅ 使用环境变量存储 API Key
✅ 不将 API Key 提交到版本控制
✅ 定期轮换 API Key
✅ 为不同环境使用不同的 Key
✅ 设置 API Key 使用限额和告警
✅ 监控 API Key 使用情况，及时发现异常
```

## 基础 API 调用

### OpenAI API 基础调用

**安装 SDK：**

```bash
pip install openai
```

**基础对话示例：**

```python
from openai import OpenAI

client = OpenAI()

# 基础对话
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user", "content": "什么是机器学习？"}
    ]
)

print(response.choices[0].message.content)
```

### Claude API 基础调用

**安装 SDK：**

```bash
pip install anthropic
```

**基础对话示例：**

```python
from anthropic import Anthropic

client = Anthropic()

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    system="你是一个有帮助的助手。",
    messages=[
        {"role": "user", "content": "什么是机器学习？"}
    ]
)

print(message.content[0].text)
```

## 请求参数详解

### 核心参数

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| model | 模型名称 | 根据需求选择 |
| messages | 对话消息列表 | - |
| max_tokens | 最大输出长度 | 1024-4096 |
| temperature | 随机性控制 | 0-1，默认 0.7 |
| top_p | 核采样参数 | 0-1，默认 1 |
| stream | 是否流式输出 | true/false |

### Temperature 参数详解

Temperature 控制输出的随机性：

```python
# 低 temperature (0-0.3)：确定性高，适合事实性任务
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "1+1等于几？"}],
    temperature=0  # 总是给出相同的答案
)

# 高 temperature (0.7-1.0)：创造性强，适合创意任务
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "写一首关于春天的诗"}],
    temperature=0.9  # 每次输出不同
)
```

### 消息格式

**OpenAI 消息格式：**

```python
messages = [
    # 系统消息：设置助手行为
    {"role": "system", "content": "你是一位 Python 专家。"},
    
    # 用户消息
    {"role": "user", "content": "如何读取 JSON 文件？"},
    
    # 助手消息：可以是历史对话
    {"role": "assistant", "content": "可以使用 json.load()..."},
    
    # 继续对话
    {"role": "user", "content": "能给我一个例子吗？"}
]
```

**Claude 消息格式：**

```python
# Claude 的 system 参数是独立的
message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    system="你是一位 Python 专家。",  # 系统提示单独设置
    messages=[
        {"role": "user", "content": "如何读取 JSON 文件？"},
        {"role": "assistant", "content": "可以使用 json.load()..."},
        {"role": "user", "content": "能给我一个例子吗？"}
    ]
)
```

## 响应处理

### 响应结构

**OpenAI 响应结构：**

```python
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "你好"}]
)

# 响应对象结构
print(response.id)          # 响应 ID
print(response.model)       # 使用的模型
print(response.created)     # 创建时间戳
print(response.usage)       # Token 使用统计

# 获取内容
content = response.choices[0].message.content
print(content)

# Token 统计
print(f"输入 tokens: {response.usage.prompt_tokens}")
print(f"输出 tokens: {response.usage.completion_tokens}")
print(f"总计 tokens: {response.usage.total_tokens}")
```

**Claude 响应结构：**

```python
message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "你好"}]
)

# 响应对象结构
print(message.id)           # 消息 ID
print(message.model)        # 使用的模型
print(message.role)         # 角色（assistant）
print(message.content)      # 内容列表
print(message.usage)        # Token 使用统计

# 获取内容
content = message.content[0].text
print(content)

# Token 统计
print(f"输入 tokens: {message.usage.input_tokens}")
print(f"输出 tokens: {message.usage.output_tokens}")
```

## 流式输出

流式输出可以让用户实时看到生成的内容，显著提升用户体验。

### OpenAI 流式输出

```python
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "写一个短故事"}],
    stream=True  # 启用流式输出
)

for chunk in stream:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### Claude 流式输出

```python
with client.messages.stream(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "写一个短故事"}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

### 流式输出的高级用法

**带回调的流式输出：**

```python
def stream_with_callback(prompt, on_chunk):
    """带回调的流式输出"""
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        stream=True
    )
    
    full_content = ""
    for chunk in stream:
        if chunk.choices[0].delta.content is not None:
            content = chunk.choices[0].delta.content
            full_content += content
            on_chunk(content)  # 调用回调函数
    
    return full_content

# 使用示例
def print_chunk(chunk):
    print(chunk, end="", flush=True)

result = stream_with_callback(
    "解释什么是递归",
    on_chunk=print_chunk
)
```

**异步流式输出：**

```python
import asyncio
from openai import AsyncOpenAI

async_client = AsyncOpenAI()

async def stream_async(prompt):
    stream = await async_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        stream=True
    )
    
    async for chunk in stream:
        if chunk.choices[0].delta.content is not None:
            print(chunk.choices[0].delta.content, end="", flush=True)

# 运行
asyncio.run(stream_async("你好"))
```

## 错误处理

### 常见错误类型

```python
from openai import (
    OpenAI,
    APIError,           # API 通用错误
    APIConnectionError, # 连接错误
    RateLimitError,     # 速率限制
    AuthenticationError,# 认证错误
    BadRequestError,    # 请求格式错误
    APITimeoutError,    # 超时错误
)

client = OpenAI()

try:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "你好"}]
    )
except AuthenticationError:
    print("API Key 无效或已过期")
except RateLimitError:
    print("已达到速率限制，请稍后重试")
except APIConnectionError:
    print("网络连接失败，请检查网络")
except APITimeoutError:
    print("请求超时，请重试")
except BadRequestError as e:
    print(f"请求参数错误: {e}")
except APIError as e:
    print(f"API 错误: {e}")
```

### 重试机制

```python
import time
from openai import OpenAI, RateLimitError, APIConnectionError

client = OpenAI()

def call_with_retry(prompt, max_retries=3, retry_delay=1):
    """带重试机制的 API 调用"""
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}]
            )
            return response
        
        except RateLimitError:
            if attempt < max_retries - 1:
                wait_time = retry_delay * (2 ** attempt)  # 指数退避
                print(f"速率限制，{wait_time}秒后重试...")
                time.sleep(wait_time)
            else:
                raise
        
        except APIConnectionError:
            if attempt < max_retries - 1:
                print(f"连接失败，重试中... ({attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
            else:
                raise
    
    return None
```

### 超时设置

```python
# 设置请求超时
client = OpenAI(timeout=30.0)  # 30秒超时

# 或者针对单个请求设置
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "你好"}],
    timeout=30.0
)
```

## 生产级错误监控与告警

### 完整错误处理框架

生产环境需要一套完整的错误处理和监控系统：

```python
from dataclasses import dataclass
from typing import Optional, Callable, Any
from enum import Enum
import logging
import time
from datetime import datetime
import json

class ErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class ErrorContext:
    """错误上下文"""
    error_type: str
    message: str
    severity: ErrorSeverity
    timestamp: datetime
    trace_id: str
    request_id: Optional[str] = None
    model: Optional[str] = None
    retry_count: int = 0
    additional_info: dict = None

class LLMErrorHandler:
    """生产级错误处理器"""
    
    def __init__(
        self,
        alert_callback: Callable[[ErrorContext], None] = None,
        max_retries: int = 3,
        retry_delay: float = 1.0
    ):
        self.alert_callback = alert_callback
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.error_counts = {}
        self.circuit_breaker = CircuitBreaker()
        
        # 配置日志
        self.logger = logging.getLogger("llm_errors")
        self.logger.setLevel(logging.INFO)
        handler = logging.FileHandler("llm_errors.log")
        handler.setFormatter(logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s'
        ))
        self.logger.addHandler(handler)
    
    def handle_error(
        self, 
        error: Exception, 
        context: dict
    ) -> ErrorContext:
        """处理错误并决定下一步行动"""
        
        error_context = self._create_error_context(error, context)
        
        # 记录日志
        self._log_error(error_context)
        
        # 更新错误计数
        self._update_error_counts(error_context)
        
        # 检查是否需要告警
        if self._should_alert(error_context):
            self._send_alert(error_context)
        
        # 更新熔断器状态
        self.circuit_breaker.record_failure()
        
        return error_context
    
    def _create_error_context(
        self, 
        error: Exception, 
        context: dict
    ) -> ErrorContext:
        """创建错误上下文"""
        
        error_type = type(error).__name__
        
        # 确定严重程度
        severity = self._determine_severity(error)
        
        return ErrorContext(
            error_type=error_type,
            message=str(error),
            severity=severity,
            timestamp=datetime.now(),
            trace_id=context.get("trace_id", "unknown"),
            request_id=context.get("request_id"),
            model=context.get("model"),
            retry_count=context.get("retry_count", 0),
            additional_info=context.get("additional_info")
        )
    
    def _determine_severity(self, error: Exception) -> ErrorSeverity:
        """确定错误严重程度"""
        
        if isinstance(error, AuthenticationError):
            return ErrorSeverity.CRITICAL
        elif isinstance(error, RateLimitError):
            return ErrorSeverity.HIGH
        elif isinstance(error, APIConnectionError):
            return ErrorSeverity.MEDIUM
        elif isinstance(error, APITimeoutError):
            return ErrorSeverity.MEDIUM
        else:
            return ErrorSeverity.LOW
    
    def _should_alert(self, context: ErrorContext) -> bool:
        """判断是否需要告警"""
        
        # 严重错误总是告警
        if context.severity in [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]:
            return True
        
        # 短时间内同类错误过多
        error_key = context.error_type
        if self.error_counts.get(error_key, 0) > 10:
            return True
        
        return False
    
    def _send_alert(self, context: ErrorContext):
        """发送告警"""
        
        alert_message = self._format_alert(context)
        
        # 调用告警回调
        if self.alert_callback:
            self.alert_callback(context)
        
        # 发送到监控系统
        self._send_to_monitoring(context)
        
        # 发送通知（邮件/Slack/钉钉等）
        self._send_notification(alert_message)
    
    def _format_alert(self, context: ErrorContext) -> str:
        """格式化告警消息"""
        return f"""
🚨 LLM API 错误告警

错误类型: {context.error_type}
严重程度: {context.severity.value}
时间: {context.timestamp.isoformat()}
Trace ID: {context.trace_id}
模型: {context.model}

错误消息:
{context.message}

重试次数: {context.retry_count}
"""
```

### 熔断器实现

```python
from dataclasses import dataclass
from enum import Enum
import time

class CircuitState(Enum):
    CLOSED = "closed"      # 正常状态
    OPEN = "open"          # 熔断状态
    HALF_OPEN = "half_open"  # 半开状态

@dataclass
class CircuitBreakerConfig:
    """熔断器配置"""
    failure_threshold: int = 5      # 失败次数阈值
    success_threshold: int = 3      # 成功次数阈值（半开状态）
    timeout: float = 60.0           # 熔断超时时间（秒）
    half_open_max_calls: int = 3    # 半开状态最大调用次数

class CircuitBreaker:
    """熔断器"""
    
    def __init__(self, config: CircuitBreakerConfig = None):
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = 0
        self.half_open_calls = 0
    
    def can_execute(self) -> bool:
        """判断是否可以执行"""
        
        if self.state == CircuitState.CLOSED:
            return True
        
        if self.state == CircuitState.OPEN:
            # 检查是否超时
            if time.time() - self.last_failure_time >= self.config.timeout:
                self._transition_to_half_open()
                return True
            return False
        
        if self.state == CircuitState.HALF_OPEN:
            return self.half_open_calls < self.config.half_open_max_calls
        
        return False
    
    def record_success(self):
        """记录成功"""
        
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.config.success_threshold:
                self._transition_to_closed()
        else:
            self.failure_count = 0
    
    def record_failure(self):
        """记录失败"""
        
        self.failure_count += 1
        self.last_failure_time = time.time()
        self.success_count = 0
        
        if self.state == CircuitState.HALF_OPEN:
            self._transition_to_open()
        elif self.failure_count >= self.config.failure_threshold:
            self._transition_to_open()
    
    def _transition_to_open(self):
        """转换到熔断状态"""
        self.state = CircuitState.OPEN
        self.half_open_calls = 0
        # 发送告警
        self._send_circuit_open_alert()
    
    def _transition_to_half_open(self):
        """转换到半开状态"""
        self.state = CircuitState.HALF_OPEN
        self.half_open_calls = 0
        self.success_count = 0
    
    def _transition_to_closed(self):
        """转换到正常状态"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.half_open_calls = 0


# 带熔断器的客户端
class ResilientLLMClient:
    """具有弹性的 LLM 客户端"""
    
    def __init__(self, client, error_handler: LLMErrorHandler = None):
        self.client = client
        self.error_handler = error_handler or LLMErrorHandler()
        self.circuit_breaker = CircuitBreaker()
    
    async def complete(
        self, 
        messages: list, 
        model: str = "gpt-4o-mini",
        **kwargs
    ) -> dict:
        """带完整错误处理的完成请求"""
        
        trace_id = kwargs.pop("trace_id", self._generate_trace_id())
        
        # 检查熔断器
        if not self.circuit_breaker.can_execute():
            raise CircuitOpenError("Circuit breaker is open")
        
        retry_count = 0
        last_error = None
        
        while retry_count < self.error_handler.max_retries:
            try:
                response = await self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    **kwargs
                )
                
                self.circuit_breaker.record_success()
                return response
                
            except Exception as e:
                last_error = e
                
                # 处理错误
                context = {
                    "trace_id": trace_id,
                    "model": model,
                    "retry_count": retry_count,
                }
                self.error_handler.handle_error(e, context)
                
                # 检查是否应该重试
                if self._should_retry(e) and retry_count < self.error_handler.max_retries - 1:
                    retry_count += 1
                    await self._wait_with_backoff(retry_count)
                else:
                    break
        
        raise last_error
    
    def _should_retry(self, error: Exception) -> bool:
        """判断是否应该重试"""
        retryable_errors = (
            APIConnectionError,
            APITimeoutError,
            RateLimitError,
        )
        return isinstance(error, retryable_errors)
    
    async def _wait_with_backoff(self, retry_count: int):
        """指数退避等待"""
        wait_time = self.error_handler.retry_delay * (2 ** retry_count)
        await asyncio.sleep(wait_time)
```

### 监控指标收集

```python
from prometheus_client import Counter, Histogram, Gauge
import time

# 定义 Prometheus 指标
LLM_REQUESTS_TOTAL = Counter(
    'llm_requests_total',
    'Total LLM API requests',
    ['model', 'status', 'error_type']
)

LLM_REQUEST_LATENCY = Histogram(
    'llm_request_latency_seconds',
    'LLM API request latency',
    ['model'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
)

LLM_ERRORS_TOTAL = Counter(
    'llm_errors_total',
    'Total LLM API errors',
    ['model', 'error_type', 'severity']
)

LLM_CIRCUIT_BREAKER_STATE = Gauge(
    'llm_circuit_breaker_state',
    'Circuit breaker state (0=closed, 1=open, 2=half_open)',
    ['model']
)

class MetricsCollector:
    """指标收集器"""
    
    def __init__(self):
        self.request_times = {}
    
    def record_request_start(self, trace_id: str, model: str):
        """记录请求开始"""
        self.request_times[trace_id] = {
            "start_time": time.time(),
            "model": model
        }
    
    def record_request_end(
        self, 
        trace_id: str, 
        status: str,
        error_type: str = None
    ):
        """记录请求结束"""
        if trace_id not in self.request_times:
            return
        
        request_info = self.request_times.pop(trace_id)
        latency = time.time() - request_info["start_time"]
        model = request_info["model"]
        
        # 记录指标
        LLM_REQUESTS_TOTAL.labels(
            model=model,
            status=status,
            error_type=error_type or "none"
        ).inc()
        
        LLM_REQUEST_LATENCY.labels(model=model).observe(latency)
    
    def record_error(
        self, 
        model: str, 
        error_type: str, 
        severity: str
    ):
        """记录错误"""
        LLM_ERRORS_TOTAL.labels(
            model=model,
            error_type=error_type,
            severity=severity
        ).inc()
    
    def update_circuit_breaker_state(self, model: str, state: CircuitState):
        """更新熔断器状态"""
        state_values = {
            CircuitState.CLOSED: 0,
            CircuitState.OPEN: 1,
            CircuitState.HALF_OPEN: 2
        }
        LLM_CIRCUIT_BREAKER_STATE.labels(model=model).set(state_values[state])
```

### 告警配置示例

```yaml
# alertmanager/config.yml
global:
  slack_api_url: 'https://hooks.slack.com/services/xxx'
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alerts@example.com'

route:
  receiver: 'llm-alerts'
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 1h
  routes:
    - match:
        severity: critical
      receiver: 'llm-critical'
    - match:
        severity: high
      receiver: 'llm-high'

receivers:
  - name: 'llm-alerts'
    slack_configs:
      - channel: '#llm-alerts'
        title: 'LLM API Alert'
        text: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'
  
  - name: 'llm-critical'
    slack_configs:
      - channel: '#llm-critical'
    email_configs:
      - to: 'oncall@example.com'
  
  - name: 'llm-high'
    slack_configs:
      - channel: '#llm-alerts'
```

```yaml
# prometheus/alerts.yml
groups:
  - name: llm_api_alerts
    rules:
      - alert: LLMAPIHighErrorRate
        expr: |
          rate(llm_errors_total[5m]) / rate(llm_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: high
        annotations:
          summary: "LLM API 错误率过高"
          description: "错误率 {{ $value | humanizePercentage }}，超过阈值 5%"

      - alert: LLMAPIHighLatency
        expr: |
          histogram_quantile(0.95, rate(llm_request_latency_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "LLM API 延迟过高"
          description: "P95 延迟 {{ $value }}s，超过阈值 5s"

      - alert: CircuitBreakerOpen
        expr: llm_circuit_breaker_state == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "熔断器已打开"
          description: "模型 {{ $labels.model }} 的熔断器已打开"

      - alert: LLMAPIRateLimited
        expr: |
          rate(llm_errors_total{error_type="RateLimitError"}[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "API 频繁触发速率限制"
          description: "需要检查请求频率或升级配额"
```

## Token 计算与管理

### Token 计算工具

```python
import tiktoken

def count_tokens(text, model="gpt-4o-mini"):
    """计算文本的 Token 数量"""
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))

# 示例
text = "Hello, how are you today?"
token_count = count_tokens(text)
print(f"Token 数量: {token_count}")

# 中文 Token 计算
chinese_text = "你好，今天天气怎么样？"
token_count = count_tokens(chinese_text)
print(f"中文 Token 数量: {token_count}")
```

### Token 预算管理

```python
class TokenBudget:
    """Token 预算管理器"""
    
    def __init__(self, max_tokens=4096, reserve_for_output=1024):
        self.max_tokens = max_tokens
        self.reserve_for_output = reserve_for_output
        self.max_input = max_tokens - reserve_for_output
    
    def can_fit(self, text):
        """检查文本是否在预算内"""
        return count_tokens(text) <= self.max_input
    
    def truncate_if_needed(self, text):
        """如果需要则截断文本"""
        encoding = tiktoken.encoding_for_model("gpt-4o-mini")
        tokens = encoding.encode(text)
        
        if len(tokens) > self.max_input:
            tokens = tokens[:self.max_input]
            return encoding.decode(tokens) + "..."
        
        return text

# 使用示例
budget = TokenBudget(max_tokens=4096, reserve_for_output=1024)
long_text = "很长的文本..."

if budget.can_fit(long_text):
    # 直接使用
    pass
else:
    # 截断后使用
    long_text = budget.truncate_if_needed(long_text)
```

## 请求优化

### 批量请求

```python
import asyncio
from openai import AsyncOpenAI

async_client = AsyncOpenAI()

async def process_single(prompt):
    """处理单个请求"""
    response = await async_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

async def process_batch(prompts, batch_size=5):
    """批量处理请求"""
    results = []
    
    for i in range(0, len(prompts), batch_size):
        batch = prompts[i:i + batch_size]
        tasks = [process_single(prompt) for prompt in batch]
        batch_results = await asyncio.gather(*tasks)
        results.extend(batch_results)
        
        # 避免触发速率限制
        if i + batch_size < len(prompts):
            await asyncio.sleep(1)
    
    return results

# 使用示例
prompts = ["问题1", "问题2", "问题3", "问题4", "问题5"]
results = asyncio.run(process_batch(prompts))
```

### 请求缓存

```python
import hashlib
import json
from functools import lru_cache

class APICache:
    """API 响应缓存"""
    
    def __init__(self):
        self.cache = {}
    
    def _get_cache_key(self, messages, model, temperature):
        """生成缓存键"""
        key_data = {
            "messages": messages,
            "model": model,
            "temperature": temperature
        }
        return hashlib.md5(json.dumps(key_data, sort_keys=True).encode()).hexdigest()
    
    def get(self, messages, model, temperature):
        """获取缓存"""
        key = self._get_cache_key(messages, model, temperature)
        return self.cache.get(key)
    
    def set(self, messages, model, temperature, response):
        """设置缓存"""
        key = self._get_cache_key(messages, model, temperature)
        self.cache[key] = response
    
    def call_with_cache(self, messages, model="gpt-4o-mini", temperature=0.7):
        """带缓存的调用"""
        # 尝试从缓存获取
        cached = self.get(messages, model, temperature)
        if cached:
            return cached
        
        # 调用 API
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature
        )
        
        # 存入缓存
        self.set(messages, model, temperature, response)
        return response

# 使用示例
cache = APICache()

# 第一次调用，会请求 API
response1 = cache.call_with_cache([{"role": "user", "content": "你好"}])

# 第二次调用相同内容，从缓存返回
response2 = cache.call_with_cache([{"role": "user", "content": "你好"}])
```

## 成本控制

### 成本计算

```python
# OpenAI 定价（2024年参考）
PRICING = {
    "gpt-4o": {"input": 2.50 / 1_000_000, "output": 10.00 / 1_000_000},
    "gpt-4o-mini": {"input": 0.15 / 1_000_000, "output": 0.60 / 1_000_000},
    "gpt-4-turbo": {"input": 10.00 / 1_000_000, "output": 30.00 / 1_000_000},
}

def calculate_cost(usage, model):
    """计算 API 调用成本"""
    pricing = PRICING.get(model, PRICING["gpt-4o-mini"])
    
    input_cost = usage.prompt_tokens * pricing["input"]
    output_cost = usage.completion_tokens * pricing["output"]
    
    return {
        "input_cost": input_cost,
        "output_cost": output_cost,
        "total_cost": input_cost + output_cost
    }

# 使用示例
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "你好"}]
)

cost = calculate_cost(response.usage, "gpt-4o-mini")
print(f"本次调用成本: ${cost['total_cost']:.6f}")
```

### 成本追踪器

```python
class CostTracker:
    """成本追踪器"""
    
    def __init__(self):
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost = 0
        self.calls = []
    
    def track(self, usage, model):
        """记录一次调用"""
        cost = calculate_cost(usage, model)
        
        self.total_input_tokens += usage.prompt_tokens
        self.total_output_tokens += usage.completion_tokens
        self.total_cost += cost["total_cost"]
        
        self.calls.append({
            "model": model,
            "input_tokens": usage.prompt_tokens,
            "output_tokens": usage.completion_tokens,
            "cost": cost["total_cost"]
        })
    
    def summary(self):
        """生成摘要报告"""
        return {
            "total_calls": len(self.calls),
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_cost": self.total_cost,
            "average_cost_per_call": self.total_cost / len(self.calls) if self.calls else 0
        }

# 使用示例
tracker = CostTracker()

# 每次调用后记录
response = client.chat.completions.create(...)
tracker.track(response.usage, "gpt-4o-mini")

# 查看摘要
print(tracker.summary())
```

## 小结

本章我们学习了：

1. **API 认证安全**：环境变量、.env 文件、安全最佳实践
2. **基础 API 调用**：OpenAI 和 Claude 的基础用法
3. **请求参数**：temperature、max_tokens、messages 等核心参数
4. **响应处理**：解析响应结构、获取内容和 Token 统计
5. **流式输出**：实时输出、回调函数、异步处理
6. **错误处理**：异常类型、重试机制、超时设置
7. **Token 管理**：计算、预算控制、截断处理
8. **成本控制**：成本计算、追踪器实现

## 实践练习

1. **基础练习**：编写一个简单的命令行聊天机器人
2. **流式输出**：实现一个带打字效果的 AI 对话界面
3. **错误处理**：实现一个健壮的 API 调用封装，包含重试和超时
4. **成本统计**：实现一个完整的成本追踪系统

## 参考资料

1. [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
2. [Anthropic API Reference](https://docs.anthropic.com/claude/reference)
3. [Production Best Practices - OpenAI](https://platform.openai.com/docs/guides/production-best-practices)
4. [tiktoken - Token 计算库](https://github.com/openai/tiktoken)

## 下一章预告

在下一章《Prompt Engineering 提示词工程》中，我们将深入学习：

- 提示词设计原则与框架
- Zero-shot、Few-shot、CoT 等高级技巧
- 结构化提示词与模板设计
- 提示词优化与调试方法

---

**教程系列持续更新中，欢迎关注！**
