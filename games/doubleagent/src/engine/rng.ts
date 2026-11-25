/** 시드 기반 난수 (mulberry32). 상태는 숫자 하나라 GameState에 그대로 저장할 수 있다. */
export interface Rng {
  next(): number;
  int(n: number): number;
  shuffle<T>(items: readonly T[]): T[];
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
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    shuffle<T>(items: readonly T[]) {
      const a = [...items];
      for (let i = a.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    },
    get state() {
      return s;
    },
  };
}
