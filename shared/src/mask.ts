/**
 * 손패 비공개 (CLAUDE.md "DB 없는 상태 관리", F004).
 * 서버는 브로드캐스트 전에 플레이어별로 이 함수를 거친다. 본인 손패만 내용을 포함하고 타인은 장수만,
 * 덱 순서와 RNG 시드는 누구에게도 보내지 않는다. 핫시트(viewerId = null)는 전부 공개한다.
 */
import type { GameState, PlayerId, PlayerState } from './types/index.js';
import type { MaskedGameState, MaskedPlayerState } from './types/events.js';

export function maskPlayer(player: PlayerState, reveal: boolean): MaskedPlayerState {
  return {
    ...player,
    hand: reveal ? [...player.hand] : [],
    deck: [],
    handCount: player.hand.length,
    deckCount: player.deck.length,
  };
}

/** viewerId 가 null 이면 모든 손패를 공개한다 (핫시트). 덱 순서·시드는 항상 감춘다 */
export function maskState(state: GameState, viewerId: PlayerId | null): MaskedGameState {
  return {
    ...state,
    rngSeed: 0,
    players: state.players.map((p) => maskPlayer(p, viewerId === null || p.id === viewerId)),
  };
}
