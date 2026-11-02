---
title: NumPy：深度学习中的数组与计算
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - 深度学习
  - NumPy
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/NumPy：深度学习中的数组与计算.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。


神经网络的输入、权重、中间结果和梯度，都可以表示成多维数组。学习 NumPy，主要是为了看懂这些数组怎样参与计算，以及每一步为什么得到这个形状。

这篇从 Python 列表和基础运算出发，最后写出一个线性模型的前向计算、损失和参数更新。需要会 Python 的变量、列表、函数和循环；梯度部分可以结合 [深度学习基础：模型是怎么训练的](/posts/deep-learning-basics/) 阅读。

NumPy 适合数据预处理、检查计算和手写小模型。常规 NumPy 数组在 CPU 上计算，不提供神经网络训练所需的自动求导；实际训练通常交给 PyTorch 等框架。这里学到的形状、轴、广播和矩阵乘法，会继续用到。

## 1. 用数组表示一批样本

### 从列表到 ndarray

Python 的 `[1, 2, 3] * 2` 会重复列表；NumPy 数组乘以 2，会对每个元素做乘法。这种把一组数据写成一次数组运算的方式，称为向量化。

```python
import numpy as np

a = np.array([1, 2, 3], dtype=np.float32)
print(a * 2)       # [2. 4. 6.]
print(a + 1)       # [2. 3. 4.]
print(a ** 2)      # [1. 4. 9.]
```

`np` 是导入 NumPy 时的惯用别名；`np.array` 创建的对象叫 `ndarray`，即 N 维数组。普通数值数组中的元素使用统一的数据类型。

本文沿用一组小数据：2 条样本，每条样本有 3 个特征。

```python
X = np.array([
    [1, 2, 3],
    [4, 5, 6],
], dtype=np.float32)

print(X.shape)    # (2, 3)：每个轴的长度
print(X.ndim)     # 2：轴的数量
print(X.size)     # 6：元素总数
print(X.dtype)    # float32：元素类型
```

一次放在一起计算的样本称为一批（batch）。用 $B$ 表示批大小，$D$ 表示每条样本的特征数，此时 `X.shape == (B, D)`。

### shape 也在表达数据的含义

深度学习中常把多维数值数组称为张量（tensor）。读形状时，既要看轴的长度，也要知道每个轴代表什么。

| 数据 | 示例形状 | 各轴的含义 |
| --- | --- | --- |
| 标量 | `()` | 一个数，没有轴 |
| 单个特征向量 | `(3,)` | 3 个特征 |
| 一批特征向量 | `(2, 3)` | 样本、特征 |
| 一批序列表示 | `(2, 5, 8)` | 样本、序列位置、每个位置的特征 |
| 一批彩色图片 | `(2, 3, 32, 32)` | 样本、通道、高、宽 |

图片也可能采用 `(B, H, W, C)` 排列。字母分别表示批大小、高、宽和通道数；NumPy 不会知道哪一轴是通道，需要代码约定。

> [!warning] 一维数组没有行列方向
> `(3,)`、`(1, 3)`、`(3, 1)` 是三种形状。一维数组的 `.T` 仍然是 `(3,)`；要表示列向量，应显式变成 `(3, 1)`。

### 类型和初始化

输入特征与权重常用浮点数。入门时可以显式使用 `float32`，避免 NumPy 中常见的默认 `float64` 与后续模型类型不一致。类别编号则通常用整数。

```python
zeros = np.zeros((2, 3), dtype=np.float32)
ones = np.ones((2, 3), dtype=np.float32)
indices = np.arange(6)                # [0, 1, 2, 3, 4, 5]
labels = np.array([0, 2], dtype=np.int64)

rng = np.random.default_rng(42)
W_random = (rng.standard_normal((3, 2)) * 0.01).astype(np.float32)
```

