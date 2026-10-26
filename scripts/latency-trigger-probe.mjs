// Transport-only experiment. A voice response is explicitly NOT game acceptance.
import {readFile,writeFile} from 'node:fs/promises';
import {readProfile} from '../apps/linx/src/profile.mjs';
import {ota} from '../apps/linx/src/ota.mjs';
import {LinxClient} from '../apps/linx/src/client.mjs';
const [profile,mode,wavPath,output]=process.argv.slice(2);
if(!profile||!['audio','text'].includes(mode)||!output)throw Error('Usage: node scripts/latency-trigger-probe.mjs <dedicated-profile> audio|text <wav-or-dash> <report.json>');
const row={mode,gameAccepted:'unverified',staleLeaseRejected:'unverified',textTriggerEligible:false},start=performance.now();let client;
try{
 const identity=await readProfile(profile),config=await ota(identity);if(config.state!=='bound')throw Error('PROFILE_NOT_ACTIVATED');client=new LinxClient(identity,{record:e=>{if(['hello','stt','tts_start','tts_stop','input_start','input_stop'].includes(e.type))row[e.type+'Ms']=performance.now()-start;}});await client.connect(config);
 if(mode==='audio')await client.send(await readFile(wavPath));
 else await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('TEXT_TIMEOUT'));},60000);const cleanup=()=>{clearTimeout(timer);client.socket.off('message',message);client.socket.off('close',close);};const close=()=>{cleanup();reject(Error('CONNECTION_CLOSED'));};const message=(raw,binary)=>{if(binary)return;let m;try{m=JSON.parse(raw);}catch{return;}if(m.type==='tts'&&m.state==='stop'){cleanup();resolve();}};client.socket.on('message',message);client.socket.on('close',close);client.socket.send(JSON.stringify({session_id:client.sessionId,type:'listen',state:'detect',text:'查私密状态，执行当前行动。'}),error=>{if(error)close();});});
 row.transportStatus='completed';
}catch(error){row.transportStatus='failed';row.code=error.code==='ENOENT'?'EXPERIMENT_PROFILE_OR_WAV_MISSING':/^[A-Z_]+$/.test(error.message)?error.message:'EXPERIMENT_FAILED';}
finally{client?.close();row.durationMs=performance.now()-start;await writeFile(output,JSON.stringify(row,null,2));console.log(JSON.stringify(row));}
