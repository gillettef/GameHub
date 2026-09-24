/**
 * 종족별 아이콘 (2026-09-23 사용자 지시: 종족마다 아이콘 추가). cardArt.tsx 와 같은 미니멀 라인
 * 아이콘 스타일 — 색은 항상 currentColor(부모가 정한다).
 */
import { memo, type ReactNode } from 'react';
import type { RaceId } from '@astraltab/shared';

/** 인류 연합: 방어 느낌의 방패. 크릴 군락: 여럿이 뭉친 벌집/군체. 오토마타 집정체: 기계 톱니.
 * 그림자 결사: 은신 느낌의 두건(눈 두 점). 노바 포병단: 사거리 느낌의 조준 십자선 */
const RACE_GLYPHS: Record<RaceId, ReactNode> = {
  coalition: <path d="M12 2.5 19.5 5.5v5.5c0 5.5-3.2 8.7-7.5 10.5-4.3-1.8-7.5-5-7.5-10.5V5.5Z" strokeLinejoin="round" />,
  swarm: (
    <>
      <path d="M12 2 20 6.5v9L12 20 4 15.5v-9Z" strokeLinejoin="round" />
      <path d="M12 2v18M4 6.5l8 4.5 8-4.5M4 15.5l8-4.5 8 4.5" strokeLinejoin="round" />
    </>
  ),
  automata: (
    <>
      <circle cx="12" cy="12" r="3.4" />
      <path
        d="M12 3v2.6M12 18.4V21M21 12h-2.6M5.6 12H3M18.1 5.9l-1.9 1.9M7.8 16.3l-1.9 1.9M18.1 18.1l-1.9-1.9M7.8 7.7 5.9 5.9"
        strokeLinecap="round"
      />
    </>
  ),
  shade: (
    <>
      <path d="M5 20v-7c0-4 3-8 7-8s7 4 7 8v7" strokeLinejoin="round" />
      <path d="M5 20h14" />
      <circle cx="9.6" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  siege: (
    <>
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <path d="M12 2v3.4M12 18.6V22M2 12h3.4M18.6 12H22" strokeLinecap="round" />
    </>
  ),
};

interface RaceArtProps {
  raceId: RaceId;
  className?: string;
}

/** 종족 id에 해당하는 아이콘 svg */
export const RaceArt = memo(function RaceArt({ raceId, className }: RaceArtProps) {
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
      {RACE_GLYPHS[raceId]}
    </svg>
  );
});
