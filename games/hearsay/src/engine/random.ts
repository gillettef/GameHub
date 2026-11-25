// 시드 난수(mulberry32). 상태를 객체의 rng 필드(32비트 정수)에 두어, 상태를 복제하면 난수도 함께 복제된다.

/** holder.rng 를 한 걸음 옮기고 [0, 1) 값을 돌려준다 */
export function nextRandom(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0
  let t = holder.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** 함수형 난수(테스트·설정용) */
export function mulberry32(seed: number): () => number {
  const h = { rng: seed >>> 0 }
  return () => nextRandom(h)
}
