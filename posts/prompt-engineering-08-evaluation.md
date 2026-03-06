---
title: "提示词工程（八）：评估与优化"
date: "2026-03-06"
excerpt: "系统讲解提示词工程的评估方法和优化策略，包括自动评估指标、人工评估框架、A/B 测试方法、Prompt 版本管理等内容，帮助你构建可度量、可迭代的提示词工程工作流。"
tags: ["Prompt Engineering", "Evaluation", "Optimization", "LLM", "提示词评估", "A/B测试"]
series:
  slug: "prompt-engineering-tutorial"
  title: "提示词工程实战教程"
  order: 8
---

# 提示词工程（八）：评估与优化

## 前言

提示词工程不是一次性的工作，而是一个持续迭代优化的过程。就像软件工程需要测试一样，Prompt 也需要系统的评估和改进。

作为本系列的收官之作，本文将系统讲解：
- 如何评估 Prompt 的效果
- 自动评估与人工评估的方法
- A/B 测试和 Prompt 版本管理
- 系统化的优化流程
- 生产环境的最佳实践

学完本文，你将掌握一套完整的 Prompt 工程方法论。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| 评估指标体系 | ⭐⭐⭐ | 高频考点 | ✅ |
| 自动评估方法 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| A/B 测试 | ⭐⭐⭐ | 高频考点 | ✅ |
| Prompt 版本管理 | ⭐⭐⭐ | 实用技巧 | ✅ |
| 自动优化 | ⭐⭐⭐⭐⭐ | 前沿技术 | ✅ |

## 面试考点

1. 如何评估一个 Prompt 的好坏？有哪些指标？
2. 自动评估和人工评估各有什么优缺点？
3. 如何进行 Prompt 的 A/B 测试？
4. 什么是 Prompt 版本管理？为什么重要？
5. 如何实现 Prompt 的自动优化？

## 一、评估指标体系

### 1.1 评估维度

一个全面的 Prompt 评估应该包含以下维度：

```
┌─────────────────────────────────────────────────────────────┐
│                   Prompt 评估维度                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 输出质量（Output Quality）                            │   │
│  │ • 准确性（Accuracy）                                 │   │
│  │ • 相关性（Relevance）                                │   │
│  │ • 完整性（Completeness）                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 格式规范（Format Compliance）                         │   │
│  │ • 格式正确性（Format Correctness）                    │   │
│  │ • 结构清晰度（Structure Clarity）                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 性能指标（Performance）                               │   │
│  │ • 延迟（Latency）                                    │   │
│  │ • Token 消耗（Token Usage）                          │   │
│  │ • 成本（Cost）                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 安全性（Safety）                                      │   │
│  │ • 有害内容（Harmfulness）                            │   │
│  │ • 偏见（Bias）                                       │   │
│  │ • 隐私泄露（Privacy）                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 任务特定的评估指标

| 任务类型 | 关键指标 | 评估方法 |
|----------|----------|----------|
| 文本生成 | 流畅度、多样性、相关性 | BLEU、ROUGE、人工评分 |
| 分类任务 | 准确率、F1、混淆矩阵 | 自动计算 |
| 问答系统 | 准确率、召回率、MRR | 答案匹配、人工判断 |
| 代码生成 | 语法正确性、功能正确性 | 编译测试、单元测试 |
| 摘要生成 | 一致性、简洁性、覆盖度 | ROUGE、BERTScore |
| 对话系统 | 连贯性、有用性、用户满意度 | 人工评估、用户反馈 |

### 1.3 评估指标详解

#### 准确性（Accuracy）

```python
def calculate_accuracy(predictions, ground_truth):
    """
    计算准确率
    
    Args:
        predictions: 模型预测结果列表
        ground_truth: 标准答案列表
    """
    correct = sum(
        1 for pred, truth in zip(predictions, ground_truth)
        if pred.strip().lower() == truth.strip().lower()
    )
    return correct / len(predictions)

