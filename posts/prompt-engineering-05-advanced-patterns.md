---
title: "提示词工程（五）：高级提示模式"
date: "2026-03-06"
excerpt: "深入讲解高级提示工程模式，包括 ReAct（推理+行动）、Reflexion（自我反思）、Prompt Chaining（提示链）、Routing（路由）等技术，构建更强大的 AI 应用。"
tags: ["Prompt Engineering", "ReAct", "Reflexion", "Prompt Chaining", "LLM", "高级模式"]
series:
  slug: "prompt-engineering-tutorial"
  title: "提示词工程实战教程"
  order: 5
---

# 提示词工程（五）：高级提示模式

## 前言

在前面的文章中，我们学习了提示词工程的基础技巧和推理方法。本文将更上一层楼，探讨**高级提示模式**——这些模式将 LLM 与工具使用、自我反思、工作流编排相结合，能够构建出功能强大的 AI Agent 和复杂应用。

本文涵盖的核心模式：
- **ReAct**：推理与行动的循环结合
- **Reflexion**：自我反思与迭代改进
- **Prompt Chaining**：提示链分解复杂任务
- **Routing**：智能路由选择最优路径

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| ReAct 模式 | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| Reflexion 机制 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Prompt Chaining | ⭐⭐⭐ | 高频考点 | ✅ |
| Routing 模式 | ⭐⭐⭐ | 进阶考点 | ✅ |
| Multi-Agent 协作 | ⭐⭐⭐⭐⭐ | 前沿技术 | ✅ |

## 面试考点

1. 什么是 ReAct 模式？它和单纯的 Chain-of-Thought 有什么区别？
2. Reflexion 如何实现自我改进？它的核心组件有哪些？
3. Prompt Chaining 适用于什么场景？如何设计有效的链式结构？
4. Routing 模式解决了什么问题？常见的路由策略有哪些？
5. 如何设计多 Agent 协作系统？

## 一、ReAct（Reasoning + Acting）

### 1.1 什么是 ReAct

**ReAct**（Reasoning + Acting）是一种将**推理（Reasoning）**和**行动（Acting）**交替进行的模式。它让 LLM 不仅能思考，还能在思考过程中调用外部工具获取信息，形成"思考-行动-观察"的循环。

### 1.2 为什么需要 ReAct

传统 CoT 的问题是：**推理完全依赖模型的内部知识**，无法获取实时信息或进行外部计算。

ReAct 解决了这个问题：
```
┌─────────────────────────────────────────────────────────────┐
│                    ReAct 循环                               │
│                                                             │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐       │
│   │  Thought │─────▶│  Action  │─────▶│Observation│       │
│   │  (思考)   │      │  (行动)   │      │  (观察)   │       │
│   └────┬─────┘      └────┬─────┘      └────┬─────┘       │
│        │                 │                 │              │
│        │                 │                 │              │
│        └─────────────────┴─────────────────┘              │
│                          │                                │
│                          ▼                                │
│                    ┌──────────┐                          │
│                    │  Final   │                          │
│                    │  Answer  │                          │
│                    └──────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 ReAct 核心结构

每个 ReAct 步骤包含三个部分：

1. **Thought（思考）**：分析当前情况，决定下一步行动
2. **Action（行动）**：执行具体操作（如搜索、计算）
3. **Observation（观察）**：获取行动的结果

### 1.4 ReAct 实例：问答系统

**问题**：2024 年奥斯卡最佳男主角是谁？他主演过哪些电影？

**ReAct 执行过程**

```
问题：2024 年奥斯卡最佳男主角是谁？他主演过哪些电影？

Thought 1: 我需要查找 2024 年奥斯卡最佳男主角的信息。
           我应该使用搜索工具来获取这个信息。
Action 1: Search["2024 年奥斯卡最佳男主角"]
Observation 1: 2024 年第 96 届奥斯卡金像奖最佳男主角是基里安·墨菲（Cillian Murphy），
               凭借电影《奥本海默》获奖。

Thought 2: 好的，我知道了获奖者是基里安·墨菲。现在需要查找他主演过的电影。
           我应该搜索他的电影作品。
Action 2: Search["基里安·墨菲 主演电影"]
Observation 2: 基里安·墨菲主演过的电影包括：《奥本海默》、《浴血黑帮》系列、
               《盗梦空间》、《蝙蝠侠：侠影之谜》、《敦刻尔克》等。

