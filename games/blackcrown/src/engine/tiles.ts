/**
 * 육각 판 19장(앞뒤) — tools/tiles-gen.ts 가 만든 데이터. 손으로 고쳐도 된다(실물 판 디자인이 정본).
 * 판 좌표: 뾰족한 꼭짓점이 위인 육각형, 중심 (0,0), 꼭짓점까지 100. 변 e(0~5)의 가운데는 60e도(화면 기준, y 아래).
 * ports[e]: 변 e 가운데 출구와 이어진 칸. rough 1 = 험한 길(지날 때 이동 +1).
 * 구역별 칸 수(야영지 제외): 바깥 18~26, 가운데 15~16, 안쪽 7~8.
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
export const ZONE_CELLS = { 1: [18, 26], 2: [15, 16], 3: [7, 8] } as const

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
          { x: 64.4, y: -2.2, ring: 1, camp: true },
          { x: -40.9, y: 27.4, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: -34.1, y: -37, type: 'peak', s: 1.3 }],
      },
      {
        name: '모닥불 언덕',
        cells: [
          { x: 57.7, y: -34.7, ring: 1, camp: true },
          { x: -53.9, y: -16.4, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 15.7, y: 56, type: 'peak', s: 0.8 }],
      },
    ],
  ],
  ruin: [
    [
      {
        name: '무너진 망루',
        cells: [
          { x: -58.8, y: 3.8, ring: 2 },
          { x: 56.4, y: 12.1, ring: 2 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '부서진 수도원',
        cells: [
          { x: -21.5, y: 58.2, ring: 2 },
          { x: -6.1, y: -56.7, ring: 2 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '잿빛 광장',
        cells: [
          { x: 56.6, y: -42.8, ring: 2 },
          { x: -54.5, y: 11.8, ring: 2 },
          { x: -2.4, y: -27.6, ring: 2 },
        ],
        roads: [
          [0, 2, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 2, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [],
      },
      {
        name: '옛 성벽길',
        cells: [
          { x: 43.9, y: -30.9, ring: 2 },
          { x: 48.2, y: 34.5, ring: 2 },
          { x: -37.8, y: 53, ring: 2 },
        ],
        roads: [
          [0, 1, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
        ],
        deco: [{ x: 4.8, y: -46.6, type: 'rubble', s: 1.1 }],
      },
    ],
    [
      {
        name: '쓰러진 석상',
        cells: [
          { x: -48.4, y: -39.7, ring: 2 },
          { x: -11.3, y: 59, ring: 2 },
          { x: -63.1, y: 8.5, ring: 2 },
        ],
        roads: [
          [0, 2, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 3.5, y: 16.5, type: 'rubble', s: 1.2 }],
      },
      {
        name: '마른 분수',
        cells: [
          { x: 41.9, y: 29.8, ring: 2 },
          { x: 35.6, y: -32.9, ring: 2 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
        ],
        deco: [{ x: -4.3, y: 55, type: 'pool', s: 1.1 }],
      },
    ],
    [
      {
        name: '해골 회랑',
        cells: [
          { x: 8, y: 48, ring: 2 },
          { x: -59.3, y: -25.2, ring: 2 },
          { x: 10.9, y: -45.9, ring: 2 },
        ],
        roads: [
          [1, 2, 0],
          [0, 1, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 1 },
        ],
        deco: [{ x: 23.5, y: -1, type: 'pool', s: 1 }],
      },
      {
        name: '갈라진 탑',
        cells: [
          { x: -14.8, y: -54.9, ring: 2 },
          { x: -13.7, y: 1.8, ring: 2 },
          { x: 40.5, y: 43.6, ring: 2 },
        ],
        roads: [
          [0, 1, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
        ],
        deco: [],
      },
    ],
    [
      {
        name: '버려진 병영',
        cells: [
          { x: 49.3, y: -26.7, ring: 2 },
          { x: 14.2, y: 28.7, ring: 2 },
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
        deco: [{ x: -40.2, y: -3.2, type: 'pool', s: 1.2 }],
      },
      {
        name: '이끼 계단',
        cells: [
          { x: 4.2, y: 38.4, ring: 2 },
          { x: -2.4, y: -7.9, ring: 2 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [{ x: -38.5, y: -36, type: 'pool', s: 0.9 }],
      },
    ],
    [
      {
        name: '검댕 예배당',
        cells: [
          { x: 1.2, y: 74.9, ring: 2 },
          { x: 4.6, y: -25.1, ring: 2 },
          { x: -50.7, y: -17.5, ring: 2 },
        ],
        roads: [
          [1, 2, 0],
          [0, 1, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 1 },
          { cell: 1, rough: 0 },
        ],
        deco: [{ x: 55.3, y: 0.3, type: 'pool', s: 1.3 }],
      },
      {
        name: '꺼진 등대',
        cells: [
          { x: -20.8, y: -28.6, ring: 2 },
          { x: 4.2, y: 20.1, ring: 2 },
          { x: 63.2, y: 3, ring: 2 },
        ],
        roads: [
          [0, 1, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
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
          { x: -17.3, y: 55.7, ring: 1 },
          { x: 20.5, y: 7.8, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [{ x: -14, y: -43, type: 'peak', s: 1.2 }],
      },
      {
        name: '늑대굴',
        cells: [{ x: 50.3, y: 33.7, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
        ],
        deco: [{ x: -29.3, y: -29.1, type: 'lake', s: 1.2 }],
      },
    ],
    [
      {
        name: '안개 늪',
        cells: [{ x: -35.4, y: 39.7, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
        ],
        deco: [{ x: 29.1, y: -14.2, type: 'lake', s: 1.1 }],
      },
      {
        name: '버섯 숲',
        cells: [{ x: -35.9, y: 46.3, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: -36.4, y: 9.9, type: 'lake', s: 0.9 }],
      },
    ],
    [
      {
        name: '사냥꾼 오두막',
        cells: [
          { x: 26.8, y: -42, ring: 1 },
          { x: -47.6, y: 0.6, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: -35.2, y: 35, type: 'peak', s: 0.8 }],
      },
      {
        name: '고목 언덕',
        cells: [{ x: -48.7, y: 31.6, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 24.7, y: -19, type: 'peak', s: 1.2 }],
      },
    ],
    [
      {
        name: '까마귀 둥지',
        cells: [{ x: -57.6, y: 40.8, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 32.8, y: 34.8, type: 'peak', s: 1.1 }],
      },
      {
        name: '돌무덤',
        cells: [
          { x: 29.6, y: -43.7, ring: 1 },
          { x: -16.9, y: 39, ring: 1 },
          { x: 52.2, y: 20, ring: 1 },
        ],
        roads: [
          [0, 2, 0],
          [1, 2, 0],
        ],
        ports: [
          { cell: 2, rough: 0 },
          { cell: 2, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
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
          { x: 7.4, y: 48.5, ring: 1 },
          { x: 7.5, y: -19.7, ring: 1 },
          { x: -56.8, y: -11.1, ring: 1 },
        ],
        roads: [
          [1, 2, 0],
          [0, 1, 0],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 1 },
          { cell: 1, rough: 0 },
        ],
        deco: [{ x: 52.6, y: -3.3, type: 'lake', s: 1.2 }],
      },
      {
        name: '덩굴 협곡',
        cells: [
          { x: 14.1, y: 13.8, ring: 1 },
          { x: -64.3, y: -20, ring: 1 },
          { x: -23.4, y: 44.3, ring: 1 },
        ],
        roads: [
          [0, 2, 0],
          [1, 2, 0],
          [0, 1, 0],
        ],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 2, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 16.6, y: -52.9, type: 'peak', s: 1 }],
      },
    ],
    [
      {
        name: '반딧불 숲',
        cells: [
          { x: -23.6, y: 15.1, ring: 1 },
          { x: 51, y: -28.8, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [],
      },
      {
        name: '순례자 고개',
        cells: [{ x: 38.4, y: -37.9, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 12.3, y: 48.8, type: 'lake', s: 1.2 }],
      },
    ],
    [
      {
        name: '마른 개울',
        cells: [
          { x: 61.7, y: -40.2, ring: 1 },
          { x: -1.5, y: -39.5, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 1 },
        ],
        deco: [{ x: 4.4, y: 54.5, type: 'peak', s: 1.1 }],
      },
      {
        name: '가시덤불',
        cells: [
          { x: 7.5, y: 31.6, ring: 1 },
          { x: -31, y: -27.3, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [{ x: 6.1, y: -37.1, type: 'peak', s: 0.8 }],
      },
    ],
    [
      {
        name: '여우 굴',
        cells: [
          { x: 38.4, y: -15.7, ring: 1 },
          { x: -36.5, y: -50.8, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 30.9, y: 45, type: 'peak', s: 1 }],
      },
      {
        name: '쓰러진 고목',
        cells: [
          { x: -2.6, y: -59.7, ring: 1 },
          { x: -44.1, y: 27, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 28.1, y: -9.9, type: 'lake', s: 0.8 }],
      },
    ],
    [
      {
        name: '이끼 바위',
        cells: [
          { x: -7.3, y: -1.2, ring: 1 },
          { x: -30.5, y: 44.9, ring: 1 },
          { x: -13, y: -59.3, ring: 1 },
        ],
        roads: [
          [0, 1, 0],
          [0, 2, 0],
        ],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
        ],
        deco: [{ x: -48.9, y: -31.2, type: 'lake', s: 0.9 }],
      },
      {
        name: '갈대밭',
        cells: [
          { x: 20.8, y: -22.4, ring: 1 },
          { x: -11.6, y: -60.4, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
        ],
        deco: [{ x: -16.3, y: 14.3, type: 'peak', s: 0.8 }],
      },
    ],
    [
      {
        name: '서리 언덕',
        cells: [
          { x: 15, y: -58.5, ring: 1 },
          { x: 27.8, y: 35.5, ring: 1 },
          { x: -63.9, y: -34.1, ring: 1 },
        ],
        roads: [
          [0, 2, 0],
          [0, 1, 1],
        ],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 2, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: -27.3, y: 3.1, type: 'peak', s: 1.1 }],
      },
      {
        name: '부엉이 숲',
        cells: [
          { x: 59.5, y: -26.6, ring: 1 },
          { x: -27.6, y: 55.4, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 0, rough: 0 },
          { cell: 1, rough: 1 },
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
        name: '사슴 길',
        cells: [
          { x: 19.8, y: 61.4, ring: 1 },
          { x: 30.8, y: -28.4, ring: 1 },
        ],
        roads: [[0, 1, 0]],
        ports: [
          { cell: 1, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 1 },
          { cell: 1, rough: 0 },
          { cell: 1, rough: 1 },
          { cell: 1, rough: 0 },
        ],
        deco: [{ x: -47.6, y: -23.1, type: 'peak', s: 1.3 }],
      },
      {
        name: '나무꾼 터',
        cells: [{ x: 6.3, y: -34, ring: 1 }],
        roads: [],
        ports: [
          { cell: 0, rough: 1 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
          { cell: 0, rough: 0 },
        ],
        deco: [{ x: 5.5, y: 22.2, type: 'lake', s: 1.2 }],
      },
    ],
  ],
}
