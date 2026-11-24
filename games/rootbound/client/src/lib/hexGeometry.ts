/**
 * 육각 칸 화면 좌표 (pointy-top, 반지름 1). HexBoard·RootDiagram 이 함께 쓴다.
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
