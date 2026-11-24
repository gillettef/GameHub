import { CLUBS, EVENTS, GOALS, PLAYERS, goalResults, isDemand } from '../../core';
import type { EventKey } from '../../core';
import type { Session } from '../../store/storage';
import { clubCard, demandCard, eventCard, goalCard, playerCard } from '../cards';
import { esc } from '../view';

export type ZoomKind = 'player' | 'club' | 'event' | 'demand' | 'goal';
export interface Zoom {
  kind: ZoomKind;
  id: string;
}

/** data-arg "player:12" → Zoom (잘못된 값이면 null) */
export function parseZoom(arg: string): Zoom | null {
  const [kind, id = ''] = arg.split(':');
  switch (kind) {
    case 'player':
      return PLAYERS[Number(id)] ? { kind, id } : null;
    case 'club':
      return CLUBS[Number(id)] ? { kind, id } : null;
    case 'event':
      return Object.prototype.hasOwnProperty.call(EVENTS, id) ? { kind, id } : null;
    case 'demand':
      return isDemand(Number(id)) ? { kind, id } : null;
    case 'goal':
      return GOALS[Number(id)] ? { kind, id } : null;
    default:
      return null;
  }
}

/** 확대 카드 시트. s = 지금 보고 있는 사람의 게임 (목표 카드·손패는 그 사람 것만) */
export function zoomSheet(z: Zoom, s: Session | null): string {
  const g = s?.game;
  const me = s?.turn;
  let title = '';
  let body = '';
  switch (z.kind) {
    case 'player':
      title = PLAYERS[Number(z.id)]!.name;
      body = playerCard(Number(z.id), 'full');
      break;
    case 'club':
      title = CLUBS[Number(z.id)]!.name;
      body = clubCard(Number(z.id), 'full', { g });
      break;
    case 'event':
      title = EVENTS[z.id as EventKey].name;
      body = eventCard(z.id as EventKey, 'full', g);
      break;
    case 'demand': {
      const d = Number(z.id) as 1 | 2 | 3 | 4;
      title = '요구 수수료 카드';
      body = demandCard(d, 'full', g && me !== undefined ? g.agents[me]!.hand.filter((x) => x === d).length : undefined);
      break;
    }
    case 'goal': {
      const id = Number(z.id);
      // 진척은 내 카드이거나 게임이 끝나 공개된 카드일 때만
      const owner = g ? g.agents.findIndex((a) => a.goals.includes(id)) : -1;
      const shown = g && owner >= 0 && (owner === me || g.phase === 'done');
      title = '목표 카드';
      body = goalCard(id, 'full', shown ? goalResults(g, owner).find((r) => r.goal === id)!.progress : undefined);
      break;
    }
  }
  return `<div class="sheet-bg" data-act="zoom-close"></div>
  <div class="sheet zoom" role="dialog" aria-modal="true" aria-label="${esc(title)} 카드">
    <div class="sheet-h"><h3>${esc(title)}</h3><button class="icon" data-act="zoom-close" aria-label="닫기">✕</button></div>
    <div class="sheet-b">${body}</div>
  </div>`;
}
