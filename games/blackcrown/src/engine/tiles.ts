/**
 * 육각 판 19장(앞뒤) — tools/tiles-gen.ts 가 만든 데이터. 손으로 고쳐도 된다(실물 판 디자인이 정본).
 * 판 좌표: 뾰족한 꼭짓점이 위인 육각형, 중심 (0,0), 꼭짓점까지 100. 변 e(0~5)의 가운데는 60e도(화면 기준, y 아래).
 * ports[e]: 변 e 가운데 출구와 이어진 칸. rough 1 = 험한 길(지날 때 이동 +1).
 * 구역별 칸 수(야영지 제외): 바깥 20~29, 가운데 16~18, 안쪽 7~8.
 */
export interface TileCell {
  x: number
  y: number
  ring: number
  camp?: true
}
export interface TileDeco {
  x: number
  y: number
  type: 'lake' | 'peak' | 'rubble' | 'pool'
  s: number
}
export interface TileFace {
  name: string
  cells: TileCell[]
  roads: [number, number, 0 | 1][]
  ports: { cell: number; rough: 0 | 1 }[]
  deco: TileDeco[]
}
export type TilePair = [TileFace, TileFace]

export const TILE_R = 100
export const ZONE_CELLS = { 1: [20, 29], 2: [16, 18], 3: [7, 8] } as const

