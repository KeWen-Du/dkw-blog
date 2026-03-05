---
title: "大模型应用开发者 Python 必修课（八）：错误处理篇"
date: "2026-03-04 17:00:00"
excerpt: "掌握 Python 异常处理最佳实践，学习日志记录配置、错误追踪与监控，构建生产级应用的健壮错误处理机制。"
tags: ["Python", "异常处理", "日志", "大模型开发"]
series:
  slug: "llm-python-tutorial"
  title: "大模型应用开发者 Python 必修课"
  order: 8
---

# 大模型应用开发者 Python 必修课（八）：错误处理篇

## 前言

在大模型应用开发中，错误处理是保障应用稳定性的关键。API 调用可能超时、速率限制可能触发、用户输入可能无效——完善的错误处理机制能让应用在异常情况下优雅降级，而不是直接崩溃。

本章将深入探讨 Python 异常处理和日志记录的最佳实践，帮助你构建健壮的大模型应用。

## 异常处理基础

### try-except 基本语法

```python
# 基本结构
try:
    result = risky_operation()
except SpecificError as e:
    # 处理特定错误
    handle_error(e)
except AnotherError:
    # 处理另一种错误
    pass
except Exception as e:
    # 捕获所有其他错误
    logger.exception("Unexpected error")
    raise
else:
    # 没有异常时执行
    process_result(result)
finally:
    # 无论是否异常都执行
    cleanup()
```

### 异常处理的最佳实践

```python
import httpx
import asyncio

# 错误示例：捕获过于宽泛
async def bad_example():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://api.example.com")
            return response.json()
    except Exception:  # 太宽泛！吞没了所有错误
        return None

# 正确示例：捕获特定异常
async def good_example():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://api.example.com")
            response.raise_for_status()  # 检查 HTTP 状态码
            return response.json()
    except httpx.TimeoutException:
        logger.warning("请求超时")
        raise TimeoutError("API 请求超时，请稍后重试")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise RateLimitError("API 速率限制，请稍后重试")
        elif e.response.status_code >= 500:
            raise ServerError("服务端错误，请稍后重试")
        else:
            raise
    except json.JSONDecodeError:
        raise DataError("API 响应格式错误")
```

### 多异常捕获

```python
# 捕获多个异常类型
try:
    result = parse_api_response(data)
except (ValueError, KeyError) as e:
    logger.error(f"数据解析错误: {e}")
    raise DataError(f"无效的数据格式: {e}")
except (httpx.TimeoutException, httpx.NetworkError) as e:
    logger.error(f"网络错误: {e}")
    raise NetworkError(f"网络请求失败: {e}")
```

### 异常链

```python
# 使用 raise from 保留原始异常信息
def process_user_input(data: dict) -> User:
    try:
        return User.model_validate(data)
    except ValidationError as e:
        raise ValueError("用户数据验证失败") from e

# 使用 raise from None 隐藏原始异常
def get_config(key: str) -> str:
    try:
        return os.environ[key]
    except KeyError:
        raise ConfigError(f"配置项 {key} 未设置") from None
```

## 自定义异常设计

### 异常层次结构

```python
from typing import Any

class LLMError(Exception):
    """LLM 应用基础异常"""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

    def __str__(self) -> str:
        if self.details:
            return f"{self.message} - 详情: {self.details}"
        return self.message

# API 相关异常
class APIError(LLMError):
    """API 调用异常基类"""
    pass

class RateLimitError(APIError):
    """速率限制异常"""

    def __init__(self, retry_after: int | None = None):
        self.retry_after = retry_after
        details = {"retry_after": retry_after} if retry_after else {}
        super().__init__("API 速率限制", details)

class AuthenticationError(APIError):
    """认证错误"""
    pass

class ServerError(APIError):
    """服务端错误"""
    pass

class TimeoutError(APIError):
    """超时错误"""
    pass

# 数据相关异常
class DataError(LLMError):
    """数据处理异常基类"""
    pass

class ValidationError(DataError):
    """数据验证错误"""
    pass

class ParseError(DataError):
    """解析错误"""
    pass

# 配置相关异常
class ConfigError(LLMError):
    """配置错误"""
    pass
```

### 带上下文的异常

```python
from dataclasses import dataclass, field
from typing import Any
from datetime import datetime
import uuid

@dataclass
class ErrorContext:
    """错误上下文"""
    request_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    user_id: str | None = None
    model: str | None = None
    tokens_used: int | None = None
    additional_info: dict[str, Any] = field(default_factory=dict)

class ContextualError(Exception):
    """带上下文的异常"""

    def __init__(
        self,
        message: str,
        context: ErrorContext | None = None,
        cause: Exception | None = None,
    ):
        self.message = message
        self.context = context or ErrorContext()
        self.cause = cause
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": self.message,
            "request_id": self.context.request_id,
            "timestamp": self.context.timestamp,
            "user_id": self.context.user_id,
            "model": self.context.model,
            "cause": str(self.cause) if self.cause else None,
        }

# 使用
async def call_llm(prompt: str, user_id: str) -> str:
    context = ErrorContext(user_id=user_id, model="gpt-4")

    try:
        return await api_client.chat(prompt)
    except httpx.TimeoutException as e:
        raise ContextualError(
            message="LLM API 调用超时",
            context=context,
            cause=e,
        )
```

