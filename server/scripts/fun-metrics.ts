// 컨셉·밸런스·재미 지표 (45절): 여러 성향의 봇끼리 게임을 대량으로 돌려, 승률만으로는 안 보이는 "게임의 결"을 숫자로 본다.
// (사용법: npm run simulate:fun -- [게임 수] [인원]. 환경변수 BAL='{"labTarget":3}'로 BALANCE를 덮어써 비교할 수 있다)
//  - 컨셉: 1학기 지력·체력 → 2학기 주문력·학점 흐름이 나오는가, 굴림 상한(실력만큼만 힘을 낸다)이 실제로 작동하는가, 4단계 수업카드가 고루 쓰이는가
//  - 밸런스: 활동별 성공률, 선(좌석) 유불리, 성향별 승률
//  - 재미: 공짜 주사위(재료 기운 없음) 비율, 선두 교체 횟수·역전률, 1·2등 점수 차, 부문상이 한 사람에게 몰리는가, 친구와 엮이는 활동 비율
// 봇은 단순한 휴리스틱이라 절대값보다 설정을 바꿨을 때의 상대적 변화를 본다.
import { BALANCE } from "../src/game/config.js";
if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const { BOT_PERSONALITIES, chooseActivityAction, choosePick, playClassTurn } = await import("../src/game/bot.js");
const { advanceResolution, chooseActivityCard, createGame, selectActivity, tokensOf, finalScore, projectedScore } = await import("../src/game/engine.js");
const { cramStep, rollAndConfirm } = await import("./_drive.js");
type GameState = import("../src/game/types.js").GameState;
type PlayerGameState = import("../src/game/types.js").PlayerGameState;
type StatKey = import("../src/game/types.js").StatKey;
type BotStrategy = import("../src/game/bot.js").BotStrategy;

