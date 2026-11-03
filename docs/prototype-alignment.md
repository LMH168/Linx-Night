# 新原型正式接入

基线：2026-11-03 已迁入 `C:\Users\Administrator\Desktop\Linx-Night` 正式项目，重新同步 main `72cbb3e`（保留 #226 真人原声直接提交与转写发布修复），视觉参考 feat/prototype-eclipse-council `a3ae5af`。开发分支 `codex/live-prototype-integration`。先前在原型目录形成的两笔改动已 cherry-pick 到此处。

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

## 视觉与运行

正式入口 `apps/client-vue/index.html` 和 `game.html` 共用 `App.vue`，未使用原型引擎。摄影背景、光照层、TableTop 和等弧长算法来自原型参考版本；席位、权限、倒计时、SSE 和声音全部继续使用正式接口。减少动态效果支持系统设置和页面开关。结算翻牌只读取已认证的 settlement 响应；重连不补播历史动画。最新原型独立快照保存在本地 `artifacts/eclipse-live/reference-prototype/prototypes/eclipse-council`，原型远端分支和原有 stash 均保留。

前端构建：`node node_modules/vite/bin/vite.js build --config apps/client-vue/vite.config.ts`。输出 `apps/client-vue/dist/index.html` 与 `game.html`，需要 HTTP 服务及真实 API，不能双击作为脱离后端的单文件游戏。

本机启动正式后端时先加载现有 Linx 配置并确保 `PORT=5100`（与本地客户端默认值一致），执行 `node run.mjs`；再执行 `node node_modules/vite/bin/vite.js --config apps/client-vue/vite.config.ts --host 127.0.0.1`。也可以用页面 `?api=...` 指向实际 API 地址。不要将仅供 UI 验证的模拟控制器服务用作真实游戏后端。

最终验证：类型检查通过；在 main 72cbb3e 基线上重新验证：Vue 12 个测试文件、31 个测试通过（含授权报告到达前不翻牌、重连不重播、动画不能推进游戏）；生产构建通过。后端语法及 domain/API/权限隐私/SSE/MCP/回合/控制器/实时语音/播放回归共 61 条命令通过。构建仍有原有独立 3D werewolf 入口的大包提示；jsdom 无 canvas 的提示不影响测试。

浏览器实际检查 1600×1000、1280×800、390×844 的大厅和对局，验证创建房间、空位移动、与 AI 交换、刷新恢复及授权结束结算。手机大厅整页滚动且无横向溢出；截图位于 `artifacts/eclipse-live/`。浏览器验证使用隔离的本地 API 和模拟控制器；没有据此宣称实际 Linx 音色或主持工具已验收。

当前进程未配置 LINX_HOST_PROFILE、LINX_HOST_AGENT_ID、LINX_AGENT_ID、LINX_MCP_ADMIN_URL、MCP_AUTH_TOKEN，两个项目目录也没有 .env；因此真实 Linx 主持、真人麦克风与实际音色联调尚未完成。

## 迁移与本地改动保护

本次实际交付目录是 `C:\Users\Administrator\Desktop\Linx-Night`。原分支 `codex/latency-streaming` 及其已有提交完整保留。原有 8 个已修改文件和 84 个未跟踪文件已逐文件 SHA-256 校验备份到 `C:\Users\Administrator\Desktop\Linx-Night-backup-20261103-141159`，并保存为命名 stash `preserve latency-streaming local work before prototype migration 2026-11-03`。旧实验分支的屠边、PK、旧客户端样式修改没有混入本次主线实现。没有与主线冲突的未跟踪素材、工具已恢复到项目目录；冲突文件的原件仍在备份及 stash 中。
