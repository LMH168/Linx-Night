# 上传 GitHub

## 推荐方式：Git

在 GitHub 新建空仓库（先不勾选生成 README、.gitignore 或许可证）。在此项目根目录执行：

```bash
git init -b main
git add .
git status --short
```

检查待提交列表：应包含源码、文档、`package-lock.json` 和 `.github/workflows/ci.yml`，不应出现 `.env`、`.linx/`、`node_modules/` 或 `dist/`。`.env.example` 应保留且密钥为空。

确认后执行（将 `YOUR_NAME` / `YOUR_REPO` 替换为真实信息）：

```bash
git commit -m "Initial Moonveil web game"
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

Git 身份和 GitHub 登录使用你自己的账号配置。推送后在 Actions 页面查看自动检查结果。

## 网页上传

解压干净源码 ZIP，将目录内的源码作为仓库根目录上传，不要只上传 ZIP 文件。文件管理器可能隐藏 `.github/`、`.gitignore`、`.env.example` 等文件，请确保它们也被上传；如不方便选取隐藏文件，使用上方 Git 命令。

## 其他电脑运行

```bash
git clone https://github.com/YOUR_NAME/YOUR_REPO.git
cd YOUR_REPO
npm ci
npm start
```

默认先以模拟模式启动。真实 AI 与语音需按根目录 README 创建本地 `.env` 并执行 `npm run linx:init`；GitHub 仓库不保存你的账号配置。

本项目需要 Node.js 服务，GitHub 仓库用于托管源码，GitHub Pages 不能直接运行后端。当前未选择开源许可证，公开仓库前可按自己的授权意愿补充 `LICENSE`。
