---
title: 后训练方式：SFT、DPO、PPO 与 GRPO
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - 大语言模型
  - 后训练
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/后训练方式.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。


## 统一框架

后训练的本质是：**通过不同形式的反馈，重新调整模型对不同回答的概率。**

假设给模型一道题：

> $6\ ?\ 2 = 12$，应该填什么运算符？

模型可能生成：

> A：`6 + 2 = 8，所以答案是 +`
>
> B：`6 × 2 = 12，所以答案是 ×`
>
> C：绕了很久，最后答 `-`

SFT、DPO、PPO、GRPO 的根本区别，不是模型结构不同，而是：**你究竟怎样告诉模型 B 比其他答案好。**

### SFT：直接告诉模型答案

训练模型时，直接给模型答案：

```
问题：6 ? 2 = 12

标准回答：
先分别尝试四种运算。
6 × 2 = 12，因此答案是 ×。
```

然后让模型提高生成标准答案的概率。就像“老师把解题过程写在黑板上，学生照着学。”

所以 SFT 擅长的是模仿，但有一个问题，模型学习的是“像不像”，而不是“对不对”。

### DPO：告诉模型“这个比那个好”

训练数据变成：

```
Prompt:
6 ? 2 = 12

Chosen:
6 × 2 = 12，因此答案是 ×。

Rejected:
6 + 2 = 12，因此答案是 +。
```

让模型学习 $P(\text{Chosen}) > P(\text{Rejected})$。于是 DPO 不像 SFT 让模型模仿生成答案的过程，而是告诉模型这两个回答里，我更喜欢前者。

### PPO：模型做题，做完打分

接下来进入强化学习，PPO的流程变为：

```
问题
 ↓
模型自己生成回答
 ↓
Reward Model / Verifier 打分
 ↓
计算 Advantage
 ↓
根据 reward 更新模型
```

模型在训练过程中不只是被动接受输出，也进行回答。比如模型生成 `答案 +`，`reward = 0`；`答案 *`，`reward = 1`。这样模型就能学习第二种回答更应出现。

### GRPO：

GRPO 是 DeepSeekMath 提出的 PPO 变体，后来 DeepSeek-R1 大规模采用：

```
GRPO

同一道题生成 G 个回答
        ↓
分别计算 Reward
        ↓
组内比较
        ↓
计算 Relative Advantage
        ↓
根据 reward 更新模型
```

也是每一个回答进行 `reward` 评分，但是不是看绝对 `reward` ，而是看每一个回答相对于同组的其他回答怎么样。比如组内 `reward`为：

$$
R=[0,\ 1,\ 0.8,\ 0.2]
$$

平均 ：$\bar R=0.5$，那就可以让模型知道第 2,3 个回答比同组平均水平好，而第 1,4 个回答相反。

```
                 Post-training
                      │
       ┌──────────────┼──────────────┐
       ↓              ↓              ↓
      SFT            DPO             RL
       │              │          ┌───┴───┐
   Demonstration   Preference     PPO    GRPO
       │              │           │      │
     模仿             比较        奖励   相对奖励
```

## SFT（Supervised Fine-Tuning，监督微调）

先来看 SFT Loss公式：

$$
\mathcal L_{\mathrm{SFT}} = -\sum_{t=1}^{T} \log P_\theta(y_t\mid x,y_{<t})
$$

$x$ 是问题，$y_{<t}$ 是模型产生的上下文，$y_t$是模型要预测的 token ，$\theta$是模型参数，于是 SFT 的目的就是在给定上下文的情况下最小化生成下一个 token 的 Loss，使得其和标准答案一致。

那为什么 SFT 不是背答案呢？因为训练集中可能会反复出现可泛化（generalization）的能力，比如：`→ 分解条件→ 建立关系→ 计算→ 验证→ 答案`，那模型就可能学习到解题的模式。这其实和普通的监督学习一样，比如训练猫狗分类器，不是希望模型背答案，而是让模型提取图片中可泛化特征。

如果是`CoT-SFT`，会把模型中间 reasoning token 也计算 loss，相比于一般的 SFT，模型不仅学习正确答案是什么，还学习了中间正确的推理过程。

但是注意，**SFT 并不是让模型学会推理**，假设训练数据是Question->Step 1->Step 2->Step 3->
Answer，模型只是学习提高生成每一个`Step`的概率，但是它并不知道为什么要这个`Step`，这个`Step`是否必要，是否正确。

