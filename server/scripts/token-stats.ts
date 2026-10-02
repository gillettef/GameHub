// 토큰 잔여량 점검: 균형형 봇끼리 게임을 돌려 매달 4주차(정리)에 소멸한 토큰 수와 능력치 합을 전반(1~6)·후반(7~12) 구간별로 출력한다.
// (사용법: npm run simulate:tokens -- [게임 수] [인원]. 환경변수 BAL='{"statDecay":{...}}'로 BALANCE를 덮어쓸 수 있다)
// 능력치 감쇠·마나토큰 주사위 통일 후 "토큰이 남아돌지 않는가"를 보는 용도다. 시험 달(6월)은 시험 뒤 정리 기준.
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, selectActivity } = await import("../src/game/engine.js");
const { rollAndConfirm } = await import("./_drive.js");
type BotStrategy = import("../src/game/bot.js").BotStrategy;
type ActivityId = import("../src/game/types.js").ActivityId;

const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const balanced: BotStrategy = { name: "균형형", classWeights: { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 }, activityBias: even };

const games = Number(process.argv[2]) || 100;
const n = Number(process.argv[3]) || 4;
// 라운드별 누적: [소멸 지력, 체력, 매력, 마나, 능력치 합(지력+체력+매력), 주문력, 관측 수]
const acc = Array.from({ length: BALANCE.totalRounds + 1 }, () => [0, 0, 0, 0, 0, 0, 0]);
const actPick: Record<string, number> = {};

for (let g = 0; g < games; g++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  let lastRound = state.round;
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 6000) {
    if (state.round !== lastRound) {
      // 방금 끝난 달(lastRound)의 정리 결과
      for (const s of state.cleanupSummary) {
        const p = state.players[s.playerId];
        const row = acc[lastRound];
        row[0] += s.intelligenceTokens;
        row[1] += s.staminaTokens;
        row[2] += s.charmTokens;
        row[3] += s.manaTokens;
        row[4] += p.intelligence + p.stamina + p.charm;
        row[5] += p.spellPower;
        row[6] += 1;
      }
      lastRound = state.round;
    }
    if (state.pendingRoll) rollAndConfirm(state);
    else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, balanced));
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
  const sum = [0, 0, 0, 0, 0, 0, 0];
  for (let r = from; r <= to; r++) acc[r].forEach((v, i) => (sum[i] += v));
  const c = sum[6] || 1;
  return {
    "소멸 지력": f(sum[0] / c),
    "소멸 체력": f(sum[1] / c),
    "소멸 매력": f(sum[2] / c),
    "소멸 마나": f(sum[3] / c),
    "소멸 합계": f((sum[0] + sum[1] + sum[2] + sum[3]) / c),
    "능력치 합(지·체·매)": f(sum[4] / c),
    주문력: f(sum[5] / c),
  };
}
console.log(`BAL=${process.env.BAL ?? "{}"} ${games}판 x ${n}인 (균형형만, 4주차 소멸 토큰 평균은 인당·달당)`);
console.table({ "1~6월": band(1, 6), "7~12월(정리 있는 달)": band(7, 11) });
const tot = Object.values(actPick).reduce((a, b) => a + b, 0) || 1;
console.log("자율활동 선택 비율:", Object.entries(actPick).map(([k, v]) => `${k} ${((v / tot) * 100).toFixed(0)}%`).join(", "));
