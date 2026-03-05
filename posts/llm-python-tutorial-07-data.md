---
title: "大模型应用开发者 Python 必修课（七）：数据处理篇"
date: "2026-03-04 16:00:00"
excerpt: "掌握 JSON 处理、文件操作、数据验证与转换的核心技巧，高效处理大模型应用中的各类数据格式。"
tags: ["Python", "JSON", "数据处理", "大模型开发"]
series:
  slug: "llm-python-tutorial"
  title: "大模型应用开发者 Python 必修课"
  order: 7
---

# 大模型应用开发者 Python 必修课（七）：数据处理篇

## 前言

大模型应用开发涉及大量的数据处理工作：解析 API 响应的 JSON 数据、处理用户上传的文件、转换数据格式以适应不同的模型输入。掌握高效、安全的数据处理技巧，是构建可靠应用的重要基础。

本章将深入探讨 Python 中数据处理的核心技术和最佳实践。

## JSON 数据处理

### json 模块基础

```python
import json
from typing import Any

# JSON 字符串解析
json_str = '{"name": "GPT-4", "version": 4.0, "features": ["chat", "completion"]}'
data = json.loads(json_str)
print(data["name"])  # "GPT-4"

# Python 对象转 JSON
data = {
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}],
    "temperature": 0.7,
}
json_str = json.dumps(data, indent=2, ensure_ascii=False)
print(json_str)
```

### 大模型开发实战：API 响应处理

```python
import json
from dataclasses import dataclass
from typing import Any
from datetime import datetime

@dataclass
class ChatResponse:
    """聊天响应数据"""
    id: str
    model: str
    content: str
    prompt_tokens: int
    completion_tokens: int
    finish_reason: str
    created_at: datetime

    @classmethod
    def from_api_response(cls, data: dict[str, Any]) -> "ChatResponse":
        """从 API 响应解析"""
        choice = data["choices"][0]
        usage = data["usage"]

        return cls(
            id=data["id"],
            model=data["model"],
            content=choice["message"]["content"],
            prompt_tokens=usage["prompt_tokens"],
            completion_tokens=usage["completion_tokens"],
            finish_reason=choice["finish_reason"],
            created_at=datetime.fromtimestamp(data["created"]),
        )

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "model": self.model,
            "content": self.content,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "finish_reason": self.finish_reason,
            "created_at": self.created_at.isoformat(),
        }

# 使用
api_response = {
    "id": "chatcmpl-123",
    "object": "chat.completion",
    "created": 1677652288,
    "model": "gpt-4",
    "choices": [{
        "index": 0,
        "message": {"role": "assistant", "content": "Hello! How can I help you?"},
        "finish_reason": "stop"
    }],
    "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
}

response = ChatResponse.from_api_response(api_response)
print(response.content)  # "Hello! How can I help you?"
```

### JSON 处理的最佳实践

```python
import json
from pathlib import Path
from typing import Any

class JSONHandler:
    """JSON 文件处理器"""

    @staticmethod
    def load(file_path: str | Path) -> Any:
        """加载 JSON 文件"""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def save(
        data: Any,
        file_path: str | Path,
        indent: int = 2,
        ensure_ascii: bool = False,
    ) -> None:
        """保存 JSON 文件"""
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=indent, ensure_ascii=ensure_ascii)

    @staticmethod
    def load_safe(file_path: str | Path, default: Any = None) -> Any:
        """安全加载 JSON 文件（失败返回默认值）"""
        try:
            return JSONHandler.load(file_path)
        except (FileNotFoundError, json.JSONDecodeError):
            return default

    @staticmethod
    def merge(base: dict, override: dict) -> dict:
        """合并两个字典（深度合并）"""
        result = base.copy()
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = JSONHandler.merge(result[key], value)
            else:
                result[key] = value
        return result

# 使用
config = JSONHandler.load("config.json")
config["model"] = "gpt-4-turbo"
JSONHandler.save(config, "config.json")
```

### 处理复杂的嵌套 JSON

```python
from typing import Any

def get_nested(data: dict, *keys, default: Any = None) -> Any:
    """安全获取嵌套字典的值"""
    for key in keys:
        if not isinstance(data, dict):
            return default
        data = data.get(key, default)
        if data is None:
            return default
    return data

def set_nested(data: dict, value: Any, *keys) -> None:
    """设置嵌套字典的值"""
    for key in keys[:-1]:
        if key not in data:
            data[key] = {}
        data = data[key]
    data[keys[-1]] = value

# 使用
api_response = {
    "choices": [{
        "message": {
            "role": "assistant",
            "content": "Hello!"
        }
    }]
}

# 安全获取嵌套值
content = get_nested(api_response, "choices", 0, "message", "content")
# "Hello!"

content = get_nested(api_response, "choices", 0, "message", "nonexistent", default="N/A")
# "N/A"
```

