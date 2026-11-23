// SIGHTLINE 규칙 엔진 (룰북 v2.3). 브라우저와 Node 양쪽에서 쓴다. 외부 의존성 없음.
import {
  DIRS, DV, SEATS_CW, START, SEAT_INFO, hasHedge, inBoard, isPavilion, isRendezvous, cellName,
} from './board.js';

export const ROUNDS = 8;
export const SCORE = { contact: 3, capture: 2, mistake: -1 };

// ---------- 난수 ----------
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 판 위 계산 (위치·방향만 쓰므로 공개 정보로 계산 가능) ----------
export const pieceAt = (pieces, x, y) => pieces.find((p) => p.present && p.x === x && p.y === y);

/** 가면 바로 앞에 생울타리·정자·다른 손님 말이 있으면 가려진다 (6.2) */
export function isCovered(pieces, p) {
  if (hasHedge(p.x, p.y, p.facing)) return true;
  const [dx, dy] = DV[p.facing];
  const nx = p.x + dx, ny = p.y + dy;
  if (!inBoard(nx, ny)) return false;
  if (isPavilion(nx, ny)) return true;
  return !!pieceAt(pieces, nx, ny);
}

/** 좌석 seat 에서 지금 문양이 보이는 손님 말 id 목록 */
export function visibleIds(pieces, seat) {
  return pieces.filter((p) => p.present && p.facing === seat && !isCovered(pieces, p)).map((p) => p.id);
}

/** 이동 방향으로 갈 수 있는 칸들 (1칸, 2칸) */
export function reach(pieces, p, dir) {
  const out = [];
  let x = p.x, y = p.y;
  const [dx, dy] = DV[dir];
  for (let s = 1; s <= 2; s++) {
    if (hasHedge(x, y, dir)) break;
    const nx = x + dx, ny = y + dy;
    if (!inBoard(nx, ny) || isPavilion(nx, ny) || pieceAt(pieces, nx, ny)) break;
    out.push({ steps: s, x: nx, y: ny });
    x = nx; y = ny;
  }
  return out;
}

function movedPieces(pieces, id, x, y, facing) {
  return pieces.map((p) => (p.id === id ? { ...p, x, y, facing } : p));
}

/**
 * 이동 합법성 검사. 반환: null(합법) 또는 이유 문자열.
 * mySeat: 활성 플레이어 좌석, emptySeats: 빈 발코니 목록
 */
export function moveError(pieces, mySeat, emptySeats, pieceId, dir, steps) {
  const p = pieces.find((q) => q.id === pieceId && q.present);
  if (!p) return '정원에 없는 손님 말입니다.';
  if (p.token !== null && p.token !== undefined) return '초대장 토큰이 올려진 손님 말은 옮길 수 없습니다.';
  if (!DIRS.includes(dir)) return '방향이 잘못되었습니다.';
  const dest = reach(pieces, p, dir).find((r) => r.steps === steps);
  if (!dest) return '그 칸으로는 갈 수 없습니다.';
  const after = movedPieces(pieces, p.id, dest.x, dest.y, dir);
  const before = new Set(visibleIds(pieces, mySeat));
  const newly = visibleIds(after, mySeat).filter((id) => !before.has(id));
  if (newly.length) return `내 좌석에 가면이 새로 드러나는 이동은 할 수 없습니다 (${newly.join(', ')}번).`;
  if (emptySeats.includes(dir)) {
    const moved = after.find((q) => q.id === p.id);
    if (!isCovered(after, moved)) return '빈 발코니 쪽으로 옮긴 손님 말은 가려진 채 멈춰야 합니다.';
  }
  return null;
}

export function legalMoves(pieces, mySeat, emptySeats) {
  const out = [];
  for (const p of pieces) {
    if (!p.present || (p.token !== null && p.token !== undefined)) continue;
    for (const dir of DIRS) {
      for (const r of reach(pieces, p, dir)) {
        if (!moveError(pieces, mySeat, emptySeats, p.id, dir, r.steps)) {
          out.push({ pieceId: p.id, dir, steps: r.steps, x: r.x, y: r.y });
        }
      }
    }
  }
  return out;
}

