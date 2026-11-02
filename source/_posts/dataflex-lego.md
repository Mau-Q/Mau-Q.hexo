---
title: DataFlex Lego：组合与调度数据策略
date: '2026-11-01 17:08:47'
updated: '2026-11-01 17:08:47'
categories:
  - 技术
tags:
  - DataFlex
  - 训练框架
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/DataFlex/Lego.md. Edit the source note, then run npm run blog:sync. -->

> [!note] 持续修订
> 本文是持续更新的学习笔记，当前版本先行公开，后续会继续补充与校正。

[← DataFlex 总览](/posts/dataflex/)

Lego 不是新的数据优化算法，而是将 Selection、Mixture、Reorder、Reweighting 组合到同一个训练过程中，统一管理执行顺序、更新频率和数据依赖。

## 1. Lego 的整体架构

Lego 将训练干预划分为两个空间：

| 执行空间        | 包含模块                    | 主要作用                             |
| --------------- | --------------------------- | ------------------------------------ |
| **Index Space** | Selection、Mixture、Reorder | 决定训练哪些样本、采样比例及训练顺序 |
| **Loss Space**  | Reweighting、部分 Mixture   | 决定当前 Batch 的 Loss 如何加权      |

**执行顺序：**

`Selector → Mixer → Reorder → DataLoader → Weighter → Backward`

- **SelectStage**：筛选数据，可采用 `filter`（过滤候选池）或 `draw`（直接抽样）。
- **MixStage**：按领域比例分配数据预算。
- **ReorderStage**：安排样本训练顺序，放在索引阶段最后。
- **WeightStage**：根据当前 Batch 的 Loss 计算样本权重。

## 2. 四种预设 Pipeline

| Pipeline                | 组件组合                                              | 主要用途                                |
| ----------------------- | ----------------------------------------------------- | --------------------------------------- |
| **Hierarchical**        | Loss Selection → ODM → Dynamic SAW → Loss Reweighting | 完整分层组合                            |
| **Select then Reorder** | Loss Selection → Dynamic SAW                          | 研究选择与排序的交互                    |
| **Mix then Weight**     | ODM → Loss Reweighting                                | 领域配比与样本加权                      |
| **Select Only**         | Loss Selection                                        | 检验 Lego 与独立 Selection 的行为一致性 |

## 3. 核心调度机制

### 3.1 两层时钟

| 调度层次             | 作用                         |
| -------------------- | ---------------------------- |
| **Trainer 全局时钟** | 决定何时重新规划训练数据     |
| **Stage 更新时钟**   | 决定具体组件是否需要重新计算 |

例如：

- 全局每 50 个优化步规划一次。
- Selection 每 200 步更新。
- Mixture、Reorder 每 50 步更新。
- Weighter 启用后通常每个 micro-batch 计算权重。

**依赖传播：** 上游 Stage 更新会触发下游重新执行，但下游更新不一定要求上游重新执行。

### 3.2 ScoreBoard：共享评分缓存

用于减少多个算法重复计算同一批数据的 Loss。

例如：

`Loss Selection 计算 Loss → ScoreBoard 缓存 → Dynamic SAW 复用`

- `score_max_age`：控制缓存的有效期限。
- 当前主要支持逐样本 Loss 共享，不自动共享梯度、Embedding 等其他信号。

## 4. 重要的工程限制

| 问题             | 需要注意的地方                                              |
| ---------------- | ----------------------------------------------------------- |
| **策略兼容性**   | 并非所有 Selector、Weighter 都能直接组合                    |
| **权重接口**     | 某些 Weighter 只返回标量 Loss，不能直接与其他逐样本权重相乘 |
| **领域比例偏差** | Mixer 目标比例、实际索引比例、最终消费比例可能不同          |
| **ODM 反馈归属** | 混合领域 Batch 可能存在奖励归属错误                         |
| **动态调度**     | 能按配置动态执行，但不会自动搜索最优策略                    |
| **训练恢复**     | 保存数据计划不等于完整保存所有策略状态                      |

## 相关笔记

- [Selection：筛选训练样本](/posts/dataflex-selection/)
- [Mixture：分配领域预算](/posts/dataflex-mixture/)
- [Reorder：安排训练顺序](/posts/dataflex-reorder/)
- [Reweighting：权重组合与 Loss 尺度](/posts/dataflex-reweighting/#DataFlex-%E8%AE%AD%E7%BB%83%E4%B8%AD%E7%9A%84%E9%87%8D%E8%A6%81%E9%97%AE%E9%A2%98)

