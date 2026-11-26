/** 시드 난수(mulberry32). 상태 안에 32비트 정수 하나로 들고 다닌다 */
export interface Rng {
  seed: number
}

export function next(r: Rng): number {
  r.seed = (r.seed + 0x6d2b79f5) | 0
  let t = r.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function int(r: Rng, n: number): number {
  return Math.floor(next(r) * n)
}

export function shuffle<T>(r: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(r, i + 1)
    const a = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = a
  }
  return arr
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[int(r, arr.length)] as T
}
