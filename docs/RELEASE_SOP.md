# Bob-DeepThink Release SOP

## 项目

- 仓库：`https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude`
- 发布分支：`main`
- 包类型：无依赖 Bob `.bobplugin`，标准版、legacy 版、AWS IAM 专用版
- 适用范围：仅发布 Bob JavaScriptCore 插件；没有独立 `.app`、DMG 或其他平台安装器，原生 App 签名与 TCC 身份门禁不适用。
- 依赖：无 `package-lock.json`，不执行 `npm ci`；使用已安装的 Node.js 20+ 与 Python 3.9+
- 自动更新：标准版使用 `appcast.json`，legacy 版使用 `appcast-legacy.json`；AWS IAM 专用包没有自动更新源

## 版本与产物

- 版本来源：`package.json` 与 `plugin/info.json`，两者必须一致
- 标签：`v<version>`，使用 annotated tag
- 构建：`npm run build`，确定性输出到仓库根目录
- 产物：`Bob-DeepThink-Free-ChatGPT-Gemini-Claude.bobplugin`、`Bob-DeepThink-Free-ChatGPT-Gemini-Claude-legacy-id.bobplugin`、`DeepThink-AWS-IAM.bobplugin`
- 校验清单：`Bob-DeepThink-v<version>-SHA256SUMS`，列出上述三个包，作为第四个 Release 资产。
- 更新源：发布对应 Release 后，顶部版本的 URL、SHA-256、identifier 和版本说明必须与资产一致

## 发布前验证

```bash
cd <repo-root>
npm run verify
npm run build
swift tests/jscore-smoke.swift plugin
python3 -m json.tool appcast.json >/dev/null
python3 -m json.tool appcast-legacy.json >/dev/null
```

`npm run verify` 必须通过语法检查、全量 Node 测试和 `scripts/build.py --check`。构建后应保持包字节不变，否则重新执行受影响验收。Bob 实机验收应覆盖普通翻译、`/models`、流式中途回调和 Markdown/代码格式；构建与测试不替代实机验收。相同运行时代码、设置与包 SHA 的已通过证据可以复用。发布候选的 GitHub Actions `verify`、`jscore` 均须 completed/success。

0.2.5 的 CPA 优化验收需覆盖精简提示、同一模型/端点的首字节对比、流式中途回调、格式保护和非 CPA 提示不变。当前本地验收为 144 项 Node 测试；同一有效 CPA 凭据的三轮首字节约 2.48–3.72 秒，实测不包含 Bob UI 绘制。

## 发布步骤

```bash
git status --short --branch
git tag -a v<version> -m "Release v<version>"
git push origin v<version>
gh release create v<version> \
  Bob-DeepThink-Free-ChatGPT-Gemini-Claude.bobplugin \
  Bob-DeepThink-Free-ChatGPT-Gemini-Claude-legacy-id.bobplugin \
  DeepThink-AWS-IAM.bobplugin \
  <checksum-file> --draft --verify-tag --target <candidate-sha> \
  --title "Bob-DeepThink v<version>" --notes-file <notes>
# 核对候选 CI、草稿正文、四个资产的名称/大小/digest 后发布。
gh release edit v<version> --draft=false --prerelease=false --latest
# 公开下载、SHA-256 与 latest 验证通过后，最后激活默认分支上的更新源。
git push origin main
```

发布提交包含 README、两个 appcast 与本 SOP；先只推送该提交的标签，默认分支暂时保留旧更新源。新 Release 资产上线并通过公开下载校验后再推 `main`，避免更新源提前指向不可下载的版本。首次外部写入前再次核对远端 main SHA、同名 tag 与 Release，遇到并发变化先审计现状。

发布说明必须有完整中文与英文段落，覆盖本版本各项独立客户收益、三个包的安装选择和温度限制。用文件传给 `--notes-file`，发布后回读正文与本地文件逐字核对。

发布资产的 SHA-256 必须记录并与 appcast、GitHub digest 和三个包的公开下载校验一致。草稿使用已认证的 Release 列表/ID 读取，不用公开下载地址判断是否上传成功。发布后核对精确 tag、`releases/latest`、`draft=false`、`prerelease=false`、四个资产及 tag 指向的候选 SHA；最后回读公开的两个 appcast 并核对顶部版本、identifier、URL 和 SHA-256。下载放在独立工作目录，不使用删除型 trap。

