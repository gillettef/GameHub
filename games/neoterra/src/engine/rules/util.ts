// 엔진 공용 도우미: 수정치 합산, 자원 연산, 로그, RNG 진행
import { restoreRng, type Rng } from '../rng';
import type { GameState, Mods, Res } from '../types';
import { RES_KEYS } from '../types';

export function emptyMods(): Mods {
  return {
    health: 0,
    sporeCap: 0,
    might: 0,
    command: 0,
    defense: 0,
    sight: 0,
    researchDiscount: 0,
    trunkDiscount: 0,
    buildingCap: 0,
    unitCap: 0,
    foodUpkeep: 0,
    unitUpgradeDiscount: 0,
    raidBonus: 0,
    income: {},
    buildingBonus: {},
    unitPower: {},
  };
}

export function addMods(into: Mods, m: Partial<Mods> | undefined): Mods {
  if (!m) return into;
  for (const [k, v] of Object.entries(m)) {
    if (k === 'income' || k === 'unitPower' || k === 'buildingBonus') {
      const target = into[k] as Record<string, number>;
      for (const [rk, rv] of Object.entries(v as Record<string, number>)) target[rk] = (target[rk] ?? 0) + rv;
    } else {
      (into as unknown as Record<string, number>)[k] += v as number;
    }
  }
  return into;
}

export function gain(res: Res, delta: Partial<Res> | undefined, sign = 1): void {
  if (!delta) return;
  for (const k of RES_KEYS) {
    const v = delta[k];
    if (v) res[k] = Math.max(0, res[k] + sign * v);
  }
}

export function canPay(res: Res, cost: Partial<Res>): boolean {
  return RES_KEYS.every((k) => res[k] >= (cost[k] ?? 0));
}

/** pub 를 주면 text 는 player 본인만, 다른 사람은 pub 를 본다(mask 가 바꿔 보냄) */
export function log(state: GameState, player: number | null, text: string, pub?: string): void {
  state.log.push(pub === undefined ? { round: state.round, player, text } : { round: state.round, player, text, pub });
}

/** 상태의 시드 RNG 로 작업한 뒤 rngState 를 갱신한다 */
export function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = restoreRng(state.rngState);
  const out = fn(rng);
  state.rngState = rng.state();
  return out;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export function sumLevels(levels: number[]): number {
  return levels.reduce((a, b) => a + b, 0);
}