Thought 3: 我现在有了所有需要的信息，可以回答用户的问题了。
Action 3: Finish["2024 年奥斯卡最佳男主角是基里安·墨菲（Cillian Murphy），
                 他凭借电影《奥本海默》获奖。他主演过的电影包括《奥本海默》、
                 《浴血黑帮》系列、《盗梦空间》、《蝙蝠侠：侠影之谜》、
                 《敦刻尔克》等。"]
```

### 1.5 ReAct Prompt 设计

```
你是一个智能助手，可以使用以下工具：

工具：
1. Search[query] - 使用搜索引擎查询信息
2. Calculator[expression] - 计算数学表达式
3. Weather[city] - 查询指定城市的天气
4. Finish[answer] - 给出最终答案

请按照以下格式回答问题：

Thought: [你的思考过程，分析当前情况]
Action: [工具名称][参数]

然后你会得到 Observation，继续这个过程直到获得足够信息。
最后使用 Finish 工具给出答案。

示例：

问题：15 × 23 等于多少？
Thought: 这是一个数学计算问题，我可以使用计算器工具。
Action: Calculator[15 * 23]
Observation: 345
Thought: 我已经得到了计算结果。
Action: Finish[15 × 23 = 345]

现在请回答以下问题：
{用户问题}
```

### 1.6 ReAct 完整代码实现

```python
import re

class ReActAgent:
    def __init__(self, llm, tools):
        """
        ReAct Agent 实现
        
        Args:
            llm: 语言模型接口
            tools: 工具字典，如 {'Search': search_func, 'Calculator': calc_func}
        """
        self.llm = llm
        self.tools = tools
        self.max_iterations = 10
    
    def run(self, query):
        """执行 ReAct 循环"""
        prompt = self._build_prompt(query)
        history = []
        
        for i in range(self.max_iterations):
            # 生成下一步
            response = self.llm.generate(prompt)
            
            # 解析 Thought 和 Action
            thought, action, action_input = self._parse_response(response)
            
            print(f"Step {i+1}:")
            print(f"  Thought: {thought}")
            print(f"  Action: {action}[{action_input}]")
            
            # 检查是否完成
            if action == "Finish":
                return action_input
            
            # 执行工具
            if action in self.tools:
                observation = self.tools[action](action_input)
                print(f"  Observation: {observation}")
                
                # 更新历史
                history.append({
                    'thought': thought,
                    'action': action,
                    'action_input': action_input,
                    'observation': observation
                })
                
                # 更新 prompt
                prompt = self._update_prompt(query, history)
            else:
                raise ValueError(f"Unknown action: {action}")
        
        return "Max iterations reached"
    
    def _build_prompt(self, query):
        """构建初始 Prompt"""
        return f"""你是一个智能助手，可以使用以下工具：

工具：
1. Search[query] - 搜索信息
2. Calculator[expression] - 计算表达式
3. Finish[answer] - 给出最终答案

请按照以下格式回答：
Thought: [思考]
Action: [工具][参数]

问题：{query}
Thought:"""
    
    def _parse_response(self, response):
        """解析模型响应"""
        thought_match = re.search(r'Thought:\s*(.+?)(?=Action:|$)', response, re.DOTALL)
        action_match = re.search(r'Action:\s*(\w+)\[(.+?)\]', response)
        
        thought = thought_match.group(1).strip() if thought_match else ""
        action = action_match.group(1) if action_match else ""
        action_input = action_match.group(2) if action_match else ""
        
        return thought, action, action_input
    
    def _update_prompt(self, query, history):
        """更新 Prompt 包含历史记录"""
        prompt = f"""你是一个智能助手，可以使用以下工具：

工具：
1. Search[query] - 搜索信息
2. Calculator[expression] - 计算表达式
3. Finish[answer] - 给出最终答案

问题：{query}

"""
        
        for item in history:
            prompt += f"Thought: {item['thought']}\n"
            prompt += f"Action: {item['action']}[{item['action_input']}]\n"
            prompt += f"Observation: {item['observation']}\n\n"
        
        prompt += "Thought:"
        return prompt
```

### 1.7 ReAct 适用场景

| 场景 | 为什么适用 | 示例 |
|------|------------|------|
| 知识问答 | 需要外部知识库 | "谁获得了 2023 年诺贝尔奖？" |
| 数学计算 | 需要精确计算 | "计算 12345 × 67890" |
| 多步骤任务 | 需要分解执行 | "查询北京天气，然后推荐穿衣" |
| 实时信息 | 需要最新数据 | "今天美元兑人民币汇率是多少？" |
| 数据库查询 | 需要结构化数据 | "查询用户 ID 123 的订单信息" |

## 二、Reflexion（自我反思）

### 2.1 什么是 Reflexion

**Reflexion** 是一种让 AI 系统**自我反思并改进**的框架。它不仅关注任务执行，还会在执行后分析成功或失败的原因，并将这些洞察存储到记忆中，用于改进未来的表现。

### 2.2 Reflexion 核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                      Reflexion 框架                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐                                            │
│  │    Actor    │ ← 执行任务的 Agent（如 ReAct Agent）       │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  执行结果    │───▶│  Evaluator  │───▶│    评分     │     │
│  │  (成功/失败) │    │  (评估器)    │    │  (1-10分)   │     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘     │
│                                               │             │
│                                               ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  更新记忆    │◀───│   Memory    │◀───│  Self-      │     │
│  │  (经验积累)  │    │  (记忆库)    │    │  Reflexion  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                                                   │
│         └──────────────────────────────────┐                │
│                                            ▼                │
│                                     ┌─────────────┐         │
│                                     │  下一次尝试  │         │
│                                     └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Reflexion 工作流程

```python
class ReflexionAgent:
    def __init__(self, actor, evaluator, llm):
        """
        Reflexion Agent
        
        Args:
            actor: 执行任务的 Agent
            evaluator: 评估结果的函数
            llm: 用于自我反思的语言模型
        """
        self.actor = actor
        self.evaluator = evaluator
        self.llm = llm
        self.memory = []  # 存储反思结果
        self.max_trials = 3
    
    def run(self, task):
        """执行带反思的任务"""
        for trial in range(self.max_trials):
            print(f"\n=== Trial {trial + 1} ===")
            
            # 1. Actor 执行任务
            if self.memory:
                # 将之前的反思加入上下文
                context = self._build_context(task)
                result = self.actor.run(context)
            else:
                result = self.actor.run(task)
            
            print(f"Result: {result}")
            
            # 2. Evaluator 评估结果
            score, is_success = self.evaluator.evaluate(task, result)
            print(f"Score: {score}/10, Success: {is_success}")
            
            # 3. 如果成功，直接返回
            if is_success:
                return result
            
            # 4. Self-Reflection：分析失败原因
            reflection = self._self_reflect(task, result, score)
            print(f"Reflection: {reflection}")
            
            # 5. 存储反思结果到记忆
            self.memory.append({
                'trial': trial + 1,
                'result': result,
                'score': score,
                'reflection': reflection
            })
        
        # 达到最大尝试次数，返回最佳结果
        best_trial = max(self.memory, key=lambda x: x['score'])
        return best_trial['result']
    
    def _self_reflect(self, task, result, score):
        """进行自我反思"""
        prompt = f"""请分析以下任务失败的原因，并提出改进建议。

原始任务：{task}
执行结果：{result}
得分：{score}/10

请回答：
1. 为什么这次尝试没有成功？
2. 主要的错误在哪里？
3. 下次应该如何改进？
4. 有什么经验教训可以总结？

反思："""
        
        return self.llm.generate(prompt)
    
    def _build_context(self, task):
        """构建带有反思记忆的上下文"""
        context = f"任务：{task}\n\n"
        context += "之前的尝试和经验教训：\n"
        
        for mem in self.memory:
            context += f"\n尝试 {mem['trial']}:\n"
            context += f"结果：{mem['result']}\n"
            context += f"反思：{mem['reflection']}\n"
        
        context += "\n请基于以上经验，再次尝试完成这个任务。\n"
        return context
```

### 2.4 Reflexion 实例：代码生成

**任务**：编写一个函数，计算列表中的中位数。

**Trial 1**
```python
# Actor 生成的代码
def median(numbers):
    numbers.sort()
    return numbers[len(numbers) // 2]

# Evaluator 评分
测试用例 1: [1, 3, 5] → 期望: 3, 实际: 5 ❌
测试用例 2: [1, 2, 3, 4] → 期望: 2.5, 实际: 3 ❌
评分: 3/10

# Self-Reflection
反思：
1. 失败原因：代码没有正确处理奇数和偶数长度列表的情况
2. 主要错误：
   - 对于偶数长度列表，应该取中间两个数的平均值
   - 对于奇数长度列表，应该取中间的那个数
3. 改进建议：需要判断列表长度的奇偶性，分别处理
4. 经验教训：中位数计算需要考虑奇偶两种情况
```

**Trial 2**
```python
# Actor 基于反思生成的代码
def median(numbers):
    if not numbers:
        return None
    
    sorted_nums = sorted(numbers)
    n = len(sorted_nums)
    
    if n % 2 == 1:
        return sorted_nums[n // 2]
    else:
        return (sorted_nums[n // 2 - 1] + sorted_nums[n // 2]) / 2

# Evaluator 评分
测试用例 1: [1, 3, 5] → 期望: 3, 实际: 3 ✓
测试用例 2: [1, 2, 3, 4] → 期望: 2.5, 实际: 2.5 ✓
测试用例 3: [] → 期望: None, 实际: None ✓
评分: 10/10

# 成功！
```

### 2.5 Reflexion 的应用价值

| 场景 | 价值 |
|------|------|
| 代码生成 | 通过测试反馈改进代码质量 |
| 数学推理 | 通过答案验证改进推理过程 |
| 问答系统 | 通过答案准确性改进检索策略 |
| 决策任务 | 通过结果反馈改进决策逻辑 |
| 创意写作 | 通过评分反馈改进创作质量 |

## 三、Prompt Chaining（提示链）

### 3.1 什么是 Prompt Chaining

**Prompt Chaining** 是将复杂任务分解为多个子任务，每个子任务由一个独立的 Prompt 处理，然后将输出传递给下一个 Prompt，形成链式处理流程。

### 3.2 为什么使用 Prompt Chaining

```
单一 Prompt 的问题：
- 任务太复杂，模型难以理解
- 中间错误无法修正
- Token 消耗过大
- 难以调试和优化

Prompt Chaining 的优势：
- 任务分解，每个步骤更简单
- 中间结果可验证、可修正
- 便于模块化管理和复用
- 更容易调试和优化
```

### 3.3 Prompt Chaining 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Prompt Chaining                          │
│                                                             │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐         │
│  │  Prompt  │      │  Prompt  │      │  Prompt  │         │
│  │    1     │─────▶│    2     │─────▶│    3     │         │
│  │ (提取)   │      │ (分析)   │      │ (生成)   │         │
│  └────┬─────┘      └────┬─────┘      └────┬─────┘         │
│       │                 │                 │               │
│       ▼                 ▼                 ▼               │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐         │
│  │  Output  │      │  Output  │      │  Output  │         │
│  │  (实体)  │      │ (关系)   │      │ (最终)   │         │
│  └──────────┘      └──────────┘      └──────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Prompt Chaining 实例：文章生成

**任务**：根据主题生成一篇高质量的技术博客文章。

**Chain 设计**

```python
class BlogGenerationChain:
    def __init__(self, llm):
        self.llm = llm
    
    def run(self, topic):
        """执行文章生成链"""
        
        # Step 1: 生成大纲
        print("Step 1: 生成大纲...")
        outline = self._generate_outline(topic)
        print(f"大纲：\n{outline}\n")
        
        # Step 2: 为每个章节生成要点
        print("Step 2: 生成章节要点...")
        sections = self._generate_section_points(outline)
        print(f"章节要点：{sections}\n")
        
        # Step 3: 逐节生成内容
        print("Step 3: 生成文章内容...")
        content = self._generate_content(sections)
        print(f"内容生成完成\n")
        
        # Step 4: 润色和优化
        print("Step 4: 润色文章...")
        final_article = self._polish_article(content)
        print(f"润色完成\n")
        
        return final_article
    
    def _generate_outline(self, topic):
        """步骤 1：生成文章大纲"""
        prompt = f"""请为主题「{topic}」生成一篇技术博客文章的大纲。

要求：
1. 包含 4-6 个主要章节
2. 每个章节有明确的标题
3. 简要说明每个章节的核心内容
4. 章节之间要有逻辑递进关系

输出格式：
1. [章节标题] - [核心内容简述]
2. [章节标题] - [核心内容简述]
..."""
        
        return self.llm.generate(prompt)
    
    def _generate_section_points(self, outline):
        """步骤 2：为每个章节生成要点"""
        prompt = f"""基于以下大纲，为每个章节生成 3-5 个关键要点。

大纲：
{outline}

要求：
1. 每个要点应该是一个完整的观点
2. 要点之间要有逻辑关系
3. 要点要具体、可展开

输出格式：
章节 1：标题
- 要点 1
- 要点 2
..."""
        
        return self.llm.generate(prompt)
    
    def _generate_content(self, sections):
        """步骤 3：生成完整内容"""
        full_content = []
        
        # 将章节拆分，逐节生成
        section_list = self._parse_sections(sections)
        
        for i, section in enumerate(section_list, 1):
            prompt = f"""请为以下章节生成详细内容。

章节信息：
{section}

要求：
1. 字数：500-800 字
2. 包含代码示例或具体案例
3. 语言通俗易懂
4. 与前后章节保持连贯

生成内容："""
            
            section_content = self.llm.generate(prompt)
            full_content.append(section_content)
        
        return "\n\n".join(full_content)
    
    def _polish_article(self, content):
        """步骤 4：润色和优化"""
        prompt = f"""请对以下文章进行润色和优化。

原文：
{content}

优化要求：
1. 统一全文的语气和风格
2. 确保段落之间的过渡自然
3. 修正语法和表达问题
4. 添加适当的标题层级
5. 确保技术术语使用准确

优化后的文章："""
        
        return self.llm.generate(prompt)
```

### 3.5 Prompt Chaining 最佳实践

**实践 1：明确每个步骤的输入输出**
```python
# 每个步骤应该明确定义输入和输出格式
def step_n(input_data: StepNInput) -> StepNOutput:
    """
    步骤 N 的描述
    
    输入：前一步骤的输出
    输出：结构化数据，供下一步使用
    """
    pass
```

**实践 2：添加验证节点**
```python
def validate_output(output, expected_format):
    """验证中间输出是否符合预期"""
    if not matches_format(output, expected_format):
        # 重新生成或人工介入
        return regenerate_or_escalate(output)
    return output

# 在链中使用
output1 = step1(input)
output1 = validate_output(output1, expected_format1)

output2 = step2(output1)
output2 = validate_output(output2, expected_format2)
```

**实践 3：错误处理和重试**
```python
from tenacity import retry, stop_after_attempt

class RobustChain:
    @retry(stop=stop_after_attempt(3))
    def step_with_retry(self, prompt):
        """带重试机制的步骤"""
        result = self.llm.generate(prompt)
        if not self._validate(result):
            raise ValueError("Invalid output")
        return result
```

## 四、Routing（路由）

### 4.1 什么是 Routing

**Routing** 是根据输入的特征，将请求路由到最适合处理该请求的子系统或模型的模式。

### 4.2 Routing 解决的问题

```
场景：一个通用的客服系统需要处理不同类型的用户问题

问题类型：
- 技术支持（需要技术专家模型）
- 账单查询（需要数据库查询工具）
- 投诉建议（需要情感分析和升级流程）
- 产品咨询（需要产品知识库）

解决方案：使用 Router 自动识别问题类型并路由到对应处理器
```

### 4.3 Routing 架构

```
┌─────────────────────────────────────────────────────────────┐
│                       Routing 架构                          │
│                                                             │
│                        ┌─────────┐                         │
│                        │  Input  │                         │
│                        └────┬────┘                         │
│                             │                               │
│                             ▼                               │
│                     ┌───────────────┐                       │
│                     │     Router    │                       │
│                     │  (分类/路由)   │                       │
│                     └───────┬───────┘                       │
│                             │                               │
│           ┌─────────────────┼─────────────────┐            │
│           │                 │                 │            │
│           ▼                 ▼                 ▼            │
│    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│    │   Handler A │   │   Handler B │   │   Handler C │    │
│    │  (技术支持)  │   │  (账单查询)  │   │  (投诉处理)  │    │
│    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘    │
│           │                 │                 │            │
│           └─────────────────┼─────────────────┘            │
│                             │                               │
│                             ▼                               │
│                        ┌─────────┐                         │
│                        │ Output  │                         │
│                        └─────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 基于 LLM 的 Router 实现

```python
class LLMRouter:
    def __init__(self, llm, handlers):
        """
        LLM-based Router
        
        Args:
            llm: 用于分类的语言模型
            handlers: 处理器字典，如 {'tech': tech_handler, 'billing': billing_handler}
        """
        self.llm = llm
        self.handlers = handlers
    
    def route(self, query):
        """路由请求到合适的处理器"""
        # 1. 使用 LLM 分类
        category = self._classify(query)
        print(f"分类结果：{category}")
        
        # 2. 获取对应的处理器
        handler = self.handlers.get(category)
        if not handler:
            handler = self.handlers.get('default')
        
        # 3. 执行处理
        return handler.handle(query)
    
    def _classify(self, query):
        """使用 LLM 进行分类"""
        prompt = f"""请将以下用户查询分类到最合适的类别。

可用类别：
- tech: 技术问题，如软件使用、故障排除、功能咨询
- billing: 账单问题，如费用查询、退款、支付方式
- complaint: 投诉建议，如服务不满、产品缺陷
- sales: 销售咨询，如产品购买、升级、功能对比
- general: 其他一般性问题

用户查询：{query}

请只输出类别标签（如：tech）："""
        
        category = self.llm.generate(prompt).strip().lower()
        
        # 验证类别是否有效
        if category not in self.handlers:
            return 'default'
        
        return category
```

### 4.5 基于嵌入的 Router 实现

```python
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

class EmbeddingRouter:
    def __init__(self, embedding_model, handlers, examples):
        """
        基于嵌入的 Router
        
        Args:
            embedding_model: 向量化模型
            handlers: 处理器字典
            examples: 每个类别的示例列表
                     {'tech': ['怎么安装软件？', '程序崩溃了'], ...}
        """
        self.embedding_model = embedding_model
        self.handlers = handlers
        
        # 预计算每个类别的示例嵌入
        self.category_embeddings = {}
        for category, texts in examples.items():
            embeddings = self.embedding_model.encode(texts)
            self.category_embeddings[category] = np.mean(embeddings, axis=0)
    
    def route(self, query):
        """基于相似度路由"""
        # 1. 计算查询的嵌入
        query_embedding = self.embedding_model.encode([query])[0]
        
        # 2. 计算与每个类别的相似度
        similarities = {}
        for category, cat_embedding in self.category_embeddings.items():
            sim = cosine_similarity(
                [query_embedding], 
                [cat_embedding]
            )[0][0]
            similarities[category] = sim
        
        # 3. 选择最相似的类别
        best_category = max(similarities, key=similarities.get)
        print(f"相似度：{similarities}")
        print(f"最佳匹配：{best_category}")
        
        # 4. 执行处理
        handler = self.handlers.get(best_category)
        return handler.handle(query)
```

### 4.6 混合路由策略

```python
class HybridRouter:
    """结合多种路由策略的混合路由器"""
    
    def __init__(self, llm, embedding_model, handlers, examples):
        self.llm_router = LLMRouter(llm, handlers)
        self.embedding_router = EmbeddingRouter(embedding_model, handlers, examples)
        self.confidence_threshold = 0.8
    
    def route(self, query):
        """智能选择路由策略"""
        # 首先尝试嵌入路由（更快）
        query_embedding = self.embedding_model.encode([query])[0]
        similarities = self._compute_similarities(query_embedding)
        
        max_sim = max(similarities.values())
        
        if max_sim > self.confidence_threshold:
            # 置信度高，使用嵌入路由
            print("使用嵌入路由（高置信度）")
            category = max(similarities, key=similarities.get)
            return self.handlers[category].handle(query)
        elif max_sim > 0.5:
            # 置信度中等，结合 LLM 路由
            print("使用混合路由")
            llm_category = self.llm_router._classify(query)
            embedding_category = max(similarities, key=similarities.get)
            
            # 如果两者一致，直接返回；否则使用 LLM 的结果
            if llm_category == embedding_category:
                return self.handlers[llm_category].handle(query)
            else:
                # 使用 LLM 的结果（通常更准确）
                return self.handlers[llm_category].handle(query)
        else:
            # 置信度低，使用 LLM 路由
            print("使用 LLM 路由（低置信度）")
            return self.llm_router.route(query)
```

## 五、Multi-Agent 协作

### 5.1 什么是 Multi-Agent 系统

**Multi-Agent 系统**由多个专门的 AI Agent 组成，每个 Agent 负责特定任务，通过协作完成复杂的目标。

### 5.2 Multi-Agent 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Multi-Agent 系统                         │
│                                                             │
│                    ┌─────────────┐                         │
│                    │  Coordinator│                         │
│                    │  (协调者)    │                         │
│                    └──────┬──────┘                         │
│                           │                                 │
│         ┌─────────────────┼─────────────────┐              │
│         │                 │                 │              │
│         ▼                 ▼                 ▼              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐      │
│  │  Researcher │   │   Writer    │   │   Reviewer  │      │
│  │  (研究员)    │   │  (撰写员)    │   │  (审查员)    │      │
│  └─────────────┘   └─────────────┘   └─────────────┘      │
│         │                 │                 │              │
│         └─────────────────┼─────────────────┘              │
│                           │                                 │
│                           ▼                                 │
│                    ┌─────────────┐                         │
│                    │   Output    │                         │
│                    └─────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Multi-Agent 实例：内容创作团队

```python
class ContentCreationTeam:
    def __init__(self, llm):
        self.llm = llm
        
        # 定义各个 Agent
        self.agents = {
            'researcher': ResearcherAgent(llm),
            'writer': WriterAgent(llm),
            'editor': EditorAgent(llm),
            'reviewer': ReviewerAgent(llm)
        }
    
    def create_content(self, topic):
        """协作创建内容"""
        print("=== 开始内容创作流程 ===\n")
        
        # Step 1: 研究员收集信息
        print("[Researcher] 收集资料...")
        research_data = self.agents['researcher'].research(topic)
        print(f"收集到 {len(research_data)} 条关键信息\n")
        
        # Step 2: 撰写员创作初稿
        print("[Writer] 撰写文章...")
        draft = self.agents['writer'].write(topic, research_data)
        print(f"初稿完成，字数：{len(draft)}\n")
        
        # Step 3: 编辑润色
        print("[Editor] 编辑润色...")
        edited = self.agents['editor'].edit(draft)
        print("编辑完成\n")
        
        # Step 4: 审查员评估
        print("[Reviewer] 质量审查...")
        feedback = self.agents['reviewer'].review(edited)
        print(f"审查意见：{feedback}\n")
        
        # 根据反馈决定是否迭代
        if self._needs_revision(feedback):
            print("需要修改，进入迭代...")
            final = self._revise(edited, feedback)
        else:
            final = edited
        
        return final
    
    def _needs_revision(self, feedback):
        """判断是否需要修改"""
        # 解析反馈中的评分
        score = self._extract_score(feedback)
        return score < 8  # 低于 8 分需要修改
    
    def _revise(self, content, feedback):
        """根据反馈修改"""
        revision_prompt = f"""请根据以下审查意见修改文章。

原文：
{content}

审查意见：
{feedback}

请修改文章，解决以上问题。"""
        
        return self.llm.generate(revision_prompt)

class ResearcherAgent:
    def __init__(self, llm):
        self.llm = llm
    
    def research(self, topic):
        """研究主题，收集关键信息"""
        prompt = f"""作为研究员，请为主题「{topic}」收集关键信息。

请提供：
1. 核心概念和定义
2. 重要的背景信息
3. 相关的数据或案例
4. 不同的观点和争议

以 bullet points 形式输出。"""
        
        return self.llm.generate(prompt)

class WriterAgent:
    def __init__(self, llm):
        self.llm = llm
    
    def write(self, topic, research_data):
        """基于研究数据撰写文章"""
        prompt = f"""作为撰稿人，请基于以下研究资料撰写一篇关于「{topic}」的文章。

研究资料：
{research_data}

要求：
1. 结构清晰，包含引言、主体、结论
2. 语言通俗易懂
3. 字数 1000-1500 字
4. 引用研究资料中的关键信息

文章："""
        
        return self.llm.generate(prompt)

class EditorAgent:
    def __init__(self, llm):
        self.llm = llm
    
    def edit(self, draft):
        """编辑润色文章"""
        prompt = f"""作为编辑，请对以下文章进行润色。

原文：
{draft}

编辑要点：
1. 修正语法和拼写错误
2. 优化句子结构，提高可读性
3. 确保逻辑连贯
4. 统一术语使用
5. 调整段落长度

润色后的文章："""
        
        return self.llm.generate(prompt)

class ReviewerAgent:
    def __init__(self, llm):
        self.llm = llm
    
    def review(self, content):
        """审查文章质量"""
        prompt = f"""作为审查员，请评估以下文章的质量。

文章：
{content}

请从以下维度评分（1-10 分）：
1. 内容准确性
2. 结构清晰度
3. 语言表达
4. 逻辑连贯性
5. 读者价值

总体评分：[X]/10

具体意见：
- 优点：
- 不足：
- 改进建议："""
        
        return self.llm.generate(prompt)
```

## 六、实战：构建一个智能客服系统

### 6.1 系统架构

```
用户输入 → Router → [技术支持/账单/投诉/销售] → 各子系统处理 → 整合输出
                  ↓
            [无法分类] → 通用客服 → 人工转接
```

### 6.2 完整实现

```python
class IntelligentCustomerService:
    def __init__(self, llm):
        self.llm = llm
        
        # 初始化各个子系统
        self.router = LLMRouter(llm, {
            'tech': TechSupportSystem(llm),
            'billing': BillingSystem(llm),
            'complaint': ComplaintSystem(llm),
            'sales': SalesSystem(llm),
            'default': GeneralSupportSystem(llm)
        })
    
    def handle(self, user_query):
        """处理用户查询"""
        print(f"用户：{user_query}\n")
        
        # 路由到对应系统
        response = self.router.route(user_query)
        
        print(f"客服：{response}\n")
        return response

class TechSupportSystem:
    """技术支持子系统 - 使用 ReAct 模式"""
    
    def __init__(self, llm):
        self.llm = llm
    
    def handle(self, query):
        """使用 ReAct 处理技术问题"""
        # 这里可以接入知识库搜索、诊断工具等
        prompt = f"""你是一位技术支持专家。请帮助用户解决以下技术问题。

用户问题：{query}

请提供：
1. 问题诊断（可能的原因）
2. 分步解决方案
3. 如果问题持续，建议的下一步操作

回答："""
        
        return self.llm.generate(prompt)

class BillingSystem:
    """账单查询子系统 - 使用 Prompt Chaining"""
    
    def __init__(self, llm):
        self.llm = llm
    
    def handle(self, query):
        """使用 Chain 处理账单问题"""
        # Step 1: 识别查询类型
        query_type = self._classify_query(query)
        
        # Step 2: 根据类型处理
        if query_type == 'check':
            return self._handle_balance_query(query)
        elif query_type == 'refund':
            return self._handle_refund_request(query)
        else:
            return self._handle_general_billing(query)
    
    def _classify_query(self, query):
        """分类账单查询类型"""
        # 实现分类逻辑
        pass

# ... 其他子系统实现
```

## 总结

本文介绍了提示词工程的四种高级模式：

1. **ReAct（推理+行动）**：交替进行思考和行动，可以调用外部工具获取信息，适用于需要实时数据或计算的任务。

2. **Reflexion（自我反思）**：通过评估-反思-改进的循环，让系统从错误中学习，持续提升表现。

3. **Prompt Chaining（提示链）**：将复杂任务分解为多个子任务，每个子任务由一个专门的 Prompt 处理，便于管理和优化。

4. **Routing（路由）**：根据输入特征智能选择处理路径，提高系统的灵活性和效率。

**进阶组合**：这些模式可以组合使用，例如：
- Router + ReAct：根据问题类型选择是否使用工具
- Chain + Reflexion：在链的每个节点进行反思和优化
- Multi-Agent：多个 ReAct Agent 协作完成任务

在下一篇文章中，我们将探讨 **RAG（检索增强生成）的提示优化**，学习如何在 Prompt 中有效利用检索到的知识。

## 参考资料

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [Reflexion: Self-Reflective Agents](https://arxiv.org/abs/2303.11366)
- [LangChain Documentation - Chains](https://python.langchain.com/docs/modules/chains/)
- [LlamaIndex - Routing](https://docs.llamaindex.ai/en/stable/module_guides/deploying/query_engine/router/)
- [Multi-Agent Reinforcement Learning: A Comprehensive Survey](https://arxiv.org/abs/2312.05117)
