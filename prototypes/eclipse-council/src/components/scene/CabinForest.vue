<script setup lang="ts">
/**
 * 山林小屋 · 主页场景（全程序化，无位图素材）
 *
 * 层次从远到近：夜空与冷月 → 云带 → 远山 → 林带（远/中/近三层空气透视）
 * → 谷底雾光 → 小屋剪影与暖窗 → 近地坡面 → 前景草与框景枝干 → 落叶 → 调色 / 暗角 / 颗粒
 *
 * 电影感靠四件事撑起来：清晰的黑白灰结构（雾是唯一亮面，树是剪影）、
 * 单一暖光源（窗）、缓慢而持续的横向运动（云、雾、风）、胶片后期（颗粒、暗角、调色）。
 *
 * 树、屋、草全部由确定性伪随机生成，刷新不会跳变。
 */

const W = 1440
const H = 900

/** mulberry32：确定性伪随机，保证每次渲染都长一样 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const n = (v: number) => v.toFixed(1)

/** 针叶树：用叠起来的弧形“裙摆”拼出枞树剪影，比方块三角更柔和 */
function conifer(x: number, baseY: number, h: number, w: number, rand: () => number): string {
  const tiers = 5 + Math.floor(rand() * 3)
  const top = baseY - h
  const step = h / (tiers + 0.55)
  let d = ''
  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers
    const yBase = top + step * i * 1.03
    const hw = Math.max(2, w * Math.pow(t, 1.06) * (0.8 + rand() * 0.4))
    const th = step * (1.2 + rand() * 0.35)
    const yTop = yBase - th
    d += `M${n(x)},${n(yTop)}`
    d += `Q${n(x + hw * 0.62)},${n(yTop + th * 0.44)} ${n(x + hw)},${n(yBase)}`
    d += `Q${n(x)},${n(yBase - th * 0.42)} ${n(x - hw)},${n(yBase)}`
    d += `Q${n(x - hw * 0.62)},${n(yTop + th * 0.44)} ${n(x)},${n(yTop)}Z`
  }
  d += `M${n(x - 1.7)},${n(baseY)}L${n(x - 0.7)},${n(top + h * 0.26)}L${n(x + 0.7)},${n(top + h * 0.26)}L${n(x + 1.7)},${n(baseY)}Z`
  return d
}

/** 落叶乔木：只剩枝干，秋风里最凄凉的形状 */
function bareTree(x: number, baseY: number, h: number, rand: () => number) {
  let cx = x
  let cy = baseY
  let trunk = `M${n(cx)},${n(cy)}`
  for (let i = 1; i <= 3; i++) {
    const ny = baseY - (h * i) / 3
    const nx = x + (rand() - 0.5) * h * 0.05
    trunk += `Q${n(cx + (rand() - 0.5) * 9)},${n((cy + ny) / 2)} ${n(nx)},${n(ny)}`
    cx = nx
    cy = ny
  }
  let twigs = ''
  const branches = 4 + Math.floor(rand() * 3)
  for (let b = 0; b < branches; b++) {
    const t = 0.3 + rand() * 0.62
    const by = baseY - h * t
    const dir = rand() > 0.5 ? 1 : -1
    const len = h * (0.16 + rand() * 0.26) * (1.2 - t)
    const ex = x + dir * len
    const ey = by - len * (0.5 + rand() * 0.4)
    twigs += `M${n(x)},${n(by)}Q${n(x + dir * len * 0.45)},${n(by - len * 0.12)} ${n(ex)},${n(ey)}`
    twigs += `M${n(ex)},${n(ey)}l${n(dir * len * 0.26)},${n(-len * 0.26)}`
  }
  return { trunk, twigs }
}

/* ---------------- 三层林带：越远越淡、越小、越靠近天空色（空气透视） ---------------- */
const rand = rng(20261101)

const farTrees: string[] = []
for (let x = -30; x < W + 46; x += 30 + rand() * 26) {
  farTrees.push(conifer(x, 646 + rand() * 12, 62 + rand() * 84, 13 + rand() * 11, rand))
}

