const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const names = { wolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人', villager: '村民' },
  icons = { wolf: '♜', seer: '✧', witch: '⚗', hunter: '⌖', villager: '♧' };
const tips = {
  wolf: '与同伴隐藏身份，夜晚选择袭击目标。神职或村民全部出局即可获胜。',
  seer: '每晚查验一位玩家的阵营。你的查验结果只在私人笔记中展示。',
  witch: '拥有一瓶解药、一瓶毒药。每晚最多用一瓶，不可自救。',
  hunter: '被狼人袭击或投票放逐后，可以开枪带走一人。被毒杀不能开枪。',
  villager: '你没有夜间技能。认真倾听每一段发言，用推理找出隐藏的狼人。',
};
let size = 9,
  game = null,
  connectionState = null,
  selected = null,
  busy = false,
  sound = false,
  recorder = null,
  voiceState = 'idle',
  toastTimer,
  mode = 'demo',
  lastSpoken = 0,
  history = [];
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
try {
  history = JSON.parse(localStorage.getItem('moonveil-history') || '[]');
  if (!Array.isArray(history)) history = [];
} catch {}
function toast(t) {
  $('#toast').textContent = t;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4000);
}
function openModal(html) {
  $('#modal-content').innerHTML = html;
  $('#modal').showModal();
}
$('#close-modal').onclick = () => {
  stopPlayback();
  $('#modal').close();
};
$('#modal').addEventListener('click', (e) => {
  if (e.target === $('#modal')) {
    const r = e.target.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      e.target.close();
  }
});
const rulesHTML = `<h2>每个声音，都有两面。</h2><p>天黑行动，天亮发言。好人找出全部狼人；狼人让<strong>神职或村民全部出局</strong>，即可获胜。</p><div class="rule-grid">${Object.entries(
  names,
)
  .map(
    ([r, n]) => `<div class="rule-card"><strong>${icons[r]} ${n}</strong><p>${tips[r]}</p></div>`,
  )
  .join(
    '',
  )}<div class="rule-card"><strong>☾ 本体验版约定</strong><p>无警长；按座位顺序发言；不可投自己；平票无人出局。9 人为 3 狼、预女猎、3 民；6 人为 2 狼、预女、2 民。</p></div></div><p>夜间选择目标 → 确认行动 → 依次发言 → 放逐投票 → 下一夜。出局后可继续观战，身份在结局揭晓。</p><p class="hint">语音识别仅填入发言框，请检查后提交。夜间行动和投票都需要点击确认。</p>`;
