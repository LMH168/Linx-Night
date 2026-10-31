<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandMark from '../components/BrandMark.vue';

type CabinWindow = Window & { __forestCabin?: { hideUi?: () => void } };

const router = useRouter();
const frame = ref<HTMLIFrameElement | null>(null);
const sceneReady = ref(false);
const leaving = ref(false);
let pollTimer: number | undefined;
let navTimer: number | undefined;

function pollScene() {
  window.clearTimeout(pollTimer);
  if (sceneReady.value) return;
  const started = performance.now();
  const check = () => {
    let cabin: CabinWindow['__forestCabin'];
    try {
      cabin = (frame.value?.contentWindow as CabinWindow | null)?.__forestCabin;
    } catch {
      // A cross-origin iframe cannot expose the scene API; it still plays the
      // animation, so reveal it rather than leaving the launch screen dark.
      sceneReady.value = true;
      return;
    }
    if (cabin) {
      cabin.hideUi?.();
      sceneReady.value = true;
      return;
    }
    if (performance.now() - started > 12000) {
      sceneReady.value = true;
      return;
    }
    pollTimer = window.setTimeout(check, 120);
  };
  check();
}

onMounted(pollScene);

function enter(path: string) {
  if (leaving.value) return;
  leaving.value = true;
  navTimer = window.setTimeout(() => router.push(path), 380);
}

onBeforeUnmount(() => {
  window.clearTimeout(pollTimer);
  window.clearTimeout(navTimer);
});
</script>

<template>
  <div class="screen launch-screen" :class="{ 'is-leaving': leaving }">
    <iframe
      ref="frame"
      class="launch-cinematic"
      :class="{ 'is-ready': sceneReady }"
      src="/assets/splash/forest-cabin.html?linx-launch=1"
      title="暮林山舍动态森林场景"
      aria-hidden="true"
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
  </div>
</template>
