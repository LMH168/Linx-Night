import type { Camp, Role } from './types'

export interface RoleMeta {
  role: Role
  name: string
  camp: Camp
  /** 卡片上的短标签 */
  tag: string
  /** 一句话定位 */
  motto: string
  ability: string
  /** 头像主色（CSS 颜色） */
  accent: string
  /** 头像副色 */
  accent2: string
}

export const ROLES: Record<Role, RoleMeta> = {
  wolf: {
    role: 'wolf',
    name: '狼人',
    camp: 'wolf',
    tag: '猎影',
    motto: '夜色是我的同谋。',
    ability: '每晚与同伴确认一致的袭击目标；不能攻击狼队友。',
    accent: '#7f2f3a',
    accent2: '#2a0f16',
  },
  seer: {
    role: 'seer',
    name: '预言家',
    camp: 'good',
    tag: '窥视',
    motto: '我以冷光换取真相。',
    ability: '每晚查验一名玩家，得知其属于好人还是狼人。',
    accent: '#5b8fd6',
    accent2: '#101f38',
  },
  witch: {
    role: 'witch',
    name: '女巫',
    camp: 'good',
    tag: '双药',
    motto: '生与死，各一瓶。',
    ability: '一瓶解药、一瓶毒药，各限一次；同一夜不可双开；可自救。',
    accent: '#8f6fc4',
    accent2: '#1a1230',
  },
  hunter: {
    role: 'hunter',
    name: '猎人',
    camp: 'good',
    tag: '枪响',
    motto: '倒下的那一刻，我仍扣着扳机。',
    ability: '被刀、被毒或被放逐时，有 30 秒选择开枪或放弃。',
    accent: '#c08b4e',
    accent2: '#2b1a0e',
  },
  villager: {
    role: 'villager',
    name: '平民',
    camp: 'good',
    tag: '凡尘',
    motto: '我没有刀，但我有眼睛。',
    ability: '无夜间技能，只能凭判断在白昼投出正确的一票。',
    accent: '#8c9aa6',
    accent2: '#182027',
  },
}

export const GOD_ROLES: Role[] = ['seer', 'witch', 'hunter']
export const WOLF_ROLES: Role[] = ['wolf']

export function roleName(role: Role): string {
  return ROLES[role].name
}
