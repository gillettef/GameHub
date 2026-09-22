/**
 * 맵 6개 (Rules.md 11절). 레이아웃은 규칙서의 그림을 그대로 옮긴 것이고,
 * 좌표(코어·소행성·광맥)는 그림에서 파싱한다. 기호: `.` 빈 우주, `#` 소행성, `o` 광맥, 숫자 = 그 좌석의 코어.
 * 좌표는 odd-r 오프셋 육각 좌표다(`x`=열, `y`=행, 홀수 행이 반 칸 밀린 그림을 정사각 문자 격자로 그대로 적은 것).
 * 코어 배치는 좌석별 공정성(시야 반경1 배치 가능 칸 수, 최근접 광맥 거리, 반경3 안 광맥·소행성 수, 보드 경계 여유,
 * 코어 간 거리 프로필)이 전부 같도록 스크립트로 계산해 만들었다 (data.test.ts 의 좌석 공정성 테스트).
 * 규칙서 본문의 좌표와 일치하는지 data.test.ts 가 검증한다.
 */
import type { MapDef, MapId, Position } from '../types/index.js';

interface MapSource {
  id: MapId;
  name: string;
  players: number;
  roundLimit: number;
  description: string;
  layout: string;
}

const SOURCES: MapSource[] = [
  {
    id: 'binary-star',
    name: '쌍성',
    players: 2,
    roundLimit: 20,
    description: '소행성 없는 열린 맵. 좌석별 조건(배치 가능 칸·광맥 거리·경계 여유)이 완전히 같다.',
    layout: `
. . . . . . . . . . .
. . . . . . . . . . .
. . . 0 . . . . . . .
. . . . . . . . . . .
. o . . . . . . . . .
. . . . . o . . . . .
. . . . . . . . . . .
. . . . . . . . . . .
. . . . . . . . 1 . .
. . . . . . . . . . .
. . . . . . o . . . .`,
  },
  {
    id: 'asteroid-belt',
    name: '소행성대',
    players: 2,
    roundLimit: 20,
    description: '중앙 장벽(육각 점대칭). 좌석별 조건이 완전히 같다.',
    layout: `
. . . . . . # . . . . . .
. . . . . . # . . . . . .
. . . . . . . # . . . . .
. o . . . . # . . . . o .
. . . . . . # . . . . . .
. . . . . . . . . . . . .
. 0 . . . . . . . . . 1 .
. . . . . . . . . . . . .
. . . . . . # . . . . . .
o . . . . # . . . . o . .
. . . . . # . . . . . . .
. . . . . # . . . . . . .
. . . . . . # . . . . . .`,
  },
  {
    id: 'triangle-nebula',
    name: '삼각 성운',
    players: 3,
    roundLimit: 18,
    description: '소행성 없는 3인 맵. 120° 회전 완전 대칭(육각에서는 정사각과 달리 3인도 완전 대칭이 된다).',
    layout: `
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. o . . 0 . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . . . . o o . . 1 . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. o . . 2 . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .`,
  },
  {
    id: 'interstellar-route',
    name: '성간 항로',
    players: 3,
    roundLimit: 18,
    description: '중앙에서 세 갈래로 뻗은 소행성 살, 120° 회전 완전 대칭.',
    layout: `
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . 0 . . . . . . . . .
. . o . . . . . . . . . . . .
. . . . . . # . . . . . . . .
. . . . . . # . . . . . . . .
. . . . . . . # . . . . . . .
. . . . . . . . # # # . 1 . .
. . . . . . . # . . o . . . .
. . . . . . # . . . . . . . .
. . . . . . # . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . 2 . . . . . . . . .
. . o . . . . . . . . . . . .
. . . . . . . . . . . . . . .`,
  },
  {
    id: 'quadrant',
    name: '사분면',
    players: 4,
    roundLimit: 16,
    description: '중앙 육각 고리 소행성 + 중심 광맥. 육각은 90° 완전 대칭이 없어 좌표를 계산해 4좌석 거리 프로필을 동일하게 맞췄다.',
    layout: `
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . o . . . . . o .
. . . . 0 . . . . . 1 . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . # # . . . . . .
. . . . . . # o # . . . . . .
. . . . . . . # # . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . o . . . . . o .
. . . . 2 . . . . . 3 . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .`,
  },
  {
    id: 'event-horizon',
    name: '사건의 지평선',
    players: 4,
    roundLimit: 16,
    description: '중앙 소행성 덩어리(반경 1 육각). 육각은 90° 완전 대칭이 없어 좌표를 계산해 4좌석 거리 프로필을 동일하게 맞췄다.',
    layout: `
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . 0 . . . . . . 1 . . .
. o . . . . . . o . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . # # . . . . . .
. . . . . . # # # . . . . . .
. . . . . . . # # . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . 2 . . . . . . 3 . . .
. o . . . . . . o . . . . . .
. . . . . . . . . . . . . . .`,
  },
];

function parseLayout(src: MapSource): MapDef {
  const rows = src.layout
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/));
  const size = rows.length;
  const cores: Position[] = [];
  const asteroids: Position[] = [];
  const veins: Position[] = [];
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`맵 ${src.id}: ${y}행 길이 ${row.length} !== ${size}`);
    row.forEach((ch, x) => {
      if (ch === '#') asteroids.push({ x, y });
      else if (ch === 'o') veins.push({ x, y });
      else if (/^[0-9]$/.test(ch)) cores[Number(ch)] = { x, y };
      else if (ch !== '.') throw new Error(`맵 ${src.id}: 알 수 없는 기호 '${ch}' at (${x},${y})`);
    });
  });
  if (cores.length !== src.players || cores.some((c) => !c)) {
    throw new Error(`맵 ${src.id}: 코어 수 ${cores.length} !== 인원 ${src.players}`);
  }
  return {
    id: src.id,
    name: src.name,
    players: src.players,
    size,
    roundLimit: src.roundLimit,
    corePositions: cores,
    asteroids,
    veins,
    description: src.description,
  };
}

export const MAPS: MapDef[] = SOURCES.map(parseLayout);

const MAP_BY_ID: Record<MapId, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));

export function getMap(id: MapId): MapDef {
  const map = MAP_BY_ID[id];
  if (!map) throw new Error(`알 수 없는 맵: ${id}`);
  return map;
}

export function hasMap(id: MapId): boolean {
  return id in MAP_BY_ID;
}

export function mapsForPlayers(players: number): MapDef[] {
  return MAPS.filter((m) => m.players === players);
}

/** 2인 기본 맵 (테스트·핫시트 기본값) */
export const DEFAULT_MAP_ID: MapId = 'binary-star';
