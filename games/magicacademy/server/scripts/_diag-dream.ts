// 임시 진단: 장래희망 카드별 달성률·우승률 (사용법: npx tsx scripts/_diag-dream.ts [게임 수] [인원])
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { activePersonalities, botChooseDream, chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, finalScore, selectActivity, effectiveStat } = await import("../src/game/engine.js").then(async (m) => ({ ...m, effectiveStat: (await import("../src/game/types.js") as any).effectiveStat ?? m.effectiveStat }));
const { cramStep, rollAndConfirm } = await import("./_drive.js");
const games = Number(process.argv[2]) || 1000;
const n = Number(process.argv[3]) || 4;
const stat: Record<string, { n: number; ok: number; win: number }> = {};
for (let g = 0; g < games; g++) {
  const list = activePersonalities();
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const st = Object.fromEntries(ids.map((id) => [id, list[Math.floor(Math.random() * list.length)]]));
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  for (const id of ids) botChooseDream(state, id, st[id]);
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 8000) {
    if (state.pendingRoll) rollAndConfirm(state);
    else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, st[state.pendingPick.playerId]));
    else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") { const id = state.classPickOrder[state.classPickPointer]; playClassTurn(state, id, st[id]); }
    else if (state.phase === "activity" && state.activityStage === "resolve") advanceResolution(state);
    else { const id = state.activityOrder[state.activityTurnPointer]; const a = chooseActivityAction(state, id, st[id]); selectActivity(state, id, a.activityId, a.targetPlayerId); }
  }
  const scores = ids.map((id) => finalScore(state.players[id]));
  const best = Math.max(...scores);
  ids.forEach((id, i) => {
    const p = state.players[id];
    const d = p.dream!;
    const r = (stat[d.name] ??= { n: 0, ok: 0, win: 0 });
    r.n++;
    if (d.stats.every((s) => p[s] >= BALANCE.dreamThreshold)) r.ok++;
    if (scores[i] === best) r.win++;
  });
}
console.table(Object.fromEntries(Object.entries(stat).map(([k, r]) => [k, { 고른수: r.n, 달성률: `${((100 * r.ok) / r.n).toFixed(1)}%`, 우승률: `${((100 * r.win) / r.n).toFixed(1)}%` }])));
