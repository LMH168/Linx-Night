<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { ROLES } from '@/game/roles'
import RoleSilhouette from '@/components/seats/RoleSilhouette.vue'
const game = useGameStore()
const settings = useSettingsStore()
const code = ref('EC1024')
const f = game.flow
const controllers = computed(() => [...f.occupied.filter(n => !f.humans.includes(n)).map(n => `${n} 号 · ${settings.names[n]}`), '独立 AI 主持'])
</script>
<template>
  <main class="lobby">
    <header class="mast"><span>☾ &nbsp; ECLIPSE COUNCIL</span><span>九人预巫猎 · 本地交互原型</span></header>
    <div class="layout">
      <section class="intro">
        <p class="eyebrow">月落之前，辨明真相</p>
        <h1 class="display">暗林月夜<span>月蚀议会</span></h1>
        <p class="story">九个席位，一片暗林。<br>让每一次发言，都成为照亮夜色的线索。</p>
        <div class="roles"><article v-for="role in ROLES" :key="role.role"><RoleSilhouette :role="role.role" :tint="[role.accent,role.accent2]"/><span>{{role.name}}</span></article></div>
        <p class="board">3 狼 · 预言家 · 女巫 · 猎人 · 3 民<br>暗牌 / 屠边 / 无警长 / 无自爆</p>
        <div v-if="!f.roomId" class="entry">
          <label>你的昵称<input v-model="f.nickname" maxlength="8" placeholder="为今夜留下名字" /></label>
          <button class="gold" @click="game.createRoom()">创建房间 <span>→</span></button>
          <div class="join"><label>房间号<input v-model="code" maxlength="12" aria-label="房间号"/></label><button @click="game.createRoom(true,code)">加入房间</button></div>
          <p class="muted">演示房间号 EC1024 · 加入后以普通玩家视角浏览</p>
        </div>
        <div v-else class="room-info">
          <p class="eyebrow">{{f.host?'你是房主':'你是加入者'}} · {{f.nickname}}</p>
          <h2 class="display">房间 {{f.roomId}}</h2>
          <p class="muted">{{f.occupied.length}} / 9 已入座 · 主持不占玩家席位</p>
          <div v-if="f.host && !f.preparing" class="buttons"><button @click="game.addAi()" :disabled="f.occupied.length===9">添加一名 AI</button><button @click="game.addAi(true)" :disabled="f.occupied.length===9">补齐 AI 空位</button></div>
          <button v-if="f.host && !f.preparing" class="gold" :disabled="f.occupied.length!==9" @click="game.prepare()">{{f.occupied.length===9?'开始准备 →':'等待九席满员'}}</button>
          <p v-if="!f.host" class="waiting">九席满员后，由房主开始游戏。</p>
          <button class="text-button" @click="game.leaveRoom()">离开房间</button>
        </div>
        <p v-if="game.ui.toast" class="error" role="status">{{game.ui.toast.text}}</p>
        <button class="text-button" @click="game.ui.showRules=true">查看本局规则 ↗</button>
      </section>
      <section class="table-zone">
        <section v-if="f.preparing" class="preparation">
          <p class="eyebrow">入夜前的准备</p><h2 class="display">{{f.prepareFailed?'连接暂时中断':'正在召集议会'}}</h2><p class="muted">{{f.ready}} / {{controllers.length}} 已就绪 · 全部就绪后才分配身份</p>
          <div v-for="(name,i) in controllers" :key="name" class="controller"><span>{{name}}</span><b :class="{error:f.prepareFailed && i===f.ready}">{{i<f.ready?'已就绪':f.prepareFailed && i===f.ready?'连接失败':i===f.ready?'正在连接…':'等待连接'}}</b></div>
          <p v-if="f.prepareFailed" class="error">准备未完成，房间和席位已保留，不会自动替换 AI。</p>
          <div class="buttons"><button v-if="f.prepareFailed && f.host" class="gold" @click="game.retryPreparation()">重试连接</button><button v-if="f.host" @click="game.cancelPreparation()">取消准备</button></div>
        </section>
      </section>
    </div>
    <footer>本地模拟数据 · 连接与语音仅作流程演示</footer>
  </main>
