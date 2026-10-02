/**
 * 맵 6개 (Rules.md 11절). 레이아웃은 규칙서의 그림을 그대로 옮긴 것이고,
 * 좌표(코어·소행성·광맥·그 외 지형)는 그림에서 파싱한다. 기호: `.` 빈 우주, `#` 소행성, `o` 광맥, 숫자 = 그 좌석의 코어,
 * `n` 성운(시야-1), `d` 파편지대(체력-1), `i` 이온 폭풍(지속 피해1), `r` 유물지대(점수+1),
 * `g` 중력 균열(점수-1), `w` 포대 발판(공격+1), `e` 교란지대(사거리-1) (2026-09-28 신설, Rules.md 3절).
 * 좌표는 odd-r 오프셋 육각 좌표다(`x`=열, `y`=행, 홀수 행이 반 칸 밀린 그림을 정사각 문자 격자로 그대로 적은 것).
 * 코어 배치는 좌석별 공정성(시야 반경1 배치 가능 칸 수, 최근접 광맥 거리, 반경3 안 광맥·소행성 수, 보드 경계 여유,
 * 코어 간 거리 프로필)이 전부 같도록 스크립트로 계산해 만들었다 (data.test.ts 의 좌석 공정성 테스트).
 * 규칙서 본문의 좌표와 일치하는지 data.test.ts 가 검증한다.
 *
 * 2026-09-23: 맵 6개를 전부 10x10 으로 재설계했다(사용자 지시). 좌표는
 * `shared/scripts/hexmap.ts` 로 계산했다: 2인 맵은 180° 점대칭((x,y)→(9-x,9-y))이
 * 육각 거리 아이소메트리임을 확인해 그대로 썼고, 3인 맵은 큐브 좌표 120° 회전으로
 * 완전 대칭 삼각형을 찾았다(육각은 3인도 완전 대칭이 가능하다). 4인 맵(quadrant·
 * event-horizon)은 육각이 90° 완전 대칭이 없어 좌표를 브루트포스로 계산해 좌석별
 * 지표를 맞췄다.
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
    description:
      '소행성 없는 열린 맵. 좌석별 조건(배치 가능 칸·광맥 거리·경계 여유)이 완전히 같다. 성운(2,4)/(8,5), 유물지대(1,5)/(9,4) 180도 점대칭 추가(2026-09-28).',
    layout: `
. . . . . . . . . .
. o . . . . . . . .
. . . 0 . . . . . .
. . . . . . o . . .
. . n . . . . . . r
. r . . . . . . n .
. . . . . . . . . .
. . . . . . . 1 . .
. . . . . . o . . .
. . . . . . . . . .`,
  },
  {
    id: 'asteroid-belt',
    name: '소행성대',
    players: 2,
    roundLimit: 20,
    description: '중앙 장벽(180° 점대칭). 좌석별 조건이 완전히 같다. 파편지대(1,1)/(8,8), 중력균열(8,2)/(1,7) 180도 점대칭 추가(2026-09-28).',
    layout: `
. . . . # . . . . .
. d . . # . . . . .
. o . . # . . . g .
. . . . # . . o . .
. 0 . . . . . . . .
. . . . . . . . 1 .
. . o . . # . . . .
. g . . . # . . o .
. . . . . # . . d .
. . . . . # . . . .`,
  },
  {
    id: 'triangle-nebula',
    name: '삼각 성운',
    players: 3,
    roundLimit: 18,
    description: '소행성 없는 3인 맵. 120° 회전 완전 대칭(육각에서는 정사각과 달리 3인도 완전 대칭이 된다). 이온폭풍(3,2)/(7,3)/(7,6) 120도 회전 대칭 추가(2026-09-28).',
    layout: `
. . . . . . . . . .
. . . . . . . 1 . .
. . . i . o . . . .
. 0 . . . . . i . .
. . . . . . . . . .
. . . o . . o . . .
. . . . . . . i . .
. . . . . . . . . .
. . . . . . 2 . . .
. . . . . . . . . .`,
  },
  {
    id: 'interstellar-route',
    name: '성간 항로',
    players: 3,
    roundLimit: 18,
    description: '중앙에서 세 갈래로 뻗은 소행성 살, 120° 회전 완전 대칭. 포대발판(1,4)/(7,0)/(9,4) 120도 회전 대칭 추가(2026-09-28).',
    layout: `
. . . . . . . w . .
. . . # . . . . . .
. . . . # o . 1 . .
. . 0 . # . . . . .
. w . . . . # # # w
. . . o # . o . . .
. . . . # . . . . .
. . . # . 2 . . . .
. . . . . . . . . .
. . . . . . . . . .`,
  },
  {
    id: 'quadrant',
    name: '사분면',
    players: 4,
    roundLimit: 16,
    description:
      '중앙 소행성 블록 + 네 모서리 광맥(마름모꼴 배치). 육각은 90° 완전 대칭이 없어 좌표를 계산해 4좌석 거리 프로필을 동일하게 맞췄다. 교란지대 4곳(각 코어에서 육각 거리 1, 바깥쪽) 추가(2026-09-28).',
    layout: `
. . o . e . . . . .
. . . . 0 . . . . o
. . . . . . . . . .
. . . . . . . . . .
. . . . # # . . 1 e
e 3 . . # # . . . .
. . . . . . . . . .
. . . . . . . . . .
o . . . . 2 . . . .
. . . . . e . o . .`,
  },
  {
    id: 'event-horizon',
    name: '사건의 지평선',
    players: 4,
    roundLimit: 16,
    description:
      '중앙 소행성 덩어리(길쭉한 육각 블록). 육각은 90° 완전 대칭이 없어 좌표를 계산해 4좌석 거리 프로필을 동일하게 맞췄다. 성운 4곳(각 코어에서 육각 거리 1, 바깥쪽) 추가(2026-09-28) — 사건의 지평선답게 시야를 가린다.',
    layout: `
o . . . . . n . . .
. . . . . . 0 . . o
. . . . . . . . . .
. . . . # . . . . .
. . . . # # . . 1 n
n 3 . . # # . . . .
. . . . . # . . . .
. . . . . . . . . .
o . . 2 . . . . . .
. . . n . . . . . o`,
  },
];

/** 기호 → 배열 이름 (Rules.md 3절). `#`·`o`·숫자·`.`은 아래에서 따로 처리한다 */
const TERRAIN_SYMBOLS: Record<string, keyof Pick<MapDef, 'nebulas' | 'debrisFields' | 'ionStorms' | 'relicSites' | 'gravityRifts' | 'gunEmplacements' | 'jammingFields'>> = {
  n: 'nebulas',
  d: 'debrisFields',
  i: 'ionStorms',
  r: 'relicSites',
  g: 'gravityRifts',
  w: 'gunEmplacements',
  e: 'jammingFields',
};

