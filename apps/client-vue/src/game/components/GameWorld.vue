<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import type { GamePhase } from '../types';

type Stage = 'launch' | 'lobby' | 'table' | 'result';

const props = defineProps<{
  stage: Stage;
  phase: GamePhase;
  deadSeatIds: string[];
  selectedSeatId?: string | null;
  selfSeatId?: string;
  shieldSeatId?: string | null;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const failed = ref(false);
const SEAT_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];
const SEAT_NAMES: Record<string, string> = { P1: '岚', P2: '砚', P3: '禾', P4: '棠', P5: '渡', P6: '鸦', P7: '烬', P8: '梧', P9: '溪' };
const TABLE_Z = 4.55;
const TABLE_RADIUS = 2.9;
const TABLE_SCALE_X = 1.35;
const SEAT_X = 4.45;
const SEAT_Z = 3.15;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let frame = 0;
let last = 0;
let elapsed = 0;
let disposeScene: (() => void) | null = null;
let reducedMotion = false;
let mobile = false;

const cameraTarget = new THREE.Vector3(0, 1.7, TABLE_Z);
const cameraDesired = new THREE.Vector3(7, 4.9, 12.8);
const lookDesired = new THREE.Vector3(0, 1.7, TABLE_Z);
const lookCurrent = new THREE.Vector3(0, 1.7, TABLE_Z);
const cameraLookTarget = new THREE.Vector3(0, 1.7, TABLE_Z);

let ambient: THREE.HemisphereLight | null = null;
let moon: THREE.DirectionalLight | null = null;
let cabinLight: THREE.PointLight | null = null;
let tableWarm: THREE.PointLight | null = null;
let tableCool: THREE.PointLight | null = null;
let keyLight: THREE.SpotLight | null = null;
let exposureTarget = 1.16;
let exposureCurrent = 1.16;
let fogTarget = 0.024;
let fogCurrent = 0.024;

