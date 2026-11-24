// 선(시작 플레이어) 통계: 선이 얼마나 자주 바뀌는지, 선 횟수와 승리의 관계 (사용법: npm run simulate:starter -- [게임 수] [인원])
// 환경변수 BAL='{"starterRule":"bid"}' 로 BALANCE를 덮어쓴다.
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, selectActivity } = await import("../src/game/engine.js");
const { cramStep, rollAndConfirm } = await import("./_drive.js");
type BotStrategy = import("../src/game/bot.js").BotStrategy;
type ActivityId = import("../src/game/types.js").ActivityId;

const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const S: BotStrategy = { name: "균형형", classWeights: { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 }, activityBias: even };

const N = Number(process.argv[2]) || 300;
const n = Number(process.argv[3]) || 4;
let changes = 0, rounds = 0;
const holderCounts: number[] = []; // 선 횟수(12개월 중) 분포
const winByStarts: Record<number, { games: number; wins: number }> = {};
const distinctStarters: number[] = [];
for (let g = 0; g < N; g++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  let guard = 0, lastRound = 0, lastStarter = -1;
  const starts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  while (state.phase !== "ended" && guard++ < 6000) {
    if (state.round !== lastRound && state.pendingRoll === null && state.startingPlayerIndex >= 0) {
      lastRound = state.round;
      if (lastStarter !== -1 && state.startingPlayerIndex !== lastStarter) changes++;
      if (lastStarter !== -1) rounds++;
      lastStarter = state.startingPlayerIndex;
      starts[state.turnOrder[lastStarter]]++;
    }
    if (state.pendingRoll) rollAndConfirm(state);
    else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, S));
    else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") { const id = state.classPickOrder[state.classPickPointer]; playClassTurn(state, id, S); }
    else if (state.activityStage === "resolve") advanceResolution(state);
    else { const id = state.activityOrder[state.activityTurnPointer]; const a = chooseActivityAction(state, id, S); selectActivity(state, id, a.activityId, a.targetPlayerId); }
  }
  distinctStarters.push(Object.values(starts).filter((c) => c > 0).length);
  for (const id of ids) {
    const k = starts[id];
    const e = (winByStarts[k] ??= { games: 0, wins: 0 });
    e.games++;
    if (state.winnerIds?.includes(id)) e.wins++;
  }
  holderCounts.push(Math.max(...Object.values(starts)));
}
const avg = (x: number[]) => +(x.reduce((a, b) => a + b, 0) / x.length).toFixed(2);
console.log(`BAL=${process.env.BAL ?? "{}"} ${N}판 x ${n}인`);
console.log(`달이 바뀔 때 선이 바뀐 비율: ${((changes / rounds) * 100).toFixed(0)}%  | 한 판에서 선을 한 번이라도 한 사람 수 평균: ${avg(distinctStarters)}/${n}  | 최다 선 횟수 평균: ${avg(holderCounts)}/12`);
console.table(Object.entries(winByStarts).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => ({ "선 횟수": +k, 표본: v.games, 승률: `${((v.wins / v.games) * 100).toFixed(0)}%` })));
