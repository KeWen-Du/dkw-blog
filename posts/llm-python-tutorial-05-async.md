---
title: "大模型应用开发者 Python 必修课（五）：异步编程篇"
date: "2026-02-05"
excerpt: "掌握 Python 异步编程核心技能：asyncio、async/await、并发控制，高效处理大模型 API 的并发调用场景。"
tags: ["Python", "asyncio", "异步编程", "大模型开发"]
series:
  slug: "llm-python-tutorial"
  title: "大模型应用开发者 Python 必修课"
  order: 5
---

# 大模型应用开发者 Python 必修课（五）：异步编程篇

## 前言

在大模型应用开发中，异步编程是一项必备技能。调用 OpenAI、Anthropic 等 API 通常需要等待网络响应，如果使用同步方式，每次调用都会阻塞程序。通过异步编程，我们可以同时发起多个 API 请求，显著提升应用的吞吐量和响应速度。

本章将深入讲解 Python 异步编程的核心概念和实践技巧。

## 同步 vs 异步

### 同步编程的问题

```python
import time
import requests

def call_api(prompt: str) -> str:
    """同步 API 调用"""
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        json={"model": "gpt-4", "messages": [{"role": "user", "content": prompt}]},
        headers={"Authorization": "Bearer sk-xxx"},
    )
    return response.json()["choices"][0]["message"]["content"]

def process_prompts(prompts: list[str]) -> list[str]:
    """顺序处理多个 prompt"""
    results = []
    for prompt in prompts:
        result = call_api(prompt)  # 每次调用阻塞约 2 秒
        results.append(result)
    return results

# 测试：处理 10 个 prompt
start = time.time()
prompts = ["Hello"] * 10
results = process_prompts(prompts)
print(f"耗时: {time.time() - start:.2f}秒")
# 输出：耗时: 20.00秒（10 次调用 × 2 秒/次）
```

### 异步编程的优势

```python
import asyncio
import aiohttp
import time

async def call_api_async(session: aiohttp.ClientSession, prompt: str) -> str:
    """异步 API 调用"""
    async with session.post(
        "https://api.openai.com/v1/chat/completions",
        json={"model": "gpt-4", "messages": [{"role": "user", "content": prompt}]},
        headers={"Authorization": "Bearer sk-xxx"},
    ) as response:
        data = await response.json()
        return data["choices"][0]["message"]["content"]

async def process_prompts_async(prompts: list[str]) -> list[str]:
    """并发处理多个 prompt"""
    async with aiohttp.ClientSession() as session:
        tasks = [call_api_async(session, prompt) for prompt in prompts]
        results = await asyncio.gather(*tasks)
    return results

# 测试：处理 10 个 prompt
async def main():
    start = time.time()
    prompts = ["Hello"] * 10
    results = await process_prompts_async(prompts)
    print(f"耗时: {time.time() - start:.2f}秒")
    # 输出：耗时: 2.50秒（10 个请求并发执行）

asyncio.run(main())
```

## asyncio 基础

### 事件循环

事件循环是 asyncio 的核心，它负责调度和执行异步任务：

```python
import asyncio

# 获取当前事件循环
loop = asyncio.get_event_loop()

# 运行协程（Python 3.7+ 推荐方式）
asyncio.run(my_coroutine())

# 等价于
loop = asyncio.get_event_loop()
loop.run_until_complete(my_coroutine())
loop.close()
```

### 协程（Coroutine）

协程是使用 `async def` 定义的函数，它可以暂停和恢复执行：

```python
import asyncio

# 定义协程
async def say_hello(name: str, delay: float) -> str:
    """异步打招呼"""
    print(f"开始: {name}")
    await asyncio.sleep(delay)  # 模拟异步操作
    print(f"结束: {name}")
    return f"Hello, {name}!"

# 调用协程（不能直接调用，必须使用 await 或 asyncio.run）
async def main():
    # 方式 1：直接 await
    result = await say_hello("World", 1.0)
    print(result)

    # 方式 2：创建任务并发执行
    task = asyncio.create_task(say_hello("Python", 1.0))
    # 可以做其他事情...
    result = await task
    print(result)

asyncio.run(main())
```

### await 关键字

`await` 用于等待一个可等待对象（协程、Task、Future）完成：

