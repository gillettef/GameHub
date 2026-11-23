// LIGHTCONE 규칙 엔진 (단순판 v0.7). 규칙의 기준은 rules/rulebook.md 다.
// 디지털판에서는 컴퓨터가 모든 규칙을 강제하므로 정직성 확인(공격 표식, 이동 확인)은 생략한다.
import {
  ADJ, PLANETS, HOME, NEBULA_CARDS, STRENGTH, FLEET_IDS, ROUNDS, VICTORY,
  PLANET_COPIES, DECOYS, LAST_LIGHT_SLOTS, rippleDistance,
} from './map.js';

export const STAY = 'STAY';
export const other = (p) => (p === 'A' ? 'B' : 'A');

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newPlayer(pid) {
  return {
    id: pid,
    fleets: FLEET_IDS.map((id) => ({
      id, front: STAY, back: HOME[pid], echo: HOME[pid], attacked: false, recalled: false,
    })),
    planetCards: Object.fromEntries(PLANETS.map((p) => [p, PLANET_COPIES])),
    decoys: DECOYS,
    // slots[1..5]: 각 칸의 카드 목록. 카드 = { kind: 'planet', planet, round } | { kind: 'decoy', round }
    slots: [null, [], [], [], [], []],
  };
}

export function newGame({ seed = Date.now(), nebula } = {}) {
  const rng = makeRng(seed);
  const neb = nebula ?? NEBULA_CARDS[Math.floor(rng() * NEBULA_CARDS.length)];
  return {
    seed,
    round: 1,
    phase: 'plan', // plan → attack → blockade? → occupy → (다음 라운드) … → over
    nebula: neb,
    holds: {}, // planet → 'A' | 'B'
    players: { A: newPlayer('A'), B: newPlayer('B') },
    pendingArrivals: null,
    lastLight: false,
    winner: null, // 'A' | 'B' | 'draw'
    log: [],
    history: [], // 라운드별 실제 위치 기록(게임 종료 후 공개용)
  };
}

export function ripple(state, planet) {
  return rippleDistance(planet, state.nebula);
}

export function realPos(fleet) {
  if (fleet.front !== STAY) return fleet.front;
  if (fleet.back !== STAY) return fleet.back;
  return fleet.echo;
}

export function fleetOf(state, pid, fid) {
  return state.players[pid].fleets.find((f) => f.id === fid);
}

export function legalMoves(state, pid, fid) {
  const f = fleetOf(state, pid, fid);
  const here = realPos(f);
  const blocked = new Set([f.front, f.back]);
  return [STAY, ...ADJ[here].filter((s) => !blocked.has(s))];
}

export function holdCount(state, pid) {
  return Object.values(state.holds).filter((o) => o === pid).length;
}

function log(state, entry) {
  state.log.push({ round: state.round, ...entry });
}

// ---------------------------------------------------------------- 1. 이동 처리
export function submitMoves(state, moves) {
  if (state.phase !== 'plan') throw new Error(`phase ${state.phase} 에서는 이동할 수 없다`);
  for (const pid of ['A', 'B']) {
    FLEET_IDS.forEach((fid, i) => {
      const m = moves[pid][i];
      if (!legalMoves(state, pid, fid).includes(m)) throw new Error(`${pid} 함대 ${fid}: ${m} 은(는) 갈 수 없다`);
    });
  }
  for (const pid of ['A', 'B']) {
    const p = state.players[pid];
    FLEET_IDS.forEach((fid, i) => {
      const f = fleetOf(state, pid, fid);
      f.attacked = false;
      f.recalled = false;
      const revealed = f.back;
      f.back = f.front;
      f.front = moves[pid][i];
      if (revealed !== STAY) f.echo = revealed;
      log(state, { type: 'reveal', pid, fid, card: revealed, echo: f.echo });
    });
    void p;
  }
  state.history.push({
    round: state.round,
    A: FLEET_IDS.map((fid) => realPos(fleetOf(state, 'A', fid))),
    B: FLEET_IDS.map((fid) => realPos(fleetOf(state, 'B', fid))),
  });
  state.phase = 'attack';
}

// ---------------------------------------------------------------- 2. 공격 처리
function recall(state, pid, f) {
  log(state, { type: 'recall', pid, fid: f.id, cards: [f.front, f.back], from: realPos(f) });
  f.front = STAY;
  f.back = HOME[pid];
  f.echo = HOME[pid];
  f.recalled = true;
}

