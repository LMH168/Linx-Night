# 运行方式更新

请优先遵循 [本机开局指南](../docs/local-play.md)。API 与 MCP 必须使用 `node run.mjs` 在同一进程启动。下方历史独立启动命令不适用于游戏联调。

# Linx-Night 部署基线

## 生产容器部署

生产镜像使用仓库根目录的 `Dockerfile`，Compose 文件为
`docker-compose.production.yml`。镜像不包含运行时环境、Linx 软件身份或音频；这些内容必须在服务器上单独保存。

服务器一次性准备目录：

```bash
sudo install -d -m 0750 /etc/linx-night /home/qiniu/linx-night /var/lib/linx-night/LinxNight/{profiles,audio,evidence}
sudo cp deploy/compose.env.example /home/qiniu/linx-night/.env
sudo cp .env.example /etc/linx-night/runtime.env
sudo chmod 0600 /etc/linx-night/runtime.env
```

将 `runtime.env` 中的 Token、Agent ID、音频路径和端口改为服务器值。生产环境固定使用：

```dotenv
PORT=5000
CLIENT_PORT=5010
MCP_PORT=9091
APP_HOST=0.0.0.0
CLIENT_HOST=0.0.0.0
LINX_TURN_WAV=/var/lib/linx-night/LinxNight/audio/turn.wav
LINX_HUNTER_WAV=/var/lib/linx-night/LinxNight/audio/hunter.wav
```

把在可信电脑上生成的音频复制到服务器，并在服务器上单独初始化、激活软件身份；不要把其他电脑的 `identity.json` 提交或写入镜像。

手动验证镜像：

```bash
cd /home/qiniu/linx-night
export LINX_IMAGE=ghcr.io/lmh168/linx-night:COMMIT_SHA
export LINX_BUILD_ID=COMMIT_SHA
docker compose --project-name linx-night -f docker-compose.production.yml up -d --wait
curl --fail http://127.0.0.1:5000/health
curl --fail http://127.0.0.1:9091/health
curl --fail http://127.0.0.1:5010/
```

该 Compose 项目只绑定本机的 5000、5010、9091，不接管现有项目的 80、12500 或 5432。

## 服务和端口

在 Ubuntu 服务器上分别启动：

```bash
PORT=5000 node apps/server/src/index.mjs
node_modules/.bin/vite build --config apps/client-vue/vite.config.ts
CLIENT_PORT=5010 CLIENT_UI=vue CLIENT_DIST="$PWD/apps/client-vue/dist" node apps/client/server.mjs
MCP_PORT=9091 MCP_AUTH_TOKEN='生成的随机长令牌' node apps/mcp/src/index.mjs
```

建议使用 systemd、supervisord 或容器管理进程，并把日志输出到集中日志系统。不要把 Token 写进 Git 仓库。

公共主持播放确认默认使用 90 秒 watchdog。生产环境可在仓库外环境文件中覆盖：

```text
HOST_PLAYBACK_WATCHDOG_MS=90000
```

每次部署前从合并后的 `main` 计算构建标识，并同时传给静态客户端：

```bash
export LINX_BUILD_ID=$(git rev-parse --short HEAD)
npm ci
npm run build:client-vue
npm run check
node scripts/verify-deployment.mjs https://<网页域名> https://<API域名> "$LINX_BUILD_ID"
```

网页公共语音卡片会显示该标识，静态服务器响应会返回 `X-Linx-Client-Build`。部署重启会清空内存房间，必须先确认没有正式对局。

复制 `.env.example` 为服务器上的环境文件，至少设置：

```text
PORT=5000
CLIENT_PORT=5010
MCP_PORT=9091
MCP_AUTH_TOKEN=随机生成的长令牌
```

## HTTPS 反向代理

灵矽云端 MCP 必须访问公网 HTTPS。下面的 Nginx 示例把 `/mcp` 和 `/mcp/message` 转发到本机 9091 端口；证书由 Certbot 或服务器已有证书提供。

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9091;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-MCP-Auth-Token $http_x_mcp_auth_token;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

如果没有域名，开发阶段可以用 Cloudflare Tunnel 或 ngrok 提供临时 HTTPS 地址；正式联调应使用固定域名和稳定证书。

## 服务器端口映射示例

当前服务器使用 PortForward 网关时，外部入口可按以下方式映射：

```text
客户端 5010 → 网关公网端口
服务端 5000 → 网关公网端口
MCP 9091 → 网关公网端口
```

例如用户提供的网关映射是 `5010 -> 10497`、`5000 -> 10498`、`9091 -> 10499`。反向代理部署后，优先只暴露 443；调试时才直接暴露 5000/5010/9091。

## 健康检查

```bash
curl http://127.0.0.1:5000/health
curl http://127.0.0.1:9091/health
curl -N https://mcp.example.com/mcp
```

上线后应核对网页响应头与页面显示的 `LINX_BUILD_ID` 相同，并在管理员诊断中确认 `host_browser_started`、`host_browser_completed` 或 `host_playback_timeout` 事件。

MCP JSON-RPC 请求必须携带：

```text
Authorization: Bearer <MCP_AUTH_TOKEN>
X-Linx-Session-Id: <已登记 Session>
X-Linx-Device-Id: <绑定设备>
X-Linx-Agent-Id: <绑定 Agent>
```

## Linx 接入前检查

1. 记录实际 HTTPS MCP 地址。
2. 生成并安全保存 `MCP_AUTH_TOKEN`。
3. 为每个 Linx Session 登记 `room_id`、`seat_id`、`player_id`、`device_id` 和 `agent_id`。
4. 用 `initialize`、`tools/list` 和一次只读工具调用验证 MCP。
5. 确认日志中没有输出 Token、身份角色或其他座位私密信息。
