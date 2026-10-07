/**
 * 턴 제한 시간 표시 (Rules.md 5.4). 마감은 서버 시각이라, 스냅샷을 받은 순간의 서버 시각(serverNow)과
 * 내 시계의 차이로 보정해 남은 시간을 센다. 판정은 항상 서버가 한다 — 여기는 표시만.
 */
import { useEffect, useState } from 'react';
import type { RoomInfo } from '@rootbound/shared';

export function turnTimeLabel(sec: number | null): string {
  if (sec === null) return '없음';
  return sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`;
}

/** 서버 마감을 내 시계 기준 시각으로 바꾼다. 마감이 없으면 null */
export function localDeadline(room: RoomInfo | null, receivedAt: number): number | null {
  if (!room || room.turnDeadline === null) return null;
  return room.turnDeadline - room.serverNow + receivedAt;
}

/** 남은 초(올림). 마감이 없으면 null. 1초마다(10초 이하에서는 0.25초마다) 다시 그린다 */
export function useTurnRemaining(room: RoomInfo | null, receivedAt: number): number | null {
  const deadline = localDeadline(room, receivedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function formatRemaining(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}초`;
}
