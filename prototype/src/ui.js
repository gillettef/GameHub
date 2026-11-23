// LASTGRAIN 웹 시뮬레이터 화면: 실시간 흐름, 클릭 조작, 봇 진행.
import {
  newGame, tick, endTurn, summon, move, attack, moveOptions, attackOptions,
  onBoard, reserve, unitAt, canSummon, homeCells, summonable, isSpring, isRuin, cellName,
  KINDS, PLAYER_NAME, apply,
} from './rules.js';
import { chooseAction } from './bot.js';

const $ = (sel) => document.querySelector(sel);
const SAND = { scout: '#d9ccb0', warrior: '#e0ac35', giant: '#c8553d' };

let s = null;            // 게임 상태
let opts = null;         // 설정
let human = 0;           // 사람 플레이어 번호
let paused = false;
let selected = null;     // 선택한 내 모래병 id
let summonPick = null;   // 소환하려고 고른 비축 모래병 id
let last = 0;
let botTimer = null;
let lastRender = 0;
let seenLog = 0;

// ---------------------------------------------------------------- 그림
function hourglass(frac, kind, big = false) {
  const f = Math.max(0, Math.min(1, frac));
  const yTop = 32 - 27 * f, yBot = 60 - 27 * (1 - f);
  const id = Math.random().toString(36).slice(2, 8);
  const top = 'M7,5 C7,22 18,28 20,32 C22,28 33,22 33,5 Z';
  const bot = 'M7,59 C7,42 18,36 20,32 C22,36 33,42 33,59 Z';
  const flow = f > 0 && f < 1 ? `<line x1="20" y1="32" x2="20" y2="${yBot}" stroke="${SAND[kind]}" stroke-width="1.2" stroke-dasharray="2 2"/>` : '';
  return `<svg viewBox="0 0 40 64" aria-hidden="true"${big ? ' class="big"' : ''}>
    <defs><clipPath id="t${id}"><path d="${top}"/></clipPath><clipPath id="b${id}"><path d="${bot}"/></clipPath></defs>
    <path d="${top}" fill="#f7fafc"/><path d="${bot}" fill="#f7fafc"/>
    <rect x="0" y="${yTop}" width="40" height="${32 - yTop}" fill="${SAND[kind]}" clip-path="url(#t${id})"/>
    <rect x="0" y="${yBot}" width="40" height="${60 - yBot}" fill="${SAND[kind]}" clip-path="url(#b${id})"/>
    ${flow}
    <path d="${top}" fill="none" stroke="#9fb2bf" stroke-width="1.3"/><path d="${bot}" fill="none" stroke="#9fb2bf" stroke-width="1.3"/>
    <rect x="2" y="0" width="36" height="5" rx="1.5" fill="#7a5634"/><rect x="2" y="59" width="36" height="5" rx="1.5" fill="#7a5634"/>
    <rect x="3" y="5" width="2.5" height="54" fill="#5a3d22"/><rect x="34.5" y="5" width="2.5" height="54" fill="#5a3d22"/>
  </svg>`;
}

const SPRING_SVG = '<svg class="terrain" viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="46" ry="38" fill="#79bfdc" stroke="#3f8fb3" stroke-width="4"/><path d="M26 52 q12 -9 24 0 t24 0" fill="none" stroke="#e8f6fb" stroke-width="5"/></svg>';
const RUIN_SVG = '<svg class="terrain" viewBox="0 0 100 100"><g fill="none" stroke="#8a6a44" stroke-width="6" stroke-linejoin="round" opacity=".7"><path d="M10 88 H90 M18 88 V40 M40 88 V40 M60 88 V40 M82 88 V40 M8 40 H92 L50 10 Z"/></g></svg>';

const fmtSec = (ms) => `${Math.ceil(ms / 1000)}`;
const fmtClock = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const who = (p) => (p === human ? '나' : '봇');

function pieceHtml(u, { lying, cls = '' } = {}) {
  const k = KINDS[u.kind];
  const sec = opts.showSec ? `<span class="sec${u.rem < 10_000 ? ' low' : ''}">${fmtSec(u.rem)}</span>` : '';
  return `<div class="piece p${u.owner} ${lying ? 'lying' : ''} ${cls}" data-unit="${u.id}" title="${who(u.owner)}의 ${k.name}">
    <div class="disc"></div>${hourglass(u.rem / u.cap, u.kind)}<span class="kind">${k.short}</span>${sec}</div>`;
}

