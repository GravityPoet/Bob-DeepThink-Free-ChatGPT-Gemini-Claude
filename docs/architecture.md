# 架构与验证 / Architecture and verification

## 运行边界

Bob 使用 JavaScriptCore，不提供浏览器、Node.js、fetch、TextDecoder 或 Node 内置模块。插件使用 Bob 原生 CommonJS、`$http` 和 `$data`；不需要安装运行依赖。

```mermaid
flowchart TD
    Bob[Bob 翻译或验证] --> Entry[main.js 入口]
    Entry --> Service[service.js 生命周期与请求预算]
    Service --> Config[config.js 配置与模型]
    Config --> URL[urls.js 地址与协议]
    Service --> Protocol[protocol.js 请求与响应转换]
    Protocol --> AWS[aws.js SigV4]
    Service --> HTTP[Bob $http]
    HTTP --> Stream[stream.js UTF-8 与 SSE / AWS EventStream]
    Stream --> Protocol
    Protocol --> Result[result.js 译文与思考内容]
    Stream --> Result
    Result --> Literal[literal-tags.js 字面标记还原]
    Result --> Callback[Bob onStream / onCompletion]
```

- `service.js`：参数校验、原文选择、现代/旧回调择一、一次完成、取消订阅及销毁、错误收口、验证与翻译共用路径。
- `config.js` / `urls.js`：保存值保持不变；完整端点决定有效协议；路径与 query 分开处理。根地址按用户选定协议补齐路径。
- `protocol.js`：OpenAI Chat/Responses、Gemini Interactions / generateContent、Claude Messages、AWS Converse 请求与响应；完成、拒绝、过滤和截断状态。
- `stream.js`：跨网络包的 UTF-8 解码、SSE 多行事件与尾帧、delta 逐字追加、完整快照替换、独立的每请求状态。
- `aws.js`：仅在 SigV4 请求时按需加载，无依赖的 SigV4/SHA-256/HMAC；通过 `$data.fromUTF8` 发送签名原始字节。
- `reasoning.js`：模型能力、档位归一化、预算约束与各协议原生字段映射。
- `interactions.js` / `eventstream.js`：Gemini step 状态重建、AWS 二进制帧与 CRC；AWS 解码器仅在 ConverseStream 路径加载。
- `catalog.js` / `model-directory.js`：模型列表端点、分页解析、关键词筛选与能力提示；只在 `/models` 查询时按需加载。普通翻译不加载目录模块。
- `result.js` / `languages.js` / `util.js`：语言、结果格式、思考区、配置读取与脱敏错误。

## 兼容与恢复

1. 保留已有插件 identifier、所有旧选项 identifier、模型选择与服务配置；普通包和 legacy 包只在 identifier 与 appcast 上不同。AWS IAM 专用包使用独立 identifier，通过 `$info.identifier` 选择专用配置默认值。
2. Bob 1.21+ 同时收到 `content: {format: 'markdown', text}`；旧版读取单元素 `toParagraphs`，避免逐行 trim 破坏缩进与空行。思考区需要 Bob 1.15+，更早版本只显示正文。
3. 现代 `query.onCompletion` 优先，只有没有现代回调时才使用旧 completion，绝不同时调用。
   `query.onStream` 同样使用 `{result: translateResult}` 包装，`content.text` 为累计全文；直接传结果对象会导致本机 Bob 1.21.2 不刷新中途译文。测试必须在调用最终 HTTP handler 之前读取 `payload.result` 并确认可见文本。
4. 取消后忽略所有迟到帧与回调，释放本次订阅。不会移除 Bob 或其他插件的订阅。
5. SSE 空流且 HTTP 成功时最多回退一次非流式；回退共用原请求截止时间。明确错误、截断、网络中断和取消不重发。AWS 二进制流不自动回退重发。
6. Responses、Claude、Gemini Interactions 和 AWS ConverseStream 必须收到对应完成事件，提前结束报告错误。Chat 兼容流保留对不发送 `[DONE]` 的网关的兼容。
7. SSE 单个未处理帧最多 2 MiB；AWS 解码使用本地 32 MiB 单帧内存预算，校验 prelude 和完整帧 CRC。超过预算报告错误，不截断后冒充成功。
8. 错误展示会隐藏本次配置的密钥、AWS 凭据与接口 query 值，不记录完整请求。

## 检查与打包

```bash
npm run check
npm test
npm run build
npm run verify
```

Node.js 20+、Python 3.9+，无需 `npm install`。测试使用 Node 内置 test/VM/crypto，CRC 对照使用 Python 标准库 zlib；覆盖多个协议、任意文本/字节分包、并发、取消、错误、格式、配置与 SHA/HMAC。Node 测试不等价于 Bob 实机验收；安装后仍需通过 Bob 验证按钮和真实翻译路径。

`build.py` 生成确定性 ZIP，递归包含运行模块，固定 ZIP 时间、权限及顺序。`--check` 比较归档字节与当前源码，避免旧安装包混入新代码。自动 CI 只校验，不发布或部署。

发行物只有 `.bobplugin`，没有伴随 App、后台服务或读取 Bob 配置文件的桥接。模型预设使用原生固定菜单；实时目录由 `/models` 命令通过 `$http` 获取，结果在 Bob 卡片内显示，复制 ID 后由用户在原生设置保存。第三方 API 没有动态菜单和选项写回能力，此限制在用户说明中明确保留。目录查询测试覆盖纯插件环境、分页、取消、错误脱敏、结果上限以及配置保持不变。

## 发布边界

