import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameView } from '@server/engine/view';
import { DAY_LABEL } from './labels';
import { useStore } from './store';

// 턴 알림: 내가 무언가 해야 하는 상태가 되면 탭 제목 깜빡임(가운데 배너는 없앴다 — 사용자 요청 2026-09) + (설정에 따라) 소리·바탕화면 알림.
// 설정은 localStorage(eleven.notify)에 보관한다. 소리는 오디오 파일 없이 WebAudio 로 짧은 두 음을 낸다.

const PREF_KEY = 'eleven.notify';
const BASE_TITLE = 'Eleven';
const FLASH_MS = 1200;

export interface NotifyPrefs {
  sound: boolean;
  desktop: boolean;
}

const DEFAULT_PREFS: NotifyPrefs = { sound: true, desktop: false };

function loadPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotifyPrefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: NotifyPrefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* 저장 불가 환경이면 이번 세션에만 적용 */
  }
}

// 내가 지금 해야 할 일. 없으면 null
export function myTask(view: GameView): string | null {
  const me = view.players[view.me];
  if (!me) return null;
  if (me.pending.length > 0) return me.pending[0]!.target === 'die' ? '카드 효과 주사위를 굴리세요' : '효과 대상을 고르세요';
  const phase = view.phase;
  switch (phase.kind) {
    case 'setup.draft':
      return phase.picked[view.me] ? null : `임원 드래프트 ${phase.round}/3 · 임원을 고르세요`;
    case 'setup.objective':
      return phase.chosen[view.me] ? null : '목표 카드를 고르세요';
    case 'monday.board':
      return phase.current === view.me && !phase.meetings[view.me]?.decided ? '이사회 주사위를 굴리세요' : null;
    case 'weekday':
      return phase.current === view.me ? `${DAY_LABEL[phase.day]} 행동 차례` : null;
    case 'friday.prepare':
      return phase.current === view.me && !phase.submitted[view.me] ? '라인업을 짜세요' : null;
    case 'friday.match':
      return phase.current === view.me && !phase.decided[view.me] ? '전술 효과 카드를 고르세요' : null;
    case 'friday.aftermath':
      return phase.current === view.me && !phase.matches[view.me]?.decided ? '경기 영향 주사위를 굴리세요' : null;
    default:
      return null;
  }
}

let audio: AudioContext | null = null;

function beep(): void {
  try {
    if (!audio) audio = new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const ctx = audio;
    const t0 = ctx.currentTime;
    for (const [freq, at] of [[660, 0], [880, 0.14]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.3);
    }
  } catch {
    /* 오디오를 못 쓰는 환경이면 조용히 넘어간다 */
  }
}

function vibrate(): void {
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {
    /* 진동을 못 쓰는 환경 */
  }
}

function desktopNotify(body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification('ELEVEN · 내 차례', { body, tag: 'eleven-turn' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* 알림을 못 띄우는 환경 */
  }
}

interface NotifyStore {
  prefs: NotifyPrefs;
  setPref: (key: keyof NotifyPrefs, value: boolean) => void;
  desktopSupported: boolean;
}

const NotifyContext = createContext<NotifyStore | null>(null);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { view, session } = useStore();
  const [prefs, setPrefs] = useState<NotifyPrefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const task = view && session && view.me === session.playerId ? myTask(view) : null;
  const needs = task !== null;
  const wasNeeded = useRef<boolean | null>(null);

  // 할 일이 "없음 → 있음"으로 바뀌는 순간에만 알린다 (첫 화면·새로고침 직후는 제외)
  useEffect(() => {
    const was = wasNeeded.current;
    wasNeeded.current = needs;
    if (was === null || was === needs || !needs || !task) return;
    if (view?.phase.kind.startsWith('setup')) return; // 준비 단계는 패널 자체가 안내라 소리를 내지 않는다
    if (prefsRef.current.sound) {
      beep();
      vibrate(); // 휴대폰은 무음 모드거나 소리가 막혀 있는 경우가 많다 (지원하는 기기만 — iOS Safari 는 무시)
    }
    if (prefsRef.current.desktop) desktopNotify(task);
  }, [needs, task]);

  // 탭 제목: 내 차례면 종 표시, 탭이 뒤에 있으면 깜빡임
  useEffect(() => {
    if (!needs) {
      document.title = BASE_TITLE;
      return;
    }
    let on = true;
    document.title = `🔔 내 차례 · ${BASE_TITLE}`;
    const t = setInterval(() => {
      on = !document.hidden || !on;
      document.title = on ? `🔔 내 차례 · ${BASE_TITLE}` : `내 차례입니다 · ${BASE_TITLE}`;
    }, FLASH_MS);
    return () => {
      clearInterval(t);
      document.title = BASE_TITLE;
    };
  }, [needs]);

  const setPref = useCallback((key: keyof NotifyPrefs, value: boolean) => {
    const apply = () =>
      setPrefs((p) => {
        const next = { ...p, [key]: value };
        savePrefs(next);
        return next;
      });
    if (key === 'desktop' && value) {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') apply();
      else void Notification.requestPermission().then((r) => r === 'granted' && apply());
      return;
    }
    apply();
    if (key === 'sound' && value) beep(); // 미리 듣기 겸 사용자 제스처 중에 오디오 활성화
  }, []);

  const value = useMemo<NotifyStore>(
    () => ({ prefs, setPref, desktopSupported: typeof Notification !== 'undefined' }),
    [prefs, setPref],
  );
  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>;
}

export function useNotify(): NotifyStore {
  const s = useContext(NotifyContext);
  if (!s) throw new Error('NotifyProvider missing');
  return s;
}


function BellIcon() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
      <path d="M8 1.8a4 4 0 0 0-4 4v2.6L2.6 11h10.8L12 8.4V5.8a4 4 0 0 0-4-4zM6.4 12.5a1.6 1.6 0 0 0 3.2 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ScreenIcon() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 14h5M8 11v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// 헤더의 알림 설정 토글 (소리 / 바탕화면 알림)
export function NotifyToggles() {
  const { prefs, setPref, desktopSupported } = useNotify();
  return (
    <span className="notify-toggles" aria-label="알림 설정">
      <button className={`toggle${prefs.sound ? ' on' : ''}`} aria-pressed={prefs.sound} title={`내 차례가 오면 소리 (${prefs.sound ? '켜짐' : '꺼짐'})`} aria-label={`내 차례가 오면 소리 (${prefs.sound ? '켜짐' : '꺼짐'})`} onClick={() => setPref('sound', !prefs.sound)}>
        <BellIcon />
        <span className="label">소리</span>
      </button>
      {desktopSupported && (
        <button className={`toggle${prefs.desktop ? ' on' : ''}`} aria-pressed={prefs.desktop} title={`다른 탭을 보고 있을 때 바탕화면 알림 (${prefs.desktop ? '켜짐' : '꺼짐'})`} aria-label={`다른 탭을 보고 있을 때 바탕화면 알림 (${prefs.desktop ? '켜짐' : '꺼짐'})`} onClick={() => setPref('desktop', !prefs.desktop)}>
          <ScreenIcon />
          <span className="label">알림</span>
        </button>
      )}
    </span>
  );
}
