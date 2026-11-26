/**
 * 효과음과 내 차례 알림 (2026-10-06). 오디오 파일 없이 Web Audio 로 짧은 음을 합성한다(로딩 비용 0).
 *  - 효과음: 내 차례·심기/가져오기(place)·땅 뺏기(hit)·기권(destroy)·승리·패배·시간 임박. 설정은 localStorage (기본 켬)
 *  - 내 차례 알림: 다른 탭을 보고 있으면 브라우저 알림(사용자가 켰을 때만) + 탭 제목 깜빡임 + 진동
 * 브라우저 정책상 소리는 사용자가 한 번이라도 화면을 누른 뒤에만 난다(그 전 호출은 조용히 무시).
 */
export type Cue = 'turn' | 'place' | 'hit' | 'destroy' | 'win' | 'lose' | 'tick';

const SOUND_KEY = 'rootbound:sound';
const NOTIFY_KEY = 'rootbound:notify';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 못 해도 이번 세션 동안은 메모리 값으로 동작한다 */
  }
}

let soundOn = read(SOUND_KEY) !== '0';
let notifyOn = read(NOTIFY_KEY) === '1';

export function isSoundOn(): boolean {
  return soundOn;
}

export function setSoundOn(on: boolean): void {
  soundOn = on;
  write(SOUND_KEY, on ? '1' : '0');
  if (on) unlockAudio();
}

export function isNotifyOn(): boolean {
  return notifyOn && typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export function notifySupported(): boolean {
  return typeof Notification !== 'undefined';
}

/** 알림 켜기는 권한을 묻는다. 거절되면 false */
export async function setNotifyOn(on: boolean): Promise<boolean> {
  if (!on) {
    notifyOn = false;
    write(NOTIFY_KEY, '0');
    return false;
  }
  if (!notifySupported()) return false;
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  notifyOn = perm === 'granted';
  write(NOTIFY_KEY, notifyOn ? '1' : '0');
  return notifyOn;
}

// ---------------------------------------------------------------------------
// 합성음
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** 첫 사용자 입력에서 오디오를 깨운다 (main.tsx 가 한 번 건다) */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.state === 'suspended') void a.resume();
}

/** [주파수 Hz, 시작 s, 길이 s] 음표들 */
type Note = [number, number, number];

const CUES: Record<Cue, { wave: OscillatorType; gain: number; notes: Note[]; slide?: number }> = {
  turn: { wave: 'sine', gain: 0.18, notes: [[660, 0, 0.12], [880, 0.12, 0.2]] },
  place: { wave: 'triangle', gain: 0.16, notes: [[520, 0, 0.09]], slide: 1.4 },
  hit: { wave: 'square', gain: 0.07, notes: [[180, 0, 0.08]], slide: 0.6 },
  destroy: { wave: 'sawtooth', gain: 0.09, notes: [[140, 0, 0.28]], slide: 0.35 },
  win: { wave: 'sine', gain: 0.18, notes: [[523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.32]] },
  lose: { wave: 'sine', gain: 0.16, notes: [[440, 0, 0.18], [349, 0.18, 0.34]] },
  tick: { wave: 'sine', gain: 0.1, notes: [[1000, 0, 0.05]] },
};

const lastPlayed = new Map<Cue, number>();

export function playCue(cue: Cue, delaySec = 0): void {
  if (!soundOn) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && (cue === 'hit' || cue === 'destroy')) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  // 같은 소리가 한꺼번에 몰리면(동시 피해 여러 개) 한 번만 낸다
  const nowMs = performance.now();
  if (nowMs - (lastPlayed.get(cue) ?? -1e9) < 80) return;
  lastPlayed.set(cue, nowMs);
  const spec = CUES[cue];
  const t0 = a.currentTime + delaySec;
  for (const [freq, start, dur] of spec.notes) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(freq, t0 + start);
    if (spec.slide) osc.frequency.exponentialRampToValueAtTime(freq * spec.slide, t0 + start + dur);
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(spec.gain, t0 + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  }
}

// ---------------------------------------------------------------------------
// 내 차례 알림 (다른 탭을 보고 있을 때)
// ---------------------------------------------------------------------------

let flashTimer: number | null = null;

function stopFlash(): void {
  if (flashTimer !== null) window.clearInterval(flashTimer);
  flashTimer = null;
}

/** 탭 제목을 번갈아 바꿔 눈에 띄게 한다. 화면으로 돌아오면 멈춘다(제목은 GamePage 가 다시 정한다) */
function flashTitle(text: string): void {
  stopFlash();
  const base = document.title;
  let on = false;
  flashTimer = window.setInterval(() => {
    on = !on;
    document.title = on ? text : base;
  }, 1000);
  const back = () => {
    if (document.visibilityState !== 'visible') return;
    stopFlash();
    document.title = base;
    document.removeEventListener('visibilitychange', back);
  };
  document.addEventListener('visibilitychange', back);
}

export function announceMyTurn(body: string): void {
  playCue('turn');
  try {
    navigator.vibrate?.([80, 60, 80]);
  } catch {
    /* 진동 미지원 */
  }
  if (document.visibilityState === 'visible') return;
  flashTitle('● 내 차례 · 냥냥 골목');
  if (isNotifyOn()) {
    try {
      const n = new Notification('냥냥 골목 · 내 차례', { body, tag: 'rootbound-turn' });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* 모바일 일부는 페이지에서 직접 알림을 못 띄운다 (서비스 워커 필요) — 제목·소리로 대신한다 */
    }
  }
}
