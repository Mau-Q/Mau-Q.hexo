---
title: PyTorch：从 Tensor 到完整训练流程
date: '2026-10-01 23:15:00'
updated: '2026-10-01 15:13:14'
categories:
  - 技术
tags:
  - 深度学习
  - PyTorch
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/PyTorch.md. Edit the source note, then run npm run blog:sync. -->

## PyTorch 是什么

可以理解为：

> 用 Tensor 表示数据，用神经网络做计算，用 Autograd 自动求梯度，再用 Optimizer 更新参数。

![输入和标签计算损失，反向传播计算梯度，优化器更新模型参数的单步训练流程](/img/blogs/pytorch-training-workflow/pytorch-c698106e.svg "一个训练 step 内的数据、梯度与参数关系")

用伪代码表示全局：

```
# 数据
dataset = ...

# 模型
model = ...

# 损失函数
criterion = ...

# 优化器
optimizer = ...

for x, y in dataset:

    # 1. 清梯度
    optimizer.zero_grad()

    # 2. 前向传播
    pred = model(x)

    # 3. 算 loss
    loss = criterion(pred, y)

    # 4. 反向传播
    loss.backward()

    # 5. 更新参数
    optimizer.step()
```

### 1.清梯度

调用 `loss.backward()` 时，梯度会累积到模型参数的 `.grad` 中。普通训练中，每个 training step 都希望使用当前这一批数据的梯度，所以先用 `optimizer.zero_grad()` 清除上一轮梯度。

如果有意做梯度累积，也可以连续处理几个小批次，再统一更新参数。这里先按“每批清梯度、每批更新一次”的普通训练流程理解。

### 2.前向传播

数学上是:

$$
x \rightarrow \text{Neural Network} \rightarrow \hat y
$$

### 3.算 loss

比如回归：

$$
L=(\hat y-y)^2
$$

### 4.反向传播

PyTorch 最关键的能力之一，沿计算图反向计算梯度，但不更新。这就是Autograd。

$$
\frac{\partial L}{\partial W_1}, \quad \frac{\partial L}{\partial b_1}, \quad \frac{\partial L}{\partial W_2}, \quad \frac{\partial L}{\partial b_2}
$$

### 5.更新参数

有了梯度以后，例如随机梯度下降（Stochastic Gradient Descent，SGD）：

$$
W \leftarrow W-\eta\frac{\partial L}{\partial W}
$$

## Tensor

Tensor = 可以有任意维度的数组。

例如 0 维 Tensor `x = torch.tensor(3.0)`。它只是一个数：

$$
3
$$

1 维 Tensor `x = torch.tensor([1, 2, 3, 4, 5])`。可以想成一个向量：

$$
[1,2,3,4,5]
$$

2 维 Tensor `x = torch.zeros(3, 5)`。可以看成：

$$
 \begin{bmatrix} 0&0&0&0&0\\ 0&0&0&0&0\\ 0&0&0&0&0 \end{bmatrix}
$$

对这个 2 维 Tensor 计算 `x.shape`，得到 `torch.Size([3, 5])`，两个维度的长度分别是 3、5。

再看一个 3 维 Tensor：`x = torch.zeros(4, 5, 3)`，它的 shape 是 `torch.Size([4, 5, 3])`。
这时三个维度分别为 dim0、dim1、dim2，长度分别是 4、5、3。

注意：**不要死记“dim=0 是行还是列”。**

比如因为以后 Tensor 会变成：

```
(batch, seq_len, hidden_size)
```

根本不能简单说“行列”。

Tensor可以直接从 Python list 创建或者从 NumPy 转过来

Tensor 不仅有 shape，还有`x.dtype`

2个常见的：

| 类型             | PyTorch       |
| -------------- | ------------- |
| 32-bit float   | `torch.float` |
| 64-bit integer | `torch.long`  |

不同操作要求的数据类型不同，比如 `nn.CrossEntropyLoss()` 使用整数类别编号作为标签时，label 应该是 `torch.long`。后面的回归例子使用浮点数标签。