## 文件操作

### pathlib 模块

```python
from pathlib import Path
from typing import Iterator

# 创建路径对象
project_root = Path("/Users/user/projects/llm-app")
config_file = project_root / "config" / "settings.json"

# 路径属性
print(config_file.name)       # "settings.json"
print(config_file.stem)       # "settings"
print(config_file.suffix)     # ".json"
print(config_file.parent)     # Path("/Users/user/projects/llm-app/config")

# 路径操作
print(config_file.exists())   # 检查是否存在
print(config_file.is_file())  # 是否是文件
print(config_file.is_dir())   # 是否是目录

# 创建目录
Path("data/raw").mkdir(parents=True, exist_ok=True)

# 遍历目录
for file in Path("data").glob("*.json"):
    print(file)

# 递归遍历
for file in Path("data").rglob("*.txt"):
    print(file)
```

### 文件读写

```python
from pathlib import Path
from typing import Iterator

class FileHandler:
    """文件处理器"""

    @staticmethod
    def read_text(file_path: str | Path, encoding: str = "utf-8") -> str:
        """读取文本文件"""
        return Path(file_path).read_text(encoding=encoding)

    @staticmethod
    def write_text(
        file_path: str | Path,
        content: str,
        encoding: str = "utf-8",
    ) -> None:
        """写入文本文件"""
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding=encoding)

    @staticmethod
    def read_lines(file_path: str | Path) -> list[str]:
        """读取文件所有行"""
        return Path(file_path).read_text().splitlines()

    @staticmethod
    def iter_lines(file_path: str | Path) -> Iterator[str]:
        """逐行迭代（内存友好）"""
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                yield line.rstrip("\n")

    @staticmethod
    def append_text(file_path: str | Path, content: str) -> None:
        """追加文本"""
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(content)

# 使用
content = FileHandler.read_text("prompts/system_prompt.txt")
FileHandler.write_text("output/response.txt", "Hello, World!")

# 处理大文件
for line in FileHandler.iter_lines("data/large_file.txt"):
    process_line(line)
```

### 大模型开发实战：日志文件处理

```python
from pathlib import Path
from datetime import datetime
from typing import Iterator
import json

class ConversationLogger:
    """对话日志处理器"""

    def __init__(self, log_dir: str | Path):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def log_conversation(
        self,
        conversation_id: str,
        messages: list[dict],
        response: str,
        metadata: dict | None = None,
    ) -> Path:
        """记录对话"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{conversation_id}.json"
        filepath = self.log_dir / filename

        log_data = {
            "conversation_id": conversation_id,
            "timestamp": datetime.now().isoformat(),
            "messages": messages,
            "response": response,
            "metadata": metadata or {},
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(log_data, f, indent=2, ensure_ascii=False)

        return filepath

    def get_conversations(
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> Iterator[dict]:
        """获取对话记录"""
        for file in sorted(self.log_dir.glob("*.json")):
            # 解析文件名中的日期
            date_str = file.stem.split("_")[0]
            file_date = datetime.strptime(date_str, "%Y%m%d")

            # 日期过滤
            if start_date and file_date < start_date:
                continue
            if end_date and file_date > end_date:
                continue

            with open(file, "r", encoding="utf-8") as f:
                yield json.load(f)

    def get_statistics(self) -> dict:
        """获取统计信息"""
        total_conversations = 0
        total_messages = 0
        total_tokens = 0

        for conv in self.get_conversations():
            total_conversations += 1
            total_messages += len(conv.get("messages", []))
            total_tokens += conv.get("metadata", {}).get("total_tokens", 0)

        return {
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "total_tokens": total_tokens,
        }
```

## 数据验证与转换

### 使用 Pydantic 进行数据验证

