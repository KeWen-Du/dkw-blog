---
title: "提示词工程（四）：链式思考技术"
date: "2026-03-06"
excerpt: "深入讲解 Chain-of-Thought（CoT）提示技术及其进阶变体，包括 Zero-shot CoT、Self-Consistency、Tree of Thoughts 等方法，帮助模型像人类一样进行多步推理。"
tags: ["Prompt Engineering", "Chain of Thought", "CoT", "Reasoning", "LLM", "推理技术"]
series:
  slug: "prompt-engineering-tutorial"
  title: "提示词工程实战教程"
  order: 4
---

# 提示词工程（四）：链式思考技术

## 前言

大语言模型在处理复杂推理任务时，如果只是直接输出答案，往往容易出现错误。**链式思考（Chain-of-Thought, CoT）** 技术通过引导模型像人类一样"一步步思考"，显著提升了模型在数学推理、逻辑推理、常识推理等任务上的表现。

本文将系统讲解链式思考技术的核心方法和进阶变体：
- **基础 CoT**：通过示例展示推理过程
- **Zero-shot CoT**：无需示例也能触发推理
- **Self-Consistency**：多路径推理取多数
- **Tree of Thoughts**：探索多个推理路径

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Chain-of-Thought 原理 | ⭐⭐⭐ | 高频考点 | ✅ |
| Zero-shot CoT | ⭐⭐ | 高频考点 | ✅ |
| Self-Consistency | ⭐⭐⭐ | 进阶考点 | ✅ |
| Tree of Thoughts | ⭐⭐⭐⭐ | 前沿技术 | ✅ |
| Automatic CoT | ⭐⭐⭐⭐ | 前沿技术 | ✅ |

## 面试考点

1. 什么是 Chain-of-Thought？为什么它能提升推理能力？
2. CoT 适用于哪些类型的任务？
3. Zero-shot CoT 和 Few-shot CoT 有什么区别？
4. Self-Consistency 的工作原理是什么？
5. Tree of Thoughts 与传统 CoT 有什么不同？

## 一、为什么需要链式思考

### 1.1 直接回答的问题

```
问题：一个农场有 5 只鸡，每只鸡每天下 2 个蛋。
      一周能收集多少个蛋？

❌ 直接回答（容易出错）
答案：10 个
（错误原因：只计算了一天的量）
```

### 1.2 人类是如何思考的

```
人类解决这个问题的思考过程：

第 1 步：确定已知信息
- 鸡的数量：5 只
- 每只鸡每天下蛋：2 个
- 时间：1 周 = 7 天

第 2 步：计算每天的总产量
- 每天产蛋 = 5 只 × 2 个/只 = 10 个

第 3 步：计算一周的产量
- 一周产蛋 = 10 个/天 × 7 天 = 70 个

答案：70 个蛋
```

### 1.3 CoT 的核心思想

**Chain-of-Thought** 的核心思想是：**让模型显式地输出推理的中间步骤，而不是直接给出最终答案**。

```
好处：
1. 将复杂问题分解为多个简单步骤
2. 每个步骤的错误更容易被发现和纠正
3. 推理过程可解释、可验证
4. 显著提升复杂任务的准确率
```

## 二、基础 Chain-of-Thought

### 2.1 Few-shot CoT

通过在示例中展示推理过程，引导模型学习链式思考。

**标准 Few-shot（无推理过程）**
```
问题：一个农场有 3 只羊，每只羊有 4 条腿。一共有多少条腿？
答案：12

问题：一个果园有 4 棵树，每棵树结 5 个果子。一共有多少个果子？
答案：20

问题：一个农场有 5 只鸡，每只鸡每天下 2 个蛋。一周能收集多少个蛋？
答案：
```

**CoT Few-shot（带推理过程）**
```
问题：一个农场有 3 只羊，每只羊有 4 条腿。一共有多少条腿？
推理：农场有 3 只羊，每只羊 4 条腿，所以总腿数 = 3 × 4 = 12。
答案：12

问题：一个果园有 4 棵树，每棵树结 5 个果子。一共有多少个果子？
推理：果园有 4 棵树，每棵树 5 个果子，所以总果子数 = 4 × 5 = 20。
答案：20

问题：一个农场有 5 只鸡，每只鸡每天下 2 个蛋。一周能收集多少个蛋？
推理：
```

