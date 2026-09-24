/**
 * 카드별 이미지 (2026-09-23 사용자 지시: 카드마다 이미지를 만들어 보드 타일 마커에 보이게 한다).
 * 외부 이미지 생성 도구 없이, 기존 아이콘(ICONS, TabDock)과 같은 미니멀 라인 아이콘 스타일로
 * 카드 하나하나에 모티프를 직접 그려 붙인다. 같은 "역할"(경제 건물·근접 유닛·피해 마법 등)을 쓰는
 * 세 종족의 카드는 같은 모티프를 공유하고, 마커의 좌석 색·모양(육각·사각·원·마름모)이 종족·소유자를
 * 구분해 준다 — 모티프는 "이 카드가 무엇인가"만 표현한다.
 */
import { memo, type ReactNode } from 'react';
import type { CardId } from '@astraltab/shared';

type GlyphId =
  | 'core-star'
  | 'drill'
  | 'antenna'
  | 'turret'
  | 'drone-scout'
  | 'blade'
  | 'cannon'
  | 'cruiser'
  | 'meteor'
  | 'crystal'
  | 'shield-cross'
  | 'refinery'
  | 'dish-wide'
  | 'fortress'
  | 'crown'
  | 'cloak'
  | 'wrench'
  | 'gravity-ring'
  | 'portal'
  | 'energy-bolt';