Tensor 还有另一个属性：`x.device`。
默认情况下，Tensor 和 Module 都在 CPU 上计算。
需要注意的是：参与同一次运算的数据必须处在兼容的 device上，就是model 和 Tensor 必须在同一个 device。

所以以后深度学习代码一报 Tensor 相关错误，先打印：

```
print(x.shape)
print(x.dtype)
print(x.device)

```

## Tensor 变形

### 1.squeeze：删掉长度为 1 的维度

```
x = torch.zeros([1, 2, 3])

x.shape
# torch.Size([1, 2, 3])

x = x.squeeze(0)

x.shape
# torch.Size([2, 3])
```

`x.squeeze(0)` 的意思是删除长度为 1 的 dim0。这里 dim1 的长度是 2，所以 `x.squeeze(1)` 会保持原来的 shape。

那为什么可以删去呢？比如看`torch.Size([1, 2, 3])`，可以理解成1 组 `2 × 3` 的数据。因为只有 **1 组**，所以你有时候并不需要保留“组”这一层。
可以类比：

```
[
    [
      [a, b, c],
      [d, e, f]
    ]
]
```

最外面只有一组。

`squeeze(0)` 后可以理解为：

```
[
  [a, b, c],
  [d, e, f]
]
```

不过，长度为 1 只是“能删除”的条件，是否应该删除还取决于这一维的含义。例如输入是 `(1, 3, 224, 224)`，第一维表示 batch，即使只有一张图片，模型也可能要求保留它。直接用不指定维度的 `squeeze()` 会删除所有长度为 1 的维度，尤其容易误删 batch 维。

### 2.`unsqueeze`：增加一个长度为 1 的维度

与前者相反，`x.unsqueeze(0)` 表示在 dim=0 的位置插入一个长度为 1 的新维度。

那为什么需要`unsqueeze`呢？

假设一张图片：

```
x.shape = (3, 224, 224)
```

可以表示：

```
channel = 3
height  = 224
width   = 224
```

但很多模型希望输入：

```
(batch, channel, height, width)
```

也就是 4 维 Tensor。

你只有一张图片，于是 batch size 是：

$$
 1
$$

就可以：

```
x = x.unsqueeze(0)
```

得到：

```
(1, 3, 224, 224)
```

### 3.`transpose`：交换两个维度

```
x = torch.zeros([2, 3])

x.shape
# torch.Size([2, 3])

x = x.transpose(0, 1)

x.shape
# torch.Size([3, 2])
```

在shape 不匹配时经常会用 `transpose`，
比如：

```
x = torch.randn(4, 5)
y = torch.randn(5, 4)
z = x + y #这里会报 shape 不匹配
```

这里：

```
x.shape = (4,5)
y.shape = (5,4)
```

不能直接相加。

PPT 给出的处理方式：

```
y = y.transpose(0, 1)
z = x + y
```

此时：

```
y.shape:
(5,4)
↓
(4,5)
```

就和 `x` 对齐了。

这个处理成立的前提是：`y` 的两个维度确实与 `x` 的维度顺序相反。比如 `x` 是 `(样本数, 特征数)`，`y` 是 `(特征数, 样本数)`，交换后才有对应意义。只让 shape 一致，不能保证相加的含义正确。

### 4.`cat`：沿某个维度拼接 Tensor

```
x = torch.zeros([2, 1, 3])
y = torch.zeros([2, 3, 3])
z = torch.zeros([2, 2, 3])

w = torch.cat([x, y, z], dim=1)

w.shape
# torch.Size([2, 6, 3])
```

意思就是将 dim=1 的长度相加，但其他维度的长度必须相同。

## Autograd

围绕这个例子：

```
x = torch.tensor([[1., 0.],
                  [-1., 1.]],
                 requires_grad=True)

z = x.pow(2).sum()

z.backward()

print(x.grad)

#预期输出
# tensor([[ 2.,  0.],
#         [-2.,  2.]])
```

`x.pow(2)`就是每个元素平方，`sum()`把所有元素加起来，所以最后`z = 3`。

