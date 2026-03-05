---
title: "大模型应用开发者 Python 必修课（九）：测试实践篇"
date: "2026-02-09"
excerpt: "掌握 pytest 测试框架、Mock 技术、异步代码测试和 API 测试实战，为大模型应用构建完整的测试体系。"
tags: ["Python", "pytest", "测试", "大模型开发"]
series:
  slug: "llm-python-tutorial"
  title: "大模型应用开发者 Python 必修课"
  order: 9
---

# 大模型应用开发者 Python 必修课（九）：测试实践篇

## 前言

在大模型应用开发中，测试是保障代码质量的关键环节。由于大模型 API 调用成本高、响应不确定，如何有效地测试 LLM 应用成为了一个独特的挑战。本章将介绍如何使用 pytest 构建完整的测试体系，包括 Mock 技术、异步测试和 API 测试实战。

## pytest 基础

### 安装和配置

```bash
# 安装 pytest 及相关插件
pip install pytest pytest-asyncio pytest-cov pytest-mock

# 创建配置文件 pytest.ini
```

```ini
# pytest.ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
asyncio_mode = auto
addopts = -v --tb=short
```

### 基本测试

```python
# tests/test_basic.py

def test_addition():
    """测试加法"""
    assert 1 + 1 == 2

def test_string_concat():
    """测试字符串连接"""
    result = "Hello" + " " + "World"
    assert result == "Hello World"

def test_list_operations():
    """测试列表操作"""
    items = [1, 2, 3]
    items.append(4)
    assert len(items) == 4
    assert 4 in items
```

### 参数化测试

```python
import pytest
from pydantic import ValidationError
from llm_app.models import ChatRequest

@pytest.mark.parametrize("temperature,expected_valid", [
    (0.0, True),    # 边界值
    (0.7, True),    # 正常值
    (2.0, True),    # 边界值
    (-0.1, False),  # 无效：负数
    (2.1, False),   # 无效：超出范围
])
def test_temperature_validation(temperature: float, expected_valid: bool):
    """测试 temperature 参数验证"""
    try:
        request = ChatRequest(
            messages=[{"role": "user", "content": "Hello"}],
            temperature=temperature,
        )
        assert expected_valid
    except ValidationError:
        assert not expected_valid

@pytest.mark.parametrize("model", [
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "claude-3-opus",
])
def test_supported_models(model: str):
    """测试支持的模型"""
    request = ChatRequest(
        model=model,
        messages=[{"role": "user", "content": "Test"}],
    )
    assert request.model == model
```

### Fixtures（测试夹具）

```python
import pytest
from llm_app.clients import OpenAIClient
from llm_app.config import Settings

@pytest.fixture
def settings():
    """测试配置"""
    return Settings(
        openai_api_key="test-key",
        model="gpt-4",
        temperature=0.7,
    )

@pytest.fixture
def client(settings):
    """测试客户端"""
    return OpenAIClient(settings)

@pytest.fixture
def mock_api_response():
    """模拟 API 响应"""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "This is a test response."
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 20,
            "total_tokens": 30
        }
    }

# 使用 fixture
def test_chat_completion(client, mock_api_response, mocker):
    """测试聊天完成"""
    # Mock API 调用
    mocker.patch.object(
        client,
        "_make_request",
        return_value=mock_api_response
    )

    result = client.chat([{"role": "user", "content": "Hello"}])

    assert result["content"] == "This is a test response."
    assert result["total_tokens"] == 30
```

## Mock 技术

### unittest.mock 基础

```python
from unittest.mock import Mock, patch, MagicMock

def test_mock_basic():
    """Mock 基础用法"""
    # 创建 Mock 对象
    mock_client = Mock()
    mock_client.chat.return_value = "Hello!"

    # 使用 Mock
    result = mock_client.chat("Hi")
    assert result == "Hello!"

    # 验证调用
    mock_client.chat.assert_called_once_with("Hi")

def test_mock_with_spec():
    """带规格的 Mock"""
    from llm_app.clients import OpenAIClient

    mock_client = Mock(spec=OpenAIClient)
    mock_client.chat.return_value = "Response"

    # 只能调用真实存在的方法
    result = mock_client.chat("Hello")
    assert result == "Response"

    # 这会抛出 AttributeError（因为 real_method 不存在）
    # mock_client.real_method()
```

### pytest-mock 插件