interface Figure {
  id: string;
  root: THREE.Group;
  body: THREE.Group;
  lantern: THREE.Group;
  label: THREE.Sprite;
  materials: THREE.Material[];
  phase: number;
}
const figures: Figure[] = [];
let selectedRing: THREE.Mesh | null = null;
let shieldGroup: THREE.Group | null = null;
let shieldSeat = '';
let shieldMaterial: THREE.MeshBasicMaterial | null = null;
let ringMaterials: THREE.MeshBasicMaterial[] = [];
let lastStage: Stage = props.stage;

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 1024, h = 1024) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!; draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
function mat(color: number, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .88, ...options });
}
function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale?: [number, number, number]) {
  const m = new THREE.Mesh(geometry, material); m.position.set(...pos); if (scale) m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function makeLabel(id: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(8, 14, 10, .78)'; ctx.strokeStyle = 'rgba(213, 180, 122, .62)'; ctx.lineWidth = 3;
  const r = 18; ctx.beginPath(); ctx.roundRect(4, 4, 248, 88, r); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d7bc86'; ctx.font = '600 26px Georgia, "Songti SC", serif'; ctx.fillText(id, 128, 31);
  ctx.fillStyle = '#e6ddc9'; ctx.font = '400 24px Georgia, "Songti SC", serif'; ctx.fillText(SEAT_NAMES[id] || '', 128, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: .92, depthTest: false, depthWrite: false }));
  sprite.renderOrder = 20; sprite.scale.set(1.18, .44, 1); return sprite;
}
function createTableTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#6c4d33'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      ctx.strokeStyle = `rgba(${20 + i % 16}, ${13 + i % 9}, ${8 + i % 8}, ${.02 + (i % 7) * .012})`;
      ctx.lineWidth = 1 + i % 3; ctx.beginPath();
      const y = (i / 160) * h + Math.sin(i * 2.1) * 8;
      ctx.moveTo(0, y); ctx.bezierCurveTo(w * .28, y + 12, w * .65, y - 10, w, y + 4); ctx.stroke();
    }
    const g = ctx.createRadialGradient(w * .5, h * .5, w * .1, w * .5, h * .5, w * .55);
    g.addColorStop(0, 'rgba(255,206,139,.18)'); g.addColorStop(.65, 'rgba(38,23,12,.12)'); g.addColorStop(1, 'rgba(7,10,6,.44)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 1024, 1024);
}
function createFeltTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#1a2921'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12000; i++) {
      ctx.fillStyle = `rgba(${76 + i % 30}, ${93 + i % 25}, ${75 + i % 18}, ${.02 + (i % 5) * .007})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * .58);
    g.addColorStop(0, 'rgba(208,179,122,.1)'); g.addColorStop(.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 1024, 1024);
}
function seatPoint(index: number, scale = 1) {
  const theta = (index / 9) * Math.PI * 2 + Math.PI / 2;
  return { theta, x: Math.cos(theta) * SEAT_X * scale, z: TABLE_Z + Math.sin(theta) * SEAT_Z * scale };
}
function createFigure(id: string, index: number): Figure {
  const p = seatPoint(index, .93); const x = p.x; const z = p.z;
  const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = Math.atan2(-x, -(z - TABLE_Z));
  const colors = [0x34463b, 0x4a3a2f, 0x2f3d38, 0x4b4135, 0x3c4436, 0x4e332c, 0x3b4a44, 0x4a4437, 0x303b35];
  const accents = [0x9c7b4d, 0x7e5a41, 0xa18254, 0x8e6b48, 0x957b4c, 0x8e4e3f, 0xa08351, 0x9b7b4d, 0x866d49];
  const coat = mat(colors[index % colors.length], { roughness: .97 });
  const accent = mat(accents[index % accents.length], { roughness: .78 });
  const skin = mat(0x8e6c53, { roughness: .82 });
  const dark = mat(0x1a1c16, { roughness: .9 });
  const materials = [coat, accent, skin, dark];
  const body = new THREE.Group(); root.add(body);
  add(body, new THREE.CapsuleGeometry(.28, .5, 4, 8), coat, [0, .95, 0], [1, .95, .78]);
  add(body, new THREE.ConeGeometry(.42, .72, 10), coat, [0, 1.22, -.08], [1, .95, .72]);
  const head = add(body, new THREE.SphereGeometry(.17, 16, 12), skin, [0, 1.62, .03]);
  add(body, new THREE.SphereGeometry(.24, 16, 10, 0, Math.PI * 2, 0, Math.PI * .62), mat(colors[index % colors.length], { roughness: 1, side: THREE.DoubleSide }), [0, 1.68, -.02], [1, 1.15, .92]);
  add(body, new THREE.CylinderGeometry(.23, .27, .1, 12), accent, [0, 1.48, 0]);
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .24, 1.16, 0); body.add(arm);
    add(arm, new THREE.CapsuleGeometry(.065, .32, 3, 6), coat, [0, -.17, 0]);
    add(arm, new THREE.SphereGeometry(.07, 10, 8), skin, [0, -.36, .02]);
    arms.push(arm);
  }
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .11, .53, 0); body.add(leg);
    add(leg, new THREE.CapsuleGeometry(.068, .3, 3, 6), dark, [0, -.18, 0]);
    add(leg, new THREE.BoxGeometry(.15, .08, .28), dark, [0, -.38, .05]);
    legs.push(leg);
  }
  const lantern = new THREE.Group(); lantern.position.set(-.38, .72, .16); root.add(lantern);
  add(lantern, new THREE.CylinderGeometry(.06, .06, .025, 8), dark, [0, 0, 0]);
  add(lantern, new THREE.BoxGeometry(.12, .18, .12), mat(0xffb765, { emissive: 0xff9e45, emissiveIntensity: 2.7, transparent: true, opacity: .9 }), [0, -.1, 0]);
  const label = makeLabel(id); label.position.set(x, 2.62, z); label.visible = true;
  (root as THREE.Group & { arms?: THREE.Group[]; legs?: THREE.Group[] }).arms = arms;
  (root as THREE.Group & { arms?: THREE.Group[]; legs?: THREE.Group[] }).legs = legs;
  (root as THREE.Group & { lantern?: THREE.Group }).lantern = lantern;
  return { id, root, body, lantern, label, materials, phase: Math.random() * Math.PI * 2 };
}
function createChair(index: number) {
  const p = seatPoint(index); const x = p.x; const z = p.z;
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = Math.atan2(-x, -(z - TABLE_Z));
  const wood = mat(0x3a2c20, { roughness: .95 }); const dark = mat(0x211b14, { roughness: 1 });
  add(group, new THREE.BoxGeometry(1.05, .12, .82), wood, [0, .54, 0]);
  add(group, new THREE.BoxGeometry(1.05, .1, .82), dark, [0, .48, 0]);
  add(group, new THREE.BoxGeometry(.95, 1.05, .12), wood, [0, 1.02, -.4]);
  add(group, new THREE.BoxGeometry(.78, .72, .06), mat(0x4a3b2a, { roughness: .9 }), [0, 1.09, -.34]);
  for (const sx of [-.42, .42]) {
    add(group, new THREE.CylinderGeometry(.055, .07, .52, 8), dark, [sx, .26, -.28]);
    add(group, new THREE.CylinderGeometry(.055, .07, .52, 8), dark, [sx, .26, .28]);
  }
  return group;
}
function addCandle(parent: THREE.Group, x: number, z: number, scale = 1) {
  const wax = mat(0xd8c49b, { roughness: .9 }); const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc477, transparent: true, opacity: .9 });
  add(parent, new THREE.CylinderGeometry(.055 * scale, .075 * scale, .32 * scale, 10), wax, [x, 1.19 + .16 * scale, z]);
  add(parent, new THREE.CylinderGeometry(.075 * scale, .075 * scale, .02, 10), mat(0x8b6b3f), [x, 1.17, z]);
  const flame = add(parent, new THREE.ConeGeometry(.04 * scale, .13 * scale, 8), flameMat, [x, 1.4 + .08 * scale, z]);
  flame.castShadow = false;
  const light = new THREE.PointLight(0xffb365, 1.8 * scale, 3.2, 2); light.position.set(x, 1.48, z); parent.add(light);
  return flame;
}

function setCameraForView(instant = false) {
  const isNight = ['NIGHT_GUARD', 'NIGHT_WOLF', 'NIGHT_SEER', 'NIGHT_WITCH'].includes(props.phase);
  if (props.stage === 'launch') {
    cameraDesired.set(mobile ? 1.4 : 7.8, mobile ? 8.2 : 4.8, mobile ? 16.2 : 11.4);
    lookDesired.set(0, mobile ? 1.2 : 2.1, mobile ? -0.4 : -1.8);
  } else if (props.stage === 'lobby') {
    cameraDesired.set(mobile ? 1.3 : 6.2, mobile ? 8.2 : 4.5, mobile ? 16.4 : 11.4);
    lookDesired.set(0, mobile ? 0.35 : 1.7, mobile ? 4.4 : 4.4);
  } else if (props.stage === 'result') {
    cameraDesired.set(mobile ? 1.7 : 5.0, mobile ? 8.5 : 5.2, mobile ? 17.2 : 13.2);
    lookDesired.set(0, mobile ? 0.35 : 1.9, mobile ? 4.2 : 4.0);
  } else if (isNight) {
    cameraDesired.set(mobile ? 1.2 : 5.8, mobile ? 7.9 : 4.4, mobile ? 16.2 : 11.2);
    lookDesired.set(0, mobile ? 0.3 : 1.6, mobile ? 4.2 : 4.4);
  } else {
    cameraDesired.set(mobile ? 1.2 : 5.7, mobile ? 7.9 : 4.3, mobile ? 16.2 : 11.1);
    lookDesired.set(0, mobile ? 0.3 : 1.6, mobile ? 4.2 : 4.4);
  }
  exposureTarget = isNight ? 1.28 : props.stage === 'result' ? 1.46 : 1.48;
  fogTarget = isNight ? .026 : .018;
  if (instant && camera) {
    camera.position.copy(cameraDesired); lookCurrent.copy(lookDesired); camera.lookAt(lookCurrent);
    exposureCurrent = exposureTarget; fogCurrent = fogTarget;
    if (renderer) renderer.toneMappingExposure = exposureTarget;
    if (scene?.fog) (scene.fog as THREE.FogExp2).density = fogTarget;
  }
}
function updateLighting(instant = false) {
  const isNight = ['NIGHT_GUARD', 'NIGHT_WOLF', 'NIGHT_SEER', 'NIGHT_WITCH'].includes(props.phase);
  if (ambient) ambient.intensity = isNight ? .62 : 1.25;
  if (moon) { moon.intensity = isNight ? 2.4 : 1.8; moon.color.setHex(isNight ? 0xa9cee4 : 0x8fb3b8); }
  if (cabinLight) cabinLight.intensity = isNight ? 5.5 : 18;
  if (tableWarm) tableWarm.intensity = isNight ? 8.5 : 9;
  if (tableCool) tableCool.intensity = isNight ? 9 : 5;
  if (keyLight) keyLight.intensity = isNight ? 6.5 : 12;
  if (scene) scene.background = new THREE.Color(isNight ? 0x081417 : 0x0a1a12);
  if (instant) {
    exposureCurrent = exposureTarget; fogCurrent = fogTarget;
    if (renderer) renderer.toneMappingExposure = exposureTarget;
    if (scene?.fog) (scene.fog as THREE.FogExp2).density = fogTarget;
  }
}
function updateSeats() {
  const dead = new Set(props.deadSeatIds);
  for (const figure of figures) {
    const isDead = dead.has(figure.id);
    figure.root.visible = true;
    figure.body.position.y = isDead ? -.28 : 0;
    figure.root.rotation.z = isDead ? 0 : figure.root.rotation.z;
    figure.label.material.opacity = isDead ? .28 : .92;
    figure.lantern.visible = !isDead;
    for (const material of figure.materials) {
      const m = material as THREE.MeshStandardMaterial;
      m.transparent = true;
      m.opacity = isDead ? .28 : 1;
      m.depthWrite = !isDead;
    }
  }
  if (selectedRing) {
    selectedRing.visible = Boolean(props.selectedSeatId);
    const index = props.selectedSeatId ? SEAT_IDS.indexOf(props.selectedSeatId) : -1;
    if (index >= 0) {
      const p = seatPoint(index, .99);
      selectedRing.position.set(p.x, .06, p.z);
    }
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
  if (shieldGroup) {
    shieldGroup.visible = Boolean(props.shieldSeatId);
    const index = props.shieldSeatId ? SEAT_IDS.indexOf(props.shieldSeatId) : -1;
    if (index >= 0) {
      const p = seatPoint(index, .93);
      shieldGroup.position.set(p.x, 0, p.z);
    }
  }
}
function resize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  mobile = window.innerWidth < 760;
  setCameraForView(true);
}

onMounted(() => {
  if (!canvas.value) return;
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  let rendererLocal: THREE.WebGLRenderer;
  try {
    rendererLocal = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    failed.value = true; return;
  }
  renderer = rendererLocal;
  rendererLocal.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  rendererLocal.setSize(window.innerWidth, window.innerHeight);
  rendererLocal.outputColorSpace = THREE.SRGBColorSpace;
  rendererLocal.toneMapping = THREE.ACESFilmicToneMapping;
  rendererLocal.toneMappingExposure = 1.48;
  rendererLocal.shadowMap.enabled = true;
  rendererLocal.shadowMap.type = THREE.PCFSoftShadowMap;

  const world = new THREE.Scene(); scene = world;
  world.background = new THREE.Color(0x0a1a12);
  world.fog = new THREE.FogExp2(0x0a1a12, .018);

  const cam = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, .1, 100);
  camera = cam; cam.position.copy(cameraDesired); cam.lookAt(lookDesired);

  ambient = new THREE.HemisphereLight(0x9fc0b8, 0x2c2216, 1.25); world.add(ambient);
  moon = new THREE.DirectionalLight(0x8fb3b8, 1.8); moon.position.set(-7, 10, 5); moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); world.add(moon);
  cabinLight = new THREE.PointLight(0xffb665, 18, 10, 2); cabinLight.position.set(-2.4, 1.5, -.2); world.add(cabinLight);
  tableWarm = new THREE.PointLight(0xffb36a, 9, 7, 2); tableWarm.position.set(0, 2.5, TABLE_Z); world.add(tableWarm);
  tableCool = new THREE.PointLight(0x8fb2bc, 5, 9, 2); tableCool.position.set(5, 4.2, TABLE_Z + 2.5); world.add(tableCool);
  keyLight = new THREE.SpotLight(0xffcf95, 12, 20, .58, .6, 1.4); keyLight.position.set(1.5, 7, 11.5); keyLight.target.position.set(0, 1, TABLE_Z); world.add(keyLight); world.add(keyLight.target);

  const backdrop = canvasTexture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a1f18'); g.addColorStop(.42, '#1a3b2c'); g.addColorStop(1, '#07120c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) { ctx.fillStyle = `rgba(1,7,4,${.16 + (i % 5) * .035})`; ctx.fillRect((i / 24) * w, h * .05, 12 + i % 5 * 18, h); }
  }, 1024, 1024);
  const background = add(world, new THREE.PlaneGeometry(34, 20), new THREE.MeshBasicMaterial({ map: backdrop, fog: false }), [0, 6, -7]);
  background.castShadow = false; background.receiveShadow = false;

  const ground = add(world, new THREE.CircleGeometry(14, 56), mat(0x1d2c1e, { roughness: 1 }), [0, -.04, 0]); ground.rotation.x = -Math.PI / 2;

  // Cabin
  const cabin = new THREE.Group(); cabin.position.set(-2.4, 0, -2.8); world.add(cabin);
  add(cabin, new THREE.BoxGeometry(5.2, 2.45, 2.5), mat(0x71573f, { roughness: .95 }), [0, 1.25, 0]);
  add(cabin, new THREE.BoxGeometry(5.5, .24, 2.7), mat(0x2e2a20), [0, .12, 0]);
  const roof = add(cabin, new THREE.ConeGeometry(3.7, 1.35, 4), mat(0x3a3428, { roughness: 1 }), [0, 3.1, 0], [1, 1, .9]);
  roof.rotation.y = Math.PI / 4;
  add(cabin, new THREE.BoxGeometry(.9, 1.5, .06), mat(0x2b2119), [0, .78, 1.28]);
  for (const x of [-1.55, 1.55]) {
    add(cabin, new THREE.BoxGeometry(.92, .78, .05), mat(0xffad5c, { emissive: 0xff8e39, emissiveIntensity: 2.2 }), [x, 1.5, 1.28]);
    add(cabin, new THREE.BoxGeometry(1.02, .06, .08), mat(0x34261b), [x, 1.1, 1.31]);
  }
  add(cabin, new THREE.BoxGeometry(5.6, .12, .5), mat(0x3b2d21), [0, .03, 1.5]);
  for (const z of [.55, .95, 1.35]) add(cabin, new THREE.BoxGeometry(1.4, .12, .58), mat(0x4a3828, { roughness: 1 }), [0, z * .08, 1.55]);
  add(cabin, new THREE.CylinderGeometry(.16, .22, .7, 10), mat(0x332c24, { roughness: 1 }), [1.55, 3.75, -.2]);

  // Trees
  const trunk = mat(0x2a382b, { roughness: 1 }); const canopy = mat(0x1d3a27, { roughness: 1 });
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1; const x = side * (4.3 + (i % 5) * .85); const z = -6 + (i % 8) * 1.35;
    add(world, new THREE.CylinderGeometry(.11 + i % 3 * .06, .19 + i % 2 * .08, 5 + i % 4, 7), trunk, [x, 2.5, z]);
    add(world, new THREE.ConeGeometry(1.1 + i % 3 * .32, 2.9, 8), canopy, [x, 5.4, z]);
  }

  // Moon sprite
  const moonCanvas = canvasTexture((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(238,244,224,.95)'); g.addColorStop(.35, 'rgba(175,207,187,.3)'); g.addColorStop(1, 'rgba(80,128,119,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 128, 128);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonCanvas, color: 0xbdd6c3, transparent: true, opacity: .78, depthWrite: false }));
  moonSprite.position.set(-5.4, 4.9, -6.6); moonSprite.scale.set(2.3, 2.3, 1); world.add(moonSprite);

  // Table
  const table = new THREE.Group(); table.position.set(0, 0, TABLE_Z); table.scale.x = TABLE_SCALE_X; world.add(table);
  const woodTexture = createTableTexture(); const feltTexture = createFeltTexture();
  const tableWood = new THREE.MeshStandardMaterial({ map: woodTexture, color: 0xb08056, roughness: .72, metalness: .04 });
  const felt = new THREE.MeshStandardMaterial({ map: feltTexture, color: 0x93ac87, roughness: .97 });
  add(table, new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS * .94, .28, 64), tableWood, [0, .9, 0]);
  add(table, new THREE.CylinderGeometry(TABLE_RADIUS * .9, TABLE_RADIUS * .9, .03, 64), new THREE.MeshStandardMaterial({ color: 0x2b2016, roughness: .8 }), [0, 1.05, 0]);
  add(table, new THREE.CylinderGeometry(TABLE_RADIUS * .62, TABLE_RADIUS * .62, .035, 64), felt, [0, 1.07, 0]);
  add(table, new THREE.TorusGeometry(TABLE_RADIUS * .62, .022, 8, 64), mat(0x9d7b45, { metalness: .6, roughness: .35 }), [0, 1.09, 0]).rotation.x = -Math.PI / 2;
  add(table, new THREE.TorusGeometry(TABLE_RADIUS * .9, .035, 8, 64), mat(0x76542f, { metalness: .45, roughness: .45 }), [0, 1.06, 0]).rotation.x = -Math.PI / 2;
  // Table legs
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    add(table, new THREE.CylinderGeometry(.09, .13, .9, 8), mat(0x332319, { roughness: .9 }), [Math.cos(a) * 1.65, .45, Math.sin(a) * 1.65]);
  }
  // Moon dial
  const dial = add(table, new THREE.CylinderGeometry(.83, .83, .025, 64), mat(0x17231b, { roughness: .85 }), [0, 1.095, 0]);
  add(table, new THREE.TorusGeometry(.83, .018, 8, 64), mat(0xb89455, { metalness: .6, roughness: .34 }), [0, 1.11, 0]).rotation.x = -Math.PI / 2;
  add(table, new THREE.TorusGeometry(.55, .008, 6, 64), mat(0x8f7446, { metalness: .4, roughness: .45, transparent: true, opacity: .65 }), [0, 1.115, 0]).rotation.x = -Math.PI / 2;
  add(table, new THREE.BoxGeometry(.5, .012, .014), mat(0xc3a15f, { metalness: .5, roughness: .3 }), [0, 1.12, -.18]).rotation.y = .32;
  add(table, new THREE.CircleGeometry(.1, 20), mat(0xd2b16c, { emissive: 0x6d4b20, emissiveIntensity: .8 }), [0, 1.123, 0]).rotation.x = -Math.PI / 2;
  // Candles
  addCandle(table, -1.65, -.25, .95); addCandle(table, 1.5, .45, .8); addCandle(table, .15, 1.55, .7);
  // Place cards and little bowls
  for (let i = 0; i < 9; i++) {
    const theta = (i / 9) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(theta) * 2.12; const z = Math.sin(theta) * 2.12;
    const card = add(table, new THREE.BoxGeometry(.42, .022, .3), mat(0xcabf9e, { roughness: .85 }), [x, 1.095, z]);
    card.rotation.y = -theta + Math.PI / 2;
    add(table, new THREE.CylinderGeometry(.12, .1, .05, 16), mat(0x3a2b1d), [Math.cos(theta) * 1.7, 1.1, Math.sin(theta) * 1.7]);
  }

  // Chairs and figures
  const labelGroup = new THREE.Group(); world.add(labelGroup);
  for (let i = 0; i < 9; i++) {
    world.add(createChair(i));
    const figure = createFigure(SEAT_IDS[i], i);
    figures.push(figure);
    world.add(figure.root);
    labelGroup.add(figure.label);
  }

  // Selected seat ring
  const ringGeom = new THREE.RingGeometry(.34, .43, 48);
  ringMaterials = [new THREE.MeshBasicMaterial({ color: 0xe2bd78, transparent: true, opacity: .9, side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color: 0x9e7a44, transparent: true, opacity: .35, side: THREE.DoubleSide })];
  selectedRing = new THREE.Mesh(ringGeom, ringMaterials[0]); selectedRing.rotation.x = -Math.PI / 2; selectedRing.position.y = .06; selectedRing.visible = false; world.add(selectedRing);

  // Guard shield (private, only mounted when the viewer is the guard)
  shieldGroup = new THREE.Group(); shieldGroup.visible = false;
  shieldMaterial = new THREE.MeshBasicMaterial({ color: 0xffce83, transparent: true, opacity: .075, side: THREE.DoubleSide, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), shieldMaterial); dome.position.y = .02; shieldGroup.add(dome);
  for (let r = 0; r < 3; r++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12 - r * .18, .008, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffd291, transparent: true, opacity: .42 - r * .09, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .12 + r * .22; shieldGroup.add(ring);
  }
  world.add(shieldGroup);

  // Fireflies
  const fireGeo = new THREE.BufferGeometry(); const firePos: number[] = [];
  for (let i = 0; i < 110; i++) firePos.push((Math.random() - .5) * 12, .25 + Math.random() * 4.2, -2 + Math.random() * 10);
  fireGeo.setAttribute('position', new THREE.Float32BufferAttribute(firePos, 3));
  const fire = new THREE.Points(fireGeo, new THREE.PointsMaterial({ color: 0xffd48b, size: .045, transparent: true, opacity: .72, blending: THREE.AdditiveBlending, depthWrite: false })); world.add(fire);

  resize();
  updateLighting(true);
  updateSeats();
  setCameraForView(true);
  rendererLocal.render(world, cam);

  const animate = (stamp: number) => {
    frame = requestAnimationFrame(animate);
    if (!renderer || !camera || !scene) { last = stamp; return; }
    const dt = Math.min(.05, last ? (stamp - last) / 1000 : 1 / 60); last = stamp; elapsed += dt;
    const blend = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.6);
    camera.position.lerp(cameraDesired, blend);
    lookCurrent.lerp(lookDesired, blend);
    camera.lookAt(lookCurrent);
    exposureCurrent = THREE.MathUtils.lerp(exposureCurrent, exposureTarget, blend);
    renderer.toneMappingExposure = exposureCurrent;
    if (scene.fog) { fogCurrent = THREE.MathUtils.lerp(fogCurrent, fogTarget, blend); (scene.fog as THREE.FogExp2).density = fogCurrent; }
    figures.forEach((figure, index) => {
      const armGroup = figure.root as THREE.Group & { arms?: THREE.Group[]; legs?: THREE.Group[] };
      const sway = Math.sin(elapsed * .55 + figure.phase) * .018;
      figure.body.rotation.z = sway;
      figure.lantern.rotation.z = Math.sin(elapsed * 1.6 + index) * .07;
      if (armGroup.arms) { armGroup.arms[0].rotation.x = -.1 + Math.sin(elapsed * .35 + index) * .025; armGroup.arms[1].rotation.x = -.1 - Math.sin(elapsed * .35 + index) * .025; }
      figure.label.position.y = 2.62 + Math.sin(elapsed * .7 + index) * .018;
    });
    if (selectedRing) { const pulse = .55 + Math.sin(elapsed * 2.2) * .18; ringMaterials[0].opacity = pulse; selectedRing.rotation.z = elapsed * .12; }
    if (shieldGroup && shieldGroup.visible) { shieldGroup.rotation.y = elapsed * .18; if (shieldMaterial) shieldMaterial.opacity = .06 + Math.sin(elapsed * 1.4) * .018; }
    fire.rotation.y = elapsed * .018;
    renderer.render(world, cam);
  };

  disposeScene = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    rendererLocal.dispose();
    world.traverse(obj => { if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose(); });
  };
  window.addEventListener('resize', resize);
  frame = requestAnimationFrame(animate);
});

watch(() => [props.stage, props.phase], () => {
  const stageChanged = props.stage !== lastStage;
  lastStage = props.stage;
  setCameraForView(stageChanged);
  updateLighting(stageChanged);
  if (stageChanged && renderer && scene && camera) renderer.render(scene, camera);
}, { immediate: false });
watch(() => [props.deadSeatIds, props.selectedSeatId, props.shieldSeatId], updateSeats, { deep: true });
onBeforeUnmount(() => { disposeScene?.(); disposeScene = null; renderer = null; scene = null; camera = null; figures.length = 0; });
</script>

<template>
  <div class="game-world" :class="{ 'game-world-failed': failed }">
    <canvas ref="canvas" aria-hidden="true"></canvas>
    <div class="game-world-vignette" aria-hidden="true"></div>
    <div class="game-world-grain" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.game-world { position: fixed; inset: 0; z-index: 0; background: radial-gradient(circle at 50% 35%, #11231a, #050b08 75%); overflow: hidden; }
.game-world canvas { display: block; width: 100%; height: 100%; }
.game-world-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 48%, transparent 42%, rgba(0,0,0,.45) 100%); }
.game-world-grain { position: absolute; inset: 0; pointer-events: none; opacity: .16; mix-blend-mode: soft-light; background-image: url('/assets/game/noise.png'); background-size: 256px 256px; }
.game-world-failed { background: radial-gradient(circle at 50% 35%, #182a1e, #050b08 75%); }
</style>
