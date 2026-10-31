export type RoleId = 'wolf' | 'villager' | 'seer' | 'witch' | 'hunter'

export interface RoleMeta {
  id: RoleId
  cn: string
  en: string
  camp: 'good' | 'wolf'
  poem: string
  ability: string
}

export const ROLES: Record<RoleId, RoleMeta> = {
  wolf: {
    id: 'wolf',
    cn: '狼人',
    en: 'THE WOLF',
    camp: 'wolf',
    poem: '月亮升起时，我数着你们的呼吸。',
    ability: '每夜与同伴共同袭击一名玩家。',
  },
  villager: {
    id: 'villager',
    cn: '村民',
    en: 'THE VILLAGER',
    camp: 'good',
    poem: '我只有一盏灯，和一整夜的耳朵。',
    ability: '没有技能，以发言与投票找出狼人。',
  },
  seer: {
    id: 'seer',
    cn: '预言家',
    en: 'THE SEER',
    camp: 'good',
    poem: '我看见结局，却不能说出口。',
    ability: '每夜查验一名玩家是好人还是狼人。',
  },
  witch: {
    id: 'witch',
    cn: '女巫',
    en: 'THE WITCH',
    camp: 'good',
    poem: '一瓶救，一瓶毒；我只有两只手。',
    ability: '解药与毒药各一瓶，同一夜只能用一瓶。',
  },
  hunter: {
    id: 'hunter',
    cn: '猎人',
    en: 'THE HUNTER',
    camp: 'good',
    poem: '死亡并不意味着沉默，最后一箭仍由我决定。',
    ability: '出局时可以选择开枪带走一名玩家，或放弃。',
  },
}

export const BOARD: { seat: number; role: RoleId; alive: boolean; name: string }[] = [
  { seat: 1, role: 'witch', alive: true, name: '你' },
  { seat: 2, role: 'wolf', alive: false, name: '樵夫' },
  { seat: 3, role: 'villager', alive: true, name: '旅人' },
  { seat: 4, role: 'seer', alive: false, name: '钟表匠' },
  { seat: 5, role: 'wolf', alive: true, name: '守夜人' },
  { seat: 6, role: 'hunter', alive: false, name: '说书人' },
  { seat: 7, role: 'villager', alive: true, name: '学徒' },
  { seat: 8, role: 'wolf', alive: false, name: '猎户' },
  { seat: 9, role: 'villager', alive: true, name: '老妇' },
]
