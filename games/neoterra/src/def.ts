/**
 * 공통 방·진행 코드(@gamehub/net)에 네오테라 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
 * 규칙은 src/engine 그대로이고, 여기는 행동 형식 검사·좌석별 가림·봇 연결만 한다.
 *
 * 좌석마다 볼 수 있는 것만 보낸다(view = 엔진의 maskFor, 옛 서버가 보내던 것과 같다):
 * 시드·난수 상태, 덱 순서, 그 좌석 시야(위성) 밖의 퀘스트 트랙 뒷면 칸, 공통 종료 퀘스트, 남의 손패, 남의 비공개 기록.
 */
import { RuleError, type GameDef } from '@gamehub/net'
import { chooseAction, fallbackAction } from './engine/ai'
import { MAX_PLAYERS, MIN_PLAYERS, QUEST_ROW_SIZE, SAT_MARKET } from './engine/data/constants'
import { maskFor } from './engine/mask'
import { createGame } from './engine/rules/setup'
import { applyAction } from './engine/rules/turn'
import {
  BUILDING_KINDS,
  CHARTER_FIELDS,
  UNIT_KINDS,
  type Action,
  type BuildingKind,
  type CharterField,
  type GameState,
  type RaidEffect,
  type UnitKind,
} from './engine/types'

export interface Table {
  game: GameState
  /**
   * 끝에서부터 되돌릴 수 있는 사람의 행동 수(한 기기 대전의 되돌리기만 쓴다).
   * 숨은 정보가 드러난 행동(덱에서 뽑기·뒷면 공개·난수 판정·시야 변화·상대와의 판정)이나 봇의 행동이 끼면 0 이 된다
   */
  undo: number
}

export interface View {
  game: GameState
  undo: number
}

/** 되돌리기는 이만큼까지(옛 로컬 대전과 같다) */
export const UNDO_MAX = 30
const RAID_EFFECTS: readonly RaidEffect[] = ['lootProd', 'lootFood', 'stealSci', 'stealEnergy', 'abduct']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
/** 노드 id 는 엔진이 검사한다. 여기서는 터무니없는 입력만 거른다 */
const isNodeId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 40

/** 신뢰할 수 없는 입력 → 행동. 형식만 보고(합법 여부는 엔진), 알려진 필드만 옮겨 담는다. 행동에 좌석 필드가 없어 사칭할 수 없다 */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'pickQuest':
      return isInt(raw.slot, 0, QUEST_ROW_SIZE - 1) ? { type: 'pickQuest', slot: raw.slot } : null
    case 'research':
      return isNodeId(raw.node) ? { type: 'research', node: raw.node } : null
    case 'useSupply':
      return isInt(raw.index, 0, 99) ? { type: 'useSupply', index: raw.index } : null
    case 'build':
      return oneOf<BuildingKind>(BUILDING_KINDS, raw.kind) && isInt(raw.level, 0, 3) ? { type: 'build', kind: raw.kind, level: raw.level } : null
    case 'upgrade':
      return oneOf<BuildingKind>(BUILDING_KINDS, raw.kind) && isInt(raw.from, 0, 3) && isInt(raw.to, 0, 3)
        ? { type: 'upgrade', kind: raw.kind, from: raw.from, to: raw.to }
        : null
    case 'buildUnit':
      return oneOf<UnitKind>(UNIT_KINDS, raw.kind) && isInt(raw.level, 0, 3) ? { type: 'buildUnit', kind: raw.kind, level: raw.level } : null
    case 'upgradeUnit':
      return oneOf<UnitKind>(UNIT_KINDS, raw.kind) && isInt(raw.from, 0, 3) && isInt(raw.to, 0, 3)
        ? { type: 'upgradeUnit', kind: raw.kind, from: raw.from, to: raw.to }
        : null
    case 'disband': {
      if (!isInt(raw.level, 0, 3)) return null
      if (raw.group === 'building' && oneOf<BuildingKind>(BUILDING_KINDS, raw.kind)) return { type: 'disband', group: 'building', kind: raw.kind, level: raw.level }
      if (raw.group === 'unit' && oneOf<UnitKind>(UNIT_KINDS, raw.kind)) return { type: 'disband', group: 'unit', kind: raw.kind, level: raw.level }
      return null
    }
    case 'launch':
      if (!isInt(raw.slot, 0, SAT_MARKET - 1)) return null
      if (raw.replace === undefined) return { type: 'launch', slot: raw.slot }
      return isInt(raw.replace, 0, 1) ? { type: 'launch', slot: raw.slot, replace: raw.replace } : null
    case 'charter':
      return oneOf<CharterField>(CHARTER_FIELDS, raw.field) ? { type: 'charter', field: raw.field } : null
    case 'raid': {
      if (!isInt(raw.card, 0, 99) || !isInt(raw.target, 0, MAX_PLAYERS - 1) || !oneOf(RAID_EFFECTS, raw.effect)) return null
      if (raw.swarm !== undefined && typeof raw.swarm !== 'boolean') return null
      const base = { type: 'raid', card: raw.card, target: raw.target, effect: raw.effect } as const
      return raw.swarm ? { ...base, swarm: true } : base
    }
    case 'declareConflict':
      return isInt(raw.card, 0, 99) && isInt(raw.target, 0, MAX_PLAYERS - 1) ? { type: 'declareConflict', card: raw.card, target: raw.target } : null
    case 'respond':
      return isInt(raw.choice, 0, 99) ? { type: 'respond', choice: raw.choice } : null
    case 'addColonist':
    case 'feast':
    case 'legacyStage':
    case 'endTurn':
      return { type: raw.type }
    default:
      return null
  }
}