### 2.2 CoT 示例设计要点

**要点 1：推理步骤要自然**
```
✅ 好的推理
农场有 5 只鸡，每只鸡每天下 2 个蛋。
首先计算每天的总产量：5 × 2 = 10 个蛋。
一周有 7 天，所以一周的总产量是：10 × 7 = 70 个蛋。

❌ 差的推理
5 × 2 = 10，10 × 7 = 70。答案：70。
（过于简略，没有解释每个数字的含义）
```

**要点 2：步骤之间要有逻辑连接**
```
✅ 有逻辑连接
因为每只鸡每天下 2 个蛋，所以 5 只鸡每天下 10 个蛋。
一周有 7 天，因此一周总共可以收集 70 个蛋。

❌ 缺乏连接
5 只鸡。每只 2 个蛋。每天 10 个。7 天。70 个。
```

### 2.3 CoT 适用场景

| 任务类型 | CoT 效果 | 示例 |
|----------|----------|------|
| 数学推理 | ⭐⭐⭐⭐⭐ | 算术、代数、几何 |
| 逻辑推理 | ⭐⭐⭐⭐⭐ | 逻辑谜题、条件推理 |
| 常识推理 | ⭐⭐⭐⭐ | 物理常识、因果推断 |
| 符号操作 | ⭐⭐⭐⭐ | 字符串操作、格式转换 |
| 简单分类 | ⭐⭐ | 情感分析、主题分类 |
| 文本生成 | ⭐⭐ | 创意写作、摘要 |

## 三、Zero-shot Chain-of-Thought

### 3.1 什么是 Zero-shot CoT

**Zero-shot CoT** 不需要提供带推理过程的示例，只需要在问题后添加一句简单的指令，就能触发模型的推理能力。

### 3.2 "Let's think step by step"

2022 年，Kojima 等人在论文《Large Language Models are Zero-Shot Reasoners》中发现，只需在 Prompt 末尾添加 `"Let's think step by step"`，就能显著提升模型在推理任务上的表现。

**示例**
```
问题：一个农场有 5 只鸡，每只鸡每天下 2 个蛋。
      一周能收集多少个蛋？

让我们一步步思考：
```

**模型输出**
```
首先，我需要计算每天能收集多少个蛋。
农场有 5 只鸡，每只鸡每天下 2 个蛋。
所以每天产蛋 = 5 × 2 = 10 个蛋。

然后，计算一周的总产量。
一周有 7 天。
所以一周产蛋 = 10 × 7 = 70 个蛋。

答案：70
```

### 3.3 其他 Zero-shot CoT 指令

| 指令 | 效果 | 适用场景 |
|------|------|----------|
| Let's think step by step. | 通用 | 大多数推理任务 |
| Let's work through this step by step. | 通用 | 数学、逻辑问题 |
| Let's solve this problem by breaking it down. | 强调分解 | 复杂问题 |
| First, let's understand the problem. | 强调理解 | 需要分析的问题 |
| Let's think about this logically. | 强调逻辑 | 逻辑推理任务 |
| Take a deep breath and work on this problem step by step. | 情绪化表达 | 据说对 GPT-4 更有效 |

### 3.4 Zero-shot CoT 的变体

**指令放在开头**
```
请逐步推理并回答以下问题：

问题：...
```

**结构化指令**
```
请回答以下问题。在给出最终答案之前，请先解释你的推理过程。

问题：...
```

**多步骤指令**
```
请按以下步骤回答：
1. 分析题目中的已知条件
2. 确定解题思路
3. 逐步计算
4. 给出最终答案

问题：...
```

## 四、Self-Consistency（自一致性）

### 4.1 动机

链式思考虽然提升了推理能力，但**每次生成的推理路径可能不同**，有时候正确的推理路径恰好没有被采样到。

### 4.2 Self-Consistency 原理

