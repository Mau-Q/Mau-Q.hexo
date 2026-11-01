---
title: 优化算法与数学基础
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - 优化算法
  - 数学基础
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/优化算法.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

## 泰勒展开（Taylor Expansion）

假设我们有一个函数 $f(x)$，希望在 $x=a$ 附近找到一个多项式：

$$
P(x) = c_0 + c_1(x-a) + c_2(x-a)^2 + \cdots
$$

我们希望这个多项式不仅与原函数在 $a$ 点的函数值相等，还具有相同的一阶导数、二阶导数……

这样，它们在 $a$ 附近的形状就会越来越接近。

按照导数相同的方法继续推导，就得到：

$$
\boxed{
f(x) = \sum_{k=0}^{n} \frac{f^{(k)}(a)}{k!}(x-a)^k + R_n(x)
}
$$

其中，$R_n(x)$ 是余项，即近似误差。

### 麦克劳林展开（Maclaurin Expansion）

在 $x=0$ 处展开，即麦克劳林展开：

$$
f(x) = f(0) + f'(0)x + \frac{f''(0)}{2!}x^2 + \cdots
$$

### 常见展开式

$$
\begin{aligned}
e^x & = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \cdots \\[6pt]
\sin x & = x - \frac{x^3}{3!} + \frac{x^5}{5!} - \cdots \\[6pt]
\cos x & = 1 - \frac{x^2}{2!} + \frac{x^4}{4!} - \cdots \\[6pt]
\ln(1+x) & = x - \frac{x^2}{2} + \frac{x^3}{3} - \cdots
\end{aligned}
$$

这些无穷级数需要在各自的收敛范围内使用。

## 泰勒展开在机器学习中的应用

在机器学习中，我们稍微改变模型参数时，泰勒展开可以帮助我们估计 Loss 会发生多大的变化。

### 单参数的一阶与二阶近似

例如要估计 $L(\theta + \Delta\theta)$，在 $\theta$ 处进行一阶泰勒展开：

$$
\begin{aligned}
L(\theta + \Delta\theta)
 & \approx L(\theta) + L'(\theta)(\theta + \Delta\theta - \theta) \\
 & = L(\theta) + L'(\theta)\Delta\theta
\end{aligned}
$$

但是如果改变的参数稍微大一点点，一阶泰勒展开的精度就不佳了，因为一阶泰勒展开只考虑了当前位置的斜率，没有考虑函数的弯曲程度，于是用二阶泰勒展开来进一步估计：

$$
L(\theta + \Delta\theta)
\approx L(\theta) + L'(\theta)\Delta\theta
+ \frac{1}{2}L''(\theta)(\Delta\theta)^2
$$

相比一阶，多了：

$$
\frac{1}{2}L''(\theta)(\Delta\theta)^2
$$

这一项描述函数的局部弯曲程度。

### 多参数：从导数到梯度

在神经网络中，有非常多的参数：

$$
\boldsymbol{\theta} =
\begin{bmatrix}
\theta_1 \\
\theta_2 \\
\vdots \\
\theta_n
\end{bmatrix}
$$

此时，普通导数变成了梯度向量：

$$
\nabla L(\boldsymbol{\theta}) =
\begin{bmatrix}
\dfrac{\partial L}{\partial\theta_1} \\[6pt]
\dfrac{\partial L}{\partial\theta_2} \\[6pt]
\vdots \\[6pt]
\dfrac{\partial L}{\partial\theta_n}
\end{bmatrix}
$$

于是一阶泰勒展开变为：

$$
L(\boldsymbol{\theta} + \Delta\boldsymbol{\theta})
\approx L(\boldsymbol{\theta})
+ \nabla L(\boldsymbol{\theta})^T\Delta\boldsymbol{\theta}
$$

### Hessian 矩阵：二阶偏导与参数交互

对于二阶泰勒展开，先计算梯度向量的导数，以两个参数为例：

$$
L(\theta_1, \theta_2) = \theta_1^2 + \theta_1\theta_2 + 2\theta_2^2
$$

先分别对两个参数求一阶偏导：

$$
\begin{aligned}
\frac{\partial L}{\partial\theta_1} & = 2\theta_1 + \theta_2 \\[6pt]
\frac{\partial L}{\partial\theta_2} & = \theta_1 + 4\theta_2
\end{aligned}
$$

组合起来，就是梯度：

$$
\nabla L =
\begin{bmatrix}
2\theta_1 + \theta_2 \\
\theta_1 + 4\theta_2
\end{bmatrix}
$$

我们现在有两个参数，因此可以求四种二阶偏导：

