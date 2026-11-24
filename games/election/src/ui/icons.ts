import { svg } from './dom';

/** 선 아이콘 (24×24, currentColor). 이모지 대신 쓰는 UI 아이콘 */
const STROKE: Record<string, string[]> = {
  play: ['M7 4l12 8-12 8z'],
  robot: ['M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M12 7V4', 'M9 13h.01', 'M15 13h.01'],
  globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
  home: ['M4 11l8-7 8 7', 'M6 9.5V20h12V9.5', 'M10 20v-5h4v5'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  sun: ['M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  auto: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 3v18'],
  share: ['M12 3v12', 'M7 8l5-5 5 5', 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'],
  chevron: ['M6 9l6 6 6-6'],
  board: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8'],
};

export type IconName = keyof typeof STROKE;

export function icon(name: IconName, size = 20): SVGSVGElement {
  const root = svg('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });
  for (const d of STROKE[name]) root.append(svg('path', { d }));
  if (name === 'auto') root.append(svg('path', { d: 'M12 3a9 9 0 0 1 0 18z', fill: 'currentColor', stroke: 'none' }));
  return root;
}

/** 기표 도장(卜) 로고 */
export function brandMark(cls = 'brand-mark'): SVGSVGElement {
  return svg('svg', { viewBox: '0 0 40 40', class: cls, 'aria-hidden': 'true' }, [
    svg('circle', { cx: 20, cy: 20, r: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 3.5 }),
    svg('path', {
      d: 'M20 9v22M20 19l9 4',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 4,
      'stroke-linecap': 'round',
    }),
  ]);
}

/** 메뉴 상단 엠블럼: 원형 유세 경로 + 6권역 토큰 + 기표 도장 */
export function heroEmblem(): SVGSVGElement {
  const root = svg('svg', { viewBox: '0 0 156 156', class: 'hero-emblem', 'aria-hidden': 'true' }, [
    svg('circle', {
      cx: 78,
      cy: 78,
      r: 60,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.5,
      'stroke-dasharray': '3 5',
    }),
  ]);
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    const x = 78 + 60 * Math.cos(a);
    const y = 78 + 60 * Math.sin(a);
    root.append(
      i % 2 === 0
        ? svg('circle', { cx: x, cy: y, r: 11, class: 'em-b' })
        : svg('rect', { x: x - 10, y: y - 10, width: 20, height: 20, rx: 3, class: 'em-r' }),
    );
  }
  root.append(
    svg('circle', { cx: 78, cy: 78, r: 34, fill: 'none', 'stroke-width': 5, class: 'em-stamp' }),
    svg('path', { d: 'M78 56V100M78 76L94 84', fill: 'none', 'stroke-width': 6, 'stroke-linecap': 'round', class: 'em-stamp' }),
  );
  return root;
}

/** 유세 버스 (옆모습) */
export function busGlyph(): SVGSVGElement {
  return svg('svg', { viewBox: '0 0 36 26', 'aria-hidden': 'true' }, [
    svg('rect', { x: 2, y: 3, width: 32, height: 16, rx: 4, fill: 'currentColor' }),
    svg('rect', { x: 5, y: 6, width: 6, height: 5, rx: 1, fill: 'var(--hl)' }),
    svg('rect', { x: 13, y: 6, width: 6, height: 5, rx: 1, fill: 'var(--hl)' }),
    svg('rect', { x: 21, y: 6, width: 9, height: 5, rx: 1, fill: 'var(--hl)' }),
    svg('circle', { cx: 10, cy: 21, r: 3.2, fill: 'currentColor', stroke: 'var(--hl)', 'stroke-width': 1.6 }),
    svg('circle', { cx: 26, cy: 21, r: 3.2, fill: 'currentColor', stroke: 'var(--hl)', 'stroke-width': 1.6 }),
  ]);
}
