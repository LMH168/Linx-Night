# Linx-Night · 灵矽 AI 语音狼人杀

基于灵矽 AI 的网页狼人杀项目，让真人、智能体与规则机器人在服务端裁判控制下完成夜间行动、发言、投票与胜负结算。

仓库包含两种可运行的体验：主项目提供房间、MCP 工具与自动回合调度；**月隐 Moonveil** 提供独立的单人语音练习局。两者有各自的启动入口和灵矽配置，不能混用。

## 选择体验

|            | 主项目 Linx-Night                     | 月隐 Moonveil 示例                            |
| ---------- | ------------------------------------- | --------------------------------------------- |
| 代码位置   | `apps/`、`packages/`                  | `examples/moonveil/`                          |
| 主要玩法   | 真人、Linx 玩家、规则机器人的混合房间 | 1 位真人 + 5 / 8 位 AI 的练习局               |
| 智能体接入 | 软件身份 + MCP 工具 + 回合租约        | 每个 AI 独立智能体与虚拟设备                  |
| 语音       | 独立语音身份的转写与公共播报          | 网页录音转写、8 种玩家音色、试听与重听        |
| 页面地址   | http://localhost:5010                 | http://localhost:4173                         |
| 详细说明   | [本机开始游戏](docs/start-here.md)    | [月隐安装与配置](examples/moonveil/README.md) |

## 快速体验月隐

需要 **Node.js 22.9+**（推荐 Node.js 24 LTS）和 npm，推荐使用 Chrome / Edge。

```bash
git clone https://github.com/LMH168/Linx-Night.git
cd Linx-Night/examples/moonveil
npm ci
npm start
```

