# Bob-DeepThink Release SOP

## 项目

- 仓库：`https://github.com/GravityPoet/Bob-DeepThink-Free-ChatGPT-Gemini-Claude`
- 发布分支：`main`
- 包类型：无依赖 Bob `.bobplugin`，标准版、legacy 版、AWS IAM 专用版
- 依赖：无 `package-lock.json`，不执行 `npm ci`；使用已安装的 Node.js 20+ 与 Python 3.9+
- 自动更新：标准版使用 `appcast.json`，legacy 版使用 `appcast-legacy.json`；AWS IAM 专用包没有自动更新源

## 版本与产物

- 版本来源：`package.json` 与 `plugin/info.json`，两者必须一致
- 标签：`v<version>`，使用 annotated tag
- 构建：`npm run build`，确定性输出到仓库根目录
- 产物：`Bob-DeepThink-Free-ChatGPT-Gemini-Claude.bobplugin`、`Bob-DeepThink-Free-ChatGPT-Gemini-Claude-legacy-id.bobplugin`、`DeepThink-AWS-IAM.bobplugin`
- 更新源：发布对应 Release 后，顶部版本的 URL、SHA-256、identifier 和版本说明必须与资产一致

## 发布前验证

```bash
cd <repo-root>
npm run verify
npm run build
python3 -m json.tool appcast.json >/dev/null
python3 -m json.tool appcast-legacy.json >/dev/null
```

`npm run verify` 必须通过语法检查、全量 Node 测试和 `scripts/build.py --check`。Bob 实机验收应覆盖普通翻译、`/models`、流式中途回调和 Markdown/代码格式；构建与测试不替代实机验收。

## 发布步骤

```bash
git status --short --branch
git tag -a v<version> -m "Release v<version>"
git push origin main
git push origin v<version>
gh release create v<version> \
  Bob-DeepThink-Free-ChatGPT-Gemini-Claude.bobplugin \
  Bob-DeepThink-Free-ChatGPT-Gemini-Claude-legacy-id.bobplugin \
  DeepThink-AWS-IAM.bobplugin \
  --title "Bob-DeepThink v<version>" --notes-file <notes>
```

发布资产的 SHA-256 必须记录并与 appcast、GitHub digest 和下载后校验一致。Release 必须是 stable（`draft=false`、`prerelease=false`）。

## 回滚与熔断

- tag 推送前：恢复 appcast/README/SOP 的提交，删除未发布的本地 tag。
- tag 推送后：保留 tag；如资产或说明有误，编辑 Release 或标记说明，不能覆盖历史 tag。
- Release 发布后：可撤回或编辑 Release 资产；已被 Bob 下载的包无法远程撤回，修复必须递增版本。
- 若版本、identifier、SHA、产物内容或 CI 结果不一致，停止发布，不创建 Release。
- 不使用 force push，不删除历史 Release，不上传凭据或配置文件。

## 本次失败记录

| 日期 | 版本 | 命令/信号 | 原因 | 修复 |
| --- | --- | --- | --- | --- |
| 2026-10-25 | 0.2.3 | `gh release view v0.2.3` / tag collision check 返回 not found | 目标 tag 与 Release 尚未创建；这是发布前的预期空状态，不是发布失败 | 确认远端没有同名 tag/Release 后继续创建唯一的 v0.2.3 |
| 2026-10-25 | 0.2.3 | 预检发现 appcast 顶部仍为 0.1.24 | 源码已升级但更新源尚未随 Release 更新 | 发布前生成包 SHA，更新两个 appcast 顶部条目并在发布后下载校验 |
