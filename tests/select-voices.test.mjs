import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'linx-voices-'));
try {
 const names=['智慧青年男','磁性低音男','阳光青年','温暖元气男','沉稳权威女','元气甜美女','低调冷静女','飒爽利落女','博才说书男'];
 const catalog={code:0,data:{voices:names.map((name,i)=>({name,id:'voice-'+i}))}};
 const file=join(dir,'catalog.json'),env=join(dir,'config.env');
 await writeFile(file,JSON.stringify(catalog));await writeFile(env,'OTHER=keep\n');
 const run=()=>spawnSync(process.execPath,['scripts/select-voices.mjs',file,env],{encoding:'utf8'});
 assert.equal(run().status,0);const configured=await readFile(env,'utf8');assert.match(configured,/OTHER=keep/);assert.match(configured,/LINX_HOST_VOICE_ID=voice-8/);
 catalog.data.voices[0].id='\nINJECTED=value';await writeFile(file,JSON.stringify(catalog));assert.notEqual(run().status,0);assert.equal(await readFile(env,'utf8'),configured);
 catalog.data.voices[0].id='voice-8';await writeFile(file,JSON.stringify(catalog));assert.notEqual(run().status,0);assert.equal(await readFile(env,'utf8'),configured);
 console.log('Voice selection exact matching, distinct IDs and atomic validation passed');
}finally{await rm(dir,{recursive:true,force:true});}
