import type { Claim } from '../game/types'
import type { AgentSpeech } from './types'
import type { Persona, PersonaTone } from './personas'
import type { Rng } from '../game/rng'

const PREFIX: Record<PersonaTone, string[]> = {
  cold: ['', '直接说。'],
  suspicious: ['我先摆一个疑点。', '有个地方我一直过不去。'],
  warm: ['先把气氛稳一下。', '都别急。'],
  wry: ['有点意思。', '我先笑一声。'],
  rational: ['按已知信息推一遍。', '我把票型捋一捋。'],
  fierce: ['我把话放这儿。', '今天必须有人走。'],
  hesitant: ['我……其实不太确定。', '可能我说得不对。'],
  silent: ['短说。', '两句。'],
  sly: ['有些话我本来不想现在说。', '我听到的东西和你们不太一样。'],
}

const SUFFIX: Record<PersonaTone, string[]> = {
  cold: ['就这些。', '完。', ''],
  suspicious: ['后面的人接着。', '我会盯着这一票。'],
  warm: ['大家别被带偏了。', '我们一起看票。'],
  wry: ['你们随意。', '当我没说。'],
  rational: ['这是我的结论。', '信息就这么多。'],
  fierce: ['这一票我不会改。', '谁洗谁死。'],
  hesitant: ['……也可能是我多心。', '你们再想想。'],
  silent: ['过。', ''],
  sly: ['剩下的你们自己想。', '我只负责递刀子。'],
}

const REASONS = [
  '他一直跟着别人的结论走，没给过自己的判断',
  '他的发言太顺了，顺得像提前想过一遍',
  '他整场都在回避「验人」这件事',
  '他这一票的动机说不通',
  '他替一个已经出局的人急着洗白，很反常',
  '他说话温温和和，可落点总在别处',
  '每次被点到，他都能立刻把话题挪开',
  '他把刀口和票口对得太整齐了',
]

const ANALYZE = [
  '现在场上好人多，但容错只剩一次，别乱分票',
  '我们不能再靠感觉，得看票型',
  '今天走错一个人，明天就是狼人的局',
  '我把话摊开：狼一定藏在话最多的那几个里',
  '安静的人不一定是好人，急着归票的更不一定',
]

function pick(list: string[], rng: Rng): string {
  return list[Math.floor(rng() * list.length)] ?? ''
}

/** 用来避免同一个 AI 复读同一句话 */
export class TemplatePool {
  private used = new Set<string>()
  constructor(private readonly rng: Rng) {}

  take(pool: string[]): string {
    const fresh = pool.filter((x) => !this.used.has(x))
    const source = fresh.length > 0 ? fresh : pool
    const value = pick(source, this.rng)
    this.used.add(value)
    return value
  }

  reset(): void {
    this.used.clear()
  }
}

function wrap(p: Persona, core: string, rng: Rng, pool?: TemplatePool): string {
  const head = pool ? pool.take(PREFIX[p.tone]) : pick(PREFIX[p.tone], rng)
  const tail = pool ? pool.take(SUFFIX[p.tone]) : pick(SUFFIX[p.tone], rng)
  return [head, core, tail].filter(Boolean).join(' ')
}

export interface CheckLine {
  target: number
  verdict: 'good' | 'wolf'
}

function describeChecks(checks: CheckLine[]): string {
  return checks
    .map((c) => `${c.target} 号是${c.verdict === 'wolf' ? '狼人' : '好人'}`)
    .join('，')
}

export function saySeerClaim(
  p: Persona,
  seat: number,
  checks: CheckLine[],
  nextTarget: number | null,
  rng: Rng,
  pool?: TemplatePool,
): AgentSpeech {
  const wolf = checks.find((c) => c.verdict === 'wolf')
  if (checks.length === 0) {
    const core = `${seat} 号，我是预言家。我的验人结果还没有成形，${nextTarget ? `今晚我先验 ${nextTarget} 号。` : '请把这一票留到最后。'}`
    return {
      text: wrap(p, core, rng, pool),
      claims: nextTarget != null ? [{ kind: 'accuse', target: nextTarget }] : [{ kind: 'pass' }],
    }
  }
  const core = wolf
    ? `${seat} 号，我是预言家。昨晚我验的是 ${wolf.target} 号——狼人。今天这票必须落在他身上，剩下的我再说下去都是浪费时间。`
    : `${seat} 号，我是预言家。我验过的人：${describeChecks(checks)}。${
        nextTarget ? `今晚我打算验 ${nextTarget} 号。` : ''
      }今天先别动我，给我一天。`
  const claims: Claim[] = checks.map((c) => ({
    kind: 'seer' as const,
    target: c.target,
    verdict: c.verdict,
  }))
  return { text: wrap(p, core, rng, pool), claims }
}

