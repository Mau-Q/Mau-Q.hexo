---
title: API 调用
date: '2026-10-01 15:30:00'
updated: '2026-10-01'
categories:
  - 技术
tags:
  - 大语言模型
  - API
  - 学习笔记
---

<!-- Generated from Obsidian: Blogs/API 调用.md. Edit the source note, then run npm run blog:sync. -->

## API 是什么

在[Prompt Engineering](/posts/prompt-engineering/)已经知道了怎么写`Prompt`，那怎么把`Prompt`发给模型，并取得结果呢？这就需要`API`（**Application Programming Interface**）。可以理解为程序和模型服务进行通信的接口。

调用 API 时，一个通常的过程是：

> `Python` $\rightarrow$ `HTTP Request` $\rightarrow$ `API Server` $\rightarrow$ `LLM` $\rightarrow$ `HTTP Response` $\rightarrow$ `Python`

## API 的组成

一次 API 调用包含请求（`Request`）和响应（`Response`）。请求通常包括身份认证信息（`API Key`）、模型名称（`Model`）、输入（`Input`）和生成参数（`Generation Parameters`）；响应则包括模型输出、用量统计等信息。

### 1. API Key

可以理解成：程序访问模型服务的身份凭证。所以不要显式写在代码中，最好使用环境变量：

```bash
export DEEPSEEK_API_KEY="..."
```

### 2. model

告诉服务器本次请求由哪一个模型完成。不同的模型能力不一样。

### 3. messages 与 input

Chat Completions API 使用`messages`传入消息列表，常见写法是：

```python
messages=[
    {
        "role": "system",
        "content": "You are a helpful assistant."
    },
    {
        "role": "user",
        "content": "Explain SFT."
    }
]
```

这就是`system`+`user`。其中`role`表示消息的角色，`content`表示消息内容：`system`用来设置整体要求，`user`是用户输入，`assistant`是模型回复。

Responses API 则使用`input`传入输入，最简单的写法是：

```python
response = client.responses.create(
    model="...",
    input="Explain SFT."
)
```

这两种接口的输入与返回结构不同，读取结果时也要使用对应接口的字段。下面以 DeepSeek 的 Chat Completions API 为例，完成一次调用。

先安装 OpenAI Python SDK（Software Development Kit，软件开发工具包）：

```bash
python3 -m pip install openai
```

`from openai import OpenAI`使用的是这个 SDK，`base_url`决定请求发往哪个服务。这里设置为 DeepSeek 的地址，所以实际调用的是 DeepSeek。它支持兼容的 API 格式，可以使用 OpenAI SDK 发送请求，具体配置见[官方调用示例](https://api-docs.deepseek.com/)。

一次完整的调用（这里显式关闭思考模式，便于先理解普通文本生成）：

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-flash",
    messages=[
        {
            "role": "system",
            "content": "You are a concise AI tutor."
        },
        {
            "role": "user",
            "content": "Explain supervised fine-tuning."
        }
    ],
    extra_body={"thinking": {"type": "disabled"}}
)

