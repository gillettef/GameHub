/**
 * 방 관리 (F001, F002, F003, F026). 소켓과 무관한 순수 로직이라 단위 테스트가 쉽다.
 * 단일 진실 공급원은 `rooms` 맵의 GameState 다. 모든 변경은 shared 엔진을 거친다.
 * 오류는 RoomError 로 던지고, index.ts 가 ack { ok:false, message } 로 바꾼다.
 */
import { randomInt } from 'node:crypto';
import type { Action, GameState, PlayerId, RoomId, RoomInfo, RoomPeek } from '@rootbound/shared';
import {
  AFK_STRIKES_FOR_AUTOPILOT,
  DEFAULT_TURN_TIME_SEC,
  MAX_PLAYERS,
  TURN_TIME_OPTIONS_SEC,
  applyAction,
  autoAction,
  createInitialState,
  createPlayer,
  draftTimeSec,
  isDirection,
  GOALS,
  isSpeciesId,
  joinPlayer,
  leaveLobby,
} from '@rootbound/shared';

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
  /** 턴 제한 시간(초). null = 제한 없음(비동기 턴). Rules.md 5.4. 옛 스냅샷엔 없을 수 있다 */
  turnTimeLimitSec?: number | null;
  /** 현재 턴이 시작된 서버 시각과 그 턴 번호. 턴 번호가 바뀌면 시계를 다시 잰다 */
  turnStartedAt?: number | null;
  /** 시계를 잰 대상 (단계·차례 번호·드래프트 픽 번호). 바뀌면 시계를 다시 잰다 */
  turnClockFor?: string | null;
  /** 사람 좌석별 연속 시간 초과 횟수. 본인이 직접 행동하면 0 */
  afkStrikes?: Record<PlayerId, number>;
  /** 연속 시간 초과로 AI 가 대신 두는 사람 좌석 */
  autopilot?: PlayerId[];
  /** 판 전체 누적: 좌석별 시간 초과 횟수와 한 번이라도 AI 대리가 됐는지 (판 요약용, afkStrikes 와 별개) */
  timeoutTotals?: Record<PlayerId, number>;
  everAutopiloted?: PlayerId[];
  /** 게임이 시작된 서버 시각 (판 요약 로그용) */
  startedAt?: number | null;
  /** 판 요약을 이미 기록했는지 (중복 기록 방지) */
  statsRecorded?: boolean;
}

/** 판 요약 한 줄 (server/data/<env>/stats/games.jsonl). 완수율·세션 시간·재방문 집계용 */
export interface GameRecord {
  roomId: RoomId;
  players: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  rounds: number;
  turns: number;
  /** finished = 정상 종료, abandoned = 진행 중 방치되어 정리됨 */
  outcome: 'finished' | 'abandoned';
  reason: string | null;
  turnTimeLimitSec: number | null;
  seats: {
    seat: number;
    kind: 'human' | 'ai';
    /** 드래프트로 고른 종 */
    drafted: string[];
    /** 재접속 토큰의 해시 일부 (재방문 집계용, 원본 토큰은 남기지 않는다) */
    playerHash: string | null;
    rank: number | null;
    score: number | null;
    surrendered: boolean;
    timeouts: number;
    autopiloted: boolean;
  }[];
}

/** 시간 초과·AI 대리 로그 문구 */
const TIMEOUT_LOG_MARK = '자동으로 둡니다';
const AUTOPILOT_LOG_MARK = 'AI가 대신 둡니다';

export interface RoomManagerOptions {
  seed: () => number;
  now: () => number;
  roomId: () => RoomId;
  /** 판 요약용 토큰 해시. 기본은 해시 없음(null) — index.ts 가 sha256 을 넣는다 */
  hashToken: (token: string) => string | null;
}

/** 서버 하나가 동시에 들고 있을 수 있는 방 수 (공개 IP 에서 방을 무한히 만드는 것을 막는다) */
export const MAX_ROOMS = 300;
const IDLE_MS = 24 * 60 * 60 * 1000;
const PLAYING_IDLE_MS = 7 * IDLE_MS;

