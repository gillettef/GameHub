// RETROCAUSE 웹 플레이: 사람 1명 + 봇. 판정은 모두 engine.js 가 한다.
import {
  newGame, applyAction, legalSlots, illegalReason, stateAt, decisiveCause, canPass, canExchange,
  finalScore, validGuess, CARD, SUBJECTS, FIGURES, INITIAL, makeRng, shuffle,
} from './src/engine.js';
import { chooseAction, guessMotives, BOT_STYLES } from './src/bots.js';

const $ = (s) => document.querySelector(s);
const ICON = { 성: '🏰', 왕: '👑', 금고: '💰', 경비: '💂', 성문: '🚪' };
const FIG_COLOR = {
  하인: 'var(--f-hain)', 왕비: 'var(--f-queen)', 대신: 'var(--f-minister)',
  경비대장: 'var(--f-captain)', '궁정 의사': 'var(--f-doctor)', 광대: 'var(--f-jester)',
};
const WHY = { condition: '조건이 이 칸에서 참이 아닙니다', ending: '결말과 다른 가장 오른쪽 결과가 됩니다', occupied: '이미 카드가 있습니다' };

let g = null;
let me = 0;
let styles = [];
let selected = null;
let speed = 700;
let showMotive = false;
let botTimer = null;
let lastFlash = { placed: null, removed: [] };