// 사람의 소환 줄이 항상 화면 아래에 오도록 줄 순서를 정한다
const displayRows = () => (human === 0 ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]);
const displayCols = () => (human === 0 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0]);

// ---------------------------------------------------------------- 렌더링
function render() {
  if (!s) return;
  const myTurn = !s.over && s.active === human;
  const sel = selected && s.units[selected]?.pos && myTurn ? s.units[selected] : null;
  if (!sel) selected = null;
  const moves = sel ? moveOptions(s, sel.id) : [];
  const attacks = sel ? attackOptions(s, sel.id) : [];
  const summonCells = myTurn && summonPick && canSummon(s) ? homeCells(s) : [];

  let html = '';
  for (const r of displayRows()) {
    for (const c of displayCols()) {
      const u = unitAt(s, c, r);
      const cls = ['cell'];
      if (r === 0) cls.push('home0');
      if (r === 4) cls.push('home1');
      const mv = moves.find((m) => m.c === c && m.r === r);
      if (mv) cls.push('target', mv.canFlip ? 'flip' : '');
      if (summonCells.some(([sc, sr]) => sc === c && sr === r)) cls.push('summon-target');
      if (u && attacks.some((a) => a.targetId === u.id)) cls.push('attackable');
      const terrain = isSpring(c, r) ? SPRING_SVG : isRuin(c, r) ? RUIN_SVG : '';
      let piece = '';
      if (u) {
        const pcls = [];
        if (u.owner === human && myTurn) pcls.push('mine');
        if (u.owner === s.active && u.acted) pcls.push('acted');
        if (u.id === selected) pcls.push('selected');
        piece = pieceHtml(u, { lying: u.owner !== s.active || s.over, cls: pcls.join(' ') });
      }
      html += `<div class="${cls.join(' ')}" data-c="${c}" data-r="${r}"><span class="coord">${cellName(c, r)}</span>${terrain}${piece}</div>`;
    }
  }
  $('#board').innerHTML = html;

  // 비축
  const bot = 1 - human;
  const resHtml = (p, mine) => {
    const list = reserve(s, p);
    if (!list.length) return '<span class="empty">비어 있음</span>';
    const okList = mine && myTurn ? summonable(s) : [];
    return list.map((u) => {
      const cls = [];
      if (mine && myTurn && canSummon(s) && okList.includes(u)) cls.push('usable');
      if (mine && s.crumbled.includes(u.id)) cls.push('locked');
      if (u.id === summonPick) cls.push('chosen');
      return pieceHtml({ ...u, rem: u.cap }, { lying: true, cls: cls.join(' ') });
    }).join('');
  };
  $('#bot-res-title').textContent = `봇 비축 (${PLAYER_NAME[bot]})`;
  $('#my-res-title').innerHTML = `내 비축 (${PLAYER_NAME[human]}) <small>눌러서 소환</small>`;
  $('#bot-reserve').innerHTML = resHtml(bot, false);
  $('#my-reserve').innerHTML = resHtml(human, true);

  // 대모래시계와 점수
  $('#great').innerHTML = hourglass(s.greatRem / s.config.greatMs, 'warrior', true);
  $('#great-time').textContent = fmtClock(s.greatRem);
  const t = s.config.target;
  $('#scores').innerHTML = [human, bot].map((p) => `
    <div class="score-row"><span class="dot" style="background:var(--${p === 0 ? 'blue' : 'red'})"></span>
      <span>${who(p)} · ${PLAYER_NAME[p]}</span><b>${s.scores[p]}</b>
      <div class="bar"><i style="width:${Math.min(100, (s.scores[p] / t) * 100)}%;background:var(--${p === 0 ? 'blue' : 'red'})"></i></div></div>`).join('')
    + `<p class="hint">${t}점을 먼저 얻으면 승리</p>`;

  // 배너와 버튼
  const banner = $('#banner');
  if (s.over) { banner.className = 'banner'; banner.textContent = '게임 종료'; }
  else if (paused) { banner.className = 'banner warn'; banner.textContent = '일시정지 — 모든 모래가 멈췄다'; }
  else if (myTurn && s.mustSummon) { banner.className = 'banner warn'; banner.textContent = '보드에 모래병이 없다. 비축에서 하나를 골라 소환하라.'; }
  else if (myTurn) { banner.className = 'banner mine'; banner.textContent = s.finalTurn ? '마지막 차례! 내 모래가 흐르는 중' : '내 차례 — 내 모래가 흐르는 중'; }
  else { banner.className = 'banner bot'; banner.textContent = s.finalTurn ? '봇의 마지막 차례…' : '봇이 생각하는 중… (봇의 모래가 흐른다)'; }
  $('#btn-end').disabled = !myTurn || paused || (s.mustSummon && canSummon(s));
  $('#btn-pause').textContent = paused ? '계속' : '일시정지';

  // 기록
  if (s.log.length !== seenLog) {
    seenLog = s.log.length;
    $('#log').innerHTML = s.log.slice().reverse().slice(0, 80)
      .map((l) => `<li class="${l.p === null ? '' : `p${l.p}`}">${l.p === null ? '' : `[${who(l.p)}] `}${l.text}</li>`).join('');
  }
}

