---
title: "大模型应用开发者 Python 必修课（十）：工程化篇"
date: "2026-02-10"
excerpt: "掌握项目结构最佳实践、配置管理、代码格式化和检查工具，构建生产级大模型应用的工程化基础设施。"
tags: ["Python", "工程化", "项目结构", "大模型开发"]
series:
  slug: "llm-python-tutorial"
  title: "大模型应用开发者 Python 必修课"
  order: 10
---

# 大模型应用开发者 Python 必修课（十）：工程化篇

## 前言

经过前面九章的学习，你已经掌握了 Python 的核心语法、类型系统、异步编程、网络请求、数据处理、错误处理和测试实践。最后一章，我们将这些知识整合起来，构建一个生产级的项目结构和工程化基础设施。

本章将介绍项目结构设计、配置管理、代码格式化、静态检查等工程化实践，并提供一个可直接使用的大模型应用项目模板。

## 项目结构

### 推荐的目录结构

```
llm-app/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD 配置
├── .vscode/
│   └── settings.json           # VS Code 配置
├── src/
│   └── llm_app/
│       ├── __init__.py
│       ├── main.py             # 应用入口
│       ├── config.py           # 配置管理
│       ├── clients/            # API 客户端
│       │   ├── __init__.py
│       │   ├── base.py         # 基础客户端
│       │   ├── openai.py       # OpenAI 客户端
│       │   └── anthropic.py    # Anthropic 客户端
│       ├── models/             # 数据模型
│       │   ├── __init__.py
│       │   ├── requests.py
│       │   └── responses.py
│       ├── services/           # 业务逻辑
│       │   ├── __init__.py
│       │   ├── chat.py
│       │   └── embedding.py
│       ├── utils/              # 工具函数
│       │   ├── __init__.py
│       │   ├── retry.py
│       │   └── logging.py
│       └── api/                # API 路由（如使用 FastAPI）
│           ├── __init__.py
│           ├── routes.py
│           └── dependencies.py
├── tests/
│   ├── conftest.py
│   ├── unit/
│   │   ├── test_clients.py
│   │   └── test_services.py
│   └── integration/
│       └── test_api.py
├── scripts/
│   ├── setup.sh                # 环境设置脚本
│   └── run_dev.sh              # 开发运行脚本
├── .env.example                # 环境变量模板
├── .gitignore
├── .pre-commit-config.yaml     # pre-commit 配置
├── pyproject.toml              # 项目配置
├── poetry.lock                 # 依赖锁定
└── README.md
```

### 目录职责说明

| 目录/文件 | 职责 |
|----------|------|
| `src/llm_app/` | 主代码目录，使用 src-layout 避免导入问题 |
| `clients/` | 外部 API 客户端封装 |
| `models/` | Pydantic 数据模型 |
| `services/` | 核心业务逻辑 |
| `utils/` | 通用工具函数 |
| `api/` | Web API 路由（可选） |
| `tests/` | 测试代码 |
| `scripts/` | 开发和部署脚本 |

## pyproject.toml 完整配置

