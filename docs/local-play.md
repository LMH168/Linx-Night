# 本机开局与 Linx 接入

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
2. 在 Linx 的 MCP 服务管理中添加 SSE URL：`https://隧道域名/mcp`。
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
