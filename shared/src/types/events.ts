/**
 * Socket.io 이벤트 이름과 페이로드 타입의 단일 정의 (F001~F005, F030).
 * 서버·클라이언트 모두 이 파일만 참조한다. 문자열 리터럴 하드코딩 금지.
 *
 * 흐름:
 *  - 클라이언트는 요청 이벤트에 ack 콜백을 붙여 성공/실패를 받는다.
 *  - 방 상태가 바뀌면 서버가 방의 모든 소켓에 `room:state` 를 **플레이어별로 가려서** 보낸다
 *    (본인 손패만 내용 포함, 타인은 장수만. 덱 순서는 누구에게도 안 보냄. MaskedGameState 참고).
 */
import type { Action, GameState, MapId, PlayerId, PlayerState, RoomId } from './index.js';

// ---------------------------------------------------------------------------
// 방 메타 (GameState 밖에서 서버가 관리)
// ---------------------------------------------------------------------------

export interface RoomInfo {
  roomId: RoomId;
  /** 방장. 맵 변경·AI 추가 권한 */
  hostId: PlayerId;
  hasPassword: boolean;
  createdAt: number;
  /** 접속 중인 플레이어 id (재접속·이탈 표시용) */
  connected: PlayerId[];
}

/** 손패·덱을 가린 플레이어 상태. 타인은 hand·deck 이 빈 배열이고 장수만 남는다 */
export interface MaskedPlayerState extends PlayerState {
  handCount: number;
  deckCount: number;
}

/** 클라이언트가 받는 게임 상태. 엔진 함수에 그대로 넣을 수 있다(GameState 와 구조 호환) */
export interface MaskedGameState extends Omit<GameState, 'players'> {
  players: MaskedPlayerState[];
}

export interface RoomSnapshot {
  room: RoomInfo;
  state: MaskedGameState;
  /** 이 스냅샷을 받는 플레이어 */
  you: PlayerId;
}

// ---------------------------------------------------------------------------
// ack 응답
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Ack<T extends object = {}> = ({ ok: true } & T) | { ok: false; message: string };

export interface JoinPayload {
  roomId: RoomId;
  /** 브라우저 localStorage 에 보관하는 재접속용 토큰 */
  playerToken: string;
  nickname: string;
  password?: string;
}

// ---------------------------------------------------------------------------
// 클라이언트 → 서버
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  /** 방 생성 후 방장으로 입장 (F001, F003) */
  'room:create': (
    payload: { playerToken: string; nickname: string; password?: string; mapId?: MapId },
    ack: (res: Ack<{ roomId: RoomId; playerId: PlayerId }>) => void,
  ) => void;
  /** 초대 링크로 입장 또는 재접속 (F002, F007) */
  'room:join': (payload: JoinPayload, ack: (res: Ack<{ playerId: PlayerId }>) => void) => void;
  /** 로비에서 나가기 (게임 중엔 기권을 써야 한다) */
  'room:leave': (payload: { roomId: RoomId }, ack: (res: Ack) => void) => void;
  /** 방장이 맵 변경 (F030) */
  'room:setMap': (payload: { roomId: RoomId; mapId: MapId }, ack: (res: Ack) => void) => void;
  /** 방장이 빈 좌석에 AI 추가 / 제거 (F026) */
  'room:addAi': (payload: { roomId: RoomId }, ack: (res: Ack<{ playerId: PlayerId }>) => void) => void;
  'room:removeAi': (payload: { roomId: RoomId; playerId: PlayerId }, ack: (res: Ack) => void) => void;
  /** 덱 선택·준비·배치·패스·기권. 서버가 룰 엔진으로 검증한다 */
  'game:action': (payload: { roomId: RoomId; action: Action }, ack: (res: Ack) => void) => void;
}

// ---------------------------------------------------------------------------
// 서버 → 클라이언트
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  /** 방·게임 상태 전체 (받는 사람 기준으로 가림). 상태가 바뀔 때마다 */
  'room:state': (snapshot: RoomSnapshot) => void;
  /** 방이 사라졌거나 쫓겨났을 때 */
  'room:closed': (payload: { roomId: RoomId; message: string }) => void;
  'game:error': (payload: { message: string }) => void;
}

/** REST: GET /api/rooms/:roomId — 입장 전 확인 (비밀번호 필요 여부 등, F003) */
export interface RoomPeek {
  roomId: RoomId;
  hasPassword: boolean;
  phase: GameState['phase'];
  mapId: MapId;
  players: number;
  capacity: number;
}
