# 快速开始

## 1) 前置条件

- Bob 已安装
- Sub2API 可访问（`/health` 为 200）
- 你有可用的 Sub2API Key（`sk-...`）

## 2) 基本配置

- **Sub2API Base URL**：
  - 本机直连：`http://127.0.0.1:18080`
  - SSH 隧道：`http://127.0.0.1:18081`
- **Sub2API Key**：填 Sub2API 的 key（不是 OpenAI 官方 key）
- **翻译通道**：
  - `OpenAI`：模型建议 `gpt-5.2`
  - `Gemini`：模型建议 `gemini-3-flash-preview`

## 3) 常见问题

- 报错 `Invalid API key`：key 错误或已失效
- 报错 `Upstream request failed`：Sub2API 上游账号不可用/容量不足
- 报错 `通道与模型不匹配`：比如 OpenAI 通道选了 Gemini 模型
