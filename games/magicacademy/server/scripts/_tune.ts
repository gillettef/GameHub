// 임시 튜닝 하네스: 균형형 1명 + 활동 몰빵 1명씩 vs 균형형 봇, 4인. 환경변수 BAL='{"tournamentRewards":[4,2]}' 로 BALANCE를 덮어쓴다.
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, finalScore, selectActivity } = await import("../src/game/engine.js");
const { cramStep, rollAndConfirm } = await import("./_drive.js");
type BotStrategy = import("../src/game/bot.js").BotStrategy;
type ActivityId = import("../src/game/types.js").ActivityId;
type GameState = import("../src/game/types.js").GameState;

const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const W = { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 };
const focus = (a: ActivityId): Record<ActivityId, number> => ({ ...even, [a]: 6 });
const STRATS: BotStrategy[] = [
  { name: "균형형", classWeights: W, activityBias: even },
  { name: "마법 경연", classWeights: { ...W, spellPower: 1.5 }, activityBias: focus("tournament") },
  { name: "마법생물", classWeights: W, activityBias: focus("creature") },
  { name: "주문대결", classWeights: { ...W, spellPower: 1.5 }, activityBias: focus("duel") },
  { name: "탐험", classWeights: W, activityBias: focus("exploration") },
  { name: "연구실", classWeights: W, activityBias: focus("lab") },
  { name: "지력몰빵", classWeights: { intelligence: 3, spellPower: 0.8, stamina: 1, charm: 0.3 }, activityBias: even },
  { name: "체력몰빵", classWeights: { intelligence: 0.8, spellPower: 0.8, stamina: 3, charm: 0.3 }, activityBias: even },
  { name: "주문력몰빵", classWeights: { intelligence: 0.8, spellPower: 3, stamina: 1, charm: 0.3 }, activityBias: even },
  { name: "주문력+주문활동", classWeights: { intelligence: 0.8, spellPower: 3, stamina: 1, charm: 0.3 }, activityBias: { tournament: 2, creature: 1.5, duel: 1.2, exploration: 0.8, lab: 0.5 } },
  {
    name: "단계성장",
    classWeights: { intelligence: 2, spellPower: 0.6, stamina: 2, charm: 0.5 },
    lateClassWeights: { intelligence: 0.8, spellPower: 3, stamina: 0.8, charm: 0.3 },
    lateFromRound: 7,
    activityBias: { tournament: 0.6, creature: 0.6, duel: 0.6, exploration: 2, lab: 2 },
    lateActivityBias: { tournament: 2, creature: 1.5, duel: 1.2, exploration: 0.8, lab: 0.5 },
  },
];

function play(strats: BotStrategy[]): GameState {
  const ids = strats.map((_, i) => `p${i}`);
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  const by = Object.fromEntries(ids.map((id, i) => [id, strats[i]]));
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 6000) {
    if (state.pendingRoll) rollAndConfirm(state);
    else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, by[state.pendingPick.playerId]));
    else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") { const id = state.classPickOrder[state.classPickPointer]; playClassTurn(state, id, by[id]); }
    else if (state.activityStage === "resolve") advanceResolution(state);
    else { const id = state.activityOrder[state.activityTurnPointer]; const a = chooseActivityAction(state, id, by[id]); selectActivity(state, id, a.activityId, a.targetPlayerId); }
  }
  return state;
}

const N = Number(process.argv[2]) || 150;
const n = Number(process.argv[3]) || 4;
const rows: Record<string, unknown>[] = [];
const only = process.env.ONLY?.split(",");
for (const s of STRATS) {
  if (only && !only.includes(s.name)) continue;
  let wins = 0; const ach: number[] = [], cr: number[] = [], sp: number[] = [];
  for (let g = 0; g < N; g++) {
    const st = play([s, ...Array.from({ length: n - 1 }, () => STRATS[0])]);
    const p = st.players.p0;
    if (st.winnerIds?.includes("p0")) wins++;
    ach.push(finalScore(p)); cr.push(p.credit); sp.push(p.spellPower);
  }
  const m = (x: number[]) => +(x.reduce((a, b) => a + b, 0) / x.length).toFixed(1);
  rows.push({ 전략: s.name, 승률: `${((wins / N) * 100).toFixed(0)}%`, 성취도: m(ach), 학점: m(cr), 주문력: m(sp) });
}
console.log(`BAL=${process.env.BAL ?? "{}"} ${N}판 x ${n}인 (기대 ${(100 / n).toFixed(0)}%)`);
console.table(rows);
