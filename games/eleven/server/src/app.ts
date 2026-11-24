import { createServer } from 'node:http';
import type { Server } from 'node:http';
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

export function createApp(rooms = new RoomManager(), options: AppOptions = {}): { server: Server; rooms: RoomManager; bots: BotDriver } {
  const serveStatic = createStaticHandler(options.staticDir);
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/api/cards') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' });
      res.end(CARD_CATALOG);
      return;
    }
    if (serveStatic?.(req, res)) return;
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  const bots = attachWebSocket(wss, rooms, options);
  return { server, rooms, bots };
}
