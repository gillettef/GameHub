/**
 * 손패 비공개 (CLAUDE.md "DB 없는 상태 관리", F004).
 * 서버는 브로드캐스트 전에 플레이어별로 이 함수를 거친다. 본인 손패만 내용을 포함하고 타인은 장수만,
 * 덱 순서와 RNG 시드(보드·덱 둘 다)는 누구에게도 보내지 않는다. 핫시트(viewerId = null)는 가리지 않는다.
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

/**
 * 온라인: 받는 사람 기준으로 가린다(덱 순서·시드는 항상 감춘다).
 * viewerId 가 null 이면 핫시트(한 기기, 서버 없음)용으로 **아무것도 가리지 않는다** — 클라이언트가 이 상태를
 * 그대로 엔진에 다시 넣기 때문에 덱·시드를 지우면 드래프트 후 덱이 사라지고 셔플이 매번 같아진다.
 * 서버는 절대 null 을 넘기지 않는다.
 */
export function maskState(state: GameState, viewerId: PlayerId | null): MaskedGameState {
  if (viewerId === null) {
    return { ...state, players: state.players.map((p) => ({ ...p, handCount: p.hand.length, deckCount: p.deck.length })) };
  }
  return {
    ...state,
    rngSeed: 0,
    deckSeed: 0,
    players: state.players.map((p) => maskPlayer(p, p.id === viewerId)),
  };
}
