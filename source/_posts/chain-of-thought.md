---
title: Chain-of-Thought：从思维链到推理时计算
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - 大语言模型
  - 推理
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/Chain-of-Thought.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

## Chain-of-Thought 是什么

Chain-of-Thought（CoT），直译就是：思维链 。

最直接的生成方式是直接根据问题生成答案，也就是要求模型一次在隐藏状态也就是 Transfomer 中固定的神经网络层中完成所有的计算，根据 LLM原理也就是$$

P(\text{Answer}\mid \text{Question})$$

假设问题是：
>一本书 24 元，一支笔的价格是书的 1/3。  
>买 2 本书和 3 支笔一共多少钱？

那直接的生成方式就是：
>答案：72 元.

这对于简单的问题比如加减可能没什么问题，但是如果问题需要连续十几步数学推导，那模型在一次在隐藏状态生成正确答案就会很困难。

CoT 让模型在生成最终答案之前生成一系列中间推理步骤，使得前一步的结果不再只能存在于神经网络内部的 $h$ 里，而是直接成为新的 token，后面的 Transformer 又可以读取这些 token 继续算。这样就能完成更复杂的任务。

模型的 CoT 例如：
>一本书 24 元。
>
>一支笔：
24 / 3 = 8 元
>
>两本书：
24 × 2 = 48 元
>
>三支笔：
>8 × 3 = 24 元
>
>总价：
>48 + 24 = 72 元
>
>答案：72 元

于是模型在预测的过程中，不止看到的是原问题，而是问题 + 推理过程，比如在第二步推理时，看到的是：
>原问题
+
一支笔 = 8 元

这些推理过程生成的 tokens 就相当于草稿纸的作用，能让模型能完成更复杂的任务。

于是模型不再学习：$$Question \rightarrow Answer$$
而是学习：$$ Question \rightarrow z_1 \rightarrow z_2 \rightarrow z_3 \rightarrow Answer$$
其中的 $z$ 就是在 CoT 中的 reasoning tokens。

可以理解为 CoT 是“用 token 换计算”，中间的 $z$ 都是额外生成的 token。 CoT 也是后来所谓的 Inference-time Scaling 的基础思想。

其实最开始的 CoT 是 Few-shot 的，人为地让模型看到：
```
Question
→ reasoning
→ answer
```
这就是经典的Few-shot CoT。

而后来人们发现甚至不需要给模型提供示例，只需要在问题后面提供一句类似`Let's think step by step.`，模型就更容易自己生成中间推理。所以模型其实本来就有`reasoning capability`，只需要把它“引出来”（Elicit）。

但是注意 CoT 并没有改变模型的参数，我们看到的模型输出的中间过程也不等同于模型内部真实的思想，而是模型生成出来的 token 序列。可以把 CoT 理解为一种`外部可表示的中间计算轨迹`。

经过训练，在解决复杂问题时，模型的 CoT可能会非常长，这就是`Long CoT`。但是主要“想得越长”不等于“一定越聪明”。

## 从一条 CoT 到多路径推理

我们有这个模型：
$$ Question \rightarrow z_1 \rightarrow z_2 \rightarrow z_3 \rightarrow Answer$$
但如果在 CoT 中某一部走错了怎么办？自回归模型会将上次生成的结果作为上下文，那可能会将早期的错误一路传播下去。所以有一个自然的想法就是：**不要让模型只想一遍**。

### Self-Consistency

假设模型需要进行下一步推理，有`P(A) = 70%`，`P(B) = 30%`，如果是 Greedy CoT，那就会选择 A。于是
Greedy CoT每次只会选择概率最大的路径，最后只会生成一条推理轨迹。

可是概率最大的路径不一定是正确的路径，所以这就需要 Sampling 方式来抽样选择路径。于是同一个问题就得到了多种推理路径。

