/**
 * 游戏引擎：全部为纯函数，输入旧状态返回新状态。
 * 任何非法操作抛 GameError，由 store 捕获后提示。
 */
import { mulberry32, shuffle, type Rng } from './rng'
import {
  ROLE_POOL,
  SEAT_COUNT,
  type Claim,
  type DeathCause,
  type GameConfig,
  type GameState,
  type LogKind,
  type NightStep,
  type Player,
  type Scene,
  type Speech,
  type Winner,
} from './types'
import { PERSONA_IDS, SEAT_NAMES } from '../data/names'
import { canHunterShoot } from './rules/hunter'
import { tallyWolfVotes } from './rules/night'
import { speechOrder } from './rules/speechOrder'
import { evaluateWin } from './rules/win'
import { witchOptions } from './rules/witch'

export class GameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameError'
  }
}

export const DEFAULT_TURN_SECONDS = 30

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new GameError(message)
}

function clone(state: GameState): GameState {
  return structuredClone(state)
}

function seatOf(state: GameState, seat: number): Player {
  const p = state.players.find((x) => x.seat === seat)
  assert(p, `席位 ${seat} 不存在`)
  return p
}

function pushLog(
  state: GameState,
  kind: LogKind,
  text: string,
  opts: { seat?: number; to?: number[] } = {},
): void {
  state.log.push({
    id: state.logSeq++,
    round: state.round,
    scene: state.scene,
    kind,
    text,
    seat: opts.seat,
    ts: Date.now(),
    visibility: opts.to && opts.to.length > 0 ? opts.to : 'public',
  })
}

function killPlayer(
  state: GameState,
  seat: number,
  cause: DeathCause,
  scene: Scene = state.scene,
): void {
  const p = seatOf(state, seat)
  if (!p.alive) return
  p.alive = false
  p.deathCause = cause
  p.deathRound = state.round
  p.deathScene = scene
}

function humansOf(state: GameState): number[] {
  return state.humanSeats.slice()
}

function wolvesAlive(state: GameState): Player[] {
  return state.players.filter((p) => p.role === 'wolf' && p.alive)
}

function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive)
}

function freshNight() {
  return {
    step: 'wolf' as NightStep,
    wolfVotes: {} as Record<number, number>,
    wolfTarget: null as number | null,
    seerCheck: null as { target: number; camp: 'wolf' | 'good'; by: number } | null,
    witchSave: false,
    witchPoison: null as number | null,
    witchActed: false,
    deaths: [] as number[],
  }
}

function freshVote(round: 1 | 2) {
  return {
    round,
    phase: 'collect' as const,
    ballots: {} as Record<number, number | null>,
    reveal: 0,
    tally: {} as Record<number, number>,
    tied: [] as number[],
    out: null as number | null,
    none: false,
    pk: [] as number[],
    pkRound: 0,
  }
}

// ---------------------------------------------------------------- 建局

export function createGame(config: GameConfig): GameState {
  const humans = [...new Set(config.humanSeats)].sort((a, b) => a - b)
  assert(humans.length >= 1, '至少需要 1 名真人玩家')
  assert(humans.length <= SEAT_COUNT, '真人玩家不能超过 9 人')
  for (const seat of humans) {
    assert(seat >= 1 && seat <= SEAT_COUNT, `席位 ${seat} 超出 1-9 范围`)
  }
  assert(SEAT_COUNT - humans.length <= 8, 'AI 玩家最多 8 名')

  const rng = mulberry32(config.seed || 1)
  const roles = shuffle(ROLE_POOL, rng)

  const players: Player[] = []
  for (let seat = 1; seat <= SEAT_COUNT; seat++) {
    const role = roles[seat - 1]!
    players.push({
      seat,
      name: config.names[seat]?.trim() || SEAT_NAMES[seat - 1]!,
      role,
      camp: role === 'wolf' ? 'wolf' : 'good',
      alive: true,
      isHuman: humans.includes(seat),
      persona: config.personas[seat] || PERSONA_IDS[seat - 1]!,
      revealed: false,
    })
  }

  return {
    version: 1,
    scene: 'lobby',
    round: 0,
    players,
    humanSeats: humans,
    witch: { antidote: true, poison: true },
    night: freshNight(),
    dawn: { deaths: [], nightDeaths: [], peaceNight: false, lastWordsGiven: [] },
    day: {
      queue: [],
      index: 0,
      current: null,
      lastWords: [],
      lastWordIndex: 0,
      ended: false,
      endReason: null,
    },
    vote: freshVote(1),
    deal: { preview: null, acked: [] },
    pendingHunter: null,
    seerChecks: [],
    winner: null,
    endReason: '',
    log: [],
    logSeq: 1,
    speeches: [],
    turnSeconds: config.turnSeconds ?? DEFAULT_TURN_SECONDS,
    createdAt: Date.now(),
  }
}

