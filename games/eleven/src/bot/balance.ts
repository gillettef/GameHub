// 난이도 측정용 헤드리스 시뮬레이션: 봇 4명 판을 부별로 여러 번 돌려 리그 등수·승무패 분포를 낸다.
// 사용: npm run balance -w games/eleven -- [판 수=40] [부=1,2,3]
// 봇 정책(policy.ts)을 "무난하게 하는 참가자"의 대용으로 본다 — 상대 팀 카드(opponents.mock.ts) 수치를 조정할 때 기준.
import { leagueRank } from '../engine/scoring';
import type { Division } from '../engine/types';
import { playHeadless } from './headless';

const games = Number(process.argv[2] ?? 40);
const divisions = (process.argv[3] ?? '3,2,1').split(',').map(Number) as Division[];

function playOne(division: Division, seed: number) {
  const seats = [0, 1, 2, 3].map((i) => ({ kind: 'bot' as const, name: `봇 ${i + 1}` }));
  return playHeadless(seats, seed, { division }).table.game;
}

for (const division of divisions) {
  const ranks: number[] = [];
  const weekly = Array.from({ length: 6 }, () => ({ win: 0, draw: 0, loss: 0, gf: 0, ga: 0 }));
  let teams = 0;
  for (let g = 0; g < games; g++) {
    const state = playOne(division, 1000 + g * 7);
    teams = state.seats.length + state.league.opponents.length;
    for (const pid of state.seats) {
      ranks.push(leagueRank(state, pid));
      for (const m of state.players[pid]!.matchHistory) {
        const w = weekly[m.week - 1]!;
        w[m.outcome]++;
        w.gf += m.myGoals;
        w.ga += m.theirGoals;
      }
    }
  }
  ranks.sort((a, b) => a - b);
  const n = ranks.length;
  const avg = ranks.reduce((a, b) => a + b, 0) / n;
  const pct = (k: number, of = n) => ((100 * k) / of).toFixed(0).padStart(3) + '%';
  const total = weekly.reduce((a, w) => ({ win: a.win + w.win, draw: a.draw + w.draw, loss: a.loss + w.loss, gf: a.gf + w.gf, ga: a.ga + w.ga }));
  console.log(`\n== ${division}부 (${games}판 × 4명, 리그 ${teams}팀) ==`);
  console.log(`평균 등수 ${avg.toFixed(2)} / 중앙값 ${ranks[Math.floor(n / 2)]} | 1위 ${pct(ranks.filter((r) => r === 1).length)} · 3위 이내 ${pct(ranks.filter((r) => r <= 3).length)} · 상위 절반 ${pct(ranks.filter((r) => r <= teams / 2).length)}`);
  console.log(`승 ${pct(total.win, n * 6)} 무 ${pct(total.draw, n * 6)} 패 ${pct(total.loss, n * 6)} | 평균 ${(total.gf / n / 6).toFixed(2)} : ${(total.ga / n / 6).toFixed(2)}`);
  console.log('주차별 승/무/패: ' + weekly.map((w, i) => `${i + 1}주 ${w.win}/${w.draw}/${w.loss}`).join('  '));
}
