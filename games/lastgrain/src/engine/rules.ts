// LASTGRAIN 규칙 엔진 — rules/rulebook.md v0.4를 옮긴 순수 로직(DOM·실제 시간 없음). 시간은 tick(s, dt)로만 흐른다.
// 시간 단위는 밀리초. 좌표는 c(0~4 = A~E), r(0~4 = 1~5줄). 플레이어 0 = 선(1줄 쪽), 1 = 후(5줄 쪽).
// 함수는 넘겨받은 상태를 고친다. 고치기 싫으면 clone 을 먼저 쓴다. 상태는 JSON 으로 보낼 수 있는 값만 담는다.

export type Kind = 'scout' | 'warrior' | 'giant'
export type Cell = [number, number]

export const KINDS: Record<Kind, { cap: number; move: number; name: string; short: string; spring: boolean }> = {
  scout: { cap: 60_000, move: 2, name: '정찰병', short: '정', spring: true },
  warrior: { cap: 120_000, move: 1, name: '전사', short: '전', spring: true },
  giant: { cap: 180_000, move: 1, name: '거병', short: '거', spring: false },
}
export const ARMY: Kind[] = ['scout', 'scout', 'warrior', 'warrior', 'giant']
export const SPRINGS = new Set(['1,1', '3,1', '1,3', '3,3']) // B2 D2 B4 D4
export const RUINS = ['0,2', '2,2', '4,2'] // A3 C3 E3

export interface Config {
  /** 대모래시계 */
  greatMs: number
  /** 점수 승리 */
  target: number
  /** 후 플레이어 시작 점수 */
  handicap: number
  /** 세우기·눕히기 조작 시간(모래시계 하나당, 0이면 끔) */
  handleMs: number
}

export const DEFAULTS: Config = { greatMs: 20 * 60_000, target: 25, handicap: 2, handleMs: 1000 }
export const PLAYER_NAME = ['선 플레이어', '후 플레이어']

export interface Unit {
  id: string
  owner: number
  kind: Kind
  cap: number
  /** 남은 모래 */
  rem: number
  pos: Cell | null
  acted: boolean
}

export interface LogLine {
  turn: number
  p: number | null
  text: string
}

export type EndReason = 'score' | 'time' | 'resign'

export interface State {
  config: Config
  units: Record<string, Unit>
  active: number
  turn: number
  scores: [number, number]
  greatRem: number
  /** 대모래시계가 선 플레이어 차례 뒤에 끝나 후 플레이어의 마지막 차례가 진행 중 */
  finalTurn: boolean
  /** 이번 차례에 소환했는가 */
  summoned: boolean
  /** 이번 차례에 소멸한 활성 플레이어 모래병 id */
  crumbled: string[]
  /** 보드가 비어 반드시 소환해야 함 */
  mustSummon: boolean
  over: boolean
  winner: number | null
  endReason: EndReason | null
  log: LogLine[]
  /** 기록이 늘 때마다 1씩 증가(변경 감지용) */
  seq: number
}

export type Action =
  | { type: 'summon'; unitId: string; c: number; r: number }
  | { type: 'move'; unitId: string; c: number; r: number; flip: boolean }
  | { type: 'attack'; unitId: string; targetId: string; mode: 'flip' | 'push' }
  | { type: 'end' }

export type Result = { ok: true } | { ok: false; error: string }
const OK: Result = { ok: true }
const fail = (error: string): Result => ({ ok: false, error })

const key = (c: number, r: number) => `${c},${r}`
export const cellName = (c: number, r: number): string => 'ABCDE'[c]! + (r + 1)
export const homeRow = (p: number): number => (p === 0 ? 0 : 4)
export const inBoard = (c: number, r: number): boolean => c >= 0 && c < 5 && r >= 0 && r < 5
export const isSpring = (c: number, r: number): boolean => SPRINGS.has(key(c, r))
export const isRuin = (c: number, r: number): boolean => RUINS.includes(key(c, r))
const DIRS: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const at = (u: Unit): Cell => u.pos!

export function newGame(cfg: Partial<Config> = {}): State {
  const config = { ...DEFAULTS, ...cfg }
  const units: Record<string, Unit> = {}
  let n = 0
  for (const p of [0, 1]) {
    for (const kind of ARMY) {
      const id = `p${p}-${kind}-${n++}`
      units[id] = { id, owner: p, kind, cap: KINDS[kind].cap, rem: KINDS[kind].cap, pos: null, acted: false }
    }
  }
  const s: State = {
    config,
    units,
    active: 0,
    turn: 0,
    scores: [0, config.handicap],
    greatRem: config.greatMs,
    finalTurn: false,
    summoned: false,
    crumbled: [],
    mustSummon: false,
    over: false,
    winner: null,
    endReason: null,
    log: [],
    seq: 0,
  }
  startTurn(s)
  return s
}