export function sayFakeSeerClaim(
  p: Persona,
  seat: number,
  fake: CheckLine[],
  rng: Rng,
  pool?: TemplatePool,
): AgentSpeech {
  const wolf = fake.find((c) => c.verdict === 'wolf')
  const core = `我是预言家，${seat} 号。昨晚我验了 ${wolf?.target ?? fake[0]?.target} 号，结果是狼。别问我为什么这么确定——验人就是这样，一眼的事。`
  return {
    text: wrap(p, core, rng, pool),
    claims: fake.map((c) => ({ kind: 'seer' as const, target: c.target, verdict: c.verdict })),
  }
}

export function sayAccuse(
  p: Persona,
  target: number,
  rng: Rng,
  pool?: TemplatePool,
): AgentSpeech {
  const reason = pool ? pool.take(REASONS) : pick(REASONS, rng)
  const core = `${target} 号我听着不舒服：${reason}。这一票我先记在他头上。`
  return { text: wrap(p, core, rng, pool), claims: [{ kind: 'accuse', target }] }
}

export function sayCounterAccuse(
  p: Persona,
  target: number,
  rng: Rng,
  pool?: TemplatePool,
): AgentSpeech {
  const core = `${target} 号说我是狼？那我们把话说清楚——他连一个可信的验人计划都拿不出来，急着归票的人才是心虚的那个。`
  return { text: wrap(p, core, rng, pool), claims: [{ kind: 'accuse', target }] }
}

export function sayDefend(p: Persona, rng: Rng, pool?: TemplatePool): AgentSpeech {
  const core = pick(
    [
      '把票压在我身上之前，先想清楚谁从这轮里获利。我如果出局，明天你们手里一个信息都没有。',
      '我不是狼。我今天说的话全都可以在票型里对上，愿意接受复盘。',
      '怀疑我可以，但别把唯一一票浪费在情绪上。',
    ],
    rng,
  )
  return { text: wrap(p, core, rng, pool), claims: [{ kind: 'pass' }] }
}

export function sayAnalyze(
  p: Persona,
  round: number,
  aliveCount: number,
  rng: Rng,
  pool?: TemplatePool,
): AgentSpeech {
  const line = pool ? pool.take(ANALYZE) : pick(ANALYZE, rng)
  const core = `第 ${round} 天，场上 ${aliveCount} 人。${line}。`
  return { text: wrap(p, core, rng, pool), claims: [{ kind: 'pass' }] }
}

export function sayPk(p: Persona, target: number, rng: Rng, pool?: TemplatePool): AgentSpeech {
  const core = `我站在这儿只有一个理由：${target} 号比我更像狼。我该说的都说完了，票在你们手里。`
  return { text: wrap(p, core, rng, pool), claims: [{ kind: 'accuse', target }] }
}

export function sayPass(p: Persona, rng: Rng, pool?: TemplatePool): AgentSpeech {
  const core = pick(['我没有更多信息，听后面的。', '今天我先跟票，不带头。'], rng)
  return { text: wrap(p, core, rng, pool), claims: [{ kind: 'pass' }] }
}

export function sayLastWords(p: Persona, roleName: string, rng: Rng): AgentSpeech {
  const core = pick(
    [
      `我是${roleName}。走到这一步没什么好藏的，剩下的交给你们。`,
      `${roleName}。我认，但票别乱给。`,
      `我是${roleName}，我出局之后，记得看谁最急着盖棺。`,
    ],
    rng,
  )
  return { text: wrap(p, core, rng), claims: [{ kind: 'pass' }] }
}
