import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 3001);

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'hello', message: 'Eleven server' }));
  socket.on('message', (raw) => {
    socket.send(JSON.stringify({ type: 'echo', data: raw.toString() }));
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (ws: /ws)`);
});
