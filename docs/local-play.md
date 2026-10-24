> 当前自动运行请优先阅读 [开始游戏](./start-here.md)、[自动回合](./automatic-turns.md) 和 [网页语音](./web-voice.md)。以下手动绑定/控制台拨打说明是早期联调记录，不是当前日常开局流程。

> 当前灵矽控制台请选择 **Streamable HTTP**，MCP URL 使用 `https://隧道域名/mcp`。服务现支持 POST /mcp 的无状态 JSON 响应，以及旧 SSE 通道。认证模式 Normal，Header 名称 Authorization，值为 Bearer 加一个空格及 MCP_AUTH_TOKEN；删除空白 Header 行。初始化和工具发现无需绑定设备，游戏工具仍必须登记身份。

# 本机开局与 Linx 接入

## 工具调用失败排查

灵矽自带时间工具成功不代表游戏 MCP 已连通。服务保留最近 100 条 MCP 请求诊断，仅管理员可读，不记录令牌、工具参数或游戏回复。诊断在重启后清空，不能追溯启用前的请求。

```powershell
node --env-file="$env:LOCALAPPDATA\LinxNight-local.env" scripts/diagnose-mcp.mjs
```

在灵矽重新调用一次 `get_public_game_state`，再运行命令。没有新记录时检查控制台 URL、MCP 关联和工具调用是否真正发出；HTTP 401 检查认证 Header；`unknown Linx session` 表示需登记会话与房间座位。诊断中的身份头仅作为管理员核对线索，不能将未知请求自动绑定为房主或玩家。已绑定的等待大厅允许查询状态；开局并不会自动登记会话。

`sessionId` 可用于管理员 `POST /admin/bindings`，请求体为 `{roomId, seatId, role: "player", sessionId}`；需要已有房间及占用座位。重新拨打可能产生新 Session，需重新登记；设备与 Agent 身份稳定时可使用下方 bind 脚本。查询诊断不会自动创建房间、授权或绑定。

## 启动

使用 Node.js 22 或以上。在项目目录运行 `node run.mjs`，统一启动 API 5000、网页 5010、MCP 9091。不要再分别启动 API 和 MCP：它们必须在同一进程共享房间。重启会清空房间和绑定。

PowerShell 设置独立的随机管理员令牌，另设 MCP 令牌：

```powershell
$env:ADMIN_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:MCP_AUTH_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
node run.mjs
```

打开 http://localhost:5010 ，创建房间。其他真人在独立浏览器标签页打开相同网址，输入房间号加入；身份保存在每个标签页的 sessionStorage。所有人加入后由房主开始。未登记 Linx 的空位由本地规则机器人每两秒行动一次，支持先测试完整文本局。它们不是大模型，不提供智能推理或真实语音。

网页提供身份、队友、预言家查验和女巫刀口；在对应阶段输入发言、选择目标、用药或投票。规则机器人女巫默认不用药。当前投票平票不处决，进入下一夜。

## 公网与 Linx 控制台

参考官方文档 https://linx.qiniu.com/docs/xrobot/mcp/software-mcp 。平台在设备 WebSocket 会话中自动携带 X-Linx-Device-Id、X-Linx-Agent-Id、X-Linx-Session-Id，不必让模型生成这些字段。

1. 运行 `cloudflared tunnel --url http://127.0.0.1:9091`，保持进程运行。
2. 在 Linx 的 MCP 服务管理中选择 Streamable HTTP，添加 MCP URL：`https://隧道域名/mcp`。
3. 若控制台支持认证请求头，设置 `Authorization: Bearer <MCP_AUTH_TOKEN>`。官方页面未说明认证字段具体位置；若当前界面不支持自定义头，不要假定可以填写或撤掉生产认证，需要确认平台认证能力。先用本机集成测试验证协议。
4. 创建主持人 Agent，采用 apps/mcp/prompts/host.md；创建玩家 Agent 模板，采用 apps/mcp/prompts/player.md；分别绑定上述 MCP 服务。
5. 在平台设备测试或设备 WebSocket 会话中获得实际 Device ID 和 Agent ID。先创建网页房间并开始游戏，记录要分配给 Linx 的 AI 座位，例如 P2。
6. 在本机另一个 PowerShell 中设置与启动进程一致的 ADMIN_TOKEN，执行下面的登记命令。管理员 Token 不配置进 Linx。

