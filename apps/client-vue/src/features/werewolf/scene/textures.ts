import * as THREE from 'three'

/** 确定性随机，保证每次生成的纹理一致 */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

function toTexture(c: HTMLCanvasElement, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** 深色木墙：竖向木板 + 木纹 + 节疤 */
export function woodTexture(repeat = [2, 1]) {
  const { c, ctx } = makeCanvas(512, 512)
  const rnd = mulberry32(7)
  ctx.fillStyle = '#5e4835'
  ctx.fillRect(0, 0, 512, 512)

  const plank = 64
  for (let x = 0; x < 512; x += plank) {
    const shade = 0.82 + rnd() * 0.3
    ctx.fillStyle = `rgb(${Math.round(59 * shade)},${Math.round(45 * shade)},${Math.round(34 * shade)})`
    ctx.fillRect(x, 0, plank - 2, 512)

    // 木纹
    for (let i = 0; i < 26; i++) {
      const gx = x + rnd() * plank
      ctx.strokeStyle = `rgba(${rnd() > 0.5 ? '20,14,10' : '110,86,60'},${0.05 + rnd() * 0.12})`
      ctx.lineWidth = 0.6 + rnd()
      ctx.beginPath()
      ctx.moveTo(gx, 0)
      ctx.bezierCurveTo(gx + rnd() * 8 - 4, 170, gx + rnd() * 8 - 4, 340, gx + rnd() * 6 - 3, 512)
      ctx.stroke()
    }
    // 节疤
    if (rnd() > 0.55) {
      const ky = rnd() * 512
      const kx = x + 12 + rnd() * (plank - 24)
      const g = ctx.createRadialGradient(kx, ky, 1, kx, ky, 7 + rnd() * 5)
      g.addColorStop(0, 'rgba(18,12,8,.55)')
      g.addColorStop(1, 'rgba(18,12,8,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(kx, ky, 8, 5, rnd(), 0, Math.PI * 2)
      ctx.fill()
    }
    // 板缝
    ctx.fillStyle = 'rgba(8,6,4,.65)'
    ctx.fillRect(x + plank - 2, 0, 2, 512)
  }

  // 整体脏旧
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`
    ctx.fillRect(rnd() * 512, rnd() * 512, rnd() * 3, rnd() * 12)
  }
  return toTexture(c, repeat[0], repeat[1])
}

/** 地板：横向长条 */
export function floorTexture(repeat = [4, 4]) {
  const { c, ctx } = makeCanvas(512, 512)
  const rnd = mulberry32(21)
  ctx.fillStyle = '#362a20'
  ctx.fillRect(0, 0, 512, 512)
  const rows = 8
  for (let y = 0; y < 512; y += rows) {
    const h = rows - 1.5
    const shade = 0.8 + rnd() * 0.35
    ctx.fillStyle = `rgb(${Math.round(58 * shade)},${Math.round(44 * shade)},${Math.round(33 * shade)})`
    ctx.fillRect(0, y, 512, h)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${rnd() > 0.5 ? '0,0,0' : '140,110,80'},${rnd() * 0.1})`
      ctx.fillRect(rnd() * 512, y + rnd() * h, 20 + rnd() * 90, 0.8)
    }
  }
  return toTexture(c, repeat[0], repeat[1])
}

/** 雪地：冷灰白 + 细颗粒 */
export function snowTexture(repeat = [10, 10]) {
  const { c, ctx } = makeCanvas(256, 256)
  const rnd = mulberry32(3)
  ctx.fillStyle = '#c2ccce'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 9000; i++) {
    const v = 160 + rnd() * 70
    ctx.fillStyle = `rgba(${v},${v + 6},${v + 8},${rnd() * 0.5})`
    ctx.fillRect(rnd() * 256, rnd() * 256, 1.2, 1.2)
  }
  return toTexture(c, repeat[0], repeat[1])
}

/** 石头：用于壁炉与石径 */
export function stoneTexture(repeat = [1, 1]) {
  const { c, ctx } = makeCanvas(256, 256)
  const rnd = mulberry32(11)
  ctx.fillStyle = '#3a3a38'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 256
    const y = rnd() * 256
    const w = 20 + rnd() * 50
    const h = 14 + rnd() * 30
    const v = 40 + rnd() * 45
    ctx.fillStyle = `rgb(${v},${v},${v - 2})`
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 6)
    ctx.fill()
  }
  return toTexture(c, repeat[0], repeat[1])
}

/** 火焰：加色混合用的径向火苗 */
export function flameTexture() {
  const { c, ctx } = makeCanvas(128, 128)
  const g = ctx.createRadialGradient(64, 76, 2, 64, 64, 60)
  g.addColorStop(0, 'rgba(255,246,214,1)')
  g.addColorStop(0.25, 'rgba(255,196,110,.95)')
  g.addColorStop(0.55, 'rgba(240,120,50,.55)')
  g.addColorStop(1, 'rgba(180,60,20,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(64, 66, 26, 46, 0, 0, Math.PI * 2)
  ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 柔光点：窗光、月晕 */
export function glowTexture() {
  const { c, ctx } = makeCanvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.2, 'rgba(255,235,200,.7)')
  g.addColorStop(0.55, 'rgba(255,200,140,.18)')
  g.addColorStop(1, 'rgba(255,180,110,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