所以这就引发了思考：SFT 到底让模型学会了什么？比较肯定的是，模型学习到了`reasoning format`和`reasoning strategy`。前者是让模型知道推理格式怎么组织，比如思考时用`<think>`标签，回答时用`<answer>`，也学会了比如要分布推理的方法；后者让模型学习对应具体问题应该怎么具体分析，比如对于数学问题，怎么进行具体的分布推理：分析、回溯、验证等方法。

但是 SFT **是否让模型学习了新能力**？这个争议比较大。在 LIMA 中，作者提出`Superficial Alignment Hypothesis`：模型在预训练阶段已经获得了大量能力，SFT 更多的是教模型把这些能力以符合用户偏好的方式表现出来。但是不能把这个理解为 SFT 没让模型学习到新能力，因为在反向传播的过程中模型参数改变，而这些改变可能会影响模型能力。所以多少是模型本来就有的能力，多少是学习的能力，这个是在 SFT 阶段值得思考的。

这样我们知道了 SFT 主要学习的是`Imitation`，主要让模型学习特定的解题路径，但为什么对，还有没有其他方法，这是没有学习的。所以自然地想到用 RL 让模型自己探索。

## PPO （Proximal Policy Optimization，近端策略优化算法）

先来看一下 RL 中的基本术语：

| RL 概念               | LLM 中是什么               |
| ------------------- | ---------------------- |
| State $s_t$         | prompt + 当前已经生成的 token |
| Action $a_t$        | 下一个 token              |
| Policy $\pi_\theta$ | 语言模型                   |
| Trajectory          | 一整条生成回答 / CoT          |
| Reward $R$          | 回答得到的分数                |
RL 训练的本质是：

$$
a_t\sim\pi_\theta(\cdot|s_t)
$$

意思是：在时刻 $t$，智能体根据当前状态 $s_t$，从参数为 $\theta$ 的策略 $\pi_\theta$ 所定义的概率分布中，采样得到动作 $a_t$。

`Policy`，也就是 $\pi_\theta(\cdot|s_t)$，其实就是LLM中的$P_\theta(\text{next token}\mid\text{context})$，比如对于给定上下文，模型可能预测`P(A) = 20%`，`P(B) = 30%`，`P(C) = 50%`，这整个分布就是`Policy`，RL 就是要改变模型参数从而改变这个概率分布。

前面说到`Reward`大致怎么给出，一般来说正确为 1，错误为 0。所以 RL喜欢可验证答案，而不是无法评分的答案。

如果只给最终的答案`Reward`，我们就无法知道中间的推理过程哪些 token 是值得模型学习的，所以这就需要`Credit Assignment`，也就是最后的正确回答需要把功劳分给哪些行为。PPO 为了解决这个问题，要引入`Value` 和 `Advantage`。

`Value`定义为：$V(s_t)$ ，直觉是：现在已经生成到这里，根据经验，最终预计能拿多少 reward？比如好的方向得到$V(s)=0.8$，不好的方向得到$V(s)=0.2$。

`Advantage`最简单的理解是： $A \approx R-V(s)$，表示实际结果比预期结果好多少。比如之前判断$V(s)=0.2$，但是最后得到$Reward = 1$那$A = 0.8 > 0$，说明模型做的比预期好，需要强化，所以反过来$A <0$ 就要避免。

这样有这一个简单的模型：$A \approx R-V(s)$，我们就能控制模型在推理过程中需要强化哪些行为。比如 2个问题最后 Reward = 1，简单的问题 A = 0.1，复杂问题 A = 0.9，我们就知道了需要强化的具体方向。

### Policy Gradient

最基本的思想是：

$$
\nabla_\theta \log\pi_\theta(a_t|s_t) A_t
$$

$\nabla_\theta \log\pi_\theta(a_t|s_t)$表示朝着动作 $a_t$ 的“最快”方向。但问题是我们不知道是要生成 $a_t$ 还是远离，所以乘以 $A_t$，$A_t > 0$ 则靠近，反之则远离。

在进行`Policy Gradient`时，也应该注意一次不能更新地“太狠”，不然模型生成的概率分布会发生巨大变化，导致训练不稳定。所以我们用`Ratio`来比较`Policy Gradient`之后新旧模型对于相同`State`进行下一个动作 $a_t$ 的概率比，以此来衡量`Policy Gradient`改变了多少：