/** 좌석 fromSeat 에 앉아 지목할 수 있는 손님 말 (가려져 있어도 된다) */
export function accusableIds(pieces, fromSeat, ownSeat, emptySeats) {
  return pieces.filter((p) => p.present && (p.facing === fromSeat
    || (fromSeat === ownSeat && emptySeats.includes(p.facing)))).map((p) => p.id);
}

// ---------- 게임 상태 ----------
/**
 * seats: 참가 좌석(시계 방향 순서), firstSeat: 첫 플레이어 좌석.
 * 반환 상태의 players 는 차례 순서다.
 */
export function createGame({ seats = SEATS_CW, firstSeat, seed = Date.now() } = {}) {
  const rng = makeRng(seed);
  const cw = SEATS_CW.filter((s) => seats.includes(s));
  if (cw.length < 3 || cw.length > 4) throw new Error('3~4인만 지원합니다.');
  const first = firstSeat && cw.includes(firstSeat) ? firstSeat : cw[Math.floor(rng() * cw.length)];
  const i0 = cw.indexOf(first);
  const order = cw.slice(i0).concat(cw.slice(0, i0));
  const n = order.length;
  const nPieces = n === 4 ? 16 : 12;
  const ids = shuffle(Array.from({ length: nPieces }, (_, i) => i + 1), rng);
  const players = order.map((seat, i) => {
    const mine = ids.slice(i * 4, i * 4 + 4);
    const neutral = mine[Math.floor(rng() * 4)];
    return {
      seat, card: true, glass: 1, mistakes: 0, contacted: [], captured: [], seen: {},
      roster: { agents: mine.filter((id) => id !== neutral).sort((a, b) => a - b), neutral },
    };
  });
  const crestOf = {};
  players.forEach((pl) => { pl.roster.agents.forEach((id) => { crestOf[id] = pl.seat; }); crestOf[pl.roster.neutral] = 'X'; });
  const pieces = Array.from({ length: nPieces }, (_, i) => {
    const [x, y, facing] = START[i];
    return { id: i + 1, x, y, facing, crest: crestOf[i + 1], present: true, token: null, out: null, lastMover: null, moves: { N: 0, E: 0, S: 0, W: 0 } };
  });
  const st = {
    n, round: 1, turn: 0, phase: 'play', scout: null, pieces, players,
    emptySeats: SEATS_CW.filter((s) => !cw.includes(s)), log: [], result: null, seq: 0,
  };
  pushLog(st, null, `게임 시작. 첫 플레이어는 ${SEAT_INFO[first].label}쪽(${SEAT_INFO[first].crest})입니다.`);
  updateSeen(st);
  return st;
}

export const targetSeat = (st, i) => st.players[(i + 1) % st.n].seat;
export const hunterIndex = (st, i) => (i - 1 + st.n) % st.n;
export const playerIndexOfSeat = (st, seat) => st.players.findIndex((p) => p.seat === seat);

function pushLog(st, seat, text) {
  st.log.push({ round: st.round, seat, text });
  if (st.log.length > 300) st.log.shift();
}

function updateSeen(st) {
  for (const pl of st.players) {
    for (const id of visibleIds(st.pieces, pl.seat)) pl.seen[id] = st.pieces[id - 1].crest;
  }
}

function startTurn(st) {
  const i = st.turn;
  for (const p of st.pieces) if (p.token === i) p.token = null;
}

function endTurn(st) {
  st.phase = 'play';
  st.scout = null;
  st.turn = (st.turn + 1) % st.n;
  if (st.turn === 0) {
    st.round += 1;
    if (st.round > ROUNDS) { finish(st); return; }
  }
  startTurn(st);
  updateSeen(st);
}

export function scoreOf(pl) {
  return pl.contacted.length * SCORE.contact + pl.captured.length * SCORE.capture + pl.mistakes * SCORE.mistake;
}

