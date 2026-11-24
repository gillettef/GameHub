import { RULES, DEMANDS, GOALS, demandFee, demandPenalty, PLAYERS, TOTAL_ROUNDS, INVALID_TEXT, clubNeed, currentEvent, fitScore, goalResults, handAfter, offerValue, rankings, validateOffer, validateSecond } from '../../core';
import type { Demand, Evaluation, GameState, InvalidReason, Stage } from '../../core';
import type { Session } from '../../store/storage';
import { clubCard, demandCard, goalCard, playerCard } from '../cards';
import { ICON, agentName, clubById, dot, esc, eventBanner, header, money, rosters, roundEntries, scoreboard, slotOffer, zoomBtn, type Draft } from '../view';

export const gameHeader = (g: GameState): string =>
  header(`<span class="pill">R <b>${Math.min(g.round, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}</b></span><button class="icon" data-act="quit" aria-label="나가기">⌂</button>`);

export function handoffScreen(s: Session): string {
  const a = s.game.agents[s.turn]!;
  const what = `라운드 ${s.game.round} · 1·2차 협상`;
  return `${gameHeader(s.game)}<main class="content center handoff">
    <div class="envelope" aria-hidden="true"><span class="seal">${ICON.lock}</span></div>
    <span class="stamp-t">EYES ONLY</span>
    <p class="mu">${what}</p>
    <h1>${esc(a.name)} 님 차례</h1>
    <p class="mu">기기를 ${esc(a.name)} 님에게 넘겨주세요.<br>다른 사람은 화면을 보지 마세요.</p>
  </main>
  <nav class="bar"><button class="pri" data-act="ready">제가 ${esc(a.name)}입니다 · 시작</button></nav>`;
}

/** 내 목표 카드 기본 카드 (누르면 확대). 핫시트에서는 이 화면 앞에 가림 화면이 있다 */
const goalBox = (g: GameState, turn: number): string =>
  `<section class="goal"><span class="tape"><span>TOP SECRET</span><span>나만 볼 수 있음</span></span>${goalResults(g, turn)
    .map((r) => `<button class="goal-i" data-act="zoom" data-arg="goal:${r.goal}" aria-label="나의 목표 카드 ${esc(GOALS[r.goal]!.name)} 크게 보기">${goalCard(r.goal, 'base', r.progress)}</button>`)
    .join('')}</section>`;

/** 공개 계약 현황 (상대의 목표를 읽는 단서) */
const rosterBox = (g: GameState): string => `<details class="card last"><summary>계약 현황 <small class="mu">· 누가 어떤 선수를 모았나</small></summary>${rosters(g)}</details>`;

/** 이 협상에서 낼 수 있는 손패 (2차는 1차 카드를 뺀 손) */
export function slotHand(s: Session, d: Draft, stage: Stage): Demand[] {
  return stage === 1 ? [...s.game.agents[s.turn]!.hand] : handAfter(s.game, s.turn, slotOffer(d.slots[0]));
}

/** 협상 1건의 판정: null = 미완성, 'pass' = 패스 */
export function slotCheck(s: Session, d: Draft, stage: Stage): Evaluation | InvalidReason | 'pass' | null {
  const sl = d.slots[stage - 1]!;
  if (sl.pass) return 'pass';
  const offer = slotOffer(sl);
  if (!offer) return null;
  return stage === 1 ? validateOffer(s.game, s.turn, offer) : validateSecond(s.game, s.turn, slotOffer(d.slots[0]), offer);
}

export const slotReady = (c: ReturnType<typeof slotCheck>): boolean => c === 'pass' || (c !== null && typeof c === 'object');

function slotSummary(s: Session, d: Draft, stage: Stage): string {
  const c = slotCheck(s, d, stage);
  const sl = d.slots[stage - 1]!;
  if (c === 'pass') return '패스';
  if (c === null) return sl.playerId === null && sl.clubId === null ? '작성 전' : '작성 중';
  if (typeof c !== 'object') return `⚠ ${INVALID_TEXT[c]}`;
  return `${esc(PLAYERS[sl.playerId!]!.name)} → ${esc(clubById(sl.clubId!).name)} · +${money(c.fee)}`;
}

