import {
  FEE_RATES,
  MAX_SALARY,
  PLAYERS,
  TACTICS,
  TOTAL_ROUNDS,
  INVALID_TEXT,
  effectiveBudget,
  feeRemaining,
  rankings,
} from '../../core';
import type { FeeRate, GameState, TacticKey } from '../../core';
import type { Session } from '../../store/storage';
import { agentName, checkSlots, clubById, esc, eventBanner, header, money, roundEntries, scoreboard, slotReady, type Draft } from '../view';

const gameHeader = (g: GameState) =>
  header(`<span class="pill">R <b>${Math.min(g.round, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}</b></span><button class="icon" data-act="quit" aria-label="나가기">⌂</button>`);

export function handoffScreen(s: Session): string {
  const a = s.game.agents[s.turn]!;
  return `${gameHeader(s.game)}<main class="content center handoff">
    <div class="hand-ic">🤝</div>
    <p class="mu">라운드 ${s.game.round} 협상</p>
    <h1>${esc(a.name)} 님 차례</h1>
    <p class="mu">기기를 ${esc(a.name)} 님에게 넘겨주세요.<br>다른 사람은 화면을 보지 마세요.</p>
  </main>
  <nav class="bar"><button class="pri" data-act="ready">제가 ${esc(a.name)}입니다 · 시작</button></nav>`;
}

export function bidScreen(s: Session, d: Draft): string {
  const g = s.game;
  const me = g.agents[s.turn]!;
  const fr = feeRemaining(me);
  const st = d.stage;
  const sl = d.slots[st - 1]!;
  const otherSt = st === 1 ? 2 : 1;
  const other = d.slots[otherSt - 1]!;
  /** 다른 차수에서 고른 선수·구단·카드는 이 차수에서 쓸 수 없다 */
  const otherOn = !other.pass;
  const checks = checkSlots(g, s.turn, d);
  const ck = checks[st - 1]!;
  const otherCk = checks[otherSt - 1]!;
  const last = g.results.at(-1);
  const p = sl.playerId !== null ? PLAYERS[sl.playerId]! : null;

  const tabs = `<div class="tabs" role="tablist">${([1, 2] as const)
    .map((k) => {
      const c = checks[k - 1]!;
      const mark = c === 'pass' ? '<small>패스</small>' : slotReady(c) ? '<small class="ok">✓ 준비</small>' : '<small>작성 중</small>';
      return `<button role="tab" class="tab ${k === st ? 'sel' : ''}" aria-selected="${k === st}" data-act="stage" data-arg="${k}"><b>${k}차 협상</b>${mark}</button>`;
    })
    .join('')}</div>`;

  const market = g.market
    .map((id) => {
      const q = PLAYERS[id]!;
      const sold = g.sold.includes(id);
      const taken = otherOn && other.playerId === id;
      return `<button class="pc ${sl.playerId === id ? 'sel' : ''}" data-act="pick" data-arg="${id}" ${sold || taken ? 'disabled' : ''} aria-pressed="${sl.playerId === id}">
        <span class="pos ${q.pos}">${q.pos}</span><span class="val">${q.value}</span>
        <b>${esc(q.name)}</b>
        <span class="tag ${q.trait === '스타' ? 'star' : ''}">${q.trait}</span>
        <small>${taken ? `${otherSt}차에서 선택함` : `최소 ${q.minSalary}억 · 보너스 +${q.bonus}억`}</small>
      </button>`;
    })
    .join('');

  const clubs = g.clubs
    .map((id) => {
      const c = clubById(id);
      const bud = effectiveBudget(c, g.event);
      const posFit = p && p.pos === c.pos;
      const prefFit = p && p.trait === c.pref;
      const tooPoor = p && bud < p.minSalary;
      const taken = otherOn && other.clubId === id;
      return `<button class="club ${sl.clubId === id ? 'sel' : ''} ${tooPoor ? 'dim' : ''}" data-act="club" data-arg="${id}" ${taken ? 'disabled' : ''} aria-pressed="${sl.clubId === id}">
        <b>${esc(c.name)}</b><span class="bud">${taken ? `${otherSt}차에서 선택함` : `예산 ${bud}억`}</span>
        <span class="needs"><span class="${posFit ? 'fit' : ''}">${c.pos} 필요${posFit ? ' +2' : ''}</span><span class="${prefFit ? 'fit' : ''}">${c.pref} 선호${prefFit ? ' +1' : ''}</span></span>
      </button>`;
    })
    .join('');

  const minS = p?.minSalary ?? 1;
  /** 다른 차수에 예약된 카드를 뺀 남은 장수 */
  const feeLeft = (f: FeeRate) => fr[f] - (otherOn && other.fee === f ? 1 : 0);
  const tacticChip = (k: TacticKey) => {
    const firstOnly = st === 1 && TACTICS[k].secondOnly;
    const used = otherOn && other.tactic === k;
    const note = firstOnly ? ' · 2차 전용' : used ? ` · ${otherSt}차에서 사용` : '';
    return `<button class="chip t ${k === 'hijack' ? 'hj' : ''} ${sl.tactic === k ? 'sel' : ''}" data-act="tactic" data-arg="${k}" ${firstOnly || used ? 'disabled' : ''}><b>${TACTICS[k].name}${note}</b><small>${TACTICS[k].desc}</small></button>`;
  };

  const est = sl.pass
    ? `<span class="mu">${st}차 협상 패스</span>`
    : !p
      ? '<span class="mu">선수를 선택하세요</span>'
      : sl.clubId === null
        ? '<span class="mu">구단을 선택하세요</span>'
        : typeof ck === 'object'
          ? `<span>매력도 <b>${ck.attract}</b>${ck.salary !== sl.salary ? ` · 유효 연봉 ${ck.salary}억` : ''}</span><span class="fee">+${money(ck.fee)}</span>`
          : `<span class="err">${INVALID_TEXT[ck as keyof typeof INVALID_TEXT]}</span>`;

  const editor = sl.pass
    ? `<section class="card center pass-card"><p>${st}차 협상을 패스합니다.<br><span class="mu">카드는 소모되지 않습니다.</span></p>
        <button data-act="slot-pass">다시 협상하기</button></section>`
    : `${
        st === 2
          ? '<p class="hint">💡 다른 에이전트가 <b>1차에서 계약한 선수</b>에게 낸 2차 제안은 무산됩니다(카드 반환). <b>하이재킹</b> 카드를 쓰면 1차 계약의 매력도보다 높을 때 그 계약을 빼앗아 옵니다.</p>'
          : ''
      }
    <h3 class="sec-t">1. 선수 <small class="mu">· 1차·2차 중복 불가</small></h3>
    <div class="market">${market}</div>
    <h3 class="sec-t">2. 구단 <small class="mu">· 1차·2차 중복 불가</small></h3>
    <div class="clubs">${clubs}</div>
    <h3 class="sec-t">3. 연봉</h3>
    <div class="stepper ${p ? '' : 'off'}">
      <button class="icon big" data-act="sal" data-arg="-1" ${!p || sl.salary <= minS ? 'disabled' : ''} aria-label="연봉 내리기">−</button>
      <output>${p ? `${sl.salary}억` : '—'}</output>
      <button class="icon big" data-act="sal" data-arg="1" ${!p || sl.salary >= MAX_SALARY ? 'disabled' : ''} aria-label="연봉 올리기">＋</button>
    </div>
    <h3 class="sec-t">4. 수수료율 카드 <small class="mu">제출하면 소모</small></h3>
    <div class="chips">${FEE_RATES.map(
      (f) =>
        `<button class="chip ${sl.fee === f ? 'sel' : ''}" data-act="fee" data-arg="${f}" ${feeLeft(f) <= 0 && sl.fee !== f ? 'disabled' : ''}>${f}%<small>×${Math.max(0, feeLeft(f))}</small></button>`,
    ).join('')}</div>
    <h3 class="sec-t">5. 전략 카드 <small class="mu">선택 · 제출하면 소모</small></h3>
    <div class="tactics">
      <button class="chip ${sl.tactic === null ? 'sel' : ''}" data-act="tactic" data-arg="">사용 안 함</button>
      ${me.tactics.map(tacticChip).join('')}
    </div>`;

  const main =
    st === 1
      ? `<button class="pri" data-act="stage" data-arg="2" ${slotReady(ck) ? '' : 'disabled'}>2차 협상 →</button>`
      : `<button class="pri" data-act="submit" ${slotReady(checks[0]) && slotReady(checks[1]) ? '' : 'disabled'}>🤝 1·2차 제출</button>`;

  return `${gameHeader(g)}<main class="content tall">
    ${eventBanner(g)}
    ${scoreboard(g, s.turn)}
    ${last ? `<details class="card last"><summary>지난 라운드 결과</summary>${roundEntries(g, last)}</details>` : ''}
    <h3 class="sec-t">${agentName(me)}의 협상 <small class="mu">· 1차·2차를 모두 정하고 제출</small></h3>
    ${tabs}
    ${editor}
  </main>
  <nav class="bar col">
    <div class="est">${st === 2 && !slotReady(otherCk) ? '<span class="err">1차 협상을 완성하거나 패스하세요</span>' : est}</div>
    <div class="split"><button data-act="slot-pass">${sl.pass ? '패스 취소' : `${st}차 패스`}</button>${main}</div>
  </nav>`;
}

