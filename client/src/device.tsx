import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

// 화면 모드: PC용(3열 레이아웃) / 모바일용(한 열 + 아래 탭 막대). 처음 접속하면 고르게 하고(DeviceChooser),
// 고른 값은 localStorage(eleven.device)에 보관한다. 로비의 DeviceSwitch 와 게임 헤더의 DeviceToggle 로 언제든 바꿀 수 있다.
// 모바일용이면 <html> 에 `mobile-ui` 클래스를 붙인다 — 모달은 document.body 로 포털되므로 .game 이 아니라 html 기준으로 스타일을 건다.

export type DeviceMode = 'pc' | 'mobile';

const PREF_KEY = 'eleven.device';

export function loadDevice(): DeviceMode | null {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw === 'pc' || raw === 'mobile' ? raw : null;
  } catch {
    return null;
  }
}

function saveDevice(mode: DeviceMode): void {
  try {
    localStorage.setItem(PREF_KEY, mode);
  } catch {
    // 저장이 막힌 환경(사생활 보호 모드 등)에서는 이번 접속 동안만 유지
  }
}

// 선택 화면의 "추천" 표시: 좁은 화면이거나, 터치가 주 입력이면서 태블릿 폭 이하면 모바일용
export function recommendDevice(width: number, coarsePointer: boolean): DeviceMode {
  if (width <= 820) return 'mobile';
  if (coarsePointer && width <= 1024) return 'mobile';
  return 'pc';
}

function detectRecommended(): DeviceMode {
  if (typeof window === 'undefined') return 'pc';
  return recommendDevice(window.innerWidth, window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

interface DeviceStore {
  mode: DeviceMode | null; // null = 아직 고르지 않음 → 선택 화면
  mobile: boolean;
  choose: (mode: DeviceMode) => void;
}

const DeviceContext = createContext<DeviceStore | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DeviceMode | null>(loadDevice);

  useEffect(() => {
    document.documentElement.classList.toggle('mobile-ui', mode === 'mobile');
  }, [mode]);

  const choose = useCallback((next: DeviceMode) => {
    saveDevice(next);
    setMode(next);
  }, []);

  const value = useMemo<DeviceStore>(() => ({ mode, mobile: mode === 'mobile', choose }), [mode, choose]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice(): DeviceStore {
  const s = useContext(DeviceContext);
  if (!s) throw new Error('DeviceProvider missing');
  return s;
}

function MonitorArt() {
  return (
    <svg viewBox="0 0 96 64" width={96} height={64} aria-hidden="true">
      <rect x="6" y="4" width="84" height="46" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="12" y="10" width="16" height="34" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="32" y="10" width="34" height="34" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="70" y="10" width="14" height="34" rx="2" fill="currentColor" opacity="0.35" />
      <path d="M36 60h24M48 50v10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function PhoneArt() {
  return (
    <svg viewBox="0 0 96 64" width={96} height={64} aria-hidden="true">
      <rect x="31" y="2" width="34" height="60" rx="5" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="36" y="8" width="24" height="8" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="36" y="19" width="24" height="26" rx="2" fill="currentColor" opacity="0.6" />
      <path d="M37 53h4M46 53h4M55 53h4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const OPTIONS: { mode: DeviceMode; title: string; desc: string; points: string[]; art: () => ReactNode }[] = [
  {
    mode: 'pc',
    title: 'PC용',
    desc: '넓은 화면에 맞춘 3열 구성',
    points: ['행동 목록 · 보드 · 기록을 한 화면에', '마우스를 올리면 설명 말풍선'],
    art: MonitorArt,
  },
  {
    mode: 'mobile',
    title: '모바일용',
    desc: '휴대폰 세로 화면에 맞춘 한 열 구성',
    points: ['아래 탭으로 진행 · 구단 · 시장 · 리그 · 기록 전환', '카드는 옆으로 밀어 보고, 아이콘은 눌러서 설명'],
    art: PhoneArt,
  },
];

// 첫 접속 화면: PC용 / 모바일용 선택. 누르면 바로 적용되고 저장된다
export function DeviceChooser() {
  const { choose } = useDevice();
  const recommended = useMemo(detectRecommended, []);
  return (
    <main className="device-chooser">
      <h1>ELEVEN</h1>
      <p className="muted">어떤 화면으로 플레이할까요? 나중에 로비나 게임 화면 상단에서 언제든 바꿀 수 있습니다.</p>
      <div className="device-options">
        {OPTIONS.map((o) => (
          <button key={o.mode} className={`device-option${recommended === o.mode ? ' recommended' : ''}`} onClick={() => choose(o.mode)}>
            <span className="device-art"><o.art /></span>
            <span className="device-title">
              {o.title}
              {recommended === o.mode && <span className="tag done">이 기기에 추천</span>}
            </span>
            <span className="device-desc">{o.desc}</span>
            <span className="device-points">
              {o.points.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}

// 로비의 화면 모드 전환 (둘 중 하나)
export function DeviceSwitch() {
  const { mode, choose } = useDevice();
  return (
    <div className="device-switch" role="group" aria-label="화면 모드">
      <span className="muted small">화면</span>
      {OPTIONS.map((o) => (
        <button key={o.mode} className={`small${mode === o.mode ? ' active' : ''}`} aria-pressed={mode === o.mode} onClick={() => choose(o.mode)}>
          {o.title}
        </button>
      ))}
    </div>
  );
}

// 게임 헤더의 전환 버튼: 지금 모드의 반대쪽으로
export function DeviceToggle() {
  const { mobile, choose } = useDevice();
  const label = mobile ? 'PC용 화면으로 전환' : '모바일용 화면으로 전환';
  return (
    <button className="toggle device-toggle" title={label} aria-label={label} onClick={() => choose(mobile ? 'pc' : 'mobile')}>
      <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
        {/* 모니터 + 휴대폰을 겹친 그림 (알림 토글의 모니터 아이콘과 구분) */}
        <path d="M9 11H2.2a.9.9 0 0 1-.9-.9V3.4a.9.9 0 0 1 .9-.9h9.6a.9.9 0 0 1 .9.9V5M4.5 13.5H8M6.2 11v2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="10.2" y="6.6" width="4.6" height="7.6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span className="label">{mobile ? 'PC용' : '모바일용'}</span>
    </button>
  );
}
