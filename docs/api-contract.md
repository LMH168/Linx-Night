# API 协议基线

所有 ID 使用字符串。写操作携带 `idempotency_key`，服务端按键保证重复请求不会重复结算。

## REST

```text
GET  /health
POST /api/rooms
POST /api/rooms/{room_id}/players
POST /api/rooms/{room_id}/start
GET  /api/rooms/{room_id}/state
GET  /api/rooms/{room_id}/private-state
POST /api/rooms/{room_id}/speeches
POST /api/rooms/{room_id}/actions
POST /api/rooms/{room_id}/votes
PATCH /api/rooms/{room_id}/players/{seat_id}
POST /api/rooms/{room_id}/end
GET  /api/rooms/{room_id}/settlement
GET  /api/settlements/{settlement_id}
```

创建房间响应同时返回内部 `room_id` 和对外使用的六位数字 `room_code`；公开状态中的对应字段为 `roomId` 和 `roomCode`。`{room_id}` 路径参数也接受六位数字房间码，服务端会统一解析为内部 UUID。房间码仅用于定位房间，现有 `x-player-id` 身份和权限校验保持不变。

成功响应统一返回业务数据；失败响应格式为：

```json
{
  "error": { "code": "INVALID_PHASE", "message": "当前阶段不允许该操作" }
}
```

## WebSocket

连接成功后发送当前公开快照。事件格式：

```json
{
  "event_id": "evt_001",
  "version": 12,
  "type": "game.phase_changed",
  "room_id": "room_001",
  "data": { "phase": "SPEECH", "seat_id": "P3" }
}
```

客户端按 `version` 去重，重连时先请求最新快照。

## 九席开局与投票状态（#107）

九人房间必须先由真人加入或房主通过 `POST /api/rooms/{room_id}/players` 传入 `player_type: "ai"` 添加 AI，九个座位全部占用后才能调用开始接口。未满员时返回 `409`、错误码 `ROOM_NOT_FULL`，并返回 `occupied` 和 `missing`。房主可在 `LOBBY` 阶段通过 `PATCH /api/rooms/{room_id}/players/{seat_id}` 修改 AI 名称。

投票阶段公共状态提供 `submittedVoteRound` 和 `submittedVoteSeatIds`，只表示哪些座位已经提交投票。该投影不包含投票目标、票数或投票关系，结算后清空。

首次平票后，公共状态 `pk` 为 `{ round, stage: "speech", candidates }`，仍使用 `SPEECH` 阶段，候选人按席位号码递增发言；之后 `pk.stage` 为 `vote`，仍通过原 `/votes` 接口重投。仅非候选的存活玩家可重投，目标限 `candidates`；再次平票无人出局，进入下一夜。每轮已投席位分别统计，`voteResolutions.pk` 区分同一天首轮与 PK 重投；两轮结果均只在各轮投完后公开。无人可重投时记录零票 PK 结算并进入下一夜。

私密投影补充 `canAct` 表示本人当前行动资格；猎人仍以私密 `hunterAction` 窗口行动，公开阶段保持 `RESOLUTION`。真人发言窗口通过 `game.speech_window_opened` 通知刷新，`speechDeadline` 为实际服务端截止时间（兼容毫秒时间戳与 ISO 字符串）；PK 发言使用独立的截止时间和超时提交编号。

## 提前结束结算（#95）

房主调用 `POST /api/rooms/{room_id}/end` 后，服务端生成一次 `HOST_ENDED` 结算记录并释放控制器、主持播放和 MCP 绑定。重复调用返回相同 `settlement_id`。原房间随后从活动房间移除，状态和写操作拒绝；参与者可通过 room ID 或 settlement ID 查询报告，陌生玩家返回 403。

结算报告包含角色翻牌、存活状态、出局顺序、已公开发言、已完成投票统计、公开事件追踪和资源释放状态。报告不包含参与者认证清单、Token、Session、Device、模型原文、录音、私密查询或未公开目标。第一版报告保存在进程内存，服务重启后丢失。

## MCP 工具基线

工具名和参数由 MCP `tools/list` 返回。第一版计划提供：

