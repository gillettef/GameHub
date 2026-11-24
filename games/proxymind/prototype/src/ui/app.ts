// PROXYMIND 웹 시뮬레이터 화면. 상태가 바뀔 때마다 패널을 다시 그리고, 보드는 게임 동안 같은 DOM 을 쓴다.
import {
  MAX_ENERGY,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TILES,
  botDesign,
  botIntervention,
  check,
  createGame,
  currentBot,
  designerOf,
  legalInterventions,
  playTurn,
  ranking,
  runSims,
  score,
  submitDesign,
  targetOf,
  tileOf,
  type BotLevel,
  type GameState,
  type Intervention,
  type SimResult,
} from '../core';
import { Net } from '../online/client';
import { ROOM_CODE_RE } from '../online/protocol';
import { Board } from './board';
import { COLORS, escapeHtml as esc, eventText, ivText } from './text';

// ── 게임 세션 (로컬 봇 대전 / 관전 / 온라인 공통) ─────────────────

interface Session {
  readonly online: boolean;
  game(): GameState | null;
  mySeat(): number | null;
  design(slots: number[]): void;
  intervene(iv: Intervention): void;
  dispose(): void;
}

class LocalSession implements Session {
  readonly online = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seed = (Math.random() * 2 ** 31) | 0;
  delay = 900;

  constructor(
    private g: GameState,
    private seat: number | null,
    private onChange: () => void,
  ) {
    this.advance();
  }
  game() {
    return this.g;
  }
  mySeat() {
    return this.seat;
  }
  design(slots: number[]) {
    if (this.seat == null) return;
    submitDesign(this.g, this.seat, slots);
    this.advance();
    this.onChange();
  }
  intervene(iv: Intervention) {
    if (this.seat == null || currentBot(this.g) !== this.seat) return;
    playTurn(this.g, iv);
    this.advance();
    this.onChange();
  }
  dispose() {
    clearTimeout(this.timer);
  }
  /** 봇 설계자는 바로, 봇 조종사는 잠깐 기다렸다 진행 */
  private advance() {
    clearTimeout(this.timer);
    const g = this.g;
    if (g.phase === 'design') {
      for (let d = 0; d < g.n; d++)
        if (d !== this.seat && !g.players[d]!.pending) {
          submitDesign(g, d, botDesign(g, d, this.seed++));
          if (g.phase !== 'design') break;
        }
    }
    if (g.phase === 'design' && this.seat == null) return;
    if (g.phase === 'exec' && currentBot(g) !== this.seat) {
      this.timer = setTimeout(() => {
        playTurn(g, botIntervention(g, this.seed++));
        this.advance();
        this.onChange();
      }, this.delay);
    }
  }
}

/** 서버 응답 전 같은 단계에서 다시 보내지 않도록 보낸 단계를 기억한다 */
let sentKey = '';
const stepKey = (g: GameState) => `${g.round}:${g.phase}:${g.turn}`;

class OnlineSession implements Session {
  readonly online = true;
  constructor(private net: Net) {}
  game() {
    return this.net.state.room?.game ?? null;
  }
  mySeat() {
    return this.net.state.room?.mySeat ?? null;
  }
  design(slots: number[]) {
    const g = this.game();
    if (!g || sentKey === stepKey(g)) return;
    sentKey = stepKey(g);
    this.net.send({ t: 'design', round: g.round, slots });
    render();
  }
  intervene(iv: Intervention) {
    const g = this.game();
    if (!g || sentKey === stepKey(g)) return;
    sentKey = stepKey(g);
    this.net.send({ t: 'intervene', round: g.round, turn: g.turn, iv });
    render();
  }
  dispose() {}
}

// ── 앱 상태 ─────────────────────────────────────────────

type Screen = 'home' | 'setup' | 'play' | 'sim' | 'online' | 'rules';

const root = document.getElementById('app')!;
let screen: Screen = 'home';
let session: Session | null = null;
let board: Board | null = null;
let boardN = 0;
/** 설계 중인 슬롯 (손패 인스턴스 번호) */
let pick: (number | null)[] = [null, null, null];
let pickKey = '';
let setup = { n: 4, name: '나', level: 'normal' as BotLevel, delay: 900 };
let sim = { n: 4, games: 200, level: 'normal' as BotLevel, running: false, done: 0, result: null as SimResult | null };
let onlineForm = { name: '', code: new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '' };
let logOpen = true;

