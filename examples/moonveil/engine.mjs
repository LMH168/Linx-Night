import { randomInt, randomUUID } from 'node:crypto';
export const ROLE_NAMES = {
  wolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  villager: '村民',
};
const profiles = [
  ['你', '独立思考'],
  ['林间', '沉着的观察者'],
  ['阿雾', '直觉派选手'],
  ['北辰', '逻辑推理派'],
  ['小鹿', '温柔而坚定'],
  ['夜航', '大胆的质疑者'],
  ['知更', '细节捕手'],
  ['白榆', '谨慎的倾听者'],
  ['拾光', '冷静的分析者'],
];
const pick = (a) => (a.length ? a[randomInt(a.length)] : null);
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export class Game {
  constructor({ role = 'seer', size = 9, aiMode = 'demo' } = {}) {
    if (
      ![6, 9].includes(size) ||
      !Object.hasOwn(ROLE_NAMES, role) ||
      (size === 6 && role === 'hunter')
    )
      throw Error('无效的对局配置');
    const deck =
      size === 9
        ? ['wolf', 'wolf', 'wolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager']
        : ['wolf', 'wolf', 'seer', 'witch', 'villager', 'villager'];
    deck.splice(deck.indexOf(role), 1);
    shuffle(deck);
    deck.unshift(role);
    this.aiMode = aiMode;
    this.id = randomUUID();
    this.players = deck.map((r, i) => ({
      id: i + 1,
      name: profiles[i][0],
      style: profiles[i][1],
      role: r,
      alive: true,
      known: {},
      antidote: true,
      poison: true,
    }));
    this.day = 1;
    this.phase = 'night';
    this.log = [];
    this.privateLog = [];
    this.votes = [];
    this.winner = null;
    this.speaker = null;
    this.queue = [];
    this.add('主持人', '天黑请闭眼。月光之下，每个人都有自己的秘密。');
    this.prepareNight();
  }
  add(who, text, kind = 'system') {
    this.log.push({ id: this.log.length + 1, day: this.day, phase: this.phase, who, text, kind });
  }
  living() {
    return this.players.filter((p) => p.alive);
  }
  player(id) {
    return this.players.find((p) => p.id === Number(id));
  }
  prepareNight() {
    this.phase = 'night';
    this.speaker = null;
    if (this.aiMode === 'linx') {
      this.attack = null;
      this.saved = false;
      this.poisoned = null;
      this.nightReady = false;
      return;
    }
    const victims = this.living().filter((p) => p.role !== 'wolf');
    this.attack = pick(victims)?.id;
    this.saved = false;
    this.poisoned = null;
    for (const p of this.living().filter((p) => p.role === 'seer' && p.id !== 1)) {
      const t = pick(this.living().filter((x) => x.id !== p.id && p.known[x.id] === undefined));
      if (t) p.known[t.id] = t.role === 'wolf';
    }
  }
  validTarget(id, { self = false } = {}) {
    const p = this.player(id);
    if (!p?.alive || (!self && p.id === 1)) throw Error('请选择一位其他存活玩家');
    return p;
  }
  actNight({ target, choice } = {}) {
    if (this.phase !== 'night') throw Error('当前不是夜晚');
    const me = this.players[0];
    if (me.alive) {
      if (me.role === 'seer') {
        const t = this.validTarget(target);
        me.known[t.id] = t.role === 'wolf';
        this.privateLog.push(
          `第 ${this.day} 夜：${t.id} 号 ${t.name} 是${t.role === 'wolf' ? '狼人' : '好人'}。`,
        );
      }
      if (me.role === 'wolf') {
        const t = this.validTarget(target);
        if (t.role === 'wolf') throw Error('本体验版不允许自刀或刀队友');
        this.attack = t.id;
      }
      if (me.role === 'witch') {
        if (!['save', 'poison', 'skip'].includes(choice)) throw Error('请选择用药或跳过');
        if (choice === 'save') {
          if (!me.antidote || this.attack === 1) throw Error('解药不可用，女巫不能自救');
          me.antidote = false;
          this.saved = true;
        }
        if (choice === 'poison') {
          if (!me.poison) throw Error('毒药已使用');
          const t = this.validTarget(target);
          me.poison = false;
          this.poisoned = t.id;
        }
      }
    }
    // Resolve AI medicine only after the final wolf target is known.
    const witch = this.living().find((p) => p.role === 'witch' && p.id !== 1);
    if (witch) {
      if (witch.antidote && this.attack !== witch.id) {
        this.saved = true;
        witch.antidote = false;
      } else if (witch.poison && this.day > 1) {
        const t = pick(this.living().filter((x) => x.id !== witch.id));
        if (t && randomInt(3) === 0) {
          this.poisoned = t.id;
          witch.poison = false;
        }
      }
    }

    const dead = [];
    if (!this.saved && this.attack) dead.push(this.attack);
    if (this.poisoned && !dead.includes(this.poisoned)) dead.push(this.poisoned);
    for (const id of dead) {
      const p = this.player(id);
      p.alive = false;
      p.cause = id === this.poisoned ? 'poison' : 'wolf';
    }
    this.phase = 'dawn';
    this.add(
      '主持人',
      dead.length
        ? `天亮了。昨夜 ${dead.map((id) => `${id} 号`).join('、')} 玩家出局。`
        : '天亮了。昨夜是平安夜。',
    );
    this.afterDeaths(dead, 'discussion');
  }
  afterDeaths(dead, next) {
    const h = dead
      .map((id) => this.player(id))
      .find((p) => p.role === 'hunter' && p.cause !== 'poison' && !p.shot);
    if (h) {
      if (this.aiMode === 'linx' && h.id !== 1) {
        this.phase = 'ai-hunter';
        this.pendingHunter = h.id;
        this.resume = next;
        return;
      }
      h.shot = true;
      if (h.id === 1) {
        this.phase = 'hunter';
        this.resume = next;
        return;
      }
      const target = pick(this.living());
      if (target) {
        target.alive = false;
        target.cause = 'shot';
        this.add('主持人', `${h.id} 号猎人发动技能，带走 ${target.id} 号。`);
      }
    }
    if (this.checkWin()) return;
    if (next === 'discussion') this.beginDiscussion();
    else this.phase = 'result';
  }
  shoot(target) {
    if (this.phase !== 'hunter') throw Error('当前不能开枪');
    if (target) {
      const p = this.validTarget(target);
      p.alive = false;
      p.cause = 'shot';
      this.add('主持人', `1 号猎人发动技能，带走 ${p.id} 号。`);
    } else this.add('主持人', '1 号猎人选择不开枪。');
    if (!this.checkWin()) {
      if (this.resume === 'discussion') this.beginDiscussion();
      else this.phase = 'result';
    }
  }
  beginDiscussion() {
    this.phase = 'discussion';
    this.queue = this.living().map((p) => p.id);
    this.speaker = this.queue.shift();
    this.add('主持人', '请按座位顺序发言。独立判断，留意每个人的逻辑。');
  }
  perspective(id) {
    const p = this.player(id);
    return {
      privateActions: p.privateActions || [],
      gameId: this.id,
      phase: this.phase,
      votes: this.votes.map((v) => ({ ...v })),
      seat: id,
      name: p.name,
      style: p.style,
      role: ROLE_NAMES[p.role],
      day: this.day,
      alive: this.living().map((x) => ({ id: x.id, name: x.name })),
      known: p.known,
      teammates:
        p.role === 'wolf'
          ? this.players.filter((x) => x.role === 'wolf' && x.id !== id).map((x) => x.id)
          : [],
      publicLog: this.log.slice(-28),
    };
  }
  fallbackSpeech(id) {
    const p = this.player(id),
      others = this.living().filter((x) => x.id !== id);
    const checked =
      Object.entries(p.known).find(([n, w]) => w && this.player(n)?.alive) ||
      Object.entries(p.known).at(-1);
    if (p.role === 'seer' && checked)
      return `我是预言家。我查验过 ${checked[0]} 号，结果是${checked[1] ? '狼人' : '好人'}。这是我的查验信息，请大家结合发言判断，今天不要分票。`;
    const target = pick(others.filter((x) => p.role !== 'wolf' || x.role !== 'wolf'));
    if (!target) return '我会认真听大家发言，再决定投票。';
    const lines = [
      `现在是第 ${this.day} 天，我更在意谁的判断有依据。${target.id} 号，你最怀疑谁？希望下一轮说清楚理由。`,
      `先不急着站边。我暂时关注 ${target.id} 号，不过这只是猜测，不是查验结果。大家把已知信息说完整。`,
      `我的思路很简单：看发言和票型能不能对得上。目前我对 ${target.id} 号有疑问，还需要听更多信息。`,
      `大家别被语气带着走。我想听听 ${target.id} 号的视角，也会认真看这一轮投票。`,
    ];
    return lines[(id + this.day) % lines.length];
  }
  speech(id, text) {
    if (this.phase !== 'discussion' || this.speaker !== id) throw Error('还没有轮到你发言');
    if (typeof text !== 'string' || !text.trim() || text.length > 1200)
      throw Error('发言需为 1–1200 字');
    this.add(`${id} 号 · ${this.player(id).name}`, text.trim(), 'speech');
    this.speaker = this.queue.shift() ?? null;
    if (!this.speaker) {
      this.phase = 'vote';
      this.add('主持人', '发言结束。请选择放逐对象，也可以弃票。');
    }
  }
  aiVote(p) {
    const choices = this.living().filter(
      (x) => x.id !== p.id && (p.role !== 'wolf' || x.role !== 'wolf'),
    );
    const known = choices.find((x) => p.known[x.id] === true);
    return (known || pick(choices))?.id ?? null;
  }
  vote(target, decisions = null) {
    if (this.phase !== 'vote') throw Error('当前不是投票阶段');
    if (target && !this.players[0].alive) throw Error('出局玩家不能投票');
    if (target) this.validTarget(target);
    this.votes = this.living().map((p) => ({
      from: p.id,
      to:
        p.id === 1
          ? target
            ? Number(target)
            : null
          : decisions
            ? decisions[p.id]
            : this.aiVote(p),
    }));
    const tally = {};
    for (const v of this.votes) if (v.to) tally[v.to] = (tally[v.to] || 0) + 1;
    this.add(
      '主持人',
      '本轮票型：' +
        this.votes.map((v) => `${v.from} 号 → ${v.to ? `${v.to} 号` : '弃票'}`).join('；'),
    );
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((x) => tally[x] === max);
    this.phase = 'result';
    if (top.length !== 1) {
      this.add('主持人', '本轮平票或全部弃票，无人出局。即将进入下一夜。');
      return;
    }
    const p = this.player(top[0]);
    p.alive = false;
    p.cause = 'vote';
    this.add('主持人', `${p.id} 号 ${p.name} 以 ${max} 票被放逐。`);
    this.afterDeaths([p.id], 'result');
  }
  checkWin() {
    const live = this.living();
    if (!live.some((p) => p.role === 'wolf')) this.winner = 'good';
    else if (
      !live.some((p) => p.role === 'villager') ||
      !live.some((p) => ['seer', 'witch', 'hunter'].includes(p.role))
    )
      this.winner = 'wolf';
    if (this.winner) {
      this.phase = 'over';
      this.add(
        '主持人',
        this.winner === 'good'
          ? '所有狼人已出局，好人阵营获胜！'
          : '神职或村民全部出局，狼人阵营获胜！',
      );
      return true;
    }
    return false;
  }
  nextNight() {
    if (this.phase !== 'result') throw Error('还不能进入下一夜');
    this.day++;
    this.add('主持人', `第 ${this.day} 夜降临。天黑请闭眼。`);
    this.prepareNight();
  }
  view() {
    const me = this.players[0];
    return {
      aiMode: this.aiMode,
      id: this.id,
      day: this.day,
      phase: this.phase,
      speaker: this.speaker,
      winner: this.winner,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        style: p.style,
        alive: p.alive,
        role:
          p.id === 1 || this.phase === 'over' || (me.role === 'wolf' && p.role === 'wolf') || p.shot
            ? p.role
            : null,
        known: me.known[p.id] ?? null,
      })),
      log: this.log,
      privateLog: this.privateLog,
      votes: this.votes,
      me: { role: me.role, alive: me.alive, antidote: me.antidote, poison: me.poison },
      attack:
        this.phase === 'night' && me.alive && me.role === 'witch' && me.antidote
          ? this.attack
          : null,
    };
  }
}
