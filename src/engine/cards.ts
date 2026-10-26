/**
 * 카드 (§11): 우주 법칙, 라운드 목표, 개인 목표. 카드마다 데이터 + 판정 함수. (사건 카드는 events.ts)
 *
 * 규칙서 문구가 여러 뜻으로 읽히는 곳은 `해석:` 주석으로 적어 둔다.
 */
import { dieColor, faceValue, isTime, type Face } from './dice'
import { neighbors, pillarAt, topOf, type Cell } from './placement'
import { frontFaces, lineDice, neighborSteps, stepRuns } from './scoring'
import { BOARD_COLS, BOARD_ROWS } from './setup'
import type { Board, Color, PlayerState, RolledDie, Round } from './types'

// ─── 우주 법칙 (§11-1) ───────────────────────────────────────────────

export type LawId =
  | 'standard'
  | 'mirror'
  | 'flat'
  | 'inverted'
  | 'shakyMarket'
  | 'void'
  | 'abundance'
  | 'eternal'

export interface LawDef {
  id: LawId
  name: string
  text: string
  /** 덱에 들어가는지 */
  inDeck: boolean
}

export const LAWS: Record<LawId, LawDef> = {
  standard: { id: 'standard', name: '표준 우주', text: '변화 없음', inDeck: true },
  mirror: {
    id: 'mirror',
    name: '거울 우주',
    text: '1~3라운드 기본 점수에 좌우 대칭 칸(1↔5열, 2↔4열)이 같은 색인 쌍마다 1점을 더함 (1라운드 선, 2라운드 2·3행, 3라운드 모든 꼭대기)',
    inDeck: true,
  },
  flat: { id: 'flat', name: '평평한 우주', text: '3라운드 쌓기와 4라운드 넘기기에서 아래와 같은 숫자도 쌓을 수 있음', inDeck: true },
  inverted: { id: 'inverted', name: '뒤집힌 우주', text: '3라운드 쌓기와 4라운드 넘기기에서 아래보다 작은 숫자만 쌓을 수 있음', inDeck: true },
  shakyMarket: {
    id: 'shakyMarket',
    name: '흔들리는 시장',
    text: '1~3라운드에 가져오기 전 시장 주사위 1개를 대가 없이 다시 굴릴 수 있음 (턴마다 1회, 기본 규칙의 시장 다시 굴리기와 별도)',
    inDeck: true,
  },
  void: { id: 'void', name: '공허의 우주', text: '검정이 색 점수(1~4차원 기본 점수)에서 모든 색과 이어짐 (만능). 목표 카드에는 적용하지 않음', inDeck: true },
  abundance: {
    id: 'abundance',
    name: '풍요의 우주',
    text: '시장 칸을 플레이어 수 + 1개 씀. 바퀴가 끝나고 남은 칸의 주사위는 주머니로 돌아감',
    inDeck: true,
  },
  eternal: {
    id: 'eternal',
    name: '영원의 우주',
    text: '4라운드에 각자 자유 넘기기 1회를 받음 (⧗이 아닌 꼭대기도 넘길 수 있음, 쓰지 않아도 됨)',
    inDeck: true,
  },
}

export const LAW_DECK: readonly LawId[] = (Object.keys(LAWS) as LawId[]).filter((id) => LAWS[id].inDeck)

/** 두 색이 색 점수에서 이어지는지 (공허의 우주: 검정은 만능) */
export function colorsLink(a: Color, b: Color, law: LawId): boolean {
  return a === b || (law === 'void' && (a === 'black' || b === 'black'))
}

// ─── 보드 조회 도우미 ────────────────────────────────────────────────

function allCells(): Cell[] {
  const out: Cell[] = []
  for (let row = 0; row < BOARD_ROWS; row++) for (let col = 0; col < BOARD_COLS; col++) out.push({ row, col })
  return out
}

const key = (c: Cell) => `${c.row},${c.col}`

/** 평면 주사위(각 칸 1층) */
function floorAt(board: Board, cell: Cell) {
  return pillarAt(board, cell)[0]
}

function topsOf(board: Board) {
  return allCells().flatMap((cell) => {
    const top = topOf(pillarAt(board, cell))
    return top ? [{ cell, die: top }] : []
  })
}

/** 열별 최고 높이 (정면에서 본 높이) */
export function columnHeights(board: Board): number[] {
  return Array.from({ length: BOARD_COLS }, (_, col) =>
    Math.max(...Array.from({ length: BOARD_ROWS }, (_, row) => pillarAt(board, { row, col }).length)),
  )
}

