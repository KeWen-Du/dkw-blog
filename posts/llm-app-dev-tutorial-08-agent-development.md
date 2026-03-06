---
title: "大模型应用开发教程（八）：Agent 智能体开发"
date: "2024-07-05"
excerpt: "掌握 AI Agent 智能体开发的核心技术，从基础架构到工具调用、任务规划，构建能够自主决策的智能系统。"
tags: ["大模型", "AI Agent", "智能体", "LangChain"]
series:
  slug: "llm-app-dev-tutorial"
  title: "大模型应用开发教程"
  order: 8
---

# 大模型应用开发教程（八）：Agent 智能体开发

## 前言

AI Agent（智能体）是大模型应用的高级形态，它不仅能理解语言，还能自主规划任务、调用工具、执行操作。从 ChatGPT 的插件系统到 AutoGPT，Agent 正在重新定义人机交互方式。本章将深入讲解 Agent 开发的核心技术。

## Agent 概述

### 什么是 AI Agent？

AI Agent 是一个能够感知环境、自主决策、执行行动以达成目标的智能系统：

```
┌─────────────────────────────────────────────────────────┐
│                    Agent 工作循环                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│     ┌─────────┐     ┌─────────┐     ┌─────────┐        │
│     │  感知   │────→│  规划   │────→│  执行   │        │
│     └─────────┘     └─────────┘     └─────────┘        │
│          ↑                               │             │
│          └───────────────────────────────┘             │
│                     反思与学习                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Agent vs 传统应用

| 特性 | 传统应用 | AI Agent |
|------|---------|----------|
| 执行方式 | 预定义流程 | 自主规划 |
| 工具使用 | 固定集成 | 动态选择 |
| 错误处理 | 异常捕获 | 自我纠正 |
| 能力边界 | 有限 | 可扩展 |
| 学习能力 | 无 | 可反思改进 |

## Agent 核心组件

### 1. 工具系统（Tools）

工具是 Agent 与外部世界交互的桥梁：

```python
from typing import Dict, Any, List
from dataclasses import dataclass
import json

@dataclass
class ToolResult:
    """工具执行结果"""
    success: bool
    result: Any
    error: str = ""

class Tool:
    """工具基类"""
    
    @property
    def name(self) -> str:
        raise NotImplementedError
    
    @property
    def description(self) -> str:
        raise NotImplementedError
    
    @property
    def parameters(self) -> Dict:
        raise NotImplementedError
    
    def execute(self, **kwargs) -> ToolResult:
        raise NotImplementedError
    
    def to_openai_format(self) -> Dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }


# 示例工具实现
class WebSearchTool(Tool):
    """网络搜索工具"""
    
    @property
    def name(self) -> str:
        return "web_search"
    
    @property
    def description(self) -> str:
        return "搜索网络获取最新信息"
    
    @property
    def parameters(self) -> Dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词"
                },
                "num_results": {
                    "type": "integer",
                    "description": "返回结果数量",
                    "default": 5
                }
            },
            "required": ["query"]
        }
    
    def execute(self, query: str, num_results: int = 5) -> ToolResult:
        try:
            # 实现搜索逻辑
            results = f"搜索 '{query}' 的 {num_results} 个结果..."
            return ToolResult(success=True, result=results)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))


class CodeExecutorTool(Tool):
    """代码执行工具"""
    
    @property
    def name(self) -> str:
        return "execute_code"
    
    @property
    def description(self) -> str:
        return "执行 Python 代码并返回结果"
    
    @property
    def parameters(self) -> Dict:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "要执行的 Python 代码"
                },
                "timeout": {
                    "type": "integer",
                    "description": "执行超时时间（秒）",
                    "default": 30
                }
            },
            "required": ["code"]
        }
    
    def execute(self, code: str, timeout: int = 30) -> ToolResult:
        try:
            # 安全执行代码
            local_vars = {}
            exec(code, {"__builtins__": {}}, local_vars)
            return ToolResult(success=True, result=local_vars)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))