```toml
[tool.poetry]
name = "llm-app"
version = "0.1.0"
description = "大模型应用项目"
authors = ["Your Name <your@email.com>"]
readme = "README.md"
packages = [{include = "llm_app", from = "src"}]

[tool.poetry.dependencies]
python = "^3.10"
# 核心 LLM SDK
openai = "^1.12.0"
anthropic = "^0.18.0"
# 数据处理
pydantic = "^2.6.0"
pydantic-settings = "^2.1.0"
# HTTP 客户端
httpx = "^0.27.0"
# 工具库
tenacity = "^8.2.0"
python-dotenv = "^1.0.0"
# Web 框架（可选）
fastapi = "^0.109.0"
uvicorn = "^0.27.0"

[tool.poetry.group.dev.dependencies]
# 测试
pytest = "^8.0.0"
pytest-asyncio = "^0.23.0"
pytest-cov = "^4.1.0"
pytest-mock = "^3.12.0"
# 代码质量
black = "^24.0.0"
ruff = "^0.2.0"
mypy = "^1.8.0"
# pre-commit
pre-commit = "^3.6.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"

# ===== 工具配置 =====

# Black 代码格式化
[tool.black]
line-length = 88
target-version = ["py310"]
include = '\.pyi?$'
exclude = '''
/(
    \.git
    | \.hg
    | \.mypy_cache
    | \.tox
    | \.venv
    | _build
    | buck-out
    | build
    | dist
)/
'''

# Ruff 代码检查
[tool.ruff]
line-length = 88
target-version = "py310"

[tool.ruff.lint]
select = [
    "E",      # pycodestyle errors
    "W",      # pycodestyle warnings
    "F",      # Pyflakes
    "I",      # isort
    "B",      # flake8-bugbear
    "C4",     # flake8-comprehensions
    "UP",     # pyupgrade
    "ARG",    # flake8-unused-arguments
    "SIM",    # flake8-simplify
]
ignore = [
    "E501",   # line too long (black handles this)
    "B008",   # do not perform function calls in argument defaults
    "B904",   # raise without from inside except
]

[tool.ruff.lint.isort]
known-first-party = ["llm_app"]

# MyPy 类型检查
[tool.mypy]
python_version = "3.10"
strict = true
warn_return_any = true
warn_unused_configs = true
warn_redundant_casts = true
warn_unused_ignores = true

[[tool.mypy.overrides]]
module = ["openai.*", "anthropic.*"]
ignore_missing_imports = true

# Pytest 测试配置
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = "-v --tb=short --strict-markers"
markers = [
    "integration: marks tests as integration tests",
    "slow: marks tests as slow",
]

# Coverage 覆盖率
[tool.coverage.run]
source = ["llm_app"]
branch = true
omit = ["tests/*", "*/__pycache__/*"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
]
```

## 配置管理

### 使用 pydantic-settings

```python
# src/llm_app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Literal
from functools import lru_cache

class Settings(BaseSettings):
    """应用配置"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # API 密钥
    openai_api_key: str = Field(default="", min_length=1)
    anthropic_api_key: str = Field(default="")

    # 模型配置
    default_model: str = Field(default="gpt-4")
    default_temperature: float = Field(default=0.7, ge=0, le=2)
    default_max_tokens: int = Field(default=4096, ge=1)

    # 并发配置
    max_concurrent_requests: int = Field(default=10, ge=1, le=100)
    request_timeout: float = Field(default=30.0, ge=1)

    # 重试配置
    max_retries: int = Field(default=3, ge=0)
    retry_delay: float = Field(default=1.0, ge=0)

    # 日志配置
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")
    log_format: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # 应用配置
    debug: bool = Field(default=False)
    environment: Literal["development", "staging", "production"] = Field(
        default="development"
    )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

@lru_cache
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()

# 便捷访问
settings = get_settings()
```

### .env.example 模板

```bash
# .env.example
# 复制此文件为 .env 并填写实际值

# ===== API 密钥 =====
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# ===== 模型配置 =====
DEFAULT_MODEL=gpt-4
DEFAULT_TEMPERATURE=0.7
DEFAULT_MAX_TOKENS=4096

# ===== 并发配置 =====
MAX_CONCURRENT_REQUESTS=10
REQUEST_TIMEOUT=30.0

# ===== 重试配置 =====
MAX_RETRIES=3
RETRY_DELAY=1.0

# ===== 日志配置 =====
LOG_LEVEL=INFO

# ===== 应用配置 =====
DEBUG=false
ENVIRONMENT=development
```

## 代码格式化和检查

### Black：代码格式化

```bash
# 格式化代码
black src/ tests/

# 检查但不修改
black --check src/ tests/

# 配置 VS Code
# .vscode/settings.json
{
    "python.formatting.provider": "black",
    "[python]": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "ms-python.black-formatter"
    }
}
```

### Ruff：快速代码检查

