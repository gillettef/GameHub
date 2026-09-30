// 카드 사용량 점검: 균형형 봇끼리 인원별(2~5인)로 돌려 덱이 얼마나 빨리 바닥나는지, 카드를 얼마나 쓰는지 확인합니다.
// 수업카드·마법생물·마도서처럼 획득하면 사라지는 덱은 소진 라운드를, 탐험·연구실처럼 버림 더미를 다시 섞는 덱은 재섞기 횟수를 봅니다. (사용법: npm run simulate:cards -- [게임 수])
import { chooseActivityAction, choosePick, playClassTurn, type BotStrategy } from "../src/game/bot.js";
import { chooseActivityCard, classCardsLeft, createGame, selectActivity, submitRoll } from "../src/game/engine.js";
import type { ActivityId, GameState } from "../src/game/types.js";
const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const S: BotStrategy = { name: "균형형", classWeights: { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 }, activityBias: even };
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const N = Number(process.argv[2]) || 60;
const rows: Record<string, unknown>[] = [];
for (const n of [2, 3, 4, 5]) {
  const m = { classTaken: [] as number[], classOut: [] as number[], creatures: [] as number[], creatureOut: [] as number[], grimoire: [] as number[], grimOut: [] as number[], expl: [] as number[], lab: [] as number[], cls: [] as number[] };
  for (let g = 0; g < N; g++) {
    const state: GameState = createGame(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `p${i}` })));
    let classOut = 0, creatureOut = 0, grimOut = 0, explRe = 0, labRe = 0, clsRe = 0;
    let pe = state.explorationPile.draw.length, pl = state.labPile.draw.length, pc = state.classDeck.length;
    let guard = 0;
    while (state.phase !== "ended" && guard++ < 6000) {
      if (state.pendingRoll) { for (const e of [...state.pendingRoll.entries]) if (e.dice === null) submitRoll(state, e.playerId); }
      else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, S));
      else if (state.phase === "class") playClassTurn(state, state.classPickOrder[state.classPickPointer], S);
      else if (state.phase === "activity") {
        const id = state.activityOrder[state.activityTurnPointer];
        const a = chooseActivityAction(state, id, S);
        selectActivity(state, id, a.activityId, a.targetPlayerId, a.useStamina);
      } else throw new Error(state.phase);
      if (state.explorationPile.draw.length > pe) explRe++;
      if (state.labPile.draw.length > pl) labRe++;
      if (state.classDeck.length > pc) clsRe++;
      pe = state.explorationPile.draw.length; pl = state.labPile.draw.length; pc = state.classDeck.length;
      if (!classOut && classCardsLeft(state) === 0) classOut = state.round;
      if (!creatureOut && state.creatureDeck.length + state.creatureDiscard.length === 0) creatureOut = state.round;
      if (!grimOut && state.grimoirePile.draw.length + state.grimoirePile.discard.length === 0) grimOut = state.round;
    }
    const ps = Object.values(state.players);
    m.classTaken.push(ps.reduce((a, p) => a + p.classCards.length, 0));
    m.creatures.push(ps.reduce((a, p) => a + p.creatures.length, 0));
    m.grimoire.push(ps.reduce((a, p) => a + p.grimoires.length, 0));
    if (classOut) m.classOut.push(classOut);
    if (creatureOut) m.creatureOut.push(creatureOut);
    if (grimOut) m.grimOut.push(grimOut);
    m.expl.push(explRe); m.lab.push(labRe); m.cls.push(clsRe);
  }
  const f = (x: number) => +x.toFixed(1);
  rows.push({
    인원: n,
    "수업카드 획득/48": f(mean(m.classTaken)), "수업 소진 게임": `${m.classOut.length}/${N}`, "소진 라운드": f(mean(m.classOut)),
    "마법생물 획득/30": f(mean(m.creatures)), "생물 소진 게임": `${m.creatureOut.length}/${N}`, "생물 소진 라운드": f(mean(m.creatureOut)),
    "마도서 획득/17": f(mean(m.grimoire)), "마도서 소진 게임": `${m.grimOut.length}/${N}`, "마도서 소진 라운드": f(mean(m.grimOut)),
    "탐험(25) 재섞기": f(mean(m.expl)), "연구실 재섞기": f(mean(m.lab)), "수업덱 재섞기": f(mean(m.cls)),
  });
}
console.table(rows);