`requires_grad=True`表示我之后希望对这个 Tensor 求梯度，也就是告诉 PyTorch这个 x 参与后续计算时，保留反向传播所需要的信息。所以在后续计算时，PyTorch 会知道 `z` 是由 `x` 计算出来的。

也就是保留`x` -> `pow(2)` -> `sum()` -> `z`。

这些运算和它们之间的依赖关系构成了计算图。反向传播沿着这张图，用链式法则计算梯度。这个例子里，每个元素的平方求导得到 `2x`。

执行`z.backward()`，它会从最终结果 `z` 开始，沿着之前的计算关系往回算梯度。

最后得到：

$$
\frac{\partial z}{\partial x}
$$

保存在`x.grad`。

也就是：

```
tensor([[ 2.,  0.],
        [-2.,  2.]])
```

于是可以粗略理解成：Autograd 是 PyTorch 自动完成 Backpropagation 的机制。`backward()` 计算梯度，后面由优化器更新参数。

## Dataset 与 DataLoader

可以先把 `Dataset` 理解成： **一个“可以按编号取样本”的数据容器。**

后面的代码围绕同一个回归任务：每个样本有 10 个特征，预测 1 个数。用 `x` 表示特征，用 `y` 表示标签。

```python
import torch
from torch.utils.data import Dataset, DataLoader

class MyDataset(Dataset):
    #接收已经准备好的特征和标签
    def __init__(self, x, y):
        self.x = x #shape: (N, 10)
        self.y = y #shape: (N, 1)

    #一次返回一个 sample
    def __getitem__(self, index):
        return self.x[index], self.y[index]

    #返回数据集大小
    def __len__(self):
        return len(self.x)
```

当你写：

```
dataset = MyDataset(x_data, y_data)
```

时，首先执行 `__init__`。这里的 `x_data`、`y_data` 表示已经准备好的数据，初始化时把它们存下来；实际项目也可以在这里读取文件、做预处理。`__init__` 在创建对象时执行。

所以你可以把：

```
dataset[index]
```

理解成调用 `dataset.__getitem__(index)`：“给我第 index 个样本。”例如 `dataset[3]` 对应 `dataset.__getitem__(3)`。

实际监督学习中，一个 sample 往往是：$(x,y)$，那么：`dataset[3]`可能返回：$(x_3, y_3)$。

`len(dataset)`就是简单的返回数据集大小

$$
 \boxed{ Dataset = \text{“数据集有多大”} + \text{“如何取一个样本”} }
$$

而训练通常不是一次把整个数据集都扔进模型，也不一定是每次只训练一个样本，更常见的是一次取一小批样本，也就是 mini-batch。所以还需要`DataLoader`。

```
dataset = MyDataset(x_data, y_data)

dataloader = DataLoader(
    dataset,
    batch_size=16, #每次送进模型的样本数
    shuffle=True #取数据前把样本顺序打乱
)
```

### shape 会发生什么变化

假设单个样本：

```
x.shape = (10,)
y.shape = (1,)
```

如果：

```
batch_size = 16
```

那么一批数据通常就会变成：

```
x.shape = (16, 10)
y.shape = (16, 1)
```

也就是：

$$
 (\text{batch size},\text{feature dimension})
$$

所以`DataLoader` 很常见的效果，就是在最前面引入一个 batch 维度。

`unsqueeze(0)` 可以给一个样本增加长度为 1 的 batch 维；这里 DataLoader 则把多个样本堆叠成一批。后面用 `B` 表示当前批次的实际样本数，输入是 `(B, 10)`，标签是 `(B, 1)`。最后一批可能不足 16 个样本。

## torch.nn

### nn.Linear(in_features, out_features)

例如`nn.Linear(32, 64)`，意思是输入最后一维大小必须是 32，输出最后一维变成 64。

例如：

```
(10, 32)
   ↓ Linear(32,64)
(10, 64)
```

这点以后对 Transformer 很重要，因为经常有：

```
(batch, seq_len, hidden_size)
```

然后：

```
nn.Linear(hidden_size, new_size)
```

本质就是对每个 token（词元）的最后一维做同一个线性变换。

`Linear(32,64)` 数学上其实就是矩阵乘法

