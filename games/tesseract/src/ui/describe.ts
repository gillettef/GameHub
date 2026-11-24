/**
 * 행동 하나를 사람이 읽는 한 줄로 (최근 행동 줄, 리플레이).
 * 주사위 정보는 행동 직전 상태에서 찾는다. 엔진 상태를 읽기만 한다.
 */
import { dieColor, findTop, type Action, type GameState, type RolledDie } from '../engine'
import type { Seat } from '../app/session'
import { colorLabel, faceLabel } from './colors'

const DIRECTION: Record<string, string> = { forward: '앞으로', back: '뒤로', left: '왼쪽으로', right: '오른쪽으로' }

const dieText = (d: RolledDie | undefined) => (d ? `${colorLabel(dieColor(d))} ${faceLabel(d.orientation.top)}` : '주사위')

/** 이 플레이어 보드 꼭대기에서 주사위 찾기 */
function topDie(state: GameState, player: number, dieId: number): RolledDie | undefined {
  const board = state.players[player]?.board
  const cell = board ? findTop(board, dieId) : null
  return cell ? board?.cells[cell.row]?.[cell.col]?.at(-1) : undefined
}

/** @param before 이 행동을 적용하기 직전 상태 (없으면 주사위 정보 없이) */
export function describeAction(action: Action, before: GameState | null, seats: Seat[]): string {
  const name = seats[action.player]?.name ?? `${action.player + 1}번`
  switch (action.type) {
    case 'choosePersonalGoal':
      return `${name}: 개인 목표 선택`
    case 'reroll': {
      const d = before?.market[action.slot]?.find((x) => x.id === action.dieId)
      return `${name}: 시장 ${action.slot + 1}번 칸 ${dieText(d)} 다시 굴림`
    }
    case 'takeSlot': {
      const dice = before?.market[action.slot] ?? []
      return `${name}: 시장 ${action.slot + 1}번 칸 가져옴${dice.length > 0 ? ` (${dice.map(dieText).join(', ')})` : ''}`
    }
    case 'place': {
      const d = before?.turn.hand.find((x) => x.id === action.dieId)
      return `${name}: ${dieText(d)} → ${action.row + 1}행 ${action.col + 1}열`
    }
    case 'rerollHand': {
      const d = before?.turn.hand.find((x) => x.id === action.dieId)
      return `${name}: ${dieText(d)} 다시 굴림 (잔해 1개)`
    }
    case 'discard': {
      const d = before?.turn.hand.find((x) => x.id === action.dieId)
      return `${name}: ${dieText(d)} 잔해로 버림`
    }
    case 'roll': {
      const d = before ? topDie(before, action.player, action.dieId) : undefined
      return `${name}: ${dieText(d)} ${DIRECTION[action.direction]} 넘김`
    }
    case 'scrap': {
      const d = before ? topDie(before, action.player, action.dieId) : undefined
      return `${name}: 넘길 수 없는 ${dieText(d)} 잔해로`
    }
    case 'pass':
      return `${name}: 남은 자유 넘기기 포기`
  }
}