const games = Number(process.argv[2]) || 300;
const n = Number(process.argv[3]) || 4;
const STATS: StatKey[] = ["intelligence", "stamina", "charm", "spellPower"];
const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(1)}%` : "-");
const avg = (a: number, b: number) => (b > 0 ? +(a / b).toFixed(2) : 0);

// 게임 중 예상 점수 (화면의 예상 점수와 같은 규칙: 지금 상태로 졸업식 시상을 한다고 본다)
function projected(state: GameState, p: PlayerGameState): number {
  return projectedScore(state.turnOrder.map((id) => state.players[id]), p);
}

const m = {
  rolls: {} as Record<string, { total: number; capped: number; free: number; dice: number; noChoice: number }>,
  early: {} as Record<string, { n: number; w: number }>,
  outcome: {} as Record<string, { ok: number; total: number }>,
  classTier: { intro: 0, basic: 0, mid: 0, advanced: 0, skip: 0 } as Record<string, number>,
  classStat: [0, 0].map(() => ({ intelligence: 0, stamina: 0, charm: 0, spellPower: 0 })) as Record<StatKey, number>[],
  statAt: { 6: { intelligence: 0, stamina: 0, charm: 0, spellPower: 0 }, 12: { intelligence: 0, stamina: 0, charm: 0, spellPower: 0 } } as Record<number, Record<StatKey, number>>,
  leadChanges: 0,
  comeback: 0, // 9개월이 끝났을 때 예상 점수 1등이 결국 우승하지 못한 판
  margin: 0,
  marginRatio: 0,
  coWin: 0,
  lastGap: 0,
  sweep: 0, // 부문상 3개 이상을 한 사람이 가져간 판
  awardHolders: 0,
  shared: 0,
  activities: 0,
  duels: 0,
  cram: 0,
  cramChances: 0,
  seatWins: new Array(n).fill(0) as number[],
  starterWins: 0,
  creditFinal: 0,
  scoreFinal: 0,
  winnerScore: 0,
  persona: {} as Record<string, { games: number; wins: number }>,
};

const bump = (key: string, ok: boolean) => {
  const o = (m.outcome[key] ??= { ok: 0, total: 0 });
  o.total++;
  if (ok) o.ok++;
};

for (let g = 0; g < games; g++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const persona: Record<string, BotStrategy> = Object.fromEntries(ids.map((id) => [id, BOT_PERSONALITIES[Math.floor(Math.random() * BOT_PERSONALITIES.length)]]));
  const state = createGame(ids.map((id) => ({ id, name: id, isBot: true })));
  let seenRoll: unknown = null;
  let leader: string | null = null;
  let leaderAt9: string | null = null;
  const earlyOk = new Map<string, number>();
  let lastRound = 1;
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 8000) {
    // 새 굴림이 시작되면 재료 기운·상한을 기록한다
    if (state.pendingRoll && state.pendingRoll !== seenRoll) {
      seenRoll = state.pendingRoll;
      const r = (m.rolls[state.pendingRoll.kind] ??= { total: 0, capped: 0, free: 0, dice: 0, noChoice: 0 });
      for (const e of state.pendingRoll.entries) {
        if (state.pendingRoll.kind === "first") continue;
        r.total++;
        const have = tokensOf(state.players[e.playerId], e.diceToken ?? "mana");
        if ((e.diceChoiceMax ?? 0) <= 1) r.noChoice++;
        if (e.diceChoiceMax === undefined) r.free++;
        else if (have > e.diceChoiceMax) r.capped++;
      }
    }
    const logStart = state.log.length;
    if (state.pendingRoll) {
      const kind = state.pendingRoll.kind;
      const entries = state.pendingRoll.entries;
      rollAndConfirm(state);
      for (const e of entries) if (kind !== "first") m.rolls[kind].dice += e.dice?.length ?? 0;
      const lines = state.log.slice(logStart).map((l) => l.message);
      if (state.round <= 3)
        for (const line of lines) {
          const e = line.match(/^(p\d): .*(조련 성공|실험 성공|목표 \d+ 성공)/) ?? line.match(/지목! (p\d) 승리/);
          if (e) earlyOk.set(e[1], (earlyOk.get(e[1]) ?? 0) + 1);
        }
      for (const line of lines) {
        if (line.includes("조련 성공")) bump("조련", true);
        else if (line.includes("조련 실패")) bump("조련", false);
        else if (line.includes("실험 성공")) bump("연구실", true);
        else if (line.includes("실험 실패")) bump("연구실", false);
        else if (/비밀의 방 .*(목표 \d+|합 \d+\/\d+) 성공/.test(line)) bump("탐험", true);
        else if (/비밀의 방 .*(목표 \d+|합 \d+\/\d+) 실패/.test(line)) bump("탐험", false);
        else {
          const d = line.match(/^(.+?)\(.*지목! (?:(\S+) 승리|무승부)/);
          if (d) bump("주문 대결(도전자 승리)", d[2] === d[1]);
        }
      }
    } else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, persona[state.pendingPick.playerId]));
    else if (state.phase === "cram") {
      const id = state.cramOrder[state.cramPointer];
      m.cramChances++;
      cramStep(state);
      if (state.log.slice(logStart).some((l) => l.message.includes(`${state.players[id].name}: 벼락치기!`))) m.cram++;
    } else if (state.phase === "class") {
      const id = state.classPickOrder[state.classPickPointer];
      const had = state.players[id].classCards.length;
      playClassTurn(state, id, persona[id]);
      const p = state.players[id];
      if (p.classCards.length > had) {
        const c = p.classCards[p.classCards.length - 1];
        m.classTier[c.level]++;
        m.classStat[state.round <= BALANCE.midtermRound ? 0 : 1][c.stat]++;
      } else m.classTier.skip++;
    } else if (state.activityStage === "resolve") advanceResolution(state);
    else {
      const id = state.activityOrder[state.activityTurnPointer];
      const pick = chooseActivityAction(state, id, persona[id]);
      selectActivity(state, id, pick.activityId, pick.targetPlayerId);
      if (state.activityStage === "resolve") {
        for (const slots of Object.values(state.activitySlots)) {
          m.activities += slots.length;
          if (slots.length >= 2) m.shared += slots.length;
        }
        m.activities += state.duels.length;
        m.shared += state.duels.length * 2;
        m.duels += state.duels.length;
      }
    }
    // 달이 바뀌면 예상 점수 1등을 확인한다 (선두 교체·역전)
    if (state.round !== lastRound) {
      if (lastRound === BALANCE.midtermRound) for (const id of ids) for (const s of STATS) m.statAt[6][s] += state.players[id][s];
      const top = [...ids].sort((a, b) => projected(state, state.players[b]) - projected(state, state.players[a]))[0];
      if (leader !== null && top !== leader) m.leadChanges++;
      leader = top;
      if (lastRound === 9) leaderAt9 = top;
      lastRound = state.round;
    }
  }
  if (state.phase !== "ended") continue;
  const scores = ids.map((id) => finalScore(state.players[id])).sort((a, b) => b - a);
  m.margin += scores[0] - scores[1];
  m.marginRatio += scores[0] > 0 ? (scores[0] - scores[1]) / scores[0] : 0;
  if ((state.winnerIds?.length ?? 0) > 1) m.coWin++;
  m.lastGap += scores[0] - scores[scores.length - 1];
  m.winnerScore += scores[0];
  for (const id of ids) {
    const p = state.players[id];
    for (const s of STATS) m.statAt[12][s] += p[s];
    m.creditFinal += p.credit;
    m.scoreFinal += finalScore(p);
    const pr = (m.persona[persona[id].name] ??= { games: 0, wins: 0 });
    pr.games++;
    if (state.winnerIds?.includes(id)) pr.wins += 1 / state.winnerIds.length;
  }
  // 1위 상을 받은 사람 수, 한 사람이 1위를 3부문 이상 가져간 판
  const firsts = (id: string) => state.players[id].awards.filter((w) => w.rank === 1).length;
  m.awardHolders += ids.filter((id) => firsts(id) > 0).length;
  if (ids.some((id) => firsts(id) >= 3)) m.sweep++;
  if (leaderAt9 && !state.winnerIds?.includes(leaderAt9)) m.comeback++;
  for (const id of ids) {
    const k = `${Math.min(3, earlyOk.get(id) ?? 0)}${(earlyOk.get(id) ?? 0) >= 3 ? "+" : ""}회`;
    const r = (m.early[k] ??= { n: 0, w: 0 });
    r.n++;
    if (state.winnerIds?.includes(id)) r.w += 1 / state.winnerIds.length;
  }
  for (const w of state.winnerIds ?? []) {
    m.seatWins[ids.indexOf(w)] += 1 / state.winnerIds!.length;
  }
}

const P = games * n;
console.log(`BAL=${process.env.BAL ?? "{}"} ${games}판 × ${n}인 (여러 성향 봇이 섞인 게임)`);
console.log("\n[컨셉] 굴림: 실력 상한에 걸린 비율(가진 기운이 능력치보다 많아 다 못 냄), 재료 기운이 없어 공짜 1개로 굴린 비율, 평균 주사위 수");
console.table(Object.fromEntries(Object.entries(m.rolls).map(([k, r]) => [k, { 굴림: r.total, 상한걸림: pct(r.capped, r.total), 공짜1개: pct(r.free, r.total), 고를여지없음: pct(r.noChoice, r.total), 평균주사위: avg(r.dice, r.total) }])));
const tierTotal = Object.values(m.classTier).reduce((a, b) => a + b, 0);
console.log("[컨셉] 수업카드 단계별 선택 비율:", Object.fromEntries(Object.entries(m.classTier).map(([k, v]) => [k, pct(v, tierTotal)])));
for (const [i, label] of ["1학기", "2학기"].entries()) {
  const t = Object.values(m.classStat[i]).reduce((a, b) => a + b, 0);
  console.log(`[컨셉] ${label} 수업 과목 비율:`, Object.fromEntries(STATS.map((s) => [s, pct(m.classStat[i][s], t)])));
}
console.log("[컨셉] 평균 능력치 6개월 끝 → 12개월 끝:", Object.fromEntries(STATS.map((s) => [s, `${avg(m.statAt[6][s], P)} → ${avg(m.statAt[12][s], P)}`])));
console.log("\n[밸런스] 활동 결과:");
console.table(Object.fromEntries(Object.entries(m.outcome).map(([k, o]) => [k, { 횟수: o.total, 성공률: pct(o.ok, o.total) }])));
console.log("[밸런스] 좌석별 승률(1번 좌석부터):", m.seatWins.map((w) => pct(w, games)).join(" / "));
console.log("[밸런스] 성향별 승률(기대", pct(1, n), "):", Object.fromEntries(Object.entries(m.persona).map(([k, v]) => [k, pct(v.wins, v.games)])));
console.log("\n[재미] 평균 최종 점수", avg(m.scoreFinal, P), "· 우승 점수", avg(m.winnerScore, games), "· 학점", avg(m.creditFinal, P));
console.log("[재미] 1·2등 점수 차", avg(m.margin, games), `(우승 점수의 ${pct(m.marginRatio, games)})`, "· 1등과 꼴찌 차", avg(m.lastGap, games), "· 공동 우승", pct(m.coWin, games));
console.log("[재미] 예상 점수 선두 교체(판당)", avg(m.leadChanges, games), "· 9개월 끝 선두가 우승 못 한 판(역전)", pct(m.comeback, games));
console.log("[재미] 1~3개월 성공 횟수별 우승률 (초반 운이 판을 정하는가):", Object.fromEntries(Object.entries(m.early).sort().map(([k, v]) => [k, pct(v.w, v.n)])));
console.log("[재미] 1위 상을 받은 사람 수(판당)", avg(m.awardHolders, games), "· 한 사람이 1위를 3부문 이상 싹쓸이", pct(m.sweep, games));
console.log("[재미] 친구와 엮인 활동(같은 구역·주문 대결) 비율", pct(m.shared, m.activities), "· 주문 대결(판당)", avg(m.duels, games), "· 벼락치기 사용률", pct(m.cram, m.cramChances));
