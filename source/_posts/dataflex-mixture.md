---
title: DataFlex Mixture：分配不同领域的训练预算
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - DataFlex
  - 数据配比
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/DataFlex/Mixture.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

[← DataFlex 总览](/posts/dataflex/)

## Mixture 到底在解决什么问题？

对于有多个来源的数据，Mixture 就是要决定：

$$
\boxed{
\mathbf p=(p_1,p_2,\ldots,p_K)
}
$$

其中：

- $K$：数据域的数量。
- $p_k$：训练时从第 $k$ 个数据域采样的概率。
- $p_k\geq 0$，且 $\sum_kp_k=1$。

Mixture 不一定关心某一个样本具体有多大价值，而是可能认为这个领域整体应该获得更多训练预算。

这也意味着，Mixture 通常是一种比较粗粒度的数据策略。一个领域内部可能同时包含高质量、低质量、简单、困难和重复样本。

## Static Mixer：最简单，但也是最重要的对照

Static Mixer 不需要计算当前 Loss、梯度或者其他模型反馈。

只要指定：

$$
\mathbf p=(0.7,0.3)
$$

整个训练过程中就保持数学 70%、代码 30%。

### 为什么重要

假设 ODM 的训练结果优于默认 6:4，我们并不能立刻判断“动态调整”是优势来源。

因为可能存在一个固定的 8:2 配比，效果比 ODM 还好。

因此：

- Default Static：使用原始数据比例。
- Uniform Static：所有数据域等比例采样。
- Tuned Static：通过验证实验确定较好的固定比例。

这三种情况应该区分。

## Random Mixer：随机生成配比

Random Mixer 不根据训练反馈寻找最优比例，而是生成随机正数，再将它们归一化：

$$
p_k=\frac{r_k}{\sum_j r_j}
$$

例如随机生成：

$$
\mathbf r=(0.2,0.5,0.3)
$$

## DoReMi：用小模型寻找适合大模型的领域比例

如果不知道最好的数据配比，可能要不断使用 Static Mixer 寻找最优比例，但是对于较大模型，每一次训练都需要非常多的资源和时间，所以 DoReMi 希望用更便宜的小模型实验，找到一个可以用于目标模型的领域配比，它的核心思想是：

先在小模型上学习领域权重，再把权重转化成大模型训练时的数据采样比例。

训练过程分为三个阶段：

### 第一阶段：训练参考模型（Reference Model）

用原始领域比例训练一个小模型，作为比较基准。

参考模型就是使用原始数据配比正常训练出来的小模型。例如使用 280M 参数的小模型，按原来的比例进行常规语言模型预训练。

它的作用不是直接寻找最佳配比，而是回答：在原始训练条件下，模型能够将每个领域的数据学到什么程度？

训练完成后，将其参数冻结。

它现在具有两项特征：

- 模型已经经历了一次完整的参考训练过程。
- 面对某条数据，可以输出一个固定的基准 Loss。

### 第二阶段：训练代理模型（Proxy Model）

一边训练另一个小模型，一边根据它相对参考模型的表现调整领域权重。

通常选择使用和参考模型相同架构、相同参数规模的代理模型，但还没有经过训练，处于初始状态。

训练一段时间之后，代理模型也会得到各个领域的 Loss，定义超额损失（Excess Loss）：

$$
e_{d,t}=
\max\left(
\ell_{\mathrm{proxy},t}
-\ell_{\mathrm{ref},t},0
\right)
$$

这样就能判断相对于参考模型，代理模型哪些领域需要增加训练权重。

为了避免采样数量对 Excess Loss 的影响，第 2 步均匀抽取各领域样本。

得到 Excess Loss 后，DoReMi 采用 Group DRO（分组分布鲁棒优化）的思想：

$$
\min_\theta
\max_{\alpha\in\Delta_K}
\sum_{d=1}^{K}\alpha_d e_d(\theta)
$$

它包含两个方向相反的优化：