/** 조건을 만족하는 칸끼리 변으로 이어진 무리의 크기들 */
function components(match: (cell: Cell) => boolean): number[] {
  const seen = new Set<string>()
  const sizes: number[] = []
  for (const start of allCells()) {
    if (!match(start) || seen.has(key(start))) continue
    let size = 0
    const stack = [start]
    seen.add(key(start))
    while (stack.length > 0) {
      const cell = stack.pop() as Cell
      size++
      for (const n of neighbors(cell)) {
        if (!seen.has(key(n)) && match(n)) {
          seen.add(key(n))
          stack.push(n)
        }
      }
    }
    sizes.push(size)
  }
  return sizes
}

/** 같은 색 영역 크기들 (평면 주사위 기준) */
function floorRegions(board: Board): number[] {
  const colors = new Set(allCells().flatMap((c) => colorOf(floorAt(board, c)) ?? []))
  return [...colors].flatMap((color) => components((c) => colorOf(floorAt(board, c)) === color))
}

const numberOf = (face: Face): number | null => (isTime(face) ? null : face)

/** 주사위의 색 = 윗면의 색 (§2 v0.7). 빈 칸이거나 윗면이 ⧗이면 undefined */
const colorOf = (d: RolledDie | undefined): Color | undefined => (d ? dieColor(d) : undefined)

function lineTops(board: Board): (Face | undefined)[] {
  return lineDice(board).map((d) => d?.orientation.top)
}

// ─── 라운드 목표 (§11-2) ─────────────────────────────────────────────

export type RoundGoalId =
  // 1라운드
  | 'mirror'
  | 'rainbow'
  | 'stairs'
  | 'giantPath'
  | 'oddEven'
  | 'triplets'
  | 'timeSeed'
  | 'lowLand'
  // 2라운드
  | 'cross'
  | 'columnColor'
  | 'stepChain'
  | 'continent'
  | 'roots'
  | 'smallSeed'
  | 'mosaic'
  | 'isolation'
  // 3라운드
  | 'skyscraper'
  | 'twinTowers'
  | 'monoTower'
  | 'numberStairs'
  | 'pyramid'
  | 'fiveLights'
  | 'perfectStairs'
  | 'timeRoof'
  // 4라운드
  | 'colorRiver'
  | 'filledSky'
  | 'crown'
  | 'evenHorizon'
  | 'frontRainbow'
  | 'mirrorHorizon'
  | 'twoContinents'
  | 'horizonStairs'

export interface RoundGoalDef {
  id: RoundGoalId
  round: Round
  name: string
  text: string
  /**
   * 판정 시점. 'any' = 행동마다, 'roundDone' = 그 플레이어가 이 라운드의 마지막 턴을 마쳤을 때.
   * 해석: 진공 배치(고립)는 평면이 다 채워진 뒤에만 정해지므로 마지막 턴 뒤에 본다.
   * 4라운드 목표는 늘 'roundDone' (4라운드 끝에 한 번, §5)
   */
  when: 'any' | 'roundDone'
  check: (board: Board, law: LawId) => boolean
}

function goal(
  id: RoundGoalId,
  round: Round,
  name: string,
  text: string,
  check: (board: Board, law: LawId) => boolean,
  when: 'any' | 'roundDone' = 'any',
): RoundGoalDef {
  return { id, round, name, text, check, when }
}

