import type { Player } from '../game/types'
import type { Agent, Host } from './types'
import { makeLocalAgent } from './localAgent'
import { makeLocalHost } from './hostNarrator'
import { LingxiAgent, LingxiClient, LingxiHost, type LingxiSettings } from './lingxi'

export interface AiRoster {
  agents: Map<number, Agent>
  host: Host
  /** 是否真的接上了灵矽接口 */
  remote: boolean
}

/**
 * 为一局比赛装配 AI：AI 席位使用本地引擎，
 * 若配置了灵矽接口，则包一层远程代理，失败自动回落本地。
 */
export function buildAiRoster(
  players: Player[],
  settings: LingxiSettings,
  seed: number,
): AiRoster {
  const client = new LingxiClient(settings)
  const remote = client.ready
  const agents = new Map<number, Agent>()

  for (const player of players) {
    if (player.isHuman) continue
    const local = makeLocalAgent(player.seat, player.persona, seed)
    agents.set(player.seat, remote ? new LingxiAgent(player.seat, client, local) : local)
  }

  const host: Host = remote ? new LingxiHost(client, makeLocalHost()) : makeLocalHost()
  return { agents, host, remote }
}

export * from './types'
export { buildAiView } from './view'
export { PERSONAS, personaOf } from './personas'
export type { LingxiSettings } from './lingxi'
export { DEFAULT_LINGXI } from './lingxi'
