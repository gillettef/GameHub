import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import * as data from './data';
import type { BotDriver } from './bot/driver';
import { RoomManager } from './rooms';
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

export function createApp(rooms = new RoomManager(), options: WsOptions = {}): { server: Server; rooms: RoomManager; bots: BotDriver } {
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
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  const bots = attachWebSocket(wss, rooms, options);
  return { server, rooms, bots };
}
