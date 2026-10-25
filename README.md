# Linx Night · 月下议事

使用灵矽 AI 补齐空位的九人狼人杀：3 狼人、预言家、女巫、猎人、3 平民。支持本机网页操作、独立主持、AI 公开发言播报与真人录音转写草稿。

**首次安装请阅读 [从零开始：在自己的 Windows 电脑运行](docs/local-setup.md)。**

不需要实体硬件、服务器或域名；需要灵矽账号和互联网。首次需要创建自己的智能体并激活软件身份，不能只克隆代码就直接开始真实 AI 对局。当前推荐 1 真人 + 8 灵矽 AI + 独立主持，不使用规则机器人降级。

完成教程中的一次性配置后，每次在仓库根目录运行：

```powershell
node scripts/start-local.mjs "$env:LOCALAPPDATA\LinxNight-runtime.env"
```

另开终端运行 MCP 隧道：

```powershell
cloudflared tunnel --url http://127.0.0.1:9191
```

将本次隧道的 HTTPS 地址加 `/mcp` 配置到灵矽，然后打开 http://localhost:5110 。

当前仍处于真实平台联调阶段：九种指定音色和程序音频转写已成功，连续网页播放、真人麦克风听检及完整多昼夜稳定性尚未全部验收。跟踪 [#79](https://github.com/LMH168/Linx-Night/issues/79)、[#80](https://github.com/LMH168/Linx-Night/issues/80)；代码合并不等于整局验收通过。
