# 云端 MCP 服务

服务入口为 `GET /mcp` 和 `POST /mcp/message`。生产环境必须设置 `MCP_AUTH_TOKEN`，并通过公网 HTTPS 暴露；详细部署步骤见 [`deploy/README.md`](../../deploy/README.md)。

每个请求还需要 `X-Linx-Session-Id`，并可绑定 `X-Linx-Device-Id`、`X-Linx-Agent-Id`。服务端根据 Session 映射确定房间和座位，不信任模型传入的玩家身份。