// ---------------------------------------------------------------- 发牌

export function beginDeal(state: GameState): GameState {
  const s = clone(state)
  assert(s.scene === 'lobby', '当前不在开局等待阶段')
  s.scene = 'deal'
  s.deal = { preview: humansOf(s)[0] ?? null, acked: [] }
  pushLog(s, 'host', '暮色沉入林梢。九人围坐，牌面朝下——今夜，身份只说给黑暗听。')
  return s
}

export function ackDeal(state: GameState, seat: number): GameState {
  const s = clone(state)
  assert(s.scene === 'deal', '当前不在发牌阶段')
  assert(s.deal.preview === seat, '现在不是你的回合')
  s.deal.acked.push(seat)
  const next = humansOf(s).find((x) => !s.deal.acked.includes(x))
  if (next != null) {
    s.deal.preview = next
    return s
  }
  s.deal.preview = null
  return beginNight(s)
}

// ---------------------------------------------------------------- 夜晚

export function beginNight(state: GameState): GameState {
  const s = clone(state)
  s.round += 1
  s.scene = 'night'
  s.night = freshNight()
  s.day = {
    queue: [],
    index: 0,
    current: null,
    lastWords: [],
    lastWordIndex: 0,
    ended: false,
    endReason: null,
  }
  s.vote = freshVote(1)
  s.pendingHunter = null
  s.dawn = { deaths: [], nightDeaths: [], peaceNight: false, lastWordsGiven: [] }
  pushLog(s, 'host', `第 ${s.round} 夜 · 天黑请闭眼。林间的雾比昨日更浓。`)
  return s
}

export function setNightStep(state: GameState, step: NightStep): GameState {
  const s = clone(state)
  assert(s.scene === 'night', '当前不是夜晚')
  s.night.step = step
  return s
}

export function wolfKill(state: GameState, wolfSeat: number, target: number): GameState {
  const s = clone(state)
  assert(s.scene === 'night' && s.night.step === 'wolf', '当前不在狼人行动时间')
  const wolf = seatOf(s, wolfSeat)
  assert(wolf.alive && wolf.role === 'wolf', '只有存活狼人可以行动')
  assert(seatOf(s, target).alive, '不能选择已出局的玩家')

  assert(seatOf(s, target).role !== 'wolf', '不能攻击狼队友')
  assert(s.night.wolfVotes[wolfSeat] == null, '本轮已确认目标')
  assert(s.night.wolfTarget == null || s.night.wolfTarget === target, '请确认队友提出的目标')
  s.night.wolfVotes[wolfSeat] = target
  s.night.wolfTarget = target

  pushLog(s, 'night', `狼人已选定目标（${wolfSeat} 号）`, { to: wolvesAlive(s).map((w) => w.seat) })
  return s
}

export function finalizeWolfTarget(state: GameState, rng: Rng): GameState {
  const s = clone(state)
  if (s.night.wolfTarget == null) {
    s.night.wolfTarget = tallyWolfVotes(s.night.wolfVotes, rng)
  }
  return s
}

export function seerCheck(state: GameState, target: number): GameState {
  const s = clone(state)
  assert(s.scene === 'night' && s.night.step === 'seer', '当前不在预言家行动时间')
  const seer = s.players.find((p) => p.role === 'seer' && p.alive)
  assert(seer, '预言家已不在场')
  assert(seatOf(s, target).alive, '不能查验已出局的玩家')
  const camp = seatOf(s, target).camp
  s.night.seerCheck = { target, camp, by: seer.seat }
  s.seerChecks.push({
    round: s.round,
    target,
    verdict: camp === 'wolf' ? 'wolf' : 'good',
    by: seer.seat,
  })
  const verdict = camp === 'wolf' ? '狼人' : '好人'
  pushLog(s, 'skill', `你查验了 ${target} 号：${verdict}`, {
    seat: seer.seat,
    to: [seer.seat],
  })
  return s
}

