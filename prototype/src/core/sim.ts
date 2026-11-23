// 봇끼리 여러 판을 돌려 밸런스 지표를 모은다 (웹 시뮬레이터의 "자동 대전" 화면, 테스트에서 사용).
import { TILES } from './data';
import { playOut } from './ai';
import { createGame, ranking } from './engine';
import type { BotLevel } from './types';

export interface SimResult {
  games: number;
  n: number;
  /** 시작 자리(선 플레이어 기준 k번째)별 승률. 공동 1위는 나눠서 센다 */
  seatWin: number[];
  avgScore: number;
  avgCores: number;
  avgDp: number;
  /** 점수 중 설계자 점수 비중 */
  dpShare: number;
  dpFromBump: number;
  dpFromSpent: number;
  coreByRule: number;
  coreByThrust: number;
  ivs: Record<string, number>;
  /** 타일별 꽂힘 대비 발동률 */
  tileFire: { code: string; text: string; placed: number; fireRate: number }[];
}

export function runSims(n: number, games: number, seed: number, level: BotLevel = 'normal', onGame?: (i: number) => void): SimResult {
  const seatWin = Array<number>(n).fill(0);
  let score = 0;
  let cores = 0;
  let dp = 0;
  let dpBump = 0;
  let dpSpent = 0;
  let coreByRule = 0;
  let coreByThrust = 0;
  const ivs: Record<string, number> = { none: 0, turn: 0, block: 0, thrust: 0 };
  const placed: Record<string, number> = {};
  const fired: Record<string, number> = {};
  for (let i = 0; i < games; i++) {
    const seats = Array.from({ length: n }, (_, k) => ({ name: `봇${k + 1}`, kind: 'bot' as const, level }));
    const first = i % n;
    const g = playOut(createGame(seats, seed + i * 7919, { first }), seed + i * 104729);
    const rk = ranking(g);
    const winners = rk.filter((r) => r.rank === 1);
    for (const w of winners) seatWin[(w.p - first + n) % n]! += 1 / winners.length;
    for (const p of g.players) {
      cores += p.cores;
      dp += p.dp;
      score += p.cores * 2 + p.dp;
    }
    dpBump += g.stats.dpBump;
    dpSpent += g.stats.dpSpent;
    coreByRule += g.stats.coreByRule;
    coreByThrust += g.stats.coreByThrust;
    for (const k of Object.keys(ivs)) ivs[k]! += g.stats.ivs[k as keyof typeof g.stats.ivs];
    for (const [c, v] of Object.entries(g.stats.placed)) placed[c] = (placed[c] ?? 0) + v;
    for (const [c, v] of Object.entries(g.stats.triggered)) fired[c] = (fired[c] ?? 0) + v;
    onGame?.(i);
  }
  const per = games * n;
  const ivTotal = Object.values(ivs).reduce((a, b) => a + b, 0) || 1;
  return {
    games,
    n,
    seatWin: seatWin.map((w) => w / games),
    avgScore: score / per,
    avgCores: cores / per,
    avgDp: dp / per,
    dpShare: score ? dp / score : 0,
    dpFromBump: dpBump / per,
    dpFromSpent: dpSpent / per,
    coreByRule: coreByRule / per,
    coreByThrust: coreByThrust / per,
    ivs: Object.fromEntries(Object.entries(ivs).map(([k, v]) => [k, v / ivTotal])),
    tileFire: TILES.map((t) => ({
      code: t.code,
      text: t.text,
      placed: placed[t.code] ?? 0,
      fireRate: placed[t.code] ? (fired[t.code] ?? 0) / placed[t.code]! : 0,
    })),
  };
}
