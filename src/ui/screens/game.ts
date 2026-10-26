import { RULES, DEMANDS, demandFee, demandPenalty, PLAYERS, TOTAL_ROUNDS, INVALID_TEXT, clubNeed, clubWeight, currentEvent, fitScore, handAfter, offerValue, rankings, validateOffer, validateSecond } from '../../core';
import type { Demand, Evaluation, GameState, InvalidReason, Stage } from '../../core';
import type { Session } from '../../store/storage';
import { ICON, agentName, clubById, crest, dot, esc, eventBanner, header, marksOf, money, roundEntries, scoreboard, slotOffer, type Draft, type GuessDraft } from '../view';

export const gameHeader = (g: GameState): string =>
  header(`<span class="pill">R <b>${Math.min(g.round, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}</b></span><button class="icon" data-act="quit" aria-label="나가기">⌂</button>`);

export function handoffScreen(s: Session): string {
  const a = s.game.agents[s.turn]!;
  const what = s.game.phase === 'guess' ? '비밀 구단 지목' : `라운드 ${s.game.round} · 1·2차 협상`;
  return `${gameHeader(s.game)}<main class="content center handoff">
    <div class="envelope" aria-hidden="true"><span class="seal">${ICON.lock}</span></div>
    <span class="stamp-t">EYES ONLY</span>
    <p class="mu">${what}</p>
    <h1>${esc(a.name)} 님 차례</h1>
    <p class="mu">기기를 ${esc(a.name)} 님에게 넘겨주세요.<br>다른 사람은 화면을 보지 마세요.</p>
  </main>
  <nav class="bar"><button class="pri" data-act="ready">제가 ${esc(a.name)}입니다 · 시작</button></nav>`;
}

