/**
 * Dresses the public forest-cabin animation with the approved launch-table set.
 * The launch scene is deliberately kept lightweight so it remains responsive
 * while the real game client is loading behind it.
 */
export interface CabinRuntime {
  THREE: any;
  scene: any;
  camera: any;
  renderer: any;
  composer?: any;
  controls?: any;
  people?: { group?: { visible: boolean } };
  fog?: any;
  finishIntro?: (instant?: boolean) => void;
  setTime?: (time: number) => void;
}

export interface CabinWindow extends Window {
  __forestCabin?: CabinRuntime;
  __forestRoster?: { open?: () => void; close?: () => void };
}

export type SceneMode = 'day' | 'night';
export type SceneStage = 'launch' | 'lobby' | 'table' | 'result';

export interface SceneOptions {
  mode?: SceneMode;
  stage?: SceneStage;
  deadSeats?: string[];
}

interface StoredLight {
  light: any;
  intensity: number;
  color: number;
}

interface TableState {
  options: SceneOptions;
  baseLights: StoredLight[];
  baseFogColor: number;
  baseFogDensity: number;
  baseBackground: number | null;
  lanterns: any[];
  seatGroups: any[];
  warm: any;
  cool: any;
  front: any;
  moon: any;
}

export function dressLaunchScene(win: CabinWindow) {
  dressGameScene(win, { mode: 'night', stage: 'launch', deadSeats: ['P4', 'P9'] });
  optimizeCabinRuntime(win);
}

