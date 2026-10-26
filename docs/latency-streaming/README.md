# 延迟优化实验分支

## 截止版本与交付边界

分支 `codex/latency-streaming`。起始本地 main 为 `d334fd031f7d94c232bad85daa37a093d942811e`，起始远端 main 为 `eaf969a7d936d36601bd26c432bef65fd8bed60e`。两者原本不同；实验分支快进到远端截止版本，本地 main 保持不动。本次禁止向 main 提交、合并、变基或推送，不创建 PR。保留未跟踪 logo 和 pr118-2.md。

## 已实现的步骤

1. 修复 MCP 成功行动缺失的 recordTurn 导入，沿用行动幂等测试。管理器等待同一座位未结束的原始请求，再允许复用连接；原请求超时仍会安全关闭旧连接并在后续重新连接，可能保留额外等待，不启用未经实机证明的 abort。
2. 记录公开音频入队、出队、连接起止、合成请求、首块、末块、tts.stop 和浏览器开始/结束确认。管理接口 `/admin/diagnostics` 需要管理员凭据。服务器诊断为服务器 UTC 时间，浏览器只上传 performance.now 的相对毫秒，不能拿两台机器时间相减。首块与末块可分别计算首包和完整接收等待；浏览器数据单独分析。
3. speakPublic 在 sentence_start 累积前缀校验后发布 PCM，最终全文必须一致。只合成服务端已接受的公开文本，不转发 Agent 原始回复。发现不匹配立即终止并暂停；已经播放的内容无法撤回。
4. 每个合成尝试只有一个缓存与 attemptId。流订阅不触发合成。单声道 16kHz PCM16LE、每次最多 60 秒、最多 6000 块；慢客户端超过输出缓冲限额断开。保留完整 WAV 旧接口，完成、跳过和取消释放缓存。
5. Web Audio 累积约 250ms 后开始，短音频在 end 后开始，缓冲不足就等待。只有合法 end、块数与样本数一致、最后一个 source 的 onended 到达才确认。上一席确认或跳过之前不推进游戏。真人发言仍不进入公共 TTS。
6. 房主发开始及完成确认；其他真人只收听。完成前失败自动重试一次的规则依服务端收到的播放开始标记区分：开始播放后失败暂停，手动重播产生新 attemptId，旧确认拒绝。房间切换、停止、SSE 断开、卸载都取消本地声音，不自动确认，重新启用表示明确从头播放。
7. 新增固定文本测量脚本、音频/文本触发探针、短通知生成选项及受控流、HTTP 身份、浏览器完成门控、八席连续发言、重播隔离测试。

## 协议

所有 host 路由沿用已有 `x-player-id` 房间参与者校验（不是新认证体系）。

- `GET /api/rooms/{id}/host/state`：task 增加 gameId、attemptId。
- `GET /api/rooms/{id}/host/stream?task_id=...`：Fetch 读取 application/x-ndjson；无查询令牌。
- 每行含 gameId/taskId/attemptId；start 含 sampleRate=16000、channels=1、format=s16le；audio 含从 0 连续递增的 seq 和 Base64 data；end 含 chunks/samples；error 含受控 code。
- `POST .../host/started`、`.../host/interrupted`：仅房主，body 含 task_id/attempt_id。
- `POST .../host/played`：仅房主，必须带 task_id/attempt_id；可带 firstPlayMs/playbackMs 相对耗时。错误或缺失尝试 ID、迟到及重复确认不得推进。
- 现有 audio WAV 读取和 skip 保留；retry 支持失败任务和就绪任务整段重播。旧版不带 attempt_id 的确认客户端需要同步升级。

## 独立环境运行

不要改原 `%LOCALAPPDATA%\LinxNight-runtime.env`，复制成仓库外实验文件，设置独立端口，例如 PORT=5200、CLIENT_PORT=5210、MCP_PORT=9291，同步 LINX_MCP_ADMIN_URL 和实验 Tunnel。独立激活并绑定实验用 profile/Agent，不能与原运行房间共用设备身份。使用新房间和新浏览器页，API 指向 5200。

```powershell
node scripts/start-local.mjs "$env:LOCALAPPDATA\LinxNight-latency-experiment.env"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/linx-audio.ps1 -ShortTriggers -OutputDirectory "$env:LOCALAPPDATA\LinxNight-latency-experiment\audio"
node scripts/latency-benchmark.mjs latency-streaming-experiment "$env:TEMP\latency-synthesis.json" 音色ID
node scripts/latency-trigger-probe.mjs latency-streaming-experiment audio "$env:LOCALAPPDATA\LinxNight-latency-experiment\audio\turn.wav" "$env:TEMP\trigger-audio.json"
node scripts/latency-trigger-probe.mjs latency-streaming-experiment text - "$env:TEMP\trigger-text.json"
node tests/latency-streaming.test.mjs
node tests/host-browser.test.mjs
```

benchmark 固定两段公开文本，每段五次独立连接，保存连接、首块、完整接收时长及中位数、范围和失败数，不保存音频、文本、身份或 Token。它只提供传输观测和最早可能播放时刻，不能当作浏览器实测，也不能当作两个独立版本的性能对照。请另用截止版本与实验版本各五次、同音色/文本/网络、前台 Chrome/Edge 且开启音频权限采样；从受保护诊断取相对 firstPlayMs，目标中位数 ≤1000ms。首包慢并不会被流式播放自动消除。

## 未完成的实机实验与限制

当前未提供独立已激活实验 profile，十次本地探测均在身份加载阶段失败，未向平台发合成请求。这不是平台慢的证据。没有真实基线/流式各五次、浏览器首播指标、通知识别或 abort 复用报告，不能声称性能验收通过。

触发探针默认只证明传输，不会伪造 MCP 接受结果。后续需在独立 MCP 环境逐次核对正确座位查询、当前租约行动被接受、旧租约拒绝、无重复行动；文本触发连续十次通过后再增加 LINX_TURN_TRIGGER=text。目前生产运行仍只走 audio；探针 text 不含 text_response，不自动回退。abort 同样等真实连接可复用及旧结果隔离证据后再启用。未缩短玩家策略或默认发言长度。

已有项目使用玩家 ID 作为身份凭据，本实验继承这一边界；不能把它描述为更强的用户认证。Web Audio 流式校验后续文本错误不能撤回先前播放内容。网络中断后由房主决定重播或跳过。

## 验证记录与剩余工作

见 validation.json：52 个 test.mjs 中 43 通过，9 个失败；9 个均在远端截止提交的干净临时副本复现，不宣称全绿。主要为旧工具数断言、未满九席启动、遗言引入后的猎人/结算断言及旧回合重复响应预期。更新了本次触及的播放测试、配置和生命周期夹具，未改无关规则以迎合旧测试。

后续顺序：配置独立身份/端口 → 采集两版五次基线 → 前台浏览器验证完整音频和 ≤1 秒指标 → 通知音频与文本各轮租约核对 → abort 实验 → 写脱敏性能报告。真实验证前本分支为实验版，保留平台验收未完成状态。

回滚仅切回截止版本运行环境，不合并或修改 main；实验缓存仅内存存在，重启清空测试房间。
