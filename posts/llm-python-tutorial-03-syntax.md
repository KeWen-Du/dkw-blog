---
title: "大模型应用开发者 Python 必修课（三）：核心语法篇"
date: "2026-03-04 12:00:00"
excerpt: "深入掌握 Python 现代特性：推导式、生成器、装饰器、上下文管理器，这些都是大模型应用开发中不可或缺的核心技能。"
tags: ["Python", "生成器", "装饰器", "大模型开发"]
series:
  slug: "llm-python-tutorial"
  title: "大模型应用开发者 Python 必修课"
  order: 3
---

# 大模型应用开发者 Python 必修课（三）：核心语法篇

## 前言

在大模型应用开发中，数据处理、API 调用、资源管理等场景频繁使用 Python 的高级语法特性。理解并熟练运用这些特性，不仅能写出更简洁优雅的代码，还能显著提升程序的性能和可维护性。

本章将深入探讨 Python 的核心语法特性，每个特性都配有实际的大模型开发场景示例。

## 推导式（Comprehensions）

### 列表推导

列表推导是 Python 最具代表性的语法糖之一：

```python
# 基本语法
# [表达式 for 变量 in 可迭代对象 if 条件]

# 传统写法
squares = []
for i in range(10):
    squares.append(i ** 2)

# 列表推导
squares = [i ** 2 for i in range(10)]
# [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]

# 带条件的推导
even_squares = [i ** 2 for i in range(10) if i % 2 == 0]
# [0, 4, 16, 36, 64]
```

### 大模型开发实战：消息处理

```python
# 场景：处理 OpenAI API 返回的消息列表

# 原始数据
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"},
    {"role": "assistant", "content": "Hi there!"},
    {"role": "user", "content": "How are you?"},
]

# 提取所有用户消息
user_messages = [msg["content"] for msg in messages if msg["role"] == "user"]
# ["Hello!", "How are you?"]

# 转换为 OpenAI API 格式
api_messages = [
    {"role": msg["role"], "content": msg["content"]}
    for msg in messages
]
```

### 字典推导

```python
# 基本语法
# {键表达式: 值表达式 for 变量 in 可迭代对象 if 条件}

# 示例：创建词频字典
words = ["hello", "world", "hello", "python", "world", "hello"]
word_count = {word: words.count(word) for word in set(words)}
# {'hello': 3, 'world': 2, 'python': 1}

# 示例：键值互换
original = {"a": 1, "b": 2, "c": 3}
swapped = {v: k for k, v in original.items()}
# {1: 'a', 2: 'b', 3: 'c'}
```

### 大模型开发实战：模型配置映射

```python
# 场景：创建模型名称到价格的映射

models = [
    {"name": "gpt-4", "input_price": 0.03, "output_price": 0.06},
    {"name": "gpt-4-turbo", "input_price": 0.01, "output_price": 0.03},
    {"name": "gpt-3.5-turbo", "input_price": 0.0005, "output_price": 0.0015},
    {"name": "claude-3-opus", "input_price": 0.015, "output_price": 0.075},
]

# 创建名称到价格的快速查找字典
price_map = {
    model["name"]: {
        "input": model["input_price"],
        "output": model["output_price"],
    }
    for model in models
}

# 使用
price = price_map["gpt-4"]["input"]  # 0.03
```

### 集合推导

```python
# 基本语法
# {表达式 for 变量 in 可迭代对象 if 条件}

# 示例：提取唯一标签
articles = [
    {"title": "Python Guide", "tags": ["python", "tutorial"]},
    {"title": "LLM Tutorial", "tags": ["python", "llm", "tutorial"]},
    {"title": "AI News", "tags": ["ai", "news"]},
]

all_tags = {tag for article in articles for tag in article["tags"]}
# {'python', 'tutorial', 'llm', 'ai', 'news'}
```

### 嵌套推导

```python
# 扁平化二维列表
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
flattened = [num for row in matrix for num in row]
# [1, 2, 3, 4, 5, 6, 7, 8, 9]

# 等价于
flattened = []
for row in matrix:
    for num in row:
        flattened.append(num)
```

## 生成器与迭代器

### 为什么需要生成器？

当处理大量数据时，一次性加载所有数据到内存会导致内存溢出：

```python
# 问题代码：一次性加载所有数据
def load_all_messages(file_path: str) -> list[dict]:
    """加载所有消息到内存"""
    messages = []
    with open(file_path, "r") as f:
        for line in f:
            messages.append(json.loads(line))
    return messages

# 如果文件有 10GB，这会导致内存溢出！
```

### 生成器基础

生成器是一种惰性求值的迭代器，只在需要时才计算下一个值：

