---
title: Prompt Engineering：从 Zero-shot、Few-shot 到 Prompt 结构
date: '2026-09-23 08:00:00'
updated: '2026-09-23'
categories:
  - 技术
tags:
  - Prompt Engineering
  - 大语言模型
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/Prompt Engineering.md. Edit the source note, then run npm run blog:sync. -->

## Prompt Engineering 是什么

我们知道，模型的本质是在预测下一个 token，概率公式为

$$
P(\text{next token}\mid \text{context})
$$

Prompt Engineering 就是在不修改模型参数的情况下改变 context，从而改变生成下一个 token 的概率。

## Zero-shot Prompting 

不给示例，只提供任务指令和输入。本质是在模型预训练阶段，已经学习了大量知识，Zero-shot Prompting 就是让模型调用现有能力完成任务。

> [!example] 示例 | 情感分类
>
> **Prompt**
>
> 判断下面评论的情感，只能回答 `positive` 或 `negative`。
>
> **评论：**  
> 这家酒店环境很好，但服务员态度非常差。
>
> **Output：** `negative`

### 一个好的 Zero-shot Prompt

通常至少包含：

**Instruction** → **Label definition** → **Query** → **Output constraint**

> [!example] 示例｜问题分类
>
> **Prompt**
>
> 
> 任务：判断下面的问题属于哪个类别。
>
> 类别：math、coding、knowledge
>
> 输入：What is gradient descent?
>
> 输出要求：只输出类别名称。

## Few-shot Prompting

与 zero-shot 不同点在于在 prompt 中加入少量示例。

> [!example] 示例｜分类问题
>
> **示例 1：**
> 问题：计算 1+2
> 类别：math
> 
>
> **示例 2：**
> 问题：实现 quicksort
> 类别：coding
>
> **现在判断：** 
> 问题：解释梯度下降。
> 类别：

### 一个好的 Few-shot Prompt

在 Zero-shot 的基础上加入示例：

**Instruction** → **Label definition** → **Few-shot demonstrations** → **Query** → **Output constraint**

## 为什么会有 Zero-shot 和 Few-shot 

如果让模型进行分类任务，而没有提供种类，那么模型就会依据自己的知识分类，可能达不到我们的要求，于是可以用 Few-shot 来提示模型该怎么分类。

而 Few-shot 也不是全方面比 Zero-shot 好，如果知识简单的翻译问题，Zero-shot 通常就够了。

## In-Context Learning（ICL，上下文学习）

Few-shot Prompting 就是 ICL 的一种典型形式。模型通过给出的 context 进行临时学习，从而改变 next token；它不会像 post training 那样改变模型参数，也不意味着模型获得了脱离该 context 保留的新知识。

## Few-shot Prompting 给模型提供了什么

其实就是 context，那 context 中包含了什么呢？具体来说可以分为 4 类：

### 1. 任务

> [!example] 示例｜
>
> **比如：**
> Paris → France
> Tokyo → Japan
> Beijing →
> 
>
> **模型推断：**
> city → country
> 

### 2. 标签语义

假设任务使用自定义标签 `A`、`B`、`C`，模型本身并不知道这些标签代表什么。

> [!example] 示例｜推断标签语义
>
> **Zero-shot**
>
> Classify as `A` / `B` / `C`：
>
> How do I sort an array?
>
> 此时，`A`、`B`、`C` 没有被赋予任何具体语义。
>
> **Few-shot**
>
> How do I implement quicksort? → `A`  
> What is gradient descent? → `B`  
> What is the capital of France? → `C`  
> How do I implement BFS? → ?
>
> **模型可以由此推断**
>
> `A` ≈ coding　·　`B` ≈ ML / concept　·　`C` ≈ knowledge


### 3. 输出格式

Few-shot 示例还可以帮助模型学习输出格式。

如果只告诉模型：

**Prompt**  `Return JSON.`

模型虽然会输出 JSON，但具体字段并不确定，例如：

```json
{
  "answer": "...",
  "explanation": "...",
  "confidence": 0.9
}
```

如果进一步提供一个 example：

**Input**  `What is SFT?`

**Output**

```json
{
  "category": "post_training",
  "difficulty": "basic"
}
```

模型就更容易模仿这个结构：

```json
{
  "category": "...",
  "difficulty": "..."
}
```

**核心理解：** Few-shot 不仅可以帮助模型理解任务，也可以隐式规定输出格式。

### 4. 任务的隐含规则

比如任务：```判断一句话是否包含事实错误```，而“事实错误”的标准可能很模糊。

> [!example] 示例｜
>
> **通过 examples：**
> "The Earth revolves around the Sun."
> → Correct
>
> "The Sun revolves around the Earth."
> → Incorrect
>
> "Pluto is officially one of the eight planets."
> → Incorrect
> 
>
> **你实际上通过例子告诉了模型：**
> 我采用的是现代天文学定义，而不是泛泛判断句子是否听起来合理。
> 
>

**核心理解**：Few-shot demonstrations 不只是提供参考答案，它们也在**隐式定义任务本身**。

### Few-shot 示例不同，也会改变结果

Few-shot demonstrations 本身就是 context 的一部分，因此**示例内容或顺序发生变化，模型的输出也可能随之变化**。