`default_rng(42)` 创建带固定种子的随机数生成器，便于在相同环境中复现例子。它的状态会随调用推进，所以连续调用两次不会产生同一组数。这里乘以 `0.01` 只是示例尺度；实际网络的权重初始化还要考虑层的结构与激活函数。

## 2. 索引和形状变换：保留哪一轴

以下代码接着使用上面的 `X`。切片遵循左闭右开：包含起点，不包含终点。

```python
print(X[0])          # [1. 2. 3.]，形状 (3,)
print(X[0:1])        # [[1. 2. 3.]]，形状 (1, 3)
print(X[:, 0])       # [1. 4.]，形状 (2,)
print(X[:, 0:1])     # [[1.], [4.]]，形状 (2, 1)
print(X[1, 2])       # 6.0
```

整数索引通常移除对应的轴，切片保留轴。模型接收 `(B, D)` 时，即使只预测一条样本，也常需要保留批轴：用 `X[0:1]`，而不是 `X[0]`。

### reshape 改形状，transpose 换轴

```python
v = np.arange(6)
matrix = v.reshape(2, 3)
column = v.reshape(-1, 1)             # (6, 1)
single_batch = v[None, :]            # (1, 6)

images = np.arange(2 * 4 * 5 * 3).reshape(2, 4, 5, 3)
channels_first = images.transpose(0, 3, 1, 2)  # (2, 3, 4, 5)
flat = channels_first.reshape(2, -1)          # (2, 60)
assert channels_first[0, 2, 1, 3] == images[0, 1, 3, 2]
```

`reshape` 要求元素总数不变；`-1` 让 NumPy 推算该轴长度，一次最多指定一个。`None`（也可写 `np.newaxis`）插入长度为 1 的轴。

`transpose(0, 3, 1, 2)` 表示新轴依次取原来的第 0、3、1、2 轴，所以能把通道轴移到前面。直接把 `(B, H, W, C)` 用 `reshape` 改成 `(B, C, H, W)`，通常会破坏像素与通道的对应关系。

二维矩阵可用 `.T` 交换行列；高维数组的 `.T` 会反转所有轴。若只交换最后两轴，用 `swapaxes(-1, -2)` 更明确。

### concatenate 接长旧轴，stack 增加新轴

```python
more_samples = np.concatenate([X, X], axis=0)  # (4, 3)
more_features = np.concatenate([X, X], axis=1) # (2, 6)
two_groups = np.stack([X, X], axis=0)          # (2, 2, 3)
```

拼接样本时用第一种。`concatenate` 要求除拼接轴以外的形状相同；`stack` 要求输入形状相同，它会新增一个轴来区分各组。

## 3. axis：沿哪个轴汇总

求和、平均值、最大值等会把一组元素汇成更少的值，这类操作称为归约。`axis` 指定被汇总的轴。

对于 `X.shape == (2, 3)`：

```python
print(X.mean(axis=0))                 # [2.5 3.5 4.5]，形状 (3,)
print(X.mean(axis=1))                 # [2. 5.]，形状 (2,)
print(X.mean(axis=1, keepdims=True))  # [[2.], [5.]]，形状 (2, 1)
print(X.mean())                       # 3.5，汇总所有元素
```

`axis=0` 汇总样本轴，所以得到每个特征的平均值；`axis=1` 汇总特征轴，所以得到每条样本的平均值。`keepdims=True` 将被归约的轴保留为长度 1，方便后续广播。

不要把 `axis=0` 永久记成“每列”。在三维序列 `(B, T, D)` 中，`axis=1` 汇总的是序列位置；`axis=-1` 总是指最后一轴。

```python
sequence = np.ones((2, 5, 8), dtype=np.float32)
pooled = sequence.mean(axis=1)       # (2, 8)：每条序列的平均表示
feature_mean = sequence.mean(axis=-1, keepdims=True)  # (2, 5, 1)
```

