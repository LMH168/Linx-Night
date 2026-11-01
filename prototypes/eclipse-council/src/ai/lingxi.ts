import type { Claim } from '../game/types'
import { ROLES } from '../game/roles'
import { personaOf } from './personas'
import type { Agent, AgentSpeech, AiView, Host, HostCue, WitchPlan } from './types'

export interface LingxiSettings {
  enabled: boolean
  baseURL: string
  apiKey: string
  model: string
  timeoutMs: number
}

export const DEFAULT_LINGXI: LingxiSettings = {
  enabled: false,
  baseURL: '',
  apiKey: '',
  model: 'lingxi-agent',
  timeoutMs: 8000,
}

function joinURL(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, '')
  if (trimmed.endsWith(path)) return trimmed
  return `${trimmed}${path}`
}

function extractContent(data: unknown): string {
  if (typeof data !== 'object' || data === null) return ''
  const record = data as Record<string, unknown>
  const choices = record.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>
    const message = first.message as Record<string, unknown> | undefined
    if (message && typeof message.content === 'string') return message.content
    if (typeof first.text === 'string') return first.text
  }
  if (typeof record.content === 'string') return record.content
  if (typeof record.text === 'string') return record.text
  return ''
}

/** 从模型输出里尽量抠出 JSON（兼容 ```json 包裹） */
export function parseJsonLoose<T>(raw: string): T | null {
  const text = raw.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = fenced ? fenced[1]! : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

function normalizeClaims(input: unknown): Claim[] {
  if (!Array.isArray(input)) return []
  const out: Claim[] = []
  for (const raw of input.slice(0, 4)) {
    if (typeof raw !== 'object' || raw === null) continue
    const c = raw as Record<string, unknown>
    const kind = c.kind
    const target = Number(c.target)
    if (!Number.isInteger(target) || target < 1 || target > 9) continue
    if (kind === 'seer' && (c.verdict === 'wolf' || c.verdict === 'good')) {
      out.push({ kind: 'seer', target, verdict: c.verdict })
    } else if (kind === 'accuse') {
      out.push({ kind: 'accuse', target })
    } else if (kind === 'defend') {
      out.push({ kind: 'defend', target })
    }
  }
  return out
}

export class LingxiClient {
  constructor(private readonly settings: LingxiSettings) {}

  get ready(): boolean {
    return this.settings.enabled && this.settings.baseURL.trim().length > 0
  }

  async chat(system: string, user: string): Promise<string> {
    if (!this.ready) throw new Error('灵矽接口未启用')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs)
    try {
      const response = await fetch(joinURL(this.settings.baseURL, '/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.settings.apiKey ? { Authorization: `Bearer ${this.settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.settings.model,
          stream: false,
          temperature: 0.9,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`灵矽接口返回 ${response.status}`)
      const data: unknown = await response.json()
      const content = extractContent(data)
      if (!content.trim()) throw new Error('灵矽接口返回空内容')
      return content
    } finally {
      clearTimeout(timer)
    }
  }
}

function aiViewBrief(view: AiView): string {
  return JSON.stringify({
    座位: view.self.seat,
    身份: ROLES[view.self.role].name,
    阵营: view.self.camp === 'wolf' ? '狼人' : '好人',
    轮次: view.round,
    存活: view.aliveSeats,
    狼队友: view.wolfTeammates,
    验人: view.seerChecks,
    发言: view.speeches.slice(-12).map((s) => ({ 座位: s.seat, 内容: s.text })),
  })
}

export class LingxiAgent implements Agent {
  readonly seat: number
  private readonly client: LingxiClient

  constructor(seat: number, client: LingxiClient, private readonly fallback: Agent) {
    this.seat = seat
    this.client = client
  }

  private system(view: AiView): string {
    const persona = personaOf(view.self.persona)
    return [
      '你在扮演线上狼人杀的一个玩家。',
      `你的座位是 ${view.self.seat} 号，身份是「${ROLES[view.self.role].name}」，人格是「${persona.name}」（${persona.tag}）。`,
      '你只能说你知道的事：不要假设自己看得见别人的身份。',
      '回答必须是 JSON，不要输出任何解释性文字。',
    ].join('\n')
  }

  async decideNightKill(view: AiView, candidates: number[]): Promise<number | null> {
    try {
      const raw = await this.client.chat(
        this.system(view),
        `${aiViewBrief(view)}\n可选目标：${candidates.join(',')}。请输出 {"target": 数字}。`,
      )
      const parsed = parseJsonLoose<{ target?: number }>(raw)
      const target = Number(parsed?.target)
      if (Number.isInteger(target) && candidates.includes(target)) return target
      throw new Error('无效目标')
    } catch {
      return this.fallback.decideNightKill(view, candidates)
    }
  }

  async decideSeerCheck(view: AiView, candidates: number[]): Promise<number> {
    try {
      const raw = await this.client.chat(
        this.system(view),
        `${aiViewBrief(view)}\n可选查验目标：${candidates.join(',')}。请输出 {"target": 数字}。`,
      )
      const parsed = parseJsonLoose<{ target?: number }>(raw)
      const target = Number(parsed?.target)
      if (Number.isInteger(target) && candidates.includes(target)) return target
      throw new Error('无效目标')
    } catch {
      return this.fallback.decideSeerCheck(view, candidates)
    }
  }

  async decideWitch(view: AiView): Promise<WitchPlan> {
    try {
      const raw = await this.client.chat(
        this.system(view),
        `${aiViewBrief(view)}\n今夜死者：${view.witchVictim ?? '无'}。请输出 {"save": true/false, "poison": 数字或 null}。`,
      )
      const parsed = parseJsonLoose<{ save?: boolean; poison?: number | null }>(raw)
      const poison = parsed?.poison == null ? null : Number(parsed.poison)
      return {
        save: parsed?.save === true,
        poison: poison != null && Number.isInteger(poison) ? poison : null,
      }
    } catch {
      return this.fallback.decideWitch(view)
    }
  }

  async decideVote(view: AiView, candidates: number[]): Promise<number | null> {
    try {
      const raw = await this.client.chat(
        this.system(view),
        `${aiViewBrief(view)}\n可选投票目标：${candidates.join(',')}。请输出 {"target": 数字或 null}。`,
      )
      const parsed = parseJsonLoose<{ target?: number | null }>(raw)
      if (parsed?.target == null) return null
      const target = Number(parsed.target)
      if (Number.isInteger(target) && candidates.includes(target)) return target
      throw new Error('无效目标')
    } catch {
      return this.fallback.decideVote(view, candidates)
    }
  }

  async decideHunterShot(view: AiView, candidates: number[]): Promise<number | null> {
    try {
      const raw = await this.client.chat(
        this.system(view),
        `${aiViewBrief(view)}\n你是猎人，可以开枪。可选目标：${candidates.join(',')}。请输出 {"target": 数字或 null}。`,
      )
      const parsed = parseJsonLoose<{ target?: number | null }>(raw)
      if (parsed?.target == null) return null
      const target = Number(parsed.target)
      if (Number.isInteger(target) && candidates.includes(target)) return target
      throw new Error('无效目标')
    } catch {
      return this.fallback.decideHunterShot(view, candidates)
    }
  }

  async speak(view: AiView, phase: 'day' | 'pk'): Promise<AgentSpeech> {
    try {
      const raw = await this.client.chat(
        this.system(view),
        `${aiViewBrief(view)}\n现在是${phase === 'pk' ? '平票 PK 发言' : '白天发言'}环节。请以人格化口吻说 1-3 句中文发言，并输出 {"speech": "…", "claims": [{"kind":"accuse","target":数字}]}。claims 可为空数组。`,
      )
      const parsed = parseJsonLoose<{ speech?: string; claims?: unknown }>(raw)
      const text = typeof parsed?.speech === 'string' ? parsed.speech.trim() : ''
      if (!text) throw new Error('空发言')
      return { text, claims: normalizeClaims(parsed?.claims) }
    } catch {
      return this.fallback.speak(view, phase)
    }
  }

  async lastWords(view: AiView): Promise<string> {
    try {
      const raw = await this.client.chat(
        this.system(view),
        `${aiViewBrief(view)}\n你已出局，请留下 1-2 句遗言，输出 {"speech": "…"}。`,
      )
      const parsed = parseJsonLoose<{ speech?: string }>(raw)
      const text = typeof parsed?.speech === 'string' ? parsed.speech.trim() : ''
      if (!text) throw new Error('空遗言')
      return text
    } catch {
      return this.fallback.lastWords(view)
    }
  }
}

export class LingxiHost implements Host {
  constructor(private readonly client: LingxiClient, private readonly fallback: Host) {}

  async narrate(cue: HostCue): Promise<string> {
    try {
      const raw = await this.client.chat(
        '你是暗黑森林狼人杀的 AI 主持，语气克制、电影感、每次 1-2 句中文，不要解释规则。只输出 {"speech":"…"}。',
        JSON.stringify(cue),
      )
      const parsed = parseJsonLoose<{ speech?: string }>(raw)
      const text = typeof parsed?.speech === 'string' ? parsed.speech.trim() : ''
      if (!text) throw new Error('空旁白')
      return text
    } catch {
      return this.fallback.narrate(cue)
    }
  }
}
