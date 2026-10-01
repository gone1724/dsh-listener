# 设置入口与更新机制

## 0.2.1 当前入口

设置页名称为“语音输入”。输入框旁只显示麦克风；右键麦克风打开设置，尚未配置时点击也可打开。错误通过应用内弹窗呈现，参考 [dsh-plugin-notify](https://github.com/c-ling/dsh-plugin-notify) 将临时提示放在页面浮层的方式，自行实现原生 dialog，不引入额外通知插件。下文记录 0.2.0 的入口修复及宿主更新机制。

Workspace ID 支持直接粘贴百炼域名或完整 API Host，自动提取地域和空间 ID；音频仍只上传至允许的百炼域名，使用 `/api-ws/v1/inference`。

原有笼统连接报错已拆分：浏览器到 Harness 本地 WebSocket 的失败，以及 Host 到百炼的连接/鉴权失败。前者会额外检查同源设置接口的 HTTP 状态；后者显示安全的 HTTP 状态或网络错误代码。尚未在用户 Desktop 实例中确认导致本地握手失败的具体原因。

## 0.2.0 设置入口修复

旧版将设置页注册到 `settings.plugins.tab`。这个插槽由插件设置页面的拥有者声明，Desktop 的页面组合未提供该页面时，注册会等待，麦克风仍可显示。这是目前的可能原因，尚未直接检查用户 Desktop 的运行时页面组合。

当前改用 `settings.section` 提供独立的“云端语音输入”页，并在麦克风旁提供“语音设置”按钮，直接打开同一表单。API Key 仍通过原来的鉴权接口写入 Harness 凭据服务。

## 三种更新

| 操作 | 实现及限制 |
| --- | --- |
| 修改 API Key、模型、快捷键、自动发送 | 已实现。保存后更新客户端配置，下一次录音使用新配置，无须重启。 |
| 热启停 / 本地源码重载 | 使用宿主 Cordis Loader 和 HMR。插件释放麦克风、连接、事件和界面，宿主重新激活。是否启用文件监听由 Desktop profile 配置决定。 |
| 下载并替换新版本 | 使用 Desktop / 官方插件管理器。官方当前文档明确说明替换已安装包版本仍需重启，不能把热启停称作无重启升级。 |

本地安装不等于源码文件自动监听。如果 Desktop 将本地包复制到 profile 中，修改本仓库的 `lib/` 不会修改安装副本；需要在 Desktop 的插件管理中重新安装同一本地目录。若是链接安装，也需要宿主 HMR 监控真实路径。源码修改后先执行 `pnpm build`；未启用 HMR 时重启 Desktop，以加载新的 Host 和 Client。

首次使用这次修复，请重新安装 `F:\dsh-speeker` 并重启 Desktop。更新表单入口后，普通设置修改不再需要重新安装或重启。

## 调研来源

- [官方 HMR](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/hmr/README.md)：统一重载队列、配置监听、模块监听；已安装包版本替换仍需重启，Client 有独立加载机制。
- [官方插件管理器](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md)：包操作、profile 写锁、配置重新组合和资源卸载。
- [dsh-plugin-hot-toggle](https://github.com/5102a/dsh-plugin-hot-toggle)：调用 `Entry.update({ disabled })` 热启停，写入 patch 持久化；它不是下载新版本的更新器。
- [dsh-plugin-toggle](https://github.com/Zenjibad/dsh-plugin-toggle)：同类启停机制，并提示新 Client bundle 可能需要完整页面刷新。
- [DSH Desktop](https://github.com/dsh-tauri/deepseek-harness-desktop/blob/main/README.en.md)：由桌面插件管理负责升级/卸载，内核更新与插件版本更新分别管理。

目前未增加独立远程自动更新器：直接写 Desktop 的安装目录会绕过宿主包管理及并发保护。仓库 `gone1724/dsh-listener` 通过 `v0.2.0` 发布标签提供固定版本，通过 Desktop 的插件管理流程分发。
