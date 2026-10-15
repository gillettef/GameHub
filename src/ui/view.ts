import { CLUBS, EVENTS, INVALID_TEXT, TACTICS, club, isEvaluation, player, round2, validateOffer } from '../core';
import type { AgentKind, AgentState, AiLevel, Evaluation, FeeRate, GameState, InvalidReason, Offer, RoundEntry, RoundResult, Stage, TacticKey } from '../core';
import type { Profile, Session } from '../store/storage';

export interface Seat {
  name: string;
  kind: AgentKind;
  level?: AiLevel;
}

/** 협상 1건의 작성 중 상태 */
export interface Slot {
  playerId: number | null;
  clubId: number | null;
  salary: number;
  fee: FeeRate;
  tactic: TacticKey | null;
  /** 이 차수 패스 */
  pass: boolean;
}

export interface Draft {
  key: string;
  /** 지금 편집 중인 차수 */
  stage: Stage;
  /** [1차, 2차] */
  slots: [Slot, Slot];
}

export const slotOffer = (sl: Slot): Offer | null =>
  !sl.pass && sl.playerId !== null && sl.clubId !== null
    ? { playerId: sl.playerId, clubId: sl.clubId, salary: sl.salary, fee: sl.fee, tactic: sl.tactic }
    : null;

/** 차수별 판정: pass / incomplete / 평가 결과 또는 무효 사유 */
export type SlotCheck = 'pass' | 'incomplete' | Evaluation | InvalidReason;

export function checkSlots(g: GameState, agent: number, d: Draft): [SlotCheck, SlotCheck] {
  const [s1, s2] = d.slots;
  const o1 = slotOffer(s1);
  const o2 = slotOffer(s2);
  const c1: SlotCheck = s1.pass ? 'pass' : o1 ? validateOffer(g, agent, o1, 1) : 'incomplete';
  const c2: SlotCheck = s2.pass ? 'pass' : o2 ? validateOffer(g, agent, o2, 2, o1) : 'incomplete';
  return [c1, c2];
}

export const slotReady = (c: SlotCheck): boolean => c === 'pass' || (typeof c === 'object' && isEvaluation(c));

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
      badge = `<span class="badge ok">${e.hijack ? '🏴‍☠️ 하이재킹 성공' : '계약 성공'} +${money(e.fee!)}</span>`;
      body = `${offerText(e.offer!, e.salary)} · 매력도 ${e.attract}${e.bigDeal ? ' · 💰 빅딜 +0.5억' : ''}`;
      break;
    case 'lost':
      badge = `<span class="badge no">${e.hijackFailed ? '하이재킹 실패' : '영입전 패배'}</span>`;
      body = `${offerText(e.offer!, e.salary)} · 매력도 ${e.attract} (${e.hijackFailed ? '기존 계약' : '승자'} ${esc(g.agents[e.winner!]!.name)} ${e.winnerAttract})`;
      break;
    case 'hijacked':
      badge = '<span class="badge no">하이재킹 당함</span>';
      body = `${offerText(e.offer!, e.salary)} · 매력도 ${e.attract} → ${esc(g.agents[e.by!]!.name)}에게 계약을 빼앗김`;
      break;
    case 'void':
      badge = '<span class="badge">협상 무산</span>';
      body = `${offerText(e.offer!)} · 1차에서 이미 계약된 선수 (카드 반환)`;
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

/** 라운드 결과를 1차·2차로 나눠 표시 */
export function roundEntries(g: GameState, r: RoundResult): string {
  return ([1, 2] as const)
    .map((st) => `<h4 class="stage-t">${st}차 협상</h4>${r.entries.filter((e) => e.stage === st).map((e) => entryCard(g, e)).join('')}`)
    .join('');
}