export function bidScreen(s: Session, d: Draft): string {
  const g = s.game;
  const event = currentEvent(g);
  const last = g.results.at(-1);
  const st = d.stage;
  const sl = d.slots[st - 1]!;
  // 2차 작성 중이면 1차에 고른 선수·구단은 고를 수 없다
  const first = st === 2 ? slotOffer(d.slots[0]) : null;
  const p = sl.playerId !== null ? PLAYERS[sl.playerId]! : null;
  const hand = slotHand(s, d, st);
  const check = slotCheck(s, d, st);

  const market = g.market
    .map((id) => {
      const q = PLAYERS[id]!;
      const taken = first?.playerId === id;
      const sel = sl.playerId === id && !sl.pass;
      return `<div class="cell pc ${sel ? 'sel' : ''} ${taken ? 'dim' : ''}">
        <button class="pick" data-act="pick" data-arg="${id}" aria-pressed="${sel}" ${taken ? 'disabled' : ''}>${playerCard(id, 'base', taken ? '1차에서 제안함' : '')}${sel ? `<span class="ck">${ICON.check}</span>` : ''}</button>
        ${zoomBtn(`player:${id}`, q.name)}
      </div>`;
    })
    .join('');

  const clubs = g.clubs
    .map((id) => {
      const c = clubById(id);
      const tooPoor = p && offerValue(c, event) < p.cost;
      const taken = first?.clubId === id;
      const sel = sl.clubId === id && !sl.pass;
      return `<div class="cell club ${sel ? 'sel' : ''} ${tooPoor || taken ? 'dim' : ''}">
        <button class="pick" data-act="club" data-arg="${id}" aria-pressed="${sel}" ${taken ? 'disabled' : ''}>${clubCard(id, 'base', { g, player: p, taken })}</button>
        ${zoomBtn(`club:${id}`, c.name)}
      </div>`;
    })
    .join('');

  const fit = p && sl.clubId !== null ? fitScore(p, clubNeed(g.needs, sl.clubId)) : null;
  const est =
    check === 'pass'
      ? `<span class="mu">${st}차 협상 패스 · 카드 소모 없음</span>`
      : !hand.length
        ? '<span class="err">남은 요구 수수료 카드가 없습니다 · 패스만 가능</span>'
        : !p
          ? '<span class="mu">선수를 선택하세요</span>'
          : sl.clubId === null
            ? '<span class="mu">구단을 선택하세요</span>'
            : check && typeof check === 'object'
              ? `<span>매력도 <b>${check.attract}</b> <small class="mu">(적합 ${fit} − ${demandPenalty(sl.demand!)})</small></span><span class="fee">+${money(check.fee)}</span>`
              : `<span class="err">${check ? INVALID_TEXT[check] : '카드를 고르세요'}</span>`;

  const tabs = ([1, 2] as const)
    .map(
      (k) => `<button class="stage ${st === k ? 'sel' : ''} ${slotReady(slotCheck(s, d, k)) ? 'ok' : ''}" data-act="stage" data-arg="${k}" role="tab" aria-selected="${st === k}">
        <b>${k}차 협상</b><small>${slotSummary(s, d, k)}</small></button>`,
    )
    .join('');

  const allReady = slotReady(slotCheck(s, d, 1)) && slotReady(slotCheck(s, d, 2));
  const count = (v: Demand) => hand.filter((x) => x === v).length;
  const bar =
    st === 1
      ? `<div class="split"><button data-act="pass">1차 패스</button><button class="pri" data-act="stage" data-arg="2" ${slotReady(check) ? '' : 'disabled'}>2차 협상 작성 →</button></div>`
      : `<div class="split three"><button data-act="stage" data-arg="1">← 1차</button><button data-act="pass">2차 패스</button><button class="pri" data-act="submit" ${allReady ? '' : 'disabled'}>🤝 제출</button></div>`;

  return `${gameHeader(g)}<main class="content tall">
    ${eventBanner(g)}
    ${scoreboard(g, s.turn)}
    ${last ? `<details class="card last"><summary>지난 라운드 결과</summary>${roundEntries(g, last)}</details>` : ''}
    ${goalBox(g, s.turn)}
    ${rosterBox(g)}
    <div class="stages" role="tablist" aria-label="협상 차수">${tabs}</div>
    <p class="mu note">1차를 모두 정산한 뒤 2차를 정산합니다. 2차는 1차와 다른 선수·구단만 고를 수 있고, 2차에 고른 선수가 1차에서 계약되면 협상이 무산됩니다(카드는 소모).</p>
    <h3 class="sec-t">1. 선수 <small class="mu">· ${st}차 협상</small></h3>
    <div class="market">${market}</div>
    <h3 class="sec-t">2. 구단 <small class="mu">· 요구 카드에 맞을수록 매력도↑</small></h3>
    <div class="clubs">${clubs}</div>
    <h3 class="sec-t">3. 요구 수수료 <small class="mu">높을수록 수수료↑ 매력도↓ · 낸 카드는 버립니다</small></h3>
    <div class="chips">${DEMANDS.map((v) => {
      const n = count(v);
      const sel = sl.demand === v && !sl.pass;
      return `<div class="cell dmd-c ${sel ? 'sel' : ''}"><button class="pick chip dmd" data-act="demand" data-arg="${v}" ${n ? '' : 'disabled'} aria-pressed="${sel}" aria-label="요구 수수료 +${demandFee(v)}억, 매력도 −${demandPenalty(v)}, ${n ? `${n}장 남음` : '없음'}">${demandCard(v, 'base', n)}</button>${zoomBtn(`demand:${v}`, `요구 수수료 +${demandFee(v)}억`, 'zoom-s')}</div>`;
    }).join('')}</div>
  </main>
  <nav class="bar col">
    <div class="est">${est}</div>
    ${bar}
  </nav>`;
}

