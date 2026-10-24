# 第二批：程序直连灵矽联调

关联 #44 / #48。独立客户端见 [安装与连接](linx-client.md)。第一批 #47 未完成真实验收，本批不改变其结论。生产 `run.mjs` 和现有 Agent 保持原样。

## 一次性配置

1. 在专用测试 Agent 上启用 Function Call，关闭跨会话记忆，保留现有游戏提示词。关联独立 lab 的公网 HTTPS `/mcp` 和其 MCP Token，保存 MCP 关联。
2. `init player-a` / `init player-b`，分别运行 `activate`。将两个激活码关联到同一个测试 Agent，无需实体硬件。激活码过期重新运行 activate。
3. 在独立 lab 环境文件 `%LOCALAPPDATA%\LinxNight-lab.env` 增加 `LINX_TEST_AGENT_ID=实际测试AgentID`。保留不同的 ADMIN_TOKEN 和 MCP_AUTH_TOKEN，不复制到仓库或网页。
4. 用当前分支代码启动 lab（先导出并退出旧 lab；不能两个进程抢同一端口），以及到 9191 的独立隧道。Quick Tunnel 重启地址会变化，需更新测试 Agent 的 MCP URL。

```powershell
node --env-file="$env:LOCALAPPDATA/LinxNight-lab.env" scripts/linx-lab.mjs
# 另一终端
cloudflared tunnel --url http://127.0.0.1:9191
# 生成固定输入文件
pwsh -NoProfile -File scripts/linx-audio.ps1
```

不要把 API 5100 暴露到公网。网页 5110 按 lab 输出地址打开、正常加入 P1 后，在 lab 输入 `arm`。无需在灵矽控制台拨打。

## 单客户端：发言与投票

每个场景使用新房间和新连接，不能靠重试覆盖证据。

1. lab 输入 `scene speech`，网页加入 P1，lab 输入 `arm`。
2. 另一个终端 `node scripts/linx-client.mjs connect player-a`。
3. 先在 lab 输入 `recent`。实测连接时平台就会发起带身份头的 MCP 初始化/发现请求，可与本机 hello 核对后进入下一步。若没有这些请求，再发送 query 音频发现身份；未绑定查询可能长回复超时，超时后必须换新连接和场景。
4. 核对本机 profile/connection.json 和本次已认证诊断，在 lab 输入 `bind-program P2 player-a <实际SessionID>`。该命令还会验证 profile、Agent、连接时间和当前场景，不接受任意远端请求自动注册。
5. 再发送 query，确认查询成功，再发送 speech。核对实际 `submit_speech` 成功、P2 只有一条发言、当前席位 P3、网页未刷新自动更新。
6. 立即 `export`；保存平台工具记录和网页截图/录像，记录浏览器更新的时间。客户端 `close`。
7. 使用 `scene vote` 重复加入/arm/连接/查询/登记，然后发送 vote 音频。其他八票由夹具投 P3，P2 最后一票应只结算一次、P3 死亡、进入 NIGHT_WOLF。

若 hello 没有 Session，使用当前设备和测试 Agent 对应的已认证 MCP 请求里的 Session；若请求也没有可区分的 Session，记录技术阻塞，不能退回宽泛设备绑定伪造通过。

## 双客户端与重启

1. `scene dual-speech` → 网页 P1 加入 → `arm`。
2. 在两个终端分别 connect player-a / player-b，同时保持在线。
3. 各发 query，核对 recent，分别 `bind-program P2 player-a <SessionA>` 和 `bind-program P3 player-b <SessionB>`。
4. 各自再发 query，核对分别对应 P2 平民和 P3 狼人；私密回复不进入公共网页/报告。A 发送 speech 并接受后，B 发送 speech。网页显示两条公开发言，currentSeatId 为 P4。
5. 立即 export，记录两个会话同时在线的证据，关闭两个客户端。
6. 新建 speech 场景，退出并重新启动 player-a 进程。同一软件身份重新获取凭据，核对实际 Session 已更新，再查询/登记/发言。旧绑定由 scene 清除；旧会话请求应无权限。

不要在不同房间复用上一会话的上下文。若平台重启复用了 Session、同一 Agent 无法区分设备或并发被拒绝，记录实测事实，第二批关卡保持未通过。

## 证据与完成判定

`export` 将当前场景报告保存在 `%LOCALAPPDATA%\LinxNight-lab\evidence`，程序绑定的场景附带匿名 runId、发送/STT/TTS 时间、全部输入尝试、传输耗时和 MCP 请求/行动/事件。日志缺失或半行写入会标明 unavailable/incomplete，不补造证据。诊断仅最近 100 条，场景结束立即导出。

同一输入可能产生多个查询/写调用，因此导出只呈现关联材料，不按时间自动断言成功。审核时逐项填写 [报告](linx-batch2-report.md)，人工核对输入→MCP→行动→网页的时间和事件；AI 可核对服务端记录，但不能假称看到了未提供的平台记录。包含会话身份、私密角色和 Token 的原始记录不提交。

每次失败尝试也保留：尚未绑定的发现查询、超时、缺少证据、PCM 协商失败均单列。传输轮次结束不等于游戏成功。若行动超时但服务端已接受，不重发，先导出并核对。

全部四项通过才可关闭 #48：真实程序发言、真实程序投票、双连接隔离、进程重启后新会话再次行动。还需第一批前置验收及回归通过。仅模拟通过时 PR 保持草稿。

## 测试与清理

```powershell
node --test apps/linx/test/*.test.mjs
node tests/linx-lab.test.mjs
node tests/linx-program-lab.test.mjs
```

结束时 export → 两个客户端 close → lab quit → 关闭本批独立 cloudflared。不关闭其他任务的实例或隧道。原始 profile 保留供下次免激活连接，临时会话 Token 不落盘。本批没有自动调度、网页音频或实际九人混合局能力。