export const TILES: { castle: TilePair[]; camp: TilePair[]; ruin: TilePair[]; forest: TilePair[] } = {
  castle: [
    [
      {
        name: '검은 성채',
        cells: [
          { x: 0, y: 0, ring: 4 },
          { x: 49.2, y: 25.8, ring: 3 },
          { x: 18.4, y: 53, ring: 3 },
          { x: -27.8, y: 46.3, ring: 3 },
          { x: -53.1, y: 11.8, ring: 3 },
          { x: -50, y: -24.2, ring: 3 },
          { x: -13.4, y: -53.8, ring: 3 },
          { x: 22.9, y: -49.7, ring: 3 },
          { x: 54.6, y: -13.7, ring: 3 },
        ],
        roads: [
          [0, 1, 0],
          [0, 3, 0],
          [0, 5, 0],
          [0, 4, 0],
          [1, 8, 0],
          [3, 4, 0],
          [5, 6, 0],
          [1, 2, 0],
          [6, 7, 0],
          [2, 3, 0],
          [4, 5, 0],
        ],
        ports: [
          { cell: 8, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 3, rough: 0 },
          { cell: 4, rough: 0 },
          { cell: 6, rough: 0 },
          { cell: 7, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '가시 왕좌',
        cells: [
          { x: 0, y: 0, ring: 4 },
          { x: 54.4, y: 3.2, ring: 3 },
          { x: 26.6, y: 48.2, ring: 3 },
          { x: -16.6, y: 51.5, ring: 3 },
          { x: -52.8, y: 16, ring: 3 },
          { x: -45, y: -32.9, ring: 3 },
          { x: -9.7, y: -56.9, ring: 3 },
          { x: 40.6, y: -35.6, ring: 3 },
        ],
        roads: [
          [0, 7, 0],
          [0, 4, 0],
          [0, 2, 0],
          [0, 5, 0],
          [3, 4, 0],
          [5, 6, 0],
          [4, 5, 0],
          [2, 3, 0],
          [1, 2, 0],
          [1, 7, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 3, rough: 0 },
          { cell: 4, rough: 0 },
          { cell: 6, rough: 0 },
          { cell: 7, rough: 0 },
        ],
        deco: [],
      },
    ],
  ],
  camp: [
    [
      {
        name: '야영지',
        cells: [
          { x: 3.3, y: 65.1, ring: 1, camp: true },
          { x: 4, y: -10.5, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '모닥불 언덕',
        cells: [
          { x: -46.2, y: -39.5, ring: 1, camp: true },
          { x: 65.1, y: -24.8, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [],
      },
    ],
  ],
  ruin: [
    [
      {
        name: '무너진 망루',
        cells: [
          { x: -27.8, y: -47.1, ring: 2 },
          { x: -21.5, y: 48.3, ring: 2 },
          { x: 59.5, y: -19.4, ring: 2 },
        ],
        roads: [
          [0, 2, 0],
          [0, 1, 1],
          [1, 2, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 1 },
        ],
        deco: [],
      },
      {
        name: '부서진 수도원',
        cells: [
          { x: -46.2, y: -39.5, ring: 2 },
          { x: 65.1, y: -24.8, ring: 2 },
          { x: 13.1, y: -7.1, ring: 2 },
        ],
        roads: [
          [1, 2, 0],
          [0, 2, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '잿빛 광장',
        cells: [
          { x: 34, y: 15, ring: 2 },
          { x: -53.5, y: -16.9, ring: 2 },
          { x: -35.8, y: 53.2, ring: 2 },
        ],
        roads: [
          [1, 2, 0],
          [0, 2, 0],
        ],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 2.2, y: -25.1, type: 'pool', s: 1.1 }],
      },
      {
        name: '옛 성벽길',
        cells: [
          { x: 2.1, y: 53.6, ring: 2 },
          { x: 65.5, y: 9.2, ring: 2 },
          { x: -48.2, y: -23.7, ring: 2 },
        ],
        roads: [
          [0, 1, 0],
          [0, 2, 1],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 1, rough: 0 },
        ],
        deco: [{ x: -11.7, y: -44.2, type: 'rubble', s: 1.1 }],
      },
    ],
    [
      {
        name: '쓰러진 석상',
        cells: [
          { x: 5.2, y: -24.1, ring: 2 },
          { x: 53.5, y: 21.3, ring: 2 },
          { x: 55, y: -28.9, ring: 2 },
        ],
        roads: [
          [0, 2, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 2, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '마른 분수',
        cells: [
          { x: 3.4, y: -7.1, ring: 2 },
          { x: 18.5, y: 48.4, ring: 2 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '해골 회랑',
        cells: [
          { x: -39.6, y: -49, ring: 2 },
          { x: -17.7, y: 64.8, ring: 2 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 39.9, y: -10.2, type: 'rubble', s: 1.1 }],
      },
      {
        name: '갈라진 탑',
        cells: [
          { x: -33.1, y: 35.2, ring: 2 },
          { x: 15, y: -39.8, ring: 2 },
          { x: 37.7, y: 50.6, ring: 2 },
        ],
        roads: [
          [0, 2, 0],
          [0, 1, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
        ],
        deco: [{ x: 55.4, y: -10.3, type: 'rubble', s: 1 }],
      },
    ],
    [
      {
        name: '버려진 병영',
        cells: [
          { x: -31.3, y: -33.1, ring: 2 },
          { x: 57.7, y: 19.9, ring: 2 },
          { x: -33.2, y: 26.4, ring: 2 },
        ],
        roads: [
          [0, 2, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 1 },
        ],
        deco: [{ x: 33.7, y: -23.8, type: 'pool', s: 1.3 }],
      },
      {
        name: '이끼 계단',
        cells: [
          { x: -5.5, y: 39.5, ring: 2 },
          { x: 31, y: -23.5, ring: 2 },
          { x: -59.2, y: 20.9, ring: 2 },
        ],
        roads: [
          [0, 2, 0],
          [0, 1, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '검댕 예배당',
        cells: [
          { x: -3.2, y: 50.8, ring: 2 },
          { x: -21.6, y: -1.2, ring: 2 },
          { x: 64.8, y: -8.1, ring: 2 },
        ],
        roads: [
          [0, 1, 1],
          [1, 2, 0],
          [0, 2, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '꺼진 등대',
        cells: [
          { x: 13.3, y: -21.6, ring: 2 },
          { x: 28.2, y: 26.8, ring: 2 },
          { x: -25.4, y: -54.8, ring: 2 },
        ],
        roads: [
          [0, 1, 0],
          [0, 2, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
    ],
  ],
  forest: [
    [
      {
        name: '여울목',
        cells: [
          { x: 41.7, y: 48.1, ring: 1 },
          { x: 48.9, y: -9.3, ring: 1 },
          { x: -10.7, y: -37.2, ring: 1 },
        ],
        roads: [
          [0, 1, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [{ x: -21.6, y: 31.2, type: 'lake', s: 0.9 }],
      },
      {
        name: '늑대굴',
        cells: [
          { x: -59.4, y: -9.8, ring: 1 },
          { x: 18.3, y: 54.1, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '안개 늪',
        cells: [
          { x: -10.6, y: -46.1, ring: 1 },
          { x: 55.5, y: 18.9, ring: 1 },
        ],
        roads: [[0, 1, 1]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '버섯 숲',
        cells: [{ x: -42.5, y: -38.8, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '사냥꾼 오두막',
        cells: [
          { x: 52.2, y: -1.3, ring: 1 },
          { x: -25.6, y: 23.2, ring: 1 },
        ],
        roads: [[0, 1, 1]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 5.3, y: -57.7, type: 'peak', s: 1.2 }],
      },
      {
        name: '고목 언덕',
        cells: [
          { x: 17.2, y: 39.9, ring: 1 },
          { x: -27.1, y: 20.7, ring: 1 },
          { x: 61.7, y: -16.2, ring: 1 },
        ],
        roads: [
          [0, 1, 0],
          [0, 2, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 1 },
        ],
        deco: [{ x: 3.5, y: -48.3, type: 'peak', s: 1.2 }],
      },
    ],
    [
      {
        name: '까마귀 둥지',
        cells: [{ x: 2.3, y: 34.8, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '돌무덤',
        cells: [{ x: 26.5, y: -9.2, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '샘물 골짜기',
        cells: [
          { x: -22.2, y: 13.4, ring: 1 },
          { x: 20.4, y: -13, ring: 1 },
          { x: -33.5, y: -39.2, ring: 1 },
        ],
        roads: [
          [0, 1, 0],
          [0, 2, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 1, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '덩굴 협곡',
        cells: [
          { x: 42.2, y: -11.2, ring: 1 },
          { x: -30.8, y: 47.7, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '반딧불 숲',
        cells: [
          { x: 0.5, y: 64, ring: 1 },
          { x: 23.3, y: 10.4, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '순례자 고개',
        cells: [
          { x: 49.3, y: 40.8, ring: 1 },
          { x: 28.3, y: -52.9, ring: 1 },
          { x: -23.5, y: -47.6, ring: 1 },
        ],
        roads: [
          [1, 2, 0],
          [0, 1, 0],
        ],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [{ x: -53.6, y: 12.5, type: 'peak', s: 1 }],
      },
    ],
    [
      {
        name: '마른 개울',
        cells: [
          { x: -36.9, y: 33.6, ring: 1 },
          { x: -59.3, y: -33.3, ring: 1 },
          { x: 23.2, y: -56.9, ring: 1 },
        ],
        roads: [
          [0, 1, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 2, rough: 0 },
        ],
        deco: [{ x: 25.9, y: 3.7, type: 'lake', s: 1 }],
      },
      {
        name: '가시덤불',
        cells: [
          { x: 27, y: -39.7, ring: 1 },
          { x: -4.2, y: 45, ring: 1 },
          { x: -46.2, y: -46.4, ring: 1 },
        ],
        roads: [
          [0, 2, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 32.8, y: 15.6, type: 'lake', s: 1.3 }],
      },
    ],
    [
      {
        name: '여우 굴',
        cells: [{ x: 24.7, y: 53.5, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '쓰러진 고목',
        cells: [
          { x: -25.3, y: -39.4, ring: 1 },
          { x: -43, y: 27.1, ring: 1 },
          { x: 45, y: -26, ring: 1 },
        ],
        roads: [
          [0, 1, 0],
          [0, 2, 0],
        ],
        ports: [
          { cell: 2, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
        ],
        deco: [{ x: 18.7, y: 15.2, type: 'peak', s: 1.1 }],
      },
    ],
    [
      {
        name: '이끼 바위',
        cells: [
          { x: -3.3, y: -1.1, ring: 1 },
          { x: -48.7, y: 15.2, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '갈대밭',
        cells: [
          { x: 17, y: 43, ring: 1 },
          { x: -28, y: -32.9, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '서리 언덕',
        cells: [
          { x: -31.4, y: 13.8, ring: 1 },
          { x: -14.6, y: -54, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '부엉이 숲',
        cells: [
          { x: 2.9, y: -44.6, ring: 1 },
          { x: -64.6, y: 18.4, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 26.2, y: 17.3, type: 'lake', s: 1.2 }],
      },
    ],
    [
      {
        name: '사슴 길',
        cells: [{ x: -37.4, y: -35.4, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
        ],
        deco: [],
      },
      {
        name: '나무꾼 터',
        cells: [
          { x: 65.2, y: -9, ring: 1 },
          { x: 18.2, y: 25.3, ring: 1 },
          { x: -10.9, y: -59.4, ring: 1 },
        ],
        roads: [
          [0, 1, 0],
          [1, 2, 0],
          [0, 2, 1],
        ],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
        ],
        deco: [{ x: -41.1, y: 5.5, type: 'peak', s: 0.9 }],
      },
    ],
  ],
}