const fact = (f) => `${ICON[f.subject]} ${f.subject} = ${f.state}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- 시작 ----------
$('#btn-start').addEventListener('click', start);
$('#btn-new').addEventListener('click', () => {
  if (g && !g.over && !confirm('진행 중인 게임을 버리고 새로 시작할까요?')) return;
  clearTimeout(botTimer);
  $('#game').hidden = true;
  $('#setup').hidden = false;
  $('#btn-new').hidden = true;
});

function start() {
  const n = Number($('#in-players').value);
  speed = Number($('#in-speed').value);
  const seedText = $('#in-seed').value.trim();
  const seed = seedText ? Number(seedText) || hashText(seedText) : Math.floor(Math.random() * 1e9);
  const rng = makeRng(seed ^ 0x5bd1e995);
  const styleKeys = ['greedy', 'rival', 'bluffer'];
  me = Math.floor(rng() * n); // 시작 플레이어는 0번 자리. 내 자리는 무작위.
  const botNames = shuffle(['아그네스', '베르톨트', '세실리아', '도미닉', '엘로이즈', '페르디난트'], rng);
  const names = [];
  styles = [];
  let b = 0;
  for (let p = 0; p < n; p++) {
    if (p === me) { names.push($('#in-name').value.trim() || '나'); styles.push(null); continue; }
    const key = styleKeys[Math.floor(rng() * styleKeys.length)];
    names.push(`${botNames[b++]}`);
    styles.push({ ...BOT_STYLES[key], activity: 0.8 });
  }
  g = newGame({ names, seed });
  selected = null;
  showMotive = false;
  lastFlash = { placed: null, removed: [] };
  $('#log').innerHTML = '';
  log(`게임 시작 (시드 ${seed}). 결말: ${g.endings.map(fact).join(', ')}`);
  log(`시작 플레이어는 <b>${esc(g.names[0])}</b>입니다. 당신은 ${me + 1}번째 차례입니다.`);
  $('#setup').hidden = true;
  $('#game').hidden = false;
  $('#btn-new').hidden = false;
  render();
  scheduleBot();
}
function hashText(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

// ---------- 행동 ----------
function act(action) {
  const before = g;
  g = applyAction(g, action);
  const h = g.history[g.history.length - 1];
  const who = `<b>${esc(before.names[h.player])}</b>`;
  lastFlash = { placed: null, removed: [] };
  if (h.type === 'place') {
    const c = CARD[h.cardId];
    log(`${who}: 칸 ${h.slot + 1}에 「${esc(c.title)}」(${c.figure}) — ${c.cond ? fact(c.cond) + ' → ' : ''}${fact(c.effect)}`);
    lastFlash.placed = h.slot;
    if (h.removed.length) {
      lastFlash.removed = h.removed.map((r) => r.slot);
      const list = h.removed.map((r) => `칸 ${r.slot + 1} 「${esc(CARD[r.cardId].title)}」(${r.kind === 'condition' ? '조건 모순' : '결말 모순'})`).join(', ');
      log(`연쇄 정리: ${list} 버림 → ${who} 패러독스 +${h.removed.length}`, 'warn');
    }
  } else if (h.type === 'exchange') {
    const c = CARD[h.cardId];
    log(`${who}: 교체 — 「${esc(c.title)}」(${c.figure}) 버림`);
  } else {
    log(`${who}: 패스`);
  }
  if (!before.finalRound && g.finalRound) {
    log(`종료 라운드가 시작되었습니다 (${g.stats.endTrigger === 'timeline' ? '시간선이 가득 참' : '덱이 비었음'}). ${esc(g.names[g.names.length - 1])}의 차례까지 진행합니다.`, 'warn');
  }
  selected = null;
  render();
  if (g.over) { setTimeout(openEnd, 600); return; }
  scheduleBot();
}

function scheduleBot() {
  clearTimeout(botTimer);
  if (!g || g.over || g.current === me) return;
  botTimer = setTimeout(() => {
    const rng = makeRng((g.seed + g.history.length * 977) >>> 0);
    act(chooseAction(g, styles[g.current], rng));
  }, speed);
}

$('#btn-exchange').addEventListener('click', () => {
  if (selected && g.current === me) act({ type: 'exchange', cardId: selected });
});
$('#btn-pass').addEventListener('click', () => {
  if (g.current === me && canPass(g)) act({ type: 'pass' });
});
$('#btn-motive').addEventListener('click', () => { showMotive = !showMotive; renderStatus(); });
$('#tg-states').addEventListener('change', () => renderTimeline());

// ---------- 그리기 ----------
function render() {
  renderStatus();
  renderTimeline();
  renderHand();
  renderPlayers();
}

function renderStatus() {
  const mine = g.current === me && !g.over;
  const t = $('#status-turn');
  t.textContent = g.over ? '게임 종료' : mine ? '당신의 차례입니다' : `${g.names[g.current]}의 차례…`;
  t.classList.toggle('me', mine);
  $('#status-round').textContent = `라운드 ${g.round}${g.finalRound ? ' (종료 라운드)' : ''}`;
  $('#status-deck').textContent = `덱 ${g.deck.length}장 · 버림 ${g.discard.length}장`;
  $('#btn-motive').textContent = showMotive ? g.motives[me] : '보기';
}

function cardHTML(c, extra = '') {
  return `<div class="card" style="--fig:${FIG_COLOR[c.figure]}">
    ${extra}
    <div class="title">${esc(c.title)}</div>
    <div class="fig">${esc(c.figure)}</div>
    <div class="row"><span class="lab">조건</span>${c.cond ? `<span class="fact">${fact(c.cond)}</span>` : '<span class="nocond">없음</span>'}</div>
    <div class="row"><span class="lab">결과</span><span class="fact">${fact(c.effect)}</span></div>
  </div>`;
}

function renderTimeline() {
  const el = $('#timeline');
  el.classList.toggle('hide-states', !$('#tg-states').checked);
  const endingSubj = new Set(g.endings.map((e) => e.subject));
  const decisive = new Map();
  for (const e of g.endings) {
    const d = decisiveCause(g.timeline, e);
    if (d) decisive.set(d.slot, e);
  }
  const legal = selected && g.current === me && !g.over ? new Set(legalSlots(g.timeline, selected, g.endings)) : new Set();
  let html = `<div class="col initial"><div class="slot-no">시작 상태</div>
    <div class="initial-card">${SUBJECTS.map((s) => `<div>${ICON[s.id]} ${s.id}: ${INITIAL[s.id]}</div>`).join('')}</div></div>`;
  g.timeline.forEach((id, i) => {
    const cls = ['slot'];
    if (legal.has(i)) cls.push('legal');
    else if (selected && !id) cls.push('illegal-hint');
    if (lastFlash.placed === i) cls.push('flash');
    if (lastFlash.removed.includes(i)) cls.push('removed');
    const title = selected && !id && !legal.has(i) ? WHY[illegalReason(g.timeline, selected, i, g.endings)] ?? '' : '';
    const states = SUBJECTS.map((s) => {
      const st = stateAt(g.timeline, i, s.id);
      const c = ['st'];
      if (st !== INITIAL[s.id]) c.push('changed');
      if (endingSubj.has(s.id)) c.push('ending');
      return `<div class="${c.join(' ')}" title="칸 ${i + 1}의 카드 직전 ${s.id} 상태">${ICON[s.id]} ${st}</div>`;
    }).join('');
    const badge = decisive.has(i) ? '<span class="badge">결정 원인</span>' : '';
    html += `<div class="col"><div class="slot-no">칸 ${i + 1}</div>
      <div class="${cls.join(' ')}" data-slot="${i}" title="${esc(title)}">${id ? cardHTML(CARD[id], badge) : ''}</div>
      <div class="states">${states}</div></div>`;
  });
  html += `<div class="col endings"><div class="slot-no">결말</div>${g.endings.map((e) => {
    const d = decisiveCause(g.timeline, e);
    const dc = d ? `결정 원인: <b style="color:${FIG_COLOR[CARD[d.cardId].figure]}">${CARD[d.cardId].figure}</b> (칸 ${d.slot + 1})` : '결정 원인 없음';
    return `<div class="ending-card"><div class="k">${ICON[e.subject]} ${e.subject}</div><div class="v">${e.state}</div><div class="dc">${dc}</div></div>`;
  }).join('')}</div>`;
  el.innerHTML = html;
  $('#endings-bar').innerHTML = '<span class="hint">결말</span>' + g.endings.map((e) => {
    const d = decisiveCause(g.timeline, e);
    return `<div class="pill">${ICON[e.subject]} <b>${e.subject} = ${e.state}</b><span>${d ? `결정 원인 ${CARD[d.cardId].figure} · 칸 ${d.slot + 1}` : '결정 원인 없음'}</span></div>`;
  }).join('');
  el.querySelectorAll('.slot.legal').forEach((s) => s.addEventListener('click', () => {
    act({ type: 'place', cardId: selected, slot: Number(s.dataset.slot) });
  }));
}

function renderHand() {
  const mine = g.current === me && !g.over;
  const hand = g.hands[me];
  $('#hand').innerHTML = hand.map((id) => {
    const n = legalSlots(g.timeline, id, g.endings).length;
    const extra = `<div class="legal-count" style="order:9">${n ? `놓을 수 있는 칸 ${n}개` : '지금 놓을 칸 없음'}</div>`;
    return cardHTML(CARD[id], extra).replace('class="card"', `class="card${selected === id ? ' selected' : ''}${n ? '' : ' dead'}" data-id="${id}"`);
  }).join('');
  $('#hand').querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
    if (!mine) return;
    selected = selected === c.dataset.id ? null : c.dataset.id;
    renderHand();
    renderTimeline();
  }));
  $('#btn-exchange').disabled = !mine || !selected || !canExchange(g);
  $('#btn-pass').disabled = !mine || !canPass(g);
  $('#hand-hint').textContent = !mine ? '' : selected ? '초록색 칸을 눌러 놓거나, 교체하세요' : '카드를 골라 주세요';
}

function renderPlayers() {
  $('#players').innerHTML = g.names.map((name, p) => {
    const placed = {};
    for (const h of g.history) if (h.player === p && h.type === 'place') placed[CARD[h.cardId].figure] = (placed[CARD[h.cardId].figure] ?? 0) + 1;
    const ex = g.history.filter((h) => h.player === p && h.type === 'exchange').length;
    const chips = Object.entries(placed).map(([f, k]) => `<span class="figchip" style="--fig:${FIG_COLOR[f]}">${f} ${k}</span>`).join('');
    return `<div class="player${g.current === p && !g.over ? ' active' : ''}">
      <div class="pname">${esc(name)}${p === me ? ' (나)' : ''}${p === 0 ? ' · 시작' : ''}</div>
      <div class="tokens" title="패러독스 토큰">⧖ ${g.paradox[p]}</div>
      <div class="pmeta">손패 ${g.hands[p].length} · 교체 ${ex}회${p !== me && styles[p] ? ` · ${styles[p].label}` : ''}</div><div></div>
      <div class="pfigs">${chips || '<span class="pmeta">놓은 카드 없음</span>'}</div>
    </div>`;
  }).join('');
}

function log(html, cls = '') {
  const li = document.createElement('li');
  li.innerHTML = html;
  if (cls) li.className = cls;
  $('#log').prepend(li);
}

// ---------- 종료: 추리와 득점 ----------
function openEnd() {
  const dlg = $('#dlg-end');
  $('#end-title').textContent = '추리: 다른 플레이어의 비밀 목표 인물은?';
  const opts = FIGURES.filter((f) => f !== g.motives[me]);
  $('#end-body').innerHTML = `<p class="hint">한 인물은 한 번만 적을 수 있습니다. 맞히면 1개당 +1점.</p>
    ${g.names.map((name, p) => p === me ? '' : `<div class="guess-row"><span>${esc(name)}</span>
      <select data-p="${p}"><option value="">선택…</option>${opts.map((f) => `<option>${f}</option>`).join('')}</select></div>`).join('')}
    <div class="err" id="guess-err"></div>`;
  $('#end-actions').innerHTML = '<button type="button" class="primary" id="btn-guess">공개하기</button>';
  $('#btn-guess').addEventListener('click', () => {
    const guess = {};
    let missing = false;
    $('#end-body').querySelectorAll('select').forEach((s) => { if (!s.value) missing = true; guess[s.dataset.p] = s.value; });
    if (missing) { $('#guess-err').textContent = '모든 플레이어의 인물을 골라 주세요.'; return; }
    if (!validGuess(g, me, guess)) { $('#guess-err').textContent = '같은 인물을 두 번 적을 수 없습니다.'; return; }
    showResult(guess);
  });
  dlg.showModal();
}

function showResult(myGuess) {
  const guesses = g.names.map((_, p) => (p === me ? myGuess : guessMotives(g, p)));
  const s = finalScore(g, guesses);
  const pts = g.rules.points;
  $('#end-title').textContent = s.winners.includes(me) ? '승리!' : `${s.winners.map((w) => g.names[w]).join(', ')} 승리`;
  const dc = s.decisive.map((d) => `<li>${fact(d.ending)} — ${d.figure ? `결정 원인 「${esc(CARD[d.cardId].title)}」 <b>${d.figure}</b>` : s.unresolved.includes(d.ending) ? '<b>미해결 결말</b> (모두 패러독스 +1)' : '결정 원인 없음'}</li>`).join('');
  const rows = s.rows.map((r) => `<tr class="${s.winners.includes(r.player) ? 'win' : ''}">
    <td>${esc(r.name)}${r.player === me ? ' (나)' : ''}</td><td>${r.figure}</td>
    <td>${r.decisive}×${pts.decisive}</td><td>${r.cards}×${pts.card}</td><td>${r.correct}×${pts.deduction}</td>
    <td>${r.paradox}×${pts.paradox}</td><td><b>${r.total}</b></td></tr>`).join('');
  $('#end-body').innerHTML = `<ul class="dc-list">${dc}</ul>
    <table class="score"><thead><tr><th>플레이어</th><th>인물</th><th>결정 원인</th><th>카드</th><th>추리</th><th>패러독스</th><th>합계</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="hint">동점이면 패러독스가 적은 플레이어가 이깁니다. 시드 ${g.seed}로 같은 판을 다시 할 수 있습니다.</p>`;
  $('#end-actions').innerHTML = '<button type="button" class="ghost" id="btn-close">시간선 보기</button><button type="button" class="primary" id="btn-again">새 게임</button>';
  $('#btn-close').addEventListener('click', () => $('#dlg-end').close());
  $('#btn-again').addEventListener('click', () => { $('#dlg-end').close(); $('#btn-new').click(); });
}
