import type { GameState, RoundBid } from '../core';

const KEY_PROFILE = 'sl:v1:profile';
/** v8: 비밀 구단 → 목표 카드 (GameState v8) */
const KEY_SESSION = 'sl:v8:session';

export interface HistoryItem {
  at: number;
  score: number;
  rank: number;
  agents: number;
}

export interface Profile {
  nick: string;
  games: number;
  wins: number;
  total: number;
  history: HistoryItem[];
}

export type Screen = 'handoff' | 'bid' | 'result' | 'final';

/** 진행 중인 게임 한 판 */
export interface Session {
  game: GameState;
  /** 이번 라운드 사람 제출 (에이전트 인덱스 → 1·2차 제안, null = 패스) */
  subs: Record<number, RoundBid>;
  /** 지금 입찰 중인 사람 에이전트 */
  turn: number;
  screen: Screen;
  /** 전적 기록 완료 여부 */
  recorded: boolean;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패해도 게임은 계속 진행
  }
}

export function loadProfile(): Profile | null {
  const p = read<Profile>(KEY_PROFILE);
  return p && typeof p.nick === 'string' ? p : null;
}

export const saveProfile = (p: Profile): void => write(KEY_PROFILE, p);

export const newProfile = (nick: string): Profile => ({ nick, games: 0, wins: 0, total: 0, history: [] });

export function loadSession(): Session | null {
  const s = read<Session>(KEY_SESSION);
  return s && s.game?.v === 8 ? s : null;
}

export const saveSession = (s: Session | null): void => write(KEY_SESSION, s);

const KEY_ONLINE = 'sl:v1:online';

/** 온라인 방 재접속 정보 (방 코드 + 서버가 준 비밀 토큰) */
export interface OnlineSeat {
  code: string;
  token: string;
}

export function loadOnline(): OnlineSeat | null {
  const s = read<OnlineSeat>(KEY_ONLINE);
  return s && typeof s.code === 'string' && typeof s.token === 'string' ? s : null;
}

export const saveOnline = (s: OnlineSeat | null): void => write(KEY_ONLINE, s);
