---
title: Transformer：从 Seq2seq 到 Encoder 与 Decoder
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - 深度学习
  - Transformer
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/Transformer.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

## Seq2seq

输入一个序列，输出另一个序列，而且输出长度不一定和输入长度一样，也可以由模型自己决定。最典型的例子是语音识别和机器翻译。

### Seq2seq 应用

很多看起来很不一样的任务，都可以统一看成“输入 sequence → 输出 sequence”。比如语音合成（Text-to-Speech，TTS）、ChatbotQuestion Answering等。

## Seq2seq 的基本结构

![Pasted image 20261004194154](/img/blogs/transformer/pasted-image-20261004194154-22f23dd5.png)

### Encoder

![Pasted image 20261004194821](/img/blogs/transformer/pasted-image-20261004194821-6ec516ce.png)

和[Self-attention](/posts/self-attention/)一样，输入向量，经过 Encoder 转换为输出向量。Encoder 可以使用 RNN 或者 CNN，本节讨论 Transformer 的 Encoder。

![Pasted image 20261004195837](/img/blogs/transformer/pasted-image-20261004195837-39ee0331.png)

将 Encoder 展开，可以将其看作由若干个 Block 和中间输出向量序列组成，每一个 Block 可由 Multi-head Self-attention 和 FC 组成。

而向量不仅只作为 Self-attention 和 FC 的输入，还通过残差连接加到输入中，之后输出通过正则化（Norm) 进行新一轮的输入。注意最开始的输入要加入 Postitional Encoding。

![Pasted image 20261004200319](/img/blogs/transformer/pasted-image-20261004200319-76c4b447.png)

BERT 也使用和 Transformer 相同的 Encoder。

## Decoder

### Decoder – Autoregressive (AT)

先介绍自回归（Autoregressive）的 Decoder。所谓 Autoregressive。就是当前输出依赖前面已经生成的输出。

![Pasted image 20261004201330](/img/blogs/transformer/pasted-image-20261004201330-0255b4f7.png)

粗略自回归的 Decoder 如图所示，接收一个特殊的 STRAT 向量（BOS，Beginning Of Sequence）和 Encoder 的输入，最后的输出经过 softmax 变成概率，每个输出的概率向量的长度就是实现定义得总词汇大小。最后取概率最大的 token。

Autoregressive 就体现在输入 STRAT 向量产生一个输出，接下来就把这个输出作为新的输入进行下一轮的 Decoder，以此类推。

###  Masker Multi-Head Attention

![Pasted image 20261004202120](/img/blogs/transformer/pasted-image-20261004202120-e8a9837a.png)

如果忽略来自 Encoder 的输入，其实 Decoder 和 Encoder的区别就在于 Masked Multi-Head Attention。所谓Masked 其实和 Decoder 的作用是一样的，在计算每个输入向量的 $b$ 时，只考虑之前的向量。

### Autoregressive 的缺陷

这个输出作为新的输入时，如果输出和标准答案不一样，那模型就会顺着错误答案继续输出，最后越错越远。同时，我们不知道什么时候将输出停止，所以 Decoder 可能会永远不会停止，所以要引入一个特殊的 END 向量，表示输出结束。

## Decoder – Non-autoregressive (NAT)

![Pasted image 20261004203348](/img/blogs/transformer/pasted-image-20261004203348-8e4e1776.png)

Non-autoregressive 就是一次性将输入都变为 START 向量，平行地产生输出。而不是自回归，需要我们人为控制输入序列长度，最直观的方法是预测输入长度，另一种方法如图所示，先输入一个非常长的序列，模型就会在输出中间输出 END 向量，最后舍弃 END 之后的序列就行了。

对于 AT 必须将输出作为新的输入和可能会由产生的错误生成新的错误，NAT 的优点在于可以平行地输出，而且输出地更稳定，因为错误不影响其他输出，所以所以某些 TTS 场景里 NAT 生成更稳定。

而 NAT通常比 AT 差，这更答案的 Multi-modality 有关。Multi-modality 是指对于同一个输入，可能存在很多种都正确的输出方式。AT 方式由于要不断根据前面的生成结果来生成，相当于答案空间在不断的被压缩，最后会收敛到一个正确的回答，而 NAT 方式由于每个输出都只和 START 向量有关系，所以每一个输入可能都偏向不同的正确答案，最后组合到一起可能就比较混乱。