```python
import pytest

def test_with_mocker(mocker):
    """使用 pytest-mock"""
    # Mock 函数
    mock_json_loads = mocker.patch("json.loads")
    mock_json_loads.return_value = {"key": "value"}

    import json
    result = json.loads('{"key": "value"}')

    assert result == {"key": "value"}
    mock_json_loads.assert_called_once_with('{"key": "value"}')

def test_mock_class_method(mocker):
    """Mock 类方法"""
    from llm_app.services import ChatService

    # Mock 实例方法
    mock_chat = mocker.patch.object(
        ChatService,
        "get_completion",
        return_value="Mocked response"
    )

    service = ChatService()
    result = service.get_completion("Hello")

    assert result == "Mocked response"
    mock_chat.assert_called_once_with("Hello")

def test_mock_async_method(mocker):
    """Mock 异步方法"""
    from llm_app.clients import AsyncOpenAIClient

    # Mock 异步方法
    mock_chat = mocker.patch.object(
        AsyncOpenAIClient,
        "chat",
        return_value="Async response"
    )
    mock_chat.return_value = "Async response"

    client = AsyncOpenAIClient(api_key="test")
    # 注意：需要使用 await
```

### Mock API 调用

```python
import pytest
from unittest.mock import AsyncMock
import httpx

@pytest.fixture
def mock_httpx_client(mocker):
    """Mock httpx 客户端"""
    mock_client = mocker.patch("httpx.AsyncClient")

    # 配置响应
    mock_response = mocker.Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "id": "test-id",
        "choices": [{
            "message": {"content": "Test response"},
            "finish_reason": "stop"
        }],
        "usage": {"total_tokens": 30}
    }

    mock_client.return_value.__aenter__.return_value.post.return_value = mock_response
    return mock_client

async def test_api_call_with_mock(mock_httpx_client):
    """测试 API 调用（Mock HTTP 客户端）"""
    from llm_app.clients import AsyncOpenAIClient

    client = AsyncOpenAIClient(api_key="test-key")

    async with client:
        result = await client.chat([{"role": "user", "content": "Hello"}])

    assert result["content"] == "Test response"
```

## 异步测试

### pytest-asyncio

```python
import pytest
import asyncio

# 配置自动模式后，async 函数自动被识别为测试
async def test_async_function():
    """测试异步函数"""
    await asyncio.sleep(0.1)
    assert True

# 显式标记
@pytest.mark.asyncio
async def test_async_explicit():
    """显式标记的异步测试"""
    result = await some_async_function()
    assert result is not None
```

### 测试异步客户端

```python
import pytest
from unittest.mock import AsyncMock, patch
from llm_app.clients import AsyncOpenAIClient

@pytest.fixture
async def client():
    """异步客户端 fixture"""
    client = AsyncOpenAIClient(api_key="test-key")
    async with client:
        yield client

@pytest.mark.asyncio
async def test_async_chat(client, mocker):
    """测试异步聊天"""
    # Mock 响应
    mock_response = {
        "id": "test-id",
        "choices": [{
            "message": {"content": "Hello!"},
            "finish_reason": "stop"
        }],
        "usage": {"total_tokens": 20}
    }

    mocker.patch.object(
        client,
        "_make_request",
        new_callable=AsyncMock,
        return_value=mock_response
    )

    result = await client.chat([{"role": "user", "content": "Hi"}])
    assert result["content"] == "Hello!"

@pytest.mark.asyncio
async def test_concurrent_requests(mocker):
    """测试并发请求"""
    from llm_app.clients import AsyncOpenAIClient

    client = AsyncOpenAIClient(api_key="test-key")

    # Mock 响应
    mock_response = {"content": "Response", "total_tokens": 10}
    mocker.patch.object(
        client,
        "chat",
        new_callable=AsyncMock,
        return_value=mock_response
    )

    async with client:
        # 并发发送多个请求
        tasks = [
            client.chat([{"role": "user", "content": f"Message {i}"}])
            for i in range(10)
        ]
        results = await asyncio.gather(*tasks)

    assert len(results) == 10
    assert all(r["content"] == "Response" for r in results)
```

### 测试流式响应

```python
import pytest
from typing import AsyncIterator
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_stream_response(mocker):
    """测试流式响应"""
    from llm_app.clients import AsyncOpenAIClient

    async def mock_stream() -> AsyncIterator[str]:
        """模拟流式响应"""
        chunks = ["Hello", " ", "World", "!"]
        for chunk in chunks:
            yield chunk

    client = AsyncOpenAIClient(api_key="test-key")

    mocker.patch.object(
        client,
        "stream_chat",
        return_value=mock_stream()
    )

    async with client:
        result = []
        async for chunk in client.stream_chat([{"role": "user", "content": "Hi"}]):
            result.append(chunk)

    assert "".join(result) == "Hello World!"
```

## API 测试实战

### 测试 FastAPI 应用