# 对于开放性答案，可以使用语义相似度
def semantic_accuracy(prediction, ground_truth, embedding_model):
    """基于语义的准确率"""
    pred_emb = embedding_model.encode(prediction)
    truth_emb = embedding_model.encode(ground_truth)
    similarity = cosine_similarity([pred_emb], [truth_emb])[0][0]
    return similarity
```

#### 格式正确性

```python
def check_format_compliance(output, expected_format):
    """
    检查输出格式是否符合预期
    
    Args:
        output: 模型输出
        expected_format: 期望的格式模板
    """
    import json
    
    if expected_format == 'json':
        try:
            json.loads(output)
            return True
        except:
            return False
    
    elif expected_format == 'markdown_table':
        # 检查是否包含表格标记
        return '|' in output and '---' in output
    
    elif expected_format == 'numbered_list':
        # 检查是否以数字开头
        lines = output.strip().split('\n')
        return all(line.strip().startswith(f"{i+1}.") 
                  for i, line in enumerate(lines))
    
    return True
```

## 二、自动评估方法

### 2.1 基于规则的评估

```python
class RuleBasedEvaluator:
    """基于规则的评估器"""
    
    def __init__(self):
        self.rules = []
    
    def add_rule(self, name, check_func, weight=1.0):
        """添加评估规则"""
        self.rules.append({
            'name': name,
            'check': check_func,
            'weight': weight
        })
    
    def evaluate(self, output, context=None):
        """执行评估"""
        scores = {}
        total_weight = 0
        weighted_score = 0
        
        for rule in self.rules:
            score = rule['check'](output, context)
            scores[rule['name']] = score
            weighted_score += score * rule['weight']
            total_weight += rule['weight']
        
        return {
            'overall_score': weighted_score / total_weight,
            'details': scores
        }

# 使用示例
evaluator = RuleBasedEvaluator()

# 添加规则
evaluator.add_rule(
    'length_check',
    lambda output, ctx: 1.0 if 100 <= len(output) <= 500 else 0.5,
    weight=0.3
)

evaluator.add_rule(
    'keyword_check',
    lambda output, ctx: 1.0 if '总结' in output else 0.0,
    weight=0.2
)

evaluator.add_rule(
    'format_check',
    lambda output, ctx: 1.0 if output.count('\n') >= 3 else 0.5,
    weight=0.5
)
```

### 2.2 基于模型的评估（LLM-as-Judge）

使用一个 LLM 来评估另一个 LLM 的输出。

```python
class LLMJudgeEvaluator:
    """使用 LLM 作为评判者的评估器"""
    
    def __init__(self, judge_llm):
        self.judge = judge_llm
    
    def evaluate(self, prompt, output, criteria):
        """
        使用 LLM 评估输出
        
        Args:
            prompt: 原始 Prompt
            output: 模型输出
            criteria: 评估标准列表
        """
        evaluation_prompt = f"""请作为评估专家，对以下 AI 回答进行评分。

## 原始问题
{prompt}

## AI 回答
{output}

## 评估标准
"""
        for i, criterion in enumerate(criteria, 1):
            evaluation_prompt += f"{i}. {criterion['name']}: {criterion['description']}\n"
        
        evaluation_prompt += """
## 评分要求
对每个标准给出 1-10 分的评分，并说明理由。

输出格式（JSON）：
{
  "scores": [
    {"criterion": "标准名", "score": 分数, "reason": "评分理由"}
  ],
  "overall_score": 总分,
  "suggestions": "改进建议"
}"""
        
        result = self.judge.generate(evaluation_prompt)
        return self._parse_evaluation(result)
    
    def _parse_evaluation(self, result):
        """解析评估结果"""
        import json
        try:
            return json.loads(result)
        except:
            return {'raw_output': result}

# 使用示例
criteria = [
    {
        'name': '准确性',
        'description': '回答是否准确无误'
    },
    {
        'name': '完整性',
        'description': '是否全面回答了问题'
    },
    {
        'name': '清晰度',
        'description': '表达是否清晰易懂'
    }
]