```python
import asyncio

async def fetch_data(url: str) -> dict:
    """模拟获取数据"""
    await asyncio.sleep(1)  # 模拟网络延迟
    return {"url": url, "data": "response"}

async def main():
    # await 会暂停当前协程，直到操作完成
    result = await fetch_data("https://api.example.com")
    print(result)

asyncio.run(main())
```

### async with 异步上下文管理器

```python
import asyncio
from contextlib import asynccontextmanager

# 自定义异步上下文管理器
class AsyncTimer:
    def __init__(self, name: str):
        self.name = name
        self.start_time: float | None = None

    async def __aenter__(self) -> "AsyncTimer":
        self.start_time = asyncio.get_event_loop().time()
        return self

    async def __aexit__(self, *args) -> None:
        elapsed = asyncio.get_event_loop().time() - self.start_time
        print(f"{self.name} 耗时: {elapsed:.2f}秒")

# 使用
async def main():
    async with AsyncTimer("API调用"):
        await asyncio.sleep(1)

asyncio.run(main())
# 输出：API调用 耗时: 1.00秒
```

## 并发控制

### asyncio.gather：并发执行多个任务

```python
import asyncio

async def call_api(name: str, delay: float) -> str:
    """模拟 API 调用"""
    print(f"调用 {name}...")
    await asyncio.sleep(delay)
    print(f"{name} 完成")
    return f"{name} 的结果"

async def main():
    # 并发执行多个任务
    results = await asyncio.gather(
        call_api("API-1", 1.0),
        call_api("API-2", 2.0),
        call_api("API-3", 1.5),
    )
    print(f"结果: {results}")

asyncio.run(main())
# 输出（注意执行顺序是并发的）：
# 调用 API-1...
# 调用 API-2...
# 调用 API-3...
# API-1 完成
# API-3 完成
# API-2 完成
# 结果: ['API-1 的结果', 'API-2 的结果', 'API-3 的结果']
```

### asyncio.create_task：创建后台任务

```python
import asyncio

async def background_task(name: str) -> str:
    """后台任务"""
    await asyncio.sleep(2)
    return f"{name} 完成"

async def main():
    # 创建后台任务（立即返回，不等待）
    task = asyncio.create_task(background_task("后台任务"))

    # 可以做其他事情
    print("主任务继续执行...")
    await asyncio.sleep(1)
    print("主任务完成")

    # 等待后台任务完成
    result = await task
    print(result)

asyncio.run(main())
```

### 信号量：限制并发数

在大模型 API 调用中，通常需要限制并发数以避免触发速率限制：

```python
import asyncio
from asyncio import Semaphore

class RateLimitedClient:
    """带并发限制的客户端"""

    def __init__(self, max_concurrent: int = 10):
        self.semaphore = Semaphore(max_concurrent)

    async def call_api(self, prompt: str) -> str:
        """带并发限制的 API 调用"""
        async with self.semaphore:
            # 同时最多有 max_concurrent 个请求在执行
            return await self._make_request(prompt)

    async def _make_request(self, prompt: str) -> str:
        """实际发起请求"""
        await asyncio.sleep(1)  # 模拟网络请求
        return f"Response for: {prompt}"

async def main():
    client = RateLimitedClient(max_concurrent=3)  # 最多 3 个并发

    # 创建 10 个任务，但最多同时执行 3 个
    prompts = [f"Prompt {i}" for i in range(10)]
    tasks = [client.call_api(prompt) for prompt in prompts]

    results = await asyncio.gather(*tasks)
    print(f"处理了 {len(results)} 个请求")

asyncio.run(main())
```

### asyncio.wait_for：超时控制

```python
import asyncio

async def slow_api_call() -> str:
    """慢速 API 调用"""
    await asyncio.sleep(10)
    return "响应"

async def main():
    try:
        # 设置 3 秒超时
        result = await asyncio.wait_for(slow_api_call(), timeout=3.0)
        print(result)
    except asyncio.TimeoutError:
        print("请求超时！")

asyncio.run(main())
```

### asyncio.as_completed：按完成顺序处理