$$
r_t(\theta) = \frac{ \pi_\theta(a_t|s_t) }{ \pi_{\theta_{\text{old}}}(a_t|s_t) }
$$

那怎么控制更新的幅度呢？最经典的是用`PPO-Clip`(裁剪目标函数)：

$$
L^{CLIP} = \mathbb E_t \left[ \min \left( r_tA_t, \operatorname{clip}(r_t,1-\epsilon,1+\epsilon)A_t \right) \right]
$$

先看内核，使用了 `clip` 函数，定义是：

$$
\operatorname{clip}(x,a,b) = \begin{cases} a,&x<a\\ x,&a\le x\le b\\ b,&x>b \end{cases}
$$

假设 $\epsilon = 0.2$，那 $\operatorname{clip}(r_t,1-\epsilon,1+\epsilon)$就被限制到了$[0.8,1.2]$。如果 $A_t > 0$，那我们希望提高这个动作的概率，那经过`Policy Gradient`之后，如果 $r_t = 1. 1$，代入公式不会裁剪，表示这次幅度还可以，但是如果 $r_t = 1. 5$，就会被裁剪为 1.2，表示幅度太大了，就保持在 $r_t = 1. 2$。$A_t < 0$ 也同理，最多降低到$r_t = 0.8$。最外层的 $\mathbb E_t[\cdots]\approx \frac{1}{N}\sum_t$ 表示对一定时间内的样本求平均。这也是`Proximal`的来源之一：保持在“附近”。

但如果只限制每次更新的幅度，那即使用 $\epsilon$ 控制的幅度很小，在多次变化之后仍可能会和最初的模型相差甚远。所以需要用 KL散度 (Kullback–Leibler divergence，两位提出者的姓) 来控制：

$$
D_{KL}(\pi_\theta\|\pi_{\rm ref})
$$

$\pi_\theta$ 是当前 PPO 训练后的模型输出的概率分布，$\pi_{\rm ref}$ 是原来的 SFT 模型输出的概率分布。这个式子就是衡量两个概率分布的差异，差异越大值越大。所以当出现大差异时要进行惩罚，惩罚就是改变`Reward`：

$$
R_{\rm total} = R_{\rm task} - \beta D_{KL}
$$

$R_{\rm task}$ 是`Reward Model`觉得这个回答有多好，$- \beta D_{KL}$是偏离初始模型的惩罚。

那为什么 PPO偏离基础模型太远不好呢？因为可能会出现`reward hacking`：经过 PPO 训练之后模型学到的是提高`Reward`的方法，而不是提高完成真正任务的能力。比如`Reward Model`有一个错误的评分：对于越长的回答越喜欢，那 PPO 训练之后可能会使得模型生成非常长的废话，而不一定完成了任务。

### pipeline

```
         Prompt x
            ↓
        Policy πθ
            ↓
    rollout 一条回答
            ↓
     x → y1 → y2 → ... → yT
            │
            ↓
        Reward R
            │
            ↓
       Value Model
            │
            ↓
     计算 Advantage
            │
            ↓
A > 0 → 提高这些 action 的概率
A < 0 → 降低这些 action 的概率
            │
            ↓
       PPO Clip
    防止一次更新太大
            │
            ↓
       KL penalty
    防止整体跑得太远
            │
            ↓
     更新 Transformer
```

## GRPO（Group Relative Policy Optimization，组相对策略优化）

在 PPO 中，相对于 SFT 需要进行很多额外的计算，最关键的是计算$A \approx R-V(s)$ 通常需要一个额外的模型，称作`Value/Critic Model`，这个模型也需要很大的神经网络。而既然计算`Value`就是定义一个比较标准，那 GRPO 就使用同一个问题产生不同回答，这样就可以得到比较标准，从而节省了计算资源。

比如对于同一个问题，使用 GRPO 生成多个回答：

$$
\{o_1,o_2,\dots,o_G\}
$$

例如:

```
同一个 Prompt

├─ o₁：17 × 24 = 388            Reward = 0
├─ o₂：17 × 24 = 408            Reward = 1
├─ o₃：17×20 + 17×4 = 408       Reward = 1
└─ o₄：17 + 24 = 41             Reward = 0
```

这样就得到了每一个回答在同组的表现怎么样，这就是`Group Relative `。

最简单的比较标准就是计算同组`Reward`的平均值，把每个回答的`Reward`减去平均值，那我们就知道了$o_2,o_3$ 的回答较好。在实际计算中，还会把最后结果除以标准差做标准化统一训练尺度。于是：

