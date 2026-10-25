import {readFile,writeFile} from 'node:fs/promises';
import {voiceConfig} from '../apps/server/src/voice-config.mjs';
// Accept a locally exported official /v1/voices response; never persist API credentials.
const [catalogPath,envPath]=process.argv.slice(2);
if(!catalogPath||!envPath)throw Error('用法: node scripts/select-voices.mjs 官方音色列表.json 仓库外.env');
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
if(catalog.code!==0||!Array.isArray(catalog.data?.voices))throw Error('不是成功的官方音色列表响应');
const names=['智慧青年男','磁性低音男','阳光青年','温暖元气男','沉稳权威女','元气甜美女','低调冷静女','飒爽利落女','博才说书男'];
const chosen=names.map(name=>{const matches=catalog.data.voices.filter(v=>v.name===name);if(matches.length!==1||typeof matches[0].id!=='string')throw Error(`音色未唯一匹配：${name}`);return matches[0];});
if(new Set(chosen.map(v=>v.id)).size!==9)throw Error('音色 ID 重复');
const mapping=Object.fromEntries(chosen.slice(0,8).map((v,i)=>[`player-${String.fromCharCode(97+i)}`,v.id]));
voiceConfig({LINX_PROFILES:Object.keys(mapping).join(','),LINX_PLAYER_VOICES:JSON.stringify(mapping),LINX_HOST_VOICE_ID:chosen[8].id});
const text=await readFile(envPath,'utf8');const lines=text.split(/\r?\n/).filter(line=>!/^LINX_(PLAYER_VOICES|HOST_VOICE_ID)=/.test(line));
lines.push(`LINX_PLAYER_VOICES=${JSON.stringify(mapping)}`,`LINX_HOST_VOICE_ID=${chosen[8].id}`);
await writeFile(envPath,lines.join('\n').trim()+'\n');
console.log('已配置八种玩家音色与独立主持音色：'+names.join('、'));
