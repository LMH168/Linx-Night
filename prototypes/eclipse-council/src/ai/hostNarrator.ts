import type { Host, HostCue } from './types'

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T
}

/**
 * AI 主持「守夜人」的旁白。全部为本地模板，
 * 不依赖网络，保证了离线也能有仪式感。
 */
export class LocalHost implements Host {
  async narrate(cue: HostCue): Promise<string> {
    switch (cue.kind) {
      case 'lobby':
        return pick([
          '暮色密林，身份隐匿于暗影。狼在夜里狩猎，好人在白昼分辨谎言，胜负在黄昏投票落定。',
          '林子里没有路灯。九个人围成一圈，谁也不先开口。',
          '雾从树根升起来的时候，座位就已经排好了。',
        ])
      case 'deal':
        return pick([
          '纸牌落在膝上，正反两面都写着同一个词：秘密。',
          '看一眼牌，然后把它藏好。这张纸会决定你今晚说多少谎。',
          '发牌了。从这一刻起，你说的每句话都会被记住。',
        ])
      case 'night-fall':
        return pick([
          `第 ${cue.round} 夜。雾压低了树梢，月亮被吞掉一角。`,
          `第 ${cue.round} 夜。火堆只剩下一点红星，风从背后绕过来。`,
          `第 ${cue.round} 夜。林间的虫声停了，这不是好兆头。`,
        ])
      case 'wolves-wake':
        return pick([
          '狼人请睁眼。今夜，你们要决定谁听不见明天的鸟叫。',
          '狼人请睁眼。刀已经递到你们手里。',
        ])
      case 'wolves-close':
        return '狼人闭眼。'
      case 'seer-wake':
        return pick([
          '预言家请睁眼。把目光交出去，换一个真相。',
          '预言家请睁眼。水晶里有人影，但只有一个是倒影。',
        ])
      case 'witch-wake':
        return pick([
          '女巫请睁眼。你手里的两瓶药，只够改变两次结局。',
          '女巫请睁眼。今夜的名字已经写好了，你能改一次。',
        ])
      case 'dawn':
        return cue.peace
          ? pick([
              `第 ${cue.round} 天亮了。没有人死去——这样的早晨，反而更让人不安。`,
              `天亮了，昨夜是平安夜。所有人都还在，包括那个人。`,
            ])
          : pick([
              `天亮了。${cue.deaths.map((s) => `${s} 号`).join('、')}没能熬过这一夜。`,
              `天亮了。林子里少了一个人：${cue.deaths.map((s) => `${s} 号`).join('、')}。`,
            ])
      case 'hunter-wake':
        return `${cue.seat} 号是猎人。枪口还热着，现在轮到他说话了。`
      case 'speech-turn':
        return pick([`请 ${cue.seat} 号发言。`, `${cue.seat} 号，轮到你了。`])
      case 'vote-open':
        return cue.round === 1
          ? '黄昏降临，请进行放逐投票。日落之后，只有一个人会留下来。'
          : '平票再投。暮光已经压到肩上，请重新选择。'
      case 'vote-tie':
        return `${cue.seats.map((s) => `${s} 号`).join('、')}平票，进入 PK 发言。`
      case 'vote-none':
        return '本轮无人被放逐。夜色又一次合拢，谁也没有赢。'
      case 'vote-out':
        return `${cue.seat} 号被放逐。请留下遗言——这是你最后一次说话。`
      case 'selfdestruct':
        return `${cue.seat} 号狼人自爆，白昼被硬生生掐断。`
      case 'result':
        return cue.winner === 'good'
          ? '破晓。最后一只狼倒下，林间终于有了光。'
          : '夜色吞没了最后一点火光。树林记得每一个名字。'
      default:
        return ''
    }
  }
}

export function makeLocalHost(): Host {
  return new LocalHost()
}
