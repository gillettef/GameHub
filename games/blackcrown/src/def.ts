import { RuleError, type GameDef } from '@gamehub/net'
import { CLASS_IDS, ITEMS, RITUALS, type ClassId, type ItemId, type RitualId } from './engine/data'
import { SUITS, type Suit } from './engine/hands'
import { IllegalAction, actors, apply, createGame, view, type Action, type State, type View } from './engine/game'
import { botAction, botFallback } from './engine/bot'

const isInt = (v: unknown): v is number => Number.isInteger(v)
const intList = (v: unknown): number[] | null => (Array.isArray(v) && v.length <= 7 && v.every(isInt) ? (v as number[]) : null)

/** 신뢰할 수 없는 입력 → 행동(형식만 본다. 합법 여부는 apply) */
export function parseAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  switch (r.type) {
    case 'pickClass':
      return CLASS_IDS.includes(r.cls as ClassId) ? { type: 'pickClass', cls: r.cls as ClassId } : null
    case 'move':
      return isInt(r.to) ? { type: 'move', to: r.to } : null
    case 'attack': {
      const cards = intList(r.cards)
      return isInt(r.target) && cards ? { type: 'attack', target: r.target, cards } : null
    }
    case 'assist':
    case 'smite': {
      const cards = intList(r.cards)
      return cards ? { type: r.type, cards } : null
    }
    case 'buy':
      return typeof r.item === 'string' && r.item in ITEMS ? { type: 'buy', item: r.item as ItemId } : null
    case 'use':
      return typeof r.item === 'string' && r.item in ITEMS ? { type: 'use', item: r.item as ItemId } : null
    case 'forge': {
      if (!isInt(r.card) || (r.mode !== 'rank' && r.mode !== 'suit')) return null
      const suit = SUITS.includes(r.suit as Suit) ? (r.suit as Suit) : undefined
      return { type: 'forge', card: r.card, mode: r.mode, ...(suit ? { suit } : {}) }
    }
    case 'trade':
      return isInt(r.to) && isInt(r.card) ? { type: 'trade', to: r.to, card: r.card } : null
    case 'tradeReply':
      return r.card === null || isInt(r.card) ? { type: 'tradeReply', card: r.card as number | null } : null
    case 'skill':
      return isInt(r.target) ? { type: 'skill', target: r.target } : { type: 'skill' }
    case 'guard':
      return typeof r.on === 'boolean' ? { type: 'guard', on: r.on } : null
    case 'ritual':
      return typeof r.ritual === 'string' && r.ritual in RITUALS ? { type: 'ritual', ritual: r.ritual as RitualId } : null
    case 'push':
      if (!isInt(r.target)) return null
      return r.to === undefined ? { type: 'push', target: r.target } : isInt(r.to) ? { type: 'push', target: r.target, to: r.to } : null
    case 'choose':
      return isInt(r.option) ? { type: 'choose', option: r.option } : null
    case 'pass':
    case 'draw':
    case 'reroll':
    case 'rest':
    case 'pray':
    case 'open':
    case 'purify':
    case 'twist':
    case 'end':
      return { type: r.type }
    default:
      return null
  }
}

export const def: GameDef<State, Action, View> = {
  slug: 'blackcrown',
  minSeats: 3,
  maxSeats: 5,
  setup: ({ seats, seed }) => createGame(seats.length, seed),
  parseAction,
  actors,
  apply(s, seat, action, ctx) {
    try {
      return apply(s, seat, action, { log: (t, k) => ctx.log(t, k), name: (i) => ctx.name(i) })
    } catch (e) {
      if (e instanceof IllegalAction) throw new RuleError(e.message)
      throw e
    }
  },
  view,
  isOver: (s) => s.phase === 'over',
  bot: {
    next: (s, seat) => botAction(s, seat, 1),
    fallback: botFallback,
    delayMs: 600,
  },
}
