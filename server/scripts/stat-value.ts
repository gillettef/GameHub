// 능력치 1점의 가치 실험: 한 명(p0)에게만 시작 능력치를 +2 주고 나머지는 모두 균형형 봇으로 돌려, 능력치별로 성취도·승률이 얼마나 달라지는지 비교합니다.
// 몰빵 전략 승률과 달리 봇 성향에 덜 좌우되어 "각 능력치의 역할이 균형 잡혔는가"를 보는 데 쓴다. (사용법: npm run simulate:stat -- [게임 수] [인원])
import { chooseActivityAction, choosePick, playClassTurn, type BotStrategy } from "../src/game/bot.js";
import { advanceResolution, chooseActivityCard, createGame, finalScore, selectActivity } from "../src/game/engine.js";
import { rollAndConfirm } from "./_drive.js";
import type { ActivityId, GameState, StatKey } from "../src/game/types.js";
const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const S: BotStrategy = { name: "균형형", classWeights: { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 }, activityBias: even };
function play(n: number, bump?: StatKey, amount = 2): GameState {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const state = createGame(ids.map((id) => ({ id, name: id })));
  if (bump) {
    const p = state.players.p0;
    p[bump] += amount;
    p.intelligenceTokens = p.intelligence; p.staminaTokens = p.stamina; p.charmTokens = p.charm; p.spellbookTokens = p.spellPower;
  }
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 5000) {
    if (state.pendingRoll) rollAndConfirm(state);
    else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, S));
      else if (state.phase === "class") playClassTurn(state, state.classPickOrder[state.classPickPointer], S);
    else if (state.phase === "activity") {
      if (state.activityStage === "resolve") advanceResolution(state);
      else {
        const id = state.activityOrder[state.activityTurnPointer];
        const a = chooseActivityAction(state, id, S);
        selectActivity(state, id, a.activityId, a.targetPlayerId);
      }
    } else throw new Error("phase " + state.phase);
  }
  return state;
}
const N = Number(process.argv[2]) || 400, n = Number(process.argv[3]) || 4;
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const rows: Record<string, unknown>[] = [];
for (const bump of [undefined, "intelligence", "stamina", "charm", "spellPower"] as (StatKey | undefined)[]) {
  let wins = 0; const ach: number[] = [], oth: number[] = [], cr: number[] = [], sp: number[] = [];
  for (let g = 0; g < N; g++) {
    const st = play(n, bump);
    const p0 = st.players.p0;
    if (st.winnerIds?.includes("p0")) wins++;
    ach.push(finalScore(p0)); cr.push(p0.credit); sp.push(p0.spellPower);
    for (const id of st.turnOrder) if (id !== "p0") oth.push(finalScore(st.players[id]));
  }
  rows.push({ 시작보너스: bump ? `${bump} +2` : "없음(기준)", 승률: `${((wins / N) * 100).toFixed(1)}%`, "내 성취도": +mean(ach).toFixed(1), "상대 평균": +mean(oth).toFixed(1), 차이: +(mean(ach) - mean(oth)).toFixed(1), 학점: +mean(cr).toFixed(2), 주문력: +mean(sp).toFixed(2) });
}
console.log(`\n시작 능력치 +2 실험: ${N}판 × ${n}인 (나머지는 모두 균형형 봇, 기대 승률 ${(100 / n).toFixed(0)}%)`);
console.table(rows);
