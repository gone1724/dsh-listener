# dsh-speeker

当前插件版本：**0.2.0**。更新内容见 [CHANGELOG.md](CHANGELOG.md)。

DeepSeek Harness 云端流式语音输入插件。按住右 Alt 说话，松开停止；音频实时上传至阿里云百炼，最终识别文字追加到当前会话草稿，默认不发送。

默认模型：`qwen-audio-3.1-asr-flash-streaming`。只调用用户配置的百炼服务，不提供本地 ASR 或浏览器 Web Speech 回退。

## 安装

当前兼容目标为 **DeepSeek Harness `0.2.0-rc.2`**、Node.js **22.19+**、pnpm **10.18+**。浏览器优先使用新版 Chrome / Edge；其他浏览器和桌面容器尚需验证。Harness 插件接口处于预览阶段，不承诺其他版本兼容。

如果尚未安装 Harness：

```powershell
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
```

从本地源码安装（在本仓库目录中运行）：

```powershell
pnpm install --frozen-lockfile
pnpm check
dsh plugin --profile web add .
dsh web
```

仓库包含构建后的 `lib/`，GitHub 安装不依赖用户本机构建。GitHub 仓库为 `gone1724/dsh-listener`，插件包名为 `dsh-speeker`：

```powershell
dsh plugin --profile web add github:gone1724/dsh-listener
# 固定版本：
dsh plugin --profile web add github:gone1724/dsh-listener#v0.2.0
dsh web
```

升级或移除后重启 Harness，并刷新页面：

```powershell
dsh plugin --profile web remove dsh-speeker
```

## 配置

点击输入框麦克风旁的 **语音设置** 配置；也可以在 Harness **设置 → 云端语音输入** 打开同一表单。配置入口不依赖“内置插件”页面是否存在。

| 设置 | 默认值 / 说明 |
| --- | --- |
| API Key | 必填；使用对应地域的百炼密钥，留空保存时保留已有密钥 |
| 地域 | 北京；可选择新加坡 |
| Workspace ID | 推荐填写，使用百炼推荐的工作空间专属端点；留空使用传统 DashScope 域名 |
| 识别模型 | `qwen-audio-3.1-asr-flash-streaming` |
| 快捷键 | 右 Alt；点击“录入快捷键”后按键，保存生效 |
| 录音模式 | 长按；可选择点按 |
| 自动发送 | 关闭 |

模型名称允许修改，但必须支持 **DashScope run-task / finish-task WebSocket ASR 协议**。不能直接填入 OpenAI Whisper 或 `qwen3-asr-flash-realtime` 等不同协议的模型。模型开通和可用性以当前百炼账户为准。

密钥由 Harness 凭据服务保存为 `DSH_SPEEKER_API_KEY`，设置接口不回传密钥。也可在启动前设置同名环境变量；环境变量优先时，Harness 可能拒绝页面写入，请移除该启动环境变量后重启再配置。默认凭据后端是 Harness 主目录的私有文件，不是加密钥匙串。普通设置保存在当前 profile 的插件配置中，并热生效。

## 使用

1. 选择工作区和会话。首次点击麦克风，允许浏览器使用麦克风；实际开始采集后按钮变绿。
2. 长按模式：按下立即请求采集，保持按住录音，松开立即停止收音。点按模式：按一次开始，再次按下停止；第二次松开不会重启。
3. 麦克风按钮始终采用点击开始 / 再次点击停止，便于鼠标操作。
4. 录音中可以看到识别预览；停止后等待最终结果，文字追加到输入框末尾，原草稿和引用保留。
5. 手动编辑后发送；开启自动发送时，原草稿和语音文字一起通过 Harness 原有流程提交。期间修改过草稿则仅追加，提示手动发送。

快捷键只在 Harness 页面获得焦点时生效，忽略按键自动重复和输入法组合事件。默认使用 `KeyboardEvent.code === "AltRight"` 区分左右 Alt；检测到 AltGr 时保留其字符输入功能，请改绑其他键。可设置如 `F8`、`Control+Space` 等快捷键；浏览器或操作系统保留的组合可能无法使用。

录音或识别期间按 Escape、点击取消、切换会话、切换标签页或让窗口失焦，会停止采集并丢弃本次结果。每次录音最多 120 秒；网络等待最多缓冲 15 秒音频，过慢会取消。输入框锁定或版本冲突时保留识别文字，提供手动追加和复制按钮。

首次麦克风授权和设备初始化存在等待时间，授权前的声音无法采集；绿色按钮表示已经开始收音。Host 从远程机器提供页面时必须使用 HTTPS；localhost 是可用的安全上下文。

## 实现

```text
浏览器 getUserMedia → AudioWorklet → 单声道 16 kHz PCM16（100 ms 分块）
  → Harness 同源且经连接鉴权的 WebSocket
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

若按钮不可用，检查设置中的密钥、已选择的会话和 HTTPS。若百炼返回连接错误，检查地域与密钥是否对应、Workspace ID、模型是否开通及 Host 的出网能力。

## 开发与验证

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm pack
pnpm verify:package
```

`src/index.ts` 为 Host；`src/host/bailian.ts` 为百炼协议；`src/client/` 为界面、采集和交互；`tests/` 包含快捷键、草稿、取消、PCM 编码及本机 WebSocket 集成测试。

本机 mock 不需要 API Key。真实百炼识别准确率、真实计费和 AltGr 各布局仍需人工验收；mock 通过不表示已经完成云端验收。安装包应同时包含 `lib/index.js`、`lib/client.js`、`lib/pcm-worklet.js`、`cordis.patch.yml` 和许可文件。

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
