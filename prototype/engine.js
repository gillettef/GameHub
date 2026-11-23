// CREASE 규칙 엔진 (룰북의 기준은 rules/rulebook.md. 이 파일은 그 규칙을 검증하기 위한 구현이다)
// 좌표: 열 col 0..8 (A..I), 행 row 0..4 (1..5).
// 접힘 상태: L = 왼쪽 날개 접기 폭(0~3), R = 오른쪽 날개 접기 폭(0~3), L+R <= MAX_TOTAL_WIDTH.

export const COLS = 9;
export const ROWS = 5;
export const MAX_WIDTH = 3;
export const MAX_TOTAL_WIDTH = 4;
export const COL_NAMES = 'ABCDEFGHI';

export const cellName = (c, r) => `${COL_NAMES[c]}${r + 1}`;
export const key = (c, r) => c * ROWS + r;
export const unkey = (k) => [Math.floor(k / ROWS), k % ROWS];

export const DEFAULT_CONFIG = {
  moveSteps: 3,
  carryLimit: 2,
  initialShards: { 2: 6, 3: 7, 4: 8 },
  spawnPerRound: { 2: 1, 3: 1, 4: 1 },
  target: { 2: 5, 3: 4, 4: 4 },
  // 플레이어 수별 닻 칸(= 시작 칸). 좌석 순서대로.
  anchors: {
    2: [[0, 0], [8, 4]],
    3: [[0, 0], [8, 2], [0, 4]],
    4: [[0, 0], [8, 4], [8, 0], [0, 4]],
  },
  // 별똥별 카드가 가리킬 수 있는 열(B~H)
  spawnCols: [1, 2, 3, 4, 5, 6, 7],
  // 차례 순서 보정: 좌석별 시작 시 들고 있는 별빛 조각 수
  startCarried: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
  // 좌석별 시작 점수(닻 칸에 미리 놓인 조각)
  startScore: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
};

/** 접힘 상태가 규칙상 가능한가 */
export function validFold(L, R) {
  return L >= 0 && R >= 0 && L <= MAX_WIDTH && R <= MAX_WIDTH && L + R <= MAX_TOTAL_WIDTH;
}

/** 열 c가 가려졌는가(접힌 날개 아래에 깔렸는가) */
export function isCoveredCol(fold, c) {
  const { L, R } = fold;
  if (L > 0 && c >= L && c <= 2 * L - 1) return true;
  if (R > 0 && c >= COLS - 2 * R && c <= COLS - 1 - R) return true;
  return false;
}

/** 열 c가 접힌 날개 위(뒷면이 보이는 상태)에 있는가 */
export function isFlippedCol(fold, c) {
  return (fold.L > 0 && c < fold.L) || (fold.R > 0 && c >= COLS - fold.R);
}

/** 보이는 열 c가 탁자 위 어느 물리 위치(0..8)에 놓이는가. 가려진 열은 -1 */
export function physPos(fold, c) {
  if (isCoveredCol(fold, c)) return -1;
  if (fold.L > 0 && c < fold.L) return 2 * fold.L - 1 - c;
  if (fold.R > 0 && c >= COLS - fold.R) return 2 * (COLS - fold.R) - 1 - c;
  return c;
}

/** 물리 위치 p에 보이는 열. 없으면 -1 */
export function colAtPos(fold, p) {
  for (let c = 0; c < COLS; c++) if (physPos(fold, c) === p) return c;
  return -1;
}

/** 위에서 본 물리 위치 순서대로 보이는 열 목록 */
export function visibleLayout(fold) {
  const out = [];
  for (let p = 0; p < COLS; p++) {
    const c = colAtPos(fold, p);
    if (c >= 0) out.push({ pos: p, col: c, flipped: isFlippedCol(fold, c) });
  }
  return out;
}

/** 칸 (c,r)의 이웃 칸 목록 (보이는 칸끼리만) */
export function neighbors(fold, c, r) {
  if (isCoveredCol(fold, c)) return [];
  const out = [];
  if (r > 0) out.push([c, r - 1]);
  if (r < ROWS - 1) out.push([c, r + 1]);
  const p = physPos(fold, c);
  for (const q of [p - 1, p + 1]) {
    if (q < 0 || q >= COLS) continue;
    const nc = colAtPos(fold, q);
    if (nc >= 0) out.push([nc, r]);
  }
  return out;
}

