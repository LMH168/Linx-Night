<script setup lang="ts">
import { useRouter } from 'vue-router';
import BrandMark from '../components/BrandMark.vue';
const router = useRouter();
</script>

<template>
  <div class="screen launch-screen">
    <header class="launch-top"><BrandMark /><span class="launch-top-meta">NINE PLAYERS · 预女守</span></header>
    <section class="launch-copy">
      <p class="eyebrow">A FOREST CABIN · A LONG TABLE · NINE STRANGERS</p>
      <h1>暮林<br /><span>山舍</span></h1>
      <p class="launch-lede">九个旅人，一张长桌。<br />天黑之后，有人不再是人。</p>
      <div class="launch-actions"><button class="btn gold" type="button" @click="router.push('/lobby')">进入山舍 <span>→</span></button><button class="btn ghost" type="button" @click="router.push('/room/WALD-02')">直接入局</button></div>
      <div class="launch-rule"><span></span><p>3 狼人 · 3 村民 · 预言家 · 女巫 · 守卫</p><span></span></div>
    </section>
    <footer class="launch-foot"><span>LINX NIGHT / WALDHÜTTE</span><span>VUE 3 + TYPESCRIPT + THREE.JS</span><span>SEAT 09 / WAITING</span></footer>
  </div>
</template>