## 日志记录

### logging 模块基础

```python
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("app.log"),
    ],
)

logger = logging.getLogger(__name__)

# 日志级别
logger.debug("调试信息")
logger.info("普通信息")
logger.warning("警告信息")
logger.error("错误信息")
logger.critical("严重错误")
```

### 生产级日志配置

```python
import logging
import logging.config
from pathlib import Path
from datetime import datetime

def setup_logging(
    log_dir: str = "logs",
    log_level: str = "INFO",
    enable_json: bool = False,
) -> None:
    """配置生产级日志"""

    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    # 日志格式
    standard_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    detailed_format = (
        "%(asctime)s - %(name)s - %(levelname)s - "
        "%(filename)s:%(lineno)d - %(message)s"
    )

    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {"format": standard_format},
            "detailed": {"format": detailed_format},
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": log_level,
                "formatter": "standard",
                "stream": "ext://sys.stdout",
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "INFO",
                "formatter": "detailed",
                "filename": str(log_path / "app.log"),
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5,
            },
            "error_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "ERROR",
                "formatter": "detailed",
                "filename": str(log_path / "error.log"),
                "maxBytes": 10485760,
                "backupCount": 5,
            },
        },
        "loggers": {
            "": {
                "handlers": ["console", "file", "error_file"],
                "level": log_level,
                "propagate": True,
            },
            "httpx": {
                "level": "WARNING",  # 降低第三方库日志级别
            },
            "openai": {
                "level": "WARNING",
            },
        },
    }

    logging.config.dictConfig(config)

# 使用
setup_logging(log_level="DEBUG")
logger = logging.getLogger(__name__)
```

### 结构化日志

```python
import logging
import json
from dataclasses import dataclass, asdict
from typing import Any
from datetime import datetime

@dataclass
class StructuredLog:
    """结构化日志"""
    timestamp: str
    level: str
    message: str
    logger: str
    extra: dict[str, Any]

    def to_json(self) -> str:
        return json.dumps(asdict(self))

class StructuredFormatter(logging.Formatter):
    """结构化日志格式化器"""

    def format(self, record: logging.LogRecord) -> str:
        log = StructuredLog(
            timestamp=datetime.utcnow().isoformat(),
            level=record.levelname,
            message=record.getMessage(),
            logger=record.name,
            extra=getattr(record, "extra", {}),
        )
        return log.to_json()

# 配置结构化日志
def setup_structured_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(StructuredFormatter())

    logger = logging.getLogger()
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# 使用
def process_request(request_id: str, prompt: str):
    logger = logging.getLogger(__name__)
    logger.info(
        "Processing request",
        extra={"extra": {"request_id": request_id, "prompt_length": len(prompt)}},
    )
```

### 大模型开发实战：请求追踪日志

```python
import logging
from dataclasses import dataclass, field
from typing import Any
from datetime import datetime
from contextvars import ContextVar
import uuid

# 请求上下文
request_context: ContextVar[dict] = ContextVar("request_context", default={})

@dataclass
class RequestLogger:
    """请求日志记录器"""

    request_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    start_time: float = field(default_factory=lambda: datetime.now().timestamp())
    events: list[dict] = field(default_factory=list)

    def log_event(
        self,
        event_type: str,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        """记录事件"""
        event = {
            "timestamp": datetime.now().isoformat(),
            "event_type": event_type,
            "message": message,
            "data": data or {},
        }
        self.events.append(event)

    def log_api_call(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        latency: float,
    ) -> None:
        """记录 API 调用"""
        self.log_event(
            event_type="api_call",
            message=f"Called {model}",
            data={
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "latency": latency,
            },
        )

    def log_error(self, error: Exception) -> None:
        """记录错误"""
        self.log_event(
            event_type="error",
            message=str(error),
            data={"error_type": type(error).__name__},
        )

    def finalize(self) -> dict:
        """完成并返回日志"""
        end_time = datetime.now().timestamp()
        return {
            "request_id": self.request_id,
            "duration": end_time - self.start_time,
            "events": self.events,
        }

# 使用装饰器
def with_request_logging(func):
    """请求日志装饰器"""
    logger = logging.getLogger(__name__)

    async def wrapper(*args, **kwargs):
        request_logger = RequestLogger()
        request_context.set({"logger": request_logger})

        try:
            result = await func(*args, **kwargs)
            request_logger.log_event("success", "Request completed")
            return result
        except Exception as e:
            request_logger.log_error(e)
            raise
        finally:
            log_data = request_logger.finalize()
            logger.info("Request completed", extra={"extra": log_data})

    return wrapper
```

## 错误处理策略

### 重试策略

