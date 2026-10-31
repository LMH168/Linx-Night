/**
 * 暮林山舍 · 对局舞台（进程内 three.js 场景）
 *
 * 设计约束（见 docs/perf/issue-135-decision.md）：
 * - 单 canvas，无 iframe、无跨文档通信
 * - 0 个实时点光源、0 张阴影贴图：光照全部烘焙进纹理与自发光材质
 * - 9 把椅子 / 9 盏灯用 InstancedMesh，整场 draw call 控制在 20 以内
 * - 按需渲染：只在状态变化或 resize 时渲染，静止时一帧都不画
 * - 不加载任何外部贴图：全部用 canvas 现画，首帧无网络等待
 */
import * as THREE from 'three';

export type StageMode = 'lobby' | 'table' | 'result';

export interface StageOptions {
  mode: StageMode;
  night: boolean;
  deadSeats: readonly string[];
  selectedSeat: string | null;
  selfSeat: string | null;
  shieldSeat: string | null;
}

export interface StageStats {
  calls: number;
  triangles: number;
  points: number;
  lights: number;
  dpr: number;
  renders: number;
}

export type StageQuality = 'high' | 'low';

export interface StageBenchmark {
  fps: number;
  frames: number;
  ms: number;
  calls: number;
  triangles: number;
}

export interface Stage {
  setOptions(options: Partial<StageOptions>): void;
  render(): void;
  resize(): void;
  stats(): StageStats;
  /** 连续渲染 durationMs 毫秒，返回这段时间的真实帧率与 draw call。 */
  benchmark(durationMs?: number): Promise<StageBenchmark>;
  /** low：DPR 降到 1 并关掉光柱，用于低端设备兜底。 */
  setQuality(quality: StageQuality): void;
  dispose(): void;
}

const SEAT_COUNT = 9;
const SEAT_RX = 4.35;
const SEAT_RZ = 2.55;
const TABLE_TOP = 0.74;

const PALETTE = {
  ground: '#0d1512',
  fog: '#08110d',
  tableWood: '#3a2519',
  tableEdge: '#2a1a11',
  chairWood: '#241713',
  plaque: '#d8b57c',
  plaqueDead: '#4a4640',
  lantern: '#ffb066',
  lanternDead: '#1d2733',
  lanternNight: '#ffd9a3',
  glow: '#ff9a4d',
  shield: '#7fd6ff',
  day: { hemi: 0.95, dir: 0.75, bg: '#16241d' },
  night: { hemi: 0.3, dir: 0.22, bg: '#050a10' },
} as const;

