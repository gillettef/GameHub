/**
 * test/fixtures/*.json 을 생성한다. TS 엔진 출력이 기준이다.
 * specs.json 은 카드 SVG 문구(scripts/card-text.mjs)가, scenario.json 은 AI 테스트(server/src/ai/search.test.ts)가 읽는다.
 * (2026-11-25 까지는 Python AI 가 이 기록으로 TS·Python 규칙 일치를 검증했다. 기록 형식은 그때 그대로다)
 *
 *   npm run fixtures   (= npx tsx tools/write-fixtures.ts)
 *
 *  specs.json     종·목표·상수·인원별 규칙 기준표
 *  scenario.json  2·3·4인 판을 이번 판 식물 공개 단계(initial)부터 시드로 고른 합법 수(일과 고르기·가져오기·심기·담 넘기·명당 부르기, v7)로 끝까지 둔 기록.
 *                 각 단계 { action, rootSeat, rootCount, owners, scores, legal(심기 단계만), auto(자동 수) } 와, 8단계마다·마지막에 state(log 제외).
 *                 AI 테스트는 initial 에 action 을 차례로 적용해 진행 중 상태(기권·마켓 빈 라운드 포함)를 얻는다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONSTANTS, FLOWER_SPECIES, FOREST_SPECIES, GOALS, HAND_MAX, PLAYER_COUNT_RULES, SPECIES } from '../src/engine/data/index.js';
import {
  applyAction,
  autoAction,
  computeOwners,
  computeScores,
  createInitialState,
  createPlayer,
  distinctRotations,
  joinPlayer,
  legalCallCells,
  legalMoveSources,
  legalMoveTargets,
  legalPlantCells,
  legalSeedCells,
  moveMaxCount,
  moveRoots,
  nextRandom,
  remainingChores,
} from '../src/engine/index.js';
import type { Action, GameState, PlayerId } from '../src/engine/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'test', 'fixtures');
mkdirSync(out, { recursive: true });

const write = (name: string, data: unknown) => {
  writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`wrote test/fixtures/${name}`);
};

write('specs.json', { species: SPECIES, goals: GOALS, constants: CONSTANTS, playerCountRules: PLAYER_COUNT_RULES, flowerSpecies: FLOWER_SPECIES, forestSpecies: FOREST_SPECIES });

/** 다양한 수가 나오게 자동 수 대신 시드로 고른 합법 수를 둔다 (일과·가져오기 자리·회전·씨앗·담 넘기·부르기 포함) */
function variedAction(s: GameState, rnd: { seed: number }): Action {
  const pick = <T>(arr: T[]): T => {
    const r = nextRandom(rnd.seed);
    rnd.seed = r.seed;
    return arr[Math.floor(r.value * arr.length)] as T;
  };
  // 이번 판 식물 공개 단계: 아직 확인하지 않은 첫 사람이 확인
  if (s.phase === 'reveal') {
    const p = s.players.find((x) => x.surrenderedOrder === null && !x.isReady)!;
    return autoAction(s, p.id) as Action;
  }
  const pid = s.currentPlayerId as PlayerId;
  if (s.phase !== 'playing') return autoAction(s, pid) as Action;
  const me = s.players.find((p) => p.id === pid)!;
  if (s.stage === 'chore') return { type: 'PICK_CHORE', playerId: pid, chore: pick(remainingChores(s)) };
  if (s.stage === 'take') {
    const peekTurn = s.chores[me.seat] === 'peek';
    const options: (number | 'pile' | 'peek')[] = [...s.market.map((_, i) => i), ...(s.pile.length && !peekTurn ? ['pile' as const] : []), ...(s.peek ? ['peek' as const] : [])];
    return { type: 'TAKE', playerId: pid, take: pick(options) };
  }
  if (s.stage === 'move') {
    const moves: { from: { q: number; r: number }; to: { q: number; r: number }; count: number }[] = [];
    let cur = s;
    const times = pick([1, 2]);
    for (let k = 0; k < times; k++) {
      const sources = legalMoveSources(cur, pid);
      if (!sources.length) break;
      const from = pick(sources);
      const to = pick(legalMoveTargets(cur, from));
      const count = pick([1, 2].filter((n) => n <= moveMaxCount(cur, pid, from)));
      moves.push({ from, to, count });
      cur = { ...cur, ...moveRoots(cur, pid, from, to, count) };
    }
    return { type: 'MOVE', playerId: pid, moves };
  }
  if (s.stage === 'call') {
    const pos = pick(legalCallCells(s, pid));
    const species = s.plants.find((p) => p.pos.q === pos.q && p.pos.r === pos.r)!.species;
    const rotation = pick(distinctRotations(species));
    const canTake = me.hand.length < HAND_MAX && s.market.length > 0;
    return canTake ? { type: 'CALL', playerId: pid, pos, rotation, take: pick(s.market.map((_, i) => i)) } : { type: 'CALL', playerId: pid, pos, rotation };
  }
  const options = [...new Set(me.hand)].flatMap((sp) => legalPlantCells(s, pid, sp).map((pos) => ({ sp, pos })));
  if (options.length === 0) return autoAction(s, pid) as Action;
  const { sp, pos } = pick(options);
  const rotation = pick([0, 1, 2, 3, 4, 5] as const);
  const action: Extract<Action, { type: 'PLANT' }> = { type: 'PLANT', playerId: pid, species: sp, pos, rotation };
  if (sp === 'dandelion') {
    const seeds = legalSeedCells(s, pos);
    if (seeds.length && pick([true, true, false])) return { ...action, seed: pick(seeds) };
  }
  return action;
}

