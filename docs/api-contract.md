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
```

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