更新源校验的输入直接来自标准版、legacy 版安装包内 `info.json` 的 `appcast` 字段，允许正常 HTTP 重定向，按最终 JSON 内容验证；不要手工猜测 raw 域名或把 URL 字面相等当成有效性依据。公开资产可使用系统 curl：`--location --fail --connect-timeout 10 --max-time 30 --retry 1 --retry-delay 1 --retry-all-errors --retry-max-time 35`，指定隔离输出文件，下载后必须校验大小、SHA-256、ZIP、版本与 identifier。不要输出 CDN 重定向中的临时签名 URL。

## 回滚与熔断

- tag 推送前：恢复 appcast/README/SOP 的提交，删除未发布的本地 tag。
- tag 推送后：保留 tag；如资产或说明有误，编辑 Release 或标记说明，不能覆盖历史 tag。
- Release 发布后：可撤回或编辑 Release 资产；已被 Bob 下载的包无法远程撤回，修复必须递增版本。
- 若新 Release 已发布但公开下载或摘要验证失败，保持默认分支旧 appcast，不激活更新源。若更新源已激活，可用普通修复提交恢复上一条已验证的版本入口；不移动既有 tag，不 force push。仓库若开启 Release 不可变性，则保留已发布资产并另发递增版本。
- 若版本、identifier、SHA、产物内容或 CI 结果不一致，停止发布，不创建 Release。
- 不使用 force push，不删除历史 Release，不上传凭据或配置文件。

## 本次失败记录

| 日期 | 版本 | 命令/信号 | 原因 | 修复 |
| --- | --- | --- | --- | --- |
| 2026-10-25 | 0.2.4 | legacy 更新源回读：curl 返回 `(35) LibreSSL SSL_connect: SSL_ERROR_SYSCALL`；网页抓取工具返回 `restricted URL` | curl 的 raw 主机 TLS 连接失败，具体网络根因未定；网页工具另有访问限制，不能用它代表源文件状态 | 保留包内实际 URL，改用 urllib 获取后返回 HTTP 200；两个公开 JSON 全文与仓库 0.2.4 一致，identifier、URL、SHA-256 均匹配公开包。区分传输失败与内容验证失败，不修改客户端地址或放宽 TLS 校验 |
| 2026-10-25 | 0.2.4 | 预发布检查 `assert info['appcast'] == expected_raw_url` 返回 `AssertionError` | 检查器假定使用 `raw.githubusercontent.com`，安装包实际使用可正常重定向的 `github.com/.../raw/main/...`；属于检查假设错误 | 改从包内 `info.json` 直接获取 URL，验证最终 HTTP 200、identifier 与内容；两个真实更新源均通过，不修改已验收的插件包 |
| 2026-10-25 | 0.2.4 | urllib 公开资产下载返回 `RemoteDisconnected: Remote end closed connection without response` | 重定向后的连接被关闭，具体网络根因未定，资产上传状态和 GitHub digest 正常 | 保持旧更新源，改用系统 curl 有界重试；四个公开资产均返回 200 并通过大小和 SHA-256 检查，三个插件另通过 ZIP、版本和 identifier 校验 |
| 2026-10-25 | 0.2.3 | 发布后下载校验命令被本机执行器拒绝：`rm -rf style commands are not permitted` | 临时校验脚本使用了 `rm -rf` trap；发布资产本身没有失败或改变 | 改用隔离 `/tmp` 目录，不在命令中使用递归删除；逐个下载并运行 `shasum -a 256 -c`，再回读公开 appcast |
| 2026-10-25 | 0.2.3 | `gh release view v0.2.3` / tag collision check 返回 not found | 目标 tag 与 Release 尚未创建；这是发布前的预期空状态，不是发布失败 | 确认远端没有同名 tag/Release 后继续创建唯一的 v0.2.3 |
| 2026-10-25 | 0.2.3 | 预检发现 appcast 顶部仍为 0.1.24 | 源码已升级但更新源尚未随 Release 更新 | 发布前生成包 SHA，更新两个 appcast 顶部条目并在发布后下载校验 |
| 2026-10-25 | 0.2.5 | CPA 速度对比初次误判为 Key 不同 | Bob plist 对不同服务的安全字段采用不同存储编码，原始长度/哈希不能比较；截图确认明文相同 | 不再比较存储编码；用同一有效凭据、端点、模型和短文本做 A/B，按请求体、首字节和完成时间归因 |