例如：

$$
Wx+b=y
$$

其中：

- 输入 $x$：32 维
- 输出 $y$：64 维
- 权重 $W$：$64\times32$
- bias：64 维。

所以`Linear(32,64)`就体现了$W$和$b$ 2 个参数，也就是 $\theta$。

也就是说：

$$
 x\in\mathbb R^{32}
$$

希望得到：

$$
 y\in\mathbb R^{64}
$$

因此需要：

$$
 W\in\mathbb R^{64\times32}
$$

于是：

$$
 Wx: (64\times32)(32\times1) \rightarrow 64\times1
$$

最后：

$$
y=Wx+b
$$

上面把单个输入 $x$ 写成列向量。PyTorch 代码里，一批输入通常按 `(B, 32)` 排列，记为 $X$，对应计算是 $Y=XW^T+b$，输出为 `(B, 64)`。两种写法表达的是同一个线性变换，只是数据的排列方式不同。

### 激活函数

2 个常见的是`nn.Sigmoid()`和`nn.ReLU()`。这里不再赘述。

### Loss Function

2 个常见的是`nn.MSELoss()`和`nn.CrossEntropyLoss()`。这里不再赘述。

这里使用 `nn.MSELoss()` 做回归。默认 `reduction="mean"`，会对所有元素的平方误差求平均。在每个样本只输出 1 个数的例子里，一批数据的 loss 是：

$$
L=\frac{1}{B}\sum_{i=1}^{B}(\hat y_i-y_i)^2
$$

计算`Loss`:

```
criterion = nn.MSELoss()

loss = criterion(pred, y)
```

**这里 `pred` 和 `y` 都应是 `(B, 1)`。** 如果 `pred` 是 `(B, 1)`，`y` 却是 `(B,)`，当 `B > 1` 时，两者相减会按广播规则扩展为 `(B, B)`，把每个预测与所有标签比较。MSELoss 会发出形状不一致的警告，但仍可能完成计算，所以“代码能运行”并不表示 loss 算对了。

如果标签原本是一维的 `(N,)`，且确实是每个样本对应一个数，可以在准备数据时用 `y_data = y_data.unsqueeze(1)` 统一成 `(N, 1)`。

### 定义自己的神经网络

```python
import torch.nn as nn

#定义一个 PyTorch 模型
class MyModel(nn.Module):

    #初始化模型、定义 layers
    def __init__(self):
        super(MyModel, self).__init__()

        #把神经网络层按顺序串起来
        self.net = nn.Sequential(
            nn.Linear(10, 32),
            nn.Sigmoid(),
            nn.Linear(32, 1)
        )

    #计算神经网络输出，表示输入 x 之后，数据怎么流过网络。
    def forward(self, x):
        return self.net(x)
```

平时一般写

```
model = MyModel()

x = torch.randn(16, 10)
pred = model(x) #shape: (16, 1)
```

这一批数据经过网络时，shape 依次是 `(B, 10) → (B, 32) → (B, 32) → (B, 1)`。Sigmoid 对每个元素计算激活值，保持 shape；两个 Linear 分别改变最后一维。

直觉上，它最终会按照定义的`forward()`执行前向计算。也就是：

$$
 x \rightarrow W_1x+b_1 \rightarrow h=\operatorname{Sigmoid}(W_1x+b_1) \rightarrow \hat y=W_2h+b_2
$$

然后：

```
criterion = nn.MSELoss()
y = torch.randn(16, 1) #用于演示的标签
loss = criterion(pred, y)
```

得到：

$$
 L
$$

再：

```
loss.backward()
```

PyTorch 会沿整个计算过程反向计算：

$$
 \frac{\partial L}{\partial W_2},\frac{\partial L}{\partial b_2},\frac{\partial L}{\partial W_1},\frac{\partial L}{\partial b_1}
$$

## torch.optim

### 创建 Optimizer

沿用上面的 `MyDataset` 和 `MyModel`，先构造一组演示数据。标签来自一个人为设定的关系，加上少量噪声；它用于跑通流程。将两个类定义与下面的训练、验证、预测和保存加载代码按顺序组合，就能组成一个完整例子。

