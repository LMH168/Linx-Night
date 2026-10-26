// One bounded PCM cache per synthesis attempt. Subscribers never start synthesis.
export class AudioStream {
 constructor(ids){this.ids=ids;this.messages=[{type:'start',...ids,sampleRate:16000,channels:1,format:'s16le'}];this.listeners=new Set();this.bytes=0;this.count=0;this.ended=false;this.playing=false;}
 emit(message){const value={...message,...this.ids};this.messages.push(value);for(const listener of [...this.listeners])listener(value);}
 append(pcm){if(this.ended||this.count>=6000||!pcm.length||pcm.length%2||this.bytes+pcm.length>1920000)throw Error('HOST_AUDIO_INVALID');this.bytes+=pcm.length;this.emit({type:'audio',seq:this.count++,data:pcm.toString('base64')});}
 end(){if(this.ended)return;this.ended=true;this.emit({type:'end',chunks:this.count,samples:this.bytes/2});this.listeners.clear();}
 fail(code){if(this.ended)return;this.ended=true;this.emit({type:'error',code});this.listeners.clear();}
 subscribe(listener){for(const message of this.messages)listener(message);if(!this.ended)this.listeners.add(listener);return()=>this.listeners.delete(listener);}
}
