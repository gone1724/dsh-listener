# dsh-speeker

当前插件版本：**0.3.7**。更新内容见 [CHANGELOG.md](CHANGELOG.md)。

DeepSeek Harness 云端流式语音输入插件。按住右 Alt 说话，松开停止；音频实时上传至阿里云百炼，最终识别文字追加到当前会话草稿，默认不发送。

默认模型：`qwen-audio-3.1-asr-flash-streaming`。只调用用户配置的百炼服务，不提供本地 ASR 或浏览器 Web Speech 回退。

## 安装

当前兼容目标为 **DeepSeek Harness `0.2.0-rc.2`**、Node.js **22.19+**、pnpm **10.18+**。浏览器优先使用新版 Chrome / Edge；其他浏览器和桌面容器尚需验证。Harness 插件接口处于预览阶段，不承诺其他版本兼容。

### 1. 桌面版 Harness 安装

1. 打开 DSH Desktop，点击 **插件**，再点击 **添加插件**。
2. 在添加插件的输入框中粘贴以下地址，然后确认安装：

   ```text
   github:gone1724/dsh-listener#v0.3.7
   ```

3. 安装完成后，完全退出并重新打开 Desktop。
4. 打开 **插件 → dsh-speeker（语音输入）→ 设置**，填写百炼 API Key；使用工作空间专属端点时，粘贴完整 API Host 到 Workspace ID，点击 **保存**。设置页内的 **插件 → 语音输入** 标签和右键麦克风也可打开同一表单。
5. 进入会话，允许麦克风权限，即可使用右 Alt 或麦克风按钮录音。

### 2. 命令行安装

安装 Node.js 和 pnpm 后，在终端运行：

```powershell
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
dsh plugin --profile web add github:gone1724/dsh-listener#v0.3.7
dsh web
```

打开命令输出的页面，在 **插件 → dsh-speeker → 设置** 填写密钥并保存；也可右键麦克风打开设置。仓库包含构建后的 `lib/`，GitHub 安装无需在本机编译。仓库名为 `dsh-listener`，插件包名为 `dsh-speeker`。

### 3. 从本地源码安装（开发用）