$$
\begin{aligned}
\frac{\partial^2 L}{\partial\theta_1^2} & = 2 \\[6pt]
\frac{\partial^2 L}{\partial\theta_1\partial\theta_2} & = 1 \\[6pt]
\frac{\partial^2 L}{\partial\theta_2\partial\theta_1} & = 1 \\[6pt]
\frac{\partial^2 L}{\partial\theta_2^2} & = 4
\end{aligned}
$$

把这些二阶偏导放进一个矩阵：

$$
\boxed{
H =
\begin{bmatrix}
2 & 1 \\
1 & 4
\end{bmatrix}
}
$$

这就是 Hessian 矩阵。其中，非对角线元素尤其值得理解：

$$
\frac{\partial^2 L}{\partial\theta_1\partial\theta_2} = 1
$$

它表示：一个参数的变化，会怎样影响 Loss 对另一个参数的梯度。

所以 Hessian 不只是记录每个参数自己的二阶变化，还包含不同参数之间的二阶交互关系。

对于二阶连续可微的 Loss，Hessian 是对称矩阵。

### 多参数的二阶泰勒展开

于是把 Hessian 矩阵代入二阶泰勒展开：

$$
\begin{aligned}
L(\boldsymbol{\theta} + \Delta\boldsymbol{\theta})
\approx {} & L(\boldsymbol{\theta})
+ \nabla L(\boldsymbol{\theta})^T\Delta\boldsymbol{\theta} \\
 & + \frac{1}{2}\Delta\boldsymbol{\theta}^T H\Delta\boldsymbol{\theta}
\end{aligned}
$$

就得到了机器学习中的二阶泰勒展开。

虽然 Hessian 可以帮助我们更准确地预测 Loss 变化，但是大语言模型训练通常使用基于一阶梯度的 AdamW，因为 Hessian 对于具有 $n$ 个参数的模型，是一个 $n\times n$ 的矩阵。它包含更多信息，但完整计算和存储的代价也极其高昂。

## 策略梯度（Policy Gradient）

### 期望奖励与求导

对于模型每一个生成的回答，我们给予一个奖励，最后求期望：

$$
J(\theta)=\sum_y p_\theta(y\mid x)R(y)
$$

我们希望通过调整参数 $\theta$，让这个期望奖励尽可能大。

于是对原式两边对 $\theta$ 求梯度：

$$
\nabla_\theta J(\theta)
=\nabla_\theta\left[\sum_y p_\theta(y\mid x)R(y)\right]
$$

利用求导的线性性质，把梯度放进求和符号。

$$
\nabla_\theta J(\theta)
= \sum_y\nabla_\theta\left[p_\theta(y\mid x)R(y)\right]
$$

因为这里假设奖励函数不直接依赖 $\theta$，只有概率 $p_\theta$ 受到模型参数的影响。所以可以把奖励 $R(y)$ 看成常数：

$$
\nabla_\theta J(\theta)
=\sum_y R(y)\nabla_\theta p_\theta(y\mid x)
\tag{1}
$$

但是这要求我们遍历所有的 $y$ 来计算，而对于 LLM，回答可能有无数种组合，我们不可能全部枚举。

### 对数导数技巧

于是使用一个经典的 Log-Derivative Trick（对数导数技巧），也是 REINFORCE 策略梯度方法的基础。关键是一个非常基础的求导公式：

$$
\frac{d}{dx}\ln x=\frac{1}{x}
$$

根据复合函数求导法则：

$$
\nabla_\theta\log p_\theta(y\mid x)
=
\frac{1}{p_\theta(y\mid x)}
\nabla_\theta p_\theta(y\mid x)
$$

两边同时乘以 $p_\theta(y\mid x)$：

$$
\boxed{
\nabla_\theta p_\theta(y\mid x)
=
p_\theta(y\mid x)
\nabla_\theta\log p_\theta(y\mid x)
}
$$

代入（1）式：

$$
\nabla_\theta J(\theta)
=\sum_y R(y)p_\theta(y\mid x)
\nabla_\theta\log p_\theta(y\mid x)
$$

而期望的定义就是：

$$
\mathbb E_{y\sim p_\theta}[f(y)]
=\sum_y p_\theta(y\mid x)f(y)
$$

因此：

$$
\boxed{
\nabla_\theta J(\theta)
=
\mathbb E_{y\sim p_\theta(\cdot\mid x)}
\left[
R(y)\nabla_\theta\log p_\theta(y\mid x)
\right]
}
$$

### Monte Carlo 梯度估计

转换成期望之后，还是需要遍历所有 $y$，于是使用 Monte Carlo（蒙特卡洛）采样：通过随机采样，用样本的平均值近似总体的期望值。将原始期望估计成：

$$
\boxed{
\mathbb E_{y\sim p_\theta}[R(y)]
\approx\frac{1}{N}\sum_{i=1}^{N}R(y_i)
}
$$

其中：

