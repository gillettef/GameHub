// 시드 고정 AI 대 AI 대량 시뮬레이션: npx tsx scripts/simulate.ts --games 100 --players 3 --seed 1
// 메모리가 적은 기기에서는 한 번에 하나씩, 판 수를 나눠 돌린다(--json 결과를 합쳐 비교)
//   --detail : 노드 연구율·위성 발사·퀘스트 칸 선택 분포 등 상세 지표
//   --json <파일> : 요약 지표를 JSON 으로 저장
//   --seat "0,0;1,1;1,0" : 자리별 시작 보정(생산,과학) 시험
import { writeFileSync } from 'node:fs';
import { createGame } from '../src/core/engine/setup';
import { applyAction } from '../src/core/engine/turn';
import { chooseAction } from '../src/core/ai';
import { ranking } from '../src/core/engine/scoring';
import { mainDoctrine, totalColonists } from '../src/core/engine/derive';
import { researchedCount, webGraph } from '../src/core/engine/research';
import type { GameState } from '../src/core/types';
import { FIRST_ROUND_COMMAND, ERA_MAX_ROUNDS, SEAT_BONUS } from '../src/core/data/constants';
import { SATELLITES } from '../src/core/data/satellites';
import { CORE_ID } from '../src/core/data/techWeb';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

export interface GameRun {
  state: GameState;
  steps: number;
  eraRounds: number[];
  /** 퀘스트 선택 칸 분포(칸 1~5) */
  picks: number[];
}

export function playGame(seed: number, players: number, maxSteps = 20000): GameRun {
  let s = createGame(seed, Array.from({ length: players }, (_, i) => ({ name: `AI${i + 1}`, isAI: true })));
  let steps = 0;
  const eraRounds: number[] = [1];
  const picks = [0, 0, 0, 0, 0];
  while (!s.gameOver && steps < maxSteps) {
    const actor = s.pending.length ? s.pending[0].player : s.current;
    const a = chooseAction(s, actor);
    if (!a) throw new Error('AI 가 행동을 내지 못함');
    const r = applyAction(s, actor, a);
    if (r.error) {
      // 잘못된 행동은 차례 종료로 대체
      const e = applyAction(s, actor, s.pending.length ? { type: 'respond', choice: 0 } : { type: 'endTurn' });
      if (e.error) throw new Error(`진행 불가: ${r.error} / ${e.error}`);
      s = e.state;
    } else {
      if (a.type === 'pickQuest') picks[a.slot]++;
      s = r.state;
    }
    if (s.era > eraRounds.length) eraRounds.push(s.round);
    steps++;
  }
  return { state: s, steps, eraRounds, picks };
}

