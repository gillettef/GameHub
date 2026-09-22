/**
 * 방 관리 (F001, F002, F003, F026, F030). 소켓과 무관한 순수 로직이라 단위 테스트가 쉽다.
 * 단일 진실 공급원은 `rooms` 맵의 GameState 다. 모든 변경은 shared 엔진을 거친다.
 * 오류는 RoomError 로 던지고, index.ts 가 ack { ok:false, message } 로 바꾼다.
 */
import type { Action, GameState, MapId, PlayerId, RoomId, RoomInfo, RoomPeek } from '@astraltab/shared';
import {
  DEFAULT_MAP_ID,
  MAX_PLAYERS,
  applyAction,
  changeMap,
  createInitialState,
  createPlayer,
  getMap,
  hasMap,
  joinPlayer,
  leaveLobby,
} from '@astraltab/shared';

export class RoomError extends Error {}

/** 직렬화되는 방 레코드. JSON 스냅샷(F006)이 이 모양 그대로다 */
export interface Room {
  roomId: RoomId;
  hostId: PlayerId;
  password: string | null;
  createdAt: number;
  updatedAt: number;
  state: GameState;
  /** 사람 플레이어의 재접속 토큰 → 플레이어 id (F007). 절대 클라이언트에 보내지 않는다 */
  tokens: Record<string, PlayerId>;
  /** 다음 플레이어 id 번호 (사람·AI 공용) */
  nextPlayerNo: number;
}

export interface RoomManagerOptions {
  seed: () => number;
  now: () => number;
  roomId: () => RoomId;
}

const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 초대 링크용 짧은 방 id (혼동되는 글자 제외). 서버에서 랜덤 발급 */
export function randomRoomId(length = 6): RoomId {
  let out = '';
  for (let i = 0; i < length; i++) out += ROOM_ID_ALPHABET[Math.floor(Math.random() * ROOM_ID_ALPHABET.length)];
  return out;
}

export function isValidNickname(nickname: string): boolean {
  const n = nickname.trim();
  return n.length >= 1 && n.length <= 12;
}

export class RoomManager {
  private readonly rooms = new Map<RoomId, Room>();
  private readonly opts: RoomManagerOptions;

  constructor(opts: Partial<RoomManagerOptions> = {}) {
    this.opts = {
      seed: opts.seed ?? (() => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0),
      now: opts.now ?? (() => Date.now()),
      roomId: opts.roomId ?? randomRoomId,
    };
  }

  // -------------------------------------------------------------------------
  // 조회
  // -------------------------------------------------------------------------

  get(roomId: RoomId): Room | undefined {
    return this.rooms.get(roomId);
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  /** 스냅샷 복구 (F007). 같은 id 가 있으면 덮어쓴다 */
  load(room: Room): void {
    this.rooms.set(room.roomId, room);
  }

  private require(roomId: RoomId): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomError('없는 방입니다. 초대 링크를 다시 확인하세요');
    return room;
  }

  info(room: Room, connected: PlayerId[]): RoomInfo {
    return { roomId: room.roomId, hostId: room.hostId, hasPassword: room.password !== null, createdAt: room.createdAt, connected };
  }

  peek(roomId: RoomId): RoomPeek {
    const room = this.require(roomId);
    return {
      roomId,
      hasPassword: room.password !== null,
      phase: room.state.phase,
      mapId: room.state.mapId,
      players: room.state.players.length,
      capacity: getMap(room.state.mapId).players,
    };
  }

  playerIdOf(roomId: RoomId, playerToken: string): PlayerId | null {
    const room = this.rooms.get(roomId);
    return room?.tokens[playerToken] ?? null;
  }

  // -------------------------------------------------------------------------
  // 생성 · 입장 · 퇴장
  // -------------------------------------------------------------------------

  create(input: { playerToken: string; nickname: string; password?: string; mapId?: MapId }): { room: Room; playerId: PlayerId } {
    if (!isValidNickname(input.nickname)) throw new RoomError('닉네임은 1~12자로 입력하세요');
    const password = input.password?.trim() || null;
    if (password !== null && !/^\d{4}$/.test(password)) throw new RoomError('비밀번호는 숫자 4자리입니다');
    const mapId = input.mapId ?? DEFAULT_MAP_ID;
    if (!hasMap(mapId)) throw new RoomError('없는 맵입니다');

    let roomId = this.opts.roomId();
    while (this.rooms.has(roomId)) roomId = this.opts.roomId();
    const now = this.opts.now();
    const playerId = 'p1';
    const joined = joinPlayer(createInitialState(roomId, mapId, this.opts.seed()), createPlayer(playerId, input.nickname.trim(), 'human'));
    if (joined.error) throw new RoomError(joined.error);
    const room: Room = {
      roomId,
      hostId: playerId,
      password,
      createdAt: now,
      updatedAt: now,
      state: joined.state,
      tokens: { [input.playerToken]: playerId },
      nextPlayerNo: 2,
    };
    this.rooms.set(roomId, room);
    return { room, playerId };
  }

