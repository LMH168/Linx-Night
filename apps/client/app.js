const $ = id => document.getElementById(id.replace(/^#/, ''));
// Test links prefill only public connection fields, never a player identity.
const entryQuery = new URLSearchParams(globalThis.location?.search || '');
const state = { api: sessionStorage.getItem('linx-api') || 'http://127.0.0.1:5100', roomId: sessionStorage.getItem('linx-room') || '', playerId: sessionStorage.getItem('linx-player') || '', source: null, reconnectTimer: null, reconnectDelay: 1000, events: new Set(), lastVersion: 0, room: null, privateState: null, voice: { recognition: null, listening: false, draft: false }, unloading: false };
const entryApi = entryQuery.get('api') || state.api;
const entryRoom = entryQuery.get('room') || state.roomId;
if (entryApi !== state.api || entryRoom !== state.roomId) {
  state.api = entryApi;
  state.roomId = entryRoom;
  state.playerId = '';
  sessionStorage.removeItem('linx-player');
}
$('#apiUrl').value = state.api; $('#roomId').value = state.roomId;
const message = text => { $('#message').textContent = text; };
const api = () => $('#apiUrl').value.replace(/\/$/, '');
async function call(path, options = {}) { const headers = { 'content-type': 'application/json', ...(options.headers || {}) }; if (state.playerId) headers['x-player-id'] = state.playerId; const response = await fetch(`${api()}${path}`, { ...options, headers }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || '请求失败'); return body; }
function save() { hostPlayer?.stop(); stopVoice(); state.lastVersion = 0; state.events.clear(); clearTimeout(state.reconnectTimer); state.reconnectTimer = null; state.privateState = null; state.targetKey = null; state.api = api(); state.roomId = $('#roomId').value; sessionStorage.setItem('linx-api', state.api); sessionStorage.setItem('linx-room', state.roomId); if (state.playerId) sessionStorage.setItem('linx-player', state.playerId); }
const roles = {werewolf:'狼人',seer:'预言家',witch:'女巫',hunter:'猎人',villager:'平民'};
const phases = {LOBBY:'等待开局',ROLE_ASSIGNMENT:'分配身份',NIGHT_WOLF:'狼人行动',NIGHT_SEER:'预言家行动',NIGHT_WITCH:'女巫行动',DAY_ANNOUNCEMENT:'天亮了',HUNTER_RESPONSE:'猎人响应',LAST_WORDS:'遗言窗口',SPEECH:'依次发言',VOTE:'放逐投票',RESOLUTION:'结算中',GAME_OVER:'本局结束'};
const descriptions = {werewolf:'与队友协商，在夜晚选择目标。',seer:'每晚查验一名玩家，寻找隐藏的狼人。',witch:'解药与毒药各一瓶，每晚只能选择一种。',hunter:'出局后可使用一次开枪技能。',villager:'倾听发言，用推理和投票帮助好人获胜。'};
const show = (id, visible) => { $(id).hidden = !visible; };
function render(room) {

  if(state.room && [state.room.gameId,state.room.round,state.room.phase,state.room.currentSeatId].join(':')!==[room.gameId,room.round,room.phase,room.currentSeatId].join(':'))state.actionStatus='';
  state.room = room; linxVoice?.update(room);
  const lobby = room.phase === 'LOBBY';
  show('entryCard',lobby || room.phase==='GAME_OVER');
  $('#roomLabel').textContent = room.roomId;
  $('#phase').textContent = phases[room.phase] || '对局进行中';
  const humans = room.seats.filter(s => s.playerType === 'human').length;
  const ais = room.seats.filter(s => s.playerType === 'ai').length;
  $('#counts').textContent = `真人 ${humans} / AI 玩家 ${ais} / 空位 ${9-humans-ais}`;
  $('#seats').replaceChildren(...room.seats.map(seat => {
    const el = document.createElement('div');
    el.className = `seat ${!seat.playerType?'empty':''} ${!seat.alive?'dead':''} ${room.currentSeatId===seat.seatId?'active':''}`;
    const number = document.createElement('span'); number.className='seat-number'; number.textContent=seat.seatId;
    const copy = document.createElement('div'); copy.className='seat-copy';
    const name = document.createElement('strong'); name.textContent=seat.displayName || '等待入座';
    const status = document.createElement('small'); status.textContent=!seat.playerType?'空位':`${seat.controlSource==='linx'?'灵矽 AI':seat.controlSource==='rule_bot'?(seat.playerType==='human'?'真人 · 规则托管':'规则机器人'):'真人'}${seat.connectionState==='disconnected'?' · 离线':''} · ${lobby?'已入座':seat.alive?'存活':'已出局'}${state.privateState?.seatId===seat.seatId?' · 你':''}`;
    copy.replaceChildren(name,status); el.replaceChildren(number,copy); return el;
  }));
  const host = room.hostPlayerId === state.playerId;
  const preparing = room.controllerPhase && room.controllerPhase !== 'idle' && room.controllerPhase !== 'released' && room.phase === 'LOBBY' && room.preparing !== false;
  const failed = room.controllerPhase === 'failed';
  const turnFailed = !lobby && (room.controllers || []).some(c => c.status === 'failed');
  show('retryTurn',turnFailed && host); show('lobbyBar',lobby || preparing || turnFailed || (!lobby && room.phase !== 'GAME_OVER')); show('start',lobby && host && !preparing); show('retryControllers',preparing && failed && host); show('cancelControllers',preparing && host); show('endGame',!lobby && room.phase !== 'GAME_OVER' && host); $('#start').disabled=!lobby || !host || preparing;
  $('#lobbyHint').textContent=turnFailed?'灵矽行动失败，已暂停该座位。房主可重试，不会自动换成规则机器人。':preparing?(failed?'AI 连接失败，请重试或取消。':'正在连接 AI 玩家，全部准备完成后才会开始。'):!lobby?'对局进行中；房主可提前结束本局。':host?'朋友到齐后即可开始，空位将由 Linx 会话准备。':'已入座，等待房主开始游戏。';
  const controllers=room.controllers||[]; $('#controllerHint').hidden=!preparing && !turnFailed; $('#controllerHint').textContent=controllers.map(c=>`${c.seatId}: ${c.status}${c.errorCode?`（${c.errorCode}）`:''}`).join(' · ');
  show('eventCard',!lobby); show('resultCard',room.phase==='GAME_OVER');
  const winner=[...room.events].reverse().find(e=>e.data?.winner)?.data.winner;
  $('#resultTitle').textContent=winner==='good'?'好人阵营获胜':winner==='werewolf'?'狼人阵营获胜':'对局已结束';
  const lines=[...room.speeches.map(s=>`${s.seatId}：${s.text}`),...room.events.flatMap(e=>e.type==='game.night_resolved'?[e.data.deathSeatIds.length?`昨夜出局：${e.data.deathSeatIds.join('、')}`:'昨夜平安夜，无人出局。']:e.type==='game.player_eliminated'?[`${e.data.seatId} 已出局`]:e.type==='game.vote_resolved'?[formatVoteResolution(e.data)]:e.type==='game.hunter_shot'?[`${e.data.seatId} 开枪带走 ${e.data.targetSeatId}`]:e.type==='game.last_words_submitted'?[`${e.data.seatId} 遗言：${e.data.text}`]:e.type==='game.last_words_skipped'?[`${e.data.seatId} 放弃遗言`]:e.type==='game.last_words_expired'?[`${e.data.seatId} 遗言超时`]:e.data?.winner?[e.data.winner==='good'?'好人阵营获胜':'狼人阵营获胜']:[])];
  $('#events').replaceChildren(...lines.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  show('emptyEvents',lines.length===0);
  renderPrivate(); renderActions();
}
function formatVoteResolution(data) {
  const entries=(data.entries || []).map(entry=>`${entry.seatId}：${entry.votes} 票`).join('、');
  const result=data.eliminatedSeatId ? `放逐 ${data.eliminatedSeatId}` : '平票，本轮无人出局';
  return `投票结果：${entries}；共 ${data.totalVotes} 票，最高 ${data.maxVotes} 票；${result}`;
}
function renderPrivate() {
  const mine=state.privateState;
  const visible=!!(state.room && state.room.phase!=='LOBBY' && mine?.role);
  show('privateCard',visible); if(!visible) return;
  $('#identity').textContent=`${roles[mine.role]} · ${mine.seatId}`;
  $('#roleDescription').textContent=`${mine.alive?'存活':'已出局'} · ${descriptions[mine.role]}`;
  let details='没有夜间技能，请留意公开发言。';
  if(mine.role==='werewolf') details=`存活队友：${mine.werewolfTeammates.join('、') || '无'}\n每晚与队友选择同一目标。`;
  if(mine.role==='seer') details=mine.seerResults.map(r=>`第 ${r.round+1} 夜 · ${r.seatId}：${r.result==='werewolf'?'狼人':'好人'}`).join('\n') || '尚无查验记录。';
  if(mine.role==='witch') details=`解药：${mine.skills.antidoteAvailable?'可用':'已用完'}\n毒药：${mine.skills.poisonAvailable?'可用':'已用完'}${state.room.phase==='NIGHT_WITCH'?`\n今夜被袭击：${mine.nightVictim || '暂无'}`:''}`;
  if(mine.role==='hunter') details=`开枪机会：${mine.skills.hunterShotAvailable?'尚未使用':'已使用'}`;
  $('#skills').textContent=details;
}
function renderActions() {
  const room=state.room, mine=state.privateState;
  $('#actionStatus').textContent=state.actionStatus||'';
  for(const id of ['lastWordsField','speechField','speech','voiceStart','voiceCancel','targetField','witchField','skill','hunterShot','hunterSkip','vote','announce']) show(id,false);
  const seat=room?.seats.find(s=>s.seatId===mine?.seatId);
  const canControl=seat?.playerType==='human' && room.phase!=='LOBBY' && room.phase!=='GAME_OVER';
  show('controlCard',false); show('takeover',canControl && seat.controlSource==='human'); show('restoreControl',canControl && seat.controlSource==='rule_bot');
  $('#controlHint').textContent=seat?.controlSource==='rule_bot'?'当前由规则机器人托管，恢复后你可操作后续回合。':'断线只显示离线；需要自动行动时请主动托管。';
  if(state.actionDraft && state.actionDraft.context!==voiceContext()){state.actionDraft=null;$('#actionDraftText').value='';}
  const active=!!(room && seat?.controlSource!=='rule_bot' && mine?.role && !['LOBBY','ROLE_ASSIGNMENT','GAME_OVER'].includes(room.phase));
  if ((state.voice.recognition || state.voice.linxRecording) && (!active || state.voice.context!==voiceContext())) stopVoice();
  show('linxVoiceTools',false);show('confirmDraft',false);
  show('actionCard',active); if(!active) return;
  const lastWords=room.phase==='LAST_WORDS' && mine.lastWords?.seatId===mine.seatId && !mine.lastWords?.status; const speech=mine.alive && !room.hostPlaybackBlocked && room.phase==='SPEECH' && room.currentSeatId===mine.seatId;
  const skill=mine.alive && ({werewolf:'NIGHT_WOLF',seer:'NIGHT_SEER',witch:'NIGHT_WITCH'}[mine.role]===room.phase);
  const hunter=mine.role==='hunter' && !mine.alive && mine.skills.hunterShotAvailable && Boolean(mine.hunterAction);
  const vote=mine.alive && room.phase==='VOTE';
  const voiceAllowed=speech||skill||hunter||vote;
  show('linxVoiceTools',voiceAllowed);show('actionDraftField',voiceAllowed&&!speech);show('confirmDraft',voiceAllowed&&!speech&&!!state.actionDraft);
  $('#actionDraftHint').textContent=state.actionDraft?'待确认：'+state.actionDraft.label:'识别不会自动行动；请检查动作和目标。';
  const announce=room.phase==='DAY_ANNOUNCEMENT' && state.playerId===room.hostPlayerId;
  show('lastWordsField',lastWords); show('speechField',speech); show('speech',speech); show('voiceStart',speech); show('voiceCancel',speech && state.voice.draft); show('witchField',skill && mine.role==='witch');
  if(skill && mine.role==='witch') {
    for(const opt of $('#witchAction').options) opt.disabled=(opt.value==='save' && (!mine.skills.antidoteAvailable || !mine.nightVictim)) || (opt.value==='poison' && !mine.skills.poisonAvailable);
    if($('#witchAction').selectedOptions[0]?.disabled) $('#witchAction').value='skip';
  }
  show('skill',skill); show('hunterShot',hunter); show('hunterSkip',hunter); show('vote',vote); show('announce',announce);
  const needsTarget=hunter || vote || (skill && (mine.role!=='witch' || $('#witchAction').value==='poison'));
  show('targetField',needsTarget);
  if(needsTarget) {
    const targets=room.seats.filter(s=>s.alive && !(skill && mine.role==='werewolf' && s.seatId===mine.seatId));
    const key=targets.map(s=>s.seatId+':'+s.displayName).join('|');
    if(state.targetKey!==key){const previous=$('#target').value;$('#target').replaceChildren(...targets.map(s=>new Option(`${s.seatId} · ${s.displayName}`,s.seatId)));if(targets.some(s=>s.seatId===previous)) $('#target').value=previous;state.targetKey=key;}
  }
  for(const id of ['speech','skill','hunterShot','hunterSkip','vote','announce']) $(id).disabled=state.busy || (needsTarget && ['skill','hunterShot','vote'].includes(id) && !$('#target').value);
  $('#skill').textContent={werewolf:'确认袭击目标',seer:'查验身份',witch:'确认用药选择'}[mine.role] || '确认行动';
  $('#linxRecord').disabled=state.voice.linxRecording || (room.phase==='SPEECH' && mine.speechSession && mine.speechSession.stage!=='speaking');
  $('#speech').disabled=state.busy || ['recording','transcribing'].includes(mine.speechSession?.stage);
  $('#actionTitle').textContent=speech?'轮到你发言':skill?'轮到你行动':hunter?'猎人开枪':vote?'选择放逐目标':announce?'天亮了':'请耐心等待';
  $('#turnHint').textContent=room.hostPlaybackBlocked&&room.phase==='SPEECH'?'正在等待主持播报完成；请在下方启用主持声音。':speech?`发言剩余 ${Math.max(0,Math.ceil(((room.speechDeadline||Date.now()+30000)-Date.now())/1000))} 秒；到时自动结束，请及时提交。`:skill?'请确认你的选择，再提交行动。':hunter?`猎人响应剩余 ${Math.max(0,Math.ceil((Date.parse(mine.hunterAction.expiresAt)-Date.now())/1000))} 秒：选择目标或跳过。`:room.phase==='HUNTER_RESPONSE'?'等待猎人确认开枪，其他玩家暂不能推进。':vote?(room.hostPlaybackBlocked?'主持播报尚未完成，但你可以直接投票。':'选择你认为最可疑的玩家。'):!mine.alive?'你已出局，可以继续旁观对局。':room.phase==='SPEECH'?`正在等待 ${room.currentSeatId} 发言。`:`当前为${phases[room.phase] || '对局'}阶段，暂时无需操作。`;
  if(speech && mine.speechSession){const c=mine.speechSession;$('#turnHint').textContent=({speaking:'发言',recording:'录音',transcribing:'等待转写',confirming:'编辑确认'}[c.stage]||'发言')+'剩余 '+Math.max(0,Math.ceil((c.expiresAt-Date.now())/1000))+' 秒；未确认的草稿不会提交。';}
}
function speechRecognitionConstructor() { return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition; }
function voiceContext() { return [state.roomId,state.room?.round,state.room?.phase,state.room?.currentSeatId,state.privateState?.hunterAction?.windowId,state.room?.seats.find(s=>s.seatId===state.privateState?.seatId)?.controlSource,state.playerId].join(':'); }
function stopVoice() {
  linxVoice?.stop(); state.voice.linxRecording=false;
  const recognition=state.voice.recognition; state.voice.recognition=null; state.voice.listening=false;
  if(recognition){recognition.onstart=recognition.onresult=recognition.onerror=recognition.onend=null;try { (recognition.abort || recognition.stop)?.call(recognition); } catch {}}
  $('#voiceStart').disabled=false;
}
function startVoice() {
  const Recognition=speechRecognitionConstructor();
  if(!Recognition){$('#voiceStatus').textContent='当前浏览器不支持语音识别，请直接输入文字。';return;}
  if(state.room?.phase!=='SPEECH' || state.room.currentSeatId!==state.privateState?.seatId) return;
  stopVoice();
  const recognition=new Recognition(), context=voiceContext(); state.voice.recognition=recognition; state.voice.context=context; state.voice.listening=true;
  const valid=()=>state.voice.recognition===recognition && context===voiceContext() && !state.unloading;
  recognition.lang='zh-CN';recognition.continuous=false;recognition.interimResults=true;
  const base=$('#speechText').value.trim();
  recognition.onstart=()=>{if(!valid())return;$('#voiceStatus').textContent='正在聆听……结束后请检查并确认文字。';$('#voiceStart').disabled=true;};
  recognition.onresult=event=>{if(!valid())return;const transcript=[...event.results].map(result=>result[0].transcript).join('').trim();if(!transcript)return;$('#speechText').value=[base,transcript].filter(Boolean).join(base?' ':'');state.voice.draft=true;$('#voiceCancel').hidden=false;};
  recognition.onerror=event=>{if(!valid())return;$('#voiceStatus').textContent=event.error==='not-allowed'?'麦克风权限被拒绝，请改用文字输入。':'语音识别失败，请改用文字输入。';};
  recognition.onend=()=>{if(!valid())return;state.voice.recognition=null;state.voice.listening=false;$('#voiceStart').disabled=false;if(state.voice.draft)$('#voiceStatus').textContent='已生成可编辑草稿，请确认后提交。';renderActions();};
  try{recognition.start();}catch{stopVoice();$('#voiceStatus').textContent='无法启动麦克风，请改用文字输入。';}
}
function clearVoiceDraft() { stopVoice(); $('#speechText').value = ''; state.voice.draft = false; $('#voiceStatus').textContent = '语音只生成草稿，不会自动提交。'; renderActions(); }
async function loadPrivate() {
  if(!state.room || state.room.phase==='LOBBY'){state.privateState=null;renderPrivate();renderActions();return;}
  const roomId=state.roomId;
  try {const body=await call(`/api/rooms/${roomId}/private-state`);if(roomId!==state.roomId)return;state.privateState=body.private_state;}
  catch {state.privateState=null;message('身份读取失败，请检查连接后重试。');}
  renderPrivate();renderActions();
}

function scheduleReconnect() { if (state.unloading || state.reconnectTimer || !state.roomId) return; state.reconnectTimer = setTimeout(() => { state.reconnectTimer = null; connectEvents(); }, state.reconnectDelay); state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30_000); }
function connectEvents() { if (state.unloading || !state.roomId) return; state.source?.close(); const after = state.lastVersion ? `?after=${state.lastVersion}` : ''; state.source = new EventSource(`${api()}/api/rooms/${state.roomId}/events${after}`); state.source.onopen = () => { state.reconnectDelay = 1000; message('实时连接已恢复'); refresh(); }; state.source.onmessage = event => { const item = JSON.parse(event.data); state.lastVersion = Math.max(state.lastVersion, Number(item.version || 0)); if (state.events.has(item.eventId)) return; state.events.add(item.eventId);  refresh(); }; state.source.onerror = () => { state.source?.close(); state.source = null; message('实时连接断开，正在自动重连。'); scheduleReconnect(); }; }
async function refresh() { if (!state.roomId || state.refreshing) return; const roomId=state.roomId; state.refreshing=true; try { const body = await call(`/api/rooms/${roomId}/state`); if(roomId!==state.roomId)return; render(body.state); await loadPrivate(); } catch (error) { message(error.message); } finally {state.refreshing=false;} }
$('#create').onclick = async () => { try { const body = await call('/api/rooms', { method: 'POST', body: JSON.stringify({ display_name: $('#displayName').value || '玩家 1' }) }); state.playerId = body.player_id; $('#roomId').value = body.room_id; save(); render(body.state); connectEvents(); message(`房间已创建，房间号：${body.room_id}`); } catch (error) { message(error.message); } };
$('#join').onclick = async () => { try { state.roomId = $('#roomId').value.trim(); if (!state.roomId) throw new Error('请填写房间号'); const body = await call(`/api/rooms/${state.roomId}/players`, { method: 'POST', body: JSON.stringify({ display_name: $('#displayName').value || '玩家' }) }); state.playerId = body.player.playerId; save(); render(body.state); connectEvents(); message('已加入房间'); } catch (error) { message(error.message); } };
$('#start').onclick = async () => { try { const body = await call(`/api/rooms/${state.roomId}/start`, { method: 'POST' }); render(body.state); message('已开始准备 AI 玩家连接，等待全部会话就绪。'); refresh(); } catch (error) { message(error.message); } };
$('#retryTurn').onclick = async () => { try { const body=await call(`/api/rooms/${state.roomId}/controllers/retry-turn`,{method:'POST'}); render(body.state); } catch(error){message(error.message);} };
$('#retryControllers').onclick = async () => { try { const body=await call(`/api/rooms/${state.roomId}/controllers/retry`,{method:'POST'}); render(body.state); message('已取消失败准备，可以重新点击开始游戏。'); } catch(error){message(error.message);} };
$('#cancelControllers').onclick = async () => { try { const body=await call(`/api/rooms/${state.roomId}/controllers/cancel`,{method:'POST'}); render(body.state); message('已取消本次准备或对局。已分配身份的对局请创建新房间。'); } catch(error){message(error.message);} };
$('#endGame').onclick = async () => { if (!confirm('确定提前结束本局并释放所有 AI 会话吗？')) return; try { await call(`/api/rooms/${state.roomId}/end`,{method:'POST'}); state.source?.close(); sessionStorage.removeItem('linx-room'); sessionStorage.removeItem('linx-player'); globalThis.location.href = globalThis.location.pathname; } catch(error){message(error.message);} };
$('#speech').onclick = async () => { stopVoice(); try { await call(`/api/rooms/${state.roomId}/speeches`, { method: 'POST', body: JSON.stringify({ text: $('#speechText').value, action_id: `speech_${Date.now()}` }) }); $('#speechText').value = ''; state.voice.draft = false; $('#voiceStatus').textContent = '语音只生成草稿，不会自动提交。'; await refresh(); } catch (error) { message(error.message); } };
$('#skill').onclick = async () => { try { const role = state.privateState.role; const type = role === 'werewolf' ? 'wolf_target' : role === 'seer' ? 'seer_check' : 'witch_action'; const body = { type, target_seat_id: $('#target').value, action_id: `skill_${Date.now()}` }; if (type === 'witch_action') body.action = $('#witchAction').value; await call(`/api/rooms/${state.roomId}/actions`, { method: 'POST', body: JSON.stringify(body) }); state.actionStatus=role==='werewolf'?'行动已提交，等待其他狼人完成同一目标。':'行动已提交。'; await refresh(); } catch (error) { state.actionStatus='提交失败：'+error.message; message(error.message); renderActions(); } };
$('#vote').onclick = async () => { state.actionStatus='正在提交投票…'; renderActions(); try { await call(`/api/rooms/${state.roomId}/votes`, { method: 'POST', body: JSON.stringify({ target_seat_id: $('#target').value, action_id: `vote_${Date.now()}` }) }); state.actionStatus='投票已提交，等待其他玩家完成投票。'; await refresh(); } catch (error) { state.actionStatus='投票提交失败：'+error.message; message(error.message); renderActions(); } };
$('#hunterShot').onclick = async () => { try { await call(`/api/rooms/${state.roomId}/actions`, { method: 'POST', body: JSON.stringify({ type: 'hunter_shot', target_seat_id: $('#target').value, window_id: state.privateState.hunterAction.windowId, action_id: `hunter_${Date.now()}` }) }); await refresh(); } catch (error) { message(error.message); } };
$('#hunterSkip').onclick = async () => { try { await call(`/api/rooms/${state.roomId}/hunter-response`, { method: 'POST', body: JSON.stringify({ action: 'skip', window_id: state.privateState.hunterAction.windowId, action_id: `hunter_skip_${Date.now()}` }) }); await refresh(); } catch (error) { message(error.message); } };
$('#announce').onclick = async () => { try { await call(`/api/rooms/${state.roomId}/actions`, { method: 'POST', body: JSON.stringify({ type: 'announce_day', action_id: `announce_${Date.now()}` }) }); await refresh(); } catch (error) { message(error.message); } };
$('#lastWordsSubmit').onclick = async () => { try { await call(`/api/rooms/${state.roomId}/last-words`, { method: 'POST', body: JSON.stringify({ text: $('#lastWordsText').value, window_id: state.privateState.lastWords.windowId, action_id: `last_words_${Date.now()}` }) }); $('#lastWordsText').value=''; await refresh(); } catch (error) { message(error.message); } };
$('#lastWordsSkip').onclick = async () => { try { await call(`/api/rooms/${state.roomId}/last-words`, { method: 'POST', body: JSON.stringify({ action:'skip', window_id: state.privateState.lastWords.windowId, action_id: `last_words_skip_${Date.now()}` }) }); await refresh(); } catch (error) { message(error.message); } };
window.addEventListener('beforeunload', () => { state.unloading = true; stopVoice(); clearTimeout(state.reconnectTimer); state.source?.close(); });
for(const [id,mode] of [['takeover','rule_bot'],['restoreControl','human']]) $(id).onclick=async()=>{try{stopVoice();const body=await call('/api/rooms/'+state.roomId+'/control',{method:'POST',body:JSON.stringify({mode})});render(body.state);await loadPrivate();}catch(error){message(error.message);}};
setInterval(()=>{if(!state.unloading && state.roomId && state.playerId)call('/api/rooms/'+state.roomId+'/presence',{method:'POST'}).catch(()=>{});},10000);
const linxVoice=window.createLinxVoice?.({call,state,message,context:voiceContext,suspendPlayback:()=>hostPlayer?.suspend()||(()=>{}),applyDraft:text=>{if(state.room.phase==='SPEECH'){$('#speechText').value=text;state.voice.draft=true;}else{$('#actionDraftText').value=text;buildActionDraft();}renderActions();}});
function buildActionDraft(){const draft=window.parseActionDraft?.($('#actionDraftText').value,state.room,state.privateState);state.actionDraft=draft?{...draft,context:voiceContext()}:null;renderActions();if(!draft)$('#actionDraftHint').textContent='无法明确识别，请使用原有目标和行动按钮。';}
$('#parseAction').onclick=buildActionDraft;
$('#actionDraftText').oninput=()=>{state.actionDraft=null;show('confirmDraft',false);};
$('#confirmDraft').onclick=async()=>{const draft=state.actionDraft;if(!draft || draft.context!==voiceContext())return;stopVoice();try{await call('/api/rooms/'+state.roomId+'/'+draft.route,{method:'POST',body:JSON.stringify({...draft.body,action_id:'voice_'+Date.now()})});state.actionDraft=null;$('#actionDraftText').value='';await refresh();}catch(error){message(error.message);}};
$('#linxRecord').onclick=()=>{stopVoice();state.voice.context=voiceContext();state.voice.linxRecording=true;linxVoice?.record();};
$('#linxRecordCancel').onclick=()=>{stopVoice();$('#linxVoiceStatus').textContent='已取消录音或转写。';};
$('#linxRecordStop').onclick=()=>linxVoice?.end();
$('#voiceStart').onclick = startVoice;
$('#voiceCancel').onclick = clearVoiceDraft;
if (state.roomId) { refresh(); connectEvents(); }

setInterval(() => { if (!state.unloading) refresh(); }, 2000);

$('#witchAction').onchange=renderActions;
for (const id of ['confirmDraft','takeover','restoreControl','create','join','start','retryControllers','retryTurn','cancelControllers','endGame','speech','skill','vote','hunterShot','hunterSkip','announce','lastWordsSubmit','lastWordsSkip']) {
  const handler=$(id).onclick;
  $(id).onclick=async()=>{if(state.busy)return;state.busy=true;$(id).disabled=true;try{await handler();}finally{state.busy=false;$(id).disabled=false;renderActions();}};
}

const hostPlayer=window.createHostPlayer?.({call,state,message,refresh});
