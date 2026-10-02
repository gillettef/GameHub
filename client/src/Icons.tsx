import type { ReactNode } from "react";

// 귀여운 둥근 선 + 옅은 면 채우기 스타일의 인라인 SVG 아이콘 세트.
// 색은 currentColor를 따라가므로 Tailwind text-* 클래스로 바꾼다.
const F = { fill: "currentColor", fillOpacity: 0.18 } as const; // 옅게 채우는 면
const S = { fill: "currentColor" } as const; // 꽉 채우는 점

const PATHS = {
  // 능력치
  bulb: (
    <>
      <path {...F} d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
      <path d="M9.5 19h5M10.5 21.5h3" />
    </>
  ),
  bolt: <path {...F} d="M13 2.5 5.5 13.5h6L10.5 21.5l8-11.5h-6z" />,
  heart: <path {...F} d="M12 20.5S3.5 15 3.5 9.2A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8.5 1.9C20.5 15 12 20.5 12 20.5z" />,
  sparkle: (
    <>
      <path {...F} d="M11 3.5l1.9 5.6L18.5 11l-5.6 1.9L11 18.5l-1.9-5.6L3.5 11l5.6-1.9z" />
      <path d="M19 16.5v4M17 18.5h4" />
    </>
  ),
  cap: (
    <>
      <path {...F} d="M2 9.5 12 5l10 4.5-10 4.5z" />
      <path d="M6 11.7V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.3M22 9.5V15" />
    </>
  ),
  crown: (
    <>
      <path {...F} d="M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z" />
      <path d="M5.5 20.5h13" />
    </>
  ),
  // 토큰
  staminaToken: (
    <>
      <circle {...F} cx="12" cy="12" r="9" />
      <path d="M12.8 6.5 8.5 12.7h3L10.9 17.5l4.6-6.2h-3z" />
    </>
  ),
  intToken: (
    <>
      <circle {...F} cx="12" cy="12" r="9" />
      <path d="M12 6.8a3.4 3.4 0 0 0-1.9 6.2c.3.3.5.6.5 1h2.8c0-.4.2-.7.5-1A3.4 3.4 0 0 0 12 6.8z" />
      <path d="M10.7 16.6h2.6" />
    </>
  ),
  charmToken: (
    <>
      <circle {...F} cx="12" cy="12" r="9" />
      <path d="M12 16.6S7.6 13.8 7.6 10.8a2.3 2.3 0 0 1 4.4-1 2.3 2.3 0 0 1 4.4 1c0 3-4.4 5.8-4.4 5.8z" />
    </>
  ),
  manaToken: (
    <>
      <circle {...F} cx="12" cy="12" r="9" />
      <path d="M12 6.8l1.3 3.6 3.6 1.3-3.6 1.3L12 16.6l-1.3-3.6-3.6-1.3 3.6-1.3z" />
    </>
  ),
  // 탭·화면
  wand: (
    <>
      <path d="M4.5 19.5 14 10" />
      <path {...F} d="M17 3.5l.9 2.6 2.6.9-2.6.9L17 10.5l-.9-2.6-2.6-.9 2.6-.9z" />
    </>
  ),
  users: (
    <>
      <circle {...F} cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3.2 2.4-5.3 5.5-5.3s5.5 2.1 5.5 5.3" />
      <circle {...F} cx="17" cy="9" r="2.4" />
      <path d="M16.5 14.2c2.5 0 4.5 1.7 4.5 4.3" />
    </>
  ),
  user: (
    <>
      <circle {...F} cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  scroll: (
    <>
      <path {...F} d="M6 4h12v13a3 3 0 0 0 3 3H9a3 3 0 0 1-3-3z" />
      <path d="M6 4a2 2 0 0 0-2 2v2h2M9.5 8.5h5M9.5 12h5" />
    </>
  ),
  book: (
    <>
      <path {...F} d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" />
      <path d="M12 6.5v13" />
    </>
  ),
  school: (
    <>
      <path {...F} d="M4 20V9.5h16V20z" />
      <path d="M2.5 20h19M4 9.5 12 4l8 5.5M9.5 20v-4.5a2.5 2.5 0 0 1 5 0V20" />
    </>
  ),
  bell: (
    <>
      <path {...F} d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 21h4" />
    </>
  ),
  // 상태·행동
  menu: <path d="M5 7h14M5 12h14M5 17h14" />,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  warn: (
    <>
      <path {...F} d="M12 3.5 22 20H2z" />
      <path d="M12 10v4M12 17v.4" />
    </>
  ),
  dice: (
    <>
      <rect {...F} x="4" y="4" width="16" height="16" rx="4" />
      <circle {...S} cx="9" cy="9" r="1" />
      <circle {...S} cx="15" cy="15" r="1" />
      <circle {...S} cx="12" cy="12" r="1" />
    </>
  ),
  share: <path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />,
  robot: (
    <>
      <rect {...F} x="5" y="8" width="14" height="11" rx="3.5" />
      <path d="M12 8V5" />
      <circle {...S} cx="12" cy="4" r="1" />
      <circle {...S} cx="9.5" cy="13" r="1" />
      <circle {...S} cx="14.5" cy="13" r="1" />
      <path d="M9.5 16.3h5" />
    </>
  ),
  medal: (
    <>
      <path d="M8.5 3 12 9l3.5-6" />
      <circle {...F} cx="12" cy="14.5" r="5.5" />
    </>
  ),
  // 자율활동·카드
  trophy: (
    <>
      <path {...F} d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 5.5H4.5V7A3 3 0 0 0 8 10M16 5.5h3.5V7A3 3 0 0 1 16 10M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  paw: (
    <>
      <path {...F} d="M12 13c-3 0-5 2.5-5 4.5 0 1.7 1.5 2.5 3 2.5 1 0 1.5-.4 2-.4s1 .4 2 .4c1.5 0 3-.8 3-2.5 0-2-2-4.5-5-4.5z" />
      <circle {...S} cx="6" cy="10" r="1.5" />
      <circle {...S} cx="9.5" cy="6.5" r="1.5" />
      <circle {...S} cx="14.5" cy="6.5" r="1.5" />
      <circle {...S} cx="18" cy="10" r="1.5" />
    </>
  ),
  swords: <path d="M4 4l10 10M20 4 10 14M7 14l3 3M14 14l3 3M4 20l3.5-3.5M20 20l-3.5-3.5" />,
  door: (
    <>
      <path {...F} d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21z" />
      <path d="M3.5 21h17" />
      <circle {...S} cx="14.5" cy="12.5" r="1" />
    </>
  ),
  flask: (
    <>
      <path {...F} d="M10 3v6L4.7 18.7A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.3-2.3L14 9V3z" />
      <path d="M8.5 3h7M7.5 15h9" />
    </>
  ),
  grimoire: (
    <>
      <path {...F} d="M7 3.5h11a1 1 0 0 1 1 1V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2z" />
      <path d="M5 18a2 2 0 0 1 2-2h12M12.5 7.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  crystal: (
    <>
      <circle {...F} cx="12" cy="11" r="7" />
      <path d="M8 20.5h8M9.5 17.5l-.5 3M14.5 17.5l.5 3M9 9.5a3.5 3.5 0 0 1 2-1.8" />
    </>
  ),
  cloud: <path {...F} d="M7 18a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 11a3.5 3.5 0 0 1 0 7z" />,
  sprout: (
    <>
      <path d="M12 21v-9" />
      <path {...F} d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 16c0-3-2-5-6-5 0 3 2 5 6 5z" />
    </>
  ),
  wave: <path d="M2.5 10c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 6 0M2.5 16c2-2.2 4-2.2 6 0s4 2.2 6 0 4-2.2 6 0" />,
  note: (
    <>
      <path {...F} d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4M9 12h7M9 16h7" />
    </>
  ),
  eye: (
    <>
      <path {...F} d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle {...S} cx="12" cy="12" r="2.3" />
    </>
  ),
  bag: (
    <>
      <path {...F} d="M6 8h12l1.5 12h-15z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  // 규칙 화면
  target: (
    <>
      <circle {...F} cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle {...S} cx="12" cy="12" r="1" />
    </>
  ),
  chart: (
    <>
      <rect {...F} x="3.5" y="12" width="4" height="8" rx="1" />
      <rect {...F} x="10" y="5" width="4" height="15" rx="1" />
      <rect {...F} x="16.5" y="9" width="4" height="11" rx="1" />
    </>
  ),
  calendar: (
    <>
      <rect {...F} x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  compass: (
    <>
      <circle {...F} cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

// 문장 속에 끼워 넣는 작은 아이콘
export function InlineIcon({ name }: { name: IconName }) {
  return <Icon name={name} className="h-[1.05em] w-[1.05em] align-[-0.15em]" />;
}
