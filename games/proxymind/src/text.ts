// 사건·개입을 한국어 문장으로(용어는 docs/glossary.md). 서버(기록)와 화면이 함께 쓴다.
import { DIR_NAMES, TILES, cellName } from './engine/data'
import type { GameEvent, GameState, Intervention } from './engine/types'

/** 좌석 색(1번 자리부터, 옛 화면과 같다) */
export const COLORS = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc'] as const
export const COLOR_NAMES = ['빨강', '파랑', '초록', '노랑', '보라'] as const

export function ivText(iv: Intervention): string {
  switch (iv.k) {
    case 'none':
      return '개입 안 함'
    case 'turn':
      return iv.dir === 'L' ? '회전(좌회전)' : '회전(우회전)'
    case 'block':
      return `차단(슬롯 ${iv.slot + 1})`
    case 'thrust':
      return '추진(1칸 전진)'
  }
}

export const dirName = (d: number) => DIR_NAMES[d] ?? ''

/** 기록 한 줄. null 이면 남기지 않는다. who 는 좌석 이름 */
export function eventText(g: GameState, e: GameEvent, who: (p: number) => string): string | null {
  switch (e.t) {
    case 'round':
      return `— ${e.round}라운드 · 선 플레이어 ${who(e.first)} —`
    case 'reveal':
      return '규칙 타일을 모두 앞면으로 뒤집었다.'
    case 'intervene':
      return `${who(e.p)} 개입: ${ivText(e.iv)}`
    case 'spentToDp':
      return `쓴 에너지 2개 → ${who(e.designer)} 설계자 점수 +1`
    case 'trigger':
      return `${who(e.p)} 로봇 슬롯 ${e.slot + 1} 발동: ${TILES[g.tiles[e.tile]!]!.text}`
    case 'default':
      return `${who(e.p)} 로봇: 발동한 규칙 없음 → 기본 행동 1칸 전진`
    case 'bump':
      return `${who(e.p)} 로봇 충돌!${e.byRule ? '' : ' (추진 중 — 점수 없음)'}`
    case 'core':
      return `${who(e.p)} 코어 획득 (${cellName(e.at)})`
    case 'dp':
      return `충돌 → 설계자 ${who(e.designer)} 설계자 점수 +1`
    case 'refill':
      return `코어 보충: ${e.at.map(cellName).join(', ')}`
    case 'end':
      return '— 게임 종료 —'
    case 'turnStart':
    case 'move':
    case 'face':
      return null
  }
}

/** 그 사건이 누구의 일인지(기록 줄의 색 점). 없으면 null */
export function eventSeat(e: GameEvent): number | null {
  switch (e.t) {
    case 'intervene':
    case 'trigger':
    case 'default':
    case 'bump':
    case 'core':
      return e.p
    case 'spentToDp':
    case 'dp':
      return e.designer
    default:
      return null
  }
}
