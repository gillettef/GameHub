import { RULES, DEMANDS, demandPenalty, PLAYERS, TOTAL_ROUNDS, INVALID_TEXT, clubWeight, currentEvent, fitScore, offerValue, rankings, validateOffer } from '../../core';
import type { GameState } from '../../core';
import type { Session } from '../../store/storage';
import { agentName, clubById, dot, draftOffer, esc, eventBanner, header, marksOf, money, roundEntries, scoreboard, type Draft, type GuessDraft } from '../view';

const gameHeader = (g: GameState) =>
  header(`<span class="pill">R <b>${Math.min(g.round, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}</b></span><button class="icon" data-act="quit" aria-label="나가기">⌂</button>`);

export function handoffScreen(s: Session): string {
  const a = s.game.agents[s.turn]!;
  const what = s.game.phase === 'guess' ? '비밀 구단 지목' : `라운드 ${s.game.round} 협상`;
  return `${gameHeader(s.game)}<main class="content center handoff">
    <div class="hand-ic">🕵️</div>
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
  return `<section class="card secret">
    <h3>🕵️ 나의 비밀 구단 <small class="mu">· 나만 볼 수 있음</small></h3>
    <p><b>${esc(c.name)}</b> <span class="mu">(제시액 ${c.budget}억 · ${c.pos} 필요 · ${c.pref} 선호)</span></p>
    <p class="mu">게임이 끝날 때 아무에게도 들키지 않으면, <b>내가 직접</b> 이 구단에 계약시킨 선수 1명당 <b>+${money(RULES.clubBonus)}</b>. 지금 ${n}명 → ${money(n * RULES.clubBonus)}. 한 명에게라도 들키면 0입니다.</p>
  </section>`;
}

export function bidScreen(s: Session, d: Draft): string {
  const g = s.game;
  const me = g.agents[s.turn]!;
  const event = currentEvent(g);
  const last = g.results.at(-1);
  const p = d.playerId !== null ? PLAYERS[d.playerId]! : null;
  const offer = draftOffer(d);
  const check = offer ? validateOffer(g, s.turn, offer) : null;

  const market = g.market
    .map((id) => {
      const q = PLAYERS[id]!;
      return `<button class="pc ${d.playerId === id ? 'sel' : ''}" data-act="pick" data-arg="${id}" aria-pressed="${d.playerId === id}">
        <span class="pos ${q.pos}">${q.pos}</span><span class="val" aria-label="기본 수수료 ${q.base}억">${q.base}</span>
        <b>${esc(q.name)}</b>
        <span class="tag ${q.trait === '스타' ? 'star' : ''}">${q.trait}</span>
        <small>몸값 ${q.cost}억 · 기본 수수료 ${q.base}억</small>
      </button>`;
    })
    .join('');

  const clubs = g.clubs
    .map((id) => {
      const c = clubById(id);
      const bud = offerValue(c, event);
      const posFit = p && p.pos === c.pos;
      const prefFit = p && p.trait === c.pref;
      const tooPoor = p && bud < p.cost;
      const mine = id === me.secret;
      return `<button class="club ${d.clubId === id ? 'sel' : ''} ${tooPoor ? 'dim' : ''} ${mine ? 'mine' : ''}" data-act="club" data-arg="${id}" aria-pressed="${d.clubId === id}">
        <b>${mine ? '🕵️ ' : ''}${esc(c.name)}</b><span class="bud">제시액 ${bud}억${tooPoor ? ' · 몸값 미달' : ''}</span>
        <span class="needs"><span class="${posFit ? 'fit' : ''}">${c.pos} 필요${posFit ? ' +2' : ''}</span><span class="${prefFit ? 'fit' : ''}">${c.pref} 선호${prefFit ? ' +1' : ''}</span><span>계약 ${clubWeight(g, id)}명</span></span>
        <span class="marks" aria-label="이 구단에 낸 제안 기록">${marksOf(g, id) || '<small class="mu">제안 기록 없음</small>'}</span>
      </button>`;
    })
    .join('');

  const fit = p && d.clubId !== null ? fitScore(p, clubById(d.clubId)) : null;
  const est = !p
    ? '<span class="mu">선수를 선택하세요</span>'
    : d.clubId === null
      ? '<span class="mu">구단을 선택하세요</span>'
      : check && typeof check === 'object'
        ? `<span>매력도 <b>${check.attract}</b> <small class="mu">(적합 ${fit} − ${demandPenalty(d.demand)})</small></span><span class="fee">+${money(check.fee)}</span>`
        : `<span class="err">${check ? INVALID_TEXT[check] : ''}</span>`;
  const ready = check !== null && typeof check === 'object';

  return `${gameHeader(g)}<main class="content tall">
    ${eventBanner(g)}
    ${scoreboard(g, s.turn)}
    ${last ? `<details class="card last"><summary>지난 라운드 결과</summary>${roundEntries(g, last)}</details>` : ''}
    ${secretCard(g, s.turn)}
    <h3 class="sec-t">1. 선수</h3>
    <div class="market">${market}</div>
    <h3 class="sec-t">2. 구단 <small class="mu">· 색 점 = 그 에이전트가 이 구단으로 낸 제안</small></h3>
    <div class="clubs">${clubs}</div>
    <h3 class="sec-t">3. 요구 수수료 <small class="mu">높을수록 수수료↑ 매력도↓</small></h3>
    <div class="chips">${DEMANDS.map((v) => {
      const has = me.hand.includes(v);
      return `<button class="chip ${d.demand === v ? 'sel' : ''}" data-act="demand" data-arg="${v}" ${has ? '' : 'disabled'} aria-pressed="${d.demand === v}">+${v}억<small>매력도 −${demandPenalty(v)}</small></button>`;
    }).join('')}</div>
  </main>
  <nav class="bar col">
    <div class="est">${est}</div>
    <div class="split"><button data-act="pass">패스</button><button class="pri" data-act="submit" ${ready ? '' : 'disabled'}>🤝 제안 제출</button></div>
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
    <h3 class="sec-t">순위 <small class="mu">· 공개 수수료만 (비밀 구단·지목 점수는 종료 때)</small></h3>
    ${scoreboard(g)}
  </main>
  <nav class="bar"><button class="pri" data-act="next">${lastRound ? '비밀 구단 지목 →' : '다음 라운드 →'}</button></nav>`;
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
    <h2 class="title">🔍 비밀 구단 지목</h2>
    <p class="mu">8라운드 동안의 제안 기록을 보고 다른 에이전트의 비밀 구단을 지목하세요. 맞히면 <b>+${money(RULES.guessBonus)}</b>, 틀리면 <b>−${money(RULES.wrongGuess)}</b>. 자신 없으면 지목하지 않아도 됩니다. 한 명에게라도 들킨 에이전트는 비밀 구단 보너스를 잃습니다.</p>
    ${secretCard(g, s.turn)}
    ${blocks}
  </main>
  <nav class="bar"><button class="pri" data-act="guess-submit">지목 제출</button></nav>`;
}

