---
title: "从零到一实现mini-mcp-gateway（六）：REST适配器实现"
date: "2026-01-29"
excerpt: "实现REST到MCP的协议适配器，支持OpenAPI规范自动解析、动态Schema生成和多认证类型注入，让现有API无需改造即可被AI Agent调用。"
tags: ["AI", "MCP", "REST", "OpenAPI", "Adapter", "Python"]
series:
  slug: "mini-mcp-gateway"
  title: "从零到一实现 mini-mcp-gateway"
  order: 6
---

# 从零到一实现mini-mcp-gateway（六）：REST适配器实现

## 前言

企业中有大量现有的REST API，它们无法直接被AI Agent调用。REST适配器可以将这些API自动包装为MCP工具，无需修改原有代码，实现"即插即用"的能力扩展。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    REST Adapter Pipeline                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  OpenAPI    │    │   Schema    │    │    Tool     │     │
│  │   Spec      │───▶│  Generator  │───▶│  Register   │     │
│  │  自动发现    │    │  动态生成    │    │  自动注册    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                   │           │
│         ▼                  ▼                   ▼           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Auth Injection                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │   │
│  │  │ API Key │  │ Bearer  │  │  Basic  │  │ OAuth2  │ │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 核心模块设计

### 1. OpenAPI规范解析器

```python
# src/mini_mcp_gateway/adapters/rest.py

@dataclass
class EndpointInfo:
    """REST API端点信息。"""
    path: str                    # API路径
    method: str                  # HTTP方法
    operation_id: str | None     # 操作ID
    summary: str | None          # 摘要
    description: str | None      # 详细描述
    parameters: list[dict]       # 参数定义
    request_body: dict | None    # 请求体
    responses: dict              # 响应定义


class OpenAPIParser:
    """OpenAPI 3.0规范解析器。
    
    将OpenAPI规范转换为MCP工具定义。
    """
    
    def __init__(self, spec: dict):
        self.spec = spec
        self.base_url = self._extract_base_url()
    
    def parse_endpoints(self) -> list[EndpointInfo]:
        """解析所有端点。"""
        endpoints = []
        paths = self.spec.get("paths", {})
        
        for path, methods in paths.items():
            for method, details in methods.items():
                if method.upper() in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
                    endpoint = self._parse_endpoint(path, method, details)
                    endpoints.append(endpoint)
        
        return endpoints
    
    def generate_input_schema(self, endpoint: EndpointInfo) -> dict:
        """生成MCP工具的JSON Schema。
        
        将OpenAPI的参数和请求体统一转换为工具入参。
        """
        properties = {}
        required = []
        
        # 解析path/query/header参数
        for param in endpoint.parameters:
            param_name = param.get("name")
            param_schema = param.get("schema", {})
            param_desc = param.get("description", "")
            
            prop_schema = dict(param_schema)
            if param_desc:
                prop_schema["description"] = param_desc
            
            properties[param_name] = prop_schema
            
            if param.get("required", False):
                required.append(param_name)
        
        # 解析请求体
        if endpoint.request_body:
            content = endpoint.request_body.get("content", {})
            json_content = content.get("application/json", {})
            body_schema = json_content.get("schema", {})
            
            if body_schema.get("type") == "object":
                for prop_name, prop_schema in body_schema.get("properties", {}).items():
                    properties[prop_name] = prop_schema
                
                if "required" in body_schema:
                    required.extend(body_schema["required"])
        
        return {
            "type": "object",
            "properties": properties,
            "required": required,
        }
```

### 2. REST适配器核心类

```python
class AuthType(str, Enum):
    """认证类型枚举。"""
    NONE = "none"
    API_KEY = "api_key"
    BEARER = "bearer"
    BASIC = "basic"
    OAUTH2 = "oauth2"


@dataclass
class AuthConfig:
    """认证配置。"""
    type: AuthType = AuthType.NONE
    api_key: str | None = None
    api_key_header: str = "X-API-Key"
    bearer_token: str | None = None
    username: str | None = None
    password: str | None = None


class RESTAdapter(BaseAdapter):
    """REST API到MCP工具适配器。
    
    功能：
    - OpenAPI规范自动发现与解析
    - 动态JSON Schema生成
    - 多种认证类型注入
    - 自动工具注册
    """
    
    def __init__(
        self,
        base_url: str,
        auth_config: AuthConfig | None = None,
        timeout: float = 30.0,
        prefix: str = "",
    ):
        self.base_url = base_url.rstrip("/")
        self.auth_config = auth_config or AuthConfig()
        self.timeout = timeout
        self.prefix = prefix
        self.client = httpx.AsyncClient(timeout=timeout)
    
    async def load_openapi_spec(self, spec_url: str | None = None) -> None:
        """加载OpenAPI规范。
        
        自动尝试常见路径：/openapi.json, /swagger.json, /openapi.yaml
        """
        if spec_url is None:
            for path in ["/openapi.json", "/swagger.json", "/openapi.yaml"]:
                try:
                    url = f"{self.base_url}{path}"
                    response = await self.client.get(url)
                    if response.status_code == 200:
                        if path.endswith(".yaml"):
                            spec = yaml.safe_load(response.text)
                        else:
                            spec = response.json()
                        self._openapi_parser = OpenAPIParser(spec)
                        return
                except Exception:
                    continue
        else:
            response = await self.client.get(spec_url)
            # ... 解析逻辑
```

