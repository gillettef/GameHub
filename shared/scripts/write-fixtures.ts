/**
 * shared/fixtures/*.json 을 생성한다. TS 엔진 출력이 기준이고,
 * Python(ai/tests) 은 이 파일을 읽어 모델·규칙 일치를 검증한다.
 *
 *   npm run fixtures   (= npx tsx shared/scripts/write-fixtures.ts)
 *
 *  specs.json     종·목표·상수·인원별 규칙 기준표
 *  scenario.json  2·3·4인 판을 시드로 고른 합법 수로 끝까지 둔 기록(용량 때문에 한 줄 JSON).
 *                 각 단계 { action, influence, owners, scores, legal } 와, 8단계마다·마지막에 state(log 제외).
 *                 Python 은 initial 에 action 을 차례로 적용하며 state 가 있는 단계에서 상태 일치를,
 *                 매 단계에서 영향력·땅·점수·심을 수 있는 칸 일치를 확인한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONSTANTS, GOALS, PLAYER_COUNT_RULES, SPECIES } from '../src/data/index.js';
import {
  applyAction,
  autoAction,
  computeInfluence,
  computeOwners,
  computeScores,
  createInitialState,
  createPlayer,
  joinPlayer,
  legalPlantCells,
  nextRandom,
} from '../src/engine/index.js';
import type { Action, GameState, PlayerId } from '../src/types/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'fixtures');
mkdirSync(out, { recursive: true });

const write = (name: string, data: unknown) => {
  writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`wrote fixtures/${name}`);
};

write('specs.json', { species: SPECIES, goals: GOALS, constants: CONSTANTS, playerCountRules: PLAYER_COUNT_RULES });

/** 다양한 수가 나오게 자동 수 대신 시드로 고른 합법 수를 둔다 (방향·씨앗 포함) */
function variedAction(s: GameState, rnd: { seed: number }): Action {
  const pid = s.currentPlayerId as PlayerId;
  const pick = <T>(arr: T[]): T => {
    const r = nextRandom(rnd.seed);
    rnd.seed = r.seed;
    return arr[Math.floor(r.value * arr.length)] as T;
  };
  if (s.phase !== 'playing') return autoAction(s, pid) as Action;
  const me = s.players.find((p) => p.id === pid)!;
  const inf = computeInfluence(s);
  const options = [...new Set(me.hand)].flatMap((sp) => legalPlantCells(s, pid, sp, inf).map((pos) => ({ sp, pos })));
  if (options.length === 0) return autoAction(s, pid) as Action;
  const { sp, pos } = pick(options);
  // 가져오기도 시드로 고른다(마켓이 비었으면 autoAction 이 take 를 빼 둔다)
  const take = s.market.length > 0 ? { take: pick(s.market.map((_, i) => i)) } : {};
  const base0 = autoAction({ ...s, players: s.players.map((p) => (p.id === pid ? { ...p, hand: [sp, ...p.hand.filter((_, i) => i !== p.hand.indexOf(sp))] } : p)) }, pid) as Action;
  const base = { ...base0, ...take } as Action;
  if (base.type !== 'PLANT') return base;
  const action: Action = { ...base, species: sp, pos };
  if (sp === 'kudzu') {
    const dirs = [0, 1, 2, 3, 4, 5] as const;
    for (const d of [pick([...dirs]), ...dirs]) if (!applyAction(s, { ...action, direction: d }).error) return { ...action, direction: d };
  }
  if (sp === 'dandelion') {
    for (let k = 0; k < 6; k++) {
      const seed = { q: pos.q + pick([-2, -1, 0, 1, 2]), r: pos.r + pick([-2, -1, 0, 1, 2]) };
      const a = { ...action, seed };
      if (!applyAction(s, a).error) return a;
    }
  }
  const { direction: _d, ...rest } = action as Extract<Action, { type: 'PLANT' }>;
  return sp === 'kudzu' ? action : rest;
}

function scenario(players: number, seed: number) {
  let s = createInitialState(`fixture-${players}`, seed);
  for (let i = 0; i < players; i++) s = joinPlayer(s, createPlayer(`p${i}`, `P${i}`, i === 0 ? 'human' : 'ai')).state;
  s = applyAction(s, { type: 'READY', playerId: 'p0' }).state; // AI 는 처음부터 준비 완료
  if (s.phase !== 'playing') throw new Error('픽스처: 게임이 시작되지 않았습니다');
  const steps: unknown[] = [];
  const initial = { ...s, log: [] };
  const rnd = { seed: seed * 7 + 1 };
  for (let i = 0; i < 400 && s.phase !== 'finished'; i++) {
    // 3·4인은 중간에 지금 차례인 사람이 기권한다(기권 뒤 선 돌리기·마켓 장수를 TS·Python 이 같게 하는지)
    const action: Action = players >= 3 && i === 20 ? { type: 'SURRENDER', playerId: s.currentPlayerId as PlayerId } : variedAction(s, rnd);
    const r = applyAction(s, action);
    if (r.error) throw new Error(`픽스처: ${r.error}`);
    s = r.state;
    const pid = s.currentPlayerId;
    const me = pid ? s.players.find((p) => p.id === pid) : undefined;
    const checkpoint = i % 8 === 0 || s.phase === 'finished';
    steps.push({
      action,
      state: checkpoint ? { ...s, log: [] } : null,
      influence: s.board ? computeInfluence(s).map((row) => [...row]) : null,
      owners: s.board ? [...computeOwners(s)] : null,
      scores: s.board ? computeScores(s) : null,
      legal:
        s.phase === 'playing' && me
          ? Object.fromEntries([...new Set(me.hand)].map((sp) => [sp, legalPlantCells(s, pid as PlayerId, sp)]))
          : null,
    });
  }
  if (s.phase !== 'finished') throw new Error('픽스처: 판이 끝나지 않았습니다');
  return { players, initial, steps };
}

write('scenario.json', [scenario(2, 101), scenario(3, 202), scenario(4, 303)], true);