// 접힘 상태별 거리표 캐시 (45칸 x 45칸)
const distCache = new Map();
export function distTable(fold) {
  const fk = fold.L * 10 + fold.R;
  if (distCache.has(fk)) return distCache.get(fk);
  const N = COLS * ROWS;
  const table = Array.from({ length: N }, () => new Int16Array(N).fill(-1));
  for (let s = 0; s < N; s++) {
    const [sc, sr] = unkey(s);
    if (isCoveredCol(fold, sc)) continue;
    const d = table[s];
    d[s] = 0;
    const q = [s];
    for (let i = 0; i < q.length; i++) {
      const [c, r] = unkey(q[i]);
      for (const [nc, nr] of neighbors(fold, c, r)) {
        const nk = key(nc, nr);
        if (d[nk] < 0) { d[nk] = d[q[i]] + 1; q.push(nk); }
      }
    }
  }
  distCache.set(fk, table);
  return table;
}

/** 접기/펼치기 행동 목록 */
export function foldActions(fold) {
  const acts = [];
  if (fold.L === 0) for (let w = 1; w <= MAX_WIDTH; w++) if (validFold(w, fold.R)) acts.push({ type: 'fold', side: 'L', width: w });
  if (fold.R === 0) for (let w = 1; w <= MAX_WIDTH; w++) if (validFold(fold.L, w)) acts.push({ type: 'fold', side: 'R', width: w });
  if (fold.L > 0) acts.push({ type: 'unfold', side: 'L' });
  if (fold.R > 0) acts.push({ type: 'unfold', side: 'R' });
  return acts;
}

export function applyFoldAction(fold, a) {
  const f = { ...fold };
  if (a.type === 'fold') f[a.side] = a.width;
  else f[a.side] = 0;
  return f;
}

// ---------------------------------------------------------------- 게임 상태

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newGame(numPlayers, seed = 1, config = DEFAULT_CONFIG) {
  const rnd = mulberry32(seed);
  const deck = [];
  for (const c of config.spawnCols) for (let r = 0; r < ROWS; r++) deck.push(key(c, r));
  shuffle(deck, rnd);
  const shards = new Map();
  const players = config.anchors[numPlayers].map(([c, r], i) => ({
    id: i, c, r, anchor: key(c, r),
    carried: (config.startCarried?.[numPlayers] || [])[i] || 0,
    score: (config.startScore?.[numPlayers] || [])[i] || 0,
  }));
  const state = {
    config, n: numPlayers, fold: { L: 0, R: 0 }, players, shards, deck,
    current: 0, round: 1, turn: 0, over: false, endTriggered: false, log: [], rnd,
  };
  for (let i = 0; i < config.initialShards[numPlayers]; i++) spawn(state);
  return state;
}

export function spawn(state) {
  if (state.deck.length === 0) return null;
  const k = state.deck.pop();
  state.shards.set(k, (state.shards.get(k) || 0) + 1);
  state.lastSpawn = k;
  return k;
}

export const isPresent = (state, k) => !isCoveredCol(state.fold, unkey(k)[0]);
export const playerPresent = (state, p) => !isCoveredCol(state.fold, p.c);

/** 활성 플레이어 처리: 줍기와 닻 칸 득점 (보이는 칸에 있을 때만) */
function resolveCell(state, p) {
  if (!playerPresent(state, p)) return;
  const k = key(p.c, p.r);
  const cap = state.config.carryLimit - p.carried;
  const here = state.shards.get(k) || 0;
  if (here > 0 && cap > 0) {
    const take = Math.min(cap, here);
    p.carried += take;
    if (here - take === 0) state.shards.delete(k); else state.shards.set(k, here - take);
  }
  if (k === p.anchor && p.carried > 0) {
    p.score += p.carried;
    p.carried = 0;
  }
}

/** 차례 시작: 걸음·접기 사용량을 초기화하고 시작 칸에서 줍기/득점을 처리한다 */
export function startTurn(state) {
  state.turnSteps = 0;
  state.turnFolded = false;
  state.turnActions = [];
  resolveCell(state, state.players[state.current]);
}

