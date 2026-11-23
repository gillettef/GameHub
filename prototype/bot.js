// CREASE 휴리스틱 봇: 한 차례의 모든 걸음/접기 조합을 펼쳐 보고 평가 함수가 가장 높은 것을 고른다.
import {
  ROWS, key, unkey, neighbors, isCoveredCol, distTable, foldActions, applyFoldAction,
} from './engine.js';

export const BOT_PROFILES = {
  // 균형형: 자기 이득과 상대 견제를 함께 본다
  balanced: { selfW: 1.0, oppW: 0.6, absentPenalty: 2.0, noise: 0.3, allowFold: true },
  // 독주형: 상대를 보지 않는다
  greedy: { selfW: 1.0, oppW: 0.0, absentPenalty: 2.0, noise: 0.3, allowFold: true },
  // 방해형: 상대 견제를 크게 본다
  spiteful: { selfW: 1.0, oppW: 1.2, absentPenalty: 2.0, noise: 0.3, allowFold: true },
  // 접기를 쓰지 않는 기준선 (접기의 가치 측정용)
  nofold: { selfW: 1.0, oppW: 0.6, absentPenalty: 2.0, noise: 0.3, allowFold: false },
};

function potential(state, fold, pl, shards, absentPenalty) {
  const cfg = state.config;
  let f = fold;
  let pen = 0;
  if (isCoveredCol(fold, pl.c)) {
    // 부재 중이면 다음 차례에 자기를 가린 쪽을 펼쳐야 한다
    const leftCovers = fold.L > 0 && pl.c >= fold.L && pl.c <= 2 * fold.L - 1;
    f = leftCovers ? { L: 0, R: fold.R } : { L: fold.L, R: 0 };
    pen = absentPenalty;
  }
  const D = distTable(f);
  const here = key(pl.c, pl.r);
  const dHome = D[here][pl.anchor];
  let dShard = Infinity;
  let shardToHome = 0;
  if (pl.carried < cfg.carryLimit) {
    for (const [k, n] of shards) {
      if (n <= 0 || isCoveredCol(f, unkey(k)[0])) continue;
      const d = D[here][k];
      if (d < 0) continue;
      const total = d + 0.5 * D[k][pl.anchor];
      if (total < dShard) { dShard = total; shardToHome = D[k][pl.anchor]; }
    }
  }
  let dNext;
  if (pl.carried >= cfg.carryLimit) dNext = dHome;
  else if (pl.carried === 0) dNext = dShard === Infinity ? 6 : dShard;
  else dNext = Math.min(dHome, dShard === Infinity ? Infinity : dShard);
  void shardToHome;
  return 10 * pl.score + 7 * pl.carried - 1.1 * dNext - pen;
}

/** 활성 플레이어의 차례 행동 목록을 고른다 */
export function chooseTurn(state, profileName = 'balanced', rnd = Math.random) {
  const prof = typeof profileName === 'string' ? BOT_PROFILES[profileName] : profileName;
  const cfg = state.config;
  const me = state.players[state.current];
  const others = state.players.filter((p) => p.id !== me.id);
  let best = null;
  let bestVal = -Infinity;
  const seen = new Set();

  function resolve(node) {
    // 보이는 칸에 있을 때만 줍기·득점
    if (isCoveredCol(node.fold, node.c)) return node;
    const k = key(node.c, node.r);
    let { carried, score, shards } = node;
    const here = shards.get(k) || 0;
    const cap = cfg.carryLimit - carried;
    if (here > 0 && cap > 0 && !isCoveredCol(node.fold, unkey(k)[0])) {
      const take = Math.min(here, cap);
      shards = new Map(shards);
      if (here - take === 0) shards.delete(k); else shards.set(k, here - take);
      carried += take;
    }
    if (k === me.anchor && carried > 0) { score += carried; carried = 0; }
    return { ...node, carried, score, shards };
  }

  function evaluate(node) {
    const self = { ...me, c: node.c, r: node.r, carried: node.carried, score: node.score };
    let v = prof.selfW * potential(state, node.fold, self, node.shards, prof.absentPenalty);
    let oppBest = -Infinity;
    for (const o of others) oppBest = Math.max(oppBest, potential(state, node.fold, o, node.shards, prof.absentPenalty));
    if (others.length) v -= prof.oppW * oppBest;
    return v + rnd() * prof.noise;
  }

  function dfs(node) {
    const sk = `${node.c},${node.r},${node.fold.L},${node.fold.R},${node.steps},${node.folded},${node.carried},${node.score}`;
    if (seen.has(sk)) return;
    seen.add(sk);
    const v = evaluate(node);
    if (v > bestVal) { bestVal = v; best = node.actions; }
    if (node.steps < cfg.moveSteps && !isCoveredCol(node.fold, node.c)) {
      for (const [nc, nr] of neighbors(node.fold, node.c, node.r)) {
        dfs(resolve({ ...node, c: nc, r: nr, steps: node.steps + 1, actions: [...node.actions, { type: 'step', to: [nc, nr] }] }));
      }
    }
    if (!node.folded) {
      for (const a of foldActions(node.fold)) {
        if (!prof.allowFold && a.type === 'fold') continue;
        dfs(resolve({ ...node, fold: applyFoldAction(node.fold, a), folded: true, actions: [...node.actions, a] }));
      }
    }
  }

  const root = resolve({
    c: me.c, r: me.r, fold: { ...state.fold }, steps: 0, folded: false,
    carried: me.carried, score: me.score, shards: state.shards, actions: [],
  });
  dfs(root);
  void ROWS;
  return best || [];
}
