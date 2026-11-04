# 角色立绘（可选）

把图片放进这个目录，文件名等于角色 id，就会自动替换掉程序化的 SVG 剪影，
不需要改任何代码。支持的扩展名：`png` / `jpg` / `jpeg` / `webp` / `avif` / `svg`。

| 文件名 | 角色 |
| --- | --- |
| `wolf.png` | 狼人 |
| `seer.png` | 预言家 |
| `witch.png` | 女巫 |
| `hunter.png` | 猎人 |
| `villager.png` | 平民 |

约定：

- 图片以**圆形裁切**显示（`object-fit: cover`），建议 1:1 方形，边长 ≥ 256px。
- 深色、低饱和的立绘更贴合整体色调；亮底图片会显得突兀。
- 隐藏身份的席位永远显示兜帽剪影，不会用到这里的图片；只有身份公开时（展开私密身份时的自己、狼队友、结算页）才会显示真实立绘。
- 删掉某个文件即回落到该角色的程序化剪影。

## 批量生成

本目录的 5 张立绘由 `tools/imagine.mjs` 调用 gpt-image-2 生成（1024×1024 原稿），
再用 `tools/optimize_portraits.py` 压成 512px WebP（约 50–65KB/张）。

```bash
node tools/imagine.mjs --list              # 查看预设
node tools/imagine.mjs --jobs portraits    # 生成（已存在的会跳过，--force 覆盖）
node tools/imagine.mjs --prompt "画面描述"  # 单张，默认落到 output/
python tools/optimize_portraits.py         # 压成 WebP，原图移到 output/portraits-original/
```

接口配置放在 `tools/.imagegen.json`（已在 `.gitignore` 中），也可用
`IMAGE_BASE_URL` / `IMAGE_API_KEY` / `IMAGE_MODEL` 环境变量覆盖。