### 3. 端点适配与工具注册

```python
async def adapt_endpoint(
    self,
    name: str,
    description: str,
    method: str = "GET",
    path: str = "/",
    input_schema: dict | None = None,
    headers: dict | None = None,
) -> Tool:
    """将单个REST端点适配为MCP工具。
    
    Args:
        name: 工具名称
        description: 工具描述
        method: HTTP方法
        path: API路径（支持{param}路径参数）
        input_schema: 自定义Schema（可选）
        headers: 额外请求头
    """
    schema = input_schema or self._generate_default_schema(method, path)
    
    # 创建执行handler
    async def handler(**kwargs) -> Any:
        return await self._execute_request(
            method=method,
            path=path,
            params=kwargs,
            extra_headers=headers,
        )
    
    # 注册到工具注册中心
    registry = get_registry()
    return await registry.register(
        name=name,
        description=description,
        input_schema=schema,
        handler=handler,
    )

async def _execute_request(
    self,
    method: str,
    path: str,
    params: dict,
    extra_headers: dict | None = None,
) -> Any:
    """执行HTTP请求。"""
    # 分离路径参数和查询/请求体参数
    path_params = {}
    path_param_names = re.findall(r"\{(\w+)\}", path)
    for name in path_param_names:
        if name in params:
            path_params[name] = params.pop(name)
    
    # 构建URL
    url = f"{self.base_url}{path}"
    for name, value in path_params.items():
        url = url.replace(f"{{{name}}}", str(value))
    
    # 构建认证头
    headers = await self._build_headers()
    if extra_headers:
        headers.update(extra_headers)
    
    # 执行请求
    if method.upper() in ["GET", "DELETE"]:
        response = await self.client.request(method, url, params=params, headers=headers)
    else:
        response = await self.client.request(method, url, json=params, headers=headers)
    
    response.raise_for_status()
    return response.json()
```

## 实际使用示例

### 自动发现GitHub API工具

```python
# 创建适配器
adapter = RESTAdapter(
    base_url="https://api.github.com",
    auth_config=AuthConfig(
        type=AuthType.BEARER,
        bearer_token="ghp_xxxx"
    ),
    prefix="github"
)

# 加载OpenAPI规范并自动发现工具
await adapter.load_openapi_spec("https://api.github.com/openapi.json")
tools = await adapter.discover_tools()

# 所有端点自动注册为MCP工具
# 例如: github_list_repos, github_get_user, github_create_issue...
```

### 手动适配单个端点

```python
# 适配GitHub Issues API
await adapter.adapt_endpoint(
    name="github_list_issues",
    description="List issues in a GitHub repository",
    method="GET",
    path="/repos/{owner}/{repo}/issues",
)

# AI Agent可以直接调用
# MCP请求
{
  "method": "tools/call",
  "params": {
    "name": "github_list_issues",
    "arguments": {"owner": "modelcontextprotocol", "repo": "python-sdk"}
  }
}
```

## 技术亮点

| 特性 | 实现方式 | 面试价值 |
|------|----------|----------|
| OpenAPI解析 | 支持JSON/YAML格式 | 协议理解能力 |
| 动态Schema | 参数+请求体统一转换 | 类型系统设计 |
| 多认证支持 | API Key/Bearer/Basic/OAuth2 | 安全架构能力 |
| 路径参数 | 自动识别{param}模式 | API设计能力 |

## 小结

REST适配器实现了REST API到MCP工具的无缝转换，让企业现有的API资产可以立即被AI Agent使用。下一章我们将实现完整的认证授权机制。