`Self-Consistency`就是根据不同路径最后的结果进行多数投票，票数最高的结果就是最后输出。
例如：
```
                    Path 1 → 42
                    Path 2 → 42
Question ────────── Path 3 → 38
                    Path 4 → 42
                    Path 5 → 41
```
最后就会输出`42`。

那为什么是多数投票呢？因为问题有不同的解法，而正确的解法殊途同归，错误的解法答案可能都不一样，于是选择出现次数最多的答案。

本质是：
$$Sampling + Aggregation$$

### Best-of-N

第一步和`Self-Consistency`一样，都是一个问题生成多条回答，但不一样的是`Best-of-N`给每一个回答用`verifier`进行评分，选择评分最高的回答。

### Tree-of-Thought (ToT)

前面 2 种方法都是 CoT 结束才判断，而`Tree-of-Thought`是在模型推理过程中进行判断，在进行下一步推理时，模型可能会生成多条路径，并对这些路径进行评价、保留、展开，必要时还可以回溯：

```
                  ┌→ Thought A1 → A2
Question → Thought
                  ├→ Thought B1 → B2 → B3
                  │
                  └→ Thought C1 → C2
```

也就是:$$
Tree$$
这和算法中的 BFS / DFS类似。


现在总结以上方法，让模型想的更久是增加深度，也就是`Long CoT`；让模型尝试更多答案是增加广度，是`
`Self-Consistency`和`Best-of-N`，把计算用在搜索上是`Tree-of-Thought`。

把模型训练完以后，为了回答一道题，在推理阶段花多少计算资源称作`Test-time compute（测试时计算量）`，可以先用一个非常直观的框架理解：
$$ \boxed{ \text{Test-time Compute} = \text{Depth} + \text{Breadth} + \text{Search} }$$
## Inference-time Scaling

`Inference-time Scaling`是`Test-time compute`更上一层概念：随着 `test-time compute` 增加，模型性能能否继续提高，以及应该怎样增加这些计算。也称作`Test-time Scaling`。

和训练阶段 scaling不同，训练阶段是投入更多参数 / 更多训练数据 / 更多训练 FLOPs来得到能力更强的模型，而`Inference-time scaling`是对训练完的模型投入更多推理 FLOPs 来生成更好的答案。

现在在**相同的推理预算**的情况下讨论这几种方法的适用方式。

比如非常难的数学证明需要深度的连续推理，那`Long CoT`就很适合，这时候把预算分散到其他路径可能就无法完成推理。

如果模型生成正确答案的概率较低，推理路径没那么长，就可以用`Self-Consistency`或者`Best-of-N`来提高最后生成正确答案的概率。

所以说，不同难度的问题，最佳策略不同。但是注意，小模型 + 无限思考不一定能超过大模型。因为如果问题包含着模型没有学习过的知识，那不论怎么思考都不可能回答正确。所以说模型得具备一定的潜力，`Inference-time Scaling`才能进一步挖掘。也就是：

$$\boxed{ \text{Performance} = \text{Trained Capability} + \text{Inference Strategy} + \text{Inference Compute} }$$
### Verifier

前面提到`Self-Consistency`和`Best-of-N`，`Tree-of-Thought`通常包含 2 个组件`Proposer` 和 `Verifier`。

`Proposer`来提出候选解，`Verifier`判断候选解有多好。这也是很多`inference-time scaling`通常包含的组件。

所以现在关键的是`Proposer`能提出正确的答案，那怎么选选出来呢？这就是为什么`Verifier`非常重要。`Verifier`又分成两个非常重要的方向：

#### 1.Outcome Reward Model：ORM

只关心最后答案是否正确，最最后答案评分，而不关心 CoT 是否正确。

#### 2.Process Reward Model：PRM

和前者相反，评价每一步推理。这样通常能进行更精确的控制。

同时由于我们能监控每一步推理过程，能在错误出现时进行及时控制，而不是像 ORM 一样只能等到最后生成答案再进行判断。于是PRM更`compute-efficient`。