if (process.argv[1]?.includes('simulate')) {
  // --first 2,3,3,3 : 첫 라운드 자리별 지휘 수를 파일 수정 없이 바꿔 시험
  const fi = process.argv.indexOf('--first');
  if (fi >= 0) process.argv[fi + 1].split(',').forEach((v, i) => (FIRST_ROUND_COMMAND[i] = Number(v)));
  // --seat "0,0;1,1;2,1" : 이번 인원의 자리별 시작 보정(생산,과학)을 파일 수정 없이 바꿔 시험
  const si = process.argv.indexOf('--seat');
  if (si >= 0) {
    SEAT_BONUS[arg('players', 3)] = process.argv[si + 1].split(';').map((x) => {
      const [prod, sci] = x.split(',').map(Number);
      return { ...(prod ? { prod } : {}), ...(sci ? { sci } : {}) };
    });
  }
  const ji = process.argv.indexOf('--json');
  const jsonPath = ji >= 0 ? process.argv[ji + 1] : null;
  const detail = process.argv.includes('--detail');
  const games = arg('games', 50);
  const players = arg('players', 3);
  const seed0 = arg('seed', 1);
  const seatWins = Array(players).fill(0);
  const docWins: Record<string, number> = { ark: 0, symbiont: 0, synth: 0, none: 0 };
  const docCount: Record<string, number> = { ark: 0, symbiont: 0, synth: 0, none: 0 };
  const src = { culture: 0, legacies: 0, charters: 0, patrons: 0, fruition: 0, finale: 0, total: 0 };
  const per = {
    healthHits: 0,
    colonists: 0,
    raids: 0,
    raidWins: 0,
    conflicts: 0,
    threatHit: 0,
    threatSlay: 0,
    patronMet: 0,
    patronFail: 0,
    patronTaken: 0,
    legacyStart: 0,
    legacyDone: 0,
    food: 0,
    reshuffle: 0,
    discarded: 0,
  };
  let rounds = 0;
  let unfinished = 0;
  let winScore = 0;
  let margin = 0;
  let nodes = 0;
  const eraStarts = [0, 0, 0, 0];
  const eraCapHit = [0, 0, 0];
  const picks = [0, 0, 0, 0, 0];
  const nodeCount: Record<string, number> = {};
  const satCount: Record<string, number> = {};
  const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    const run = playGame(seed0 + g, players);
    const { state, eraRounds } = run;
    if (!state.gameOver) unfinished++;
    run.picks.forEach((n, i) => (picks[i] += n));
    const r = ranking(state);
    const w = state.players[r[0].player];
    const seat = (w.id - state.startPlayer + players) % players;
    seatWins[seat]++;
    for (const p of state.players) {
      docCount[mainDoctrine(p) ?? 'none']++;
      for (const id of p.researched) if (id !== CORE_ID) nodeCount[id] = (nodeCount[id] ?? 0) + 1;
    }
    for (const sc of r) for (const k of Object.keys(src) as (keyof typeof src)[]) src[k] += sc[k];
    docWins[mainDoctrine(w) ?? 'none']++;
    rounds += state.round;
    winScore += r[0].total;
    margin += r[0].total - r[1].total;
    nodes += state.players.reduce((a, p) => a + researchedCount(p), 0) / players;
    eraRounds.forEach((rd, i) => (eraStarts[i] += rd));
    for (let e = 0; e < 3; e++) if (eraRounds[e + 1] !== undefined && eraRounds[e + 1] - eraRounds[e] >= ERA_MAX_ROUNDS) eraCapHit[e]++;
    const count = (re: RegExp) => state.log.filter((e) => re.test(e.text)).length / players;
    per.healthHits += count(/건강 부족|역병/);
    per.raids += count(/습격 (성공|실패)/);
    per.raidWins += count(/습격 성공/);
    per.conflicts += count(/분쟁 선포/);
    per.threatHit += count(/을 막지 못함/);
    per.threatSlay += count(/」 처치$|」과 공존$/);
    per.patronMet += count(/요구 충족/);
    per.patronFail += count(/요구 미달/);
    per.patronTaken += count(/주둔지 「.*」 받음/);
    per.legacyStart += count(/유산 「.*」 착공/);
    per.legacyDone += count(/유산 「.*」 완성/);
    per.reshuffle += state.log.filter((e) => /밀림 더미 .*새 덱/.test(e.text)).length;
    per.discarded += count(/— 버림$/);
    for (const e of state.log) {
      const m = /^위성 「(.+)」 발사/.exec(e.text);
      if (m) satCount[m[1]] = (satCount[m[1]] ?? 0) + 1;
    }
    per.food += state.players.reduce((a, p) => a + p.res.food, 0) / players;
    per.colonists += state.players.reduce((a, p) => a + totalColonists(p), 0) / players;
  }
  const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
  const avg = (n: number) => (n / games).toFixed(2);
  console.log(`게임 ${games} · ${players}인 · 시드 ${seed0}~ · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  console.log(`평균 라운드 ${(rounds / games).toFixed(1)} · 미종료 ${unfinished} · 우승 점수 평균 ${(winScore / games).toFixed(1)} · 1·2위 격차 ${(margin / games).toFixed(1)} · 연구 노드 평균 ${(nodes / games).toFixed(1)}`);
  console.log(`시대 시작 라운드 평균: ${eraStarts.map((x) => (x / games).toFixed(1)).join(' / ')} · 상한 도달(1·2·3시대): ${eraCapHit.map((n) => pct(n, games)).join(' / ')}`);
  console.log(`자리별 승률: ${seatWins.map((w, i) => `${i + 1}번 ${pct(w, games)}`).join(' · ')}`);
  const st = src.total || 1;
  console.log(`점수 출처: 문화 ${pct(src.culture, st)} · 유산 ${pct(src.legacies, st)} · 헌장 ${pct(src.charters, st)} · 주둔지 ${pct(src.patrons, st)} · 결실 ${pct(src.fruition, st)} · 종료 ${pct(src.finale, st)}`);
  console.log(`1인당: 건강 부족 생산 단계 ${avg(per.healthHits)}회 · 최종 정착민 ${avg(per.colonists)}명 · 남은 식량 ${avg(per.food)}`);
  console.log(`1인당: 습격 ${avg(per.raids)}회(성공 ${avg(per.raidWins)}) · 분쟁 선포 ${avg(per.conflicts)}회 · 위협 피해 ${avg(per.threatHit)} / 막음 ${avg(per.threatSlay)}`);
  console.log(`1인당: 주둔지 받음 ${avg(per.patronTaken)} · 요구 충족 ${avg(per.patronMet)} / 미달 ${avg(per.patronFail)} · 유산 착공 ${avg(per.legacyStart)} / 완성 ${avg(per.legacyDone)} · 버린 카드 ${avg(per.discarded)}`);
  const pk = picks.reduce((a, b) => a + b, 0);
  console.log(`퀘스트 칸 선택(1~5): ${picks.map((n) => pct(n, pk)).join(' / ')} · 판당 덱 재섞기 ${avg(per.reshuffle)}회`);
  console.log(`주 노선별 승률: ${Object.keys(docWins).map((d) => `${d} ${docWins[d]}/${docCount[d]} (${pct(docWins[d], docCount[d])})`).join(' · ')}`);
  const pn = games * players;
  if (detail) {
    const { nodes: all } = webGraph(createGame(seed0, Array.from({ length: players }, (_, i) => ({ name: `${i}`, isAI: true }))).layout);
    const rows = Object.keys(all)
      .filter((id) => id !== CORE_ID)
      .map((id) => [id, (nodeCount[id] ?? 0) / pn] as const)
      .sort((a, b) => a[1] - b[1]);
    console.log(`노드 연구율(낮은 순 12): ${rows.slice(0, 12).map(([id, r]) => `${id} ${(r * 100).toFixed(0)}%`).join(' · ')}`);
    console.log(`위성 발사(판당): ${SATELLITES.map((s) => `${s.name} ${((satCount[s.name] ?? 0) / games).toFixed(2)}`).join(' · ')}`);
  }
  if (jsonPath) {
    writeFileSync(
      jsonPath,
      JSON.stringify({ games, players, seed0, rounds: rounds / games, unfinished, winScore: winScore / games, margin: margin / games, seatWins, docWins, docCount, src, per, picks, eraStarts, eraCapHit, nodeCount, satCount }, null, 1),
    );
  }
}