```text
get_public_game_state()
get_my_private_state()
get_recent_speeches()
submit_speech(text)
submit_wolf_target(target_player_id)
submit_seer_check(target_player_id)
submit_witch_action(action, target_player_id?)
submit_hunter_shot(target_player_id)
submit_vote(target_player_id)
```

MCP 服务从 `X-Linx-Session-Id`、`X-Linx-Device-Id` 和 `X-Linx-Agent-Id` 建立会话映射，不接受模型自报 `player_id`。

## MCP 行动契约

九个工具名称保持不变。写工具接受可选 action_id（非空字符串）；重试复用，服务端拒绝重复写入，不缓存成功响应。target_player_id 接受 P1～P9 或玩家 ID，狼人、查验、猎人和投票必须提供；女巫 poison 必填目标。未知字段、错误类型及空文本返回工具 isError:true，包含 code、message、requestId。规则拒绝同样返回工具错误，不改变房间。身份/认证错误仍返回 JSON-RPC error，未知工具为 -32601，未知内部错误不向调用者暴露细节。

成功行动的 content.text JSON 包含 accepted、requestId、actionId、version、eventIds；查验另含 result。诊断可关联请求、行动及事件，仅管理员读取。game.vote_submitted 的公开 data 仅包含 voteId、seatId，不包含投票目标；最终结算仍由 game.vote_resolved 发布。

## 猎人响应窗口（#62）

猎人出局后进入 `HUNTER_RESPONSE`，公开状态 `hunterResponse` 返回 `windowId`、座位、状态和 `expiresAt`。30 秒内暂停后续阶段及胜负结算。固定九人局只有一名猎人；保留本项目原有规则：夜间被袭击、中毒或被放逐均可开枪，不扩展双猎人连锁规则。

- `GET /api/rooms/{room_id}/hunter-response` 查询窗口。
- `POST /api/rooms/{room_id}/hunter-response`：`action` 必须为 `shoot` 或 `skip`，必填 `window_id`；`shoot` 必填 `target_seat_id`，支持 `action_id`。
- 原 `actions` 的 `hunter_shot` 同样必须携带 `window_id`；不再允许绕过窗口开枪。
- MCP `submit_hunter_shot(target_player_id, window_id, action_id?)`；新增 `skip_hunter_response(window_id, action_id?)`。请在 Agent 重新连接后刷新工具发现。
- 缺少窗口、错误窗口、超时、已结束、错误角色、死亡目标或重复行动均拒绝且不改状态。到期由 API 服务定时处理，不开放客户端强制超时入口。
- 成功/跳过/到期仅生成一次 `game.hunter_response_closed`。技能随窗口关闭消耗；公开目标仅在开枪接受后出现。然后重新判断胜负，或恢复天亮后的发言、投票后的下一夜。
- 服务重启丢失内存房间与窗口，不支持持久恢复。自动化：`npm run test:hunter`。Linx 自动触发开枪仍依赖后续回合驱动，当前支持工具提交或超时跳过。

## 遗言窗口（#93）

符合资格的出局玩家依次进入 `LAST_WORDS`：首轮夜间死亡和白天投票出局允许遗言，第二轮及以后夜间死亡不允许。猎人先完成开枪、跳过或超时，再进入遗言。窗口默认 30 秒，文本最多 200 个字符，每名玩家每局最多提交一次。

- `GET /api/rooms/{room_id}/last-words` 查询当前窗口。
- `POST /api/rooms/{room_id}/last-words`：提交 `{ "text": "...", "action_id": "...", "window_id": "..." }`，或跳过 `{ "action": "skip", "action_id": "...", "window_id": "..." }`。
- MCP 遗言工具：`get_last_words_state`、`submit_last_words`、`skip_last_words`。工具只能操作当前会话对应座位和窗口。
- 公共状态及 SSE 公开 `lastWords`、`lastWordsHistory`，以及 `game.last_words_opened/submitted/skipped/expired`；不公开私密 Agent 回复、录音或内部字段。
- 重复 action、错误座位或窗口、迟到提交均拒绝且不改变快照；窗口只关闭一次，超时由服务端处理。