```python
# 生成器函数
def count_up_to(n: int):
    """生成 0 到 n-1 的数字"""
    i = 0
    while i < n:
        yield i
        i += 1

# 使用
counter = count_up_to(5)
print(next(counter))  # 0
print(next(counter))  # 1
print(next(counter))  # 2

# 遍历
for num in count_up_to(5):
    print(num)
# 0 1 2 3 4
```

### 生成器表达式

类似列表推导，但使用圆括号：

```python
# 列表推导：立即计算，占用内存
squares_list = [i ** 2 for i in range(1000000)]

# 生成器表达式：惰性计算，几乎不占内存
squares_gen = (i ** 2 for i in range(1000000))

# 检查内存占用
import sys
print(sys.getsizeof(squares_list))  # ~8MB
print(sys.getsizeof(squares_gen))   # ~112 bytes
```

### 大模型开发实战：流式数据处理

```python
# 场景：逐行处理大规模对话数据

import json
from typing import Iterator

def stream_messages(file_path: str) -> Iterator[dict]:
    """流式读取消息数据"""
    with open(file_path, "r") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)

def stream_embeddings(messages: Iterator[dict]) -> Iterator[tuple[str, list[float]]]:
    """流式生成嵌入向量"""
    for msg in messages:
        # 模拟调用嵌入 API
        embedding = get_embedding(msg["content"])
        yield (msg["id"], embedding)

# 使用：内存友好地处理大规模数据
messages = stream_messages("conversations.jsonl")
embeddings = stream_embeddings(messages)

for msg_id, embedding in embeddings:
    save_to_vector_db(msg_id, embedding)
```

### 生成器链式处理

```python
# 场景：多阶段数据处理管道

def read_lines(file_path: str) -> Iterator[str]:
    """读取文件行"""
    with open(file_path, "r") as f:
        for line in f:
            yield line.strip()

def filter_empty(lines: Iterator[str]) -> Iterator[str]:
    """过滤空行"""
    for line in lines:
        if line:
            yield line

def parse_json(lines: Iterator[str]) -> Iterator[dict]:
    """解析 JSON"""
    for line in lines:
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue

def filter_by_role(messages: Iterator[dict], role: str) -> Iterator[dict]:
    """按角色过滤"""
    for msg in messages:
        if msg.get("role") == role:
            yield msg

# 链式处理
pipeline = filter_by_role(
    parse_json(
        filter_empty(
            read_lines("messages.jsonl")
        )
    ),
    role="user"
)

for msg in pipeline:
    process_user_message(msg)
```

### itertools 模块

Python 内置的迭代器工具库：

```python
from itertools import chain, islice, cycle, count, batched

# chain：连接多个迭代器
list1 = [1, 2, 3]
list2 = [4, 5, 6]
chained = list(chain(list1, list2))  # [1, 2, 3, 4, 5, 6]

# islice：切片迭代器
first_five = list(islice(range(100), 5))  # [0, 1, 2, 3, 4]

# cycle：无限循环
colors = cycle(["red", "green", "blue"])
# next(colors) -> "red", "green", "blue", "red", ...

# count：无限计数器
for i, color in zip(count(), cycle(["A", "B"])):
    if i >= 5:
        break
    print(f"{i}: {color}")

# batched：批量处理（Python 3.12+）
data = range(10)
for batch in batched(data, 3):
    print(batch)
# (0, 1, 2), (3, 4, 5), (6, 7, 8), (9,)
```

### 大模型开发实战：批量 API 调用

```python
from itertools import islice, batched
from typing import Iterator

def batch_process_texts(
    texts: list[str],
    batch_size: int = 100
) -> Iterator[list[str]]:
    """批量处理文本"""
    # Python 3.12+ 使用 batched
    # for batch in batched(texts, batch_size):
    #     yield list(batch)

    # Python 3.10-3.11 兼容写法
    for i in range(0, len(texts), batch_size):
        yield texts[i:i + batch_size]

async def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """批量获取嵌入向量"""
    # 调用 OpenAI 嵌入 API
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=texts
    )
    return [item.embedding for item in response.data]

async def process_large_corpus(
    texts: list[str],
    batch_size: int = 100
) -> list[list[float]]:
    """处理大规模文本语料"""
    all_embeddings = []

    for batch in batch_process_texts(texts, batch_size):
        embeddings = await get_embeddings_batch(batch)
        all_embeddings.extend(embeddings)

    return all_embeddings
```

## 装饰器

### 装饰器基础

装饰器是一种在不修改函数代码的情况下，增强函数功能的机制：

```python
# 基本装饰器
def my_decorator(func):
    def wrapper(*args, **kwargs):
        print("函数调用前")
        result = func(*args, **kwargs)
        print("函数调用后")
        return result
    return wrapper

@my_decorator
def say_hello(name: str) -> str:
    return f"Hello, {name}!"

# 等价于
# say_hello = my_decorator(say_hello)

print(say_hello("World"))
# 输出：
# 函数调用前
# 函数调用后
# Hello, World!
```

