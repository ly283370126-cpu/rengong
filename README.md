# Voice Orb Assistant

一个可落地的实时语音 AI 助手项目，目标是复刻视频里的体验：暗色全屏、中心粒子球、`Idle / Listening / Speaking` 状态、语音对话和白名单工具调用。

## 能力

- Three.js 粒子球，可根据状态和音频能量变化。
- 低/中/高频段驱动，语音时有更明显的爆散感。
- Local Demo 模式：不用 API Key，也能体验状态流、中文语音播报、日期工具、打开网页/应用。
- OpenAI Realtime 模式：配置 `OPENAI_API_KEY` 后，通过 WebRTC 连接实时语音模型。
- 配置面板：页面里保存 Key、模型、声音，不用手改 `.env`。
- Electron 桌面壳：开发桌面版和可打包 portable exe。
- 后端白名单工具：日期、打开 URL、打开应用、打开文件、搜索、创建日程。
- 不把 OpenAI 主 API Key 暴露给浏览器。

## 运行

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

## Chrome automation

Start a separate controllable Chrome window:

```bash
npm run chrome:start
```

Check the connected page:

```bash
npm run chrome:status
```

Navigate, click, or type through the Chrome DevTools Protocol:

```bash
npm run chrome:goto -- --url=https://www.google.com
npm run chrome:click -- --selector="button"
npm run chrome:type -- --selector="input[name=q]" --text="hello"
```

By default this uses `CHROME_DEBUG_PORT=9222`, `CHROME_PROXY=http://127.0.0.1:7892`, and a separate `.chrome-codex-profile/` user data directory so the normal Chrome profile is left alone.

打开：

```text
http://127.0.0.1:5173
```

如果只想先体验效果，不需要填写 Key，默认使用 `Local Demo`。

也可以双击：

```text
start-web.cmd
start-desktop.cmd
```

## 接入真实 Realtime

编辑 `.env`：

```env
OPENAI_API_KEY=你的_key_不要提交到仓库
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
# 如果本机访问 OpenAI 需要代理，可以按需启用：
# HTTPS_PROXY=http://127.0.0.1:7892
# HTTP_PROXY=http://127.0.0.1:7892
```

`OPENAI_REALTIME_MODEL` 和 `OPENAI_REALTIME_VOICE` 可以按当前 OpenAI Realtime 支持的模型与声音调整。本地代理用户只需要配置 `HTTPS_PROXY`/`HTTP_PROXY`，不要把真实 Key 写进 `.env.example` 或提交到仓库。

然后重启：

```bash
npm run dev
```

进入页面后切换到 `Realtime`，点击 `Start realtime`，允许浏览器麦克风权限。

页面右上/控制区的齿轮按钮可以直接保存 Key、模型和声音。

## 桌面版

开发桌面版：

```bash
npm run dev:desktop
```

打包 portable exe：

```bash
npm run build:desktop
```

输出目录：

```text
release/
```

桌面版内置本地 API，默认自动选择空闲端口；如果你确实想固定端口，可以设置 `PORT=8787` 后再启动。

## 工具白名单

网页快捷方式：

- `baidu`
- `bilibili`
- `douyin`
- `github`
- `openai`
- `bing`
- `google`
- `calendar`

本机应用：

- `calculator`
- `notepad`
- `paint`
- `chrome`
- `edge`
- `wechat`

其他工具：

- `search_web`
- `open_file`
- `create_calendar_event`

工具执行器只接受这些白名单名称，不支持任意 shell 命令。

## 验证

```bash
npm run check
npm run build
npm run test:smoke
npm run doctor
```

`test:smoke` 需要后端正在运行，例如另一个终端执行：

```bash
npm run start
```

## 结构

```text
src/components/ParticleOrb.tsx       粒子球
src/components/ControlDock.tsx       底部控制台
src/hooks/useLocalDemo.ts            本地可体验模式
src/hooks/useRealtimeSession.ts      WebRTC Realtime 客户端
src/server/index.ts                  Express API 和 Realtime SDP 中转
src/server/tools.ts                  白名单工具执行器
src/lib/assistantPrompt.ts           助手提示词和工具定义
```
