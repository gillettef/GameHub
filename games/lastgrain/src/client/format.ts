import type { Kind } from '../engine/rules'

/** 모래병 종류별 모래 색 */
export const SAND: Record<Kind, string> = { scout: '#d9ccb0', warrior: '#e0ac35', giant: '#c8553d' }

export const fmtSec = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}`
export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
