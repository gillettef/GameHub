// 임시: 한 성향 1명 + 균형형 3명 게임에서 그 성향의 로그를 본다 (사용법: npx tsx scripts/_trace.ts 성향이름)
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { BOT_PERSONALITIES, botChooseDream, chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, finalScore, selectActivity } = await import("../src/game/engine.js");
const { cramStep, rollAndConfirm } = await import("./_drive.js");
const who = BOT_PERSONALITIES.find((p) => p.name === process.argv[2])!;
const ids = ["p0", "p1", "p2", "p3"];
const st: any = { p0: who, p1: BOT_PERSONALITIES[0], p2: BOT_PERSONALITIES[0], p3: BOT_PERSONALITIES[0] };
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
for (const l of state.log) if (l.message.includes("p0")) console.log(l.message);
for (const id of ids) { const p = state.players[id]; console.log(id, finalScore(p), p.intelligence, p.stamina, p.charm, p.spellPower, p.dream?.name); }
