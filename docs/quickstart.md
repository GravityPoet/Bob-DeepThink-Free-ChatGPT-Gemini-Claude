# 快速开始

## 1) 前置条件

- Bob 已安装
- 你有可用的 API Key（Sub2API 或 AWS Bedrock）

## 2) 基本配置

- **Base URL / Endpoint**：
  - Sub2API 本机直连：`http://127.0.0.1:18080`
  - Sub2API SSH 隧道：`http://127.0.0.1:18081`
  - AWS Bedrock Mantle：`https://bedrock-mantle.<region>.api.aws/v1`
  - AWS Bedrock Runtime(OpenAI)：`https://bedrock-runtime.<region>.amazonaws.com/openai/v1`
- **API Key**：
  - Sub2API：填 Sub2API 的 key
  - Bedrock：填 Amazon Bedrock API key（Bearer）
- **翻译通道**：
  - `OpenAI`：模型建议 `gpt-5.2`
  - `Gemini`：模型建议 `gemini-3-flash-preview`
  - `AWS Bedrock (Mantle)`：模型填你在 Bedrock 可用的模型 ID（例如 `us.meta.llama4-maverick-17b-instruct-v1:0`）
  - 若 Base URL 用 `bedrock-runtime.../openai/v1`，建议 `接口协议` 选择 `Chat Completions`
- **思考强度**：
  - `无(不设置)`：默认，完全不发送思考参数（兼容性最好）
  - `低/中/高`：`Responses` 协议会发送 `reasoning.effort`（OpenAI/自定义）；`Chat Completions` 协议会发送 `reasoning_effort`（OpenAI/Gemini/AWS/自定义）
  - 若模型不支持推理参数，改回 `无(不设置)`

## 3) 常见问题

- 报错 `Invalid API key`：key 错误或已失效
- 报错 `Upstream request failed`：上游服务不可用/容量不足
- Bedrock 报 403/401：确认 API key 有效、区域是否正确、模型是否已开通
