/**
 * 핫시트(한 브라우저에서 번갈아 두기) 어댑터. Phase 1 전용.
 *
 * 규칙 계산은 전부 shared/src/engine 의 순수 함수에 맡기고, 이 파일은 로비 절차(입장 → 덱 선택 → 준비)를
 * 서버 대신 흉내 낸다. Phase 2 에서 Socket.io 어댑터(client/src/socket)가 같은 인터페이스
 * (`dispatch(action) → 새 상태`)로 교체되며, 그때부터 클라이언트는 엔진을 배치 가능 칸 계산에만 쓴다.
 */
import type { Action, GameState, MapId, PlayerId, RaceId } from '@astraltab/shared';
import { applyAction, createInitialState, createPlayer, getMap, joinPlayer } from '@astraltab/shared';

export interface HotseatPlayerConfig {
  nickname: string;
  race: RaceId;
}

export interface HotseatConfig {
  mapId: MapId;
  players: HotseatPlayerConfig[];
  /** 덱 셔플 시드. 생략하면 호출자가 넣어야 한다 (엔진은 난수를 만들지 않는다) */
  seed: number;
}

export const HOTSEAT_ROOM_ID = 'hotseat';

export function hotseatPlayerId(seat: number): PlayerId {
  return `p${seat}`;
}

/**
 * 맵 정원만큼 플레이어를 앉히고 덱 선택·준비까지 마쳐 게임을 시작한 상태를 만든다.
 * 마지막 READY 가 엔진의 startGame 을 일으키므로 반환 상태는 첫 턴의 시작 단계까지 끝난 것이다.
 */
export function createHotseatGame(config: HotseatConfig): GameState {
  const map = getMap(config.mapId);
  if (config.players.length !== map.players) {
    throw new Error(`${map.name} 맵은 ${map.players}명이어야 합니다 (현재 ${config.players.length}명)`);
  }
  let state = createInitialState(HOTSEAT_ROOM_ID, config.mapId, config.seed >>> 0);
  config.players.forEach((p, seat) => {
    const nickname = p.nickname.trim() || `플레이어 ${seat + 1}`;
    const joined = joinPlayer(state, createPlayer(hotseatPlayerId(seat), nickname, 'human'));
    if (joined.error) throw new Error(joined.error);
    state = joined.state;
  });
  config.players.forEach((p, seat) => {
    const id = hotseatPlayerId(seat);
    const chosen = applyAction(state, { type: 'SELECT_RACE', playerId: id, race: p.race });
    if (chosen.error) throw new Error(chosen.error);
    const readied = applyAction(chosen.state, { type: 'READY', playerId: id });
    if (readied.error) throw new Error(readied.error);
    state = readied.state;
  });
  if (state.phase !== 'playing') throw new Error('게임을 시작하지 못했습니다');
  return state;
}

/** 핫시트에서는 서버 검증 = 엔진 검증. 거부되면 error 만 채워지고 state 는 그대로다 */
export function applyHotseatAction(state: GameState, action: Action): { state: GameState; error?: string } {
  return applyAction(state, action);
}

/** 브라우저 쪽 시드 발급. 엔진 밖에서만 난수를 만든다 */
export function makeSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
