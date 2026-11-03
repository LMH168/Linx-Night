import { afterEach, expect, it, vi } from 'vitest';
import { startBrowserTranscription, type BrowserRecognition } from './browserTranscription';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function fixture() {
 let engine: BrowserRecognition;
 vi.stubGlobal('SpeechRecognition', class {
  lang=''; continuous=false; interimResults=false; onresult:any; onerror:any; onend:any;
  constructor(){engine=this;}
  start(){} stop(){this.onresult?.({results:[{0:{transcript:'五号值得怀疑'},isFinal:true}]});this.onend?.();} abort(){}
 });
 const onText=vi.fn(),onWarning=vi.fn();
 const handle=startBrowserTranscription({onText,onWarning,valid:()=>true})!;
 return {engine:engine!,onText,onWarning,handle};
}
it('replaces interim snapshots and flushes final text on stop',async()=>{
 const {engine,onText,handle}=fixture();
 engine.onresult!({results:[{0:{transcript:'五号'},isFinal:false}]});
 engine.onresult!({results:[{0:{transcript:'五号值得'},isFinal:false}]});
 expect(onText.mock.calls.map(c=>c[0])).toEqual(['五号','五号值得']);
 await handle.stop();expect(onText).toHaveBeenLastCalledWith('五号值得怀疑');
});
it('ignores results after cancellation',()=>{
 const {engine,onText,handle}=fixture();const callback=engine.onresult!;handle.abort();
 callback({results:[{0:{transcript:'迟到'},isFinal:true}]});expect(onText).not.toHaveBeenCalled();
});
it('warns when recognition is unavailable without blocking recording',()=>{
 vi.stubGlobal('SpeechRecognition',undefined);vi.stubGlobal('webkitSpeechRecognition',undefined);
 const onWarning=vi.fn();expect(startBrowserTranscription({onText:vi.fn(),onWarning,valid:()=>true})).toBeNull();expect(onWarning).toHaveBeenCalled();
});
it('bounds final-result waiting to one second',async()=>{
 vi.useFakeTimers();const {engine,handle}=fixture();engine.stop=()=>{};
 let done=false;const pending=handle.stop().then(()=>{done=true;});await vi.advanceTimersByTimeAsync(1000);await pending;expect(done).toBe(true);
});
