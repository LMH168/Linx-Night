# 暮林夜宴 · WALDNACHT（3D 舞台原型）

九人局狼人杀的**前端舞台原型**：一镜到底的 3D 木屋、九席长桌与夜间界面。
设计讨论见 issue [#136](https://github.com/LMH168/Linx-Night/issues/136)。

## 运行

```bash
npm.cmd run dev:client-vue
```

打开 `http://localhost:5173/werewolf.html`（端口以 Vite 输出为准）。
构建后主客户端与原型各自独立：`dist/index.html`、`dist/werewolf.html`。

## 这一版有什么

| 界面 | 实现 | 说明 |
| --- | --- | --- |
| 门厅 | `components/GateHero.vue` + 外景 | 雪夜、月亮、150 棵实例化针叶树、烟囱与暖光窗 |
| 入内 | `scene/Stage.ts` `enter()` | 3.6s CatmullRom 穿门长镜头，门轴旋开、雾散、灯亮 |
| 九席 | `components/LobbyHud.vue` + 长桌 | 椭圆桌、9 把椅子、烛台、吊灯聚光、壁炉火光 |
| 看牌 | `components/RoleCard.vue` | 长按 1.1s 翻面，松手收起 |
| 闭眼 | `components/ClosedEyes.vue` | 夜间遮蔽层，只留火漆月相与文字 |
| 指认 | `LobbyHud.vue` `mode="vote"` | 同一套 dock，chip 带票数 |
| 结算 | `components/ResultBoard.vue` | 九宫身份矩阵 + 逐夜时间线 |

所有几何与贴图**程序化生成**（`scene/textures.ts` 用 canvas 现画），不依赖外部模型或图片资源。

## 目录

```
features/werewolf/
├─ WerewolfStage.vue     # 页面装配：3D 画布 + 各层界面
├─ main.ts               # werewolf.html 入口
├─ scene/
│  ├─ Stage.ts           # three.js 舞台：相机 cue、灯光、动画循环
│  └─ textures.ts        # canvas 程序化纹理
├─ components/           # TopBar / GateHero / LobbyHud / RoleCard / ClosedEyes / ResultBoard
├─ data/
│  ├─ seats.ts           # 九席元数据
│  └─ roles.ts           # 五种角色 + 结算演示数据
└─ styles/tokens.css     # 色板、字体、玻璃面板令牌
```

## 边界

- **没有规则引擎**：本目录只负责「演」。发牌、夜间行动、投票裁决、胜负判定由服务端 / `packages/domain` 决定，见 `docs/werewolf-3d-stage.md` 的数据契约一节。
- 演示数据（`data/roles.ts` 的 `BOARD`）仅用于结算界面取图。
- 调试钩子：`window.__stage`、`window.__jump()`、`window.__demo('card'|'eyes'|'vote'|'result')`。