function secretCard(g: GameState, turn: number): string {
  const me = g.agents[turn]!;
  const c = clubById(me.secret);
  const n = clubWeight(g, me.secret, turn);
  const nd = clubNeed(g.needs, me.secret);
  return `<section class="secret">
    <div class="tape"><span>TOP SECRET</span><span>나만 볼 수 있음</span></div>
    <div class="secret-b">
      ${crest(c.name, true)}
      <div class="secret-t"><small>나의 비밀 구단</small><b>${esc(c.name)}</b><small>제시액 ${c.budget}억 · 지금 ${nd.pos} 필요 · ${nd.pref} 선호</small></div>
      <div class="secret-n"><small>들키지 않으면</small><b>+${money(n * RULES.clubBonus)}</b><small>지금 ${n}명</small></div>
    </div>
    <p class="secret-f">게임이 끝날 때 아무에게도 들키지 않으면, <b>내가 직접</b> 이 구단에 계약시킨 선수 1명당 <b>+${money(RULES.clubBonus)}</b>. 한 명에게라도 들키면 0입니다.</p>
  </section>`;
}

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
  const me = g.agents[s.turn]!;
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
      return `<button class="pc ${sel ? 'sel' : ''} ${taken ? 'dim' : ''}" data-act="pick" data-arg="${id}" aria-pressed="${sel}" ${taken ? 'disabled' : ''}>
        <span class="pc-h"><span class="pos ${q.pos}">${q.pos}</span><span class="fee" aria-label="기본 수수료 ${q.base}억"><small>기본 </small>${q.base}<small>억</small></span></span>
        <b class="nm">${esc(q.name)}</b>
        <span class="tag ${q.trait === '스타' ? 'star' : ''}">${q.trait}</span>
        ${sel ? `<span class="ck">${ICON.check}</span>` : ''}
        <small class="pc-f">${taken ? '1차에서 제안함' : `몸값 ${q.cost}억`}</small>
      </button>`;
    })
    .join('');

  const clubs = g.clubs
    .map((id) => {
      const c = clubById(id);
      const bud = offerValue(c, event);
      const nd = clubNeed(g.needs, id);
      const posFit = p && p.pos === nd.pos;
      const prefFit = p && p.trait === nd.pref;
      const tooPoor = p && bud < p.cost;
      const mine = id === me.secret;
      const taken = first?.clubId === id;
      const sel = sl.clubId === id && !sl.pass;
      return `<button class="club ${sel ? 'sel' : ''} ${tooPoor || taken ? 'dim' : ''} ${mine ? 'mine' : ''}" data-act="club" data-arg="${id}" aria-pressed="${sel}" ${taken ? 'disabled' : ''}>
        ${crest(c.name, mine)}<b class="nm">${esc(c.name)}${mine ? ' <small class="mine-t">비밀</small>' : ''}</b><span class="bud ${tooPoor ? 'poor' : ''}">${taken ? '1차에서 제안함' : `제시액 ${bud}억${tooPoor ? ' · 몸값 미달' : ''}`}</span>
        <span class="needs"><span class="nc ${posFit ? 'fit' : ''}">${nd.pos} 필요${posFit ? ' +2' : ''}</span><span class="nc ${prefFit ? 'fit' : ''}">${nd.pref} 선호${prefFit ? ' +1' : ''}</span><span class="nc">계약 ${clubWeight(g, id)}명</span></span>
        <span class="marks" aria-label="이 구단에 낸 제안 기록">${marksOf(g, id) || '<small class="mu">제안 기록 없음</small>'}</span>
      </button>`;
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
    ${secretCard(g, s.turn)}
    <div class="stages" role="tablist" aria-label="협상 차수">${tabs}</div>
    <p class="mu note">1차를 모두 정산한 뒤 2차를 정산합니다. 2차는 1차와 다른 선수·구단만 고를 수 있고, 2차에 고른 선수가 1차에서 계약되면 협상이 무산됩니다(카드는 소모).</p>
    <h3 class="sec-t">1. 선수 <small class="mu">· ${st}차 협상</small></h3>
    <div class="market">${market}</div>
    <h3 class="sec-t">2. 구단 <small class="mu">· 색 점 = 그 에이전트가 이 구단으로 낸 제안</small></h3>
    <div class="clubs">${clubs}</div>
    <h3 class="sec-t">3. 요구 수수료 <small class="mu">높을수록 수수료↑ 매력도↓ · 낸 카드는 버립니다</small></h3>
    <div class="chips">${DEMANDS.map((v) => {
      const n = count(v);
      const sel = sl.demand === v && !sl.pass;
      const total = Math.max(n, RULES.copies);
      const pips = Array.from({ length: total }, (_, k) => `<i class="pip ${k < n ? '' : 'off'}"></i>`).join('');
      return `<button class="chip dmd ${sel ? 'sel' : ''}" data-act="demand" data-arg="${v}" ${n ? '' : 'disabled'} aria-pressed="${sel}" aria-label="요구 수수료 +${demandFee(v)}억, 매력도 −${demandPenalty(v)}, ${n ? `${n}장 남음` : '없음'}"><span class="v">+${demandFee(v)}억</span><span class="p">매력도 −${demandPenalty(v)}</span>${RULES.copies ? `<span class="pips" aria-hidden="true">${pips}</span>` : ''}</button>`;
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
    <h3 class="sec-t">순위 <small class="mu">· 공개 수수료만 (비밀 구단·지목 점수는 종료 때)</small></h3>
    ${scoreboard(g)}
  </main>
  <nav class="bar">${bar ?? `<button class="pri" data-act="next">${lastRound ? '비밀 구단 지목 →' : '다음 라운드 →'}</button>`}</nav>`;
}

export function guessScreen(s: Session, d: GuessDraft): string {
  const g = s.game;
  const me = g.agents[s.turn]!;
  const others = g.agents.flatMap((a, i) => (i === s.turn ? [] : [{ a, i }]));
  const blocks = others
    .map(
      ({ a, i }) => `<section class="card">
      <h3>${dot(i)}${agentName(a)}의 비밀 구단은?</h3>
      <div class="clubs"><button class="club guess ${d.picks[i] === undefined ? 'sel' : ''}" data-act="guess" data-arg="${i}:none" aria-pressed="${d.picks[i] === undefined}"><b>지목하지 않음</b><span class="bud">감점 없음</span></button>${g.clubs
        .map((id) => {
          const c = clubById(id);
          const mine = id === me.secret;
          const sel = d.picks[i] === id;
          return `<button class="club guess ${sel ? 'sel' : ''}" data-act="guess" data-arg="${i}:${id}" ${mine ? 'disabled' : ''} aria-pressed="${sel}">
            <b>${esc(c.name)}</b><span class="bud">${mine ? '내 비밀 구단' : `${esc(a.name)}의 계약 ${clubWeight(g, id, i)}명`}</span>
            <span class="marks">${marksOf(g, id) || '<small class="mu">제안 기록 없음</small>'}</span>
          </button>`;
        })
        .join('')}</div>
    </section>`,
    )
    .join('');
  return `${gameHeader(g)}<main class="content">
    <h2 class="title ic-title"><span class="target">${ICON.target}</span>비밀 구단 지목</h2>
    <p class="mu">${TOTAL_ROUNDS}라운드 동안의 제안 기록을 보고 다른 에이전트의 비밀 구단을 지목하세요. 맞히면 <b>+${money(RULES.guessBonus)}</b>, 틀리면 <b>−${money(RULES.wrongGuess)}</b>. 자신 없으면 지목하지 않아도 됩니다. 한 명에게라도 들킨 에이전트는 비밀 구단 보너스를 잃습니다.</p>
    ${secretCard(g, s.turn)}
    ${blocks}
  </main>
  <nav class="bar"><button class="pri" data-act="guess-submit">지목 제출</button></nav>`;
}

export function finalScreen(s: Session, bar?: string): string {
  const g = s.game;
  const rk = rankings(g);
  return `${gameHeader(g)}<main class="content">
    <div class="center"><span class="eb">TRANSFER WINDOW CLOSED</span><h2 class="title">이적시장 마감</h2><p class="mu">최종 점수 = 계약 수수료 + 비밀 구단 보너스 + 지목 보너스</p></div>
    <section class="card podium">${rk
      .map((r) => {
        const a = g.agents[r.agent]!;
        const f = a.final!;
        const club = f.exposed ? '비밀 구단 들킴 0' : `비밀 구단 ${money(f.clubPoints)}`;
        return `<div class="row rank-${r.rank}"><span class="rk" aria-label="${r.rank}위">${r.rank === 1 ? '1' : `${r.rank}위`}</span><span class="nm">${dot(r.agent)}${agentName(a)}<small class="mu"> · 수수료 ${money(a.score)} · ${club} · 지목 ${money(f.guessPoints)}</small></span><b>${money(f.total)}</b></div>`;
      })
      .join('')}</section>
    <section class="card reveal"><h3>비밀 구단 공개</h3>${g.agents
      .map((a, i) => {
        const f = a.final!;
        const c = clubById(a.secret);
        const catchers = g.agents.flatMap((o, k) => (k !== i && o.final!.guesses[i] === a.secret ? [esc(o.name)] : []));
        const how = f.exposed ? `<span class="err">${catchers.join(', ')}에게 들킴 → 보너스 0</span>` : `들키지 않음 → 직접 계약 ${f.clubDeals}명 × ${RULES.clubBonus}억 = <b>${money(f.clubPoints)}</b>`;
        const guesses = Object.entries(f.guesses)
          .map(([k, cid]) => {
            const t = g.agents[Number(k)]!;
            const hit = t.secret === cid;
            return `<li>${esc(t.name)} → ${esc(clubById(cid).name)} ${hit ? `✅ +${money(RULES.guessBonus)}` : `❌ −${money(RULES.wrongGuess)}`}</li>`;
          })
          .join('');
        return `<h4>${dot(i)}${agentName(a)} — ${esc(c.name)} <span class="stamp-tag ${f.exposed ? 'caught' : 'safe'}">${f.exposed ? 'CAUGHT' : 'SAFE'}</span></h4><p class="mu">${how}</p><p class="mu">${esc(a.name)}의 지목</p>${guesses ? `<ul>${guesses}</ul>` : '<p class="mu">지목하지 않음</p>'}`;
      })
      .join('')}</section>
    <details class="card last"><summary>라운드별 기록</summary>${g.results.map((r) => `<h4>라운드 ${r.round}</h4>${roundEntries(g, r)}`).join('')}</details>
  </main>
  <nav class="bar">${bar ?? '<button data-act="home">홈으로</button><button class="pri" data-act="again">다시 하기</button>'}</nav>`;
}
