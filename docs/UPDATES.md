# 设置入口与更新机制

## 0.3.10 恢复名称

插件统一使用 `dsh-listener`，更新查询为 `https://registry.npmjs.org/dsh-listener/latest`。旧包安装不会自动更名，请在 Desktop 停用旧插件后安装 `dsh-listener` 并重启，重新配置 API Key 和设置。凭据变量改为 `DSH_LISTENER_API_KEY`，接口、配置命名空间与客户端标识也随包名同步更新。

## 0.3.9 统一 npm 更新

安装与插件内“检查更新”统一使用 npm 的 `latest`。检查请求为 `https://registry.npmjs.org/dsh-listener/latest`，不再查询 GitHub 标签，也不再区分 beta / 正式渠道。检查无需启动官方管理器；点击更新时重新查询并固定版本，下载 npm `.tgz`，验证 SHA-512、包名、版本及构建文件后调用 `installBundle`。官方管理器的版本替换和重启限制仍适用。

下载来源为 npm 官方或 npm registry 镜像，默认镜像 `https://registry.npmmirror.com`；镜像按 registry 路径请求，不拼接完整 GitHub URL。旧默认 GitHub 代理自动迁移，其他自定义地址应改为 npm registry。镜像可能延迟同步，检查最新发布优先使用官方来源。

0.3.8 及更早版本仍执行旧 GitHub 更新逻辑，0.3.9 查询旧 npm 包；这些版本均需在 Desktop 插件管理中安装 `dsh-listener` 并重启一次。下文是历史版本记录。

## v0.3.7 插件详情设置入口

完整语音设置接入宿主 `plugins.bundle.config`，以包名 `dsh-listener` 为 key，显示在插件列表中本插件的详情设置页。与 dshmarket 使用同一插槽机制，不向插件卡片摘要塞入整个表单。另注册 `settings.plugins.tab` 的“语音输入”标签，并保留右键麦克风弹窗；移除单独的 `settings.section` 导航项。

入口包含密钥、录音、快捷键、下载来源、检查更新和更新，复用同一表单及接口。插件运行时可发起更新，更新直接调用官方 `installBundle`；安装返回 `restart-required` 时仍需完全退出并重开 Desktop。设置热生效与代码版本的无重启替换是不同能力，当前未实现后者。

`bundle-in-use` 表示宿主卸载配置层后仍发现该 bundle 的运行条目，不能当作安装成功。插件自带管理接口将该错误转为中文，并将更新进度保留为失败；Desktop 自身的 JSON 错误展示不由本插件控制。若需要禁用后操作，应使用 Desktop 自带插件管理入口，禁用后本插件的设置入口随之消失。

## 0.3.4 设置页

删除 Escape 录音取消和额外使用说明，录音使用自定义快捷键或麦克风按钮。失焦和切换会话仍取消录音。空间/地域与模型提示分别移至对应输入框下面；快捷键按钮和文本框同一行。

“清除已保存配置”位于刷新前，清除凭据并恢复插件默认设置，Host 验证可写权限与配置版本，录音期间拒绝清除。下载设置仍自动保存，失败使用简短弹窗提示，不在表单中显示冗长错误。

## 0.3.3 下载设置自动保存

默认镜像预填 `https://gh-proxy.org`，保留已有自定义地址。官方模式隐藏镜像网址；镜像模式显示。来源与有效镜像前缀自动保存到当前 profile，输入停止 500 ms 后提交，关闭页面时提交待保存的地址。切换官方不会清除镜像网址。镜像为空时可记住来源，实际检查/下载仍要求填写有效前缀。自动保存只更新下载字段，不提交 API Key 或覆盖其他未保存表单；写请求按顺序发送并使用最新设置版本。

## 0.3.2 下载来源

设置 → 语音输入 → 插件管理增加 GitHub 官方下载和 GitHub 镜像下载；镜像前缀支持 HTTPS，可带路径，不支持账号、查询参数或 URL 片段。镜像需支持 API、Raw 与 Archive 请求。版本检查与清单验证使用相同镜像；安装目标为固定仓库、正式标签的 `.tar.gz`，继续交由官方包管理器处理，不写入安装目录。

表单选择立即用于本次检查/更新，保存后写入当前 profile。旧配置迁移为官方模式。镜像不接收百炼密钥和音频，npm 依赖下载仍使用宿主 registry。版本替换仍可能要求重启。

官方与镜像下载均先写入一个随机命名的临时 `.tgz` 文件，限制 32 MB。下载进度按实际已接收字节报告；无 Content-Length 时只显示已下载容量。下载完成后校验包名、目标版本及必要构建文件，再显示安装阶段并交给官方管理器。安装成功显示 100% 和重启要求，失败不标记完成；成功或失败均仅删除本次明确路径的临时文件。安装阶段无法取得百分比，因此使用不定进度。

## 0.3.0 插件管理与传输

设置页提供“检查更新”和“更新”。查询固定 GitHub 仓库的正式标签并验证包名/版本；更新通过 Harness 官方包管理器的 `installBundle`，使用 profile 锁和官方 pnpm 调用。管理器不足时在应用根上下文挂载官方服务，保证版本替换期间管理器仍可运行；配置 HMR 只监听 profile，不监听其他源码。录音中禁止版本替换。

`0.2.0-rc.2` 对已安装版本的替换仍返回 `restart-required`，界面直接显示重启要求。热配置与热卸载可以生效，版本替换不宣称一定无需重启。没有自建远程代码下载执行器，也不调用任意 shell。

本地录音改用带 Harness 同源鉴权的 HTTP 分块 PCM 上传和结果长轮询，Host 到百炼仍为 WebSocket。这避免依赖 Desktop 自定义 WebSocket 转发；每个通道使用随机会话 ID、4 个活动通道上限、30 秒断联回收、串行上传和取消清理。HTTP 可用但本地 WebSocket 不可用的情况已在集成测试复现，真实用户 Desktop 修复效果待新版本验收。

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

首次使用这次修复，请重新安装本地插件源码目录并重启 Desktop。更新表单入口后，普通设置修改不再需要重新安装或重启。

## 调研来源

- [官方 HMR](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/hmr/README.md)：统一重载队列、配置监听、模块监听；已安装包版本替换仍需重启，Client 有独立加载机制。
- [官方插件管理器](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md)：包操作、profile 写锁、配置重新组合和资源卸载。
- [dsh-plugin-hot-toggle](https://github.com/5102a/dsh-plugin-hot-toggle)：调用 `Entry.update({ disabled })` 热启停，写入 patch 持久化；它不是下载新版本的更新器。
- [dsh-plugin-toggle](https://github.com/Zenjibad/dsh-plugin-toggle)：同类启停机制，并提示新 Client bundle 可能需要完整页面刷新。
- [DSH Desktop](https://github.com/dsh-tauri/deepseek-harness-desktop/blob/main/README.en.md)：由桌面插件管理负责升级/卸载，内核更新与插件版本更新分别管理。

目前未增加独立远程自动更新器：直接写 Desktop 的安装目录会绕过宿主包管理及并发保护。仓库 `gone1724/dsh-listener` 通过 `v0.2.0` 发布标签提供固定版本，通过 Desktop 的插件管理流程分发。
