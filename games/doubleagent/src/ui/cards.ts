/**
 * 카드 컴포넌트: 같은 함수가 size 로 기본(목록·그리드) / 확대(탭해서 보는 전체 카드)를 그린다.
 * 일러스트는 art/ 의 같은 SVG 를 크기만 바꿔 쓴다.
 */
import { CLUBS, EVENTS, GOALS, NEEDS, PLAYERS, RULES, clubNeed, clubWeight, currentEvent, demandFee, demandPenalty, needsOf, offerValue, upcomingEvent } from '../core';
import type { Demand, EventKey, GameState, PlayerCard } from '../core';
import { clubArt, demandArt, eventArt, goalArt, needArt, playerArt } from './art';
import { CLUB_FLAVOR, DEMAND_FLAVOR, EVENT_FLAVOR, GOAL_FLAVOR, PLAYER_FLAVOR, POS_NAME, TRAIT_TEXT } from './art/flavor';
import { esc, money } from './view';

export type CardSize = 'base' | 'full';

const flavor = (s: string | undefined) => (s ? `<p class="flavor">${esc(s)}</p>` : '');
const stats = (rows: [string, string][]) => `<dl class="fc-st">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/** 이 선수에게 수수료·몸값 효과가 있는 이벤트 */
function playerEvents(p: PlayerCard): EventKey[] {
  const out: EventKey[] = [];
  if (p.pos === 'FW') out.push('fw');
  if (p.pos === 'DF' || p.pos === 'GK') out.push('defense');
  if (p.trait === '유망주') out.push('young');
  if (p.cost >= 6) out.push('big');
  return [...out, 'deadline'];
}

// ── 선수 ─────────────────────────────────────────────

export function playerCard(id: number, size: CardSize, note = ''): string {
  const p = PLAYERS[id]!;
  const tag = `<span class="tag ${p.trait === '스타' ? 'star' : ''}">${p.trait}</span>`;
  if (size === 'base')
    return `<span class="cd-art">${playerArt(id)}</span>
      <span class="pc-h"><span class="pos ${p.pos}">${p.pos}</span><span class="fee" aria-label="기본 수수료 ${p.base}억"><small>기본 </small>${p.base}<small>억</small></span></span>
      <b class="nm">${esc(p.name)}</b>
      <small class="pc-f">${note || `몸값 ${p.cost}억 · ${p.trait}`}</small>`;
  return `<article class="fc">
    <div class="fc-art">${playerArt(id)}</div>
    <div class="fc-h"><span class="pos ${p.pos}">${p.pos}</span><h2>${esc(p.name)}</h2>${tag}</div>
    ${stats([['기본 수수료', money(p.base)], ['몸값', money(p.cost)], ['포지션', POS_NAME[p.pos]]])}
    <p class="fc-p">${TRAIT_TEXT[p.trait]} 구단이 <b>${p.trait}</b>을(를) 선호하면 매력도 +1, 필요 포지션이 <b>${p.pos}</b>이면 +2.</p>
    <h4 class="fc-t">수수료가 오르는 이벤트</h4>
    <ul class="fc-l">${playerEvents(p).map((k) => `<li><b>${EVENTS[k].name}</b> — ${EVENTS[k].desc}</li>`).join('')}</ul>
    ${flavor(PLAYER_FLAVOR[id])}
  </article>`;
}

// ── 구단 요구 카드 ───────────────────────────────────

export function needCard(needId: number, size: CardSize, open = false): string {
  const n = NEEDS[needId]!;
  if (size === 'base') return `<span class="nd ${open ? 'open' : ''}"><span class="nd-art">${needArt(needId)}</span><span class="nd-t"><b>${n.pos}</b> 필요<br><b>${n.pref}</b> 선호</span></span>`;
  return `<div class="fc-need"><span class="nd-art big">${needArt(needId)}</span><div>
    <p><b>${n.pos} 필요</b> <small class="mu">포지션 일치 +2</small></p>
    <p><b>${n.pref} 선호</b> <small class="mu">특성 일치 +1</small></p>
    <p class="mu">${esc(CLUBS[n.club]!.name)}이(가) 지금 ${POS_NAME[n.pos]} 자리에 ${n.pref} 선수를 찾고 있다.</p></div></div>`;
}

// ── 구단 ─────────────────────────────────────────────

export interface ClubCtx {
  g?: GameState;
  /** 고르는 중인 선수 (적합 표시) */
  player?: PlayerCard | null;
  /** 1차에서 이미 고른 구단 */
  taken?: boolean;
}

export const clubEmblem = (id: number): string => `<span class="crest" aria-hidden="true">${clubArt(id)}</span>`;

export function clubCard(id: number, size: CardSize, ctx: ClubCtx = {}): string {
  const c = CLUBS[id]!;
  // 이번 게임에 없는 구단이면 게임 정보 없이 정적 카드만
  const g = ctx.g?.clubs.includes(id) ? ctx.g : undefined;
  const nd = g ? clubNeed(g.needs, id) : NEEDS[needsOf(id)[0]!]!;
  const bud = g ? offerValue(c, currentEvent(g)) : c.budget;
  if (size === 'base') {
    const p = ctx.player;
    const posFit = p && p.pos === nd.pos;
    const prefFit = p && p.trait === nd.pref;
    const tooPoor = p && bud < p.cost;
    return `${clubEmblem(id)}<b class="nm">${esc(c.name)}</b><span class="bud ${tooPoor ? 'poor' : ''}">${ctx.taken ? '1차에서 제안함' : `제시액 ${bud}억${tooPoor ? ' · 몸값 미달' : ''}`}</span>
      <span class="needs"><span class="nd-art sm">${needArt(nd.id)}</span><span class="nc ${posFit ? 'fit' : ''}">${nd.pos} 필요${posFit ? ' +2' : ''}</span><span class="nc ${prefFit ? 'fit' : ''}">${nd.pref} 선호${prefFit ? ' +1' : ''}</span>${g ? `<span class="nc">계약 ${clubWeight(g, id)}명</span>` : ''}</span>`;
  }
  const all = needsOf(id);
  return `<article class="fc">
    <div class="fc-art emb">${clubArt(id)}</div>
    <div class="fc-h"><h2>${esc(c.name)}</h2></div>
    ${stats([['제시액', g && bud !== c.budget ? `${bud}억 <small>(기본 ${c.budget}억)</small>` : money(c.budget)], ...(g ? ([['계약', `${clubWeight(g, id)}명`]] as [string, string][]) : [])])}
    <h4 class="fc-t">공개된 요구 카드</h4>
    ${needCard(nd.id, 'full')}
    <h4 class="fc-t">요구 카드 3장 <small class="mu">· 계약되면 다음 라운드에 다음 카드 공개 (순서는 비공개)</small></h4>
    <div class="nds">${all.map((n) => needCard(n, 'base', n === nd.id)).join('')}</div>
    ${flavor(CLUB_FLAVOR[id])}
  </article>`;
}

// ── 이벤트 ───────────────────────────────────────────

export function eventCard(k: EventKey, size: CardSize, g?: GameState): string {
  const e = EVENTS[k];
  if (size === 'base') return `<span class="ev-art">${eventArt(k, e.name)}</span><span class="ev-t"><b>${e.name}</b><span>${e.desc}</span></span>`;
  const when = g ? (currentEvent(g) === k ? '이번 라운드' : upcomingEvent(g) === k ? '다음 라운드' : '') : '';
  return `<article class="fc">
    <div class="fc-art wide">${eventArt(k, e.name)}</div>
    <div class="fc-h"><h2>${e.name}</h2>${when ? `<span class="tag">${when}</span>` : ''}</div>
    <p class="fc-p"><b>효과</b> — ${e.desc}</p>
    <p class="mu">${k === 'deadline' ? '마지막 라운드는 항상 데드라인 데이입니다.' : '이벤트는 라운드마다 1장 공개되고 다음 라운드 이벤트도 미리 보입니다.'}</p>
    ${flavor(EVENT_FLAVOR[k])}
  </article>`;
}

// ── 요구 수수료 카드 ─────────────────────────────────

/** count = 손에 남은 장수 (모르면 undefined) */
export function demandCard(d: Demand, size: CardSize, count?: number): string {
  const total = Math.max(count ?? 0, RULES.copies);
  const pips = RULES.copies && count !== undefined ? `<span class="pips" aria-hidden="true">${Array.from({ length: total }, (_, k) => `<i class="pip ${k < count ? '' : 'off'}"></i>`).join('')}</span>` : '';
  if (size === 'base') return `<span class="cd-art sq">${demandArt(d)}</span><span class="v">+${demandFee(d)}억</span><span class="p">매력도 −${demandPenalty(d)}</span>${pips}`;
  return `<article class="fc">
    <div class="fc-art sq">${demandArt(d)}</div>
    <div class="fc-h"><h2>요구 수수료 +${demandFee(d)}억</h2></div>
    ${stats([['수수료', `+${money(demandFee(d))}`], ['매력도', `−${demandPenalty(d)}`], ...(count !== undefined && RULES.copies ? ([['남은 장수', `${count} / ${RULES.copies}장`]] as [string, string][]) : [])])}
    ${pips}
    <p class="fc-p">계약하면 선수 기본 수수료에 <b>+${demandFee(d)}억</b>을 더 받습니다. 대신 매력도가 ${demandPenalty(d)} 깎입니다. 같은 매력도로 겨루면 더 낮은 카드가 이깁니다.</p>
    <p class="mu">${RULES.copies ? '낸 카드는 계약 성공·실패와 관계없이 버립니다. 패스하면 그대로 남습니다.' : '카드는 소모되지 않습니다.'}</p>
    ${flavor(DEMAND_FLAVOR[d])}
  </article>`;
}

// ── 목표 카드 ────────────────────────────────────────

/** 목표 카드 1장. progress 를 주면 지금 진척을 함께 보인다 (내 카드이거나 게임이 끝나 공개된 카드) */
export function goalCard(id: number, size: CardSize, progress?: number): string {
  const gc = GOALS[id]!;
  const prog = progress === undefined ? '' : `${Math.min(progress, gc.n)}/${gc.n}`;
  const done = progress !== undefined && progress >= gc.n;
  if (size === 'base')
    return `<span class="goal-b"><span class="cd-art sq">${goalArt(id)}</span>
        <span class="goal-t"><small>나의 목표 카드</small><b>${esc(gc.name)}</b><small>${esc(gc.desc)} · 직접 계약</small></span>
        <span class="goal-n"><small>${done ? '달성' : '달성하면'}</small><b>+${money(RULES.goalBonus)}</b>${prog ? `<small>지금 ${prog}</small>` : ''}</span></span>`;
  return `<article class="fc">
    <div class="fc-art sq">${goalArt(id)}</div>
    <div class="fc-h"><h2>${esc(gc.name)}</h2>${done ? '<span class="tag">달성</span>' : ''}</div>
    ${stats([['조건', esc(gc.desc)], ['보너스', `+${money(RULES.goalBonus)}`], ...(prog ? ([['지금', prog]] as [string, string][]) : [])])}
    <p class="fc-p">게임이 끝날 때 <b>내가 직접</b> 계약시킨 선수로 조건을 채우면 <b>+${money(RULES.goalBonus)}</b>. 못 채우면 0입니다. 스폰서 데이에 계약한 선수는 '○명 이상' 조건에서 2명으로 셉니다.</p>
    <p class="mu">목표 카드는 게임이 끝날 때까지 나만 봅니다. 계약한 선수는 모두에게 공개되니, 너무 티 나게 모으면 상대가 가로챌 수 있습니다.</p>
    ${flavor(GOAL_FLAVOR)}
  </article>`;
}

