import assert from 'node:assert/strict';
import { updateTranscript } from '../src/human-transcription.mjs';
import { createRoom } from '../../../packages/domain/src/model.mjs';
import { publicConversation, pendingPublicContext, syncPublicContextClocks } from '../../../packages/domain/src/public-conversation.mjs';
for (const kind of ['speech','lastwords']) {
 const room=createRoom();room.gameId='g';room.phase='NIGHT_WOLF';room.nightWindow={phase:room.phase,expiresAt:10000};
 room.liveTranscript={id:'live',gameId:'g',kind,seatId:'P1',round:1,text:'五号',sequence:2,transcriptionStatus:'processing',textSource:'browser_transcription'};
 assert.equal(publicConversation(room)[0].text,'五号');assert.equal(pendingPublicContext(room),true);
 syncPublicContextClocks(room,100);delete room.liveTranscript;syncPublicContextClocks(room,900);
 assert.equal(room.nightWindow.expiresAt,10800);assert.equal(pendingPublicContext(room),false);
 const record={seatId:'P1',round:1,...(kind==='speech'?{speechId:'s'}:{lastWordsId:'l'})};
 (kind==='speech'?room.speeches:room.lastWordsHistory).push(record);
 room.events.push({type:kind==='speech'?'game.speech_submitted':'game.last_words_submitted',version:++room.version,data:kind==='speech'?{speechId:'s'}:{lastWordsId:'l'}});
 updateTranscript(room,record,kind,'completed','五号值得怀疑','browser_transcription');
 assert.equal(publicConversation(room)[0].text,'五号值得怀疑');assert.equal(pendingPublicContext(room),false);
 room.liveTranscript={gameId:'old'};assert.equal(publicConversation(room).length,1);assert.equal(pendingPublicContext(room),false);
}
console.log('Live browser text: speech/lastwords, public projection, pending barrier, clocks, old-game isolation passed');