// ---------------------------------------------------------------- 조회
export const unitAt = (s: State, c: number, r: number): Unit | null =>
  Object.values(s.units).find((u) => u.pos && u.pos[0] === c && u.pos[1] === r) || null
export const onBoard = (s: State, p: number): Unit[] => Object.values(s.units).filter((u) => u.owner === p && u.pos)
export const reserve = (s: State, p: number): Unit[] => Object.values(s.units).filter((u) => u.owner === p && !u.pos)
export const ruinsHeld = (s: State, p: number): number =>
  RUINS.filter((k) => {
    const [c, r] = k.split(',').map(Number) as Cell
    const u = unitAt(s, c, r)
    return u && u.owner === p
  }).length

function log(s: State, text: string, p: number | null = null): void {
  s.seq = (s.seq || 0) + 1
  s.log.push({ turn: s.turn, p, text })
  if (s.log.length > 300) s.log.shift()
}

// ---------------------------------------------------------------- 차례
function startTurn(s: State): void {
  const a = s.active
  s.turn += 1
  s.summoned = false
  s.crumbled = []
  s.mustSummon = false
  for (const u of onBoard(s, a)) u.acted = false
  log(s, `${PLAYER_NAME[a]}의 차례가 시작되었다.`, a)
  // 1. 점수 단계
  const pts = ruinsHeld(s, a)
  if (pts) {
    s.scores[a] = s.scores[a]! + pts
    log(s, `점수 단계: 유적 ${pts}곳 → ${pts}점 (합계 ${s.scores[a]})`, a)
  }
  if (s.scores[a]! >= s.config.target) return finish(s, a, 'score')
  // 2. 세우기 단계 (조작 시간만큼 모래가 흐른다)
  for (const u of onBoard(s, a)) drain(s, u, s.config.handleMs)
  checkEmpty(s)
}

/** 활성 플레이어가 눕히기 단계를 마치고 차례를 끝낸다. */
export function endTurn(s: State): Result | undefined {
  if (s.over) return undefined
  if (s.mustSummon && canSummon(s)) return fail('보드에 모래병이 없으면 먼저 소환해야 한다.')
  const a = s.active
  for (const u of onBoard(s, a)) drain(s, u, s.config.handleMs)
  log(s, `${PLAYER_NAME[a]}가 모래시계를 모두 눕혔다.`, a)
  // 대모래시계 확인 (8.3): 차례가 끝날 때만 본다
  if (s.greatRem <= 0 || s.finalTurn) {
    if (a === 1) {
      finalScoring(s)
      return undefined
    }
    if (!s.finalTurn) {
      s.finalTurn = true
      log(s, '대모래시계가 다 떨어졌다. 후 플레이어의 다음 차례가 마지막 차례다.')
    }
  }
  s.active = 1 - a
  startTurn(s)
  return OK
}

/** 실시간 흐름: 대모래시계와 활성 플레이어의 보드 위 모래시계가 dt만큼 흐른다. */
export function tick(s: State, dt: number): void {
  if (s.over || dt <= 0) return
  s.greatRem = Math.max(0, s.greatRem - dt)
  let any = false
  for (const u of onBoard(s, s.active)) {
    u.rem -= dt
    if (u.rem <= 0) {
      crumble(s, u, '모래가 다 떨어져')
      any = true
    }
  }
  if (any) checkEmpty(s)
}

function drain(s: State, u: Unit, ms: number): void {
  if (!ms || !u.pos) return
  u.rem -= ms
  if (u.rem <= 0) crumble(s, u, '모래가 다 떨어져')
}

function crumble(s: State, u: Unit, why: string): void {
  const where = cellName(...at(u))
  u.pos = null
  u.rem = u.cap // 비축에서는 모래를 한쪽에 모아 둔다 → 다시 소환하면 가득 찬 상태
  u.acted = false
  if (u.owner === s.active) s.crumbled.push(u.id)
  log(s, `${PLAYER_NAME[u.owner]}의 ${KINDS[u.kind].name}(${where})이 ${why} 소멸했다.`, u.owner)
}

