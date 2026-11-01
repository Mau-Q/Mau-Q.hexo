---
title: DataFlex：训练数据策略总览
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - DataFlex
  - 数据中心AI
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/DataFlex/DataFlex.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

## 阅读目标

我们要解决三个层次的问题：

1. 原理：五个模块为什么存在，各自改变训练的什么？
2. 算法：LESS、DoReMi、Loss Reweighting、SAW 等方法有什么不同？
3. 实现：DataFlex 在训练过程中怎样执行这些策略，又有哪些限制？

## 从 SFT 场景理解 DataFlex

假设你有一个 Qwen Base 模型，准备使用下面的数据进行 SFT：

![Pasted image 20261030102727](/img/blogs/dataflex/pasted-image-20261030102727-3a8ac77c.png)

普通训练主要通过优化器、学习率等因素控制模型如何学习。训练集、域比例、抽样机制通常在训练前确定。

但这会产生很多问题：

- 数据 A 和数据 D 的价值是否一样？
- 数学与代码应该始终维持 6:4 吗？
- Loss 较高的样本应该更受重视，还是更少训练？
- 初期有用的数据，后期还一样有用吗？
- 如果改变样本顺序，模型最终效果是否会不同？

DataFlex 的核心思想是：不仅优化模型参数，还要控制训练数据如何参与优化。

## 五个模块到底改变了什么？

| 模块        | 决策变量              | 对训练的直接影响       |
| ----------- | --------------------- | ---------------------- |
| [Selection](/posts/dataflex-selection/) | $z_i$：是否选中样本   | 改变哪些样本进入训练   |
| [Mixture](/posts/dataflex-mixture/) | $p_k$：各领域采样比例 | 改变训练数据的领域分布 |
| [Reweighting](/posts/dataflex-reweighting/) | $w_i$：样本损失权重   | 改变每条样本的梯度贡献 |
| [Reorder](/posts/dataflex-reorder/) | $\pi$：样本排列       | 改变训练数据的出现顺序 |
| [Lego](/posts/dataflex-lego/) | 策略组合与调度        | 组织前面几类决策的执行 |

前四个模块改变的是不同的训练变量；Lego 则负责组织这些策略，因此它与前四个并不是完全平行的算法类别。

这几个模块之间还存在一个重要区别：

**Selection、Mixture、Reorder** 主要在取 batch 前干预数据；**Reweighting** 则在计算损失时干预训练。

## DataFlex 的完整训练架构

| 概念                                  | 在 DataFlex 中的职责 | 你需要记住什么                         |
| ------------------------------------- | -------------------- | -------------------------------------- |
| Trainer                               | 接管训练中特定环节   | 决定什么时候执行策略                   |
| Selector / Mixer / Weighter / Reorder | 具体算法组件         | 决定怎么计算数据策略                   |
| Registry                              | 根据名称找到实现类   | 让算法可以替换                         |
| DataLoader                            | 将数据组织成 batch   | 真正决定模型收到哪些数据、什么顺序     |
| [ScoreBoard](/posts/dataflex-lego/#3-2-ScoreBoard%EF%BC%9A%E5%85%B1%E4%BA%AB%E8%AF%84%E5%88%86%E7%BC%93%E5%AD%98) | 缓存和共享部分评分   | 减少重复评分，但不是所有算法的统一缓存 |
| [Lego Pipeline](/posts/dataflex-lego/#2-%E5%9B%9B%E7%A7%8D%E9%A2%84%E8%AE%BE-Pipeline) | 协调多组件执行       | 管理组合、依赖和调度                   |

DataFlex 论文真正重要的系统贡献，就是将原本散落在不同仓库、接口不统一的算法，纳入 LLaMA-Factory 的同一训练体系。

## 模块阅读入口

### Selection

[进入 Selection](/posts/dataflex-selection/)：数据选择原理、Loss／梯度／表征类算法、[15 种算法对比](/posts/dataflex-selection/#DataFlex-Selection%EF%BC%9A15-%E7%A7%8D%E7%AE%97%E6%B3%95%E6%80%BB%E8%A7%88)与训练接入。

### Mixture

[进入 Mixture](/posts/dataflex-mixture/)：Static、Random、DoReMi、ODM、Dynamic MoE，以及[算法横向比较](/posts/dataflex-mixture/#%E4%BA%94%E7%A7%8D-Mixture-%E7%AE%97%E6%B3%95%E7%9A%84%E5%AE%8C%E6%95%B4%E6%A8%AA%E5%90%91%E6%AF%94%E8%BE%83)和领域采样机制。

### Reweighting

[进入 Reweighting](/posts/dataflex-reweighting/)：Loss、ADAPT、Joint-Update-Aware、多模态 Weighter，以及[权重尺度与 Loss 归约](/posts/dataflex-reweighting/#DataFlex-%E8%AE%AD%E7%BB%83%E4%B8%AD%E7%9A%84%E9%87%8D%E8%A6%81%E9%97%AE%E9%A2%98)。

### Reorder

[进入 Reorder](/posts/dataflex-reorder/)：排序原则、Score／Pattern／Schedule、[排序算法对比](/posts/dataflex-reorder/#3-%E6%8E%92%E5%BA%8F%E7%AE%97%E6%B3%95%E5%AF%B9%E6%AF%94)与动态重排。

### Lego（策略组合与执行规划）

[进入 Lego](/posts/dataflex-lego/)：执行空间、[预设 Pipeline](/posts/dataflex-lego/#2-%E5%9B%9B%E7%A7%8D%E9%A2%84%E8%AE%BE-Pipeline)、调度时钟、[ScoreBoard](/posts/dataflex-lego/#3-2-ScoreBoard%EF%BC%9A%E5%85%B1%E4%BA%AB%E8%AF%84%E5%88%86%E7%BC%93%E5%AD%98)和工程限制。

## 通用知识

- [泰勒展开与梯度近似](/posts/optimization-algorithms/#%E6%B3%B0%E5%8B%92%E5%B1%95%E5%BC%80%E5%9C%A8%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0%E4%B8%AD%E7%9A%84%E5%BA%94%E7%94%A8)
- [策略梯度](/posts/optimization-algorithms/#%E7%AD%96%E7%95%A5%E6%A2%AF%E5%BA%A6%EF%BC%88Policy-Gradient%EF%BC%89)
- [Softmax 与温度参数](/posts/optimization-algorithms/#Softmax)
- [多臂老虎机](/posts/optimization-algorithms/#%E5%A4%9A%E8%87%82%E8%80%81%E8%99%8E%E6%9C%BA%EF%BC%88Multi-Armed-Bandit-MAB%EF%BC%89)
- 深度学习基本知识与术语

