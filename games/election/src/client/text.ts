// 화면 문구. 플레이어에게 보이는 용어는 CLAUDE.md "화면 용어" 표를 따른다
import { CAP, HOLE_LABELS, HOLE_NAMES, MAX_PLACE_PER_TURN, PLAYER_NAMES } from '../engine/constants'
import { nextStop, score, winner } from '../engine/rules'
import type { GameState } from '../engine/types'

export const TOTAL_SEATS = CAP.reduce((a, b) => a + b, 0)
export const holeLabel = (i: number) => `${HOLE_LABELS[i]} ${HOLE_NAMES[i]}`

/** 게임이 끝났을 때의 한 줄 */
export function overText(s: GameState): { title: string; detail: string } {
  const t = score(s)
  const w = winner(s)
  const tie = t[0] === t[1] ? ` · 동점이라 남은 예비군 비교 (${s.reserves[0]} : ${s.reserves[1]})` : ''
  return { title: w === null ? '선거일 · 무승부' : `선거일 · ${PLAYER_NAMES[w]} 후보 당선`, detail: `(${t[0]} : ${t[1]})${tie}` }
}

/** 내 차례일 때 할 일 (옛 statusText 의 사람 차례 부분) */
export function myTurnText(s: GameState): { title: string; detail: string } {
  switch (s.phase) {
    case 'setup':
      return { title: '사전 배치', detail: `지지자를 놓을 권역을 고르세요 · 남은 ${s.setupLeft[s.current]}명` }
    case 'place':
      return {
        title: s.placedThisTurn >= 1 ? '한 명 더 놓거나 투입 완료' : '예비군 투입',
        detail: s.placedThisTurn >= 1 || MAX_PLACE_PER_TURN === 1 ? '예비군을 놓을 권역을 고르세요' : `예비군을 놓을 권역을 고르세요 (최대 ${MAX_PLACE_PER_TURN}명)`,
      }
    case 'pick':
      return { title: '버스 출발', detail: '버스를 출발시킬 권역을 고르세요' }
    case 'sow': {
      const n = nextStop(s)
      return { title: `다음 정차 ${n < 0 ? '없음' : holeLabel(n)}`, detail: '내릴 지지자를 고르세요' }
    }
    case 'over':
      return overText(s)
  }
}

/** 남의 차례일 때 그 사람이 하는 일 */
export function otherTurnText(s: GameState, who: string): string {
  if (s.phase === 'sow') return `${who} 버스가 유세 중…`
  if (s.phase === 'setup') return `${who} 사전 배치하는 중…`
  return `${who} 수를 고르는 중…`
}