/** 시계 대상 키: 단계 + 차례 번호 + 드래프트 픽 번호 */
function clockKey(state: GameState): string {
  return `${state.phase}:${state.turn}:${state.draftIndex}`;
}

/** 사람이 읽기 쉬운 짧은 시간 표기 */
function secLabel(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`;
}

const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 초대 링크용 짧은 방 id (혼동되는 글자 제외). 서버에서 랜덤 발급 */
export function randomRoomId(length = 6): RoomId {
  let out = '';
  for (let i = 0; i < length; i++) out += ROOM_ID_ALPHABET[Math.floor(Math.random() * ROOM_ID_ALPHABET.length)];
  return out;
}

const isPos = (v: unknown): boolean => {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p === 'object' && Number.isInteger(p.q) && Number.isInteger(p.r);
};

/** 소켓으로 들어온 액션의 모양 검사. 타입 정의만 믿고 엔진에 넘기지 않는다(조작된 클라이언트 방어) */
export function actionShapeError(action: unknown): string | null {
  const a = action as Record<string, unknown> | null;
  if (!a || typeof a !== 'object' || typeof a.type !== 'string' || typeof a.playerId !== 'string') return '잘못된 요청입니다';
  switch (a.type) {
    case 'READY':
    case 'SURRENDER':
      return null;
    case 'DRAFT':
    case 'DISCARD':
      return isSpeciesId(a.species) ? null : '없는 식물입니다';
    case 'PLANT':
      if (!isSpeciesId(a.species) || !isPos(a.pos)) return '잘못된 심기 요청입니다';
      if (a.direction !== undefined && !isDirection(a.direction)) return '잘못된 방향입니다';
      if (a.seed !== undefined && !isPos(a.seed)) return '잘못된 씨앗 위치입니다';
      return null;
    default:
      return '알 수 없는 행동입니다';
  }
}

/** 지금 규칙(Rootbound) 형식의 방인가. 예전 우주 전투판 스냅샷은 board·plants 모양이 다르다 */
export function isCurrentFormat(room: Room): boolean {
  const st = room.state as Partial<GameState> | undefined;
  if (!st || !Array.isArray(st.players) || !Array.isArray(st.plants) || !Array.isArray(st.seeds)) return false;
  if (!(st.board === null || (typeof st.board === 'object' && Array.isArray(st.board?.cells)))) return false;
  // 종·목표 id 가 바뀐 예전 판(2026-10-08 선인장·덩굴·해바라기·장미 → 소나무·칡·유채·무궁화)은 복원하지 않는다
  const species = [...st.plants.map((p) => p.species), ...st.players.flatMap((p) => [...(p.drafted ?? []), ...(p.deck ?? []), ...(p.hand ?? [])])];
  return species.every((sp) => isSpeciesId(sp)) && (st.goals ?? []).every((g) => GOALS.some((x) => x.id === g));
}

/** 재접속 토큰: 문자열, 1~64자 (스냅샷·메모리에 그대로 들어가므로 길이를 제한한다) */
export function isValidToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 1 && token.length <= 64;
}

export function isValidNickname(nickname: string): boolean {
  if (typeof nickname !== 'string') return false;
  const n = nickname.trim();
  return n.length >= 1 && n.length <= 12;
}

export class RoomManager {
  private readonly rooms = new Map<RoomId, Room>();
  private readonly opts: RoomManagerOptions;

  constructor(opts: Partial<RoomManagerOptions> = {}) {
    this.opts = {
      // 보드·덱 시드는 암호학적 난수로 (덱 시드를 추측할 수 없어야 손패가 비공개로 남는다)
      seed: opts.seed ?? (() => randomInt(0, 2 ** 32)),
      now: opts.now ?? (() => Date.now()),
      roomId: opts.roomId ?? randomRoomId,
      hashToken: opts.hashToken ?? (() => null),
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
    // 예전 게임(AstralTab 우주 전투판) 스냅샷은 규칙이 달라 이어 갈 수 없다: index.ts 가 걸러 낸다(isCurrentFormat)
    if (room.turnTimeLimitSec === undefined) room.turnTimeLimitSec = null; // 타이머 이전 방은 비동기로 이어 간다
    room.afkStrikes ??= {};
    room.autopilot ??= [];
    room.timeoutTotals ??= {};
    room.everAutopiloted ??= [];
    // 서버가 내려가 있던 시간을 플레이어 책임으로 돌리지 않는다: 진행 중인 턴은 복원 시점부터 시계를 새로 잰다
    if (room.state.phase === 'playing' || room.state.phase === 'drafting') {
      room.turnClockFor = clockKey(room.state);
      room.turnStartedAt = this.opts.now();
    }
    // 판 요약 이전에 시작된 판은 시작 시각을 모르므로 기록하지 않는다
    room.statsRecorded ??= room.state.phase !== 'lobby';
    this.rooms.set(room.roomId, room);
    this.syncClock(room);
  }

  /** 오래 방치된 방을 지우고 지운 id 를 돌려준다. 끝난 방·로비는 하루, 진행 중인 방은 이레 동안 변화가 없을 때 */
  pruneStale(): { roomId: RoomId; record: GameRecord | null }[] {
    const now = this.opts.now();
    const removed: { roomId: RoomId; record: GameRecord | null }[] = [];
    for (const room of this.rooms.values()) {
      const idle = now - room.updatedAt;
      const inGame = room.state.phase === 'playing' || room.state.phase === 'drafting';
      const limit = inGame ? PLAYING_IDLE_MS : IDLE_MS;
      if (idle > limit) {
        this.rooms.delete(room.roomId);
        // 진행 중에 방치된 판도 완수율 분모에 들어가야 하므로 'abandoned' 로 남긴다
        removed.push({ roomId: room.roomId, record: inGame ? this.takeRecord(room, 'abandoned') : null });
      }
    }
    return removed;
  }

  private require(roomId: RoomId): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomError('없는 방입니다. 초대 링크를 다시 확인하세요');
    return room;
  }

  info(room: Room, connected: PlayerId[]): RoomInfo {
    return {
      roomId: room.roomId,
      hostId: room.hostId,
      hasPassword: room.password !== null,
      createdAt: room.createdAt,
      connected,
      turnTimeLimitSec: room.turnTimeLimitSec ?? null,
      turnDeadline: this.deadline(room),
      serverNow: this.opts.now(),
      autopilot: [...(room.autopilot ?? [])],
    };
  }

  peek(roomId: RoomId): RoomPeek {
    const room = this.require(roomId);
    return {
      roomId,
      hasPassword: room.password !== null,
      phase: room.state.phase,
      players: room.state.players.length,
      capacity: MAX_PLAYERS,
    };
  }

  playerIdOf(roomId: RoomId, playerToken: string): PlayerId | null {
    const room = this.rooms.get(roomId);
    return room?.tokens[playerToken] ?? null;
  }

  // -------------------------------------------------------------------------
  // 생성 · 입장 · 퇴장
  // -------------------------------------------------------------------------

  create(input: { playerToken: string; nickname: string; password?: string }): { room: Room; playerId: PlayerId } {
    if (!isValidToken(input.playerToken)) throw new RoomError('잘못된 요청입니다');
    if (!isValidNickname(input.nickname)) throw new RoomError('닉네임은 1~12자로 입력하세요');
    const password = input.password?.trim() || null;
    if (password !== null && !/^\d{4}$/.test(password)) throw new RoomError('비밀번호는 숫자 4자리입니다');
    if (this.rooms.size >= MAX_ROOMS) throw new RoomError('서버가 가득 찼습니다. 잠시 후 다시 시도하세요');

    let roomId = this.opts.roomId();
    while (this.rooms.has(roomId)) roomId = this.opts.roomId();
    const now = this.opts.now();
    const playerId = 'p1';
    const joined = joinPlayer(createInitialState(roomId, this.opts.seed(), this.opts.seed()), createPlayer(playerId, input.nickname.trim(), 'human'));
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
      turnTimeLimitSec: DEFAULT_TURN_TIME_SEC,
      turnStartedAt: null,
      turnClockFor: null,
      afkStrikes: {},
      autopilot: [],
      timeoutTotals: {},
      everAutopiloted: [],
      startedAt: null,
      statsRecorded: false,
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
    if (!isValidToken(input.playerToken)) throw new RoomError('잘못된 요청입니다');
    const existing = room.tokens[input.playerToken];
    if (existing && room.state.players.some((p) => p.id === existing)) {
      // 재접속만으로는 AI 대리를 풀지 않는다: 탭을 켜 둔 채 자리를 비워도 소켓은 자동으로 다시 붙기 때문이다.
      // 돌아온 사람은 '직접 두기'(resume) 나 직접 행동으로 되찾는다 (Rules.md 5.4)
      return { room, playerId: existing, reconnected: true };
    }
    if (room.password !== null && (input.password ?? '') !== room.password) {
      throw new RoomError(room.password !== null && input.password ? '비밀번호가 다릅니다' : '비밀번호가 필요합니다');
    }
    if (room.state.phase !== 'lobby') throw new RoomError('이미 시작된 게임입니다');
    if (!isValidNickname(input.nickname)) throw new RoomError('닉네임은 1~12자로 입력하세요');
    if (room.state.players.length >= MAX_PLAYERS) {
      throw new RoomError(`정원은 최대 ${MAX_PLAYERS}명입니다`);
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

  /** 차례 제한 시간 변경 (Rules.md 6.3). 로비에서 방장만 */
  setTurnTime(roomId: RoomId, byPlayerId: PlayerId, seconds: number | null): Room {
    const room = this.require(roomId);
    this.requireHost(room, byPlayerId);
    if (room.state.phase !== 'lobby') throw new RoomError('제한 시간은 시작 전에만 바꿀 수 있습니다');
    if (!TURN_TIME_OPTIONS_SEC.includes(seconds)) throw new RoomError('고를 수 없는 시간입니다');
    room.turnTimeLimitSec = seconds;
    this.touch(room);
    return room;
  }

  /** 빈 좌석에 AI 추가 (F026). AI 는 준비 완료로 들어온다 */
  addAi(roomId: RoomId, byPlayerId: PlayerId): { room: Room; playerId: PlayerId } {
    const room = this.require(roomId);
    this.requireHost(room, byPlayerId);
    if (room.state.phase !== 'lobby') throw new RoomError('이미 시작된 게임입니다');
    if (room.state.players.length >= MAX_PLAYERS) throw new RoomError(`정원은 최대 ${MAX_PLAYERS}명입니다`);
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
    const shapeError = actionShapeError(action);
    if (shapeError) throw new RoomError(shapeError);
    if (action.playerId !== byPlayerId) throw new RoomError('다른 플레이어의 액션은 보낼 수 없습니다');
    const room = this.require(roomId);
    const player = room.state.players.find((p) => p.id === byPlayerId);
    if (player?.kind === 'ai') throw new RoomError('AI 좌석은 서버가 조작합니다');
    const applied = this.apply(roomId, action);
    // 받아들여진 행동을 했으면 자리에 있는 것이다: 시간 초과 기록과 AI 대리를 푼다.
    // 거부된 액션으로는 풀지 않는다(풀리고 commit 이 없으면 아무도 그 턴을 진행하지 않는다)
    this.releaseAutopilot(room, byPlayerId);
    return applied;
  }

  /** AI 대리 중인 내 좌석을 되찾는다 (Rules.md 5.4) */
  resume(roomId: RoomId, byPlayerId: PlayerId): Room {
    const room = this.require(roomId);
    if (!room.state.players.some((p) => p.id === byPlayerId && p.kind === 'human')) throw new RoomError('이 방의 플레이어가 아닙니다');
    this.releaseAutopilot(room, byPlayerId);
    this.touch(room);
    return room;
  }

  private releaseAutopilot(room: Room, playerId: PlayerId): void {
    room.afkStrikes = { ...(room.afkStrikes ?? {}), [playerId]: 0 };
    if (room.autopilot?.includes(playerId)) {
      room.autopilot = room.autopilot.filter((id) => id !== playerId);
      // 대리 중에 지나간 시간 때문에 곧바로 시간 초과되지 않게 지금 턴의 시계를 새로 잰다
      if (room.state.currentPlayerId === playerId) room.turnStartedAt = this.opts.now();
    }
  }

  // -------------------------------------------------------------------------
  // 턴 제한 시간 (Rules.md 5.4)
  // -------------------------------------------------------------------------

  /** 지금 턴이 시간 초과되는 시각. 제한 없음·진행 중 아님·AI 턴·AI 대리 중·기다리는 사람이 없는 판이면 null */
  deadline(room: Room): number | null {
    const state = room.state;
    // 기권 안 한 사람이 1명뿐이면(나머지는 AI) 기다리는 사람이 없으니 시계를 재지 않는다 (Rules.md 6.3)
    if (state.players.filter((p) => p.kind !== 'ai' && p.surrenderedOrder === null).length <= 1) return null;
    const turnLimit = room.turnTimeLimitSec ?? null;
    const limit = state.phase === 'drafting' ? draftTimeSec(turnLimit) : state.phase === 'playing' ? turnLimit : null;
    if (limit === null || !state.currentPlayerId || room.turnStartedAt == null) return null;
    if (this.isAutoTurn(room)) return null;
    return room.turnStartedAt + limit * 1000;
  }

  /**
   * 시간 초과 처리. 마감이 지났으면 엔진의 자동 수(autoAction: 드래프트 첫 종 / 맨 앞 카드를 첫 칸에)를 적용하고 연속 초과 횟수를
   * 올린다. AFK_STRIKES_FOR_AUTOPILOT 번 연속이면 그 좌석을 AI 대리로 돌린다. 처리했으면 방을 돌려준다
   */
  timeoutTurn(roomId: RoomId): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const deadline = this.deadline(room);
    if (deadline === null || this.opts.now() < deadline) return null;
    const pid = room.state.currentPlayerId as PlayerId;
    const nick = room.state.players.find((p) => p.id === pid)?.nickname ?? pid;
    const strikes = (room.afkStrikes?.[pid] ?? 0) + 1;
    const limit = (room.state.phase === 'drafting' ? draftTimeSec(room.turnTimeLimitSec ?? null) : room.turnTimeLimitSec) as number;
    const note = (message: string) => ({ turn: room.state.turn, round: room.state.round, playerId: pid, kind: 'system' as const, message });
    const auto = autoAction(room.state, pid);
    const r = auto ? applyAction(room.state, auto) : { state: room.state, error: '둘 수 있는 수가 없습니다' };
    if (r.error) {
      console.error(`[timer] room=${roomId} ${pid} 자동 수 거부: ${r.error}`);
      return null;
    }
    // 안내는 자동 수 로그 바로 앞에 끼운다(진행 탭에서 "왜 그렇게 뒀는지"가 그 줄 위에 보인다)
    const before = room.state.log.length;
    room.state = { ...r.state, log: [...r.state.log.slice(0, before), note(`${nick}: 시간 초과(${secLabel(limit)})로 ${TIMEOUT_LOG_MARK}`), ...r.state.log.slice(before)] };
    room.afkStrikes = { ...(room.afkStrikes ?? {}), [pid]: strikes };
    room.timeoutTotals = { ...(room.timeoutTotals ?? {}), [pid]: (room.timeoutTotals?.[pid] ?? 0) + 1 };
    if (strikes >= AFK_STRIKES_FOR_AUTOPILOT && room.state.phase !== 'finished' && !room.autopilot?.includes(pid)) {
      room.autopilot = [...(room.autopilot ?? []), pid];
      if (!room.everAutopiloted?.includes(pid)) room.everAutopiloted = [...(room.everAutopiloted ?? []), pid];
      room.state = {
        ...room.state,
        log: [...room.state.log, note(`${nick}: ${strikes}번 연속 시간 초과로 ${AUTOPILOT_LOG_MARK}. '직접 두기'를 누르면 되찾습니다`)],
      };
    }
    this.touch(room);
    return room;
  }

  /** 차례(또는 드래프트 픽)가 바뀌었으면 시계를 다시 잰다. 게임 시작 시각도 여기서 남긴다 */
  private syncClock(room: Room): void {
    const state = room.state;
    if (state.phase === 'lobby') {
      room.turnStartedAt = null;
      room.turnClockFor = null;
      return;
    }
    room.startedAt ??= this.opts.now();
    if (state.phase === 'finished') {
      room.turnStartedAt = null;
      room.turnClockFor = null;
      return;
    }
    const key = clockKey(state);
    if (room.turnClockFor !== key) {
      room.turnClockFor = key;
      room.turnStartedAt = this.opts.now();
    }
  }

  // -------------------------------------------------------------------------
  // 판 요약 (server/data/<env>/stats/games.jsonl)
  // -------------------------------------------------------------------------

  /** 끝난(또는 방치된) 판의 요약. 한 판에 한 번만 돌려주고 이후엔 null */
  takeRecord(room: Room, outcome: GameRecord['outcome'] = 'finished'): GameRecord | null {
    if (room.statsRecorded || room.startedAt == null) return null;
    if (outcome === 'finished' && room.state.phase !== 'finished') return null;
    room.statsRecorded = true;
    const state = room.state;
    const endedAt = this.opts.now();
    const tokenOf = new Map<PlayerId, string>();
    for (const [token, id] of Object.entries(room.tokens)) tokenOf.set(id, token);
    const surrendered = new Set(state.log.filter((e) => e.kind === 'surrender' && e.playerId).map((e) => e.playerId as PlayerId));
    const autopiloted = new Set(room.everAutopiloted ?? []);
    const ranking = state.result?.ranking ?? [];
    return {
      roomId: room.roomId,
      players: state.players.length,
      startedAt: room.startedAt,
      endedAt,
      durationMs: endedAt - room.startedAt,
      rounds: state.round,
      turns: state.turn,
      outcome,
      reason: state.result?.reason ?? null,
      turnTimeLimitSec: room.turnTimeLimitSec ?? null,
      seats: state.players.map((p) => {
        const token = tokenOf.get(p.id);
        const rank = ranking.indexOf(p.id);
        return {
          seat: p.seat,
          kind: p.kind,
          drafted: [...p.drafted],
          playerHash: p.kind === 'human' && token ? this.opts.hashToken(token) : null,
          rank: rank === -1 ? null : rank + 1,
          score: state.result?.scores[p.id]?.total ?? null,
          surrendered: surrendered.has(p.id),
          timeouts: room.timeoutTotals?.[p.id] ?? 0,
          autopiloted: autopiloted.has(p.id),
        };
      }),
    };
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
    this.syncClock(room);
  }

  /** 현재 턴이 AI 좌석인가 */
  static isAiTurn(state: GameState): boolean {
    if ((state.phase !== 'playing' && state.phase !== 'drafting') || !state.currentPlayerId) return false;
    return state.players.find((p) => p.id === state.currentPlayerId)?.kind === 'ai';
  }

  /** 서버가 대신 두는 턴인가: AI 좌석이거나, 시간 초과로 AI 대리 중인 사람 좌석 (AI 턴 실행기가 확인) */
  isAutoTurn(room: Room): boolean {
    if (RoomManager.isAiTurn(room.state)) return true;
    const cur = room.state.currentPlayerId;
    return (room.state.phase === 'playing' || room.state.phase === 'drafting') && !!cur && (room.autopilot ?? []).includes(cur);
  }
}

export { MAX_PLAYERS };