```python
import asyncio
from functools import wraps
from typing import Callable, TypeVar, ParamSpec
from dataclasses import dataclass

P = ParamSpec("P")
T = TypeVar("T")

@dataclass
class RetryConfig:
    """重试配置"""
    max_attempts: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    retryable_exceptions: tuple[type[Exception], ...] = (Exception,)

def with_retry(config: RetryConfig):
    """重试装饰器"""
    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @wraps(func)
        async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            last_error: Exception | None = None

            for attempt in range(config.max_attempts):
                try:
                    return await func(*args, **kwargs)
                except config.retryable_exceptions as e:
                    last_error = e
                    if attempt < config.max_attempts - 1:
                        delay = min(
                            config.base_delay * (config.exponential_base ** attempt),
                            config.max_delay,
                        )
                        logger.warning(
                            f"Attempt {attempt + 1} failed: {e}, "
                            f"retrying in {delay:.1f}s"
                        )
                        await asyncio.sleep(delay)

            raise last_error

        @wraps(func)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            last_error: Exception | None = None

            for attempt in range(config.max_attempts):
                try:
                    return func(*args, **kwargs)
                except config.retryable_exceptions as e:
                    last_error = e
                    if attempt < config.max_attempts - 1:
                        delay = min(
                            config.base_delay * (config.exponential_base ** attempt),
                            config.max_delay,
                        )
                        logger.warning(
                            f"Attempt {attempt + 1} failed: {e}, "
                            f"retrying in {delay:.1f}s"
                        )
                        time.sleep(delay)

            raise last_error

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper

    return decorator

# 使用
@with_retry(RetryConfig(
    max_attempts=3,
    retryable_exceptions=(httpx.TimeoutException, RateLimitError),
))
async def call_api(prompt: str) -> str:
    return await client.chat(prompt)
```

### 降级策略

```python
from typing import Callable, TypeVar, Any
from functools import wraps

T = TypeVar("T")

def with_fallback(
    fallback: Callable[..., T] | T,
    exceptions: tuple[type[Exception], ...] = (Exception,),
):
    """降级装饰器"""
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> T:
            try:
                return await func(*args, **kwargs)
            except exceptions as e:
                logger.warning(f"{func.__name__} failed, using fallback: {e}")
                if callable(fallback):
                    return fallback(*args, **kwargs)
                return fallback

        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> T:
            try:
                return func(*args, **kwargs)
            except exceptions as e:
                logger.warning(f"{func.__name__} failed, using fallback: {e}")
                if callable(fallback):
                    return fallback(*args, **kwargs)
                return fallback

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper

    return decorator

# 使用
def get_cached_response(prompt: str) -> str:
    return "缓存的响应"

@with_fallback(get_cached_response, exceptions=(APIError, TimeoutError))
async def get_completion(prompt: str) -> str:
    return await api_client.chat(prompt)
```

### 熔断器模式

```python
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Callable, TypeVar

class CircuitState(Enum):
    """熔断器状态"""
    CLOSED = "closed"       # 正常
    OPEN = "open"           # 熔断
    HALF_OPEN = "half_open" # 半开

@dataclass
class CircuitBreaker:
    """熔断器"""

    failure_threshold: int = 5
    recovery_timeout: float = 60.0
    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    last_failure_time: datetime | None = None

    def can_execute(self) -> bool:
        """检查是否可以执行"""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            # 检查是否可以进入半开状态
            if self.last_failure_time:
                elapsed = (datetime.now() - self.last_failure_time).total_seconds()
                if elapsed >= self.recovery_timeout:
                    self.state = CircuitState.HALF_OPEN
                    return True
            return False

        # HALF_OPEN
        return True

    def record_success(self) -> None:
        """记录成功"""
        self.failure_count = 0
        self.state = CircuitState.CLOSED

    def record_failure(self) -> None:
        """记录失败"""
        self.failure_count += 1
        self.last_failure_time = datetime.now()

        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN

def with_circuit_breaker(breaker: CircuitBreaker):
    """熔断器装饰器"""
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not breaker.can_execute():
                raise CircuitOpenError("Circuit breaker is open")

            try:
                result = await func(*args, **kwargs)
                breaker.record_success()
                return result
            except Exception as e:
                breaker.record_failure()
                raise

        return wrapper
    return decorator

class CircuitOpenError(Exception):
    """熔断器打开异常"""
    pass
```

## 小结

本章我们学习了：

1. **异常处理基础**：try-except、异常链、多异常捕获
2. **自定义异常**：异常层次结构、带上下文的异常
3. **日志记录**：logging 模块、结构化日志、请求追踪
4. **错误处理策略**：重试、降级、熔断器

关键实践：

| 场景 | 推荐方案 |
|------|---------|
| API 调用 | 重试 + 超时 |
| 速率限制 | 指数退避 |
| 服务不可用 | 熔断器 + 降级 |
| 数据验证 | 自定义异常 |
| 生产环境 | 结构化日志 + 错误追踪 |

## 参考资料

1. [Python exceptions 文档](https://docs.python.org/3/tutorial/errors.html)
2. [Python logging 文档](https://docs.python.org/3/library/logging.html)
3. [Tenacity 重试库](https://tenacity.readthedocs.io/)
4. [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)

## 下一章预告

在下一章《测试实践篇》中，我们将深入学习：

- pytest 测试框架
- 单元测试与集成测试
- Mock 和测试替身
- 异步代码测试
- API 测试实战

---

**系列持续更新中，欢迎关注！**
