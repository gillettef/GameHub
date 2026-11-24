/**
 * 방 하나의 규칙(순수 로직). server/hub.ts 는 방 보관·소켓만 맡고 판단은 여기서 한다.
 * 소켓·ws 에 의존하지 않으므로 Vitest에서 그대로 테스트한다.
 */
import { applyAction, initialState, isLegal } from '../src/core/rules';
import type { GameState, Player } from '../src/core/types';
import type { ClientMsg, ErrorCode, ServerMsg } from '../src/net/protocol';

export interface RoomData {
  /** null이면 아직 만들어지지 않은 방 */
  state: GameState | null;
  /** 자리별 클라이언트 식별자. [🔵 선공, 🔴 후공] — 방장 자리는 방을 만들 때 무작위로 정한다 */
  seats: [string | null, string | null];
}

export const emptyRoom = (): RoomData => ({ state: null, seats: [null, null] });

export type JoinResult = { ok: true; data: RoomData; seat: Player } | { ok: false; error: ErrorCode };

const MAX_ID_LENGTH = 64;

/**
 * 접속 요청 처리. 같은 식별자로 다시 오면 원래 자리를 돌려준다(새로고침·재접속).
 * hostSeat = 방을 새로 만들 때 방장이 앉을 자리(호출하는 쪽이 무작위로 정한다). 참가자는 남은 자리.
 */
export function joinRoom(data: RoomData, clientId: string, create: boolean, hostSeat: Player = 0): JoinResult {
  if (!clientId || clientId.length > MAX_ID_LENGTH) return { ok: false, error: 'badRequest' };
  const mine = data.seats.indexOf(clientId);
  if (data.state && mine >= 0) return { ok: true, data, seat: mine as Player };
  if (create) {
    if (data.state) return { ok: false, error: 'taken' };
    const seats: RoomData['seats'] = hostSeat === 0 ? [clientId, null] : [null, clientId];
    return { ok: true, data: { state: initialState(), seats }, seat: hostSeat };
  }
  if (!data.state) return { ok: false, error: 'notFound' };
  const free = data.seats.indexOf(null);
  if (free < 0) return { ok: false, error: 'full' };
  const seats: RoomData['seats'] = free === 0 ? [clientId, data.seats[1]] : [data.seats[0], clientId];
  return { ok: true, data: { state: data.state, seats }, seat: free as Player };
}

export interface Outgoing {
  /** 'self' = 보낸 사람, 'others' = 그 외 접속자, 'all' = 모두 */
  to: 'self' | 'others' | 'all';
  msg: ServerMsg;
}

export interface HandleResult {
  data: RoomData;
  out: Outgoing[];
  /** 저장이 필요한가 */
  changed: boolean;
}

/** 접속한 자리에서 온 메시지 처리 */
export function handleMessage(data: RoomData, seat: Player, msg: ClientMsg): HandleResult {
  const s = data.state;
  if (!s) return { data, out: [], changed: false };
  const resync = (): HandleResult => ({ data, out: [{ to: 'self', msg: { t: 'state', state: s } }], changed: false });

  switch (msg.t) {
    case 'sync':
      return resync();
    case 'action': {
      // 오래된 기준, 남의 차례, 규칙 위반 → 보낸 쪽을 서버 상태로 되돌린다
      if (msg.from !== s.version || s.current !== seat || s.phase === 'over' || !isLegal(s, msg.action)) return resync();
      const next = applyAction(s, msg.action);
      return {
        data: { ...data, state: next },
        out: [{ to: 'others', msg: { t: 'action', action: msg.action, from: msg.from } }],
        changed: true,
      };
    }
    case 'again': {
      if (s.phase !== 'over') return resync();
      const fresh = initialState();
      return { data: { ...data, state: fresh }, out: [{ to: 'all', msg: { t: 'state', state: fresh } }], changed: true };
    }
  }
}
