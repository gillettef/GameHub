// 기운 잔여량 점검: 균형형 봇끼리 게임을 돌려 매달 4주차(정리) 뒤 다음 달로 이어진 기운(이월)과 능력치 합을 전반(2~6)·후반(7~12) 구간별로 출력한다.
// (사용법: npm run simulate:tokens -- [게임 수] [인원]. 환경변수 BAL='{"energyCapMultiplier":3}'로 BALANCE를 덮어쓸 수 있다)
// 42절(수업이 충전) 이후 "기운이 너무 쌓이거나 모자라지 않는가"를 보는 용도다. 월 시작 시점의 보유량 = 지난달에 쓰고 남은 기운(+예약 효과).
import { BALANCE } from "../src/engine/config";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { chooseActivityAction, choosePick, playClassTurn } = await import("../src/engine/bot");
const { advanceResolution, chooseActivityCard, createGame, selectActivity, tokensOf, ENERGY_KINDS } = await import("../src/engine/engine");
const { cramStep, rollAndConfirm } = await import("./_drive");
type BotStrategy = import("../src/engine/bot").BotStrategy;
type ActivityId = import("../src/engine/types").ActivityId;

const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const balanced: BotStrategy = { name: "균형형", classWeights: { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 }, activityBias: even };

const games = Number(process.argv[2]) || 100;
const n = Number(process.argv[3]) || 4;
// 라운드별 누적 (인당·달당 합산): [이월 지력, 체력, 매력, 마나, 능력치 합(지력+체력+매력+주문력), 관측 수]
const acc = Array.from({ length: BALANCE.totalRounds + 1 }, () => new Array(6).fill(0));
const actPick: Record<string, number> = {};

for (let g = 0; g < games; g++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  let lastRound = state.round;
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 6000) {
    if (state.round !== lastRound) {
      // 방금 시작된 달(state.round) 시작 시점의 보유 기운 = 지난달에서 이어진 기운
      for (const id of state.turnOrder) {
        const p = state.players[id];
        const row = acc[state.round];
        ENERGY_KINDS.forEach((kind, i) => (row[i] += tokensOf(p, kind)));
        row[4] += p.intelligence + p.stamina + p.charm + p.spellPower;
        row[5] += 1;
      }
      lastRound = state.round;
    }
    if (state.pendingRoll) rollAndConfirm(state);
    else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, balanced));
    else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") playClassTurn(state, state.classPickOrder[state.classPickPointer], balanced);
    else if (state.activityStage === "resolve") advanceResolution(state);
    else {
      const id = state.activityOrder[state.activityTurnPointer];
      const a = chooseActivityAction(state, id, balanced);
      actPick[a.activityId] = (actPick[a.activityId] ?? 0) + 1;
      selectActivity(state, id, a.activityId, a.targetPlayerId);
    }
  }
}

const f = (x: number) => Number(x.toFixed(2));
function band(from: number, to: number) {
  const sum = new Array(6).fill(0);
  for (let r = from; r <= to; r++) acc[r].forEach((v, i) => (sum[i] += v));
  const c = sum[5] || 1;
  return {
    "이월 지력": f(sum[0] / c),
    "이월 체력": f(sum[1] / c),
    "이월 매력": f(sum[2] / c),
    "이월 마나": f(sum[3] / c),
    "이월 합계": f((sum[0] + sum[1] + sum[2] + sum[3]) / c),
    "능력치 합": f(sum[4] / c),
  };
}
console.log(`BAL=${process.env.BAL ?? "{}"} ${games}판 x ${n}인 (균형형만, 월 시작 시점의 인당 평균 보유 기운)`);
console.table({ "2~6월": band(2, 6), "7~12월": band(7, 12) });
const tot = Object.values(actPick).reduce((a, b) => a + b, 0) || 1;
console.log("자율활동 선택 비율:", Object.entries(actPick).map(([k, v]) => `${k} ${((v / tot) * 100).toFixed(0)}%`).join(", "));
