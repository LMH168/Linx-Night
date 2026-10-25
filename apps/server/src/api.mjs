import { tickHumanSpeech, startRecording, beginTranscription, confirmRecording, speechSession } from './human-speech.mjs';
import { parseWav } from '../../linx/src/wav.mjs';
import { EventEmitter } from 'node:events';
import { recordTurn } from './turn-diagnostics.mjs';
import { actionAvailable } from '../../../packages/domain/src/turns.mjs';
import { publicNarration, readVoiceBody } from './voice.mjs';
import { heartbeat, expirePresence, setHumanControl } from '../../../packages/domain/src/presence.mjs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { addPlayer, appendEvent, assignRoles, beginControllerPreparation, createRoom, fillAiSeats, invalidateRoomControllers, privateState, publicState, CONTROLLER_STATES } from '../../../packages/domain/src/model.mjs';
import { announceDay, expireHunterResponse, expireLastWords, seerCheck, skipHunterResponse, skipLastWords, startGame, submitLastWords, submitSpeech, submitHunterResponse, submitVote, witchAction, wolfTarget } from '../../../packages/domain/src/engine.mjs';
import { EventHub, eventStream } from './realtime.mjs';
import { createHostCoordinator } from './host-coordinator.mjs';

export const roomChanges = new EventEmitter();
export const rooms = new Map();
export const events = new EventHub();
export const hostCoordinator = createHostCoordinator({ publish: (roomId, event) => events.publish(roomId, event) });
export const controllerManager = { async prepare(room) { for (const controller of room.controllers ?? []) { controller.status = CONTROLLER_STATES.READY; controller.boundAt = new Date().toISOString(); controller.lastSeenAt = controller.boundAt; controller.sessionId = `sim-${controller.seatId}-${room.controllerEpoch}`; controller.agentId = 'simulated-agent'; controller.deviceId = `simulated-device-${controller.seatId}`; controller.profileName = `simulated-${controller.seatId}`; controller.runId = `simulated-run-${controller.seatId}`; room.version += 1; } room.controllerPhase = 'ready'; return room; }, async release(room) { for (const controller of room.controllers ?? []) { controller.status = CONTROLLER_STATES.RELEASED; controller.sessionId = null; controller.runId = null; } room.controllerPhase = 'released'; room.version += 1; } };
const configuredLinxSeats = env => String(env.LINX_SEATS || 'P2,P3').split(',').map(value => value.trim()).filter(Boolean);
const controllerEvent = (room, type, data = {}) => appendEvent(room, { type, data });
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 1_000_000) reject(new Error('request body too large')); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('request body must be valid JSON')); } }); req.on('error', reject); });
const currentPlayer = (req, room) => { const playerId = req.headers['x-player-id']; const seat = room.seats.find(item => item.playerId === playerId); if (!seat) throw Object.assign(new Error('player identity is unauthorized'), { status: 403 }); return seat; };
const roomOrFail = roomId => { const room = rooms.get(roomId); if (!room) throw Object.assign(new Error('room not found'), { status: 404 }); return room; };
const actionId = (req, body) => body.action_id || req.headers['idempotency-key'] || `action_${randomUUID()}`;

