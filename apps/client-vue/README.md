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

## 暮林山舍启动画面与角色头像

Vue 客户端默认进入「暮林山舍 / WALDHÜTTE」启动画面，点击「进入林间」后进入原有房间客户端。启动画面使用 `public/assets/splash/` 下的场景预览，座位卡使用 `public/assets/werewolf/avatars/` 下的 10 组 WebP 头像；真实玩家若已分配角色，会优先显示对应角色头像，其余座位使用角色目录轮换图像。

当前集成分支：`feat/forest-cabin-launcher`。
