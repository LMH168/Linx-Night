// Administrator-only timeline. Never accept arbitrary payloads or transcript text.
const records = [];
const keys = ['roomId','gameId','seatId','turnId','windowId','eventId','runId','attemptId','code','samples','durationMs','taskId','audioName','status'];
export function recordTurn(type, data = {}) {
  records.push({at:new Date().toISOString(),type,...Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]))});
  if(records.length>100)records.shift();
}
export function turnDiagnostics() { return structuredClone(records); }
