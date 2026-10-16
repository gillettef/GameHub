// 전략 AI 리그 (61절): 서로 다른 전략 AI를 무작위로 섞어 대량으로 붙여, AI별 승률과 오차를 본다.
// (사용법: npm run league -- [게임 수] [인원] [style|smart|all])
//  - style: 구역 성향 AI 5종(균형·조련·결투·탐험·연구) — "어느 길로 가도 이길 수 있나" = 균형
//  - smart: 판단 방식이 다른 AI 4종 + 균형형 — "더 잘 생각하면 더 이기나" = 전략 깊이
//  - all: 모두 섞기
// 동점 우승은 나눠 갖는다. BAL='{...}'로 BALANCE를 덮어쓴다.
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
// SEED를 주면 판마다 같은 난수를 쓴다 (설정끼리 비교할 때 운의 차이를 지운다)
let seedState = 0;
const SEED = process.env.SEED ? Number(process.env.SEED) : null;
if (SEED !== null) {
  Math.random = () => {
    seedState |= 0;
    seedState = (seedState + 0x6d2b79f5) | 0;
    let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const { activePersonalities, botChooseDream, chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, finalScore, selectActivity } = await import("../src/game/engine.js");
const { cramStep, rollAndConfirm } = await import("./_drive.js");
type BotStrategy = import("../src/game/bot.js").BotStrategy;

const games = Number(process.argv[2]) || 2000;
const n = Number(process.argv[3]) || 4;
const group = process.argv[4] ?? "style";
const SMART = ["상 노리기형", "꿈 우선형", "기대값형", "추격형"];
const all = activePersonalities();
const roster = all.filter((s) => (group === "all" ? true : group === "smart" ? SMART.includes(s.name) || s.name === "균형형" : !SMART.includes(s.name)));

const stat = new Map<string, { n: number; w: number }>();
for (let g = 0; g < games; g++) {
  if (SEED !== null) seedState = SEED * 1000003 + g * 7919;
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const st: Record<string, BotStrategy> = Object.fromEntries(ids.map((id) => [id, roster[Math.floor(Math.random() * roster.length)]]));
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  for (const id of ids) botChooseDream(state, id, st[id]);
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 8000) {
    if (state.pendingRoll) rollAndConfirm(state);
    else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, st[state.pendingPick.playerId]));
    else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") {
      const id = state.classPickOrder[state.classPickPointer];
      playClassTurn(state, id, st[id]);
    } else if (state.phase === "activity" && state.activityStage === "resolve") advanceResolution(state);
    else {
      const id = state.activityOrder[state.activityTurnPointer];
      const a = chooseActivityAction(state, id, st[id]);
      selectActivity(state, id, a.activityId, a.targetPlayerId);
    }
  }
  const scores = ids.map((id) => finalScore(state.players[id]));
  const best = Math.max(...scores);
  const winners = scores.filter((x) => x === best).length;
  ids.forEach((id, i) => {
    const r = stat.get(st[id].name) ?? { n: 0, w: 0 };
    r.n++;
    if (scores[i] === best) r.w += 1 / winners;
    stat.set(st[id].name, r);
  });
}
const exp = 1 / n;
const rows = [...stat.entries()].map(([name, r]) => {
  const p = r.w / r.n;
  return { AI: name, 판수: r.n, 승률: `${(100 * p).toFixed(1)}%`, 오차: `±${(100 * 1.96 * Math.sqrt((p * (1 - p)) / r.n)).toFixed(1)}`, 기대대비: `${(100 * (p - exp)) >= 0 ? "+" : ""}${(100 * (p - exp)).toFixed(1)}%p` };
});
rows.sort((a, b) => parseFloat(b.승률) - parseFloat(a.승률));
console.log(`\n=== 전략 AI 리그: ${group} · ${n}인 · ${games}판 (기대 ${(100 * exp).toFixed(1)}%) ===`);
console.table(rows);
const ps = [...stat.values()].map((r) => r.w / r.n);
if (process.env.JSON) console.log("JSON" + JSON.stringify({ n, maxDev: Math.max(...ps.map((p) => Math.abs(p - exp))), rates: Object.fromEntries([...stat.entries()].map(([k, r]) => [k, r.w / r.n])) }));
console.log(`범위 ${(100 * Math.min(...ps)).toFixed(1)}~${(100 * Math.max(...ps)).toFixed(1)}% · 기대값과 가장 먼 차이 ${(100 * Math.max(...ps.map((p) => Math.abs(p - exp)))).toFixed(1)}%p`);
