import type { ReactNode } from 'react';

/**
 * 게임 UI 공용 아이콘 (2026-10-01 사용자 지시: 모바일에 맞게 메뉴·버튼을 아이콘 위주로 표기).
 * TabDock·CardFace 아이콘과 같은 규격(24 격자, 둥근 선, currentColor)이다.
 * 아이콘만 있는 버튼은 반드시 aria-label 과 title 을 함께 단다.
 */
interface IconProps {
  size?: number;
  className?: string;
}

function svg(size: number, className: string | undefined, children: ReactNode, filled = false) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** 턴 종료(배치 후): 체크 */
export const CheckIcon = ({ size = 20, className }: IconProps) => svg(size, className, <path d="m5 12.5 4.5 4.5L19 7.5" />);
/** 패스: 건너뛰기(▶|) */
export const PassIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="M6 5.5 15 12l-9 6.5Z" /><path d="M19 5v14" /></>);
/** 손패 교체: 순환 화살표 */
export const SwapIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="M4 10a8 8 0 0 1 14-4l2 2" /><path d="M20 4v4h-4" /><path d="M20 14a8 8 0 0 1-14 4l-2-2" /><path d="M4 20v-4h4" /></>);
/** 더보기 메뉴 */
export const MoreIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></>, true);
/** 나가기: 문과 화살표 */
export const ExitIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M16 8l4 4-4 4" /><path d="M20 12H9" /></>);
/** 기권: 백기 */
export const SurrenderIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="M6 21V4" /><path d="M6 5h11l-2.5 3.5L17 12H6" /></>);
/** 규칙 보기 */
export const HelpIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><circle cx="12" cy="12" r="9" /><path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2 1-1.2 1.9" /><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" /></>);
export const CloseIcon = ({ size = 20, className }: IconProps) => svg(size, className, <path d="M6 6l12 12M18 6 6 18" />);
/** 낼 수 없는 카드 */
export const LockIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
/** AI 좌석 */
export const BotIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 8V4M9 13v1.5M15 13v1.5" /><circle cx="12" cy="3.5" r="1" fill="currentColor" stroke="none" /></>);
/** 배치 */
export const PlaceIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" /><path d="M12 9v6M9 12h6" /></>);
/** 공격·전투 */
export const SwordIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><path d="M5 19 16 8" /><path d="M14 4h6v6l-3-1-1-3Z" /><path d="M5 19l-1.5 1.5M8 16l-3 3" /></>);
/** 파괴 */
export const BoomIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M12 2 14 8l6-2-3 5 5 3-6 1 1 6-5-4-5 4 1-6-6-1 5-3-3-5 6 2Z" />);
/** 마법 */
export const SparkIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><path d="M12 3v5M12 16v5M3 12h5M16 12h5" /><path d="m6.5 6.5 3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3" /></>);
/** 에너지 */
export const BoltIcon = ({ size = 18, className }: IconProps) => svg(size, className, <path d="M13 2 4 14h6l-1 8 9-12h-6z" />, true);
/** 대기 */
export const HourglassIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <><path d="M7 3h10M7 21h10" /><path d="M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" /></>);
/** 탈락 */
export const SkullIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <><path d="M5 12a7 7 0 1 1 14 0v3l-2 1v3H7v-3l-2-1Z" /><circle cx="9.5" cy="12" r="1.4" /><circle cx="14.5" cy="12" r="1.4" /></>);
/** 확대 */
export const ZoomIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5M11 8v6M8 11h6" /></>);