  /**
   * 입장. 토큰이 이미 방에 있으면 재접속(게임 중이어도 허용, F007).
   * 새 토큰은 로비에서만, 빈 좌석이 있을 때만 받는다.
   */
  join(input: { roomId: RoomId; playerToken: string; nickname: string; password?: string }): { room: Room; playerId: PlayerId; reconnected: boolean } {
    const room = this.require(input.roomId);
    const existing = room.tokens[input.playerToken];
    if (existing && room.state.players.some((p) => p.id === existing)) {
      return { room, playerId: existing, reconnected: true };
    }
    if (room.password !== null && (input.password ?? '') !== room.password) {
      throw new RoomError(room.password !== null && input.password ? '비밀번호가 다릅니다' : '비밀번호가 필요합니다');
    }
    if (room.state.phase !== 'lobby') throw new RoomError('이미 시작된 게임입니다');
    if (!isValidNickname(input.nickname)) throw new RoomError('닉네임은 1~12자로 입력하세요');
    const capacity = getMap(room.state.mapId).players;
    if (room.state.players.length >= capacity) {
      throw new RoomError(`정원(${capacity}명)이 찼습니다. 방장이 AI 좌석을 비우거나 더 큰 맵을 고르면 들어올 수 있습니다`);
    }
    const playerId = `p${room.nextPlayerNo}`;
    const joined = joinPlayer(room.state, createPlayer(playerId, input.nickname.trim(), 'human'));
    if (joined.error) throw new RoomError(joined.error);
    room.state = joined.state;
    room.nextPlayerNo += 1;
    room.tokens[input.playerToken] = playerId;
    this.touch(room);
    return { room, playerId, reconnected: false };
  }

  /** 로비 퇴장. 방장이 나가면 남은 사람에게 넘기고, 사람이 없으면 방을 없앤다. 반환 null = 방 삭제됨 */
  leave(roomId: RoomId, playerId: PlayerId): Room | null {
    const room = this.require(roomId);
    const r = leaveLobby(room.state, playerId);
    if (r.error) throw new RoomError(r.error);
    room.state = r.state;
    for (const [token, id] of Object.entries(room.tokens)) if (id === playerId) delete room.tokens[token];
    const humans = room.state.players.filter((p) => p.kind === 'human');
    if (humans.length === 0) {
      this.rooms.delete(roomId);
      return null;
    }
    if (room.hostId === playerId) room.hostId = (humans[0] as { id: PlayerId }).id;
    this.touch(room);
    return room;
  }

  /** 끝난 방·빈 방 정리용 */
  remove(roomId: RoomId): void {
    this.rooms.delete(roomId);
  }

  // -------------------------------------------------------------------------
  // 로비 설정 (방장)
  // -------------------------------------------------------------------------

  private requireHost(room: Room, playerId: PlayerId): void {
    if (room.hostId !== playerId) throw new RoomError('방장만 할 수 있습니다');
  }

  setMap(roomId: RoomId, byPlayerId: PlayerId, mapId: MapId): Room {
    const room = this.require(roomId);
    this.requireHost(room, byPlayerId);
    if (!hasMap(mapId)) throw new RoomError('없는 맵입니다');
    const r = changeMap(room.state, mapId);
    if (r.error) throw new RoomError(r.error);
    room.state = r.state;
    this.touch(room);
    return room;
  }

  /** 빈 좌석에 AI 추가 (F026). AI 는 기본 덱을 고르고 준비 완료로 들어온다 */
  addAi(roomId: RoomId, byPlayerId: PlayerId): { room: Room; playerId: PlayerId } {
    const room = this.require(roomId);
    this.requireHost(room, byPlayerId);
    if (room.state.phase !== 'lobby') throw new RoomError('이미 시작된 게임입니다');
    const capacity = getMap(room.state.mapId).players;
    if (room.state.players.length >= capacity) throw new RoomError(`정원(${capacity}명)이 찼습니다`);
    const aiCount = room.state.players.filter((p) => p.kind === 'ai').length;
    const playerId = `p${room.nextPlayerNo}`;
    const joined = joinPlayer(room.state, createPlayer(playerId, `AI ${aiCount + 1}`, 'ai'));
    if (joined.error) throw new RoomError(joined.error);
    room.state = joined.state;
    room.nextPlayerNo += 1;
    this.touch(room);
    return { room, playerId };
  }

  removeAi(roomId: RoomId, byPlayerId: PlayerId, aiId: PlayerId): Room {
    const room = this.require(roomId);
    this.requireHost(room, byPlayerId);
    const target = room.state.players.find((p) => p.id === aiId);
    if (!target || target.kind !== 'ai') throw new RoomError('AI 좌석이 아닙니다');
    const r = leaveLobby(room.state, aiId);
    if (r.error) throw new RoomError(r.error);
    room.state = r.state;
    this.touch(room);
    return room;
  }

  // -------------------------------------------------------------------------
  // 게임 액션
  // -------------------------------------------------------------------------

  /** 사람 플레이어의 액션. 본인 id 로만 보낼 수 있다 */
  act(roomId: RoomId, byPlayerId: PlayerId, action: Action): Room {
    if (action.playerId !== byPlayerId) throw new RoomError('다른 플레이어의 액션은 보낼 수 없습니다');
    const player = this.require(roomId).state.players.find((p) => p.id === byPlayerId);
    if (player?.kind === 'ai') throw new RoomError('AI 좌석은 서버가 조작합니다');
    return this.apply(roomId, action);
  }

  /** 검증 포함 적용. AI 턴 실행기가 폴백 판단을 위해 error 를 받는다 */
  tryApply(roomId: RoomId, action: Action): { room: Room; error?: string } {
    const room = this.require(roomId);
    const r = applyAction(room.state, action);
    if (r.error) return { room, error: r.error };
    room.state = r.state;
    this.touch(room);
    return { room };
  }

  private apply(roomId: RoomId, action: Action): Room {
    const r = this.tryApply(roomId, action);
    if (r.error) throw new RoomError(r.error);
    return r.room;
  }

  private touch(room: Room): void {
    room.updatedAt = this.opts.now();
  }

  /** 현재 턴이 AI 인 방인가 (AI 턴 실행기가 확인) */
  static isAiTurn(state: GameState): boolean {
    if (state.phase !== 'playing' || !state.currentPlayerId) return false;
    return state.players.find((p) => p.id === state.currentPlayerId)?.kind === 'ai';
  }
}

export { MAX_PLAYERS };
