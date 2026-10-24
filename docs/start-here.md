# 当前交付与本机开始游戏

## 当前状态（2026-10-24）

| 能力 | 代码与测试 | 真实平台状态 |
|---|---|---|
| 软件客户端/会话自动绑定 | #49/#50、#52/#53 已合并 | 历史已有程序写行动，#45/#48 平台记录核对仍缺失 |
| 猎人死亡窗口 | #63，30 秒/开枪/跳过/过期 | 规则和 HTTP/页面回归通过 |
| 自动音频回合/租约/失败重试 | #65 | #64 待真实连续多昼夜 |
| 真人在线状态/显式规则托管/恢复 | #67；#66 已关闭 | 本机 API/页面验证通过 |
| 网页 Linx 转写/公共指定播报 | #69 | #68 待独立语音身份激活及实机听检 |
| 完整混合局 | test:delivery 两组模拟到 GAME_OVER | 不等于真实 Linx 完整对局 |

开发基线为 1 真人 + 2 Linx（默认 P2/P3）+ 6 规则机器人，不再要求七真人。真人观察员的自动化操作必须标作脚本模拟。尚未完成整体验收，#44 保持开放。硬件和生产持久化不是本 Issue 范围。

## 一次配置

1. 安装 Node.js 22+ 与 npm，运行 `npm ci`。若当前电脑 Node 包缺少 npm，请安装官方 Node.js LTS（包含 npm），不要下载陌生安装脚本。
2. 激活 `player-a`、`player-b` 并关联同一玩家 Agent；启用 Function Call、关闭跨会话记忆，采用 `apps/mcp/prompts/player.md`。
3. 运行 `powershell.exe -NoProfile -File scripts/linx-audio.ps1` 生成回合 WAV。
4. 在仓库外保存环境文件，例如 `%LOCALAPPDATA%\LinxNight-play.env`。值由本人本机填写，不提交仓库：

```dotenv
ADMIN_TOKEN=独立随机管理员令牌
MCP_AUTH_TOKEN=另一独立随机MCP令牌
LINX_AGENT_ID=玩家AgentID
LINX_PROFILES=player-a,player-b
LINX_SEATS=P2,P3
LINX_MCP_ADMIN_URL=http://127.0.0.1:9091
LINX_MCP_ADMIN_TOKEN=与ADMIN_TOKEN相同
# 可选网页语音：先按 web-voice.md 激活独立身份
# LINX_VOICE_PROFILE=web-voice
```

5. 运行 `cloudflared tunnel --url http://127.0.0.1:9091`。在玩家 Agent 关联的 MCP 中填写当前 `https://…trycloudflare.com/mcp`、Streamable HTTP、Normal 认证，Header `Authorization` 的值为 `Bearer ` 加 MCP_AUTH_TOKEN。独立保存 MCP 关联及 Agent 配置。隧道重启地址可能变化，需同步更新。
6. 网页语音配置见 [web-voice.md](./web-voice.md)。独立语音 Agent 无需游戏 MCP；未配置时文字和按钮仍可使用。

## 每次启动

```powershell
node scripts/start-local.mjs "$env:LOCALAPPDATA\LinxNight-play.env"
```

启动器先检查文件、WAV 和基础变量，页面仅监听本机。该检查不验证平台激活、余额或公网连通，连接失败仍会在准备阶段显示。

打开 http://localhost:5010，创建房间；如有朋友使用本机其他浏览器上下文加入，再点开始。无需复制 Session 或手动 bind。全部 Linx 准备好才分配角色。失败可重试或取消，不会静默变成规则机器人。

轮到真人时按页面角色操作。语音只是草稿，检查后提交；夜间技能与投票仍可直接用按钮。托管按钮明确交给规则机器人，恢复不撤销已完成行动。猎人窗口到期自动放弃。

不要把 API/网页端口映射到公网。当前玩家标识不是生产认证，局域网远程多人需另行完成 HTTPS 和身份保护。房间在内存中，停服重启必须新建。

## 实机验收步骤与记录

1. 独立端口 5100/5110/9191，独立隧道与测试 Agent，现有正式房间保持不动。
2. 在网页正常创建并开始，验证 P2/P3 自动连接和绑定，无手动 Session 登记。
3. 真人按角色操作；其他六席明确为规则机器人。观察至少连续两个昼夜的 Linx 发言、投票和适用夜间技能。
4. 按 requestId/actionId/eventIds 对齐 MCP 诊断、服务端事件、网页变化及平台工具记录。口头“成功”不算；不得把手动 HTTP 或脚本模拟冒充 Linx。
5. 中断连接或隧道，确认失败显示、旧会话拒绝、房主重试；取消、结束释放连接和绑定。
6. 独立语音身份：实际录音→转写草稿→手动确认；启用公开播报并听检指定内容，停止及刷新无历史重播。拒绝麦克风权限时文字仍可操作。
7. 记录总尝试/成功/失败及时间；平台记录缺失写明未验收。结束后关闭测试连接和实例，保存脱敏报告。

## 自动化

`npm run test:delivery` 包括配置检查及两组完整模拟混合局。`npm run test:runtime` 验证实际 HTTP MCP 租约与超时；`npm run test:voice` 验证语音协议与网页异步取消。其余 domain/api/mcp/client/linx/lab/hunter 回归仍需运行。模拟全部通过也不关闭 #44/#64/#68 的真实验收项。