const net = new Net(() => {
  if (screen === 'online' || (screen === 'play' && session?.online)) {
    if (session?.online && !net.state.room?.game) {
      screen = 'online';
    } else if (net.state.room?.game && screen === 'online') {
      startOnlineSession();
      return;
    }
    render();
  }
});

function go(s: Screen) {
  if (s !== 'play') {
    session?.dispose();
    session = null;
    board = null;
  }
  screen = s;
  render();
}

function startLocal(watch: boolean) {
  session?.dispose();
  const n = setup.n;
  const seats = Array.from({ length: n }, (_, i) =>
    !watch && i === 0 ? { name: setup.name || '나', kind: 'human' as const } : { name: `봇 ${'ABCDE'[i]}`, kind: 'bot' as const, level: setup.level },
  );
  const g = createGame(seats, (Math.random() * 2 ** 31) | 0);
  const s = new LocalSession(g, watch ? null : 0, render);
  s.delay = setup.delay;
  session = s;
  board = null;
  screen = 'play';
  render();
}

function startOnlineSession() {
  session = new OnlineSession(net);
  board = null;
  screen = 'play';
  render();
}

// ── 렌더 ────────────────────────────────────────────────

function render() {
  switch (screen) {
    case 'home':
      return renderHome();
    case 'setup':
      return renderSetup();
    case 'sim':
      return renderSim();
    case 'online':
      return renderOnline();
    case 'rules':
      return renderRules();
    case 'play':
      return renderPlay();
  }
}

const header = (title: string) =>
  `<header class="top"><button class="link" data-go="home">← 처음으로</button><h2>${title}</h2></header>`;

function renderHome() {
  root.innerHTML = `
  <main class="home">
    <div class="hero">
      <p class="kicker">로봇 아레나 · 3~5인 · 웹 시뮬레이터</p>
      <h1>PROXY<span>MIND</span></h1>
      <p class="tag">네 로봇의 두뇌는 내가 짰다. 행운을 빈다.</p>
      <p class="lead">내 로봇은 <b>왼쪽 플레이어가 꽂아 준 규칙</b>대로만 움직입니다. 나는 오른쪽 플레이어의 로봇에 함정을 꽂습니다.</p>
    </div>
    <div class="menu">
      <button class="card-btn" data-go="setup"><b>봇과 대전</b><span>봇 2~4대를 상대로 한 판</span></button>
      <button class="card-btn" data-go="online"><b>온라인 대전</b><span>방을 만들고 친구를 초대 (빈자리는 봇)</span></button>
      <button class="card-btn" data-go="sim"><b>자동 시뮬레이션</b><span>봇끼리 수백 판 — 밸런스 지표</span></button>
      <button class="card-btn ghost" data-go="rules"><b>규칙 요약</b><span>룰북 v0.3.1 기준</span></button>
    </div>
    ${net.hasSaved ? `<p class="resume"><button class="link" data-act="resume">진행 중이던 온라인 방으로 돌아가기 →</button></p>` : ''}
    <footer class="foot">룰북 초안 v0.3.1 · 판정은 규칙 엔진이 자동으로 합니다</footer>
  </main>`;
}

const seg = (name: string, cur: string | number, opts: [string | number, string][]) =>
  `<div class="seg">${opts.map(([v, l]) => `<button data-set="${name}" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;

function renderSetup() {
  root.innerHTML = `${header('봇과 대전')}
  <main class="form">
    <label>내 이름 <input id="name" maxlength="10" value="${esc(setup.name)}"></label>
    <div class="row"><span>인원</span>${seg('n', setup.n, [3, 4, 5].map((n) => [n, `${n}인`]))}</div>
    <div class="row"><span>봇 실력</span>${seg('level', setup.level, [['normal', '보통'], ['easy', '쉬움']])}</div>
    <div class="row"><span>봇 진행 속도</span>${seg('delay', setup.delay, [[1500, '느리게'], [900, '보통'], [300, '빠르게']])}</div>
    <p class="hint">나는 1번 자리(빨강)입니다. 내 로봇의 설계자는 2번 자리 봇, 내가 짜는 로봇은 마지막 자리 봇입니다.</p>
    <div class="actions"><button class="primary" data-act="start-local">시작</button><button data-act="watch">봇끼리 한 판 관전</button></div>
  </main>`;
}