- 领域权重 $\alpha$ 做最大化：把注意力放到相对参考模型表现仍然较差的领域。
- 代理模型参数 $\theta$ 做最小化：努力降低这些领域的训练损失。

| 符号          | 含义                                               |
| ------------- | -------------------------------------------------- |
| $\theta$      | Proxy Model 的模型参数                             |
| $\alpha_d$    | 第 $d$ 个领域的 Loss 权重                          |
| $E_d(\theta)$ | Proxy 相对于 Reference 在领域 $d$ 上的 Excess Loss |
| $K$           | 领域总数                                           |
| $\Delta_K$    | 权重非负且总和为 1 的约束                          |

先看内层 $\max_\alpha$：寻找当前最需要关注的领域。这会使 Excess Loss 越大的领域分配更多的权重，但这会让模型过度集中于一个领域，所以 DoReMi 不直接采用这种极端解，而是使用指数梯度更新并加入平滑。

再看 $\min_\theta$：让 Proxy 改善这些领域。得到调整之后的权重后，训练 Proxy Model。其实就是最小化 $\alpha_d e_d(\theta)$。由于权重和参考模型的 Loss 固定，变量只有代理模型的 Loss，因此，这相当于对 Proxy 的各领域训练 Loss 进行加权优化。

![Pasted image 20261101144944](/img/blogs/dataflex-mixture/pasted-image-20261101144944-a5bd7dd6.png)

设经过一段时间训练，Code 的 Excess Loss 从 1.3 降到 0.2，而 Web 仍然是 0.3。

那么后续权重更新就可能更加偏向 Web。

这就形成了：

发现薄弱领域 → 提高其权重 → 训练 Proxy 改善该领域 → 重新发现当前薄弱领域。

这就是 Minimax（极小极大优化）的核心逻辑。

那怎么计算领域权重呢？

可以简化为：

$$
\widetilde{\alpha}_{d,t+1}
=\alpha_{d,t}\exp(\eta e_{d,t})
$$

然后归一化：

$$
\alpha_{d,t+1}
=\frac{\widetilde{\alpha}_{d,t+1}}
{\sum_j\widetilde{\alpha}_{j,t+1}}
$$

其中：

- $\alpha_{d,t}$：领域 $d$ 当前的权重。
- $e_{d,t}$：当前超额损失。
- $\eta$：控制权重变化速度。

之后这就形成了一个循环：

![Pasted image 20261101142823](/img/blogs/dataflex-mixture/pasted-image-20261101142823-a0f37357.png)

假设没有 Reference Model，只根据 Proxy Loss 分配领域权重：

$$
\alpha_d\propto \exp(\eta L_{\mathrm{proxy},d})
$$

那么算法会倾向于提高 Loss 很高的领域的权重。

但 Loss 高存在两种截然不同的原因：

1. 数据可以学会，只是当前 Proxy 还没学好。
2. 数据存在大量不可预测的信息，即使充分训练仍然很难。

DoReMi 引入 Reference Model，是为了尝试区分这两种情况，而不是直接把高 Loss 当成高训练价值。

### 第三阶段：训练目标模型（Target Model）

汇总代理训练阶段学到的领域权重，将其作为目标模型的静态采样配比。
原论文在第二阶段结束后，将训练过程中的领域权重取时间平均：

$$
\bar\alpha=\frac1T\sum_{t=1}^T\alpha_t
$$

然后用这个权重进行训练，而 DataFlex 的公开操作指南示例使用最后记录的领域权重训练。

### 局限

它的主要假设是：小代理模型上得到的领域偏好，能够有效迁移到更大的目标模型。

这种迁移可能成立，但也可能受到模型容量、训练阶段、领域间关系和目标任务的影响。

## ODM：在目标模型训练过程中动态调整比例

### 多臂老虎机算法

假设你有三个数据域：数学、代码、通用问答。

不知道哪个领域在当前阶段最值得投入训练预算。每次选择一个领域训练，都可以获得一些反馈；但你无法提前知道所有领域在未来训练中的收益。这与多臂老虎机（Multi-Armed Bandit）问题很相似。

这里存在一个经典矛盾：

