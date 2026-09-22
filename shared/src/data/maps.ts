/**
 * 맵 6개 (Rules.md 11절). 레이아웃은 규칙서의 그림을 그대로 옮긴 것이고,
 * 좌표(코어·소행성·광맥)는 그림에서 파싱한다. 기호: `.` 빈 우주, `#` 소행성, `o` 광맥, 숫자 = 그 좌석의 코어.
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
    description: '소행성 없는 열린 맵. 180° 회전 대칭.',
    layout: `
. . . . . . . . . . .
. . . . . . . . . . .
. . 0 . . . . . o . .
. . . . . . . . . . .
. . . . . . . . . . .
. . . . . o . . . . .
. . . . . . . . . . .
. . . . . . . . . . .
. . o . . . . . 1 . .
. . . . . . . . . . .
. . . . . . . . . . .`,
  },
  {
    id: 'asteroid-belt',
    name: '소행성대',
    players: 2,
    roundLimit: 20,
    description: '가운데 세로 소행성대. 틈은 y=2, 6, 10. 좌우 대칭.',
    layout: `
. . . . . . # . . . . . .
. . . . . . # . . . . . .
. . . . o . . . o . . . .
. . . . . . # . . . . . .
. . . . . . # . . . . . .
. . . . . . # . . . . . .
. 0 . . . . . . . . . 1 .
. . . . . . # . . . . . .
. . . . . . # . . . . . .
. . . . . . # . . . . . .
. . . . o . . . o . . . .
. . . . . . # . . . . . .
. . . . . . # . . . . . .`,
  },
  {
    id: 'triangle-nebula',
    name: '삼각 성운',
    players: 3,
    roundLimit: 18,
    description: '소행성 없는 3인 맵. 동점 시 후공 우선으로 비대칭을 보정한다.',
    layout: `
. . . . . . . . . . . . .
. . . . . . 0 . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . o . . . . . o . . .
. . . . . . o . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. . . . . . . . . . . . .
. 1 . . . . o . . . . 2 .
. . . . . . . . . . . . .
. . . . . . . . . . . . .`,
  },
  {
    id: 'interstellar-route',
    name: '성간 항로',
    players: 3,
    roundLimit: 18,
    description: '중앙에서 세 갈래로 뻗은 소행성 살.',
    layout: `
. . . . . . . . . . . . . . .
. . . . . . . 0 . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . # . . . . . . .
. . . . . . . # . . . . . . .
. . . . . . . # . . . . . . .
. . . o . . . . . . . o . . .
. . . . . . . # . . . . . . .
. . . . . . # . # . . . . . .
. . . . . # . . . # . . . . .
. . . . # . . o . . # . . . .
. . . . . . . . . . . . . . .
. 1 . . . . . . . . . . . 2 .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .`,
  },
  {
    id: 'quadrant',
    name: '사분면',
    players: 4,
    roundLimit: 16,
    description: '중앙 십자 소행성, 중심은 광맥. 90° 회전 대칭.',
    layout: `
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . 0 . . . . o . . . . 1 . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . # . . . . . . .
. . . . . . . # . . . . . . .
. . o . . # # o # # . . o . .
. . . . . . . # . . . . . . .
. . . . . . . # . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . 3 . . . . o . . . . 2 . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .`,
  },
  {
    id: 'event-horizon',
    name: '사건의 지평선',
    players: 4,
    roundLimit: 16,
    description: '중앙 3×3 소행성. 90° 회전 대칭.',
    layout: `
. . . . . . . . . . . . . . .
. . . . . . . 0 . . . . . . .
. . . . . . . . . . . . . . .
. . . o . . . . . . . o . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . . . . # # # . . . . . .
. 3 . . . . # # # . . . . 1 .
. . . . . . # # # . . . . . .
. . . . . . . . . . . . . . .
. . . . . . . . . . . . . . .
. . . o . . . . . . . o . . .
. . . . . . . . . . . . . . .
. . . . . . . 2 . . . . . . .
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
