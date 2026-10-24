> 当前灵矽控制台请选择 **Streamable HTTP**，MCP URL 使用 `https://隧道域名/mcp`。服务现支持 POST /mcp 的无状态 JSON 响应，以及旧 SSE 通道。认证模式 Normal，Header 名称 Authorization，值为 Bearer 加一个空格及 MCP_AUTH_TOKEN；删除空白 Header 行。初始化和工具发现无需绑定设备，游戏工具仍必须登记身份。

# 云端 MCP 服务

服务入口为 `GET /mcp` 和 `POST /mcp/message`。生产环境必须设置 `MCP_AUTH_TOKEN`，并通过公网 HTTPS 暴露；详细部署步骤见 [`deploy/README.md`](../../deploy/README.md)。

每个请求还需要 `X-Linx-Session-Id`，并可绑定 `X-Linx-Device-Id`、`X-Linx-Agent-Id`。服务端根据 Session 映射确定房间和座位，不信任模型传入的玩家身份。
