/**
 * 육각 칸 화면 좌표 (pointy-top, 반지름 1)와 보드 그림 경로. HexBoard·BoardTextures·RootDiagram 이 함께 쓴다.
 * 축 좌표와 방향은 shared 엔진(Rules.md 2절)을 따른다.
 */
export const SQRT3 = Math.sqrt(3);

/** 축 좌표 → 픽셀 (pointy-top, 반지름 1) */
export const px = (q: number, r: number) => ({ x: SQRT3 * (q + r / 2), y: 1.5 * r });

/** 꼭짓점 i(0~5)의 "x,y" (반지름 scale, 중심 ox, oy) */
export const corner = (i: number, scale: number, ox = 0, oy = 0) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return `${(ox + Math.cos(a) * scale).toFixed(3)},${(oy + Math.sin(a) * scale).toFixed(3)}`;
};

/** 육각형 polygon points (반지름 scale, 중심 ox, oy) */
export const hexPoints = (scale: number, ox = 0, oy = 0) => [0, 1, 2, 3, 4, 5].map((i) => corner(i, scale, ox, oy)).join(' ');

/*
 * 보드 그림 (2026-11-26 「냥냥 골목」, public/art/). 모두 꼭짓점이 위인 육각(또는 둥근 토큰)이고 반지름 1 정사각형(−1..1)에 그린다.
 * 경로는 페이지 기준 상대경로(허브 /nyangalley/ 아래에서도, 루트 직접 접속에서도 맞다).
 */
export const ART_BASE = './art/';

/** 지형 칸 그림의 `<defs>` id (BoardTextures) */
export const terrainArtId = {
  empty: 'rb-terrain-empty',
  fertile: 'rb-terrain-fertile',
  pond: 'rb-terrain-pond',
  rock: 'rb-terrain-rock',
} as const;

/** 아지트·고양이 그림 id. 무리마다 그림이 따로 있다(`hideout-N`·`cat-N`, N = 0~CREW_COUNT−1). 인자는 자리가 아니라 무리 번호 */
export const hideoutArtId = (crew: number) => `rb-hideout-${crew}`;
export const catArtId = (crew: number) => `rb-cat-${crew}`;
/** 무리 고양이 토큰 그림 주소 */
export const catArtUrl = (crew: number) => `${ART_BASE}cat-${crew}.svg`;

/** 명당 타일 그림 (종 id 그대로, 회전 0 기준) */
export const spotArtUrl = (species: string) => `${ART_BASE}spot-${species}.svg`;