export const ROUND_GOALS: Record<RoundGoalId, RoundGoalDef> = {
  mirror: goal('mirror', 1, '거울', '1·5번, 2·4번 칸의 윗면이 각각 같은 숫자 (⧗은 숫자가 아니라 안 됨)', (b) => {
    const n = lineTops(b).map((f) => (f === undefined ? null : numberOf(f)))
    return n[0] != null && n[1] != null && n[0] === n[4] && n[1] === n[3]
  }),
  rainbow: goal('rainbow', 1, '무지개', '선의 5칸이 모두 다른 색', (b) => {
    const d = lineDice(b)
    const colors = d.map(colorOf)
    return colors.every(Boolean) && new Set(colors).size === 5
  }),
  stairs: goal('stairs', 1, '계단', '윗면이 1씩 오르거나 내리는 연속 4칸', (b) =>
    stepRuns(lineTops(b).map((f) => (f === undefined ? null : numberOf(f)))).some((n) => n >= 4),
  ),
  giantPath: goal('giantPath', 1, '거인의 길', '윗면 합 18 이상 (⧗은 0)', (b) =>
    lineTops(b).reduce((s, f) => s + (f === undefined ? 0 : faceValue(f)), 0) >= 18,
  ),
  oddEven: goal('oddEven', 1, '홀짝', '홀수와 짝수가 번갈아 5칸', (b) => {
    const n = lineTops(b).map((f) => (f === undefined ? null : numberOf(f)))
    // 해석: ⧗은 홀수도 짝수도 아니므로 끊긴다
    return n.every((x) => x !== null) && n.every((x, i) => i === 0 || (x as number) % 2 !== (n[i - 1] as number) % 2)
  }),
  triplets: goal('triplets', 1, '삼둥이', '윗면이 같은 숫자인 주사위 3개 (⧗ 제외)', (b) => {
    const t = lineTops(b).filter((f): f is Face => f !== undefined && !isTime(f))
    return t.some((f) => t.filter((g) => g === f).length >= 3)
  }),
  timeSeed: goal('timeSeed', 1, '시간의 씨앗', '선에 ⧗ 2개 이상', (b) =>
    lineTops(b).filter((f) => f !== undefined && isTime(f)).length >= 2,
  ),
  lowLand: goal('lowLand', 1, '낮은 대지', '선 5칸이 다 찼을 때, ⧗ 없이 윗면 합 10 이하', (b) => {
    const t = lineTops(b)
    return t.every((f) => f !== undefined && !isTime(f)) && t.reduce((s, f) => s + faceValue(f as Face), 0) <= 10
  }),

  cross: goal('cross', 2, '십자가', '상하좌우 4칸이 모두 채워진 주사위 1개', (b) =>
    allCells().some(
      (c) => floorAt(b, c) && neighbors(c).length === 4 && neighbors(c).every((n) => floorAt(b, n)),
    ),
  ),
  columnColor: goal('columnColor', 2, '기둥 색', '한 세로줄 3칸이 모두 같은 색', (b) =>
    Array.from({ length: BOARD_COLS }, (_, col) => col).some((col) => {
      const colors = Array.from({ length: BOARD_ROWS }, (_, row) => colorOf(floorAt(b, { row, col })))
      return colors.every((c) => c !== undefined && c === colors[0])
    }),
  ),
  stepChain: goal('stepChain', 2, '계단 사슬', '변으로 맞닿은 두 주사위의 윗면이 1 차이인 쌍 3개 (선 안의 가로 쌍 제외, 2·3행 주사위가 든 쌍만)', (b) => neighborSteps(b) >= 3),
  // 해석: 공허의 우주는 '색 점수'에만 적용하므로 대륙의 영역은 검정을 잇지 않는다
  continent: goal('continent', 2, '대륙', '크기 6 이상의 영역', (b) => floorRegions(b).some((n) => n >= 6)),
  roots: goal('roots', 2, '뿌리', '2·3행 주사위 중 같은 열 선 주사위와 색이 같은 것 3개', (b) => {
    let n = 0
    for (let row = 1; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const d = floorAt(b, { row, col })
        const root = floorAt(b, { row: 0, col })
        const color = colorOf(d)
        if (color !== undefined && color === colorOf(root)) n++
      }
    }
    return n >= 3
  }),
  smallSeed: goal('smallSeed', 2, '작은 씨앗', '2·3행에 윗면 1인 주사위 3개', (b) => {
    let n = 0
    for (let row = 1; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) if (floorAt(b, { row, col })?.orientation.top === 1) n++
    }
    return n >= 3
  }),
  mosaic: goal('mosaic', 2, '모자이크', '2×2 구역 하나가 서로 다른 색 4개', (b) => {
    for (let row = 0; row + 1 < BOARD_ROWS; row++) {
      for (let col = 0; col + 1 < BOARD_COLS; col++) {
        const colors = [
          floorAt(b, { row, col }),
          floorAt(b, { row, col: col + 1 }),
          floorAt(b, { row: row + 1, col }),
          floorAt(b, { row: row + 1, col: col + 1 }),
        ].map(colorOf)
        if (colors.every(Boolean) && new Set(colors).size === 4) return true
      }
    }
    return false
  }),
  isolation: goal(
    'isolation',
    2,
    '고립',
    '진공 칸들이 서로 하나도 맞닿지 않음',
    (b) => {
      const vacuum = (c: Cell) => c.row > 0 && !floorAt(b, c)
      return components(vacuum).every((n) => n === 1)
    },
    'roundDone',
  ),

  skyscraper: goal('skyscraper', 3, '마천루', '5층 이상 기둥 1개', (b) =>
    allCells().some((c) => pillarAt(b, c).length >= 5),
  ),
  twinTowers: goal('twinTowers', 3, '쌍둥이 탑', '높이가 같은 3층 이상 기둥 2개가 변으로 맞닿음', (b) =>
    allCells().some((c) => {
      const h = pillarAt(b, c).length
      return h >= 3 && neighbors(c).some((n) => pillarAt(b, n).length === h)
    }),
  ),
  monoTower: goal('monoTower', 3, '단색 탑', '모두 같은 색인 3층 이상 기둥', (b) =>
    allCells().some((c) => {
      const p = pillarAt(b, c)
      const color = colorOf(p[0])
      return p.length >= 3 && color !== undefined && p.every((d) => dieColor(d) === color)
    }),
  ),
  numberStairs: goal(
    'numberStairs',
    3,
    '숫자 계단',
    '맨 앞줄 5개 기둥 꼭대기의 앞면을 왼쪽부터 읽어 1씩 오르거나 내리는 연속 4칸 이상 (⧗에서 끊김). 그 4칸에 2층 이상 기둥이 하나 이상',
    (b) => {
      // v0.8: 1라운드에 정한 선 앞면만으로 3라운드 시작 때 달성되지 않게, 쌓은 기둥이 하나는 끼어야 한다
      const values = frontFaces(b).map((f) => (f === undefined ? null : numberOf(f)))
      const stacked = (col: number) => pillarAt(b, { row: 0, col }).length >= 2
      for (let start = 0; start + 4 <= BOARD_COLS; start++) {
        const win = values.slice(start, start + 4)
        const step = (win[1] ?? 0) - (win[0] ?? 0)
        const run = win.every((v, i) => v !== null && (i === 0 || v - (win[i - 1] as number) === step)) && Math.abs(step) === 1
        if (run && [0, 1, 2, 3].some((i) => stacked(start + i))) return true
      }
      return false
    },
  ),
  pyramid: goal(
    'pyramid',
    3,
    '피라미드',
    '정면에서 본 열별 최고 높이가 가운데(3열)에서 혼자 가장 높고, 바깥으로 갈수록 높아지지 않음',
    (b) => {
      const [h0, h1, h2, h3, h4] = columnHeights(b) as [number, number, number, number, number]
      return h0 <= h1 && h1 < h2 && h4 <= h3 && h3 < h2
    },
  ),
  fiveLights: goal('fiveLights', 3, '다섯 빛', '2층 이상 기둥의 꼭대기 색이 5색 모두 있음', (b) =>
    new Set(stackedTops(b).flatMap((t) => dieColor(t.die) ?? [])).size === 5,
  ),
  perfectStairs: goal(
    'perfectStairs',
    3,
    '완벽한 계단',
    '아래부터 1·2·3·4·5가 차례로 쌓인 기둥 (1층 포함). 뒤집힌 우주에서는 5·4·3·2·1',
    (b, law) => {
      const order = law === 'inverted' ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5]
      return allCells().some((c) => {
        const tops = pillarAt(b, c).map((d) => d.orientation.top)
        return order.every((f, i) => tops[i] === f)
      })
    },
  ),
  timeRoof: goal('timeRoof', 3, '시간의 지붕', '2층 이상 기둥의 꼭대기 ⧗ 3개 이상', (b) =>
    stackedTops(b).filter((t) => isTime(t.die.orientation.top)).length >= 3,
  ),

  // 4라운드 (§11-2): 4라운드 끝에 한 번 판정, 달성한 사람 모두 3점. 꼭대기 = 위에서 내려다본 각 칸의 맨 위
  colorRiver: goal(
    'colorRiver',
    4,
    '색의 강',
    '같은 색 꼭대기가 변으로 이어져 1행부터 3행까지 닿음',
    (b) => topComponents(b).some((cells) => cells.some((c) => c.row === 0) && cells.some((c) => c.row === BOARD_ROWS - 1)),
    'roundDone',
  ),
  filledSky: goal(
    'filledSky',
    4,
    '메운 하늘',
    '진공(주사위가 없는 칸, 1행 포함) 2칸 이하',
    (b) => allCells().filter((c) => pillarAt(b, c).length === 0).length <= 2,
    'roundDone',
  ),
  crown: goal(
    'crown',
    4,
    '왕관',
    '가장 높은 기둥의 꼭대기 윗면이 5 (가장 높은 기둥이 여럿이면 모두)',
    (b) => {
      const max = Math.max(...allCells().map((c) => pillarAt(b, c).length))
      const tallest = allCells().filter((c) => pillarAt(b, c).length === max)
      return max > 0 && tallest.every((c) => topOf(pillarAt(b, c))?.orientation.top === 5)
    },
    'roundDone',
  ),
  evenHorizon: goal(
    'evenHorizon',
    4,
    '고른 지평',
    '정면에서 본 열별 최고 높이의 가장 큰 값과 가장 작은 값 차이가 1 이하',
    (b) => {
      const h = columnHeights(b)
      return Math.max(...h) - Math.min(...h) <= 1
    },
    'roundDone',
  ),
  frontRainbow: goal(
    'frontRainbow',
    4,
    '앞줄 무지개',
    '1행 꼭대기 5개가 모두 다른 색',
    (b) => {
      const colors = Array.from({ length: BOARD_COLS }, (_, col) => colorOf(topOf(pillarAt(b, { row: 0, col }))))
      return colors.every(Boolean) && new Set(colors).size === BOARD_COLS
    },
    'roundDone',
  ),
  mirrorHorizon: goal(
    'mirrorHorizon',
    4,
    '거울 지평',
    '같은 행의 1↔5열, 2↔4열 꼭대기가 같은 색인 쌍 3개 이상',
    (b) => {
      let n = 0
      for (let row = 0; row < BOARD_ROWS; row++) {
        for (const [a, z] of [
          [0, 4],
          [1, 3],
        ] as const) {
          const x = colorOf(topOf(pillarAt(b, { row, col: a })))
          if (x !== undefined && x === colorOf(topOf(pillarAt(b, { row, col: z })))) n++
        }
      }
      return n >= 3
    },
    'roundDone',
  ),
  twoContinents: goal(
    'twoContinents',
    4,
    '두 대륙',
    '크기 3 이상인 같은 색 꼭대기 영역이 서로 다른 색으로 2개',
    (b) => {
      // 해석: 목표 카드에는 공허의 우주를 적용하지 않는다 (§11-1)
      const colors = new Set(
        topComponents(b)
          .filter((cells) => cells.length >= 3)
          .map((cells) => colorOf(topOf(pillarAt(b, cells[0] as Cell)))),
      )
      return colors.size >= 2
    },
    'roundDone',
  ),
  horizonStairs: goal(
    'horizonStairs',
    4,
    '지평 계단',
    '1행 꼭대기 윗면이 왼쪽부터 1씩 오르거나 내리는 연속 4칸 (⧗에서 끊김)',
    (b) =>
      stepRuns(
        Array.from({ length: BOARD_COLS }, (_, col) => {
          const f = topOf(pillarAt(b, { row: 0, col }))?.orientation.top
          return f === undefined ? null : numberOf(f)
        }),
      ).some((n) => n >= 4),
    'roundDone',
  ),
}

