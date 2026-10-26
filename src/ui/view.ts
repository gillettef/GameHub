import { CLUBS, EVENTS, INVALID_TEXT, club, clubMarks, currentEvent, demandFee, player, upcomingEvent } from '../core';
import type { AgentKind, AgentState, AiLevel, Demand, EventKey, GameState, Offer, RoundEntry, RoundResult, Stage } from '../core';
import type { Profile, Session } from '../store/storage';

export interface Seat {
  name: string;
  kind: AgentKind;
  level?: AiLevel;
}

/** 협상 1건 작성 중 상태 (demand null = 낼 카드가 없음) */
export interface Slot {
  playerId: number | null;
  clubId: number | null;
  demand: Demand | null;
  pass: boolean;
}

/** 라운드 제안 작성 중 상태: 1차·2차를 한꺼번에 작성한다 */
export interface Draft {
  key: string;
  stage: Stage;
  slots: [Slot, Slot];
}

/** 지목 작성 중 상태: 다른 에이전트 → 구단 */
export interface GuessDraft {
  key: string;
  picks: Record<number, number>;
}

export const slotOffer = (d: Slot): Offer | null =>
  !d.pass && d.playerId !== null && d.clubId !== null && d.demand !== null ? { playerId: d.playerId, clubId: d.clubId, demand: d.demand } : null;

export interface UiState {
  profile: Profile | null;
  session: Session | null;
  view: 'home' | 'setup' | 'game' | 'online';
  /** 온라인 참가 코드 입력값 */
  joinCode: string;
  /** 잠깐 보여 줄 안내 (링크 복사 등) */
  flash: string;
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

/** 선 아이콘 (stroke = currentColor). 장식이므로 aria-hidden */
const svg = (d: string, size = 22, w = 1.8): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  ball: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5l4 2.9-1.5 4.6h-5L8 10.4z"/><path d="M12 3v4.5M16 10.4l4.3-1.4M14.5 15l2.6 3.7M9.5 15l-2.6 3.7M8 10.4L3.7 9"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 30),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>', 24, 2),
  check: svg('<path d="M5 12l5 5 9-10"/>', 14, 3),
  chevron: svg('<path d="M9 6l6 6-6 6"/>', 20, 2),
};

const EVENT_ICON: Record<EventKey, string> = {
  normal: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h8M8 17h4"/>'),
  fw: svg('<path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7.5z"/><path d="M6 15a6 6 0 0 0 12 0"/>'),
  defense: svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>'),
  young: svg('<path d="M12 21V11"/><path d="M12 11c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>'),
  budget: svg('<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>'),
  big: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
  sponsor: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  overseas: svg('<path d="M2 16l20-8-6 12-3-5z"/><path d="M13 15l-4 5"/>'),
  deadline: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>'),
};

/** 구단 엠블럼 글자: 단어마다 첫 글자 (최대 2자) */
export const crestText = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? '')
    .join('');

export const crest = (name: string, mine = false): string => `<span class="crest ${mine ? 'mine' : ''}" aria-hidden="true">${esc(crestText(name))}</span>`;

export function header(right = ''): string {
  return `<header class="top">
    <div class="brand"><span class="mark">${ICON.ball}</span><div><span class="eb">TRANSFER WINDOW</span><b>더블 에이전트</b></div></div>
    <div class="top-r">${right}<button class="icon" data-act="rules" aria-label="게임 규칙">?</button></div>
  </header>`;
}

export function eventBanner(g: GameState): string {
  const k = currentEvent(g);
  const e = EVENTS[k];
  const nk = upcomingEvent(g);
  const forecast = nk ? `<p class="next">다음 라운드 예고 · ${EVENTS[nk].name} — ${EVENTS[nk].desc}</p>` : '';
  return `<div class="event ${k === 'deadline' ? 'dl' : ''}"><span class="ev-ic">${EVENT_ICON[k]}</span><div><b>${e.name}</b><p>${e.desc}</p></div>${forecast}</div>`;
}

/** 점수판: 공개 수수료와 남은 요구 수수료 카드 수 (카드는 공개 정보) */
export function scoreboard(g: GameState, me = -1): string {
  return `<div class="scores" style="--n:${g.agents.length}">${g.agents
    .map(
      (a, i) =>
        `<div class="sc ${i === me ? 'me' : ''}"><span class="nm">${dot(i)}${esc(a.name)}</span><b>${money(a.score)}</b><small>${a.deals}건 · 카드 ${a.hand.length}</small></div>`,
    )
    .join('')}</div>`;
}

/** 구단별 공개 기록: 누가 몇 번 이 구단으로 제안했는가 (색 점) */
export function marksOf(g: GameState, clubId: number): string {
  const marks = clubMarks(g);
  return g.agents.map((_, i) => dot(i).repeat(marks[i]![clubId] ?? 0)).join('');
}

export const offerText = (o: Offer): string => `${esc(player(o.playerId).name)} → ${esc(club(o.clubId).name)} · 요구 ${demandFee(o.demand)}억`;

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
      badge = `<span class="badge no">${e.tied ? '동률 상쇄' : e.attract === e.winnerAttract ? '동률 · 카드 높음' : '영입전 패배'}</span>`;
      body = e.tied
        ? `${offerText(e.offer!)} · 매력도 ${e.attract} (같은 매력도끼리 상쇄${e.winner !== undefined ? ` → ${esc(g.agents[e.winner]!.name)} 계약` : ''})`
        : `${offerText(e.offer!)} · 매력도 ${e.attract} (승자 ${esc(g.agents[e.winner!]!.name)} ${e.winnerAttract}${e.attract === e.winnerAttract ? ', 더 낮은 카드' : ''})`;
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

/** 라운드 결과: 1차 → 2차 순서로 */
export const roundEntries = (g: GameState, r: RoundResult): string =>
  ([1, 2] as const)
    .map((st) => `<h4 class="stage-t">${st}차 협상</h4>${r.entries.filter((e) => (e.stage ?? 1) === st).map((e) => entryCard(g, e)).join('')}`)
    .join('');