### 保留函数元信息

使用 `functools.wraps` 保留原函数的元信息：

```python
from functools import wraps

def my_decorator(func):
    @wraps(func)  # 保留原函数的 __name__, __doc__ 等
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@my_decorator
def my_function():
    """这是我的函数"""
    pass

print(my_function.__name__)  # "my_function"（没有 @wraps 会是 "wrapper"）
print(my_function.__doc__)   # "这是我的函数"
```

### 大模型开发实战：API 调用计时

```python
import time
from functools import wraps
from typing import Callable, TypeVar, ParamSpec

P = ParamSpec("P")
T = TypeVar("T")

def timing_decorator(func: Callable[P, T]) -> Callable[P, T]:
    """测量函数执行时间的装饰器"""
    @wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        print(f"{func.__name__} 执行时间: {end_time - start_time:.4f}秒")
        return result
    return wrapper

@timing_decorator
def call_openai_api(prompt: str) -> str:
    """调用 OpenAI API"""
    # 模拟 API 调用
    time.sleep(1)
    return "API response"

# 使用
response = call_openai_api("Hello")
# 输出：call_openai_api 执行时间: 1.0012秒
```

### 带参数的装饰器

```python
from functools import wraps

def retry(max_attempts: int = 3, delay: float = 1.0):
    """重试装饰器工厂"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    if attempt < max_attempts - 1:
                        time.sleep(delay * (2 ** attempt))  # 指数退避
            raise last_error
        return wrapper
    return decorator

@retry(max_attempts=3, delay=1.0)
def call_api_with_retry(prompt: str) -> str:
    """带重试的 API 调用"""
    return call_openai_api(prompt)
```

### 异步装饰器

```python
import asyncio
from functools import wraps

def async_retry(max_attempts: int = 3, delay: float = 1.0):
    """异步重试装饰器"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(delay * (2 ** attempt))
            raise last_error
        return wrapper
    return decorator

@async_retry(max_attempts=3, delay=1.0)
async def async_call_api(prompt: str) -> str:
    """异步 API 调用"""
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json={"prompt": prompt}) as response:
            return await response.text()
```

### 类装饰器

```python
from dataclasses import dataclass
from functools import wraps

class RateLimiter:
    """速率限制装饰器"""

    def __init__(self, calls: int, period: float):
        self.calls = calls
        self.period = period
        self.timestamps: list[float] = []

    def __call__(self, func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            now = time.time()
            # 清理过期的时间戳
            self.timestamps = [t for t in self.timestamps if now - t < self.period]

            if len(self.timestamps) >= self.calls:
                wait_time = self.period - (now - self.timestamps[0])
                time.sleep(wait_time)

            self.timestamps.append(time.time())
            return func(*args, **kwargs)
        return wrapper

@RateLimiter(calls=10, period=60.0)  # 每分钟最多 10 次调用
def call_rate_limited_api(prompt: str) -> str:
    return call_openai_api(prompt)
```

### 大模型开发实战：缓存装饰器

```python
from functools import lru_cache, wraps
import hashlib
import json

def cache_llm_response(ttl: int = 3600):
    """LLM 响应缓存装饰器"""
    cache: dict[str, tuple[str, float]] = {}

    def decorator(func):
        @wraps(func)
        def wrapper(prompt: str, **kwargs) -> str:
            # 生成缓存键
            cache_key = hashlib.md5(
                json.dumps({"prompt": prompt, "kwargs": kwargs}, sort_keys=True).encode()
            ).hexdigest()

            # 检查缓存
            now = time.time()
            if cache_key in cache:
                response, timestamp = cache[cache_key]
                if now - timestamp < ttl:
                    print("缓存命中！")
                    return response

            # 调用函数
            result = func(prompt, **kwargs)
            cache[cache_key] = (result, now)
            return result

        return wrapper
    return decorator

@cache_llm_response(ttl=3600)  # 缓存 1 小时
def get_completion(prompt: str, model: str = "gpt-4") -> str:
    """获取 LLM 完成响应"""
    return call_openai_api(prompt)
```

## 上下文管理器

### with 语句基础

上下文管理器确保资源的正确获取和释放：

```python
# 传统写法
f = open("file.txt", "r")
try:
    content = f.read()
finally:
    f.close()

# 使用 with 语句
with open("file.txt", "r") as f:
    content = f.read()
# 文件自动关闭，即使在读取过程中发生异常
```

### 自定义上下文管理器（类）