export function createApiServer({ port = Number(process.env.PORT || 5000), sessions = controllerManager, voice, hostPlayback, linxSeats = null } = {}) {
  const transcriptions = new Set();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'); const parts = url.pathname.split('/').filter(Boolean); const roomId = parts[2];
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-player-id,idempotency-key', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); return res.end(); }
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, service: 'linx-night-server', version: '0.1.0' });
      if (req.method === 'POST' && url.pathname === '/api/rooms') { const body = await readBody(req); const playerId = body.player_id || `player_${randomUUID()}`; const room = createRoom({ hostPlayerId: playerId }); room.hostCoordinatorEnabled = true; room.hostPlaybackEnabled=Boolean(hostPlayback); addPlayer(room, { playerId, displayName: body.display_name || '玩家 1' }); rooms.set(room.roomId, room); return json(res, 201, { room_id: room.roomId, player_id: playerId, state: publicState(room) }); }
      if (!roomId || parts[0] !== 'api' || parts[1] !== 'rooms') return json(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
      const room = roomOrFail(roomId);
      if (req.method === 'POST' && parts[3] === 'players') { const body = await readBody(req); if (body.player_type === 'ai') { const actor = currentPlayer(req, room); if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only the host can add AI players'), { status: 403, code: 'FORBIDDEN' }); if (room.preparing) throw Object.assign(new Error('room is preparing'), { status: 409, code: 'ROOM_PREPARING' }); } const player = addPlayer(room, { playerId: body.player_id || (body.player_type === 'ai' ? `ai_${randomUUID()}` : `player_${randomUUID()}`), displayName: body.display_name || (body.player_type === 'ai' ? 'AI 玩家' : '玩家'), playerType: body.player_type === 'ai' ? 'ai' : 'human' }); publishNewEvents(room); return json(res, 201, { player, state: publicState(room) }); }
      if (req.method === 'PATCH' && parts[3] === 'players' && parts[4]) { const actor = currentPlayer(req, room); if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only the host can rename AI players'), { status: 403, code: 'FORBIDDEN' }); if (room.phase !== 'LOBBY' || room.preparing) throw Object.assign(new Error('AI players can only be renamed in lobby'), { status: 409, code: 'ROOM_NOT_EDITABLE' }); const seat = room.seats.find(item => item.seatId === parts[4]); if (!seat || seat.playerType !== 'ai') throw Object.assign(new Error('target seat is not an AI player'), { status: 400, code: 'AI_SEAT_REQUIRED' }); const body = await readBody(req); if (typeof body.display_name !== 'string' || !body.display_name.trim() || body.display_name.length > 24) throw Object.assign(new Error('display_name must be 1-24 characters'), { status: 400, code: 'INVALID_DISPLAY_NAME' }); seat.displayName = body.display_name.trim(); room.version += 1; appendEvent(room, { type: 'room.player_renamed', data: { seatId: seat.seatId, playerType: 'ai' } }); publishNewEvents(room); return json(res, 200, { player: { seatId: seat.seatId, displayName: seat.displayName, playerType: seat.playerType }, state: publicState(room) }); }
      if(parts[3]==='host') {
        const actor=currentPlayer(req,room);if(actor.playerType!=='human'||!hostPlayback)throw new Error('主持播放不可用');
        if(req.method==='GET'&&parts[4]==='state')return json(res,200,hostPlayback.state(room));
        if(req.method==='GET'&&parts[4]==='audio')return json(res,200,{wav:hostPlayback.getAudio(room,url.searchParams.get('task_id')).toString('base64')});
        if(req.method==='POST'&&parts[4]==='played'){if(actor.playerId!==room.hostPlayerId)throw new Error('仅当前房主确认播放');const b=await readBody(req);hostPlayback.acknowledge(room,b.task_id);return json(res,200,hostPlayback.state(room));}
        if(req.method==='POST'&&parts[4]==='retry'){if(actor.playerId!==room.hostPlayerId)throw new Error('仅房主重试');await hostPlayback.retry(room);return json(res,200,hostPlayback.state(room));}
        if(req.method==='POST'&&parts[4]==='skip'){if(actor.playerId!==room.hostPlayerId)throw new Error('仅房主跳过音频');const b=await readBody(req);hostPlayback.skip(room,b.task_id);return json(res,200,hostPlayback.state(room));}
        throw new Error('无效主持操作');
      }
      if (req.method === 'POST' && parts[3] === 'voice') {
        const actor=currentPlayer(req,room);if(actor.playerType!=='human')throw new Error('仅真人可使用网页语音');
        const body=await readVoiceBody(req), kind=parts[4];const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
        if(kind==='recording-start'){const recording=startRecording(room,actor);publishNewEvents(room);return json(res,200,recording);}
        if(kind==='recording-cancel'){confirmRecording(room,actor,body.recording_id);publishNewEvents(room);return json(res,200,{cancelled:true});}
        if(kind==='transcribe') {
          if(!voice)throw new Error('未配置灵矽语音');
          if(actor.controlSource!=='human' || !actionAvailable(room,actor))throw new Error('当前不能生成发言草稿');
          if(typeof body.wav!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.wav))throw new Error('无效录音');
          const wav=Buffer.from(body.wav,'base64'),duration=parseWav(wav).length/32;
          const round=room.round,phase=room.phase,epoch=actor.controlEpoch,gameId=room.gameId;
          const clock=phase==='SPEECH'?beginTranscription(room,actor,body.recording_id,duration):null;
          const active={abort,valid:()=>!room.invalidated&&rooms.get(room.roomId)===room&&room.gameId===gameId&&room.phase===phase&&room.round===round&&actor.controlEpoch===epoch&&actor.controlSource==='human'&&actionAvailable(room,actor)&&(!clock||(room.speechClock===clock&&clock.stage==='transcribing'&&Date.now()<clock.expiresAt))};
          transcriptions.add(active);
          publishNewEvents(room);
          try {
            const result=await voice({kind,wav,signal:clock?AbortSignal.any([abort.signal,AbortSignal.timeout(Math.max(1,clock.expiresAt-Date.now()))]):abort.signal});
            if(room.invalidated||room.gameId!==gameId||room.phase!==phase||room.round!==round||actor.controlEpoch!==epoch||!actionAvailable(room,actor)||actor.controlSource!=='human'||abort.signal.aborted)throw Error('发言回合已变更');
            if(clock){if(room.speechClock!==clock||clock.stage!=='transcribing'||Date.now()>=clock.expiresAt)throw Error('转写窗口已结束');confirmRecording(room,actor,body.recording_id);}
            return json(res,200,{text:result.text});
          } finally {transcriptions.delete(active);if(clock&&room.speechClock===clock&&clock.stage==='transcribing'){try{confirmRecording(room,actor,body.recording_id);}catch{}}publishNewEvents(room);}
        }
        if(kind==='speak') {publicNarration(room,body.event_id);const task=hostPlayback?.state(room).task;if(!task||task.eventId!==body.event_id)throw new Error('公共音频任务不存在或已结束');return json(res,200,{event_id:body.event_id,wav:hostPlayback.getAudio(room,task.id).toString('base64')});}
        throw new Error('无效语音操作');
      }
      if (req.method === 'POST' && parts[3] === 'presence') { const seat=currentPlayer(req,room); heartbeat(room,seat); publishNewEvents(room); return json(res,200,{ok:true}); }
      if (req.method === 'POST' && parts[3] === 'control') { const body=await readBody(req); const seat=currentPlayer(req,room); if(body.mode==='rule_bot')throw new Error('规则机器人托管已停用'); setHumanControl(room,seat,body.mode); publishNewEvents(room); return json(res,200,{state:publicState(room)}); }
      if (req.method === 'POST' && parts[3] === 'start') { const actor = currentPlayer(req, room); if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only the host can start the room'), { status: 403, code: 'FORBIDDEN' }); if (room.phase !== 'LOBBY' || room.preparing || room.seats.some(s => s.role)) throw new Error('room already started'); const occupied = room.seats.filter(seat => seat.playerId).length; if (occupied < room.seats.length) throw Object.assign(new Error(`room is not full: ${occupied} occupied, ${room.seats.length - occupied} missing`), { status: 409, code: 'ROOM_NOT_FULL', occupied, missing: room.seats.length - occupied }); const aiSeats = room.seats.filter(s=>s.playerType==='ai' && (!linxSeats || linxSeats.includes(s.seatId))).map(s=>s.seatId); const preparation = beginControllerPreparation(room, { aiSeatIds: aiSeats, includeHost: sessions.requireHost === true }); room.requireActionLease = typeof sessions.sendTurn === 'function'; for (const seat of room.seats) if (aiSeats.includes(seat.seatId)) { seat.controlSource = 'linx'; seat.linxControlled = true; } room.controllerPhase = 'connecting'; room.preparing = true; controllerEvent(room, 'controller.created', { gameId: preparation.gameId, controllerEpoch: preparation.controllerEpoch, seatIds: room.controllers.map(controller => controller.seatId) }); publishNewEvents(room); setImmediate(() => Promise.resolve(sessions.prepare(room)).then(() => { if (room.invalidated || room.gameId !== preparation.gameId || room.controllerPhase !== 'ready') return; for (const controller of room.controllers) controllerEvent(room, 'controller.bound', { seatId: controller.seatId, status: controller.status }); controllerEvent(room, 'game.ready', { gameId: room.gameId, controllerEpoch: room.controllerEpoch }); assignRoles(room); startGame(room); room.preparing = false; publishNewEvents(room); }).catch(error => { if (room.invalidated || room.gameId !== preparation.gameId) return; room.controllerPhase = 'failed'; room.preparing = true; room.controllers.forEach(controller => { if (controller.status !== CONTROLLER_STATES.READY) { controller.status = CONTROLLER_STATES.FAILED; controller.errorCode = error.code || 'CONNECT_FAILED'; controllerEvent(room, 'controller.failed', { seatId: controller.seatId, errorCode: controller.errorCode }); } }); room.version += 1; publishNewEvents(room); })); return json(res, 202, { preparation: true, game_id: preparation.gameId, controller_epoch: preparation.controllerEpoch, state: publicState(room) }); }
      if (req.method === 'GET' && parts[3] === 'controllers') { currentPlayer(req, room); return json(res, 200, { game_id: room.gameId, controller_epoch: room.controllerEpoch, phase: room.controllerPhase, controllers: publicState(room).controllers, host: publicState(room).hostController }); }
      if (req.method === 'POST' && parts[3] === 'controllers' && parts[4] === 'retry-turn') {
        const actor = currentPlayer(req, room);
        if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only host can retry'), {status:403});
        if (room.turnRunning || room.preparing || room.invalidated || ['LOBBY','GAME_OVER'].includes(room.phase) || !sessions.retry) throw new Error('no active game to retry');
        const failed = room.controllers.filter(c => c.status === 'failed');
        if (!failed.length) throw new Error('no failed controller');
        for (const c of failed) { c.status = 'reconnecting'; c.errorCode = null; }
        publishNewEvents(room);
        for (const c of failed) { try { await sessions.retry(room, c.seatId); } catch { c.status = 'failed'; c.errorCode = 'LINX_RECONNECT_FAILED'; } }
        publishNewEvents(room); return json(res, 200, { state: publicState(room) });
      }
      if (req.method === 'POST' && parts[3] === 'controllers' && parts[4] === 'retry') { const actor = currentPlayer(req, room); if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only the host can retry controllers'), { status: 403 }); if (!room.preparing || !['failed', 'connecting', 'binding'].includes(room.controllerPhase)) throw new Error('room is not waiting for controllers'); invalidateRoomControllers(room); hostPlayback?.cancel(room); await sessions.release(room); for (const controller of room.controllers ?? []) controllerEvent(room, 'controller.released', { seatId: controller.seatId }); invalidateRoomControllers(room); room.phase = 'LOBBY'; room.gameId = null; room.controllers = []; room.preparing = false; publishNewEvents(room); return json(res, 202, { retried: true, state: publicState(room) }); }
      if (req.method === 'POST' && parts[3] === 'controllers' && parts[4] === 'cancel') { const actor = currentPlayer(req, room); if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only the host can cancel controllers'), { status: 403 }); invalidateRoomControllers(room); hostPlayback?.cancel(room); await sessions.release(room); for (const controller of room.controllers ?? []) controllerEvent(room, 'controller.released', { seatId: controller.seatId }); invalidateRoomControllers(room); room.phase = 'LOBBY'; room.gameId = null; room.controllers = []; room.preparing = false; publishNewEvents(room); return json(res, 200, { cancelled: true, state: publicState(room) }); }
      if (req.method === 'POST' && parts[3] === 'end') { const actor = currentPlayer(req, room); if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only the host can end the game'), { status: 403 }); room.invalidated = true; hostPlayback?.cancel(room); await sessions.release(room); rooms.delete(room.roomId); return json(res, 200, { ended: true }); }
      if (req.method === 'GET' && parts[3] === 'state') return json(res, 200, { state: publicState(room) });
      if (req.method === 'GET' && parts[3] === 'private-state') return json(res, 200, { private_state: privateState(room, currentPlayer(req, room).playerId) });
      if (req.method === 'GET' && parts[3] === 'speeches') return json(res, 200, { speeches: room.speeches, version: room.version });
      if (req.method === 'GET' && parts[3] === 'hunter-response') return json(res, 200, { hunter_response: publicState(room).hunterResponse });
      if (req.method === 'GET' && parts[3] === 'last-words') return json(res, 200, { last_words: publicState(room).lastWords });
      if (req.method === 'POST' && parts[3] === 'last-words') { const body = await readBody(req); const actor = currentPlayer(req, room); if (actor.controlSource !== 'human') throw Object.assign(new Error('请先恢复本人控制'), {status:403}); const id = actionId(req, body); if (body.action === 'skip') skipLastWords(room, actor.seatId, id, body.window_id); else submitLastWords(room, actor.seatId, body.text, id, body.window_id); publishNewEvents(room); return json(res, 200, { state: publicState(room) }); }
      if (req.method === 'GET' && parts[3] === 'events') return eventStream(res, events, room.roomId, { version: Number(url.searchParams.get('after') || 0), history: room.events });
      if (req.method === 'POST' && parts[3] === 'speeches') { const body = await readBody(req); const actor = currentPlayer(req, room); if (actor.controlSource !== 'human') throw Object.assign(new Error('请先恢复本人控制'), {status:403}); if(room.hostPlaybackBlocked)throw new Error('请等待主持播报完成'); const speechClock=speechSession(room,actor);if(['recording','transcribing'].includes(speechClock.stage))throw Error('请先结束或取消录音转写'); submitSpeech(room, actor.seatId, body.text, actionId(req, body)); publishNewEvents(room); return json(res, 200, { state: publicState(room) }); }
      if (req.method === 'POST' && parts[3] === 'hunter-response') { const body = await readBody(req); const actor = currentPlayer(req, room); if (actor.controlSource !== 'human') throw Object.assign(new Error('请先恢复本人控制'), {status:403}); const id = actionId(req, body); if (body.action === 'skip') skipHunterResponse(room, actor.seatId, id, body.window_id); else if (body.action === 'shoot') submitHunterResponse(room, actor.seatId, body.target_seat_id, id, body.window_id); else throw new Error('invalid hunter action'); publishNewEvents(room); return json(res, 200, { state: publicState(room) }); }
      if (req.method === 'POST' && parts[3] === 'actions') { const body = await readBody(req); const actor = currentPlayer(req, room); if (actor.controlSource !== 'human') throw Object.assign(new Error('请先恢复本人控制'), {status:403}); const id = actionId(req, body); const privatePhase = room.phase.startsWith('NIGHT_') || room.phase === 'HUNTER_RESPONSE'; const hostAction = body.type === 'announce_day'; if(room.hostPlaybackBlocked && !privatePhase && !hostAction)throw new Error('请等待主持播报完成'); if (body.type === 'wolf_target') wolfTarget(room, actor.seatId, body.target_seat_id, id); else if (body.type === 'seer_check') seerCheck(room, actor.seatId, body.target_seat_id, id); else if (body.type === 'witch_action') witchAction(room, actor.seatId, body.action, body.target_seat_id, id); else if (body.type === 'hunter_shot') submitHunterResponse(room, actor.seatId, body.target_seat_id, id, body.window_id); else if (hostAction) { if (actor.playerId !== room.hostPlayerId) throw Object.assign(new Error('only the host can announce day'), { status: 403 }); announceDay(room); } else throw new Error('invalid action type'); publishNewEvents(room); return json(res, 200, { state: publicState(room) }); }
      if (req.method === 'POST' && parts[3] === 'votes') { const body = await readBody(req); const actor = currentPlayer(req, room); if (actor.controlSource !== 'human') throw Object.assign(new Error('请先恢复本人控制'), {status:403}); submitVote(room, actor.seatId, body.target_seat_id, actionId(req, body)); publishNewEvents(room); return json(res, 200, { state: publicState(room) }); }
      return json(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
    } catch (error) { return json(res, error.status || 400, { error: { code: error.code || (error.status === 403 ? 'FORBIDDEN' : 'INVALID_ACTION'), message: error.message, ...(error.occupied === undefined ? {} : { occupied: error.occupied, missing: error.missing }) } }); }
  });
  let hunterTimer;
  server.on('listening', () => { hunterTimer = setInterval(() => {
    for (const room of rooms.values()) { expirePresence(room); expireHunterResponse(room); expireLastWords(room); tickHumanSpeech(room); publishNewEvents(room); }
    for (const active of transcriptions) if(!active.valid())active.abort.abort();
  }, 250); hunterTimer.unref(); });
  server.on('close', () => {clearInterval(hunterTimer);for(const active of transcriptions)active.abort.abort();transcriptions.clear();});
  return { server, port };
}

export function publishNewEvents(room) { for (const event of room.events.filter(event => event.version > (room.lastPublishedVersion || 0))) { events.publish(room.roomId, event); if (['game.player_eliminated','game.hunter_response_opened','game.hunter_response_closed'].includes(event.type)) recordTurn(event.type,{roomId:room.roomId,gameId:room.gameId,eventId:event.eventId,seatId:event.data.seatId,windowId:event.data.windowId}); } room.lastPublishedVersion = room.version; if (room.hostCoordinatorEnabled) hostCoordinator.announce(room); roomChanges.emit('changed', room); }