- **Exploration（探索）**：尝试那些目前采样较少的领域，避免过早忽略潜在有价值的数据。
- **Exploitation（利用）**：增加当前收益估计较高的领域，让训练预算更多地投入它们。

ODM 使用 Exp3（Exponential Weights for Exploration and Exploitation） 风格的算法，在两者之间取得平衡。

### Exp3

Exp3 是一种针对对抗性多臂老虎机（Adversarial Multi-Armed Bandit）的算法。 它通过指数权重更新选择概率，同时保留随机探索的机会。

它与 ε-Greedy、UCB 的共同点是平衡探索与利用，但 Exp3 不要求各个臂的奖励分布始终固定。

### 核心思想

多臂老虎机优化目标是最大化累计期望奖励：

$$
\boxed{
\max_\pi\mathbb E_\pi\left[\sum_{t=1}^{T}r_t\right]
}
$$

ODM 直接使用训练 Loss 构造领域奖励：

$$
R_{d,t}=c\,\ell_{d,t}
$$

其中 $c$ 是一个缩放常数。

也就是说，训练 Loss 越高，原始奖励越高。ODM 采用的假设是：高 Loss 领域可能仍然包含更多模型没有掌握的信息，因此值得获得更多训练机会。

但是 ODM 不直接使用 $R_{d,t}$ 来参与计算，先对每个领域的 Reward 进行重要性加权（Importance Weighting）：

$$
\hat r_i= \begin{cases}
\displaystyle\frac{r_i}{p_i}, & \text{选中领域 }i\\
0, & \text{未选中}
\end{cases}
$$

为什么要除以采样概率？因为低概率领域被观察到的次数较少，需要补偿其观测频率，才能得到无偏的奖励估计。

进行重要性加权之后，还是不能参与运算，因为如果每次直接根据当前 Loss 调整配比，可能会使采样概率剧烈波动，于是 ODM 使用指数移动平均（EMA），既考虑最新信息，也保留部分历史信息：

$$
\boxed{
\hat R_{d,t} =\alpha\hat R_{d,t-1} +(1-\alpha)\frac{R_{d,t}}{p_{d,t}}
}
$$

ODM 再根据收益估计计算新的领域概率：

$$
\boxed{
p_{d,t+1}
=
(1-K\varepsilon_t)
\frac{\exp(\varepsilon_{t-1}\widehat R_{d,t})}
{\sum_j\exp(\varepsilon_{t-1}\widehat R_{j,t})}
+\varepsilon_t
}
$$

这个公式看起来复杂，其实分成两个部分就很容易理解。

第一部分：

$$
\operatorname{softmax}
(\varepsilon_{t-1}\widehat R)
$$

让估计奖励高的领域获得更大的概率。

第二部分：

$$
(1-K\varepsilon_t)(\cdots)+\varepsilon_t
$$

给每个领域保留一定的探索概率。

这样可以避免某个领域因为短期表现不好，被过早压缩到几乎没有训练机会。

DataFlex 的探索率随训练时间衰减，同时保留一个最小值：

$$
\varepsilon_t=
\max\left\{
\varepsilon_{\min},
\min\left(\frac1K,
\sqrt{\frac{\ln K}{Kt}}\right)
\right\}
$$

早期探索较多，后期通常更偏向利用已有的奖励估计。

![Pasted image 20261101154956](/img/blogs/dataflex-mixture/pasted-image-20261101154956-c917c06e.png)

## Dynamic MoE：利用专家路由关系决定领域比例

### 为什么 MoE 模型可以提供额外信息？

MoE（Mixture of Experts）模型包含多个专家网络。

对于不同 Token，路由器（Router）会决定主要激活哪些专家。

例如某个简化 MoE 模型有三个专家：

- Expert 1
- Expert 2
- Expert 3

数学数据可能更多激活 Expert 1，代码数据可能更多激活 Expert 2。

于是，不同领域的专家使用情况，可以反映模型对不同领域的内部处理模式。