function renderSim() {
  const r = sim.result;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  root.innerHTML = `${header('자동 시뮬레이션')}
  <main class="form wide">
    <p class="hint">봇끼리 끝까지 돌려 룰북 v0.3.1의 밸런스 지표를 모읍니다. 목표: 설계자 점수 비중 30~40%, 어느 자리도 승률 50% 미만.</p>
    <div class="row"><span>인원</span>${seg('sn', sim.n, [3, 4, 5].map((n) => [n, `${n}인`]))}</div>
    <div class="row"><span>판 수</span>${seg('sg', sim.games, [[50, '50'], [200, '200'], [500, '500']])}</div>
    <div class="row"><span>봇 실력</span>${seg('sl', sim.level, [['normal', '보통'], ['easy', '쉬움']])}</div>
    <div class="actions"><button class="primary" data-act="run-sim" ${sim.running ? 'disabled' : ''}>${sim.running ? `실행 중… ${sim.done}/${sim.games}` : '실행'}</button></div>
    ${sim.running ? `<div class="bar"><i style="width:${(sim.done / sim.games) * 100}%"></i></div>` : ''}
    ${
      r
        ? `<section class="results">
      <h3>${r.n}인 · ${r.games}판 결과</h3>
      <div class="stats">
        <div><b>${pct(r.dpShare)}</b><span>설계자 점수 비중</span></div>
        <div><b>${r.avgScore.toFixed(1)}</b><span>1인 평균 점수</span></div>
        <div><b>${r.avgCores.toFixed(2)}</b><span>1인 평균 코어</span></div>
        <div><b>${r.avgDp.toFixed(2)}</b><span>1인 평균 설계자 점수</span></div>
      </div>
      <h4>자리별 승률 (선 플레이어 기준 시작 자리)</h4>
      <div class="seats">${r.seatWin.map((w, i) => `<div><span>${i + 1}번 자리</span><div class="bar"><i style="width:${w * 100}%;background:${COLORS[i]}"></i></div><b>${pct(w)}</b></div>`).join('')}</div>
      <h4>점수의 출처 (1인 평균)</h4>
      <table><tr><td>충돌로 얻은 설계자 점수</td><td>${r.dpFromBump.toFixed(2)}</td></tr><tr><td>쓴 에너지로 얻은 설계자 점수</td><td>${r.dpFromSpent.toFixed(2)}</td></tr><tr><td>규칙 타일로 얻은 코어</td><td>${r.coreByRule.toFixed(2)}</td></tr><tr><td>추진으로 얻은 코어</td><td>${r.coreByThrust.toFixed(2)}</td></tr></table>
      <h4>개입 비율</h4>
      <table>${Object.entries(r.ivs).map(([k, v]) => `<tr><td>${({ none: '개입 안 함', turn: '회전', block: '차단', thrust: '추진' } as Record<string, string>)[k]}</td><td>${pct(v)}</td></tr>`).join('')}</table>
      <h4>규칙 타일 (꽂힌 횟수 · 꽂혔을 때 발동률)</h4>
      <table class="tiles">${r.tileFire.map((t) => `<tr><td>${t.code}</td><td>${t.text}</td><td>${t.placed}</td><td>${pct(t.fireRate)}</td></tr>`).join('')}</table>
    </section>`
        : ''
    }
  </main>`;
}

function runSim() {
  if (sim.running) return;
  sim.running = true;
  sim.done = 0;
  sim.result = null;
  const all: SimResult[] = [];
  const chunk = 10;
  const seed = (Math.random() * 2 ** 31) | 0;
  const stepFn = () => {
    const k = Math.min(chunk, sim.games - sim.done);
    all.push(runSims(sim.n, k, seed + sim.done * 13));
    sim.done += k;
    if (sim.done < sim.games) {
      if (screen === 'sim') render();
      setTimeout(stepFn, 0);
    } else {
      sim.running = false;
      sim.result = merge(all);
      if (screen === 'sim') render();
    }
  };
  render();
  setTimeout(stepFn, 30);
}