$$
A_i=\frac{R_i-\operatorname{mean}(R)}{\operatorname{std}(R)}
$$

所以 GRPO 和 PPO 一样，都是为了知道这次`rollout`是值得鼓励还是抑制。

利用 GRPO 算完`Advantage`之后，还是和 PPO一样进行`Policy Gradient`，所以 GRPO其实是PPO的变体，只是改变了计算`Advantage`的方式。

如果我们只对整个回答计算`Reward`，也就是典型的`Outcome Supervision GRPO`，同一回答所有 token 的 `Advantage` 相同，那我们就不知道咋推理过程中那些步骤作用大，哪些步骤没有作用，所以这适合只需要粗粒度反馈的任务，比如数学、代码等容易自动验证的任务。当然，为了解决这个问题，还有`Process Supervision GRPO`进行细致评价，同时代价当然也就更大。

但 GRPO也有局限：如果同组回答的`Reward`都差不多，那模型的有效学习信号就非常弱。比如所有回答都是错误的，`Reward`都未 0，那模型就很难学习，所以训练前的准备工作，训练方式也很重要。

## DPO（Direct Preference Optimization，直接偏好优化）

前面 3 种方法走了 2 条线：

$$
\text{SFT：模仿标准答案}
$$

$$
\text{PPO/GRPO：自己生成答案，再根据 reward 优化}
$$

而 DPO 走了另外一条线：直接给模型一对回答，并告诉模型谁好谁坏：

```
Prompt:
17 × 24 = ?

Chosen:
17 × 24
= 17 × (20 + 4)
= 340 + 68
= 408.

Rejected:
17 × 24
= 17 × 20
= 340.
```

一般表示为：$(x,y_w,y_l)$，其中：$x = prompt,y_w=\text{winner / chosen},y_l=\text{loser / rejected}$。

训练信号不是让模型生成 $y_w$，而是告诉模型 $y_w$ 比 $y_l$ “好”。

那为什么需要这种“偏好”而不是像 SFT 一样告诉模型答案呢？因为现实中有很多问题难以得到所谓的“标准答案”，也难以计算`Reward`，比如很多`alignment` 问题：

> 哪个回答更有帮助？
>
> 哪个推理过程更合理？

但是这种问题我们很容易判断哪个回答更好：

> [!example] 示例｜
>
> **Answer A**
>
> 答案是 408。
>
> **Answer B**
>
> 17 × 24 = 17 × (20 + 4)  
> = 340 + 68  
> = 408。  
> 所以答案为 408。

答案都是正确的，但我们可以告诉模型 B 答案更好。

其实在 DPO 之前， RLHF 就使用了这种偏好对，但类似 PPO的训练方法还需要进行计算`Reward`，在用 PPO 将其最大化使得最后的生成分布更符合偏好的答案。那既然最后目的是生成偏好的答案，于是DPO就绕过了中间的计算和 PPO。

### RLHF（Reinforcement Learning from Human Feedback，基于人类反馈的强化学习）

先来看经典的 RLHF，有：

$$
y_w\succ y_l
$$

注意 $\succ$ 是表示优于”或“更受偏好”，不是数学关系。

希望 Reward Model 满足：

$$
r(x,y_w)>r(x,y_l)
$$

Reward Model 计算完之后，用 Preference Model 计算一个回答比另一个回答更受偏好的概率（preference probability），通常用Bradley–Terry Model（BT 模型，布拉德利–特里模型）：

$$
P(y_w\succ y_l|x) = \sigma \left( r(x,y_w)-r(x,y_l) \right)
$$

其中：

$$
\sigma(z)=\frac{1}{1+e^{-z}}
$$

就是 sigmoid。因为我们希望`Reject`的分数固定的情况下，`Chosen`分数越高，偏好概率越大，而两者分数相同的情况下概率为 0.5。sigmoid 函数刚好符合这个特性：

![Pasted image 20261008112721](/img/blogs/llm-post-training/pasted-image-20261008112721-990330de.png)

计算完偏好概率后进行训练，而由前文可知，训练的目的不是简单的最大化 $r(x,y)$，通常要加入约束：

$$
\max_{\pi_\theta} \mathbb E_{y\sim\pi_\theta} [ r(x,y) ] - \beta D_{KL} ( \pi_\theta \| \pi_{\mathrm{ref}} )
$$

