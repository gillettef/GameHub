import type { ProfileName } from '../engine/bot'

/** 좌석(차례 순서) 색과 이름 */
export const COLORS = ['#e2525f', '#3d8fd6', '#3cae74', '#e8b020']
export const NAMES = ['빨강', '파랑', '초록', '노랑']

/** 화면에서 고를 수 있는 봇 성향 */
export const PROFILES: [ProfileName, string][] = [
  ['balanced', '균형'],
  ['greedy', '독주'],
  ['spiteful', '방해'],
]
export const PROFILE_LABEL: Record<string, string> = Object.fromEntries(PROFILES)

/** localStorage(같은 origin 을 쓰는 다른 게임과 겹치지 않게 crease: 접두어) */
export const store = {
  get<T>(name: string, fallback: T): T {
    try {
      return (JSON.parse(localStorage.getItem(`crease:${name}`) ?? 'null') as T | null) ?? fallback
    } catch {
      return fallback
    }
  },
  set(name: string, value: unknown): void {
    try {
      localStorage.setItem(`crease:${name}`, JSON.stringify(value))
    } catch {
      /* 사생활 보호 모드 */
    }
  },
}