export function submitAttacks(state, attacks) {
  if (state.phase !== 'attack') throw new Error(`phase ${state.phase} 에서는 공격할 수 없다`);
  const declared = {}; // system → Set(pid)
  for (const pid of ['A', 'B']) {
    for (const fid of new Set(attacks[pid] ?? [])) {
      const f = fleetOf(state, pid, fid);
      f.attacked = true;
      const s = realPos(f);
      (declared[s] ??= new Set()).add(pid);
      log(state, { type: 'strike', pid, fid, system: s });
    }
  }
  const toRecall = [];
  for (const [s, who] of Object.entries(declared)) {
    const present = {
      A: state.players.A.fleets.filter((f) => realPos(f) === s),
      B: state.players.B.fleets.filter((f) => realPos(f) === s),
    };
    for (const pid of who) {
      if (present[other(pid)].length === 0) log(state, { type: 'miss', pid, system: s });
    }
    if (present.A.length === 0 || present.B.length === 0) continue;
    const sum = {
      A: present.A.reduce((t, f) => t + STRENGTH[f.id], 0),
      B: present.B.reduce((t, f) => t + STRENGTH[f.id], 0),
    };
    let losers;
    if (sum.A !== sum.B) losers = [sum.A > sum.B ? 'B' : 'A'];
    else if (who.size === 2) losers = [];
    else losers = [other([...who][0])];
    log(state, {
      type: 'engagement', system: s,
      fleets: { A: present.A.map((f) => f.id), B: present.B.map((f) => f.id) },
      sum, losers,
    });
    for (const l of losers) toRecall.push(...present[l].map((f) => [l, f]));
  }
  for (const [pid, f] of toRecall) recall(state, pid, f);
  advanceRipple(state);
}

// ---------------------------------------------------------------- 3. 파문 진행 + 봉쇄
function advanceRipple(state) {
  const arrivals = [];
  for (const pid of ['A', 'B']) {
    const p = state.players[pid];
    for (const c of p.slots[1]) arrivals.push({ owner: pid, card: c });
    for (let k = 1; k < 5; k++) p.slots[k] = p.slots[k + 1];
    p.slots[5] = [];
  }
  prepareArrivals(state, arrivals);
}

// 봉쇄 가능한 도달 카드 목록: { idx, blocker, fleets: [fid…] }
export function blockadeOptions(state) {
  const arr = state.pendingArrivals ?? [];
  const opts = [];
  arr.forEach((a, idx) => {
    if (a.card.kind !== 'planet') return;
    const blocker = other(a.owner);
    const fleets = state.players[blocker].fleets
      .filter((f) => !f.attacked && realPos(f) === a.card.planet)
      .map((f) => f.id);
    if (fleets.length) opts.push({ idx, blocker, planet: a.card.planet, fleets });
  });
  return opts;
}

function prepareArrivals(state, arrivals) {
  state.pendingArrivals = arrivals;
  for (const a of arrivals) log(state, { type: 'arrival', pid: a.owner, card: a.card });
  if (state.lastLight) {
    // 마지막 빛: 더 숨길 정보가 없으므로 가능한 봉쇄는 모두 자동으로 한다.
    const all = blockadeOptions(state);
    resolveArrivals(state, all.map((o) => o.idx));
    return;
  }
  state.phase = blockadeOptions(state).length ? 'blockade' : 'resolveArrivals';
  if (state.phase === 'resolveArrivals') {
    resolveArrivals(state, []);
    state.phase = 'occupy';
  }
}

export function submitBlockades(state, blocks) {
  if (state.phase !== 'blockade') throw new Error(`phase ${state.phase} 에서는 봉쇄할 수 없다`);
  const opts = blockadeOptions(state);
  const chosen = [];
  for (const pid of ['A', 'B']) {
    for (const idx of blocks[pid] ?? []) {
      const o = opts.find((x) => x.idx === idx && x.blocker === pid);
      if (!o) throw new Error(`${pid} 은(는) 도달 카드 ${idx} 를 봉쇄할 수 없다`);
      chosen.push(idx);
    }
  }
  resolveArrivals(state, chosen);
  state.phase = 'occupy';
}

function resolveArrivals(state, blockedIdx) {
  const blocked = new Set(blockedIdx);
  const byPlanet = {};
  (state.pendingArrivals ?? []).forEach((a, idx) => {
    const p = state.players[a.owner];
    if (a.card.kind === 'decoy') { p.decoys += 1; return; }
    p.planetCards[a.card.planet] += 1;
    if (blocked.has(idx)) {
      const o = blockadeOptions(state).find((x) => x.idx === idx);
      log(state, { type: 'blockade', pid: other(a.owner), planet: a.card.planet, fid: o?.fleets[0] });
      return;
    }
    (byPlanet[a.card.planet] ??= new Set()).add(a.owner);
  });
  for (const [planet, owners] of Object.entries(byPlanet)) {
    if (owners.size === 2) {
      delete state.holds[planet];
      log(state, { type: 'neutral', planet });
    } else {
      const owner = [...owners][0];
      const prev = state.holds[planet];
      state.holds[planet] = owner;
      log(state, { type: 'hold', pid: owner, planet, prev: prev ?? null });
    }
  }
  state.pendingArrivals = null;
}

// ---------------------------------------------------------------- 4. 점령 처리
export function eligibleFleets(state, pid) {
  return state.players[pid].fleets.filter((f) => !f.attacked && !f.recalled).map((f) => f.id);
}

