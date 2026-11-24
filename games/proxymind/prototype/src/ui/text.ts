// 사건·개입을 한국어 문장으로 (용어는 docs/glossary.md)
import { DIR_NAMES, TILES, cellName } from '../core/data';
import type { GameEvent, GameState, Intervention } from '../core/types';

export const COLORS = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc'];
export const COLOR_NAMES = ['빨강', '파랑', '초록', '노랑', '보라'];

export function ivText(iv: Intervention): string {
  switch (iv.k) {
    case 'none':
      return '개입 안 함';
    case 'turn':
      return iv.dir === 'L' ? '회전(좌회전)' : '회전(우회전)';
    case 'block':
      return `차단(슬롯 ${iv.slot + 1})`;
    case 'thrust':
      return '추진(1칸 전진)';
  }
}

const who = (g: GameState, p: number) => `<b style="color:${COLORS[p]}">${escapeHtml(g.players[p]!.name)}</b>`;

/** 로그 한 줄. null 이면 표시하지 않는다 */
export function eventText(g: GameState, e: GameEvent): string | null {
  switch (e.t) {
    case 'round':
      return `<span class="lg-round">— ${e.round}라운드 · 선 플레이어 ${who(g, e.first)} —</span>`;
    case 'reveal':
      return '규칙 타일을 모두 앞면으로 뒤집었다.';
    case 'turnStart':
      return null;
    case 'intervene':
      return `${who(g, e.p)} 개입: ${ivText(e.iv)}`;
    case 'spentToDp':
      return `쓴 에너지 2개 → ${who(g, e.designer)} 설계자 점수 +1`;
    case 'trigger':
      return `${who(g, e.p)} 로봇 슬롯 ${e.slot + 1} 발동: <i>${TILES[g.tiles[e.tile]!]!.text}</i>`;
    case 'default':
      return `${who(g, e.p)} 로봇: 발동한 규칙 없음 → 기본 행동 1칸 전진`;
    case 'move':
      return null;
    case 'face':
      return null;
    case 'bump':
      return `${who(g, e.p)} 로봇 충돌!${e.byRule ? '' : ' (추진 중 — 점수 없음)'}`;
    case 'core':
      return `${who(g, e.p)} 코어 획득 (${cellName(e.at)})`;
    case 'dp':
      return `충돌 → 설계자 ${who(g, e.designer)} 설계자 점수 +1`;
    case 'refill':
      return `코어 보충: ${e.at.map(cellName).join(', ')}`;
    case 'end':
      return '<span class="lg-round">— 게임 종료 —</span>';
  }
}

export const dirName = (d: number) => DIR_NAMES[d]!;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