/** 2층 이상 기둥의 꼭대기 (다섯 빛·시간의 지붕, v0.8) */
function stackedTops(board: Board) {
  return allCells().flatMap((cell) => {
    const pillar = pillarAt(board, cell)
    const top = topOf(pillar)
    return top && pillar.length >= 2 ? [{ cell, die: top }] : []
  })
}

/** 같은 색 꼭대기끼리 변으로 이어진 무리들 (칸 목록). ⧗ 꼭대기와 진공은 끊김 */
function topComponents(board: Board): Cell[][] {
  const colorAt = (c: Cell) => colorOf(topOf(pillarAt(board, c)))
  const seen = new Set<string>()
  const out: Cell[][] = []
  for (const start of allCells()) {
    const color = colorAt(start)
    if (!color || seen.has(key(start))) continue
    const cells: Cell[] = []
    const stack = [start]
    seen.add(key(start))
    while (stack.length > 0) {
      const cell = stack.pop() as Cell
      cells.push(cell)
      for (const n of neighbors(cell)) {
        if (!seen.has(key(n)) && colorAt(n) === color) {
          seen.add(key(n))
          stack.push(n)
        }
      }
    }
    out.push(cells)
  }
  return out
}

/** 라운드별 목표 덱 */
export function roundGoalDeck(round: Round): RoundGoalId[] {
  return (Object.keys(ROUND_GOALS) as RoundGoalId[]).filter((id) => ROUND_GOALS[id].round === round)
}