/** 조각별 결과를 판 수 가중 평균으로 합친다 */
function merge(rs: SimResult[]): SimResult {
  const games = rs.reduce((a, r) => a + r.games, 0);
  const w = (f: (r: SimResult) => number) => rs.reduce((a, r) => a + f(r) * r.games, 0) / games;
  const scoreSum = w((r) => r.avgScore);
  return {
    games,
    n: rs[0]!.n,
    seatWin: rs[0]!.seatWin.map((_, i) => w((r) => r.seatWin[i]!)),
    avgScore: scoreSum,
    avgCores: w((r) => r.avgCores),
    avgDp: w((r) => r.avgDp),
    dpShare: scoreSum ? w((r) => r.avgDp) / scoreSum : 0,
    dpFromBump: w((r) => r.dpFromBump),
    dpFromSpent: w((r) => r.dpFromSpent),
    coreByRule: w((r) => r.coreByRule),
    coreByThrust: w((r) => r.coreByThrust),
    ivs: Object.fromEntries(Object.keys(rs[0]!.ivs).map((k) => [k, w((r) => r.ivs[k]!)])),
    tileFire: rs[0]!.tileFire.map((t, i) => {
      const placed = rs.reduce((a, r) => a + r.tileFire[i]!.placed, 0);
      const fired = rs.reduce((a, r) => a + r.tileFire[i]!.placed * r.tileFire[i]!.fireRate, 0);
      return { ...t, placed, fireRate: placed ? fired / placed : 0 };
    }),
  };
}

function renderOnline() {
  const st = net.state;
  const room = st.room;
  const err = st.error ? `<p class="error">${esc(st.error)}</p>` : '';
  const conn = st.status === 'connecting' ? '<p class="hint">서버에 연결 중…</p>' : st.status === 'closed' ? '<p class="error">연결이 끊겼습니다. 다시 연결하는 중…</p>' : '';
  if (!room) {
    root.innerHTML = `${header('온라인 대전')}
    <main class="form">
      ${err}${conn}
      <label>내 이름 <input id="oname" maxlength="10" value="${esc(onlineForm.name)}" placeholder="10자 이내"></label>
      <div class="actions"><button class="primary" data-act="create">방 만들기</button></div>
      <div class="or">또는</div>
      <label>방 코드 <input id="ocode" maxlength="4" value="${esc(onlineForm.code)}" placeholder="ABCD" style="text-transform:uppercase"></label>
      <div class="actions"><button data-act="join">참가</button></div>
      <p class="hint">빈자리는 봇으로 채울 수 있습니다. 3~5명이면 시작할 수 있습니다.</p>
    </main>`;
    return;
  }
  const host = room.host === room.me;
  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  root.innerHTML = `${header('온라인 대기실')}
  <main class="form">
    ${err}${conn}
    <div class="code-box"><span>방 코드</span><b>${room.code}</b><button class="link" data-act="copy" data-link="${esc(link)}">초대 링크 복사</button></div>
    <ol class="seats-list">
      ${room.seats
        .map(
          (s, i) => `<li><i class="dot" style="background:${COLORS[i]}"></i><span>${esc(s.name)}${s.pid === room.me ? ' (나)' : ''}${s.pid === room.host ? ' · 방장' : ''}${s.kind === 'human' && !s.online ? ' · 연결 끊김' : ''}</span>
          ${s.kind === 'bot' ? `<em>${s.level === 'normal' ? '보통' : '쉬움'}</em>${host ? `<button class="link" data-act="bot-level" data-seat="${i}">실력 바꾸기</button><button class="link" data-act="remove-seat" data-seat="${i}">빼기</button>` : ''}` : ''}</li>`,
        )
        .join('')}
    </ol>
    <p class="hint">자리 순서가 곧 시계 방향입니다. 각자 다음 자리 플레이어가 내 로봇의 설계자입니다.</p>
    <div class="actions">
      ${host ? `<button data-act="add-bot" ${room.seats.length >= MAX_PLAYERS ? 'disabled' : ''}>봇 추가</button><button class="primary" data-act="ostart" ${room.seats.length < MIN_PLAYERS ? 'disabled' : ''}>게임 시작 (${room.seats.length}인)</button>` : '<p class="hint">방장이 시작하기를 기다리는 중…</p>'}
      <button class="link" data-act="oleave">방 나가기</button>
    </div>
  </main>`;
}