/** 지금 결정해야 하는 좌석: 대기 결정이 있으면 그 사람, 아니면 차례인 사람 */
export const actorOf = (g: GameState): number => (g.pending.length ? g.pending[0].player : g.current)

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)

/** 이 행동으로 전에 몰랐던 정보가 드러났는가(옛 로컬 대전의 되돌리기 판단 그대로) */
export function reveals(before: GameState, after: GameState, me: number, a: Action): boolean {
  if (a.type === 'pickQuest' || a.type === 'raid' || a.type === 'declareConflict' || a.type === 'endTurn') return true
  if (before.rngState.some((v, i) => v !== after.rngState[i])) return true
  if (!same(before.questDecks, after.questDecks) || !same(before.satDeck, after.satDeck) || !same(before.patronDecks, after.patronDecks)) return true
  // 시야가 늘어 내게 보이는 퀘스트 트랙 칸이 바뀐 경우(위성 발사 등)
  return !same(maskFor(before, me).questRow, maskFor(after, me).questRow) || !same(before.questOpen, after.questOpen)
}

export const def: GameDef<Table, Action, View> = {
  slug: 'neoterra',
  minSeats: MIN_PLAYERS,
  maxSeats: MAX_PLAYERS,
  setup: ({ seats, seed }) => ({
    game: createGame(seed, seats.map((s) => ({ name: s.name, isAI: s.kind === 'bot' }))),
    undo: 0,
  }),
  parseAction,
  actors: (t) => (t.game.gameOver ? [] : [actorOf(t.game)]),
  apply(t, seat, action, ctx) {
    // 엔진은 입력을 바꾸지 않고 복사본을 돌려준다. 거절이면 상태는 그대로
    const res = applyAction(t.game, seat, action)
    if (res.error) throw new RuleError(res.error)
    const undo = ctx.byBot || reveals(t.game, res.state, seat, action) ? 0 : Math.min(UNDO_MAX, t.undo + 1)
    return { game: res.state, undo }
  },
  view: (t, seat) => ({ game: maskFor(t.game, seat), undo: t.undo }),
  isOver: (t) => t.game.gameOver,
  bot: {
    next: (t, seat) => chooseAction(t.game, seat) ?? { type: 'endTurn' },
    fallback: (t, seat) => fallbackAction(t.game, seat),
    delayMs: 700,
  },
}
