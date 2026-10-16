/**
 * 오프라인판 규칙 실험실 실행기.
 *   npx tsx shared/scripts/lab/run.ts <variant> [인원 목록=2,3,4] [판수 배율=1]
 *   LAB_PATCH='<json>' 으로 규칙 일부를 덮어쓴다 (예: '{"cap":4}').
 * 시나리오
 *   self  : 사람 흉내 봇(잡음 있는 탐욕)끼리 → 좌석·식물 균형, 재미 지표, 결정 지표
 *   gr    : 탐욕 1명 vs 무작위 → 전략이 통하는가
 *   lg    : 2수 앞보기 1명 vs 탐욕 → 더 깊이 생각하면 더 이기는가
 *   arch  : 성향 봇 5종을 자리마다 무작위로 → 한 전략이 독식하는가, 전략 다양성
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ARCHETYPES } from './bots.js';
import { mulberry32, shuffle, type LabRules } from './engine.js';
import { playGame, type GameOut } from './play.js';
import { VARIANTS } from './registry.js';
import { rubric, summarize, type Summary } from './metrics.js';

interface Task {
  rules: LabRules;
  P: number;
  seed: number;
  bots: string[];
  scenario: string;
  instrument: boolean;
}

if (!isMainThread) {
  const tasks = workerData as Task[];
  const out: (GameOut & { scenario: string })[] = [];
  for (const t of tasks) out.push({ ...playGame(t.rules, t.P, t.seed, t.bots, t.instrument), scenario: t.scenario });
  parentPort!.postMessage(out);
} else if (/run.ts$/.test(process.argv[1] ?? '')) {
  void main();
}

function makeTasks(rules: LabRules, P: number, scale: number): Task[] {
  const tasks: Task[] = [];
  const rand = mulberry32(12345 + P);
  const N = (n: number) => Math.max(1, Math.round(n * scale));
  const selfN = N(P === 2 ? 600 : 450);
  for (let i = 0; i < selfN; i++) tasks.push({ rules, P, seed: 1000 + i, bots: new Array(P).fill('human'), scenario: 'self', instrument: i % 3 === 0 });
  const grN = N(120);
  for (let i = 0; i < grN; i++) {
    const bots = new Array(P).fill('random');
    bots[i % P] = 'greedy';
    tasks.push({ rules, P, seed: 50000 + i, bots, scenario: 'gr', instrument: false });
  }
  const lgN = N(P === 2 ? 200 : 160);
  for (let i = 0; i < lgN; i++) {
    const bots = new Array(P).fill('greedy');
    bots[i % P] = 'lookahead';
    tasks.push({ rules, P, seed: 70000 + i, bots, scenario: 'lg', instrument: false });
  }
  const archN = N(P === 2 ? 600 : 450);
  for (let i = 0; i < archN; i++) {
    const bots = shuffle(ARCHETYPES, rand).slice(0, P);
    tasks.push({ rules, P, seed: 90000 + i, bots, scenario: 'arch', instrument: false });
  }
  const only = process.env.LAB_ONLY;
  return only ? tasks.filter((t) => only.split(',').includes(t.scenario)) : tasks;
}

export async function evaluate(rules: LabRules, Ps: number[], scale: number): Promise<{ summaries: Summary[]; rubric: ReturnType<typeof rubric> }> {
  const summaries: Summary[] = [];
  for (const P of Ps) summaries.push(summarize(rules, P, await runTasks(makeTasks(rules, P, scale))));
  return { summaries, rubric: rubric(rules, summaries) };
}

async function runTasks(tasks: Task[]): Promise<(GameOut & { scenario: string })[]> {
  const W = Math.max(1, cpus().length - 1);
  // 무거운 lookahead 를 고르게 나눈다
  const chunks: Task[][] = Array.from({ length: W }, () => []);
  tasks.forEach((t, i) => chunks[i % W]!.push(t));
  const file = fileURLToPath(import.meta.url);
  const results = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<(GameOut & { scenario: string })[]>((resolve, reject) => {
          const boot = `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify(pathToFileURL(file).href)}); });`;
          const w = new Worker(boot, { eval: true, workerData: chunk });
          w.once('message', resolve);
          w.once('error', reject);
        }),
    ),
  );
  return results.flat();
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'base';
  const Ps = (process.argv[3] ?? '2,3,4').split(',').map(Number);
  const scale = Number(process.argv[4] ?? '1');
  let rules = VARIANTS[name];
  if (!rules) throw new Error(`변형 없음: ${name}. 있는 것: ${Object.keys(VARIANTS).join(', ')}`);
  if (process.env.LAB_PATCH) rules = { ...rules, ...JSON.parse(process.env.LAB_PATCH) };
  const t0 = Date.now();
  const all: Summary[] = [];
  for (const P of Ps) {
    const res = await runTasks(makeTasks(rules, P, scale));
    const sum = summarize(rules, P, res);
    all.push(sum);
  }
  const rb = rubric(rules, all);
  const out = { variant: rules.name, seconds: Math.round((Date.now() - t0) / 1000), summaries: all, rubric: rb };
  if (process.env.LAB_JSON) {
    const fs = await import('node:fs');
    fs.writeFileSync(process.env.LAB_JSON, JSON.stringify(out, null, 2));
  }
  printReport(out);
}

export function printReport(out: { variant: string; seconds: number; summaries: Summary[]; rubric: ReturnType<typeof rubric> }): void {
  console.log(`\n=== ${out.variant} (${out.seconds}s) ===`);
  for (const s of out.summaries) {
    console.log(`\n[${s.P}인] self ${s.n}판`);
    if (s.komiBest) console.log(`  덤 후보 [${s.komiBest.komi.join(',')}] → ${s.komiBest.rates.map((x) => (x * 100).toFixed(1)).join(' / ')} (편차 ${(s.komiBest.dev * 100).toFixed(1)}%p)`);
    console.log(`  좌석 승률 ${s.seatWin.map((x) => (x * 100).toFixed(1)).join(' / ')}  (최대 편차 ${s.seatDev.toFixed(1)}%p)`);
    console.log(`  점수 평균 ${s.meanScore.toFixed(1)} (땅 ${s.meanLand.toFixed(1)}, 목표 ${s.meanGoal.toFixed(1)}), 1·2등 차 중앙 ${s.marginMedian.toFixed(1)} (비율 ${s.marginRatio.toFixed(3)}), 3점 이내 ${(s.closeRate * 100).toFixed(0)}%`);
    console.log(`  선두 교체 ${s.leadChanges.toFixed(2)}회, 역전승(2/3 지점 선두 아님) ${(s.comeback * 100).toFixed(0)}%, 뒤집기 ${s.flipsPerTurn.toFixed(2)}칸/수, 뒤집는 수 ${(s.flipTurnRate * 100).toFixed(0)}%, 마지막 바퀴 뒤집기 ${s.lastRoundFlips.toFixed(1)}`);
    console.log(`  동점(점수·땅·큐브) ${(s.tieRate * 100).toFixed(1)}%, 버림 ${(s.discardRate * 100).toFixed(2)}%, 심기 수 같음 ${s.equalPlays ? 'O' : 'X'}, 큐브 최대 ${s.maxCubes.toFixed(0)}개/인, 한 칸 최대 ${s.maxStack}, 큐브 손작업 ${s.cubeOpsPerTurn.toFixed(1)}/수`);
    console.log(`  결정: 후보 ${s.decN.toFixed(0)}수, 최선−중앙 ${s.decSpread.toFixed(2)}, 최선−차선 ${s.decGap.toFixed(2)}, 1점 안 후보 ${s.decClose.toFixed(1)}`);
    console.log(`  식물(심은 장수 가중 승률): ${Object.entries(s.speciesWin).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}`).join(', ')}  폭 ${s.speciesSpread.toFixed(1)}%p`);
    console.log(`  탐욕 vs 무작위 ${(s.greedyVsRandom * 100).toFixed(0)}%, 앞보기 vs 탐욕 ${(s.lookVsGreedy * 100).toFixed(0)}%`);
    console.log(`  성향 승률/기대: ${Object.entries(s.archShare).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}  승자 성향 엔트로피 ${s.archEntropy.toFixed(2)}`);
    console.log(`  목표 비중(승자) ${(s.goalShare * 100).toFixed(0)}%, 승자 주력 식물 엔트로피 ${s.winnerSpeciesEntropy.toFixed(2)}, 예상 시간 ${s.minutes.toFixed(0)}분`);
  }
  const r = out.rubric;
  console.log(`\n점수: 독창성 ${r.originality.toFixed(2)} / 복잡성 ${r.complexity.toFixed(2)} / 재미 ${r.fun.toFixed(2)} / 밸런스 ${r.balance.toFixed(2)} / 리플레이성 ${r.replay.toFixed(2)}  (평균 ${r.mean.toFixed(2)}, 최저 ${r.min.toFixed(2)})`);
  for (const [k, v] of Object.entries(r.detail)) console.log(`  ${k}: ${Object.entries(v).map(([a, b]) => `${a} ${(b as number).toFixed(2)}`).join(', ')}`);
}