```
传统方法：采样 1 次 → 得到答案
Self-Consistency：采样 N 次 → 取多数答案

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Prompt 1   │     │  Prompt 2   │     │  Prompt N   │
│  (T=0.7)    │     │  (T=0.7)    │     │  (T=0.7)    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  推理路径 1  │     │  推理路径 2  │     │  推理路径 N  │
│  答案：42   │     │  答案：42   │     │  答案：36   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
                  ┌─────────────────┐
                  │  投票：42 出现 2 次  │
                  │       36 出现 1 次  │
                  │  最终答案：42      │
                  └─────────────────┘
```

### 4.3 实现步骤

```python
def self_consistency(prompt, model, n_samples=10, temperature=0.7):
    """
    Self-Consistency 实现
    
    Args:
        prompt: 输入的 Prompt
        model: 模型接口
        n_samples: 采样次数
        temperature: 采样温度（必须 > 0）
    """
    answers = []
    reasoning_paths = []
    
    # 多次采样
    for _ in range(n_samples):
        response = model.generate(
            prompt, 
            temperature=temperature
        )
        answer = extract_answer(response)
        answers.append(answer)
        reasoning_paths.append(response)
    
    # 统计每个答案出现的次数
    from collections import Counter
    answer_counts = Counter(answers)
    
    # 选择出现次数最多的答案
    final_answer = answer_counts.most_common(1)[0][0]
    
    return {
        'final_answer': final_answer,
        'answer_distribution': dict(answer_counts),
        'all_responses': reasoning_paths
    }
```

### 4.4 Self-Consistency 效果

```
问题：小明有一些糖果，他给了小红 5 颗，又从小华那里得到了 8 颗，
      现在他有 20 颗。他原来有多少颗？

路径 1：设原有 x 颗，x - 5 + 8 = 20，解得 x = 17。答案：17
路径 2：倒推，20 - 8 + 5 = 17。答案：17
路径 3：20 + 5 - 8 = 17。答案：17
路径 4：20 - 8 = 12，12 + 5 = 17。答案：17

（假设有一条错误路径）
路径 5：20 + 8 - 5 = 23。答案：23

投票结果：17 出现 4 次，23 出现 1 次
最终答案：17 ✓
```

### 4.5 进阶：加权 Self-Consistency

考虑推理路径的长度、置信度等因素进行加权投票。

```python
def weighted_self_consistency(responses):
    """
    加权投票：更长的推理路径可能更详细，给予更高权重
    """
    weighted_votes = {}
    
    for response in responses:
        answer = extract_answer(response)
        reasoning_length = len(extract_reasoning(response))
        
        # 根据推理长度计算权重
        weight = 1 + 0.1 * reasoning_length / 100
        
        weighted_votes[answer] = weighted_votes.get(answer, 0) + weight
    
    return max(weighted_votes, key=weighted_votes.get)
```

## 五、Tree of Thoughts（思维树）

### 5.1 从链到树

传统 CoT 是**线性**的推理路径：
```
问题 → 步骤 1 → 步骤 2 → 步骤 3 → 答案
```

但人类思考往往是**分支**的：
```
       问题
      /    \
   思路 A   思路 B
   /    \      \
A1      A2     B1
 |       |      |
答案 1  答案 2  答案 3
```

### 5.2 ToT 核心思想

**Tree of Thoughts** 将推理过程建模为树形搜索：
1. **分解**：将问题分解为多个思考步骤
2. **生成**：每个步骤生成多个候选思路
3. **评估**：评估每个候选思路的价值
4. **搜索**：使用 BFS 或 DFS 搜索最优路径

### 5.3 ToT 框架结构