在本仓库目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm check
dsh plugin --profile web add .
dsh web
```

## 配置

在 Harness **插件 → dsh-speeker → 设置** 配置；设置页内 **插件 → 语音输入** 标签和右键麦克风也可打开同一表单。未配置密钥时，点击麦克风直接打开配置。输入框旁只显示麦克风，错误通过弹窗提示。

| 设置 | 默认值 / 说明 |
| --- | --- |
| API Key | 必填；使用对应地域的百炼密钥，留空保存时保留已有密钥 |
| 地域 | 北京；可选择新加坡 |
| Workspace ID | 推荐填写；可粘贴完整 API Host 自动提取地域和空间 ID。使用工作空间专属端点；留空使用传统 DashScope 域名 |
| 识别模型 | `qwen-audio-3.1-asr-flash-streaming` |
| 快捷键 | 右 Alt；点击“录入快捷键”后按单键或组合键（如 Ctrl+Shift+V、Alt+Space），保存生效 |
| 录音模式 | 长按；可选择点按 |
| 自动发送 | 关闭 |

“清除已保存配置”按钮会清除 API Key，并将模型、地域、空间、快捷键、录音模式、自动发送及下载设置恢复默认值。按钮位于刷新之前。

模型名称允许修改，但必须支持 **DashScope run-task / finish-task WebSocket ASR 协议**。不能直接填入 OpenAI Whisper 或 `qwen3-asr-flash-realtime` 等不同协议的模型。模型开通和可用性以当前百炼账户为准。

密钥由 Harness 凭据服务保存为 `DSH_SPEEKER_API_KEY`，设置接口不回传密钥。也可在启动前设置同名环境变量；环境变量优先时，Harness 可能拒绝页面写入，请移除该启动环境变量后重启再配置。默认凭据后端是 Harness 主目录的私有文件，不是加密钥匙串。普通设置保存在当前 profile 的插件配置中，并热生效。

## 使用

1. 选择工作区和会话。首次点击麦克风，允许浏览器使用麦克风；实际开始采集后按钮变绿。
2. 长按模式：按下立即请求采集，保持按住录音，松开立即停止收音。点按模式：按一次开始，再次按下停止；第二次松开不会重启。
3. 麦克风按钮始终采用点击开始 / 再次点击停止，便于鼠标操作。
4. 录音中悬停麦克风可查看识别预览；停止后等待最终结果，文字追加到输入框末尾，原草稿和引用保留。
5. 手动编辑后发送；开启自动发送时，原草稿和语音文字一起通过 Harness 原有流程提交。期间修改过草稿则仅追加，提示手动发送。

快捷键只在 Harness 页面获得焦点时生效，忽略按键自动重复和输入法组合事件。默认使用 `KeyboardEvent.code === "AltRight"` 区分左右 Alt；检测到 AltGr 时保留其字符输入功能，请改绑其他键。可设置如 `F8`、`Control+Space` 等快捷键；浏览器或操作系统保留的组合可能无法使用。

录音或识别期间切换会话、切换标签页或让窗口失焦，会停止采集并丢弃本次结果。每次录音最多 120 秒；网络等待最多缓冲 15 秒音频，过慢会取消。输入框锁定或版本冲突时保留识别文字，提供手动追加和复制按钮。

未识别到语音时安静结束，不弹窗、不修改草稿，也不会自动发送；连接、鉴权和模型等服务错误仍通过弹窗提示。

首次麦克风授权和设备初始化存在等待时间，授权前的声音无法采集；绿色按钮表示已经开始收音。Host 从远程机器提供页面时必须使用 HTTPS；localhost 是可用的安全上下文。

## 更新与卸载

在 **插件 → dsh-speeker → 设置 → 插件管理** 中（或右键麦克风打开）：

- **检查更新**：查询 `gone1724/dsh-listener` 的正式版本标签，验证版本与安装清单。
- **更新**：发现新版后启用，下载并安装指定发布标签，复用 Harness 官方插件管理器。
- **更新进度**：显示检查、下载、安装和完成阶段；下载按实际字节显示百分比，没有总大小时显示已下载容量，安装阶段显示不定进度。完成后提示是否需要重启。
- **下载来源**：默认 GitHub 官方下载；国内网络可改选 GitHub 镜像下载，并填入 HTTPS 镜像网址前缀。
- **一键卸载**：仅卸载 `dsh-speeker`，保留设置、密钥与已有草稿。录音期间不允许更新或卸载。

镜像默认预填：`https://gh-proxy.org`（可填写其他兼容地址；已有自定义地址保留）。插件按“镜像前缀 / 完整 GitHub URL”拼接请求；镜像需同时支持 GitHub API、Raw 文件和 `.tar.gz` 源码包，格式见 [GH-Proxy 使用说明](https://gh-proxy.com/docs/github-accelerator)。例如：`https://你的镜像域名/https://github.com/gone1724/dsh-listener/archive/refs/tags/v0.3.7.tar.gz`。仅填写镜像前缀，不要粘贴整个下载链接。

检查更新与更新立即使用表单中的下载来源；下载来源和有效镜像网址自动保存，无需点击保存。官方模式隐藏镜像输入框，但保留已有地址，切回镜像或重新打开设置后继续显示。官方模式从 GitHub 下载固定发布标签的压缩包；镜像模式通过镜像查询版本、验证清单，并将固定标签的压缩包交给官方插件管理器安装，不直连 GitHub 进行上述请求。检查请求每次最多等待 30 秒；镜像不可用时明确报错，不自动回退官方来源。镜像不代理百炼音频或 API Key，依赖包仍由宿主配置的 npm registry 下载。

插件管理使用当前 profile；宿主已有管理服务时复用，否则在应用根上下文挂载官方管理器。没有 HMR 时会启用仅监听 profile 配置的官方 HMR，支持配置更新和热卸载，不监听其他工作区源码。已安装包的版本替换在 Harness `0.2.0-rc.2` 中仍会返回 `restart-required`，界面明确提示重启。检查更新不会自动下载，也不会自动执行卸载。

