# 决策记录：issue #135「暮林山舍」的渲染路线

> 状态：已定 · 2026-11-01
> 关联：[#135](https://github.com/LMH168/Linx-Night/issues/135)（页面与协议）、
> [#136](https://github.com/LMH168/Linx-Night/issues/136)（舞台与体验）、
> PR [#146](https://github.com/LMH168/Linx-Night/pull/146) / [#150](https://github.com/LMH168/Linx-Night/pull/150) / [#152](https://github.com/LMH168/Linx-Night/pull/152)

## 1. 结论

**要 three.js，但不要现在这种用法。**

- 现在的问题不是"选了 three.js"，而是**用错了载体**：整个世界装在 1.6 MB 的
  `forest-cabin.html` iframe 里，为 15 秒开场动画写的实时管线被当成常驻背景。
- three.js 在这里唯一不可替代的能力是**受限环视与座位聚焦的真三维视差**。
  其余（九席、昼夜、灯灭、护盾）DOM 与材质颜色就能表达。
- 因此路线是：**保留 three.js，换成"单 canvas + 几何合并 + 烘焙光照 + 按需渲染"**，
  而不是"换掉 three.js"。

一句话判断标准：

> 如果最终只要"一张固定机位的好看桌子"，可以不要 three.js；
> 如果要"轻微环视 + 聚焦某座位"，要 three.js——但必须是烘焙 + 按需渲染的那一种。

## 2. 依据

### 2.1 #135 的四条硬约束

| 约束 | 出处 | 对实现的含义 |
|---|---|---|
| 一个持续存在的世界，四路由只换镜头 | §0 一页结论 | 场景只建一次，阶段切换禁止重建 |
| 不用 `forest-cabin.html`，不 iframe 嵌入 | §1.3 非目标 | 必须自有 canvas 与自有帧循环 |
| 3D 负责"在哪里、谁在场"，DOM 负责"读什么、选什么" | §1 | HUD 全部留在 Vue |
| 实时阴影光源 ≤2、draw call <120、三角 <150k | §4.7 | 预算线，不是目标值 |

### 2.2 当前代码事实

| 事实 | 影响 |
|---|---|
| 本地分支 `codex/latency-streaming` 无 `apps/client-vue` | 3D 代码只在远端 main，本地无法编译 |
| 本地无 node / npm / git | 无法跑 Vite 与测试，验证只能靠静态检查 |
| 根 `package.json` 只依赖 `ws` | three 是 `client-vue` 私有依赖 |
| 远端实现：`GameWorld.vue` = iframe + 1.6 MB 单文件 | 性能与画质的根因 |

### 2.3 已合并 PR 的处理

**不回退历史，只降级入口。** 理由：#150 已把真实房间/SSE/语音接进 3D 页面，
#152 又在其上做了性能修正与静态回退；整体 revert #146 会连带损坏这些工作。

处置：

```text
主分支保留            → 真实房间、SSE、语音、结算、CI
生产默认入口          → CLIENT_UI=legacy（止血）
/game.html            → 保留为 3D 预览入口
视觉层                → 新分支重做，不回退 #152
```

## 3. 路线对比

| 路线 | 视觉可达 | 桌面 | 移动 | 工作量 | 环视/聚焦 |
|---|---|---|---|---|---|
| A 纯 DOM/CSS | 70% | 60 | 60 | 1–2 天 | 否 |
| B 预渲染静帧 + 分层视差 | 90–95% | 60 | 60 | 2–3 天 | 弱 |
| **C three.js 轻量世界** | **95–100%** | **60** | **40–60** | 6–9 天 | **是** |
| D 现状（iframe + 实时光照） | 100% | 30–45 | 15–25 | 已完成 | 否（镜头写死） |

选 **C**，并把 **B 作为 low 档与视觉基准**。

D 的荒谬之处值得记一笔：它付了 100% 的性能代价，只拿到 90% 的画面，
还把 three.js 唯一的战略价值（环视）关掉了。

## 4. 目标

### 4.1 北极星

> 用户看到的是"暮林山舍的那一晚"，不是一次 GPU 压力测试。

### 4.2 硬指标

| 指标 | 目标 | 测法 |
|---|---|---|
| 桌面帧率 | 补间期 ≥58 fps，1% low ≥50 | Chrome Performance 60 s |
| 移动帧率 | ≥30 fps（中端安卓） | 真机 |
| 静止时 GPU | ≈0（不绘制） | Rendering 面板 / 帧计数器 |
| draw calls | ≤60 | `renderer.info.render.calls` |
| triangles | ≤120k | 同上 |
| 实时光源 | ≤2，投影 ≤1（目标 0 投影） | 静态检查 + 运行时 |
| 首屏资源 | ≤400 KB，≤1.5 s | Network |
| `setSize` | 仅 resize 时 | `tools/check_scene_budget.py` |
| 视觉一致性 | 与批准原型 SSIM ≥0.95 | 同机位截图对比 |

### 4.3 禁令

```text
✗ iframe 承载游戏世界
✗ 每座位一个 PointLight
✗ 阶段切换时 setSize / composer.setSize
✗ 持续动画画布上叠 backdrop-filter
✗ 降级时改光照模型、删雾、换材质类型
```

最后一条是防"越优化越丑"的闸门。**允许降的只有：渲染次数、渲染分辨率、后处理开关。**

## 5. 里程碑

| # | 内容 | 出口条件 |
|---|---|---|
| **M0** | 基线：帧时间 p95、最长任务、draw call、五张固定机位截图 | 有两套基线才能开工 |
| **M1** | 预渲染静帧 + CSS 分层视差 + sprite 灯火（路线 B） | 不卡，且**已好看**；同时充当 low 档与视觉基准 |
| **M2** | 单 canvas + 合并几何 + 烘焙光 + 按需渲染（路线 C） | draw call ≤12、静止 0 帧/秒 |
| **M3** | 镜头编排、昼夜、死亡/护盾、接真实 store | 不碰 #150 的接口 |
| **M4** | 三档质量 + CI 断言 + 真机记录 | #152 未做的那项验收补齐 |

**闸门**：M1 完成前不做 M2。否则会重演"不知道及格线在哪，为跑动而毁画面"。

## 6. 测量协议

每次动渲染代码，记录同一张表（同一台设备、同一窗口尺寸）：

```text
设备 / 浏览器 / 窗口尺寸 / DPR
平均 fps / 1% low / p95 帧时间 / 最长任务
draw calls / triangles / 光源数 / 纹理内存
静止 10 s 的渲染帧数（应为 0）
```

模板与检查器：

```powershell
python tools/check_scene_budget.py <场景文件...>        # 静态预算
python tools/check_scene_budget.py --json <文件>        # CI 用
```

## 7. 当前进度

| 项 | 状态 |
|---|---|
| 渲染路线决策 | 完成（本文件） |
| 静态预算检查器 | 完成 `tools/check_scene_budget.py`（自测：违规样本 4 error + 2 warn，必失败） |
| 线上产物探针 | 完成 `tools/probe-deployment.mjs`（含 gzip 与舞台签名，见 §9） |
| 轻量骨架原型 | 完成 `prototypes/issue-135-table/`（9 draw call / 2 光源 / 按需渲染，检查器 PASS） |
| **M2 并入 `client-vue`** | **完成**（PR #154：iframe → 进程内 canvas 舞台） |
| 提交 PR / 合并 / 部署 | 完成（#153 门禁， #154 舞台；均已部署到生产） |
| 浏览器真机帧率 | **未做**（本机无浏览器自动化，需人工看） |
| M0 基线、M1 静帧 | 未做 |

## 8. 证据：现网实现的静态体检

对 `main` 上的 `apps/client-vue/src/game/launchScene.ts` 跑同一检查器：

```text
FAIL  launchScene.ts
  point_lights     5   （字面量 5 处，实际运行构造 16 个：9 椅灯 + 3 蜡烛 + 3 补光 + 1 护盾）
  dir_lights       1
  total_lights     6   （上限 2）
  cast_shadow_true 10  （上限 0）
  setSize_calls    2   ← 都在 applyGameScene() 内，每次阶段切换都重建 buffer
  on_demand        0   （无守卫，持续渲染）
  merged_geometry  0
  instanced_mesh   0
```

四类问题全部命中：光源超预算、阴影超预算、`setSize` 位置错误、无按需渲染、
无几何合并。这与"合并后非常卡、优化后很丑"的两次体验在机制上是一致的。

> 检查器的光源计数是**字面量计数**，循环里 new 一次跑 N 次的情况需要人看。
> 运行时请以 `scene.children.filter(o => o.isLight).length` 为准。

### 8.2 线上部署实测（2026-11-01）

```powershell
node tools/probe-deployment.mjs
```

```text
站点      https://linxnight.mimi-api.cn
标题      Linx Night · 暮林山舍
HTML      846 B
脚本      /assets/_plugin-vue_export-helper-DN6PhCzW.js, /assets/game-main-CSznZNwu.js
入口判定  3D 页面（game-main）        ← 生产默认入口是 3D，不是 legacy
game-main 101.4 KB
  forest-cabin        2
  PointLight          6
  SpotLight           1
  setSize             2
  requestAnimationFrame 0
  InstancedMesh       0
  mergeGeometries     0
首屏 JS 合计 169.2 KB
结论：FAIL（forest-cabin ×2，预算 0）
```

三条结论：

1. **线上跑的就是 iframe 版 3D 页面**，`CLIENT_UI=legacy` 没有生效，用户正在被卡顿影响；
2. bundle 里没有 `requestAnimationFrame`，说明渲染循环完全在 iframe 内部——Vue 侧
   既停不了也调不了，这与「优化只能靠关效果」的表现一致；
3. `/api/health` 返回 404，健康检查路径与文档可能不一致（与本议题无关，记录备查）。

## 9. M2 完成后的线上读数（PR #154 部署后）

```text
站点      https://linxnight.mimi-api.cn
入口判定  3D 页面（game-main）

shared  chunk  _plugin-vue_export-helper  627.1 KB (gzip 166.6 KB)   ← three.js 运行时
game    chunk  game-main                  108.6 KB (gzip  40.4 KB)

对局页 iframe（linx-game=1）  0     ← 原为 1
forest-cabin 引用             1     ← 原为 2，仅剩 launch 开场动画
新舞台 is-lost                2     ← 新代码确实进了产物
新舞台 webglcontextlost       2
首屏 JS 合计 735.7 KB (gzip 207.1 KB)
结论：PASS
```

| 指标 | 改造前 | 改造后 |
|---|---|---|
| 对局页承载方式 | iframe（1.6 MB 单文件场景） | 进程内 canvas |
| 独立文档 / 渲染循环 | 1 个 / 在 iframe 内，Vue 不可控 | 0 个 / 在 Vue 内，可随时停 |
| 场景光源 | 约 16 个实时点光源 | 2 个（半球 + 平行，均不投影） |
| 阴影贴图 | 10 处 `castShadow` | 0 |
| 场景资源请求 | 1 次 1.6 MB HTML + 其内 CDN 模块 | 0 次 |
| 静止渲染 | 持续 60 fps | 按需，静止时不进 rAF |

**仍未测**：真机 fps、1% low、静止 10 s 渲染帧数。这三项需要浏览器，
本机没有；它们是 #135 验收表里唯一还空着的行。