function parseLayout(src: MapSource): MapDef {
  const rows = src.layout
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/));
  const size = rows.length;
  const cores: Position[] = [];
  const asteroids: Position[] = [];
  const veins: Position[] = [];
  const nebulas: Position[] = [];
  const debrisFields: Position[] = [];
  const ionStorms: Position[] = [];
  const relicSites: Position[] = [];
  const gravityRifts: Position[] = [];
  const gunEmplacements: Position[] = [];
  const jammingFields: Position[] = [];
  const byKey: Record<string, Position[]> = { nebulas, debrisFields, ionStorms, relicSites, gravityRifts, gunEmplacements, jammingFields };
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`맵 ${src.id}: ${y}행 길이 ${row.length} !== ${size}`);
    row.forEach((ch, x) => {
      const terrainKey = TERRAIN_SYMBOLS[ch];
      if (ch === '#') asteroids.push({ x, y });
      else if (ch === 'o') veins.push({ x, y });
      else if (terrainKey) byKey[terrainKey]!.push({ x, y });
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
    nebulas,
    debrisFields,
    ionStorms,
    relicSites,
    gravityRifts,
    gunEmplacements,
    jammingFields,
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

/** 정원이 players 이상인 맵. 온라인 로비 맵 단계는 좌석 수(사람+AI)와 정확히 같은 맵이 아니라
 * 이 이상을 전부 보여준다 — 좌석 수보다 큰 맵을 고르면 그만큼 AI/사람을 더 채워야 시작한다 */
export function mapsForAtLeast(players: number): MapDef[] {
  return MAPS.filter((m) => m.players >= players).sort((a, b) => a.players - b.players);
}

/** 2인 기본 맵 (테스트·핫시트 기본값) */
export const DEFAULT_MAP_ID: MapId = 'binary-star';
