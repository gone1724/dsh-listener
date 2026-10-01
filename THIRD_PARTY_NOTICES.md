# 借鉴工程与版权声明

本插件复用 Harness 的公共插槽、输入动作、连接鉴权、凭据与设置服务；不修改 Harness 源码。

## DeepSeek Harness

- 项目：https://github.com/deepseek-ai/deepseek-harness
- 调研源码版本：`639ed015397290b3745d163aafe02ffee4aa3f84`
- 实际编译和运行接口：npm `0.2.0-rc.2`（Cordis `4.0.4`）。
- 来源：`packages/experimental/client-ui-voice-input/src/client/audio.ts` 和 `mount.ts`。
- 使用位置：`src/client/audio.ts` 的麦克风获取、迟到授权取消和轨道释放生命周期；`src/client/index.tsx` 的插槽注册方式。
- 改动：完整录音改为 AudioWorklet PCM16 分块；新增右 Alt 和点按控制；最终结果追加末尾；新增百炼服务端流式通道。没有复制或安装 SenseVoice 本地识别运行时。

## dsh-voice-input

- 项目：https://github.com/forrestahha/dsh-voice-input
- 来源版本：`76c1c5acbb9cc51584e14199d4fc588a4699f965`（v0.1.1）。
- 来源：`package.json`、`cordis.patch.yml`、`tsdown.config.ts`。
- 使用位置：插件的 Host/Client 双入口、Bundle 安装清单以及 `scripts/build.mjs` 的 Harness CommonJS 客户端模块工厂包装。
- 改动：使用 esbuild 构建；更换包名和兼容版本；新增流式 Host；替换 Web Speech 识别。

## 调研参考，未复制其实现

- https://github.com/Richard-Yang0130/dsh-web-speech-input — 最终结果进入草稿、状态提示。
- https://github.com/GooDAnDReaDY/dsh-voice — 快捷键与点按/按住手势对比。
- https://github.com/agent-mobile/dsh-speech — Host 语音适配结构对比；其 DashScope 批量接口没有用作本插件流式接口。

## 上游 MIT 许可

Copyright (c) 2026 DeepSeek

Copyright (c) 2026 forrestahha

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

`ws`、React、Harness 及其他 npm 依赖的许可证归各自项目所有，安装时由包管理器分发；本项目的 MIT 不替代其许可证。百炼 API 是独立云服务，使用者应遵循其服务条款。
