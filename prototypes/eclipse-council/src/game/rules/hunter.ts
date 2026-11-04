import type { DeathCause } from '../types'
export function canHunterShoot(cause: DeathCause | undefined): boolean {
  return cause === 'wolf' || cause === 'vote' || cause === 'poison'
}
