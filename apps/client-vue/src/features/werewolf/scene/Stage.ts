import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import * as TEX from './textures'
import { SEATS, SEAT_RING } from '../data/seats'

const CABIN = { w: 11, d: 9, h: 3.55, cz: -4 }
const TABLE = new THREE.Vector3(0, 0.78, -4)

const GATE_CAM = new THREE.Vector3(0, 2.05, 8.8)
const GATE_TGT = new THREE.Vector3(0, 2.35, -4)
const LOBBY_CAM = new THREE.Vector3(0, 1.95, 0.3)
const LOBBY_TGT = new THREE.Vector3(0, 0.62, -4.1)

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export type ViewMode = 'gate' | 'lobby'

export interface StageHooks {
  onSeatHover?: (id: number | null, x: number, y: number) => void
  onSeatClick?: (id: number) => void
  onProgress?: (p: number) => void
  onReady?: () => void
}

export class Stage {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  composer!: EffectComposer
  clock = { last: performance.now() }
  hooks: StageHooks

  private container: HTMLElement
  private view: ViewMode = 'gate'
  private entering = false
  private enterT = 0
  private enterDur = 3.6
  private doorPivot!: THREE.Group

  private gatePosCurve!: THREE.CatmullRomCurve3
  private gateTgtCurve!: THREE.CatmullRomCurve3

  private chandelier!: THREE.SpotLight
  private fireLight!: THREE.PointLight
  private chandelierFill!: THREE.PointLight
  private porchLight!: THREE.PointLight
  private windowGlows: THREE.PointLight[] = []

  private candleLights: THREE.PointLight[] = []
  private candleFlames: THREE.Sprite[] = []
  private fireFlames: THREE.Sprite[] = []
  private candleOn = 0

  private seatRings: THREE.Mesh[] = []
  private seatBacks: THREE.MeshStandardMaterial[] = []
  private seatMeshes: THREE.Object3D[] = []
  private hovered: number | null = null
  private selected: number | null = null

  private snow!: THREE.Points
  private snowVel: Float32Array = new Float32Array(0)
  private dust!: THREE.Points
  private stars!: THREE.Points

  private fog = new THREE.FogExp2(0x0a1512, 0.03)
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2(-10, -10)
  private orbit = { yaw: 0, pitch: 0, dragging: false, lastX: 0, lastY: 0 }
  private baseFov = 45
  private t = 0
  private running = true

  constructor(canvas: HTMLCanvasElement, hooks: StageHooks = {}) {
    this.hooks = hooks
    this.container = canvas.parentElement as HTMLElement

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 220)
    this.camera.position.copy(GATE_CAM)
    this.camera.lookAt(GATE_TGT)

    this.scene.fog = this.fog
    this.scene.background = new THREE.Color(0x070d0b)

    this.buildSky()
    this.buildTerrain()
    this.buildForest()
    this.buildCabin()
    this.buildInterior()
    this.buildFireplace()
    this.buildSnow()
    this.buildDust()
    this.buildStars()
    this.buildCameraPath()
    this.buildPost()

