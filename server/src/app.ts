import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import * as data from './data';
import { RoomManager } from './rooms';
import { attachWebSocket } from './ws';

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

export function createApp(rooms = new RoomManager()): { server: Server; rooms: RoomManager } {
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
  attachWebSocket(wss, rooms);
  return { server, rooms };
}