$('#rules-nav').onclick = $('#learn-btn').onclick = () => openModal(rulesHTML);
function showHistory() {
  openModal(
    `<h2>对局回顾</h2>${
      history.length
        ? history
            .slice(0, 10)
            .map(
              (h) =>
                `<div class="rule-card"><strong>${escape(h.title)} · ${escape(h.result)}</strong><p>${escape(h.date)} · ${h.days} 天 · 你的身份：${escape(h.role)}</p><p>${escape(h.players)}</p></div>`,
            )
            .join('')
        : '<p>这里还没有完成的对局。进入村庄，写下你的第一个故事。</p>'
    }<p class="hint">只在此浏览器保存最近 10 局结果，不保存录音。</p>`,
  );
}
$('#history-nav').onclick = showHistory;
async function loadVoiceList() {
  try {
    const d = await fetch(voiceEndpoint + '/voices').then((r) => r.json());
    if (!$('#voice-list')) return;
    $('#voice-list').innerHTML = d.players
      .map(
        (p) =>
          `<p>${p.seat} 号 ${escape(p.name)} · ${escape(p.voiceName)} <button class="secondary" data-preview="${p.seat}">试听</button></p>`,
      )
      .join('');
    $$('[data-preview]').forEach(
      (b) =>
        (b.onclick = () => {
          const p = d.players.find((p) => p.seat === Number(b.dataset.preview));
          mode = 'linx';
          speakEntries(
            [
              {
                kind: 'speech',
                who: `${p.seat} 号 · ${p.name}`,
                text: `我是${p.name}。请认真听我的发言，一起找出隐藏的狼人。`,
              },
            ],
            { force: true },
          );
        }),
    );
  } catch {
    if ($('#voice-list')) $('#voice-list').textContent = '音色服务暂不可用';
  }
}
$('#settings-nav').onclick = async () => {
  stopRecording();
  try {
    connectionState = await fetch('/api/status').then((r) => r.json());
    mode = connectionState.mode;
  } catch {
    toast('无法读取连接状态');
    return;
  }
  const ready = connectionState.ready;
  openModal(
    `<h2>让每个声音，拥有自己的思考。</h2><div class="rule-card"><strong>${ready ? '独立智能体已配置' : '等待灵矽配置'}</strong><p>已配置 ${connectionState.configuredPlayers} / 8 位玩家。每位玩家使用独立智能体和网页虚拟设备，不需要实体硬件。</p></div><p>本地配置 API-KEY 后运行初始化命令，即可自动创建玩家并绑定虚拟设备。</p><p>灵矽模式中，每位 AI 的发言、夜间行动和投票均由对应智能体生成。失败时保留当前阶段，可重试，不会切换成模拟输出。</p><p class="hint">AI 玩家使用各自的灵矽音色，主持人使用浏览器朗读。下方验证会请求 8 个智能体真实输出，可能产生平台调用费用。密钥只保存在服务端。</p><button class="primary" id="check-linx" ${ready ? '' : 'disabled'}>检查全部智能体</button><div id="connection-result" role="status"></div><h3>玩家音色</h3><div id="voice-list">正在加载音色…</div>`,
  );
  loadVoiceList();
  $('#check-linx').onclick = async () => {
    const b = $('#check-linx');
    b.disabled = true;
    $('#connection-result').innerHTML = '<p>正在逐个验证 8 个独立智能体，请稍候…</p>';
    try {
      const d = await api('/api/linx/check', { testOutput: true });
      if (!$('#connection-result')) return;
      $('#connection-result').innerHTML = d.players
        .map(
          (p) =>
            `<p>✓ ${p.seat} 号 ${escape(p.name)} · 绑定正确 · ${p.outputVerified ? '真实输出验证通过' : '尚未验证输出'}</p>`,
        )
        .join('');
      $('#mode-label').textContent = '灵矽 · 8 位玩家已验证';
    } catch (e) {
      if ($('#connection-result')) $('#connection-result').textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
};
$$('[data-size]').forEach(
  (b) =>
    (b.onclick = () => {
      size = Number(b.dataset.size);
      $$('[data-size]').forEach((x) => x.classList.toggle('selected', x === b));
      $('#ai-count').textContent = size - 1;
      $('#role-select option[value="hunter"]').disabled = size === 6;
      if (size === 6 && $('#role-select').value === 'hunter') $('#role-select').value = 'seer';
    }),
);
async function api(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || '请求失败');
  return d;
}
async function action(path, body = {}) {
  if (busy) return;
  busy = true;
  stopRecording();
  stopPlayback();
  if (mode === 'linx' && path !== '/api/speech') {
    const hint = $('#action-panel p');
    if (hint) hint.textContent = '智能体正在独立思考，请稍候。完成后会自动显示结果。';
  }
  $('#leave-btn').disabled = true;
  $$('#action-panel button').forEach((b) => (b.disabled = true));
  try {
    game = await api(path, { gameId: game?.id, ...body });
    selected = null;
    render();
    await speakLatest();
    if (game.phase === 'over') saveHistory();
  } catch (e) {
    toast(e.message);
    render();
  } finally {
    busy = false;
    $('#leave-btn').disabled = false;
  }
}
$('#start-btn').onclick = async () => {
  if (busy) return;
  busy = true;
  $('#start-btn').disabled = true;
  $('#start-btn').textContent = '正在准备玩家…';
  try {
    game = await api('/api/game', { size, role: $('#role-select').value });
    mode = game.aiMode;
    selected = null;
    lastSpoken = 0;
    $('#notepad').value = '';
    $('#lobby').hidden = true;
    $('#game').hidden = false;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
    $('#start-btn').disabled = false;
    $('#start-btn').textContent = '进入村庄 →';
  }
};
function leave() {
  stopRecording();
  stopPlayback();
  $('#lobby').hidden = false;
  $('#game').hidden = true;
}
$('#leave-btn').onclick = () => {
  if (busy) return toast('请等待当前智能体操作完成');
  if (game?.phase === 'over') return leave();
  openModal(
    '<h2>暂时离开村庄？</h2><p>返回大厅可以稍后继续；结束本局会释放所有智能体，之后可以重新开局。</p><div class="action-row"><button class="secondary" id="confirm-leave">暂回大厅</button><button class="primary" id="end-game">结束本局</button></div>',
  );
  $('#confirm-leave').onclick = () => {
    $('#modal').close();
    leave();
    $('#start-btn').disabled = true;
    if (!$('#resume-btn')) {
      const b = document.createElement('button');
      b.id = 'resume-btn';
      b.className = 'secondary';
      b.textContent = '继续对局';
      b.onclick = () => {
        $('#game').hidden = false;
        $('#lobby').hidden = true;
        render();
      };
      $('.launch-bar').append(b);
    }
  };
  $('#end-game').onclick = async () => {
    try {
      await api('/api/end', { gameId: game.id });
      $('#modal').close();
      leave();
      game = null;
      $('#resume-btn')?.remove();
      $('#start-btn').disabled = false;
    } catch (e) {
      toast(e.message);
    }
  };
};
$('#lobby-nav').onclick = () => {
  if (!$('#game').hidden) $('#leave-btn').click();
};
function setSound(enabled) {
  sound = enabled;
  $('#sound-btn').textContent = sound ? '♬ 语音已开启' : '♬ 开启语音';
  try {
    sessionStorage.setItem('moonveil-sound', String(sound));
  } catch {}
}
try {
  setSound(sessionStorage.getItem('moonveil-sound') === 'true');
} catch {}
$('#sound-btn').onclick = () => {
  setSound(!sound);
  if (sound) {
    setPlaybackStatus('语音已开启。AI 发言将使用各自的灵矽音色。');
    say('欢迎来到月隐。请听从主持人的指引。');
  } else stopPlayback();
};
let speechGeneration = 0,
  playingAudio = null,
  audioAbort = null,
  playbackDone = null;
let playbackActive = false;
function setPlaybackStatus(text) {
  const status = $('#playback-status');
  if (status) status.textContent = text;
}
function lockPlayback(active) {
  playbackActive = active;
  $$('#action-panel button').forEach((button) => {
    if (active) {
      if (!button.hasAttribute('data-playback-disabled'))
        button.dataset.playbackDisabled = String(button.disabled);
      button.disabled = true;
    } else if (button.hasAttribute('data-playback-disabled')) {
      button.disabled = button.dataset.playbackDisabled === 'true';
      delete button.dataset.playbackDisabled;
    }
  });
  if ($('#stop-audio-btn')) $('#stop-audio-btn').hidden = !active;
}
function stopPlayback() {
  speechGeneration++;
  audioAbort?.abort();
  audioAbort = null;
  if (playingAudio) {
    playingAudio.pause();
    playingAudio.remove();
    playingAudio.src = '';
    playingAudio = null;
  }
  playbackDone?.();
  playbackDone = null;
  window.speechSynthesis?.cancel();
  $('.wave')?.classList.remove('playing');
  lockPlayback(false);
}
$('#stop-audio-btn').onclick = () => {
  stopPlayback();
  setPlaybackStatus('已停止语音，可以继续下一步或重听发言。');
};
function browserSpeak(text, generation) {
  return new Promise((resolve) => {
    if (generation !== speechGeneration || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.95;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('zh'));
    if (voice) u.voice = voice;
    playbackDone = resolve;
    u.onend = u.onerror = () => {
      playbackDone = null;
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
}
const voiceCache = new Map();
async function playVoice(seat, text, generation) {
  const cacheKey = JSON.stringify([seat, text]);
  let blob = voiceCache.get(cacheKey);
  setPlaybackStatus(`正在生成 ${seat} 号玩家的声音，请稍候；生成完成后会自动播放。`);
  if (!blob) {
    audioAbort = new AbortController();
    const r = await fetch(voiceEndpoint + '/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat, text }),
      signal: AbortSignal.any([audioAbort.signal, AbortSignal.timeout(120000)]),
    });
    if (!r.ok) {
      const d = await r.json();
      throw Error(d.error || '语音生成失败');
    }
    blob = await r.blob();
    if (generation !== speechGeneration) return;
    voiceCache.set(cacheKey, blob);
    if (voiceCache.size > 8) voiceCache.delete(voiceCache.keys().next().value);
  }
  if (generation !== speechGeneration) return;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.id = 'active-voice-audio';
  audio.controls = true;
  $('#audio-player').replaceChildren(audio);
  playingAudio = audio;
  try {
    await new Promise((resolve, reject) => {
      playbackDone = resolve;
      audio.onplaying = () => setPlaybackStatus(`正在播放 ${seat} 号玩家的声音。`);
      audio.onpause = () => {
        if (generation === speechGeneration && !audio.ended)
          setPlaybackStatus('语音已暂停，点击播放器继续，或停止语音进入下一步。');
      };
      audio.onended = resolve;
      audio.onerror = () => reject(Error('当前浏览器无法播放该音频，请重听或更换浏览器'));
      audio.play().catch((error) => {
        if (generation !== speechGeneration) return resolve();
        if (error.name === 'NotAllowedError') {
          setPlaybackStatus('浏览器拦截了自动播放，请点击下方播放器的播放按钮。');
        } else reject(error);
      });
    });
  } finally {
    audio.onpause = audio.onplaying = audio.onended = audio.onerror = null;
    audio.pause();
    audio.remove();
    audio.src = '';
    URL.revokeObjectURL(url);
    if (generation === speechGeneration) {
      playingAudio = null;
      playbackDone = null;
    }
  }
}
async function speakEntries(entries, { force = false } = {}) {
  if (force) setSound(true);
  if (!sound && !force) return;
  stopPlayback();
  const generation = speechGeneration;
  lockPlayback(true);
  $('.wave')?.classList.add('playing');
  try {
    for (const e of entries) {
      if (generation !== speechGeneration) break;
      const seat = e.kind === 'speech' ? Number(e.who.match(/^(\d+) 号/)?.[1]) : 0;
      if (mode === 'linx' && seat >= 2) await playVoice(seat, e.text, generation);
      else {
        setPlaybackStatus(`正在播报${e.who}的发言。`);
        await browserSpeak(e.text, generation);
      }
    }
    if (generation === speechGeneration) setPlaybackStatus('本段语音已播放完毕，可以继续下一位。');
  } catch (e) {
    if (generation === speechGeneration) {
      const message = e.name === 'TimeoutError' ? '语音服务响应超时' : e.message;
      setPlaybackStatus(`语音未播放：${message}。请点击重听发言重试。`);
      toast(message);
    }
  } finally {
    if (generation === speechGeneration) {
      $('.wave')?.classList.remove('playing');
      lockPlayback(false);
    }
  }
}
function say(text) {
  return speakEntries([{ who: '主持人', text, kind: 'system' }]);
}
function speakLatest() {
  if (!game) return;
  const entries = game.log.filter((l) => l.id > lastSpoken);
  lastSpoken = game.log.at(-1)?.id || 0;
  if (entries.length) return speakEntries(entries);
}

const voiceEndpoint = `${location.protocol}//${location.hostname}:4174`;
let voiceBase = '',
  voiceGameId = null,
  voiceDay = null;
function voiceStatus(text, error = false) {
  const el = $('#voice-status');
  if (el) {
    el.textContent = text;
    el.style.color = error ? '#e9b0a1' : '';
  }
}
function onVoiceState(state, detail = {}) {
  voiceState = state;
  const b = $('#mic-btn');
  if (b) {
    b.textContent =
      state === 'recording'
        ? `■ 结束录音 ${detail.seconds || 0}s`
        : state === 'starting'
          ? '正在打开麦克风…'
          : state === 'transcribing'
            ? '正在识别…'
            : '◉ 语音输入';
    b.disabled = state === 'starting' || state === 'transcribing';
  }
  if ($('#speak-btn')) $('#speak-btn').disabled = state !== 'idle';
  if ($('#speech-input')) $('#speech-input').readOnly = state !== 'idle';
  if (state === 'recording')
    voiceStatus(
      `录音中 · ${detail.seconds || 0}/60 秒 · ${(detail.level || 0) > 0.008 ? '已检测到声音' : '请对麦克风说话'} · 再次点击结束录音`,
    );
  if (state === 'starting') voiceStatus('正在请求麦克风权限，请在出现的提示中允许访问。');
  if (state === 'transcribing') voiceStatus('正在通过灵矽识别语音，请稍候…');
}
function stopRecording() {
  recorder?.cancel();
}
async function mic() {
  if (busy) return;
  if (voiceState === 'recording') {
    await recorder.stop();
    return;
  }
  if (voiceState !== 'idle') return;
  voiceState = 'starting';
  stopPlayback();
  voiceBase = $('#speech-input').value;
  voiceGameId = game.id;
  voiceDay = game.day;
  try {
    if (!recorder) {
      const { VoiceRecorder } = await import(voiceEndpoint + '/recorder.js');
      recorder = new VoiceRecorder({
        endpoint: voiceEndpoint,
        onState: onVoiceState,
        onText: (text) => {
          if (
            game?.id !== voiceGameId ||
            game.day !== voiceDay ||
            game.phase !== 'discussion' ||
            game.speaker !== 1 ||
            !$('#speech-input')
          )
            return;
          $('#speech-input').value = (voiceBase + text).slice(0, 1200);
          voiceStatus('识别完成，请检查文字后点击“结束发言”。');
        },
        onError: (message) => {
          voiceStatus(message, true);
          toast(message);
        },
      });
    }
    await recorder.start();
  } catch {
    onVoiceState('idle');
    voiceStatus('语音服务未连接，请启动项目的语音服务后重试。', true);
  }
}

function selectable(p) {
  if (!p.alive || p.id === 1) return false;
  return (
    (game.phase === 'night' &&
      game.me.alive &&
      ['seer', 'witch', 'wolf'].includes(game.me.role) &&
      (game.me.role !== 'wolf' || p.role !== 'wolf')) ||
    (game.phase === 'vote' && game.me.alive) ||
    game.phase === 'hunter'
  );
}
function render() {
  if (!game) return;
  mode = game.aiMode || mode;
  const g = game,
    night = g.phase === 'night';
  $('#game-title').textContent = g.players.length === 9 ? '迷雾村庄' : '林间初遇';
  $('#room-code').textContent = g.id.slice(0, 6).toUpperCase();
  $('#round').textContent = `第 ${g.day} ${night ? '夜' : '天'}`;
  $('#alive-count').textContent =
    `${g.players.filter((p) => p.alive).length} / ${g.players.length} 存活`;
  $$('#steps span').forEach((e, i) =>
    e.classList.toggle('current', i === (night ? 0 : g.phase === 'discussion' ? 1 : 2)),
  );
  $('#players').innerHTML = g.players
    .map(
      (p) =>
        `<button class="player ${p.alive ? '' : 'dead'} ${selected === p.id ? 'selected' : ''} ${g.speaker === p.id ? 'speaking' : ''}" data-player="${p.id}" ${selectable(p) ? '' : 'disabled'} aria-label="${p.id} 号 ${escape(p.name)}${p.alive ? '' : ' 已出局'}"><span class="seat">${String(p.id).padStart(2, '0')}</span><span class="avatar">${escape(p.name.slice(0, 1))}</span><span><strong>${p.id} 号 · ${escape(p.name)}</strong><small>${!p.alive ? '已出局' : g.speaker === p.id ? '◉ 正在发言' : p.id === 1 ? '你 · ' + names[p.role] : p.role ? names[p.role] : mode === 'linx' ? '灵矽玩家' : '模拟玩家'}</small></span></button>`,
    )
    .join('');
  $$('[data-player]').forEach(
    (b) =>
      (b.onclick = () => {
        if (busy) return;
        selected = Number(b.dataset.player);
        const draft = $('#speech-input')?.value;
        render();
        if (draft && $('#speech-input')) $('#speech-input').value = draft;
      }),
  );
  $('#my-role').textContent = names[g.me.role];
  $('#role-icon').textContent = icons[g.me.role];
  $('#my-camp').textContent =
    (g.me.role === 'wolf' ? '狼人阵营' : '好人阵营') + (g.me.alive ? ' · 存活' : ' · 已出局');
  $('#role-tip').textContent = tips[g.me.role];
  $('#log').innerHTML = g.log
    .map(
      (l) =>
        `<article class="log-entry ${l.kind}"><strong>${escape(l.who)}</strong><small>第 ${l.day} 天</small><p>${escape(l.text)}</p></article>`,
    )
    .join('');
  $('#log').scrollTop = $('#log').scrollHeight;
  $('#private-results').innerHTML = g.privateLog.length
    ? g.privateLog.map((t) => `<p>${escape(t)}</p>`).join('')
    : '尚无查验信息。这里的笔记只有你能看到。';
  const phaseText = {
    night: ['NIGHTFALL', '天黑，请闭眼', g.me.alive ? tips[g.me.role] : '你已出局，可以继续观战。'],
    discussion: [
      'VOICES IN THE MIST',
      `${g.speaker} 号，请发言`,
      g.speaker === 1
        ? '轮到你了。说出你的观察，让其他人听见你的判断。'
        : `${g.players.find((p) => p.id === g.speaker)?.name}正在等待发言。点击下方按钮聆听。`,
    ],
    vote: [
      'TRUST YOUR INSTINCT',
      '谁藏在谎言背后？',
      '点击座位选择放逐对象，确认后本轮投票不可更改。',
    ],
    result: ['THE VERDICT', '投票结果已揭晓', g.log.at(-1)?.text],
    hunter: ['THE LAST SHOT', '猎人，请选择', '你可以带走一位存活玩家，也可以选择不开枪。'],
    over: [
      'UNTIL THE NEXT MOON',
      g.winner === 'good' ? '长夜已尽，好人获胜' : '月影之下，狼人获胜',
      '所有身份已揭晓。每一次怀疑，都值得重新回望。',
    ],
  };
  const [label, title, description] = phaseText[g.phase] || ['', '', ''];
  $('#stage-label').textContent = label;
  $('#stage-title').textContent = title;
  $('#stage-description').textContent = description;
  const targetText = selected
    ? `已选择 ${selected} 号 · ${g.players.find((p) => p.id === selected).name}`
    : '点击上方座位选择一位玩家';
  let html = '';
  if (night) {
    if (!g.me.alive || ['villager', 'hunter'].includes(g.me.role)) {
      html =
        '<p style="text-align:center">此刻无需行动。静静等待村庄的黎明。</p><div class="action-row"><button class="primary" id="night-btn">等待天亮 →</button></div>';
    } else if (g.me.role === 'witch') {
      html = `<p>今晚${g.attack ? `${g.attack} 号被袭击` : '没有可见刀口信息'}。${targetText}</p><div class="action-row"><button class="secondary" id="save-btn" ${g.me.antidote && g.attack && g.attack !== 1 ? '' : 'disabled'}>使用解药</button><button class="secondary" id="poison-btn" ${g.me.poison && selected ? '' : 'disabled'}>毒杀 ${selected || '…'} 号</button><button class="primary" id="night-btn">暂不用药 →</button></div>`;
    } else
      html = `<p style="text-align:center">${targetText}</p><div class="action-row"><button class="primary" id="night-btn" ${selected ? '' : 'disabled'}>${g.me.role === 'seer' ? '确认查验' : '确认袭击'} →</button></div>`;
  }
  if (g.phase === 'discussion') {
    html =
      g.speaker === 1
        ? '<p id="voice-status" role="status">点击录音，再次点击结束；音频将发送至灵矽识别，不保存录音。</p><div class="action-row"><textarea id="speech-input" maxlength="1200" aria-label="你的发言" placeholder="说出你的推理…"></textarea><button class="secondary" id="mic-btn">◉ 语音输入</button><button class="primary" id="speak-btn">结束发言 →</button></div>'
        : `<p style="text-align:center">${mode === 'linx' ? '灵矽智能体将基于自己的视角发言' : '本地模拟玩家 · 点击按顺序推进'}</p><div class="action-row"><button class="primary" id="ai-btn">聆听 ${g.speaker} 号发言 →</button></div>`;
  }
  if (g.phase === 'vote')
    html = `<p style="text-align:center">${g.me.alive ? targetText : '你已出局，以观察者身份查看投票。'}</p><div class="action-row">${g.me.alive ? `<button class="primary" id="vote-btn" ${selected ? '' : 'disabled'}>确认放逐 ${selected || '…'} 号</button>` : ''}<button class="secondary" id="abstain-btn">${g.me.alive ? '本轮弃票' : '查看投票结果'}</button></div>`;
  if (g.phase === 'hunter')
    html = `<p style="text-align:center">${targetText}</p><div class="action-row"><button class="primary" id="shoot-btn" ${selected ? '' : 'disabled'}>确认开枪</button><button class="secondary" id="no-shoot-btn">不开枪</button></div>`;
  if (g.phase === 'result')
    html = `<div class="vote-summary">${g.votes.map((v) => `${v.from} 号 → ${v.to ? `${v.to} 号` : '弃票'}`).join('　')}</div><div class="action-row"><button class="primary" id="next-btn">进入下一夜 →</button></div>`;
  if (g.phase === 'over')
    html = `<p style="text-align:center">${g.players.map((p) => `${p.id} 号 ${names[p.role]}`).join(' · ')}</p><div class="action-row"><button class="primary" id="review-btn">查看本局复盘</button><button class="secondary" id="again-btn">再来一局</button></div>`;
  const latestSpeech = g.log
    .filter((l) => l.kind === 'speech' && Number(l.who.match(/^(\d+) 号/)?.[1]) >= 2)
    .at(-1);
  if (latestSpeech)
    html += `<button class="text-link" id="replay-btn">♬ 重听 ${escape(latestSpeech.who)} 的发言</button>`;
  $('#action-panel').innerHTML = html;
  if (playbackActive) lockPlayback(true);
  if ($('#replay-btn'))
    $('#replay-btn').onclick = () => speakEntries([latestSpeech], { force: true });
  const bind = (s, fn) => {
    if ($(s)) $(s).onclick = fn;
  };
  bind('#night-btn', () => action('/api/night', { target: selected, choice: 'skip' }));
  bind('#save-btn', () => action('/api/night', { choice: 'save' }));
  bind('#poison-btn', () => action('/api/night', { choice: 'poison', target: selected }));
  bind('#speak-btn', () => {
    if (voiceState !== 'idle') return toast('请先结束录音并等待识别完成');
    const text = $('#speech-input').value.trim();
    if (!text) return toast('先说出你的推理，或输入“过”结束发言');
    action('/api/speech', { text });
  });
  bind('#mic-btn', mic);
  bind('#ai-btn', () => {
    const b = $('#ai-btn');
    b.textContent = mode === 'linx' ? '灵矽正在思考…' : '正在发言…';
    action('/api/ai');
  });
  bind('#vote-btn', () => action('/api/vote', { target: selected }));
  bind('#abstain-btn', () => action('/api/vote'));
  bind('#next-btn', () => action('/api/next'));
  bind('#shoot-btn', () => action('/api/shoot', { target: selected }));
  bind('#no-shoot-btn', () => action('/api/shoot'));
  bind('#review-btn', review);
  bind('#again-btn', () => {
    leave();
    $('#start-btn').disabled = false;
    $('#resume-btn')?.remove();
    $('#start-btn').textContent = '进入村庄 →';
  });
}
function saveHistory() {
  if (history.some((h) => h.id === game.id)) return;
  history.unshift({
    id: game.id,
    title: game.players.length === 9 ? '迷雾村庄' : '林间初遇',
    result: game.winner === 'good' ? '好人获胜' : '狼人获胜',
    date: new Date().toLocaleString('zh-CN'),
    days: game.day,
    role: names[game.me.role],
    players: game.players.map((p) => `${p.id}号 ${p.name}：${names[p.role]}`).join('；'),
  });
  history = history.slice(0, 10);
  try {
    localStorage.setItem('moonveil-history', JSON.stringify(history));
  } catch {
    toast('浏览器未允许保存对局记录');
  }
}
function review() {
  openModal(
    `<h2>迷雾散去，真相浮现。</h2><p>第 ${game.day} 天结束 · ${game.winner === 'good' ? '好人阵营获胜' : '狼人阵营获胜'}</p><table><tr><th>玩家</th><th>身份</th><th>结局</th></tr>${game.players.map((p) => `<tr><td>${p.id} 号 · ${escape(p.name)}</td><td>${names[p.role]}</td><td>${p.alive ? '存活' : '出局'}</td></tr>`).join('')}</table><p>关键节点</p>${game.log
      .filter((l) => l.kind === 'system' && /出局|放逐|平安|技能|获胜|平票/.test(l.text))
      .map((l) => `<p>第 ${l.day} 天 · ${escape(l.text)}</p>`)
      .join('')}<button class="secondary" id="download-btn">导出完整复盘</button>`,
  );
  $('#download-btn').onclick = () => {
    const data = {
      gameId: game.id,
      winner: game.winner,
      players: game.players,
      events: game.log,
      privateResults: game.privateLog,
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    a.download = `月隐-复盘-${game.id.slice(0, 6)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}
$$('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      $$('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
      $('#log').hidden = b.dataset.tab !== 'log';
      $('#notes').hidden = b.dataset.tab !== 'notes';
    }),
);
async function initialize() {
  try {
    connectionState = await fetch('/api/status').then((r) => r.json());
    mode = connectionState.mode;
    $('#mode-label').textContent =
      mode === 'linx'
        ? connectionState.ready
          ? '灵矽 · 8 位玩家已配置'
          : '灵矽 · 等待初始化'
        : '本地体验模式';
    if (mode === 'linx') {
      $('.launch-note').innerHTML = '每位 AI · 独立智能体<br><small>真实发言与自主决策</small>';
      $('footer span').textContent = '✧ 灵矽独立智能体 · 每位玩家独立音色';
    }
    const current = await fetch('/api/current').then((r) => r.json());
    if (current) {
      game = current;
      mode = game.aiMode;
      lastSpoken = game.log.at(-1)?.id || 0;
      $('#lobby').hidden = true;
      $('#game').hidden = false;
      render();
      toast('已恢复正在进行的灵矽对局');
    }
  } catch {
    toast('服务连接失败，请启动项目服务后刷新');
  }
}
initialize();
window.addEventListener('beforeunload', () => {
  stopRecording();
  stopPlayback();
});
