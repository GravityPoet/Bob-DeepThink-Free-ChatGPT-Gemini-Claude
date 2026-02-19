# Bob-DeepThink-Free-ChatGPT-Gemini-Claude

> Bob 安装显示名：`Bob-DeepThink-Free-ChatGPT-Gemini-Claude`

[![GitHub release](https://img.shields.io/github/v/release/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude?style=flat-square)](https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude/releases)
[![Platform](https://img.shields.io/badge/platform-Bob%20Plugin-black?style=flat-square)](https://bobtranslate.com/)
[![Gateway](https://img.shields.io/badge/backend-OpenAI%20Compatible-blue?style=flat-square)](https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude)

> 一个面向 Bob 的高兼容翻译插件：OpenAI / Gemini / AWS Bedrock / 自定义网关，支持 OpenAI 兼容协议与 Gemini Native(v1beta generateContent)。

## 核心特性

- 通道可自定义：`OpenAI` / `Gemini` / `AWS Bedrock (Mantle)` / `自定义(兼容 OpenAI API)`
- 接口协议可切换：`Responses API` / `Chat Completions` / `Gemini Native (/v1beta ...:generateContent)`
- 单模型入口：同一处选择模型，支持预设与自定义模型名
- Base URL 智能处理：OpenAI 兼容模式自动补齐到 `/v1`；Gemini Native 自动补齐到 `/v1beta`；若已填完整端点（如 `/chat/completions`、`/responses`、`/models/<model>:generateContent`）则直连不再二次拼接
- 支持 Bob 流式输出：接入 `query.onStream` + `$http.streamRequest`
- 流式兜底回退：若上游流式没有正文，插件会自动回退一次非流式请求，降低 `流式响应里没有可用翻译结果` 的概率
- 支持思考强度：`none / low / medium / high`（默认 `none` 不传该参数；`Responses` 协议映射 `reasoning.effort`，`Chat Completions` 协议映射 `reasoning_effort`）
- 思考链折叠：自动识别并折叠常见思考字段（`<reasoning>/<think>`、`reasoning_content`、`thinking`、Gemini thought parts、OpenAI 兼容 `reasoning_*` 增量等）
- 错误可读：401/502/上游异常会返回明确提示
- 兼容性策略：默认不发送 `temperature` 参数，避免部分 OpenAI 上游返回 400

## 仓库结构

- `plugin/info.json`：Bob 插件元信息
- `plugin/main.js`：插件实现源码
- `Bob-DeepThink-Free-ChatGPT-Gemini-Claude.bobplugin`：可直接双击安装包
- `appcast.json`：Bob 插件更新源
- `docs/quickstart.md`：快速配置

## 安装

1. 到 [Releases](https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude/releases) 下载 `Bob-DeepThink-Free-ChatGPT-Gemini-Claude.bobplugin`
2. 双击安装到 Bob
3. 在 Bob 插件配置里填写：
   - `Base URL / Endpoint`：你的网关地址（OpenAI 兼容会标准化到 `/v1`；Gemini Native 会标准化到 `/v1beta`；完整端点将原样直连）
   - `API Key`：对应上游的 Bearer Key
   - `翻译通道`：OpenAI / Gemini / AWS Bedrock / 自定义
   - `接口协议`：`Responses API` / `Chat Completions` / `Gemini Native`
   - `模型`：可选预设或自定义模型名
   - `思考强度`：建议默认 `无(不设置)`，仅在模型支持时再开启低/中/高

### AWS Bedrock（Mantle）快速配置

1. `翻译通道` 选择 `AWS Bedrock (Mantle)`  
2. `Bedrock Region` 填你的区域（默认 `us-east-1`）  
3. `API Key` 填 Amazon Bedrock API key（Bearer）  
4. `Base URL / Endpoint` 可留默认（插件会按 region 自动生成为 `https://bedrock-mantle.<region>.api.aws/v1`），也可手填 `https://bedrock-runtime.<region>.amazonaws.com/openai/v1`  
5. `接口协议`：若用 `bedrock-runtime.../openai/v1`，优先选 `Chat Completions`；若用 `bedrock-mantle.../v1` 可选 `Responses API` 或 `Chat Completions`  

> 说明：`Bedrock Region` 仅 AWS 通道使用；Bob 官方配置 schema 当前不支持“按通道动态隐藏某个配置项”，所以该项会一直显示，但在非 AWS 通道会被插件忽略。

### Opencode / Kilo 直连示例（避免 404）

1. Opencode：`Base URL / Endpoint` 填 `https://opencode.ai/zen/v1/chat/completions`，协议选 `Chat Completions`。  
2. Kilo：`Base URL / Endpoint` 填 `https://api.kilo.ai/api/gateway/chat/completions`，协议选 `Chat Completions`。  
3. 以上两种都属于“完整端点直连”，插件不会再自动补 `/v1` 或追加 `/chat/completions`。

### Gemini Native (v1beta generateContent) 示例

1. `翻译通道` 可选 `Gemini` 或 `自定义`。  
2. `接口协议` 选择 `Gemini Native (/v1beta ...:generateContent)`。  
3. `Base URL / Endpoint` 可填：
   - 网关根地址：`http://127.0.0.1:18080`（插件自动补成 `/v1beta`）
   - 或完整端点：`http://127.0.0.1:18080/v1beta/models/gemini-3-flash-preview:generateContent`
4. `模型` 选择 `gemini-3-flash-preview`（或自定义模型名）。  
5. 说明：Gemini Native 模式当前默认走非流式 `generateContent`；`思考强度`参数不会下发到该协议。

## 版本更新

Bob 更新地址：

`https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude/raw/main/appcast.json`

## 许可

MIT License（见 `LICENSE`）。