/** Apply one predictable low-cost profile to every device. */
export function optimizeCabinRuntime(win: CabinWindow) {
  const runtime = win.__forestCabin;
  if (!runtime?.renderer) return;
  const renderer = runtime.renderer;
  const pixelRatio = Math.min(win.devicePixelRatio || 1, 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = false;
  if (runtime.composer) {
    // Rendering the scene directly avoids the bloom/noise post-processing
    // chain, which was the largest recurring cost on integrated GPUs.
    runtime.composer.render = () => renderer.render(runtime.scene, runtime.camera);
    runtime.composer.setPixelRatio?.(pixelRatio);
  }
  win.postMessage({ type: 'linx-cabin-optimized' }, '*');
}

export function dressGameScene(win: CabinWindow, options: SceneOptions = {}) {
  if (!win.__forestCabin?.scene) return;
  const state = (win as any).__linxTable as TableState | undefined;
  if (state) {
    applyGameScene(win, options);
    return;
  }
  dressTable(win, options);
}

function dressTable(win: CabinWindow, initial: SceneOptions) {
  const f = win.__forestCabin;
  if (!f?.scene || !f.THREE) return;
  if (f.scene.getObjectByName('proto-long-table')) return;

  const T = f.THREE;
  const doc = win.document;
  const scene = f.scene;
  const mobile = win.innerWidth <= 760;

  const baseLights: StoredLight[] = [];
  scene.traverse((o: any) => {
    if (o.isLight) baseLights.push({ light: o, intensity: o.intensity, color: o.color?.getHex?.() ?? 0xffffff });
  });
  const state: TableState = {
    options: { ...initial },
    baseLights,
    baseFogColor: scene.fog?.color?.getHex?.() ?? 0x0a1a12,
    baseFogDensity: scene.fog?.density ?? 0.018,
    baseBackground: scene.background?.isColor ? scene.background.getHex() : null,
    lanterns: [],
    seatGroups: [],
    warm: null,
    cool: null,
    front: null,
    moon: null,
  };
  (win as any).__linxTable = state;

  f.finishIntro?.(true);
  f.setTime?.(27.3);
  f.people?.group && (f.people.group.visible = false);

  // ---- long table, nine chairs, seated travellers --------------------------
  const group = new T.Group();
  group.name = 'proto-long-table';
  group.position.set(0, 0, 7.6);
  scene.add(group);

  const makeTexture = (w: number, h: number, draw: (ctx: any, w: number, h: number) => void) => {
    const canvas = doc.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    draw(ctx, w, h);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  };

  const woodTex = makeTexture(1024, 1024, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.48, h * 0.42, 12, w * 0.5, h * 0.5, w * 0.73);
    g.addColorStop(0, '#59402a');
    g.addColorStop(0.42, '#44301f');
    g.addColorStop(0.78, '#2f2116');
    g.addColorStop(1, '#21160f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 54; i++) {
      const r = 24 + i * 9.1 + Math.sin(i * 2.7) * 4;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.04) {
        const rr = r + Math.sin(a * (3 + (i % 4)) + i) * (1.4 + (i % 3));
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr * 0.96;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(16,9,5,${0.06 + (i % 5) * 0.025})`;
      ctx.lineWidth = 0.8 + (i % 3) * 0.5;
      ctx.stroke();
    }
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = 60 + Math.random() * 390;
      const r1 = r0 + 20 + Math.random() * 100;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a + 0.02) * r1, Math.sin(a + 0.02) * r1);
      ctx.strokeStyle = `rgba(12,7,4,${0.05 + Math.random() * 0.08})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(205,163,102,.12)';
    ctx.lineWidth = 2;
    for (const r of [330, 390, 452]) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * 462, h / 2 + Math.sin(a) * 462);
      ctx.lineTo(w / 2 + Math.cos(a) * 492, h / 2 + Math.sin(a) * 492);
      ctx.strokeStyle = 'rgba(205,163,102,.16)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  });

  const dialTex = makeTexture(512, 512, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#4d3b24');
    g.addColorStop(0.55, '#312516');
    g.addColorStop(1, '#17110b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,178,122,.62)';
    ctx.lineWidth = 2;
    for (const r of [232, 208, 158]) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2;
      const r0 = i % 9 === 0 ? 218 : 226;
      const r1 = 236;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
      ctx.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1);
      ctx.strokeStyle = i % 9 === 0 ? 'rgba(231,201,145,.8)' : 'rgba(212,178,122,.34)';
      ctx.lineWidth = i % 9 === 0 ? 1.8 : 0.8;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.beginPath();
    ctx.arc(0, 0, 72, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(231,201,145,.88)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(26, -8, 68, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2014';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(231,201,145,.55)';
    for (const [x, y, r] of [[355, 150, 1.5], [388, 178, 1], [325, 208, 1], [178, 340, 1.2], [402, 320, 0.9]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const woodMat = new T.MeshStandardMaterial({ map: woodTex, color: 0xffffff, roughness: 0.7, metalness: 0.04 });
  const darkWood = new T.MeshStandardMaterial({ color: 0x2a1d13, roughness: 0.9, metalness: 0.02 });
  const brass = new T.MeshStandardMaterial({ color: 0xb08a4e, roughness: 0.38, metalness: 0.72 });
  const iron = new T.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.72, metalness: 0.45 });

  const top = new T.Mesh(new T.CylinderGeometry(3.08, 3.06, 0.17, 64), woodMat);
  top.position.y = 0.99;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);
  const surface = new T.Mesh(new T.CircleGeometry(3.05, 64), woodMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 1.077;
  surface.receiveShadow = true;
  group.add(surface);
  const apron = new T.Mesh(new T.CylinderGeometry(2.9, 2.86, 0.24, 64), darkWood);
  apron.position.y = 0.87;
  apron.castShadow = true;
  group.add(apron);
  const pedestal = new T.Mesh(new T.CylinderGeometry(0.52, 0.86, 1, 24), darkWood);
  pedestal.position.y = 0.48;
  pedestal.castShadow = true;
  group.add(pedestal);
  const foot = new T.Mesh(new T.CylinderGeometry(1.34, 1.55, 0.12, 32), darkWood);
  foot.position.y = 0.065;
  group.add(foot);
  const rim = new T.Mesh(new T.TorusGeometry(3.07, 0.045, 10, 64), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.075;
  group.add(rim);

  const felt = new T.Mesh(new T.CircleGeometry(1.68, 64), new T.MeshStandardMaterial({ color: 0x1b2921, roughness: 0.96, metalness: 0.02 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 1.081;
  felt.receiveShadow = true;
  group.add(felt);
  const feltRim = new T.Mesh(new T.TorusGeometry(1.68, 0.012, 8, 64), new T.MeshStandardMaterial({ color: 0x8d6f42, roughness: 0.5, metalness: 0.45 }));
  feltRim.rotation.x = Math.PI / 2;
  feltRim.position.y = 1.084;
  group.add(feltRim);
  const dial = new T.Mesh(new T.CircleGeometry(0.86, 60), new T.MeshStandardMaterial({ map: dialTex, roughness: 0.55, metalness: 0.16 }));
  dial.rotation.x = -Math.PI / 2;
  dial.position.y = 1.085;
  group.add(dial);
  const dialRim = new T.Mesh(new T.TorusGeometry(0.88, 0.018, 8, 60), brass);
  dialRim.rotation.x = Math.PI / 2;
  dialRim.position.y = 1.09;
  group.add(dialRim);
  const candleMat = new T.MeshStandardMaterial({ color: 0xd7c39a, roughness: 0.82 });
  const flameMat = new T.MeshBasicMaterial({ color: 0xffc47c });
  for (const [cx, cz, h] of [[-0.24, 0.12, 0.42], [0.16, -0.19, 0.55], [0.31, 0.18, 0.34]]) {
    const candle = new T.Mesh(new T.CylinderGeometry(0.045, 0.055, h, 10), candleMat);
    candle.position.set(cx, 1.08 + h / 2, cz);
    group.add(candle);
    const flame = new T.Mesh(new T.SphereGeometry(0.035, 8, 8), flameMat);
    flame.position.set(cx, 1.09 + h + 0.035, cz);
    flame.scale.set(1, 1.7, 1);
    group.add(flame);
    const fl = new T.PointLight(0xffb56a, 1.4, 2.4, 2);
    fl.position.copy(flame.position);
    group.add(fl);
  }
  const bowl = new T.Mesh(new T.CylinderGeometry(0.38, 0.3, 0.12, 24), brass);
  bowl.position.set(0, 1.15, 0);
  group.add(bowl);
  const embers = new T.Mesh(new T.CircleGeometry(0.28, 24), new T.MeshBasicMaterial({ color: 0xff7b3a, transparent: true, opacity: 0.5 }));
  embers.rotation.x = -Math.PI / 2;
  embers.position.y = 1.218;
  group.add(embers);

  const seatGroups = state.seatGroups;
  const lanterns = state.lanterns;
  const chairRadius = 4.06;
  const cloakCols = [0x20251d, 0x28221a, 0x1c2020, 0x24251d, 0x201b1a, 0x23271f, 0x1b1d1a, 0x27231b, 0x1e2222];
  for (let i = 0; i < 9; i++) {
    const angle = i / 9 * Math.PI * 2;
    const x = Math.sin(angle) * chairRadius;
    const z = Math.cos(angle) * chairRadius;
    const chair = new T.Group();
    chair.position.set(x, 0, z);
    chair.rotation.y = angle + Math.PI;
    chair.userData.seatId = `P${i + 1}`;
    group.add(chair);
    seatGroups.push(chair);

    const seat = new T.Mesh(new T.BoxGeometry(0.7, 0.1, 0.68), woodMat);
    seat.position.y = 0.61;
    seat.castShadow = true;
    seat.receiveShadow = true;
    chair.add(seat);
    const back = new T.Mesh(new T.BoxGeometry(0.7, 1.02, 0.09), darkWood);
    back.position.set(0, 1.03, -0.31);
    back.rotation.x = -0.06;
    back.castShadow = true;
    chair.add(back);
    const crest = new T.Mesh(new T.BoxGeometry(0.76, 0.07, 0.12), darkWood);
    crest.position.set(0, 1.55, -0.33);
    crest.castShadow = true;
    chair.add(crest);
    const topRail = new T.Mesh(new T.BoxGeometry(0.5, 0.4, 0.06), darkWood);
    topRail.position.set(0, 1.31, -0.34);
    chair.add(topRail);
    for (const [lx, lz] of [[-0.27, -0.26], [0.27, -0.26], [-0.27, 0.25], [0.27, 0.25]]) {
      const leg = new T.Mesh(new T.CylinderGeometry(0.04, 0.045, 0.61, 7), darkWood);
      leg.position.set(lx, 0.305, lz);
      leg.castShadow = true;
      chair.add(leg);
    }
    for (const sx of [-1, 1]) {
      const arm = new T.Mesh(new T.BoxGeometry(0.07, 0.06, 0.55), darkWood);
      arm.position.set(sx * 0.37, 0.82, -0.01);
      chair.add(arm);
      const armPost = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.3, 6), darkWood);
      armPost.position.set(sx * 0.37, 0.69, 0.2);
      chair.add(armPost);
    }

    const pole = new T.Mesh(new T.CylinderGeometry(0.024, 0.032, 2, 8), iron);
    pole.position.set(0.45, 1, -0.37);
    pole.castShadow = true;
    chair.add(pole);
    const arm = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.48, 6), iron);
    arm.position.set(0.45, 1.98, -0.04);
    arm.rotation.x = Math.PI / 2;
    chair.add(arm);
    const cap = new T.Mesh(new T.ConeGeometry(0.14, 0.11, 4), iron);
    cap.position.set(0.45, 1.88, 0.19);
    cap.rotation.y = Math.PI / 4;
    chair.add(cap);
    const glassMat = new T.MeshStandardMaterial({ color: 0xffb767, emissive: 0xff9848, emissiveIntensity: 1.7, roughness: 0.25, transparent: true, opacity: 0.88 });
    const glass = new T.Mesh(new T.BoxGeometry(0.15, 0.19, 0.15), glassMat);
    glass.position.set(0.45, 1.76, 0.19);
    chair.add(glass);
    const lampLight = new T.PointLight(0xffa15a, 1.1, 3.1, 2);
    lampLight.position.set(0.45, 1.76, 0.19);
    chair.add(lampLight);
    lanterns.push({ seatId: `P${i + 1}`, light: lampLight, glass });

    const cloak = new T.MeshStandardMaterial({ color: cloakCols[i], roughness: 0.97, metalness: 0 });
    const body = new T.Mesh(new T.CapsuleGeometry(0.25, 0.53, 4, 10), cloak);
    body.position.set(0, 1.04, -0.03);
    body.scale.set(1, 0.93, 0.7);
    body.castShadow = true;
    chair.add(body);
    const shoulders = new T.Mesh(new T.SphereGeometry(0.31, 12, 8), cloak);
    shoulders.position.set(0, 1.25, -0.04);
    shoulders.scale.set(1.2, 0.46, 0.8);
    chair.add(shoulders);
    const head = new T.Mesh(new T.SphereGeometry(0.17, 14, 10), new T.MeshStandardMaterial({ color: 0x221912, roughness: 0.95 }));
    head.position.set(0, 1.47, -0.02);
    head.castShadow = true;
    chair.add(head);
    const hood = new T.Mesh(new T.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.72), cloak);
    hood.position.set(0, 1.49, -0.045);
    hood.rotation.x = -0.18;
    chair.add(hood);
    const collar = new T.Mesh(new T.TorusGeometry(0.18, 0.032, 6, 18, Math.PI * 1.35), cloak);
    collar.position.set(0, 1.33, -0.02);
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = -0.35;
    chair.add(collar);

    const disc = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 0.012, 24), brass);
    const px = Math.sin(angle) * 2.42;
    const pz = Math.cos(angle) * 2.42;
    disc.position.set(px, 1.088, pz);
    disc.rotation.y = angle;
    group.add(disc);
    const card = new T.Mesh(new T.BoxGeometry(0.26, 0.012, 0.17), new T.MeshStandardMaterial({ color: 0xcbb98f, roughness: 0.92 }));
    card.position.set(px * 1.085, 1.09, pz * 1.085);
    card.rotation.y = angle + Math.PI;
    group.add(card);
  }

  const warm = new T.PointLight(0xffb36b, 18, 13, 2);
  warm.position.set(0, 3.15, 7.6);
  scene.add(warm);
  const cool = new T.PointLight(0x86a9ba, 4, 12, 2);
  cool.position.set(5, 2.7, 11.6);
  scene.add(cool);
  const front = new T.PointLight(0xffbd82, 6, 8, 2);
  front.position.set(0, 1.9, 12.7);
  scene.add(front);
  state.warm = warm;
  state.cool = cool;
  state.front = front;
  const moon = new T.DirectionalLight(0xa8d2e6, 2.0);
  moon.name = 'linx-moon';
  moon.position.set(-9, 13, 7);
  scene.add(moon);
  state.moon = moon;

  const count = 38;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 13;
    positions[i * 3 + 1] = 0.7 + Math.random() * 4.2;
    positions[i * 3 + 2] = 3 + Math.random() * 11;
  }
  const flyGeometry = new T.BufferGeometry();
  flyGeometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  const flies = new T.Points(flyGeometry, new T.PointsMaterial({ color: 0xffc88a, size: 0.035, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
  scene.add(flies);

  applyGameScene(win, initial);
  // Keep the table reference for debugging / future scene tags.
  (win as any).__protoTable = group;
  (win as any).__protoSeats = seatGroups.map((chair: any, i: number) => ({ id: `P${i + 1}`, x: chair.position.x, z: chair.position.z + group.position.z }));
}

/**
 * Applies the day/night grade, stage camera, dead lanterns and role effect to an
 * already-dressed cabin table. Safe to call repeatedly when the game phase or
 * public seat state changes.
 */
export function applyGameScene(win: CabinWindow, options: SceneOptions = {}) {
  const f = win.__forestCabin;
  const state = (win as any).__linxTable as TableState | undefined;
  if (!f?.scene || !state) return;

  for (const key of Object.keys(options) as (keyof SceneOptions)[]) {
    if (options[key] !== undefined) (state.options as any)[key] = options[key];
  }

  const night = (state.options.mode ?? 'night') === 'night';
  const stage = state.options.stage ?? 'table';
  const scene = f.scene;

  for (const entry of state.baseLights) {
    const light = entry.light;
    if (light.name === 'low-sun') {
      light.intensity = night ? 0.38 : 3.9;
      light.color?.setHex(night ? 0x7fa3c0 : entry.color);
    } else if (light.isHemisphereLight) {
      light.intensity = night ? 0.34 : 0.9;
    } else if (light.isAmbientLight) {
      light.intensity = night ? 0.14 : 0.27;
    } else if (light.isDirectionalLight && light.name === 'moon-rim') {
      light.intensity = night ? 2.1 : entry.intensity;
      light.color?.setHex(night ? 0xa8d2e6 : entry.color);
    } else if (light.isDirectionalLight) {
      light.intensity = night ? 0.62 : entry.intensity;
    } else if (light.isSpotLight) {
      light.intensity = night ? 7.5 : 20;
    } else if (light.isPointLight) {
      light.intensity = night ? entry.intensity * 0.4 : entry.intensity;
    }
  }

  if (scene.fog) {
    scene.fog.color?.setHex(night ? 0x0a1719 : state.baseFogColor);
    scene.fog.density = night ? 0.0205 : 0.014;
  }
  if (scene.background?.isColor) {
    scene.background.setHex(night ? 0x050a0d : (state.baseBackground ?? 0x0a1a12));
  }
  f.renderer.toneMappingExposure = night ? 1.05 : 1.3;

  if (state.moon) {
    state.moon.visible = night;
    state.moon.intensity = 2;
  }
  state.warm.intensity = night ? 17 : 18;
  state.cool.intensity = night ? 13 : 4;
  state.front.intensity = night ? 3 : 6;

  const dead = new Set(state.options.deadSeats ?? []);
  for (const lantern of state.lanterns) {
    const isDead = dead.has(lantern.seatId);
    lantern.light.intensity = isDead ? 0.04 : 1.1;
    lantern.glass.material.emissiveIntensity = isDead ? 0.05 : 1.7;
    lantern.glass.material.color.setHex(isDead ? 0x6b5a45 : 0xffb767);
  }

  const mobile = win.innerWidth <= 760;
  let position: [number, number, number];
  let target: [number, number, number];
  let fov: number;
  if (mobile) {
    position = [1.5, 10, 24];
    target = [0, -0.5, 8.5];
    fov = 58;
  } else if (stage === 'result') {
    position = [4.6, 6.4, 22.4];
    target = [0, 2.1, 6.8];
    fov = 43;
  } else {
    position = night ? [7.2, 5.2, 18.4] : [7.2, 5.4, 18.6];
    target = [0, 2, 7.6];
    fov = 40;
  }

  if (f.controls) {
    f.controls.enabled = false;
    f.controls.update = () => {};
    f.controls.target.set(...target);
  }
  f.camera.fov = fov;
  f.camera.aspect = win.innerWidth / win.innerHeight;
  f.camera.position.set(...position);
  f.camera.lookAt(...target);
  f.camera.updateProjectionMatrix();
  f.renderer.setSize(win.innerWidth, win.innerHeight);
  if (f.composer) f.composer.setSize(win.innerWidth, win.innerHeight);

  f.renderer.shadowMap.autoUpdate = true;
  f.renderer.shadowMap.needsUpdate = true;
  if (f.composer) f.composer.render();
  else f.renderer.render(scene, f.camera);
  f.renderer.shadowMap.autoUpdate = false;
  f.renderer.shadowMap.needsUpdate = false;
}
