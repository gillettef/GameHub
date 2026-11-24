import { CLUBS, EVENTS, INVALID_TEXT, club, currentEvent, demandFee, player, upcomingEvent } from '../core';
import { eventCard } from './cards';
import type { Zoom } from './screens/zoom';
import type { AgentKind, AgentState, AiLevel, Demand, GameState, Offer, RoundEntry, RoundResult, Stage } from '../core';
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
  rulesOpen: boolean;
  /** 확대해 보고 있는 카드 (화면이 바뀌면 닫는다) */
  zoom: Zoom | null;
  renaming: boolean;
  error: string;
}

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const LEVEL_TEXT: Record<AiLevel, string> = { easy: '쉬움', normal: '보통' };

export const money = (x: number): string => `${x}억`;

export const agentName = (a: AgentState): string => esc(a.name) + (a.kind === 'ai' ? ' <span class="ai">AI</span>' : '');

/** 에이전트 색 (실물에서는 카드 테두리 색). 채도를 낮추되 밝기로도 구분되게 */
export const AGENT_COLORS = ['#d9bd7f', '#7fb3a1', '#93a9cc', '#d39ea4'];
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
  zoom: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 16, 2),
};

/** 확대 버튼 (카드 선택과 겹치지 않도록 카드 위의 별도 버튼) */
export const zoomBtn = (arg: string, label: string, cls = 'zoom'): string =>
  `<button class="${cls}" data-act="zoom" data-arg="${esc(arg)}" aria-label="${esc(label)} 카드 크게 보기">${ICON.zoom}</button>`;

export function header(right = ''): string {
  return `<header class="top">
    <div class="brand"><span class="mark">${ICON.ball}</span><div><span class="eb">TRANSFER WINDOW</span><b>더블 에이전트</b></div></div>
    <div class="top-r">${right}<button class="icon" data-act="rules" aria-label="게임 규칙">?</button></div>
  </header>`;
}

/** 이벤트 배너 = 이벤트 기본 카드. 누르면 확대 */
export function eventBanner(g: GameState): string {
  const k = currentEvent(g);
  const nk = upcomingEvent(g);
  const forecast = nk ? `<span class="next">다음 라운드 예고 · ${EVENTS[nk].name} — ${EVENTS[nk].desc}</span>` : '';
  return `<button class="event ${k === 'deadline' ? 'dl' : ''}" data-act="zoom" data-arg="event:${k}" aria-label="이벤트 ${EVENTS[k].name} 카드 크게 보기">${eventCard(k, 'base')}${forecast}</button>`;
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

/** 공개 계약 현황: 에이전트마다 직접 계약시킨 선수 (목표 카드를 읽는 단서) */
export function rosters(g: GameState): string {
  return `<ul class="roster">${g.agents
    .map((a, i) => {
      const own = g.signings.filter((s) => s.agent === i);
      const list = own.length
        ? own.map((s) => { const p = player(s.playerId); return `<span class="rp">${esc(p.name)} <small>${p.pos}·${p.trait}${s.weight > 1 ? ` ×${s.weight}` : ''}</small></span>`; }).join('')
        : '<small class="mu">아직 없음</small>';
      return `<li><b>${dot(i)}${esc(a.name)}</b>${list}</li>`;
    })
    .join('')}</ul>`;
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
