import { recordTurn } from './turn-diagnostics.mjs';
import { voiceConfig } from './voice-config.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ota } from '../../linx/src/ota.mjs';
import { LinxClient } from '../../linx/src/client.mjs';
import { readProfile } from '../../linx/src/profile.mjs';
import { LinxSessionAdapter } from '../../linx/src/session-adapter.mjs';
import { parseTriggerWav, wavDurationMs } from '../../linx/src/wav.mjs';
import { waitForMcpDiscovery } from './mcp-discovery.mjs';

const required = (value, name) => { if (!value) throw Object.assign(new Error(`缺少 ${name} 配置`), { code: 'LINX_CONFIG_MISSING' }); return value; };
async function requestAdmin(base, token, path, body, fetchImpl) {
  required(base, 'LINX_MCP_ADMIN_URL'); required(token, 'LINX_MCP_ADMIN_TOKEN');
  let response;
  try { response = await fetchImpl(`${base.replace(/\/$/, '')}${path}`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); }
  catch { throw Object.assign(new Error('MCP 管理服务连接失败'), { code: 'MCP_ADMIN_UNREACHABLE' }); }
  const result = await response.json();
  if (!response.ok || result.error) throw Object.assign(new Error('MCP 管理操作失败'), { code: 'MCP_BIND_FAILED' });
  return result;
}

