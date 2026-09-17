import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3001);
const SWEEP_MS = 30 * 60 * 1000;

const { server, rooms } = createApp();
setInterval(() => rooms.sweep(), SWEEP_MS).unref();

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (ws: /ws)`);
});