```

### 2. 规划器（Planner）

规划器负责将复杂任务分解为可执行的步骤：

```python
from openai import OpenAI
import json

class Planner:
    """任务规划器"""
    
    def __init__(self, model: str = "gpt-4o-mini"):
        self.client = OpenAI()
        self.model = model
    
    def plan(self, task: str, available_tools: List[Tool]) -> List[Dict]:
        """生成执行计划"""
        
        tools_description = "\n".join([
            f"- {tool.name}: {tool.description}"
            for tool in available_tools
        ])
        
        prompt = f"""
你是一个任务规划专家。请分析以下任务并生成执行计划。

任务：{task}

可用工具：
{tools_description}

请以 JSON 格式返回执行计划：
{{
    "steps": [
        {{
            "step": 1,
            "action": "工具名称",
            "parameters": {{}},
            "reason": "执行原因"
        }}
    ]
}}
"""
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"}
        )
        
        plan = json.loads(response.choices[0].message.content)
        return plan["steps"]
```

### 3. 执行器（Executor）

执行器负责执行计划中的步骤：

```python
from typing import List, Dict, Any
import time

class AgentExecutor:
    """Agent 执行器"""
    
    def __init__(self, tools: List[Tool], planner: Planner):
        self.tools = {tool.name: tool for tool in tools}
        self.planner = planner
    
    def execute(self, task: str, max_iterations: int = 10) -> Dict:
        """执行任务"""
        
        # 1. 生成计划
        steps = self.planner.plan(task, list(self.tools.values()))
        
        # 2. 执行步骤
        results = []
        for step in steps:
            if len(results) >= max_iterations:
                break
            
            action = step["action"]
            parameters = step["parameters"]
            
            if action not in self.tools:
                results.append({
                    "step": step["step"],
                    "error": f"工具 {action} 不存在"
                })
                continue
            
            tool = self.tools[action]
            result = tool.execute(**parameters)
            
            results.append({
                "step": step["step"],
                "action": action,
                "parameters": parameters,
                "result": result.result if result.success else None,
                "error": result.error if not result.success else None
            })
        
        return {
            "task": task,
            "steps": results,
            "success": all(r.get("error") is None for r in results)
        }
```

## 完整 Agent 实现

### ReAct Agent

ReAct（Reasoning + Acting）是最经典的 Agent 架构：

```python
from openai import OpenAI
from typing import List, Dict, Optional
import json

class ReActAgent:
    """ReAct 架构的 Agent"""
    
    def __init__(self, tools: List[Tool], model: str = "gpt-4o-mini"):
        self.client = OpenAI()
        self.model = model
        self.tools = {tool.name: tool for tool in tools}
        self.max_iterations = 10
        
        self.system_prompt = f"""
你是一个智能助手，可以使用工具完成任务。

可用工具：
{self._format_tools()}

请使用以下格式思考和行动：

思考：分析当前情况，决定下一步
行动：工具名称
行动输入：{{参数 JSON}}
观察：工具返回结果
...（重复思考-行动-观察直到得出答案）
思考：我现在知道最终答案了
最终答案：答案内容

开始！
"""
    
    def _format_tools(self) -> str:
        lines = []
        for tool in self.tools.values():
            lines.append(f"- {tool.name}: {tool.description}")
            lines.append(f"  参数: {json.dumps(tool.parameters, ensure_ascii=False)}")
        return "\n".join(lines)
    
    def run(self, task: str) -> str:
        """执行任务"""
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": task}
        ]
        
        for _ in range(self.max_iterations):
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=[tool.to_openai_format() for tool in self.tools.values()],
                tool_choice="auto"
            )
            
            message = response.choices[0].message
            
            # 如果没有工具调用，返回结果
            if not message.tool_calls:
                return message.content or ""
            
            # 添加助手消息
            messages.append({
                "role": "assistant",
                "content": message.content,
                "tool_calls": message.tool_calls
            })
            
            # 执行工具调用
            for tool_call in message.tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)
                
                if tool_name in self.tools:
                    result = self.tools[tool_name].execute(**tool_args)
                    observation = str(result.result) if result.success else result.error
                else:
                    observation = f"工具 {tool_name} 不存在"
                
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_name,
                    "content": observation
                })
        
        return "达到最大迭代次数，任务未完成"