export function resultScreen(s: Session): string {
  const g = s.game;
  const r = g.results.at(-1)!;
  const lastRound = g.round >= TOTAL_ROUNDS;
  return `${gameHeader(g)}<main class="content">
    <h2 class="title">라운드 ${r.round} 결과</h2>
    ${eventBanner(g)}
    <section class="entries">${roundEntries(g, r)}</section>
    <h3 class="sec-t">순위</h3>
    ${scoreboard(g)}
  </main>
  <nav class="bar"><button class="pri" data-act="next">${lastRound ? '최종 결과 보기' : '다음 라운드 →'}</button></nav>`;
}

export function finalScreen(s: Session): string {
  const g = s.game;
  const rk = rankings(g);
  return `${gameHeader(g)}<main class="content">
    <div class="center"><span class="eb">TRANSFER WINDOW CLOSED</span><h2 class="title">스토브리그 종료</h2></div>
    <section class="card podium">${rk
      .map((r) => {
        const a = g.agents[r.agent]!;
        return `<div class="row rank-${r.rank}"><span class="rk">${r.rank === 1 ? '🏆' : `${r.rank}위`}</span><span class="nm">${agentName(a)}<small class="mu"> · ${a.deals}건</small></span><b>${money(a.score)}</b></div>`;
      })
      .join('')}</section>
    <details class="card last"><summary>라운드별 기록</summary>${g.results
      .map((r) => `<h4>라운드 ${r.round}</h4>${roundEntries(g, r)}`)
      .join('')}</details>
  </main>
  <nav class="bar"><button data-act="home">홈으로</button><button class="pri" data-act="again">다시 하기</button></nav>`;
}