```
┌─────────────────────────────────────────────────────────────┐
│                      Tree of Thoughts                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│   │  Thought 1  │    │  Thought 2  │    │  Thought 3  │   │
│   │   (状态)     │    │   (状态)     │    │   (状态)     │   │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘   │
│          │                  │                  │          │
│          ▼                  ▼                  ▼          │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│   │   评估得分   │    │   评估得分   │    │   评估得分   │   │
│   │    0.8      │    │    0.6      │    │    0.9      │   │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘   │
│          │                  │                  │          │
│          ▼                  ▼                  ▼          │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│   │  子想法 1   │    │  子想法 2   │    │  子想法 3   │   │
│   │  子想法 2   │    │             │    │  子想法 4   │   │
│   └─────────────┘    └─────────────┘    └──────┬──────┘   │
│                                                 │          │
│                                                 ▼          │
│                                          ┌─────────────┐   │
│                                          │   最终答案   │   │
│                                          └─────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 ToT 实现：24 点游戏

**问题**：使用数字 4, 9, 10, 13 和基本运算得到 24。

**传统 CoT**
```
模型可能随机尝试，如果一开始选择错误的路径，就会陷入困境。
```

**ToT 方法**
```
步骤 1：生成候选第一步操作
- 候选 A：13 - 9 = 4，剩下 [4, 4, 10]
- 候选 B：10 - 4 = 6，剩下 [6, 9, 13]
- 候选 C：9 + 4 = 13，剩下 [10, 13, 13]

步骤 2：评估每个候选的潜力
- A 看起来有潜力（两个 4 可以乘或加）
- B 不太清楚如何得到 24
- C 看起来重复，不太可能

步骤 3：继续探索最有希望的候选 A
- 候选 A1：4 + 4 = 8，剩下 [8, 10]，无法得到 24
- 候选 A2：4 × 4 = 16，剩下 [10, 16]，16 + 10 = 26 ≠ 24
- 候选 A3：10 - 4 = 6，剩下 [4, 6]，4 × 6 = 24 ✓

答案：(13 - 9) × (10 - 4) = 24
```

### 5.5 ToT 的 Prompt 设计

**步骤 1：生成候选想法**
```
问题：{问题描述}

当前状态：{当前已完成的步骤}

请生成 {k} 个不同的下一步思路。
每个思路应该：
1. 基于当前状态
2. 朝着解决问题推进
3. 清晰具体

候选思路：
1. [思路 1]
2. [思路 2]
...
```

**步骤 2：评估想法**
```
请评估以下候选思路的价值（1-10 分）：

候选思路 1：{思路描述}
候选思路 2：{思路描述}
...

从以下维度评估：
- 逻辑正确性
- 对最终目标的贡献
- 可行性

评分：
思路 1：[分数] - [理由]
思路 2：[分数] - [理由]
...
```

**步骤 3：搜索实现**

```python
class TreeOfThoughts:
    def __init__(self, model, branching_factor=3):
        self.model = model
        self.branching_factor = branching_factor
    
    def generate_thoughts(self, state, problem):
        """生成候选想法"""
        prompt = f"""
        问题：{problem}
        当前状态：{state}
        
        请生成 {self.branching_factor} 个不同的下一步思路。
        """
        return self.model.generate(prompt)
    
    def evaluate_thought(self, thought, problem):
        """评估想法价值"""
        prompt = f"""
        问题：{problem}
        候选思路：{thought}
        
        请评估这个思路的价值（1-10 分），并简要说明理由。
        评分：X/10
        """
        response = self.model.generate(prompt)
        return extract_score(response)
    
    def search(self, problem, max_depth=5):
        """执行搜索"""
        # 使用 Beam Search
        beams = [("", 0)]  # (state, score)
        
        for depth in range(max_depth):
            candidates = []
            
            for state, score in beams:
                thoughts = self.generate_thoughts(state, problem)
                
                for thought in thoughts:
                    new_state = state + " -> " + thought
                    value = self.evaluate_thought(thought, problem)
                    candidates.append((new_state, score + value))
            
            # 保留 Top-K
            candidates.sort(key=lambda x: x[1], reverse=True)
            beams = candidates[:self.branching_factor]
            
            # 检查是否找到答案
            for state, score in beams:
                if self.is_solution(state, problem):
                    return state
        
        return beams[0][0]  # 返回得分最高的路径
```

## 六、Automatic Chain-of-Thought（自动 CoT）

### 6.1 动机

Few-shot CoT 需要人工设计示例，成本高且可能不是最优的。

### 6.2 Auto-CoT 方法

Zhang 等人（2022）提出了 **Auto-CoT**，自动构建 CoT 示例。

**步骤**
```
1. 问题聚类：将数据集中的问题按相似度聚类
2. 代表性选择：从每个聚类中选择代表性问题
3. 零样本生成：使用 Zero-shot CoT 为这些问题生成推理链
4. 构建 Prompt：将生成的示例组合成 Few-shot Prompt
```

**实现代码**

```python
from sklearn.cluster import KMeans

