export type PersonaTone =
  | 'cold'
  | 'suspicious'
  | 'warm'
  | 'wry'
  | 'rational'
  | 'fierce'
  | 'hesitant'
  | 'silent'
  | 'sly'

export interface Persona {
  id: string
  name: string
  tone: PersonaTone
  /** 说话风格标签，显示在席位卡上 */
  tag: string
  /** 0-1：越高越爱进攻 */
  aggression: number
  /** 0-1：越高话越多 */
  verbosity: number
  /** 0-1：越高越容易相信别人的自证 */
  trust: number
  /** 头像色调（用于程序化剪影的灯光） */
  palette: [string, string]
}

export const PERSONAS: Record<string, Persona> = {
  ember: {
    id: 'ember',
    name: '灰烬',
    tone: 'cold',
    tag: '冷峻',
    aggression: 0.55,
    verbosity: 0.3,
    trust: 0.35,
    palette: ['#c9a06a', '#2a1a12'],
  },
  owl: {
    id: 'owl',
    name: '夜枭',
    tone: 'suspicious',
    tag: '多疑',
    aggression: 0.65,
    verbosity: 0.6,
    trust: 0.15,
    palette: ['#8fb2c9', '#101a24'],
  },
  moss: {
    id: 'moss',
    name: '苔语',
    tone: 'warm',
    tag: '温和',
    aggression: 0.3,
    verbosity: 0.55,
    trust: 0.7,
    palette: ['#9dbf8a', '#131f16'],
  },
  crow: {
    id: 'crow',
    name: '烬鸦',
    tone: 'wry',
    tag: '讥诮',
    aggression: 0.6,
    verbosity: 0.5,
    trust: 0.3,
    palette: ['#b08bd0', '#1c1426'],
  },
  moon: {
    id: 'moon',
    name: '月痕',
    tone: 'rational',
    tag: '理性',
    aggression: 0.45,
    verbosity: 0.75,
    trust: 0.45,
    palette: ['#b9c7d8', '#141b26'],
  },
  bell: {
    id: 'bell',
    name: '赤铃',
    tone: 'fierce',
    tag: '激昂',
    aggression: 0.9,
    verbosity: 0.7,
    trust: 0.3,
    palette: ['#d97b6a', '#26100e'],
  },
  chord: {
    id: 'chord',
    name: '雾弦',
    tone: 'hesitant',
    tag: '优柔',
    aggression: 0.25,
    verbosity: 0.5,
    trust: 0.8,
    palette: ['#a7b6c9', '#161c25'],
  },
  frost: {
    id: 'frost',
    name: '寒枝',
    tone: 'silent',
    tag: '沉默',
    aggression: 0.4,
    verbosity: 0.15,
    trust: 0.5,
    palette: ['#9fc7cf', '#0f1a20'],
  },
  candle: {
    id: 'candle',
    name: '烛影',
    tone: 'sly',
    tag: '狡黠',
    aggression: 0.5,
    verbosity: 0.65,
    trust: 0.25,
    palette: ['#e0b45f', '#241a0d'],
  },
}

export function personaOf(id: string): Persona {
  return PERSONAS[id] ?? PERSONAS.moon!
}
