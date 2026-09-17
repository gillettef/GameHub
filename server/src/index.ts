import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3001);
const SWEEP_MS = 30 * 60 * 1000;

const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 300);

const { server, rooms } = createApp(undefined, { botDelayMs: BOT_DELAY_MS });
setInterval(() => rooms.sweep(), SWEEP_MS).unref();

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (ws: /ws)`);
});
