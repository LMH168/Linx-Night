import { defineStore } from 'pinia'
import { computed, reactive, shallowRef } from 'vue'
import * as E from '@/game/engine'
import type { GameState, NightStep, Role } from '@/game/types'
import type { UiRequest, RequestKind, DawnPayload, TransitionKind } from '@/game/requests'
import { useSettingsStore } from './settings'
import { witchOptions } from '@/game/rules/witch'
import { stopPick } from '@/composables/useSeatPick'

export const useGameStore = defineStore('game', () => {
  const settings = useSettingsStore()
  const state = shallowRef<GameState | null>(null)
  const request = shallowRef<UiRequest | null>(null)
  const ui = reactive({ nightStage: null as NightStep | null, thinking: [] as number[], dawn: null as DawnPayload | null,
    transition: null as TransitionKind, finished: false, toast: null as {text: string; tone: 'info' | 'warn'} | null,
    hovered: null as number | null, selected: null as number | null, showRules: false, showSettings: false, logOpen: false })
  const flow = reactive({ roomId: '', nickname: '旅人', host: true, occupied: [1] as number[], humans: [1] as number[],
    preparing: false, ready: 0, prepareFailed: false, connected: true, aiFailed: false,
    playback: 'idle' as 'idle' | 'playing' | 'paused' | 'failed', sound: true, identityOpen: false,
    afterLast: 'day' as 'day' | 'night', pkIndex: 0, busy: false, deadline: 0, endConfirm: false })
  let timer: ReturnType<typeof setTimeout> | undefined
  let prepareTimer: ReturnType<typeof setTimeout> | undefined
  const viewerSeat = computed(() => state.value?.humanSeats[0] ?? (flow.host ? 1 : 2))
  const scene = computed(() => state.value?.scene ?? 'lobby')
  const round = computed(() => state.value?.round ?? 0)
  const players = computed(() => state.value?.players ?? [])
  const logs = computed(() => state.value ? E.visibleLogs(state.value, viewerSeat.value) : [])
  const aiCount = computed(() => 9 - flow.humans.length)
  const speedFactor = computed(() => 1)
  const blocked = computed(() => !flow.connected || flow.aiFailed || flow.playback !== 'idle')
  function commit(fn: (s: GameState) => GameState) { if (state.value) state.value = fn(state.value) }
  function toast(text: string, tone: 'info' | 'warn' = 'info') { ui.toast = {text, tone} }
  function clearRequest() { clearTimeout(timer); timer = undefined; request.value = null; flow.deadline = 0; stopPick() }
  function stopGame() { clearRequest(); clearTimeout(prepareTimer); ui.thinking = []; ui.dawn = null; ui.transition = null; flow.playback = 'idle'; flow.aiFailed = false; flow.endConfirm = false; flow.busy = false }
  function quitToLobby() { stopGame(); state.value = null; ui.finished = false; flow.preparing = false; flow.prepareFailed = false; flow.ready = 0; flow.connected = true }
  function leaveRoom() { quitToLobby(); flow.roomId = '' }
  function createRoom(join = false, code = '') {
    if (!flow.nickname.trim()) return toast('请先填写昵称', 'warn')
    if (join && code.trim().toUpperCase() !== 'EC1024') return toast('演示房间不存在，请使用 EC1024', 'warn')
    quitToLobby(); flow.host = !join; flow.roomId = 'EC1024'; flow.humans = join ? [1, 2] : [1]; flow.occupied = join ? [1, 2, 3, 4] : [1]
    settings.names[join ? 2 : 1] = flow.nickname.trim().slice(0, 8); ui.toast = null
  }
  function addAi(all = false) {
    if (!flow.host || flow.preparing) return
    const empty = Array.from({length: 9}, (_, i) => i + 1).filter(n => !flow.occupied.includes(n))
    flow.occupied = [...flow.occupied, ...(all ? empty : empty.slice(0, 1))].sort((a,b) => a-b)
  }
  function rename(seat: number, name: string) { if (flow.host && !flow.preparing && !flow.humans.includes(seat)) settings.setName(seat, name) }
  function prepare() {
    if (!flow.host || flow.occupied.length !== 9 || flow.preparing) return
    flow.preparing = true; flow.ready = 0; flow.prepareFailed = false; tickPreparation()
  }
  function tickPreparation() {
    clearTimeout(prepareTimer)
    if (!flow.preparing || flow.prepareFailed) return
    prepareTimer = setTimeout(() => {
      if (!flow.preparing || flow.prepareFailed) return
      flow.ready++
      if (flow.ready >= 10 - flow.humans.length) { flow.preparing = false; startGame() }
      else tickPreparation()
    }, 450)
  }
  function failPreparation() { clearTimeout(prepareTimer); flow.prepareFailed = true }
  function retryPreparation() { if (!flow.host) return; flow.prepareFailed = false; tickPreparation() }
  function cancelPreparation() { if (!flow.host) return; clearTimeout(prepareTimer); flow.preparing = false; flow.prepareFailed = false; flow.ready = 0 }
  function ask(kind: RequestKind, seat: number, payload: Record<string, unknown> = {}) {
    clearRequest(); request.value = {kind, seat, payload}
    if (['speech', 'last-words', 'hunter-shot'].includes(kind)) {
      flow.deadline = Date.now() + 30000
      timer = setTimeout(() => respond(kind === 'hunter-shot' ? null : '', true), 30000)
    }
  }
  function startGame(role: Role = 'seer') {
    stopGame(); flow.roomId = 'EC1024'; flow.occupied = [1,2,3,4,5,6,7,8,9]; flow.humans = flow.host ? [1] : [1,2]; settings.humanSeats = [flow.host ? 1 : 2]; settings.turnSeconds = 30
    let s = E.createGame({humanSeats: settings.humanSeats, names: {...settings.names}, personas: {}, seed: 1024, turnSeconds: 30})
    const roles: Role[] = ['seer','wolf','villager','witch','wolf','hunter','villager','wolf','villager']
    const own = settings.humanSeats[0]! - 1
    const wanted = roles.indexOf(role); [roles[own], roles[wanted]] = [roles[wanted]!, roles[own]!]
    s.players.forEach((p,i) => { p.role = roles[i]!; p.camp = p.role === 'wolf' ? 'wolf' : 'good'; p.isHuman = flow.humans.includes(p.seat) })
    s = E.beginDeal(s); state.value = s; ui.finished = false; flow.identityOpen = false
    ask('deal-ack', viewerSeat.value)
  }
  function restart() { quitToLobby() }
  function beginPlayback() { if (flow.sound) flow.playback = 'playing' }
  function finishPlayback() { flow.playback = 'idle' }
  function afterHunter() {
    commit(E.checkWin); if (state.value?.winner) return
    if (state.value?.scene === 'dawn') { commit(E.beginDay); flow.afterLast = 'day' }
    else flow.afterLast = 'night'
    queueLastWords()
  }
  function queueLastWords() {
    const s = state.value; if (!s) return
    const seat = s.day.lastWords[s.day.lastWordIndex]
    if (seat != null) {
      if (seat === viewerSeat.value) ask('last-words', seat, {seconds: 30})
      else { commit(x => E.giveLastWords(x, seat, '我已经出局，请结合发言和票型继续判断。')); beginPlayback() }
    } else if (flow.afterLast === 'night') commit(E.beginNight)
  }
  function openHunter() {
    const s = state.value; if (!s || s.pendingHunter == null) return
    if (s.pendingHunter === viewerSeat.value) ask('hunter-shot', s.pendingHunter, {candidates: alive(), seconds: 30})
    else { commit(x => E.hunterShoot(x, null)); afterHunter() }
  }
  function alive() { return state.value?.players.filter(p => p.alive).map(p => p.seat) ?? [] }
  function advance() {
    if (!state.value || request.value || blocked.value || flow.busy) return
    flow.busy = true
    try {
      const s = state.value
      if (s.scene === 'night') {
        ui.nightStage = s.night.step
        if (s.night.step === 'wolf') {
          const wolves = s.players.filter(p => p.alive && p.role === 'wolf')
          const candidates = s.players.filter(p => p.alive && p.role !== 'wolf').map(p => p.seat)
          const me = wolves.find(p => p.seat === viewerSeat.value)
          if (me && s.night.wolfVotes[me.seat] == null) { ask('wolf-target', me.seat, {candidates, teammates: wolves.filter(p => p.seat !== me.seat).map(p => p.seat)}); return }
          const target = s.night.wolfTarget ?? candidates[candidates.length - 1]!
          for (const wolf of wolves) if (state.value!.night.wolfVotes[wolf.seat] == null) commit(x => E.wolfKill(x, wolf.seat, target))
          commit(x => E.setNightStep(x, 'seer'))
        } else if (s.night.step === 'seer') {
          const seer = s.players.find(p => p.alive && p.role === 'seer')
          if (seer?.seat === viewerSeat.value && !s.night.seerCheck) { ask('seer-check', seer.seat, {candidates: alive()}); return }
          if (seer && !s.night.seerCheck) commit(x => E.seerCheck(x, alive().find(n => n !== seer.seat)!))
          commit(x => E.setNightStep(x, 'witch'))
        } else {
          const witch = s.players.find(p => p.alive && p.role === 'witch')
          if (witch?.seat === viewerSeat.value && !s.night.witchActed) { ask('witch-action', witch.seat, {...witchOptions(s, witch.seat), candidates: alive()}); return }
          if (witch && !s.night.witchActed) commit(x => E.witchAct(x, witch.seat, {}))
          commit(x => E.resolveNight(x, () => 0.5)); ui.nightStage = null; beginPlayback()
        }
      } else if (s.scene === 'dawn') {
        if (s.pendingHunter != null) openHunter()
        else afterHunter()
      } else if (s.scene === 'day') {
        if (s.day.lastWordIndex < s.day.lastWords.length) { queueLastWords(); return }
        if (s.day.current == null) { commit(x => E.beginVote(x, 1)); return }
        const seat = s.day.current
        if (seat === viewerSeat.value) ask('speech', seat, {seconds: 30})
        else { commit(x => E.speak(x, seat, '先听完大家的判断，再结合查验声明和投票决定。')); commit(E.nextSpeaker); beginPlayback() }
      } else if (s.scene === 'pk') {
        const seat = s.vote.pk[flow.pkIndex]
        if (seat == null) { commit(x => E.beginVote(x, 2)); return }
        if (seat === viewerSeat.value) ask('speech', seat, {seconds: 30, pk: true})
        else { commit(x => E.speak(x, seat, '我的判断没有改变，请台下玩家结合前面的发言投票。', [], 'pk')); flow.pkIndex++; beginPlayback() }
      } else if (s.scene === 'vote') {
        if (s.vote.phase === 'done') {
          if (s.pendingHunter != null) { openHunter(); return }
          commit(E.checkWin); if (state.value?.winner) return
          flow.afterLast = 'night'; queueLastWords(); return
        }
        const voters = s.players.filter(p => p.alive && (s.vote.round === 1 || !s.vote.pk.includes(p.seat)))
        const candidates = s.vote.round === 2 ? s.vote.pk : alive()
        const me = voters.find(p => p.seat === viewerSeat.value)
        if (me && !(me.seat in s.vote.ballots)) { ask('vote', me.seat, {candidates, round: s.vote.round, pk: s.vote.pk}); return }
        // shortcut: 固定模拟票型用于评审，接入后以服务端投票结果替换。
        const target = candidates.find(n => state.value!.players[n-1]?.role === 'wolf') ?? candidates[0]!
        for (const p of voters) if (!(p.seat in state.value!.vote.ballots)) commit(x => E.castVote(x, p.seat, target))
        commit(E.resolveVote); flow.pkIndex = 0; beginPlayback()
      }
    } catch (error) { toast(error instanceof Error ? error.message : '操作失败', 'warn') }
    finally { flow.busy = false }
  }
  function respond(value: unknown, expired = false) {
    const q = request.value
    if (!q || (!expired && blocked.value)) return
    clearRequest()
    try {
      if (q.kind === 'deal-ack') { commit(x => E.ackDeal(x, q.seat!)); beginPlayback() }
      else if (q.kind === 'wolf-target') commit(x => E.wolfKill(x, q.seat!, Number(value)))
      else if (q.kind === 'seer-check') { commit(x => E.seerCheck(x, Number(value))); ask('seer-result', q.seat!, {target: Number(value), verdict: state.value!.night.seerCheck!.camp}); return }
      else if (q.kind === 'seer-result') commit(x => E.setNightStep(x, 'witch'))
      else if (q.kind === 'witch-action') commit(x => E.witchAct(x, q.seat!, value as {save?: boolean; poison?: number | null}))
      else if (q.kind === 'hunter-shot') { commit(x => E.hunterShoot(x, value == null ? null : Number(value))); afterHunter(); return }
      else if (q.kind === 'vote') commit(x => E.castVote(x, q.seat!, Number(value)))
      else if (q.kind === 'last-words') { commit(x => E.giveLastWords(x, q.seat!, String(value || (expired ? '（遗言超时）' : '（放弃遗言）')).slice(0,200))); beginPlayback() }
      else if (q.kind === 'speech') { commit(x => E.speak(x, q.seat!, String(value || '（发言结束）').slice(0,200), [], q.payload.pk ? 'pk' : 'day')); if (q.payload.pk) flow.pkIndex++; else commit(E.nextSpeaker); beginPlayback() }
    } catch (error) { toast(error instanceof Error ? error.message : '提交失败', 'warn'); ask(q.kind, q.seat!, q.payload) }
  }
  function endGame() {
    if (!flow.host || !flow.endConfirm || !state.value) return
    stopGame(); commit(x => ({...x, scene: 'result', endReason: '房主提前结束本局', players: x.players.map(p => ({...p, revealed: true}))})); ui.finished = true
  }
  function preview(key: string, role: Role = 'seer') {
    quitToLobby(); flow.roomId = 'EC1024'; flow.occupied = [1,2,3,4,5,6,7,8,9]; flow.humans = flow.host ? [1] : [1,2]
    if (key === 'preparation') { flow.preparing = true; flow.ready = 4; flow.prepareFailed = true; return }
    startGame(role); clearRequest()
    if (key === 'deal') { ask('deal-ack', viewerSeat.value); return }
    commit(x => E.ackDeal(x, viewerSeat.value)); flow.playback = 'idle'
    if (key === 'night') { const p = state.value!.players[viewerSeat.value-1]!; commit(x => E.setNightStep(x, p.role === 'witch' ? 'witch' : p.role === 'seer' ? 'seer' : 'wolf')); if (p.role === 'witch') commit(x => ({...x, night: {...x.night, wolfTarget: 9}})); advance(); return }
    commit(x => E.resolveNight(x, () => 0.5)); commit(E.beginDay)
    if (key === 'hunter' || key === 'lastwords') {
      commit(x => { const p = x.players[viewerSeat.value-1]!; if (key === 'hunter') { const other = x.players.find(v => v.role === 'hunter')!; other.role = p.role; other.camp = p.camp; p.role = 'hunter'; p.camp = 'good' } p.alive = false; p.deathCause = 'vote'; p.deathRound = 1; x.day.queue = x.day.queue.filter(n => n !== p.seat); x.day.current = x.day.queue[0] ?? null; x.day.lastWords = [p.seat]; x.day.lastWordIndex = 0; x.pendingHunter = key === 'hunter' ? p.seat : null; return {...x} })
      flow.afterLast = 'day'; if (key === 'hunter') openHunter(); else queueLastWords(); return
    }
    if (key === 'pk') { commit(x => ({...x, scene: 'pk', vote: {...x.vote, pk: [viewerSeat.value, 3], tied: [viewerSeat.value, 3]}})); flow.pkIndex = 0 }
    if (key === 'vote') commit(x => E.beginVote(x, 1))
    if (key === 'result') { endPreview(); return }
    if (key === 'ai') flow.aiFailed = true
    if (key === 'offline') flow.connected = false
    if (key === 'playback') flow.playback = 'failed'
    if (['day','vote','pk'].includes(key)) advance()
  }
  function endPreview() { commit(x => ({...x, scene: 'result', winner: 'good', endReason: '全部狼人出局 · 好人阵营获胜', players: x.players.map(p => ({...p, revealed: true}))})) }
  function selfDestruct(_seat: number) { toast('本项目无自爆规则', 'warn') }
  return {state, request, ui, flow, scene, round, players, logs, viewerSeat, aiCount, speedFactor, blocked, commit, toast,
    respond, startGame, stopGame, restart, quitToLobby, leaveRoom, createRoom, addAi, rename, prepare, failPreparation, retryPreparation,
    cancelPreparation, advance, finishPlayback, endGame, preview, selfDestruct, isHumanSeat: (n: number) => flow.humans.includes(n)}
})
