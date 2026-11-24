// LIGHTCONE 봇. publicView 로 얻는 공개 정보와 자기 정보만 쓴다(상대 실체를 훔쳐보지 않는다).
import { ADJ, PLANETS, SYSTEMS, DIST, STRENGTH, FLEET_IDS, HOME } from './map.js';
import { STAY, other, realPos, legalMoves, ripple, eligibleFleets, canOccupy } from './engine.js';

const CENTER = ['8', '9', '10'];

function myPendingPlanets(view) {
  const set = new Set();
  for (let k = 1; k <= 5; k++) for (const c of view.my.slots[k]) if (c.kind === 'planet') set.add(c.planet);
  return set;
}

// 상대 함대별로 "가장 최근에 확실히 알던 위치와 그때부터 지난 라운드 수"를 구한다.
function lastKnown(view) {
  const opp = other(view.me);
  const known = {};
  for (const e of view.oppEchoes) known[e.id] = { at: e.echo, age: 2 };
  for (const e of view.log) {
    const age = view.round - e.round;
    if (e.pid === opp && (e.type === 'strike') && age < (known[e.fid]?.age ?? 99)) {
      known[e.fid] = { at: e.system, age };
    }
    if (e.type === 'engagement') {
      for (const fid of e.fleets[opp]) {
        if (age < (known[fid]?.age ?? 99)) known[fid] = { at: e.system, age };
      }
    }
    if (e.type === 'recall' && e.pid === opp && age < (known[e.fid]?.age ?? 99)) {
      known[e.fid] = { at: HOME[opp], age };
    }
  }
  return known;
}

// 상대 함대가 지금 각 성계에 있을 확률(대략)을 더한 값
function threatMap(view) {
  const opp = other(view.me);
  const known = lastKnown(view);
  const threat = Object.fromEntries(SYSTEMS.map((s) => [s, 0]));
  const strength = Object.fromEntries(SYSTEMS.map((s) => [s, 0]));
  for (const fid of FLEET_IDS) {
    const k = known[fid];
    const radius = Math.max(0, Math.min(3, k.age));
    const cands = SYSTEMS.filter((s) => DIST[k.at][s] <= radius);
    const w = (s) => {
      let x = 1;
      if (PLANETS.includes(s)) x += view.holds[s] === opp ? 1 : 2.5;
      if (CENTER.includes(s)) x += 1;
      if (s === HOME[opp]) x *= 0.4;
      return x;
    };
    const total = cands.reduce((t, s) => t + w(s), 0);
    for (const s of cands) {
      threat[s] += w(s) / total;
      strength[s] += (w(s) / total) * STRENGTH[fid];
    }
  }
  return { threat, strength };
}

function planetValue(view, s, pending) {
  const me = view.me;
  const opp = other(me);
  let v = 0;
  if (view.holds[s] !== me && !pending.has(s)) v = 10;
  else if (view.holds[s] === me) v = 1.5;
  if (view.holds[s] === opp) v += 2;
  if (CENTER.includes(s)) v += 2;
  // 늦게 놓을수록 마지막 빛 전에 도달하지 못한다
  const arriveBy = view.round + 1 + ripple({ nebula: view.nebula }, s);
  if (arriveBy > 13) v -= 6;
  return v;
}

// 상대의 파문이 곧 도달할 수 있는 내 행성(봉쇄 후보)
function blockadeTargets(view) {
  const me = view.me;
  const out = [];
  for (const s of PLANETS) {
    if (view.holds[s] !== me) continue;
    const d = ripple({ nebula: view.nebula }, s);
    const incoming = view.oppSlotCounts.slice(1, 3).some((n, i) => n > 0 && d >= i + 1);
    if (incoming) out.push(s);
  }
  return out;
}

export function botMoves(view, rng = Math.random) {
  const pending = myPendingPlanets(view);
  const { strength } = threatMap(view);
  const blockades = view.round >= 5 ? blockadeTargets(view) : [];
  const taken = new Set();
  const moves = [];
  const order = [...FLEET_IDS].sort((a, b) => STRENGTH[b] - STRENGTH[a]);
  const plan = {};
  for (const fid of order) {
    const f = view.my.fleets.find((x) => x.id === fid);
    const here = realPos(f);
    let best = null;
    for (const s of PLANETS) {
      if (taken.has(s)) continue;
      let score = planetValue(view, s, pending);
      if (blockades.includes(s)) score += 6;
      const d = DIST[here][s];
      score -= 2.2 * d;
      if (strength[s] > STRENGTH[fid]) score -= 2.5 * (strength[s] - STRENGTH[fid]);
      score += rng() * 1.5;
      if (!best || score > best.score) best = { s, score };
    }
    const target = best?.s ?? here;
    taken.add(target);
    const legal = legalMoves({ players: { [view.me]: view.my } }, view.me, fid);
    let move = STAY;
    if (target !== here) {
      const steps = legal.filter((m) => m !== STAY);
      const better = steps.filter((m) => DIST[m][target] < DIST[here][target]);
      const pool = better.length ? better : steps.filter((m) => DIST[m][target] <= DIST[here][target]);
      if (pool.length) move = pool[Math.floor(rng() * pool.length)];
    }
    plan[fid] = move;
  }
  for (const fid of FLEET_IDS) moves.push(plan[fid]);
  return moves;
}

export function botAttacks(view, rng = Math.random) {
  const { threat, strength } = threatMap(view);
  const pending = myPendingPlanets(view);
  const out = [];
  for (const f of view.my.fleets) {
    const s = realPos(f);
    if (s === HOME[view.me]) continue;
    const p = Math.min(1, threat[s]);
    const myStr = view.my.fleets.filter((x) => realPos(x) === s).reduce((t, x) => t + STRENGTH[x.id], 0);
    const wantsOccupy = PLANETS.includes(s) && view.holds[s] !== view.me && !pending.has(s);
    const threshold = wantsOccupy ? 0.65 : 0.33;
    if (p >= threshold && myStr >= strength[s] * 0.9 && rng() < 0.85) out.push(f.id);
  }
  return out;
}

export function botBlockades(state, options) {
  return options.map((o) => o.idx); // 봉쇄는 늘 한다
}

export function botOccupations(view, state, rng = Math.random) {
  const pid = view.me;
  const pending = myPendingPlanets(view);
  const orders = [];
  const usedPlanets = new Set();
  const eligible = eligibleFleets(state, pid);
  const idle = [];
  for (const fid of eligible) {
    const f = view.my.fleets.find((x) => x.id === fid);
    const s = realPos(f);
    const contested = view.holds[s] === other(pid);
    const worth = PLANETS.includes(s) && (view.holds[s] !== pid || rng() < 0.3) && (!pending.has(s) || contested);
    const arriveBy = view.round + ripple(state, s);
    if (worth && canOccupy(state, pid, fid) && !usedPlanets.has(s) && arriveBy <= 13) {
      orders.push({ fid, kind: 'occupy' });
      usedPlanets.add(s);
    } else idle.push(fid);
  }
  let decoys = view.my.decoys;
  for (const fid of idle) {
    if (decoys > 0 && view.round <= 8 && rng() < 0.3) {
      orders.push({ fid, kind: 'decoy', slot: 3 + Math.floor(rng() * 3) });
      decoys -= 1;
    }
  }
  return orders;
}

export { ADJ };
