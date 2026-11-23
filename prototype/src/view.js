// 플레이어 한 명에게 보여 줄 게임 화면 데이터. 남의 손패·비밀 목표·덱 순서는 넣지 않는다.
// 혼자 하기(브라우저)와 온라인(서버)이 같은 모양을 쓴다.
export function makeView(g, seat) {
  return {
    seat,
    names: g.names,
    current: g.current,
    round: g.round,
    finalRound: g.finalRound,
    over: g.over,
    timeline: g.timeline,
    endings: g.endings,
    hand: seat >= 0 ? g.hands[seat] : [],
    handCounts: g.hands.map((h) => h.length),
    paradox: g.paradox,
    deckCount: g.deck.length,
    discardCount: g.discard.length,
    history: g.history,
    motive: seat >= 0 ? g.motives[seat] : null,
    points: g.rules.points,
    seed: g.seed,
    endTrigger: g.stats.endTrigger,
  };
}
