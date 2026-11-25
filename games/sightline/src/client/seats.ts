import { SEAT_INFO, type Crest, type Seat } from '../engine/board'

export const seatLabel = (s: Seat) => `${SEAT_INFO[s].label}쪽`
export const crestName = (c: Crest) => SEAT_INFO[c].crest
export const colorOf = (c: Crest) => SEAT_INFO[c].color

/** 한 기기 봇 이름(좌석 문양에서 딴 것, 옛 서버와 같다) */
export const BOT_NAME: Record<Seat, string> = { N: '봇 로즈', E: '봇 히드라', S: '봇 해바', W: '봇 아이비' }

export const KNOWN_LABEL = { mine: '내 손님', now: '지금 보임', memory: '전에 봄', scout: '정찰로 봄', public: '공개' } as const

/** localStorage(같은 origin 을 쓰는 다른 게임과 겹치지 않게 sightline: 접두어) */
export const store = {
  get<T>(name: string, fallback: T): T {
    try {
      return (JSON.parse(localStorage.getItem(`sightline:${name}`) ?? 'null') as T | null) ?? fallback
    } catch {
      return fallback
    }
  },
  set(name: string, value: unknown): void {
    try {
      if (value === null) localStorage.removeItem(`sightline:${name}`)
      else localStorage.setItem(`sightline:${name}`, JSON.stringify(value))
    } catch {
      /* 사생활 보호 모드 */
    }
  },
}
