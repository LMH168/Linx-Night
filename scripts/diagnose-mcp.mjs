if (!process.env.ADMIN_TOKEN) throw new Error('请通过 --env-file 加载 ADMIN_TOKEN');
const response = await fetch('http://127.0.0.1:9091/admin/diagnostics', {
  headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
  signal: AbortSignal.timeout(5000),
});
if (!response.ok) throw new Error(`诊断查询失败：HTTP ${response.status}`);
const { requests } = await response.json();
console.log(JSON.stringify(requests.slice(-20), null, 2));
if (!requests.length) console.log('尚未收到 MCP 请求，请在灵矽中重新发起工具调用。');
