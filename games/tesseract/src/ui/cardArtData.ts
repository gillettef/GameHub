/**
 * 카드 일러스트 (Claude Design 캔버스 「카드 v2」 보드와 같은 데이터).
 *
 * 카드마다 그 조건을 주사위 도해로 보여 주는 작은 그림을 도형 목록으로 만든다.
 * React(CardArt.tsx)와 캔버스 생성 스크립트가 같은 도형을 그리므로, 여기에는 순수 데이터만 둔다.
 * 좌표계는 120 × 80 (가로 3:2).
 */
import {
  EVENTS,
  GOAL_ACHIEVED_POINTS,
  GOAL_FIRST_POINTS,
  LAWS,
  PERSONAL_GOAL_POINTS,
  PERSONAL_GOALS,
  ROUND4_GOAL_POINTS,
  ROUND_GOALS,
} from '../engine'
import type { Color, EventId, LawId, PersonalGoalId, RoundGoalId } from '../engine'

export const ART_W = 120
export const ART_H = 80

export type ArtShape =
  /** 주사위 한 면 (f: 숫자 또는 't' = ⧗). hi: 조건을 이루는 주사위 강조, dim: 배경 주사위 */
  | { t: 'die'; x: number; y: number; s: number; c: Color; f?: number | 't'; hi?: boolean; dim?: boolean }
  /** 비어 있는 칸 (점선) */
  | { t: 'slot'; x: number; y: number; s: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; dash?: boolean; tone?: boolean }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number; tone?: boolean }
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number; tone?: boolean }
  | { t: 'label'; x: number; y: number; text: string; size: number; tone?: boolean }

export type CardKey =
  | { kind: 'law'; id: LawId }
  | { kind: 'goal'; id: RoundGoalId }
  | { kind: 'personal'; id: PersonalGoalId }
  | { kind: 'event'; id: EventId }

const COLOR: Record<string, Color> = { r: 'red', b: 'blue', g: 'green', y: 'yellow', k: 'black' }

/** 'r3' → 빨강 3, 'bt' → 파랑 ⧗, 끝에 '*' = 강조, '.' = 흐리게, '' = 빈 칸 */
function cellShape(code: string, x: number, y: number, s: number): ArtShape {
  if (!code || code === '-') return { t: 'slot', x, y, s }
  const c = COLOR[code[0] ?? 'k'] ?? 'black'
  const fc = code[1]
  const f = fc === 't' ? 't' : fc && /[1-5]/.test(fc) ? Number(fc) : undefined
  return { t: 'die', x, y, s, c, ...(f !== undefined ? { f } : {}), ...(code.includes('*') ? { hi: true } : {}), ...(code.includes('.') ? { dim: true } : {}) }
}

/** 1라운드: 선 5칸 */
function line(cells: string[], extra: ArtShape[] = []): ArtShape[] {
  const s = 18
  const gap = 4
  const x0 = (ART_W - (5 * s + 4 * gap)) / 2
  return [...cells.map((code, i) => cellShape(code, x0 + i * (s + gap), 31, s)), ...extra]
}

/** 2라운드: 위에서 본 5×3 (첫 줄 = 뒤, 마지막 줄 = 앞·선) */
function grid(rows: [string, string, string], extra: ArtShape[] = []): ArtShape[] {
  const s = 14
  const gap = 3
  const x0 = (ART_W - (5 * s + 4 * gap)) / 2
  const y0 = (ART_H - (3 * s + 2 * gap)) / 2 + 2
  const out: ArtShape[] = []
  rows.forEach((row, r) =>
    row.split(' ').forEach((code, c) => {
      out.push(cellShape(code, x0 + c * (s + gap), y0 + r * (s + gap), s))
    }),
  )
  return [...out, ...extra]
}

/** 3라운드: 정면에서 본 기둥 5개. 각 기둥은 아래층부터 */
function towers(cols: string[][], extra: ArtShape[] = []): ArtShape[] {
  const s = 12
  const gap = 5
  const step = 10
  const x0 = (ART_W - (5 * s + 4 * gap)) / 2
  const base = 70
  const out: ArtShape[] = [{ t: 'line', x1: 8, y1: base + 1.5, x2: ART_W - 8, y2: base + 1.5, tone: true }]
  cols.forEach((col, i) => {
    if (col.length === 0) out.push({ t: 'slot', x: x0 + i * (s + gap), y: base - s, s })
    col.forEach((code, k) => out.push(cellShape(code, x0 + i * (s + gap), base - s - k * step, s)))
  })
  return [...out, ...extra]
}

