/**
 * 시드 기반 결정적 난수 (mulberry32). 엔진은 Math.random 을 쓰지 않는다.
 * 상태에 seed 를 보관하고, 사용할 때마다 새 seed 를 함께 돌려준다.
 */

export interface RngResult {
  value: number; // [0, 1)
  seed: number;
}

export function nextRandom(seed: number): RngResult {
  let t = (seed + 0x6d2b79f5) >>> 0;
  let x = Math.imul(t ^ (t >>> 15), 1 | t);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

/** Fisher-Yates. 입력 배열을 변이하지 않고 새 배열과 새 seed 를 돌려준다 */
export function shuffle<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
  const out = items.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.seed;
    const j = Math.floor(r.value * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return { items: out, seed: s };
}
