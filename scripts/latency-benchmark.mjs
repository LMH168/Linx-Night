// Dedicated activated profile only. No tokens, transcripts or audio are persisted.
import {writeFile} from 'node:fs/promises';
import {readProfile} from '../apps/linx/src/profile.mjs';
import {ota} from '../apps/linx/src/ota.mjs';
import {LinxClient} from '../apps/linx/src/client.mjs';
import {speakPublic} from '../apps/linx/src/host-audio.mjs';
const [profile,output,voiceId]=process.argv.slice(2);
if(!profile||!output)throw Error('Usage: node scripts/latency-benchmark.mjs <dedicated-profile> <report.json> [voice-id]');
const texts=['天亮了，请各位玩家依次发言。','我是三号玩家。这一轮我会先听取大家的判断，再结合公开的投票记录分析。现在掌握的信息还不充分，我不会仅凭一句话确定任何人的身份。希望后面的玩家说明自己的理由，并且回应前面提出的问题。我的意见是认真比较发言中的前后矛盾，集中讨论可以验证的事实，暂时不要仓促下结论。'];
const rows=[];
for(const [kind,text] of texts.entries())for(let run=0;run<5;run++){
 const start=performance.now(),row={kind:kind?'speech':'host',run:run+1,characters:text.length,connectionStartMs:0};let client;
 try{const identity=await readProfile(profile),config=await ota(identity);if(config.state!=='bound')throw Error('PROFILE_NOT_ACTIVATED');client=new LinxClient(identity);await client.connect(config);row.connectionEndMs=performance.now()-start;
  await speakPublic(client,text,{voiceId,diagnostic:(type,data)=>{if(type==='first_audio')row.firstChunkMs=performance.now()-start;if(type==='tts_stop'){row.completeMs=performance.now()-start;row.samples=data.samples;}},onAudio:()=>{}});row.status='ok';row.baselineEarliestPlaybackMs=row.completeMs;row.streamingEarliestPlaybackMs=row.firstChunkMs;
 }catch(error){row.status='failed';row.code=error.code==='ENOENT'?'EXPERIMENT_PROFILE_MISSING':/^[A-Z_]+$/.test(error.message)?error.message:'CONNECTION_OR_PROTOCOL_FAILED';}
 finally{client?.close();rows.push(row);console.log(JSON.stringify(row));await writeFile(output,JSON.stringify({clock:'process performance.now relative milliseconds',browserMeasured:false,rows},null,2));}
}
for(const kind of ['host','speech']){const subset=rows.filter(r=>r.kind===kind),ok=subset.filter(r=>r.status==='ok');const summarize=field=>{const a=ok.map(r=>r[field]).sort((a,b)=>a-b);return a.length?{median:a[Math.floor(a.length/2)],min:a[0],max:a.at(-1)}:null;};console.log(JSON.stringify({kind,failures:subset.length-ok.length,firstChunkMs:summarize('firstChunkMs'),completeMs:summarize('completeMs')}));}