const ring = (cx: number, cy: number, r: number, sw = 1.5): ArtShape => ({ t: 'circle', cx, cy, r, stroke: 'tone', sw, tone: true })

const LAW_ART: Record<LawId, ArtShape[]> = {
  // 행성과 궤도
  standard: [
    { t: 'path', d: 'M22 48 C 40 30, 80 30, 98 48 C 80 62, 40 62, 22 48 Z', stroke: 'tone', sw: 1.2, tone: true },
    { t: 'circle', cx: 60, cy: 42, r: 15, fill: '#3B7BF6' },
    { t: 'path', d: 'M22 48 C 40 62, 80 62, 98 48', stroke: 'tone', sw: 1.6, tone: true },
    { t: 'circle', cx: 93, cy: 44, r: 3, fill: '#F5C842' },
  ],
  // 축을 사이에 둔 같은 색
  mirror: [
    { t: 'line', x1: 60, y1: 12, x2: 60, y2: 70, dash: true, tone: true },
    cellShape('r2*', 34, 32, 18),
    cellShape('r5*', 68, 32, 18),
    { t: 'path', d: 'M54 41 h-2 M66 41 h2', stroke: 'tone', sw: 1.5, tone: true },
  ],
  // 같은 숫자를 쌓을 수 있음
  flat: [cellShape('g3*', 51, 46, 18), cellShape('y3*', 51, 28, 18), { t: 'label', x: 84, y: 46, text: '=', size: 18, tone: true }],
  // 아래보다 작은 숫자만
  inverted: [cellShape('r5', 51, 52, 18), cellShape('b3', 51, 34, 18), cellShape('g1*', 51, 16, 18), { t: 'path', d: 'M86 20 v36 m-5 -6 l5 6 l5 -6', stroke: 'tone', sw: 1.6, tone: true }],
  // 다시 굴리는 시장 주사위
  shakyMarket: [
    cellShape('y4*', 51, 31, 18),
    { t: 'path', d: 'M40 30 q-6 10 0 20 M34 26 q-8 14 0 28 M80 30 q6 10 0 20 M86 26 q8 14 0 28', stroke: 'tone', sw: 1.4, tone: true },
  ],
  // 검은 구멍과 강착 원반
  void: [
    { t: 'path', d: 'M18 44 C 40 32, 80 32, 102 44 C 80 54, 40 54, 18 44 Z', fill: 'none', stroke: 'tone', sw: 1.4, tone: true },
    { t: 'circle', cx: 60, cy: 42, r: 14, fill: '#05040a', stroke: 'tone', sw: 2, tone: true },
    cellShape('k2*', 54, 36, 12),
  ],
  // 시장 칸이 하나 더
  abundance: [
    cellShape('r2', 14, 33, 16),
    cellShape('b4', 36, 33, 16),
    cellShape('g1', 58, 33, 16),
    { t: 'slot', x: 84, y: 33, s: 16 },
    { t: 'label', x: 92, y: 30, text: '+1', size: 9, tone: true },
  ],
  eternal: [{ t: 'path', d: 'M30 42 c0 -14 22 -14 30 0 c8 14 30 14 30 0 c0 -14 -22 -14 -30 0 c-8 14 -30 14 -30 0 z', stroke: 'tone', sw: 2.2, tone: true }],
}