export function canOccupy(state, pid, fid) {
  const f = fleetOf(state, pid, fid);
  const s = realPos(f);
  return !f.attacked && !f.recalled && PLANETS.includes(s) && state.players[pid].planetCards[s] > 0;
}

// orders: [{ fid, kind: 'occupy' } | { fid, kind: 'decoy', slot }]
export function validateOccupations(state, pid, orders) {
  const elig = new Set(eligibleFleets(state, pid));
  const used = new Set();
  const planets = new Set();
  let decoys = 0;
  for (const o of orders) {
    if (!elig.has(o.fid)) return `함대 ${o.fid} 는 이번 라운드에 점령·위장할 수 없다`;
    if (used.has(o.fid)) return `함대 ${o.fid} 를 두 번 썼다`;
    used.add(o.fid);
    if (o.kind === 'occupy') {
      if (!canOccupy(state, pid, o.fid)) return `함대 ${o.fid} 는 점령할 수 없다`;
      const s = realPos(fleetOf(state, pid, o.fid));
      if (planets.has(s)) return `같은 행성 ${s} 를 두 번 점령할 수 없다`;
      planets.add(s);
    } else if (o.kind === 'decoy') {
      if (![3, 4, 5].includes(o.slot)) return '위장 카드는 3·4·5번 칸에만 놓는다';
      decoys += 1;
    } else return `알 수 없는 행동 ${o.kind}`;
  }
  if (decoys > state.players[pid].decoys) return '위장 카드가 부족하다';
  return null;
}

export function submitOccupations(state, orders) {
  if (state.phase !== 'occupy') throw new Error(`phase ${state.phase} 에서는 점령할 수 없다`);
  for (const pid of ['A', 'B']) {
    const err = validateOccupations(state, pid, orders[pid] ?? []);
    if (err) throw new Error(`${pid}: ${err}`);
  }
  for (const pid of ['A', 'B']) {
    const p = state.players[pid];
    for (const o of orders[pid] ?? []) {
      if (o.kind === 'occupy') {
        const s = realPos(fleetOf(state, pid, o.fid));
        p.planetCards[s] -= 1;
        const k = ripple(state, s);
        p.slots[k].push({ kind: 'planet', planet: s, round: state.round });
        log(state, { type: 'place', pid, slot: k, secret: { kind: 'planet', planet: s, fid: o.fid } });
      } else {
        p.decoys -= 1;
        p.slots[o.slot].push({ kind: 'decoy', round: state.round });
        log(state, { type: 'place', pid, slot: o.slot, secret: { kind: 'decoy', fid: o.fid } });
      }
    }
  }
  checkVictory(state);
  if (state.phase === 'over') return;
  if (state.round >= ROUNDS) { runLastLight(state); return; }
  state.round += 1;
  state.phase = 'plan';
}

// ---------------------------------------------------------------- 5. 승리 확인과 마지막 빛
function checkVictory(state) {
  const a = holdCount(state, 'A');
  const b = holdCount(state, 'B');
  if (a < VICTORY && b < VICTORY) return;
  if (a === b) return; // 동시에 6 이상이고 같으면 계속한다
  finish(state, a > b ? 'A' : 'B', 'immediate');
}

function finish(state, winner, how) {
  state.winner = winner;
  state.phase = 'over';
  log(state, { type: 'gameover', winner, how, holds: { A: holdCount(state, 'A'), B: holdCount(state, 'B') } });
}

function runLastLight(state) {
  state.lastLight = true;
  log(state, { type: 'lastlight' });
  for (let k = 1; k <= LAST_LIGHT_SLOTS; k++) {
    const arrivals = [];
    for (const pid of ['A', 'B']) {
      for (const c of state.players[pid].slots[k]) arrivals.push({ owner: pid, card: c });
      state.players[pid].slots[k] = [];
    }
    prepareArrivals(state, arrivals);
  }
  const a = holdCount(state, 'A');
  const b = holdCount(state, 'B');
  finish(state, a === b ? 'draw' : a > b ? 'A' : 'B', 'lastlight');
}

// ---------------------------------------------------------------- 공개 정보
// pid 가 볼 수 있는 상대 정보. 봇은 이것만 쓴다.
export function publicView(state, pid) {
  const opp = other(pid);
  const op = state.players[opp];
  return {
    me: pid,
    round: state.round,
    phase: state.phase,
    nebula: state.nebula,
    holds: { ...state.holds },
    my: state.players[pid],
    oppEchoes: op.fleets.map((f) => ({ id: f.id, echo: f.echo })),
    oppSlotCounts: [null, 1, 2, 3, 4, 5].map((k) => (k ? op.slots[k].length : null)),
    oppDecoysLeft: op.decoys,
    // 공개된 사건만 남긴다(상대의 비밀 배치 내용은 지운다)
    log: state.log.map((e) => (e.type === 'place' && e.pid === opp ? { ...e, secret: undefined } : e)),
  };
}
