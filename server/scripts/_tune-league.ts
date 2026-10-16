// 임시: 전략 AI 리그로 밸런스 수치를 격자 탐색한다 (사용법: npx tsx scripts/_tune-league.ts [게임 수])
// 목표 = 2~5인 style 리그에서 "기대값과 가장 먼 AI의 차이"의 최댓값을 가장 작게. 같은 SEED로 돌려 설정끼리 운을 맞춘다
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const games = Number(process.argv[2]) || 2000;
// GRID='[{...},{...}]'로 후보 목록을 직접 줄 수 있다 (없으면 기본 격자)
const grid: Record<string, unknown>[] = process.env.GRID ? JSON.parse(process.env.GRID) : [];
if (!process.env.GRID) for (const exploreTargetMod of [1, 2]) for (const labTargetMod of [0, -1]) for (const trainTargetScale of [0.48, 0.52, 0.56]) grid.push({ exploreTargetMod, labTargetMod, trainTargetScale });
const results: { bal: Record<string, unknown>; score: number; per: number[] }[] = [];
for (const bal of grid) {
  const per = await Promise.all([2, 3, 4, 5].map(async (n) => {
    const { stdout } = await run("npx", ["tsx", "scripts/ai-league.ts", String(games), String(n), "style"], { env: { ...process.env, BAL: JSON.stringify({ ...(process.env.BASE ? JSON.parse(process.env.BASE) : {}), ...bal }), SEED: "7", JSON: "1" }, shell: true, maxBuffer: 1 << 24 });
    const line = stdout.split("\n").find((l) => l.startsWith("JSON"))!;
    return JSON.parse(line.slice(4)).maxDev as number;
  }));
  const score = Math.max(...per);
  results.push({ bal, score, per });
  console.log(JSON.stringify(bal), "최대 차이", (100 * score).toFixed(1), "%p  (2~5인:", per.map((x) => (100 * x).toFixed(1)).join(" / "), ")");
}
results.sort((a, b) => a.score - b.score);
console.log("\n최적:", JSON.stringify(results[0].bal), (100 * results[0].score).toFixed(1), "%p");