```python
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
from llm_app.main import app

@pytest.fixture
def client():
    """同步测试客户端"""
    return TestClient(app)

@pytest.fixture
async def async_client():
    """异步测试客户端"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

def test_health_check(client):
    """测试健康检查"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_chat_endpoint(client, mocker):
    """测试聊天接口"""
    # Mock LLM 客户端
    mock_chat = mocker.patch("llm_app.services.ChatService.chat")
    mock_chat.return_value = {
        "content": "Test response",
        "total_tokens": 30,
    }

    response = client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "Hello"}],
            "model": "gpt-4",
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert "content" in data

@pytest.mark.asyncio
async def test_async_chat_endpoint(async_client, mocker):
    """测试异步聊天接口"""
    mock_chat = mocker.patch("llm_app.services.ChatService.chat")
    mock_chat.return_value = {"content": "Response", "total_tokens": 20}

    response = await async_client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "Hello"}],
        }
    )

    assert response.status_code == 200
```

### 集成测试

```python
import pytest
import httpx
from unittest.mock import AsyncMock

@pytest.mark.integration
@pytest.mark.asyncio
async def test_full_chat_flow():
    """完整的聊天流程集成测试"""
    async with httpx.AsyncClient() as client:
        # 1. 发送聊天请求
        response = await client.post(
            "http://localhost:8000/api/chat",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
                "model": "gpt-4",
            },
            timeout=30.0,
        )

        assert response.status_code == 200
        data = response.json()

        # 2. 验证响应格式
        assert "content" in data
        assert "total_tokens" in data

        # 3. 验证响应内容
        assert len(data["content"]) > 0
```

### 测试覆盖率

```bash
# 运行测试并生成覆盖率报告
pytest --cov=llm_app --cov-report=html --cov-report=term

# 配置 pyproject.toml
```

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = "-v --tb=short --cov=llm_app --cov-report=term-missing"

[tool.coverage.run]
source = ["llm_app"]
omit = ["tests/*", "*/__pycache__/*"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
]
```

## 测试最佳实践

### 测试组织结构

```
tests/
├── conftest.py           # 共享 fixtures
├── unit/                 # 单元测试
│   ├── test_models.py
│   ├── test_clients.py
│   └── test_services.py
├── integration/          # 集成测试
│   ├── test_api.py
│   └── test_chat_flow.py
└── e2e/                  # 端到端测试
    └── test_full_flow.py
```

### conftest.py 示例

```python
# tests/conftest.py
import pytest
from unittest.mock import AsyncMock
from llm_app.config import Settings
from llm_app.clients import AsyncOpenAIClient

@pytest.fixture
def settings():
    """测试配置"""
    return Settings(
        openai_api_key="test-api-key",
        model="gpt-4",
        temperature=0.7,
        max_tokens=100,
    )

@pytest.fixture
def mock_openai_response():
    """模拟 OpenAI 响应"""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "This is a test response."
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 20,
            "total_tokens": 30
        }
    }

@pytest.fixture
async def mock_client(settings, mock_openai_response, mocker):
    """Mock 客户端"""
    client = AsyncOpenAIClient(settings)

    mocker.patch.object(
        client,
        "_make_request",
        new_callable=AsyncMock,
        return_value=mock_openai_response
    )

    async with client:
        yield client

# 标记配置
def pytest_configure(config):
    config.addinivalue_line("markers", "integration: mark as integration test")
    config.addinivalue_line("markers", "slow: mark as slow test")
```

### 跳过和条件测试

```python
import pytest
import os

@pytest.mark.skip(reason="功能未实现")
def test_future_feature():
    pass

@pytest.mark.skipif(
    not os.getenv("OPENAI_API_KEY"),
    reason="需要设置 OPENAI_API_KEY"
)
def test_real_api_call():
    """测试真实 API 调用（需要 API 密钥）"""
    pass

@pytest.mark.slow
def test_long_running():
    """长时间运行的测试"""
    pass
```

## 小结

本章我们学习了：

1. **pytest 基础**：测试用例、参数化、Fixtures
2. **Mock 技术**：unittest.mock、pytest-mock
3. **异步测试**：pytest-asyncio、AsyncMock
4. **API 测试**：TestClient、集成测试、覆盖率

关键实践：

| 场景 | 推荐方案 |
|------|---------|
| 单元测试 | pytest + Mock |
| 异步测试 | pytest-asyncio |
| API 测试 | FastAPI TestClient |
| 覆盖率 | pytest-cov |
| CI 集成 | pytest + 覆盖率报告 |

## 参考资料

1. [pytest 官方文档](https://docs.pytest.org/)
2. [pytest-asyncio 文档](https://pytest-asyncio.readthedocs.io/)
3. [unittest.mock 文档](https://docs.python.org/3/library/unittest.mock.html)
4. [Testing FastAPI](https://fastapi.tiangolo.com/tutorial/testing/)

## 下一章预告

在下一章《工程化篇》中，我们将深入学习：

- 项目结构最佳实践
- 配置管理
- 代码格式化（Black、Ruff）
- 代码检查（mypy、ruff）
- 实战项目模板

---

**系列持续更新中，欢迎关注！**
