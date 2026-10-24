# 协议、模型列表与思考档位 / Protocols and reasoning

核查日期：2026-10-24。本文记录本版本采用的字段与限制；服务商可继续更新模型。预设不会自动替换已有模型。模型目录来自所选服务，调用可用性仍取决于账号权限。

## 协议

| 协议 | 当前实现 |
| --- | --- |
| OpenAI Chat / Responses | 分别使用 `reasoning_effort` / `reasoning.effort`；Responses 使用 `store:false` |
| Gemini Interactions | 稳定 `/v1/interactions`，`input`、`generation_config`、`store:false`；解析 step 事件、思考摘要与完成状态 |
| Gemini generateContent | 保留兼容路径；`generationConfig.thinkingConfig`，流式使用 `streamGenerateContent?alt=sse` |
| Claude Messages | `anthropic-version:2026-10-21`；不发送已移除的采样参数；忽略签名，分离思考摘要与正文 |
| AWS ConverseStream | `/converse-stream`，请求不加 `stream:true`；解析 Amazon EventStream 二进制帧并校验 CRC，要求 `messageStop` |
| AWS Mantle Claude | `/anthropic/v1/messages`，SSE；IAM 签名服务名 `bedrock-mantle`；API Key 使用 `x-api-key` |

Claude 新版 API 在 2026-10-21 发布；经典 Bedrock 4.6 及更旧模型继续使用原有版本。参见 [迁移说明](https://platform.claude.com/docs/en/api/migration-2026-10-21)、[版本历史](https://platform.claude.com/docs/en/api/versioning)。Gemini 的 [Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview) 与 [generateContent](https://ai.google.dev/gemini-api/docs/generate-content/thinking) 均保留，切换不会自动迁移现有服务。

AWS 依据 [ConverseStream API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html)、[EventStream 规范](https://smithy.io/2.0/aws/amazon-eventstream.html) 与 [Claude Bedrock 接入](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)。HTTP 错误、校验失败、截断及未收到终止事件均不能作为成功译文。

## 档位不是全模型通用枚举

| 模型 / 服务 | 本版本显示的显式档位 |
| --- | --- |
| GPT-6.1 Sol / GPT-6 Astra | low / medium / high / xhigh / max |
| GPT-5.2 / 5.4 / 5.5 | off / low / medium / high / xhigh |
| GPT-5 原始系列 | minimal / low / medium / high |
| Claude 5 系列、Opus 4.7 / 4.8 | low / medium / high / xhigh / max；关闭规则因模型而异 |
| Claude Opus / Sonnet 4.6 | off / low / medium / high / max，无 xhigh |
| 旧 Claude 思考模型 | low / medium / high 对应手动预算，预算必须小于输出上限 |
| Gemini 4 Argon / 3.8 Flash / 3.1 Pro | low / medium / high，无 xhigh / max |
| Gemini 3 Pro | low / high |
| Gemini 3.6 Flash、部分 Flash Lite、3 Flash | minimal / low / medium / high |
| Gemini 2.5 | 原生 generateContent 使用预算；Interactions 使用 low / medium / high |
| SiliconFlow DeepSeek V3.2 / Qwen3 | `enable_thinking` 和独立 `thinking_budget`；可关闭 |
| SiliconFlow DeepSeek V4 / GLM 5.2 | high / max；兼容别名按服务商规则映射 |

各模型另有“跟随模型”。旧设置 `none` 继续表示省略参数，不会静默变成关闭；Gemini 4 原生接口要求 thinking level 时提供其 medium 默认值。不能关闭的模型不显示 off。未知兼容模型保留显式透传能力并标明由网关决定，不声称已核实支持全部档位。

AWS Converse 的原生思考映射当前覆盖 Claude；其他模型只显示“跟随模型”，避免提供没有请求字段映射的假档位。需要显式 effort 的其他 Bedrock 模型可使用其支持的 OpenAI 兼容协议。本文不宣称已覆盖所有服务商的私有扩展。

依据：[OpenAI reasoning](https://developers.openai.com/api/docs/guides/reasoning)、[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)、[GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5)、[Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort)、[Claude thinking](https://platform.claude.com/docs/en/build-with-claude/thinking)、[Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking)、[SiliconFlow Chat 参数](https://docs.siliconflow.cn/docs/api/chat-completions-post)。

## 插件内的模型目录

Bob 第三方表单只有静态输入和菜单，没有插件可调用的动态模型按钮，见 [Bob schema](https://bobtranslate.com/plugin/quickstart/info.html)；[$option](https://bobtranslate.com/plugin/api/option.html) 只提供设置读取。插件内的 `/models` 命令直接请求当前供应商并在 Bob 浮窗显示目录，支持关键词筛选和已知档位提示。只安装 `.bobplugin` 即可，不需要伴随 App、本地服务或配置文件访问授权。实时结果不能自动回填设置，需复制 ID 到原生自定义模型字段。

- OpenAI / 兼容网关：[GET /models](https://developers.openai.com/api/reference/resources/models/methods/list)。
- Claude：[Models API](https://platform.claude.com/docs/en/api/models/list)，自动分页；服务端能力元数据进一步收窄已核实档位。
- Gemini：[models.list](https://ai.google.dev/api/models)，自动分页，过滤仅供 embedding 的模型。
- SiliconFlow：[List Models](https://docs.siliconflow.cn/docs/api/models-get)，使用官方 `sub_type=chat` 过滤，保留可对话模型，避免混入语音、图片与向量模型。
- AWS Mantle：OpenAI `/models`。AWS Runtime：[ListFoundationModels](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListFoundationModels.html) 加 [ListInferenceProfiles](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListInferenceProfiles.html)，需 IAM 权限；[AWS 端点差异](https://docs.aws.amazon.com/bedrock/latest/userguide/models-get-info.html)。Runtime API Key 不会被发送到猜测的模型列表地址。

请求保持所配代理的路径和 query，不采用服务端提供的任意下一页 URL，最多 30 页 / 10,000 个模型，全部分页共享不超过 60 秒的预算。窗口展示前 200 个匹配项并提示继续筛选。取消后不再请求下一页；目录失败不重发、不修改已保存设置。HTTP 只由 Bob 的原生网络接口执行，目录不调用生成接口，也不保存模型选择或凭据副本。

## English

Verified on 2026-10-24. Reasoning is model-specific: GPT-6 supports max; GPT-5.5 has xhigh without max; Claude 4.6 has max without xhigh; Gemini has neither. Older thinking models use token budgets. Existing `none` settings keep their omit/default meaning; explicit off is separate. Unsupported known combinations fail before an inference request.

The plugin's `/models` command fetches provider catalogs and filters them inside Bob, without a companion application. Copy the desired ID into the native custom-model field; Bob's public API does not provide a live menu or option writeback. Queries never change saved settings. Pagination shares one deadline, is bounded, and stops on cancellation. Catalog visibility does not guarantee inference access. AWS Runtime discovery needs IAM list permissions; its API keys have no OpenAI model-list endpoint. The linked references document the adopted API shapes and restrictions.