```python
from pydantic import BaseModel, Field, field_validator
from typing import Literal
from datetime import datetime

class ChatMessage(BaseModel):
    """聊天消息"""
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=1, max_length=100000)

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Content cannot be empty or whitespace only")
        return v

class ChatRequest(BaseModel):
    """聊天请求"""
    model: str = Field(default="gpt-4")
    messages: list[ChatMessage] = Field(..., min_length=1)
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1)

class ChatResponse(BaseModel):
    """聊天响应"""
    id: str
    model: str
    choices: list[dict]
    usage: dict

    @property
    def content(self) -> str:
        return self.choices[0]["message"]["content"]

    @property
    def total_tokens(self) -> int:
        return self.usage["total_tokens"]

# 使用
try:
    request = ChatRequest(
        model="gpt-4",
        messages=[
            {"role": "user", "content": "Hello!"},
        ],
        temperature=0.9,
    )
except ValueError as e:
    print(f"验证失败: {e}")
```

### 数据转换工具

```python
from typing import Any, TypeVar, Callable
from functools import singledispatch

T = TypeVar("T")

class DataConverter:
    """数据转换器"""

    @staticmethod
    def to_snake_case(name: str) -> str:
        """驼峰转下划线"""
        result = []
        for i, char in enumerate(name):
            if char.isupper() and i > 0:
                result.append("_")
            result.append(char.lower())
        return "".join(result)

    @staticmethod
    def to_camel_case(name: str) -> str:
        """下划线转驼峰"""
        parts = name.split("_")
        return parts[0] + "".join(word.capitalize() for word in parts[1:])

    @staticmethod
    def transform_keys(data: dict, transformer: Callable[[str], str]) -> dict:
        """转换字典键名"""
        if not isinstance(data, dict):
            return data

        result = {}
        for key, value in data.items():
            new_key = transformer(key)
            if isinstance(value, dict):
                result[new_key] = DataConverter.transform_keys(value, transformer)
            elif isinstance(value, list):
                result[new_key] = [
                    DataConverter.transform_keys(item, transformer)
                    if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                result[new_key] = value
        return result

# 使用
api_response = {
    "promptTokens": 100,
    "completionTokens": 200,
    "totalTokens": 300,
}

# API 响应（驼峰）转 Python 风格（下划线）
python_style = DataConverter.transform_keys(api_response, DataConverter.to_snake_case)
# {"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300}
```

## 结构化数据解析

### 解析 Markdown

```python
import re
from dataclasses import dataclass
from typing import Iterator

@dataclass
class MarkdownSection:
    """Markdown 章节"""
    level: int
    title: str
    content: str

class MarkdownParser:
    """Markdown 解析器"""

    @staticmethod
    def extract_code_blocks(content: str) -> list[dict]:
        """提取代码块"""
        pattern = r"```(\w*)\n(.*?)```"
        matches = re.findall(pattern, content, re.DOTALL)
        return [
            {"language": lang or "text", "code": code.strip()}
            for lang, code in matches
        ]

    @staticmethod
    def extract_sections(content: str) -> list[MarkdownSection]:
        """提取章节"""
        pattern = r"^(#{1,6})\s+(.+)$"
        lines = content.split("\n")
        sections = []
        current_section = None
        current_content = []

        for line in lines:
            match = re.match(pattern, line)
            if match:
                if current_section:
                    current_section.content = "\n".join(current_content).strip()
                    sections.append(current_section)

                level = len(match.group(1))
                title = match.group(2)
                current_section = MarkdownSection(level=level, title=title, content="")
                current_content = []
            else:
                current_content.append(line)

        if current_section:
            current_section.content = "\n".join(current_content).strip()
            sections.append(current_section)

        return sections

    @staticmethod
    def extract_links(content: str) -> list[dict]:
        """提取链接"""
        pattern = r"\[([^\]]+)\]\(([^)]+)\)"
        matches = re.findall(pattern, content)
        return [{"text": text, "url": url} for text, url in matches]

# 使用
markdown_content = """
# 主标题

这是一段介绍文字。

## 代码示例

```python
def hello():
    print("Hello, World!")
```

## 链接

查看 [官方文档](https://example.com) 了解更多。
"""

code_blocks = MarkdownParser.extract_code_blocks(markdown_content)
print(code_blocks[0]["language"])  # "python"
print(code_blocks[0]["code"])      # "def hello():\n    print(\"Hello, World!\")"

sections = MarkdownParser.extract_sections(markdown_content)
for section in sections:
    print(f"{'#' * section.level} {section.title}")
```

### 解析 CSV 和 TSV