const midTrees: string[] = []
for (let x = -40; x < W + 60; x += 54 + rand() * 46) {
  if (x > 596 && x < 900) continue // 小屋前的空地
  midTrees.push(conifer(x, 684 + rand() * 14, 130 + rand() * 100, 23 + rand() * 16, rand))
}

/** 空地两侧的树：让空地有“被林子围住”的压迫感，又不遮住屋子 */
const clearingTrees: string[] = []
for (const x of [470, 512, 548, 578, 892, 928, 966, 1004]) {
  clearingTrees.push(conifer(x, 706 + rand() * 10, 168 + rand() * 96, 27 + rand() * 12, rand))
}

const nearTrees: string[] = []
for (let x = -80; x < W + 90; x += 88 + rand() * 74) {
  if (x > 356 && x < 1120) continue
  nearTrees.push(conifer(x, 726 + rand() * 12, 220 + rand() * 160, 38 + rand() * 26, rand))
}

/* 中景两侧的枯枝，压住画面重量 */
const bares = [
  bareTree(190, 730, 224, rand),
  bareTree(1186, 726, 208, rand),
  bareTree(312, 742, 162, rand),
  bareTree(1082, 738, 154, rand),
]

/* 前景框景：贴边的粗树干，天然暗角，也给左侧文字让出干净背景 */
const edgeTrunks = [
  { x: -34, w: 52, d: 1 },
  { x: W + 8, w: 56, d: -1 },
]

/* 前景草丛：一条弧线一簇，随风摆动。分成暗部与月光勾边的两层 */
function makeGrass(seed: number, count: number, base: number, hMin: number, hMax: number) {
  const g = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const x = (i / count) * W + (g() - 0.5) * 46
    let d = ''
    const blades = 5 + Math.floor(g() * 5)
    for (let b = 0; b < blades; b++) {
      const bx = x + (g() - 0.5) * 52
      const bh = hMin + g() * (hMax - hMin)
      const lean = (g() - 0.5) * 52
      const w = 1.1 + g() * 1.4
      d += `M${n(bx - w)},${base}Q${n(bx + lean * 0.4)},${n(base - bh * 0.6)} ${n(bx + lean)},${n(base - bh)}`
      d += `Q${n(bx + lean * 0.4 + w)},${n(base - bh * 0.55)} ${n(bx + w)},${base}Z`
    }
    return { d, o: 0.55 + g() * 0.45, dur: 5.4 + g() * 4.6, delay: -g() * 8 }
  })
}

const grassDark = makeGrass(771, 30, 906, 54, 138)
const grassLit = makeGrass(991, 12, 906, 46, 112)

/* 地面积叶：窗光附近更亮，远处只剩暗影 */
const litter = (() => {
  const g = rng(3131)
  return Array.from({ length: 46 }, () => {
    const cx = 640 + (g() - 0.5) * 340
    const cy = 744 + g() * 96
    const near = Math.max(0, 1 - Math.abs(cx - 742) / 210) * Math.max(0, 1 - (cy - 740) / 110)
    return {
      cx: n(cx),
      cy: n(cy),
      rx: n(3 + g() * 7),
      ry: n(1.2 + g() * 2.4),
      rot: n(g() * 180),
      o: (0.1 + near * 0.45).toFixed(2),
      lit: near > 0.42,
    }
  })
})()

/* 落叶：用 CSS 变量驱动，一条 keyframes 复用到每一片 */
const leaves = Array.from({ length: 18 }, (_, i) => {
  const r = rng(5300 + i * 97)
  return {
    left: (r() * 100).toFixed(2) + '%',
    delay: (-r() * 24).toFixed(2) + 's',
    duration: (13 + r() * 15).toFixed(2) + 's',
    size: (5 + r() * 7).toFixed(1) + 'px',
    drift: (r() * 46 - 23).toFixed(0) + 'vw',
    spin: (r() * 980 - 490).toFixed(0) + 'deg',
    color: ['#a3672f', '#b8803f', '#7d4b26', '#c08a4a', '#6a3f22'][Math.floor(r() * 5)],
    opacity: (0.42 + r() * 0.45).toFixed(2),
  }
})
</script>

