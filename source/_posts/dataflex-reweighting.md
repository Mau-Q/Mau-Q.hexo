---
title: DataFlex Reweighting：调整样本的梯度贡献
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - DataFlex
  - 数据重加权
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/DataFlex/Reweighting.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

[← DataFlex 总览](/posts/dataflex/)

## 本篇目录

- [加权目标](/posts/dataflex-reweighting/#Reweighting-%E5%88%B0%E5%BA%95%E5%9C%A8%E6%94%B9%E5%8F%98%E4%BB%80%E4%B9%88%EF%BC%9F)
- [逐样本 Loss 与训练接入](/posts/dataflex-reweighting/#DataFlex-%E5%AE%9E%E9%99%85%E5%9C%A8%E8%AE%AD%E7%BB%83%E7%9A%84%E5%93%AA%E4%B8%80%E6%AD%A5%E5%8A%A0%E6%9D%83%EF%BC%9F)
- [Loss Reweighting](/posts/dataflex-reweighting/#Loss-Reweighting)
- [ADAPT](/posts/dataflex-reweighting/#ADAPT%EF%BC%9A%E5%88%A9%E7%94%A8%E6%A8%A1%E5%9E%8B%E8%A1%A8%E5%BE%81%E5%88%A4%E6%96%AD%E4%B8%8E%E7%9B%AE%E6%A0%87%E4%BB%BB%E5%8A%A1%E7%9A%84%E5%85%B3%E7%B3%BB)
- [Joint-Update-Aware](/posts/dataflex-reweighting/#Joint-Update-Aware%EF%BC%9A%E4%B8%BA%E4%BB%80%E4%B9%88%E4%B8%8D%E8%83%BD%E5%8F%AA%E8%80%83%E8%99%91%E6%AF%8F%E6%9D%A1%E6%A0%B7%E6%9C%AC%E8%87%AA%E8%BA%AB%EF%BC%9F)
- [多模态 Weighter](/posts/dataflex-reweighting/#%E4%B8%89%E4%B8%AA%E5%A4%9A%E6%A8%A1%E6%80%81-Weighter)
- [七种 Weighter 对比](/posts/dataflex-reweighting/#DataFlex-Reweighting%EF%BC%9A7-%E7%A7%8D-Weighter-%E5%AF%B9%E6%AF%94)
- [权重尺度与 Loss 归约](/posts/dataflex-reweighting/#DataFlex-%E8%AE%AD%E7%BB%83%E4%B8%AD%E7%9A%84%E9%87%8D%E8%A6%81%E9%97%AE%E9%A2%98)

## Reweighting 到底在改变什么？

假设一个 batch 中有四条样本：ABCD，Loss 分别为 $\ell_i$。

普通训练会将这些样本的损失聚合为一个标量：

$$
L = \sum_{i=1}^{4}\ell_i
$$

Selection 可以决定只使用 B、C；Reweighting 则允许四条样本都参与训练，但为它们设置不同权重 $w_i$：

$$
L_w=\sum_{i=1}^{4}w_i\ell_i
$$

如果在本次反向传播中将权重视为常量：

$$
L_w=\sum_iw_i\ell_i(\theta)
$$

则：

$$
\boxed{
\nabla_\theta L_w
=\sum_iw_i\nabla_\theta\ell_i
}
$$

于是 Reweighting 就能通过控制权重来控制样本的梯度贡献。

## DataFlex 实际在训练的哪一步加权？

普通 SFT 的模型通常返回的是整个 batch 的标量 Loss。

但是 Reweighting 需要：

$$
[\ell_1,\ell_2,\ldots,\ell_B]
$$

因此必须先得到每条样本自己的 Loss。

DataFlex 的 `Weighter` 基类通过模型的 logits 与 labels，计算每条样本在有效预测 Token 上的平均交叉熵：

$$
\ell_i=
\frac{1}{|T_i|}
\sum_{t\in T_i}
-\log p_\theta(y_{i,t}\mid x_i,y_{i,<t})
$$

这里的 $T_i$ 是该样本实际参与监督的 Token 位置，`-100` 标签会被忽略。

实际执行过程是：

![Pasted image 20261101100543](/img/blogs/dataflex-reweighting/pasted-image-20261101100543-0fd49025.png)

## Loss Reweighting

Loss Reweighting 不是直接把 Loss 当权重。

### 第一步：归一化当前全局 batch 的 Loss

因为 Loss 的绝对大小会随训练状态、模型和任务变化。归一化后，后面的策略函数就可以在一个统一范围内工作。

$$
x_i=2\delta\frac{\ell_i-\ell_{\min}}
{\ell_{\max}-\ell_{\min}}-\delta
$$

$\delta$ 为归一化范围参数，$x_i$ 为每个样本归一化的分数

### 第二步：用策略函数 $f(x)$ 改变分数

获得归一化的分数后，就可以通过策略函数来控制低、中、高 Loss 获得的权重，这一步决定偏好高 Loss、低 Loss、中等 Loss，还是两端的 Loss。

Loss Reweighting 有 4 种策略：

| 策略        | 变换函数                | 主要偏好                        |
| ----------- | ----------------------- | ------------------------------- |
| `linupper`  | $\min(x+\delta,\delta)$ | 抑制低 Loss，中高 Loss 权重封顶 |
| `uniform`   | $x$                     | 越高 Loss，权重越大             |
| `quadratic` | $1-x^2/\delta^2$        | 中等 Loss                       |
| `extremes`  | $\|x\|$                 | 低 Loss 和高 Loss 两端          |

其中论文特别关注 `linupper`：

因为能减少已经容易预测的数据的影响，同时避免让极端高 Loss 数据无限占据训练权重。这有一定直觉基础：低 Loss 样本可能包含重复信息，而非常高的 Loss 可能来自异常或噪声。

### 第三步：把分数变成真正的训练权重

现在得到策略函数的结果，就可以分配权重，用 Softmax：

$$
w_i=\frac{\exp(f(x_i)/r)}{\sum_j\exp(f(x_j)/r)}
$$

$r$ 是 Softmax 的温度参数：

- $r$ 越小，越偏向高分样本。
- $r$ 越大，权重越接近均匀

### 局限

权重相对当前 batch 决定。同一条样本如果放进不同 batch，其 Loss 相对最小值、最大值会发生变化，权重也可能不同。

## ADAPT：利用模型表征判断与目标任务的关系

Loss Reweighting 不要求目标数据，但 ADAPT 走的是另一个方向：与目标任务更相关的样本，是否应该获得更大的梯度权重？

于是 ADAPT 使用和 LESS 相似的验证集作为训练的参考，称为 Anchor Set。ADAPT 不直接比较它们的 Loss，而是比较当前模型内部表征与 Anchor 表征的相似性。

### ADAPT 怎样计算表征？

它不需要外部专门训练的 Embedding 模型，而是利用当前正在训练的 LLM。

具体而言：

**1. 对输入进行前向传播，提取最后一层 Hidden States。**

**2. 对各 Token 的隐藏状态进行位置加权池化。**

池化是为了把多个 Token 的向量合并成一个样本向量。

$$
\phi(x)=\sum_{t=1}^{T}
\frac{t}{\sum_{j=1}^{T}j}h_t
$$

这表示后面的 Token 具有更大的聚合权重。作者这样设计，是为了缓解自回归模型因因果注意力使得后面的 Token 隐藏状态通常能够包含更完整的前文上下文信息，于是 ADAPT 通过提高后面 Token 的权重，希望得到更能代表整条序列的表征。

**3. 对得到的样本向量做 L2 归一化。**

保持向量方向不变，把它的欧几里得长度缩放为 1。

$$
z=\frac{\phi(x)}{\|\phi(x)\|_2}
$$

**4. 与 Anchor 集的样本向量计算平均余弦相似度。**

$$
s_i=\frac{1}{|V|}
\sum_{v\in V}
\cos\bigl(\phi(x_i),\phi(v)\bigr)
$$

### 相似度如何变成权重？

为了不像 Loss Reweighting，减轻 batch 组成变化对样本权重的干扰，ADAPT 则直接将每个样本自己的相似度转换为绝对权重，于是使用 Sigmoid 将相似度转换为权重：

$$
w_i=\operatorname{sigmoid}\left(\frac{s_i}{\tau}\right)
$$

其中 $\tau$ 是温度。

### ADAPT 为什么是动态的？

随着训练进行，模型表征发生变化，训练集的数据和 Anchor 的相似度也会发生变化，那么相应权重也会发生变化，DataFlex 实现中默认每 50 个优化步刷新一次相似度。

## Joint-Update-Aware：为什么不能只考虑每条样本自身？

如果两个样本高度相似，给它们都分配很高权重，可能会让 batch 内的信息过于重复。

假设当前 batch 包含：

| 样本 | 内容         | 与目标任务的相关性 |
| ---- | ------------ | ------------------ |
| A    | 二次方程题 1 | 高                 |
| B    | 二次方程题 2 | 高                 |
| C    | 几何证明题   | 较高               |

A 和 B 都与数学目标高度相关，但它们的内容也很相似。

如果采用 ADAPT，A 和 B 可能同时获得高权重，因为它们各自都与 Anchor 相似。

但 Joint-Update-Aware 认为，评价 A 的权重时，还应该考虑 B 已经提供了多少相似信息。

所以它同时考虑两种关系：

1. 样本与目标任务之间的关系。
2. 当前 batch 内样本之间的关系。

### 计算过程

**1. 假设每条样本都被转换成归一化的 Embedding 向量 $z_i$，目标 Anchor 被聚合成向量 $u$。**

**2. 计算目标对齐分数。**

$$
s_i=\langle z_i,u\rangle
$$

如果 A 和数学目标非常接近，那么 $s_A$ 较大。

**3. 计算样本间相似性矩阵。**

$$
S_{ij}=\langle z_i,z_j\rangle
$$

例如对于三条样本 ABC，可能得到这样的矩阵：

$$
S=
\begin{bmatrix}
1 & 0.98 & 0.40\\
0.98 & 1 & 0.38\\
0.40 & 0.38 & 1
\end{bmatrix}
$$

其中 A 与 B 的相似度为 0.98，说明两者在当前表征空间中非常接近；C 与它们则明显不同。

**4. 优化目标**

Joint-Update-Aware 希望尽量把训练权重分给与目标任务相关的数据，但又不希望这些权重全部集中在高度相似的样本上。

可以分为三个部分：

- **目标对齐奖励** $s^\top w$：让更符合目标任务的样本获得更多权重。
- **冗余惩罚（负项）** $-\frac{\beta}{2}w^\top Sw$：避免给高度相似的样本同时分配过多权重。
- **熵奖励** $\tau H(w)$：避免权重过度集中。

变成最大化问题：

$$
\max_{w\in\Delta_B} \left[ s^\top w -\frac{\beta}{2}w^\top Sw +\tau H(w) \right]
$$

| 符号        | 含义                           |
| ----------- | ------------------------------ |
| $w$         | 当前 batch 的样本权重向量      |
| $\Delta_B$  | 所有权重非负，且总和为 1       |
| $s^\top w$  | 奖励与目标任务更对齐的样本     |
| $w^\top Sw$ | 惩罚权重集中在高度相似的样本上 |
| $\beta$     | 控制冗余惩罚的强度             |
| $H(w)$      | 权重分布的熵                   |
| $\tau$      | 控制权重分布的分散程度         |

**① 目标对齐奖励** $s^\top w$：

如果只考虑最大化这个值，那显然将权重更多地分配到目标对齐分数高的样本，但是这会忽略 A、B 可能高度重复的问题。

**② 冗余惩罚（负项）** $-\frac{\beta}{2}w^\top Sw$：

为了方便计算，假设：

$$
S= \begin{bmatrix}
1 & 1 & 0\\
1 & 1 & 0\\
0 & 0 & 1
\end{bmatrix}
$$

含义是：

- A 与 B 完全相似，相似度为 1。
- A、B 与 C 正交，相似度为 0。
- 每条样本与自己相似度为 1。

不妨令 $\beta = 2$ 展开：

$$
w^\top Sw=\sum_i\sum_jw_iS_{ij}w_j
$$

对于当前矩阵：

$$
\boxed{
w^\top Sw=w_A^2+w_B^2+2w_Aw_B+w_C^2
}
$$

注意中间的 $2w_Aw_B$，这项就是 A、B 之间的交互影响。如果 A 和 B 都获得高权重，这个交叉项就比较大。所以需要把部分权重转移给不相似的 C，减小冗余惩罚。

**③ 熵奖励** $\tau H(w)$：

熵的定义为：

$$
H(w)=-\sum_iw_i\log w_i
$$

权重分布越分散，值越大，所以，最大化 $+\tau H(w)$ 就是在鼓励权重分散，避免只选择某一条样本。

### 四种 Objective Mode

| 模式           | 使用的项         | 含义                    |
| -------------- | ---------------- | ----------------------- |
| `full`         | 对齐 + 冗余 + 熵 | 完整方法                |
| `align_only`   | 对齐 + 熵        | 只考虑目标相关性        |
| `diverse_only` | 冗余 + 熵        | 只考虑 batch 表征多样性 |
| `uniform`      | 等权             | 不使用目标与冗余信号    |

这与 Loss Weighter 的 `strategy=uniform` 不同。Joint-Update-Aware 的 `objective_mode=uniform` 才是真正生成均匀权重向量的模式。

![Pasted image 20261101112207](/img/blogs/dataflex-reweighting/pasted-image-20261101112207-22db36a3.png)

### 局限

它把 batch 内样本的 Embedding 相似性作为联合更新冗余的代理，但没有直接计算真实的样本梯度交互。

因为两个样本的表征相似，不代表它们一定产生相同方向的梯度；反过来，表征不相似的样本，也可能产生相似的更新方向。

此外，计算全局 batch 的相似矩阵需要 $O(B^2)$ 的矩阵存储量，其中 $B$ 是全局 batch 大小。

## 三个多模态 Weighter

分为：

- **Multimodal Loss**：依据图文条件下的 Loss 加权。
- **Multimodal DeltaLoss**：图像到底有没有提供帮助？
- **Multimodal ADAPT**：将目标相似性扩展到图文表征。

暂时不展开。

## DataFlex Reweighting：7 种 Weighter 对比

| 算法                 | 评价信号                        | 权重计算与更新机制                                                    | 额外计算成本                                           |
| -------------------- | ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| Loss Reweighting     | 当前逐样本 Loss                 | 四种 Loss 变换 + Softmax；每个 micro-batch 更新                       | 低：逐样本 CE、跨卡 Loss 收集                          |
| ADAPT                | 当前模型表征与 Anchor 的相似度  | 独立 Sigmoid；当前 batch 重新提取表征，Anchor 定期刷新                | 中：额外表征前向、定期 Anchor 前向                     |
| Joint-Update-Aware   | 目标对齐 + Batch 内表征相似矩阵 | 熵正则优化、定点迭代；每个 micro-batch 更新，目标向量定期刷新         | 中～高：表征前向、跨卡收集、$B\times B$ 相似矩阵与迭代 |
| Multimodal Loss      | 有图条件下的回答 Loss           | LinUpper + 全池权重均值归一化；默认每 244 个优化步全池刷新            | 刷新时高：周期性全池前向评分                           |
| Multimodal DeltaLoss | 无图 Loss − 有图 Loss           | LinUpper + 全池权重均值归一化；默认每 244 个优化步全池刷新            | 刷新时很高：全池有图、无图两次前向                     |
| Multimodal ADAPT     | 多模态表征与 Anchor 的相似度    | Sigmoid，可选跨卡均值归一化；当前 batch 重新提取表征，Anchor 定期刷新 | 中～高：多模态表征前向、定期 Anchor 前向               |
| Custom               | 自定义                          | 默认等权；更新方式由实现决定                                          | 不确定：取决于自定义算法                               |

补充说明：

- $B$：全局 Batch Size，Joint-Update-Aware 的相似矩阵存储开销为 $O(B^2)$。
- Batch 级更新：Loss Reweighting、ADAPT、Joint-Update-Aware、Multimodal ADAPT。
- 全池周期更新：Multimodal Loss、Multimodal DeltaLoss。

## DataFlex 训练中的重要问题

### 1. 权重归一化与 Loss 尺度

核心问题：相同的样本权重比例，不代表相同的 Loss 尺度和梯度更新。

加权 Loss：

$$
L_w=\sum_iw_i\ell_i
$$

假设两条样本的 Loss 分别为 1、3：

| 权重        | 权重比例 | 加权 Loss |
| ----------- | -------- | --------- |
| $[0.2,0.8]$ | 1:4      | 2.6       |
| $[0.1,0.4]$ | 1:4      | 1.3       |

两组权重的相对偏好相同，但 Loss 相差 2 倍。

当权重不参与反向传播时：

$$
\nabla_\theta L_w=\sum_iw_i\nabla_\theta\ell_i
$$

- 权重整体缩放会同比缩放梯度。
- 对 SGD，通常会影响参数更新幅度。
- 对 AdamW，梯度缩放不一定同比改变参数更新。

### 2. 样本平均 vs Token 平均

假设 A 有 10 个有效 Token，平均 Loss 为 1；B 有 100 个有效 Token，平均 Loss 为 3。

| 归约方式   | 公式                               | 结果  | 特点                   |
| ---------- | ---------------------------------- | ----- | ---------------------- |
| 样本平均   | $\frac{1+3}{2}$                    | 2.0   | 每条样本等权           |
| Token 平均 | $\frac{10\times1+100\times3}{110}$ | 2.818 | Token 多的样本影响更大 |

即使不使用 Reweighting，不同的 Loss 归约方式也会改变训练目标。

### 3. 常见权重处理方式

| 方式           | 约束                 | 特点                        |
| -------------- | -------------------- | --------------------------- |
| 权重总和归一化 | $\sum_iw_i=1$        | 常用于加权求和              |
| 权重均值归一化 | $\frac1B\sum_iw_i=1$ | 通常配合样本均值            |
| 绝对权重       | 不强制归一化         | Loss 尺度可能随权重总量变化 |

### 4. 实验注意事项

比较不同 Weighter 时，应统一：

- Loss 归约方式：样本平均还是 Token 平均。
- 权重尺度：归一化方式及最终聚合公式。
- 优化设置：梯度累积、学习率、优化器及梯度裁剪。

核心结论： Reweighting 同时涉及两个独立因素：

$$
\boxed{
\text{样本相对权重}+\text{Loss 归约与尺度}
}
$$

如果不控制后者，就可能把 Loss 尺度引起的训练差异误认为重加权算法本身的收益。

## 相关笔记

- [Selection：改变训练机会](/posts/dataflex-selection/)
- [Mixture：改变领域比例](/posts/dataflex-mixture/)
- [Lego：索引空间与损失空间](/posts/dataflex-lego/#1-Lego-%E7%9A%84%E6%95%B4%E4%BD%93%E6%9E%B6%E6%9E%84)
- [Softmax 与温度参数](/posts/optimization-algorithms/#Softmax)
- 表征
- 池化
- L2 归一化

