# Bob-DeepThink-Free-ChatGPT-Gemini-Claude

Bob 多协议 AI 翻译插件。使用同一套配置接入 OpenAI 兼容网关、Gemini、Claude 与 AWS Bedrock，支持流式输出与 Markdown。

插件免费；API 账号、模型权限、配额及费用由所选服务商提供。名称中的 Free 不代表所有模型或接口免费。

## 0.2.3 修复 Bob 流式显示

- 修正 `onStream` 的 `{ result: ... }` 回调包装，使 Bob 在请求完成前持续显示译文。
- 新增按 Bob 回调结构读取中途结果的回归测试，避免仅验证网络分包就误判界面流式通过。
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

| 服务 | 协议 |
| --- | --- |
| OpenAI / CPA / Sub2API / 兼容网关 | Chat Completions、Responses |
| Google Gemini | Gemini Native、Google OpenAI 兼容 |
| Anthropic Claude | Messages、经兼容网关的 Chat/Responses |
| AWS Bedrock | AWS Converse、AWS 支持的 OpenAI 协议；API Key 或 IAM SigV4 |

[完整配置与排错](docs/quickstart.md) · [架构、验证与发布说明](docs/architecture.md) · [已发布版本](https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude/releases)

**更新状态**：仓库源码与直装包为 0.2.3；自动更新源仍指向已发布的 v0.1.24。正式 Release 完成前不会把不存在的下载地址写入更新源。

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

Version 0.2.3 fixes the `{ result: ... }` envelope passed to Bob's `onStream` callback so intermediate translations can appear before the HTTP request completes. A regression test consumes the same callback structure as Bob. The original name and service configuration are preserved.

Version 0.2.2 restricts legacy thinking-wrapper handling to response prefixes, preserves literal tags inside source documents and code, protects source `<think>` / `<reasoning>` markup across upstream APIs, and restores it locally. Partial wrappers and protection markers do not appear in streaming output, and empty frames are suppressed. Missing protected markup is reported as an API error. The original plugin name and service settings are preserved.

Version 0.2.1 keeps the original plugin name and identity, reduces regular settings from 14 to 10, and moves IAM/STS credentials into an optional AWS IAM plugin. AWS API keys still work in the regular plugin. Install the IAM package only when needed, then add its service in Bob. Existing IAM users should retain their old setup until the dedicated service is configured; credentials are not automatically migrated. Bob's public settings schema has no conditional visibility or collapsible sections. AWS signing code loads only for SigV4 requests.

A free, multi-protocol AI translation plugin for Bob. Connect OpenAI-compatible gateways, native Gemini, native Claude Messages and AWS Bedrock. API accounts, access, quotas and charges are supplied by your provider; the plugin does not include free API credits.

Version 0.2.0 fixes missing/repeated streaming characters, incomplete frames, Unicode boundaries, duplicate callbacks, cancellation retries, endpoint/body mismatches and AWS payload serialization. It adds native Gemini/Claude streaming, Markdown output, explicit truncation and interruption errors, modular runtime code, regression tests and reproducible packages.

Download the standard archive above, or the legacy archive matching your installed identifier. Upgrade without removing your existing services. Configure your endpoint, key, protocol and model, then use **Validate** to perform a small real translation. Validation may incur API charges. See the [quick start](docs/quickstart.md) and [architecture](docs/architecture.md).

Source and direct-install archives are 0.2.3. Automatic update feeds remain on the published v0.1.24 release until a new release is completed. Build and CI do not publish releases.

## 许可 / License

[MIT](LICENSE)
