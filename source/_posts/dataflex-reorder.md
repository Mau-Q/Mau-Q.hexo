---
title: DataFlex Reorder：安排训练数据的顺序
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - DataFlex
  - 课程学习
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/DataFlex/Reorder.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

[← DataFlex 总览](/posts/dataflex/)

## 本篇目录

- [整体框架](/posts/dataflex-reorder/#1-Reorder-%E7%9A%84%E6%95%B4%E4%BD%93%E6%A1%86%E6%9E%B6)
- [排序原则](/posts/dataflex-reorder/#2-%E5%9B%9B%E7%A7%8D%E6%95%B0%E6%8D%AE%E6%8E%92%E5%BA%8F%E5%8E%9F%E5%88%99)
- [算法对比](/posts/dataflex-reorder/#3-%E6%8E%92%E5%BA%8F%E7%AE%97%E6%B3%95%E5%AF%B9%E6%AF%94)
- [评分信号](/posts/dataflex-reorder/#4-%E8%AF%84%E5%88%86%E4%BF%A1%E5%8F%B7)
- [静态与动态重排](/posts/dataflex-reorder/#5-Static-%E4%B8%8E-Dynamic-Reorder)

Reorder 不改变训练数据的集合和权重，而是改变样本进入模型训练的顺序。由于模型参数不断更新，不同训练顺序可能产生不同的优化轨迹。这也是课程学习（Curriculum Learning）的基础。

## 1. Reorder 的整体框架

Reorder 可以拆分为三个独立部分：

| 层次     | 核心问题                 | 具体方法                 |
| -------- | ------------------------ | ------------------------ |
| Score    | 根据什么评价数据？       | Loss、PPL、质量评分等    |
| Pattern  | 按什么规律组织训练顺序？ | Sorting、Folding、SAW 等 |
| Schedule | 什么时候重新评分、排序？ | Static、Dynamic          |

$$
\boxed{
\text{Score} \rightarrow \text{Pattern} \rightarrow \text{Schedule}
}
$$

例如：`Model Loss + SAW + Dynamic` 表示根据模型当前 Loss 评分，使用 SAW 组织课程，并在训练过程中动态重排。

## 2. 四种数据排序原则

| 原则 | 名称                  | 核心思想                         | 对应机制 |
| ---- | --------------------- | -------------------------------- | -------- |
| G1   | Boundary Sharpening   | 单独设计训练开头和结尾的数据     | Segment  |
| G2   | Cyclic Scheduling     | 周期性覆盖不同分数区间，缓解遗忘 | Folding  |
| G3   | Curriculum Continuity | 减少不同课程阶段之间的突变       | Zigzag   |
| G4   | Local Diversity       | 增加相邻样本的局部多样性         | JIT      |

其中 STR 主要整合 G1、G2；SAW 在此基础上进一步考虑 G3；两者均可叠加 JIT 实现 G4。

## 3. 排序算法对比

假设数据按照分数从低到高排列为：

`1, 2, 3, 4, 5, 6, 7, 8`

| 算法           | 核心机制                       | 主要目的               |
| -------------- | ------------------------------ | ---------------------- |
| Shuffle        | 全局随机打乱                   | 随机基线               |
| Sorting        | 严格按照分数排序               | 单调课程学习           |
| Segment（SEG） | 单独控制首尾分数区间，中间随机 | 边界强化               |
| Folding（FO）  | 多个从低到高的周期             | 周期性覆盖不同分数区间 |
| Zigzag（ZIG）  | 相邻周期交替反向               | 减少周期边界跳变       |
| Stair（STR）   | 全局递进 + 局部 Folding        | 兼顾整体课程与局部回顾 |
| SAW            | 全局递进 + 局部 Zigzag         | 进一步改善局部连续性   |
| JIT            | 小窗口内随机打乱               | 增加局部多样性         |

### 关键关系

- Folding → Zigzag：通过反转相邻周期，改善课程连续性。
- STR → SAW：把局部 Folding 替换为 Zigzag。
- JIT：不是独立的主排序方法，而是可叠加的局部随机扰动。

例如，12 条已排序样本，`layers=3`：

```
Folding:
1 4 7 10 | 2 5 8 11 | 3 6 9 12

Zigzag:
1 4 7 10 | 11 8 5 2 | 3 6 9 12
```

Zigzag 减少了 Folding 在周期边界处的大幅回跳。

## 4. 评分信号

| ScoreProvider      | 评分依据                 | 是否支持动态变化 |
| ------------------ | ------------------------ | ---------------- |
| `precomputed`      | 预计算的质量、难度等分数 | 否               |
| `cached_selection` | Selector 保存的评分缓存  | 默认不自动刷新   |
| `model_loss`       | 当前模型逐样本 Loss      | 是               |
| `model_perplexity` | 当前模型逐样本 PPL       | 是               |

重要区别：

- 质量评分高 ≠ Loss 高。
- Loss 高 ≠ 数据质量高。
- 如果使用相同的有效 Token 定义，且只考虑样本排名，PPL 与 Loss 的排序一致，因为 $PPL=\exp(Loss)$。

排序方向由 `polarity` 等配置控制：

- `higher_later`：高分样本后置。
- `higher_earlier`：高分样本前置。

因此，必须先明确分数代表质量、难度还是其他属性。

## 5. Static 与 Dynamic Reorder

| 维度             | Static Reorder   | Dynamic Reorder        |
| ---------------- | ---------------- | ---------------------- |
| 评分时机         | 训练前评分       | 训练过程中定期重新评分 |
| 排序方式         | 固定排列         | 根据当前分数重新排序   |
| 能否反映模型变化 | 不能             | 可以                   |
| 额外计算成本     | 通常较低         | 可能较高               |
| 主要问题         | 评分可能逐渐过时 | 评分开销与排序波动     |

### Dynamic Reorder 流程

1. Warmup：先进行初始训练。
2. 使用当前模型计算候选样本的 Loss/PPL。
3. 根据评分和 Pattern 生成排序。
4. 按排序取出下一阶段训练样本。
5. 定期重新评分、重排剩余样本。

关键参数：

| 参数            | 作用                             |
| --------------- | -------------------------------- |
| `reorder_every` | 每隔多少次 Reorder 调用重新评分  |
| `consume_once`  | 当前候选池耗尽前避免重复消费样本 |
| `max_samples`   | 限制每轮重新评分的样本数量       |
| `window_size`   | JIT 的局部随机打乱窗口           |

注意：当前 DataFlex 的 Dynamic SAW 主要是动态评分 + 固定 SAW 结构参数，并不是自动学习最佳课程结构的算法。

## 相关笔记

- [Selection：评分与候选样本](/posts/dataflex-selection/)
- [Lego：ScoreBoard 评分缓存](/posts/dataflex-lego/#3-2-ScoreBoard%EF%BC%9A%E5%85%B1%E4%BA%AB%E8%AF%84%E5%88%86%E7%BC%93%E5%AD%98)
- [Lego：组合后的重排调度](/posts/dataflex-lego/#3-%E6%A0%B8%E5%BF%83%E8%B0%83%E5%BA%A6%E6%9C%BA%E5%88%B6)
- PPL 与 Loss 的关系