// ---------------------------------------------------------------- 조작
function hidePopover() { $('#popover').hidden = true; $('#popover').innerHTML = ''; }

function showPopover(cellEl, title, buttons) {
  const pop = $('#popover');
  const center = $('.center').getBoundingClientRect();
  const rect = cellEl.getBoundingClientRect();
  pop.innerHTML = `<p>${title}</p>` + buttons.map((b, i) => `<button class="btn" type="button" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('')
    + '<button class="btn" type="button" data-i="cancel">취소</button>';
  pop.hidden = false;
  const left = Math.min(Math.max(rect.left - center.left, 0), center.width - 220);
  pop.style.left = `${left}px`;
  pop.style.top = `${rect.bottom - center.top + 4}px`;
  pop.onclick = (e) => {
    const i = e.target.closest('button')?.dataset.i;
    if (i === undefined) return;
    hidePopover();
    if (i !== 'cancel') buttons[Number(i)].run();
    render();
  };
}

function act(res) {
  if (res && res.ok === false) flash(res.error);
  selected = null;
  summonPick = null;
  render();
}

function flash(msg) {
  const b = $('#banner');
  b.className = 'banner warn';
  b.textContent = msg;
  lastRender = performance.now() + 1500; // 잠깐 유지
}

function onBoardPointer(e) {
  if (!s || s.over || paused || s.active !== human) return;
  const cellEl = e.target.closest('.cell');
  if (!cellEl) return;
  hidePopover();
  const c = Number(cellEl.dataset.c), r = Number(cellEl.dataset.r);
  const u = unitAt(s, c, r);

  if (summonPick && canSummon(s) && homeCells(s).some(([hc, hr]) => hc === c && hr === r)) {
    return act(summon(s, summonPick, c, r));
  }
  if (selected) {
    const sel = s.units[selected];
    const mv = moveOptions(s, selected).find((m) => m.c === c && m.r === r);
    if (mv) {
      if (mv.canFlip) {
        const after = sel.cap - sel.rem;
        return showPopover(cellEl, `${cellName(c, r)} 샘에 도착한다. 뒤집을까?`, [
          { label: `↻ 뒤집고 이동 (잔량 ${fmtSec(sel.rem)}초 → ${fmtSec(after)}초)`, run: () => act(move(s, selected, c, r, true)) },
          { label: '그대로 이동', run: () => act(move(s, selected, c, r, false)) },
        ]);
      }
      return act(move(s, selected, c, r, false));
    }
    const at = u && attackOptions(s, selected).find((a) => a.targetId === u.id);
    if (at) {
      const pushLabel = at.pushOff ? '⇥ 밀어내기 — 보드 밖으로 (소멸!)' : at.canPush ? `⇥ 밀어내기 → ${cellName(...at.pushTo)}` : '⇥ 밀어내기 (뒤 칸이 막혀 불가)';
      return showPopover(cellEl, `${KINDS[u.kind].name} 공격`, [
        { label: `↻ 강제 뒤집기 (잔량 ${fmtSec(u.rem)}초 → ${fmtSec(u.cap - u.rem)}초)`, run: () => act(attack(s, selected, u.id, 'flip')) },
        { label: pushLabel, disabled: !at.canPush, run: () => act(attack(s, selected, u.id, 'push')) },
      ]);
    }
  }
  if (u && u.owner === human && !u.acted) { selected = u.id === selected ? null : u.id; summonPick = null; render(); return; }
  selected = null;
  render();
}

function onReservePointer(e) {
  if (!s || s.over || paused || s.active !== human) return;
  const p = e.target.closest('.piece');
  if (!p || !canSummon(s)) return;
  const id = p.dataset.unit;
  if (!summonable(s).some((u) => u.id === id)) return;
  summonPick = summonPick === id ? null : id;
  selected = null;
  hidePopover();
  render();
}

function humanEnd() {
  if (!s || s.over || paused || s.active !== human) return;
  hidePopover();
  const res = endTurn(s);
  if (res && res.ok === false) flash(res.error);
  selected = null; summonPick = null;
  render();
}

// ---------------------------------------------------------------- 봇
function scheduleBot() {
  clearTimeout(botTimer);
  if (!s || s.over || paused || s.active === human) return;
  botTimer = setTimeout(() => {
    if (!s || s.over || paused || s.active === human) return;
    const a = chooseAction(s, opts.level);
    apply(s, a);
    render();
    scheduleBot();
  }, opts.botDelay * (0.7 + Math.random() * 0.6));
}

// ---------------------------------------------------------------- 루프
let lastActive = null;
function frame(now) {
  if (s && !paused && !s.over) {
    const dt = Math.min(now - last, 5000);
    tick(s, dt);
  }
  last = now;
  if (s) {
    if (s.active !== lastActive) { lastActive = s.active; selected = null; summonPick = null; hidePopover(); if (!s.over) scheduleBot(); }
    if (now - lastRender > 100) { lastRender = now; render(); }
    if (s.over && !$('#over').open && !s._shown) { s._shown = true; showOver(); }
  }
  requestAnimationFrame(frame);
}

function showOver() {
  clearTimeout(botTimer);
  render();
  const win = s.winner === human;
  $('#over-body').innerHTML = `<p class="over-title">${win ? '승리!' : '패배'}</p>
    <p>${s.endReason === 'score' ? `${PLAYER_NAME[s.winner]}가 ${s.config.target}점에 먼저 도달했다.` : '대모래시계가 다 떨어져 마지막 점수 계산으로 승부가 났다.'}</p>
    <p>최종 점수 — 나 <b>${s.scores[human]}</b> : 봇 <b>${s.scores[1 - human]}</b> · 총 ${s.turn}차례 · 대모래시계 ${fmtClock(s.config.greatMs - s.greatRem)} 경과</p>`;
  $('#over').showModal();
}

function startGame(form) {
  const fd = new FormData(form);
  const side = fd.get('side');
  human = side === 'random' ? (Math.random() < 0.5 ? 0 : 1) : Number(side);
  opts = {
    level: fd.get('level'),
    botDelay: Number(fd.get('botDelay')),
    showSec: fd.get('showSec') === 'on',
  };
  s = newGame({ greatMs: Number(fd.get('greatMin')) * 60_000, target: Number(fd.get('target')), handleMs: Number(fd.get('handleMs')) });
  paused = false; selected = null; summonPick = null; seenLog = 0; lastActive = null;
  last = performance.now();
  render();
}

// ---------------------------------------------------------------- 연결
$('#board').addEventListener('pointerdown', onBoardPointer);
$('#my-reserve').addEventListener('pointerdown', onReservePointer);
$('#btn-end').addEventListener('click', humanEnd);
$('#btn-new').addEventListener('click', () => { paused = true; $('#setup').showModal(); });
$('#btn-pause').addEventListener('click', () => { if (!s || s.over) return; paused = !paused; last = performance.now(); if (!paused) scheduleBot(); render(); });
$('#btn-again').addEventListener('click', () => { $('#over').close(); $('#setup').showModal(); });
$('#setup-form').addEventListener('submit', (e) => { e.preventDefault(); $('#setup').close(); startGame(e.target); });
$('#setup').addEventListener('cancel', (e) => { if (!s) e.preventDefault(); else { paused = false; last = performance.now(); scheduleBot(); } });
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !$('#setup').open && !$('#over').open) { e.preventDefault(); humanEnd(); }
  if (e.key === 'Escape') { selected = null; summonPick = null; hidePopover(); render(); }
});

$('#setup').showModal();
requestAnimationFrame(frame);