用`Reference Model`计算 KL 的惩罚。对于上述带 KL 正则化的优化目标，可以推导出最佳`Policy`满足：

$$
\pi^*(y|x) \propto \pi_{\mathrm{ref}}(y|x) \exp \left( \frac{r(x,y)}{\beta} \right)
$$

$\pi^*(y|x)$ 表示最佳`Policy`，$\propto$ 表示正比于。

先忽略推导过程，可以知道这个公式的大致意思：一个回答的`Reward`越高，对于原来的`Preference Model`的概率的提高也应该越多。

进一步取对数并整理，可以得到：

$$
r(x,y) = \beta \log \frac{ \pi^*(y|x) }{ \pi_{\mathrm{ref}}(y|x) } + C(x)
$$

$C(x)$ 只和 prompt 有关。

简单建模成：

$$
Reward \approx \log \frac{\text{当前 Policy 概率}} {\text{Reference Policy 概率}}
$$

于是我们得出了对于生成一个特定的回答，如果当前 Policy 概率高于Reference Policy 概率的概率，那这个回答就可以被解释为具有更高的`Reward`。

把这个式子代入`preference probability`：

$$
P(y_w\succ y_l|x) = \sigma \left( r(x,y_w)-r(x,y_l) \right)
$$

由于 winner 和 loser 用的是同一个 prompt，于是常数项抵消，得到

$$
P(y_w>y_l|x) = \sigma \left[ \beta \left( \log \frac{\pi_\theta(y_w|x)} {\pi_{\mathrm{ref}}(y_w|x)} - \log \frac{\pi_\theta(y_l|x)} {\pi_{\mathrm{ref}}(y_l|x)} \right) \right]
$$

现在就可以计算`Loss`了，由于有winner 和 loser两种类别，用二分类交叉熵（Binary Cross-Entropy，BCE）：

$$
L_{\mathrm{BCE}}=-[t\log p+(1-t)\log(1-p)]
$$

在训练过程中已经告诉模型$y_w>y_l$，于是$t = 1$，代入概率，得到：

$$
\mathcal L_{\mathrm{DPO}} = - \log\sigma \left[ \beta \left( \log \frac{\pi_\theta(y_w|x)} {\pi_{\mathrm{ref}}(y_w|x)} - \log \frac{\pi_\theta(y_l|x)} {\pi_{\mathrm{ref}}(y_l|x)} \right) \right]
$$

这就得到了 DPO 的核心`Loss`。

所以DPO的关键贡献是：把原来需要强化学习解决最大化`Reward`的问题，转换成用最优 Policy 相对于 Reference Policy 的概率比来表示`Reward`，把原本的奖励最大化问题转化为可直接通过偏好数据优化的分类目标，从而无需显式训练 Reward Model，也无需执行 PPO 等强化学习优化。

![Pasted image 20261008121750](/img/blogs/llm-post-training/pasted-image-20261008121750-8f720871.png)

看中间相减的两项：

$$
\log \frac{ \pi_\theta(y_w|x) }{ \pi_{\mathrm{ref}}(y_w|x) } - \log \frac{ \pi_\theta(y_l|x) }{ \pi_{\mathrm{ref}}(y_l|x) }
$$

其实都是在计算当前`chosen/reject`的输出概率相对于`reference model`的比。我们希望这个差距越大越好。

那为什么 DPO 不直接算$P(y_w)>P(y_l)$ 而是作“比”呢？因为可能对于`reference model`，`chosen`本来就比`reject`更难出现，所以 DPO 不要求最后$P(y_w)>P(y_l)$，而是`chosen`提高的比例大于`reject`提高的比例。所以`reference model`相当于提供了一个“锚点”。这就是为什么 DPO 不能简单的：chosen 做 SFT
+rejected 做负 SFT。

例如：
Reference model：

$$
\pi_{\mathrm{ref}}(y_w)=0.10
$$

$$
\pi_{\mathrm{ref}}(y_l)=0.20
$$

训练一段时间以后：

$$
\pi_\theta(y_w)=0.20
$$

$$
\pi_\theta(y_l)=0.10
$$

那么 chosen：

$$
\frac{0.20}{0.10}=2
$$

说明概率翻倍。

Rejected：

$$
\frac{0.10}{0.20}=0.5
$$

说明概率减半。

因此：

$$
\log 2-\log0.5 = \log4 >0
$$

DPO 会认为方向正确：

