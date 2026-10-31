# Vue 客户端

Issue #124 的 Vue 入口与现有 Node API、SSE、MCP 和语音接口兼容。现在 Vue 是统一启动器的默认网页入口，原生客户端只作为回滚入口保留。

## 开发

```powershell
npm.cmd run dev:client-vue
```

浏览器打开 Vite 输出的地址，填写 API 地址、房间号和玩家 ID。Vue 客户端通过现有 REST API 和 SSE 读取状态，不直接访问服务端内存。

## 构建与切换

```powershell
npm.cmd run build:client-vue
$env:CLIENT_UI = 'vue'
$env:CLIENT_DIST = (Resolve-Path apps/client-vue/dist).Path
node apps/client/server.mjs
```

需要回滚旧入口时，设置 `$env:CLIENT_UI = 'legacy'` 后再启动静态服务器。旧入口的源码暂时保留，便于出现浏览器兼容问题时快速回退。