```powershell
node scripts/bind.mjs 房间号 P2 设备ID 玩家AgentID player
node scripts/bind.mjs 房间号 P1 主持设备ID 主持AgentID host
```

收到 `registered:true` 后，该设备+Agent 固定绑定对应房间；玩家座位停止本地机器人自动行动。主持人不占用或控制 P1，最后一个参数 host 表示只读主持身份。每个 AI 玩家必须使用不同设备身份或通过管理员 HTTP 接口指定独立 sessionId；同一个设备+Agent 不能同时代表多个座位。

7. 对主持人说“查询公开状态，播报当前阶段”。对玩家说“先查我的身份和公开状态，轮到我时调用工具完成行动”。夜晚用目标座位 P1～P9；白天按 currentSeatId 顺序发言。
8. 在网页确认行动和阶段已更新。未轮到、非法角色或未登记设备应被拒绝。

## 验证与已知边界

`node tests/integration.mjs` 验证 API/MCP 共享房间、真实 HTTP SSE endpoint/message、身份隔离及四种人数比例的程序模拟。现有单模块测试仍可执行。

本项目尚无经验证的服务端主动唤醒 Linx 能力。绑定 Linx 的玩家需要在对应设备会话手动发起交互；不能把它描述为自动 AI 语音局。ASR/TTS 由 Linx 的设备会话配置和提供，当前网页不内置 Linx 音频客户端。

HTTP API 仍使用开发阶段玩家标识，勿将 5000/5010 公开到不可信网络；本机测试只映射 MCP 9091。管理员接口要求独立 Token。房间、事件、设备绑定均为内存数据。完整断线托管、持久化以及猎人死亡时暂停流程仍需后续完善，不能声称正式版本已验收。

## 当前电脑已启动的实例

已用 `node --env-file` 加载本机环境文件启动统一进程。令牌文件为 `%LOCALAPPDATA%\LinxNight-local.env`，不在仓库内，不要提交或把管理员令牌填进 Linx。获取 MCP_AUTH_TOKEN 时在本机打开该文件即可。

登记时可直接加载同一环境文件：

```powershell
node --env-file="$env:LOCALAPPDATA\LinxNight-local.env" scripts/bind.mjs 房间号 P2 设备ID 玩家AgentID player
```

重启统一进程：

```powershell
node --env-file="$env:LOCALAPPDATA\LinxNight-local.env" run.mjs
```
# 浏览器语音输入

在轮到真人发言时，页面提供“语音转文字”按钮。它使用浏览器原生 `SpeechRecognition`（部分浏览器名称为 `webkitSpeechRecognition`）生成可编辑草稿；识别结果不会自动调用游戏接口，必须检查文字后点击“确认并提交发言”。

语音识别依赖浏览器麦克风权限和安全上下文。`http://localhost` 通常可用于本机开发，公网访问应使用 HTTPS。浏览器不支持、拒绝麦克风权限或识别失败时，直接在发言文本框输入即可继续游戏。当前入口只支持真人发言，夜间技能、投票和猎人行动仍使用页面的目标选择与确认按钮。

## 真人在线状态与托管

页面每 10 秒向当前房间发送本人心跳；超过 30 秒未收到时显示离线，但不会自动托管。浏览器后台节流也可能显示离线，再次心跳会恢复。已开局时可以主动点击“交给规则机器人托管”，明确由本地规则机器人完成后续合法行动；点击“恢复本人控制”后自行操作后续回合，已经提交的行动不回滚。

托管不会创建灵矽身份，也不会把规则行为计为 Linx 成功。当前玩家标识沿用本机开发模式，不可将 API 直接开放到不受信任公网。浏览器刷新继续使用当前标签页的身份；进程重启后内存房间失效。

语音清除、提交、房间/阶段变更或页面退出会取消识别；旧识别结果不再写入草稿。此处仍是浏览器 ASR，尚非 #44 要求的 Linx 网页音频。
