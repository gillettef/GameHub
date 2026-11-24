// SIGHTLINE 웹 클라이언트. 서버가 보낸 내 좌석 화면 정보(view)만 그린다.
import { SEAT_INFO, HEDGES, PAVILION, RENDEZVOUS, DV, DIRS, cellName } from './engine/board.js';
import { legalMoves, accusableIds, isCovered } from './engine/rules.js';

const $app = document.getElementById('app');
const C = 60; // 칸 크기 (SVG 단위)
const B = C * 7;
const ROT = { S: 0, E: 90, N: 180, W: 270 };

const ui = { payload: null, es: null, sel: null, mode: 'move', session: null, busy: false, tab: 'me', lastTurnSeq: null };

// ---------- 하단 시트 (iOS 기본 confirm 대신) ----------
/** buttons: [{label, value, primary}] → 고른 value, 닫으면 null */
function sheet(text, buttons) {
  const d = document.getElementById('sheet');
  d.querySelector('.sheet-text').textContent = text;
  const box = d.querySelector('.sheet-buttons');
  box.innerHTML = buttons.map((b, k) => `<button type="button" data-k="${k}" class="${b.primary ? 'primary' : ''}">${esc(b.label)}</button>`).join('')
    + '<button type="button" class="ghost" data-k="-1">취소</button>';
  return new Promise((resolve) => {
    const done = (v) => { d.close(); d.onclick = null; resolve(v); };
    d.onclick = (e) => {
      if (e.target === d) { done(null); return; }
      const b = e.target.closest('[data-k]');
      if (b) done(+b.dataset.k < 0 ? null : buttons[+b.dataset.k].value);
    };
    d.showModal();
  });
}
const ask = async (text, okLabel = '확인') => (await sheet(text, [{ label: okLabel, value: true, primary: true }])) === true;

// ---------- 공통 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seatLabel = (s) => `${SEAT_INFO[s].label}쪽`;
const crestName = (c) => SEAT_INFO[c].crest;
const colorOf = (c) => SEAT_INFO[c].color;

function toast(msg, kind = 'err') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${kind === 'info' ? 'info' : ''}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.className = ''; }, 3200);
}

async function api(path, body) {
  const res = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `오류 (${res.status})`);
  return data;
}

const store = {
  get name() { try { return localStorage.getItem('sightline:name') || ''; } catch { return ''; } },
  set name(v) { try { localStorage.setItem('sightline:name', v); } catch { /* 무시 */ } },
  get session() { try { return JSON.parse(localStorage.getItem('sightline:session') || 'null'); } catch { return null; } },
  set session(v) { try { if (v) localStorage.setItem('sightline:session', JSON.stringify(v)); else localStorage.removeItem('sightline:session'); } catch { /* 무시 */ } },
};

// ---------- 화면 전환 ----------
function goHome(msg) {
  if (ui.es) { ui.es.close(); ui.es = null; }
  ui.session = null; ui.payload = null; ui.sel = null; ui.mode = 'move';
  store.session = null;
  history.replaceState(null, '', location.pathname);
  document.getElementById('btnLeave').classList.add('hidden');
  renderHome();
  if (msg) toast(msg, 'info');
}

function connect(session) {
  ui.session = session;
  store.session = session;
  document.getElementById('btnLeave').classList.remove('hidden');
  history.replaceState(null, '', `?room=${session.code}`);
  if (ui.es) ui.es.close();
  const es = new EventSource(`/api/rooms/${session.code}/stream?seat=${session.seat}&token=${session.token}`);
  ui.es = es;
  es.onmessage = (e) => {
    const p = JSON.parse(e.data);
    if (p.view && ui.payload?.view && p.view.seq !== ui.payload.view.seq) { ui.sel = null; if (p.view.phase !== 'scout') ui.mode = 'move'; }
    ui.payload = p;
    render();
    const v = p.view;
    if (v && v.phase === 'play' && v.turn === v.me && ui.lastTurnSeq !== v.seq) {
      ui.lastTurnSeq = v.seq;
      if (document.hidden) document.title = '● 내 차례 · SIGHTLINE';
    }
  };
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED && !ui.payload) goHome('방을 찾을 수 없습니다. 서버가 다시 시작되었거나 방이 닫혔습니다.');
  };
}

function render() {
  const p = ui.payload;
  if (!p) return;
  if (!p.view) renderLobby(p); else renderGame(p);
}