print(response.choices[0].message.content)
```

其中`completions`指的是“补全”，因为模型本质就是根据我们给的 token 预测下一个 token。

调用本质就是`输入 context` $\rightarrow$ `model` $\rightarrow$ `输出 output`。

### 4. Generation Parameters

#### 4.1 temperature

`temperature`在 softmax 前缩放 logits，用来控制概率分布的集中程度。logits 是模型给各个候选 Token 的分数，经过 softmax 后得到概率。记第 $i$ 个候选 Token 的分数为 $z_i$，概率为 $P_i$，则：

$$
P_i= \frac{e^{z_i}} {\sum_j e^{z_j}}
$$

任意 2 个 Token 的输出概率比为：

$$
\frac{P_i}{P_j}=\frac{e^{z_i}}{e^{z_j}}=e^{z_i-z_j}
$$

于是我们将 logits 都除以 $T$，也就是`temperature`，再进行 softmax。`temperature`越小，概率越集中，模型更倾向选择最高概率 Token，所以输出通常更稳定、更保守。反之`temperature`越大，原本概率较小的 Token 也更有机会被选中，所以输出通常更多样、更随机。

每个 logits 的概率变为：

$$
P_i= \frac{e^{z_i/T}} {\sum_j e^{z_j/T}},\qquad T>0
$$

对应的概率比变为：

$$
\frac{P_i}{P_j}=e^{(z_i-z_j)/T}
$$

当 $z_i>z_j$ 时，$T$ 越小，这个比值越大，就说明模型越倾向选择分数较高的 Token。对于不同的任务可以选用不同的`temperature`：在分类任务中可以调低，而在创作任务中可以调高。

接口允许的范围取决于服务商和模型。DeepSeek 当前文档给出的范围是`0~2`，但在思考模式下这个参数不起作用。公式要求 $T>0$；接口中的`temperature=0`通常表示采用贪心选择或接近贪心的生成方式，不能直接把 0 代入上面的公式，也不应据此保证每次输出完全一致。

#### 4.2 top_p

称为 Nucleus Sampling（核采样）。

如果取 `top_p` = 0.9，那从**最高概率开始累计**，选取累计概率首次达到或超过`top_p`的最小候选集合，再只从这些 Token 中采样。

| Token | Probability |
| ----- | ----------- |
| A     | 0.50        |
| B     | 0.25        |
| C     | 0.15        |
| D     | 0.07        |
| E     | 0.03        |

例如本例`A + B + C` = 0.9，于是只从这三者之间采样。

采样前还要重新归一化：A、B、C 的概率分别变为 $0.50/0.90$、$0.25/0.90$、$0.15/0.90$，三者之和为 1。

可以这样理解：

`Temperature`改变**整个概率分布的尖锐程度**。而`Top-p`改变**允许参加抽样的候选 Token 范围**。

在流程图中可以画成：

> `Logits` $\rightarrow$ `Temperature` $\rightarrow$ `Probability distribution` $\rightarrow$ `Top-p filtering` $\rightarrow$ `Sampling` $\rightarrow$ `Next Token`

上面展示的是一般采样原理，具体接口不一定允许同时调整这两个参数。按 DeepSeek 当前文档，`top_p`在非思考模式下固定为 1，传入值会被忽略；在思考模式下有效范围为`0.95~1.0`，低于 0.95 的值按 0.95 处理。因此，上面的`top_p=0.9`是原理算例。参数支持说明以[官方接口文档](https://api-docs.deepseek.com/api/create-chat-completion/)为准（核对日期：2026-10-01）。

#### 4.3 max_tokens

控制最多允许模型生成多少 Token。

这是输出长度的上限，不是要求模型一定生成这么多。如果达到上限，回答可能被截断；在 Chat Completions 返回中，可以查看`finish_reason`，其中`length`表示触及长度限制。不同接口的参数名称可能不同，使用时要查对应文档。

#### 4.4 Context Window

`Context Window`（上下文窗口）表示模型一次处理所能容纳的 Token 数量上限。对于这里的 DeepSeek 接口，输入与生成 Token 的总长度受这个上限约束：

$$
\text{Input Tokens}+\text{Output Tokens}\leq\text{Context Window}
$$

它表示容量，不是本次实际用量。输入包括系统要求、历史消息和本次问题等；输出包括模型本次生成的内容。模型还可能有独立的最大输出长度限制，所以并不是上下文剩余多少，就一定能输出多少。

费用按实际使用的 Token 计算，不会按整个上下文容量收费。控制输入仍然很重要，因为更长的输入通常意味着更多费用和处理时间。

### 5. Response

如果是普通返回，模型只会在生成完成后才返回整段`Response`，而使用`Streaming`，模型就会以小 chunk 形式不断返回`Response`。

在网页对话时，我们往往只看到模型返回的文本，但 API 的响应通常还会包含`metadata`（元数据），例如模型名称和用量统计。下面是简化的 Chat Completions 返回示例：

```json
{
  "id": "...",
  "model": "...",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "SFT is..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  }
}
```

其中`prompt_tokens`是输入用量，`completion_tokens`是生成用量，`total_tokens`是两者之和。在这个例子中，就是 $100+50=150$。

但总 Token 数不能直接代表费用，因为输入和输出的单价可能不同，输入命中缓存时还可能享有不同价格。可以先按下面的方式理解：

$$
\text{费用}=\text{输入 Token 数}\times\text{输入单价}+\text{输出 Token 数}\times\text{输出单价}
$$

这里的单价按每个 Token 计算；如果定价页给的是每百万 Token 的价格，要先将 Token 数除以一百万再乘对应价格。如果输入分为缓存命中和未命中，还要分别计算这两部分。具体价格以[官方定价页](https://api-docs.deepseek.com/quick_start/pricing/)为准。

## 多轮对话

在网页和 AI 聊天时，模型是有上下文记忆的，那使用`API`也会有吗，怎么实现的呢？

对于这里的 Chat Completions 调用，服务不会自动把上一次请求当成本次的上下文。简单来说，就是把之前的聊天记录，包括用户输入和模型回复，与本次问题一起打包发给模型。模型就能依据上下文回答。

沿用前面创建的`client`，可以这样完成两轮对话：

```python
messages = [
    {"role": "system", "content": "You are a concise AI tutor."},
    {"role": "user", "content": "Explain supervised fine-tuning."}
]

response = client.chat.completions.create(
    model="deepseek-flash",
    messages=messages,
    extra_body={"thinking": {"type": "disabled"}}
)
answer = response.choices[0].message.content
print(answer)

# 把第一轮模型回复和第二轮用户问题加入历史
messages.append({"role": "assistant", "content": answer})
messages.append({"role": "user", "content": "How is it different from pretraining?"})

response = client.chat.completions.create(
    model="deepseek-flash",
    messages=messages,
    extra_body={"thinking": {"type": "disabled"}}
)
print(response.choices[0].message.content)
```

第二次请求包含第一轮的问题、第一轮的回答，以及第二轮的问题，所以模型能够接着回答。随着对话越来越多，每次发送的历史 Token 通常也越多，这会增加用量，并可能增加费用与延迟；缓存命中可以降低部分输入费用，但历史仍占用上下文空间。

`context compression`（上下文压缩）可以把历史整理成更短的摘要；`RAG`（Retrieval-Augmented Generation，检索增强生成）可以按当前问题检索相关材料，减少一次性塞入全部资料的需要。两者都涉及取舍，压缩或检索没有保留下来的信息，模型就不能直接依据它回答。

## 批量处理

如果需要调用`API`进行批量处理，比如翻译 100 篇论文，至少要考虑`Retry`和`Checkpoint`。前者使得出现错误时能有限次重试，后者保证在中断时保持已完成的结果。