// 7.1 예외: 보드에 자기 모래병이 하나도 없을 때
function checkEmpty(s: State): void {
  if (s.over || onBoard(s, s.active).length) {
    s.mustSummon = false
    return
  }
  if (!s.summoned && canSummon(s)) {
    s.mustSummon = true
    return
  }
  log(s, '소환할 수 없어 차례가 즉시 끝났다.', s.active)
  s.mustSummon = false
  endTurn(s)
}

function finalScoring(s: State): void {
  for (const p of [0, 1]) {
    const pts = ruinsHeld(s, p)
    s.scores[p] = s.scores[p]! + pts
    log(s, `마지막 점수 계산: ${PLAYER_NAME[p]} +${pts}점 (합계 ${s.scores[p]})`, p)
  }
  let w: number
  if (s.scores[0] !== s.scores[1]) w = s.scores[0] > s.scores[1] ? 0 : 1
  else {
    const n0 = onBoard(s, 0).length
    const n1 = onBoard(s, 1).length
    w = n0 !== n1 ? (n0 > n1 ? 0 : 1) : 0
  }
  finish(s, w, 'time')
}

function finish(s: State, w: number, reason: EndReason): void {
  s.over = true
  s.winner = w
  s.endReason = reason
  const why = { score: `${s.config.target}점 달성`, time: '대모래시계 종료', resign: '상대 기권' }[reason]
  log(s, `${PLAYER_NAME[w]} 승리! (${why})`, w)
}

/** 플레이어 p가 기권한다. */
export function resign(s: State, p: number): Result {
  if (s.over) return fail('이미 끝난 게임이다.')
  log(s, `${PLAYER_NAME[p]}가 기권했다.`, p)
  finish(s, 1 - p, 'resign')
  return OK
}

// ---------------------------------------------------------------- 소환
export function homeCells(s: State, p = s.active): Cell[] {
  const r = homeRow(p)
  return [0, 1, 2, 3, 4].filter((c) => !unitAt(s, c, r)).map((c): Cell => [c, r])
}
export const summonable = (s: State): Unit[] => reserve(s, s.active).filter((u) => !s.crumbled.includes(u.id))
export const canSummon = (s: State): boolean => !s.over && !s.summoned && summonable(s).length > 0 && homeCells(s).length > 0

export function summon(s: State, unitId: string, c: number, r: number): Result {
  const u = s.units[unitId]
  if (!u || u.owner !== s.active || u.pos) return fail('비축에 있는 자기 모래병만 소환할 수 있다.')
  if (s.summoned) return fail('소환은 차례마다 한 번이다.')
  if (s.crumbled.includes(u.id)) return fail('이번 차례에 소멸한 모래병은 다시 소환할 수 없다.')
  if (r !== homeRow(s.active) || unitAt(s, c, r)) return fail('자기 소환 줄의 빈 칸에만 소환할 수 있다.')
  u.pos = [c, r]
  u.rem = u.cap
  u.acted = true // 소환한 차례에는 행동할 수 없다
  s.summoned = true
  s.mustSummon = false
  log(s, `${KINDS[u.kind].name}을 ${cellName(c, r)}에 소환했다.`, s.active)
  return OK
}

// ---------------------------------------------------------------- 이동
export interface MoveOption {
  c: number
  r: number
  canFlip: boolean
}

export function moveOptions(s: State, unitId: string): MoveOption[] {
  const u = s.units[unitId]
  if (!u || !u.pos || u.owner !== s.active || u.acted || s.over) return []
  const [sc, sr] = u.pos
  const steps = KINDS[u.kind].move
  const seen = new Set([key(sc, sr)])
  const out: MoveOption[] = []
  let frontier: Cell[] = [[sc, sr]]
  for (let d = 0; d < steps; d++) {
    const next: Cell[] = []
    for (const [c, r] of frontier) {
      for (const [dc, dr] of DIRS) {
        const nc = c + dc
        const nr = r + dr
        if (!inBoard(nc, nr) || seen.has(key(nc, nr)) || unitAt(s, nc, nr)) continue
        seen.add(key(nc, nr))
        next.push([nc, nr])
        out.push({ c: nc, r: nr, canFlip: isSpring(nc, nr) && !isSpring(sc, sr) && KINDS[u.kind].spring })
      }
    }
    frontier = next
  }
  return out
}

