// localStorage (같은 origin 을 쓰는 다른 게임과 겹치지 않게 doubleagent: 접두어). 실패해도 게임은 진행된다.
import { rankings, type GameState } from '../engine'

export const store = {
  get<T>(name: string, fallback: T): T {
    try {
      return (JSON.parse(localStorage.getItem(`doubleagent:${name}`) ?? 'null') as T | null) ?? fallback
    } catch {
      return fallback
    }
  },
  set(name: string, value: unknown): void {
    try {
      if (value === null) localStorage.removeItem(`doubleagent:${name}`)
      else localStorage.setItem(`doubleagent:${name}`, JSON.stringify(value))
    } catch {
      /* 사생활 보호 모드 */
    }
  },
}

/** 이 기기의 전적(옛 화면의 '내 전적'과 같다) */
export interface Stats {
  games: number
  wins: number
  /** 누적 최종 점수(억) */
  total: number
  history: { at: number; score: number; rank: number; agents: number }[]
}

const EMPTY: Stats = { games: 0, wins: 0, total: 0, history: [] }

export function loadStats(): Stats {
  const s = store.get<Partial<Stats> | null>('stats', null)
  if (!s || typeof s.games !== 'number' || typeof s.wins !== 'number' || typeof s.total !== 'number' || !Array.isArray(s.history)) return EMPTY
  return { games: s.games, wins: s.wins, total: s.total, history: s.history.slice(0, 10) }
}

/** 끝난 게임을 그 좌석 기준으로 전적에 남긴다 */
export function recordResult(game: GameState, seat: number): void {
  const me = rankings(game).find((r) => r.agent === seat)
  if (!me) return
  const s = loadStats()
  store.set('stats', {
    games: s.games + 1,
    wins: s.wins + (me.rank === 1 ? 1 : 0),
    total: Math.round((s.total + me.score) * 100) / 100,
    history: [{ at: Date.now(), score: me.score, rank: me.rank, agents: game.agents.length }, ...s.history].slice(0, 10),
  } satisfies Stats)
}
