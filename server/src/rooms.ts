import { randomBytes, randomUUID } from 'node:crypto';
import { applyAction } from './engine/actions';
import type { GameAction } from './engine/actions';
import { createRng } from './engine/rng';
import type { Rng } from './engine/rng';
import { createGame } from './engine/setup';
import { GameError } from './engine/state';
import type { GameState } from './engine/state';
import type { Division } from './engine/types';
import { CHAT_MAX_LENGTH } from './protocol';
import type { ChatMessage, RoomView } from './protocol';

export interface RoomPlayer {
  id: string;
  name: string;
  token: string;
  connected: boolean;
  isBot: boolean;
}

const BOT_NAMES = ['봇-알파', '봇-브라보', '봇-찰리', '봇-델타'];

export interface Room {
  code: string;
  hostId: string;
  division: Division;
  status: 'lobby' | 'playing' | 'over';
  players: RoomPlayer[];
  seed: number;
  rng: Rng;
  game?: GameState;
  chat: ChatMessage[]; // 최근 CHAT_KEEP 개
  chatSeq: number;
  updatedAt: number;
}

export class RoomError extends Error {}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_PLAYERS = 4;
const MAX_NAME = 20;
const IDLE_MS = 6 * 60 * 60 * 1000;
const CHAT_KEEP = 100;
const CHAT_MIN_INTERVAL_MS = 300; // 같은 참가자의 연속 전송 간격 (도배 방지)

function makeCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]!).join('');
}

function cleanName(name: unknown): string {
  if (typeof name !== 'string') throw new RoomError('name required');
  const trimmed = name.trim().slice(0, MAX_NAME);
  if (!trimmed) throw new RoomError('name required');
  return trimmed;
}

export function roomView(room: Room): RoomView {
  return {
    code: room.code,
    status: room.status,
    division: room.division,
    players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected, isHost: p.id === room.hostId, isBot: p.isBot })),
  };
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new RoomError('room not found');
    return room;
  }

  create(name: string, seed = Date.now() % 2147483647): { room: Room; player: RoomPlayer } {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    const player = this.newPlayer(name);
    const room: Room = {
      code,
      hostId: player.id,
      division: 3,
      status: 'lobby',
      players: [player],
      seed,
      rng: createRng(seed),
      chat: [],
      chatSeq: 0,
      updatedAt: Date.now(),
    };
    this.rooms.set(code, room);
    return { room, player };
  }

  join(code: string, name: string): { room: Room; player: RoomPlayer } {
    const room = this.get(code);
    if (room.status !== 'lobby') throw new RoomError('game already started');
    if (room.players.length >= MAX_PLAYERS) throw new RoomError('room is full');
    const player = this.newPlayer(name);
    if (room.players.some((p) => p.name === player.name)) throw new RoomError('name already taken');
    room.players.push(player);
    room.updatedAt = Date.now();
    return { room, player };
  }

  // 대기실에서 호스트가 AI 참가자를 추가/제거한다
  addBot(code: string, playerId: string): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.status !== 'lobby') throw new RoomError('game already started');
    if (room.players.length >= MAX_PLAYERS) throw new RoomError('room is full');
    const name = BOT_NAMES.find((n) => !room.players.some((p) => p.name === n)) ?? `봇-${room.players.length + 1}`;
    room.players.push({ ...this.newPlayer(name), isBot: true });
    room.updatedAt = Date.now();
    return room;
  }

  removeBot(code: string, playerId: string, botId: string): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.status !== 'lobby') throw new RoomError('game already started');
    const idx = room.players.findIndex((p) => p.id === botId && p.isBot);
    if (idx < 0) throw new RoomError('no such bot');
    room.players.splice(idx, 1);
    room.updatedAt = Date.now();
    return room;
  }

  rejoin(code: string, playerId: string, token: string): { room: Room; player: RoomPlayer } {
    const room = this.get(code);
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.token !== token) throw new RoomError('invalid rejoin credentials');
    player.connected = true;
    room.updatedAt = Date.now();
    return { room, player };
  }

  disconnect(code: string, playerId: string): Room | undefined {
    const room = this.rooms.get(code);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player) return undefined;
    player.connected = false;
    room.updatedAt = Date.now();
    return room;
  }

  setDivision(code: string, playerId: string, division: Division): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.status !== 'lobby') throw new RoomError('game already started');
    if (![1, 2, 3].includes(division)) throw new RoomError('invalid division');
    room.division = division;
    return room;
  }

  start(code: string, playerId: string): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.status !== 'lobby') throw new RoomError('game already started');
    room.game = createGame(
      { id: room.code, division: room.division, players: room.players.map((p) => ({ id: p.id, name: p.name })) },
      room.rng,
    );
    room.status = 'playing';
    room.updatedAt = Date.now();
    return room;
  }

  act(code: string, playerId: string, action: GameAction): Room {
    const room = this.get(code);
    if (!room.game) throw new RoomError('game not started');
    if (!room.players.some((p) => p.id === playerId)) throw new RoomError('not in this room');
    try {
      room.game = applyAction(room.game, playerId, action, room.rng);
    } catch (e) {
      if (e instanceof GameError) throw new RoomError(e.message);
      throw e;
    }
    if (room.game.phase.kind === 'gameOver') room.status = 'over';
    room.updatedAt = Date.now();
    return room;
  }

  // 방 채팅: 참가자만 쓸 수 있다(관전자는 읽기만). 공백 정리 후 최대 CHAT_MAX_LENGTH 자, 최근 CHAT_KEEP 개만 보관
  chat(code: string, playerId: string, text: unknown, now = Date.now()): Room {
    const room = this.get(code);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new RoomError('not in this room');
    if (typeof text !== 'string') throw new RoomError('text required');
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
    if (!clean) throw new RoomError('text required');
    const last = [...room.chat].reverse().find((m) => m.playerId === playerId);
    if (last && now - last.at < CHAT_MIN_INTERVAL_MS) throw new RoomError('too many messages');
    room.chat.push({ id: ++room.chatSeq, playerId, name: player.name, text: clean, at: now });
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
    room.updatedAt = now;
    return room;
  }

  // 오래 놀고 있는 방 정리
  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (now - room.updatedAt > IDLE_MS) {
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }

  private requireHost(room: Room, playerId: string): void {
    if (room.hostId !== playerId) throw new RoomError('host only');
  }

  private newPlayer(name: string): RoomPlayer {
    return { id: randomUUID().slice(0, 8), name: cleanName(name), token: randomUUID(), connected: true, isBot: false };
  }
}