<template>
  <div class="cabin-forest" aria-hidden="true">
    <!-- 夜空 + 冷月 -->
    <div class="sky"></div>
    <div class="moon"><span class="moon-disc"></span><span class="moon-veil"></span></div>

    <!-- 云带：两层，极慢横移 -->
    <div class="clouds clouds--a"></div>
    <div class="clouds clouds--b"></div>

    <!-- 月光斜穿林间 -->
    <div class="shafts"></div>

    <svg class="art" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMax slice">
      <defs>
        <radialGradient id="cfHaze" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#cfe0ec" stop-opacity="0.27" />
          <stop offset="0.42" stop-color="#b7cbdb" stop-opacity="0.2" />
          <stop offset="0.74" stop-color="#8ea6b8" stop-opacity="0.09" />
          <stop offset="1" stop-color="#6c8398" stop-opacity="0" />
        </radialGradient>

        <linearGradient id="cfGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0e171e" />
          <stop offset="0.22" stop-color="#0a1117" />
          <stop offset="0.62" stop-color="#060a0e" />
          <stop offset="1" stop-color="#020407" />
        </linearGradient>

        <radialGradient id="cfGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#ffd9a6" stop-opacity="0.5" />
          <stop offset="0.3" stop-color="#f7ad66" stop-opacity="0.22" />
          <stop offset="0.64" stop-color="#c87740" stop-opacity="0.07" />
          <stop offset="1" stop-color="#8a4a24" stop-opacity="0" />
        </radialGradient>

        <radialGradient id="cfSpill" cx="0.5" cy="0.12" r="0.8">
          <stop offset="0" stop-color="#ffc98d" stop-opacity="0.4" />
          <stop offset="0.42" stop-color="#d18a4e" stop-opacity="0.14" />
          <stop offset="1" stop-color="#7a4520" stop-opacity="0" />
        </radialGradient>

        <linearGradient id="cfWindow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fffaf0" />
          <stop offset="0.45" stop-color="#ffd596" />
          <stop offset="1" stop-color="#f0a45a" />
        </linearGradient>

        <linearGradient id="cfRay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffcf9a" stop-opacity="0.34" />
          <stop offset="1" stop-color="#ffb070" stop-opacity="0" />
        </linearGradient>

        <linearGradient id="cfRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#b6cbd9" stop-opacity="0.55" />
          <stop offset="1" stop-color="#b6cbd9" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- 远山：雾里只剩一道更淡的轮廓 -->
      <path
        class="ridge"
        d="M0,650 L0,604 Q120,578 246,596 Q352,610 470,588 Q590,566 700,592 Q828,620 940,596 Q1064,570 1180,594 Q1300,618 1440,596 L1440,656 Z"
      />

      <!-- 谷底雾光：整个画面唯一的亮面，树都在它前面变成剪影 -->
      <ellipse cx="742" cy="664" rx="620" ry="98" fill="url(#cfHaze)" class="haze-back" />

      <!-- 林带 远 / 中 -->
      <g class="tier tier--far">
        <path v-for="(d, i) in farTrees" :key="'f' + i" :d="d" />
      </g>
      <g class="tier tier--mid">
        <path v-for="(d, i) in midTrees" :key="'m' + i" :d="d" />
      </g>

      <!-- 空地前的低雾，把屋子托起来 -->
      <ellipse cx="742" cy="716" rx="330" ry="52" fill="url(#cfHaze)" class="haze-mid" />

      <g class="tier tier--clearing">
        <path v-for="(d, i) in clearingTrees" :key="'c' + i" :d="d" />
      </g>

      <g class="tier tier--near">
        <path v-for="(d, i) in nearTrees" :key="'n' + i" :d="d" />
      </g>

      <g class="bares">
        <g v-for="(t, i) in bares" :key="'b' + i">
          <path :d="t.trunk" class="bare-trunk" />
          <path :d="t.twigs" class="bare-twig" />
        </g>
      </g>

      <!-- 近地坡面 -->
      <path
        class="ground"
        d="M0,900 L0,706 Q180,690 360,708 Q520,724 676,714 Q820,705 962,718 Q1150,734 1290,712 Q1372,700 1440,706 L1440,900 Z"
      />

      <!-- 屋前小径 -->
      <path
        class="path"
        d="M742,744 Q700,776 612,810 Q520,846 404,900 L640,900 Q700,858 748,808 Q782,774 792,744 Z"
      />

      <!-- 地面积叶 -->
      <g class="litter">
        <ellipse
          v-for="(l, i) in litter"
          :key="'lt' + i"
          :cx="l.cx"
          :cy="l.cy"
          :rx="l.rx"
          :ry="l.ry"
          :transform="`rotate(${l.rot} ${l.cx} ${l.cy})`"
          :class="{ lit: l.lit }"
          :style="{ opacity: l.o }"
        />
      </g>

      <!-- 小屋 -->
      <g class="cabin">
        <!-- 光晕：唯一暖光源，也是整个画面的情绪锚点 -->
        <ellipse cx="716" cy="710" rx="156" ry="104" fill="url(#cfGlow)" class="glow" />
        <ellipse cx="742" cy="750" rx="156" ry="36" fill="url(#cfSpill)" class="spill" />
        <path d="M716,712 L628,766 L694,766 Z" fill="url(#cfRay)" class="ray" />

        <!-- 烟囱 -->
        <rect x="784" y="632" width="15" height="42" rx="1.5" class="chimney" />

        <!-- 墙体 / 山墙 / 屋顶 -->
        <path d="M662,744 L662,692 L818,692 L818,744 Z" class="wall" />
        <path d="M660,694 L740,648 L820,694 Z" class="gable" />
        <path d="M642,698 L740,634 L838,698 L822,701 L740,650 L658,701 Z" class="roof" />
        <path d="M642,698 L740,634 L838,698" class="roof-rim" />
        <path d="M642,699 L838,699" class="roof-eave" />

        <!-- 炊烟：压在屋顶之上，慢慢散开 -->
        <g class="smoke">
          <ellipse cx="791" cy="626" rx="7" ry="5" class="puff p1" />
          <ellipse cx="794" cy="610" rx="11" ry="7" class="puff p2" />
          <ellipse cx="786" cy="590" rx="16" ry="10" class="puff p3" />
        </g>

        <!-- 窗：两扇，暖得不刺眼 -->
        <g class="window">
          <rect x="676" y="702" width="26" height="30" rx="1" fill="url(#cfWindow)" />
          <rect x="708" y="702" width="26" height="30" rx="1" fill="url(#cfWindow)" />
          <path d="M676,717 h58 M689,702 v30 M721,702 v30" class="window-frame" />
          <rect x="676" y="702" width="58" height="30" rx="1" class="window-glass" />
        </g>

        <!-- 门：门缝透出一条暖线 -->
        <path d="M756,744 L756,698 L786,698 L786,744 Z" class="door" />
        <path d="M758,744 L758,700 L762,700 L762,744 Z" class="door-gap" />

        <!-- 门口柴堆 / 院栏 -->
        <g class="props">
          <rect x="632" y="728" width="26" height="16" rx="2" />
          <rect x="636" y="718" width="22" height="11" rx="2" />
          <path d="M826,744 v-24 M846,744 v-26 M866,744 v-22 M824,726 h44 M824,735 h44" />
        </g>
      </g>

      <!-- 冷月光在屋脊上的高位轮廓光 -->
      <path d="M648,694 L740,640 L746,643 L656,695 Z" fill="url(#cfRim)" class="rim" />
    </svg>

    <!-- 前景框景枝干 -->
    <svg class="frame-edge" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMax slice">
      <g v-for="(t, i) in edgeTrunks" :key="'e' + i">
        <path
          :d="`M${t.x},900 L${t.x + t.d * t.w},900 L${t.x + t.d * t.w * 0.58},0 L${t.x + t.d * 0.02},0 Z`"
          class="edge-trunk"
        />
        <path
          :d="
            t.d === 1
              ? `M${t.x + 12},132 Q${t.x + 128},76 ${t.x + 286},100 Q${t.x + 156},104 ${t.x + 24},186 Z`
              : `M${t.x - 12},104 Q${t.x - 136},56 ${t.x - 306},88 Q${t.x - 158},92 ${t.x - 24},158 Z`
          "
          class="edge-branch"
        />
      </g>
    </svg>

    <!-- 前景草：随风低伏 -->
    <svg class="grass" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMax slice">
      <path
        v-for="(c, i) in grassDark"
        :key="'gd' + i"
        :d="c.d"
        :style="{ opacity: c.o, animationDuration: c.dur + 's', animationDelay: c.delay + 's' }"
        class="blade"
      />
      <path
        v-for="(c, i) in grassLit"
        :key="'gl' + i"
        :d="c.d"
        :style="{ opacity: c.o * 0.75, animationDuration: c.dur + 1.4 + 's', animationDelay: c.delay + 's' }"
        class="blade blade--lit"
      />
    </svg>

    <!-- 落叶 -->
    <div class="leaf-field">
      <i
        v-for="(l, i) in leaves"
        :key="'l' + i"
        class="leaf"
        :style="{
          left: l.left,
          animationDelay: l.delay,
          animationDuration: l.duration,
          width: l.size,
          height: l.size,
          background: l.color,
          opacity: l.opacity,
          '--drift': l.drift,
          '--spin': l.spin,
        }"
      />
    </div>

    <!-- 后期：调色 / 暗角 / 颗粒 -->
    <div class="grade"></div>
    <div class="vignette"></div>
    <div class="grain"></div>
  </div>
