/**
 * 导演：把纯函数引擎串成一局完整对局的异步剧本。
 * 所有「等待」集中在这里；引擎本身保持同步、可测。
 */
import {
  ackDeal,
  beginDay,
  beginDeal,
  beginNight,
  beginVote,
  castVote,
  checkWin,
  finalizeWolfTarget,
  giveLastWords,
  hunterShoot,
  nextSpeaker,
  resolveNight,
  resolveVote,
  revealNextBallot,
  seerCheck,
  selfDestruct as engineSelfDestruct,
  setNightStep,
  speak,
  wolfKill,
  witchAct,
} from './engine'
import { aliveSeatsOf, playerAt } from './selectors'
import { witchOptions } from './rules/witch'
import type { GameState, Player } from './types'
import type { DirectorHost } from './requests'
import type { AiRoster } from '../ai'
import { buildAiView } from '../ai/view'
import type { HostCue } from '../ai/types'

export class InterruptError extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'InterruptError'
  }
}

export class Director {
  private cancelled = false

  constructor(
    private readonly host: DirectorHost,
    private readonly roster: AiRoster,
  ) {}

  stop(): void {
    this.cancelled = true
  }

  async start(): Promise<void> {
    try {
      await this.sleep(360)
      this.commit((s) => beginDeal(s))
      await this.say({ kind: 'deal' })
      await this.dealLoop()
      await this.runRounds()
    } catch (error) {
      this.handle(error)
    }
  }

  // ------------------------------------------------------------- 基础设施

  private get state(): GameState {
    return this.host.getState()
  }

  private commit(fn: (state: GameState) => GameState): void {
    this.host.commit(fn as (state: GameState) => GameState)
  }

  private ensure(): void {
    if (this.cancelled) throw new InterruptError('cancelled')
  }

