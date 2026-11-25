// 화면에서 쓰는 카드·인물 표기와 저장소(옛 화면과 같은 아이콘·색)
import type { Fact, Figure } from '../engine/types'

export const ICON: Record<string, string> = { 성: '🏰', 왕: '👑', 금고: '💰', 경비: '💂', 성문: '🚪' }

export const FIG_COLOR: Record<Figure, string> = {
  하인: '#8a6d4f',
  왕비: '#b0436b',
  대신: '#4b6fa8',
  경비대장: '#4f8a5b',
  '궁정 의사': '#2f8f8f',
  광대: '#c08a1e',
}

export const fact = (f: Fact) => `${ICON[f.subject] ?? ''} ${f.subject} = ${f.state}`

/** 한 기기 봇 이름(옛 혼자 하기와 같다) */
export const BOT_NAMES = ['아그네스', '베르톨트', '세실리아', '도미닉', '엘로이즈', '페르디난트']

/** 봇 속도(한 기기): 한 수 사이 시간(ms), 옛 혼자 하기의 느리게·보통·빠르게 */
export const SPEEDS = [
  { ms: 1200, label: '느리게' },
  { ms: 700, label: '보통' },
  { ms: 250, label: '빠르게' },
] as const

/** localStorage(같은 origin 을 쓰는 다른 게임과 겹치지 않게 retrocause: 접두어) */
export const store = {
  get<T>(name: string, fallback: T): T {
    try {
      return (JSON.parse(localStorage.getItem(`retrocause:${name}`) ?? 'null') as T | null) ?? fallback
    } catch {
      return fallback
    }
  },
  set(name: string, value: unknown): void {
    try {
      if (value === null) localStorage.removeItem(`retrocause:${name}`)
      else localStorage.setItem(`retrocause:${name}`, JSON.stringify(value))
    } catch {
      /* 사생활 보호 모드 */
    }
  },
}