// ---------- 홈 ----------
function renderHome() {
  const joinCode = new URLSearchParams(location.search).get('room') || '';
  $app.innerHTML = `<div class="home">
  <section class="hero">
    <div>
      <h1>앉은 자리가 곧 <em>시야</em>다.</h1>
      <p>달빛 정원의 가면무도회. 손님 말의 가면은 한쪽 면에만 있어서, 가면이 향한 좌석에 앉은 사람만 그 정체를 본다.
      누구나 아무 손님이나 움직일 수 있지만, <b>내 손으로는 절대 가면을 나에게 드러낼 수 없다.</b></p>
      <ul>
        <li>내 첩자 셋을 접선 지점에 들여보내 접선(3점)</li>
        <li>왼쪽 후원자의 첩자를, 내 좌석을 향했을 때 지목해 포획(2점)</li>
        <li>3~4인 · 8라운드 · 30~40분 · 룰북 v2.3 기준</li>
      </ul>
    </div>
    ${heroArt()}
  </section>
  <div class="divider"></div>
  <section class="row" style="align-items:stretch">
    <div class="card stack">
      <h3>이름</h3>
      <input id="name" maxlength="16" placeholder="후원자 이름" value="${esc(store.name)}">
      <h3 style="margin-top:.6rem">봇과 대전</h3>
      <div class="row">
        <button class="primary" data-act="bots" data-size="4">4인 (봇 3)</button>
        <button data-act="bots" data-size="3">3인 (봇 2)</button>
      </div>
      <p class="hint">혼자서 바로 시작합니다. 봇도 자기 좌석에서 보이는 것만 보고 판단합니다.</p>
    </div>
    <div class="card stack">
      <h3>다른 플레이어와 대전</h3>
      <div class="row">
        <button data-act="create" data-size="4">4인 방 만들기</button>
        <button data-act="create" data-size="3">3인 방 만들기</button>
      </div>
      <p class="hint">방을 만들면 코드가 나옵니다. 빈 자리는 봇으로 채울 수 있습니다.</p>
      <div class="divider"></div>
      <label class="label" for="code">방 코드로 참가</label>
      <div class="row">
        <input id="code" maxlength="4" placeholder="예: K7QX" value="${esc(joinCode)}" style="text-transform:uppercase">
        <button data-act="join" class="${joinCode ? 'primary' : ''}">참가</button>
      </div>
    </div>
  </section></div>`;
}

function heroArt() {
  return `<svg class="hero-art" viewBox="0 0 300 300" aria-hidden="true">
    <rect x="20" y="20" width="260" height="260" rx="10" fill="#dfe9d3"/>
    <g stroke="#b9c8aa">${[1, 2, 3, 4, 5, 6].map((k) => `<line x1="${20 + k * 37.1}" y1="20" x2="${20 + k * 37.1}" y2="280"/><line x1="20" y1="${20 + k * 37.1}" x2="280" y2="${20 + k * 37.1}"/>`).join('')}</g>
    <rect x="131" y="131" width="38" height="38" rx="4" fill="#e9e2d0" stroke="#6b5b3e" stroke-width="3"/>
    <rect x="57" y="92" width="76" height="7" fill="#3f6b35"/><rect x="200" y="57" width="7" height="76" fill="#3f6b35"/>
    <rect x="168" y="203" width="76" height="7" fill="#3f6b35"/><rect x="94" y="168" width="7" height="76" fill="#3f6b35"/>
    <g><rect x="140" y="64" width="22" height="22" rx="3" fill="#f7f3ea" stroke="#5a5246"/><rect x="161" y="66" width="4" height="18" fill="#2e6fbf"/>
    <line x1="168" y1="75" x2="292" y2="75" stroke="#2e6fbf" stroke-width="2.5" stroke-dasharray="6 5" opacity=".7"/></g>
    <g><rect x="64" y="212" width="22" height="22" rx="3" fill="#f7f3ea" stroke="#5a5246"/><rect x="66" y="232" width="18" height="4" fill="#c99a06"/>
    <line x1="75" y1="238" x2="75" y2="292" stroke="#c99a06" stroke-width="2.5" stroke-dasharray="6 5" opacity=".7"/></g>
    <g><rect x="212" y="140" width="22" height="22" rx="3" fill="#f7f3ea" stroke="#5a5246"/><rect x="214" y="138" width="18" height="4" fill="#333"/></g>
  </svg>`;
}