evaluator = LLMJudgeEvaluator(judge_llm)
result = evaluator.evaluate(prompt, output, criteria)
```

### 2.3 配对比较评估

当难以定义绝对标准时，可以使用配对比较。

```python
class PairwiseEvaluator:
    """配对比较评估器"""
    
    def __init__(self, judge_llm):
        self.judge = judge_llm
    
    def compare(self, prompt, output_a, output_b, criteria):
        """
        比较两个输出的优劣
        
        Returns:
            'A': A 更好
            'B': B 更好
            'TIE': 平局
        """
        comparison_prompt = f"""请比较以下两个 AI 回答的优劣。

## 问题
{prompt}

## 回答 A
{output_a}

## 回答 B
{output_b}

## 评估维度
{chr(10).join(f"- {c}" for c in criteria)}

请先分析两个回答的优缺点，然后给出最终判断：
- 如果 A 更好，输出：A
- 如果 B 更好，输出：B
- 如果差不多，输出：TIE

分析：
"""
        
        result = self.judge.generate(comparison_prompt)
        
        # 解析结果
        if 'A' in result[-10:] and 'B' not in result[-10:]:
            return 'A'
        elif 'B' in result[-10:] and 'A' not in result[-10:]:
            return 'B'
        else:
            return 'TIE'
```

## 三、人工评估框架

### 3.1 评估指南设计

```
# Prompt 人工评估指南

## 评估目标
评估 Prompt 在特定任务上的表现。

## 评估维度

### 1. 输出质量 (40%)
- 准确性 (15%): 回答是否正确
  - 5分: 完全正确
  - 3分: 基本正确，有小错误
  - 1分: 有明显错误

- 完整性 (15%): 是否全面回答问题
  - 5分: 全面完整
  - 3分: 回答了主要部分
  - 1分: 遗漏重要内容

- 有用性 (10%): 对用户是否有实际帮助
  - 5分: 非常有帮助
  - 3分: 有一定帮助
  - 1分: 帮助不大

### 2. 格式规范 (30%)
- 格式正确性 (15%): 是否符合要求的格式
- 结构清晰度 (15%): 组织是否清晰

### 3. 安全性 (30%)
- 有害内容 (15%): 是否包含有害信息
- 偏见 (15%): 是否包含偏见或歧视

## 评分标准
每个维度 1-5 分，计算加权总分。
```

### 3.2 评估员间一致性

```python
from sklearn.metrics import cohen_kappa_score

def calculate_inter_rater_reliability(ratings_a, ratings_b):
    """
    计算评估员间一致性（Cohen's Kappa）
    
    Args:
        ratings_a: 评估员 A 的评分列表
        ratings_b: 评估员 B 的评分列表
    """
    kappa = cohen_kappa_score(ratings_a, ratings_b)
    
    interpretation = {
        (0.8, 1.0): "几乎完全一致",
        (0.6, 0.8): "高度一致",
        (0.4, 0.6): "中等一致",
        (0.2, 0.4): "一致性一般",
        (0.0, 0.2): "一致性很低"
    }
    
    for (low, high), desc in interpretation.items():
        if low <= kappa < high:
            interpretation_text = desc
            break
    else:
        interpretation_text = "无法判断"
    
    return {
        'kappa': kappa,
        'interpretation': interpretation_text
    }
```

## 四、A/B 测试

### 4.1 A/B 测试框架

```python
import random
from scipy import stats

