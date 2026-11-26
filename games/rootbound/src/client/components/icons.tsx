import type { ReactNode } from 'react';

/**
 * 게임 UI 공용 아이콘 (2026-10-01 사용자 지시: 모바일에 맞게 메뉴·버튼을 아이콘 위주로 표기).
 * TabDock 아이콘과 같은 규격(24 격자, 둥근 선, currentColor)이다.
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

/** 확인·준비 완료: 체크 */
export const CheckIcon = ({ size = 20, className }: IconProps) => svg(size, className, <path d="m5 12.5 4.5 4.5L19 7.5" />);
/** 버리기: 건너뛰기(▶|) */
export const PassIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="M6 5.5 15 12l-9 6.5Z" /><path d="M19 5v14" /></>);
/** 가져오기: 순환 화살표 */
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
/** AI 자리 */
export const BotIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 8V4M9 13v1.5M15 13v1.5" /><circle cx="12" cy="3.5" r="1" fill="currentColor" stroke="none" /></>);
/** 명당 놓기: 고양이 발자국 */
export const PlaceIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <path d="M12 12.5c-3 0-5.5 2.6-5.5 5 0 1.7 1.4 2.5 3 2.5 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.6 0 3-.8 3-2.5 0-2.4-2.5-5-5.5-5Z" />
      <ellipse cx="5" cy="10" rx="1.9" ry="2.4" />
      <ellipse cx="9.2" cy="5.8" rx="1.9" ry="2.5" />
      <ellipse cx="14.8" cy="5.8" rx="1.9" ry="2.5" />
      <ellipse cx="19" cy="10" rx="1.9" ry="2.4" />
    </>,
    true,
  );
/** 영역 뺏기 */
export const SwordIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><path d="M5 19 16 8" /><path d="M14 4h6v6l-3-1-1-3Z" /><path d="M5 19l-1.5 1.5M8 16l-3 3" /></>);
/** 지금 차례·내 차례 */
export const BoltIcon = ({ size = 18, className }: IconProps) => svg(size, className, <path d="M13 2 4 14h6l-1 8 9-12h-6z" />, true);
/** 대기 */
export const HourglassIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <><path d="M7 3h10M7 21h10" /><path d="M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" /></>);
/** 기권 */
export const SkullIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <><path d="M5 12a7 7 0 1 1 14 0v3l-2 1v3H7v-3l-2-1Z" /><circle cx="9.5" cy="12" r="1.4" /><circle cx="14.5" cy="12" r="1.4" /></>);
/** 효과음 켬: 스피커 + 음파 */
export const SoundIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></>);
/** 효과음 끔: 스피커 + × */
export const MuteIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></>);
/** 알림: 종 */
export const BellIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>);
/** 턴 제한 시간: 스톱워치 */
export const TimerIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 2" /><path d="M9.5 2.5h5" /></>);
/** 튜토리얼: 학사모 */
export const LearnIcon = ({ size = 20, className }: IconProps) =>
  svg(size, className, <><path d="m2.5 9.5 9.5-5 9.5 5-9.5 5z" /><path d="M6.5 11.5v4.5c3 2.5 8 2.5 11 0v-4.5" /><path d="M21.5 9.5v5" /></>);
