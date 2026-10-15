import {
  DEMANDS,
  PLAYERS,
  TACTICS,
  TOTAL_ROUNDS,
  INVALID_TEXT,
  clientOutcomes,
  demandRemaining,
  fitScore,
  offerValue,
  rankings,
  stars,
} from '../../core';
import type { Demand, GameState, TacticKey } from '../../core';
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
  const left = demandRemaining(me);
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
  const reg = me.clients.at(-1);
  const myClient = reg && reg.round === g.round ? reg.playerId : null;

  const clientCard = `<section class="card client">
    <h3>📋 의뢰 선수 <small class="mu">· 나만 볼 수 있음</small></h3>
    ${
      myClient !== null
        ? `<p>이번 라운드 시장에 내가 등록한 선수: <b>${esc(PLAYERS[myClient]!.name)}</b><br><span class="mu">다른 에이전트가 계약하면 게임 종료 시 <b>+${money(PLAYERS[myClient]!.base)}</b>(기본 수수료). 직접 계약하면 의뢰 보너스는 없습니다(이해충돌).</span></p>`
        : '<p class="mu">이번 라운드에 등록한 선수가 없습니다.</p>'
    }
    ${
      g.round < TOTAL_ROUNDS && me.hand.length
        ? `<h4>다음 라운드에 등록할 선수</h4><div class="hand">${me.hand
            .map((id) => {
              const q = PLAYERS[id]!;
              return `<button class="chip ${d.client === id ? 'sel' : ''}" data-act="client" data-arg="${id}" aria-pressed="${d.client === id}"><b>${q.pos} ${esc(q.name)}</b><small>몸값 ${q.cost}억 · 기본 ${q.base}억 · ${q.trait}</small></button>`;
            })
            .join('')}</div>`
        : ''
    }
  </section>`;

  const tabs = `<div class="tabs" role="tablist">${([1, 2] as const)
    .map((k) => {
      const c = checks[k - 1]!;
      const mark = c === 'pass' ? '<small>패스</small>' : slotReady(c) ? '<small class="ok">✓ 준비</small>' : '<small>작성 중</small>';
      return `<button role="tab" class="tab ${k === st ? 'sel' : ''}" aria-selected="${k === st}" data-act="stage" data-arg="${k}"><b>${k}차 협상</b>${mark}</button>`;
    })
    .join('')}</div>`;

  const bigFish = stars(g);
  // 대어를 앞에 배치
  const market = [...bigFish, ...g.market.filter((id) => !bigFish.includes(id))]
    .map((id) => {
      const q = PLAYERS[id]!;
      const sold = g.sold.includes(id);
      const taken = otherOn && other.playerId === id;
      const star = bigFish.includes(id);
      const locked = st === 1 && !star;
      const mine = id === myClient ? '📋 내 의뢰 · ' : '';
      const note = mine + (taken ? `${otherSt}차에서 선택함` : locked ? '2차에서 협상 가능' : `몸값 ${q.cost}억 · 기본 수수료 ${q.base}억`);
      return `<button class="pc ${star ? 'big' : ''} ${sl.playerId === id ? 'sel' : ''}" data-act="pick" data-arg="${id}" ${sold || taken || locked ? 'disabled' : ''} aria-pressed="${sl.playerId === id}">
        <span class="pos ${q.pos}">${q.pos}</span><span class="val" aria-label="기본 수수료 ${q.base}억">${q.base}</span>
        <b>${star ? '🐟 ' : ''}${esc(q.name)}</b>
        <span class="tag ${q.trait === '스타' ? 'star' : ''}">${q.trait}</span>
        <small>${note}</small>
      </button>`;
    })
    .join('');

  const clubs = g.clubs
    .map((id) => {
      const c = clubById(id);
      const bud = offerValue(c, g.event);
      const posFit = p && p.pos === c.pos;
      const prefFit = p && p.trait === c.pref;
      const tooPoor = p && bud < p.cost;
      const taken = otherOn && other.clubId === id;
      return `<button class="club ${sl.clubId === id ? 'sel' : ''} ${tooPoor ? 'dim' : ''}" data-act="club" data-arg="${id}" ${taken ? 'disabled' : ''} aria-pressed="${sl.clubId === id}">
        <b>${esc(c.name)}</b><span class="bud">${taken ? `${otherSt}차에서 선택함` : `제시액 ${bud}억${tooPoor ? ' · 몸값 미달' : ''}`}</span>
        <span class="needs"><span class="${posFit ? 'fit' : ''}">${c.pos} 필요${posFit ? ' +2' : ''}</span><span class="${prefFit ? 'fit' : ''}">${c.pref} 선호${prefFit ? ' +1' : ''}</span></span>
      </button>`;
    })
    .join('');

  /** 다른 차수에 예약된 카드를 뺀 남은 장수 */
  const demandLeft = (d: Demand) => left[d] - (otherOn && other.demand === d ? 1 : 0);
  const fit = p && sl.clubId !== null ? fitScore(p, clubById(sl.clubId)) : null;
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
          ? `<span>매력도 <b>${ck.attract}</b> <small class="mu">(적합 ${fit}${sl.tactic ? ` + 전략 ${TACTICS[sl.tactic].attract}` : ''} − 요구 ${sl.demand})</small></span><span class="fee">+${money(ck.fee)}</span>`
          : `<span class="err">${INVALID_TEXT[ck as keyof typeof INVALID_TEXT]}</span>`;

  const editor = sl.pass
    ? `<section class="card center pass-card"><p>${st}차 협상을 패스합니다.<br><span class="mu">카드는 소모되지 않습니다.</span></p>
        <button data-act="slot-pass">다시 협상하기</button></section>`
    : `${
        st === 1
          ? `<p class="hint">🐟 <b>1차는 대어 쟁탈전</b> — 몸값 상위 <b>${bigFish.length}명(대어)</b>만 노릴 수 있습니다. 나머지 선수는 2차에서 협상하세요.</p>`
          : ''
      }${
        st === 2
          ? '<p class="hint">💡 다른 에이전트가 <b>1차에서 계약한 선수</b>에게 낸 2차 제안은 무산되고 카드는 버려집니다. <b>하이재킹</b> 카드를 쓰면 1차 계약의 매력도 이상일 때 그 계약을 빼앗아 옵니다.</p>'
          : ''
      }
    <h3 class="sec-t">1. 선수 <small class="mu">· ${st === 1 ? '대어만 · ' : ''}1차·2차 중복 불가</small></h3>
    <div class="market">${market}</div>
    <h3 class="sec-t">2. 구단 <small class="mu">· 1차·2차 중복 불가</small></h3>
    <div class="clubs">${clubs}</div>
    <h3 class="sec-t">3. 요구 수수료 <small class="mu">높을수록 수수료↑ 매력도↓ · 공개되면 소모</small></h3>
    <div class="chips">${DEMANDS.map(
      (d) =>
        `<button class="chip ${sl.demand === d ? 'sel' : ''}" data-act="demand" data-arg="${d}" ${demandLeft(d) <= 0 && sl.demand !== d ? 'disabled' : ''}>${d}억<small>×${Math.max(0, demandLeft(d))}</small></button>`,
    ).join('')}</div>
    <h3 class="sec-t">4. 전략 카드 <small class="mu">선택 · 공개되면 소모</small></h3>
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
    ${clientCard}
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
    <div class="center"><span class="eb">TRANSFER WINDOW CLOSED</span><h2 class="title">이적시장 마감</h2><p class="mu">최종 점수 = 계약 수수료 + 의뢰 보너스</p></div>
    <section class="card podium">${rk
      .map((r) => {
        const a = g.agents[r.agent]!;
        const bonus = a.clientBonus ?? 0;
        return `<div class="row rank-${r.rank}"><span class="rk">${r.rank === 1 ? '🏆' : `${r.rank}위`}</span><span class="nm">${agentName(a)}<small class="mu"> · ${a.deals}건 · 수수료 ${money(a.score - bonus)} + 의뢰 ${money(bonus)}</small></span><b>${money(a.score)}</b></div>`;
      })
      .join('')}</section>
    <section class="card reveal"><h3>📋 의뢰 선수 공개</h3>${g.agents
      .map((a, i) => {
        const items = clientOutcomes(g, i)
          .map((o) => {
            const q = PLAYERS[o.playerId]!;
            const how = o.result === 'other' ? `${esc(g.agents[o.by!]!.name)} 계약 → <b>+${money(o.bonus)}</b>` : o.result === 'self' ? '직접 계약 (보너스 없음)' : '미계약';
            return `<li>R${o.round} ${esc(q.name)} <small class="mu">${q.pos} · 기본 ${q.base}억</small> — ${how}</li>`;
          })
          .join('');
        return `<h4>${agentName(a)} <small class="mu">+${money(a.clientBonus ?? 0)}</small></h4><ul>${items}</ul>`;
      })
      .join('')}</section>
    <details class="card last"><summary>라운드별 기록</summary>${g.results
      .map((r) => `<h4>라운드 ${r.round}</h4>${roundEntries(g, r)}`)
      .join('')}</details>
  </main>
  <nav class="bar"><button data-act="home">홈으로</button><button class="pri" data-act="again">다시 하기</button></nav>`;
}
