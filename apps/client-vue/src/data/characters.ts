export type CharacterFaction = 'werewolf' | 'good';

export type CharacterAsset = {
  id: string;
  name: string;
  role: string;
  faction: CharacterFaction;
  avatar: string;
  fullBody: string;
};

/** 暮林山舍角色资产：公共座位只使用头像，不根据 faction 泄露阵营。 */
export const forestCharacters: CharacterAsset[] = [
  ['01', '雾松', '狼人', 'werewolf'],
  ['02', '月桂', '预言家', 'good'],
  ['03', '烬灯', '女巫', 'good'],
  ['04', '鹿鸣', '猎人', 'good'],
  ['05', '松果', '守卫', 'good'],
  ['06', '白露', '村民', 'good'],
  ['07', '鸦影', '狼人', 'werewolf'],
  ['08', '霜枝', '村民', 'good'],
  ['09', '栗火', '村民', 'good'],
  ['10', '星苔', '预言家', 'good'],
].map(([id, name, role, faction]) => ({
  id,
  name,
  role,
  faction: faction as CharacterFaction,
  avatar: `/characters/avatars/${id}-${name}.svg`,
  fullBody: `/characters/full-body/${id}-${name}.svg`,
}));
