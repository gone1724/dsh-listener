# dsh-listener

DeepSeek Harness 云端实时语音输入插件。按住右 Alt 说话，松开停止；识别文字追加到当前会话草稿，默认不发送。

当前版本 **0.3.12**。安装与检查更新统一使用 npm 默认渠道。兼容 Harness **0.2.0-rc.2**、Node.js **22.19+（22.x）或 24+**，推荐 Chrome / Edge。更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 安装

在 DSH Desktop 的 **插件 → 添加插件** 中填写 `dsh-listener` 安装最新版。安装后完全退出并重新打开 Desktop。

命令行安装：

```powershell
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
dsh plugin --profile web add dsh-listener
dsh web
```

## 配置

打开 **插件 → dsh-listener → 设置**，或右键会话输入框旁的麦克风。填写百炼 API Key，确认地域与 Workspace ID，点击保存。Workspace ID 支持粘贴完整 API Host 自动提取。

| 设置 | 默认值 / 说明 |
| --- | --- |
| 地域 | 北京，可选新加坡；须与密钥匹配 |
| Workspace ID | 工作空间 ID；留空使用传统 DashScope 域名 |
| 识别模型 | `qwen-audio-3.1-asr-flash-streaming`；须支持 DashScope 流式 ASR 协议 |
| 快捷键 | 右 Alt，可录入单键或组合键 |
| 录音模式 | 长按，可切换为点按 |
| 自动发送 | 关闭；开启后连同原草稿一起发送 |

API Key 由 Harness 凭据服务保存，设置接口不回传密钥；也支持启动环境变量 `DSH_LISTENER_API_KEY`。环境变量优先时页面可能无法修改密钥。“清除已保存配置”会清除已保存密钥并恢复默认设置。

## 使用

- 选择会话并允许麦克风权限，按钮变绿后开始收音。长按快捷键录音，松开停止；点按模式和麦克风按钮均为再次点击停止。
- 录音中悬停麦克风可查看预览；停止后等待最终文字追加到草稿，原内容与引用保留。没有识别到语音时安静结束。
- 快捷键仅在页面获得焦点时生效。AltGr 用户请改绑其他键；浏览器或系统保留的组合可能不可用。
- 切换会话、标签页或窗口失焦会取消本次录音。每次最多录音 120 秒；远程页面需要 HTTPS，localhost 可直接使用。

## 更新

设置中的 **插件管理** 提供检查更新、更新及下载进度，与安装统一查询 npm 的 `latest`。发布新版后，点击检查更新即可发现；本地修改尚未发布时不会推送给用户。录音期间禁止更新，安装后按提示重启 Desktop。

下载来源默认 npm 官方，可切换为 npm 镜像（默认 `https://registry.npmmirror.com`）。镜像可能延迟同步，刚发布后优先使用官方来源；失败时不会自动回退。下载设置自动保存，镜像不代理百炼音频或密钥。安装前验证安装包完整性与插件版本。

此前使用旧包名安装的用户，请在 Desktop 插件管理中停用旧插件，安装 `dsh-listener` 并重启，重新填写密钥和设置。安装新包后，后续版本可通过设置检查 npm 更新。

## 隐私与排错

音频经 Harness Host 上传至阿里云百炼，插件不保存音频文件或录音日志；最终文字遵循 Harness 草稿和消息的保存行为。取消无法撤回已上传音频，可能已经计费。同一 Host/profile 的设置与密钥由已授权用户共享，默认凭据存储不是加密钥匙串。

按钮不可用时检查会话与 HTTPS；本地握手失败时更新插件并重启 Desktop；百炼 401/403 时检查密钥、地域、空间和模型权限。失败不会自动重试或切换服务。

真实百炼准确率、延迟、计费、各 Desktop 环境、接近 120 秒录音收尾和更新期间开始录音的并发行为仍需验收。

## 开发

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm verify:package
```

详细说明：[验证记录](docs/VALIDATION.md) · [更新机制](docs/UPDATES.md) · [npm 发布](docs/PUBLISHING.md)。

采用 [MIT](LICENSE)，上游来源与版权见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
