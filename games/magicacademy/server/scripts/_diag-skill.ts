// 임시 진단: 실력이 운을 이기는가 (사용법: npx tsx scripts/_diag-skill.ts [게임 수] [인원])
// 공모전 우수작 심사평("운에 기대는 주사위 게임의 약점을 보완")을 재는 지표.
// 생각하는 봇(균형형) 1명 vs 무작위 봇 나머지, 그리고 무작위 봇 1명 vs 균형형 나머지의 승률을 잰다.
// 기대값(1/인원)보다 생각하는 봇이 얼마나 더 이기는지가 "실력 기울기"다.
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { BOT_PERSONALITIES, botChooseDream, chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, finalScore, selectActivity } = await import("../src/game/engine.js");
const { cramStep, rollAndConfirm } = await import("./_drive.js");
type GameState = import("../src/game/types.js").GameState;
type BotStrategy = import("../src/game/bot.js").BotStrategy;

const games = Number(process.argv[2]) || 1000;
const n = Number(process.argv[3]) || 4;
const smart = BOT_PERSONALITIES[0];
const even = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const random: BotStrategy = { name: "무작위", classWeights: { intelligence: 1, spellPower: 1, stamina: 1, charm: 1 }, activityBias: even, random: true };

function playGame(strategies: BotStrategy[]): GameState {
  const ids = strategies.map((_, i) => `p${i}`);
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  const byId = Object.fromEntries(ids.map((id, i) => [id, strategies[i]]));
  for (const id of ids) botChooseDream(state, id, byId[id]);
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 5000) {
    if (state.pendingRoll) rollAndConfirm(state);
    else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, byId[state.pendingPick.playerId]));
    else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") {
      const id = state.classPickOrder[state.classPickPointer];
      playClassTurn(state, id, byId[id]);
    } else if (state.phase === "activity" && state.activityStage === "resolve") advanceResolution(state);
    else if (state.phase === "activity") {
      const id = state.activityOrder[state.activityTurnPointer];
      const { activityId, targetPlayerId } = chooseActivityAction(state, id, byId[id]);
      selectActivity(state, id, activityId, targetPlayerId);
    } else throw new Error(`예상치 못한 단계: ${state.phase}`);
  }
  return state;
}

// 자리 순서 영향을 지우려고 혼자인 봇의 자리를 돌린다. 동점은 나눠 갖는다
function winShare(lone: BotStrategy, rest: BotStrategy): number {
  let share = 0;
  for (let g = 0; g < games; g++) {
    const seat = g % n;
    const lineup = Array.from({ length: n }, (_, i) => (i === seat ? lone : rest));
    const state = playGame(lineup);
    const scores = Object.values(state.players).map((p) => finalScore(p));
    const best = Math.max(...scores);
    const winners = scores.filter((s) => s === best).length;
    if (scores[seat] === best) share += 1 / winners;
  }
  return share / games;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const smartVsRandom = winShare(smart, random);
const randomVsSmart = winShare(random, smart);
console.log(`\n=== 실력 기울기: ${games}판 × ${n}인 (기대값 ${pct(1 / n)}) ===`);
console.log(`균형형 1명 vs 무작위 ${n - 1}명: 균형형 승률 ${pct(smartVsRandom)}`);
console.log(`무작위 1명 vs 균형형 ${n - 1}명: 무작위 승률 ${pct(randomVsSmart)}`);