$$
y_i\sim p_\theta(\cdot\mid x)
$$

注意，右边没有显式的 $p_\theta(y_i\mid x)$，因为采样过程已经体现了概率。

这样变换之后我们就可以从模型中采样 $N$ 个回答，利用样本均值估计梯度：

$$
\boxed{
\nabla_\theta J(\theta)
\approx
\frac{1}{N}\sum_{i=1}^{N}
R(y_i)\nabla_\theta\log p_\theta(y_i\mid x)
}
$$

这样就不需要遍历所有回答，只需要对采样出的回答计算奖励和对数概率的梯度。这里的样本梯度估计在满足前面推导条件时是无偏的，但样本数量有限会产生方差。

## Softmax

### 核心特性

定义：将任意实数分数转换为非负、总和为 1 的权重分布。

$$
\boxed{
w_i=\frac{e^{z_i/\tau}}{\sum_j e^{z_j/\tau}}
}
$$

其中 $z_i$ 为输入分数，$\tau>0$ 为温度参数。

| 特性             | 数学表达                                       | 核心理解                               |
| ---------------- | ---------------------------------------------- | -------------------------------------- |
| 归一化           | $\sum_i w_i=1,\ w_i>0$                         | 所有样本共享总权重 1                   |
| 平移不变性       | $\mathrm{Softmax}(z+c)=\mathrm{Softmax}(z)$    | 所有分数加减相同常数，权重不变         |
| 指数放大         | $\frac{w_i}{w_j}=e^{(z_i-z_j)/\tau}$           | 分数差异通过指数转化为权重比例         |
| 单调性           | $z_i>z_j\Rightarrow w_i>w_j$                   | 分数越高，权重越大                     |
| 竞争性（耦合性） | $w_i=\frac{e^{z_i/\tau}}{\sum_j e^{z_j/\tau}}$ | 一个样本分数变化，会影响其他样本的权重 |
| 温度控制         | $\mathrm{Softmax}(z/\tau)$                     | 低温更集中，高温更均匀                 |

### 温度参数

- $\tau\to0^+$：趋向将权重分配给最大分数的样本（并列最大则均分）。
- $\tau\to+\infty$：趋向均匀分布 $w_i=1/n$。
- 缩放输入分数会改变权重分布，等价于反向调整温度。

## 多臂老虎机（Multi-Armed Bandit, MAB）

### 基本概念

多臂老虎机（MAB）是一种经典的在线序贯决策问题：在不知道各选项真实收益的情况下，通过不断尝试与反馈，最大化累计收益。

核心矛盾：探索与利用（Exploration–Exploitation Tradeoff）

- 探索（Exploration）：尝试收益不确定的选项，收集信息。
- 利用（Exploitation）：选择当前估计收益最高的选项，获取回报。
- 权衡：探索过多会浪费预算，利用过早可能错过更优选项。

### 数学建模

假设有 $K$ 个臂（Arm），每个臂对应一个未知的奖励分布。

第 $t$ 轮执行：

1. 选择臂 $a_t$。
2. 获得随机奖励 $r_t$。
3. 更新对各臂收益的估计。
4. 根据当前策略选择下一轮的臂。

优化目标：最大化累计期望奖励

$$
\boxed{
\max_\pi\mathbb E_\pi\left[\sum_{t=1}^{T}r_t\right]
}
$$

其中：

- $K$：臂的数量。
- $T$：总决策轮数。
- $a_t$：第 $t$ 轮选择的臂。
- $r_t$：第 $t$ 轮获得的奖励。
- $\pi$：决策策略。

### 常见算法

| 算法                          | 核心机制                                                                 | 特点                           |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| ε-Greedy                      | 以 $1-\varepsilon$ 的概率选择当前最优臂，以 $\varepsilon$ 的概率随机探索 | 简单，但探索通常不考虑不确定性 |
| UCB（Upper Confidence Bound） | 结合收益估计与置信上界选择臂                                             | 鼓励探索尝试次数较少的臂       |
| Thompson Sampling             | 根据奖励分布的后验采样，选择采样收益最高的臂                             | 基于贝叶斯方法平衡探索与利用   |

#### UCB 公式

例如 UCB 的一种常见形式：

$$
\boxed{
\operatorname{UCB}_i= \bar r_i+c\sqrt{\frac{\ln t}{n_i}}
}
$$

其中：

- $\bar r_i$：第 $i$ 个臂的平均历史奖励。
- $n_i$：该臂已经被选择的次数。
- $t$：当前总决策轮数。
- $c$：探索强度参数。

可以拆成：

$$
\underbrace{\bar r_i}_{\text{当前收益估计}} + \quad\underbrace{c\sqrt{\frac{\ln t}{n_i}}}_{\text{探索奖励}}
$$

