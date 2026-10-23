/**
 * 게임 세션: 설정 + 자리(사람/봇) + 행동 기록.
 * 엔진이 결정적이므로 상태는 저장하지 않고 행동 기록을 다시 적용해 만든다 (리플레이·온라인 동기화 겸용).
 */
import { applyAction, createGame, type Action, type GameConfig, type GameState } from '../engine'

export type SeatKind = 'human' | 'bot'

export interface Seat {
  name: string
  kind: SeatKind
}

export interface Session {
  /** 저장 형식 버전 */
  v: 1
  id: string
  createdAt: number
  config: GameConfig
  seats: Seat[]
  actions: Action[]
  /** 온라인 방 코드 (온라인 게임일 때만) */
  room?: string
  /** 온라인 게임에서 이 기기가 맡은 자리 */
  localSeats?: number[]
}

export function newSession(config: GameConfig, seats: Seat[], id: string, createdAt: number): Session {
  return { v: 1, id, createdAt, config, seats, actions: [] }
}

/** 행동 기록을 처음부터 다시 적용한다. upTo로 중간 상태(리플레이)를 만들 수 있다 */
export function replay(session: Pick<Session, 'config' | 'actions'>, upTo = session.actions.length): GameState {
  let state = createGame(session.config)
  for (const action of session.actions.slice(0, upTo)) state = applyAction(state, action)
  return state
}

const SAVE_KEY = 'tesseract.current'
const HISTORY_KEY = 'tesseract.history'
const HISTORY_LIMIT = 30

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 저장 없이 진행
  }
}

/** 진행 중인 게임 (이어 하기용) */
export function loadCurrent(): Session | null {
  const s = read<Session>(SAVE_KEY)
  return s && s.v === 1 ? s : null
}

export function saveCurrent(session: Session | null): void {
  if (session === null) {
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {
      // 무시
    }
    return
  }
  write(SAVE_KEY, session)
}

/** 끝난 게임 기록 (리플레이·통계용). 최신이 앞 */
export function loadHistory(): Session[] {
  return (read<Session[]>(HISTORY_KEY) ?? []).filter((s) => s.v === 1)
}

export function archive(session: Session): void {
  const history = loadHistory().filter((s) => s.id !== session.id)
  write(HISTORY_KEY, [session, ...history].slice(0, HISTORY_LIMIT))
}

export function clearHistory(): void {
  write(HISTORY_KEY, [])
}