/** 각 모티프의 SVG 내용(24x24 viewBox 기준 path/도형). <CardArt> 가 svg 껍데기를 씌운다 */
const GLYPHS: Record<GlyphId, ReactNode> = {
  'core-star': <path fill="currentColor" d="M12 2 15 9.5 23 10.3 17 15.6 18.6 23 12 19.1 5.4 23 7 15.6 1 10.3 9 9.5Z" />,
  drill: <path fill="currentColor" d="M12 1.5 17.5 9 12 22.5 6.5 9Z" />,
  antenna: (
    <>
      <path d="M12 21V11" strokeLinecap="round" />
      <path d="M8.3 10.3a5.5 5.5 0 0 1 7.4 0" strokeLinecap="round" />
      <path d="M5 7a10 10 0 0 1 14 0" strokeLinecap="round" />
      <circle cx="12" cy="11" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  turret: (
    <>
      <path d="M5 21v-6a7 7 0 0 1 14 0v6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21h16" strokeLinecap="round" />
      <path d="M12 8V3" strokeLinecap="round" strokeWidth="2.6" />
    </>
  ),
  'drone-scout': (
    <>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 8.7v1.4M12 13.9v1.4M8.7 12h1.4M13.9 12h1.4" strokeLinecap="round" />
    </>
  ),
  blade: <path d="M4 20 15 9M13 4l7 7-3 3-7-7 3-3ZM4 20l2-6 4 4-6 2Z" strokeLinejoin="round" strokeLinecap="round" />,
  cannon: (
    <>
      <path d="M3 21 13.5 10.5" strokeLinecap="round" strokeWidth="2.6" />
      <path d="M11.5 8.3 15.7 12.5" strokeLinecap="round" strokeWidth="2.6" />
      <path d="M14.5 5.5 18.5 9.5 21 7 17 3Z" fill="currentColor" stroke="none" />
    </>
  ),
  cruiser: (
    <>
      <path d="M3 15h18l-3.5 5.5H6.5Z" fill="currentColor" stroke="none" />
      <rect x="10" y="6" width="4" height="9" rx="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  meteor: (
    <>
      <circle cx="12.5" cy="13.5" r="6" fill="currentColor" stroke="none" />
      <path d="M12 2 8.5 8.5M17 3.5 14 8.5" strokeLinecap="round" />
    </>
  ),
  crystal: (
    <>
      <path d="M12 2 20 9 12 22 4 9Z" fill="currentColor" stroke="none" />
      <path d="M4 9h16M12 2v20" stroke="var(--color-navy)" opacity="0.35" />
    </>
  ),
  'shield-cross': (
    <>
      <path d="M12 2.5 19.5 5.5v5.5c0 5.5-3.2 8.7-7.5 10.5-4.3-1.8-7.5-5-7.5-10.5V5.5Z" strokeLinejoin="round" />
      <path d="M12 9v6M9 12h6" strokeLinecap="round" />
    </>
  ),
  refinery: (
    <>
      <rect x="3.5" y="13" width="3" height="8" fill="currentColor" stroke="none" />
      <rect x="8.5" y="8.5" width="3" height="12.5" fill="currentColor" stroke="none" />
      <rect x="13.5" y="15" width="3" height="6" fill="currentColor" stroke="none" />
      <rect x="18.5" y="5.5" width="2.4" height="15.5" fill="currentColor" stroke="none" />
    </>
  ),
  'dish-wide': (
    <>
      <path d="M3 15a9 9 0 0 1 18 0" strokeLinecap="round" />
      <path d="M12 15v6.5" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  fortress: <path d="M4 21V10h3V7h2v3h2V7h2v3h2V7h2v3h3v11Z" fill="currentColor" stroke="none" />,
  crown: <path d="M3.5 18 2 7.5l5 4 5-6.5 5 6.5 5-4-1.5 10.5Z" strokeLinejoin="round" />,
  cloak: (
    <>
      <path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12Z" strokeLinejoin="round" />
      <path d="M3 3l18 18" strokeLinecap="round" />
    </>
  ),
  wrench: (
    <path
      d="M15.5 4.5a4.5 4.5 0 0 0-6 5.7L4 15.7 8.3 20l5.5-5.5a4.5 4.5 0 0 0 5.7-6l-3 3-2.3-2.3Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  'gravity-ring': (
    <>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="6.2" />
      <circle cx="12" cy="12" r="9.6" opacity="0.5" />
    </>
  ),
  portal: (
    <>
      <ellipse cx="12" cy="12" rx="6" ry="9.5" />
      <ellipse cx="12" cy="12" rx="2.6" ry="9.5" opacity="0.6" />
    </>
  ),
  'energy-bolt': (
    <>
      <circle cx="12" cy="12" r="9.5" opacity="0.4" />
      <path d="M13 3.5 5 15h5l-1 6.5 8.5-12.5H13Z" fill="currentColor" stroke="none" />
    </>
  ),
};

/** 카드 id → 모티프. 세 종족의 "같은 역할" 카드(예: 경제 건물 1티어)는 같은 모티프를 쓴다.
 * cardArt.test.ts 가 shared/src/data 의 모든 카드 id 가 여기 빠짐없이 있는지 검사한다 */
export const CARD_GLYPH: Record<CardId, GlyphId> = {
  core: 'core-star',

  // 인류 연합 기본
  extractor: 'drill',
  outpost: 'antenna',
  turret: 'turret',
  scout: 'drone-scout',
  fighter: 'blade',
  artillery: 'cannon',
  cruiser: 'cruiser',
  meteor: 'meteor',
  shield: 'shield-cross',
  'energy-cell': 'crystal',
  // 인류 연합 특수
  refinery: 'refinery',
  observatory: 'dish-wide',
  fortress: 'fortress',
  battleship: 'crown',
  stealth: 'cloak',
  'repair-drone': 'wrench',
  'gravity-wave': 'gravity-ring',
  'warp-gate': 'portal',
  'energy-storm': 'energy-bolt',

  // 크릴 군락 기본
  'larva-nest': 'drill',
  'bio-spire': 'antenna',
  'spike-turret': 'turret',
  drone: 'drone-scout',
  stalker: 'blade',
  spitter: 'cannon',
  'brood-queen': 'cruiser',
  'acid-spray': 'meteor',
  frenzy: 'shield-cross',
  'swarm-call': 'crystal',
  // 크릴 군락 특수
  'chitin-refinery': 'refinery',
  'spore-tower': 'dish-wide',
  'hive-fortress': 'fortress',
  'alpha-brood': 'crown',
  burrower: 'cloak',
  'nurse-drone': 'wrench',
  'plague-burst': 'gravity-ring',
  'pheromone-beacon': 'portal',
  overgrowth: 'energy-bolt',

  // 오토마타 집정체 기본
  'fab-node': 'drill',
  'sentry-pylon': 'antenna',
  bastion: 'turret',
  probe: 'drone-scout',
  sentinel: 'blade',
  'railgun-frame': 'cannon',
  'dreadnought-core': 'cruiser',
  'overload-pulse': 'meteor',
  'nanite-repair': 'shield-cross',
  'power-surge': 'crystal',
  // 오토마타 집정체 특수
  'singularity-forge': 'refinery',
  'deep-scanner': 'dish-wide',
  citadel: 'fortress',
  titan: 'crown',
  'cloak-unit': 'cloak',
  'repair-node': 'wrench',
  'graviton-lance': 'gravity-ring',
  'stasis-field': 'portal',
  'core-surge': 'energy-bolt',

  // 그림자 결사 기본
  'null-collector': 'drill',
  'dead-relay': 'antenna',
  'ambush-node': 'turret',
  wisp: 'drone-scout',
  'shade-blade': 'blade',
  'phase-striker': 'cannon',
  wraith: 'cruiser',
  'void-burst': 'meteor',
  'mirage-field': 'shield-cross',
  'dark-cell': 'crystal',
  // 그림자 결사 특수
  'black-market': 'refinery',
  'veiled-array': 'dish-wide',
  'shroud-bastion': 'fortress',
  nightmare: 'crown',
  'phantom-agent': 'cloak',
  'medic-wisp': 'wrench',
  'eclipse-wave': 'gravity-ring',
  'false-signal': 'portal',
  'entropy-surge': 'energy-bolt',

  // 노바 포병단 기본
  'strip-mine': 'drill',
  'relay-spire': 'antenna',
  'flak-tower': 'turret',
  spotter: 'drone-scout',
  gunner: 'blade',
  howitzer: 'cannon',
  dreadshell: 'cruiser',
  'orbital-strike': 'meteor',
  'repair-field': 'shield-cross',
  'charge-cell': 'crystal',
  // 노바 포병단 특수
  'heavy-foundry': 'refinery',
  'far-scope': 'dish-wide',
  'siege-bastion': 'fortress',
  'titan-cannon': 'crown',
  saboteur: 'cloak',
  'field-medic': 'wrench',
  'barrage-shell': 'gravity-ring',
  'designator-beacon': 'portal',
  'overcharge-round': 'energy-bolt',
};

interface CardArtProps {
  cardId: CardId;
  className?: string;
}

/** 카드 id에 해당하는 모티프 svg. 색은 항상 currentColor(부모가 정한다) */
export const CardArt = memo(function CardArt({ cardId, className }: CardArtProps) {
  const glyphId = CARD_GLYPH[cardId] ?? 'core-star';
  const glyph = GLYPHS[glyphId];
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph}
    </svg>
  );
});