```python
import csv
from pathlib import Path
from typing import Iterator
from dataclasses import dataclass

@dataclass
class DataRow:
    """数据行"""
    id: int
    prompt: str
    response: str
    score: float

class CSVHandler:
    """CSV 文件处理器"""

    @staticmethod
    def read(
        file_path: str | Path,
        delimiter: str = ",",
    ) -> Iterator[dict]:
        """读取 CSV 文件"""
        with open(file_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            for row in reader:
                yield dict(row)

    @staticmethod
    def write(
        file_path: str | Path,
        data: list[dict],
        fieldnames: list[str] | None = None,
        delimiter: str = ",",
    ) -> None:
        """写入 CSV 文件"""
        if not data:
            return

        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        fieldnames = fieldnames or list(data[0].keys())

        with open(path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=delimiter)
            writer.writeheader()
            writer.writerows(data)

# 使用
# 读取数据集
for row in CSVHandler.read("dataset.csv"):
    prompt = row["prompt"]
    response = row["response"]

# 写入结果
results = [
    {"id": 1, "prompt": "Hello", "response": "Hi!", "score": 0.9},
    {"id": 2, "prompt": "Goodbye", "response": "Bye!", "score": 0.85},
]
CSVHandler.write("results.csv", results)
```

## 向量数据处理

```python
import json
from dataclasses import dataclass
from typing import Iterator
import numpy as np

@dataclass
class VectorRecord:
    """向量记录"""
    id: str
    vector: list[float]
    metadata: dict

class VectorDataHandler:
    """向量数据处理器"""

    @staticmethod
    def save_to_jsonl(
        records: list[VectorRecord],
        file_path: str,
    ) -> None:
        """保存为 JSONL 格式"""
        with open(file_path, "w", encoding="utf-8") as f:
            for record in records:
                data = {
                    "id": record.id,
                    "vector": record.vector,
                    "metadata": record.metadata,
                }
                f.write(json.dumps(data) + "\n")

    @staticmethod
    def load_from_jsonl(file_path: str) -> Iterator[VectorRecord]:
        """从 JSONL 加载"""
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                data = json.loads(line)
                yield VectorRecord(
                    id=data["id"],
                    vector=data["vector"],
                    metadata=data.get("metadata", {}),
                )

    @staticmethod
    def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
        """计算余弦相似度"""
        a = np.array(vec1)
        b = np.array(vec2)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    @staticmethod
    def find_similar(
        query_vector: list[float],
        records: list[VectorRecord],
        top_k: int = 5,
    ) -> list[tuple[VectorRecord, float]]:
        """查找最相似的向量"""
        similarities = [
            (record, VectorDataHandler.cosine_similarity(query_vector, record.vector))
            for record in records
        ]
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]

# 使用
records = [
    VectorRecord(id="1", vector=[0.1, 0.2, 0.3], metadata={"text": "Hello"}),
    VectorRecord(id="2", vector=[0.4, 0.5, 0.6], metadata={"text": "World"}),
]

# 保存
VectorDataHandler.save_to_jsonl(records, "vectors.jsonl")

# 加载并搜索
loaded_records = list(VectorDataHandler.load_from_jsonl("vectors.jsonl"))
query = [0.15, 0.25, 0.35]
similar = VectorDataHandler.find_similar(query, loaded_records, top_k=2)
for record, score in similar:
    print(f"{record.id}: {score:.4f}")
```

## 小结

本章我们学习了：

1. **JSON 处理**：解析、生成、嵌套数据处理
2. **文件操作**：pathlib、读写、日志处理
3. **数据验证**：Pydantic 模型验证
4. **数据转换**：命名风格转换、结构转换
5. **结构化解析**：Markdown、CSV、向量数据

关键实践：

| 场景 | 推荐方案 |
|------|---------|
| 配置文件 | JSON + Pydantic |
| 日志记录 | JSONL 格式 |
| 数据集 | CSV/JSONL |
| 向量存储 | NumPy + JSONL |
| API 响应 | Pydantic 验证 |

## 参考资料

1. [Python json 模块文档](https://docs.python.org/3/library/json.html)
2. [pathlib 文档](https://docs.python.org/3/library/pathlib.html)
3. [Pydantic 文档](https://docs.pydantic.dev/)
4. [Python csv 模块文档](https://docs.python.org/3/library/csv.html)

## 下一章预告

在下一章《错误处理篇》中，我们将深入学习：

- Python 异常处理最佳实践
- 自定义异常设计
- 日志记录与配置
- 错误追踪与监控
- 生产环境的错误处理策略

---

**系列持续更新中，欢迎关注！**