```bash
# 检查代码
ruff check src/ tests/

# 自动修复
ruff check --fix src/ tests/

# 同时格式化
ruff format src/ tests/
```

### MyPy：静态类型检查

```bash
# 类型检查
mypy src/

# 严格模式
mypy --strict src/

# 生成报告
mypy --html-report ./mypy-report src/
```

### pre-commit：Git 钩子

```yaml
# .pre-commit-config.yaml
repos:
  # 通用检查
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-merge-conflict

  # Black 格式化
  - repo: https://github.com/psf/black
    rev: 24.1.1
    hooks:
      - id: black
        language_version: python3.10

  # Ruff 检查
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.2.0
    hooks:
      - id: ruff
        args: [--fix]

  # MyPy 类型检查
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: [pydantic]
        args: [--ignore-missing-imports]
```

```bash
# 安装 pre-commit
pip install pre-commit
pre-commit install

# 手动运行
pre-commit run --all-files
```

## Makefile 常用命令

```makefile
# Makefile
.PHONY: install dev test lint format clean

install:
	poetry install

dev:
	poetry run uvicorn llm_app.main:app --reload

test:
	poetry run pytest --cov=llm_app --cov-report=term-missing

test-integration:
	poetry run pytest -m integration

lint:
	poetry run ruff check src/ tests/
	poetry run mypy src/

format:
	poetry run black src/ tests/
	poetry run ruff check --fix src/ tests/

check: format lint test

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +
	find . -type d -name ".mypy_cache" -exec rm -rf {} +
	rm -rf .coverage htmlcov/
```

## CI/CD 配置

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}

      - name: Install Poetry
        uses: abatilo/actions-poetry@v3
        with:
          poetry-version: "1.7.0"

      - name: Install dependencies
        run: poetry install

      - name: Run linting
        run: |
          poetry run ruff check src/ tests/
          poetry run mypy src/

      - name: Run tests
        run: poetry run pytest --cov=llm_app --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage.xml
```

## 实战项目模板

### main.py 应用入口

```python
# src/llm_app/main.py
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from llm_app.config import settings
from llm_app.api.routes import router
from llm_app.utils.logging import setup_logging

# 配置日志
setup_logging()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("Starting application...")
    # 初始化资源
    yield
    # 清理资源
    logger.info("Shutting down application...")

app = FastAPI(
    title="LLM Application",
    description="大模型应用服务",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router, prefix="/api")

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "environment": settings.environment}
```

### base.py 客户端基类

```python
# src/llm_app/clients/base.py
from abc import ABC, abstractmethod
from typing import AsyncIterator
from pydantic import BaseModel
from llm_app.config import Settings

class ChatMessage(BaseModel):
    """聊天消息"""
    role: str
    content: str

class ChatResponse(BaseModel):
    """聊天响应"""
    content: str
    total_tokens: int
    finish_reason: str

class BaseLLMClient(ABC):
    """LLM 客户端基类"""

    def __init__(self, settings: Settings):
        self.settings = settings

    @abstractmethod
    async def chat(
        self,
        messages: list[ChatMessage],
        **kwargs,
    ) -> ChatResponse:
        """聊天完成"""
        pass

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[ChatMessage],
        **kwargs,
    ) -> AsyncIterator[str]:
        """流式聊天"""
        pass

    async def close(self) -> None:
        """关闭客户端"""
        pass

    async def __aenter__(self) -> "BaseLLMClient":
        return self

    async def __aexit__(self, *args) -> None:
        await self.close()
```

### retry.py 重试工具

```python
# src/llm_app/utils/retry.py
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

def with_retry(config: RetryConfig, exceptions: tuple = (Exception,)):
    """重试装饰器"""
    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            last_error = None

            for attempt in range(config.max_attempts):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_error = e
                    if attempt < config.max_attempts - 1:
                        delay = min(
                            config.base_delay * (config.exponential_base ** attempt),
                            config.max_delay,
                        )
                        await asyncio.sleep(delay)

            raise last_error

        return wrapper
    return decorator