const GOAL_ART: Record<RoundGoalId, ArtShape[]> = {
  // ── 1라운드: 선 ──
  mirror: line(['r2*', 'b4*', 'y3', 'b4*', 'r2*'], [{ t: 'line', x1: 60, y1: 22, x2: 60, y2: 58, dash: true, tone: true }]),
  rainbow: line(['r1*', 'b4*', 'g2*', 'y5*', 'k3*']),
  stairs: line(['b1*', 'g2*', 'r3*', 'y4*', 'k2'], [{ t: 'path', d: 'M14 24 L 92 16', stroke: 'tone', sw: 1.4, tone: true }]),
  giantPath: line(['r5*', 'y4*', 'b5*', 'g4*', 'k1'], [{ t: 'label', x: 60, y: 66, text: 'Σ 18+', size: 9, tone: true }]),
  oddEven: line(['b1*', 'r4*', 'g3*', 'y2*', 'k5*']),
  triplets: line(['g3*', 'r1.', 'y3*', 'b5.', 'k3*']),
  timeSeed: line(['r2.', 'bt*', 'y3.', 'gt*', 'k1.']),
  lowLand: line(['b1*', 'g2*', 'r1*', 'y2*', 'k1*'], [{ t: 'label', x: 60, y: 66, text: 'Σ ≤ 10', size: 9, tone: true }]),
  // ── 2라운드: 평면 ──
  cross: grid(['- r2* - - -', 'b4* g3* y1* - -', 'k2 r2* b5 g1 y4']),
  columnColor: grid(['- b2* - - -', 'g1. b5* r3. - -', 'y4 b1* k2 r5 g3']),
  stepChain: grid(['- - - - -', 'r1* g2* b3* y4* -', 'k5 b2 g4 r3 y1']),
  continent: grid(['g1* g4* g2* - -', 'g3* g5* g2* - -', 'r2 b4 y1 k3 b5']),
  roots: grid(['- - - - -', 'r3* b1* - y2* -', 'r4* b2* g5 y3* k1']),
  smallSeed: grid(['b1* - - g1* -', '- r1* y4. - -', 'k2 g5 b3 r2 y4']),
  mosaic: grid(['r2* b4* - - -', 'g1* y3* k5. - -', 'b2 r5 g4 y1 k3']),
  isolation: grid(['- g2 - b4 -', 'r1 y3 k5 g1 r2', 'b4 g2 y1 r5 k3']),
  // ── 3라운드: 입체 ──
  skyscraper: towers([['b1'], ['g1', 'r3'], ['y1*', 'b2*', 'g3*', 'r4*', 'k5*'], ['r2', 'y4'], ['k1']]),
  twinTowers: towers([['g1'], ['b1*', 'r3*', 'y5*'], ['r2*', 'g3*', 'b4*'], ['y1', 'k2'], []]),
  monoTower: towers([['k1'], ['b2'], ['r1*', 'r3*', 'r5*'], ['g2', 'y4'], ['b3']]),
  numberStairs: towers([['b1*'], ['g1', 'r2*'], ['y3*'], ['r1', 'k4*'], ['b5.']]),
  pyramid: towers([['b1'], ['g1', 'r3'], ['y1*', 'b2*', 'g3*', 'r4*'], ['r2', 'y4'], ['k1']], [{ t: 'path', d: 'M18 52 L 60 18 L 102 52', stroke: 'tone', sw: 1.2, tone: true }]),
  fiveLights: towers([['b1', 'r3*'], ['g2', 'b4*'], ['y1', 'g5*'], ['r2', 'y3*'], ['b1', 'k4*']]),
  perfectStairs: towers([['b2'], [], ['g1*', 'r2*', 'y3*', 'b4*', 'k5*'], ['y3'], ['r1', 'g4']]),
  timeRoof: towers([['b1', 'rt*'], ['g3'], ['y1', 'gt*'], ['r2', 'b4'], ['b2', 'bt*']]),
  // ── 4라운드: 위에서 본 꼭대기 지도 (첫 줄 = 뒤, 마지막 줄 = 앞) ──
  colorRiver: grid(['- b2* - g4 -', 'r1 b4* g3 - y2', 'k2 b5* y1 r4 g3']),
  filledSky: grid(['g2 r4 - y3 k5', 'b3 y2 r5 g1 b4', 'k1 g3 y4 - b5']),
  crown: towers(
    [['b1'], ['g1', 'r3'], ['y1', 'b2', 'g5*'], ['r2', 'y4'], ['k1']],
    [{ t: 'path', d: 'M53 34 l2 -8 l5 5 l5 -5 l2 8 z', fill: '#F5C842', stroke: 'tone', sw: 0.8, tone: true }],
  ),
  evenHorizon: towers(
    [['b1', 'r3'], ['g1', 'y4'], ['y1', 'b2'], ['r2'], ['k1', 'g3']],
    [{ t: 'line', x1: 12, y1: 46, x2: 108, y2: 46, dash: true, tone: true }],
  ),
  frontRainbow: grid(['- g2 - b4 -', 'y1 - k3 - r2', 'r1* b4* g2* y5* k3*']),
  mirrorHorizon: grid(['g2* - b4 - g5*', 'r1* y3* - y2* r4*', 'b1 k2 g3 r4 y5'], [{ t: 'line', x1: 60, y1: 12, x2: 60, y2: 70, dash: true, tone: true }]),
  twoContinents: grid(['r2* r4* - b3* b1*', 'r1* g3 k2 y4 b2*', 'g1 y5 k3 r2 y4']),
  horizonStairs: grid(['- r2 - g4 -', 'y1 - b3 - k5', 'b2* g3* r4* y5* k1']),
}

