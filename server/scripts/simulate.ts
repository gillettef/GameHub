// 밸런스 시뮬레이션: 봇끼리 게임을 대량으로 돌려 통계를 출력합니다. (사용법: npm run simulate -- [게임 수] [인원])
// 봇은 단순한 휴리스틱이라 사람의 플레이를 대신하진 못하지만, 다음을 빠르게 점검할 수 있습니다.
//  - 어떤 전략(토너먼트 몰빵, 마법생물 몰빵 등)이 지나치게 강하거나 약한가
//  - 최종 능력치/학점/성취도가 어느 범위에 분포하는가
//  - 자율활동 5종 중 봇이 무엇을 선호하고 그 결과는 어떤가
import { chooseActivityAction, chooseLabCard, playClassTurn, type BotStrategy } from "../src/game/bot.js";
import { BALANCE } from "../src/game/config.js";
import { chooseLabCard as submitLabChoice, classCardsLeft, createGame, selectActivity, submitRoll } from "../src/game/engine.js";
import type { ActivityId, GameState } from "../src/game/types.js";

const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const focus = (a: ActivityId): Record<ActivityId, number> => ({ ...even, [a]: 6 });

const STRATEGIES: BotStrategy[] = [
  { name: "균형형", classWeights: { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 }, activityBias: even },
  { name: "토너먼트 몰빵", classWeights: { intelligence: 1, spellPower: 1.5, stamina: 1, charm: 0.5 }, activityBias: focus("tournament") },
  { name: "마법생물 몰빵", classWeights: { intelligence: 1, spellPower: 1.2, stamina: 1, charm: 0.5 }, activityBias: focus("creature") },
  { name: "주문 대결 몰빵", classWeights: { intelligence: 1, spellPower: 1.5, stamina: 1, charm: 0.5 }, activityBias: focus("duel") },
  { name: "탐험 몰빵", classWeights: { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 }, activityBias: focus("exploration") },
  { name: "연구실 몰빵", classWeights: { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 }, activityBias: focus("lab") },
  { name: "지력 몰빵(정규수업)", classWeights: { intelligence: 3, spellPower: 0.8, stamina: 1, charm: 0.3 }, activityBias: even },
  { name: "주문력 몰빵(정규수업)", classWeights: { intelligence: 0.8, spellPower: 3, stamina: 1, charm: 0.3 }, activityBias: even },
  { name: "무작위", classWeights: { intelligence: 1, spellPower: 1, stamina: 1, charm: 1 }, activityBias: even, random: true },
];

const activityPicks: Record<string, Record<ActivityId, number>> = {};
// 가장 최근에 끝난 게임에서 일반 수업카드가 처음 바닥난 라운드 (한 번도 안 바닥났으면 0)
let lastNormalExhaustRound = 0;