// ---------- 로비 ----------
function renderLobby(p) {
  const L = p.lobby;
  const host = p.mySeat === L.host;
  const url = `${location.origin}${location.pathname}?room=${L.code}`;
  $app.innerHTML = `
  <section class="lobby card stack">
    <div class="label" style="text-align:center">방 코드</div>
    <div class="code">${esc(L.code)}</div>
    <div class="row"><button data-act="copy" data-url="${esc(url)}">초대 링크 복사</button></div>
    <div class="divider"></div>
    ${L.slots.map((s) => `
      <div class="slot">
        <span class="dot" style="background:${colorOf(s.seat)}"></span>
        <span class="nm">${seatLabel(s.seat)} · ${crestName(s.seat)} — ${s.name ? esc(s.name) : '<span class="tag">빈 자리</span>'}
          ${s.seat === p.mySeat ? ' <span class="tag">(나)</span>' : ''}${s.bot ? ' <span class="tag">봇</span>' : ''}${s.name && !s.bot && !s.online ? ' <span class="tag">연결 끊김</span>' : ''}</span>
        ${host && !s.name ? `<button data-act="addBot" data-seat="${s.seat}">봇 넣기</button>` : ''}
        ${host && s.bot ? `<button class="ghost" data-act="removeBot" data-seat="${s.seat}">빼기</button>` : ''}
      </div>`).join('')}
    <div class="divider"></div>
    ${host
    ? `<div class="row"><button data-act="fillBots">빈 자리 봇으로 채우기</button><button class="primary" data-act="start" ${L.slots.some((s) => !s.name) ? 'disabled' : ''}>시작</button></div>`
    : '<p class="hint" style="text-align:center">방장이 시작하기를 기다리는 중…</p>'}
    <p class="hint">좌석은 시계 방향으로 북 → 동 → 남 → 서. 나는 왼쪽(다음 차례) 후원자의 첩자를 쫓고, 오른쪽 후원자에게 쫓깁니다.</p>
  </section>`;
}

// ---------- 게임 ----------
function screenSide(seat, rot) {
  return DIRS[(DIRS.indexOf(seat) + rot / 90) % 4];
}