class AutoCoT:
    def __init__(self, model, n_clusters=8):
        self.model = model
        self.n_clusters = n_clusters
    
    def build_prompt(self, questions, embeddings):
        """
        自动构建 CoT Prompt
        
        Args:
            questions: 问题列表
            embeddings: 问题的向量表示
        """
        # 1. 聚类
        kmeans = KMeans(n_clusters=self.n_clusters)
        clusters = kmeans.fit_predict(embeddings)
        
        # 2. 从每个聚类中选择最接近中心的问题
        selected_questions = []
        for i in range(self.n_clusters):
            cluster_indices = np.where(clusters == i)[0]
            center = kmeans.cluster_centers_[i]
            
            # 计算到中心的距离
            distances = np.linalg.norm(
                embeddings[cluster_indices] - center, 
                axis=1
            )
            
            # 选择最接近中心的问题
            closest_idx = cluster_indices[np.argmin(distances)]
            selected_questions.append(questions[closest_idx])
        
        # 3. 为每个问题生成推理链
        examples = []
        for question in selected_questions:
            # 使用 Zero-shot CoT 生成推理
            zero_shot_prompt = f"{question}\n\n让我们一步步思考："
            reasoning = self.model.generate(zero_shot_prompt)
            
            examples.append({
                'question': question,
                'reasoning': reasoning
            })
        
        # 4. 构建最终的 Prompt
        prompt = "请回答以下问题，并展示你的推理过程。\n\n"
        for i, example in enumerate(examples, 1):
            prompt += f"示例 {i}:\n"
            prompt += f"问题：{example['question']}\n"
            prompt += f"推理：{example['reasoning']}\n\n"
        
        return prompt
```

## 七、实战：CoT 在不同场景的应用

### 7.1 数学应用题

```
问题：一个篮子里有苹果和橘子共 25 个，苹果比橘子多 5 个。
      篮子里各有多少个水果？

让我们一步步思考：

第 1 步：设未知数
设橘子有 x 个，那么苹果有 x + 5 个。

第 2 步：列方程
苹果 + 橘子 = 25
(x + 5) + x = 25

第 3 步：解方程
2x + 5 = 25
2x = 20
x = 10

第 4 步：计算结果
橘子：10 个
苹果：10 + 5 = 15 个

第 5 步：验证
10 + 15 = 25，符合总数
15 - 10 = 5，符合差值

答案：橘子 10 个，苹果 15 个
```

### 7.2 逻辑推理

```
问题：甲、乙、丙三人中，一人是律师，一人是医生，一人是教师。
      已知：
      1. 甲比医生年龄大
      2. 乙和教师不同岁
      3. 教师比丙年龄小
      
      问：三人各自的职业是什么？

让我们一步步思考：

第 1 步：分析条件
- 条件 1：甲不是医生，甲 > 医生（年龄）
- 条件 2：乙不是教师
- 条件 3：丙不是教师，教师 < 丙（年龄）

第 2 步：确定教师
- 乙不是教师（条件 2）
- 丙不是教师（条件 3）
- 所以甲是教师

第 3 步：确定医生和律师
- 条件 1：甲（教师）比医生年龄大
- 条件 3：教师（甲）比丙年龄小
- 所以：医生 < 甲 < 丙

- 年龄排序：医生 < 甲 < 丙
- 甲是教师，所以丙只能是律师
- 剩下乙是医生

第 4 步：验证
- 甲（教师）比乙（医生）大 ✓
- 乙和教师（甲）不同岁 ✓
- 教师（甲）比丙（律师）小 ✓

答案：甲是教师，乙是医生，丙是律师
```

### 7.3 代码调试

```
问题：以下代码报错 "IndexError: list index out of range"，
      请找出并修复问题。

def find_max(numbers):
    max_num = numbers[0]
    for i in range(1, len(numbers)):
        if numbers[i] > max_num:
            max_num = numbers[i]
    return max_num

result = find_max([])