class PromptABTest:
    """Prompt A/B 测试框架"""
    
    def __init__(self, prompt_a, prompt_b, evaluation_fn):
        self.prompt_a = prompt_a
        self.prompt_b = prompt_b
        self.evaluation_fn = evaluation_fn
        self.results = {'A': [], 'B': []}
    
    def run_test(self, test_cases, sample_size=None, random_seed=42):
        """
        运行 A/B 测试
        
        Args:
            test_cases: 测试用例列表
            sample_size: 样本数量（None 表示全部）
            random_seed: 随机种子
        """
        random.seed(random_seed)
        
        if sample_size and sample_size < len(test_cases):
            test_cases = random.sample(test_cases, sample_size)
        
        for case in test_cases:
            # 随机分配到 A 或 B 组
            group = random.choice(['A', 'B'])
            prompt = self.prompt_a if group == 'A' else self.prompt_b
            
            # 执行测试
            result = self._run_single_test(prompt, case)
            self.results[group].append(result)
    
    def analyze_results(self):
        """分析测试结果"""
        # 计算各组指标
        metrics_a = self._calculate_metrics(self.results['A'])
        metrics_b = self._calculate_metrics(self.results['B'])
        
        # 统计显著性检验
        scores_a = [r['score'] for r in self.results['A']]
        scores_b = [r['score'] for r in self.results['B']]
        
        t_stat, p_value = stats.ttest_ind(scores_a, scores_b)
        
        return {
            'group_a': metrics_a,
            'group_b': metrics_b,
            'difference': {
                'absolute': metrics_b['mean'] - metrics_a['mean'],
                'relative': (metrics_b['mean'] - metrics_a['mean']) / metrics_a['mean']
            },
            'statistical_significance': {
                't_statistic': t_stat,
                'p_value': p_value,
                'significant': p_value < 0.05
            }
        }
    
    def _calculate_metrics(self, results):
        """计算指标"""
        import numpy as np
        scores = [r['score'] for r in results]
        return {
            'count': len(scores),
            'mean': np.mean(scores),
            'std': np.std(scores),
            'min': np.min(scores),
            'max': np.max(scores),
            'median': np.median(scores)
        }
```

### 4.2 A/B 测试报告示例

```
## A/B 测试报告

### 测试概述
- 测试名称：客服回复优化测试
- 测试周期：2024-01-15 至 2024-01-22
- 样本量：A 组 500 / B 组 500

### 变量说明
- Prompt A（对照组）：原始客服回复 Prompt
- Prompt B（实验组）：优化后的 Prompt（添加了角色设定和格式约束）

### 结果摘要

| 指标 | Prompt A | Prompt B | 变化 |
|------|----------|----------|------|
| 平均准确率 | 78.5% | 85.2% | +6.7% |
| 格式正确率 | 82.0% | 95.5% | +13.5% |
| 平均延迟 | 1.2s | 1.3s | +0.1s |
| Token 消耗 | 245 | 268 | +23 |

### 统计显著性
- t 统计量：-3.45
- p 值：0.0006
- 结论：差异具有统计显著性（p < 0.05）

### 建议
建议采用 Prompt B，准确率提升 6.7%，格式正确率提升显著。
```

## 五、Prompt 版本管理

### 5.1 版本控制系统

```python
from datetime import datetime
import json
import os

