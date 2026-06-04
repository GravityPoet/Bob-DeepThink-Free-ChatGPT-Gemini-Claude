# 快速开始

## 1) 前置条件

- Bob 已安装
- 你有可用的 API Key（CPA/Sub2API/兼容网关）或 AWS Bedrock 官方凭证

## 2) 基本配置

- **Base URL / Endpoint**：
  - Sub2API 本机直连：`http://127.0.0.1:18080`
  - Sub2API SSH 隧道：`http://127.0.0.1:18081`
  - Gemini Native 根地址：`http://127.0.0.1:18080/v1beta`
  - Gemini Native 完整端点：`http://127.0.0.1:18080/v1beta/models/gemini-3-flash-preview:generateContent`
  - AWS Bedrock 官方链路：可留默认，插件会按 Region 自动使用 `https://bedrock-runtime.<region>.amazonaws.com/openai/v1`
  - AWS Bedrock Mantle / Bearer 网关：`https://bedrock-mantle.<region>.api.aws/v1`
  - Opencode 完整端点：`https://opencode.ai/zen/v1/chat/completions`
  - Kilo 完整端点：`https://api.kilo.ai/api/gateway/chat/completions`
  - 规则：若你填的是完整端点（结尾是 `/chat/completions`、`/responses` 或 `/models/<model>:generateContent`），插件会原样直连；OpenAI 兼容根地址自动补 `/v1`，Gemini Native 根地址自动补 `/v1beta`
- **API Key（网关 / Bearer）**：
  - CPA/Sub2API：填网关 key
  - Bedrock Mantle / Bearer 网关：填网关 Bearer key
  - AWS 官方 Bedrock 直连：这里留空，填写 `AWS Access Key ID` 与 `AWS Secret Access Key`
- **AWS 官方 Bedrock 凭证**：
  - `AWS Access Key ID`：AWS IAM Access Key ID
  - `AWS Secret Access Key`：AWS IAM Secret Access Key
  - `AWS Session Token`：只在 STS 临时凭证时填写
  - `AWS Region`：例如 `us-east-1`
- **接口类型**：
  - `OpenAI 接口 / 兼容接口`：CPA/Sub2API/OpenAI 兼容网关
  - `Gemini 官方接口`：Google 官方 /v1beta
  - `AWS Bedrock 官方链路`：AWS 官方 Bedrock，使用 SigV4
  - `其他完整端点`：直接填写完整 endpoint
  - AWS 官方 Bedrock 建议 `接口协议` 选择 `Chat Completions`
  - 若走 Gemini 原生 `v1beta ... :generateContent`，`接口协议` 选 `Gemini Native`
  - `AWS Region` 仅 AWS Bedrock 生效；其他通道会自动忽略
- **思考强度**：
  - `无(不设置)`：默认，完全不发送思考参数（兼容性最好）
  - `低/中/高`：`Responses` 协议会发送 `reasoning.effort`（OpenAI/自定义）；`Chat Completions` 协议会发送 `reasoning_effort`（OpenAI/Gemini/AWS/自定义）
  - `Gemini Native` 模式下当前不发送思考强度参数（防止与不同网关实现冲突）
  - 若模型不支持推理参数，改回 `无(不设置)`
  - 插件会自动识别并折叠常见思考字段到 Bob 可折叠思考区：`<reasoning>/<think>`、`reasoning_content`、`thinking`、Gemini thought parts、OpenAI 兼容 `reasoning_*`

## 3) 常见问题

- 报错 `Invalid API key`：key 错误或已失效
- 报错 `Upstream request failed`：上游服务不可用/容量不足
- AWS Bedrock 报 403/401：确认 Access Key / Secret Key / Session Token、Region、模型权限和账号是否已开通 Bedrock
- Bedrock Mantle / Bearer 网关报 403/401：确认 Bearer API Key 和网关地址
- 报错 `HTTP 404`：通常是把“完整端点”又被拼接了一次。请确保 `Base URL` 只填网关根地址，或直接填完整端点并保持 `Chat Completions` 协议
- Gemini Native 报错 404：优先检查是否选了 `Gemini Native` 协议，以及模型名是否与网关路径一致（如 `gemini-3-flash-preview`）
- 报错 `流式响应里没有可用翻译结果`：`v0.1.11` 起会自动回退一次非流式请求；若仍失败，先将“流式输出”切到关闭再重试