这里假设 5 个位置都有效。若序列中有补齐长度的填充位置，简单平均会把填充值也算进去，需要另做有效位置筛选或加权。

`sum`、`max`、`min`、`std` 也支持按轴统计。`std` 衡量数据围绕均值的离散程度，NumPy 默认 `ddof=0`，方差分母为元素数量 $N$；`ddof=1` 时分母改为 $N-1$。

## 4. 广播：让不同形状参与逐元素运算

假设希望给每个样本的 3 个特征分别加上同一组偏置：

```python
offset = np.array([10, 20, 30], dtype=np.float32)
print(X + offset)
# [[11. 22. 33.]
#  [14. 25. 36.]]
```

`X` 是 `(2, 3)`，`offset` 是 `(3,)`。NumPy 从最右边比较形状：对应轴长度相同，或者其中一个为 1，就可以兼容；缺少的左侧轴按 1 看待。因此 `(3,)` 可以对每条样本重复使用。这个规则叫广播（broadcasting）。

```text
X：       (2, 3)
offset：  (1, 3)  ← 对齐时补出的轴
结果：    (2, 3)
```

广播不要求先把小数组复制成完整大数组，不过运算结果仍可能很大。规则见 [NumPy 广播说明](https://numpy.org/doc/stable/user/basics.broadcasting.html)。

### keepdims 为什么有用

给每条样本减去它自己的特征均值：

```python
row_mean = X.mean(axis=1, keepdims=True)  # (2, 1)
centered = X - row_mean                  # (2, 3)
print(centered)
# [[-1.  0.  1.]
#  [-1.  0.  1.]]
```

每行只有一个均值，沿特征轴广播。如果省略 `keepdims`，均值的形状变成 `(2,)`，最右轴的 2 和 3 不兼容。即使在方阵上偶然能运行，也可能沿错了方向。

> [!warning] 能广播不代表语义正确
> 预测值是 `(B, 1)`，标签却是 `(B,)` 时，相减会得到 `(B, B)`，变成每个预测与每个标签两两相减。计算逐样本误差前，应检查二者形状相同。

## 5. 矩阵乘法：从样本到线性层

`*` 是逐元素乘法，`@` 是矩阵乘法。对二维数组：

$$
X\in\mathbb{R}^{B\times D},\quad
W\in\mathbb{R}^{D\times K},\quad
XW\in\mathbb{R}^{B\times K}
$$

$K$ 是输出特征数。中间的 $D$ 必须一致，每个输出都是一条样本与一列权重的乘积之和。

```python
W = np.array([
    [1, 0],
    [0, 1],
    [1, 1],
], dtype=np.float32)
b = np.array([0.5, -0.5], dtype=np.float32)

Z = X @ W + b
print(Z)
# [[ 4.5  4.5]
#  [10.5 10.5]]
```

第一条样本的第一个输出是 $1\times1+2\times0+3\times1+0.5=4.5$。第二个输出是 $1\times0+2\times1+3\times1-0.5=4.5$。

`X @ W` 得到 `(B, K)`，`b` 的 `(K,)` 沿样本轴广播。代码 `Z = X @ W + b` 对应带偏置的线性层；严格说，它是仿射变换。

再接上逐元素激活函数 ReLU（Rectified Linear Unit，修正线性单元），把负数变成 0：

```python
H = np.maximum(Z, 0)
print(np.maximum(np.array([-2.0, 0.0, 3.0]), 0))  # [0. 0. 3.]
```

ReLU 不改变形状，但引入非线性。这个例子的 `Z` 都为正，因此 `H` 与 `Z` 相同。

### 高维的 @

对三维及更高维输入，`@` 在最后两个轴做矩阵乘法，前面的轴按广播规则匹配。例如：

```python
Q = np.ones((2, 4, 3), dtype=np.float32)
K = np.ones((2, 5, 3), dtype=np.float32)
scores = Q @ K.swapaxes(-1, -2)       # (2, 4, 5)
assert scores.shape == (2, 4, 5)
```

每批中，4 个长度为 3 的向量与 5 个长度为 3 的向量两两做内积。可与 [Self-attention](/posts/self-attention/) 中的相关性分数联系起来；这里只演示乘法形状。具体规则见 [`numpy.matmul`](https://numpy.org/doc/stable/reference/generated/numpy.matmul.html)。

## 6. 筛选、复制和小批次

### 布尔条件和类别索引

```python
mask = (X[:, 0] >= 1) & (X[:, 0] < 4)
selected = X[mask]                    # 只保留第一条样本，形状 (1, 3)
positive_only = np.where(X > 3, X, 0) # 保持 (2, 3)，其余位置填 0
```

`mask` 是布尔数组，`True` 表示保留。多个数组条件用 `&`（且）、`|`（或），每个条件加括号；`~` 表示取反。不能直接用 Python 的 `and` 连接这些数组条件。

筛选样本和筛选元素有区别：`X[mask]` 按行筛选，而 `X[X > 3]` 会收集符合条件的元素，得到一维数组。

### 切片可能改到原数组

视图（view）与原数组共享底层数据，副本（copy）有独立数据。

```python
source = np.array([[1.0, 2.0], [3.0, 4.0]])
view = source[:1]
view[0, 0] = 99
assert source[0, 0] == 99

independent = source[:1].copy()
independent[0, 0] = -1
assert source[0, 0] == 99
```

基础切片通常得到视图，整数数组索引和布尔索引读取结果得到副本；`reshape` 是否复制取决于内存布局。需要隔离后续修改时，显式调用 `.copy()`。见 [NumPy 视图与副本](https://numpy.org/doc/stable/user/basics.copies.html)。

### 输入和标签必须一起打乱

```python
rng = np.random.default_rng(42)
X_train = np.arange(15, dtype=np.float32).reshape(5, 3)
y_train = np.arange(5, dtype=np.int64)
order = rng.permutation(len(X_train))
batch_size = 2

for start in range(0, len(order), batch_size):
    idx = order[start:start + batch_size]
    X_batch = X_train[idx]
    y_batch = y_train[idx]
    assert np.array_equal(X_batch[:, 0] / 3, y_batch)
    print(X_batch.shape, y_batch.shape)
# (2, 3) (2,)
# (2, 3) (2,)
# (1, 3) (1,)
```

小批次（mini-batch）是一次训练使用的数据子集。用同一组 `idx` 取输入和标签，才能维持配对关系。这里保留不足一整批的最后一批，因此批大小不能总是假设为 2。

## 7. 预处理：有限值和训练集统计量

`np.nan` 可以表示缺失或无效数值，`np.inf` 表示无穷。`np.isnan` 判断 NaN；`np.isfinite` 同时排除 NaN 和正负无穷。

```python
values = np.array([1.0, np.nan, np.inf])
print(np.isnan(values))               # [False  True False]
print(np.isfinite(values))            # [ True False False]
```

`np.nanmean` 会忽略 NaN，但不会排除无穷，也不能解决整列都是 NaN 的问题。损失出现 NaN 时，需要检查输入、除零、指数溢出和更新幅度，不能只把 NaN 填成 0 后继续。

### 按特征标准化

对每个特征减去均值，再除以标准差，可以减少不同数值尺度对优化的影响。下面假设输入已经是有限数值，且各特征适合这样处理。

```python
train = np.array([[1, 10], [3, 10], [5, 10]], dtype=np.float32)
valid = np.array([[7, 10]], dtype=np.float32)
assert np.isfinite(train).all() and np.isfinite(valid).all()

mu = train.mean(axis=0, keepdims=True)       # (1, 2)
sigma = train.std(axis=0, keepdims=True)     # (1, 2)
scale = np.where(sigma > 0, sigma, 1.0)     # 常量列避免除零
train_scaled = (train - mu) / scale
valid_scaled = (valid - mu) / scale
assert np.allclose(train_scaled.mean(axis=0), 0, atol=1e-6)
```

先划分数据，再只从训练集计算 `mu` 和 `sigma`；验证集、测试集复用训练集统计量。均值填补缺失值也遵循这个边界，否则评估数据的信息会进入预处理过程，造成数据泄漏。常量列这里除以 1；近似常量列仍可能放大噪声，需要按数据尺度决定是否丢弃或设置阈值。

表格数据可以先用 Pandas 清洗，再用 `df[features].to_numpy(dtype=np.float32)` 转换。图片、音频、文本的数值表示有各自预处理方式，不必经过 Pandas，也不一定采用逐特征标准化。

## 8. 从类别分数到 Softmax 和交叉熵

分类模型可以给每条样本输出 $C$ 个未归一化的类别分数，通常称为 logits。Softmax 将这些分数转换为非负且和为 1 的概率：

$$
p_{i,c}=\frac{\exp(z_{i,c})}{\sum_{j=1}^{C}\exp(z_{i,j})}
$$

$i$ 表示样本，$c$ 表示类别。分母必须汇总同一条样本的所有类别，所以对 `(B, C)` 应沿最后一轴求和。

直接计算很大分数的指数可能溢出。先给每行减去该行最大值，分子、分母会同时乘上相同因子，概率不变，而指数输入最大为 0。

```python
logits = np.array([[1000, 1001, 1002], [2, 1, 0]], dtype=np.float64)
y_class = np.array([2, 0], dtype=np.int64)   # 类别编号从 0 开始

shifted = logits - logits.max(axis=-1, keepdims=True)
exp_shifted = np.exp(shifted)
normalizer = exp_shifted.sum(axis=-1, keepdims=True)
probs = exp_shifted / normalizer
assert np.allclose(probs.sum(axis=-1), 1)

predicted = probs.argmax(axis=-1)           # [2, 0]
accuracy = (predicted == y_class).mean()    # 1.0
```

`argmax` 返回最大值的位置，因此可得到类别编号。这里的准确率只是这两条手工数据上的结果。

对于每条样本恰好属于一个类别的分类任务，交叉熵取正确类别概率的负对数，再对样本平均：

$$
L=-\frac{1}{B}\sum_{i=1}^{B}\log p_{i,y_i}
$$

正确类别概率越接近 1，这一项越接近 0。为了避免先得到接近 0 的概率、再取对数造成数值问题，直接用平移后的分数计算对数概率：

```python
log_probs = shifted - np.log(normalizer)
correct_log_probs = log_probs[np.arange(len(y_class)), y_class]
cross_entropy = -correct_log_probs.mean()
assert np.isclose(cross_entropy, 0.4076059644443804)
```

`np.arange(B)` 与 `y_class` 按位置配对索引，取出第 0 条样本的真实类别、第 1 条样本的真实类别，得到 `(B,)`。这套公式假设 logits 有限、标签是有效类别编号，不直接覆盖多标签分类。

## 9. 完整例子：一次参数更新

回到 [深度学习基础](/posts/deep-learning-basics/) 中的线性模型，把单条输入扩展成一批向量：

$$
\hat y=XW+b,\qquad
L=\frac{1}{B}\sum_{i=1}^{B}(\hat y_i-y_i)^2
$$

这里每条样本只有一个预测值：`X` 为 `(B, D)`，`W` 为 `(D, 1)`，`b` 为 `(1,)`，预测值和标签都为 `(B, 1)`。$L$ 是均方误差（Mean Squared Error，MSE）。

令 $E=\hat y-y$。每条误差对自己的预测值求导得到 $2E/B$；预测值对权重的导数由输入特征决定，所以：

$$
\frac{\partial L}{\partial W}=\frac{2}{B}X^\top E,
\qquad
\frac{\partial L}{\partial b}=\frac{2}{B}\sum_{i=1}^{B}E_i
$$

`X.T @ E` 的形状是 `(D, B) @ (B, 1) → (D, 1)`，与权重形状一致。偏置被每条样本共享，所以沿样本轴把误差加起来。每个参数按“原值减去学习率乘梯度”更新。

下面的代码可以独立运行，只依赖 NumPy：

```python
import numpy as np

X = np.array([[1, 2, 3], [4, 5, 6]], dtype=np.float64)
y = np.array([[1], [2]], dtype=np.float64)
W = np.zeros((3, 1), dtype=np.float64)
b = np.zeros((1,), dtype=np.float64)
learning_rate = 0.01
B = X.shape[0]

prediction = X @ W + b
assert prediction.shape == y.shape
error = prediction - y
loss_before = np.mean(error ** 2)

grad_W = (2.0 / B) * (X.T @ error)
grad_b = (2.0 / B) * error.sum(axis=0)
assert grad_W.shape == W.shape
assert grad_b.shape == b.shape

W -= learning_rate * grad_W
b -= learning_rate * grad_b
loss_after = np.mean((X @ W + b - y) ** 2)

print(f"更新前：{loss_before:.6f}")  # 更新前：2.500000
print(f"更新后：{loss_after:.6f}")   # 更新后：0.022450
assert loss_after < loss_before
```

这次 `grad_W` 是 `[[-9], [-12], [-15]]`，`grad_b` 是 `[-3]`。更新后的两个预测为 `0.81` 和 `1.89`，损失为 $(0.19^2+0.11^2)/2=0.02245$。

NumPy 这里只执行数组计算，梯度公式是手动提供的。换成多层网络，需要继续应用链式法则；PyTorch 的自动求导会代为追踪和计算这些梯度。这个例子证明一次更新的计算关系，不代表模型已经具备泛化能力，也不保证任意学习率都能让损失下降。

## 10. 迁移到 PyTorch 时注意什么

形状思路可以沿用，但 API 不完全相同：NumPy 的归约参数叫 `axis`，PyTorch 通常叫 `dim`；矩阵乘法都可以写成 `@`。

`torch.from_numpy(array)` 可将受支持类型的 NumPy 数组转换为 CPU 张量，并与数组共享内存。一侧原地修改可能影响另一侧；转换前调用数组的 `.copy()` 可以与原数组隔离。见 [PyTorch 的 from_numpy 文档](https://docs.pytorch.org/docs/stable/generated/torch.from_numpy.html)。

如果训练时把需要求导的中间结果转成 NumPy 再计算，不能指望这段 NumPy 运算自动保留 PyTorch 的求导关系。通常让模型前向计算和损失留在框架中，NumPy 用于数据准备、结果检查或独立算例。

## 查阅时先看形状

| 要做的事 | NumPy 写法 | 需要确认 |
| --- | --- | --- |
| 取一条样本并保留批轴 | `X[i:i+1]` | 输出为 `(1, D)` |
| 汇总样本轴 | `X.mean(axis=0)` | 结果保留特征轴 |
| 每条样本单独求均值 | `X.mean(axis=-1, keepdims=True)` | 最后一轴确实是特征 |
| 添加长度为 1 的轴 | `x[:, None]` | 对一维 `x` 得到列向量 |
| 线性层 | `X @ W + b` | 相乘的内轴一致，偏置可广播 |
| 交换最后两轴 | `x.swapaxes(-1, -2)` | 保留前面的批轴 |
| 合并样本 | `np.concatenate(parts, axis=0)` | 其他轴形状一致 |
| 独立修改切片 | `X[:n].copy()` | 避免共享内存造成连带修改 |
| 检查异常数值 | `np.isfinite(X).all()` | 排除 NaN 和无穷 |
| 算逐样本误差 | `prediction - y` | 两者形状一致 |


