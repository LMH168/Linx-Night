import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {createPinia,setActivePinia} from 'pinia'
import {useGameStore} from '@/stores/game'
import {roleVisibleTo} from '@/game/selectors'
import type {Role} from '@/game/types'
beforeEach(()=>{setActivePinia(createPinia());vi.useFakeTimers()})
afterEach(()=>vi.useRealTimers())
describe('原型流程',()=>{
 it('未满员不能准备，加入者不能添加 AI 或结束对局',()=>{
   const g=useGameStore();g.createRoom();g.prepare();expect(g.flow.preparing).toBe(false)
   g.addAi(true);expect(g.flow.occupied).toHaveLength(9);g.prepare();expect(g.flow.preparing).toBe(true)
   g.cancelPreparation();vi.runAllTimers();expect(g.state).toBeNull()
   g.createRoom(true,'EC1024');const n=g.flow.occupied.length;g.addAi(true);expect(g.flow.occupied).toHaveLength(n)
   g.preview('day');g.flow.endConfirm=true;g.endGame();expect(g.scene).not.toBe('result')
 })
 it('全部准备后发牌，失败可重试，取消后不迟到开局',()=>{
   const g=useGameStore();g.createRoom();g.addAi(true);g.prepare();vi.advanceTimersByTime(900);g.failPreparation()
   vi.advanceTimersByTime(10000);expect(g.state).toBeNull();expect(g.flow.ready).toBe(2)
   g.retryPreparation();vi.advanceTimersByTime(5000);expect(g.request?.kind).toBe('deal-ack')
   g.quitToLobby();vi.runAllTimers();expect(g.state).toBeNull()
 })
 it.each<Role>(['wolf','seer','witch','hunter','villager'])('%s 可以从发牌走到正常结算',role=>{
   const g=useGameStore();g.flow.sound=false;g.startGame(role)
   for(let i=0;i<500 && g.scene!=='result';i++){
     const q=g.request
     if(q){
       const candidates=q.payload.candidates as number[] | undefined
       const value=q.kind==='witch-action'?{}:q.kind==='hunter-shot'?null:q.kind==='speech'||q.kind==='last-words'?'我的判断':candidates?.[0]??true
       g.respond(value)
     }else g.advance()
   }
   expect(g.ui.toast).toBeNull();expect(g.scene).toBe('result');expect(g.state?.winner).toBeTruthy()
 })
 it('播放完成前不推进，停止和重试不重复写入发言',()=>{
   const g=useGameStore();g.preview('day');g.respond('我的判断');const count=g.state!.speeches.length
   expect(g.flow.playback).toBe('playing');g.advance();expect(g.state!.speeches).toHaveLength(count)
   g.flow.playback='failed';g.advance();expect(g.state!.speeches).toHaveLength(count)
   g.flow.playback='playing';g.finishPlayback();g.advance();expect(g.state!.speeches.length).toBe(count+1)
 })
 it('猎人 30 秒到期仅关闭一次，随后处理遗言',()=>{
   const g=useGameStore();g.preview('hunter');expect(g.request?.kind).toBe('hunter-shot')
   vi.advanceTimersByTime(30000);expect(g.state!.pendingHunter).toBeNull();expect(g.request?.kind).toBe('last-words')
   g.respond('最后的判断');expect(g.state!.players[0]!.lastWords).toBe('最后的判断')
   g.respond('重复提交');expect(g.state!.speeches.filter(x=>x.kind==='lastwords')).toHaveLength(1)
 })
 it('场景切换清除旧技能、倒计时与录入，旧超时不推进新场景',()=>{
   const g=useGameStore();g.preview('hunter');g.preview('vote');const before=JSON.stringify(g.state)
   vi.advanceTimersByTime(30000);expect(JSON.stringify(g.state)).toBe(before);expect(g.request?.kind).toBe('vote')
 })
 it('死亡不翻牌，查验与放弃开枪不写入公开记录',()=>{
   const g=useGameStore();g.preview('hunter');g.respond(null)
   expect(g.logs.some(l=>l.text.includes('放弃了开枪'))).toBe(true)
   expect(g.state!.log.filter(l=>l.visibility==='public').some(l=>l.text.includes('不开枪')||l.text.includes('放弃了开枪'))).toBe(false)
   expect(roleVisibleTo(g.state!,1,3)).toBe(false)
 })
 it('断线期间不能提交，恢复后只接受一次投票',()=>{
   const g=useGameStore();g.preview('vote');g.flow.connected=false;g.respond(2);expect(g.state!.vote.ballots[1]).toBeUndefined()
   g.flow.connected=true;g.respond(2);g.respond(3);expect(g.state!.vote.ballots[1]).toBe(2)
 })
 it('房主提前结束不虚构胜方',()=>{
   const g=useGameStore();g.preview('day');g.flow.endConfirm=true;g.endGame();expect(g.scene).toBe('result');expect(g.state!.winner).toBeNull();expect(g.request).toBeNull()
 })
})