/** 활성 플레이어가 지금 할 수 있는 걸음 목적지 */
export function legalSteps(state) {
  const p = state.players[state.current];
  if (state.turnSteps >= state.config.moveSteps || !playerPresent(state, p)) return [];
  return neighbors(state.fold, p.c, p.r);
}

/** 활성 플레이어가 지금 할 수 있는 접기/펼치기 */
export function legalFolds(state) {
  return state.turnFolded ? [] : foldActions(state.fold);
}

export function doStep(state, to) {
  const p = state.players[state.current];
  if (state.turnSteps >= state.config.moveSteps) throw new Error('걸음 수 초과');
  if (!playerPresent(state, p)) throw new Error('부재 중인 길잡이는 이동할 수 없다');
  const ok = neighbors(state.fold, p.c, p.r).some(([c, r]) => c === to[0] && r === to[1]);
  if (!ok) throw new Error(`이웃 칸이 아니다: ${cellName(p.c, p.r)} -> ${cellName(...to)}`);
  p.c = to[0]; p.r = to[1];
  state.turnSteps++;
  state.turnActions.push({ type: 'step', to: [to[0], to[1]] });
  resolveCell(state, p);
}

export function doFold(state, a) {
  if (state.turnFolded) throw new Error('접기/펼치기는 차례에 한 번');
  const legal = foldActions(state.fold).some((b) => b.type === a.type && b.side === a.side && b.width === a.width);
  if (!legal) throw new Error('불가능한 접기/펼치기');
  state.fold = applyFoldAction(state.fold, a);
  state.turnFolded = true;
  state.turnActions.push({ ...a });
  resolveCell(state, state.players[state.current]);
}

/** 차례 끝: 별똥별 1장(생성된 칸 반환), 종료 확인, 다음 플레이어로 */
export function finishTurn(state) {
  const p = state.players[state.current];
  state.log.push({ round: state.round, player: p.id, actions: state.turnActions || [] });
  const before = state.deck.length;
  endTurn(state);
  const spawned = before > state.deck.length ? state.lastSpawn : null;
  return spawned;
}

/**
 * 한 차례를 적용한다. actions: [{type:'step', to:[c,r]} | {type:'fold'|'unfold', ...}]
 * 걸음 수와 접기 횟수를 검사하고 위반 시 예외를 던진다.
 */
export function playTurn(state, actions) {
  startTurn(state);
  for (const a of actions) {
    if (a.type === 'step') doStep(state, a.to);
    else doFold(state, a);
  }
  return finishTurn(state);
}

function endTurn(state) {
  const { target } = state.config;
  const mode = state.config.endMode || 'round';
  const prev = state.current;
  state.turn++;
  if (state.config.spawnPerTurn) for (let i = 0; i < state.config.spawnPerTurn; i++) spawn(state);
  state.current = (state.current + 1) % state.n;
  if (!state.endTriggered && (state.players.some((pl) => pl.score >= target[state.n]) || state.deck.length === 0)) {
    state.endTriggered = true;
    state.endTrigger = prev;
    if (mode === 'immediate') { state.over = true; return; }
  }
  // 'lastTurn': 종료를 일으킨 플레이어를 뺀 모두가 한 차례씩 더 하고 끝난다
  if (mode === 'lastTurn' && state.endTriggered && state.current === state.endTrigger) { state.over = true; return; }
  if (state.current === 0) {
    if (mode === 'round' && state.endTriggered) { state.over = true; return; }
    for (let i = 0; i < state.config.spawnPerRound[state.n]; i++) spawn(state);
    state.round++;
  }
}

/** 승자 판정: 점수 > 들고 있는 조각. 그래도 같으면 공동 승리(목록 반환) */
export function winners(state) {
  const best = Math.max(...state.players.map((p) => p.score * 100 + p.carried));
  return state.players.filter((p) => p.score * 100 + p.carried === best).map((p) => p.id);
}
export function winner(state) {
  return winners(state)[0];
}

/** 상태 복제 (탐색용, 로그·난수 제외) */
export function cloneState(s) {
  return {
    ...s,
    fold: { ...s.fold },
    players: s.players.map((p) => ({ ...p })),
    shards: new Map(s.shards),
    deck: s.deck.slice(),
    log: [],
  };
}
