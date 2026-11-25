/** 시드 기반 난수 (mulberry32). 상태가 숫자 하나라 GameState에 그대로 저장한다. */
export interface Rng {
  next(): number;
  int(n: number): number;
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    get state() {
      return s;
    },
  };
}
