<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import BrandMark from '../components/BrandMark.vue';
import { createStage, type Stage as StageHandle } from '../stage';
import { ROLE_CATALOG, type GameRole } from '../types';

const router = useRouter();
const canvas = ref<HTMLCanvasElement | null>(null);
const stage = shallowRef<StageHandle | null>(null);
const sceneReady = ref(false);
const codexOpen = ref(false);
const leaving = ref(false);
let navTimer: number | undefined;
let readyTimer: number | undefined;

const roles = (Object.keys(ROLE_CATALOG) as GameRole[]).map((key) => ({
  key,
  ...ROLE_CATALOG[key],
}));

// 与对局页同一约定：?perf=api 时把舞台挂到 window，供 tools/measure-stage.mjs 驱动
const exposeApi = new URLSearchParams(window.location.search).get('perf') === 'api';
const perfWindow = window as unknown as { __linxStage?: StageHandle };

onMounted(() => {
  const element = canvas.value;
  if (!element) return;
  try {
    stage.value = createStage(element, {
      mode: 'lobby',
      night: false,
      deadSeats: [],
      selectedSeat: null,
      selfSeat: null,
      shieldSeat: null,
    });
    readyTimer = window.setTimeout(() => {
      sceneReady.value = true;
    }, 60);
    if (exposeApi && stage.value) perfWindow.__linxStage = stage.value;
  } catch (error) {
    console.warn('launch stage unavailable, falling back to gradient backdrop', error);
    sceneReady.value = true;
  }
  window.addEventListener('keydown', onKeydown);
});

function enter(path: string) {
  if (leaving.value) return;
  leaving.value = true;
  navTimer = window.setTimeout(() => router.push(path), 380);
}

function toggleCodex() {
  codexOpen.value = !codexOpen.value;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && codexOpen.value) codexOpen.value = false;
}

onBeforeUnmount(() => {
  window.clearTimeout(navTimer);
  window.clearTimeout(readyTimer);
  window.removeEventListener('keydown', onKeydown);
  if (perfWindow.__linxStage === stage.value) delete perfWindow.__linxStage;
  stage.value?.dispose();
  stage.value = null;
});
</script>

<template>
  <div class="screen launch-screen" :class="{ 'is-leaving': leaving, 'is-codex-open': codexOpen }">
    <canvas
      ref="canvas"
      class="launch-cinematic"
      :class="{ 'is-ready': sceneReady }"
      aria-hidden="true"
      tabindex="-1"
    ></canvas>
    <div class="launch-scrim" aria-hidden="true"></div>
    <header class="launch-top"><BrandMark /><span class="launch-top-meta">NINE PLAYERS · 预女猎</span></header>
    <section class="launch-copy">
      <p class="eyebrow">A FOREST CABIN · A LONG TABLE · NINE STRANGERS</p>
      <h1>暮林<br /><span>山舍</span></h1>
      <p class="launch-lede">九个旅人，一张长桌。<br />天黑之后，有人不再是人。</p>
      <div class="launch-actions"><button class="btn gold" type="button" @click="enter('/lobby')">进入山舍 <span>→</span></button></div>
      <div class="launch-rule"><span></span><p>3 狼人 · 3 村民 · 预言家 · 女巫 · 猎人</p><span></span></div>
      <p class="launch-scene-state" role="status"><i></i>{{ sceneReady ? 'SCENE READY · 山舍已点亮' : 'SUMMONING THE FOREST · 正在进入林间' }}</p>
    </section>
    <footer class="launch-foot"><span>LINX NIGHT / WALDHÜTTE</span><span>VUE 3 + TYPESCRIPT + THREE.JS</span><span>SEAT 09 / WAITING</span></footer>
    <button class="launch-codex" type="button" :aria-expanded="codexOpen" aria-haspopup="dialog" @click="toggleCodex">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.2h5.2c1.2 0 2.1.9 2.1 2.1v11.5c0-.9-.7-1.6-1.6-1.6H4.5V5.2Z"/><path d="M19.5 5.2h-5.2c-1.2 0-2.1.9-2.1 2.1v11.5c0-.9.7-1.6 1.6-1.6h5.7V5.2Z"/><path d="M12 7.4v11.1"/></svg>
      <span class="codex-copy"><b>图册</b><small>CHARACTER CODEX</small></span>
      <span class="codex-count">{{ roles.length }}</span>
    </button>

    <div v-if="codexOpen" class="codex-panel" role="dialog" aria-modal="true" aria-label="角色图册">
      <div class="codex-backdrop" @click="codexOpen = false"></div>
      <div class="codex-sheet">
        <header class="codex-head">
          <div>
            <p class="eyebrow">CHARACTER CODEX</p>
            <h2>角色图册</h2>
          </div>
          <button class="codex-close" type="button" aria-label="关闭" @click="codexOpen = false">×</button>
        </header>
        <ul class="codex-grid">
          <li v-for="role in roles" :key="role.key" class="codex-card">
            <img class="codex-avatar" :src="role.avatar" :alt="role.name" loading="lazy" />
            <div class="codex-body">
              <p class="codex-name">{{ role.name }}<small>{{ role.en }}</small></p>
              <p class="codex-ability">{{ role.ability }}</p>
              <p class="codex-quote">“{{ role.quote }}”</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.launch-cinematic { display: block; }
.codex-panel { position: fixed; inset: 0; z-index: 12; display: grid; place-items: center; }
.codex-backdrop { position: absolute; inset: 0; background: rgba(2, 8, 6, .72); backdrop-filter: none; }
.codex-sheet { position: relative; width: min(840px, 92vw); max-height: 82vh; overflow: auto; padding: 26px 28px 30px; border: 1px solid rgba(212, 178, 122, .28); border-radius: 14px; background: linear-gradient(180deg, rgba(12, 22, 18, .97), rgba(6, 12, 10, .98)); box-shadow: 0 30px 80px rgba(0, 0, 0, .6); }
.codex-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.codex-head h2 { margin: 6px 0 0; font-size: 22px; letter-spacing: .06em; color: #f0dcb4; }
.codex-close { width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(212, 178, 122, .3); background: transparent; color: #d4b27a; font-size: 20px; line-height: 1; cursor: pointer; }
.codex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.codex-card { display: flex; gap: 12px; padding: 12px; border: 1px solid rgba(212, 178, 122, .16); border-radius: 10px; background: rgba(255, 255, 255, .02); }
.codex-avatar { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; flex: none; }
.codex-body { min-width: 0; }
.codex-name { margin: 0 0 4px; font-size: 14px; color: #f0dcb4; display: flex; align-items: baseline; gap: 8px; }
.codex-name small { font-size: 9px; letter-spacing: .18em; color: rgba(212, 178, 122, .55); }
.codex-ability { margin: 0 0 6px; font-size: 12px; line-height: 1.5; color: rgba(232, 226, 214, .72); }
.codex-quote { margin: 0; font-size: 11px; color: rgba(212, 178, 122, .55); }
</style>