```python
from typing import Self

class Timer:
    """计时上下文管理器"""

    def __init__(self, name: str = "Timer"):
        self.name = name
        self.start_time: float | None = None
        self.elapsed: float | None = None

    def __enter__(self) -> Self:
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.elapsed = time.perf_counter() - self.start_time
        print(f"{self.name} 耗时: {self.elapsed:.4f}秒")

# 使用
with Timer("API调用"):
    response = call_openai_api("Hello")
# 输出：API调用 耗时: 1.2345秒
```

### 自定义上下文管理器（contextmanager）

使用 `contextlib.contextmanager` 装饰器更简洁：

```python
from contextlib import contextmanager

@contextmanager
def timer(name: str = "Timer"):
    """计时上下文管理器"""
    start_time = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start_time
        print(f"{name} 耗时: {elapsed:.4f}秒")

# 使用
with timer("API调用"):
    response = call_openai_api("Hello")
```

### 大模型开发实战：API 客户端上下文

```python
from contextlib import asynccontextmanager
from typing import AsyncIterator

class LLMApiClient:
    """LLM API 客户端"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session: aiohttp.ClientSession | None = None
        self.request_count = 0

    async def __aenter__(self) -> Self:
        """进入异步上下文"""
        self.session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """退出异步上下文"""
        if self.session:
            await self.session.close()
        print(f"本次会话共调用 API {self.request_count} 次")

    async def chat(self, messages: list[dict]) -> str:
        """聊天接口"""
        self.request_count += 1
        # ... API 调用逻辑
        return "response"

# 使用
async def main():
    async with LLMApiClient(api_key="sk-xxx") as client:
        response1 = await client.chat([{"role": "user", "content": "Hello"}])
        response2 = await client.chat([{"role": "user", "content": "Hi"}])
    # 自动关闭连接，输出请求统计
```

### 常用上下文管理器

```python
from contextlib import suppress, redirect_stdout, redirect_stderr
import io

# suppress：忽略特定异常
with suppress(FileNotFoundError):
    os.remove("nonexistent_file.txt")  # 文件不存在也不会报错

# redirect_stdout：重定向标准输出
output = io.StringIO()
with redirect_stdout(output):
    print("这会被捕获")
captured = output.getvalue()  # "这会被捕获\n"

# 临时目录
import tempfile
with tempfile.TemporaryDirectory() as tmpdir:
    # 在临时目录中工作
    temp_file = os.path.join(tmpdir, "temp.txt")
    with open(temp_file, "w") as f:
        f.write("临时内容")
    # 退出 with 块后，临时目录自动删除
```

### 大模型开发实战：临时配置覆盖

```python
from contextlib import contextmanager
from typing import Iterator

class Config:
    """配置类"""
    temperature: float = 0.7
    max_tokens: int = 4096
    model: str = "gpt-4"

@contextmanager
def override_config(**kwargs) -> Iterator[None]:
    """临时覆盖配置"""
    # 保存原始值
    original = {k: getattr(Config, k) for k in kwargs if hasattr(Config, k)}

    # 设置新值
    for k, v in kwargs.items():
        setattr(Config, k, v)

    try:
        yield
    finally:
        # 恢复原始值
        for k, v in original.items():
            setattr(Config, k, v)

# 使用
print(Config.temperature)  # 0.7

with override_config(temperature=0.9, max_tokens=2048):
    print(Config.temperature)  # 0.9
    print(Config.max_tokens)   # 2048
    # 在此块中的 API 调用会使用临时配置

print(Config.temperature)  # 0.7（已恢复）
```

## 小结

本章我们学习了：

1. **推导式**：列表、字典、集合推导式，让代码更简洁
2. **生成器与迭代器**：惰性计算，高效处理大规模数据
3. **装饰器**：不修改原函数的情况下增强功能
4. **上下文管理器**：自动管理资源获取和释放

这些特性在大模型应用开发中的应用：

| 特性 | 应用场景 |
|------|---------|
| 推导式 | 消息处理、配置映射、数据转换 |
| 生成器 | 流式数据处理、大规模语料处理 |
| 装饰器 | 重试机制、缓存、计时、权限检查 |
| 上下文管理器 | API 连接管理、临时配置、资源清理 |

## 参考资料

1. [Python 推导式文档](https://docs.python.org/3/tutorial/datastructures.html#list-comprehensions)
2. [Python 生成器文档](https://docs.python.org/3/howto/functional.html#generators)
3. [Python 装饰器文档](https://docs.python.org/3/glossary.html#term-decorator)
4. [contextlib 文档](https://docs.python.org/3/library/contextlib.html)
5. [itertools 文档](https://docs.python.org/3/library/itertools.html)

## 下一章预告

在下一章《类型系统篇》中，我们将深入学习：

- Python 类型注解语法详解
- typing 模块的高级用法
- dataclass 数据类
- Pydantic 模型验证
- mypy 静态类型检查

---

**系列持续更新中，欢迎关注！**