function boardSvg(v, rot, opts) {
  const { names, highlight, dests, selected, scoutSeat } = opts;
  const mySeat = v.me != null ? v.players[v.me].seat : null;
  const parts = [];
  // 정원
  parts.push(`<rect x="-6" y="-6" width="${B + 12}" height="${B + 12}" rx="8" fill="#cfdcc0"/>`);
  for (let x = 1; x <= 7; x++) {
    for (let y = 1; y <= 7; y++) {
      const rv = RENDEZVOUS.some(([a, b]) => a === x && b === y);
      parts.push(`<rect x="${(x - 1) * C}" y="${(y - 1) * C}" width="${C}" height="${C}" fill="${rv ? '#f3e3b0' : '#dfe9d3'}" stroke="#b9c8aa"/>`);
      if (rv) parts.push(`<circle cx="${(x - .5) * C}" cy="${(y - .5) * C}" r="${C * .42}" fill="none" stroke="#b8902a" stroke-width="1.5" stroke-dasharray="4 4"/>`);
    }
  }
  const [px, py] = PAVILION;
  parts.push(`<rect x="${(px - 1) * C + 4}" y="${(py - 1) * C + 4}" width="${C - 8}" height="${C - 8}" rx="6" fill="#e9e2d0" stroke="#6b5b3e" stroke-width="4"/>
    <path d="M${(px - .5) * C} ${(py - 1) * C + 14} L${px * C - 14} ${(py - .5) * C} L${(px - .5) * C} ${py * C - 14} L${(px - 1) * C + 14} ${(py - .5) * C}Z" fill="#c9b68a" stroke="#6b5b3e"/>`);
  for (const k of HEDGES) {
    const [x, y, d] = k.split(',');
    if (d === 'S') parts.push(`<rect x="${(x - 1) * C}" y="${y * C - 5}" width="${C}" height="10" rx="2" fill="#3f6b35" stroke="#2b4a24"/>`);
    if (d === 'E') parts.push(`<rect x="${x * C - 5}" y="${(y - 1) * C}" width="10" height="${C}" rx="2" fill="#3f6b35" stroke="#2b4a24"/>`);
  }
  // 이동 목적지
  for (const m of dests) {
    const cx = (m.x - .5) * C, cy = (m.y - .5) * C;
    const [dx, dy] = DV[m.dir];
    parts.push(`<g class="dest" data-move="${m.pieceId},${m.dir},${m.steps}" style="cursor:pointer">
      <rect x="${(m.x - 1) * C + 3}" y="${(m.y - 1) * C + 3}" width="${C - 6}" height="${C - 6}" rx="8" fill="rgba(232,198,106,.35)" stroke="#b8902a" stroke-width="2"/>
      <path d="M${cx + dx * 14} ${cy + dy * 14} L${cx - dy * 9 - dx * 4} ${cy + dx * 9 - dy * 4} L${cx + dy * 9 - dx * 4} ${cy - dx * 9 - dy * 4}Z" fill="#8a6a1c"/></g>`);
  }
  const present = v.pieces.filter((p) => p.present);
  // 시선
  for (const p of present) {
    if (isCovered(present, p)) continue;
    const cx = (p.x - .5) * C, cy = (p.y - .5) * C;
    const [dx, dy] = DV[p.facing];
    const ex = p.facing === 'E' ? B + 8 : p.facing === 'W' ? -8 : cx;
    const ey = p.facing === 'S' ? B + 8 : p.facing === 'N' ? -8 : cy;
    const col = v.emptySeats.includes(p.facing) ? '#888' : colorOf(p.facing);
    parts.push(`<line x1="${cx + dx * 22}" y1="${cy + dy * 22}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width="3" stroke-dasharray="7 6" opacity=".55"/>`);
  }
  // 손님 말
  for (const p of present) {
    const cx = (p.x - .5) * C, cy = (p.y - .5) * C;
    const [dx, dy] = DV[p.facing];
    const cov = isCovered(present, p);
    const sel = selected === p.id;
    const hl = highlight.has(p.id);
    const known = p.crest ? p.known : null;
    const crestCol = p.crest ? colorOf(p.crest) : null;
    const maskCol = cov ? '#333' : (v.emptySeats.includes(p.facing) ? '#888' : colorOf(p.facing));
    const h = 21;
    const edge = p.facing === 'N' || p.facing === 'S'
      ? `<line x1="${cx - 16}" y1="${cy + dy * h}" x2="${cx + 16}" y2="${cy + dy * h}" stroke="${maskCol}" stroke-width="6" stroke-linecap="round"/>`
      : `<line x1="${cx + dx * h}" y1="${cy - 16}" x2="${cx + dx * h}" y2="${cy + 16}" stroke="${maskCol}" stroke-width="6" stroke-linecap="round"/>`;
    const tip = [cx + dx * 15, cy + dy * 15];
    const b1 = [cx + dx * 5 - dy * 7, cy + dy * 5 + dx * 7];
    const b2 = [cx + dx * 5 + dy * 7, cy + dy * 5 - dx * 7];
    let crestMark = '';
    if (known) {
      const mx = cx - dx * 13 + (dy ? 13 : 0), my = cy - dy * 13 + (dx ? -13 : 0);
      const hollow = known === 'memory';
      crestMark = `<circle cx="${mx}" cy="${my}" r="7" fill="${hollow ? '#f7f3ea' : crestCol}" stroke="${crestCol}" stroke-width="${hollow ? 3 : 1.5}"/>`;
    }
    const tok = p.token != null ? `<circle cx="${cx - 22}" cy="${cy + 22}" r="8" fill="${colorOf(v.players[p.token].seat)}" stroke="#f5d76e" stroke-width="3"/>` : '';
    parts.push(`<g class="piece" data-pid="${p.id}" style="cursor:pointer">
      <rect x="${(p.x - 1) * C}" y="${(p.y - 1) * C}" width="${C}" height="${C}" fill="transparent"/>
      ${hl ? `<rect x="${cx - 28}" y="${cy - 28}" width="56" height="56" rx="10" fill="none" stroke="#e2735f" stroke-width="3" stroke-dasharray="5 3"/>` : ''}
      <rect x="${cx - 20}" y="${cy - 20}" width="40" height="40" rx="6" fill="${sel ? '#fff4cf' : '#f7f3ea'}" stroke="${sel ? '#b8902a' : '#5a5246'}" stroke-width="${sel ? 3 : 1.6}"/>
      ${edge}
      <path d="M${tip[0]} ${tip[1]} L${b1[0]} ${b1[1]} L${b2[0]} ${b2[1]}Z" fill="#5a5246"/>
      ${crestMark}
      <text x="${cx - dx * 4}" y="${cy - dy * 4}" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="800" fill="#2d2a26" transform="rotate(${-rot} ${cx - dx * 4} ${cy - dy * 4})">${p.id}</text>
      ${tok}
    </g>`);
  }
  // 좌석 띠 (화면 좌표)
  const bars = [];
  for (const seat of DIRS) {
    const side = screenSide(seat, rot);
    const empty = v.emptySeats.includes(seat);
    const pl = v.players.find((q) => q.seat === seat);
    const turn = !empty && v.players[v.turn]?.seat === seat && v.phase !== 'over';
    const txt = empty ? '빈 발코니' : `${seatLabel(seat)} · ${crestName(seat)} · ${esc(names?.[seat] || '')}${seat === mySeat ? ' (나)' : ''}`;
    const fill = empty ? '#3a4a40' : colorOf(seat);
    const w = 34;
    let r, tx, ty, ta = 0;
    if (side === 'N') { r = [0, -52, B, w]; tx = B / 2; ty = -35; }
    if (side === 'S') { r = [0, B + 18, B, w]; tx = B / 2; ty = B + 35; }
    if (side === 'W') { r = [-52, 0, w, B]; tx = -35; ty = B / 2; ta = -90; }
    if (side === 'E') { r = [B + 18, 0, w, B]; tx = B + 35; ty = B / 2; ta = 90; }
    bars.push(`<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="6" fill="${fill}" opacity="${empty ? .6 : .92}" ${turn ? 'stroke="#f5d76e" stroke-width="4"' : ''}/>
      <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="700" fill="#fff" transform="rotate(${ta} ${tx} ${ty})">${turn ? '▶ ' : ''}${txt}${pl && !pl.card ? ' · 카드 없음' : ''}</text>`);
    if (scoutSeat === seat) bars.push(`<rect x="${r[0] - 4}" y="${r[1] - 4}" width="${r[2] + 8}" height="${r[3] + 8}" rx="8" fill="none" stroke="#e8c66a" stroke-width="3" stroke-dasharray="6 4"/>`);
  }
  return `<svg class="board" viewBox="-60 -60 ${B + 120} ${B + 120}" role="img" aria-label="정원 보드">
    <g transform="rotate(${rot} ${B / 2} ${B / 2})">${parts.join('')}</g>${bars.join('')}</svg>`;
}