class PromptVersionControl:
    """Prompt 版本控制系统"""
    
    def __init__(self, storage_path='./prompt_versions'):
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)
        self.versions_file = os.path.join(storage_path, 'versions.json')
        self.versions = self._load_versions()
    
    def commit(self, prompt, metadata):
        """
        提交新版本
        
        Args:
            prompt: Prompt 内容
            metadata: 版本元数据
        """
        version_id = self._generate_version_id()
        timestamp = datetime.now().isoformat()
        
        version = {
            'id': version_id,
            'prompt': prompt,
            'metadata': {
                'timestamp': timestamp,
                'author': metadata.get('author'),
                'description': metadata.get('description'),
                'tags': metadata.get('tags', []),
                'performance': metadata.get('performance', {})
            }
        }
        
        self.versions.append(version)
        self._save_versions()
        
        return version_id
    
    def get_version(self, version_id):
        """获取特定版本"""
        for v in self.versions:
            if v['id'] == version_id:
                return v
        return None
    
    def get_latest(self):
        """获取最新版本"""
        if self.versions:
            return self.versions[-1]
        return None
    
    def compare_versions(self, version_a, version_b):
        """比较两个版本"""
        v_a = self.get_version(version_a)
        v_b = self.get_version(version_b)
        
        if not v_a or not v_b:
            return None
        
        return {
            'version_a': {
                'id': version_a,
                'performance': v_a['metadata'].get('performance', {})
            },
            'version_b': {
                'id': version_b,
                'performance': v_b['metadata'].get('performance', {})
            }
        }
    
    def rollback(self, version_id):
        """回滚到指定版本"""
        version = self.get_version(version_id)
        if version:
            return version['prompt']
        return None
    
    def _generate_version_id(self):
        """生成版本 ID"""
        return f"v{len(self.versions) + 1}.{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    def _load_versions(self):
        """加载版本历史"""
        if os.path.exists(self.versions_file):
            with open(self.versions_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    
    def _save_versions(self):
        """保存版本历史"""
        with open(self.versions_file, 'w', encoding='utf-8') as f:
            json.dump(self.versions, f, ensure_ascii=False, indent=2)
```

### 5.2 版本命名规范

```
版本命名格式：{major}.{minor}.{patch}

- major：重大变更，可能不兼容旧版本
- minor：功能优化或新增，兼容旧版本
- patch：Bug 修复或小调整

示例：
- v1.0.0：初始版本
- v1.1.0：添加了新的角色设定
- v1.1.1：修复了格式问题
- v2.0.0：完全重构 Prompt 结构
```

## 六、系统化优化流程

### 6.1 优化流程图

```
┌─────────────────────────────────────────────────────────────┐
│                  Prompt 优化流程                            │
│                                                             │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│   │ 收集数据  │─────▶│ 问题分析  │─────▶│ 方案设计  │        │
│   └──────────┘      └──────────┘      └──────────┘        │
│                                              │              │
│                                              ▼              │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│   │ 部署上线  │◀─────│ 验证效果  │◀─────│ 实施改进  │        │
│   └──────────┘      └──────────┘      └──────────┘        │
│         │                                              │   │
│         │              ┌──────────┐                   │   │
│         └─────────────▶│ 持续监控  │◀──────────────────┘   │
│                        └──────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 优化策略

**策略 1：问题驱动优化**

```python
def optimize_by_problem(prompt, failed_cases):
    """基于失败案例优化"""
    
    # 分析失败模式
    problem_analysis = analyze_failures(failed_cases)
    
    # 生成针对性改进
    improvement_prompt = f"""
当前 Prompt：
{prompt}

失败案例分析：
{problem_analysis}

请提出具体的改进方案：
"""
    
    return llm.generate(improvement_prompt)
```

**策略 2：性能驱动优化**

```python
def optimize_by_metrics(prompt, current_metrics, target_metrics):
    """基于性能指标优化"""
    
    gaps = {
        metric: target_metrics[metric] - current_metrics[metric]
        for metric in target_metrics
    }
    
    # 识别最大的性能差距
    biggest_gap = max(gaps.items(), key=lambda x: x[1])
    
    if biggest_gap[1] <= 0:
        return prompt  # 已经达标
    
    # 针对性优化
    optimization_prompt = f"""
当前 Prompt 在 {biggest_gap[0]} 指标上与目标有差距。

当前 Prompt：
{prompt}

当前 {biggest_gap[0]}：{current_metrics[biggest_gap[0]]}
目标 {biggest_gap[0]}：{target_metrics[biggest_gap[0]]}

请优化 Prompt 以提升该指标：
"""
    
    return llm.generate(optimization_prompt)
```

### 6.3 自动优化器

```python
class PromptAutoOptimizer:
    """Prompt 自动优化器"""
    
    def __init__(self, llm, evaluator, max_iterations=5):
        self.llm = llm
        self.evaluator = evaluator
        self.max_iterations = max_iterations
    
    def optimize(self, initial_prompt, test_cases, target_score=0.9):
        """
        自动优化 Prompt
        
        Args:
            initial_prompt: 初始 Prompt
            test_cases: 测试用例
            target_score: 目标分数
        """
        current_prompt = initial_prompt
        history = []
        
        for i in range(self.max_iterations):
            # 评估当前 Prompt
            score = self._evaluate(current_prompt, test_cases)
            history.append({
                'iteration': i + 1,
                'prompt': current_prompt,
                'score': score
            })
            
            print(f"Iteration {i+1}: Score = {score:.3f}")
            
            # 检查是否达标
            if score >= target_score:
                print(f"Target reached!")
                break
            
            # 生成改进版本
            current_prompt = self._generate_improvement(
                current_prompt, 
                test_cases, 
                score
            )
        
        return {
            'final_prompt': current_prompt,
            'final_score': history[-1]['score'],
            'history': history
        }
    
    def _evaluate(self, prompt, test_cases):
        """评估 Prompt"""
        scores = []
        for case in test_cases:
            output = self.llm.generate(prompt + '\n' + case['input'])
            score = self.evaluator.evaluate(output, case['expected'])
            scores.append(score)
        return np.mean(scores)
    
    def _generate_improvement(self, prompt, test_cases, current_score):
        """生成改进版本"""
        improvement_prompt = f"""
请优化以下 Prompt 以提高其效果。

当前 Prompt：
{prompt}

当前得分：{current_score:.3f}

优化要求：
1. 保持 Prompt 的核心功能
2. 针对可能的失败情况添加约束
3. 使指令更加清晰明确
4. 优化输出格式描述

优化后的 Prompt：
"""
        return self.llm.generate(improvement_prompt)
```

## 七、生产环境最佳实践

### 7.1 部署检查清单

```
## Prompt 部署前检查清单

### 功能验证
- [ ] 所有测试用例通过
- [ ] 准确率达标
- [ ] 格式正确率达标
- [ ] 边界情况处理正确

### 性能验证
- [ ] 延迟在可接受范围
- [ ] Token 消耗合理
- [ ] 成本可控

### 安全验证
- [ ] 无有害内容生成
- [ ] 无隐私泄露风险
- [ ] 无偏见输出

### 运维准备
- [ ] 版本已记录
- [ ] 回滚方案已准备
- [ ] 监控告警已配置
- [ ] 文档已更新
```

### 7.2 监控指标

```python
class PromptMonitor:
    """Prompt 生产监控"""
    
    def __init__(self, alert_thresholds=None):
        self.metrics = defaultdict(list)
        self.alert_thresholds = alert_thresholds or {
            'error_rate': 0.05,
            'latency_p99': 5.0,
            'user_feedback': 4.0
        }
    
    def log_request(self, prompt_id, latency, success, 
                    token_usage=None, user_feedback=None):
        """记录请求"""
        self.metrics[prompt_id].append({
            'timestamp': datetime.now(),
            'latency': latency,
            'success': success,
            'token_usage': token_usage,
            'user_feedback': user_feedback
        })
    
    def get_stats(self, prompt_id, window_minutes=60):
        """获取统计信息"""
        now = datetime.now()
        window_start = now - timedelta(minutes=window_minutes)
        
        recent_logs = [
            m for m in self.metrics[prompt_id]
            if m['timestamp'] > window_start
        ]
        
        if not recent_logs:
            return None
        
        return {
            'request_count': len(recent_logs),
            'error_rate': 1 - sum(m['success'] for m in recent_logs) / len(recent_logs),
            'latency_p99': np.percentile([m['latency'] for m in recent_logs], 99),
            'avg_token_usage': np.mean([m['token_usage'] for m in recent_logs if m['token_usage']]),
            'avg_user_feedback': np.mean([m['user_feedback'] for m in recent_logs if m['user_feedback']])
        }
    
    def check_alerts(self, prompt_id):
        """检查告警"""
        stats = self.get_stats(prompt_id)
        if not stats:
            return []
        
        alerts = []
        
        if stats['error_rate'] > self.alert_thresholds['error_rate']:
            alerts.append(f"错误率过高: {stats['error_rate']:.2%}")
        
        if stats['latency_p99'] > self.alert_thresholds['latency_p99']:
            alerts.append(f"P99 延迟过高: {stats['latency_p99']:.2f}s")
        
        if stats['avg_user_feedback'] and stats['avg_user_feedback'] < self.alert_thresholds['user_feedback']:
            alerts.append(f"用户评分过低: {stats['avg_user_feedback']:.2f}")
        
        return alerts
```

### 7.3 灰度发布策略

```python
class CanaryDeployment:
    """灰度发布"""
    
    def __init__(self, prompt_registry):
        self.registry = prompt_registry
        self.canary_config = {}
    
    def start_canary(self, prompt_id, new_version, initial_traffic=0.05):
        """开始灰度"""
        self.canary_config[prompt_id] = {
            'old_version': self.registry.get_latest(prompt_id)['version'],
            'new_version': new_version,
            'traffic_percentage': initial_traffic,
            'start_time': datetime.now(),
            'status': 'running'
        }
    
    def get_prompt(self, prompt_id):
        """根据灰度比例返回 Prompt"""
        config = self.canary_config.get(prompt_id)
        
        if not config or config['status'] != 'running':
            # 正常版本
            return self.registry.get_latest(prompt_id)['prompt']
        
        # 根据比例选择版本
        if random.random() < config['traffic_percentage']:
            return self.registry.get_version(prompt_id, config['new_version'])['prompt']
        else:
            return self.registry.get_version(prompt_id, config['old_version'])['prompt']
    
    def increase_traffic(self, prompt_id, increment=0.1):
        """增加流量比例"""
        if prompt_id in self.canary_config:
            self.canary_config[prompt_id]['traffic_percentage'] = min(
                self.canary_config[prompt_id]['traffic_percentage'] + increment,
                1.0
            )
    
    def promote(self, prompt_id):
        """推广新版本"""
        if prompt_id in self.canary_config:
            self.canary_config[prompt_id]['status'] = 'promoted'
            self.canary_config[prompt_id]['traffic_percentage'] = 1.0
    
    def rollback(self, prompt_id):
        """回滚"""
        if prompt_id in self.canary_config:
            self.canary_config[prompt_id]['status'] = 'rolled_back'
            self.canary_config[prompt_id]['traffic_percentage'] = 0.0
```

## 总结

本文系统讲解了提示词工程的评估与优化方法：

1. **评估指标体系**：从输出质量、格式规范、性能指标、安全性四个维度建立评估体系

2. **自动评估方法**：基于规则的评估、LLM-as-Judge、配对比较评估

3. **人工评估框架**：设计评估指南、计算评估员间一致性

4. **A/B 测试**：设计对照实验、统计分析结果

5. **版本管理**：版本命名规范、版本控制系统

6. **优化流程**：问题驱动优化、性能驱动优化、自动优化器

7. **生产实践**：部署检查清单、监控指标、灰度发布

**核心要点**：
- Prompt 工程是一个持续迭代的过程
- 建立完善的评估体系是成功的基础
- 自动化工具能显著提升效率
- 生产环境需要全面的监控和快速回滚能力

---

## 系列总结

恭喜你完成了《提示词工程实战教程》全系列的学习！

通过这 8 篇文章，你系统掌握了：

| 篇章 | 主题 | 核心技能 |
|------|------|----------|
| 一 | 概述与核心概念 | Prompt 结构、Token、上下文窗口 |
| 二 | 基础写作技巧 | 角色设定、任务描述、格式控制 |
| 三 | 上下文学习策略 | Zero-shot、One-shot、Few-shot |
| 四 | 链式思考技术 | CoT、Self-Consistency、Tree of Thoughts |
| 五 | 高级提示模式 | ReAct、Reflexion、Prompt Chaining、Routing |
| 六 | RAG 提示优化 | 检索结果处理、上下文压缩、引用标注 |
| 七 | 多模态提示工程 | 图像理解、图文混合、视频分析 |
| 八 | 评估与优化 | 指标体系、A/B 测试、版本管理 |

**下一步建议**：
- 在实际项目中应用所学知识
- 建立自己的 Prompt 模板库
- 关注领域最新研究进展
- 参与社区交流，分享经验

祝你在 AI 时代乘风破浪！

## 参考资料

- [Holistic Evaluation of Language Models](https://arxiv.org/abs/2211.09110)
- [LLM-as-Judge: Judging LLM-as-a-Judge](https://arxiv.org/abs/2306.05685)
- [Prompt Engineering Patterns](https://martinfowler.com/articles/patterns-prompt-engineering.html)
- [Evaluating Large Language Models](https://arxiv.org/abs/2307.03109)
- [Best Practices for ML Engineering](https://developers.google.com/machine-learning/guides/rules-of-ml)