例如，同样的三个示例：

`Example 1` → `Example 2` → `Example 3`

如果换成：

`Example 3` → `Example 1` → `Example 2`

模型接收到的 context 就已经不同，因此后续 token 的概率分布也可能发生变化。

> [!example] 示例｜错误 demonstrations 带来的偏移
>
> **任务**
>
> 判断动物类别。
>
> **Demonstrations**
>
> 鲸鱼 → `fish`  
> 鲨鱼 → `fish`  
> 金枪鱼 → `fish`
>
> **Query**
>
> 海豚 → ?
>
> **模型可能输出**
>
> `fish`
>
> 尽管真实答案并不是 `fish`，模型仍可能受到前文 demonstrations 的影响而模仿这一模式。

因此，Few-shot demonstrations 有两面性：

- **好的 demonstrations** → 帮助模型理解任务
- **坏的 demonstrations** → 可能把模型带偏

所以，**examples 是 Prompt 中非常重要的一部分。**

## 为什么 Few-shot 有效

模型在预训练中已经接触并学习了大量类似的模式，例如：

- question → answer
- input → output
- example → solution
- document → summary
- English → Chinese

自回归训练让模型学习**如何根据前文预测后文**。

因此，当 Prompt 中给出 demonstrations 时，模型可以利用这些上下文中的模式，推断当前任务，并继续生成符合该模式的内容。

> ICL 在模型内部究竟如何实现，是一个更深的问题，可以在 Transformer / In-Context Learning 机制部分进一步讨论。

## Prompt 的组成

一个好的 prompt 最基本结构为 `System` + `Instruction` + `Context` + `Constrains` + `Output Format`

### 1. System

给模型设置一个全局行为框架。可以理解成：你应该怎么做，是长期规则。与 `System` 经常一起出现的是 `User`，可以理解成：现在具体做什么，更像当前任务。

> [!example] 示例｜
>
> **System**
> 你是科研助手。
> 回答准确、简洁。
> 不要编造信息。
> 
>
> **User:**
> 解释 SFT。
> 

### 2. Instruction

是 prompt **最核心的一部分**：明确告诉模型要执行什么操作。而`Instuction` 最核心的是**动作**，可以想象成`动词 + 对象`，所以在写 Prompt 时，应该想我到底希望模型执行哪个动作？

> [!example] 示例｜
>
> **不好的写法**
> 这篇论文的数据集。
> 模型并不知道你到底想：翻译/总结/列出名字/分析用途/判断训练集还是测试集
> 
> **更好的写法**
> Extract all datasets mentioned in the paper and classify each dataset as training, validation, or evaluation data.

### 3. Context

其实就是上下文，是提供给模型的额外信息。和 `Instruction` 的区别在于`Context` 是“已知条件”，而`Instruction` 是“你要做什么“。

### 4. Constrains

因为现在的模型不可避免的出现“幻觉“，所以需要`Constrains` 来限制模型的输出，最简单的是让模型在不知道的情况下输出`不知道`，而不是瞎猜，这对于没有辨识能力的人是非常危险的。

比如让模型读一篇论文：

> [!example] 示例｜
>
> **输入**
> Extract the training dataset from this paper.
> 
>
> **如果论文没有明确写，模型就可能瞎猜:**
> The model was probably trained on Alpaca...
> 
>
> **而如果加入`Constrains`** :
> Only use information explicitly stated in the paper.If the dataset cannot be determined, output "Unknown".
>
> **模型就会输出：**
> Unknown

常见的`Constrains`包括：内容边界，行为边界，长度，输出范围。

### 5. Output Format

其实`Output Format`和`Constrians`本质是相同的，不过为了逻辑清楚，通常在`Prompt`最后要求输出格式来满足后续自动化的实施。

### 完整 Prompt 示例

比如分析一篇 SFT 论文：

```
System:
You are an academic paper analysis assistant.
Only make claims supported by the provided paper text.

Task:
Identify the datasets used in the paper.

Context:
The paper studies supervised fine-tuning data composition.

Requirements:
1. Separate training datasets from evaluation datasets.
2. Do not infer datasets that are not explicitly mentioned.
3. If a field cannot be determined, use "Unknown".

Output format:

Training datasets:
- Name:
  Purpose:
  Size:

Evaluation datasets:
- Name:
  Purpose:
  Metric:
```

## Role Prompting 是什么

在`Prompt`中经常看到类似这样的话：`You are an expert machine learning researcher.`这就是`Role Prompting`。

但是`Role`也不是越复杂越好，一个好的`Role`应该是是给模型明确任务标准：

`You are an academic paper analysis assistant.Distinguish claims explicitly stated in the paper from your own interpretation.`

## 结构化 Prompt

`Prompt` 并不是黑魔法，不可能让模型的能力突然增强。不是越复杂越长的 `Prompt` 效果越好，而是要提高信息密度。

在实际工程中，更重要的是：

`任务是否明确` + `信息是否充分` + `边界是否明确` + `示例是否合适` + `输出是否结构化`

所以 Prompt Engineering 更像：**设计模型的输入接口**，而不只是“研究一句怎么说效果最好”。

