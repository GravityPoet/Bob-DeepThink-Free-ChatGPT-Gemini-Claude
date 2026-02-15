# AI-VIP-0-token-plan

[![GitHub release](https://img.shields.io/github/v/release/GravityPoet/AI-VIP-0-token-plan?style=flat-square)](https://github.com/GravityPoet/AI-VIP-0-token-plan/releases)
[![Platform](https://img.shields.io/badge/platform-Bob%20Plugin-black?style=flat-square)](https://bobtranslate.com/)
[![Gateway](https://img.shields.io/badge/backend-Sub2API-blue?style=flat-square)](https://github.com/Wei-Shaw/sub2api)

> Bob 文本翻译插件（Translate 类）：通过 Sub2API 统一调用 OpenAI / Gemini。

## 核心特性

- 单开关通道：`OpenAI` / `Gemini`（避免双模型混填歧义）
- 单模型入口：同一处选择模型，调用逻辑更清晰
- 兼容 Sub2API：自动把 Base URL 标准化到 `/v1`
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
   - `翻译通道`：OpenAI 或 Gemini
   - `模型`：与通道匹配的模型（不匹配会直接报错）

## 版本更新

Bob 更新地址：

`https://github.com/GravityPoet/AI-VIP-0-token-plan/raw/main/appcast.json`

## 许可

MIT License（见 `LICENSE`）。