const EVENT_ART: Record<EventId, ArtShape[]> = {
  // 거꾸로 도는 화살표
  regression: [
    { t: 'path', d: 'M82 28 A 24 24 0 1 0 84 52', stroke: 'tone', sw: 2, tone: true },
    { t: 'path', d: 'M76 22 l8 6 l-9 4', stroke: 'tone', sw: 2, tone: true },
    cellShape('y3*', 51, 31, 18),
  ],
  // 갈라진 시공간과 들어갈 수 없는 빈 칸
  timeRift: [
    { t: 'path', d: 'M60 8 l-7 15 l9 8 l-9 13 l7 14 l-5 14', stroke: 'tone', sw: 2, tone: true },
    { t: 'slot', x: 76, y: 32, s: 18 },
    cellShape('r4', 26, 32, 18),
  ],
  // 좌우로만 넘어감
  rotation: [
    cellShape('b3*', 51, 31, 18),
    { t: 'path', d: 'M40 40 h-18 m5 -5 l-5 5 l5 5 M80 40 h18 m-5 -5 l5 5 l-5 5', stroke: 'tone', sw: 1.8, tone: true },
  ],
  // 지진파
  earthquake: [
    { t: 'path', d: 'M8 52 h18 l5 -16 l7 30 l7 -26 l6 18 l5 -8 l6 6 h50', stroke: 'tone', sw: 1.8, tone: true },
    cellShape('g2', 46, 18, 12),
    cellShape('r4', 62, 12, 12),
  ],
  // 가장 높은 기둥의 꼭대기가 깎임
  erosion: towers(
    [['b1'], ['g1', 'r3'], ['y1', 'b2', 'g3', 'r4.'], ['r2'], ['k1']],
    [{ t: 'path', d: 'M74 24 q6 4 4 10 M80 20 q8 6 5 14', stroke: 'tone', sw: 1.2, tone: true }],
  ),
  // 높은 탑을 누르는 중력
  gravityWave: towers(
    [['b1'], ['g1', 'r3', 'y4', 'k5.'], ['y1'], ['r2', 'b4'], ['k1']],
    [
      { t: 'path', d: 'M30 12 q8 -6 16 0 t16 0 t16 0', stroke: 'tone', sw: 1.4, tone: true },
      { t: 'path', d: 'M26 6 q10 -6 20 0 t20 0 t20 0', stroke: 'tone', sw: 1, tone: true },
    ],
  ),
  // 금 간 왕관
  crownCurse: [
    { t: 'path', d: 'M34 56 l6 -28 l14 16 l6 -22 l6 22 l14 -16 l6 28 z', fill: '#F5C842', stroke: 'tone', sw: 1.2, tone: true },
    { t: 'path', d: 'M60 24 l-4 10 l6 6 l-5 12', stroke: '#14121f', sw: 2 },
  ],
  // 터지는 별
  bigBang: [
    { t: 'circle', cx: 60, cy: 40, r: 8, fill: '#F5C842' },
    { t: 'path', d: 'M60 14 v12 M60 54 v12 M34 40 h12 M74 40 h12 M42 22 l8 8 M70 50 l8 8 M78 22 l-8 8 M50 50 l-8 8', stroke: 'tone', sw: 1.8, tone: true },
  ],
  // 번지는 초록 꼭대기
  proliferation: grid(['- g2* g4* - -', 'r1 g1* - y3 -', 'k2 b4 g3* r1 b5']),
  // 빈 칸을 덮는 물결
  flood: [
    { t: 'slot', x: 30, y: 24, s: 16 },
    { t: 'slot', x: 52, y: 24, s: 16 },
    { t: 'slot', x: 74, y: 24, s: 16 },
    { t: 'path', d: 'M10 52 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0', stroke: '#3B7BF6', sw: 2 },
    { t: 'path', d: 'M10 62 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0', stroke: '#3B7BF6', sw: 1.4 },
  ],
}