</template>

<style scoped>
.cabin-forest {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #05080d;
}

/* ---------------- 天与月 ---------------- */
/* 上暗下亮：雾光是画面的最高亮度，所有树都在它前面变成剪影 */
.sky {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(56% 34% at 26% 8%, rgba(168, 194, 216, 0.17), transparent 62%),
    linear-gradient(
      180deg,
      #04070c 0%,
      #080f16 22%,
      #101a23 44%,
      #17242e 60%,
      #1e2d38 74%,
      #24343f 86%,
      #18222a 100%
    );
}

.moon {
  position: absolute;
  left: 25%;
  top: 8%;
  width: clamp(76px, 8.6vmin, 122px);
  aspect-ratio: 1;
  opacity: 0.62;
}

.moon-disc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 32%, #f7fafd 0%, #dde7ef 36%, #bccbd7 64%, #94a5b2 100%);
  box-shadow:
    0 0 46px 12px rgba(186, 210, 230, 0.18),
    0 0 140px 52px rgba(146, 176, 202, 0.09);
}

.moon-veil {
  position: absolute;
  inset: -36% -28%;
  background: radial-gradient(ellipse at 42% 46%, rgba(128, 148, 164, 0.46), transparent 64%);
  animation: veil-drift 42s ease-in-out infinite alternate;
}

