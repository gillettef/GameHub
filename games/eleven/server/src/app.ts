import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import * as data from './data';
import type { BotDriver } from './bot/driver';
import { RoomManager } from './rooms';
import { createStaticHandler } from './static';
import { attachWebSocket } from './ws';
import type { WsOptions } from './ws';

const CARD_CATALOG = JSON.stringify({
  players: data.PLAYER_CARDS,
  staff: data.STAFF_CARDS,
  sponsors: data.SPONSOR_CARDS,
  board: data.BOARD_CARDS,
  executives: data.EXECUTIVE_CARDS,
  tactics: data.TACTIC_CARDS,
  objectives: data.OBJECTIVE_CARDS,
  opponents: data.OPPONENT_CARDS,
  boardData: data.BOARD_DATA,
});

export interface AppOptions extends WsOptions {
  /** 빌드된 클라이언트 디렉터리. 주면 index.html 과 assets 를 서빙하고 나머지 경로는 SPA 로 돌린다. */
  staticDir?: string;
}

/** HTTP(/health·/api/cards·정적 파일)와 WebSocket(/ws)을 처리하는 핸들러. 자체 서버를 띄우지 않는다(GameHub 허브가 쓴다). */
export function createHandlers(rooms = new RoomManager(), options: AppOptions = {}) {
  const serveStatic = createStaticHandler(options.staticDir);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const bots = attachWebSocket(wss, rooms, options);

  /** 응답했으면 true */
  function handle(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    if (req.url === '/api/cards') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' });
      res.end(CARD_CATALOG);
      return true;
    }
    return serveStatic?.(req, res) ?? false;
  }

  /** /ws 업그레이드를 맡으면 true */
  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') return false;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    return true;
  }

  function close(): void {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }

  return { handle, upgrade, close, rooms, bots };
}

export function createApp(rooms = new RoomManager(), options: AppOptions = {}): { server: Server; rooms: RoomManager; bots: BotDriver } {
  const h = createHandlers(rooms, options);
  const server = createServer((req, res) => {
    if (h.handle(req, res)) return;
    res.writeHead(404);
    res.end();
  });
  server.on('upgrade', (req, socket, head) => {
    if (!h.upgrade(req, socket, head)) socket.destroy();
  });
  server.on('close', () => h.close());
  return { server, rooms: h.rooms, bots: h.bots };
}
