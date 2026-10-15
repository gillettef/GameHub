// 임시 진단: 성향별로 학점이 어디서 나오는지(졸업 전 학점·졸업식 상·장래희망), 활동 선택·성공률, 1위 부문을 쪼개 본다
// (사용법: npx tsx scripts/_diag-balance.ts [게임 수] [인원], BAL='{...}'로 BALANCE 덮어쓰기)
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { BOT_PERSONALITIES, botChooseDream, chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, selectActivity } = await import("../src/game/engine.js");
const { cramStep, rollAndConfirm } = await import("./_drive.js");
type BotStrategy = import("../src/game/bot.js").BotStrategy;
type StatKey = import("../src/game/types.js").StatKey;

const games = Number(process.argv[2]) || 1000;
const n = Number(process.argv[3]) || 3;
const STATS: StatKey[] = ["intelligence", "stamina", "charm", "spellPower"];
const ACTS = ["tournament", "creature", "duel", "exploration", "lab"];

interface Row {
  games: number;
  wins: number;
  credit: number;
  before: number;
  award: number;
  dream: number;
  firsts: number;
  firstBy: Record<string, number>;
  acts: Record<string, number>;
  ok: Record<string, [number, number]>;
  stats: Record<string, number>;
}
const rows: Record<string, Row> = {};
const row = (k: string) =>
  (rows[k] ??= { games: 0, wins: 0, credit: 0, before: 0, award: 0, dream: 0, firsts: 0, firstBy: {}, acts: {}, ok: {}, stats: {} });
const catFirst: Record<string, { n: number; ties: number }> = {};

for (let g = 0; g < games; g++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const persona: Record<string, BotStrategy> = Object.fromEntries(ids.map((id) => [id, BOT_PERSONALITIES[Math.floor(Math.random() * BOT_PERSONALITIES.length)]]));
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  for (const id of ids) botChooseDream(state, id, persona[id]);
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 8000) {
    const logStart = state.log.length;
    if (state.pendingRoll) {
      rollAndConfirm(state);
      for (const l of state.log.slice(logStart)) {
        const m = l.message.match(/^(p\d): (?:마법생물 .*조련 (성공|실패)|연구 카드 .*실험 (성공|실패)|별빛 다락방 .*(?:목표 \d+|합 \d+\/\d+) (성공|실패)|대회 .*(입상|탈락))/);
        if (!m) continue;
        const kind = m[2] ? "creature" : m[3] ? "lab" : m[4] ? "exploration" : "tournament";
        const good = (m[2] ?? m[3] ?? m[4]) === "성공" || m[5] === "입상";
        const r = row(persona[m[1]].name);
        const o = (r.ok[kind] ??= [0, 0]);
        o[1]++;
        if (good) o[0]++;
      }
    } else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, persona[state.pendingPick.playerId]));
    else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") {
      const id = state.classPickOrder[state.classPickPointer];
      playClassTurn(state, id, persona[id]);
    } else if (state.activityStage === "resolve") advanceResolution(state);
    else {
      const id = state.activityOrder[state.activityTurnPointer];
      const pick = chooseActivityAction(state, id, persona[id]);
      selectActivity(state, id, pick.activityId, pick.targetPlayerId);
      if (state.activityStage === "resolve") {
        for (const c of state.activityChoices) {
          const r = row(persona[c.playerId].name);
          r.acts[c.activityId] = (r.acts[c.activityId] ?? 0) + 1;
        }
        for (const d of state.duels) {
          if (state.activityChoices.some((c) => c.playerId === d.targetId)) continue;
          const r = row(persona[d.targetId].name);
          r.acts["duel(지목당함)"] = (r.acts["duel(지목당함)"] ?? 0) + 1;
        }
      }
    }
  }
  if (state.phase !== "ended") continue;
  for (const id of ids) {
    const p = state.players[id];
    const r = row(persona[id].name);
    r.games++;
    if (state.winnerIds?.includes(id)) r.wins += 1 / state.winnerIds.length;
    const award = p.awards.reduce((a, w) => a + w.points, 0);
    const dream = p.dreamFulfilled ? BALANCE.dreamCredit : 0;
    r.credit += p.credit;
    r.award += award;
    r.dream += dream;
    r.before += p.credit - award - dream;
    for (const w of p.awards)
      if (w.rank === 1) {
        r.firsts++;
        r.firstBy[w.category] = (r.firstBy[w.category] ?? 0) + 1;
      }
    for (const s of STATS) r.stats[s] = (r.stats[s] ?? 0) + p[s];
    r.stats.creatures = (r.stats.creatures ?? 0) + p.creatures.length;
  }
  for (const c of [...BALANCE.graduationCategories, ...(state.specialAwards ?? [])]) {
    const winners = ids.filter((id) => state.players[id].awards.some((w) => w.category === c && w.rank === 1));
    const o = (catFirst[c] ??= { n: 0, ties: 0 });
    o.n++;
    if (winners.length > 1) o.ties++;
  }
}

const f = (a: number, b: number) => (b ? (a / b).toFixed(2) : "-");
const pc = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");
console.log(`BAL=${process.env.BAL ?? "{}"} ${games}판 × ${n}인`);
console.table(
  Object.fromEntries(
    Object.entries(rows).map(([k, r]) => [
      k,
      { 승률: pc(r.wins, r.games), 최종: f(r.credit, r.games), 졸업전: f(r.before, r.games), 졸업식상: f(r.award, r.games), 장래희망: f(r.dream, r.games), "1위상": f(r.firsts, r.games) },
    ]),
  ),
);
console.log("성향별 활동 선택 비율 (한 달에 고른 활동)");
console.table(
  Object.fromEntries(
    Object.entries(rows).map(([k, r]) => {
      const t = Object.values(r.acts).reduce((a, b) => a + b, 0);
      return [k, Object.fromEntries([...ACTS, "duel(지목당함)"].map((a) => [a, pc(r.acts[a] ?? 0, t)]))];
    }),
  ),
);
console.log("성향별 성공률 (조련·탐험·연구·대회)");
console.table(Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, Object.fromEntries(["creature", "exploration", "lab", "tournament"].map((a) => [a, r.ok[a] ? `${pc(r.ok[a][0], r.ok[a][1])} (${f(r.ok[a][1], r.games)}회)` : "-"]))])));
console.log("성향별 끝 능력치 · 마법생물 수");
console.table(Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, Object.fromEntries([...STATS, "creatures"].map((s) => [s, f(r.stats[s] ?? 0, r.games)]))])));
console.log("성향별 1위 상 (판당)");
console.table(Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, Object.fromEntries(Object.entries(r.firstBy).map(([c, v]) => [c, f(v, r.games)]))])));
console.log("부문별 공동 1위 비율", Object.fromEntries(Object.entries(catFirst).map(([c, o]) => [c, `${pc(o.ties, o.n)} (${o.n}판)`])));
