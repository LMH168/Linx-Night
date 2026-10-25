# 本机自动灵矽回合（#64）

统一入口 `node run.mjs` 使用已激活 profile 建立连接。房主开局后只为配置为 Linx 且未被真人占用的座位连接；其余空位仍为明确标记的规则机器人。默认 P2/P3 为 Linx，支持一真人、两 Linx、六规则机器人的开发局。

## 一次配置

1. 安装依赖：`npm ci`。
2. Windows 使用 `powershell.exe -NoProfile -File scripts/linx-audio.ps1` 生成单声道 16kHz PCM `turn.wav`。触发音频目标控制在 1～2 秒，硬上限为 5 秒；超过上限会在准备阶段拒绝。脚本采用 UTF-8 BOM，兼容 Windows PowerShell 5.1。
3. 本机环境配置 `LINX_AGENT_ID`、`LINX_PROFILES=player-a,player-b`、`LINX_MCP_ADMIN_URL=http://127.0.0.1:9091`、`LINX_MCP_ADMIN_TOKEN`、`MCP_AUTH_TOKEN`、`ADMIN_TOKEN`。可用 `LINX_TURN_WAV` 指向自备的通用中文行动音频。
4. Agent 保持 Function Call、无跨会话记忆，绑定公网 HTTPS `/mcp` 和 MCP Token。更新 `apps/mcp/prompts/player.md` 的租约指令，重新连接刷新工具列表。
5. 启动后只在游戏网页创建/加入/开始，无需日常手动绑定。缺少配置/音频/已激活身份会显示准备失败，不伪造 ready。

## 一回合如何执行

服务端选择当前合法座位 → 确认连接 → 创建租约 → 发送通用音频 → Agent 查询自己的 `currentTurn` → 携带 `turn_id` 提交行动 → 服务端同步完成租约并发布事件。健康 Linx 会话会跨回合复用，仅在断线、Session 失效、回合失败或房间结束时释放。白天 AI 发言的公共播放完成确认是推进下一席的唯一门槛；原始回复音频始终不公共播放。

当前 AI 发言播放期间，调度器可以对下一席执行连接预热，但“下一席连接预热”和“下一席行动”是两个不同状态。预热不会创建 `turn_id`、发送 `turn.wav`、调用下一席 MCP 写工具，也不会改变 `currentSeatId`、阶段或投票状态。只有当前播放完成或房主明确跳过，服务端重新校验游戏、回合、阶段、座位和 `controllerEpoch` 后，才会创建下一席行动租约。

狼人可在自己的私密状态读取 `wolfProposal` 并跟随；公共 API/SSE 不公开夜间租约座位或提案。回合租约不是公开夜间行动广播。

超时、连接或工具失败时暂停该座位并保留 Linx 控制来源，页面房主可点击“重试 AI 回合”。不自动切为规则机器人，也不自动重发已经成功的行动。旧 Session/Epoch/turn_id 均无权继续写入。猎人沿用 30 秒窗口，届满视为放弃；其他 Linx 回合等待 60 秒后显示失败。

## 验证边界

`npm run test:runtime` 验证模拟客户端 + 真实 HTTP MCP 的所有阶段、租约、两席串行、会话复用、预热门控、旧会话、超时等待、权限重试和取消竞态。它不是平台端到端证据。

真实多昼夜仍需独立测试 Agent 的公网 MCP 可达、平台 tool 记录和服务器事件对应。#64 在真实验收前保持开放。健康会话跨回合复用可减少连接和绑定等待；房间结束、取消、服务关闭或会话异常时必须释放。房间仍在内存中，重启须重建。

## 延迟诊断

管理员诊断时间线只保存匿名 ID、状态、耗时和错误码。按时间顺序检查：触发音频读取/发送、WSS/hello 连接、Agent 推理、MCP 请求、主持 TTS 生成，以及浏览器 `audio.onended` 播放确认。连接复用应显示 `connection_reused`；首次连接显示 `connection_started` 和 `connection_ready`。若预热显示 `ready` 但没有 `lease_created`，属于预期行为，必须等待当前播放确认。若出现旧 `gameId`、`turnId` 或 `controllerEpoch` 的结果，服务端应记录 `stale_result_rejected` 并保持房间快照不变。

## 页面检查

`docs/evidence/runtime/retry.png` 是独立模拟故障房间的浏览器截图。已点击“重试 AI 回合”，确认错误提示与重试按钮消失。只证明页面交互，不是灵矽平台成功证据。

## MCP 就绪门槛

WSS hello 不代表游戏 MCP 可用。自动绑定前最多等待 15 秒，在受保护诊断中核对已认证且成功的 initialize/tools/list 请求，Session、Device、Agent 必须与新连接一致。没有匹配记录则显示 MCP_DISCOVERY_TIMEOUT，留在准备失败，不分配角色。检查测试 Agent 的 MCP URL、认证、独立保存关联，以及隧道是否仍运行；修复后由房主重试。旧 Session 或陌生设备的发现请求不能满足门槛。

## #77 短音频迁移与诊断

重新运行 `scripts/linx-audio.ps1` 生成 `turn.wav` 与 `hunter.wav`，两者均须不超过 5 秒。自定义路径分别使用 `LINX_TURN_WAV`、`LINX_HUNTER_WAV`。旧的约 25 秒通用音频将被拒绝。同步更新玩家 Agent 人设为仓库 `apps/mcp/prompts/player.md` 的规则，短音频只负责通知，不承载整套协议说明。

房间事件发布后唤醒串行调度，2 秒轮询继续兜底。猎人窗口仍为死亡后 30 秒，连接耗时计入窗口；窗口自然结束不作为下一阶段可重试故障。自身私密状态新增 `hunterAction`，包含窗口、期限、合法目标及开枪/放弃能力。

管理员 `/admin/diagnostics` 新增最多 100 条 `timeline`：领域事件、调度选中、连接就绪、租约、输入开始/结束、STT 到达和结果。与原有 MCP `requests` 关联分析，及时导出；不包含转写正文、原始音频和 Token。时间仅表示本机观测，不推断平台内部耗时。模拟回归不代表真实猎人通过。