# 使用示例
tools = [
    WebSearchTool(),
    CodeExecutorTool(),
]

agent = ReActAgent(tools)
result = agent.run("帮我搜索 Python 最新版本的信息")
print(result)
```

### 多智能体协作

```python
from typing import List, Dict, Any
from dataclasses import dataclass
from enum import Enum

class AgentRole(Enum):
    PLANNER = "planner"
    RESEARCHER = "researcher"
    CODER = "coder"
    REVIEWER = "reviewer"

@dataclass
class AgentMessage:
    sender: str
    receiver: str
    content: str
    metadata: Dict = None

class MultiAgentSystem:
    """多智能体协作系统"""
    
    def __init__(self):
        self.agents: Dict[str, Agent] = {}
        self.message_history: List[AgentMessage] = []
    
    def add_agent(self, agent: "Agent"):
        self.agents[agent.name] = agent
    
    def send_message(self, message: AgentMessage):
        self.message_history.append(message)
        if message.receiver in self.agents:
            self.agents[message.receiver].receive(message)
    
    def run(self, task: str):
        """运行多智能体系统"""
        # 1. 规划者分解任务
        planner = self.agents.get("planner")
        if planner:
            plan = planner.plan(task)
        
        # 2. 分配给专门 agent 执行
        # ... 实现协作逻辑
        
        # 3. 汇总结果
        pass


class SpecialistAgent:
    """专家智能体"""
    
    def __init__(
        self,
        name: str,
        role: AgentRole,
        tools: List[Tool],
        system_prompt: str
    ):
        self.name = name
        self.role = role
        self.tools = {tool.name: tool for tool in tools}
        self.system_prompt = system_prompt
        self.client = OpenAI()
    
    def receive(self, message: AgentMessage):
        """接收消息"""
        pass
    
    def act(self, context: str) -> str:
        """执行任务"""
        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": context}
            ]
        )
        return response.choices[0].message.content
```

## Agent 开发框架

### 使用 LangChain

```python
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain.tools import Tool
from langchain_openai import ChatOpenAI

# 定义工具
def search_tool(query: str) -> str:
    return f"搜索结果: {query}"

def calculator_tool(expression: str) -> str:
    try:
        return str(eval(expression))
    except Exception as e:
        return f"计算错误: {e}"

# 创建工具列表
tools = [
    Tool(
        name="search",
        func=search_tool,
        description="搜索网络信息"
    ),
    Tool(
        name="calculator",
        func=calculator_tool,
        description="执行数学计算"
    )
]

# 创建 LLM
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# 创建 Agent
agent = create_openai_functions_agent(llm, tools)

# 创建执行器
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 运行
result = agent_executor.invoke({"input": "北京今天天气如何？"})
print(result["output"])
```

## Agent 最佳实践

### 1. 工具设计原则

```
✅ 单一职责：每个工具只做一件事
✅ 清晰描述：工具描述要准确
✅ 参数验证：确保参数合法性
✅ 错误处理：优雅处理失败情况
✅ 结果格式：返回结构化数据
```

### 2. 安全考虑

```python
class SecureAgent:
    """安全的 Agent"""
    
    def __init__(self):
        self.forbidden_actions = [
            "delete_files",
            "execute_shell",
            "send_email",
        ]
    
    def validate_action(self, action: str, parameters: Dict) -> bool:
        """验证操作是否安全"""
        if action in self.forbidden_actions:
            return False
        
        # 检查参数
        if "password" in str(parameters).lower():
            return False
        
        return True
    
    def execute_with_sandbox(self, action: str, parameters: Dict):
        """在沙箱中执行"""
        if not self.validate_action(action, parameters):
            raise PermissionError(f"操作 {action} 被禁止")
        
        # 在隔离环境中执行
        pass