源码与本地安装包版本为 0.2.3。标准版与 legacy 版 `appcast*.json` 在发布时指向对应的 v0.2.3 Release；AWS IAM 专用包没有自动更新源。构建命令不创建 tag、Release 或改更新源。发布时先上传对应安装包，验证下载及 SHA-256，再确认各自 appcast；legacy identifier 不应改变。

## English

The plugin runs in Bob's JavaScriptCore with native CommonJS and Bob APIs, without Node or browser runtime dependencies. Requests have isolated state, cancellation, one deadline and one completion. Deltas append verbatim; snapshots replace accumulated output. Responses, Claude, Interactions and AWS streams require terminal events. An empty successful SSE stream may retry once; AWS binary streams, errors and cancellations never automatically retry. Model discovery runs inside the plugin through `/models`; it never reads Bob's preference file or changes saved options. The public host API cannot populate a live menu or write options back.

Build and verification require Node 20+ and Python 3.9+, with no package installation. Deterministic archives include every runtime module. Automated tests do not establish live provider availability; verify in the installed Bob app. Building or pushing source does not publish a GitHub Release. Existing appcasts remain on the published release until a release is explicitly completed.

## 协议依据 / Protocol references

- [Bob JavaScriptCore 与模块](https://bobtranslate.com/plugin/api/module.html)
- [Bob HTTP、流式和取消](https://bobtranslate.com/plugin/api/http.html)
- [Bob 1.21 结果格式与旧版兼容](https://bobtranslate.com/plugin/object/translateresult.html)
- [OpenAI Responses 流式事件](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Gemini 内容生成](https://ai.google.dev/api/generate-content)
- [Claude Messages 流式事件](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [AWS Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)

流式重复字符的原始复现由 [PR #1](https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude/pull/1) 提供；本次基于该问题扩展了分包、生命周期与多协议回归。

## 设置布局（0.2.1）

Bob 当前公开的 `info.json` schema 只列出 `text` 与 `menu`，未提供折叠组或条件显示。`isKeyOption` 只能切换默认名称/图标，不能隐藏其他选项。采用原生设置与独立 IAM 插件，无自定义 Web UI 或常驻配置进程。

- 通用版：14 项减为 10 项，缩短说明；保持原插件名称和 identifier，不改服务昵称。
- 供应商、地址、密钥、模型排在前面；协议、流式、思考与预算在后面。
- `profiles/aws-iam.json` 定义专用 IAM 字段与共享字段覆盖，构建时生成独立 manifest；同一份运行代码以 `$info.identifier` 识别配置。
- IAM 专用包不使用普通插件的 appcast，避免更新成错误身份；当前尚未发布独立更新源。
- 旧 IAM 配置仍兼容读取，但通用界面不再编辑这些字段。其他机器升级前，应保留旧服务、配置并验证专用服务；本轮仅验证了当前本机无 IAM 的 8 个服务完整保留，不宣称自动迁移 IAM。

本轮设计参考 Apple 模板的信息层级与简短说明，实际控件、间距、字体和配色均由 Bob 原生设置控制。官网与最新插件 schema 为实现约束；参考了当前同类插件的供应商/协议配置结构，未复制其实现。品牌社媒变化与插件原生设置无关，未据此改变名称或品牌。

## 流式与译文排版（0.2.2）

- 遗留思考包装只在响应开头识别；正文、行内代码与 fenced code 中的同名标签保持为正文。响应开头的半截标签不向 Bob 展示。
- `literal-tags.js` 对原文中的两类保留标签建立每请求映射，在发送前替换为无业务含义的标记，接收后恢复原始标签。映射不写入配置，不改变供应商、模型或密钥。
- 对保护标记的任意分包进行还原；未完整收到的标记不显示，不能恢复完整源标记的完成响应明确报错；不向 Bob 发送没有正文和思考内容的空帧。
- 每个请求的映射独立，随机前缀与原文检查避免碰撞；恢复使用回调替换，不执行原文或标签内容。
- 实测发现部分标签变化已出现在上游原始流中；通过原始响应与客户端结果对照定位，再验证保护后可还原。未把上游生成差异全部归因于客户端。
- 速度检查分别记录首个网络包、首个正文回调、终止事件、HTTP 结束与解析调用耗时。独立 Node HTTP 探针不包含 Bob 的 JavaScriptCore 与界面绘制成本，不能把它当成完整 GUI 性能数据。
- 保留早期 TLS 失败、探针 35 秒限时样本和成功样本，不删除慢例来声称提速。最后确认使用当前配置的 90 秒上限，且检查测量前后运行源码指纹一致。

## 原文格式与图标（0.2.3）

- 实机诊断确认 Bob 的 `query.text` 会移除部分标题、强调标记和缩进；对应的 `query.originalText` 保留原文。检测到 Markdown 结构时使用原文，普通正文继续使用预处理后的文本，兼容没有 `originalText` 的旧版本。
- 复用每请求的字面保护映射，保护反引号或波浪线围栏代码块，收到占位标记后恢复完整源代码。支持更长的结束围栏、较短的内嵌围栏和未闭合到文末的源代码块；代码中的标签不再单独重复保护。
- 实机样例发现模型会把行内 `inline_code` 改写成中文，因此行内代码也进入同一保护映射。按相同长度的反引号匹配，保留内部反引号、标签和换行；转义、未闭合以及跨段落的分隔符仍按普通原文处理。
- 临时诊断只针对合成标记样例记录输入和结果，交付运行代码不保留该日志分支。
- `icon.png` 以用户提供的 `AIPrivacyHubBolt.icns` 为基础，经内置 imagegen 调整小尺寸辨识度，保留实心白色底板和渐变闪电，放大主体并减少外部留白；交付为 256×256 PNG。沿用 `favicon1` 图标标识符以保留已有服务关联。
