/** 저장한 측정 결과(LAB_JSON)에서 고른 인원만으로 점수표를 다시 낸다. npx tsx tools/lab/rescore.ts <json> <변형> [인원=2,3] */
import { readFileSync } from 'node:fs';
import { rubric, type Summary } from './metrics.js';
import { VARIANTS } from './registry.js';

const [file, name, ps = '2,3'] = process.argv.slice(2);
const data = JSON.parse(readFileSync(file!, 'utf8')) as { summaries: Summary[] };
const Ps = ps.split(',').map(Number);
const r = rubric(VARIANTS[name!]!, data.summaries.filter((s) => Ps.includes(s.P)));
console.log(`독창성 ${r.originality.toFixed(2)} / 복잡성 ${r.complexity.toFixed(2)} / 재미 ${r.fun.toFixed(2)} / 밸런스 ${r.balance.toFixed(2)} / 리플레이성 ${r.replay.toFixed(2)} (평균 ${r.mean.toFixed(2)}, 최저 ${r.min.toFixed(2)})`);
for (const [k, v] of Object.entries(r.detail)) console.log(`  ${k}: ${Object.entries(v).map(([a, b]) => `${a} ${(b as number).toFixed(2)}`).join(', ')}`);
