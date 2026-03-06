---
title: "大模型应用开发者 Python 必修课（六）：网络请求篇"
date: "2024-03-11"
excerpt: "掌握 HTTP 客户端的使用技巧，学习如何封装大模型 API 调用、处理重试和超时、实现流式响应，构建可靠的网络请求层。"
tags: ["Python", "HTTP", "网络请求", "大模型开发"]
series:
  slug: "llm-python-tutorial"
  title: "大模型应用开发者 Python 必修课"
  order: 6
---

# 大模型应用开发者 Python 必修课（六）：网络请求篇

## 前言

大模型应用开发的核心是与各种 API 进行交互：OpenAI、Anthropic、通义千问、文心一言等。理解 HTTP 请求的原理，掌握重试、超时、流式响应等高级技巧，是构建可靠应用的关键。

本章将深入探讨 Python 中 HTTP 客户端的使用，重点介绍如何为大模型 API 调用构建稳定的网络请求层。

## requests：同步 HTTP 客户端

### 基本用法

```python
import requests

# GET 请求
response = requests.get("https://api.example.com/models")
print(response.status_code)  # 200
print(response.json())       # 解析 JSON 响应

# POST 请求
response = requests.post(
    "https://api.openai.com/v1/chat/completions",
    headers={
        "Authorization": "Bearer sk-xxx",
        "Content-Type": "application/json",
    },
    json={
        "model": "gpt-4",
        "messages": [{"role": "user", "content": "Hello!"}],
    },
)
print(response.json())
```

