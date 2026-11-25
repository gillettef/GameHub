// 플레이어 한 명에게 보여 줄 게임 정보(옛 prototype/src/view.js 와 같은 모양). 남의 손패·비밀 목표·덱 순서는 넣지 않는다.
// 주의: 옛 화면은 seed 도 보냈지만 시드를 알면 덱 순서와 모든 비밀 목표를 다시 만들 수 있다. 화면으로 보내는 것은 def.ts 의 view 가 seed 를 뺀 것이다.
import type { Game } from './types.ts'

export function makeView(g: Game, seat: number) {
  return {
    seat,
    names: g.names,
    current: g.current,
    round: g.round,
    finalRound: g.finalRound,
    over: g.over,
    timeline: g.timeline,
    endings: g.endings,
    hand: seat >= 0 ? g.hands[seat]! : [],
    handCounts: g.hands.map((h) => h.length),
    paradox: g.paradox,
    deckCount: g.deck.length,
    discardCount: g.discard.length,
    history: g.history,
    motive: seat >= 0 ? g.motives[seat]! : null,
    points: g.rules.points,
    seed: g.seed,
    endTrigger: g.stats.endTrigger,
  }
}

export type EngineView = ReturnType<typeof makeView>
