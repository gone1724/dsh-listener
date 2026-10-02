# npm 发布

包名为 `dsh-listener`，默认渠道为 `latest`，目标 registry 为 `https://registry.npmjs.org`。发布同一版本前应检查该版本是否已存在；每次发布新内容必须提升版本。

## 本机发布

先由维护者运行 `npm login --registry=https://registry.npmjs.org`，完成浏览器认证；同一操作系统用户下的 npm 命令可使用登录凭据，不需要向聊天发送密码或 Token。发布仍可能要求交互式二次认证。

依次执行（前一步失败时停止）：

```powershell
pnpm check
pnpm verify:package
npm publish ./output/dsh-listener-版本号.tgz --dry-run --tag latest --access public --registry=https://registry.npmjs.org
npm publish ./output/dsh-listener-版本号.tgz --tag latest --access public --registry=https://registry.npmjs.org
```

将命令中的版本号替换为 `package.json` 的 version。实际发布使用已经校验的 tgz。发布后运行 `npm view dsh-listener dist-tags --registry=https://registry.npmjs.org` 核对渠道和版本。

## GitHub 自动发布

首次建立 npm 包后，在 npm 包 Settings → Trusted Publisher 添加 GitHub Actions：

- GitHub 用户：`gone1724`
- 仓库：`dsh-listener`
- 工作流文件名：`publish.yml`
- Environment：留空（此工作流没有声明 GitHub Environment）
- 允许操作：`npm publish`

配置完成后，在 GitHub Actions 中选择 **Publish npm → Run workflow**，选择 `master` 分支。工作流验证、构建、打包并通过 OIDC 发布，不需要 `NPM_TOKEN`。同一版本已经发布时需要先提升版本再运行。

工作流使用 Node.js 24 和 npm 11，满足 npm Trusted Publishing 要求。统一发布到 `latest`；发布成功后，0.3.9 起的插件检查更新会查询该渠道。每次发布前完成适当验证，真实云端与 Desktop 的验收限制见 README。

官方说明：https://docs.npmjs.com/trusted-publishers/
