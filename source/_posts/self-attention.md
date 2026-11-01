---
title: Self-attention：从 Q、K、V 到上下文表示
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - 深度学习
  - Attention
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/Self-attention.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

## 为什么需要 Self-attention

在处理“向量序列”时，一个位置的表示往往需要结合其他位置的信息，比如：

> I saw a saw

第二个 saw 的含义需要结合上下文判断。把相邻几个向量拼接后输入 FC（Fully Connected Layer，全连接层），也能利用局部上下文，但固定窗口只能直接看到窗口内的位置，难以覆盖任意距离的依赖。

RNN、Self-Attention 等方法则能让序列中的信息跨位置传递。

## 序列任务的输入与输出

本节关注“每个输入位置都得到一个上下文化表示”的情况：Self-Attention Layer 接受一组向量 $a^1,\dots,a^L$，输出一组向量 $b^1,\dots,b^L$。

文字、语音和图像都可以表示成向量序列；这一层让不同位置的信息发生交互，从而更新每个位置的表示。

完整模型也可以只输出一个结果，或根据输入序列生成另一个序列（sequence to sequence，seq2seq）；这些是不同的任务形式，下面只讨论每个位置对应一个输出向量的情况。

## Self-attention 原理

总体图如下：

![self-attention-context-dark](/img/blogs/self-attention/self-attention-context-dark-59d8ae69.svg)

### 单个位置的计算

Self-Attention Layer 可以接收最初的输入向量，也可以接收前一层的输出。这里以四个输入向量 $a^1,a^2,a^3,a^4$ 为例。

“考虑上下文”具体怎么实现？对于当前要更新的位置 $i$，先计算它从位置 $j$ 取信息时的匹配分数 $\alpha_{i,j}$。将 $a^i$ 乘以 $W^q$，得到查询向量 $q^i$（query）；将 $a^j$ 乘以 $W^k$，得到键向量 $k^j$（key）。两者做点积，就得到这个分数。

由于两个位置分别使用 query 和 key，$\alpha_{i,j}$ 与 $\alpha_{j,i}$ 一般不相等。计算分数还有加性注意力（Additive Attention）等方法，这里只讨论点积。

$$
\begin{aligned}
q^i &= W^q a^i,\\
k^j &= W^k a^j,\\
\alpha_{i,j} &= (q^i)^\top k^j.
\end{aligned}
$$

![01-dot-product](/img/blogs/self-attention/01-dot-product-993cad5e.svg)

位置 $i$ 通常也会把自己纳入计算。得到 $\alpha_{i,1},\dots,\alpha_{i,4}$ 后，对这四个分数做 softmax，得到总和为 $1$ 的权重 $\alpha'_{i,1},\dots,\alpha'_{i,4}$。

$$
\alpha'_{i,j}=\frac{e^{\alpha_{i,j}}}{\sum_{t=1}^{L}e^{\alpha_{i,t}}}
$$

分数决定从各位置取信息的比例；实际被汇总的信息由值向量 $v^j$（value）提供。将每个 $v^j$ 按对应权重加权求和，就得到位置 $i$ 的输出：

$$
v^j=W^va^j,\qquad b^i=\sum_{j=1}^{L}\alpha'_{i,j}v^j.
$$

> Q/K 共同决定“我要关注谁”，V 决定“我要从那里取什么信息”。

因此，$b^i$ 是 **Self-Attention Layer 对位置 $i$ 产生的上下文化表示**。

![02-query-weighted-sum](/img/blogs/self-attention/02-query-weighted-sum-45900931.svg)

### 矩阵计算

把 $a^1,\dots,a^4$ 作为列排成矩阵 $I=[a^1\ \cdots\ a^4]$，就能一次计算所有位置：$Q=W^qI$、$K=W^kI$、$V=W^vI$。

因此，$Q$、$K$、$V$ 的第 $i$ 列分别是 $q^i$、$k^i$、$v^i$。

![03-qkv-projections](/img/blogs/self-attention/03-qkv-projections-d5b63dac.svg)

接着计算 $A=K^\top Q$。在这套“每列一个位置”的记法中，$A$ 的第 $j$ 行、第 $i$ 列是 $\alpha_{i,j}$：列 $i$ 对应 query，行 $j$ 对应 key。

**每列分别沿行方向做 softmax**，得到权重矩阵 $A'$，其第 $j$ 行、第 $i$ 列是 $\alpha'_{i,j}$。

![04-attention-scores-softmax](/img/blogs/self-attention/04-attention-scores-softmax-0f2055a2.svg)

最后计算 $O=VA'$。$O$ 的第 $i$ 列就是 $b^i=\sum_j\alpha'_{i,j}v^j$，与前面的单个位置计算相对应。

![05-attention-value-aggregation](/img/blogs/self-attention/05-attention-value-aggregation-aad28fd7.svg)

除去细节，Self-Attention 层的计算可以概括为下图。$W^q$、$W^k$、$W^v$ 是要学习的参数。

