# AI-VIP-0-token-plan—GravityPoet开发

> Bob 安装显示名：`AI-VIP-0-token-plan—GravityPoet开发`

[![GitHub release](https://img.shields.io/github/v/release/GravityPoet/AI-VIP-0-token-plan?style=flat-square)](https://github.com/GravityPoet/AI-VIP-0-token-plan/releases)
[![Platform](https://img.shields.io/badge/platform-Bob%20Plugin-black?style=flat-square)](https://bobtranslate.com/)
[![Gateway](https://img.shields.io/badge/backend-Sub2API-blue?style=flat-square)](https://github.com/Wei-Shaw/sub2api)

> Bob 文本翻译插件（Translate 类）：支持 OpenAI / Gemini / AWS Bedrock（Mantle）。

## 核心特性

- 通道可自定义：`OpenAI` / `Gemini` / `AWS Bedrock (Mantle)` / `自定义(兼容 OpenAI API)`
- 接口协议可切换：`Responses API` / `Chat Completions`
- 单模型入口：同一处选择模型，调用逻辑更清晰
- 兼容 Sub2API：自动把 Base URL 标准化到 `/v1`
- 支持 Bob 流式输出：接入 `query.onStream` + `$http.streamRequest`
- 支持思考强度：`low / medium / high`（OpenAI 通道映射 `reasoning.effort`）
- 错误可读：401/502/上游异常会返回明确提示
- 兼容性策略：默认不发送 `temperature` 参数，避免部分 OpenAI 上游返回 400

## 仓库结构

- `plugin/info.json`：Bob 插件元信息
- `plugin/main.js`：插件实现源码
- `AI-VIP-0-token-plan.bobplugin`：可直接双击安装包
- `appcast.json`：Bob 插件更新源
- `docs/quickstart.md`：快速配置

## 安装

1. 到 [Releases](https://github.com/GravityPoet/AI-VIP-0-token-plan/releases) 下载 `AI-VIP-0-token-plan.bobplugin`
2. 双击安装到 Bob
3. 在 Bob 插件配置里填写：
   - `Sub2API Base URL`：例如 `http://127.0.0.1:18080` 或 `http://127.0.0.1:18081`
   - `Sub2API Key`：Sub2API 后台创建的 `sk-...`
   - `翻译通道`：OpenAI / Gemini / 自定义(兼容 OpenAI API)
   - `接口协议`：`Responses API` 或 `Chat Completions`
   - `模型`：可选预设或自定义模型名

### AWS Bedrock（Mantle）快速配置

1. `翻译通道` 选择 `AWS Bedrock (Mantle)`  
2. `Bedrock Region` 填你的区域（默认 `us-east-1`）  
3. `API Key` 填 Amazon Bedrock API key（Bearer）  
4. `Base URL / Endpoint` 可留默认（插件会按 region 自动生成为 `https://bedrock-mantle.<region>.api.aws/v1`），也可手填 `https://bedrock-runtime.<region>.amazonaws.com/openai/v1`  
5. `接口协议`：若用 `bedrock-runtime.../openai/v1`，优先选 `Chat Completions`；若用 `bedrock-mantle.../v1` 可选 `Responses API` 或 `Chat Completions`  

## 版本更新

Bob 更新地址：

`https://github.com/GravityPoet/AI-VIP-0-token-plan/raw/main/appcast.json`

## 许可

MIT License（见 `LICENSE`）。