```

### 3. 性能优化

```python
class CachedAgent:
    """带缓存的 Agent"""
    
    def __init__(self):
        self.cache = {}
    
    def get_cache_key(self, task: str) -> str:
        import hashlib
        return hashlib.md5(task.encode()).hexdigest()
    
    def run_with_cache(self, task: str) -> str:
        key = self.get_cache_key(task)
        
        if key in self.cache:
            return self.cache[key]
        
        result = self.run(task)
        self.cache[key] = result
        return result
```

## Agent 监控与可观测性

### 生产级监控系统

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent 监控架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  数据采集层：                                                   │
│  ├── Trace 采集：每个 Action 的完整执行链路                     │
│  ├── Metric 采集：延迟、成功率、Token 消耗                      │
│  ├── Log 采集：决策日志、工具调用日志                           │
│  └── Event 采集：状态变更、异常事件                             │
│                                                                 │
│  数据处理层：                                                   │
│  ├── 实时处理：流式聚合、异常检测                               │
│  └── 批处理：趋势分析、报告生成                                 │
│                                                                 │
│  展示告警层：                                                   │
│  ├── Dashboard：实时监控面板                                    │
│  ├── Alert：智能告警（基于规则 + ML）                           │
│  └── Trace：链路追踪与调试                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 监控代码实现

```python
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid
import json

@dataclass
class AgentTrace:
    """Agent 执行追踪"""
    trace_id: str
    agent_id: str
    task: str
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str = "running"
    steps: List[Dict] = field(default_factory=list)
    total_tokens: int = 0
    total_cost: float = 0.0
    error: Optional[str] = None
    
    def add_step(self, step: Dict):
        """添加执行步骤"""
        step["step_id"] = str(uuid.uuid4())[:8]
        step["timestamp"] = datetime.now().isoformat()
        self.steps.append(step)
    
    def finalize(self, status: str = "completed", error: str = None):
        """完成追踪"""
        self.end_time = datetime.now()
        self.status = status
        self.error = error

class AgentMonitor:
    """Agent 监控器"""
    
    def __init__(self, metrics_client=None):
        self.metrics = metrics_client or PrometheusMetrics()
        self.traces: Dict[str, AgentTrace] = {}
    
    def start_trace(self, agent_id: str, task: str) -> str:
        """开始追踪"""
        trace_id = str(uuid.uuid4())
        
        trace = AgentTrace(
            trace_id=trace_id,
            agent_id=agent_id,
            task=task,
            start_time=datetime.now()
        )
        
        self.traces[trace_id] = trace
        
        # 记录指标
        self.metrics.counter("agent_starts", labels={"agent_id": agent_id})
        
        return trace_id
    
    def record_thinking(self, trace_id: str, thought: str):
        """记录思考过程"""
        if trace_id in self.traces:
            self.traces[trace_id].add_step({
                "type": "thinking",
                "content": thought
            })
    
    def record_tool_call(
        self, 
        trace_id: str, 
        tool_name: str, 
        parameters: dict,
        result: Any = None,
        latency_ms: float = 0
    ):
        """记录工具调用"""
        if trace_id in self.traces:
            self.traces[trace_id].add_step({
                "type": "tool_call",
                "tool": tool_name,
                "parameters": parameters,
                "result": str(result)[:500] if result else None,
                "latency_ms": latency_ms
            })
            
            # 记录指标
            self.metrics.histogram(
                "tool_latency",
                latency_ms,
                labels={"tool": tool_name}
            )
    
    def record_llm_call(
        self,
        trace_id: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: float
    ):
        """记录 LLM 调用"""
        if trace_id in self.traces:
            self.traces[trace_id].total_tokens += input_tokens + output_tokens
            
            self.traces[trace_id].add_step({
                "type": "llm_call",
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms
            })
    
    def end_trace(
        self, 
        trace_id: str, 
        status: str = "completed",
        error: str = None
    ):
        """结束追踪"""
        if trace_id in self.traces:
            self.traces[trace_id].finalize(status, error)
            
            trace = self.traces[trace_id]
            duration_ms = (trace.end_time - trace.start_time).total_seconds() * 1000
            
            # 记录指标
            self.metrics.histogram(
                "agent_duration",
                duration_ms,
                labels={"agent_id": trace.agent_id, "status": status}
            )
            self.metrics.counter(
                "agent_completions",
                labels={"agent_id": trace.agent_id, "status": status}
            )
            
            # 发送到监控系统
            self._send_trace(trace)
    
    def _send_trace(self, trace: AgentTrace):
        """发送追踪数据"""
        # 发送到 Jaeger/Zipkin 等
        pass
    
    def get_trace(self, trace_id: str) -> Optional[AgentTrace]:
        """获取追踪记录"""
        return self.traces.get(trace_id)