.clouds {
  position: absolute;
  left: -25%;
  right: -25%;
  height: 44%;
  top: 2%;
  background:
    radial-gradient(46% 34% at 38% 42%, rgba(136, 158, 176, 0.2), transparent 68%),
    radial-gradient(38% 26% at 64% 30%, rgba(118, 140, 160, 0.16), transparent 70%),
    radial-gradient(30% 22% at 20% 62%, rgba(104, 126, 146, 0.12), transparent 72%);
  animation: cloud-drift 96s linear infinite;
  will-change: transform;
}

.clouds--b {
  top: 18%;
  height: 36%;
  opacity: 0.7;
  animation-duration: 148s;
  animation-direction: reverse;
}

/* 月光斜穿林间：两条极淡的光束 */
.shafts {
  position: absolute;
  inset: -10% -10% 0;
  background:
    linear-gradient(
      104deg,
      transparent 30%,
      rgba(196, 220, 240, 0.07) 43%,
      rgba(216, 234, 250, 0.11) 47%,
      rgba(196, 220, 240, 0.05) 53%,
      transparent 66%
    ),
    linear-gradient(98deg, transparent 58%, rgba(196, 220, 240, 0.045) 68%, transparent 78%);
  animation: shaft-breathe 26s ease-in-out infinite alternate;
}