export function witchAct(
  state: GameState,
  witchSeat: number,
  action: { save?: boolean; poison?: number | null },
): GameState {
  const s = clone(state)
  assert(s.scene === 'night' && s.night.step === 'witch', '当前不在女巫行动时间')
  const witch = seatOf(s, witchSeat)
  assert(witch.alive && witch.role === 'witch', '只有存活女巫可以行动')
  assert(!s.night.witchActed, '本夜已经行动')

  const opts = witchOptions(s, witchSeat)
  const wantSave = action.save === true
  const poison = action.poison ?? null

  assert(!(wantSave && poison != null), '同一夜不能同时使用解药与毒药')
  if (wantSave) assert(opts.canSave, opts.saveBlockedReason ?? '现在不能使用解药')
  if (poison != null) {
    assert(opts.canPoison, opts.poisonBlockedReason ?? '现在不能使用毒药')
    assert(seatOf(s, poison).alive, '不能毒杀已出局的玩家')
  }

  if (wantSave) {
    s.witch.antidote = false
    s.night.witchSave = true
  }
  if (poison != null) {
    s.witch.poison = false
    s.night.witchPoison = poison
  }
  s.night.witchActed = true
  pushLog(
    s,
    'skill',
    wantSave ? '你使用了解药。' : poison != null ? `你使用了毒药，目标 ${poison} 号。` : '你今夜没有用药。',
    { seat: witchSeat, to: [witchSeat] },
  )
  return s
}

export function resolveNight(state: GameState, rng: Rng): GameState {
  const s = clone(state)
  assert(s.scene === 'night', '当前不是夜晚')
  if (s.night.wolfTarget == null) s.night.wolfTarget = tallyWolfVotes(s.night.wolfVotes, rng)

  const nightDeaths: number[] = []
  const target = s.night.wolfTarget
  if (target != null && !s.night.witchSave) {
    nightDeaths.push(target)
  }
  if (s.night.witchPoison != null && !nightDeaths.includes(s.night.witchPoison)) {
    nightDeaths.push(s.night.witchPoison)
  }

  for (const seat of nightDeaths) {
    const cause: DeathCause = seat === s.night.witchPoison ? 'poison' : 'wolf'
    killPlayer(s, seat, cause, 'night')
  }

  s.night.deaths = nightDeaths
  s.scene = 'dawn'
  s.dawn = {
    deaths: nightDeaths.slice(),
    nightDeaths: nightDeaths.slice(),
    peaceNight: nightDeaths.length === 0,
    lastWordsGiven: [],
  }

  for (const seat of nightDeaths) {
    pushLog(s, 'death', `${seat} 号在天亮前死去`, { seat })
  }

  const hunter = s.players.find((p) => p.role === 'hunter' && !p.alive && p.deathRound === s.round)
  if (hunter && canHunterShoot(hunter.deathCause)) s.pendingHunter = hunter.seat

  return s
}

export function hunterShoot(state: GameState, target: number | null): GameState {
  const s = clone(state)
  assert(s.pendingHunter != null, '现在没有待开枪的猎人')
  const hunterSeat = s.pendingHunter
  s.pendingHunter = null
  if (target != null) {
    assert(seatOf(s, target).alive, '不能选择已出局的玩家')
    assert(target !== hunterSeat, '不能开枪打自己')
    killPlayer(s, target, 'gun')
    if (s.scene === 'dawn' && !s.dawn.deaths.includes(target)) s.dawn.deaths.push(target)
    pushLog(s, 'death', `猎人 ${hunterSeat} 号开枪，带走了 ${target} 号`, { seat: hunterSeat })
  } else {
    pushLog(s, 'system', '你放弃了开枪。', { seat: hunterSeat, to: [hunterSeat] })
  }
  return s
}

// ---------------------------------------------------------------- 白天

