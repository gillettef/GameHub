// 봇 대전 시뮬레이터. 사용법:
//   npm run sim -- --games 2000 --players 4 --style rival
//   npm run sim -- --games 2000 --players 3,4,5 --style mixed --json out.json
// 출력: 인물별·자리별 승률, 게임 길이, 연쇄 정리·패러독스 빈도, 결정 원인 분포 등
import { writeFileSync } from 'node:fs';
import { newGame, finalScore, FIGURES, CARD, DEFAULT_RULES, ENDING_POOL } from '../src/engine.js';
import { playBotGame, guessMotives, BOT_STYLES } from '../src/bots.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const GAMES = Number(args.games ?? 1000);
const PLAYERS = String(args.players ?? '4').split(',').map(Number);
const STYLE = args.style ?? 'mixed';
const SEED0 = Number(args.seed ?? 1);
const rules = structuredClone(DEFAULT_RULES);
if (args.hand) rules.handSize = Number(args.hand);
if (args.paradox) rules.points.paradox = Number(args.paradox);
if (args.decisive) rules.points.decisive = Number(args.decisive);
if (args.slots) {
  const s = String(args.slots).split(',').map(Number); // 예: 9,12,15
  rules.slotsByPlayers = { 3: s[0], 4: s[1] ?? s[0], 5: s[2] ?? s[0] };
}

const styleList = Object.keys(BOT_STYLES).filter((k) => k !== 'random');
if (args.activity) for (const k of styleList) BOT_STYLES[k] = { ...BOT_STYLES[k], activity: Number(args.activity) };
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-');
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const report = {};
for (const n of PLAYERS) {
  const st = {
    games: 0, seatWins: Array(n).fill(0), figureWins: Object.fromEntries(FIGURES.map((f) => [f, 0])),
    figureGames: Object.fromEntries(FIGURES.map((f) => [f, 0])), styleWins: {}, styleGames: {},
    rounds: [], turns: [], cascades: [], removed: [], paradox: [], unresolved: 0, endTrigger: { timeline: 0, deck: 0 },
    noDecisive: 0, decisiveFig: Object.fromEntries(FIGURES.map((f) => [f, 0])), winMargin: [], scores: [],
    actions: { place: 0, exchange: 0, pass: 0 }, correctGuess: [], ties: 0,
    endingFactNoDecisive: Object.fromEntries(ENDING_POOL.map((e) => [`${e.subject}=${e.state}`, [0, 0]])),
  };
  for (let i = 0; i < GAMES; i++) {
    const seed = SEED0 + i * 7919 + n;
    const styles = Array.from({ length: n }, (_, p) =>
      STYLE === 'mixed' ? BOT_STYLES[styleList[(p + i) % styleList.length]] : BOT_STYLES[STYLE]);
    const styleNames = styles.map((s) => s.label);
    const g = playBotGame(newGame({ names: styleNames, seed, rules }), styles, seed + 1);
    const s = finalScore(g, g.names.map((_, p) => guessMotives(g, p)));
    st.games++;
    if (s.winners.length > 1) st.ties++;
    for (const w of s.winners) {
      st.seatWins[w] += 1 / s.winners.length;
      st.figureWins[g.motives[w]] += 1 / s.winners.length;
      st.styleWins[styleNames[w]] = (st.styleWins[styleNames[w]] ?? 0) + 1 / s.winners.length;
    }
    g.motives.forEach((f, p) => {
      st.figureGames[f]++;
      st.styleGames[styleNames[p]] = (st.styleGames[styleNames[p]] ?? 0) + 1;
    });
    st.rounds.push(g.round);
    st.turns.push(g.history.length);
    st.cascades.push(g.stats.cascades);
    st.removed.push(g.stats.removedCards);
    st.paradox.push(g.paradox.reduce((a, b) => a + b, 0));
    st.unresolved += s.unresolved.length;
    st.endTrigger[g.stats.endTrigger]++;
    for (const d of s.decisive) {
      const key = `${d.ending.subject}=${d.ending.state}`;
      st.endingFactNoDecisive[key][1]++;
      if (!d.figure) { st.noDecisive++; st.endingFactNoDecisive[key][0]++; } else st.decisiveFig[d.figure]++;
    }
    const totals = s.rows.map((r) => r.total).sort((a, b) => b - a);
    st.winMargin.push(totals[0] - totals[1]);
    st.scores.push(...s.rows.map((r) => r.total));
    st.correctGuess.push(avg(s.rows.map((r) => r.correct / (n - 1))));
    for (const h of g.history) st.actions[h.type]++;
  }
  report[n] = st;

  const totalActs = st.actions.place + st.actions.exchange + st.actions.pass;
  console.log(`\n===== ${n}인 · ${GAMES}판 · 봇=${STYLE} · 칸 ${rules.slotsByPlayers[n]} · 손패 ${rules.handSize} · 점수 ${JSON.stringify(rules.points)} =====`);
  console.log('자리별 승률 (0=시작 플레이어):', st.seatWins.map((w, i) => `${i}:${pct(w, st.games)}`).join('  '));
  console.log('인물별 승률:', FIGURES.map((f) => `${f} ${pct(st.figureWins[f], st.figureGames[f])}`).join(' · '));
  if (STYLE === 'mixed') console.log('봇 유형별 승률:', Object.keys(st.styleGames).map((k) => `${k} ${pct(st.styleWins[k], st.styleGames[k])}`).join(' · '));
  console.log(`라운드 평균 ${avg(st.rounds).toFixed(1)} · 차례 평균 ${avg(st.turns).toFixed(1)} · 종료 계기 시간선 ${pct(st.endTrigger.timeline, st.games)} / 덱 ${pct(st.endTrigger.deck, st.games)}`);
  console.log(`행동 비율: 놓기 ${pct(st.actions.place, totalActs)} · 교체 ${pct(st.actions.exchange, totalActs)} · 패스 ${pct(st.actions.pass, totalActs)}`);
  console.log(`연쇄 정리 발생 게임당 ${avg(st.cascades).toFixed(2)}회 · 버려진 카드 ${avg(st.removed).toFixed(2)}장 · 패러독스 합계 ${avg(st.paradox).toFixed(2)}개 · 미해결 결말 게임당 ${(st.unresolved / st.games).toFixed(2)}개`);
  console.log(`결정 원인 없음 ${pct(st.noDecisive, st.games * 3)} (결말 3장 기준) · 동점 승리 ${pct(st.ties, st.games)} · 1·2위 점수차 평균 ${avg(st.winMargin).toFixed(2)} · 점수 평균 ${avg(st.scores).toFixed(2)}`);
  console.log(`추리 적중률 ${(100 * avg(st.correctGuess)).toFixed(1)}%`);
  console.log('결말 사실별 결정 원인 없음 비율:', Object.entries(st.endingFactNoDecisive).map(([k, [a, b]]) => `${k} ${pct(a, b)}`).join(' · '));
}
if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 2));
void CARD;