function scenario(players: number, seed: number) {
  let s = createInitialState(`fixture-${players}`, seed);
  for (let i = 0; i < players; i++) s = joinPlayer(s, createPlayer(`p${i}`, `P${i}`, i <= 1 ? 'human' : 'ai')).state;
  // 자리 0·1 은 사람(공개 단계에서 둘 다 확인해야 시작), 나머지 AI 는 처음부터 준비 완료
  for (const pid of ['p0', 'p1']) s = applyAction(s, { type: 'READY', playerId: pid }).state;
  if (s.phase !== 'reveal') throw new Error('픽스처: 이번 판 식물 공개 단계가 아닙니다');
  const steps: unknown[] = [];
  const initial = { ...s, log: [] };
  const rnd = { seed: seed * 7 + 1 };
  let surrendered = false;
  for (let i = 0; i < 800 && s.phase !== 'finished'; i++) {
    // 3인은 가져오기 단계, 4인은 심기 단계에서 지금 차례인 사람이 기권한다(기권 뒤 선·단계 진행을 TS·Python 이 같게 하는지)
    const surrender = s.phase === 'playing' && !surrendered && i >= 20 && ((players === 3 && s.stage === 'take') || (players === 4 && s.stage === 'plant'));
    if (surrender) surrendered = true;
    const action: Action = surrender ? { type: 'SURRENDER', playerId: s.currentPlayerId as PlayerId } : variedAction(s, rnd);
    const r = applyAction(s, action);
    if (r.error) throw new Error(`픽스처: ${r.error}`);
    s = r.state;
    const pid = s.currentPlayerId;
    const me = pid ? s.players.find((p) => p.id === pid) : undefined;
    const checkpoint = i % 8 === 0 || s.phase === 'finished';
    steps.push({
      action,
      state: checkpoint ? { ...s, log: [] } : null,
      rootSeat: s.board ? [...s.rootSeat] : null,
      rootCount: s.board ? [...s.rootCount] : null,
      owners: s.board ? [...computeOwners(s)] : null,
      scores: s.board ? computeScores(s) : null,
      legal:
        s.phase === 'playing' && s.stage === 'plant' && me
          ? Object.fromEntries([...new Set(me.hand)].map((sp) => [sp, legalPlantCells(s, pid as PlayerId, sp)]))
          : null,
      // 지금 차례인 사람의 시간 초과 자동 수 (Python auto_action 과 대조)
      auto: s.phase === 'playing' && pid ? autoAction(s, pid) : null,
    });
  }
  if (s.phase !== 'finished') throw new Error('픽스처: 판이 끝나지 않았습니다');
  return { players, initial, steps };
}

write('scenario.json', [scenario(2, 101), scenario(3, 202), scenario(4, 303)]);