    this.resize()
    window.addEventListener('resize', this.resize)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)

    // 第一帧后回调
    this.hooks.onReady?.()
    this.loop()
  }

  /* ---------------- 世界 ---------------- */

  private buildSky() {
    const geo = new THREE.SphereGeometry(120, 32, 20)
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x04090b) },
        bottom: { value: new THREE.Color(0x3a4036) },
        exponent: { value: 0.85 },
      },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float exponent; varying vec3 vW;
        void main(){ float h = normalize(vW).y; float k = pow(max(h,0.0), exponent); gl_FragColor = vec4(mix(bottom, top, k), 1.0); }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
    this.scene.add(new THREE.Mesh(geo, mat))

    // 月
    const moonTex = TEX.glowTexture()
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: moonTex, color: 0xdfe9f2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    )
    moon.position.set(-26, 23, -52)
    moon.scale.setScalar(9)
    this.scene.add(moon)
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: moonTex, color: 0x8fa6bb, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    )
    halo.position.copy(moon.position)
    halo.scale.setScalar(34)
    this.scene.add(halo)
  }

  private buildTerrain() {
    const snowMap = TEX.snowTexture([14, 14])
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(70, 64),
      new THREE.MeshStandardMaterial({ map: snowMap, color: 0xbfcaca, roughness: 0.96, metalness: 0 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    // 月光
    const moonLight = new THREE.DirectionalLight(0xa8c0d6, 3.0)
    moonLight.position.set(-16, 22, 14)
    moonLight.castShadow = true
    moonLight.shadow.mapSize.set(2048, 2048)
    moonLight.shadow.camera.left = -30
    moonLight.shadow.camera.right = 30
    moonLight.shadow.camera.top = 30
    moonLight.shadow.camera.bottom = -30
    moonLight.shadow.camera.far = 90
    moonLight.shadow.bias = -0.0006
    this.scene.add(moonLight)

    this.scene.add(new THREE.HemisphereLight(0x41565c, 0x241c16, 1.25))

    // 石径
    const stoneMap = TEX.stoneTexture()
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneMap, color: 0x8b8b86, roughness: 0.95 })
    for (let i = 0; i < 18; i++) {
      const z = 11.4 - i * 0.62
      const x = Math.sin(i * 1.7) * 0.42
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.05 + Math.random() * 0.3, 0.09, 0.5), stoneMat)
      s.position.set(x, 0.045, z)
      s.rotation.y = (Math.random() - 0.5) * 0.5
      s.receiveShadow = true
      this.scene.add(s)
    }
  }

  private buildForest() {
    const group = new THREE.Group()
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.24, 1.5, 6)
    const coneGeo = [new THREE.ConeGeometry(1.28, 2.3, 7), new THREE.ConeGeometry(0.95, 2.0, 7), new THREE.ConeGeometry(0.6, 1.7, 7)]
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 1 })
    const needleMat = new THREE.MeshStandardMaterial({ color: 0x18251f, roughness: 1, flatShading: true })

    const count = 150
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count)
    const cones = coneGeo.map((g) => new THREE.InstancedMesh(g, needleMat, count))
    for (const m of [trunks, ...cones]) {
      m.castShadow = true
      m.receiveShadow = true
      group.add(m)
    }

    const offsets = [0, 2.1, 3.35, 4.5]
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const m = new THREE.Matrix4()
    const tmp = new THREE.Matrix4()

    for (let i = 0; i < count; i++) {
      let x = 0
      let z = 0
      let tries = 0
      do {
        const a = Math.random() * Math.PI * 2
        const r = 15 + Math.pow(Math.random(), 0.7) * 26
        x = Math.cos(a) * r
        z = Math.sin(a) * r - 2
        tries++
      } while (Math.abs(x) < 8 && z > -9 && tries < 40)

      const s = 0.85 + Math.random() * 0.85
      const yaw = Math.random() * Math.PI * 2
      quat.setFromEuler(new THREE.Euler(0, yaw, 0))
      scale.set(s, s * (0.9 + Math.random() * 0.3), s)
      pos.set(x, 0, z)
      m.compose(pos, quat, scale)

      trunks.setMatrixAt(i, m)
      cones.forEach((c, k) => {
        tmp.makeTranslation(0, offsets[k + 1] / scale.y, 0)
        c.setMatrixAt(i, m.clone().multiply(tmp))
      })
    }
    group.updateMatrixWorld()
    this.scene.add(group)

    // 前景框景树
    const framePos = [
      [-7.2, 5.4, 1.65], [-8.6, 2.4, 1.9], [-6.4, -1.6, 1.5],
      [7.4, 5.0, 1.7], [8.8, 2.0, 1.85], [6.6, -2.0, 1.45],
    ]
    for (const [x, z, sc] of framePos) {
      const t = new THREE.Group()
      const trunk = new THREE.Mesh(trunkGeo, trunkMat)
      trunk.position.y = 0.75 * sc
      trunk.scale.setScalar(sc)
      t.add(trunk)
      coneGeo.forEach((g, k) => {
        const c = new THREE.Mesh(g, needleMat)
        c.position.y = (2.1 + k * 1.2) * sc
        c.scale.setScalar(sc)
        c.castShadow = true
        t.add(c)
      })
      t.position.set(x, 0, z)
      this.scene.add(t)
    }
    this.scene.add(group)
  }

  private buildCabin() {
    const wallMap = TEX.woodTexture([3, 1])
    const wallMat = new THREE.MeshStandardMaterial({ map: wallMap, color: 0xcaa87c, roughness: 0.92 })
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.95 })

    const addWall = (w: number, h: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), wallMat)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.scene.add(mesh)
      return mesh
    }

    const front = CABIN.cz + CABIN.d / 2 // 0.5
    const back = CABIN.cz - CABIN.d / 2 // -8.5
    const left = -CABIN.w / 2
    const right = CABIN.w / 2

    // 前墙（留门洞 1.3 × 2.3）
    addWall(4.85, CABIN.h, -3.08, CABIN.h / 2, front)
    addWall(4.85, CABIN.h, 3.08, CABIN.h / 2, front)
    addWall(1.3, CABIN.h - 2.3, 0, 2.3 + (CABIN.h - 2.3) / 2, front)

    // 侧墙 / 后墙
    const side = () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, CABIN.h, CABIN.d), wallMat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.scene.add(mesh)
      return mesh
    }
    const l = side()
    l.position.set(left, CABIN.h / 2, CABIN.cz)
    const r = side()
    r.position.set(right, CABIN.h / 2, CABIN.cz)
    const b = new THREE.Mesh(new THREE.BoxGeometry(CABIN.w, CABIN.h, 0.18), wallMat)
    b.position.set(0, CABIN.h / 2, back)
    b.receiveShadow = true
    this.scene.add(b)

    // 室内地板
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(CABIN.w - 0.2, CABIN.d - 0.2),
      new THREE.MeshStandardMaterial({ map: TEX.floorTexture([5, 4]), color: 0x9a8060, roughness: 0.82 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0.02, CABIN.cz)
    floor.receiveShadow = true
    this.scene.add(floor)

    // 屋顶
    const ridgeY = 5.25
    const eaveY = CABIN.h
    const halfSpan = 6.15
    const angle = Math.atan2(ridgeY - eaveY, halfSpan)
    const slabLen = Math.hypot(ridgeY - eaveY, halfSpan) + 0.15
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2f251d, roughness: 0.9 })
    const snowCap = new THREE.MeshStandardMaterial({ color: 0xdae4e2, roughness: 0.9 })
    for (const dir of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(slabLen, 0.2, CABIN.d + 0.9), roofMat)
      slab.position.set((dir * halfSpan) / 2, (eaveY + ridgeY) / 2, CABIN.cz)
      slab.rotation.z = -dir * angle
      slab.castShadow = true
      slab.receiveShadow = true
      this.scene.add(slab)

      const snow = new THREE.Mesh(new THREE.BoxGeometry(slabLen * 0.98, 0.07, CABIN.d + 0.9), snowCap)
      snow.position.set((dir * halfSpan) / 2, (eaveY + ridgeY) / 2 + 0.13, CABIN.cz)
      snow.rotation.z = -dir * angle
      snow.castShadow = true
      this.scene.add(snow)
    }

    // 山墙
    const gable = new THREE.Shape()
    gable.moveTo(-CABIN.w / 2, 0)
    gable.lineTo(CABIN.w / 2, 0)
    gable.lineTo(0, ridgeY - eaveY)
    gable.closePath()
    const gableGeo = new THREE.ShapeGeometry(gable)
    for (const z of [front, back]) {
      const g = new THREE.Mesh(gableGeo, wallMat)
      g.position.set(0, eaveY, z)
      g.castShadow = true
      this.scene.add(g)
    }

    // 烟囱
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.4, 0.95), new THREE.MeshStandardMaterial({ map: TEX.stoneTexture(), color: 0x6d6a63, roughness: 0.95 }))
    chimney.position.set(-3.3, 5.1, -6.2)
    chimney.castShadow = true
    this.scene.add(chimney)

    // 门框 + 门
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.85 })
    for (const x of [-0.68, 0.68]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.34, 0.24), frameMat)
      post.position.set(x, 1.17, front + 0.06)
      this.scene.add(post)
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.1, 0.24), frameMat)
    lintel.position.set(0, 2.35, front + 0.06)
    this.scene.add(lintel)

    this.doorPivot = new THREE.Group()
    this.doorPivot.position.set(-0.62, 0, front)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.24, 2.28, 0.09), new THREE.MeshStandardMaterial({ map: TEX.woodTexture([1, 2]), color: 0x7a5c3f, roughness: 0.8 }))
    door.position.set(0.62, 1.14, 0)
    door.castShadow = true
    this.doorPivot.add(door)
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd4b27a, metalness: 0.8, roughness: 0.25 }))
    handle.position.set(1.12, 1.1, 0.07)
    this.doorPivot.add(handle)
    this.scene.add(this.doorPivot)

    // 窗（暖光）
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2b1d10, emissive: 0xffa860, emissiveIntensity: 6, roughness: 0.5 })
    for (const x of [-3.4, 3.4]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 1.12), winMat)
      win.position.set(x, 1.62, front + 0.14)
      this.scene.add(win)
      const grid = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.05, 0.06), frameMat)
      grid.position.set(x, 1.62, front + 0.17)
      this.scene.add(grid)
      const gridV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.12, 0.06), frameMat)
      gridV.position.set(x, 1.62, front + 0.17)
      this.scene.add(gridV)

      const glow = new THREE.PointLight(0xffa860, 17, 10, 2)
      glow.position.set(x, 1.5, front + 1.1)
      this.scene.add(glow)
      this.windowGlows.push(glow)
    }

    // 外立面暖光（模拟室内溢光，让木屋轮廓从夜色中立起来）
    const facade = new THREE.PointLight(0xffb877, 62, 20, 2)
    facade.position.set(0, 2.1, 2.3)
    this.scene.add(facade)

    // 门廊灯
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc07a, emissiveIntensity: 6 }))
    lamp.position.set(0.95, 2.55, front + 0.2)
    this.scene.add(lamp)
    this.porchLight = new THREE.PointLight(0xffb070, 22, 10, 2)
    this.porchLight.position.copy(lamp.position)
    this.scene.add(this.porchLight)
  }

  private buildInterior() {
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x33261d, roughness: 0.9 })
    const tableTop = new THREE.MeshStandardMaterial({ map: TEX.woodTexture([3, 1]), color: 0xa5835e, roughness: 0.42, metalness: 0.06 })

    // 长桌（椭圆）
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 64), tableTop)
    top.scale.set(2.1, 1, 0.7)
    top.position.copy(TABLE)
    top.castShadow = true
    top.receiveShadow = true
    this.scene.add(top)

    const apron = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 64), darkWood)
    apron.scale.set(2.02, 1, 0.64)
    apron.position.set(TABLE.x, TABLE.y - 0.11, TABLE.z)
    this.scene.add(apron)

    for (const [x, z] of [
      [-1.7, -4.42],
      [1.7, -4.42],
      [-1.7, -3.58],
      [1.7, -3.58],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.12), darkWood)
      leg.position.set(x, 0.36, z)
      this.scene.add(leg)
    }

    // 九把椅子
    SEATS.forEach((seat, i) => {
      const a = (90 - i * 40) * (Math.PI / 180)
      const x = TABLE.x + Math.cos(a) * SEAT_RING.x
      const z = TABLE.z + Math.sin(a) * SEAT_RING.z
      const chair = this.makeChair(i === 0)
      chair.userData.seatId = seat.id
      chair.position.set(x, 0, z)
      chair.rotation.y = Math.atan2(TABLE.x - x, TABLE.z - z)
      this.scene.add(chair)
      this.seatMeshes.push(chair)

      // 光环
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 40),
        new THREE.MeshBasicMaterial({ color: 0xd4b27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(x, 0.03, z)
      this.scene.add(ring)
      this.seatRings.push(ring)

      // 烛台
      const cx = TABLE.x + Math.cos(a) * 1.85
      const cz = TABLE.z + Math.sin(a) * 0.58
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xe8dcc2, roughness: 0.7 }))
      candle.position.set(cx, TABLE.y + 0.09, cz)
      this.scene.add(candle)

      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: TEX.flameTexture(), color: 0xffc98a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      flame.position.set(cx, TABLE.y + 0.24, cz)
      flame.scale.set(0.085, 0.135, 1)
      flame.visible = false
      this.scene.add(flame)
      this.candleFlames.push(flame)

      const light = new THREE.PointLight(0xffb066, 0, 3.2, 2)
      light.position.copy(flame.position)
      this.scene.add(light)
      this.candleLights.push(light)
    })

    // 吊灯
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.028, 8, 40), new THREE.MeshStandardMaterial({ color: 0x2f2a24, metalness: 0.7, roughness: 0.4 }))
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, 2.52, TABLE.z)
    this.scene.add(ring)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flameTexture(), color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      f.position.set(Math.cos(a) * 0.5, 2.6, TABLE.z + Math.sin(a) * 0.5)
      f.scale.set(0.16, 0.24, 1)
      this.scene.add(f)
    }
    this.chandelier = new THREE.SpotLight(0xffc089, 0, 11, 0.86, 0.9, 2)
    this.chandelier.position.set(0, 2.42, TABLE.z)
    this.chandelier.target.position.set(0, 0.7, TABLE.z)
    this.scene.add(this.chandelier)
    this.scene.add(this.chandelier.target)
    // 吊灯本体的柔光，只照亮灯下小范围
    this.chandelierFill = new THREE.PointLight(0xffb877, 0, 2.2, 2)
    this.chandelierFill.position.set(0, 2.16, TABLE.z)
    this.scene.add(this.chandelierFill)

    // 天花板
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(CABIN.w - 0.2, CABIN.d - 0.2),
      new THREE.MeshStandardMaterial({ color: 0x1a130e, roughness: 1 }),
    )
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.set(0, CABIN.h - 0.02, CABIN.cz)
    this.scene.add(ceiling)

    // 横梁
    for (const z of [-1.2, -4, -6.8]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(CABIN.w - 0.4, 0.18, 0.22), new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 1 }))
      beam.position.set(0, CABIN.h - 0.12, z)
      this.scene.add(beam)
    }
  }

  private makeChair(isHuman: boolean): THREE.Group {
    const g = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.85 })

    const seatGeo = new THREE.BoxGeometry(0.5, 0.07, 0.48)
    const seat = new THREE.Mesh(seatGeo, wood)
    seat.position.y = 0.47
    seat.castShadow = true
    g.add(seat)

    const backGeo = new THREE.BoxGeometry(0.52, 0.62, 0.06)
    const backMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.85, emissive: 0x000000 })
    const back = new THREE.Mesh(backGeo, backMat)
    back.position.set(0, 0.78, -0.23)
    back.castShadow = true
    g.add(back)
    this.seatBacks.push(backMat)

    for (const [x, z] of [
      [-0.21, -0.2],
      [0.21, -0.2],
      [-0.21, 0.2],
      [0.21, 0.2],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.47, 0.05), wood)
      leg.position.set(x, 0.235, z)
      g.add(leg)
    }

    if (isHuman) {
      const antler = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a6b45, metalness: 0.3, roughness: 0.6 }))
      antler.position.set(0, 1.12, -0.23)
      g.add(antler)
    }
    return g
  }

  private buildFireplace() {
    const back = CABIN.cz - CABIN.d / 2 + 0.12
    const stone = new THREE.MeshStandardMaterial({ map: TEX.stoneTexture([2, 1]), color: 0x7d7a72, roughness: 0.95 })
    const surround = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.7, 0.5), stone)
    surround.position.set(0, 0.85, back)
    this.scene.add(surround)

    const cavity = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 0.4), new THREE.MeshStandardMaterial({ color: 0x0a0705, roughness: 1 }))
    cavity.position.set(0, 0.62, back + 0.12)
    this.scene.add(cavity)

    const ember = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.85), new THREE.MeshBasicMaterial({ color: 0xff7a34, transparent: true, opacity: 0.55 }))
    ember.position.set(0, 0.55, back + 0.3)
    this.scene.add(ember)

    for (let i = 0; i < 4; i++) {
      const f = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: TEX.flameTexture(), color: 0xffa45c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }),
      )
      f.position.set(-0.45 + i * 0.3, 0.6 + Math.random() * 0.15, back + 0.32)
      f.scale.set(0.42, 0.62, 1)
      this.scene.add(f)
      this.fireFlames.push(f)
    }

    this.fireLight = new THREE.PointLight(0xff8a44, 0, 7, 2)
    this.fireLight.position.set(0, 0.72, back + 0.85)
    this.scene.add(this.fireLight)
  }

  private buildSnow() {
    const n = 2600
    const pos = new Float32Array(n * 3)
    const vel = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let x = 0
      let z = 0
      do {
        x = (Math.random() - 0.5) * 62
        z = (Math.random() - 0.5) * 62
      } while (Math.abs(x) < 6.6 && z > -9.4 && z < 1.2)
      pos[i * 3] = x
      pos[i * 3 + 1] = Math.random() * 24
      pos[i * 3 + 2] = z
      vel[i] = 0.5 + Math.random() * 1.1
    }
    this.snowVel = vel
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.snow = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xe6eef0, size: 0.075, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }),
    )
    this.scene.add(this.snow)
  }

  private buildDust() {
    const n = 260
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8
      pos[i * 3 + 1] = 0.35 + Math.random() * 2.1
      pos[i * 3 + 2] = -8.2 + Math.random() * 5.6
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffd9a8, size: 0.013, transparent: true, opacity: 0.4, depthWrite: false }),
    )
    this.scene.add(this.dust)
  }

  private buildStars() {
    const n = 380
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const y = 0.15 + Math.random() * 0.85
      const r = 100
      const h = Math.sqrt(1 - y * y)
      pos[i * 3] = Math.cos(a) * h * r
      pos[i * 3 + 1] = y * r
      pos[i * 3 + 2] = Math.sin(a) * h * r
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe0e8, size: 0.5, transparent: true, opacity: 0.55, depthWrite: false, fog: false }))
    this.scene.add(this.stars)
  }

  private buildCameraPath() {
    this.gatePosCurve = new THREE.CatmullRomCurve3([
      GATE_CAM.clone(),
      new THREE.Vector3(0, 1.95, 5.6),
      new THREE.Vector3(0, 1.85, 2.4),
      new THREE.Vector3(0, 1.66, 0.9),
      LOBBY_CAM.clone(),
    ])
    this.gateTgtCurve = new THREE.CatmullRomCurve3([
      GATE_TGT.clone(),
      new THREE.Vector3(0, 2.1, -4),
      new THREE.Vector3(0, 1.35, -4.1),
      new THREE.Vector3(0, 0.98, -4.2),
      LOBBY_TGT.clone(),
    ])
  }

  private buildPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.6, 0.86)
    this.composer.addPass(bloom)
    const grain = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          vec2 p = vUv - 0.5;
          float vig = smoothstep(0.92, 0.28, length(p * vec2(1.08, 1.0)));
          c.rgb *= mix(0.52, 1.0, vig);
          float g = hash(vUv * uRes + uTime) - 0.5;
          c.rgb += g * 0.03;
          c.rgb = mix(c.rgb, c.rgb * vec3(1.02, 1.0, 0.96), 0.5);
          gl_FragColor = c;
        }`,
    })
    this.composer.addPass(grain)
    this.grainPass = grain
  }

  private grainPass!: ShaderPass

  /* ---------------- 交互 ---------------- */

  private onPointerDown = (e: PointerEvent) => {
    if (this.view !== 'lobby') return
    this.orbit.dragging = true
    this.orbit.lastX = e.clientX
    this.orbit.lastY = e.clientY
  }

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)

    if (this.orbit.dragging) {
      const dx = (e.clientX - this.orbit.lastX) / rect.width
      const dy = (e.clientY - this.orbit.lastY) / rect.height
      this.orbit.yaw = THREE.MathUtils.clamp(this.orbit.yaw - dx * 1.1, -0.5, 0.5)
      this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch - dy * 0.5, -0.16, 0.16)
      this.orbit.lastX = e.clientX
      this.orbit.lastY = e.clientY
      return
    }
    if (this.view === 'lobby') this.updateHover()
  }

  private onPointerUp = () => {
    this.orbit.dragging = false
  }

  private updateHover() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.seatMeshes, true)
    let id: number | null = null
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object
      while (o && !o.userData.seatId) o = o.parent
      id = o?.userData.seatId ?? null
    }
    if (id !== this.hovered) {
      this.hovered = id
      const p = new THREE.Vector3()
      if (id != null) {
        const seat = this.seatMeshes[id - 1]
        seat.getWorldPosition(p)
        p.y += 1.25
        const v = p.clone().project(this.camera)
        this.hooks.onSeatHover?.(id, ((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight)
      } else {
        this.hooks.onSeatHover?.(null, 0, 0)
      }
    }
  }

  setSelected(id: number | null) {
    this.selected = id
  }

  /* ---------------- 状态 ---------------- */

  enter() {
    if (this.entering || this.view === 'lobby') return
    this.entering = true
    this.enterT = 0
  }

  setView(view: ViewMode, instant = false) {
    this.view = view
    this.entering = false
    this.enterT = instant ? 1 : 0
    if (view === 'lobby') {
      this.chandelier.intensity = instant ? 95 : 0
      this.chandelierFill.intensity = instant ? 0.5 : 0
      this.fireLight.intensity = instant ? 20 : 0
      this.windowGlows.forEach((l) => (l.intensity = instant ? 4 : 17))
      this.candleOn = instant ? 9 : 0
      this.candleFlames.forEach((f) => (f.visible = instant))
      this.doorPivot.rotation.y = instant ? -1.95 : 0
      if (instant) {
        this.fog.density = 0.012
        this.camera.position.copy(LOBBY_CAM)
        this.camera.lookAt(LOBBY_TGT)
        this.camera.fov = 56
        this.camera.updateProjectionMatrix()
        this.orbit.yaw = 0
        this.orbit.pitch = 0
      }
    } else {
      this.chandelier.intensity = 0
      this.chandelierFill.intensity = 0
      this.fireLight.intensity = 0
      this.candleOn = 0
      this.candleFlames.forEach((f) => (f.visible = false))
      this.doorPivot.rotation.y = 0
      this.fog.density = 0.03
      if (instant) {
        this.camera.position.copy(GATE_CAM)
        this.camera.lookAt(GATE_TGT)
        this.camera.fov = this.baseFov
        this.camera.updateProjectionMatrix()
      }
    }
  }

  /* ---------------- 循环 ---------------- */

  private resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    // 竖屏时放大 fov，保证桌面完整
    this.camera.fov = h > w ? 62 : this.baseFov
    this.camera.updateProjectionMatrix()
    this.grainPass.uniforms.uRes.value.set(w, h)
  }

  private updateCamera(dt: number) {
    let pos: THREE.Vector3
    let tgt: THREE.Vector3

    if (this.entering) {
      this.enterT = Math.min(1, this.enterT + dt / this.enterDur)
      const e = easeInOut(this.enterT)
      pos = this.gatePosCurve.getPointAt(e)
      tgt = this.gateTgtCurve.getPointAt(e)

      this.doorPivot.rotation.y = -1.95 * Math.min(1, this.enterT / 0.32)

      // 雾由外向内变薄
      const k = THREE.MathUtils.smoothstep(this.enterT, 0.12, 0.55)
      this.fog.density = THREE.MathUtils.lerp(0.03, 0.012, k)

      // 灯光依次点亮
      const lightK = THREE.MathUtils.smoothstep(this.enterT, 0.42, 0.95)
      this.chandelier.intensity = 95 * lightK
      this.chandelierFill.intensity = 0.5 * lightK
      this.fireLight.intensity = 20 * THREE.MathUtils.smoothstep(this.enterT, 0.55, 1)
      this.windowGlows.forEach((l) => (l.intensity = THREE.MathUtils.lerp(17, 6, lightK)))

      const wantOn = Math.floor(THREE.MathUtils.clamp((this.enterT - 0.55) / 0.4, 0, 1) * 9)
      while (this.candleOn < wantOn) {
        this.candleFlames[this.candleOn].visible = true
        this.candleOn++
      }

      if (this.enterT >= 1) {
        this.entering = false
        this.view = 'lobby'
      }
      this.hooks.onProgress?.(this.enterT)
    } else if (this.view === 'gate') {
      const breath = Math.sin(this.t * 0.16) * 0.22
      pos = GATE_CAM.clone()
      pos.z += breath
      tgt = GATE_TGT.clone()
    } else {
      pos = LOBBY_CAM.clone()
      tgt = LOBBY_TGT.clone()
    }

    // 环视偏移：绕目标点小角度旋转，不做球坐标夹取
    const offset = pos.clone().sub(tgt)
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbit.yaw)
    offset.y += this.orbit.pitch * offset.length() * 0.6
    pos = tgt.clone().add(offset)

    if (!this.orbit.dragging) {
      this.orbit.yaw *= 1 - Math.min(1, dt * 1.6)
      this.orbit.pitch *= 1 - Math.min(1, dt * 1.6)
    }

    const k = 1 - Math.exp(-dt * 7)
    this.camera.position.lerp(pos, k)
    this.camera.lookAt(tgt)

    // 门厅 45° / 室内 56°，避免九席被裁切
    const wantFov = this.view === 'lobby' ? 56 : this.baseFov
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 4)
      this.camera.updateProjectionMatrix()
    }
  }

  private loop = () => {
    if (!this.running) return
    requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.clock.last) / 1000)
    this.clock.last = now
    this.t += dt

    this.updateCamera(dt)

    // 雪
    const p = this.snow.geometry.attributes.position as THREE.BufferAttribute
    const arr = p.array as Float32Array
    for (let i = 0; i < this.snowVel.length; i++) {
      arr[i * 3 + 1] -= this.snowVel[i] * dt
      arr[i * 3] += Math.sin(this.t * 0.7 + i) * 0.004
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 22 + Math.random() * 3
        arr[i * 3] = (Math.random() - 0.5) * 62
        arr[i * 3 + 2] = (Math.random() - 0.5) * 62
      }
    }
    p.needsUpdate = true

    // 烛火/炉火
    const flick = 0.9 + Math.sin(this.t * 13.2) * 0.06 + Math.sin(this.t * 27.7) * 0.04
    this.candleLights.forEach((l, i) => {
      if (i < this.candleOn) {
        l.intensity = 6 * flick * (0.9 + Math.sin(i * 2.1 + this.t * 6) * 0.1)
        this.candleFlames[i].scale.set(0.085 * flick, 0.135 * flick, 1)
      }
    })
    this.fireLight.intensity = this.fireLight.intensity > 0 ? 20 * (0.85 + Math.sin(this.t * 9.1) * 0.1 + Math.sin(this.t * 3.3) * 0.05) : 0
    this.fireFlames.forEach((f, i) => {
      f.scale.set(0.42 * (0.9 + Math.sin(this.t * 7 + i) * 0.12), 0.62 * (0.92 + Math.sin(this.t * 5.2 + i) * 0.1), 1)
    })
    if (this.view === 'gate') this.porchLight.intensity = 22 * (0.95 + Math.sin(this.t * 2.1) * 0.05)

    // 尘埃
    const d = this.dust.geometry.attributes.position as THREE.BufferAttribute
    const da = d.array as Float32Array
    for (let i = 0; i < da.length / 3; i++) {
      da[i * 3 + 1] += Math.sin(this.t * 0.4 + i) * 0.0006
      da[i * 3] += Math.cos(this.t * 0.3 + i * 0.7) * 0.0004
    }
    d.needsUpdate = true

    // 光环
    this.seatRings.forEach((ring, i) => {
      const mat = ring.material as THREE.MeshBasicMaterial
      const isSel = this.selected === i + 1
      const isHover = this.hovered === i + 1
      const target = isSel ? 0.95 : isHover ? 0.5 : 0
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 9)
      ring.scale.setScalar(isSel ? 1.08 : 1)
    })
    this.seatBacks.forEach((mat, i) => {
      const isHover = this.hovered === i + 1
      const isSel = this.selected === i + 1
      mat.emissive.setHex(isSel ? 0x6b4a22 : isHover ? 0x3d2a14 : 0x000000)
    })

    this.grainPass.uniforms.uTime.value = this.t
    this.composer.render()
  }

  dispose() {
    this.running = false
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.renderer.dispose()
  }
}
