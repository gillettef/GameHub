import {
  FEE_RATES,
  MAX_SALARY,
  PLAYERS,
  TACTICS,
  TOTAL_ROUNDS,
  INVALID_TEXT,
  effectiveBudget,
  feeRemaining,
  isEvaluation,
  rankings,
  validateOffer,
} from '../../core';
import type { GameState } from '../../core';
import type { Session } from '../../store/storage';
import { agentName, clubById, entryCard, esc, eventBanner, header, money, scoreboard, type Draft } from '../view';

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
  const p = d.playerId !== null ? PLAYERS[d.playerId]! : null;
  const offer = p && d.clubId !== null ? { playerId: p.id, clubId: d.clubId, salary: d.salary, fee: d.fee, tactic: d.tactic } : null;
  const ev = offer ? validateOffer(g, s.turn, offer) : null;
  const ok = ev !== null && isEvaluation(ev);
  const last = g.results.at(-1);

  const market = g.market
    .map((id) => {
      const q = PLAYERS[id]!;
      const sold = g.sold.includes(id);
      return `<button class="pc ${d.playerId === id ? 'sel' : ''}" data-act="pick" data-arg="${id}" ${sold ? 'disabled' : ''} aria-pressed="${d.playerId === id}">
        <span class="pos ${q.pos}">${q.pos}</span><span class="val">${q.value}</span>
        <b>${esc(q.name)}</b>
        <span class="tag ${q.trait === '스타' ? 'star' : ''}">${q.trait}</span>
        <small>최소 ${q.minSalary}억 · 보너스 +${q.bonus}억</small>
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
      return `<button class="club ${d.clubId === id ? 'sel' : ''} ${tooPoor ? 'dim' : ''}" data-act="club" data-arg="${id}" aria-pressed="${d.clubId === id}">
        <b>${esc(c.name)}</b><span class="bud">예산 ${bud}억</span>
        <span class="needs"><span class="${posFit ? 'fit' : ''}">${c.pos} 필요${posFit ? ' +2' : ''}</span><span class="${prefFit ? 'fit' : ''}">${c.pref} 선호${prefFit ? ' +1' : ''}</span></span>
      </button>`;
    })
    .join('');

  const minS = p?.minSalary ?? 1;
  const est = !p
    ? '<span class="mu">선수를 선택하세요</span>'
    : d.clubId === null
      ? '<span class="mu">구단을 선택하세요</span>'
      : ok
        ? `<span>매력도 <b>${ev.attract}</b>${ev.salary !== d.salary ? ` · 유효 연봉 ${ev.salary}억` : ''}</span><span class="fee">+${money(ev.fee)}</span>`
        : `<span class="err">${INVALID_TEXT[ev as keyof typeof INVALID_TEXT]}</span>`;

  return `${gameHeader(g)}<main class="content tall">
    ${eventBanner(g)}
    ${scoreboard(g, s.turn)}
    ${last ? `<details class="card last"><summary>지난 라운드 결과</summary>${last.entries.map((e) => entryCard(g, e)).join('')}</details>` : ''}
    <h3 class="sec-t">${agentName(me)}의 협상 <small class="mu">· 1. 선수</small></h3>
    <div class="market">${market}</div>
    <h3 class="sec-t">2. 구단</h3>
    <div class="clubs">${clubs}</div>
    <h3 class="sec-t">3. 연봉</h3>
    <div class="stepper ${p ? '' : 'off'}">
      <button class="icon big" data-act="sal" data-arg="-1" ${!p || d.salary <= minS ? 'disabled' : ''} aria-label="연봉 내리기">−</button>
      <output>${p ? `${d.salary}억` : '—'}</output>
      <button class="icon big" data-act="sal" data-arg="1" ${!p || d.salary >= MAX_SALARY ? 'disabled' : ''} aria-label="연봉 올리기">＋</button>
    </div>
    <h3 class="sec-t">4. 수수료율 카드 <small class="mu">제출하면 소모</small></h3>
    <div class="chips">${FEE_RATES.map(
      (f) => `<button class="chip ${d.fee === f ? 'sel' : ''}" data-act="fee" data-arg="${f}" ${fr[f] <= 0 ? 'disabled' : ''}>${f}%<small>×${fr[f]}</small></button>`,
    ).join('')}</div>
    <h3 class="sec-t">5. 전략 카드 <small class="mu">선택 · 제출하면 소모</small></h3>
    <div class="tactics">
      <button class="chip ${d.tactic === null ? 'sel' : ''}" data-act="tactic" data-arg="">사용 안 함</button>
      ${me.tactics
        .map((k) => `<button class="chip t ${d.tactic === k ? 'sel' : ''}" data-act="tactic" data-arg="${k}"><b>${TACTICS[k].name}</b><small>${TACTICS[k].desc}</small></button>`)
        .join('')}
    </div>
  </main>
  <nav class="bar col">
    <div class="est">${est}</div>
    <div class="split"><button data-act="pass">패스</button><button class="pri" data-act="submit" ${ok ? '' : 'disabled'}>🤝 협상 제출</button></div>
  </nav>`;
}

export function resultScreen(s: Session): string {
  const g = s.game;
  const r = g.results.at(-1)!;
  const lastRound = g.round >= TOTAL_ROUNDS;
  return `${gameHeader(g)}<main class="content">
    <h2 class="title">라운드 ${r.round} 결과</h2>
    ${eventBanner(g)}
    <section class="entries">${r.entries.map((e) => entryCard(g, e)).join('')}</section>
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
      .map((r) => `<h4>라운드 ${r.round}</h4>${r.entries.map((e) => entryCard(g, e)).join('')}`)
      .join('')}</details>
  </main>
  <nav class="bar"><button data-act="home">홈으로</button><button class="pri" data-act="again">다시 하기</button></nav>`;
}