export function beginDay(state: GameState): GameState {
  const s = clone(state)
  assert(s.scene === 'dawn', '当前不是天亮结算阶段')
  s.scene = 'day'
  const alive = alivePlayers(s).map((p) => p.seat)
  s.day = {
    queue: speechOrder(s.dawn.deaths, alive),
    index: 0,
    current: null,
    lastWords: s.round === 1 ? s.dawn.nightDeaths.slice() : [],
    lastWordIndex: 0,
    ended: false,
    endReason: null,
  }
  s.day.current = s.day.queue[0] ?? null
  const order = s.day.queue.join(' → ')
  pushLog(s, 'host', `天亮了。今日发言顺序：${order || '无人可发言'}。`)
  return s
}

export function nextSpeaker(state: GameState): GameState {
  const s = clone(state)
  assert(s.scene === 'day', '当前不在白天发言阶段')
  s.day.index += 1
  if (s.day.index >= s.day.queue.length) {
    s.day.current = null
    s.day.ended = true
    s.day.endReason = 'speeches-done'
    pushLog(s, 'host', '发言已尽，日影西斜。')
    return s
  }
  s.day.current = s.day.queue[s.day.index] ?? null
  return s
}

export function speak(
  state: GameState,
  seat: number,
  text: string,
  claims: Claim[] = [],
  kind: Speech['kind'] = 'day',
): GameState {
  const s = clone(state)
  const speech: Speech = { seat, round: s.round, scene: s.scene, text, claims, kind }
  s.speeches.push(speech)
  pushLog(s, 'speech', `${seat} 号：${text}`, { seat })
  return s
}

export function giveLastWords(state: GameState, seat: number, text: string): GameState {
  const s = clone(state)
  const p = seatOf(s, seat)
  assert(!p.alive && !p.lastWords && s.day.lastWords.includes(seat), '当前没有此玩家的遗言资格')
  assert(text.length <= 200, '遗言最多 200 字')
  p.lastWords = text
  s.speeches.push({ seat, round: s.round, scene: s.scene, text, claims: [], kind: 'lastwords' })
  pushLog(s, 'speech', `${seat} 号遗言：${text}`, { seat })
  if (s.day.lastWords.includes(seat)) {
    if (!s.dawn.lastWordsGiven.includes(seat)) s.dawn.lastWordsGiven.push(seat)
    s.day.lastWordIndex += 1
  }
  return s
}

export function selfDestruct(state: GameState, seat: number): GameState {
  void state; void seat
  throw new GameError('本项目不支持狼人自爆')
}

export function endDayToVote(state: GameState): GameState {
  const s = clone(state)
  assert(s.scene === 'day', '当前不在白天')
  s.day.ended = true
  s.day.current = null
  return beginVote(s, 1)
}

// ---------------------------------------------------------------- 投票

export function beginVote(state: GameState, round: 1 | 2): GameState {
  const s = clone(state)
  s.scene = 'vote'
  const pk = round === 2 ? s.vote.pk.slice() : []
  s.vote = freshVote(round)
  s.vote.pk = pk
  pushLog(
    s,
    'host',
    round === 1 ? '黄昏降临，日落沉入林线。请进行放逐投票。' : '平票再投，暮光已经压到肩上。',
  )
  return s
}

export function castVote(state: GameState, voter: number, target: number | null): GameState {
  const s = clone(state)
  assert(s.scene === 'vote' && s.vote.phase === 'collect', '当前不在投票阶段')
  const v = seatOf(s, voter)
  assert(v.alive, '出局玩家不能投票')
  assert(!(voter in s.vote.ballots), '已经投过票')
  if (s.vote.round === 2) {
    assert(!s.vote.pk.includes(voter), 'PK 台上玩家不能投票')
    assert(target != null && s.vote.pk.includes(target), '只能投给 PK 候选人')
  }
  assert(target != null, '请选择一名存活玩家')
  assert(seatOf(s, target).alive, '不能投给已出局的玩家')
  s.vote.ballots[voter] = target
  return s
}

export function voteProgress(state: GameState): { voted: number[]; waiting: number[] } {
  const alive = alivePlayers(state).filter(p => state.vote.round !== 2 || !state.vote.pk.includes(p.seat)).map((p) => p.seat)
  const voted = Object.keys(state.vote.ballots).map(Number)
  return { voted, waiting: alive.filter((seat) => !voted.includes(seat)) }
}