# 带 Agent 监控的执行器
class MonitoredAgent:
    """带监控的 Agent"""
    
    def __init__(self, agent, monitor: AgentMonitor):
        self.agent = agent
        self.monitor = monitor
        self.agent_id = agent.__class__.__name__
    
    async def run(self, task: str) -> str:
        """执行任务并监控"""
        
        trace_id = self.monitor.start_trace(self.agent_id, task)
        
        try:
            result = await self._run_with_tracing(task, trace_id)
            
            self.monitor.end_trace(trace_id, status="completed")
            return result
            
        except Exception as e:
            self.monitor.end_trace(trace_id, status="failed", error=str(e))
            raise
    
    async def _run_with_tracing(self, task: str, trace_id: str) -> str:
        """带追踪的执行"""
        
        # 包装工具调用
        original_execute = self.agent.execute_tool
        
        async def wrapped_execute(tool_name, **kwargs):
            import time
            start = time.time()
            
            self.monitor.record_tool_call(
                trace_id, 
                tool_name, 
                kwargs,
                pending=True
            )
            
            try:
                result = await original_execute(tool_name, **kwargs)
                latency = (time.time() - start) * 1000
                
                self.monitor.record_tool_call(
                    trace_id,
                    tool_name,
                    kwargs,
                    result=result,
                    latency_ms=latency
                )
                
                return result
            except Exception as e:
                self.monitor.record_tool_call(
                    trace_id,
                    tool_name,
                    kwargs,
                    result=f"Error: {e}",
                    latency_ms=(time.time() - start) * 1000
                )
                raise
        
        self.agent.execute_tool = wrapped_execute
        
        return await self.agent.run(task)
```

### 错误恢复机制

```python
from enum import Enum
from typing import Optional, Callable
import asyncio

class RecoveryStrategy(Enum):
    """恢复策略"""
    RETRY = "retry"              # 重试
    ROLLBACK = "rollback"        # 回滚
    COMPENSATE = "compensate"    # 补偿
    ESCALATE = "escalate"        # 上报
    SKIP = "skip"               # 跳过

@dataclass
class RecoveryConfig:
    """恢复配置"""
    max_retries: int = 3
    retry_delay: float = 1.0
    backoff_multiplier: float = 2.0
    enable_checkpoint: bool = True
    checkpoint_interval: int = 5  # 每 N 步保存检查点

