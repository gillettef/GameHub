/**
 * 핫시트(한 브라우저에서 번갈아 두기) 어댑터. 규칙 계산은 전부 shared 엔진에 맡기고,
 * 이 파일은 로비 절차(입장 → 준비)를 서버 대신 흉내 낸다. 반환 상태는 첫 차례가 시작된 상태다(첫 라운드 마켓이 펼쳐져 있다).
 */
import type { Action, GameState, PlayerId } from '@rootbound/shared';
import { MAX_PLAYERS, MIN_PLAYERS, applyAction, createInitialState, createPlayer, joinPlayer } from '@rootbound/shared';

export interface HotseatConfig {
  /** 좌석 순서대로 닉네임 (2~4명) */
  nicknames: string[];
  /** 보드·목표·카드 더미 시드 (엔진은 난수를 만들지 않는다) */
  seed: number;
}

export const HOTSEAT_ROOM_ID = 'hotseat';

export function hotseatPlayerId(seat: number): PlayerId {
  return `p${seat}`;
}

export function createHotseatGame(config: HotseatConfig): GameState {
  const n = config.nicknames.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 합니다`);
  let state = createInitialState(HOTSEAT_ROOM_ID, config.seed >>> 0);
  config.nicknames.forEach((nick, seat) => {
    const joined = joinPlayer(state, createPlayer(hotseatPlayerId(seat), nick.trim() || `플레이어 ${seat + 1}`, 'human'));
    if (joined.error) throw new Error(joined.error);
    state = joined.state;
  });
  for (let seat = 0; seat < n; seat++) {
    const r = applyAction(state, { type: 'READY', playerId: hotseatPlayerId(seat) });
    if (r.error) throw new Error(r.error);
    state = r.state;
  }
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
