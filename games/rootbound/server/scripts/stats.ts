/**
 * 플레이어 지표 집계 (2026-10-06). server/data/<env>/stats/*.jsonl 을 읽어 완수율·세션 시간·재방문·웹 성능을 낸다.
 *   npx tsx server/scripts/stats.ts [DATA_DIR]      (기본 server/data/prod)
 * 운영 서버에서는:
 *   ssh ... "cd ~/AstralTab && npx tsx server/scripts/stats.ts server/data/prod"
 *
 * 지표 정의
 *  - 완수율: 시작한 판 중 정상 종료(finished)이면서 사람이 아무도 기권하지 않은 비율. 방치(abandoned)는 미완수
 *  - 세션 시간: 정상 종료된 판의 시작→종료 시간 (인원수별 중앙값·평균)
 *  - 재방문: 2판 이상, 그리고 서로 다른 날(UTC 기준)에 플레이한 사람(해시된 토큰) 비율
 *  - 웹 성능: FCP·LCP 중앙값/p75, 액션 왕복(F004 목표 500ms) p50/p95, 연출 FPS 중앙값
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GameRecord } from '../src/rooms/record.js';
import type { VitalsRecord } from '../src/persistence/stats.js';

const dataDir = resolve(process.argv[2] ?? join('server', 'data', 'prod'));
const statsDir = join(dataDir, 'stats');

function readJsonl<T>(file: string): T[] {
  const path = join(statsDir, file);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

const pct = (n: number, d: number) => (d === 0 ? '-' : `${((100 * n) / d).toFixed(1)}%`);
const min = (ms: number | null) => (ms === null ? '-' : `${(ms / 60_000).toFixed(1)}분`);
const ms = (v: number | null) => (v === null ? '-' : `${v}ms`);

const games = readJsonl<GameRecord>('games.jsonl');
const vitals = readJsonl<VitalsRecord>('vitals.jsonl');

console.log(`데이터: ${statsDir}`);
console.log(`판 요약 ${games.length}건, 성능 기록 ${vitals.length}건\n`);

// --- 완수율 ---
const completed = games.filter((g) => g.outcome === 'finished' && !g.seats.some((s) => s.kind === 'human' && s.surrendered));
const finished = games.filter((g) => g.outcome === 'finished');
console.log('== 완수율 (목표 85~90% 이상) ==');
console.log(`완수 ${completed.length} / 시작 ${games.length} = ${pct(completed.length, games.length)}`);
console.log(`  기권으로 끝남 ${finished.length - completed.length}, 방치 ${games.length - finished.length}`);
const timeoutGames = games.filter((g) => g.seats.some((s) => s.timeouts > 0)).length;
const autopilotGames = games.filter((g) => g.seats.some((s) => s.autopiloted)).length;
console.log(`  시간 초과가 있던 판 ${timeoutGames}, AI 대리가 생긴 판 ${autopilotGames}\n`);

// --- 세션 시간 ---
console.log('== 세션 시간 (Rules.md 1절 목표: 2인 15~20분, 3인 20~25분, 4인 25~30분) ==');
for (const n of [2, 3, 4]) {
  const ds = finished.filter((g) => g.players === n).map((g) => g.durationMs);
  if (ds.length === 0) continue;
  const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
  console.log(`${n}인 ${ds.length}판: 중앙값 ${min(quantile(ds, 0.5))}, 평균 ${min(avg)}, p90 ${min(quantile(ds, 0.9))}`);
}
const reasons = new Map<string, number>();
for (const g of finished) reasons.set(g.reason ?? '?', (reasons.get(g.reason ?? '?') ?? 0) + 1);
console.log(`종료 사유: ${[...reasons].map(([r, c]) => `${r} ${c}`).join(', ') || '-'}\n`);

// --- 재방문 ---
const byPlayer = new Map<string, { games: number; days: Set<string> }>();
for (const g of games) {
  for (const s of g.seats) {
    if (!s.playerHash) continue;
    const e = byPlayer.get(s.playerHash) ?? { games: 0, days: new Set<string>() };
    e.games++;
    e.days.add(new Date(g.startedAt).toISOString().slice(0, 10));
    byPlayer.set(s.playerHash, e);
  }
}
const players = [...byPlayer.values()];
console.log('== 재플레이 · 재방문 (목표 재방문 30% 이상) ==');
console.log(`플레이어 ${players.length}명`);
console.log(`2판 이상 ${pct(players.filter((p) => p.games >= 2).length, players.length)}, 다른 날 다시 옴 ${pct(players.filter((p) => p.days.size >= 2).length, players.length)}\n`);

// --- 종·자리 ---
console.log('== 실전 종·자리 승률 (정상 종료 판, 1위 기준) ==');
const speciesWins = new Map<string, [number, number]>();
const seatWins = new Map<string, [number, number]>();
for (const g of finished) {
  for (const s of g.seats) {
    // 2026-10-08 부터는 마켓 규칙(심은 식물 planted), 그 전은 드래프트(고른 종 drafted). 규칙이 달라 따로 센다
    const era = s.planted ? '' : '[드래프트] ';
    for (const sp of (s.planted ?? (s as { drafted?: string[] }).drafted ?? []).map((x) => era + x)) {
      const r = speciesWins.get(sp) ?? [0, 0];
      r[0]++;
      if (s.rank === 1) r[1]++;
      speciesWins.set(sp, r);
    }
    const key = `${era}${g.players}인 자리 ${s.seat}`;
    const t = seatWins.get(key) ?? [0, 0];
    t[0]++;
    if (s.rank === 1) t[1]++;
    seatWins.set(key, t);
  }
}
for (const [sp, [n, w]] of [...speciesWins].sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0])) console.log(`${sp.padEnd(10)} ${String(n).padStart(4)}회 승률 ${pct(w, n)}`);
for (const [key, [n, w]] of [...seatWins].sort()) console.log(`${key.padEnd(10)} ${String(n).padStart(4)}판 승률 ${pct(w, n)}`);
console.log('');

// --- 웹 성능 ---
console.log('== 웹 성능 ==');
const fcp = vitals.map((v) => v.fcp).filter((v): v is number => v !== null);
const lcp = vitals.map((v) => v.lcp).filter((v): v is number => v !== null);
const rtt = vitals.flatMap((v) => v.syncRtt);
const fps = vitals.map((v) => v.fps).filter((v): v is number => v !== null);
console.log(`FCP 중앙값 ${ms(quantile(fcp, 0.5))}, p75 ${ms(quantile(fcp, 0.75))} (n=${fcp.length})`);
console.log(`LCP 중앙값 ${ms(quantile(lcp, 0.5))}, p75 ${ms(quantile(lcp, 0.75))} (n=${lcp.length}, 목표 p75 2500ms 이하)`);
console.log(`액션 왕복 p50 ${ms(quantile(rtt, 0.5))}, p95 ${ms(quantile(rtt, 0.95))} (n=${rtt.length}, F004 목표 500ms 이하)`);
console.log(`연출 FPS 중앙값 ${quantile(fps, 0.5) ?? '-'}, 하위 10% ${quantile(fps, 0.1) ?? '-'} (n=${fps.length}, 목표 55 이상)`);