class RecoveryManager:
    """错误恢复管理器"""
    
    def __init__(self, config: RecoveryConfig = None):
        self.config = config or RecoveryConfig()
        self.checkpoints: Dict[str, Dict] = {}
        self.compensation_actions: Dict[str, Callable] = {}
    
    async def execute_with_recovery(
        self,
        agent,
        task: str,
        trace_id: str = None
    ) -> str:
        """带恢复机制的执行"""
        
        trace_id = trace_id or str(uuid.uuid4())
        attempt = 0
        last_error = None
        
        while attempt < self.config.max_retries:
            try:
                # 尝试从检查点恢复
                if attempt > 0 and self.config.enable_checkpoint:
                    checkpoint = self.checkpoints.get(trace_id)
                    if checkpoint:
                        await self._restore_from_checkpoint(agent, checkpoint)
                
                # 执行任务
                result = await agent.run(task)
                
                # 成功，清理检查点
                self.checkpoints.pop(trace_id, None)
                
                return result
                
            except RecoverableError as e:
                last_error = e
                attempt += 1
                
                # 保存检查点
                if self.config.enable_checkpoint:
                    await self._save_checkpoint(agent, trace_id)
                
                # 等待重试
                delay = self.config.retry_delay * (self.config.backoff_multiplier ** (attempt - 1))
                await asyncio.sleep(delay)
                
                # 记录重试
                logger.warning(f"Agent 执行失败，第 {attempt} 次重试: {e}")
                
            except UnrecoverableError as e:
                # 无法恢复的错误
                await self._handle_unrecoverable(e, trace_id)
                raise
        
        # 达到最大重试次数
        raise AgentMaxRetriesExceeded(
            f"达到最大重试次数 ({self.config.max_retries})",
            last_error=last_error
        )
    
    async def _save_checkpoint(self, agent, trace_id: str):
        """保存检查点"""
        checkpoint = {
            "agent_state": agent.get_state(),
            "timestamp": datetime.now().isoformat(),
            "completed_steps": agent.completed_steps
        }
        self.checkpoints[trace_id] = checkpoint
    
    async def _restore_from_checkpoint(self, agent, checkpoint: Dict):
        """从检查点恢复"""
        agent.restore_state(checkpoint["agent_state"])
    
    def register_compensation(self, action_id: str, callback: Callable):
        """注册补偿动作"""
        self.compensation_actions[action_id] = callback
    
    async def execute_compensation(self, trace_id: str):
        """执行补偿"""
        # 按逆序执行补偿动作
        pass


# 使用装饰器的恢复机制
def with_recovery(
    max_retries: int = 3,
    recovery_strategy: RecoveryStrategy = RecoveryStrategy.RETRY
):
    """恢复机制装饰器"""
    
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            attempt = 0
            last_error = None
            
            while attempt < max_retries:
                try:
                    return await func(*args, **kwargs)
                except RecoverableError as e:
                    last_error = e
                    attempt += 1
                    await asyncio.sleep(2 ** attempt)
                except Exception as e:
                    if recovery_strategy == RecoveryStrategy.SKIP:
                        logger.error(f"跳过失败: {e}")
                        return None
                    raise
            
            raise MaxRetriesExceeded(f"重试 {max_retries} 次后仍失败", last_error)
        
        return wrapper
    return decorator
```

### 告警规则配置

```yaml
# agent_alerts.yml
groups:
  - name: agent_alerts
    rules:
      - alert: AgentHighFailureRate
        expr: |
          rate(agent_completions{status="failed"}[5m]) / 
          rate(agent_completions[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Agent 失败率过高"
          description: "Agent {{ $labels.agent_id }} 失败率超过 10%"

      - alert: AgentLongRunning
        expr: agent_duration_seconds > 300
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Agent 执行时间过长"
          description: "Agent 执行超过 5 分钟"

      - alert: AgentToolFailure
        expr: rate(tool_errors_total[5m]) > 0.05
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "工具调用频繁失败"
          description: "工具 {{ $labels.tool }} 错误率过高"

      - alert: AgentInfiniteLoop
        expr: agent_steps_total > 50
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Agent 可能陷入循环"
          description: "Agent 执行步数超过 50，可能陷入循环"
```

## 小结

本章我们学习了：

1. **Agent 概念**：自主决策、工具调用、任务规划
2. **核心组件**：工具系统、规划器、执行器
3. **ReAct 架构**：推理与行动的循环
4. **多智能体协作**：角色分工与消息传递
5. **开发框架**：LangChain 等工具的使用
6. **最佳实践**：工具设计、安全考虑、性能优化

## 下一章预告

在最后一章《应用架构与生产部署》中，我们将学习：

- 生产级架构设计
- 性能优化策略
- 成本控制方案
- 监控告警系统

---

**教程系列持续更新中，欢迎关注！**