让我们一步步分析：

第 1 步：理解错误
"IndexError: list index out of range" 表示访问了列表不存在的索引。

第 2 步：定位问题
- 代码第 2 行：max_num = numbers[0]
- 当 numbers 为空列表 [] 时，numbers[0] 不存在
- 这就是错误的根源

第 3 步：思考修复方案
方案 A：在函数开头检查空列表
方案 B：使用内置函数 max() 并设置默认值
方案 C：使用 try-except 捕获异常

第 4 步：选择最佳方案
方案 A 最清晰，可以提前处理边界情况。

第 5 步：修复代码

def find_max(numbers):
    if not numbers:  # 检查空列表
        return None  # 或抛出异常
    max_num = numbers[0]
    for i in range(1, len(numbers)):
        if numbers[i] > max_num:
            max_num = numbers[i]
    return max_num

第 6 步：验证
- find_max([]) 返回 None，不会报错 ✓
- find_max([1, 3, 2]) 返回 3，功能正确 ✓
```

## 八、CoT 的最佳实践

### 8.1 什么时候使用 CoT

| 情况 | 建议 | 原因 |
|------|------|------|
| 复杂数学题 | ✅ 使用 CoT | 多步计算需要显式推理 |
| 简单数学题 | ⚠️ 可选 | 简单计算可能不需要 |
| 逻辑推理题 | ✅ 使用 CoT | 推理路径复杂 |
| 常识问题 | ⚠️ 视情况 | 需要多步推理的用 CoT |
| 创意写作 | ❌ 不使用 | 不需要固定推理路径 |
| 代码生成 | ✅ 使用 CoT | 分步实现更可靠 |

### 8.2 CoT 设计检查清单

```
□ 推理步骤是否逻辑清晰？
□ 每个步骤是否都有明确的输入和输出？
□ 步骤之间是否有自然的过渡？
□ 是否包含了必要的中间计算？
□ 最终答案是否与推理过程一致？
□ 对于多路径问题，是否考虑了 Self-Consistency？
```

### 8.3 常见错误

**错误 1：推理跳跃**
```
❌ 坏的推理
已知：x + 5 = 12
所以：x = 7，答案是 7

✅ 好的推理
已知：x + 5 = 12
两边同时减去 5：
x + 5 - 5 = 12 - 5
x = 7
答案是 7
```

**错误 2：遗漏关键步骤**
```
❌ 不完整
计算：3 + 5 × 2
= 16

✅ 完整
计算：3 + 5 × 2
根据运算优先级，先算乘法：5 × 2 = 10
再算加法：3 + 10 = 13
答案是 13
```

## 总结

本文深入讲解了链式思考技术及其进阶方法：

1. **基础 CoT**：通过示例展示推理过程，引导模型分步思考
2. **Zero-shot CoT**：使用 "Let's think step by step" 等指令触发推理
3. **Self-Consistency**：多路径采样+投票，提高答案可靠性
4. **Tree of Thoughts**：树形搜索，探索多个推理路径
5. **Auto-CoT**：自动构建 CoT 示例，降低人工成本

**核心要点**：
- CoT 将复杂问题分解为可管理的步骤
- 显式推理提高了可解释性和准确率
- 对于复杂推理任务，CoT 能显著提升性能

在下一篇文章中，我们将探讨更高级的提示模式，包括 **ReAct、Reflexion、Prompt Chaining** 等技术。

## 参考资料

- [Chain-of-Thought Prompting Elicits Reasoning in Large Language Models](https://arxiv.org/abs/2201.11903) - CoT 原始论文
- [Large Language Models are Zero-Shot Reasoners](https://arxiv.org/abs/2205.11916) - Zero-shot CoT
- [Self-Consistency Improves Chain of Thought Reasoning in Language Models](https://arxiv.org/abs/2203.11171)
- [Tree of Thoughts: Deliberate Problem Solving with Large Language Models](https://arxiv.org/abs/2305.10601)
- [Automatic Chain of Thought Prompting in Large Language Models](https://arxiv.org/abs/2210.03493)
- [Reasoning with Language Model Prompting: A Survey](https://arxiv.org/abs/2212.09597)
