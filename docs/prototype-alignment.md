# 新原型正式接入

基线：2026-11-03 同步 main `05ed11b`，视觉参考 feat/prototype-eclipse-council `a3ae5af`。开发分支 `codex/prototype-live-alignment`。原工作目录的本地改动未覆盖；原型 stash 保留。

## 增量契约

`POST /api/rooms/{room_id}/seat-change`：认证沿用 `x-player-id`，请求 `{target_seat_id, version, action_id}`。只移动认证真人本人；允许空位/AI 交换，禁止其他真人；准备及开局后锁定。整个检查和交换同步完成，不跨 await。返回 `{player:{seatId}, state}`，版本过期为 409，客户端必须刷新后重新选择；同一 action_id 可幂等重试。公开 SSE 事件 `room.seat_changed` 仅包含两个位置 ID。

正式 Linx 房间启用 `requireHostConfirmation`。首次及所有后续入夜统一 NIGHT_ANNOUNCEMENT，保持黄昏。独立主持的生产绑定会话调用 MCP `confirm_night({game_id,window_id})`；校验房间、游戏、控制器代次、HOST 身份和当前窗口。真人/房主 actions/announce_night 不可绕过。重复确认不创建第二个任务。

确认产生 `game.night_confirmed` 和唯一 `night-announcement` 播放任务；只有匹配 task_id/attempt_id 的成功 /host/played 才开放 NIGHT_WOLF。首次入夜不增加 round，随后各夜增加一次。失败、超时和 skip 均不推进，禁止自动跳过该任务；继续使用 /host/retry 恢复播放。主持未成功调用工具时，房主可 POST /host/retry-confirmation 重新请求 AI 确认，不能自行确认。

公共任务区分 host / speech / lastwords / night-announcement。AI 遗言由该 AI 会话提交并用席位声音播放原文；真人使用已有实时音频，避免主持转述和重复 TTS。遗言提交后保留 LAST_WORDS，待原声/席位播放确认后才关闭播放门并继续。首夜遗言接白天；放逐/猎人/PK 平票后接主持确认。等待前序公共任务期间不消耗新遗言窗口。

不改主线胜负、角色配置、狼人多数票或语音转写规则。不部署。

## 验证记录

实施前：客户端 TS 检查、27 个 Vue 测试、domain engine、API、host playback、MCP 测试通过。

新增 `tests/prototype-alignment.test.mjs`：真实 HTTP 并发版本冲突、认证、AI 信息交换、准备锁定；首次夜晚、失效播放回调、失败与重试、不能跳过入夜播报、AI 遗言声音及播完再推进、首夜遗言接白天、PK 无人出局、生产绑定主持 MCP 权限。

真实 Linx 主持工具、麦克风和音色仍需本机实际配置联调；模拟传输测试不能代替听感验收。
