# 混合局本机验收

本批默认验收规模是 **1 真人 + 2 Linx AI + 6 规则机器人**。P2、P3 使用 `player-a`、`player-b`，P4～P9 由规则机器人补齐。规则机器人只用于补足人数，不作为真实 Linx 证据。

## 自动化检查

```powershell
node --env-file="$env:LOCALAPPDATA\LinxNight-local.env" scripts/check-config.mjs
node tests/mixed-e2e.test.mjs
```

配置检查失败时只说明本机环境未准备好，不代表游戏规则失败。不要把环境文件、Token、设备身份或模型回复提交到仓库。

## 页面验收

1. 使用统一进程 `node --env-file="$env:LOCALAPPDATA\LinxNight-local.env" run.mjs`。
2. 打开 `http://localhost:5010`，创建房间。
3. 只保留房主一个真人，点击“开始游戏”。
4. 确认 P2、P3 依次显示 `connecting`、`binding`、`ready`；P4～P9 显示规则机器人。
5. 确认两个 Linx ready 后才进入角色分配和夜晚阶段。
6. 点击“取消开始”，确认回到大厅且控制器清空。
7. 重新开始，确认新的 `gameId` 和 `controllerEpoch`。

## 证据要求

记录阶段、控制器状态、取消和重新开始的时间与版本号。报告使用匿名座位和运行 ID，不记录 Token、私密角色、完整音频或模型回复。真实平台调用还需同时对应 Linx 客户端记录、MCP 诊断和游戏事件；模拟夹具单独标为自动化测试。
