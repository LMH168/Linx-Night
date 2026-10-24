# 月隐：独立网页语音狼人杀示例

[examples/moonveil](../examples/moonveil/README.md) 包含可以独立运行的单人对 AI 游戏，支持 6 / 9 人局、独立灵矽智能体、8 种音色、网页录音与灵矽语音转写。

## 运行

需要 Node.js 22.9+，推荐 24 LTS：

```bash
cd examples/moonveil
npm ci
npm start
```

打开 http://localhost:4173 。未配置密钥时可体验模拟模式；真实智能体与语音请按示例 README 复制 `.env.example`、填写 `LINX_API_KEY` 并运行 `npm run linx:init`。示例启动本机 4173 / 4174 两个服务。

## 与主项目的关系

此示例有独立的依赖锁文件、裁判、前端、初始化脚本及测试，不接入主项目的房间、MCP、调度器或多人流程。它用于单人练习与灵矽网页语音接入参考。根目录现有 `npm start` 仍启动主项目；运行示例时应先进入其目录。

`.github/workflows/moonveil.yml` 在示例变化时检查 Node.js 22 / 24。示例内的 `.github/workflows/ci.yml` 用于将该目录单独导出为仓库的情况，在本仓库中不会自动执行。

验证命令：在示例目录执行 `npm run check`；打包执行 `npm run package`（额外需要 Python 3）。示例不包含账号密钥、虚拟设备信息、录音或依赖目录。
