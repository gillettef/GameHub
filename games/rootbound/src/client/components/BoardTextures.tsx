import { memo } from 'react';
import styles from './HexBoard.module.css';

/**
 * 보드 지형 질감 (2026-10-08 사용자 시안 `notes/design/board-2p.svg` 을 따른다).
 * 시안은 칸 반지름 68px 기준이라, 좌표 단위(반지름 1)로 옮겨 같은 비율의 무늬를 만든다.
 * 무늬는 고정 시드 난수로 한 번만 만들어 매 렌더 같다. 색은 HexBoard.module.css 의 클래스 → tokens.css 변수.
 */

/** 시안 1px = 보드 1/68 단위 */
const U = 1 / 68;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(3);

const GRASS_SIZE = 80 * U;
const LOAM_SIZE = 60 * U;
const GRAVEL_SIZE = 60 * U;

/** 풀잎: 짧은 사선 40개, 색 4단. 화면 칸 반지름(22~35px)이 시안(68px)보다 작아 시안보다 성기고 굵게 그린다 */
const GRASS = (() => {
  const rnd = mulberry32(17);
  return Array.from({ length: 40 }, (_, i) => {
    const x = rnd() * GRASS_SIZE;
    const y = rnd() * GRASS_SIZE;
    const len = (8 + rnd() * 8) * U;
    const lean = (rnd() - 0.5) * 12 * U;
    return { d: `M${f(x)},${f(y)}l${f(lean)},${f(-len)}`, tone: i % 4 };
  });
})();

/** 흙 알갱이 */
const LOAM = (() => {
  const rnd = mulberry32(29);
  return Array.from({ length: 40 }, (_, i) => ({ cx: rnd() * LOAM_SIZE, cy: rnd() * LOAM_SIZE, r: (1.2 + rnd() * 1.8) * U, tone: i % 4 }));
})();

/** 자갈 */
const GRAVEL = (() => {
  const rnd = mulberry32(41);
  return Array.from({ length: 30 }, (_, i) => {
    const rx = (2 + rnd() * 3) * U;
    return { cx: rnd() * GRAVEL_SIZE, cy: rnd() * GRAVEL_SIZE, rx, ry: rx * 0.7, tone: i % 4 };
  });
})();

const TONES = [styles.tone1, styles.tone2, styles.tone3, styles.tone4];

/** SVG `<defs>`: 지형 무늬 3종 + 연못·돌 그라데이션 + 식물 썸네일 원형 자르기 */
export const BoardTextures = memo(function BoardTextures() {
  return (
    <defs>
      <pattern id="rb-grass" width={f(GRASS_SIZE)} height={f(GRASS_SIZE)} patternUnits="userSpaceOnUse" className={styles.grassPattern}>
        <rect width={f(GRASS_SIZE)} height={f(GRASS_SIZE)} className={styles.grassBase} />
        {GRASS.map((g, i) => (
          <path key={i} d={g.d} className={TONES[g.tone]} strokeWidth={f(2.6 * U)} strokeLinecap="round" />
        ))}
      </pattern>
      <pattern id="rb-loam" width={f(LOAM_SIZE)} height={f(LOAM_SIZE)} patternUnits="userSpaceOnUse" className={styles.loamPattern}>
        <rect width={f(LOAM_SIZE)} height={f(LOAM_SIZE)} className={styles.loamBase} />
        {LOAM.map((c, i) => (
          <circle key={i} cx={f(c.cx)} cy={f(c.cy)} r={f(c.r)} className={TONES[c.tone]} opacity={0.85} />
        ))}
      </pattern>
      <pattern id="rb-gravel" width={f(GRAVEL_SIZE)} height={f(GRAVEL_SIZE)} patternUnits="userSpaceOnUse" className={styles.gravelPattern}>
        <rect width={f(GRAVEL_SIZE)} height={f(GRAVEL_SIZE)} className={styles.gravelBase} />
        {GRAVEL.map((e, i) => (
          <ellipse key={i} cx={f(e.cx)} cy={f(e.cy)} rx={f(e.rx)} ry={f(e.ry)} className={TONES[e.tone]} />
        ))}
      </pattern>
      <radialGradient id="rb-water" cx=".4" cy=".35" r=".75">
        <stop offset="0" className={styles.waterHi} />
        <stop offset=".6" className={styles.waterMid} />
        <stop offset="1" className={styles.waterLow} />
      </radialGradient>
      <radialGradient id="rb-stone" cx=".35" cy=".3" r=".8">
        <stop offset="0" className={styles.stoneHi} />
        <stop offset=".6" className={styles.stoneMid} />
        <stop offset="1" className={styles.stoneLow} />
      </radialGradient>
      <clipPath id="rb-thumb" clipPathUnits="objectBoundingBox">
        <circle cx=".5" cy=".5" r=".5" />
      </clipPath>
    </defs>
  );
});
