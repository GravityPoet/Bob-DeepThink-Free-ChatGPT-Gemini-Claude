# 快速开始

## 1) 前置条件

- Bob 已安装
- 你有可用的 API Key（Sub2API 或 AWS Bedrock）

## 2) 基本配置

- **Base URL / Endpoint**：
  - Sub2API 本机直连：`http://127.0.0.1:18080`
  - Sub2API SSH 隧道：`http://127.0.0.1:18081`
  - Gemini Native 根地址：`http://127.0.0.1:18080/v1beta`
  - Gemini Native 完整端点：`http://127.0.0.1:18080/v1beta/models/gemini-3-flash-preview:generateContent`
  - AWS Bedrock Mantle：`https://bedrock-mantle.<region>.api.aws/v1`
  - AWS Bedrock Runtime(OpenAI)：`https://bedrock-runtime.<region>.amazonaws.com/openai/v1`
  - Opencode 完整端点：`https://opencode.ai/zen/v1/chat/completions`
  - Kilo 完整端点：`https://api.kilo.ai/api/gateway/chat/completions`
  - 规则：若你填的是完整端点（结尾是 `/chat/completions`、`/responses` 或 `/models/<model>:generateContent`），插件会原样直连；OpenAI 兼容根地址自动补 `/v1`，Gemini Native 根地址自动补 `/v1beta`
- **API Key**：
  - Sub2API：填 Sub2API 的 key
  - Bedrock：填 Amazon Bedrock API key（Bearer）
- **翻译通道**：
  - `OpenAI`：模型建议 `gpt-5.2`
  - `Gemini`：模型建议 `gemini-3-flash-preview`
  - `AWS Bedrock (Mantle)`：模型填你在 Bedrock 可用的模型 ID（例如 `us.meta.llama4-maverick-17b-instruct-v1:0`）
  - 若 Base URL 用 `bedrock-runtime.../openai/v1`，建议 `接口协议` 选择 `Chat Completions`
  - 若走 Gemini 原生 `v1beta ... :generateContent`，`接口协议` 选 `Gemini Native`
  - `Bedrock Region` 仅 AWS 通道生效；其他通道会自动忽略
- **思考强度**：
  - `无(不设置)`：默认，完全不发送思考参数（兼容性最好）
  - `低/中/高`：`Responses` 协议会发送 `reasoning.effort`（OpenAI/自定义）；`Chat Completions` 协议会发送 `reasoning_effort`（OpenAI/Gemini/AWS/自定义）
  - `Gemini Native` 模式下当前不发送思考强度参数（防止与不同网关实现冲突）
  - 若模型不支持推理参数，改回 `无(不设置)`
  - 插件会自动识别并折叠常见思考字段到 Bob 可折叠思考区：`<reasoning>/<think>`、`reasoning_content`、`thinking`、Gemini thought parts、OpenAI 兼容 `reasoning_*`

## 3) 常见问题

- 报错 `Invalid API key`：key 错误或已失效
- 报错 `Upstream request failed`：上游服务不可用/容量不足
- Bedrock 报 403/401：确认 API key 有效、区域是否正确、模型是否已开通
- 报错 `HTTP 404`：通常是把“完整端点”又被拼接了一次。请确保 `Base URL` 只填网关根地址，或直接填完整端点并保持 `Chat Completions` 协议
- Gemini Native 报错 404：优先检查是否选了 `Gemini Native` 协议，以及模型名是否与网关路径一致（如 `gemini-3-flash-preview`）
- 报错 `流式响应里没有可用翻译结果`：`v0.1.11` 起会自动回退一次非流式请求；若仍失败，先将“流式输出”切到关闭再重试
