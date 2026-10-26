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
  /** 저장 형식 버전. 3 = 규칙 v0.8(4차원 점수, 사건 카드, 면 배치 30×4). 같은 행동 기록이라도 규칙이 바뀌면 다른 게임이 되므로 옛 기록은 버린다 */
  v: 3
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
  return { v: 3, id, createdAt, config, seats, actions: [] }
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
  return s && s.v === 3 ? s : null
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
  return (read<Session[]>(HISTORY_KEY) ?? []).filter((s) => s.v === 3)
}

export function archive(session: Session): void {
  const history = loadHistory().filter((s) => s.id !== session.id)
  write(HISTORY_KEY, [session, ...history].slice(0, HISTORY_LIMIT))
}

export function clearHistory(): void {
  write(HISTORY_KEY, [])
}

/**
 * 되돌릴 수 있는 행동 종류: 결과가 미리 다 보이는 것. 4라운드 넘기기(roll)와 넘길 수 없는 ⧗의 잔해(scrap)도
 * 주사위를 굴리는 것이 아니라 넘기는 것이라 포함한다(자유 넘기기 포기 pass도). 시장 주사위 다시 굴리기(reroll, rerollHand)는 제외
 */
const UNDOABLE: ReadonlySet<Action['type']> = new Set(['takeSlot', 'place', 'discard', 'roll', 'scrap', 'pass'])

/**
 * 마지막 행동을 되돌릴 수 있는지 (앱 편의 기능, 로컬 게임만. 사용자 결정 2026-10-23).
 * - 주사위를 굴려 나온 결과(시장 채우기, 다시 굴리기)가 끼면 안 된다: 행동 전후로 난수 상태가 같아야 한다
 * - 라운드가 바뀌면 안 된다 (라운드 정산·새 목표 공개를 되돌리지 않는다)
 * - 차례가 넘어가도 다음 사람이 아직 아무것도 하지 않았으면 된다: 마지막 행동이 그대로 이 행동일 때만 부르므로
 *   다음 사람이 두는 순간 되돌릴 수 없게 된다
 * @param before 마지막 행동 직전 상태, after 마지막 행동 뒤 상태
 */
export function canUndo(before: GameState | null, after: GameState, action: Action | undefined): boolean {
  if (!before || !action || !UNDOABLE.has(action.type)) return false
  if (after.phase.kind !== 'round' || before.phase.kind !== 'round' || after.phase.round !== before.phase.round) return false
  return after.rng.s === before.rng.s
}
