export interface Rng {
  float(): number; // [0, 1)
  int(maxExclusive: number): number;
  die(sides: number): number; // 1..sides
  shuffle<T>(items: readonly T[]): T[];
}

// mulberry32: 시드 고정 시 재현 가능 (테스트·리플레이용)
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number) => Math.floor(float() * max);
  return {
    float,
    int,
    die: (sides) => int(sides) + 1,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}
