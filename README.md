# Linx Night · AI狼人杀

[![CI](https://github.com/LMH168/Linx-Night/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/LMH168/Linx-Night/actions/workflows/ci.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vue 3.5](https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 7.1](https://img.shields.io/badge/Vite-7.1-646cff?logo=vite&logoColor=white)](https://vite.dev/)

**[在线试玩 → https://linxnight.mimi-api.cn](https://linxnight.mimi-api.cn)**

Linx Night 是一个把 **真人网页玩家、灵矽 AI 玩家和独立 AI 主持** 放进同一局九人狼人杀的应用。默认阵容为 3 名狼人、预言家、女巫、猎人和 3 名平民，支持多名真人加入，由灵矽 AI 补齐九席。

项目支持本机联调和服务器运行；房间状态保存在内存中，服务重启后需要重新创建房间。真实语音及完整对局的验收范围见下方“当前限制”。

## 访问入口

- 正式网页：[https://linxnight.mimi-api.cn](https://linxnight.mimi-api.cn)
- 对局入口：[https://linxnight.mimi-api.cn/game.html](https://linxnight.mimi-api.cn/game.html)

两个入口使用同一套正式 Vue 客户端。线上通过 Cloudflare Tunnel 转发网页、`/api/` 和 `/mcp`，客户端使用同源 API；服务器 IP 和内部端口用于运维排查。主线合并与线上部署是两个步骤，仓库代码可能先于线上版本。

https://github.com/user-attachments/assets/b0b711d2-c47f-4c16-9743-b97e77e60d71

## 功能

默认网页使用月蚀议会界面：摄影背景、四档光照、椭圆九席牌桌、私密行动面板和授权结算翻牌，适配桌面与手机。原型仅作为视觉参考，真实房间、行动和胜负由服务端决定。接入契约与验证记录见 [原型正式接入说明](docs/prototype-alignment.md)。

- 九席房间：创建/加入房间，添加 AI，满九席后开始游戏。所有真人可在准备前移动本人到空位或与 AI 换座，不能占用其他真人席位；开始准备后锁定座位。
- 完整狼人杀流程：角色分配、狼人讨论与袭击、预言家查验、女巫用药、白天发言、投票、猎人响应、遗言和结算。
- 真人网页操作：查看自己的私密身份和可用行动，用按钮选择目标、提交技能和投票；普通发言与遗言使用本人实时原声。
- 语音与文字：原声通过 WebSocket 实时广播，浏览器 SpeechRecognition 同步识别并保存文字；玩家可编辑文字，确认结束时提交录音与文字。识别失败或浏览器不支持时，原声仍保留，可手动补充文字供 AI 阅读；无需独立转写身份。
- 主持与遗言：真人发表本人原声遗言，AI 使用该席位声音，主持不代读。首次开局和后续入夜由独立绑定 AI 主持调用确认工具，入夜播报成功播放后才开放夜间行动；失败可恢复，房主不能代替主持正常确认。
- 公共播放与结算：浏览器需手动启用公共声音；支持失败重试和缓存补播。角色只在授权结算数据到达后展示，动画不推进阶段或决定胜负。
- 灵矽 AI 接入：通过 MCP 工具读取公开/私密状态并提交行动，服务端为每个 AI 席位管理会话、绑定、租约、超时、重试和释放。
- 实时同步：服务端通过 SSE 推送带 event_id 和 version 的房间事件，客户端断线后自动重连并补拉状态。
- 安全边界：MCP 使用 Bearer Token 和 Linx 会话头；服务端从会话映射确定房间和座位，不信任模型自报身份。
- 可追踪验收：管理员诊断记录请求和回合时间线，但不记录 Token、原始音频、转写正文或私密角色信息。

## 如何运行

### 本机真实联调（Windows）

需要 Node.js 22+、npm 和 cloudflared。完整的一次性安装、灵矽账号/设备激活、音频生成和环境变量说明见 [从零开始：在自己的 Windows 电脑运行](docs/local-setup.md)。

安装依赖：

~~~powershell
git clone https://github.com/LMH168/Linx-Night.git
cd Linx-Night
npm.cmd ci
npm.cmd run build:client-vue
~~~

完成仓库外环境文件（例如 %LOCALAPPDATA%\LinxNight-runtime.env）后，使用统一入口启动网页、API、MCP 和调度器：

~~~powershell
node scripts/start-local.mjs "$env:LOCALAPPDATA\LinxNight-runtime.env"
~~~

示例环境文件使用网页 5110、API 5100、MCP 9191，实际以你的环境文件为准。每次更新前端代码后重新运行 `npm.cmd run build:client-vue`；启动脚本仅在构建目录不存在时自动构建，不会自动替换旧产物。另开终端把 MCP 暴露为 HTTPS：

~~~powershell
cloudflared tunnel --url http://127.0.0.1:9191
~~~

在灵矽控制台配置 https://<隧道域名>/mcp，选择 Streamable HTTP，并使用 Authorization: Bearer <MCP_AUTH_TOKEN>。然后打开 http://localhost:5110 创建房间。API 与 MCP 必须由同一个 run.mjs 进程启动，才能共享内存中的房间状态。

### 仅运行本地代码和测试

网页、API、MCP 和房间状态仍须由统一进程提供。仅调试本地界面与接口时，可使用以下端口启动；没有完整 Linx 配置时不能据此验证真实 AI 对局：

~~~powershell
npm.cmd run build:client-vue
$env:PORT = "5100"
$env:CLIENT_PORT = "5110"
$env:MCP_PORT = "9191"
node run.mjs
~~~

开发前端时另开终端运行 `npm.cmd run dev:client-vue`，默认打开 http://localhost:5173，使用本机 API 5100。非标准 API 端口通过 `?api=http://127.0.0.1:端口` 指定。不要把分别启动的 API 和 MCP 进程用于游戏联调，它们不共享房间状态。

常用检查：

~~~powershell
npm run check         # Node 语法检查
npm run test:domain   # 领域规则
npm run test:api      # REST API
npm run typecheck:client-vue # 正式客户端类型检查
npm run test:client-vue # 正式客户端组件与交互
npm run test:alignment # 换座、主持确认和遗言播放门控
npm run test:voice    # 公共语音、文字同步、播放恢复
npm run test:mcp      # MCP 协议和工具
npm run test:delivery # 配置检查与完整模拟混合局
~~~

更多 API 和回合行为见 [API 协议基线](docs/api-contract.md) 与 [本机自动灵矽回合](docs/automatic-turns.md)。

## 产品架构

~~~mermaid
flowchart LR
  Browser[浏览器客户端\n网页操作 / SSE / 音频播放]
  API[API 服务\n房间、权限、实时事件]
  Domain[领域层\n角色、阶段、行动、胜负]
  Scheduler[回合调度器\n租约、超时、重试]
  Manager[Linx 会话管理\n连接、绑定、释放]
  MCP[MCP 服务\nStreamable HTTP / SSE]
  Linx[灵矽平台\nAI 玩家与主持]
  Voice[语音能力\nTTS / STT / WAV]
  Browser -->|REST + SSE + WebSocket| API
  API --> Domain
  API --> Scheduler
  Scheduler --> Manager
  Manager --> MCP
  MCP <-->|工具调用| Linx
  API --> Voice
  Voice --> Browser
~~~

### 分层职责

| 层 | 目录 | 负责内容 |
| --- | --- | --- |
| 网页客户端 | apps/client-vue | 月蚀议会入口、换座、私密状态、行动按钮、真人实时原声与浏览器识别、公共播放和 SSE 重连。旧版回滚入口保留在 apps/client。 |
| HTTP/API | apps/server | 房间生命周期、玩家与控制权、公开/私密状态、事件流、结算和诊断。 |
| 领域模型 | packages/domain | 狼人杀状态机、阶段转换、行动校验、投票/猎人/遗言和胜负判断；不依赖网络。 |
| 回合调度 | apps/scheduler | 为合法席位创建 turn lease；公共发言串行，狼人行动和投票可并发；处理主持确认、超时、取消和重试。 |
| Linx 适配 | apps/linx | 软件身份、WebSocket 会话、音频触发、语音和平台连接适配。 |
| MCP 网关 | apps/mcp | 向灵矽暴露状态读取和游戏行动工具，按认证会话映射到实际座位。 |
| 共享协议 | packages/protocol | 阶段、事件、ID 和去重约定，供 API、客户端和 MCP 共用。 |

### 一回合的数据流

1. 领域层判断当前阶段和合法行动者。
2. 调度器为对应 Linx 席位创建带 turn_id、阶段和轮次的租约。
3. Linx 会话管理器确保连接和 MCP 绑定有效；AI 通过工具读取自己的状态并提交行动。
4. API 将行动交给领域层校验，领域层写入事件并推进阶段。
5. API 通过 SSE 发布新版本，网页更新状态；公共播放队列区分主持、玩家发言、遗言和入夜播报，按对应任务的成功完成条件继续流程。
6. 回合完成后保留健康 Linx 会话，结束、取消或失败时释放绑定；旧 session_id、controller_epoch 和 turn_id 不能继续写入。

## 目录速览

~~~text
apps/client-vue    正式 Vue 客户端、月蚀议会界面与组件测试
apps/client        静态服务和旧版回滚客户端
apps/server        HTTP API、SSE、房间和主持播放
apps/mcp           灵矽 MCP 服务、工具和提示词
apps/scheduler     Linx 回合调度、主持确认和规则测试辅助
apps/linx          Linx 客户端、身份、语音和音频适配
packages/domain    与网络无关的狼人杀领域模型
packages/protocol  共享协议定义
docs               安装、运行、API、验收和故障排查
scripts            本机启动、配置检查、音频和实验脚本
tests              集成、语音、运行时和混合局测试
~~~

## 当前限制

- 房间和绑定状态只在内存中，进程重启后必须新建房间。
- Cloudflare 临时隧道地址会变化；当前本机身份和 Token 配置不适合作为公网多人网站直接使用。
- 麦克风需要 HTTPS 或 localhost 安全上下文。浏览器语音识别的可用性取决于浏览器、权限和识别服务；不支持时需要手动补充文字，不能把空识别结果当作完整语义传给 AI。
- 自动化测试通过不等于灵矽平台真实端到端验收；请按 [验收文档](docs/acceptance.md) 记录平台工具调用、服务端事件和网页结果。
- 不要提交环境文件、Token、设备身份、音频、模型回复或真实玩家隐私数据。

## 相关文档

- [从零开始：在自己的 Windows 电脑运行](docs/local-setup.md)
- [当前交付与本机开始游戏](docs/start-here.md)
- [原型正式接入：换座、主持入夜、遗言与结算](docs/prototype-alignment.md)
- [API 协议基线](docs/api-contract.md)
- [本机自动灵矽回合](docs/automatic-turns.md)
- [部署基线](deploy/README.md)
- [玩家提示词](apps/mcp/prompts/player.md) · [主持提示词](apps/mcp/prompts/host.md)