```python
torch.manual_seed(0)
x_all = torch.randn(100, 10)
y_all = 2 * x_all[:, :1] - x_all[:, 1:2] + 0.1 * torch.randn(100, 1)

#训练集、验证集各自取不同的样本
tr_set = DataLoader(MyDataset(x_all[:64], y_all[:64]), batch_size=16, shuffle=True)
dv_set = DataLoader(MyDataset(x_all[64:80], y_all[64:80]), batch_size=16, shuffle=False)
#剩下 20 个样本只取特征，演示没有标签时的预测流程
tt_set = DataLoader(x_all[80:], batch_size=16, shuffle=False)

device = torch.device("cpu") #先在 CPU 上跑通，也可以按环境改用 GPU
model = MyModel().to(device)

criterion = nn.MSELoss()

optimizer = torch.optim.SGD(
    model.parameters(), #把模型中需要训练的参数交给 optimizer
    lr=0.1 #learning rate
)
```

### 完整 Training Loop

一个 epoch 表示遍历一轮训练数据；这里每一批执行一次参数更新。

```python
n_epochs = 10

for epoch in range(n_epochs):

    model.train() #把模型切换到“训练模式”

    for x, y in tr_set:

        optimizer.zero_grad()

        x, y = x.to(device), y.to(device)

        pred = model(x) #x: (B, 10)，pred: (B, 1)

        loss = criterion(pred, y) #y: (B, 1)，loss 是标量

        loss.backward()

        optimizer.step()
```

## Validation、Testing

### Validation 的完整代码

```python
model.eval() #设置 evaluation mode

total_loss = 0

for x, y in dv_set:

    x, y = x.to(device), y.to(device)

    with torch.no_grad(): #禁止梯度计算

        pred = model(x)

        loss = criterion(pred, y)

        total_loss += loss.cpu().item() * len(x) #累积 loss

avg_loss = total_loss / len(dv_set.dataset) #求平均 loss
```

`model.eval()` 和 `torch.no_grad()` 分别处理两件事：

- `model.eval()` 将模型切换到评估模式，影响 Dropout、BatchNorm 等层的行为。当前模型只有 Linear 和 Sigmoid，切换模式不会改变这些层的计算方式，但写清楚模式有助于后续扩展模型。
- `torch.no_grad()` 关闭这一段运算的梯度记录，减少反向传播所需的开销。它不会自动切换模型模式；`eval()` 也不会自动关闭梯度记录。

所以验证时通常一起使用它们，恢复训练时再调用 `model.train()`。

对于 `total_loss += loss.cpu().item() * len(x)`，这里每个样本输出 1 个数，`nn.MSELoss()` 默认返回当前 batch 的平均平方误差。乘以 `len(x)`，也就是当前 batch 的实际样本数，得到这一批的误差总和；最后除以验证集样本数，得到整个验证集的平均 loss。这样最后一批不足 batch size 时，也会按实际样本数加权。

这个写法依赖当前 loss 的归约方式和输出形状。如果改成 `reduction="sum"`，就不需要再乘 batch 大小；如果每个样本包含不同数量的有效输出元素，也需要重新确定平均时的分母。

而 `loss` 本身还是 Tensor，可能是 `tensor(0.5321, device='cuda:0')` 这样的形式，所以代码先用 `loss.cpu()` 把它放到 CPU，再用 `.item()` 取出普通数值。标量 Tensor 也可以直接调用 `loss.item()`。

由[深度学习基础](/posts/deep-learning-basics/)可知validation 是看看当前模型在没有参与这一轮参数更新的数据上表现如何。

### Testing

```python
model.eval()

preds = []

for x in tt_set:

    x = x.to(device)

    with torch.no_grad():

        pred = model(x)

        preds.append(pred.cpu())

preds = torch.cat(preds, dim=0) #把各批预测拼起来，shape: (20, 1)
```

这里的 `tt_set` 只返回特征，所以用 `for x in tt_set:` 收集预测结果。如果测试集有标签，也可以计算 test loss，用于最终评估；测试结果应与用于调参、选择模型的验证结果区分开。