export function finalScreen(s: Session): string {
  const g = s.game;
  const rk = rankings(g);
  return `${gameHeader(g)}<main class="content">
    <div class="center"><span class="eb">TRANSFER WINDOW CLOSED</span><h2 class="title">이적시장 마감</h2><p class="mu">최종 점수 = 계약 수수료 + 비밀 구단 보너스 + 지목 보너스</p></div>
    <section class="card podium">${rk
      .map((r) => {
        const a = g.agents[r.agent]!;
        const f = a.final!;
        const club = f.exposed ? '비밀 구단 들킴 0' : `비밀 구단 ${money(f.clubPoints)}`;
        return `<div class="row rank-${r.rank}"><span class="rk">${r.rank === 1 ? '🏆' : `${r.rank}위`}</span><span class="nm">${dot(r.agent)}${agentName(a)}<small class="mu"> · 수수료 ${money(a.score)} · ${club} · 지목 ${money(f.guessPoints)}</small></span><b>${money(f.total)}</b></div>`;
      })
      .join('')}</section>
    <section class="card reveal"><h3>🕵️ 비밀 구단 공개</h3>${g.agents
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
        return `<h4>${dot(i)}${agentName(a)} — ${esc(c.name)}</h4><p class="mu">${how}</p><p class="mu">${esc(a.name)}의 지목</p>${guesses ? `<ul>${guesses}</ul>` : '<p class="mu">지목하지 않음</p>'}`;
      })
      .join('')}</section>
    <details class="card last"><summary>라운드별 기록</summary>${g.results.map((r) => `<h4>라운드 ${r.round}</h4>${roundEntries(g, r)}`).join('')}</details>
  </main>
  <nav class="bar"><button data-act="home">홈으로</button><button class="pri" data-act="again">다시 하기</button></nav>`;
}
