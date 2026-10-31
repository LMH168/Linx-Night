# Vue 客户端预览

Issue #124 的 Vue 迁移入口与现有 Node API 兼容。PR 1 阶段默认仍使用原生客户端，Vue 客户端只作为并行入口和回滚候选。

## 开发

```powershell
pnpm exec vite --config apps/client-vue/vite.config.ts
```

浏览器打开 Vite 输出的地址，填写 API 地址、房间号和玩家 ID。Vue 客户端通过现有 REST API 和 SSE 读取状态，不直接访问服务端内存。

## 构建与切换

```powershell
pnpm exec vite build --config apps/client-vue/vite.config.ts
$env:CLIENT_UI = 'vue'
$env:CLIENT_DIST = (Resolve-Path apps/client-vue/dist).Path
node apps/client/server.mjs
```

未设置 `CLIENT_UI=vue` 时，`apps/client/server.mjs` 继续提供原生客户端。PR 3 完成对照验收后才会切换默认入口并评估删除旧客户端。