function renderRules() {
  root.innerHTML = `${header('규칙 요약')}
  <main class="form wide rules">
    <p>각 플레이어는 <b>조종사</b>(내 로봇의 주인)이면서 <b>설계자</b>(오른쪽 플레이어 로봇의 두뇌를 짜는 사람)입니다. 8라운드 뒤 점수가 가장 높은 사람이 이깁니다. <b>코어 1개 = 2점</b>, <b>설계자 점수 1개 = 1점</b>.</p>
    <h4>라운드</h4>
    <ol>
      <li><b>충전</b> — 에너지 +1 (최대 3). 처음엔 1개로 시작합니다.</li>
      <li><b>설계</b> — 규칙 타일 5개를 뽑아 3개를 오른쪽 로봇의 슬롯 1·2·3에 꽂습니다. 모두 동시에 공개합니다.</li>
      <li><b>실행</b> — 선 플레이어 로봇부터 한 대씩. 조종사는 에너지 1로 <b>개입</b>(회전·차단·추진) 1회를 할 수 있고, 로봇은 슬롯 1부터 검사해 <b>처음 참인 규칙 하나</b>를 실행합니다. 없으면 1칸 전진.</li>
      <li><b>정리</b> — 타일을 주머니로. 코어가 2개 이하면 빈 생성 지점에 보충. 선 플레이어는 왼쪽으로.</li>
    </ol>
    <h4>설계자 점수</h4>
    <ul>
      <li>로봇이 규칙(또는 기본 행동) 때문에 막힌 칸에 <b>충돌</b>하면 그 로봇의 설계자 +1.</li>
      <li>조종사가 개입에 쓴 에너지는 두뇌 보드에 쌓이고, <b>2개마다</b> 설계자 +1.</li>
    </ul>
    <h4>판정</h4>
    <ul>
      <li><b>막힌 칸</b>: 아레나 밖, 기둥, 다른 로봇. 코어가 있는 칸은 비어 있습니다.</li>
      <li><b>앞줄</b>: 앞 칸부터 곧게. 기둥 앞·아레나 끝에서 끊기고, 처음 만난 로봇 칸까지 포함.</li>
      <li><b>멈출 때까지 전진</b>: 막힌 칸 앞에서 멈추며 충돌이 아닙니다(처음부터 막혔으면 충돌).</li>
      <li>충돌하면 그 타일의 남은 행동은 취소. 이동 중 지나간 칸의 코어도 얻습니다.</li>
    </ul>
    <h4>규칙 타일 20종 (45개)</h4>
    <table class="tiles">${TILES.map((t) => `<tr><td>${t.code}</td><td>${t.text}</td><td>×${t.count}</td></tr>`).join('')}</table>
  </main>`;
}

// ── 게임 화면 ────────────────────────────────────────────

function lastTrigger(g: GameState, p: number): number | null {
  for (let i = g.log.length - 1; i >= 0; i--) {
    const e = g.log[i]!;
    if (e.t === 'round') return null;
    if (e.t === 'trigger' && e.p === p) return e.slot;
    if (e.t === 'default' && e.p === p) return -1;
  }
  return null;
}

/** 지금 그대로 실행하면 발동할 슬롯 (차단 제외). 없으면 -1 */
function wouldFire(g: GameState, p: number): number {
  const pl = g.players[p]!;
  for (let s = 0; s < 3; s++) {
    if (pl.blocked === s || pl.brain[s] == null) continue;
    if (check(g, p, tileOf(g, pl.brain[s]!).cond)) return s;
  }
  return -1;
}

