/**
 * 게임 사건 → 효과음·내 차례 알림 (2026-10-06, lib/cues.ts). GamePage 가 한 번 건다.
 * 새로 붙은 로그 줄의 종류로 소리를 고르고, 턴이 나에게 넘어오면 알린다. 상태는 읽기만 한다.
 */
import { useEffect, useRef } from 'react';
import type { LogKind } from '@astraltab/shared';
import { announceMyTurn, playCue, type Cue } from '../lib/cues';
import { sampleFps } from '../lib/vitals';
import { useGameStore } from '../store/gameStore';

const KIND_CUE: Partial<Record<LogKind, Cue>> = {
  place: 'place',
  magic: 'place',
  combat: 'hit',
  destroy: 'destroy',
  eliminate: 'destroy',
};
/** 같은 묶음 안에서 소리를 이 순서·간격으로 늘어놓는다 (배치 → 피격 → 파괴) */
const ORDER: Cue[] = ['place', 'hit', 'destroy'];
const GAP_SEC = 0.18;

export function useGameCues(): void {
  const state = useGameStore((s) => s.state);
  const viewerId = useGameStore((s) => s.viewerId);
  const mode = useGameStore((s) => s.mode);
  const handoffPending = useGameStore((s) => s.handoffPending);
  const prev = useRef<{ logLength: number; turn: number; roomId: string } | null>(null);

  useEffect(() => {
    if (!state || !viewerId) return;
    const before = prev.current;
    prev.current = { logLength: state.log.length, turn: state.turn, roomId: state.roomId };
    // 첫 스냅샷(입장·새로고침)은 이미 지나간 일이라 소리를 내지 않는다
    if (!before || before.roomId !== state.roomId || state.log.length < before.logLength) return;

    const fresh = state.log.slice(before.logLength);
    const cues = new Set<Cue>();
    for (const e of fresh) {
      const cue = KIND_CUE[e.kind];
      if (cue) cues.add(cue);
    }
    ORDER.filter((c) => cues.has(c)).forEach((c, i) => playCue(c, i * GAP_SEC));
    if (cues.size > 0) sampleFps(); // 연출이 도는 동안의 프레임률 표본

    if (state.phase === 'finished' && fresh.some((e) => e.kind === 'result')) {
      playCue(state.result?.ranking[0] === viewerId ? 'win' : 'lose', 0.4);
      return;
    }
    const myTurnNow = state.phase === 'playing' && state.currentPlayerId === viewerId && state.turn !== before.turn;
    if (!myTurnNow) return;
    if (mode === 'online') announceMyTurn(`${state.round}라운드 · 마커를 놓거나 턴을 넘기세요`);
    else if (!handoffPending) playCue('turn');
  }, [state, viewerId, mode, handoffPending]);
}