/* ---------------- 画面本体 ---------------- */
.art,
.frame-edge,
.grass {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.ridge {
  fill: #33475a;
  opacity: 0.4;
}

.tier--far {
  fill: #26343f;
  opacity: 0.86;
}

.tier--mid {
  fill: #0b1319;
  opacity: 0.97;
}

.tier--clearing {
  fill: #080f15;
  opacity: 0.94;
}

.tier--near {
  fill: #04070a;
}

.bare-trunk {
  fill: none;
  stroke: #05090d;
  stroke-width: 3.4;
  stroke-linecap: round;
}

.bare-twig {
  fill: none;
  stroke: #05090d;
  stroke-width: 1.4;
  stroke-linecap: round;
  opacity: 0.9;
}

.ground {
  fill: url(#cfGround);
}

.path {
  fill: #101a20;
  opacity: 0.8;
}

.litter ellipse {
  fill: #2a1c10;
}

.litter ellipse.lit {
  fill: #7a4a22;
}

.haze-back {
  opacity: 1;
  animation: mist-breathe 34s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: 50% 50%;
}

.haze-mid {
  opacity: 0.72;
  animation: mist-drift 27s ease-in-out infinite alternate;
  transform-box: fill-box;
  transform-origin: 50% 50%;
}

/* ---------------- 小屋 ---------------- */
.chimney {
  fill: #05080b;
}

.wall {
  fill: #05090d;
}

.gable {
  fill: #070c11;
}

.roof {
  fill: #03060a;
}

.roof-rim {
  fill: none;
  stroke: rgba(178, 202, 222, 0.32);
  stroke-width: 1.1;
}

.roof-eave {
  fill: none;
  stroke: #020406;
  stroke-width: 2;
}

.window rect {
  fill: url(#cfWindow);
}

.window-glass {
  fill: none;
  stroke: rgba(255, 202, 140, 0.6);
  stroke-width: 0.9;
}

.window-frame {
  fill: none;
  stroke: #120c07;
  stroke-width: 1.6;
  opacity: 0.85;
}

.door {
  fill: #04070a;
}

.door-gap {
  fill: #e8a763;
  opacity: 0.55;
}

.props {
  fill: #04070a;
  stroke: #04070a;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.glow {
  animation: ember-glow 9s ease-in-out infinite;
}

.spill {
  animation: ember-glow 9s ease-in-out infinite 1.4s;
}

.ray {
  opacity: 0.55;
  animation: ray-flicker 11s ease-in-out infinite;
}

.rim {
  opacity: 0.6;
}

.smoke {
  fill: #a9bccb;
}

.puff {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: smoke-rise 9s linear infinite;
}

.p1 {
  animation-delay: 0s;
}
.p2 {
  animation-delay: 3s;
}
.p3 {
  animation-delay: 6s;
}

/* ---------------- 框景 ---------------- */
.edge-trunk {
  fill: #010305;
  opacity: 0.97;
}

.edge-branch {
  fill: #010305;
  opacity: 0.9;
}

/* ---------------- 草 ---------------- */
.blade {
  fill: #060a0e;
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: wind-sway 8s ease-in-out infinite alternate;
}

.blade--lit {
  fill: #46606f;
}

/* ---------------- 落叶 ---------------- */
.leaf-field {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.leaf {
  position: absolute;
  top: -6vh;
  border-radius: 0 100% 0 100%;
  will-change: transform;
  animation-name: leaf-fall;
  animation-timing-function: cubic-bezier(0.42, 0.02, 0.62, 0.98);
  animation-iteration-count: infinite;
  box-shadow: 0 0 5px rgba(255, 176, 110, 0.16);
}

/* ---------------- 后期 ---------------- */
.grade {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(56% 42% at 52% 66%, rgba(214, 158, 100, 0.12), transparent 70%),
    linear-gradient(
      180deg,
      rgba(9, 16, 24, 0.42) 0%,
      rgba(9, 16, 24, 0.03) 20%,
      transparent 48%,
      rgba(3, 6, 10, 0.5) 100%
    );
  mix-blend-mode: multiply;
  opacity: 0.72;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    124% 96% at 50% 44%,
    transparent 32%,
    rgba(3, 6, 10, 0.3) 70%,
    rgba(2, 4, 7, 0.76) 100%
  );
}

.grain {
  position: absolute;
  inset: 0;
  opacity: 0.055;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}

@keyframes cloud-drift {
  from {
    transform: translate3d(-6%, 0, 0);
  }
  to {
    transform: translate3d(6%, 0, 0);
  }
}

@keyframes veil-drift {
  from {
    transform: translate3d(-3%, 2%, 0) scale(1);
    opacity: 0.75;
  }
  to {
    transform: translate3d(4%, -2%, 0) scale(1.08);
    opacity: 1;
  }
}

@keyframes shaft-breathe {
  from {
    opacity: 0.5;
  }
  to {
    opacity: 1;
  }
}

@keyframes ember-glow {
  0%,
  100% {
    opacity: 0.7;
  }
  38% {
    opacity: 0.94;
  }
  62% {
    opacity: 0.64;
  }
  81% {
    opacity: 0.9;
  }
}

@keyframes ray-flicker {
  0%,
  100% {
    opacity: 0.34;
  }
  40% {
    opacity: 0.56;
  }
  70% {
    opacity: 0.28;
  }
}

@keyframes mist-breathe {
  0%,
  100% {
    opacity: 0.82;
    transform: scale(1) translateX(-6px);
  }
  50% {
    opacity: 1;
    transform: scale(1.06) translateX(10px);
  }
}

@keyframes mist-drift {
  from {
    transform: translateX(-16px) scale(0.97);
    opacity: 0.6;
  }
  to {
    transform: translateX(18px) scale(1.05);
    opacity: 0.85;
  }
}

@keyframes smoke-rise {
  0% {
    opacity: 0;
    transform: translateY(14px) scale(0.6);
  }
  12% {
    opacity: 0.26;
  }
  55% {
    opacity: 0.18;
    transform: translateY(-26px) scale(1.35) translateX(6px);
  }
  100% {
    opacity: 0;
    transform: translateY(-64px) scale(2.1) translateX(14px);
  }
}

@keyframes wind-sway {
  from {
    transform: rotate(-1.5deg) skewX(1.6deg);
  }
  to {
    transform: rotate(1.9deg) skewX(-2deg);
  }
}

@keyframes leaf-fall {
  0% {
    transform: translate3d(0, -8vh, 0) rotate(0deg);
    opacity: 0;
  }
  9% {
    opacity: 1;
  }
  50% {
    transform: translate3d(calc(var(--drift) * 0.45), 48vh, 0) rotate(calc(var(--spin) * 0.45));
  }
  88% {
    opacity: 1;
  }
  100% {
    transform: translate3d(var(--drift), 106vh, 0) rotate(var(--spin));
    opacity: 0;
  }
}

@media (max-width: 900px) {
  .moon {
    left: 13%;
    top: 4%;
    width: 58px;
    opacity: 0.46;
  }
  .shafts {
    opacity: 0.7;
  }
  .grain {
    opacity: 0.045;
  }
}
</style>