```python
import asyncio

async def call_api(name: str, delay: float) -> tuple[str, str]:
    """模拟 API 调用"""
    await asyncio.sleep(delay)
    return (name, f"{name} 的结果")

async def main():
    tasks = [
        asyncio.create_task(call_api("API-1", 3.0)),
        asyncio.create_task(call_api("API-2", 1.0)),
        asyncio.create_task(call_api("API-3", 2.0)),
    ]

    # 按完成顺序处理结果
    for coro in asyncio.as_completed(tasks):
        name, result = await coro
        print(f"收到 {name} 的结果: {result}")

asyncio.run(main())
# 输出（按完成顺序，而非创建顺序）：
# 收到 API-2 的结果: API-2 的结果
# 收到 API-3 的结果: API-3 的结果
# 收到 API-1 的结果: API-1 的结果
```

## 大模型开发实战：并发 API 调用

### 完整的并发客户端

```python
import asyncio
import aiohttp
from pydantic import BaseModel
from typing import AsyncIterator
from dataclasses import dataclass

@dataclass
class RateLimitConfig:
    """速率限制配置"""
    max_concurrent: int = 10
    requests_per_minute: int = 60
    tokens_per_minute: int = 90000

class ChatMessage(BaseModel):
    role: str
    content: str

class ConcurrentLLMClient:
    """并发 LLM 客户端"""

    def __init__(
        self,
        api_key: str,
        rate_limit: RateLimitConfig | None = None,
    ):
        self.api_key = api_key
        self.rate_limit = rate_limit or RateLimitConfig()
        self.semaphore = asyncio.Semaphore(self.rate_limit.max_concurrent)
        self.session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> "ConcurrentLLMClient":
        self.session = aiohttp.ClientSession(
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
        )
        return self

    async def __aexit__(self, *args) -> None:
        if self.session:
            await self.session.close()

    async def chat(
        self,
        messages: list[ChatMessage],
        model: str = "gpt-4",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        """带并发限制的聊天 API 调用"""
        async with self.semaphore:
            return await self._make_request(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

    async def _make_request(
        self,
        messages: list[ChatMessage],
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """实际发起请求"""
        payload = {
            "model": model,
            "messages": [m.model_dump() for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        async with self.session.post(
            "https://api.openai.com/v1/chat/completions",
            json=payload,
        ) as response:
            data = await response.json()
            return data["choices"][0]["message"]["content"]

    async def batch_chat(
        self,
        prompts: list[str],
        model: str = "gpt-4",
        temperature: float = 0.7,
    ) -> list[str]:
        """批量处理多个 prompt"""
        tasks = [
            self.chat(
                messages=[ChatMessage(role="user", content=prompt)],
                model=model,
                temperature=temperature,
            )
            for prompt in prompts
        ]
        return await asyncio.gather(*tasks)

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str = "gpt-4",
    ) -> AsyncIterator[str]:
        """流式聊天"""
        payload = {
            "model": model,
            "messages": [m.model_dump() for m in messages],
            "stream": True,
        }

        async with self.session.post(
            "https://api.openai.com/v1/chat/completions",
            json=payload,
        ) as response:
            async for line in response.content:
                if line:
                    # 解析 SSE 数据
                    yield line.decode()

# 使用示例
async def main():
    async with ConcurrentLLMClient(
        api_key="sk-xxx",
        rate_limit=RateLimitConfig(max_concurrent=5),
    ) as client:
        # 批量处理
        prompts = [
            "什么是人工智能？",
            "什么是机器学习？",
            "什么是深度学习？",
        ]
        results = await client.batch_chat(prompts)
        for prompt, result in zip(prompts, results):
            print(f"Q: {prompt}")
            print(f"A: {result}\n")

asyncio.run(main())
```

### 带重试的并发调用

```python
import asyncio
import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential

class ResilientLLMClient:
    """带重试机制的 LLM 客户端"""

    def __init__(self, api_key: str, max_retries: int = 3):
        self.api_key = api_key
        self.max_retries = max_retries
        self.session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> "ResilientLLMClient":
        self.session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        return self

    async def __aexit__(self, *args) -> None:
        if self.session:
            await self.session.close()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def chat(self, prompt: str) -> str:
        """带重试的聊天 API"""
        async with self.session.post(
            "https://api.openai.com/v1/chat/completions",
            json={
                "model": "gpt-4",
                "messages": [{"role": "user", "content": prompt}],
            },
        ) as response:
            if response.status == 429:
                # 速率限制，触发重试
                raise aiohttp.ClientResponseError(
                    request_info=None,
                    history=None,
                    status=429,
                )
            response.raise_for_status()
            data = await response.json()
            return data["choices"][0]["message"]["content"]
```

