# 从零开始：在自己的 Windows 电脑运行

本文对应当前 main 的统一启动流程。命令在 PowerShell 执行；除安装工具外，都在克隆后的仓库根目录执行。Windows 10/11 是本文目标环境，macOS/Linux 尚未按本教程验证，尤其不能直接运行 Windows System.Speech 音频生成脚本。

## 1. 准备工具

安装 [Git](https://git-scm.com/downloads/win)、[Node.js LTS](https://nodejs.org/)（建议 24 LTS，至少 22，包含 npm）和 [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)。安装后重新打开终端：

```powershell
git --version
node --version
npm.cmd --version
cloudflared --version
```

`node` 找不到时先检查官方 Node 安装和 PATH，不要复制作者电脑中的 Codex Node 路径。PowerShell 若阻止 npm.ps1，使用本文的 `npm.cmd`，无需修改全局执行策略。

Cloudflare 临时隧道不需要自有域名或登录账号；关闭后地址失效，重启通常产生新地址。灵矽账号需要能够使用智能体、软件设备激活、Function Call 和自定义 MCP。

## 2. 拉取项目并安装依赖

```powershell
git clone https://github.com/LMH168/Linx-Night.git
cd Linx-Night
npm.cmd ci
```

## 3. 创建三个灵矽智能体

打开 [智控台](https://xrobo.qiniu.com/)，在智能体管理中分别创建：

| 用途 | 建议名称 | 设置与人设 | 后续关联设备 |
| --- | --- | --- | --- |
| 玩家 | 狼人杀 AI 玩家 | 中文、启用 Function Call、无跨会话记忆；复制 [玩家人设](../apps/mcp/prompts/player.md) | player-a 到 player-h |
| 主持 | 狼人杀主持人 | 中文、启用 Function Call、无跨会话记忆；复制 [主持人设](../apps/mcp/prompts/host.md) | host |
| 转写 | 狼人杀语音转写 | 中文、无记忆；人设可填“准确识别用户中文语音，不调用游戏工具”；不关联游戏 MCP | web-voice |

保存玩家和主持的 Agent ID（配置页地址中的 `agentId=` 值）。玩家八个设备可共用一个 Agent，主持必须独立。音色在程序中按玩家身份指定，不需要建立八个玩家 Agent。平台菜单名称可能随版本变化。

## 4. 创建并激活十个软件身份

不需要实体硬件。在本机初始化独立身份：

```powershell
$profiles = @('player-a','player-b','player-c','player-d','player-e','player-f','player-g','player-h','host','web-voice')
foreach ($profile in $profiles) { node scripts/linx-client.mjs init $profile }
```

逐个激活，例如：

```powershell
node scripts/linx-client.mjs activate player-a
```

终端显示六位激活码后，在智控台进入对应智能体的设备管理，选择添加/激活设备并输入该码。保持命令运行，直到显示“激活成功”。依次将命令末尾替换为其余身份；前八个关联玩家 Agent，host 关联主持 Agent，web-voice 关联转写 Agent。

每次最多等待五分钟，过期重新执行同一身份的 activate；不要删除 identity.json 重新生成。身份保存在 `%LOCALAPPDATA%\LinxNight\profiles`，不在仓库中。其他电脑要初始化和激活自己的身份，不复制作者或同事的身份文件、激活码或 Token。

## 5. 生成行动触发短音频

Windows 需安装中文桌面语音引擎（系统语言设置中的中文语音组件）。执行：

```powershell
powershell.exe -NoProfile -File scripts/linx-audio.ps1
```

默认生成到 `%LOCALAPPDATA%\LinxNight\audio`，包括 turn.wav、hunter.wav、vote-turn.wav。它们是发给 AI 的私密行动提示，不是主持公开广播。启动器要求通用/猎人触发音频均不超过五秒。若提示缺少中文语音，安装系统中文语音后重试；若超过时长，调整脚本语速重新生成，不能忽略校验。

## 6. 填写本机配置和音色

将模板放到仓库外：

```powershell
Copy-Item .env.example "$env:LOCALAPPDATA\LinxNight-runtime.env"
notepad "$env:LOCALAPPDATA\LinxNight-runtime.env"
```

替换全部 `CHANGE_ME`。两次执行以下命令生成两个不同随机令牌：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

- 第一份填 `ADMIN_TOKEN`，并原样填 `LINX_MCP_ADMIN_TOKEN`。这两项必须相同，仅本机内部管理使用。
- 第二份填 `MCP_AUTH_TOKEN`，仅这份用于灵矽 MCP 认证；必须与管理员令牌不同。
- `LINX_AGENT_ID` 填自己的玩家 Agent ID；`LINX_HOST_AGENT_ID` 填自己的主持 Agent ID。
- 保留模板的八个玩家 profile、host、web-voice，以及 5100/5110/9191 端口。

音色必须使用实际 ID，名称不能代替 ID。可自行从官方列表选九个不同 ID，填入 `LINX_PLAYER_VOICES` 单行 JSON 和 `LINX_HOST_VOICE_ID`。也可使用项目预选方案：

1. 在自己的浏览器打开智控台，按 F12 → Network（网络），筛选 `voices`。
2. 刷新页面，进入智能体的“语言与音色 → 选择音色”。
3. 找到 `/v1/voices` 请求，复制 Response（响应）到 UTF-8 文件，例如桌面的 voices.json；不要复制请求头、Token 或 HAR。
4. 执行（文件路径按实际修改）：

```powershell
node scripts/select-voices.mjs "$env:USERPROFILE\Desktop\voices.json" "$env:LOCALAPPDATA\LinxNight-runtime.env"
```

脚本按名称选择智慧青年男、磁性低音男、阳光青年、温暖元气男、沉稳权威女、元气甜美女、低调冷静女、飒爽利落女，主持使用博才说书男；匹配失败不会写入配置。名称或平台可用列表变化时需重新选取。

配置文件不是 PowerShell 脚本，变量值中不会展开 `$env:LOCALAPPDATA`。如指定 WAV 路径，请写实际绝对路径，推荐正斜杠。不要把实际环境文件提交 Git。

## 7. 启动本机项目

```powershell
node scripts/start-local.mjs "$env:LOCALAPPDATA\LinxNight-runtime.env"
```

终端应显示：

```text
本机网页：http://localhost:5110
linx-night client listening on 5110
Listening on 5100
Listening on 9191
```

保持终端运行。这个入口一次启动网页、API、MCP 和调度器，API 与 MCP 共用房间状态。**不要另开终端分别执行 dev:server、dev:mcp 来代替统一入口**，否则内存房间状态不共享。`npm start` 本身不自动读取仓库外配置，首次请用上面的完整命令。

启动自检只验证配置结构、身份文件和音频，不保证平台已激活、MCP 连通或音色有效。模板占位符必须自己替换完。

## 8. 启动公网 MCP 隧道并配置灵矽

另外打开一个终端：

```powershell
cloudflared tunnel --url http://127.0.0.1:9191
```

从日志复制本次 `https://某个名称.trycloudflare.com` 地址，加上 `/mcp`。Cloudflare 文档网址不是隧道地址。

在智控台新建或修改游戏 MCP：

| 字段 | 填写内容 |
| --- | --- |
| URL | `https://本次地址.trycloudflare.com/mcp` |
| 传输协议 | Streamable HTTP |
| 认证方式 | 支持自定义请求头的 Normal/普通认证 |
| 请求头名称 | `Authorization` |
| 请求头值 | `Bearer ` 加配置中的 `MCP_AUTH_TOKEN`，Bearer 后有一个空格 |

如果平台表单已有 Bearer 前缀并仅要求 Token，则只填令牌，避免重复前缀。管理员令牌绝不填到平台。

获取工具成功后，将同一个 MCP 关联到玩家和主持 Agent，分别保存配置；转写 Agent 不关联。若旧 MCP URL 不能编辑，新建 MCP 并替换两个 Agent 的关联，避免同时保留失效的游戏 MCP。

这里只公开 MCP 端口，不公开网页/API。当前本机身份机制不适合直接作为公网多人网站使用。

## 9. 打开网页开始游戏

打开 http://localhost:5110 ：

1. 如需检查“连接设置”，API 地址填写 `http://127.0.0.1:5100`。
2. 输入昵称、创建房间，启用公共声音，再点击开始游戏。
3. 等待八名 AI 与独立主持连接完成，之后自动分配角色；无需网页拨打、复制 Session 或手工绑定。
4. 真人按身份使用页面按钮；平民夜晚等待。白天在主持邀请后输入文字或点击“灵矽录音转写”，检查草稿再确认提交。
5. 发言/录音最多 30 秒，转写最多 60 秒，确认最多 15 秒；草稿不会自动提交。AI 根据已提交的公开文字理解发言，真人原始录音不转播。
6. 停止公共声音不代表播放完成；需要继续播放或明确跳过本条音频才能解除普通回合门控。猎人技能窗口独立计时。

## 10. 停止、再次启动和更新

先点“提前结束本局”，释放玩家与主持连接；再在项目终端按 Ctrl+C，最后在隧道终端按 Ctrl+C。房间保存在内存，重启后必须新建，不恢复旧房间。

下次只需重复第 7、8、9 步。身份激活通常无需重做，但临时隧道 URL 改变后必须同步修改平台 MCP。

更新前结束游戏并停止进程；没有本地改动时运行：

```powershell
git pull --ff-only
npm.cmd ci
```

然后按最新模板检查新增配置项，不覆盖原有秘密配置。

## 常见问题与检查

| 现象 | 检查 |
| --- | --- |
| 创建房间 Failed to fetch | 项目终端是否仍运行；API 是否为 5100，而不是网页的 5110 |
| 端口占用 EADDRINUSE | 关闭自己之前启动的项目进程；不要重复启动多份 |
| 工具获取失败 | 项目和隧道均在线，URL 带 /mcp，协议与 Authorization 正确，临时地址未过期 |
| AI 一直 connecting/binding | 检查设备是否激活到正确 Agent、两 Agent 是否关联当前 MCP、Function Call 和认证是否有效 |
| 身份不足或 PROFILE_IN_USE | 八个独立身份齐全；结束旧房间，避免同一 profile 并发占用 |
| 主持不播报/一直等待 | 检查公共声音开关、浏览器音频权限、任务错误；失败可重试，跳过不代表真实播放成功 |
| 录音失败 | 使用 localhost 安全上下文、允许麦克风，确认 web-voice 激活且没有游戏 MCP；可改文字 |
| 重启后旧房间不存在 | 正常现象，创建新房间 |

可选本机回归：

```powershell
npm.cmd run check
npm.cmd run test:voice
npm.cmd run test:delivery
```

这些是自动化测试，不能替代真实音色听检或完整对局。当前已验证九种指定音色返回、程序音频转写、八 AI 与主持自动开局及第一夜到白天；最近网页联调仍出现音频提前暂停，连续播放、真人麦克风和完整多昼夜尚未全部验收。进度以 [#79](https://github.com/LMH168/Linx-Night/issues/79) 与 [#80](https://github.com/LMH168/Linx-Night/issues/80) 为准。
