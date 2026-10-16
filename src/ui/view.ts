import { CLUBS, EVENTS, INVALID_TEXT, club, clubMarks, currentEvent, player, upcomingEvent } from '../core';
import type { AgentKind, AgentState, AiLevel, Demand, GameState, Offer, RoundEntry, RoundResult } from '../core';
import type { Profile, Session } from '../store/storage';

export interface Seat {
  name: string;
  kind: AgentKind;
  level?: AiLevel;
}

/** 제안 작성 중 상태 */
export interface Draft {
  key: string;
  playerId: number | null;
  clubId: number | null;
  demand: Demand;
}

/** 지목 작성 중 상태: 다른 에이전트 → 구단 */
export interface GuessDraft {
  key: string;
  picks: Record<number, number>;
}

export const draftOffer = (d: Draft): Offer | null =>
  d.playerId !== null && d.clubId !== null ? { playerId: d.playerId, clubId: d.clubId, demand: d.demand } : null;

export interface UiState {
  profile: Profile | null;
  session: Session | null;
  view: 'home' | 'setup' | 'game';
  seats: Seat[];
  draft: Draft | null;
  guess: GuessDraft | null;
  rulesOpen: boolean;
  renaming: boolean;
  error: string;
}

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const LEVEL_TEXT: Record<AiLevel, string> = { easy: '쉬움', normal: '보통' };

export const money = (x: number): string => `${x}억`;

export const agentName = (a: AgentState): string => esc(a.name) + (a.kind === 'ai' ? ' <span class="ai">AI</span>' : '');

/** 에이전트 색 (실물에서는 큐브 색) */
export const AGENT_COLORS = ['#f5c86b', '#68d6b0', '#8fb7ff', '#ff9aa4'];
export const dot = (i: number): string => `<i class="dot" style="--c:${AGENT_COLORS[i] ?? '#999'}" aria-hidden="true"></i>`;

export function header(right = ''): string {
  return `<header class="top">
    <div class="brand"><span class="eb">TRANSFER WINDOW</span><b>⚽ 더블 에이전트</b></div>
    <div class="top-r">${right}<button class="icon" data-act="rules" aria-label="게임 규칙">?</button></div>
  </header>`;
}

export function eventBanner(g: GameState): string {
  const e = EVENTS[currentEvent(g)];
  const nk = upcomingEvent(g);
  const forecast = nk ? `<p class="next">다음 라운드 예고: ${EVENTS[nk].icon} ${EVENTS[nk].name} — ${EVENTS[nk].desc}</p>` : '';
  return `<div class="event"><span class="ev-ic">${e.icon}</span><div><b>${e.name}</b><p>${e.desc}</p>${forecast}</div></div>`;
}

/** 점수판: 공개 수수료와 남은 요구 수수료 카드 (카드는 공개 정보) */
export function scoreboard(g: GameState, me = -1): string {
  return `<div class="scores" style="--n:${g.agents.length}">${g.agents
    .map(
      (a, i) =>
        `<div class="sc ${i === me ? 'me' : ''}"><span class="nm">${dot(i)}${esc(a.name)}</span><b>${money(a.score)}</b><small>${a.deals}건 · 손 ${a.hand.join('·')}</small></div>`,
    )
    .join('')}</div>`;
}

/** 구단별 공개 기록: 누가 몇 번 이 구단으로 제안했는가 (색 점) */
export function marksOf(g: GameState, clubId: number): string {
  const marks = clubMarks(g);
  return g.agents.map((_, i) => dot(i).repeat(marks[i]![clubId] ?? 0)).join('');
}

export const offerText = (o: Offer): string => `${esc(player(o.playerId).name)} → ${esc(club(o.clubId).name)} · 요구 ${o.demand}억`;

export function entryCard(g: GameState, e: RoundEntry): string {
  const a = g.agents[e.agent]!;
  let badge = '';
  let body = '';
  switch (e.status) {
    case 'won':
      badge = `<span class="badge ok">계약 성공 +${money(e.fee!)}</span>`;
      body = `${offerText(e.offer!)} · 매력도 ${e.attract}`;
      break;
    case 'lost':
      badge = `<span class="badge no">${e.tied ? '동률 상쇄' : '영입전 패배'}</span>`;
      body = e.tied
        ? `${offerText(e.offer!)} · 매력도 ${e.attract} (같은 매력도끼리 상쇄${e.winner !== undefined ? ` → ${esc(g.agents[e.winner]!.name)} 계약` : ''})`
        : `${offerText(e.offer!)} · 매력도 ${e.attract} (승자 ${esc(g.agents[e.winner!]!.name)} ${e.winnerAttract})`;
      break;
    case 'invalid':
      badge = `<span class="badge no">무효 · ${INVALID_TEXT[e.reason!]}</span>`;
      body = offerText(e.offer!);
      break;
    case 'pass':
      badge = '<span class="badge">패스</span>';
      break;
  }
  return `<div class="entry ${e.status}"><div class="entry-h"><b>${dot(e.agent)}${agentName(a)}</b>${badge}</div>${body ? `<p>${body}</p>` : ''}</div>`;
}

export const clubById = (id: number) => CLUBS[id]!;

export const roundEntries = (g: GameState, r: RoundResult): string => r.entries.map((e) => entryCard(g, e)).join('');