### 请求配置

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# 创建带重试机制的 Session
def create_session(
    max_retries: int = 3,
    timeout: float = 30.0,
) -> requests.Session:
    """创建配置好的 Session"""
    session = requests.Session()

    # 配置重试策略
    retry_strategy = Retry(
        total=max_retries,
        backoff_factor=1.0,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    # 设置默认超时
    session.timeout = timeout

    return session

# 使用
session = create_session()
response = session.get("https://api.example.com/models")
```

### 大模型 API 调用封装

```python
import requests
from dataclasses import dataclass
from typing import Any
import json

@dataclass
class APIConfig:
    """API 配置"""
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    timeout: float = 30.0
    max_retries: int = 3

class OpenAIClient:
    """OpenAI API 客户端（同步版本）"""

    def __init__(self, config: APIConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        })

    def chat_completion(
        self,
        messages: list[dict],
        model: str = "gpt-4",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> dict:
        """聊天完成 API"""
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        response = self.session.post(
            f"{self.config.base_url}/chat/completions",
            json=payload,
            timeout=self.config.timeout,
        )

        response.raise_for_status()
        return response.json()

    def get_models(self) -> list[str]:
        """获取可用模型列表"""
        response = self.session.get(
            f"{self.config.base_url}/models",
            timeout=self.config.timeout,
        )
        response.raise_for_status()
        data = response.json()
        return [model["id"] for model in data["data"]]

    def close(self) -> None:
        """关闭客户端"""
        self.session.close()

    def __enter__(self) -> "OpenAIClient":
        return self

    def __exit__(self, *args) -> None:
        self.close()

# 使用
config = APIConfig(api_key="sk-xxx")
with OpenAIClient(config) as client:
    response = client.chat_completion(
        messages=[{"role": "user", "content": "Hello!"}],
        model="gpt-4",
    )
    print(response["choices"][0]["message"]["content"])
```

## httpx：现代异步 HTTP 客户端

### 为什么选择 httpx？

| 特性 | requests | httpx |
|------|---------|-------|
| 同步支持 | ✓ | ✓ |
| 异步支持 | ✗ | ✓ |
| HTTP/2 | ✗ | ✓ |
| 类型注解 | 部分 | 完整 |
| 现代化设计 | ✗ | ✓ |

### 基本用法

```python
import httpx

# 同步请求
with httpx.Client() as client:
    response = client.get("https://api.example.com/models")
    print(response.json())

# 异步请求
async def async_request():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com/models")
        print(response.json())
```

### 异步客户端详解

```python
import httpx
import asyncio
from typing import AsyncIterator

class AsyncOpenAIClient:
    """OpenAI API 客户端（异步版本）"""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 30.0,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "AsyncOpenAIClient":
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(self.timeout),
        )
        return self

    async def __aexit__(self, *args) -> None:
        if self._client:
            await self._client.aclose()

    async def chat_completion(
        self,
        messages: list[dict],
        model: str = "gpt-4",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> dict:
        """聊天完成 API"""
        response = await self._client.post(
            "/chat/completions",
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        return response.json()

    async def stream_chat(
        self,
        messages: list[dict],
        model: str = "gpt-4",
    ) -> AsyncIterator[str]:
        """流式聊天"""
        async with self._client.stream(
            "POST",
            "/chat/completions",
            json={
                "model": model,
                "messages": messages,
                "stream": True,
            },
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data != "[DONE]":
                        yield data

# 使用
async def main():
    async with AsyncOpenAIClient(api_key="sk-xxx") as client:
        # 非流式
        result = await client.chat_completion(
            messages=[{"role": "user", "content": "Hello!"}],
        )
        print(result["choices"][0]["message"]["content"])

        # 流式
        async for chunk in client.stream_chat(
            messages=[{"role": "user", "content": "Tell me a story"}],
        ):
            print(chunk, end="", flush=True)

asyncio.run(main())
```

## 重试机制

### 使用 tenacity 库

```python
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
import httpx
import logging

logger = logging.getLogger(__name__)

# 定义重试装饰器
def with_retry(max_attempts: int = 3):
    """重试装饰器"""
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((
            httpx.TimeoutException,
            httpx.NetworkError,
            httpx.HTTPStatusError,
        )),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )

class ResilientClient:
    """带重试机制的客户端"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "ResilientClient":
        self._client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=httpx.Timeout(30.0),
        )
        return self

    async def __aexit__(self, *args) -> None:
        if self._client:
            await self._client.aclose()

    @with_retry(max_attempts=3)
    async def chat(self, prompt: str) -> str:
        """带重试的聊天"""
        response = await self._client.post(
            "https://api.openai.com/v1/chat/completions",
            json={
                "model": "gpt-4",
                "messages": [{"role": "user", "content": prompt}],
            },
        )

        # 处理速率限制
        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 60))
            raise RateLimitError(retry_after=retry_after)

        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


class RateLimitError(Exception):
    """速率限制错误"""
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(f"Rate limited, retry after {retry_after}s")
```

### 自定义重试逻辑

```python
import httpx
import asyncio
from typing import TypeVar, Callable, Awaitable
from functools import wraps

T = TypeVar("T")

async def retry_with_backoff(
    func: Callable[..., Awaitable[T]],
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retryable_status_codes: set[int] = {429, 500, 502, 503, 504},
) -> T:
    """带指数退避的重试"""
    last_error: Exception | None = None

    for attempt in range(max_attempts):
        try:
            return await func()
        except httpx.HTTPStatusError as e:
            last_error = e
            if e.response.status_code not in retryable_status_codes:
                raise

            if attempt < max_attempts - 1:
                # 检查 Retry-After 头
                retry_after = e.response.headers.get("Retry-After")
                if retry_after:
                    delay = float(retry_after)
                else:
                    delay = min(base_delay * (2 ** attempt), max_delay)

                logger.warning(
                    f"请求失败 (状态码: {e.response.status_code}), "
                    f"{delay}秒后重试 (尝试 {attempt + 1}/{max_attempts})"
                )
                await asyncio.sleep(delay)
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_error = e
            if attempt < max_attempts - 1:
                delay = min(base_delay * (2 ** attempt), max_delay)
                logger.warning(f"网络错误, {delay}秒后重试")
                await asyncio.sleep(delay)

    raise last_error
```

## 流式响应处理

### SSE（Server-Sent Events）解析

```python
import httpx
import json
from typing import AsyncIterator
from dataclasses import dataclass

@dataclass
class StreamChunk:
    """流式响应块"""
    content: str
    finish_reason: str | None = None

class StreamingClient:
    """流式响应客户端"""

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def stream_chat(
        self,
        messages: list[dict],
        model: str = "gpt-4",
    ) -> AsyncIterator[StreamChunk]:
        """流式聊天"""
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                },
                timeout=httpx.Timeout(60.0),
            ) as response:
                async for line in response.aiter_lines():
                    chunk = self._parse_sse_line(line)
                    if chunk:
                        yield chunk

    def _parse_sse_line(self, line: str) -> StreamChunk | None:
        """解析 SSE 数据行"""
        if not line.startswith("data: "):
            return None

        data = line[6:]
        if data == "[DONE]":
            return None

        try:
            parsed = json.loads(data)
            delta = parsed["choices"][0].get("delta", {})
            content = delta.get("content", "")
            finish_reason = parsed["choices"][0].get("finish_reason")

            if content or finish_reason:
                return StreamChunk(content=content, finish_reason=finish_reason)
        except json.JSONDecodeError:
            pass

        return None

# 使用
async def main():
    client = StreamingClient(api_key="sk-xxx")

    full_response = ""
    async for chunk in client.stream_chat(
        messages=[{"role": "user", "content": "写一首诗"}],
    ):
        print(chunk.content, end="", flush=True)
        full_response += chunk.content

        if chunk.finish_reason:
            print(f"\n完成原因: {chunk.finish_reason}")

asyncio.run(main())
```

### 流式响应的回调模式

```python
from typing import Callable, Awaitable
from dataclasses import dataclass

@dataclass
class StreamCallbacks:
    """流式回调配置"""
    on_chunk: Callable[[str], Awaitable[None]] | None = None
    on_complete: Callable[[str], Awaitable[None]] | None = None
    on_error: Callable[[Exception], Awaitable[None]] | None = None

class CallbackStreamingClient:
    """带回调的流式客户端"""

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def stream_chat(
        self,
        messages: list[dict],
        callbacks: StreamCallbacks,
        model: str = "gpt-4",
    ) -> str:
        """带回调的流式聊天"""
        full_response = ""

        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": model,
                        "messages": messages,
                        "stream": True,
                    },
                ) as response:
                    async for line in response.aiter_lines():
                        chunk = self._parse_chunk(line)
                        if chunk:
                            full_response += chunk
                            if callbacks.on_chunk:
                                await callbacks.on_chunk(chunk)

            if callbacks.on_complete:
                await callbacks.on_complete(full_response)

        except Exception as e:
            if callbacks.on_error:
                await callbacks.on_error(e)
            raise

        return full_response

    def _parse_chunk(self, line: str) -> str:
        # 解析逻辑
        pass

# 使用
async def on_chunk(content: str):
    print(content, end="", flush=True)

async def on_complete(full_response: str):
    print(f"\n总长度: {len(full_response)}")

async def on_error(e: Exception):
    print(f"错误: {e}")

async def main():
    client = CallbackStreamingClient(api_key="sk-xxx")

    await client.stream_chat(
        messages=[{"role": "user", "content": "Hello"}],
        callbacks=StreamCallbacks(
            on_chunk=on_chunk,
            on_complete=on_complete,
            on_error=on_error,
        ),
    )

asyncio.run(main())
```

## 生产级 API 客户端

```python
import httpx
import asyncio
from dataclasses import dataclass, field
from typing import AsyncIterator, Any
from enum import Enum
import logging
import time

logger = logging.getLogger(__name__)

class Provider(Enum):
    """LLM 提供商"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE = "azure"

@dataclass
class ClientConfig:
    """客户端配置"""
    api_key: str
    provider: Provider = Provider.OPENAI
    base_url: str | None = None
    timeout: float = 30.0
    max_retries: int = 3
    max_concurrent: int = 10

    # 提供商默认 URL
    _default_urls: dict[Provider, str] = field(
        default_factory=lambda: {
            Provider.OPENAI: "https://api.openai.com/v1",
            Provider.ANTHROPIC: "https://api.anthropic.com/v1",
        },
        repr=False,
    )

    @property
    def effective_base_url(self) -> str:
        return self.base_url or self._default_urls.get(self.provider, "")

class ProductionLLMClient:
    """生产级 LLM 客户端"""

    def __init__(self, config: ClientConfig):
        self.config = config
        self._client: httpx.AsyncClient | None = None
        self._semaphore: asyncio.Semaphore | None = None
        self._request_count = 0

    async def __aenter__(self) -> "ProductionLLMClient":
        self._client = httpx.AsyncClient(
            base_url=self.config.effective_base_url,
            headers=self._build_headers(),
            timeout=httpx.Timeout(self.config.timeout),
            limits=httpx.Limits(max_connections=self.config.max_concurrent),
        )
        self._semaphore = asyncio.Semaphore(self.config.max_concurrent)
        return self

    async def __aexit__(self, *args) -> None:
        if self._client:
            await self._client.aclose()

    def _build_headers(self) -> dict[str, str]:
        """构建请求头"""
        headers = {"Content-Type": "application/json"}

        if self.config.provider == Provider.OPENAI:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        elif self.config.provider == Provider.ANTHROPIC:
            headers["x-api-key"] = self.config.api_key
            headers["anthropic-version"] = "2023-06-01"

        return headers

    async def chat(
        self,
        messages: list[dict],
        model: str = "gpt-4",
        **kwargs,
    ) -> dict:
        """聊天完成"""
        async with self._semaphore:
            return await self._request_with_retry(
                method="POST",
                endpoint="/chat/completions",
                payload={
                    "model": model,
                    "messages": messages,
                    **kwargs,
                },
            )

    async def stream_chat(
        self,
        messages: list[dict],
        model: str = "gpt-4",
        **kwargs,
    ) -> AsyncIterator[str]:
        """流式聊天"""
        async with self._semaphore:
            async for chunk in self._stream_request(
                endpoint="/chat/completions",
                payload={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    **kwargs,
                },
            ):
                yield chunk

    async def _request_with_retry(
        self,
        method: str,
        endpoint: str,
        payload: dict,
    ) -> dict:
        """带重试的请求"""
        last_error: Exception | None = None

        for attempt in range(self.config.max_retries):
            try:
                self._request_count += 1
                start_time = time.time()

                response = await self._client.request(
                    method,
                    endpoint,
                    json=payload,
                )

                # 处理速率限制
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    logger.warning(f"速率限制, {retry_after}秒后重试")
                    await asyncio.sleep(retry_after)
                    continue

                response.raise_for_status()

                elapsed = time.time() - start_time
                logger.debug(f"请求完成: {endpoint}, 耗时: {elapsed:.2f}s")

                return response.json()

            except httpx.HTTPStatusError as e:
                last_error = e
                if e.response.status_code < 500:
                    raise  # 客户端错误不重试

                delay = 2 ** attempt
                logger.warning(f"服务端错误, {delay}秒后重试")
                await asyncio.sleep(delay)

            except (httpx.TimeoutException, httpx.NetworkError) as e:
                last_error = e
                delay = 2 ** attempt
                logger.warning(f"网络错误, {delay}秒后重试")
                await asyncio.sleep(delay)

        raise last_error

    async def _stream_request(
        self,
        endpoint: str,
        payload: dict,
    ) -> AsyncIterator[str]:
        """流式请求"""
        async with self._client.stream(
            "POST",
            endpoint,
            json=payload,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    yield line[6:]

    @property
    def request_count(self) -> int:
        """获取请求计数"""
        return self._request_count

# 使用示例
async def main():
    config = ClientConfig(
        api_key="sk-xxx",
        provider=Provider.OPENAI,
        max_concurrent=5,
    )

    async with ProductionLLMClient(config) as client:
        # 非流式
        result = await client.chat(
            messages=[{"role": "user", "content": "Hello!"}],
            model="gpt-4",
        )
        print(result["choices"][0]["message"]["content"])

        # 流式
        async for chunk in client.stream_chat(
            messages=[{"role": "user", "content": "Tell me a story"}],
        ):
            print(chunk, end="", flush=True)

        print(f"\n总请求数: {client.request_count}")

asyncio.run(main())
```

## 小结

本章我们学习了：

1. **requests 同步客户端**：基本的 HTTP 请求和会话管理
2. **httpx 异步客户端**：现代化的同步/异步 HTTP 客户端
3. **重试机制**：使用 tenacity 实现指数退避重试
4. **流式响应**：SSE 解析和回调模式
5. **生产级客户端**：完整的 API 客户端封装

关键实践：

| 场景 | 推荐方案 |
|------|---------|
| 简单脚本 | requests |
| 异步应用 | httpx AsyncClient |
| 批量处理 | Semaphore + gather |
| 流式输出 | SSE + AsyncIterator |
| 生产环境 | 重试 + 超时 + 监控 |

## 参考资料

1. [requests 文档](https://requests.readthedocs.io/)
2. [httpx 文档](https://www.python-httpx.org/)
3. [tenacity 文档](https://tenacity.readthedocs.io/)
4. [OpenAI API 文档](https://platform.openai.com/docs/api-reference)

## 下一章预告

在下一章《数据处理篇》中，我们将深入学习：

- JSON 数据处理最佳实践
- 文件操作与路径处理
- 数据验证与转换
- 结构化数据解析
- 向量数据处理

---

**系列持续更新中，欢迎关注！**