function finish(st) {
  st.round = ROUNDS;
  st.phase = 'over';
  const rows = st.players.map((pl, i) => ({ i, seat: pl.seat, score: scoreOf(pl), contacts: pl.contacted.length, mistakes: pl.mistakes }));
  rows.sort((a, b) => b.score - a.score || b.contacts - a.contacts || a.mistakes - b.mistakes);
  const top = rows[0];
  const winners = rows.filter((r) => r.score === top.score && r.contacts === top.contacts && r.mistakes === top.mistakes).map((r) => r.seat);
  st.result = { rows, winners };
  pushLog(st, null, `게임 종료. 승자: ${winners.map((s) => SEAT_INFO[s].label).join(', ')}`);
}

function removePiece(st, p, how) {
  p.present = false;
  p.out = how;
  p.token = null;
}

function accuse(st, i, p, fromSeat) {
  const pl = st.players[i];
  const tgt = targetSeat(st, i);
  const label = SEAT_INFO[pl.seat].label;
  if (p.crest === tgt) {
    pl.captured.push(p.id);
    removePiece(st, p, 'captured');
    pushLog(st, pl.seat, `${label}: ${p.id}번 지목 → ${SEAT_INFO[p.crest].crest}, 포획! (+2, 지목 카드 회수)`);
  } else {
    pl.mistakes += 1;
    pl.card = false;
    removePiece(st, p, 'departed');
    pushLog(st, pl.seat, `${label}: ${p.id}번 지목 → ${SEAT_INFO[p.crest].crest}. 틀렸다 (오인 −1, 지목 카드 잃음)`);
  }
  void fromSeat;
}

/**
 * 행동 적용. 성공하면 null, 실패하면 오류 문자열.
 * action: {type:'move',pieceId,dir,steps} | {type:'accuse',pieceId} | {type:'contact',pieceId}
 *       | {type:'scout',seat} | {type:'scoutAccuse',pieceId|null} | {type:'pass'}
 */
export function act(st, i, action) {
  if (st.phase === 'over') return '게임이 끝났습니다.';
  if (i !== st.turn) return '내 차례가 아닙니다.';
  const pl = st.players[i];
  const label = SEAT_INFO[pl.seat].label;
  const t = action?.type;
  if (st.phase === 'scout') {
    if (t !== 'scoutAccuse') return '정찰을 마무리해야 합니다.';
    if (action.pieceId == null) {
      pushLog(st, pl.seat, `${label}: 정찰 후 지목하지 않았다.`);
    } else {
      const p = st.pieces.find((q) => q.id === action.pieceId && q.present);
      if (!p) return '정원에 없는 손님 말입니다.';
      if (!pl.card) return '지목 카드가 없습니다.';
      if (p.facing !== st.scout.seat) return '정찰한 좌석을 향한 손님 말만 지목할 수 있습니다.';
      accuse(st, i, p, st.scout.seat);
    }
    endTurn(st);
    st.seq++;
    return null;
  }
  if (t === 'move') {
    const err = moveError(st.pieces, pl.seat, st.emptySeats, action.pieceId, action.dir, action.steps);
    if (err) return err;
    const p = st.pieces.find((q) => q.id === action.pieceId);
    const dest = reach(st.pieces, p, action.dir).find((r) => r.steps === action.steps);
    p.x = dest.x; p.y = dest.y; p.facing = action.dir;
    p.moves[pl.seat] += 1;
    p.lastMover = pl.seat;
    let extra = '';
    if (isRendezvous(p.x, p.y)) { p.token = i; extra = ' (접선 지점, 초대장 토큰)'; }
    pushLog(st, pl.seat, `${label}: ${p.id}번을 ${cellName(p.x, p.y)}로 이동 (${SEAT_INFO[action.dir].label}향)${extra}`);
  } else if (t === 'accuse') {
    if (!pl.card) return '지목 카드가 없습니다.';
    const p = st.pieces.find((q) => q.id === action.pieceId && q.present);
    if (!p) return '정원에 없는 손님 말입니다.';
    if (!accusableIds(st.pieces, pl.seat, pl.seat, st.emptySeats).includes(p.id)) return '내 좌석을 향한 손님 말만 지목할 수 있습니다.';
    accuse(st, i, p, pl.seat);
  } else if (t === 'contact') {
    const p = st.pieces.find((q) => q.id === action.pieceId && q.present);
    if (!p) return '정원에 없는 손님 말입니다.';
    if (!isRendezvous(p.x, p.y)) return '접선 지점에 있는 손님 말이 아닙니다.';
    if (p.crest === pl.seat) {
      pl.contacted.push(p.id);
      removePiece(st, p, 'contacted');
      pushLog(st, pl.seat, `${label}: ${p.id}번으로 접선! (+3)`);
    } else {
      pl.mistakes += 2;
      removePiece(st, p, 'departed');
      pushLog(st, pl.seat, `${label}: ${p.id}번 접선 실패 → ${SEAT_INFO[p.crest].crest} (오인 −2)`);
    }
  } else if (t === 'scout') {
    if (pl.glass <= 0) return '오페라 글라스가 없습니다.';
    const ti = playerIndexOfSeat(st, action.seat);
    if (ti < 0 || ti === i) return '다른 플레이어의 좌석만 정찰할 수 있습니다.';
    pl.glass -= 1;
    const vis = visibleIds(st.pieces, action.seat);
    for (const id of vis) pl.seen[id] = st.pieces[id - 1].crest;
    st.phase = 'scout';
    st.scout = { player: i, seat: action.seat, visible: vis };
    pushLog(st, pl.seat, `${label}: ${SEAT_INFO[action.seat].label}쪽 좌석에서 정찰한다.`);
    st.seq++;
    return null;
  } else if (t === 'pass') {
    if (hasAnyAction(st, i)) return '할 수 있는 행동이 있으면 넘길 수 없습니다.';
    pushLog(st, pl.seat, `${label}: 할 수 있는 행동이 없어 넘긴다.`);
  } else {
    return '알 수 없는 행동입니다.';
  }
  updateSeen(st);
  endTurn(st);
  st.seq++;
  return null;
}