</template>
<style scoped>
.lobby{height:100dvh;overflow:auto;padding:26px 5vw 20px;background:linear-gradient(102deg,rgba(4,7,12,.86) 0%,rgba(4,7,12,.66) 24%,rgba(4,7,12,.34) 44%,rgba(4,7,12,.08) 60%,transparent 72%)}
.mast{display:flex;justify-content:space-between;gap:16px;font-size:10px;letter-spacing:.18em;color:var(--gold-text);padding-bottom:22px;border-bottom:1px solid rgba(213,177,132,.15)}
.layout{max-width:1380px;min-height:calc(100dvh - 145px);margin:auto;display:grid;grid-template-columns: minmax(300px,.85fr) minmax(450px,1.15fr);align-items:center;gap:6vw;padding:36px 0}
h1{font-size:clamp(42px,5vw,76px);line-height:1.2;letter-spacing:.15em;margin:15px 0 20px}h1 span{display:block;font-size:12px;letter-spacing:.7em;color:var(--gold-text);margin-top:12px}.story{color:var(--ink-2);font-size:13px;line-height:2}.roles{display:flex;gap:14px;margin-top:24px}.roles article{display:grid;gap:7px;justify-items:center;color:var(--ink-2);font-size:11px}.roles article :deep(.silhouette){width:55px;height:55px;border-radius:50%;background:#111a26}.board{font-size:11px;line-height:1.9;color:var(--ink-3);margin:18px 0}.entry,.room-info{max-width:365px;display:grid;gap:12px}.room-info h2{font-size:28px;letter-spacing:.08em}label{display:grid;gap:5px;font-size:10px;color:var(--ink-3)}input{min-width:0;width:100%;border:1px solid rgba(213,177,132,.22);border-radius:8px;background:rgba(5,8,14,.7);padding:10px 12px;color:var(--ink);outline-offset:2px}button{padding:10px 15px;border:1px solid rgba(213,177,132,.25);border-radius:8px;font-size:12px}button:hover{border-color:var(--gold-text)}button:disabled{opacity:.4}.gold{background:linear-gradient(135deg,#ead1a4,#b38c55);color:#20170b;border:0;display:flex;justify-content:space-between}.join{display:grid;grid-template-columns:1fr auto;align-items:end;gap:10px}.muted,.waiting{font-size:11px;color:var(--ink-3);line-height:1.8}.buttons{display:flex;gap:8px;flex-wrap:wrap}.text-button{padding:8px 0;border:0;color:var(--gold-text);text-align:left;font-size:11px}.error{color:#e7a5a0;font-size:12px}.table-zone{display:grid;justify-items:center;gap:34px}.table-zone:empty{display:none}.preparation{width:min(100%,460px);padding:26px;border:1px solid rgba(213,177,132,.25);border-radius:18px;background:rgba(8,12,20,.88)}.preparation h2{font-size:28px;margin:9px 0}.controller{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(213,177,132,.08);font-size:11px}.controller b{font-weight:400;color:var(--gold-text)}.preparation .buttons{margin-top:18px}footer{text-align:center;font-size:10px;letter-spacing:.18em;color:var(--ink-3)}
@media(max-width:900px){.layout{grid-template-columns:1fr;gap:65px;justify-items:center}.intro{width:min(100%,480px)}.table-zone{width:100%;padding:25px 0}.entry,.room-info{max-width:none}.mast{font-size:9px}.roles{justify-content:space-between}.lobby{padding:20px 6vw}.layout{padding-top:24px}}
@media(max-width:450px){.mast span:last-child{max-width:120px;text-align:right}h1{font-size:43px}.roles article :deep(.silhouette){width:46px;height:46px}}
</style>
