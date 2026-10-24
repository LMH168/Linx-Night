const [roomId, seatId, deviceId, agentId, role = 'player'] = process.argv.slice(2);
if (!roomId || !seatId || !deviceId || !agentId || !process.env.ADMIN_TOKEN) throw new Error('设置 ADMIN_TOKEN，然后运行 node scripts/bind.mjs 房间号 座位号 设备ID AgentID [player|host]');
const response = await fetch('http://127.0.0.1:9091/admin/bindings',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.ADMIN_TOKEN}`},body:JSON.stringify({roomId,seatId,deviceId,agentId,role})});
console.log(await response.text()); if(!response.ok) process.exitCode=1;
