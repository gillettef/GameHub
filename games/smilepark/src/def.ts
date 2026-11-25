/**
 * 공통 방·진행 코드(@gamehub/net)에 스마일 파크 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
 *
 * 좌석 번호 = 엔진의 플레이어 번호. 봇 자리는 엔진의 AI 플레이어(isAI)로, 옛 진행과 같이 엔진이 그 자리에서 바로 둔다
 * (그래서 봇 자리는 actors 에 나오지 않는다). 사람 자리는 엔진의 사람 플레이어.
 * 사람이 나가거나 끊겨 공통 코드가 대신 두면(대리) def.bot 이 엔진의 botAction(균형 성향 AI 와 같은 판단)을 낸다.
 * 모든 자리가 봇이면(봇끼리 관전) 0번 자리를 엔진의 사람 플레이어로 두고 def.bot 이 진행을 맡는다 — 한 번에 끝나지 않고 지켜볼 수 있게.
 *
 * 숨은 정보(view 가 가린다): 난수 상태, 시설·관객·운영카드 덱 순서(구성은 공개 정보라 정렬해 둔다),
 * 공개 전 남의 홍보 입찰액(낸 사람만 bidDone), 운영 결과 전 남의 입장료·배치. 끝나면 모두 공개.
 */
import { RuleError, type GameDef } from '@gamehub/net'
import { CFG, botAction, fallbackAction, newGame, play, type Action } from './engine/engine'
import { STAFF_KEYS, type GameState, type StaffKey } from './engine/types'

export type { Action }

export interface View {
  /** 그 좌석이 봐도 되는 게임 */
  game: GameState
  /** 내 좌석. 관전이면 null */
  me: number | null
  /** 홍보 입찰을 낸 좌석(입찰 단계에서만 뜻이 있다) */
  bidDone: boolean[]
}

/** 봇 자리 이름(옛 화면과 같다) */
export const AI_NAMES = ['미니', '코코', '루루', '팝콘', '봉봉'].map((n) => `${n} 파크`)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** 신뢰할 수 없는 입력 → 행동. 형식만 보고 필요한 키만 새 객체로 옮긴다(합법 여부는 엔진) */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'buy':
      return isInt(raw.cardId, 1, 999) && isInt(raw.slot, 0, CFG.slots - 1) ? { type: 'buy', cardId: raw.cardId, slot: raw.slot } : null
    case 'bid':
      return isInt(raw.amount, 0, 9999) ? { type: 'bid', amount: raw.amount } : null
    case 'pickGroup':
      return isInt(raw.groupId, 1, 999) ? { type: 'pickGroup', groupId: raw.groupId } : null
    case 'setFee':
      return isInt(raw.fee, 0, CFG.maxFee) ? { type: 'setFee', fee: raw.fee } : null
    case 'place':
      if (!isInt(raw.index, 0, 63)) return null
      if (raw.slot !== null && !isInt(raw.slot, 0, CFG.slots - 1)) return null
      return { type: 'place', index: raw.index, slot: raw.slot }
    case 'repair':
      return isInt(raw.slot, 0, CFG.slots - 1) ? { type: 'repair', slot: raw.slot } : null
    case 'hire':
      return typeof raw.staff === 'string' && STAFF_KEYS.includes(raw.staff as StaffKey) ? { type: 'hire', staff: raw.staff as StaffKey } : null
    case 'pass':
    case 'donePicking':
    case 'confirmFee':
    case 'autoPlace':
    case 'clearPlace':
    case 'confirmPlace':
    case 'continue':
    case 'clean':
    case 'endManage':
      return { type: raw.type }
    default:
      return null
  }
}

const humansOf = (s: GameState) => s.players.filter((p) => !p.isAI).map((p) => p.id)

/** 지금 행동할 좌석(엔진의 사람 플레이어 중) */
export function actorsOf(s: GameState): number[] {
  const humans = humansOf(s)
  switch (s.phase) {
    case 'construct':
      return humans.includes(s.turn) && !s.passed[s.turn] ? [s.turn] : []
    case 'promote':
      if (s.step === 'bid') return humans.filter((i) => s.players[i]!.bid === null)
      return humans.includes(s.pickTurn) && !s.pickDone[s.pickTurn] ? [s.pickTurn] : []
    case 'operate':
      if (s.step === 'result') return humans.filter((i) => !s.ready[i])
      return humans.filter((i) => s.opStep[i] !== 'done')
    case 'manage':
      return humans.filter((i) => !s.ready[i])
    default:
      return []
  }
}

/** 그 좌석에 보여도 되는 상태. 끝난 게임은 모두 공개한다 */
export function redact(s: GameState, seat: number | null): GameState {
  if (s.phase === 'gameOver') return s
  const bidding = s.phase === 'promote' && s.step === 'bid'
  const operating = s.phase === 'operate' && s.step !== 'result'
  return {
    ...s,
    rng: 0,
    notice: null,
    facilityDeck: [...s.facilityDeck].sort((a, b) => a - b),
    groupDeck: [...s.groupDeck].sort((a, b) => a - b),
    eventDeck: [...s.eventDeck].sort((a, b) => a - b),
    players: s.players.map((p) => {
      if (p.id === seat) return p
      return {
        ...p,
        ...(bidding ? { bid: null } : {}),
        ...(operating ? { fee: 0, place: p.place.map(() => null) } : {}),
      }
    }),
  }
}

export function toView(s: GameState, seat: number | null): View {
  const me = seat !== null && seat >= 0 && seat < s.players.length ? seat : null
  return { game: redact(s, me), me, bidDone: s.players.map((p) => p.bid !== null) }
}

export const def: GameDef<GameState, Action, View> = {
  slug: 'smilepark',
  minSeats: CFG.minPlayers,
  maxSeats: CFG.maxPlayers,
  setup({ seats, seed }) {
    const anyHuman = seats.some((s) => s.kind === 'human')
    let k = 0
    return newGame({
      seed,
      seats: seats.map((s, i) => {
        // 봇끼리 판: 0번 자리는 엔진의 사람 플레이어로 두고 def.bot 이 둔다(지켜볼 수 있게)
        const driver = !anyHuman && i === 0
        if (s.kind === 'human') return { ai: false, name: s.name }
        return { ai: !driver, name: AI_NAMES[k++] ?? `봇 ${i + 1}` }
      }),
    })
  },
  parseAction,
  actors: actorsOf,
  apply(s, seat, action) {
    const r = play(s, seat, action)
    if (r.error) throw new RuleError(r.error)
    return r.state
  },
  view: toView,
  isOver: (s) => s.phase === 'gameOver',
  bot: {
    next: (s, seat) => botAction(s, seat),
    fallback: (s, seat) => fallbackAction(s, seat),
    delayMs: 600,
  },
}