function tileHtml(g: GameState, inst: number | null, extra = ''): string {
  if (inst == null) return `<div class="tile empty ${extra}">—</div>`;
  if (inst < 0) return `<div class="tile back ${extra}">?</div>`;
  const t = tileOf(g, inst);
  const [c, a] = t.text.split(' → ');
  return `<div class="tile ${extra}"><small>${t.code}</small><span class="cond">${c}</span><span class="act">→ ${a}</span></div>`;
}

function renderPlay() {
  const s = session!;
  const g = s.game();
  if (!g) return;
  const me = s.mySeat();
  if (!board || boardN !== g.n || !root.querySelector('.play')) {
    board = new Board(g.n);
    boardN = g.n;
    root.innerHTML = `<header class="top"><button class="link" data-act="quit">← 나가기</button><h2 id="phase"></h2><span id="meta"></span></header>
    <main class="play"><section class="left"><div id="board-slot"></div><div id="action"></div></section><aside class="right"><div id="players"></div><details id="logbox" ${logOpen ? 'open' : ''}><summary>진행 기록</summary><div id="log"></div></details></aside></main>`;
    root.querySelector('#board-slot')!.appendChild(board.el);
  }
  const cur = g.phase === 'exec' ? currentBot(g) : null;
  const myTarget = me != null ? targetOf(g, me) : null;
  board.update(g, { active: cur, target: g.phase === 'design' && me != null && !g.players[me]!.pending ? myTarget : null });

  const phaseName = g.phase === 'design' ? '설계 단계' : g.phase === 'exec' ? '실행 단계' : '게임 종료';
  root.querySelector('#phase')!.textContent = g.phase === 'done' ? '게임 종료' : `${g.round} / ${g.rounds} 라운드 · ${phaseName}`;
  root.querySelector('#meta')!.innerHTML = s.online ? `방 ${net.state.room?.code ?? ''}${net.state.status !== 'open' ? ' · <span class="error">재연결 중</span>' : ''}` : '';

  // 플레이어 카드
  root.querySelector('#players')!.innerHTML = g.players
    .map((p, i) => {
      const designer = designerOf(g, i);
      const fired = g.phase === 'exec' || g.phase === 'done' ? lastTrigger(g, i) : null;
      const slots = [0, 1, 2]
        .map((k) => {
          const inst = p.brain[k] ?? (g.phase === 'design' && g.players[designer]!.pending ? -1 : null);
          const cls = [p.blocked === k ? 'blocked' : '', fired === k ? 'fired' : ''].join(' ');
          return `<div class="slot"><em>${k + 1}</em>${tileHtml(g, inst, cls)}</div>`;
        })
        .join('');
      return `<div class="pcard${cur === i ? ' active' : ''}${me === i ? ' me' : ''}" style="--c:${COLORS[i]}">
        <div class="phead"><i class="dot"></i><b>${esc(p.name)}</b>${me === i ? '<span class="tag-me">나</span>' : ''}${p.kind === 'bot' ? '<span class="tag-bot">봇</span>' : ''}<span class="score">${score(g, i)}점</span></div>
        <div class="pstats"><span title="코어">◆ ${p.cores}</span><span title="설계자 점수">✎ ${p.dp}</span><span title="에너지">⚡ ${p.energy}/${MAX_ENERGY}</span><span title="두뇌 보드 위 쓴 에너지">쓴 에너지 ${'●'.repeat(p.spent)}${'○'.repeat(2 - p.spent)}</span></div>
        <div class="brain">${slots}</div>
        <div class="pdesigner">설계자: <span style="color:${COLORS[designer]}">${esc(g.players[designer]!.name)}</span>${fired === -1 ? ' · 기본 행동' : ''}</div>
      </div>`;
    })
    .join('');

  // 기록
  const lines = g.log.map((e) => eventText(g, e)).filter(Boolean).slice(-80);
  const logEl = root.querySelector('#log')!;
  logEl.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
  logEl.scrollTop = logEl.scrollHeight;

  root.querySelector('#action')!.innerHTML = actionHtml(g, me);
}

