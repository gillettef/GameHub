import { CLUBS, EVENTS, INVALID_TEXT, TACTICS, club, player, round2 } from '../core';
import type { AgentKind, AgentState, AiLevel, FeeRate, GameState, Offer, RoundEntry, TacticKey } from '../core';
import type { Profile, Session } from '../store/storage';

export interface Seat {
  name: string;
  kind: AgentKind;
  level?: AiLevel;
}

export interface Draft {
  key: string;
  playerId: number | null;
  clubId: number | null;
  salary: number;
  fee: FeeRate;
  tactic: TacticKey | null;
}

export interface UiState {
  profile: Profile | null;
  session: Session | null;
  view: 'home' | 'setup' | 'game';
  seats: Seat[];
  draft: Draft | null;
  rulesOpen: boolean;
  renaming: boolean;
  error: string;
}

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const LEVEL_TEXT: Record<AiLevel, string> = { easy: '쉬움', normal: '보통' };

export const money = (x: number): string => `${round2(x)}억`;

export const agentName = (a: AgentState): string => esc(a.name) + (a.kind === 'ai' ? ' <span class="ai">AI</span>' : '');

export function header(right = ''): string {
  return `<header class="top">
    <div class="brand"><span class="eb">TRANSFER WINDOW</span><b>⚽ 스토브리그</b></div>
    <div class="top-r">${right}<button class="icon" data-act="rules" aria-label="게임 규칙">?</button></div>
  </header>`;
}

export function eventBanner(g: GameState): string {
  const e = EVENTS[g.event];
  return `<div class="event"><span class="ev-ic">${e.icon}</span><div><b>${e.name}</b><p>${e.desc}</p></div></div>`;
}

export function scoreboard(g: GameState, me = -1): string {
  return `<div class="scores" style="--n:${g.agents.length}">${g.agents
    .map(
      (a, i) => `<div class="sc ${i === me ? 'me' : ''}"><span class="nm">${esc(a.name)}</span><b>${money(a.score)}</b><small>${a.deals}건</small></div>`,
    )
    .join('')}</div>`;
}

export const offerText = (o: Offer, salary?: number): string => {
  const t = o.tactic ? ` · ${TACTICS[o.tactic].name}` : '';
  return `${esc(player(o.playerId).name)} → ${esc(club(o.clubId).name)} · 연봉 ${salary ?? o.salary}억 · ${o.fee}%${t}`;
};

export function entryCard(g: GameState, e: RoundEntry): string {
  const a = g.agents[e.agent]!;
  let badge = '';
  let body = '';
  switch (e.status) {
    case 'won':
      badge = `<span class="badge ok">계약 성공 +${money(e.fee!)}</span>`;
      body = `${offerText(e.offer!, e.salary)} · 매력도 ${e.attract}${e.bigDeal ? ' · 💰 빅딜 +0.5억' : ''}`;
      break;
    case 'lost':
      badge = '<span class="badge no">영입전 패배</span>';
      body = `${offerText(e.offer!, e.salary)} · 매력도 ${e.attract} (승자 ${esc(g.agents[e.winner!]!.name)} ${e.winnerAttract})`;
      break;
    case 'invalid':
      badge = `<span class="badge no">무효 · ${INVALID_TEXT[e.reason!]}</span>`;
      body = offerText(e.offer!);
      break;
    case 'pass':
      badge = '<span class="badge">패스</span>';
      break;
    case 'none':
      badge = '<span class="badge">제안 없음</span>';
      break;
  }
  return `<div class="entry ${e.status}"><div class="entry-h"><b>${agentName(a)}</b>${badge}</div>${body ? `<p>${body}</p>` : ''}</div>`;
}

export const clubById = (id: number) => CLUBS[id]!;