function playGame(strategies: BotStrategy[]): GameState {
  const ids = strategies.map((_, i) => `p${i}`);
  const state = createGame(ids.map((id) => ({ id, name: id })));
  const byId = Object.fromEntries(ids.map((id, i) => [id, strategies[i]]));
  let guard = 0;
  lastNormalExhaustRound = 0;
  while (state.phase !== "ended" && guard++ < 5000) {
    if (state.pendingRoll) {
      // 주사위를 굴려야 하는 사람이 모두 버튼을 누른다
      for (const entry of [...state.pendingRoll.entries]) if (entry.dice === null) submitRoll(state, entry.playerId);
    } else if (state.phase === "class") {
      for (const id of state.turnOrder) {
        if (!state.players[id].hasActedThisPhase) playClassTurn(state, id, byId[id]);
      }
      if (lastNormalExhaustRound === 0 && classCardsLeft(state, "normal") === 0) lastNormalExhaustRound = state.round;
    } else if (state.phase === "activity") {
      const id = state.activityOrder[state.activityTurnPointer];
      const { activityId, targetPlayerId: target, useStamina } = chooseActivityAction(state, id, byId[id]);
      const picks = (activityPicks[byId[id].name] ??= { tournament: 0, creature: 0, duel: 0, exploration: 0, lab: 0 });
      picks[activityId] += 1;
      selectActivity(state, id, activityId, target, useStamina);
      if (state.pendingLab) submitLabChoice(state, id, chooseLabCard(state, byId[id]));
    } else {
      throw new Error(`예상치 못한 단계: ${state.phase}`);
    }
  }
  if (state.phase !== "ended") throw new Error("게임이 끝나지 않았습니다");
  return state;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fixed = (x: number) => Number(x.toFixed(2));

const games = Number(process.argv[2]) || 1000;
const playerCount = Number(process.argv[3]) || 4;
if (playerCount < 2 || playerCount > 5) throw new Error("인원은 2~5명이어야 합니다");

console.log(`\n=== 밸런스 시뮬레이션: 게임 ${games}판 × ${playerCount}인 ===`);
console.log("현재 BALANCE:", JSON.stringify(BALANCE));

// 1) 인원수별 균형형 봇 게임 통계
console.log("\n[1] 균형형 봇만 참가한 게임의 최종 상태 (인원별)");
const summary: Record<string, unknown>[] = [];
for (let n = 2; n <= 5; n++) {
  const rows = {
    intelligence: [] as number[],
    stamina: [] as number[],
    charm: [] as number[],
    spellPower: [] as number[],
    credit: [] as number[],
    achievement: [] as number[],
    top: [] as number[],
    exhausted: [] as number[],
    exhaustRound: [] as number[],
    creatures: [] as number[],
    grimoires: [] as number[],
  };
  for (let g = 0; g < Math.ceil(games / 2); g++) {
    const state = playGame(Array.from({ length: n }, () => STRATEGIES[0]));
    const players = Object.values(state.players);
    for (const p of players) {
      rows.intelligence.push(p.intelligence);
      rows.stamina.push(p.stamina);
      rows.charm.push(p.charm);
      rows.spellPower.push(p.spellPower);
      rows.credit.push(p.credit);
      rows.achievement.push(p.spellPower * p.credit);
      rows.creatures.push(p.creatures.length);
      rows.grimoires.push(p.grimoires.length);
    }
    rows.top.push(Math.max(...players.map((p) => p.spellPower * p.credit)));
    rows.exhausted.push(lastNormalExhaustRound > 0 ? 1 : 0);
    if (lastNormalExhaustRound > 0) rows.exhaustRound.push(lastNormalExhaustRound);
  }
  summary.push({
    인원: n,
    지력: fixed(mean(rows.intelligence)),
    체력: fixed(mean(rows.stamina)),
    매력: fixed(mean(rows.charm)),
    주문력: fixed(mean(rows.spellPower)),
    학점: fixed(mean(rows.credit)),
    평균성취도: fixed(mean(rows.achievement)),
    "1위 성취도": fixed(mean(rows.top)),
    마법생물: fixed(mean(rows.creatures)),
    마도서: fixed(mean(rows.grimoires)),
    "일반카드 소진율": pct(mean(rows.exhausted)),
    "소진 라운드": rows.exhaustRound.length ? fixed(mean(rows.exhaustRound)) : "-",
  });
}
console.table(summary);

// 2) 전략별 승률: 해당 전략 1명 + 균형형 나머지
console.log(`\n[2] 전략별 승률 (해당 전략 1명 + 균형형 ${playerCount - 1}명, 기대 승률 ${pct(1 / playerCount)})`);
const strategyRows: Record<string, unknown>[] = [];
for (const s of STRATEGIES) {
  let wins = 0;
  const achievements: number[] = [];
  const credits: number[] = [];
  for (let g = 0; g < games; g++) {
    const state = playGame([s, ...Array.from({ length: playerCount - 1 }, () => STRATEGIES[0])]);
    if (state.winnerIds?.includes("p0")) wins += 1;
    achievements.push(state.players.p0.spellPower * state.players.p0.credit);
    credits.push(state.players.p0.credit);
  }
  strategyRows.push({ 전략: s.name, 승률: pct(wins / games), 평균성취도: fixed(mean(achievements)), 평균학점: fixed(mean(credits)) });
}
console.table(strategyRows);

// 3) 자율활동 선택 비율
console.log("\n[3] 전략별 자율활동 선택 비율 (위 시뮬레이션 전체 누적)");
console.table(
  Object.entries(activityPicks).map(([name, picks]) => {
    const total = Object.values(picks).reduce((a, b) => a + b, 0) || 1;
    return {
      전략: name,
      토너먼트: pct(picks.tournament / total),
      마법생물: pct(picks.creature / total),
      주문대결: pct(picks.duel / total),
      탐험: pct(picks.exploration / total),
      연구실: pct(picks.lab / total),
    };
  }),
);
console.log("\n해석 팁: 특정 전략의 승률이 기대 승률보다 크게 높으면(또는 낮으면) 해당 활동/카드 보상을 조정 대상으로 봅니다.");
console.log("봇은 단순하므로 절대값보다 상대적 차이만 참고하고, 최종 판단은 실제 플레이테스트로 합니다.\n");
