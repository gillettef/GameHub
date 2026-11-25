/**
 * 게임 사건 → 효과음·내 차례 알림 (2026-10-06, lib/cues.ts). GamePage 가 한 번 건다.
 * 새로 붙은 로그 줄의 종류로 소리를 고르고, 턴이 나에게 넘어오면 알린다. 상태는 읽기만 한다.
 */
import { useEffect, useRef } from 'react';
import type { LogKind } from '../../engine';
import { AFK_STRIKES_FOR_AUTOPILOT, TIMEOUT_LOG_MARK } from '../../engine';
import { announceMyTurn, playCue, type Cue } from '../lib/cues';
import { useGameStore } from '../store/gameStore';

const KIND_CUE: Partial<Record<LogKind, Cue>> = {
  plant: 'place',
  take: 'place',
  flip: 'hit',
  surrender: 'destroy',
};
/** 같은 묶음 안에서 소리를 이 순서·간격으로 늘어놓는다 (심기 → 뺏기 → 기권) */
const ORDER: Cue[] = ['place', 'hit', 'destroy'];
const GAP_SEC = 0.18;
/** 첫 시간 초과 뒤 AI 대리까지 남은 횟수 문구 (AFK_STRIKES_FOR_AUTOPILOT 2 → "한 번 더") */
const STRIKES_LEFT = AFK_STRIKES_FOR_AUTOPILOT - 1;
const TIMEOUT_NOTICE = `시간이 지나 자동으로 두었습니다. ${STRIKES_LEFT === 1 ? '한 번' : `${STRIKES_LEFT}번`} 더 지나면 AI가 대신 둡니다`;

export function useGameCues(): void {
  const state = useGameStore((s) => s.state);
  const viewerId = useGameStore((s) => s.viewerId);
  const mode = useGameStore((s) => s.mode);
  const handoffPending = useGameStore((s) => s.handoffPending);
  // 핫시트: 기기 넘김 화면이 닫히는 순간 다음 사람에게 차례 소리를 낸다
  const wasHandoff = useRef(false);
  useEffect(() => {
    if (wasHandoff.current && !handoffPending && mode === 'hotseat') playCue('turn');
    wasHandoff.current = handoffPending;
  }, [handoffPending, mode]);

  const prev = useRef<{ logLength: number; turn: number; roomId: string; current: string | null } | null>(null);

  useEffect(() => {
    if (!state || !viewerId) return;
    const before = prev.current;
    prev.current = { logLength: state.log.length, turn: state.turn, roomId: state.roomId, current: state.currentPlayerId };
    // 첫 스냅샷(입장·새로고침)은 이미 지나간 일이라 소리를 내지 않는다
    if (!before || before.roomId !== state.roomId || state.log.length < before.logLength) return;

    const fresh = state.log.slice(before.logLength);
    const cues = new Set<Cue>();
    for (const e of fresh) {
      const cue = KIND_CUE[e.kind];
      if (cue) cues.add(cue);
    }
    ORDER.filter((c) => cues.has(c)).forEach((c, i) => playCue(c, i * GAP_SEC));
    // 내 첫 시간 초과는 자동 수가 내가 둔 수처럼 지나가기 쉬워 바로 알린다(서버 로그 문구 TIMEOUT_LOG_MARK)
    if (fresh.some((e) => e.kind === 'system' && e.playerId === viewerId && e.message.includes(TIMEOUT_LOG_MARK)) && !useGameStore.getState().room?.autopilot.includes(viewerId)) {
      useGameStore.getState().setNotice(TIMEOUT_NOTICE);
    }
    // 대기실에서 판이 시작되어 이번 판 식물이 공개되면 확인하라고 알린다 (Rules.md 4절 8)
    if (mode === 'online' && state.phase === 'reveal' && before.turn === state.turn && fresh.some((e) => e.kind === 'system' && e.message.startsWith('게임 시작'))) {
      announceMyTurn('이번 판 식물이 공개되었습니다. 확인을 누르세요');
      return;
    }

    if (state.phase === 'finished' && fresh.some((e) => e.kind === 'result')) {
      playCue(state.result?.ranking[0] === viewerId ? 'win' : 'lose', 0.4);
      return;
    }
    const myTurnNow = state.phase === 'playing' && state.currentPlayerId === viewerId && (before.current !== viewerId || state.turn !== before.turn);
    if (!myTurnNow) return;
    if (mode === 'online') announceMyTurn(`${state.round}라운드 · ${state.stage === 'take' ? '카드를 가져올' : '식물을 심을'} 차례입니다`);
    else if (!handoffPending) playCue('turn');
  }, [state, viewerId, mode, handoffPending]);
}