### 生产级：完整的并发处理框架

```python
import asyncio
import aiohttp
from dataclasses import dataclass
from typing import Callable, Awaitable, TypeVar
from asyncio import Semaphore, Queue
import time

T = TypeVar("T")

@dataclass
class WorkerPoolConfig:
    """工作池配置"""
    max_concurrent: int = 10
    max_retries: int = 3
    timeout: float = 30.0

class AsyncWorkerPool:
    """异步工作池"""

    def __init__(self, config: WorkerPoolConfig):
        self.config = config
        self.semaphore = Semaphore(config.max_concurrent)
        self.queue: Queue = Queue()
        self.results: dict[int, asyncio.Future] = {}
        self.task_id = 0
        self.workers: list[asyncio.Task] = []

    async def start(self, num_workers: int = 5) -> None:
        """启动工作线程"""
        self.workers = [
            asyncio.create_task(self._worker(i))
            for i in range(num_workers)
        ]

    async def stop(self) -> None:
        """停止工作线程"""
        for _ in self.workers:
            await self.queue.put(None)  # 发送停止信号
        await asyncio.gather(*self.workers)

    async def submit(
        self,
        func: Callable[..., Awaitable[T]],
        *args,
        **kwargs,
    ) -> T:
        """提交任务"""
        self.task_id += 1
        task_id = self.task_id

        future = asyncio.get_event_loop().create_future()
        self.results[task_id] = future

        await self.queue.put((task_id, func, args, kwargs))
        return await future

    async def _worker(self, worker_id: int) -> None:
        """工作线程"""
        while True:
            item = await self.queue.get()
            if item is None:
                break

            task_id, func, args, kwargs = item

            async with self.semaphore:
                try:
                    result = await asyncio.wait_for(
                        func(*args, **kwargs),
                        timeout=self.config.timeout,
                    )
                    self.results[task_id].set_result(result)
                except Exception as e:
                    self.results[task_id].set_exception(e)

# 使用示例
async def call_llm(prompt: str) -> str:
    """调用 LLM API"""
    await asyncio.sleep(1)  # 模拟网络请求
    return f"Response for: {prompt}"

async def main():
    pool = AsyncWorkerPool(WorkerPoolConfig(max_concurrent=5))
    await pool.start(num_workers=3)

    # 提交多个任务
    prompts = [f"Prompt {i}" for i in range(10)]
    tasks = [pool.submit(call_llm, prompt) for prompt in prompts]
    results = await asyncio.gather(*tasks)

    print(f"处理了 {len(results)} 个请求")

    await pool.stop()

asyncio.run(main())
```

## 小结

本章我们学习了：

1. **同步 vs 异步**：理解异步编程的性能优势
2. **asyncio 基础**：事件循环、协程、await 关键字
3. **并发控制**：gather、create_task、信号量、超时控制
4. **实战应用**：并发 API 调用、重试机制、工作池

异步编程在大模型开发中的关键应用：

| 场景 | 技术 |
|------|------|
| 批量 API 调用 | asyncio.gather + Semaphore |
| 流式响应处理 | async for + AsyncIterator |
| 速率限制控制 | Semaphore + Queue |
| 超时和重试 | wait_for + tenacity |

## 参考资料

1. [Python asyncio 文档](https://docs.python.org/3/library/asyncio.html)
2. [aiohttp 官方文档](https://docs.aiohttp.org/)
3. [Tenacity 重试库](https://github.com/jd/tenacity)
4. [Async IO in Python: A Complete Walkthrough](https://realpython.com/async-io-python/)

## 下一章预告

在下一章《网络请求篇》中，我们将深入学习：

- requests 同步 HTTP 客户端
- httpx 异步 HTTP 客户端
- 大模型 API 调用封装最佳实践
- 重试机制与超时处理
- 流式响应处理

---

**系列持续更新中，欢迎关注！**