export function resultScreen(s: Session, bar?: string): string {
  const g = s.game;
  const r = g.results.at(-1)!;
  const lastRound = g.round >= TOTAL_ROUNDS;
  // 이번 라운드에 계약된 구단은 다음 라운드에 요구 카드를 새로 연다
  const rotating = RULES.needRotate && !lastRound ? g.clubs.filter((id) => g.signings.some((x) => x.round === r.round && x.clubId === id)) : [];
  const rotateNote = rotating.length
    ? `<p class="mu note">🔄 다음 라운드에 요구 카드 교체: ${rotating.map((id) => `<b>${esc(clubById(id).name)}</b> <small>(${clubNeed(g.needs, id).pos}·${clubNeed(g.needs, id).pref} →)</small>`).join(', ')}</p>`
    : '';
  return `${gameHeader(g)}<main class="content">
    <h2 class="title">라운드 ${r.round} 결과</h2>
    ${eventBanner(g)}
    <section class="entries">${roundEntries(g, r)}</section>
    ${rotateNote}
    <h3 class="sec-t">순위 <small class="mu">· 공개 수수료만 (목표 보너스는 종료 때)</small></h3>
    ${scoreboard(g)}
    ${rosterBox(g)}
  </main>
  <nav class="bar">${bar ?? `<button class="pri" data-act="next">${lastRound ? '최종 결과 →' : '다음 라운드 →'}</button>`}</nav>`;
}

export function finalScreen(s: Session, bar?: string): string {
  const g = s.game;
  const rk = rankings(g);
  return `${gameHeader(g)}<main class="content">
    <div class="center"><span class="eb">TRANSFER WINDOW CLOSED</span><h2 class="title">이적시장 마감</h2><p class="mu">최종 점수 = 계약 수수료 + 목표 카드 보너스</p></div>
    <section class="card podium">${rk
      .map((r) => {
        const a = g.agents[r.agent]!;
        const f = a.final!;
        return `<div class="row rank-${r.rank}"><span class="rk" aria-label="${r.rank}위">${r.rank === 1 ? '1' : `${r.rank}위`}</span><span class="nm">${dot(r.agent)}${agentName(a)}<small class="mu"> · 수수료 ${money(a.score)} · 목표 ${money(f.goalPoints)}</small></span><b>${money(f.total)}</b></div>`;
      })
      .join('')}</section>
    <section class="card reveal"><h3>목표 카드 공개</h3>${g.agents
      .map((a, i) => {
        const f = a.final!;
        const goals = f.goals
          .map((x) => {
            const gc = GOALS[x.goal]!;
            const how = x.done ? `달성 ${Math.min(x.progress, gc.n)}/${gc.n} → <b>+${money(x.points)}</b>` : `<span class="err">미달성 ${x.progress}/${gc.n} → 0</span>`;
            return `<button class="goal-r" data-act="zoom" data-arg="goal:${x.goal}" aria-label="${esc(gc.name)} 목표 카드 크게 보기"><span><b>${esc(gc.name)}</b> <small class="mu">${esc(gc.desc)}</small></span><span class="stamp-tag ${x.done ? 'safe' : 'caught'}">${x.done ? 'CLEAR' : 'MISS'}</span><span class="mu">${how}</span></button>`;
          })
          .join('');
        return `<h4>${dot(i)}${agentName(a)}</h4>${goals}`;
      })
      .join('')}</section>
    ${rosterBox(g)}
    <details class="card last"><summary>라운드별 기록</summary>${g.results.map((r) => `<h4>라운드 ${r.round}</h4>${roundEntries(g, r)}`).join('')}</details>
  </main>
  <nav class="bar">${bar ?? '<button data-act="home">홈으로</button><button class="pri" data-act="again">다시 하기</button>'}</nav>`;
}