  private async sleep(ms: number): Promise<void> {
    const factor = this.host.speedFactor()
    const wait = Math.max(0, ms * factor)
    if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait))
    this.ensure()
  }

  private async say(cue: HostCue): Promise<void> {
    const text = await this.roster.host.narrate(cue)
    this.ensure()
    this.host.narrate(text)
  }

  private handle(error: unknown): void {
    if (error instanceof InterruptError) return
    if (error instanceof Error) {
      this.host.narrate(`（对局中断：${error.message}）`, 'system')
      return
    }
    this.host.narrate('（对局中断）', 'system')
  }

  /**
   * 「移交设备」遮罩：只有在同屏多人（热座）时才需要，
   * 单人局直接进入私密环节，避免每次行动都多一次点击。
   */
  private async ensureDevice(seat: number, reason: string): Promise<void> {
    if (this.state.humanSeats.length <= 1) return
    await this.host.ask('handoff', { seat, reason })
  }

  private agentOf(seat: number) {
    const agent = this.roster.agents.get(seat)
    if (!agent) throw new Error(`${seat} 号没有可用的 AI 代理`)
    return agent
  }

  // ------------------------------------------------------------- 发牌

  private async dealLoop(): Promise<void> {
    for (const seat of this.state.humanSeats) {
      this.ensure()
      await this.ensureDevice(seat, '请查看你的身份牌')
      await this.host.ask('deal-ack', { seat })
      this.commit((s) => ackDeal(s, seat))
      await this.sleep(180)
    }
  }

  // ------------------------------------------------------------- 主循环

  private async runRounds(): Promise<void> {
    while (!this.cancelled) {
      this.ensure()
      if (this.state.winner) return

      await this.night()
      await this.dawn()
      if (this.state.winner) return

      const outcome = await this.day()
      if (this.state.winner) return

      if (outcome === 'selfdestruct') {
        this.commit((s) => beginNight(s))
        continue
      }

      await this.vote()
      if (this.state.winner) return

      this.commit((s) => beginNight(s))
      await this.sleep(260)
    }
  }

  // ------------------------------------------------------------- 夜晚

  private async night(): Promise<void> {
    this.host.setDawn(null)
    this.host.setTransition('dusk')
    await this.sleep(760)
    this.host.setTransition(null)

    await this.say({ kind: 'night-fall', round: this.state.round })
    await this.wolfStep()
    await this.seerStep()
    await this.witchStep()

    this.commit((s) => resolveNight(s, Math.random))
    this.host.setNightStage(null)
  }

  private async wolfStep(): Promise<void> {
    this.commit((s) => setNightStep(s, 'wolf'))
    this.host.setNightStage('wolf')
    const wolves = this.state.players.filter((p) => p.role === 'wolf' && p.alive)
    if (!wolves.length) return

    await this.say({ kind: 'wolves-wake' })
    for (const wolf of wolves) {
      this.ensure()
      const candidates = aliveSeatsOf(this.state).filter((s) => s !== wolf.seat)
      if (wolf.isHuman) {
        await this.ensureDevice(wolf.seat, '狼人行动')
        const picked = await this.host.ask('wolf-target', {
          seat: wolf.seat,
          candidates,
          teammates: wolves.filter((w) => w.seat !== wolf.seat).map((w) => w.seat),
        })
        const target = Number(picked)
        if (Number.isInteger(target) && candidates.includes(target)) {
          this.commit((s) => wolfKill(s, wolf.seat, target))
        }
      } else {
        const view = buildAiView(this.state, wolf.seat)
        const target = await this.agentOf(wolf.seat).decideNightKill(view, candidates)
        this.host.setThinking(wolf.seat, true)
        await this.sleep(820)
        this.host.setThinking(wolf.seat, false)
        if (target != null && candidates.includes(target)) {
          this.commit((s) => wolfKill(s, wolf.seat, target))
        }
      }
    }

    this.commit((s) => finalizeWolfTarget(s, Math.random))
    await this.say({ kind: 'wolves-close' })
    await this.sleep(420)
  }

  private async seerStep(): Promise<void> {
    this.commit((s) => setNightStep(s, 'seer'))
    this.host.setNightStage('seer')
    const seer = this.state.players.find((p) => p.role === 'seer' && p.alive)
    if (!seer) return

    await this.say({ kind: 'seer-wake' })
    const candidates = aliveSeatsOf(this.state).filter((s) => s !== seer.seat)

    if (seer.isHuman) {
      await this.ensureDevice(seer.seat, '预言家行动')
      const picked = await this.host.ask('seer-check', {
        seat: seer.seat,
        candidates,
      })
      const target = Number(picked)
      if (Number.isInteger(target) && candidates.includes(target)) {
        this.commit((s) => seerCheck(s, target))
        const verdict = playerAt(this.state, target)!.camp === 'wolf' ? 'wolf' : 'good'
        await this.host.ask('seer-result', { seat: seer.seat, target, verdict })
      }
    } else {
      const view = buildAiView(this.state, seer.seat)
      const target = await this.agentOf(seer.seat).decideSeerCheck(view, candidates)
      this.host.setThinking(seer.seat, true)
      await this.sleep(760)
      this.host.setThinking(seer.seat, false)
      if (candidates.includes(target)) {
        this.commit((s) => seerCheck(s, target))
      }
    }
    await this.sleep(320)
  }

  private async witchStep(): Promise<void> {
    this.commit((s) => setNightStep(s, 'witch'))
    this.host.setNightStage('witch')
    const witch = this.state.players.find((p) => p.role === 'witch' && p.alive)
    if (!witch) return

    await this.say({ kind: 'witch-wake' })
    const options = witchOptions(this.state, witch.seat)

    if (witch.isHuman) {
      await this.ensureDevice(witch.seat, '女巫行动')
      const raw = await this.host.ask('witch-action', {
        seat: witch.seat,
        victim: options.victim,
        canSave: options.canSave,
        canPoison: options.canPoison,
        saveBlockedReason: options.saveBlockedReason,
        poisonBlockedReason: options.poisonBlockedReason,
        candidates: aliveSeatsOf(this.state).filter((s) => s !== witch.seat),
      })
      const action = (raw ?? {}) as { save?: boolean; poison?: number | null }
      this.commit((s) =>
        witchAct(s, witch.seat, {
          save: action.save === true && options.canSave,
          poison:
            action.poison != null && options.canPoison ? Number(action.poison) : null,
        }),
      )
    } else {
      const view = buildAiView(this.state, witch.seat)
      const plan = await this.agentOf(witch.seat).decideWitch(view)
      this.host.setThinking(witch.seat, true)
      await this.sleep(760)
      this.host.setThinking(witch.seat, false)
      const save = plan.save && options.canSave
      const poison =
        plan.poison != null && options.canPoison && plan.poison !== witch.seat
          ? plan.poison
          : null
      this.commit((s) => witchAct(s, witch.seat, { save, poison: save ? null : poison }))
    }
    await this.sleep(320)
  }

  // ------------------------------------------------------------- 天亮

  private async dawn(): Promise<void> {
    const round = this.state.round
    const deaths = this.state.dawn.deaths.slice()
    const peace = this.state.dawn.peaceNight

    this.host.setTransition('dawn')
    await this.sleep(1000)
    this.host.setTransition(null)

    const text = await this.roster.host.narrate({ kind: 'dawn', round, deaths, peace })
    this.host.narrate(text)
    this.host.setDawn({ deaths, peace, text, round })
    await this.sleep(1900)

    if (this.state.pendingHunter != null) {
      await this.hunterShot()
    }

    this.commit((s) => checkWin(s))
    if (this.state.winner) {
      this.host.setDawn(null)
      await this.finish()
      return
    }
  }

  private async hunterShot(): Promise<void> {
    const seat = this.state.pendingHunter
    if (seat == null) return
    const hunter = playerAt(this.state, seat)
    if (!hunter) return
    const candidates = aliveSeatsOf(this.state)

    await this.say({ kind: 'hunter-wake', seat })

    if (hunter.isHuman) {
      await this.ensureDevice(seat, '猎人开枪')
      const picked = await this.host.ask('hunter-shot', { seat, candidates })
      const target = picked == null ? null : Number(picked)
      this.commit((s) =>
        hunterShoot(s, target != null && candidates.includes(target) ? target : null),
      )
    } else {
      const view = buildAiView(this.state, seat)
      const target = await this.agentOf(seat).decideHunterShot(view, candidates)
      this.host.setThinking(seat, true)
      await this.sleep(900)
      this.host.setThinking(seat, false)
      this.commit((s) =>
        hunterShoot(s, target != null && candidates.includes(target) ? target : null),
      )
    }
    await this.sleep(420)
  }

  // ------------------------------------------------------------- 白天

  private async day(): Promise<'done' | 'selfdestruct'> {
    this.host.setDawn(null)
    this.commit((s) => beginDay(s))
    await this.sleep(360)

    let outcome: 'done' | 'selfdestruct' = 'done'
    try {
      await this.lastWordsQueue()
      await this.speechQueue()
    } catch (error) {
      if (
        error instanceof InterruptError &&
        !this.cancelled &&
        this.state.day.endReason === 'selfdestruct'
      ) {
        outcome = 'selfdestruct'
      } else {
        throw error
      }
    }

    if (outcome === 'selfdestruct') {
      await this.say({ kind: 'selfdestruct', seat: this.state.day.lastWords[0] ?? 0 })
      await this.lastWordsQueue()
      this.commit((s) => checkWin(s))
      if (this.state.winner) await this.finish()
      return outcome
    }

    this.commit((s) => checkWin(s))
    if (this.state.winner) await this.finish()
    return outcome
  }

  private async lastWordsQueue(): Promise<void> {
    while (this.state.day.lastWordIndex < this.state.day.lastWords.length) {
      this.ensure()
      const seat = this.state.day.lastWords[this.state.day.lastWordIndex]
      if (seat == null) break
      await this.lastWordsFor(seat)
    }
  }

  private async lastWordsFor(seat: number): Promise<void> {
    const player = playerAt(this.state, seat)
    if (!player) return
    if (player.isHuman) {
      await this.ensureDevice(seat, '留下遗言')
      const text = await this.host.ask('last-words', {
        seat,
        seconds: this.state.turnSeconds,
      })
      const content = typeof text === 'string' && text.trim() ? text.trim() : '（沉默）'
      this.commit((s) => giveLastWords(s, seat, content))
      await this.sleep(240)
    } else {
      const view = buildAiView(this.state, seat)
      this.host.setThinking(seat, true)
      const content = await this.agentOf(seat).lastWords(view)
      await this.sleep(820)
      this.host.setThinking(seat, false)
      this.commit((s) => giveLastWords(s, seat, content))
      await this.sleep(900)
    }
  }

  private async speechQueue(): Promise<void> {
    while (true) {
      this.ensure()
      const current = this.state.day.current
      if (current == null) return
      if (this.state.day.ended) return
      await this.say({ kind: 'speech-turn', seat: current })
      await this.speakFor(current)
      if (this.state.day.ended) return
      this.commit((s) => nextSpeaker(s))
    }
  }

  private async speakFor(seat: number): Promise<void> {
    const player = playerAt(this.state, seat)
    if (!player) return

    if (player.isHuman) {
      await this.ensureDevice(seat, '轮到你发言')
      const raw = await this.host.ask('speech', {
        seat,
        seconds: this.state.turnSeconds,
        round: this.state.round,
      })
      const text = typeof raw === 'string' ? raw.trim() : ''
      this.commit((s) =>
        speak(s, seat, text || '（摇头，把发言权让给下一位）', [], 'day'),
      )
      await this.sleep(240)
      return
    }

    const view = buildAiView(this.state, seat)
    this.host.setThinking(seat, true)
    const speech = await this.agentOf(seat).speak(view, 'day')
    await this.sleep(760)
    this.host.setThinking(seat, false)
    this.commit((s) => speak(s, seat, speech.text, speech.claims, 'day'))
    const reading = Math.min(3200, 900 + speech.text.length * 55)
    await this.sleep(reading)
  }

  // ------------------------------------------------------------- 投票

  private async vote(): Promise<void> {
    const first = await this.voteRound(1)
    if (first === 'pk') {
      await this.pkSpeeches()
      await this.voteRound(2)
    }
    await this.settleVote()
  }

  private async voteRound(round: 1 | 2): Promise<'pk' | 'done'> {
    this.commit((s) => beginVote(s, round))
    await this.say({ kind: 'vote-open', round })
    await this.sleep(320)

    const alive: Player[] = this.state.players.filter((p) => p.alive)
    for (const player of alive) {
      this.ensure()
      const candidates = alive.filter((p) => p.seat !== player.seat).map((p) => p.seat)
      if (player.isHuman) {
        await this.ensureDevice(player.seat, '放逐投票')
        const picked = await this.host.ask('vote', {
          seat: player.seat,
          candidates,
          round,
          pk: this.state.vote.pk,
        })
        const target = picked == null || picked === '' ? null : Number(picked)
        this.commit((s) =>
          castVote(s, player.seat, target != null && candidates.includes(target) ? target : null),
        )
      } else {
        const view = buildAiView(this.state, player.seat)
        const target = await this.agentOf(player.seat).decideVote(view, candidates)
        this.host.setThinking(player.seat, true)
        await this.sleep(420)
        this.host.setThinking(player.seat, false)
        this.commit((s) =>
          castVote(s, player.seat, target != null && candidates.includes(target) ? target : null),
        )
      }
    }

    while (this.state.vote.reveal < alive.length) {
      this.ensure()
      this.commit((s) => revealNextBallot(s))
      await this.sleep(170)
    }

    this.commit((s) => resolveVote(s))
    await this.sleep(520)

    if (this.state.scene === 'pk') {
      await this.say({ kind: 'vote-tie', seats: this.state.vote.tied })
      return 'pk'
    }
    return 'done'
  }

  private async pkSpeeches(): Promise<void> {
    await this.sleep(320)
    for (const seat of this.state.vote.tied) {
      this.ensure()
      const player = playerAt(this.state, seat)
      if (!player) continue
      await this.say({ kind: 'speech-turn', seat })
      if (player.isHuman) {
        const raw = await this.host.ask('speech', {
          seat,
          seconds: Math.max(20, Math.round(this.state.turnSeconds * 0.7)),
          pk: true,
        })
        const text = typeof raw === 'string' ? raw.trim() : ''
        this.commit((s) => speak(s, seat, text || '（没有补充）', [], 'pk'))
        await this.sleep(200)
      } else {
        const view = buildAiView(this.state, seat)
        this.host.setThinking(seat, true)
        const speech = await this.agentOf(seat).speak(view, 'pk')
        await this.sleep(700)
        this.host.setThinking(seat, false)
        this.commit((s) => speak(s, seat, speech.text, speech.claims, 'pk'))
        await this.sleep(Math.min(2600, 800 + speech.text.length * 50))
      }
    }
    await this.sleep(420)
  }

  private async settleVote(): Promise<void> {
    const vote = this.state.vote
    if (vote.none) {
      await this.say({ kind: 'vote-none' })
      await this.sleep(1200)
      return
    }

    const out = vote.out
    if (out == null) return

    await this.say({ kind: 'vote-out', seat: out })
    await this.lastWordsFor(out)
    if (this.state.pendingHunter != null) {
      await this.hunterShot()
    }
    this.commit((s) => checkWin(s))
    if (this.state.winner) {
      await this.finish()
      return
    }
    await this.sleep(400)
  }

  // ------------------------------------------------------------- 终局

  private async finish(): Promise<void> {
    const state = this.state
    if (!state.winner) return
    const text = await this.roster.host.narrate({
      kind: 'result',
      winner: state.winner,
      reason: state.endReason,
    })
    this.host.narrate(text)
    this.host.onFinished()
  }

  /** 玩家点自爆时由 store 调用 */
  async selfDestruct(seat: number): Promise<void> {
    if (this.state.scene !== 'day') return
    const player = playerAt(this.state, seat)
    if (!player || !player.alive || player.role !== 'wolf') return
    const s = engineSelfDestruct(this.state, seat)
    this.host.commit(() => s)
    this.host.abortRequest('自爆')
  }
}