function renderGame(p) {
  const v = p.view;
  const names = p.names || {};
  const me = v.me != null ? v.players[v.me] : null;
  const mySeat = me?.seat;
  const myTurn = me && v.turn === v.me && v.phase !== 'over';
  const scouting = v.phase === 'scout' && v.scout && v.scout.visible && myTurn;
  const viewSeat = scouting ? v.scout.seat : (mySeat || 'S');
  const rot = ROT[viewSeat];
  const present = v.pieces.filter((q) => q.present);

  let dests = [];
  let highlight = new Set();
  if (myTurn && v.phase === 'play') {
    if (ui.mode === 'accuse' && me.card) {
      highlight = new Set(accusableIds(present, mySeat, mySeat, v.emptySeats));
    } else if (ui.sel != null) {
      dests = legalMoves(present, mySeat, v.emptySeats).filter((m) => m.pieceId === ui.sel);
    }
  }
  if (scouting && me.card) highlight = new Set(present.filter((q) => q.facing === v.scout.seat).map((q) => q.id));

  const cur = v.players[v.turn];
  const status = v.phase === 'over'
    ? '게임 종료'
    : `라운드 ${v.round}/${v.rounds} · ${myTurn ? '<span style="color:var(--gold)">내 차례</span>' : `${seatLabel(cur.seat)} ${esc(names[cur.seat] || '')} 차례`}`;

  const selPiece = ui.sel != null ? v.pieces.find((q) => q.id === ui.sel) : null;
  const selInfo = selPiece
    ? `<div class="hint">${selPiece.id}번 · ${cellName(selPiece.x, selPiece.y)} · ${seatLabel(selPiece.facing)}향${selPiece.crest ? ` · <b style="color:${colorOf(selPiece.crest)}">${crestName(selPiece.crest)}</b> (${{ mine: '내 손님', now: '지금 보임', memory: '전에 봄', scout: '정찰로 봄', public: '공개' }[selPiece.known]})` : ''}
       · 이동 이력: ${DIRS.filter((s) => selPiece.moves[s]).map((s) => `${SEAT_INFO[s].label} ${selPiece.moves[s]}`).join(', ') || '없음'}
       ${myTurn && v.phase === 'play' && ui.mode === 'move' && !dests.length ? ' · <span style="color:var(--danger)">이 말은 지금 옮길 수 없다</span>' : ''}</div>`
    : '';

  const scoutBanner = scouting
    ? `<div class="scout-banner"><span>🔭 <b>${seatLabel(v.scout.seat)} 좌석</b>에서 정찰 중. ${me.card ? '이 좌석을 향한 말(빨간 점선)을 눌러 지목하거나' : '지목 카드가 없다.'}</span>
       <button data-act="scoutSkip">지목하지 않기</button></div>`
    : '';

  $app.innerHTML = `
  <section class="game">
    <div class="board-wrap">
      <div class="board-bar"><div class="status ${myTurn ? 'my-turn' : ''}">${status}</div>
        <button class="ghost" data-act="deselect" ${ui.sel == null ? 'disabled' : ''}>선택 해제</button></div>
      ${scoutBanner}
      ${boardSvg(v, rot, { names, highlight, dests, selected: ui.sel, scoutSeat: scouting ? v.scout.seat : null })}
      ${selInfo}
      <p class="hint legend">색 점선 = 그 가면을 볼 수 있는 단 하나의 좌석 · 검은 가면 면 = 가려짐 · 말 안의 색 점 = 내가 아는 정체(빈 원은 예전에 본 것) · 금테 원 = 초대장 토큰</p>
    </div>
    <aside class="side tab-${ui.tab}">
      ${v.phase === 'over' ? resultCard(v, names, p) : ''}
      ${me && v.phase !== 'over' ? actionCard(v, me, myTurn, names) : ''}
      <nav class="tabs" role="tablist">
        ${[['me', '내 정보'], ['players', '후원자'], ['log', '기록']].map(([k, l]) => `<button role="tab" aria-selected="${ui.tab === k}" class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}
      </nav>
      ${me ? myCard(v, me, names) : ''}
      <div class="card tabbed tab-players"><h3>후원자</h3><div class="players">${v.players.map((pl, k) => `
        <div class="pl ${k === v.turn && v.phase !== 'over' ? 'turn' : ''}">
          <span class="dot" style="background:${colorOf(pl.seat)}"></span>
          <div><div>${seatLabel(pl.seat)} ${esc(names[pl.seat] || '')}${k === v.me ? ' (나)' : ''}</div>
          <div class="meta">쫓는 대상 ${seatLabel(pl.target)} · 접선 ${pl.contacted.length} · 포획 ${pl.captured.length} · 오인 ${pl.mistakes} · 카드 ${pl.card ? '있음' : '없음'} · 글라스 ${pl.glass}</div></div>
          <div class="sc">${pl.score}</div></div>`).join('')}</div></div>
      <div class="card tabbed tab-log"><h3>기록</h3><div class="log">${v.log.slice().reverse().map((l) => `<div><span class="r">R${l.round}</span>${l.seat ? `<span style="color:${colorOf(l.seat)}">●</span> ` : ''}${esc(l.text)}</div>`).join('')}</div></div>
    </aside>
  </section>`;
}

function myCard(v, me, names) {
  const hunter = v.players[(v.me - 1 + v.n) % v.n];
  const status = (id) => {
    const q = v.pieces[id - 1];
    if (q.present) return '';
    return q.out === 'contacted' ? '접선' : q.out === 'captured' ? '잡힘' : '떠남';
  };
  void names;
  return `<div class="card tabbed tab-me"><h3>나: ${seatLabel(me.seat)} · <span style="color:${colorOf(me.seat)}">${crestName(me.seat)}</span></h3>
    <dl class="me-grid">
      <dt>쫓는 대상</dt><dd><span class="chip"><span class="sw" style="background:${colorOf(me.target)}"></span>${seatLabel(me.target)} ${crestName(me.target)}</span></dd>
      <dt>나를 쫓는 사람</dt><dd><span class="chip"><span class="sw" style="background:${colorOf(hunter.seat)}"></span>${seatLabel(hunter.seat)}</span> ${hunter.card ? '' : '(카드 없음)'}</dd>
      <dt>내 첩자</dt><dd class="roster">${v.roster.agents.map((id) => `<span class="chip ${status(id) ? 'gone' : ''}"><span class="sw" style="background:${colorOf(me.seat)}"></span>${id}${status(id) ? ` ${status(id)}` : ''}</span>`).join('')}</dd>
      <dt>내 중립</dt><dd><span class="chip"><span class="sw" style="background:${colorOf('X')}"></span>${v.roster.neutral}</span></dd>
      <dt>지목 카드</dt><dd>${me.card ? `${crestName(me.target)} 카드 있음` : '없음'}</dd>
      <dt>오페라 글라스</dt><dd>${me.glass}</dd>
    </dl></div>`;
}

function actionCard(v, me, myTurn, names) {
  if (!myTurn) {
    const cur = v.players[v.turn];
    return `<div class="card action-card waiting"><div class="ac-head"><span class="dot pulse" style="background:${colorOf(cur.seat)}"></span>
      <b>${seatLabel(cur.seat)} ${esc(names[cur.seat] || '')}</b>&nbsp;차례…</div>
      <p class="hint ac-hint">내 쪽을 향한 말, 누가 무엇을 옮겼는지가 단서입니다.</p></div>`;
  }
  if (v.phase === 'scout') {
    return `<div class="card action-card mine"><div class="ac-head">🔭 <b>${seatLabel(v.scout.seat)} 좌석</b>&nbsp;정찰 중</div>
      <p class="hint ac-hint">${me.card ? '이 좌석을 향한 말(빨간 점선)을 눌러 지목하거나' : '지목 카드가 없습니다.'}</p>
      <div class="ac-buttons"><button class="wide" data-act="scoutSkip">지목하지 않기</button></div></div>`;
  }
  const mySeat = me.seat;
  const present = v.pieces.filter((q) => q.present);
  const contactable = present.filter((q) => v.roster.agents.includes(q.id) && RENDEZVOUS.some(([a, b]) => a === q.x && b === q.y));
  const acc = me.card ? accusableIds(present, mySeat, mySeat, v.emptySeats) : [];
  return `<div class="card action-card mine"><div class="ac-head"><b>내 차례</b>&nbsp;· 하나만 고르세요</div>
    ${contactable.length ? `<div class="ac-buttons">${contactable.map((q) => `<button class="primary wide" data-act="contact" data-pid="${q.id}">${q.id}번 접선 +3</button>`).join('')}</div>` : ''}
    <div class="ac-buttons">
      <button class="${ui.mode === 'move' ? 'on' : ''}" data-act="modeMove">이동</button>
      <button class="${ui.mode === 'accuse' ? 'on' : ''}" data-act="modeAccuse" ${me.card && acc.length ? '' : 'disabled'}>지목 ${acc.length}</button>
      <button data-act="scoutPick" ${me.glass > 0 ? '' : 'disabled'}>정찰 ${me.glass}</button>
    </div>
    <p class="hint ac-hint">${ui.mode === 'accuse'
    ? `빨간 점선 말을 눌러 ${crestName(me.target)} 첩자로 지목 · 맞으면 +2, 틀리면 −1·카드 잃음`
    : ui.sel != null ? '노란 칸을 눌러 옮기세요 · 이동 방향이 곧 가면 방향' : '옮길 손님 말을 누르세요'}</p>
  </div>`;
}

function resultCard(v, names, p) {
  const host = p.mySeat === p.lobby.host;
  const rows = v.result?.rows || [];
  return `<div class="card result"><h3>게임 종료 — 승자: ${(v.result?.winners || []).map((s) => `${seatLabel(s)} ${esc(names[s] || '')}`).join(', ')}</h3>
    <table><tr><th>후원자</th><th>점수</th><th>접선</th><th>오인</th></tr>
    ${rows.map((r) => `<tr><td><span style="color:${colorOf(r.seat)}">●</span> ${seatLabel(r.seat)} ${esc(names[r.seat] || '')}</td><td><b>${r.score}</b></td><td>${r.contacts}</td><td>${r.mistakes}</td></tr>`).join('')}</table>
    <p class="hint">보드의 모든 가면이 공개되었습니다. 누가 무엇을 알고 있었는지 확인해 보세요.</p>
    <div class="row">${host ? '<button class="primary" data-act="rematch">한 판 더</button>' : ''}<button data-act="home">처음으로</button></div></div>`;
}

// ---------- 이벤트 ----------
async function sendAction(action) {
  if (ui.busy) return;
  ui.busy = true;
  try {
    await api(`rooms/${ui.session.code}/action`, { seat: ui.session.seat, token: ui.session.token, action });
    ui.sel = null;
  } catch (e) { toast(e.message); } finally { ui.busy = false; }
}

async function host(cmd, target) {
  try { await api(`rooms/${ui.session.code}/host`, { seat: ui.session.seat, token: ui.session.token, cmd, target }); } catch (e) { toast(e.message); }
}

function myName() {
  const el = document.getElementById('name');
  const n = (el?.value || store.name || '').trim();
  if (n) store.name = n;
  return n || '후원자';
}

$app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act],[data-move],[data-pid]');
  if (!t) return;
  const actName = t.dataset.act;
  try {
    if (actName === 'bots') { const r = await api('rooms', { size: +t.dataset.size, name: myName(), vsBots: true, seat: 'S' }); connect(r); return; }
    if (actName === 'create') { const r = await api('rooms', { size: +t.dataset.size, name: myName(), seat: 'S' }); connect(r); return; }
    if (actName === 'join') {
      const code = document.getElementById('code').value.trim().toUpperCase();
      if (!code) { toast('방 코드를 입력하세요.'); return; }
      const r = await api(`rooms/${code}/join`, { name: myName() }); connect(r); return;
    }
  } catch (err) { toast(err.message); return; }
  if (actName === 'copy') { navigator.clipboard?.writeText(t.dataset.url).then(() => toast('초대 링크를 복사했습니다.', 'info'), () => toast(t.dataset.url, 'info')); return; }
  if (actName === 'addBot') return host('addBot', t.dataset.seat);
  if (actName === 'removeBot') return host('removeBot', t.dataset.seat);
  if (actName === 'fillBots') {
    for (const s of ui.payload.lobby.slots.filter((x) => !x.name)) await host('addBot', s.seat);
    return undefined;
  }
  if (actName === 'start') return host('start');
  if (actName === 'rematch') { try { await api(`rooms/${ui.session.code}/rematch`, { seat: ui.session.seat, token: ui.session.token }); } catch (err) { toast(err.message); } return undefined; }
  if (actName === 'home') { goHome(); return undefined; }
  if (actName === 'deselect') { ui.sel = null; render(); return undefined; }
  if (actName === 'modeMove') { ui.mode = 'move'; render(); return undefined; }
  if (actName === 'modeAccuse') { ui.mode = 'accuse'; ui.sel = null; render(); return undefined; }
  if (actName === 'contact') return sendAction({ type: 'contact', pieceId: +t.dataset.pid });
  if (actName === 'scoutPick') {
    const v = ui.payload.view;
    const seat = await sheet('어느 좌석에서 정찰할까요? 오페라 글라스는 게임에 한 번뿐입니다. 정찰한 뒤 그 좌석을 향한 말을 지목할 수 있습니다.',
      v.players.filter((q, k) => k !== v.me).map((q) => ({ label: `${seatLabel(q.seat)} · ${crestName(q.seat)}`, value: q.seat })));
    if (seat) return sendAction({ type: 'scout', seat });
    return undefined;
  }
  if (actName === 'tab') { ui.tab = t.dataset.tab; render(); return undefined; }
  if (actName === 'scoutSkip') return sendAction({ type: 'scoutAccuse', pieceId: null });
  if (t.dataset.move) {
    const [pid, dir, steps] = t.dataset.move.split(',');
    return sendAction({ type: 'move', pieceId: +pid, dir, steps: +steps });
  }
  if (t.dataset.pid && t.classList.contains('piece')) {
    const v = ui.payload?.view;
    if (!v) return undefined;
    const pid = +t.dataset.pid;
    const me = v.players[v.me];
    const myTurn = v.turn === v.me && v.phase !== 'over';
    if (myTurn && v.phase === 'scout') {
      const q = v.pieces[pid - 1];
      if (me.card && q.facing === v.scout.seat) {
        if (await ask(`${pid}번을 ${crestName(me.target)} 첩자로 지목할까요? 틀리면 지목 카드를 잃습니다.`, '지목')) return sendAction({ type: 'scoutAccuse', pieceId: pid });
      } else toast('정찰한 좌석을 향한 말만 지목할 수 있습니다.');
      return undefined;
    }
    if (myTurn && ui.mode === 'accuse') {
      const ok = accusableIds(v.pieces.filter((q) => q.present), me.seat, me.seat, v.emptySeats).includes(pid);
      if (!ok) { toast('내 좌석을 향한 말만 지목할 수 있습니다.'); return undefined; }
      if (await ask(`${pid}번을 ${crestName(me.target)} 첩자로 지목할까요? 틀리면 지목 카드를 잃습니다.`, '지목')) return sendAction({ type: 'accuse', pieceId: pid });
      return undefined;
    }
    ui.sel = ui.sel === pid ? null : pid;
    render();
  }
  return undefined;
});

$app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'code') document.querySelector('[data-act="join"]')?.click();
});

document.getElementById('btnLeave').addEventListener('click', async () => {
  if (await ask('방에서 나갈까요? 진행 중인 게임에서 내 자리는 비게 됩니다.', '나가기')) goHome();
});

// 하단 고정 행동 바 높이를 CSS에 알려 본문이 가려지지 않게 한다
const barObserver = new ResizeObserver(() => {
  const bar = document.querySelector('.action-card');
  document.documentElement.style.setProperty('--bar-h', `${bar ? Math.ceil(bar.getBoundingClientRect().height) : 0}px`);
});
new MutationObserver(() => {
  const bar = document.querySelector('.action-card');
  barObserver.disconnect();
  if (bar) barObserver.observe(bar); else document.documentElement.style.setProperty('--bar-h', '0px');
}).observe($app, { childList: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'SIGHTLINE · 사이트라인'; });

// ---------- 규칙 ----------
function md(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) { const b = []; i++; while (i < lines.length && !lines[i].startsWith('```')) b.push(lines[i++]); i++; out.push(`<pre>${esc(b.join('\n'))}</pre>`); continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = rows.filter((r) => !/^\|[-\s|:]+\|$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|'));
      out.push(`<table>${cells.map((c, k) => `<tr>${c.map((x) => `<${k ? 'td' : 'th'}>${inline(x.trim())}</${k ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`); continue;
    }
    if (l.startsWith('>')) { const b = []; while (i < lines.length && lines[i].startsWith('>')) b.push(inline(lines[i++].replace(/^>\s?/, ''))); out.push(`<blockquote>${b.join('<br>')}</blockquote>`); continue; }
    const h = l.match(/^(#{1,3})\s+(.*)/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*(-|\d+\.)\s/.test(l)) { const b = []; while (i < lines.length && /^\s*(-|\d+\.)\s/.test(lines[i])) b.push(`<li>${inline(lines[i++].replace(/^\s*(-|\d+\.)\s/, ''))}</li>`); out.push(`<ul>${b.join('')}</ul>`); continue; }
    if (l.trim() && l.trim() !== '---') out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join('');
}

const dlg = document.getElementById('rulesDlg');
document.getElementById('btnRules').addEventListener('click', async () => {
  const body = document.getElementById('rulesBody');
  if (!body.dataset.loaded) {
    try { body.innerHTML = md(await (await fetch('rulebook.md')).text()); body.dataset.loaded = '1'; } catch { body.textContent = '규칙을 불러오지 못했습니다.'; }
  }
  dlg.showModal();
});
dlg.addEventListener('click', (e) => { if (e.target.dataset.close !== undefined || e.target === dlg) dlg.close(); });

// ---------- 시작 ----------
const saved = store.session;
const urlRoom = new URLSearchParams(location.search).get('room');
if (saved && (!urlRoom || urlRoom.toUpperCase() === saved.code)) connect(saved);
else renderHome();
