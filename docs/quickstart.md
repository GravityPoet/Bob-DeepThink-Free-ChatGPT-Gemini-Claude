# 快速开始 / Quick start

## 中文

### 选择安装包

- **通用版**：常见 OpenAI 兼容网关、Google、Claude，以及 AWS API Key。原插件名称与标识符保持不变。
- **AWS IAM 专用版**：仅使用 Access Key ID / Secret Access Key / STS 时安装 `DeepThink-AWS-IAM.bobplugin`；安装后在 Bob 添加专用服务，区域与凭据在该服务里设置。普通服务不显示这些字段。
- 原有 IAM 配置需要在专用服务中单独设置；请保留旧服务，确认新服务可用后再调整。当前本机的 8 个原服务都未使用 IAM，升级前后已逐项核对配置。

1. 双击 `.bobplugin` 安装；普通用户选标准包，已使用 `io.github.gravitypoet.ai-vip-0-token-plan` 的旧用户选 legacy 包。
2. Bob → 偏好设置 → 服务 → 文本翻译，添加本插件。升级已有插件时会保留服务配置。
3. 填写接口地址、对应服务商 Key、模型与协议。模型名以服务商实际提供的为准，不存在的模型不能通过改协议解决。
4. 点击 **验证**：会向所选模型发送一条 `Hello` 翻译请求，可能产生少量 API 费用；不再用模型列表接口判断翻译可用。
5. 在 Bob 翻译浮窗输入文本并翻译。若有多个启用的服务，以本插件对应的卡片结果为准。

| 接入方式 | 接口地址示例 | 协议 | 凭据 |
| --- | --- | --- | --- |
| OpenAI / 兼容网关 | `https://api.example.com/v1` | Chat Completions 或 Responses | API Key |
| 完整端点 | `https://api.example.com/custom/responses?api-version=example` | 自动按端点识别 | API Key |
| Google Gemini 原生 | `https://generativelanguage.googleapis.com/v1beta` | Gemini Native | Google API Key |
| Google OpenAI 兼容 | `https://generativelanguage.googleapis.com/v1beta/openai` | Chat Completions | Google API Key |
| Anthropic Claude 原生 | `https://api.anthropic.com/v1/messages` | Anthropic Messages | Anthropic API Key |
| Bedrock OpenAI | `https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1` | 按 AWS 当前支持情况选择 Chat/Responses | Bedrock API Key 或 AWS IAM |
| Bedrock Claude | `https://bedrock-runtime.us-east-1.amazonaws.com` | AWS Converse | Bedrock API Key 或 AWS IAM |
| 本地兼容服务 | `http://127.0.0.1:18080/v1` | Chat Completions | 服务端要求的 Key |

完整端点包含 `/chat/completions`、`/responses`、`/messages`、`/models/<model>:generateContent` 或 `/model/<model>/converse`。插件使用相应请求格式，不会修改你保存的选择。根地址按“接口协议”补齐；代理路径、`/v2`、Google `/v1beta/openai` 和 query 会保留。URL 不允许内嵌用户名/密码、空主机或 fragment。

### 高级设置与异常恢复

- **流式输出**：OpenAI、Gemini 原生与 Claude 原生可用；AWS Converse 使用非流式。成功空流最多重试一次，可能产生第二次 API 调用。
- **思考强度**：默认“无”表示不传参数；仅 Chat Completions / Responses 映射相应字段。原生 Gemini / Claude 和 AWS Converse 不传。
- **最大输出 Token**：新服务默认 4096，范围 64–65536；现有值保持不变，实际需服务商与模型支持。
- **截断**：明确显示失败，避免把半篇译文当成功。提高 Token 上限、降低思考强度或缩短原文。
- **超时**：范围 10–300 秒；流式和回退共享预算。为 Bob 回调预留 5 秒，单次实际请求最多 295 秒；验证请求最多 30 秒。
- **取消**：取消后的迟到结果不会更新卡片，也不会自动重发。
- **401/403**：检查当前接口的凭据及模型访问权限。
- **404**：检查代理前缀、模型名和路径；完整端点会自动识别协议，避免请求体与端点不匹配。
- **429/5xx**：服务配额或上游异常，插件不会盲目重复收费请求。
- **只有思考、没有正文**：模型可能耗尽输出预算；调整 Token 或思考强度后重试。
- **字面思考标签**：原文中的 `<think>` / `<reasoning>` 会被保护并还原，不会当成模型的推理内容删除。上游未完整返回这些标记时会明确报错。
- **Markdown**：Bob 1.21+ 且开启 Markdown 渲染时显示标题、列表和代码；旧版本保留原文格式的纯文本。

AWS IAM 专用服务需成对填写 Access Key ID 与 Secret Access Key；临时凭据另填 Session Token，Region 需与目标端点一致。专用服务留空端点时按区域生成；模型填写 Bedrock 实际模型或推理配置 ID。通用服务的 AWS API Key 路线直接填写完整区域端点。Google 官方原生使用 `x-goog-api-key`，Gemini 网关保留 Bearer 兼容；Claude 原生使用 `x-api-key` 和 `anthropic-version: 2023-06-01`。

## English

The regular package has no IAM/STS credential fields. AWS API keys continue to use its standard API Key field. For IAM signing, install the optional `DeepThink-AWS-IAM.bobplugin` and add its dedicated service in Bob. Region and IAM credentials live there. Both plugins can coexist. Preserve an existing IAM service until the new dedicated service is configured and verified.

Install the standard `.bobplugin`, or the legacy package if your existing plugin uses the legacy identifier. Add the plugin in Bob's translation services, enter your endpoint, API key, model and protocol, then click **Validate**. Validation performs a small real translation and may incur API charges. Existing service settings are preserved during upgrades.

Complete endpoints select the matching request format automatically. Root endpoints follow the selected protocol. OpenAI Chat/Responses, native Gemini, native Claude Messages and AWS Converse are supported. Native Gemini and Claude stream; Converse is buffered. Existing token limits stay unchanged; new services default to 4096. Explicit truncation, cancellation and API failures are reported instead of being treated as success. Empty successful streams may retry once within the original deadline.

Use the table above for endpoint examples. Model access and charges depend on your provider. The plugin is free and does not provide API credits or accounts. See [architecture and verification](architecture.md) for development commands and release boundaries.