export function hasAnyAction(st, i) {
  const pl = st.players[i];
  if (legalMoves(st.pieces, pl.seat, st.emptySeats).length) return true;
  if (pl.card && accusableIds(st.pieces, pl.seat, pl.seat, st.emptySeats).length) return true;
  if (pl.glass > 0) return true;
  return st.pieces.some((p) => p.present && p.crest === pl.seat && isRendezvous(p.x, p.y));
}

// ---------- 좌석별 화면 정보 (숨은 정보를 걸러 낸다) ----------
/** i: 플레이어 차례 순서 번호, null 이면 관전자 */
export function viewFor(st, i) {
  const me = i == null ? null : st.players[i];
  const visNow = me ? new Set(visibleIds(st.pieces, me.seat)) : new Set();
  const scoutVis = st.phase === 'scout' && st.scout && st.scout.player === i ? new Set(st.scout.visible) : new Set();
  const mine = me ? new Set([...me.roster.agents, me.roster.neutral]) : new Set();
  const pieces = st.pieces.map((p) => {
    const v = { id: p.id, x: p.x, y: p.y, facing: p.facing, present: p.present, token: p.token, out: p.out, lastMover: p.lastMover, moves: { ...p.moves } };
    let known = null;
    if (!p.present || st.phase === 'over') known = 'public';
    else if (mine.has(p.id)) known = 'mine';
    else if (visNow.has(p.id)) known = 'now';
    else if (scoutVis.has(p.id)) known = 'scout';
    else if (me && me.seen[p.id]) known = 'memory';
    if (known) { v.crest = p.crest; v.known = known; }
    return v;
  });
  return {
    n: st.n, round: st.round, rounds: ROUNDS, turn: st.turn, phase: st.phase, emptySeats: st.emptySeats,
    scout: st.scout && st.scout.player === i ? { seat: st.scout.seat, visible: st.scout.visible } : (st.scout ? { seat: st.scout.seat, player: st.scout.player } : null),
    me: i,
    roster: me ? me.roster : null,
    seen: me ? { ...me.seen } : {},
    players: st.players.map((pl, k) => ({
      seat: pl.seat, card: pl.card, glass: pl.glass, mistakes: pl.mistakes,
      contacted: pl.contacted.slice(), captured: pl.captured.slice(), score: scoreOf(pl),
      target: st.players[(k + 1) % st.n].seat,
    })),
    pieces, log: st.log.slice(-60), result: st.result, seq: st.seq,
  };
}