export function move(s: State, unitId: string, c: number, r: number, flip = false): Result {
  const opt = moveOptions(s, unitId).find((o) => o.c === c && o.r === r)
  if (!opt) return fail('그 칸으로는 이동할 수 없다.')
  if (flip && !opt.canFlip) return fail('이 이동으로는 샘에서 뒤집기를 할 수 없다.')
  const u = s.units[unitId]!
  const from = cellName(...at(u))
  u.pos = [c, r]
  u.acted = true
  if (flip) u.rem = u.cap - u.rem
  log(s, `${KINDS[u.kind].name}: ${from} → ${cellName(c, r)}${flip ? ' (샘에서 뒤집기)' : ''}`, s.active)
  return OK
}

// ---------------------------------------------------------------- 공격
export interface AttackOption {
  targetId: string
  canPush: boolean
  pushOff: boolean
  pushTo: Cell | null
}

export function attackOptions(s: State, unitId: string): AttackOption[] {
  const u = s.units[unitId]
  if (!u || !u.pos || u.owner !== s.active || u.acted || s.over) return []
  const [ac, ar] = u.pos
  const out: AttackOption[] = []
  for (const [dc, dr] of DIRS) {
    const t = unitAt(s, ac + dc, ar + dr)
    if (!t || t.owner === u.owner) continue
    const pc = ac + 2 * dc
    const pr = ar + 2 * dr
    const off = !inBoard(pc, pr)
    out.push({ targetId: t.id, canPush: off || !unitAt(s, pc, pr), pushOff: off, pushTo: off ? null : [pc, pr] })
  }
  return out
}

/** mode: 'flip' (강제 뒤집기) | 'push' (밀어내기) */
export function attack(s: State, unitId: string, targetId: string, mode: 'flip' | 'push'): Result {
  const opt = attackOptions(s, unitId).find((o) => o.targetId === targetId)
  if (!opt) return fail('인접한 적 모래병만 공격할 수 있다.')
  if (mode === 'push' && !opt.canPush) return fail('밀려날 칸이 막혀 있어 밀어낼 수 없다.')
  const u = s.units[unitId]!
  const t = s.units[targetId]!
  u.acted = true
  const name = `${PLAYER_NAME[t.owner]}의 ${KINDS[t.kind].name}(${cellName(...at(t))})`
  if (mode === 'flip') {
    t.rem = t.cap - t.rem
    log(s, `${KINDS[u.kind].name}이 ${name}에게 강제 뒤집기!`, s.active)
    if (t.rem <= 0) crumble(s, t, '윗칸이 비어')
  } else if (opt.pushOff) {
    log(s, `${KINDS[u.kind].name}이 ${name}을 보드 밖으로 밀어냈다!`, s.active)
    crumble(s, t, '사막 밖으로 흩어져')
  } else {
    t.pos = opt.pushTo
    log(s, `${KINDS[u.kind].name}이 ${name}을 ${cellName(...opt.pushTo!)}로 밀어냈다.`, s.active)
  }
  return OK
}

/** 행동 객체를 적용한다. */
export function apply(s: State, a: Action): Result {
  switch (a.type) {
    case 'summon':
      return summon(s, a.unitId, a.c, a.r)
    case 'move':
      return move(s, a.unitId, a.c, a.r, a.flip)
    case 'attack':
      return attack(s, a.unitId, a.targetId, a.mode)
    case 'end':
      return endTurn(s) || OK
  }
}

/** 활성 플레이어가 지금 할 수 있는 모든 행동(차례 종료 제외). */
export function legalActions(s: State): Action[] {
  if (s.over) return []
  const out: Action[] = []
  if (canSummon(s)) {
    const kinds = new Set<Kind>()
    for (const u of summonable(s)) {
      if (kinds.has(u.kind)) continue // 같은 종류는 하나만 본다
      kinds.add(u.kind)
      for (const [c, r] of homeCells(s)) out.push({ type: 'summon', unitId: u.id, c, r })
    }
  }
  if (s.mustSummon) return out
  for (const u of onBoard(s, s.active)) {
    if (u.acted) continue
    for (const o of moveOptions(s, u.id)) {
      out.push({ type: 'move', unitId: u.id, c: o.c, r: o.r, flip: false })
      if (o.canFlip) out.push({ type: 'move', unitId: u.id, c: o.c, r: o.r, flip: true })
    }
    for (const o of attackOptions(s, u.id)) {
      out.push({ type: 'attack', unitId: u.id, targetId: o.targetId, mode: 'flip' })
      if (o.canPush) out.push({ type: 'attack', unitId: u.id, targetId: o.targetId, mode: 'push' })
    }
  }
  return out
}

export const clone = (s: State): State => JSON.parse(JSON.stringify(s)) as State