打开 [http://localhost:4173](http://localhost:4173)。未配置密钥时使用本地模拟玩家，可以先体验规则；灵矽语音输入和玩家专属音色需要初始化账号资源。

接入真实智能体：

1. 将示例目录内的 `.env.example` 复制为 `.env`，用编辑器填写自己的 `LINX_API_KEY`。
2. 在 `examples/moonveil` 目录执行 `npm run linx:init`，创建 8 位玩家、独立 ASR 通道及虚拟设备，配置不同音色。无需实体硬件。
3. 执行 `npm start`（已启动则重启），在网页设置中检查全部智能体并试听音色。

初始化会调用你的灵矽账号；资源关联保存在示例的 `.linx/`。语音识别结果先进入草稿，检查后手动提交。服务同时使用本机 4173 / 4174 端口，实际调用费用与音色可用性以平台为准。

玩法、模式切换、规则边界与完整命令见 [月隐 README](examples/moonveil/README.md)，与主项目的关系见 [示例说明](docs/moonveil.md)。

## 启动主项目

主项目的开发基线是 **1 真人 + 2 Linx 玩家（默认 P2/P3）+ 6 规则机器人**。其他真人可通过本机独立浏览器上下文加入房间。Linx 座位需要完成配置，准备失败时页面会提示错误。

在仓库根目录安装依赖：

```bash
npm ci
```

首次运行前，按 [本机开始游戏](docs/start-here.md) 完成以下配置：

1. 激活 `player-a`、`player-b` 软件身份并关联玩家 Agent，启用 Function Call、关闭跨会话记忆。
2. 准备 16kHz、单声道、16 位 PCM 的回合 WAV。仓库提供 PowerShell 生成脚本，也可通过 `LINX_TURN_WAV` 指定已有音频。
3. 在仓库外保存环境文件，填写 Agent ID、软件身份列表、独立管理员 / MCP 令牌及 MCP 管理地址。
4. 将带认证的 MCP 服务通过 HTTPS 提供给灵矽，并在玩家 Agent 中关联。网页语音另需独立 `web-voice` 身份，见 [网页语音配置](docs/web-voice.md)。

完成后使用统一启动器，路径替换为自己的环境文件：

```bash
node scripts/start-local.mjs /absolute/path/LinxNight-play.env
```

Windows PowerShell 示例：

```powershell
node scripts/start-local.mjs "$env:LOCALAPPDATA\LinxNight-play.env"
```

启动器检查基础变量、身份文件与 WAV，再启动本机网页、API 和 MCP。打开 [http://localhost:5010](http://localhost:5010)，创建房间并开始游戏。

| 服务     | 默认端口 | 用途                       |
| -------- | -------- | -------------------------- |
| 网页     | 5010     | 房间、角色操作、发言与投票 |
| 游戏 API | 5000     | 游戏状态、行动与事件流     |
| MCP      | 9091     | 灵矽工具调用和会话绑定     |

`npm start` 是加载 `run.mjs` 的底层入口，使用当前进程环境，**不会自动读取 `.env` 或执行启动前配置检查**。游戏 API 与 MCP 需要统一启动以共享内存房间；完整配置和排错请优先阅读 [当前启动指南](docs/start-here.md)。

## 已实现的能力与边界

- 服务端裁判维护身份、合法技能、发言顺序、投票、猎人死亡窗口和胜负，私密信息按座位隔离。
- 主项目通过 MCP 与回合租约接收智能体行动，提供失败提示、重试、真人在线状态及显式规则托管 / 恢复。
- 主项目的 Linx 网页转写、公共播报和自动回合已有代码与模拟测试；真实连续多昼夜、独立语音身份听检等验收状态以 [交付说明](docs/start-here.md) 为准。模拟测试通过不代表真实平台验收完成。
- 月隐是独立单人练习实现，已完成的联调记录见 [验证说明](examples/moonveil/docs/validation.md)，不代表主项目的混合房间已通过相同验收。
- 当前房间保存在内存，重启后需要重建。主项目玩家标识仍是本机开发模式，尚非生产用户认证。公网部署需要进一步完善身份保护、HTTPS 和持久化。

这是需要 Node.js 后端的应用，不能只用 GitHub Pages 运行。密钥、环境文件、软件身份和虚拟设备资料应保留在本地，不提交到仓库。

## 开发与检查

主项目在仓库根目录执行：

```bash
npm run check            # 源码语法检查
npm run test:domain      # 规则与猎人技能
npm run test:delivery    # 配置与完整模拟混合局
npm run test:runtime     # 自动回合、租约及生命周期
npm run test:voice       # 语音协议、接口与浏览器行为
```

API、MCP、客户端、隐私和灵矽协议等专项检查见根目录 [package.json](package.json)。这些测试不能替代真实平台联调。

月隐示例在 `examples/moonveil` 执行：

```bash
npm run check            # 格式检查 + 自动测试
npm run package          # 干净源码导出；额外需要 Python 3
```

仓库的 [Moonveil 工作流](.github/workflows/moonveil.yml) 在 Node.js 22 / 24 上检查示例，不包含主项目的全部回归测试。

## 目录与文档

```text
apps/client/          主项目网页
apps/server/          游戏 API、事件流与控制器管理
apps/mcp/             MCP 服务、工具与智能体提示词
apps/scheduler/       回合调度与灵矽运行时
apps/linx/            灵矽软件客户端与语音协议
packages/domain/     规则与领域模型
packages/protocol/   共享协议说明
examples/moonveil/   独立月隐网页语音游戏
scripts/             初始化、配置检查与启动工具
tests/               集成与交付验证
docs/                设计、接入和验证说明
deploy/              部署参考
```

- [主项目当前交付与启动指南](docs/start-here.md)
- [自动灵矽回合与故障重试](docs/automatic-turns.md)
- [网页语音输入与公共播报](docs/web-voice.md)
- [软件身份激活与客户端](docs/linx-client.md)
- [API 合约](docs/api-contract.md) · [产品方案](proposal.md)
- [月隐完整说明](examples/moonveil/README.md) · [月隐架构](examples/moonveil/docs/architecture.md)

## 参考资料

- [灵矽文档](https://linx.qiniu.com/docs/)
- [灵矽平台 API](https://linx.qiniu.com/docs/xrobot/api/)
- [灵矽 WebSocket 协议](https://linx.qiniu.com/docs/xrobot/platform/websocket)
- [狼人杀规则](https://baike.baidu.com/item/狼人杀/8035581)