![06-attention-overview](/img/blogs/self-attention/06-attention-overview-965fcbe8.svg)

### 多头与位置信息

而在 transformer 中不会这么简单。比如应用 Multi-head Self-attention，让不同 head 拥有不同的投影参数，因此可以在不同表示子空间中学习不同类型的相关性。

所谓 Multi-head 就是 $W^q$、$W^k$、$W^v$ 矩阵不止一个，最简单的就是分别有 2 个，相应的每个输入的 $q$、$k$、$v$、$b$ 都有 2 个。每个 head 都会产生一个独立的输出 $b^{i,h}$。最后将各个 head 的输出拼接（concatenate），再经过可学习的线性变换 $W^O$，得到最终的 $b^i$。

![07-multihead-output-projection](/img/blogs/self-attention/07-multihead-output-projection-e01ff5f8.svg)

除了 Multi-head Self-attention，还有 Positional Encoding。纯 Self-Attention 的相关性计算本身没有序列位置信息，于是 Positional Encoding 对于每一个输入 $a^i$ 用不同的 $e^i$ 相加，使模型能够区分不同位置和顺序。$e^i$ 可以人为设定，也可以作为参数学习。

### 两个位置的完整计算

下面用两位置的数值例子，按本节的未缩放点积计算一次单头 Self-Attention。取两个输入向量及三组投影参数为：

$$
a^1=\begin{bmatrix}1\\0\end{bmatrix},\quad
a^2=\begin{bmatrix}0\\1\end{bmatrix},\quad
I=\begin{bmatrix}1&0\\0&1\end{bmatrix}.
$$

$$
W^q=\begin{bmatrix}1&0\end{bmatrix},\quad
W^k=\begin{bmatrix}0&1\end{bmatrix},\quad
W^v=\begin{bmatrix}1&0\\0&2\end{bmatrix}.
$$

先算出每个位置的 query、key 和 value；这里 $Q$、$K$ 的每一列是一个标量，$V$ 的每一列是一个二维向量：

$$
Q=W^qI=\begin{bmatrix}1&0\end{bmatrix},\quad
K=W^kI=\begin{bmatrix}0&1\end{bmatrix},\quad
V=W^vI=\begin{bmatrix}1&0\\0&2\end{bmatrix}.
$$

再计算分数矩阵。第 $i$ 列表示位置 $i$ 查询各位置时得到的分数：

$$
\begin{aligned}
A=K^\top Q
&=\begin{bmatrix}0\\1\end{bmatrix}\begin{bmatrix}1&0\end{bmatrix}\\
&=\begin{bmatrix}0&0\\1&0\end{bmatrix}.
\end{aligned}
$$

此时 $\alpha_{1,2}=1$，而 $\alpha_{2,1}=0$。分别对两列做 softmax。记 $p=e/(e+1)\approx0.731$，则第一列的权重是 $1-p,p$，第二列两个分数都是 $0$，权重各为 $1/2$：

$$
A'=\begin{bmatrix}
\dfrac{1}{e+1}&\dfrac12\\[4pt]
\dfrac{e}{e+1}&\dfrac12
\end{bmatrix}
=\begin{bmatrix}1-p&1/2\\p&1/2\end{bmatrix}.
$$

最后由 $V$ 对各列权重加权求和，得到两个输出向量：

$$
\begin{aligned}
O=VA'
&=\begin{bmatrix}1&0\\0&2\end{bmatrix}
\begin{bmatrix}1-p&1/2\\p&1/2\end{bmatrix}\\
&=\begin{bmatrix}1-p&1/2\\2p&1\end{bmatrix}\\
&\approx\begin{bmatrix}0.269&0.500\\1.462&1.000\end{bmatrix}.
\end{aligned}
$$

例如，$O$ 的第一列就是 $b^1=(1-p)v^1+pv^2=(1-p,\,2p)^\top$；它与前面单个位置的加权求和公式一致。

## Self-attention 的应用

Self-Attention 是 Transformer 和 BERT 中的重要组件。在语音识别中，可以用约 25 ms 的窗口形成一个 frame，并每隔约 10 ms 移动一次，因此 1 秒语音大约形成 100 个向量。

较长的语音会形成很长的序列；全局 Self-Attention 需要计算位置两两之间的分数，计算和存储注意力矩阵的开销会随序列长度平方增长。一种控制开销的办法是局部注意力：让每个位置只关注附近的位置。

图像也可以转成向量序列后做 attention 计算，例如把图像划分成 patch，再将每个 patch 映射成向量。与通常在局部感受野内提取特征的 [CNN](/posts/cnn/) 相比，全局 Self-Attention 可以直接在相距较远的位置之间建立联系；每个位置对其他位置的注意力权重由当前输入计算得到。

与 RNN 相比，RNN 的信息需要沿时间步逐步传递，远距离位置之间的路径较长；全局 Self-Attention 在一层内就能让两个位置直接交互。

RNN 沿时间步的计算有顺序依赖，而 Self-Attention 对不同位置的计算更容易并行。