export function revealNextBallot(state: GameState): GameState {
  const s = clone(state)
  assert(s.scene === 'vote', '当前不在投票阶段')
  const order = alivePlayers(s)
    .filter(p => s.vote.round !== 2 || !s.vote.pk.includes(p.seat))
    .map((p) => p.seat)
    .sort((a, b) => a - b)
  const seat = order[s.vote.reveal]
  if (seat == null) return s
  const target = s.vote.ballots[seat] ?? null
  s.vote.reveal += 1
  if (target != null) s.vote.tally[target] = (s.vote.tally[target] ?? 0) + 1
  pushLog(
    s,
    'vote',
    target == null ? `${seat} 号弃票` : `${seat} 号 → ${target} 号`,
    { seat },
  )
  if (s.vote.reveal >= order.length) s.vote.phase = 'done'
  return s
}

export function resolveVote(state: GameState): GameState {
  const s = clone(state)
  assert(s.scene === 'vote', '当前不在投票阶段')

  const tally: Record<number, number> = {}
  for (const p of alivePlayers(s)) {
    const target = s.vote.ballots[p.seat]
    if (target == null) continue
    if (!seatOf(s, target).alive) continue
    tally[target] = (tally[target] ?? 0) + 1
  }
  s.vote.tally = tally
  s.vote.phase = 'done'
  pushLog(s, 'vote', `第 ${s.vote.round} 次投票结算：${Object.entries(s.vote.ballots).map(([v,t]) => `${v} 号 → ${t ?? '弃票'} 号`).join('；')}`)

  const entries = Object.entries(tally).map(([k, v]) => [Number(k), v] as const)
  if (entries.length === 0) {
    s.vote.none = true
    pushLog(s, 'vote', '全员弃票，本轮无人被放逐。')
    return s
  }

  let max = 0
  for (const [, n] of entries) max = Math.max(max, n)
  const top = entries.filter(([, n]) => n === max).map(([seat]) => seat)

  if (top.length > 1) {
    s.vote.tied = top
    if (s.vote.round === 1) {
      s.vote.pk = top
      s.vote.pkRound = 1
      s.scene = 'pk'
      pushLog(s, 'vote', `${top.join(' 号、')} 号平票，进入 PK 发言。`)
    } else {
      s.vote.none = true
      pushLog(s, 'vote', '再次平票，本轮无人被放逐，直接入夜。')
    }
    return s
  }

  const out = top[0]!
  s.vote.out = out
  const victim = seatOf(s, out)
  killPlayer(s, out, 'vote', 'day')
  pushLog(s, 'death', `${out} 号被放逐出局`, { seat: out })
  s.day.lastWords = [out]
  s.day.lastWordIndex = 0
  if (victim.role === 'hunter') s.pendingHunter = out
  return s
}

// ---------------------------------------------------------------- 结算

export function checkWin(state: GameState): GameState {
  const s = clone(state)
  if (s.winner || s.pendingHunter != null) return s
  const result = evaluateWin(s.players)
  if (!result.winner) return s
  s.winner = result.winner
  s.endReason = result.reason
  s.scene = 'result'
  for (const p of s.players) p.revealed = true
  pushLog(s, 'win', result.reason)
  return s
}

export function winnerLabel(winner: Winner): string {
  return winner === 'good' ? '好人阵营' : '狼人阵营'
}

// ---------------------------------------------------------------- 推导

/** 当前夜晚应该轮到哪些席位行动（用于界面高亮） */
export function nightActors(state: GameState): number[] {
  if (state.scene !== 'night') return []
  switch (state.night.step) {
    case 'wolf':
      return state.players.filter((p) => p.role === 'wolf' && p.alive).map((p) => p.seat)
    case 'seer': {
      const seer = state.players.find((p) => p.role === 'seer' && p.alive)
      return seer ? [seer.seat] : []
    }
    case 'witch': {
      const witch = state.players.find((p) => p.role === 'witch' && p.alive)
      return witch ? [witch.seat] : []
    }
    default:
      return []
  }
}

export function visibleLogs(state: GameState, viewer: number | null): typeof state.log {
  return state.log.filter(
    (entry) =>
      entry.visibility === 'public' || (viewer != null && entry.visibility.includes(viewer)),
  )
}

/** 主持旁白 / 系统播报写入日志 */
export function narrate(state: GameState, text: string, kind: LogKind = 'host'): GameState {
  const s = clone(state)
  pushLog(s, kind, text)
  return s
}
