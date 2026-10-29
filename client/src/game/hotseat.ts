/**
 * 핫시트(한 브라우저에서 번갈아 두기) 어댑터. 규칙 계산은 전부 shared 엔진에 맡기고,
 * 이 파일은 로비 절차(입장 → 준비)를 서버 대신 흉내 낸다. 반환 상태는 이번 판 식물 공개 단계다(Rules.md 4절 8).
 * 한 기기에서는 "확인" 한 번으로 모두를 확인 처리한다(confirmAllHotseat).
 */
import type { GameState, PlayerId } from '@rootbound/shared';
import { MAX_PLAYERS, MIN_PLAYERS, applyAction, createInitialState, createPlayer, joinPlayer } from '@rootbound/shared';

export interface HotseatConfig {
  /** 자리 순서대로 닉네임 (MIN_PLAYERS~MAX_PLAYERS명) */
  nicknames: string[];
  /** 보드·목표·카드 더미 시드 (엔진은 난수를 만들지 않는다) */
  seed: number;
}

const HOTSEAT_ROOM_ID = 'hotseat';

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
  if (state.phase !== 'reveal' && state.phase !== 'playing') throw new Error('게임을 시작하지 못했습니다');
  return state;
}

/** 공개 단계에서 아직 확인하지 않은(기권 안 한) 사람을 자리 순서로 모두 확인한다. 공개 단계가 아니면 그대로 */
export function confirmAllHotseat(state: GameState): { state: GameState; error?: string } {
  let s = state;
  for (const p of [...state.players].sort((a, b) => a.seat - b.seat)) {
    if (s.phase !== 'reveal') break;
    if (p.isReady || p.surrenderedOrder !== null) continue;
    const r = applyAction(s, { type: 'CONFIRM', playerId: p.id });
    if (r.error) return { state, error: r.error };
    s = r.state;
  }
  return { state: s };
}

/** 브라우저 쪽 시드 발급. 엔진 밖에서만 난수를 만든다 */
export function makeSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
