<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { ROLES } from '@/game/roles'
import RoleSilhouette from '@/components/seats/RoleSilhouette.vue'
const g = useGameStore()
const f = g.flow
const me = computed(() => g.players.find(p => p.seat===g.viewerSeat))
const waiting = computed(() => !me.value?.alive ? '你已出局，可以继续旁观' : g.request ? '轮到你，请完成当前操作' : g.state?.pendingHunter ? '结算中，请等待处理完成' : '点击继续，演示下一步流程')
</script>
<template>
<section class="flow-panel">
  <div class="roomline"><span>{{f.roomId}} · {{f.host?'房主':'加入者'}} · {{g.viewerSeat}} 号</span><span :class="{danger:!f.connected}">{{f.connected?'● 已连接':'● 连接中断'}}</span></div>
  <button class="identity-toggle" @click="f.identityOpen=!f.identityOpen">{{f.identityOpen?'收起':'查看'}}我的身份 <span>仅你可见 {{f.identityOpen?'−':'＋'}}</span></button>
  <div v-if="f.identityOpen && me" class="identity"><RoleSilhouette :role="me.role"/><div><h3>{{ROLES[me.role].name}}</h3><p>{{ROLES[me.role].ability}}</p><p v-for="check in g.state?.seerChecks.filter(c=>c.by===g.viewerSeat)" :key="check.round">第 {{check.round}} 夜 · {{check.target}} 号：{{check.verdict==='wolf'?'狼人':'好人'}}</p></div></div>
  <div v-if="f.aiFailed" class="alert"><strong>AI 回合失败</strong><p>当前回合已暂停，等待房主重试。</p><button v-if="f.host" @click="f.aiFailed=false">重试 AI 回合</button></div>
  <div v-else-if="!f.connected" class="alert"><strong>连接已中断</strong><p>正在重连，已提交操作不会重复执行。</p><button @click="f.connected=true">模拟连接恢复</button></div>
  <div v-else-if="f.playback!=='idle'" class="host-playback"><strong>{{f.playback==='failed'?'主持播放失败':f.playback==='paused'?'主持播放已暂停':'主持正在播报'}}</strong><p>{{f.playback==='failed'?'保留当前播报，重试后继续。':'模拟公开播报 · 完成后进入下一步'}}</p><div class="play-line"><i :class="{paused:f.playback!=='playing'}"></i></div><div class="buttons"><button v-if="f.playback==='playing'" @click="f.playback='paused'">暂停</button><button v-else @click="f.playback='playing'">{{f.playback==='failed'?'重试播放':'继续播放'}}</button><button v-if="f.playback==='playing'" @click="g.finishPlayback()">模拟播放完成</button><button v-if="f.host" @click="g.finishPlayback()">跳过本条</button></div></div>
  <div v-else class="next"><p>{{waiting}}</p><button v-if="!g.request && g.scene!=='result'" class="gold" @click="g.advance()">继续流程 →</button></div>
  <div class="tools"><label><input v-model="f.sound" type="checkbox"/>模拟主持声音</label><button v-if="f.host && g.scene!=='result'" @click="f.endConfirm=true">提前结束</button></div>
</section>
<div v-if="f.endConfirm" class="confirm-veil" role="dialog" aria-modal="true" aria-label="提前结束对局"><section><p class="eyebrow">结束本局</p><h2 class="display">确定让议会散场？</h2><p>将停止当前流程，并生成本局结算。此操作无法撤回。</p><div class="buttons"><button @click="f.endConfirm=false">继续对局</button><button class="gold" @click="g.endGame()">确认结束</button></div></section></div>
</template>
<style scoped>
.flow-panel{padding:16px 18px;border:1px solid rgba(213,177,132,.22);background:rgba(6,10,17,.92);border-radius:14px;font-size:11px;flex-shrink:0}.roomline{display:flex;justify-content:space-between;gap:6px;color:var(--ink-3);font-size:10px}.identity-toggle{width:100%;text-align:left;padding:10px 0;color:var(--gold-text);display:flex;justify-content:space-between;border-bottom:1px solid rgba(213,177,132,.12)}.identity-toggle span{font-size:9px;color:var(--ink-3)}.identity{display:flex;gap:12px;padding:12px 0}.identity :deep(.silhouette){flex:0 0 52px;width:52px;height:52px;border-radius:50%;background:#111a26}.identity h3{font-size:16px;color:var(--gold-text)}p{color:var(--ink-2);line-height:1.8;font-size:11px}.next{padding-top:10px}.gold{background:linear-gradient(135deg,#e7cd9e,#b48a52);color:#201509}.next .gold{width:100%;margin-top:10px}button{padding:6px 10px;border:1px solid rgba(213,177,132,.25);border-radius:7px;font-size:11px}.buttons{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.tools{display:flex;align-items:center;justify-content:space-between;margin-top:12px;color:var(--ink-3);font-size:10px}.tools label{display:flex;align-items:center;gap:5px}.tools button{border:0;padding:0;color:var(--ink-3)}.alert,.host-playback{margin-top:12px}.danger,.alert strong{color:#e5a3a0}strong{font-size:12px;color:var(--gold-text)}.play-line{height:3px;background:#26303d;margin-top:10px;overflow:hidden}.play-line i{display:block;width:45%;height:100%;background:var(--gold-text);animation:play 3s linear infinite}.play-line .paused{animation-play-state:paused}.confirm-veil{position:fixed;inset:0;z-index:150;background:#03060ce8;display:grid;place-items:center;padding:20px}.confirm-veil section{max-width:420px;padding:28px;border:1px solid var(--gold-soft);border-radius:16px;background:#0b111c}.confirm-veil h2{font-size:26px;margin:10px 0}.confirm-veil p{margin-bottom:18px}@keyframes play{from{transform:translateX(-100%)}to{transform:translateX(330%)}}
</style>
