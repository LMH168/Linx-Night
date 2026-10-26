const text = { type: 'string', minLength: 1 };
const target = { ...text, description: '目标座位 P1～P9，或服务端返回的 playerId；必须是当前合法目标。' };
const definitions = [
  ['get_host_announcements', '仅主持人读取公开播报任务', {}],
  ['get_public_game_state', '获取当前房间公开状态', {}],
  ['get_my_private_state', '获取当前会话玩家的私密身份和技能状态', {}],
  ['get_recent_speeches', '获取最近公开发言', {}],
  ['submit_speech', '仅在轮到自己时提交公开发言', { text }],
  ['submit_wolf_target', '提交狼人目标。私密状态 wolfProposal 非空时必须跟随该目标；冲突错误中 recovery.arguments 是最新有效目标，立即按其重试本工具，成功后停止。不能只口头回复或等待。', { target_player_id: target }],
  ['submit_seer_check', '提交预言家查验目标', { target_player_id: target }],
  ['submit_witch_action', '提交女巫行动；poison 必须提供目标，save/skip 不需要目标', { action: { type: 'string', enum: ['save', 'poison', 'skip'] }, target_player_id: target }],
  ['submit_hunter_shot', '提交猎人开枪目标', { target_player_id: target, window_id: { ...text, description: '当前猎人响应窗口 ID' } }],
  ['skip_hunter_response', '猎人放弃本次开枪；必须提供当前响应窗口 ID', { window_id: { ...text, description: '当前猎人响应窗口 ID' } }],
  ['submit_vote', '提交投票目标', { target_player_id: target }],
  ['get_last_words_state', '获取当前遗言窗口状态', {}],
  ['submit_last_words', '提交当前座位的遗言', { text, window_id: { ...text, description: '当前遗言窗口 ID' } }],
  ['skip_last_words', '跳过当前遗言窗口', { window_id: { ...text, description: '当前遗言窗口 ID' } }],
];
export const toolMap = new Map(definitions.map(([name, description, properties]) => {
  const required = Object.keys(properties).filter(key => name !== 'submit_witch_action' || key !== 'target_player_id');
  return [name, { name, description, inputSchema: {
    type: 'object', additionalProperties: false,
    properties: { ...properties, ...((name.startsWith('submit_') || name === 'skip_hunter_response') ? { turn_id: { ...text, description: '自动调度房间必填：从自己的私密状态 currentTurn.turnId 获取。一次租约只允许一个行动。' }, action_id: { ...text, description: '可选行动标识；重试复用同一值，不可跨座位复用。' } } : {}) }, required,
    ...(name === 'submit_witch_action' ? { allOf: [{ if: { properties: { action: { const: 'poison' } }, required: ['action'] }, then: { required: ['target_player_id'] } }] } : {}),
  } }];
}));

export class ToolInputError extends Error {}
export function validateArguments(tool, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new ToolInputError('arguments must be an object');
  const { properties, required } = tool.inputSchema;
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(properties, key)) throw new ToolInputError('unknown argument');
    const rule = properties[key];
    if (typeof args[key] !== rule.type || (rule.minLength && !args[key].trim()) || (rule.enum && !rule.enum.includes(args[key]))) throw new ToolInputError(`invalid ${key}`);
  }
  for (const key of required) if (!Object.hasOwn(args, key)) throw new ToolInputError(`missing ${key}`);
  if (tool.name === 'submit_witch_action' && args.action === 'poison' && !args.target_player_id) throw new ToolInputError('poison requires target_player_id');
}
