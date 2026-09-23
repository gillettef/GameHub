import { randomBytes, randomUUID } from 'node:crypto';
import { applyAction } from './engine/actions';
import type { GameAction } from './engine/actions';
import { tagged } from './engine/labels';
import { createRng } from './engine/rng';
import type { Rng } from './engine/rng';
import { createGame } from './engine/setup';
import { GameError, addLog } from './engine/state';
import type { GameState } from './engine/state';
import type { Division } from './engine/types';
import { CHAT_MAX_LENGTH, EMBLEM_IDS } from './protocol';
import type { ChatMessage, EmblemId, RoomView } from './protocol';

export interface RoomPlayer {
  id: string;
  name: string;
  emblem: EmblemId;
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

// 아직 아무도 쓰지 않는 엠블럼 중 무작위 하나 (정원 4명 < 프리셋 12개라 항상 있다).
// 게임 난수(room.rng)는 건드리지 않는다 — 시드 고정 판의 재현성과 무관한 꾸밈이라 Math.random 을 쓴다.
function freeEmblem(players: RoomPlayer[]): EmblemId {
  const free = EMBLEM_IDS.filter((e) => !players.some((p) => p.emblem === e));
  return free[Math.floor(Math.random() * free.length)] ?? EMBLEM_IDS[0];
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
    players: room.players.map((p) => ({ id: p.id, name: p.name, emblem: p.emblem, connected: p.connected, isHost: p.id === room.hostId, isBot: p.isBot })),
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
    const player = this.newPlayer(name, []);
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
    const player = this.newPlayer(name, room.players);
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
    room.players.push({ ...this.newPlayer(name, room.players), isBot: true });
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

  // 강퇴(사용자 요청, 2026-09): 호스트가 대기실에서 참가자를 내보낸다. 봇·연결 끊긴 참가자도 대상, 자기 자신은 안 된다.
  // 게임이 시작된 뒤에는 자리가 고정되어 있어 내보낼 수 없다
  kick(code: string, playerId: string, targetId: string): { room: Room; kicked: RoomPlayer } {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.status !== 'lobby') throw new RoomError('game already started');
    if (targetId === room.hostId) throw new RoomError('cannot kick the host');
    const idx = room.players.findIndex((p) => p.id === targetId);
    if (idx < 0) throw new RoomError('no such player');
    const [kicked] = room.players.splice(idx, 1);
    room.updatedAt = Date.now();
    return { room, kicked: kicked! };
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

  // 구단 엠블럼 고르기 (사용자 요청 2026-09): 대기실에서만, 참가자 누구나 자기 것을. 다른 참가자(봇 포함)가 쓰는 엠블럼은 고를 수 없다
  setEmblem(code: string, playerId: string, emblem: EmblemId): Room {
    const room = this.get(code);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new RoomError('not in this room');
    if (room.status !== 'lobby') throw new RoomError('game already started');
    if (!EMBLEM_IDS.includes(emblem)) throw new RoomError('invalid emblem');
    if (room.players.some((p) => p.id !== playerId && p.emblem === emblem)) throw new RoomError('emblem already taken');
    player.emblem = emblem;
    room.updatedAt = Date.now();
    return room;
  }

  start(code: string, playerId: string): Room {
    const room = this.get(code);
    this.requireHost(room, playerId);
    if (room.status !== 'lobby') throw new RoomError('game already started');
    // 시작 순서는 항상 무작위(옵션 아님 — 사용자 결정 2026-09): 자리(시계방향 차례)를 섞는다. 첫 자리가 1주차 선 참가자. 대기실 목록도 같은 순서로 맞춘다
    room.players = room.rng.shuffle(room.players);
    room.game = createGame(
      { id: room.code, division: room.division, players: room.players.map((p) => ({ id: p.id, name: p.name })) },
      room.rng,
    );
    if (room.players.length > 1) addLog(room.game, tagged('준비', `시작 순서를 무작위로 정함: ${room.players.map((p) => p.name).join(' → ')}`));
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

  private newPlayer(name: string, others: RoomPlayer[]): RoomPlayer {
    return { id: randomUUID().slice(0, 8), name: cleanName(name), emblem: freeEmblem(others), token: randomUUID(), connected: true, isBot: false };
  }
}
