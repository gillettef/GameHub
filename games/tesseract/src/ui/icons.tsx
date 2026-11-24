import type { ReactNode } from 'react'

/**
 * 선 아이콘 세트. 모래시계(⧗)와 같은 24 격자·둥근 선으로 그려 이모지 대신 쓴다.
 * 모티프는 캔버스 비주얼 시스템을 따른다: 정육면체 조각, 각진 SF 프레임, 육각 배지.
 */
export type IconName =
  'cube' | 'reroll' | 'orbit' | 'codex' | 'stats' | 'shards' | 'crown' | 'spark' | 'lock' | 'scale' | 'play' | 'pause' | 'prev' | 'next' | 'target'

const PATHS: Record<IconName, ReactNode> = {
  // 정육면체 조각 (등각)
  cube: <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  // 조각 + 도는 화살표
  reroll: (
    <>
      <path d="M10 6.5 15.5 9.5v6L10 18.5l-5.5-3v-6L10 6.5Zm-5.5 3 5.5 3 5.5-3M10 12.5v6" />
      <path d="M14.5 3.5a7 7 0 0 1 6 6.5m0 0 1.5-2m-1.5 2-2-1.2" />
    </>
  ),
  // 궤도와 두 점 (온라인)
  orbit: (
    <>
      <ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-20 12 12)" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="20.2" cy="8.6" r="1.4" fill="currentColor" />
      <circle cx="3.8" cy="15.4" r="1.4" fill="currentColor" />
    </>
  ),
  // 모서리를 자른 규칙서
  codex: <path d="M7 3h11v15H7a2 2 0 0 0-2 2V6l3-3Zm-2 17a2 2 0 0 0 2 2h11v-4M9 8h6M9 11.5h4" />,
  // 각진 프레임 안의 막대
  stats: <path d="M6 3h15v15l-3 3H3V6l3-3Zm2 14v-4m4 4V9m4 8v-6" />,
  // 부서져 흩어진 조각 (이야기)
  shards: <path d="m9 3 4 2.2v4.4L9 11.8 5 9.6V5.2L9 3Zm8 6 3.5 2v4L17 17l-3.5-2v-4L17 9ZM7.5 15 10 16.4v2.8L7.5 20.6 5 19.2v-2.8L7.5 15Z" />,
  // 각진 왕관
  crown: <path d="M4 18h16M4.5 15 3 7l5 3.5L12 4l4 6.5L21 7l-1.5 8h-15Z" />,
  // 네 갈래 빛 (도움말)
  spark: (
    <path d="M12 3c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7Zm7 11c.3 2 .9 2.7 3 3-2.1.3-2.7.9-3 3-.3-2.1-.9-2.7-3-3 2.1-.3 2.7-1 3-3Z" />
  ),
  lock: <path d="M6 11h12v9l-1.5 1.5h-9L6 20v-9Zm2.5 0V8a3.5 3.5 0 0 1 7 0v3M12 15v2.5" />,
  // 저울 (동점 판정)
  scale: <path d="M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a2.5 2.5 0 0 0 5 0L5 7Zm14 0-2.5 6a2.5 2.5 0 0 0 5 0L19 7Z" />,
  play: <path d="M7 4.5v15L19 12 7 4.5Z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  prev: <path d="M17 4.5v15L5 12l12-7.5Z" />,
  next: <path d="M7 4.5v15L19 12 7 4.5Z" />,
  // 표적 (아직 못 이룬 목표)
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
}

export function Icon({ name, size = 18, className = '', strokeWidth = 2 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  )
}

const RANK_COLORS = ['#F5C842', '#c9c4e6', '#f2a65a']

/** 순위 육각 배지 (카드 v2 점수 배지와 같은 모양). 메달 이모지 대신 */
export function RankBadge({ rank, size = 32 }: { rank: number; size?: number }) {
  const color = RANK_COLORS[rank - 1] ?? '#6d6890'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <path d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25L16 2.5Z" fill={`${color}26`} stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <text x="16" y="21" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="14" fill={color}>
        {rank}
      </text>
    </svg>
  )
}
