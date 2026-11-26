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
 * 경로는 페이지 기준 상대경로(허브 /rootbound/ 아래에서도, 루트 직접 접속에서도 맞다).
 */
export const ART_BASE = './art/';

/** 지형 칸 그림의 `<defs>` id (BoardTextures) */
export const terrainArtId = {
  empty: 'rb-terrain-empty',
  fertile: 'rb-terrain-fertile',
  pond: 'rb-terrain-pond',
  rock: 'rb-terrain-rock',
} as const;

/** 아지트·고양이 그림은 자리 0~2 만 있다. 자리 3(삼색냥)은 자리 0 그림 위에 자리 색 테를 둘러 구분한다 */
export const ART_SEATS = 3;
export const hideoutArtId = (seat: number) => `rb-hideout-${seat < ART_SEATS ? seat : 0}`;
export const catArtId = (seat: number) => `rb-cat-${seat < ART_SEATS ? seat : 0}`;

/** 명당 타일 그림 (종 id 그대로, 회전 0 기준) */
export const spotArtUrl = (species: string) => `${ART_BASE}spot-${species}.svg`;