/** 用 2D canvas 现画一张木纹，避免任何网络贴图。 */
function woodTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = PALETTE.tableWood;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i += 1) {
      const y = Math.random() * size;
      const h = 1 + Math.random() * 3;
      const alpha = 0.05 + Math.random() * 0.12;
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 20 : 72}, ${Math.random() > 0.5 ? 12 : 46}, 8, ${alpha})`;
      ctx.fillRect(0, y, size, h);
    }
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size * 0.72);
    gradient.addColorStop(0, 'rgba(255, 196, 120, 0.22)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

/** 地面：一圈烘焙好的暖光衰减，替代实时阴影。 */
function groundTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, size, size);
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 176, 102, 0.30)');
    gradient.addColorStop(0.55, 'rgba(120, 78, 44, 0.14)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 灯晕贴图：一个软边圆点，供 Points 使用。 */
function glowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 214, 170, 0.95)');
    gradient.addColorStop(0.35, 'rgba(255, 160, 90, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/** 大厅背景：远景渐变 + 树影剪影，一次性烘焙，1 个 draw call。 */
function backdropTexture(): THREE.Texture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#060d12');
    sky.addColorStop(0.55, '#0b1712');
    sky.addColorStop(0.82, '#132018');
    sky.addColorStop(1, '#1b2a1f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // 远山轮廓
    ctx.fillStyle = 'rgba(9, 20, 18, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.78);
    for (let x = 0; x <= width; x += 16) {
      const wave = Math.sin(x / 58) * 14 + Math.sin(x / 23) * 7;
      ctx.lineTo(x, height * 0.78 + wave);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // 树干剪影
    for (let i = 0; i < 26; i += 1) {
      const x = (i / 26) * width + Math.sin(i * 3.7) * 10;
      const treeHeight = 60 + ((i * 37) % 90);
      const stumpWidth = 3 + ((i * 13) % 5);
      ctx.fillStyle = `rgba(4, 10, 9, ${0.55 + ((i * 7) % 30) / 100})`;
      ctx.fillRect(x, height - treeHeight, stumpWidth, treeHeight);
      ctx.beginPath();
      ctx.moveTo(x + stumpWidth / 2, height - treeHeight - 26);
      ctx.lineTo(x - 14, height - treeHeight + 16);
      ctx.lineTo(x + stumpWidth + 14, height - treeHeight + 16);
      ctx.closePath();
      ctx.fill();
    }

    // 底部暖雾
    const haze = ctx.createLinearGradient(0, height * 0.62, 0, height);
    haze.addColorStop(0, 'rgba(120, 82, 44, 0)');
    haze.addColorStop(1, 'rgba(150, 100, 52, 0.35)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, height * 0.62, width, height * 0.38);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function seatPosition(index: number, radiusScale = 1): THREE.Vector3 {
  const angle = (index / SEAT_COUNT) * Math.PI * 2 - Math.PI / 2;
  return new THREE.Vector3(
    Math.sin(angle) * SEAT_RX * radiusScale,
    TABLE_TOP,
    Math.cos(angle) * SEAT_RZ * radiusScale,
  );
}

export function createStage(canvas: HTMLCanvasElement, initial: StageOptions): Stage {
  let options: StageOptions = { ...initial };
  let disposed = false;
  let renders = 0;
  let frameHandle = 0;
  let resizeTimer = 0;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 9, 22);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  camera.position.set(0, 4.75, 8.3);
  camera.lookAt(0, 1.0, 0.2);

  const hemi = new THREE.HemisphereLight(0xffd6a8, 0x1a2b22, PALETTE.day.hemi);
  const dir = new THREE.DirectionalLight(0xfff0d0, PALETTE.day.dir);
  dir.position.set(-3.2, 6.4, 2.6);
  scene.add(hemi, dir);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // ---------- 地面 ----------
  const groundMap = track(groundTexture());
  const groundGeo = track(new THREE.CircleGeometry(11, 48));
  const groundMat = track(new THREE.MeshBasicMaterial({ map: groundMap, color: 0xffffff }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // ---------- 大厅背景（1 个 draw call，把「悬空的桌子」补成「屋里的桌子」）----------
  const hallMap = track(backdropTexture());
  const hallMat = track(
    new THREE.MeshBasicMaterial({ map: hallMap, side: THREE.BackSide, fog: true, depthWrite: false }),
  );
  const hallGeo = track(new THREE.CylinderGeometry(13, 15, 15, 24, 1, true));
  const hall = new THREE.Mesh(hallGeo, hallMat);
  hall.position.y = 5.2;
  scene.add(hall);

  // ---------- 长桌（7 个 box，同一材质）----------
  const woodMap = track(woodTexture());
  const tableMat = track(
    new THREE.MeshStandardMaterial({ map: woodMap, color: 0xffffff, roughness: 0.82, metalness: 0.04 }),
  );
  const tableGroup = new THREE.Group();
  const topGeo = track(new THREE.BoxGeometry(7.3, 0.16, 2.5));
  const top = new THREE.Mesh(topGeo, tableMat);
  top.position.y = TABLE_TOP;
  tableGroup.add(top);
  const legGeo = track(new THREE.BoxGeometry(0.2, TABLE_TOP, 0.2));
  const legPositions: Array<[number, number]> = [
    [-3.35, -1.0],
    [3.35, -1.0],
    [-3.35, 1.0],
    [3.35, 1.0],
  ];
  for (const [x, z] of legPositions) {
    const leg = new THREE.Mesh(legGeo, tableMat);
    leg.position.set(x, TABLE_TOP / 2, z);
    tableGroup.add(leg);
  }
  const runnerGeo = track(new THREE.BoxGeometry(7.0, 0.02, 0.9));
  const runner = new THREE.Mesh(runnerGeo, track(new THREE.MeshStandardMaterial({ color: 0x5d1f1f, roughness: 0.9 })));
  runner.position.y = TABLE_TOP + 0.09;
  tableGroup.add(runner);
  scene.add(tableGroup);

  // ---------- 椅子（InstancedMesh ×9）----------
  const chairMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.chairWood), roughness: 0.9 }));
  const seatGeo = track(new THREE.BoxGeometry(0.62, 0.08, 0.58));
  const backGeo = track(new THREE.BoxGeometry(0.62, 0.72, 0.09));
  const chairs = new THREE.InstancedMesh(seatGeo, chairMat, SEAT_COUNT);
  const backs = new THREE.InstancedMesh(backGeo, chairMat, SEAT_COUNT);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < SEAT_COUNT; i += 1) {
    const pos = seatPosition(i, 1.06);
    const angle = (i / SEAT_COUNT) * Math.PI * 2 - Math.PI / 2;
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle + Math.PI);
    matrix.compose(new THREE.Vector3(pos.x, TABLE_TOP - 0.34, pos.z), quat, scale);
    chairs.setMatrixAt(i, matrix);
    const backPos = new THREE.Vector3(pos.x, TABLE_TOP - 0.02, pos.z);
    backPos.x += Math.sin(angle) * 0.26;
    backPos.z += Math.cos(angle) * 0.26;
    matrix.compose(backPos, quat, scale);
    backs.setMatrixAt(i, matrix);
  }
  chairs.instanceMatrix.needsUpdate = true;
  backs.instanceMatrix.needsUpdate = true;
  scene.add(chairs, backs);

  // ---------- 席位铭牌（InstancedMesh ×9，逐实例着色）----------
  const plaqueGeo = track(new THREE.BoxGeometry(0.42, 0.015, 0.28));
  const plaqueMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.1 }));
  const plaques = new THREE.InstancedMesh(plaqueGeo, plaqueMat, SEAT_COUNT);
  for (let i = 0; i < SEAT_COUNT; i += 1) {
    const pos = seatPosition(i, 0.86);
    matrix.compose(new THREE.Vector3(pos.x, TABLE_TOP + 0.1, pos.z), new THREE.Quaternion(), scale);
    plaques.setMatrixAt(i, matrix);
    plaques.setColorAt(i, new THREE.Color(PALETTE.plaque));
  }
  plaques.instanceMatrix.needsUpdate = true;
  if (plaques.instanceColor) plaques.instanceColor.needsUpdate = true;
  scene.add(plaques);

  // ---------- 灯火（InstancedMesh ×9 + Points 光晕）----------
  const lanternGeo = track(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 10));
  const lanternMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const lanterns = new THREE.InstancedMesh(lanternGeo, lanternMat, SEAT_COUNT);
  const glowPositions = new Float32Array(SEAT_COUNT * 3);
  for (let i = 0; i < SEAT_COUNT; i += 1) {
    const pos = seatPosition(i, 0.93);
    const y = TABLE_TOP + 0.24;
    matrix.compose(new THREE.Vector3(pos.x, y, pos.z), new THREE.Quaternion(), scale);
    lanterns.setMatrixAt(i, matrix);
    lanterns.setColorAt(i, new THREE.Color(PALETTE.lantern));
    glowPositions[i * 3] = pos.x;
    glowPositions[i * 3 + 1] = y;
    glowPositions[i * 3 + 2] = pos.z;
  }
  lanterns.instanceMatrix.needsUpdate = true;
  if (lanterns.instanceColor) lanterns.instanceColor.needsUpdate = true;
  scene.add(lanterns);

  const glowGeo = track(new THREE.BufferGeometry());
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
  const glowMap = track(glowTexture());
  const glowMat = track(
    new THREE.PointsMaterial({
      map: glowMap,
      size: 1.15,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(PALETTE.glow),
      opacity: 0.55,
      toneMapped: false,
    }),
  );
  const glow = new THREE.Points(glowGeo, glowMat);
  scene.add(glow);

  // ---------- 桌面中心：烛台 + 火光 ----------
  const bowlMat = track(new THREE.MeshStandardMaterial({ color: 0x6b4b2c, roughness: 0.6, metalness: 0.25 }));
  const bowlGeo = track(new THREE.CylinderGeometry(0.46, 0.34, 0.2, 18));
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  bowl.position.set(0, TABLE_TOP + 0.1, 0);
  scene.add(bowl);

  const flameMat = track(
    new THREE.SpriteMaterial({
      map: glowMap,
      color: new THREE.Color(PALETTE.glow),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
    }),
  );
  const flame = new THREE.Sprite(flameMat);
  flame.position.set(0, TABLE_TOP + 0.34, 0);
  flame.scale.setScalar(1.5);
  scene.add(flame);

  // ---------- 顶部光柱（加法混合的锥体，不是体积光，但足够暗示）----------
  const shaftMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xffcf9a,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  const shaftGeo = track(new THREE.ConeGeometry(1.9, 8.4, 20, 1, true));
  const shafts: THREE.Mesh[] = [];
  for (const [x, z] of [[-2.2, -0.6], [2.2, 0.6]] as Array<[number, number]>) {
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(x, 5.0, z);
    shaft.rotation.z = x > 0 ? -0.05 : 0.05;
    shafts.push(shaft);
    scene.add(shaft);
  }

  // ---------- 选中环 / 护盾环（各自 1 个，移动而非重建）----------
  const ringGeo = track(new THREE.RingGeometry(0.3, 0.4, 32));
  const selectMat = track(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.plaque), transparent: true, opacity: 0.55, side: THREE.DoubleSide, toneMapped: false }),
  );
  const selectRing = new THREE.Mesh(ringGeo, selectMat);
  selectRing.rotation.x = -Math.PI / 2;
  selectRing.visible = false;
  scene.add(selectRing);

  const shieldMat = track(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.shield), transparent: true, opacity: 0.7, side: THREE.DoubleSide, toneMapped: false }),
  );
  const shieldRing = new THREE.Mesh(ringGeo, shieldMat);
  shieldRing.rotation.x = -Math.PI / 2;
  shieldRing.scale.setScalar(1.25);
  shieldRing.visible = false;
  scene.add(shieldRing);

  const maxDpr = window.innerWidth < 820 ? 1.5 : 2;

  function applyOptions(): void {
    const { day, night } = { day: PALETTE.day, night: PALETTE.night };
    const tonic = options.night ? night : day;
    hemi.intensity = tonic.hemi;
    dir.intensity = tonic.dir;
    dir.color.set(options.night ? 0x9dc4ff : 0xfff0d0);
    hemi.color.set(options.night ? 0x8fb4ff : 0xffd6a8);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(tonic.bg);
    }
    renderer.setClearColor(new THREE.Color(tonic.bg), 1);

    const dead = new Set(options.deadSeats);
    const lanternColor = new THREE.Color(options.night ? PALETTE.lanternNight : PALETTE.lantern);
    for (let i = 0; i < SEAT_COUNT; i += 1) {
      const id = `seat-${i + 1}`;
      const isDead = dead.has(id) || dead.has(String(i + 1)) || dead.has(`${i + 1}`);
      lanterns.setColorAt(i, isDead ? new THREE.Color(PALETTE.lanternDead) : lanternColor);
      plaques.setColorAt(i, new THREE.Color(isDead ? PALETTE.plaqueDead : PALETTE.plaque));
    }
    if (lanterns.instanceColor) lanterns.instanceColor.needsUpdate = true;
    if (plaques.instanceColor) plaques.instanceColor.needsUpdate = true;
    glowMat.opacity = options.night ? 0.7 : 0.5;
    shaftMat.opacity = options.night ? 0.07 : 0.035;
    flameMat.opacity = options.night ? 1 : 0.65;
    hallMat.color.set(options.night ? 0x8fa6c4 : 0xffffff);

    const cameraScale = options.mode === 'table' ? 1 : 1.12;
    camera.position.set(0, 4.75 * cameraScale, 8.3 * cameraScale);
    camera.lookAt(0, 1.0, 0.2);

    const seatIndex = (id: string | null): number => {
      if (!id) return -1;
      const match = /(\d+)/.exec(id);
      if (!match) return -1;
      const n = Number(match[1]) - 1;
      return n >= 0 && n < SEAT_COUNT ? n : -1;
    };

    const selected = seatIndex(options.selectedSeat);
    if (selected >= 0) {
      const pos = seatPosition(selected, 0.7);
      selectRing.position.set(pos.x, TABLE_TOP + 0.11, pos.z);
      selectRing.visible = true;
    } else {
      selectRing.visible = false;
    }

    const shielded = seatIndex(options.shieldSeat);
    if (shielded >= 0) {
      const pos = seatPosition(shielded, 0.7);
      shieldRing.position.set(pos.x, TABLE_TOP + 0.12, pos.z);
      shieldRing.visible = true;
    } else {
      shieldRing.visible = false;
    }
  }

  function draw(): void {
    if (disposed) return;
    renderer.render(scene, camera);
    renders += 1;
  }

  /** 只在需要时申请一帧：静止时完全不进 rAF 回调。 */
  function requestRender(): void {
    if (disposed || frameHandle) return;
    frameHandle = window.requestAnimationFrame(() => {
      frameHandle = 0;
      draw();
    });
  }

  function applySize(): void {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function handleResize(): void {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      applySize();
      draw();
    }, 120);
  }

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    canvas.classList.add('is-lost');
  };
  const onContextRestored = (): void => {
    canvas.classList.remove('is-lost');
    applySize();
    draw();
  };

  canvas.addEventListener('webglcontextlost', onContextLost as EventListener);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);

  applySize();
  applyOptions();
  draw();

  return {
    setOptions(next: Partial<StageOptions>): void {
      const merged: StageOptions = { ...options, ...next };
      const changed =
        merged.mode !== options.mode ||
        merged.night !== options.night ||
        merged.selectedSeat !== options.selectedSeat ||
        merged.shieldSeat !== options.shieldSeat ||
        merged.deadSeats.join(',') !== options.deadSeats.join(',');
      options = merged;
      if (!changed) return;
      applyOptions();
      requestRender();
    },
    render(): void {
      requestRender();
    },
    resize(): void {
      applySize();
      draw();
    },
    stats(): StageStats {
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lights: scene.children.filter((child) => (child as THREE.Light).isLight === true).length,
        dpr: renderer.getPixelRatio(),
        renders,
      };
    },
    benchmark(durationMs = 3000): Promise<StageBenchmark> {
      return new Promise<StageBenchmark>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const step = (): void => {
          if (disposed) {
            resolve({ fps: 0, frames, ms: performance.now() - start, calls: 0, triangles: 0 });
            return;
          }
          draw();
          frames += 1;
          const elapsed = performance.now() - start;
          if (elapsed >= durationMs) {
            resolve({
              fps: (frames / elapsed) * 1000,
              frames,
              ms: elapsed,
              calls: renderer.info.render.calls,
              triangles: renderer.info.render.triangles,
            });
            return;
          }
          window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
      });
    },
    setQuality(quality: StageQuality): void {
      if (quality === 'low') {
        renderer.setPixelRatio(1);
        for (const shaft of shafts) shaft.visible = false;
        glowMat.opacity = Math.min(glowMat.opacity, 0.4);
      } else {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
        for (const shaft of shafts) shaft.visible = true;
      }
      applySize();
      draw();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(frameHandle);
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      for (const item of disposables) item.dispose();
      scene.clear();
      renderer.dispose();
    },
  };
}