## Transformer

![Pasted image 20261004204626](/img/blogs/transformer/pasted-image-20261004204626-7d03dbdd.png)

现在把 Encoder 和 Decoder 放在一起看，最特殊的点在于 Decoder 的每一块都要接收来自 Encoder 的输入，再经过 attention 的处理，这个过程称为 Cross attention（交叉注意力）。

![Pasted image 20261004205247](/img/blogs/transformer/pasted-image-20261004205247-30d91f4f.png)

简单来说，就是 Decoder 中 输入向量经过 Masked Multi-Head Attention 之后再生成 $q$ 向量，和来自 Encoder 产生的 $\alpha$ 得到 $v$ 向量，然后通过正则化进入 FC。

通俗来讲 Cross attention就是 Decoder 在生成当前输出时，去 Encoder 的输入表示里找“现在应该关注哪一部分”。于是就有许多研究问题，比如：怎么找应该关注哪一部分和哪一层 Encoder 应该给哪一层 Decoder 做 Cross Attention，这里不展开。

### Training

![Pasted image 20261004210509](/img/blogs/transformer/pasted-image-20261004210509-f0160959.png)


训练 Decoder 时，不把模型自己刚生成的 token 作为下一步输入，而是直接把正确答案（Ground Truth）喂给下一步，之后计算模型输出和正确答案的交叉熵。这就是 Teacher Forcing。

### Tips

#### Copy Mechanism（复制机制）

Decoder 不一定每次都要“从词表里重新生成一个 token”，它还可以直接从输入序列中复制某个 token 到输出。比如在聊天机器人中，如果用户输入“我是 XXX”，而人名比较生僻，那生成的词汇表可能就没有这些词，于是 Copy Mechanism 允许输出直接复制输入，这对于摘要、QA、Chatbot、翻译等任务有很大作用。

#### Guided Attention（引导式注意力）

在 TTS 中，输入和输出大体是按顺序对齐的，所以我们希望生成越来越靠后的输出时，attention 也应该逐渐往输入后面移动。所以 Guided Attention就是不完全让模型自己“自由学” attention，而是额外给它一个约束，告诉它 attention 应该大致长成什么样，这样能约束模型的 attention 不要乱跳。

#### Beam Search（束搜索）、Sampling

Beam Search 和 Sampling 都是 Decoder 在生成序列时选择下一个 token 的策略：Beam Search 每一步保留概率最高的若干条候选路径，再继续向后扩展，以减少 Greedy Decoding 只看局部最优的问题；Sampling 则按照模型输出的概率分布随机抽取下一个 token，高概率 token 更容易被选中，但低概率 token 也有机会，因此能增加生成的多样性。简单说，Beam Search 更偏向“寻找高概率的最佳序列”，Sampling 更偏向“保留随机性和多样性”。

#### Decoder 训练中的两个不一致问题

Seq2seq 的 Decoder 在训练时会遇到两个很典型的问题。第一个问题是训练目标和最终评价指标并不完全一致：训练时，我们通常让模型逐 token 地最小化 cross-entropy，但真正评价机器翻译质量时，往往更关心 BLEU （Bilingual Evaluation Understudy，机器翻译中经典的自动评价指标，用来衡量模型生成的句子和参考答案有多相似）这类针对完整序列的指标。于是就会出现一种情况——模型的 cross-entropy 变小了，却不一定意味着最终生成的句子在 BLEU 上更好。由于 BLEU 这类离散的序列级指标很难直接反向传播，可以把它看成 reward，通过强化学习来优化。第二个问题来自Teacher Forcing：训练时 Decoder 每一步看到的都是正确答案，也就是 Ground Truth；但真正推理时，它只能把自己前一步生成的 token 当作下一步输入。一旦前面预测错了，错误就可能继续向后累积，这种训练阶段和推理阶段输入分布的不一致就是 Exposure Bias。为了缓解这个问题，可以使用 Scheduled Sampling：训练初期更多使用 Ground Truth，之后逐渐混入模型自己生成的 token，让模型提前适应真实推理时会遇到的情况。




