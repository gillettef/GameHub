/**
 * 여러 규칙 후보를 한 번에 비교한다.
 *   npx tsx shared/scripts/lab/sweep.ts <변형1,변형2,...> [인원=2,3,4] [배율=0.3]
 * 한 줄 요약 + (LAB_FULL=1 이면) 전체 보고서.
 */
import { evaluate, printReport } from './run.js';
import { VARIANTS } from './registry.js';

async function main(): Promise<void> {
  const names = (process.argv[2] ?? 'base').split(',');
  const Ps = (process.argv[3] ?? '2,3,4').split(',').map(Number);
  const scale = Number(process.argv[4] ?? '0.3');
  const rows: string[] = [];
  for (const nm of names) {
    const rules = VARIANTS[nm];
    if (!rules) throw new Error(`변형 없음: ${nm}`);
    const t0 = Date.now();
    const r = await evaluate(rules, Ps, scale);
    if (process.env.LAB_FULL) printReport({ variant: nm, seconds: Math.round((Date.now() - t0) / 1000), ...r });
    const b = r.rubric;
    const seat = r.summaries.map((s) => s.seatDev.toFixed(1)).join('/');
    const spread = r.summaries.map((s) => s.speciesSpread.toFixed(0)).join('/');
    const cb = r.summaries.map((s) => (s.comeback * 100).toFixed(0)).join('/');
    const lc = r.summaries.map((s) => s.leadChanges.toFixed(1)).join('/');
    const cubes = r.summaries.map((s) => s.maxCubes).join('/');
    const line = `${nm.padEnd(18)} 독${b.originality.toFixed(2)} 복${b.complexity.toFixed(2)} 재${b.fun.toFixed(2)} 밸${b.balance.toFixed(2)} 리${b.replay.toFixed(2)} | 평균 ${b.mean.toFixed(2)} 최저 ${b.min.toFixed(2)} | 자리 편차 ${seat} 식물폭 ${spread} 역전 ${cb} 교체 ${lc} 큐브 ${cubes}`;
    console.log(line);
    rows.push(line);
  }
  console.log('\n' + rows.join('\n'));
}
void main();