const PERSONAL_ART: Record<PersonalGoalId, ArtShape[]> = {
  redWorship: towers([['b1', 'r3*'], ['g2'], ['y1', 'r4*'], ['b3'], ['g1', 'r5*']]),
  seaTower: towers([['g1'], ['r2'], ['b1*', 'b3*', 'b5*'], ['y2'], ['k1']]),
  forestRoof: grid(['- - - - -', 'r1 g3* g4* - -', 'b2 y5 g1* k3 r2']),
  lightFront: towers([['y4*'], ['b2'], ['g1', 'y3*'], ['r5'], ['k1']]),
  voidCollector: towers([['k1*', 'k3*'], ['b2'], ['k1*', 'k2*', 'k4*'], ['r2'], []]),
  heightWorship: towers([['b1*', 'g2*', 'r3*', 'y4*'], ['k1'], ['r1*', 'b2*', 'g3*', 'y5*'], ['g2'], ['y1*', 'k2*', 'b4*', 'r5*']]),
  timeLord: [
    ring(60, 42, 26, 1),
    cellShape('rt*', 52, 9, 16),
    cellShape('bt*', 78, 34, 16),
    cellShape('gt*', 52, 59, 16),
    cellShape('yt*', 26, 34, 16),
  ],
  evenWorld: line(['r2*', 'b4*', 'g2*', 'y4*', 'k2*']),
  symmetry: towers([['b1'], ['g1', 'r3'], ['y1', 'b2', 'g4'], ['r2', 'k3'], ['b5']], [{ t: 'line', x1: 60, y1: 12, x2: 60, y2: 72, dash: true, tone: true }]),
  cleanHands: [
    { t: 'path', d: 'M40 44 l12 12 l28 -28', stroke: 'tone', sw: 3, tone: true },
    cellShape('k2.', 22, 56, 12),
    cellShape('k4.', 86, 56, 12),
    { t: 'label', x: 60, y: 76, text: '잔해 ≤ 2', size: 8, tone: true },
  ],
}

export function cardArt(key: CardKey): ArtShape[] {
  if (key.kind === 'law') return LAW_ART[key.id]
  if (key.kind === 'goal') return GOAL_ART[key.id]
  if (key.kind === 'event') return EVENT_ART[key.id]
  return PERSONAL_ART[key.id]
}

/** 일러스트 배경의 별 (카드마다 다르지만 늘 같은 자리) */
export function cardStars(seed: string, count = 22): { x: number; y: number; r: number; o: number }[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
  return Array.from({ length: count }, () => ({ x: next() * ART_W, y: next() * ART_H, r: 0.3 + next() * 0.9, o: 0.25 + next() * 0.6 }))
}

// ─── 카드에 보이는 정보 ───

const TONE = { law: '#9b8cff', goal: '#5ad1e6', personal: '#f2a65a', event: '#ff8a7a' } as const

interface CardInfo {
  tone: string
  kind: string
  short: string
  tag: string
  name: string
  text: string
  /** 큰 카드에만 보이는 덧붙임 (판정 시점 등) */
  note: string | null
  points: { value: string; label: string }[]
}

/** 카드 키 → 보이는 정보 (엔진의 카드 데이터에서) */
export function cardInfo(card: CardKey): CardInfo {
  if (card.kind === 'law') {
    const def = LAWS[card.id]
    return { tone: TONE.law, kind: '우주 법칙', short: '법칙', tag: '1 / 게임', name: def.name, text: def.text, note: '이번 게임 내내 모두에게 적용돼요', points: [] }
  }
  if (card.kind === 'event') {
    const def = EVENTS[card.id]
    return {
      tone: TONE.event,
      kind: '사건',
      short: def.when === 'start' ? '사건·시작' : '사건·끝',
      tag: def.when === 'start' ? '4R 시작' : '4R 끝',
      name: def.name,
      text: def.text,
      note: def.when === 'start' ? '공개한 때부터 4라운드 내내 넘기기 규칙이 바뀌어요' : '4라운드가 끝날 때, 점수를 세기 전에 발동해요',
      points: [],
    }
  }
  if (card.kind === 'goal') {
    const def = ROUND_GOALS[card.id]
    if (def.round === 4) {
      return {
        tone: TONE.goal,
        kind: '4라운드 목표',
        short: 'R4',
        tag: 'R4',
        name: def.name,
        text: def.text,
        note: '판정: 4라운드가 끝날 때 한 번, 달성한 사람 모두 (선착 없음)',
        points: [{ value: String(ROUND4_GOAL_POINTS), label: '달성' }],
      }
    }
    return {
      tone: TONE.goal,
      kind: `${def.round}라운드 목표`,
      short: `R${def.round}`,
      tag: `R${def.round}`,
      name: def.name,
      text: def.text,
      note: def.when === 'roundDone' ? '판정: 그 사람이 이번 라운드의 마지막 턴을 마쳤을 때' : '판정: 내 행동이 끝날 때마다',
      points: [
        { value: String(GOAL_FIRST_POINTS), label: '선착' },
        { value: String(GOAL_ACHIEVED_POINTS), label: '달성' },
      ],
    }
  }
  const def = PERSONAL_GOALS[card.id]
  return {
    tone: TONE.personal,
    kind: '개인 목표',
    short: '개인',
    tag: '비공개',
    name: def.name,
    text: def.text,
    note: '판정: 게임이 끝났을 때의 최종 상태',
    points: [{ value: String(PERSONAL_GOAL_POINTS), label: '달성 시' }],
  }
}