function actionHtml(g: GameState, me: number | null): string {
  if (g.phase === 'done') {
    const rk = ranking(g);
    return `<div class="panel"><h3>최종 결과</h3><table class="rank">${rk
      .map((r) => `<tr><td>${r.rank}위</td><td style="color:${COLORS[r.p]}">${esc(g.players[r.p]!.name)}</td><td>${r.score}점</td><td>코어 ${g.players[r.p]!.cores} · 설계자 점수 ${g.players[r.p]!.dp}</td></tr>`)
      .join('')}</table>
      <div class="actions">${session?.online ? (net.state.room?.host === net.state.room?.me ? '<button class="primary" data-act="rematch">대기실로 (다시 하기)</button>' : '<p class="hint">방장이 다시 하기를 고를 수 있습니다.</p>') : '<button class="primary" data-act="again">다시 하기</button>'}<button data-act="quit">처음으로</button></div></div>`;
  }
  if (me == null) {
    const cur = g.phase === 'exec' ? currentBot(g) : null;
    return `<div class="panel muted">${cur != null ? `<b style="color:${COLORS[cur]}">${esc(g.players[cur]!.name)}</b> 로봇 실행 중…` : '봇들이 설계 중…'}</div>`;
  }
  const mine = g.players[me]!;
  if (session?.online && sentKey === stepKey(g)) {
    if (net.state.error) sentKey = '';
    else return `<div class="panel muted">보내는 중…</div>`;
  }
  if (g.phase === 'design') {
    if (mine.pending) return `<div class="panel muted">놓기를 마쳤습니다. 다른 설계자를 기다리는 중…</div>`;
    const key = `${g.round}:${mine.hand.join(',')}`;
    if (key !== pickKey) {
      pickKey = key;
      pick = [null, null, null];
    }
    const t = targetOf(g, me);
    const hand = mine.hand
      .map((inst) => {
        const used = pick.includes(inst);
        const truth = check(g, t, tileOf(g, inst).cond);
        return `<button class="hand-tile${used ? ' used' : ''}" data-act="pick" data-inst="${inst}" ${used ? 'disabled' : ''}>${tileHtml(g, inst)}<span class="truth ${truth ? 'yes' : 'no'}">지금 ${truth ? '참' : '거짓'}</span></button>`;
      })
      .join('');
    const slots = pick
      .map((inst, k) => `<button class="slot-pick" data-act="unpick" data-slot="${k}"><em>슬롯 ${k + 1}</em>${tileHtml(g, inst)}</button>`)
      .join('');
    return `<div class="panel">
      <h3>설계: <span style="color:${COLORS[t]}">${esc(g.players[t]!.name)}</span> 로봇의 두뇌를 짜세요</h3>
      <p class="hint">타일을 누르면 빈 슬롯에 순서대로 들어갑니다. 슬롯 1이 먼저 검사됩니다. 로봇이 규칙 때문에 충돌하면, 또는 조종사가 에너지 2개를 쓰면 내가 1점.</p>
      <div class="hand">${hand}</div>
      <div class="pick-slots">${slots}</div>
      <div class="actions"><button class="primary" data-act="confirm" ${pick.every((x) => x != null) ? '' : 'disabled'}>확정</button><button class="link" data-act="clear">다시 고르기</button></div>
    </div>`;
  }
  const cur = currentBot(g);
  if (cur !== me) {
    return `<div class="panel muted"><b style="color:${COLORS[cur]}">${esc(g.players[cur]!.name)}</b> 로봇의 실행 차례입니다${g.players[cur]!.kind === 'human' ? ' — 조종사가 고르는 중…' : '…'}</div>`;
  }
  const fire = wouldFire(g, me);
  const legal = legalInterventions(g);
  const can = (iv: Intervention) => legal.some((l) => JSON.stringify(l) === JSON.stringify(iv));
  const btn = (iv: Intervention, label: string) =>
    `<button data-act="iv" data-iv='${JSON.stringify(iv)}' ${can(iv) ? '' : 'disabled'}>${label}</button>`;
  return `<div class="panel">
    <h3>내 로봇의 실행 차례</h3>
    <p class="hint">지금 그대로 두면: <b>${fire >= 0 ? `슬롯 ${fire + 1} 발동 — ${tileOf(g, mine.brain[fire]!).text}` : '발동하는 규칙 없음 → 1칸 전진'}</b></p>
    <p class="hint">개입은 에너지 1 (보유 ${mine.energy}). 쓴 에너지는 설계자 쪽에 쌓여 2개마다 설계자 1점.</p>
    <div class="iv-grid">
      <button class="primary" data-act="iv" data-iv='{"k":"none"}'>${ivText({ k: 'none' })}</button>
      ${btn({ k: 'turn', dir: 'L' }, '좌회전')}${btn({ k: 'turn', dir: 'R' }, '우회전')}${btn({ k: 'thrust' }, '추진 (1칸 전진)')}
      ${[0, 1, 2].map((k) => btn({ k: 'block', slot: k }, `차단 슬롯 ${k + 1}`)).join('')}
    </div>
  </div>`;
}

