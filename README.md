# Bob-DeepThink-Free-ChatGPT-Gemini-Claude

Bob 多协议 AI 翻译插件。使用同一套配置接入 OpenAI 兼容网关、Gemini、Claude 与 AWS Bedrock，支持流式输出与 Markdown。

插件免费；API 账号、模型权限、配额及费用由所选服务商提供。名称中的 Free 不代表所有模型或接口免费。

## 0.2.5 CPA 流式速度优化

- 针对 `https://api.chordvox.com/cliproxy` 使用精简但等价的翻译提示：语言方向和格式要求集中在 system prompt，用户消息只保留原文，减少 CPA 网关首字节等待。
- 保留 `stream=true`、Markdown/代码保护、取消、错误处理和一次空流回退；其他供应商继续使用原有提示路径。
- 同一 CPA Endpoint、模型和有效凭据实测三轮首字节约 **2.48–3.72 秒**；旧提示路径约 **7 秒上下**，具体速度仍受上游排队和模型负载影响。

## 0.2.4 可调翻译温度

- 在服务设置中新增“翻译温度”：留空跟随模型，支持时可填写小数或 `0`；标准版、legacy 版与 AWS IAM 版均提供。
- 按六种协议发送原生温度字段，流式输出、空流回退与“验证”使用相同设置。
- 按模型、接口版本及思考状态检查兼容性。已知不支持、已弃用或越界时在请求前提示修正，不静默忽略温度或关闭思考。[兼容规则](docs/protocols.md#翻译温度)

## 0.2.3 模型选择、协议维护与显示修复

- **单插件模型目录**：常用模型在 Bob 原生下拉中选择；在输入翻译中输入 `/models` 查询服务商目录，输入 `/models 关键词` 筛选。无需另外安装 App 或授权读取 Bob 配置。
- **按模型映射思考强度**：补齐 `minimal`、`xhigh`、`max` 和显式关闭，区分 GPT、Claude、Gemini 与 SiliconFlow 的支持范围及原生参数，提前拦截已知无效组合。
- **协议更新**：加入稳定版 Gemini Interactions，保持无状态请求；Claude Messages 更新到 `2026-10-21`，旧 Bedrock Runtime 维持所需版本；AWS Converse 加入二进制流式解码和完整性检查。

- 修正 `onStream` 的 `{ result: ... }` 回调包装，使 Bob 在请求完成前持续显示译文。
- 新增按 Bob 回调结构读取中途结果的回归测试，避免仅验证网络分包就误判界面流式通过。
- Markdown 输入改用 Bob 的 `originalText`，保留预处理可能移除的标题、加粗、斜体与嵌套缩进；普通文本继续使用 Bob 的预处理结果。
- 行内代码与围栏代码块在本地保护并原样还原，保留标识符、代码内容、缩进和字面标签，减少上游改写代码。
- 图标使用用户提供的渐变闪电设计，放大主体、提高小尺寸清晰度，保留白色底板与原图标标识符。
- 保留原名称、供应商、模型及服务配置。

## 0.2.2 流式与排版修复

- 只把响应开头的思考包装作为推理内容，保留代码、正文和原文中的字面标签。
- 对原文中的 `<think>` / `<reasoning>` 标签进行保护并在本地还原；上游未完整返回时明确报错。
- 半截思考标签和保护标记不闪进正文，流式不提交空内容帧。
- 新增标题、列表、表格、代码与标签边界回归；保留原名称和服务设置。

## 0.2.1 设置精简

- 保留原插件名称与标识符；通用设置从 14 项减为 10 项，供应商、地址、密钥和模型优先。
- 通用版移出 AWS IAM 凭据和区域字段；AWS API Key 仍使用普通 API Key 输入框。
- IAM / STS 用户可按需安装 [AWS IAM 专用包](DeepThink-AWS-IAM.bobplugin)，在 Bob 的添加服务菜单选择专用插件。两种插件可以并存。
- AWS 签名模块仅在实际使用 SigV4 时加载。

> Bob 公开的设置 schema 只有输入框和下拉菜单，没有条件显示或折叠组件，见 [官方说明](https://bobtranslate.com/plugin/quickstart/info.html)。因此采用独立 IAM 设置入口。已有 IAM 用户请先保留原插件并配置专用服务；升级通用版不会自动迁移 IAM 凭据。

## 0.2.0 升级

- **译文完整性**：修复重复字符被删、完整快照重复拼接、尾帧丢失与 Unicode 分包问题。
- **生命周期**：取消后不重发、完成仅回调一次、每个请求独立状态；空流回退共享超时预算。
- **协议与鉴权**：完整端点自动选择请求格式；保留代理路径与 query；修复 Gemini 官方 API Key 头和 AWS 签名载荷序列化。
- **原生接入**：支持 Claude Messages 和 Gemini Native 流式；保留 OpenAI Chat/Responses 与 AWS Converse。
- **明确失败**：截断、拒绝、服务端错误与 Responses/Claude 流提前结束不再被当作成功。
- **显示与维护**：保留 Markdown/空行/缩进；拆分运行模块、增加无依赖回归测试、确定性打包与 CI。

## 安装与配置

1. 下载仓库中的 [标准安装包](Bob-DeepThink-Free-ChatGPT-Gemini-Claude.bobplugin)，双击安装到 Bob。
2. 已使用旧 identifier `io.github.gravitypoet.ai-vip-0-token-plan` 的用户选 [legacy 安装包](Bob-DeepThink-Free-ChatGPT-Gemini-Claude-legacy-id.bobplugin)。两者功能相同，升级请选择与原来一致的包。
3. Bob → 偏好设置 → 服务 → 文本翻译，选择本插件，填写接口地址、API Key、模型和协议。
4. 点击 **验证**，检查所选模型的真实翻译请求；之后用翻译浮窗验证实际结果。

### 获取和选择模型

新用户只需安装一个 `.bobplugin`。常用模型直接在 Bob 设置中的“模型”下拉选择。

更多模型可在 Bob 的输入翻译浮窗中输入 `/models` 查询，或输入 `/models deepseek`、`/models gpt` 等进行筛选。目录直接由本插件请求当前供应商，显示模型 ID 和已核实的思考档位，不调用生成接口、不读取其他服务的配置。

复制需要的模型 ID，在本服务的“模型”选择“自定义模型”，粘贴到“自定义模型”并保存。目录可见不等于账号已有调用权限。供应商未开放目录时会明确报错，已有模型设置保持原值。

**宿主限制**：Bob 第三方设置当前只提供固定下拉和输入框，实时目录不能直接变成设置中的动态下拉，也不能自动回填 `$option`。因此这里提供原生预设选择与实时目录查询，不声称已实现实时列表一键回填。[档位、协议核查与限制](docs/protocols.md)

| 服务 | 协议 |
| --- | --- |
| OpenAI / CPA / Sub2API / 兼容网关 | Chat Completions、Responses |
| Google Gemini | Gemini Interactions、generateContent、Google OpenAI 兼容 |
| Anthropic Claude | Messages、经兼容网关的 Chat/Responses |
| AWS Bedrock | Converse / ConverseStream、OpenAI 兼容、Mantle Claude Messages；API Key 或 IAM SigV4 |

[完整配置与排错](docs/quickstart.md) · [架构、验证与发布说明](docs/architecture.md) · [已发布版本](https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude/releases)

**更新状态**：仓库源码与直装包为 0.2.4；标准版与 legacy 版自动更新源指向 GitHub Release `v0.2.4`。AWS IAM 专用包需要手动安装更新。

## 开发

Node.js 20+、Python 3.9+；无需 `npm install`。

```bash
npm run check
npm test
npm run build
npm run verify
```

`plugin/main.js` 只保留 Bob 入口；`plugin/lib/` 按配置、协议、流式、签名与结果分工。构建时递归打包全部模块，`--check` 确保安装包对应当前源码。运行环境仍是 Bob JavaScriptCore，不依赖 Node 或浏览器 API。

## English

Version 0.2.5 adds a compact CPA prompt path for faster first visible output. Version 0.2.4 added an optional translation temperature field to all three packages. Leave it blank to use the upstream default, or enter a number (including zero) when supported. Native fields are mapped across all six protocols, including streaming, fallback and validation. Known unsupported, deprecated or conflicting combinations return an actionable error before inference; the plugin does not silently ignore the selection, clamp it or disable reasoning. See [compatibility rules](docs/protocols.md#翻译温度).

Version 0.2.3 ships as a single `.bobplugin`, with no companion app. Choose a preset in Bob's native model menu, or enter `/models` in the input translation window to fetch the current provider's catalog. Add a keyword, such as `/models gpt`, to filter it. Copy an ID into the existing custom-model setting. The directory uses only the current service's credentials and performs model-list GET requests. Bob's public plugin settings API cannot populate a live dropdown or write back options; one-click live selection is not claimed. Catalog visibility does not guarantee inference access.

Reasoning now includes model-specific minimal, xhigh, max and explicit off mappings. Protocol maintenance adds stable Gemini Interactions, the Claude `2026-10-21` API version with classic Bedrock compatibility, and binary AWS ConverseStream support. See [verified protocol rules and limitations](docs/protocols.md).

The `{ result: ... }` streaming callback envelope is fixed. Markdown inputs use Bob's `originalText` to retain headings, emphasis and indentation; ordinary prose keeps Bob's preprocessing. Inline code and fenced blocks are protected and restored locally. The supplied gradient lightning design is enlarged on an opaque white backplate. The original plugin name and existing service settings are preserved during installation.

Version 0.2.2 restricts legacy thinking-wrapper handling to response prefixes, preserves literal tags inside source documents and code, protects source `<think>` / `<reasoning>` markup across upstream APIs, and restores it locally. Partial wrappers and protection markers do not appear in streaming output, and empty frames are suppressed. Missing protected markup is reported as an API error. The original plugin name and service settings are preserved.

Version 0.2.1 keeps the original plugin name and identity, reduces regular settings from 14 to 10, and moves IAM/STS credentials into an optional AWS IAM plugin. AWS API keys still work in the regular plugin. Install the IAM package only when needed, then add its service in Bob. Existing IAM users should retain their old setup until the dedicated service is configured; credentials are not automatically migrated. Bob's public settings schema has no conditional visibility or collapsible sections. AWS signing code loads only for SigV4 requests.

A free, multi-protocol AI translation plugin for Bob. Connect OpenAI-compatible gateways, native Gemini, native Claude Messages and AWS Bedrock. API accounts, access, quotas and charges are supplied by your provider; the plugin does not include free API credits.

Version 0.2.0 fixes missing/repeated streaming characters, incomplete frames, Unicode boundaries, duplicate callbacks, cancellation retries, endpoint/body mismatches and AWS payload serialization. It adds native Gemini/Claude streaming, Markdown output, explicit truncation and interruption errors, modular runtime code, regression tests and reproducible packages.

Download the standard archive above, or the legacy archive matching your installed identifier. Upgrade without removing your existing services. Configure your endpoint, key, protocol and model, then use **Validate** to perform a small real translation. Validation may incur API charges. See the [quick start](docs/quickstart.md) and [architecture](docs/architecture.md).

Source and direct-install archives are 0.2.5. Automatic update feeds point to the v0.2.5 release. Build and CI do not publish releases.

## 许可 / License

[MIT](LICENSE)