/** 라운드마다 공개하는 목표 카드 수 (§5) */
export const GOALS_PER_ROUND = 2
export const GOAL_FIRST_POINTS = 4
export const GOAL_ACHIEVED_POINTS = 2
/** 4라운드 목표: 4라운드 끝에 달성한 사람 모두 (선착 없음, §5) */
export const ROUND4_GOAL_POINTS = 3

// ─── 개인 목표 (§11-3) ───────────────────────────────────────────────

export type PersonalGoalId =
  | 'redWorship'
  | 'seaTower'
  | 'forestRoof'
  | 'lightFront'
  | 'voidCollector'
  | 'heightWorship'
  | 'timeLord'
  | 'evenWorld'
  | 'symmetry'
  | 'cleanHands'

export interface PersonalGoalDef {
  id: PersonalGoalId
  name: string
  text: string
  /** 게임 끝 최종 상태로 판정 (시간 지배자만 4라운드 준비 때 센 ⧗ 주사위 수) */
  check: (player: PlayerState) => boolean
}

function personal(
  id: PersonalGoalId,
  name: string,
  text: string,
  check: (player: PlayerState) => boolean,
): PersonalGoalDef {
  return { id, name, text, check }
}

export const PERSONAL_GOALS: Record<PersonalGoalId, PersonalGoalDef> = {
  redWorship: personal('redWorship', '빨강 숭배', '꼭대기 빨강 3개 이상', (p) =>
    topsOf(p.board).filter((t) => dieColor(t.die) === 'red').length >= 3,
  ),
  seaTower: personal('seaTower', '바다의 탑', '파랑만으로 된 3층 이상 기둥', (p) =>
    allCells().some((c) => {
      const pillar = pillarAt(p.board, c)
      return pillar.length >= 3 && pillar.every((d) => dieColor(d) === 'blue')
    }),
  ),
  forestRoof: personal('forestRoof', '숲의 지붕', '꼭대기 초록이 변으로 이어진 3개', (p) =>
    components((c) => colorOf(topOf(pillarAt(p.board, c))) === 'green').some((n) => n >= 3),
  ),
  lightFront: personal('lightFront', '빛의 정면', '맨 앞줄 꼭대기 중 노랑 2개 이상', (p) =>
    Array.from({ length: BOARD_COLS }, (_, col) => topOf(pillarAt(p.board, { row: 0, col }))).filter(
      (d) => colorOf(d) === 'yellow',
    ).length >= 2,
  ),
  voidCollector: personal('voidCollector', '공허 수집가', '탑 전체에 검정 5개 이상', (p) =>
    p.board.cells.flat(2).filter((d) => dieColor(d) === 'black').length >= 5,
  ),
  heightWorship: personal('heightWorship', '높이 숭배', '3층 이상 기둥 3개', (p) =>
    allCells().filter((c) => pillarAt(p.board, c).length >= 3).length >= 3,
  ),
  // v0.6: 4라운드에 ⧗을 모두 넘겨 눕히므로 게임 끝 보드가 아니라 4라운드 준비 때 센 수로 판정한다.
  // 4라운드 전(봇 평가 등)에는 지금 꼭대기 ⧗ 수로 어림한다
  timeLord: personal('timeLord', '시간 지배자', '4라운드 준비 때 ⧗ 주사위 4개 이상', (p) =>
    (p.timeDice ?? topsOf(p.board).filter((t) => isTime(t.die.orientation.top)).length) >= 4,
  ),
  evenWorld: personal('evenWorld', '짝수 세계', '최종 선의 윗면이 모두 2 또는 4 (빈 선 칸이 있으면 안 됨)', (p) =>
    lineTops(p.board).every((f) => f === 2 || f === 4),
  ),
  symmetry: personal('symmetry', '대칭 우주', '정면에서 본 열별 최고 높이가 좌우 대칭', (p) => {
    const h = columnHeights(p.board)
    return h[0] === h[4] && h[1] === h[3]
  }),
  cleanHands: personal('cleanHands', '깨끗한 손', '잔해 2개 이하', (p) => p.debris.length <= 2),
}

export const PERSONAL_GOAL_DECK: readonly PersonalGoalId[] = Object.keys(PERSONAL_GOALS) as PersonalGoalId[]

/** 게임 준비 때 받는 개인 목표 수와 고르는 수 (§5) */
export const PERSONAL_GOAL_DRAW = 2
export const PERSONAL_GOAL_POINTS = 6
