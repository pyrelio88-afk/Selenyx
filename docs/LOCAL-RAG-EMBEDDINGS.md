# 本地 RAG 与 Embedding 配置

Selenyx 默认不下载模型：采用确定性的 `hash-v2` 特征向量与词法分数组合检索。它能离线运行，适合作为首次启动和模型服务不可用时的保底，但不等同于神经网络语义检索。

## 推荐的本机增强方式

需要更好的中英文学术语义检索时，可自行安装 Ollama 并拉取模型：

```powershell
ollama pull embeddinggemma
```

然后在私有的 `backend/.env.local`（安装版为 `~/.selenyx/.env.local`）中加入：

```dotenv
SELENYX_EMBED_PROVIDER=ollama
SELENYX_EMBED_BASE_URL=http://127.0.0.1:11434
SELENYX_EMBED_MODEL=embeddinggemma
```

普通 Selenyx 构建**不内置 Ollama 或模型**；可选的大体积 Windows 构建可以附带经校验的 Ollama 上游安装器，但仍不会静默安装，也不包含 EmbeddingGemma 模型。只有完成安装、执行拉取并让 Ollama 服务运行后，dense 检索才会生效。健康接口的 `embedding.configured` 只表示配置完整，不表示模型已经下载或服务已经连通。请求失败时，Selenyx 会回退到本地 hash，不会阻塞文献检索。

官方资料显示，EmbeddingGemma 面向设备端使用，支持 100 多种语言、2K token 上下文；Ollama 当前模型包页面列出的常规版本约 622 MB，且要求 Ollama 0.11.10 或更高版本。Selenyx 使用 Ollama 原生批量 `/api/embed`，不需要引入 PyTorch、Transformers 或 SentenceTransformers。

## 其他模型的取舍

| 模型 | 适用点 | 当前接入方式与注意点 |
|---|---|---|
| EmbeddingGemma | 设备端、中英混合、安装门槛较低 | 推荐通过 Ollama；默认不加前缀 |
| `intfloat/multilingual-e5-small` | 384 维、94 种语言，体积/质量折中 | 需自备 OpenAI 兼容服务；设置查询前缀 `query: `、文档前缀 `passage: ` |
| `BAAI/bge-small-zh-v1.5` | 中文短文本，512 维 | 可为短查询设置 `为这个句子生成表示以用于检索相关文章：`，文档不加前缀 |
| `BAAI/bge-m3` | 100+ 语言、最长 8192 token，支持 dense/sparse/multi-vector | 能力强但运行依赖和资源占用更大；本次未把 FlagEmbedding/PyTorch 塞进桌面包 |

OpenAI 兼容服务可配置为：

```dotenv
SELENYX_EMBED_PROVIDER=openai-compatible
SELENYX_EMBED_BASE_URL=http://127.0.0.1:11434/v1
SELENYX_EMBED_MODEL=embeddinggemma
SELENYX_EMBED_QUERY_PREFIX=
SELENYX_EMBED_DOCUMENT_PREFIX=
```

切换模型、服务地址或协议后，旧 dense 向量不会与新查询向量混算。Selenyx 会用 hash 临时检索旧块；重新保存/重建索引后才会全部使用新模型。这个约束遵循 Ollama 关于“索引与查询必须使用同一 embedding 模型”的要求。

## 一手资料

- [Ollama Embeddings 指南](https://docs.ollama.com/capabilities/embeddings)
- [Ollama `/api/embed` 接口](https://docs.ollama.com/api/embed)
- [Ollama OpenAI 兼容接口](https://docs.ollama.com/api/openai-compatibility)
- [Google EmbeddingGemma 概览](https://ai.google.dev/gemma/docs/embeddinggemma)
- [Ollama EmbeddingGemma 模型包](https://ollama.com/library/embeddinggemma)
- [BAAI BGE-M3 模型卡](https://huggingface.co/BAAI/bge-m3)
- [BAAI bge-small-zh-v1.5 模型卡](https://huggingface.co/BAAI/bge-small-zh-v1.5)
- [multilingual-e5-small 模型卡](https://huggingface.co/intfloat/multilingual-e5-small)