> chosen 相对于 reference 被显著增强，而 rejected 被压低。

先在把 DPO 对于其他 3 种方法进行比较：

相对于 SFT 来说，两者其实非常相似：

### SFT

输入：

$$
(x,y)
$$

优化：

$$
-\log\pi_\theta(y|x)
$$

### DPO

输入：

$$
(x,y_w,y_l)
$$

优化：

$$
-\log\sigma(\text{chosen margin}-\text{rejected margin})
$$

`magin`在机器学习中通常表示两个分数之间的差距，在 DPO 中用来衡量模型对某个回答的偏好程度。对于一个回答 $y$，定义

$$
m(x,y)=\beta\log\frac{\pi_\theta(y|x)}{\pi_{\mathrm{ref}}(y|x)}
$$

所以二者都是：

```
数据集
↓
forward
↓
算 loss
↓
backward
```

但是训练信号不同：

$$
\boxed{ \text{SFT：绝对模仿} }
$$

$$
\boxed{ \text{DPO：相对偏好} }
$$

对于 PPO 来说，DPO利用了$r(x,y) \leftrightarrow \log \frac{\pi(y|x)} {\pi_{\mathrm{ref}}(y|x)}$这个数学关系，所以不需要`Reward Model`。

PPO 路线：

```
Preference
   ↓
Reward Model
   ↓
输出 scalar reward
   ↓
PPO
```

`Scalar Reward`（标量奖励），指用一个数值来评价模型生成的回答质量。

DPO：

```
Preference pair
   ↓
直接代入 DPO loss
   ↓
Policy update
```

自然，DPO 对于 GRPO区别就比较大了：

GRPO 训练过程中：

```
当前 Policy
↓
对 Prompt 在线生成多个回答
↓
Verifier 打 Reward
↓
计算 Group Advantage
↓
更新 Policy
```

所以训练数据随着 policy 改变：

$$
y\sim\pi_\theta
$$

每轮更新模型参数后，模型生成回答的概率分布可能发生变化，后续采样得到的训练数据也会相应变化。这是典型的 **online policy optimization**。

而标准 DPO 通常拿一个已经准备好的静态 preference dataset：

$$
(x,y_w,y_l)
$$

然后像监督学习一样：

```
读取一个 batch
↓
forward chosen
↓
forward rejected
↓
计算 DPO loss
↓
backward
```

训练过程中不需要：

> 先让当前模型 rollout 一批答案再打分。

所以标准 DPO 更接近：

$$
\boxed{\text{offline preference optimization}}
$$

这也是它工程上明显简单的原因。

这也是两者最大的差别，比如一道题有 4 中推理路径：$A,\ B,\ C,\ D$，DPO 只会告诉模型$A\succ B$，于是模型会提高 A 相对于 B 的偏好，但不会主动探索 C、D。GRPO 则在每次 rollout 中让模型自己探索，可能会探索到 4 条路径，发现 D 最好，于是强化D。

所以从 reasoning 的视角：

$$
\boxed{ \text{DPO 更偏 preference learning} }
$$

$$
\boxed{ \text{GRPO 更偏 exploration + reward optimization} }
$$

但这并不代表 DPO 就一定比 PPO/GRPO 差，因为解决的问题不完全相同。如果目标是让回答更加符合人类主观偏好这种难以定义`Reward`的问题，但是可以轻易分辨出偏好，那么 DPO就非常自然，如果目标是数学、代码题，有明确且简单的计算`Reward`方式，那GRPO 这种 online RL 方法就很有吸引力。所以要区分任务提供的监督信号。

用一张表总结：

|                 | SFT       | DPO         | PPO             | GRPO                    |
| --------------- | --------- | ----------- | --------------- | ----------------------- |
| 数据              | $x,y$     | $x,y_w,y_l$ | Prompt + Reward | Prompt + Reward         |
| 标准答案            | ✅         | 两个答案比较      | ❌               | ❌                       |
| Preference pair | ❌         | ✅           | 可用于训练 RM        | 不必                      |
| 在线 rollout      | ❌         | 标准 DPO ❌    | ✅               | ✅                       |
| Reward Model    | ❌         | ❌           | 经典 RLHF 常有      | reasoning 中通常用 verifier |
| Critic          | ❌         | ❌           | ✅               | ❌                       |
| Exploration     | 很弱        | 很弱          | ✅               | ✅                       |
| 核心信号            | imitation | preference  | advantage       | relative advantage      |

