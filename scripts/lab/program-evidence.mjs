import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { profilePath } from '../../apps/linx/src/profile.mjs';

const types = new Set(['connect_start', 'connection_failure', 'closed', 'hello', 'stt', 'tts_start', 'tts_stop', 'tts_sentence_start', 'audio_received', 'input_start', 'input_stop', 'turn_finished', 'input_failure']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function sanitizeProtocol(records, runId) {
  return records.filter(e => e.runId === runId && types.has(e.type) && Number.isFinite(Date.parse(e.at))).map(e => {
    const safe = { at: e.at, type: e.type, runId };
    if (typeof e.attemptId === 'string' && uuid.test(e.attemptId)) safe.attemptId = e.attemptId;
    for (const key of ['samples', 'textLength', 'bytes']) if (Number.isSafeInteger(e[key]) && e[key] >= 0) safe[key] = e[key];
    // Error messages and arbitrary model/platform strings are never copied.
    if (e.type.endsWith('failure')) safe.failed = true;
    if (e.type === 'turn_finished') safe.gameAccepted = 'unverified';
    return safe;
  });
}
export async function programEvidence(scenario, requests, profileRoot) {
  const clients = [];
  for (const [seatId, binding] of Object.entries(scenario.bindings || {})) {
    const directory = join(profilePath(binding.profile, profileRoot), 'evidence');
    const protocol = [];
    let logStatus = 'available';
    try {
      for (const file of await readdir(directory)) {
        if (!/^\d+-[0-9a-f-]+\.jsonl$/.test(file)) continue;
        const lines = (await readFile(join(directory, file), 'utf8')).trim().split('\n').filter(Boolean);
        for (const line of lines) { try { protocol.push(...sanitizeProtocol([JSON.parse(line)], binding.runId)); } catch { logStatus = 'incomplete'; } }
      }
    } catch { logStatus = 'unavailable'; }
    const mcp = requests.filter(r => r.authenticated && r.sessionId === binding.sessionId && r.deviceId === binding.deviceId && r.agentId === binding.agentId && r.at >= scenario.armedAt).map(({ at, requestId, tool, resultCode, actionId, beforeVersion, afterVersion, eventIds }) => ({ at, requestId, tool, resultCode, actionId, beforeVersion, afterVersion, eventIds }));
    const attempts = protocol.filter(e => e.type === 'input_start').map(start => {
      const events = protocol.filter(e => e.attemptId === start.attemptId);
      const end = events.find(e => ['input_failure', 'turn_finished'].includes(e.type));
      return { attemptId: start.attemptId, startedAt: start.at, endedAt: end?.at, transportOutcome: end?.type || 'pending', durationMs: end ? Date.parse(end.at) - Date.parse(start.at) : null, gameAccepted: 'unverified' };
    });
    clients.push({ seatId, sessionAlias: `session-${seatId}`, runId: binding.runId, logStatus: protocol.length ? logStatus : 'unavailable', attempts, protocol, mcp });
  }
  return { source: 'local-program-records-not-platform-attestation', clients, browserEvidence: 'pending', platformEvidence: 'pending', overall: 'pending', correlationNote: '按匿名 runId、时间窗、MCP requestId/actionId/eventIds 与平台工具记录及网页录像共同核对；不会仅凭时间自动断言成功。' };
}