export function createLinxControllerManager({ env = process.env, fetchImpl = fetch, clientFactory = identity => new LinxClient(identity), readIdentity = readProfile, loadAudio = readFile, onChange = () => {} } = {}) {
  const names = String(env.LINX_PROFILES || 'player-a,player-b').split(',').map(value => value.trim()).filter(Boolean);
  const sends = new Map();
  const adapters = new Map(), profiles = new Map(), reservations = new Map();
  const audioPath = env.LINX_TURN_WAV || join(env.LOCALAPPDATA || '.', 'LinxNight', 'audio', 'turn.wav');
  const hunterAudioPath = env.LINX_HUNTER_WAV || join(env.LOCALAPPDATA || '.', 'LinxNight', 'audio', 'hunter.wav');
  const voteAudioPath = env.LINX_VOTE_WAV;
  let audio, hunterAudio, voteAudio;
  const adapterFor = room => {
    if (!adapters.has(room.roomId)) {
      const profileBySeat = new Map(room.controllers.map((c, i) => [c.seatId, c.seatId==='HOST' ? env.LINX_HOST_PROFILE : names[i]]));
      adapters.set(room.roomId, new LinxSessionAdapter({ profiles, clientFactory, onChange,
        connectionFor: async controller => {
          const agentId = required(controller.seatId==='HOST' ? env.LINX_HOST_AGENT_ID : env.LINX_AGENT_ID, controller.seatId==='HOST' ? 'LINX_HOST_AGENT_ID' : 'LINX_AGENT_ID');
          const profileName = required(profileBySeat.get(controller.seatId), `LINX profile（${controller.seatId}）`);
          const identity = await readIdentity(profileName);
          const connection = await ota(identity, { fetchImpl });
          if (connection.state !== 'bound') throw Object.assign(new Error('软件设备尚未激活'), {code:'LINX_NOT_ACTIVATED'});
          return { profileName, agentId, identity, connection };
        },
        bind: async binding => {
          await waitForMcpDiscovery(binding,{base:required(env.LINX_MCP_ADMIN_URL,'LINX_MCP_ADMIN_URL'),token:required(env.LINX_MCP_ADMIN_TOKEN,'LINX_MCP_ADMIN_TOKEN'),fetchImpl});
          return requestAdmin(env.LINX_MCP_ADMIN_URL, env.LINX_MCP_ADMIN_TOKEN, '/admin/bindings', binding, fetchImpl);
        },
        release: binding => requestAdmin(env.LINX_MCP_ADMIN_URL, env.LINX_MCP_ADMIN_TOKEN, '/admin/controllers/release', binding, fetchImpl),
      }));
    }
    return adapters.get(room.roomId);
  };
  return {
    requireHost: true,
    async prepare(room) {
      if (room.hostPlaybackEnabled) {
        const voices = voiceConfig(env);
        room.publicVoices = { HOST: voices.host };
        room.controllers.filter(c => c.seatId !== 'HOST').forEach((c,i) => { room.publicVoices[c.seatId] = voices.players[names[i]]; });
      }
      if (!room.controllers.length) { room.controllerPhase = 'ready'; return room; }
      const count=room.controllers.filter(c=>c.seatId!=='HOST').length;
      const assigned = names.slice(0,count);
      if(room.controllers.some(c=>c.seatId==='HOST')) {
        required(env.LINX_HOST_PROFILE,'LINX_HOST_PROFILE');required(env.LINX_HOST_AGENT_ID,'LINX_HOST_AGENT_ID');
        if(names.includes(env.LINX_HOST_PROFILE)||env.LINX_HOST_PROFILE===env.LINX_VOICE_PROFILE||env.LINX_HOST_AGENT_ID===env.LINX_AGENT_ID)throw new Error('主持身份与 Agent 必须独立');
        assigned.push(env.LINX_HOST_PROFILE);
      }
      if (assigned.length !== room.controllers.length) throw Object.assign(new Error('not enough activated profiles configured'), {code:'PROFILE_POOL_INSUFFICIENT'});
      if (new Set(assigned).size !== assigned.length) throw Object.assign(new Error('duplicate profiles configured'), {code:'PROFILE_POOL_DUPLICATE'});
      if (assigned.some(name => reservations.has(name) && reservations.get(name) !== room.roomId)) throw Object.assign(new Error('profile reserved by another room'), {code:'PROFILE_IN_USE'});
      const gameId = room.gameId;
      required(env.LINX_AGENT_ID, 'LINX_AGENT_ID');
      audio ??= await loadAudio(audioPath); parseTriggerWav(audio); recordTurn('trigger_audio_ready',{roomId:room.roomId,gameId:room.gameId,audioName:'turn',durationMs:wavDurationMs(audio)});
      hunterAudio ??= await loadAudio(hunterAudioPath); parseTriggerWav(hunterAudio); recordTurn('trigger_audio_ready',{roomId:room.roomId,gameId:room.gameId,audioName:'hunter',durationMs:wavDurationMs(hunterAudio)});
      if(voteAudioPath){voteAudio ??= await loadAudio(voteAudioPath);parseTriggerWav(voteAudio);recordTurn('trigger_audio_ready',{roomId:room.roomId,gameId:room.gameId,audioName:'vote',durationMs:wavDurationMs(voteAudio)});}
      if (room.invalidated || room.gameId !== gameId) throw new Error('PREPARATION_CANCELLED');
      if (assigned.some(name => reservations.has(name) && reservations.get(name) !== room.roomId)) throw Object.assign(new Error('profile unavailable'), {code:'PROFILE_IN_USE'});
      for (const name of assigned) reservations.set(name, room.roomId);
      const adapter = adapterFor(room);
      const results=await Promise.allSettled(room.controllers.map(c => adapter.connect(room, c.seatId)));
      const failure=results.find(r=>r.status==='rejected');
      if(failure) {
        // Failed preparation must not leave successful peers or the whole pool reserved.
        await adapter.releaseAll(room).catch(() => {});
        if (adapters.get(room.roomId) === adapter) adapters.delete(room.roomId);
        for (const [name, owner] of reservations) if (owner === room.roomId) reservations.delete(name);
        throw failure.reason;
      }
      if (room.invalidated || adapters.get(room.roomId) !== adapter) throw new Error('PREPARATION_CANCELLED');
      room.controllerPhase = 'ready'; return room;
    },
    async ensureConnected(room, seat) {
      const adapter = adapterFor(room), c = room.controllers.find(c => c.seatId === seat.seatId);
      if (!c || c.status === 'failed') throw new Error('CONTROLLER_FAILED');
      const key=room.roomId+':'+seat.seatId;
      if(sends.has(key))await sends.get(key).catch(()=>{});
      if(room.invalidated)throw Error('CONTROLLER_RELEASED');
      const client = adapter.clients.get(seat.seatId)?.client;
      if (!client || client.state === 'closed') await adapter.reconnect(room, seat.seatId);
    },
    clientFor(room, seatId) { return adapters.get(room.roomId)?.clients.get(seatId)?.client; },
    async sendTurn(room, seat) {
      const client = adapters.get(room.roomId)?.clients.get(seat.seatId)?.client;
      if (!client) throw new Error('CONTROLLER_MISSING');
      const context = {roomId:room.roomId,gameId:room.gameId,seatId:seat.seatId,turnId:room.turns.find(t=>t.status==='active'&&t.seatId===seat.seatId)?.turnId,windowId:room.hunterResponse?.windowId};
      client.record = event => { if (['input_start','input_stop','stt','tts_start','tts_stop','tts_sentence_start','input_failure','hello','closed'].includes(event.type)) recordTurn(event.type,{...event,...context}); };
      const wav = room.phase === 'HUNTER_RESPONSE' ? hunterAudio : room.phase === 'VOTE' && voteAudio ? voteAudio : audio;
      const audioName = room.phase === 'HUNTER_RESPONSE' ? 'hunter' : room.phase === 'VOTE' && voteAudio ? 'vote' : 'turn';
      recordTurn('trigger_audio_started',{...context,audioName,durationMs:wavDurationMs(wav)});
      try { const key=room.roomId+':'+seat.seatId;if(sends.has(key)||client.pending)throw Error('CLIENT_BUSY');const work=client.send(wav);sends.set(key,work);let result;try{result=await work;}finally{if(sends.get(key)===work)sends.delete(key);} recordTurn('trigger_audio_finished',{...context,audioName,durationMs:wavDurationMs(wav),attemptId:result?.attemptId}); return result; }
      catch (error) { recordTurn('trigger_audio_failed',{...context,audioName,code:error.message}); throw error; }
    },
    async releaseSeat(room, seat) {
      const adapter = adapters.get(room.roomId);
      if (adapter) await adapter.releaseSeat(room, seat.seatId);
    },
    async retry(room, seatId) {
      const adapter = adapters.get(room.roomId); if (!adapter) throw new Error('CONTROLLER_MISSING');
      return adapter.reconnect(room, seatId);
    },
    async release(room) {
      const adapter = adapters.get(room.roomId);
      if (adapter) await adapter.releaseAll(room);
      adapters.delete(room.roomId); for (const [name, owner] of reservations) if (owner === room.roomId) reservations.delete(name); room.controllerPhase = 'released';
    },
  };
}