## 实现

```text
浏览器 getUserMedia → AudioWorklet → 单声道 16 kHz PCM16（100 ms 分块）
  → Harness 同源且经连接鉴权的 HTTP 二进制分块上传 / 结果长轮询
  → Host 使用凭据服务中的 API Key 连接百炼
  → run-task / task-started / binary audio / finish-task / task-finished
  → 汇总最终句子 → InputActions.insertText → 可选 InputActions.submit
```

停止收音后先发送残余 PCM，再结束任务；等待 `task-finished`，避免丢失末尾结果。按句子 ID 合并最终文本，中间结果不写入草稿。草稿通过 Harness 公共动作修改，保留引用芯片并形成可撤销编辑。

Host 在每次录音开始时固定配置，设置变更用于下一次录音。最多允许四条并发录音连接；配置和 API Key 属于同一个 Harness Host/profile，所有已授权用户共享，v0.2 不提供多租户凭据隔离。

## 隐私与错误处理

- 音频经 Harness Host 发往百炼，插件不写入音频文件或录音日志；临时识别预览仅存在浏览器内存中。
- 最终文字进入 Harness 普通草稿/消息，遵循 Harness 自身的保存及发送行为。
- 取消会停止后续上传并忽略迟到结果；已上传的音频无法撤回，可能已经计费。
- API Key 不进入浏览器持久化、草稿或插件日志；Host 的默认凭据存储可被同一 OS 用户读取。
- 网络、鉴权和模型错误会提示；失败不会自动重试或切换其他提供商，以免重复计费或把音频发往其他服务。

若按钮不可用，检查已选择的会话和 HTTPS。弹窗提示 Harness 本地握手失败时，尚未连接百炼，应先更新插件、重启 Desktop，并检查本地通道；若提示百炼 HTTP 401/403，检查密钥、地域、Workspace ID 和模型权限。`sk-ws` 是百炼新密钥的有效格式，不应仅凭前缀判断无效。

## 开发与验证

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm pack
pnpm verify:package
```

`src/index.ts` 为 Host；`src/host/bailian.ts` 为百炼协议；`src/client/` 为界面、采集和交互；`tests/` 包含快捷键、草稿、取消、PCM 编码及本机 WebSocket 集成测试。

本机 mock 不需要 API Key。v0.3.0 默认本地 HTTP 通道，不依赖 Desktop 转发自定义 WebSocket；Host 到百炼仍为实时 WebSocket。旧 `/dsh-speeker/stream` 路由仅保留兼容。真实百炼识别准确率、真实计费和 AltGr 各布局仍需人工验收；mock 通过不表示已经完成云端验收。安装包应同时包含 `lib/index.js`、`lib/client.js`、`lib/pcm-worklet.js`、`cordis.patch.yml` 和许可文件。

本次运行记录与人工验收步骤见 [验证记录](docs/VALIDATION.md)。

Desktop 设置入口和热更新机制见 [更新说明](docs/UPDATES.md)。本地源码更新后需要重新构建；是否能自动重载取决于宿主 HMR 配置，替换安装包版本仍可能需要重启。

## 借鉴与开源协议

采用 [MIT](LICENSE)。基于 Harness 官方实验性语音输入模块的生命周期和公共接口，以及 `forrestahha/dsh-voice-input` 的独立插件包装方式改造。来源版本、复用位置、修改内容和上游版权见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 相关链接

- [DeepSeek Harness 快速入门（使用 Web UI）](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart)
- [DSH 插件社区（GitHub Topics）](https://github.com/topics/dsh-plugin)
- [DeepSeek Harness 插件开发入门（第一个插件）](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)
- [百炼流式 ASR WebSocket 协议](https://help.aliyun.com/zh/model-studio/qwen-audio-asr-streaming-websocket-api)
- [百炼客户端事件](https://help.aliyun.com/zh/model-studio/qwen-audio-asr-streaming-client-events)
- [百炼服务端事件](https://help.aliyun.com/zh/model-studio/qwen-audio-asr-streaming-server-events)
