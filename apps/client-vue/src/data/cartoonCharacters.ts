export type CartoonFaction = 'werewolf' | 'good' | 'neutral';

export type CartoonCharacterAsset = {
  id: string;
  name: string;
  role: string;
  faction: CartoonFaction;
  avatar: string;
  fullBody: string;
};

export const cartoonCharacters: CartoonCharacterAsset[] = [
  ['01', '黑爪', '狼人', 'werewolf'],
  ['02', '雪牙', '白狼', 'werewolf'],
  ['03', '胖熊', '熊', 'neutral'],
  ['04', '企鹅船长', '企鹅', 'neutral'],
  ['05', '泡泡', '女巫', 'good'],
  ['06', '星盘', '预言家', 'good'],
  ['07', '猎风', '猎人', 'good'],
  ['08', '麦穗', '农夫', 'good'],
  ['09', '叮当', '木匠', 'good'],
  ['10', '铁心', '战士', 'good'],
  ['11', '爷爷', '老者', 'good'],
  ['12', '吱吱', '拟人老鼠', 'good'],
  ['13', '小羽', '小天使', 'good'],
].map(([id, name, role, faction]) => ({
  id,
  name,
  role,
  faction: faction as CartoonFaction,
  avatar: `/characters-cartoon/avatars/${id}.svg`,
  fullBody: `/characters-cartoon/full-body/${id}.svg`,
}));
