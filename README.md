# Linx Night · AI狼人杀

Linx Night 是一个把 **真人网页玩家、灵矽 AI 玩家和独立 AI 主持** 放进同一局九人狼人杀的本机应用。默认阵容为 3 名狼人、预言家、女巫、猎人和 3 名平民，支持 1 名真人加 8 名灵矽 AI 完成一局游戏。

项目当前以本机联调和真实灵矽接入为目标：房间状态保存在内存中，重启后需要重新创建房间；

https://github.com/user-attachments/assets/b0b711d2-c47f-4c16-9743-b97e77e60d71
## 功能

- 九席房间：创建/加入房间，添加 AI，满九席后开始游戏。
- 完整狼人杀流程：角色分配、狼人讨论与袭击、预言家查验、女巫用药、白天发言、投票、猎人响应、遗言和结算。
- 真人网页操作：查看自己的私密身份和可用行动，用按钮或文字提交技能、发言和投票。
- 语音能力：浏览器语音识别先生成可编辑草稿；灵矽转写可生成发言或行动草稿；主持公开播报由网页播放队列控制。
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
~~~

完成仓库外环境文件（例如 %LOCALAPPDATA%\LinxNight-runtime.env）后，使用统一入口启动网页、API、MCP 和调度器：

~~~powershell
node scripts/start-local.mjs "$env:LOCALAPPDATA\LinxNight-runtime.env"
~~~

默认端口来自环境文件：网页 5110、API 5100、MCP 9191。另开终端把 MCP 暴露为 HTTPS：

~~~powershell
cloudflared tunnel --url http://127.0.0.1:9191
~~~

在灵矽控制台配置 https://<隧道域名>/mcp，选择 Streamable HTTP，并使用 Authorization: Bearer <MCP_AUTH_TOKEN>。然后打开 http://localhost:5110 创建房间。API 与 MCP 必须由同一个 run.mjs 进程启动，才能共享内存中的房间状态。

### 仅运行本地代码和测试

不接入灵矽时，可直接使用开发脚本或测试套件：

~~~powershell
npm run dev:server    # API，默认 5000
npm run dev:client    # 静态网页，默认 5010
npm run dev:mcp       # MCP，默认 9091

npm run check         # Node 语法检查
npm run test:domain   # 领域规则
npm run test:api      # REST API
npm run test:client   # 网页交互与语音草稿
npm run test:mcp      # MCP 协议和工具
npm run test:delivery # 配置检查与完整模拟混合局
~~~

独立启动仅适合开发和测试；真实联调请使用上面的统一入口。更多 API 和回合行为见 [API 协议基线](docs/api-contract.md) 与 [本机自动灵矽回合](docs/automatic-turns.md)。

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
  Browser -->|REST + SSE| API
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
| 网页客户端 | apps/client | 房间入口、私密状态、行动按钮、语音草稿、主持播放和 SSE 重连。 |
| HTTP/API | apps/server | 房间生命周期、玩家与控制权、公开/私密状态、事件流、结算和诊断。 |
| 领域模型 | packages/domain | 狼人杀状态机、阶段转换、行动校验、投票/猎人/遗言和胜负判断；不依赖网络。 |
| 回合调度 | apps/scheduler | 为当前合法席位创建 turn lease，串行驱动 AI 行动，处理超时、取消和重试。 |
| Linx 适配 | apps/linx | 软件身份、WebSocket 会话、音频触发、语音和平台连接适配。 |
| MCP 网关 | apps/mcp | 向灵矽暴露状态读取和游戏行动工具，按认证会话映射到实际座位。 |
| 共享协议 | packages/protocol | 阶段、事件、ID 和去重约定，供 API、客户端和 MCP 共用。 |

### 一回合的数据流

1. 领域层判断当前阶段和合法行动者。
2. 调度器为对应 Linx 席位创建带 turn_id、阶段和轮次的租约。
3. Linx 会话管理器确保连接和 MCP 绑定有效；AI 通过工具读取自己的状态并提交行动。
4. API 将行动交给领域层校验，领域层写入事件并推进阶段。
5. API 通过 SSE 发布新版本，网页更新公开状态；主持播放队列按公开事件播报。
6. 回合完成后保留健康 Linx 会话，结束、取消或失败时释放绑定；旧 session_id、controller_epoch 和 turn_id 不能继续写入。

## 目录速览

~~~text
apps/client        浏览器客户端和静态资源
apps/server        HTTP API、SSE、房间和主持播放
apps/mcp           灵矽 MCP 服务、工具和提示词
apps/scheduler     Linx 回合调度和本地规则托管
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
- 自动化测试通过不等于灵矽平台真实端到端验收；请按 [验收文档](docs/acceptance.md) 记录平台工具调用、服务端事件和网页结果。
- 不要提交环境文件、Token、设备身份、音频、模型回复或真实玩家隐私数据。

## 相关文档

- [从零开始：在自己的 Windows 电脑运行](docs/local-setup.md)
- [当前交付与本机开始游戏](docs/start-here.md)
- [API 协议基线](docs/api-contract.md)
- [本机自动灵矽回合](docs/automatic-turns.md)
- [部署基线](deploy/README.md)
- [玩家提示词](apps/mcp/prompts/player.md) · [主持提示词](apps/mcp/prompts/host.md)
