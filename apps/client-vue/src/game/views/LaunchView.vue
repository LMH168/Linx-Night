<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandMark from '../components/BrandMark.vue';
import { dressLaunchScene, type CabinWindow } from '../launchScene';

const router = useRouter();
const frame = ref<HTMLIFrameElement | null>(null);
const sceneReady = ref(false);
const codexReady = ref(false);
const codexOpen = ref(false);
const leaving = ref(false);
let pollTimer: number | undefined;
let navTimer: number | undefined;
let codexTimer: number | undefined;
let sceneDressed = false;

function pollScene() {
  window.clearTimeout(pollTimer);
  if (sceneReady.value) return;
  const started = performance.now();
  const check = () => {
    let win: CabinWindow | null;
    try {
      win = (frame.value?.contentWindow as CabinWindow | null);
    } catch {
      // A cross-origin iframe cannot expose the scene API; it still plays the
      // animation, so reveal it rather than leaving the launch screen dark.
      sceneReady.value = true;
      return;
    }
    if (win?.__forestRoster?.open) codexReady.value = true;
    const cabin = win?.__forestCabin;
    if (cabin && !sceneDressed) {
      sceneDressed = true;
      try {
        dressLaunchScene(win!);
      } catch (error) {
        console.warn('launch scene dressing skipped', error);
      }
    }
    if (cabin) sceneReady.value = true;
    if (sceneReady.value && codexReady.value) return;
    if (performance.now() - started > 12000) {
      sceneReady.value = true;
      return;
    }
    pollTimer = window.setTimeout(check, 120);
  };
  check();
}

function watchCodex() {
  window.clearTimeout(codexTimer);
  if (!codexOpen.value) return;
  let open = false;
  try {
    open = Boolean(frame.value?.contentDocument?.getElementById('roster')?.classList.contains('is-open'));
  } catch {
    open = false;
  }
  if (!open) {
    closeCodex(false);
    return;
  }
  codexTimer = window.setTimeout(watchCodex, 180);
}

function openCodex() {
  const roster = (frame.value?.contentWindow as CabinWindow | null)?.__forestRoster;
  if (!roster?.open) return;
  try {
    roster.open();
    codexOpen.value = true;
    window.clearTimeout(codexTimer);
    codexTimer = window.setTimeout(watchCodex, 180);
  } catch {
    codexOpen.value = false;
  }
}

function closeCodex(callRoster = true) {
  codexOpen.value = false;
  window.clearTimeout(codexTimer);
  if (!callRoster) return;
  try {
    (frame.value?.contentWindow as CabinWindow | null)?.__forestRoster?.close?.();
  } catch {
    // The iframe may already be gone during navigation.
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && codexOpen.value) closeCodex();
}

onMounted(() => {
  pollScene();
  window.addEventListener('keydown', onKeydown);
});

function enter(path: string) {
  if (leaving.value) return;
  leaving.value = true;
  navTimer = window.setTimeout(() => router.push(path), 380);
}

onBeforeUnmount(() => {
  window.clearTimeout(pollTimer);
  window.clearTimeout(navTimer);
  window.clearTimeout(codexTimer);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="screen launch-screen" :class="{ 'is-leaving': leaving, 'is-codex-open': codexOpen }">
    <iframe
      ref="frame"
      class="launch-cinematic"
      :class="{ 'is-ready': sceneReady }"
      src="/assets/splash/forest-cabin.html?linx-launch=1"
      title="暮林山舍动态森林场景"
      :aria-hidden="codexOpen ? 'false' : 'true'"
      tabindex="-1"
      @load="pollScene"
    ></iframe>
    <div class="launch-scrim" aria-hidden="true"></div>
    <header class="launch-top"><BrandMark /><span class="launch-top-meta">NINE PLAYERS · 预女守</span></header>
    <section class="launch-copy">
      <p class="eyebrow">A FOREST CABIN · A LONG TABLE · NINE STRANGERS</p>
      <h1>暮林<br /><span>山舍</span></h1>
      <p class="launch-lede">九个旅人，一张长桌。<br />天黑之后，有人不再是人。</p>
      <div class="launch-actions"><button class="btn gold" type="button" @click="enter('/lobby')">进入山舍 <span>→</span></button><button class="btn ghost" type="button" @click="enter('/room/WALD-02')">直接入局</button></div>
      <div class="launch-rule"><span></span><p>3 狼人 · 3 村民 · 预言家 · 女巫 · 守卫</p><span></span></div>
      <p class="launch-scene-state" role="status"><i></i>{{ sceneReady ? 'SCENE READY · 山舍已点亮' : 'SUMMONING THE FOREST · 正在进入林间' }}</p>
    </section>
    <footer class="launch-foot"><span>LINX NIGHT / WALDHÜTTE</span><span>VUE 3 + TYPESCRIPT + THREE.JS</span><span>SEAT 09 / WAITING</span></footer>
    <button class="launch-codex" type="button" :disabled="!codexReady" :aria-expanded="codexOpen" aria-haspopup="dialog" @click="openCodex">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.2h5.2c1.2 0 2.1.9 2.1 2.1v11.5c0-.9-.7-1.6-1.6-1.6H4.5V5.2Z"/><path d="M19.5 5.2h-5.2c-1.2 0-2.1.9-2.1 2.1v11.5c0-.9.7-1.6 1.6-1.6h5.7V5.2Z"/><path d="M12 7.4v11.1"/></svg>
      <span class="codex-copy"><b>图册</b><small>CHARACTER CODEX</small></span>
      <span class="codex-count">10</span>
    </button>
  </div>
</template>
