window.parseActionDraft = (text,room,mine) => {
  if(!room || !mine || typeof text!=='string')return null;
  const compact=text.replace(/[\s，。！？,.!?]/g,'');
  if(!compact || /不|别|没|取消|或者|还是|可能|如果|不是|改/.test(compact))return null;
  const number={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  const targets=[...compact.matchAll(/(?:P([1-9])|([1-9一二两三四五六七八九])号(?:玩家)?)/gi)].map(m=>'P'+(m[1]||number[m[2]]||m[2]));
  if(new Set(targets).size>1)return null;
  const target=targets[0], stripped=compact.replace(/P[1-9]|[1-9一二两三四五六七八九]号(?:玩家)?/gi,'');
  if(/[0-9一二三四五六七八九十]/.test(stripped))return null;
  const alive=room.seats.some(s=>s.seatId===target && s.alive);
  let draft;
  if(room.phase==='VOTE' && mine.alive && /^(?:我)?(?:投票给|投给|投|放逐)(?:P[1-9]|[1-9一二两三四五六七八九]号(?:玩家)?)$/i.test(compact))draft={route:'votes',body:{target_seat_id:target},label:`投票给 ${target}`};
  if(room.phase==='NIGHT_WOLF' && mine.role==='werewolf' && mine.alive && /^(?:我)?(?:袭击|刀|攻击)(?:P[1-9]|[1-9一二两三四五六七八九]号(?:玩家)?)$/i.test(compact) && target!==mine.seatId)draft={route:'actions',body:{type:'wolf_target',target_seat_id:target},label:`袭击 ${target}`};
  if(room.phase==='NIGHT_SEER' && mine.role==='seer' && mine.alive && /^(?:我)?(?:查验|验)(?:P[1-9]|[1-9一二两三四五六七八九]号(?:玩家)?)$/i.test(compact))draft={route:'actions',body:{type:'seer_check',target_seat_id:target},label:`查验 ${target}`};
  if(room.phase==='NIGHT_WITCH' && mine.role==='witch' && mine.alive){
    if(/^(?:我)?(?:使用解药|救人)$/.test(compact) && mine.skills.antidoteAvailable && mine.nightVictim)return {route:'actions',body:{type:'witch_action',action:'save'},label:`使用解药救 ${mine.nightVictim}`};
    if(/^(?:我)?(?:跳过|放弃用药)$/.test(compact))return {route:'actions',body:{type:'witch_action',action:'skip'},label:'今晚跳过用药'};
    if(/^(?:我)?(?:毒|毒杀|使用毒药毒)(?:P[1-9]|[1-9一二两三四五六七八九]号(?:玩家)?)$/i.test(compact) && mine.skills.poisonAvailable)draft={route:'actions',body:{type:'witch_action',action:'poison',target_seat_id:target},label:`使用毒药毒 ${target}`};
  }
  if(room.phase==='HUNTER_RESPONSE' && mine.role==='hunter' && room.hunterResponse?.seatId===mine.seatId && room.hunterResponse.status==='open'){
    if(/^(?:我)?(?:跳过|放弃开枪)$/.test(compact))return {route:'hunter-response',body:{action:'skip',window_id:room.hunterResponse.windowId},label:'放弃本次开枪'};
    if(/^(?:我)?(?:开枪打|开枪带走|带走)(?:P[1-9]|[1-9一二两三四五六七八九]号(?:玩家)?)$/i.test(compact))draft={route:'hunter-response',body:{action:'shoot',target_seat_id:target,window_id:room.hunterResponse.windowId},label:`开枪带走 ${target}`};
  }
  return alive?draft||null:null;
};
