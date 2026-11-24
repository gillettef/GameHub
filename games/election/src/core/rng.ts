/** [0, 1) 균등 난수 함수. core는 Math.random 대신 이것을 주입받는다 */
export type Rng = () => number;

/** 시드 고정 난수 (테스트·셀프플레이 재현용) */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