### 保存模型

保存：

```python
path = "model.pt"
torch.save(
    model.state_dict(), #参数与持久缓冲区的状态
    path
)
```

加载：

```python
loaded_model = MyModel().to(device)
ckpt = torch.load(path, map_location=device, weights_only=True)
loaded_model.load_state_dict(ckpt)
loaded_model.eval() #用于预测前设置评估模式
```

`state_dict()` 包含模型参数，以及 BatchNorm 的运行均值等持久缓冲区。它不包含定义模型结构的 Python 代码，所以加载前要先创建结构匹配的模型，再把状态填进去。`map_location` 指定把保存的 Tensor 加载到哪个 device。

这里保存的状态足够用于恢复模型预测。如果要接着上一次训练继续跑，还需要保存 optimizer 状态、epoch 等训练信息。

### PyTorch 训练流程

![训练期间验证并选择模型，训练结束后加载选定模型进行最终测试的流程](/img/blogs/pytorch-training-workflow/pytorch-95a63f77.svg "训练、验证、模型选择与最终测试")

图中是推荐的完整流程：训练期间按验证结果选择并保存模型，训练结束后加载选定模型，再做最终测试。上面的简化代码只在训练结束后验证并保存最终模型，尚未实现每轮验证和择优保存。

## 常见报错

打开某个函数的文档以后，最重要的是看它的 **signature**。

例如：

```
torch.max(input, dim, keepdim=False, *, out=None)
```

### Positional Argument

Parameters 不一定需要写参数名字，可以通过位置传进去，也就是 positional arguments。

比如`torch.max(x, 0)`等价于：`torch.max(input=x, dim=0)`。

### Keyword Argument

比如`torch.max(x, dim=0)`，这里`dim=0`就是keyword argument

按照 Python 函数签名的含义，`*` 后面的参数需要使用参数名传递。

`keepdim=False`就是Default Argument。

### 四类常见错误

以后看到 Tensor 报错时先形成：

$$
 \boxed{ device \rightarrow shape \rightarrow dtype \rightarrow memory }
$$

#### Device 不一致

```
model = torch.nn.Linear(5, 1).to("cuda:0")

x = torch.Tensor([1,2,3,4,5]).to("cpu")

y = model(x)
```

在有 CUDA 的环境中，这里会因为模型参数在 GPU、输入在 CPU 而报 device 不一致；具体报错文本可能随版本不同。可以用 `x = x.to("cuda:0")`，让输入与模型处在同一 device。

检查时先打印模型参数和输入的 device。前向计算已经失败时，`y` 还没有生成，不能拿它来排查：

```
print(next(model.parameters()).device)
print(x.device)
```

#### Shape / Dimension 不匹配

```
x = torch.randn(4, 5)
y = torch.randn(5, 4)

z = x + y
```

如果这里两个维度的含义确实互换，可以用 `y = y.transpose(0, 1)`。其他 shape 问题也可能需要用：

```
transpose
squeeze
unsqueeze
```

来调整维度，具体选择取决于每一维的含义。

但要特别注意：

> **不要一看到 shape 错误就随便 `squeeze` / `transpose`。**

先问：

```
当前每一维代表什么？
模型要求的每一维又是什么？
```

然后再修改。

#### CUDA Out of Memory

```
from torchvision import models

resnet18 = models.resnet18().to("cuda:0")

data = torch.randn(512, 3, 244, 244)

out = resnet18(data.to("cuda:0"))
```

这段代码在有 CUDA 的环境中可能因为 batch size 太大而触发显存不足，是否发生取决于可用显存。遇到这种情况可以先减小 batch size。

训练 QLoRA 遇到 OOM 时，首先会关注：

```
batch size
sequence length
model size
```

#### dtype 不匹配

```
L = nn.CrossEntropyLoss()

outs = torch.randn(5, 5)

labels = torch.Tensor([1,2,3,4,0])

lossval = L(outs, labels)

```

报`expected scalar type Long but found Float`，应该`labels = labels.long()`。因为labels 表示类别。
