import { Game } from './engine.mjs';
const remember = (g, id, event) => {
  const p = g.player(id);
  p.privateActions ||= [];
  p.privateActions.push({ day: g.day, ...event });
};
const clone = (g) => Object.assign(Object.create(Game.prototype), structuredClone(g));
function actions(g, id, action, { allowNull = false, nonWolf = false } = {}) {
  const list = g
    .living()
    .filter((p) => p.id !== id && (!nonWolf || p.role !== 'wolf'))
    .map((p) => ({ action, target: p.id }));
  if (allowNull) list.push({ action, target: null });
  return list;
}
async function decide(g, id, task, allowed, provider, extra = {}) {
  const view = { ...g.perspective(id), task, ...extra, allowedActions: allowed };
  const d = await provider.decide(view);
  const valid = allowed.find((a) => a.action === d.action && a.target === d.target);
  if (!valid) throw Error(`${id} 号返回非法动作，本轮未结算`);
  return valid;
}
export async function prepareLinxNight(g, provider) {
  if (g.phase !== 'night' || g.nightReady) return;
  // All wolves decide against the same public snapshot, with only lawful team knowledge.
  const results = await Promise.allSettled(
    g
      .living()
      .filter((p) => p.role === 'wolf' && p.id !== 1)
      .map((p) =>
        decide(g, p.id, 'night-wolf', actions(g, p.id, 'attack', { nonWolf: true }), provider),
      ),
  );
  const failure = results.find((r) => r.status === 'rejected');
  if (failure) throw failure.reason;
  const votes = results.map((r) => r.value);
  const tally = {};
  for (const d of votes) tally[d.target] = (tally[d.target] || 0) + 1;
  g.attack =
    Object.keys(tally)
      .sort((a, b) => tally[b] - tally[a] || Number(a) - Number(b))
      .map(Number)[0] ?? null;
  for (const p of g.living().filter((p) => p.role === 'seer' && p.id !== 1)) {
    const d = await decide(g, p.id, 'night-seer', actions(g, p.id, 'inspect'), provider);
    p.known[d.target] = g.player(d.target).role === 'wolf';
  }
  g.nightReady = true;
  for (const p of g.living().filter((p) => p.role === 'wolf' && p.id !== 1))
    remember(g, p.id, { action: 'team-attack', target: g.attack });
}
async function resolveHunter(g, provider) {
  if (g.phase !== 'ai-hunter') return;
  const p = g.player(g.pendingHunter),
    d = await decide(
      g,
      p.id,
      'hunter-shot',
      actions(g, p.id, 'shoot', { allowNull: true }),
      provider,
    );
  p.shot = true;
  if (d.target !== null) {
    const victim = g.player(d.target);
    victim.alive = false;
    victim.cause = 'shot';
    g.add('主持人', `${p.id} 号猎人发动技能，带走 ${victim.id} 号。`);
  } else g.add('主持人', `${p.id} 号猎人选择不开枪。`);
  g.pendingHunter = null;
  if (!g.checkWin()) {
    if (g.resume === 'discussion') g.beginDiscussion();
    else g.phase = 'result';
  }
}
async function night(g, body, provider) {
  if (g.phase !== 'night') throw Error('当前不是夜晚');
  if (!g.nightReady) await prepareLinxNight(g, provider);
  const me = g.players[0];
  if (me.alive) {
    if (me.role === 'seer') {
      const p = g.validTarget(body.target);
      me.known[p.id] = p.role === 'wolf';
      g.privateLog.push(
        `第 ${g.day} 夜：${p.id} 号 ${p.name} 是${p.role === 'wolf' ? '狼人' : '好人'}。`,
      );
    }
    if (me.role === 'wolf') {
      const p = g.validTarget(body.target);
      if (p.role === 'wolf') throw Error('不能袭击狼队友');
      g.attack = p.id;
      for (const wolf of g.living().filter((x) => x.role === 'wolf' && x.id !== 1))
        remember(g, wolf.id, { action: 'final-team-attack', target: g.attack });
    }
    if (me.role === 'witch') {
      if (!['skip', 'save', 'poison'].includes(body.choice)) throw Error('请选择用药或跳过');
      if (body.choice === 'save') {
        if (!me.antidote || g.attack === 1 || !g.attack) throw Error('解药不可用，女巫不能自救');
        me.antidote = false;
        g.saved = true;
      }
      if (body.choice === 'poison') {
        if (!me.poison) throw Error('毒药已使用');
        g.poisoned = g.validTarget(body.target).id;
        me.poison = false;
      }
    }
  }
  const witch = g.living().find((p) => p.role === 'witch' && p.id !== 1);
  if (witch) {
    const allowed = [{ action: 'skip', target: null }];
    if (witch.antidote && g.attack && g.attack !== witch.id)
      allowed.push({ action: 'save', target: g.attack });
    if (witch.poison) allowed.push(...actions(g, witch.id, 'poison'));
    const d = await decide(g, witch.id, 'night-witch', allowed, provider, {
      antidote: witch.antidote,
      poison: witch.poison,
      attack: witch.antidote ? g.attack : null,
    });
    if (d.action === 'save') {
      g.saved = true;
      witch.antidote = false;
    }
    if (d.action === 'poison') {
      g.poisoned = d.target;
      witch.poison = false;
    }
    remember(g, witch.id, {
      ...d,
      antidoteRemaining: witch.antidote,
      poisonRemaining: witch.poison,
    });
  }
  const dead = [...new Set([!g.saved ? g.attack : null, g.poisoned].filter(Boolean))];
  for (const id of dead) {
    const p = g.player(id);
    p.alive = false;
    p.cause = id === g.poisoned ? 'poison' : 'wolf';
  }
  g.phase = 'dawn';
  g.add(
    '主持人',
    dead.length
      ? `天亮了。昨夜 ${dead.map((id) => `${id} 号`).join('、')} 玩家出局。`
      : '天亮了。昨夜是平安夜。',
  );
  g.afterDeaths(dead, 'discussion');
  await resolveHunter(g, provider);
}
// Never publish a partially resolved phase: failure discards this clone and preserves original state.
export async function transact(original, path, body, provider) {
  const g = clone(original);
  switch (path) {
    case '/api/night':
      await night(g, body, provider);
      break;
    case '/api/ai': {
      if (g.phase !== 'discussion' || !g.speaker || g.speaker === 1)
        throw Error('当前没有 AI 发言');
      const text = await provider.speech({ ...g.perspective(g.speaker), task: 'speech' });
      g.speech(g.speaker, text);
      break;
    }
    case '/api/speech':
      g.speech(1, body.text);
      break;
    case '/api/vote': {
      if (g.phase !== 'vote') throw Error('当前不是投票阶段');
      if (body.target) {
        if (!g.players[0].alive) throw Error('出局玩家不能投票');
        g.validTarget(body.target);
      }
      const decisions = {};
      const voters = g.living().filter((p) => p.id !== 1);
      const results = await Promise.allSettled(
        voters.map((p) =>
          decide(g, p.id, 'vote', actions(g, p.id, 'vote', { allowNull: true }), provider),
        ),
      );
      const failure = results.find((r) => r.status === 'rejected');
      if (failure) throw failure.reason;
      results.forEach((r, i) => (decisions[voters[i].id] = r.value.target));
      g.vote(body.target, decisions);
      await resolveHunter(g, provider);
      break;
    }
    case '/api/next':
      g.nextNight();
      await prepareLinxNight(g, provider);
      break;
    case '/api/shoot':
      g.shoot(body.target);
      break;
    default:
      throw Error('接口不存在');
  }
  return g;
}