// ── 입력 ────────────────────────────────────────────────

root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-go],[data-act],[data-set]');
  if (!el) return;
  if (el.dataset.go) return go(el.dataset.go as Screen);
  if (el.dataset.set) {
    const v = el.dataset.v!;
    const name = el.dataset.set;
    if (name === 'n') setup.n = Number(v);
    else if (name === 'level') setup.level = v as BotLevel;
    else if (name === 'delay') setup.delay = Number(v);
    else if (name === 'sn') sim.n = Number(v);
    else if (name === 'sg') sim.games = Number(v);
    else if (name === 'sl') sim.level = v as BotLevel;
    readInputs();
    return render();
  }
  const s = session;
  const g = s?.game();
  switch (el.dataset.act) {
    case 'start-local':
      readInputs();
      return startLocal(false);
    case 'watch':
      readInputs();
      return startLocal(true);
    case 'again':
      return startLocal(s?.mySeat() == null);
    case 'quit':
      if (s?.online) net.leave();
      return go('home');
    case 'run-sim':
      return runSim();
    case 'pick': {
      const k = pick.indexOf(null);
      if (k >= 0) pick[k] = Number(el.dataset.inst);
      return render();
    }
    case 'unpick':
      pick[Number(el.dataset.slot)] = null;
      return render();
    case 'clear':
      pick = [null, null, null];
      return render();
    case 'confirm':
      if (g && pick.every((x) => x != null)) s!.design(pick as number[]);
      return;
    case 'iv':
      if (g) s!.intervene(JSON.parse(el.dataset.iv!));
      return;
    case 'resume':
      screen = 'online';
      net.resume();
      return render();
    case 'create':
      readInputs();
      return net.send({ t: 'create', name: onlineForm.name });
    case 'join':
      readInputs();
      if (!ROOM_CODE_RE.test(onlineForm.code)) {
        net.state.error = '방 코드는 4자리입니다.';
        return render();
      }
      return net.send({ t: 'join', code: onlineForm.code, name: onlineForm.name });
    case 'add-bot':
      return net.send({ t: 'add-bot' });
    case 'bot-level':
      return net.send({ t: 'bot-level', seat: Number(el.dataset.seat) });
    case 'remove-seat':
      return net.send({ t: 'remove-seat', seat: Number(el.dataset.seat) });
    case 'ostart':
      return net.send({ t: 'start' });
    case 'oleave':
      net.leave();
      return go('home');
    case 'rematch':
      return net.send({ t: 'rematch' });
    case 'copy':
      navigator.clipboard?.writeText(el.dataset.link!).then(
        () => (el.textContent = '복사했습니다'),
        () => prompt('초대 링크', el.dataset.link!),
      );
      return;
  }
});

root.addEventListener('toggle', (ev) => {
  if ((ev.target as HTMLElement).id === 'logbox') logOpen = (ev.target as HTMLDetailsElement).open;
}, true);

function readInputs() {
  const name = root.querySelector<HTMLInputElement>('#name');
  if (name) setup.name = name.value.trim().slice(0, 10);
  const oname = root.querySelector<HTMLInputElement>('#oname');
  if (oname) onlineForm.name = oname.value.trim().slice(0, 10);
  const ocode = root.querySelector<HTMLInputElement>('#ocode');
  if (ocode) onlineForm.code = ocode.value.trim().toUpperCase();
}

export function boot() {
  if (onlineForm.code) screen = 'online';
  else if (net.hasSaved) {
    screen = 'online';
    net.resume();
  }
  render();
}
