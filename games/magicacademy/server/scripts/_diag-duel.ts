// 임시 진단: 마법 겨루기 도전자 승률이 낮은 이유 (사용법: npx tsx scripts/_diag-duel.ts [게임 수] [인원])
// 봇 행동을 바꿔 규칙 탓인지 봇 탓인지 가린다:
//   TARGET=strong(기본 봇: 주문력이 가장 높은 친구) | weak(가장 낮은 친구) | random
//   SMART=1  도전자가 상대 결과를 보고, 질 것 같으면 남은 마나기운으로 낮은 주사위부터 다시 굴린다
//   BAL='{...}'로 BALANCE 덮어쓰기
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { BOT_PERSONALITIES, botChooseDream, chooseActivityAction, choosePick, playClassTurn, rerollLowDice, botAssist } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, selectActivity, duelTargets, submitRoll, confirmRoll, currentRoller, rerollDice } = await import("../src/game/engine.js");
const { cramStep, rollAndConfirm } = await import("./_drive.js");
type GameState = import("../src/game/types.js").GameState;
type BotStrategy = import("../src/game/bot.js").BotStrategy;

const games = Number(process.argv[2]) || 1000;
const n = Number(process.argv[3]) || 4;
const TARGET = process.env.TARGET ?? "strong";
const SMART = !!process.env.SMART;

const d = { n: 0, win: 0, draw: 0, cSp: 0, tSp: 0, cDice: 0, tDice: 0, cMana: 0, tMana: 0, cCredit: 0, tCredit: 0, stronger: 0, strongerWin: 0, weaker: 0, weakerWin: 0, perGame: 0 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// 겨루기 굴림: 지목당한 친구 → 도전자 순서. SMART면 도전자가 상대 합을 보고 다시 굴린다
function rollDuel(state: GameState): void {
  const pending = state.pendingRoll!;
  const ctx = state.hidden.roll as { kind: "duel"; challengerId: string; targetId: string };
  const c = state.players[ctx.challengerId];
  const t = state.players[ctx.targetId];
  const cEntry = pending.entries.find((e) => e.playerId === c.id)!;
  const tEntry = pending.entries.find((e) => e.playerId === t.id)!;
  d.n++;
  d.cSp += c.spellPower;
  d.tSp += t.spellPower;
  d.cMana += c.manaTokens;
  d.tMana += t.manaTokens;
  d.cCredit += c.credit;
  d.tCredit += t.credit;
  let id: string | undefined;
  while (state.pendingRoll === pending && (id = currentRoller(state))) {
    const entry = pending.entries.find((e) => e.playerId === id)!;
    if (entry.dice === null) submitRoll(state, id, undefined, botAssist(state, id));
    if (SMART && id === c.id && tEntry.dice) {
      const need = sum(tEntry.dice) - BALANCE.duelChallengerBonus + 1;
      while (c.manaTokens > 0 && sum(entry.dice!) < need) {
        const lowest = entry.dice!.indexOf(Math.min(...entry.dice!));
        if (entry.dice![lowest] >= 6) break;
        try {
          rerollDice(state, id, [lowest]);
        } catch {
          break;
        }
      }
    } else rerollLowDice(state, id);
    if (id === c.id) d.cDice += entry.dice!.length;
    else d.tDice += entry.dice!.length;
    confirmRoll(state, id);
  }
  const cTotal = sum(cEntry.dice!) + BALANCE.duelChallengerBonus;
  const tTotal = sum(tEntry.dice!);
  const won = cTotal > tTotal;
  if (won) d.win++;
  if (cTotal === tTotal) d.draw++;
  if (c.spellPower > t.spellPower) {
    d.stronger++;
    if (won) d.strongerWin++;
  } else if (c.spellPower < t.spellPower) {
    d.weaker++;
    if (won) d.weakerWin++;
  }
}

for (let g = 0; g < games; g++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const persona: Record<string, BotStrategy> = Object.fromEntries(ids.map((id) => [id, BOT_PERSONALITIES[Math.floor(Math.random() * BOT_PERSONALITIES.length)]]));
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  for (const id of ids) botChooseDream(state, id, persona[id]);
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 8000) {
    if (state.pendingRoll) {
      if (state.pendingRoll.kind === "duel") rollDuel(state);
      else rollAndConfirm(state);
    } else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, persona[state.pendingPick.playerId]));
    else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") {
      const id = state.classPickOrder[state.classPickPointer];
      playClassTurn(state, id, persona[id]);
    } else if (state.activityStage === "resolve") advanceResolution(state);
    else {
      const id = state.activityOrder[state.activityTurnPointer];
      const pick = chooseActivityAction(state, id, persona[id]);
      if (pick.activityId === "duel" && TARGET !== "strong") {
        const ts = duelTargets(state, id);
        pick.targetPlayerId = TARGET === "weak" ? [...ts].sort(() => Math.random() - 0.5).sort((a, b) => state.players[a].spellPower - state.players[b].spellPower)[0] : ts[Math.floor(Math.random() * ts.length)];
      }
      selectActivity(state, id, pick.activityId, pick.targetPlayerId);
    }
  }
}
const f = (a: number) => (a / d.n).toFixed(2);
const pc = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
console.log(`BAL=${process.env.BAL ?? "{}"} TARGET=${TARGET} SMART=${SMART} ${games}판 × ${n}인 · 겨루기 ${d.n}회 (판당 ${(d.n / games).toFixed(2)})`);
console.log(`도전자 승률 ${pc(d.win, d.n)} · 무승부 ${pc(d.draw, d.n)} · 지목당한 친구 승률 ${pc(d.n - d.win - d.draw, d.n)}`);
console.log(`평균 주문력 도전자 ${f(d.cSp)} / 지목 ${f(d.tSp)} · 굴리기 전 마나기운 도전자 ${f(d.cMana)} / 지목 ${f(d.tMana)} · 주사위 수 도전자 ${f(d.cDice)} / 지목 ${f(d.tDice)} · 학점 도전자 ${f(d.cCredit)} / 지목 ${f(d.tCredit)}`);
console.log(`주문력이 더 높은 도전자 ${pc(d.stronger, d.n)} (승률 ${pc(d.strongerWin, d.stronger)}) · 더 낮은 도전자 ${pc(d.weaker, d.n)} (승률 ${pc(d.weakerWin, d.weaker)})`);