```

## 项目初始化脚本

```bash
#!/bin/bash
# scripts/setup.sh

set -e

PROJECT_NAME=${1:-"llm-app"}

echo "Creating project: $PROJECT_NAME"

# 创建目录结构
mkdir -p "$PROJECT_NAME"/{src/llm_app/{clients,models,services,utils,api},tests/{unit,integration},scripts,.github/workflows}

# 创建 __init__.py 文件
touch "$PROJECT_NAME"/src/llm_app/__init__.py
touch "$PROJECT_NAME"/src/llm_app/{clients,models,services,utils,api}/__init__.py

# 创建配置文件
touch "$PROJECT_NAME"/.env.example
touch "$PROJECT_NAME"/.gitignore
touch "$PROJECT_NAME"/pyproject.toml
touch "$PROJECT_NAME"/README.md

# 初始化 git
cd "$PROJECT_NAME"
git init

echo "Project $PROJECT_NAME created successfully!"
echo "Next steps:"
echo "  1. cd $PROJECT_NAME"
echo "  2. Copy pyproject.toml content"
echo "  3. poetry install"
echo "  4. cp .env.example .env"
echo "  5. Edit .env with your API keys"
```

## 小结

本章我们学习了：

1. **项目结构**：src-layout、目录职责划分
2. **pyproject.toml**：完整的工具链配置
3. **配置管理**：pydantic-settings、环境变量
4. **代码质量**：Black、Ruff、MyPy、pre-commit
5. **CI/CD**：GitHub Actions 自动化测试

关键实践：

| 方面 | 工具/方案 |
|------|---------|
| 依赖管理 | Poetry |
| 配置管理 | pydantic-settings |
| 代码格式化 | Black |
| 代码检查 | Ruff + MyPy |
| Git 钩子 | pre-commit |
| 测试框架 | pytest |
| CI/CD | GitHub Actions |

## 系列总结

至此，"大模型应用开发者 Python 必修课"系列教程全部完成。让我们回顾一下学习路径：

```
第一部分：基础篇
├── 概述篇 → Python 在大模型生态中的地位
├── 环境配置篇 → 虚拟环境、依赖管理
└── 核心语法篇 → 推导式、生成器、装饰器

第二部分：进阶篇
├── 类型系统篇 → 类型注解、Pydantic
├── 异步编程篇 → asyncio、并发控制
├── 网络请求篇 → HTTP 客户端、重试机制
└── 数据处理篇 → JSON、文件操作

第三部分：工程篇
├── 错误处理篇 → 异常、日志、熔断
├── 测试实践篇 → pytest、Mock、异步测试
└── 工程化篇 → 项目结构、代码质量、CI/CD
```

### 核心技能清单

完成本系列学习后，你应该掌握了：

- [ ] Python 3.10+ 现代特性（match-case、类型联合等）
- [ ] 虚拟环境和依赖管理（Poetry）
- [ ] 类型注解和 Pydantic 数据验证
- [ ] asyncio 异步编程
- [ ] HTTP 客户端使用（httpx）
- [ ] 错误处理和日志记录
- [ ] pytest 测试框架
- [ ] 代码质量工具链

### 推荐后续学习

1. **《大模型应用开发教程》系列**：深入学习 LLM 原理和应用开发
2. **LangChain / LlamaIndex**：主流 LLM 应用框架
3. **RAG 架构**：检索增强生成
4. **Agent 开发**：自主智能体构建

## 参考资料

1. [Python 项目结构最佳实践](https://packaging.python.org/en/latest/tutorials/packaging-projects/)
2. [Poetry 文档](https://python-poetry.org/)
3. [Ruff 文档](https://docs.astral.sh/ruff/)
4. [pre-commit 文档](https://pre-commit.com/)
5. [GitHub Actions 文档](https://docs.github.com/en/actions)

---

**恭喜你完成了本系列的学习！欢迎继续关注后续教程。**
