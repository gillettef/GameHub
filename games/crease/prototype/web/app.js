// CREASE 웹 시뮬레이터 (iPhone 세로 화면 우선)
import { isCoveredCol, cellName, key } from './engine.js';
import { Board, COLORS, NAMES } from './board.js';
import { LocalGame, OnlineGame, createRoom, joinRoom, legalSteps, legalFolds, RULES } from './games.js';
import { runGame } from './sim.js';

const app = document.getElementById('app');
let current = null; // 진행 중인 게임 컨트롤러

// ------------------------------------------------------------ 도우미
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`crease.${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`crease.${k}`, JSON.stringify(v)); } catch { /* 사생활 보호 모드 */ } },
};
function view(html) {
  if (current) { current.stop?.(); current = null; }
  closeSheet();
  app.innerHTML = html;
  window.scrollTo(0, 0);
}
function on(sel, ev, fn) { app.querySelectorAll(sel).forEach((e) => e.addEventListener(ev, fn)); }
function seg(name, options, value) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(value)}">${label}</button>`).join('')}</div>`;
}
function bindSeg(root, onChange) {
  root.querySelectorAll('.seg').forEach((s) => s.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    s.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onChange(s.dataset.seg, b.dataset.v);
  }));
}
function sheet(html) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
  document.body.appendChild(bg);
  return bg.querySelector('.sheet');
}
function closeSheet() { document.querySelectorAll('.sheet-bg').forEach((e) => e.remove()); }
function topbar(title, right = '') {
  return `<div class="topbar"><button class="icon-btn" data-back aria-label="뒤로">‹</button><h2>${title}</h2>${right || '<span style="width:44px"></span>'}</div>`;
}
function seatRows(n, render) {
  return Array.from({ length: n }, (_, i) => render(i)).join('');
}

// ------------------------------------------------------------ 홈
function home() {
  history.replaceState(null, '', location.pathname);
  view(`
    <div class="hero"><h1 class="logo">CREASE</h1><p>지도를 접어 먼 칸을 잇는 길잡이들의 경주</p></div>
    <div class="menu">
      <button data-go="local"><span class="ico">🧭</span><div><b>한 기기에서 플레이</b><span>나 vs 봇, 친구와 번갈아 하기</span></div><i>›</i></button>
      <button data-go="online"><span class="ico">🌐</span><div><b>온라인 대전</b><span>방 코드로 다른 기기의 친구와</span></div><i>›</i></button>
      <button data-go="watch"><span class="ico">🤖</span><div><b>봇 대전 관전</b><span>봇끼리 겨루는 모습을 지켜보기</span></div><i>›</i></button>
      <button data-go="sim"><span class="ico">📊</span><div><b>밸런스 시뮬레이션</b><span>봇으로 수백 판 돌려 좌석 승률 보기</span></div><i>›</i></button>
      <button data-go="rules"><span class="ico">📜</span><div><b>규칙 한눈에</b><span>3분 안에 읽는 요약</span></div><i>›</i></button>
    </div>
    <p class="muted" style="text-align:center;margin-top:18px">룰북 v1.3 기준 · 2~4인</p>`);
  on('[data-go]', 'click', (e) => ({ local: localSetup, online: () => onlineHome(), watch: watchSetup, sim: simulate, rules: rulesPage })[e.currentTarget.dataset.go]());
}

// ------------------------------------------------------------ 로컬 게임 설정
function localSetup() {
  const cfg = store.get('local', { n: 2, kinds: ['human', 'bot', 'bot', 'bot'] });
  view(`${topbar('한 기기에서 플레이')}
    <div class="stack" style="margin-top:8px">
      <div class="card stack">
        <div id="nSeg"><div class="label">인원</div>${seg('n', [[2, '2인'], [3, '3인'], [4, '4인']], cfg.n)}</div>
        <div><div class="label">자리 (차례 순서)</div><div class="stack" id="seats" style="gap:8px"></div></div>
      </div>
      <p class="muted">사람 자리가 여럿이면 기기를 돌려 가며 합니다. 봇 자리는 자동으로 진행됩니다.</p>
    </div>
    <div style="margin-top:auto;padding-top:16px"><button class="btn primary block end-btn" id="go">시작</button></div>`);
  const drawSeats = () => {
    app.querySelector('#seats').innerHTML = seatRows(cfg.n, (i) => `
      <div class="seat"><span class="dot" style="background:${COLORS[i]}"></span><span class="nm">${i + 1}번째 · ${NAMES[i]}</span>
      ${seg(`k${i}`, [['human', '사람'], ['bot', '봇']], cfg.kinds[i])}</div>`);
    bindSeg(app.querySelector('#seats'), (name, v) => { cfg.kinds[Number(name.slice(1))] = v; });
  };
  bindSeg(app.querySelector('#nSeg'), (_, v) => { cfg.n = Number(v); drawSeats(); });
  drawSeats();
  on('[data-back]', 'click', home);
  on('#go', 'click', () => {
    store.set('local', cfg);
    const seats = Array.from({ length: cfg.n }, (_, i) => ({ kind: cfg.kinds[i], name: cfg.kinds[i] === 'bot' ? `${NAMES[i]} 봇` : NAMES[i] }));
    playLocal({ n: cfg.n, seats });
  });
}

function playLocal(opts) {
  const g = new LocalGame(opts);
  gameScreen(g, { title: '한 기기에서', again: () => playLocal(opts) });
  g.start();
}

// ------------------------------------------------------------ 봇 대전 관전
const PROFILES = [['balanced', '균형'], ['greedy', '독주'], ['spiteful', '방해']];
const PROFILE_LABEL = Object.fromEntries(PROFILES);
function watchSetup() {
  const cfg = store.get('watch', { n: 4, profiles: ['balanced', 'greedy', 'spiteful', 'balanced'] });
  view(`${topbar('봇 대전 관전')}
    <div class="stack" style="margin-top:8px">
      <div class="card stack">
        <div id="nSeg"><div class="label">인원</div>${seg('n', [[2, '2인'], [3, '3인'], [4, '4인']], cfg.n)}</div>
        <div><div class="label">봇 성향</div><div class="stack" id="seats" style="gap:8px"></div></div>
      </div>
      <p class="muted"><b>균형</b> 자기 길과 견제를 함께 · <b>독주</b> 자기 길만 · <b>방해</b> 앞선 상대 가리기에 집중</p>
    </div>
    <div style="margin-top:auto;padding-top:16px"><button class="btn primary block end-btn" id="go">관전 시작</button></div>`);
  const drawSeats = () => {
    app.querySelector('#seats').innerHTML = seatRows(cfg.n, (i) => `
      <div class="seat"><span class="dot" style="background:${COLORS[i]}"></span><span class="nm">${NAMES[i]}</span>
      ${seg(`p${i}`, PROFILES, cfg.profiles[i])}</div>`);
    bindSeg(app.querySelector('#seats'), (name, v) => { cfg.profiles[Number(name.slice(1))] = v; });
  };
  bindSeg(app.querySelector('#nSeg'), (_, v) => { cfg.n = Number(v); drawSeats(); });
  drawSeats();
  on('[data-back]', 'click', home);
  on('#go', 'click', () => {
    store.set('watch', cfg);
    const opts = { n: cfg.n, speed: 1, seats: Array.from({ length: cfg.n }, (_, i) => ({ kind: 'bot', profile: cfg.profiles[i], name: `${NAMES[i]}·${PROFILE_LABEL[cfg.profiles[i]]}` })) };
    const run = () => { const g = new LocalGame(opts); gameScreen(g, { title: '봇 대전 관전', again: run }); g.start(); };
    run();
  });
}

// ------------------------------------------------------------ 게임 화면 (로컬·온라인 공용)
function gameScreen(g, { title, again }) {
  view(`${topbar(esc(title), '<button class="icon-btn" id="logBtn" aria-label="기록">☰</button>')}
    <div class="game">
      <div class="turn" id="turn"></div>
      <div class="players" id="players"></div>
      <div class="board-wrap"><svg id="board" role="img" aria-label="접기 보드"></svg><div id="previewTag"></div></div>
      <div class="toast" id="toast" aria-live="polite"></div>
      <ul class="feed" id="feed"></ul>
      <div class="controls" id="controls"></div>
    </div>`);
  current = g;
  let pending = null; // 미리보기 중인 접기
  let shownOver = false;
  let lastLogLen = -1;
  const board = new Board(app.querySelector('#board'), {
    onCell: (c, r) => {
      if (pending) { pending = null; render(); return; }
      if (!g.canAct()) return;
      if (!legalSteps(g.state).some(([a, b]) => a === c && b === r)) return;
      send({ type: 'step', to: [c, r] });
    },
  });

  async function send(a) {
    pending = null;
    try { await g.act(a); } catch (e) { flash(e.message); }
    render();
  }
  function flash(msg) { app.querySelector('#toast').innerHTML = `<b>${esc(msg)}</b>`; }

  function render() {
    const s = g.state;
    if (!s || !app.querySelector('#turn')) return;
    const cur = s.current;
    const seat = g.seats[cur] || {};
    const canAct = g.canAct();
    const mineCount = g.seats.filter((_, i) => g.mine(i)).length;
    // 차례 표시
    const meTag = g.kind === 'online' && g.mine(cur) ? ' (나)' : '';
    const steps = s.turnMaxSteps ?? RULES.moveSteps;
    const turnEl = app.querySelector('#turn');
    turnEl.style.setProperty('--turn', COLORS[cur]);
    turnEl.innerHTML = s.over ? '<div class="who"><b>게임 끝</b><span>결과를 확인하세요</span></div>' : `
      <div class="who"><b>${esc(seat.name)}${meTag} 차례</b><span>${s.activeIds ? '동점 결승 · ' : ''}${s.round}라운드 · 목표 ${RULES.target[s.n]}점</span></div>
      <div class="pips" aria-label="남은 걸음 ${steps - s.turnSteps}">${Array.from({ length: steps }, (_, i) => `<span class="pip${i < s.turnSteps ? ' used' : ''}"></span>`).join('')}</div>
      <span class="fold-chip${s.turnFolded ? ' used' : ''}">접기</span>`;
    // 플레이어
    const pl = app.querySelector('#players');
    pl.style.setProperty('--n', s.n);
    pl.innerHTML = s.players.map((p, i) => `
      <div class="pl${i === cur && !s.over ? ' active' : ''}${g.seats[i] && g.seats[i].online === false ? ' off' : ''}" style="--c:${COLORS[i]}">
        <div class="nm">${esc(g.seats[i]?.name)}${g.kind === 'online' && g.mine(i) ? ' (나)' : ''}</div>
        <div class="sc">${p.score}<small> /${RULES.target[s.n]}</small></div>
        <div class="cr">${'★'.repeat(p.carried)}${'☆'.repeat(Math.max(0, RULES.carryLimit - p.carried))}</div>
      </div>`).join('');
    // 보드
    const legal = canAct && !pending ? legalSteps(s) : [];
    const previewFold = pending ? { ...s.fold, [pending.side]: pending.type === 'fold' ? pending.width : 0 } : null;
    const lastAct = g.log.at(-1);
    const fresh = g.log.length !== lastLogLen;
    lastLogLen = g.log.length;
    board.render(s, { legal, previewFold, focus: cur, lastSpawn: fresh && lastAct?.kind === 'spawn' ? s.lastSpawn : null });
    app.querySelector('#previewTag').innerHTML = pending ? '<div class="preview-tag">미리보기 · 같은 버튼을 한 번 더 눌러 확정</div>' : '';
    // 알림 줄
    const toast = app.querySelector('#toast');
    if (canAct && isCoveredCol(s.fold, s.players[cur].c)) toast.innerHTML = '<b>부재 중</b> · 날개를 펼쳐야 움직일 수 있어요';
    else if (g.kind === 'online' && !g.connected) toast.innerHTML = '<b>다시 연결하는 중…</b>';
    else toast.innerHTML = '';
    app.querySelector('#feed').innerHTML = g.log.slice(-6).reverse()
      .map((l) => `<li class="${l.kind || ''}">${esc(l.text).replace(/&lt;(\/?)b&gt;/g, '<$1b>')}</li>`).join('');
    // 조작부
    const ctl = app.querySelector('#controls');
    if (s.over) {
      ctl.innerHTML = '<button class="btn primary block end-btn" id="resultBtn">결과 보기</button>';
      ctl.querySelector('#resultBtn').onclick = showResult;
      if (!shownOver) { shownOver = true; setTimeout(showResult, 700); }
    } else if (g.spectate) {
      ctl.innerHTML = `<div class="playback">
        <button class="btn" id="pause" aria-label="${g.paused ? '재생' : '일시정지'}">${g.paused ? '▶' : '❚❚'}</button>
        ${seg('speed', [[1, '1×'], [2, '2×'], [4, '4×']], g.speed)}
        <button class="btn" id="again">새 판</button></div>`;
      ctl.querySelector('#pause').onclick = () => g.setPaused(!g.paused);
      ctl.querySelector('#again').onclick = again;
      bindSeg(ctl, (_, v) => g.setSpeed(Number(v)));
    } else if (canAct) {
      const folds = legalFolds(s);
      const has = (a) => folds.some((b) => b.type === a.type && b.side === a.side && (a.type === 'unfold' || b.width === a.width));
      const btn = (a, label) => {
        const isPending = pending && pending.type === a.type && pending.side === a.side && pending.width === a.width;
        return `<button data-a='${JSON.stringify(a)}' ${has(a) ? '' : 'disabled'} class="${isPending ? 'pending' : ''}">${label}</button>`;
      };
      const row = (side, label) => `<div class="fold-row"><span class="side">${label}</span>
        ${[1, 2, 3].map((w) => btn({ type: 'fold', side, width: w }, `${w}열`)).join('')}
        ${btn({ type: 'unfold', side }, '펼치기')}</div>`;
      ctl.innerHTML = `${row('L', '왼쪽')}${row('R', '오른쪽')}
        <button class="btn ${pending ? '' : 'primary '}block end-btn" id="end">${pending ? '미리보기 취소' : '차례 끝내기'}</button>`;
      ctl.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
        const a = JSON.parse(b.dataset.a);
        const same = pending && pending.type === a.type && pending.side === a.side && pending.width === a.width;
        if (same) send(a); else { pending = a; render(); }
      }));
      ctl.querySelector('#end').onclick = () => { if (pending) { pending = null; render(); } else send({ type: 'end' }); };
    } else {
      const who = esc(seat.name);
      const msg = seat.kind === 'bot' ? `${who} 생각 중…` : (mineCount === 0 ? `${who} 차례` : `${who}님의 차례를 기다리는 중`);
      ctl.innerHTML = `<div class="waiting">${msg}</div>`;
    }
  }

  function showResult() {
    const s = g.state;
    const ranked = [...s.players].sort((a, b) => b.score - a.score || b.carried - a.carried);
    const win = s.winners || ranked.filter((p) => p.score === ranked[0].score && p.carried === ranked[0].carried).map((p) => p.id);
    const el = sheet(`<div class="result">
      <div class="trophy">🏆</div>
      <h3>${win.map((i) => esc(g.seats[i].name)).join(', ')} 승리${win.length > 1 ? ' (공동)' : ''}</h3>
      <div class="rank">${ranked.map((p) => `<div style="--c:${COLORS[p.id]}"><span>${esc(g.seats[p.id].name)}</span><b>${p.score}점</b></div>`).join('')}</div>
      <div class="stack">${again ? '<button class="btn primary block" id="again">다시 하기</button>' : ''}<button class="btn block" id="home">홈으로</button></div></div>`);
    el.querySelector('#again')?.addEventListener('click', () => { closeSheet(); again(); });
    el.querySelector('#home').addEventListener('click', () => { if (g.kind === 'online') store.set('online', null); home(); });
  }

  app.querySelector('#logBtn').onclick = () => {
    sheet(`<h3>기록</h3><ul class="log">${[...g.log].reverse().map((l) => `<li>${esc(l.text).replace(/&lt;(\/?)b&gt;/g, '<$1b>')}</li>`).join('')}</ul>`);
  };
  on('[data-back]', 'click', () => {
    if (g.kind === 'online' || g.state?.over || g.spectate || g.seats.every((x) => x.kind !== 'human') || confirm('게임을 그만두고 나갈까요?')) home();
  });
  g.subscribe(render);
  render();
  return { render };
}

// ------------------------------------------------------------ 온라인
function onlineHome(prefill = '') {
  const saved = store.get('online', null);
  const cfg = { n: 2 };
  view(`${topbar('온라인 대전')}
    <div class="stack" style="margin-top:8px">
      <div class="card stack">
        <div><div class="label">내 이름</div><input class="field" id="name" maxlength="12" placeholder="이름 (12자 이내)" value="${esc(store.get('name', ''))}" autocomplete="nickname" enterkeyhint="done"></div>
      </div>
      <div class="card stack">
        <div class="label" style="margin:0">방 참가</div>
        <div class="row"><input class="field" id="code" maxlength="4" placeholder="코드 4자리" value="${esc(prefill)}" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" style="text-transform:uppercase;letter-spacing:6px;font-weight:700">
        <button class="btn primary" id="join" style="flex:none">참가</button></div>
        ${saved && !prefill ? `<button class="btn block" id="rejoin">최근 방 ${esc(saved.code)} 다시 들어가기</button>` : ''}
      </div>
      <div class="card stack">
        <div class="label" style="margin:0">새 방 만들기</div>
        ${seg('n', [[2, '2인'], [3, '3인'], [4, '4인']], cfg.n)}
        <div class="muted">대기실에서 빈자리를 봇으로 바꿀 수 있고, 시작할 때 남은 빈자리도 봇이 채웁니다. 연결이 끊긴 사람의 차례는 45초 뒤 봇이 대신합니다.</div>
        <button class="btn primary block" id="create">방 만들기</button>
      </div>
      <div class="muted" id="err" style="color:var(--danger);text-align:center"></div>
    </div>`);
  bindSeg(app, (_, v) => { cfg.n = Number(v); });
  const name = () => { const v = app.querySelector('#name').value.trim(); store.set('name', v); return v; };
  const fail = (e) => { app.querySelector('#err').textContent = e.message; };
  on('[data-back]', 'click', home);
  on('#create', 'click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { enterRoom(await createRoom({ n: cfg.n, name: name() })); } catch (err) { fail(err); b.disabled = false; }
  });
  const join = async () => {
    const code = app.querySelector('#code').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { fail(new Error('방 코드는 영문 4자리입니다')); return; }
    try { enterRoom(await joinRoom(code, name())); } catch (err) { fail(err); }
  };
  on('#join', 'click', join);
  on('#code', 'keydown', (e) => { if (e.key === 'Enter') join(); });
  on('#rejoin', 'click', () => enterRoom(saved));
}

function enterRoom({ code, token }) {
  store.set('online', { code, token });
  history.replaceState(null, '', `?room=${code}`);
  view('<div class="waiting" style="margin-top:40vh">연결 중…</div>');
  const g = new OnlineGame({ code, token });
  current = g;
  let mode = null;
  let screen = null;
  g.subscribe(() => {
    if (!g.snap) return;
    if (g.status === 'lobby') {
      if (mode !== 'lobby') { mode = 'lobby'; screen = lobby(g); } else screen.render();
    } else if (mode !== 'game') {
      mode = 'game';
      current = null; // 화면만 바꾸고 연결은 유지한다
      screen = gameScreen(g, { title: `방 ${code}`, again: null });
    }
  });
  g.connect();
  // 방이 사라졌으면(서버 재시작·만료) 안내하고 돌아간다
  setTimeout(() => {
    if (g.snap) return;
    fetch(`api/rooms/${code}?token=${encodeURIComponent(token)}`).then((r) => r.json()).then((d) => {
      if (d.error && current === g) { store.set('online', null); g.stop(); onlineHome(); app.querySelector('#err').textContent = d.error; }
    }).catch(() => {});
  }, 2500);
}

function lobby(g) {
  // view()가 current를 멈추지 않도록 잠시 떼어 둔다
  current = null;
  view(`${topbar('대기실')}
    <div class="stack" style="margin-top:8px">
      <div class="card" style="text-align:center">
        <div class="label">방 코드</div>
        <div class="code">${esc(g.code)}</div>
        <div class="row" style="margin-top:8px"><input class="field" id="link" readonly value="${esc(`${location.origin}${location.pathname}?room=${g.code}`)}" style="font-size:14px"><button class="btn" id="share" style="flex:none">공유</button></div>
      </div>
      <div class="card stack"><div class="label" style="margin:0">자리 (차례 순서)</div><div class="stack" id="seats" style="gap:8px"></div></div>
      <div class="muted" id="err" style="text-align:center"></div>
    </div>
    <div style="margin-top:auto;padding-top:16px" id="startArea"></div>`);
  current = g;
  on('[data-back]', 'click', () => { store.set('online', null); home(); });
  on('#share', 'click', async () => {
    const url = app.querySelector('#link').value;
    try {
      if (navigator.share) await navigator.share({ title: 'CREASE 대전 초대', text: `CREASE 방 코드 ${g.code}`, url });
      else { const i = app.querySelector('#link'); i.focus(); i.select(); i.setSelectionRange(0, 999); document.execCommand('copy'); app.querySelector('#err').textContent = '링크를 복사했어요'; }
    } catch { /* 공유 취소 */ }
  });
  function render() {
    if (!app.querySelector('#seats')) return;
    const host = g.you === 0;
    app.querySelector('#seats').innerHTML = g.seats.map((s, i) => `
      <div class="seat"><span class="dot" style="background:${COLORS[i]}"></span>
        <span class="nm">${s.kind === 'open' ? '<span class="muted">빈자리</span>' : esc(s.name)}${i === g.you ? ' (나)' : ''}${i === 0 ? ' 👑' : ''}</span>
        ${host && i > 0 && s.kind !== 'human' ? `<button data-seat="${i}" data-kind="${s.kind === 'bot' ? 'open' : 'bot'}">${s.kind === 'bot' ? '봇 빼기' : '봇 넣기'}</button>` : ''}
        ${s.kind === 'human' && i !== g.you ? `<span class="muted">${s.online ? '접속' : '끊김'}</span>` : ''}
      </div>`).join('');
    app.querySelectorAll('[data-seat]').forEach((b) => b.addEventListener('click', () => g.setSeat(Number(b.dataset.seat), b.dataset.kind).catch((e) => { app.querySelector('#err').textContent = e.message; })));
    const open = g.seats.filter((s) => s.kind === 'open').length;
    app.querySelector('#startArea').innerHTML = host
      ? `<button class="btn primary block end-btn" id="start">${open ? `시작 (빈자리 ${open}개는 봇)` : '시작'}</button>`
      : '<div class="waiting">방장이 시작하기를 기다리는 중…</div>';
    app.querySelector('#start')?.addEventListener('click', (e) => { e.currentTarget.disabled = true; g.start().catch((err) => { app.querySelector('#err').textContent = err.message; }); });
  }
  render();
  return { render };
}

// ------------------------------------------------------------ 시뮬레이션
function simulate() {
  const cfg = store.get('sim', { n: 4, games: 100, profiles: ['balanced', 'balanced', 'balanced', 'balanced'] });
  view(`${topbar('밸런스 시뮬레이션')}
    <div class="stack" style="margin-top:8px">
      <div class="card stack">
        <div id="nSeg"><div class="label">인원</div>${seg('n', [[2, '2인'], [3, '3인'], [4, '4인']], cfg.n)}</div>
        <div id="gSeg"><div class="label">판 수</div>${seg('games', [[50, '50'], [100, '100'], [300, '300'], [1000, '1000']], cfg.games)}</div>
        <div><div class="label">봇 성향 (차례 순서)</div><div class="stack" id="seats" style="gap:8px"></div></div>
        <button class="btn primary block" id="run">실행</button>
      </div>
      <div class="card stack" id="out" hidden></div>
    </div>`);
  const drawSeats = () => {
    app.querySelector('#seats').innerHTML = seatRows(cfg.n, (i) => `
      <div class="seat"><span class="dot" style="background:${COLORS[i]}"></span><span class="nm">${i + 1}번째</span>${seg(`p${i}`, PROFILES, cfg.profiles[i])}</div>`);
    bindSeg(app.querySelector('#seats'), (name, v) => { cfg.profiles[Number(name.slice(1))] = v; });
  };
  bindSeg(app.querySelector('#nSeg'), (_, v) => { cfg.n = Number(v); drawSeats(); });
  bindSeg(app.querySelector('#gSeg'), (_, v) => { cfg.games = Number(v); });
  drawSeats();
  let token = 0;
  on('[data-back]', 'click', () => { token++; home(); });
  on('#run', 'click', async (e) => {
    store.set('sim', cfg);
    const my = ++token;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '실행 중…';
    const out = app.querySelector('#out');
    out.hidden = false;
    const { n, games } = cfg;
    const profiles = cfg.profiles.slice(0, n);
    const wins = new Array(n).fill(0);
    let turns = 0; let ties = 0; let folds = 0; let covers = 0;
    const seed0 = Math.floor(Math.random() * 1e6);
    const drawOut = (done) => {
      out.innerHTML = `
        <div class="row" style="justify-content:space-between"><b>결과</b><span class="muted">${done} / ${games}판</span></div>
        <div class="progress"><i style="width:${(done / games) * 100}%"></i></div>
        ${wins.map((w, i) => `<div><div class="label">${i + 1}번째 · ${PROFILE_LABEL[profiles[i]]} · 닻 ${cellName(...RULES.anchors[n][i])}</div>
          <div class="bar" style="--c:${COLORS[i]}"><i style="width:${(w / done) * 100}%"></i><span>${((w / done) * 100).toFixed(1)}%</span></div></div>`).join('')}
        <div class="stats">
          <div class="stat"><b>${(turns / done).toFixed(1)}</b><span>평균 차례 수</span></div>
          <div class="stat"><b>약 ${Math.round((turns / done) * 80 / 60)}분</b><span>예상 시간 (차례당 80초)</span></div>
          <div class="stat"><b>${(folds / Math.max(1, turns)).toFixed(2)}</b><span>차례당 접기·펼치기</span></div>
          <div class="stat"><b>${((ties / done) * 100).toFixed(1)}%</b><span>공동 승리</span></div>
          <div class="stat"><b>${(covers / done).toFixed(1)}</b><span>한 판의 가리기 횟수</span></div>
          <div class="stat"><b>${(100 / n).toFixed(1)}%</b><span>완전히 공정한 좌석 승률</span></div>
        </div>`;
    };
    for (let i = 0; i < games; i++) {
      if (my !== token) return;
      const r = runGame(n, seed0 + i, RULES, profiles);
      for (const w of r.winners) wins[w] += 1 / r.winners.length;
      if (r.winners.length > 1) ties++;
      turns += r.stats.turns; folds += r.stats.folds + r.stats.unfolds; covers += r.stats.coverEvents;
      if (i % 5 === 4 || i === games - 1) { drawOut(i + 1); await new Promise((res) => setTimeout(res, 0)); }
    }
    btn.disabled = false;
    btn.textContent = '다시 실행';
  });
}

// ------------------------------------------------------------ 규칙 요약
function rulesPage() {
  view(`${topbar('규칙 한눈에')}
    <div class="card" style="margin-top:8px"><ol class="rules">
      <li><b>목표</b> · 별빛 조각을 주워 내 닻 칸(색 테두리)으로 가져오면 1점. 목표 점수(2인 10 · 3인 9 · 4인 7)에 닿으면 그 라운드를 마치고 끝.</li>
      <li><b>내 차례</b> · 최대 3걸음 이동 + 접기나 펼치기 1번. 접기는 걸음 사이 언제든 끼워 넣을 수 있다.</li>
      <li><b>접기</b> · 보드 왼쪽이나 오른쪽 끝을 1~3열 접어 넘긴다. 양쪽 폭의 합은 4까지.</li>
      <li><b>이음</b> · 접으면 맨 끝 열이 안쪽 열 바로 옆에 붙는다(금색 선). 왼쪽 3열을 접으면 A열과 G열이 이웃!</li>
      <li><b>부재</b> · 날개 아래 깔린 말과 조각은 잠시 사라진다(누운 말, 회색 조각). 부재인 말은 못 움직이니 내 차례에 펼쳐서 빠져나온다.</li>
      <li><b>별똥별</b> · 차례가 끝날 때마다 새 조각이 떨어진다. 가려진 칸에 떨어지면 그 날개가 펼쳐진다(날개 터뜨리기).</li>
      <li><b>들고 다니기</b> · 조각은 2개까지. 지나가기만 해도 줍고, 닻 칸에 들어가면 모두 득점.</li>
      <li><b>동점</b> · 동점인 사람끼리 한 라운드 더.</li>
    </ol></div>
    <div style="margin-top:auto;padding-top:16px"><a class="btn block" href="https://github.com/gillettef/Crease/blob/dev/rules/rulebook.md" target="_blank" rel="noopener">전체 룰북 보기</a></div>`);
  on('[data-back]', 'click', home);
}

// ------------------------------------------------------------ 시작
void key;
const params = new URLSearchParams(location.search);
const roomParam = params.get('room');
const quickN = (v) => Math.min(4, Math.max(2, Number(v) || 2));
if (params.has('watch')) {
  // 바로 봇 대전 관전: ?watch=4
  const n = quickN(params.get('watch'));
  const opts = { n, speed: 1, seats: Array.from({ length: n }, (_, i) => ({ kind: 'bot', name: `${NAMES[i]}·균형` })) };
  const run = () => { const g = new LocalGame(opts); gameScreen(g, { title: '봇 대전 관전', again: run }); g.start(); };
  run();
} else if (params.has('play')) {
  // 바로 나 vs 봇: ?play=3
  const n = quickN(params.get('play'));
  playLocal({ n, seats: Array.from({ length: n }, (_, i) => ({ kind: i ? 'bot' : 'human', name: i ? `${NAMES[i]} 봇` : NAMES[i] })) });
} else if (roomParam && /^[A-Za-z]{4}$/.test(roomParam)) {
  const saved = store.get('online', null);
  if (saved && saved.code === roomParam.toUpperCase()) enterRoom(saved);
  else onlineHome(roomParam.toUpperCase());
} else {
  home();
}
