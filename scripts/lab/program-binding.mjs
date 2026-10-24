// Test administrator authorization only; unknown remote requests never auto-register.
export function verifiedProgramBinding({ scenario, seatId, identity, connection, agentId, sessionId, requests }) {
  if (!scenario?.armed || !['P2', ...(scenario.name === 'dual-speech' ? ['P3'] : [])].includes(seatId)) throw new Error('场景未准备或座位不属于本场景测试玩家');
  if (!agentId || typeof agentId !== 'string' || !sessionId || typeof sessionId !== 'string') throw new Error('必须配置测试 Agent ID 并指定实际 Session');
  if (!connection || connection.deviceId !== identity.deviceId || connection.clientId !== identity.clientId || !connection.runId || !Number.isFinite(Date.parse(connection.connectedAt))) throw new Error('profile 与本机连接记录不匹配');
  if (connection.sessionId && connection.sessionId !== sessionId) throw new Error('Session 与 hello 返回不一致');
  const bindings = scenario.bindings || (scenario.binding ? { P2: scenario.binding } : {});
  if (bindings[seatId]) throw new Error('该座位已绑定；重连必须创建新场景并清理旧绑定');
  if (Object.values(bindings).some(b => b.deviceId === identity.deviceId || b.sessionId === sessionId || b.profile === identity.name || b.agentId !== agentId)) throw new Error('身份重复或两个客户端未使用同一测试 Agent');
  const after = Math.max(Date.parse(scenario.armedAt), Date.parse(connection.connectedAt));
  const request = requests.findLast(r => r.authenticated && r.sessionId === sessionId && r.deviceId === identity.deviceId && r.agentId === agentId && Date.parse(r.at) >= after);
  if (!request) throw new Error('未找到当前连接及场景开始后的已认证匹配请求；先发送 query 音频并核对 recent');
  return { roomId: scenario.room.roomId, seatId, role: 'player', sessionId, deviceId: identity.deviceId, agentId, profile: identity.name, runId: connection.runId };
}
