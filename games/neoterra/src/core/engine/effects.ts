// 즉시 효과·손실 적용: 노선 점수(단계 4 보상), 정착민, 건물 하락
import type { Doctrine, GameState, Instant, Loss, PlayerState } from '../types';
import { BUILDING_KINDS, DOCTRINES } from '../types';
import { BUILDING_NAMES, BUILDING_OUTPUT, DOCTRINE_NAMES, DOCTRINE_STEP, DOCTRINE_MAX_STAGE, LEVEL_NAMES, STAGE4_CULTURE } from '../data/constants';
import { stage } from './derive';
import { gain, log } from './util';

export function addDoctrine(state: GameState, p: PlayerState, d: Doctrine, n: number): void {
  if (!n) return;
  const before = stage(p, d);
  p.doctrine[d] = Math.max(0, p.doctrine[d] + n);
  const after = stage(p, d);
  if (after > before) {
    log(state, p.id, `${DOCTRINE_NAMES[d]} 노선 단계 ${after} 도달`);
    if (after >= DOCTRINE_MAX_STAGE && p.doctrine[d] >= DOCTRINE_STEP * DOCTRINE_MAX_STAGE && !state.stage4Order[d].includes(p.id)) {
      state.stage4Order[d].push(p.id);
      p.res.culture += STAGE4_CULTURE;
      log(state, p.id, `${DOCTRINE_NAMES[d]} 노선 단계 4 보상: 문화 +${STAGE4_CULTURE}`);
    }
  }
}

export function addColonists(p: PlayerState, n: number): number {
  const moved = Math.min(n, p.pool);
  p.pool -= moved;
  p.idle += moved;
  return moved;
}

export function applyInstant(state: GameState, p: PlayerState, e: Instant | undefined): void {
  if (!e) return;
  gain(p.res, e.gain);
  if (e.doctrine) for (const d of DOCTRINES) addDoctrine(state, p, d, e.doctrine[d] ?? 0);
  if (e.colonist) addColonists(p, e.colonist);
}

/** 가장 높은 레벨의 건물 1곳을 1단계 내린다. 내릴 수 없는 최저 레벨이면 철거하고 정착민은 유휴로 */
export function downgradeBuilding(state: GameState, p: PlayerState): boolean {
  for (let lvl = 3; lvl >= 1; lvl--) {
    for (const k of BUILDING_KINDS) {
      if (p.buildings[k][lvl] > 0) {
        p.buildings[k][lvl]--;
        if (BUILDING_OUTPUT[k][lvl - 1] != null) {
          p.buildings[k][lvl - 1]++;
          log(state, p.id, `${BUILDING_NAMES[k]} ${LEVEL_NAMES[lvl]} → ${LEVEL_NAMES[lvl - 1]} 하락`);
        } else {
          p.idle++;
          log(state, p.id, `${BUILDING_NAMES[k]} ${LEVEL_NAMES[lvl]} 파괴`);
        }
        return true;
      }
    }
  }
  return false;
}

/** 정착민 1명을 공급으로 돌려보낸다: 유휴 → 가장 낮은 레벨 건물 순 */
export function loseColonist(state: GameState, p: PlayerState): boolean {
  if (p.idle > 0) {
    p.idle--;
    p.pool++;
    log(state, p.id, '유휴 정착민 1명 이탈');
    return true;
  }
  for (let lvl = 0; lvl <= 3; lvl++) {
    for (const k of BUILDING_KINDS) {
      if (p.buildings[k][lvl] > 0) {
        p.buildings[k][lvl]--;
        p.pool++;
        log(state, p.id, `${BUILDING_NAMES[k]} ${LEVEL_NAMES[lvl]}의 정착민 이탈`);
        return true;
      }
    }
  }
  return false;
}

export function applyLoss(state: GameState, p: PlayerState, loss: Loss | undefined): void {
  if (!loss) return;
  gain(p.res, loss.res, -1);
  for (let i = 0; i < (loss.downgrade ?? 0); i++) downgradeBuilding(state, p);
  for (let i = 0; i < (loss.colonist ?? 0); i++) loseColonist(state, p);
}
