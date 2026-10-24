import { createServer } from 'node:http';

const port = Number(process.env.PORT || 5000);

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, service: 'linx-night-server', version: '0.1.0' });
    return;
  }

  json(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`linx-night server listening on ${port}`);
});
