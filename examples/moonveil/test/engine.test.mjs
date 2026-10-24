import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../engine.mjs';
function rig(roles) {
  const g = new Game({ role: roles[0], size: roles.length });
  g.players.forEach((p, i) => {
    p.role = roles[i];
    p.alive = true;
    p.known = {};
    p.antidote = p.poison = true;
  });
  g.saved = false;
  g.poisoned = null;
  return g;
}
test('private identities stay private', () => {
  const g = new Game();
  assert.equal(g.view().players.filter((p) => p.role).length, 1);
  const p = g.players.find((p) => p.role === 'villager'),
    v = g.perspective(p.id);
  assert.deepEqual(v.teammates, []);
  assert.ok(v.alive.every((p) => !('role' in p)));
  assert.equal(g.view().attack, null);
});
test('seer checks private information and only at night', () => {
  const g = rig(['seer', 'wolf', 'villager', 'villager', 'witch', 'wolf']);
  g.attack = 3;
  g.saved = true;
  g.actNight({ target: 2 });
  assert.equal(g.view().players[1].known, true);
  assert.equal(g.view().players[1].role, null);
  assert.match(g.privateLog[0], /狼人/);
  assert.throws(() => g.actNight({ target: 2 }));
});
test('witch cannot self-save or reuse medicine', () => {
  const g = rig(['witch', 'wolf', 'villager', 'seer', 'villager', 'wolf']);
  g.attack = 1;
  assert.throws(() => g.actNight({ choice: 'save' }));
  assert.ok(g.players[0].antidote);
  g.attack = 3;
  g.actNight({ choice: 'save' });
  assert.ok(g.player(3).alive);
  assert.equal(g.players[0].antidote, false);
  g.phase = 'night';
  assert.throws(() => g.actNight({ choice: 'save' }));
});
test('poisoned hunter cannot fire', () => {
  const g = rig([
    'witch',
    'wolf',
    'hunter',
    'seer',
    'villager',
    'wolf',
    'villager',
    'villager',
    'wolf',
  ]);
  g.saved = true;
  g.actNight({ choice: 'poison', target: 3 });
  assert.equal(g.player(3).alive, false);
  assert.equal(g.player(3).shot, undefined);
  assert.equal(g.phase, 'discussion');
});
test('human hunter resolves shot before proceeding', () => {
  const g = rig([
    'hunter',
    'wolf',
    'witch',
    'seer',
    'villager',
    'wolf',
    'villager',
    'villager',
    'wolf',
  ]);
  g.attack = 1;
  g.player(3).antidote = false;
  g.actNight();
  assert.equal(g.phase, 'hunter');
  g.shoot(2);
  assert.equal(g.player(2).alive, false);
  assert.equal(g.phase, 'discussion');
});
test('ties eliminate nobody and dead players cannot vote', () => {
  const g = rig(['seer', 'wolf', 'witch', 'villager', 'villager', 'wolf']);
  g.phase = 'vote';
  g.aiVote = (p) => (p.id === 2 ? 3 : null);
  g.vote(2);
  assert.ok(g.players.every((p) => p.alive));
  assert.equal(g.phase, 'result');
  g.phase = 'vote';
  g.player(1).alive = false;
  assert.throws(() => g.vote(2));
});
test('wolf elimination and category elimination determine wins', () => {
  const g = rig(['seer', 'wolf', 'witch', 'villager', 'villager', 'wolf']);
  g.players.filter((p) => p.role === 'wolf').forEach((p) => (p.alive = false));
  assert.ok(g.checkWin());
  assert.equal(g.winner, 'good');
  const h = rig(['seer', 'wolf', 'witch', 'villager', 'villager', 'wolf']);
  h.players.filter((p) => p.role === 'villager').forEach((p) => (p.alive = false));
  assert.ok(h.checkWin());
  assert.equal(h.winner, 'wolf');
});
test('invalid configuration and out-of-turn actions are rejected', () => {
  assert.throws(() => new Game({ role: 'admin' }));
  const g = new Game();
  assert.throws(() => g.speech(1, 'test'));
  assert.throws(() => g.vote(2));
  assert.throws(() => g.actNight({ target: 1 }));
  assert.throws(() => g.nextNight());
});
test('90 simulated complete games reach a legal result', () => {
  for (const size of [6, 9])
    for (const role of ['seer', 'wolf', 'witch', 'villager', ...(size === 9 ? ['hunter'] : [])])
      for (let run = 0; run < 10; run++) {
        const g = new Game({ role, size });
        let turns = 0;
        while (g.phase !== 'over' && turns++ < 700) {
          const target = g
            .living()
            .find((p) => p.id !== 1 && (role !== 'wolf' || p.role !== 'wolf'))?.id;
          switch (g.phase) {
            case 'night':
              g.actNight({ target, choice: 'skip' });
              break;
            case 'hunter':
              g.shoot(target);
              break;
            case 'discussion':
              g.speech(
                g.speaker,
                g.speaker === 1 ? '我会根据发言判断。' : g.fallbackSpeech(g.speaker),
              );
              break;
            case 'vote':
              g.vote(g.players[0].alive ? target : null);
              break;
            case 'result':
              g.nextNight();
              break;
            default:
              assert.fail(g.phase);
          }
        }
        assert.equal(g.phase, 'over');
        assert.ok(['wolf', 'good'].includes(g.winner));
      }
});
