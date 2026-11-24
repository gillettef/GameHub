/**
 * 시드 기반 난수 (mulberry32).
 * 상태는 32비트 정수 하나라서 게임 상태에 그대로 JSON으로 저장할 수 있다.
 * 모든 함수는 순수 함수이고, 새 RNG 상태를 함께 돌려준다.
 */

export interface RngState {
  s: number
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 }
}

/** [0, 1) 실수 */
export function nextFloat(rng: RngState): [number, RngState] {
  const s = (rng.s + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, { s }]
}

/** [0, n) 정수 */
export function nextInt(rng: RngState, n: number): [number, RngState] {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`nextInt: n은 양의 정수여야 합니다 (${n})`)
  const [f, next] = nextFloat(rng)
  return [Math.floor(f * n), next]
}

/** 배열에서 무작위 원소 하나를 꺼낸다. 원본 배열은 바꾸지 않는다. */
export function drawOne<T>(rng: RngState, items: readonly T[]): [T, T[], RngState] {
  if (items.length === 0) throw new Error('drawOne: 빈 배열에서 뽑을 수 없습니다.')
  const [i, next] = nextInt(rng, items.length)
  const rest = items.slice()
  const [picked] = rest.splice(i, 1)
  return [picked as T, rest, next]
}

/** Fisher–Yates 셔플. 새 배열을 돌려준다. */
export function shuffle<T>(rng: RngState, items: readonly T[]): [T[], RngState] {
  const out = items.slice()
  let r = rng
  for (let i = out.length - 1; i > 0; i--) {
    let j: number
    ;[j, r] = nextInt(r, i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return [out, r]
}
