# 灵矽程序客户端（第二批协议探针）

关联 #44 / #48。此客户端独立于 `run.mjs`，不会驱动正式房间，也不是自动混合局调度器。无需实体硬件；首次仍需在控制台激活两个软件身份，之后连接和发送音频不使用网页拨打。

## 安装

需要 Node.js 24 和 npm。只有 node.exe 的便携运行时不含 npm；可安装 Node.js 官网的 Windows LTS 安装包（勾选 npm），重新打开终端后执行：

```powershell
node --version
npm --version
npm ci --ignore-scripts
```

开发机已将官方 registry 的 npm 包下载到 `%LOCALAPPDATA%\LinxNight-tools\npm\package` 并核对 registry 公布的 SHA512 integrity；这不是 npm 的全局安装。该机器也可使用：

```powershell
node "$env:LOCALAPPDATA/LinxNight-tools/npm/package/bin/npm-cli.js" ci --ignore-scripts
```

## 首次激活

```powershell
node scripts/linx-client.mjs init player-a
node scripts/linx-client.mjs init player-b
node scripts/linx-client.mjs activate player-a
# 在控制台输入显示的激活码，关联专用测试 Agent；程序最多等待 5 分钟。
node scripts/linx-client.mjs activate player-b
```

使用同一个专用玩家 Agent，启用 Function Call、关闭跨会话记忆，保存其独立测试 MCP 关联。不要改现有游戏 Agent。身份位于 `%LOCALAPPDATA%\LinxNight\profiles`，重复 init 不会重置；删除身份会需要重新激活。不要提交该目录。平台管理 API Key 不参与此流程；会话 Token 仅留内存，MCP Token / ADMIN_TOKEN 仍在独立 lab 配置文件中。

## 连接和音频输入

```powershell
pwsh -NoProfile -File scripts/linx-audio.ps1
node scripts/linx-client.mjs connect player-a
```

连接后的交互命令：

```text
status
send C:/Users/Administrator/AppData/Local/LinxNight/audio/query.wav
send C:/Users/Administrator/AppData/Local/LinxNight/audio/speech.wav
send C:/Users/Administrator/AppData/Local/LinxNight/audio/vote.wav
close
```

路径按实际 Windows 用户调整；可使用双引号包住含空格的路径。两个客户端在两个终端分别 connect。只有 lab 管理员确认并登记座位后才能发送写行动音频。首次未绑定查询返回 unknown session 是预期的身份发现过程，不代表游戏查询验收通过。

程序发送 16kHz、单声道、16 位 PCM，每 20ms 640 字节，末帧补零；输入最长 30 秒。hello 必须确认 PCM/16kHz/单声道；若返回 Opus，报 `PCM_NOT_CONFIRMED` 并关闭。这是本批待确认的平台兼容关卡，不能忽略协商继续发送 PCM。

`ACTION_INTERRUPTED_OR_TIMEOUT` 表示观察窗口超时或连接中断；查询服务端证据后创建新场景再重试，不自动重发行动。`turn_finished` 只表示收到 TTS stop，`gameAccepted` 始终为 `unverified`；是否成功必须用 MCP 请求、行动和网页事件证明。

## 证据、错误与退出

每次 connect 在 profile/evidence 下写一个 JSONL，记录匿名运行 ID、音频发送、STT 时间（不含文字）、TTS 状态和错误码。profile/connection.json 是本机管理员核对用的原始身份，可能是已关闭连接的历史记录，不能单凭该文件认定连接有效或自动授权。真实会话以当前连接和已认证 MCP 诊断共同核实。

连接错误、音频超时会关闭 WSS；`close` 或 Ctrl+C 退出。原始语音不播放、不进入公共页面，不记录模型回复。没有收到 TTS stop 时即使行动已被接受也可能被记为超时，必须以服务端事件裁决，不能重试覆盖证据。

## 测试

```powershell
node --test apps/linx/test/*.test.mjs
```

本地模拟 OTA/WS 仅验证协议处理，不证明真实灵矽可行动。依据：[OTA](https://linx.qiniu.com/docs/xrobot/platform/OTA)、[WebSocket](https://linx.qiniu.com/docs/xrobot/platform/websocket)。没有使用私有控制台接口、Cookie、listen.detect 任意文本推理或 text_response 推理假设。