Dynamic MoE 的核心想法是：用专家负载分布表示数据域，再根据领域之间的相似性调整采样比例。

### 计算过程

从不同领域的数据中抽取若干样本，记录它们对三个专家的使用情况。归一化后得到类似这样的向量：

$$
O_{\mathrm{math}}=(0.8,0.1,0.1)
$$

得到向量后，可以判断数据冗余，Dynamic MoE 使用 L2 距离：

$$
d(i,j)=\|\widehat O_i-\widehat O_j\|_2
$$

例如数学与代码的路由模式差异很大，距离就大；两类内容高度相似的数据，距离可能很小。
随后计算每个领域与所有领域的平均距离：

$$
\boxed{
\Delta_i=\frac1K\sum_{j=1}^{K}
\|\widehat O_i-\widehat O_j\|_2
}
$$

其中也包含领域自身距离 0。

这可以理解为：

如果某个领域的路由模式与其他领域都很不一样，它就可能包含较少被其他领域替代的模型处理模式

得到每个领域与所有领域的平均距离后，更新采样比例：

$$
\boxed{
\widetilde p_{i,t+1}
\propto p_{i,t}\exp(\eta\Delta_i)
}
$$

然后进行均匀平滑：

$$
p_{i,t+1}
=(1-c)\widetilde p_{i,t+1}
+\frac{c}{K}
$$

其中：

- $\eta$：控制配比更新强度。
- $c$：防止采样比例过度集中的平滑参数。

![Pasted image 20261101155946](/img/blogs/dataflex-mixture/pasted-image-20261101155946-f642d3f2.png)

### 局限

如果模型是 Dense 架构，Dynamic MoE 的路由信号未必可用。

## 五种 Mixture 算法的完整横向比较

| 算法        | 评分或决策信号         | 调整发生的阶段         | 主要额外计算                         |
| ----------- | ---------------------- | ---------------------- | ------------------------------------ |
| Static      | 人为指定比例           | 全程固定               | 基本无算法评分                       |
| Random      | 随机数                 | 理论上可在更新边界调用 | 极低                                 |
| DoReMi      | 相对参考模型的超额损失 | 代理模型训练阶段       | 参考模型和代理模型训练、Loss 比较    |
| ODM         | 当前训练 Loss 奖励     | 目标模型训练阶段       | 少量反馈统计与策略更新               |
| Dynamic MoE | 各领域的专家路由负载   | MoE 目标模型训练阶段   | 额外前向、专家负载采集及领域距离计算 |

## DataFlex 如何真正把领域比例变成训练数据？

在独立 Mixture 模式下，整体流程是：

![Pasted image 20261101160358](/img/blogs/dataflex-mixture/pasted-image-20261101160358-28e7192d.png)

1. 当前独立 Mixture 在领域内部采用有放回抽样。
2. 比例控制的是样本数量，不自动等于 Token 数量比例。
3. `mixture_sample_rule` 会影响比例能否真正生效。

| 采样规则     | 最终使用的比例     | 动态 Mixer 输出能否直接生效 |
| ------------ | ------------------ | --------------------------- |
| `mixture`    | Mixer 输出的比例   | 可以                        |
| `uniform`    | 各领域均匀分配     | 被均匀规则覆盖              |
| `stratified` | 按源数据集大小分配 | 被原始数据规模规则覆盖      |

## 相关笔记

- [Selection：领域配比与样本选择](/posts/dataflex-selection/)
- [Reweighting：采样比例与 Loss 权重](/posts/dataflex-reweighting/)
- [Lego：组合领域配比与其他策略](/posts/dataflex-lego/#1-Lego-%E7%9A%84%E6%95%B4%E4%BD%93%E6%9E%B6%E6%9E%84)
- [Softmax 与温度参数](/posts/optimization-algorithms/#Softmax)
- [ODM 的多臂老虎机背景](/posts/optimization-algorithms/#%E5%A4%9A%E8%87%82%E8%80%81%E8%99%8E%E6%9C%BA%EF%BC%88Multi-Armed-Bandit-MAB%EF%BC%89)

