# 第一批独立联调

目标：真实灵矽 Agent 发言、投票各成功一次，网页自动更新。工具、测试夹具和模拟 HTTP 成功均不能代替真实验收。无需实体硬件，本批仍使用控制台网页拨打。

## 启动与配置

需要 Node.js 22+、cloudflared。复制一份仓库外的测试环境文件，设置与正式实例不同的 ADMIN_TOKEN、MCP_AUTH_TOKEN，两个值也必须互不相同。不要提交该文件或将管理员 Token 填入控制台。

```powershell
node --env-file="$env:LOCALAPPDATA\LinxNight-lab.env" scripts/linx-lab.mjs
```

实例固定监听本机 API 5100、网页 5110、MCP 9191；无机器人调度器，不修改原 5000/5010/9091 进程。端口占用时先检查，不杀其他实例。

另一个终端启动测试隧道：

```powershell
cloudflared tunnel --url http://127.0.0.1:9191
```

新建专用「狼人杀联调玩家」Agent 和「狼人杀联调 MCP」，不修改现有游戏 Agent。MCP 使用隧道 HTTPS 地址加 /mcp、Streamable HTTP、Normal、Authorization: Bearer 加测试 MCP_AUTH_TOKEN。Agent 选支持工具调用的平台模型、统一意图识别/Function Call、无记忆，复制 apps/mcp/prompts/player.md。在 MCP 窗口独立保存关联，再保存主配置。语音仅用于私密测试，不接公共扬声器。

## 发言场景

1. 测试终端输入 `scene speech`，复制输出链接到全新浏览器标签页，点击「加入房间」，以正常接口占据 P1；不要点击「开始游戏」。
2. 终端输入 `arm`。固定九人阵容准备完成，P2 为平民，当前轮到 P2；网页应自动显示阶段。
3. 专用 Agent 网页拨打，按住说话：“请调用 get_public_game_state 查询游戏状态。”首次未绑定错误是预期的。
4. 终端输入 `recent`，核对专用测试 Agent 的身份和触发时间，再输入 `bind 实际SessionID`。只绑定本次真实 Session，不绑定原有游戏 Agent。
5. 说：“先查询当前状态和自己的身份，轮到你时提交一段公开发言。”记录时间、平台工具调用记录和浏览器变化。
6. 必须看到服务接受一次 submit_speech，网页显示该发言并推进 P3。输入 `export` 保存证据。

## 投票场景

1. 挂断灵矽，终端输入 `scene vote`；上一场景自动导出证据并清理绑定。使用新的浏览器标签页打开新链接并加入，再输入 `arm`。
2. 新房间预置其他八席投给 P3，只有 P2 未投；重新拨打、查询、`recent`、`bind 新SessionID`。
3. 说：“查询当前状态，然后调用投票工具投给 P3。”
4. 必须看到新增一票、结算一次、P3 出局、进入狼人夜间阶段，网页自动显示结果。输入 `export`。

每次 scene 都创建新房间。测试中切勿让普通开始按钮或其他真人操作改变夹具；误操作后重建场景。掉线重新拨打也重建场景，不把不同会话证据混合。

## 证据与完成标准

证据保存在 `%LOCALAPPDATA%\LinxNight-lab\evidence`（非 Windows 默认用户目录）。报告只输出匿名身份、requestId/actionId/版本/事件关联和服务端检查，平台与浏览器验证始终默认 pending。脚本不会把伪造身份头的手工 HTTP 当成真实灵矽。

人工将专用 Agent 的平台记录、触发时间和浏览器截图与导出报告核对后，填写验收报告：每个场景的来源、请求/行动/事件关联、平台是否真正调用、页面是否无需刷新更新。截图裁去真实 Session、Token 及私密对话；完整原始数据仅留本机。不要仅凭 AI 说“成功”勾选。

测试命令：`node tests/linx-lab.test.mjs`；MCP 契约回归：`node apps/mcp/test/actions.test.mjs`。前者明确为模拟 HTTP/SSE，非真实平台。

结束时在终端输入 `quit`，关闭测试隧道并挂断控制台。退出测试实例会清空其内存房间；正式游戏进程不受影响。
