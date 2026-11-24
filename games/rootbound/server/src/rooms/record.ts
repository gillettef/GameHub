/**
 * 판 요약 한 줄 (server/data/<env>/stats/games.jsonl). 완수율·세션 시간·재방문 집계용.
 * 방 상태만 읽는 순수 함수다. 한 판에 한 번만 기록하는 표시(statsRecorded)는 RoomManager 가 맡는다.
 */
import type { PlayerId, RoomId } from '@rootbound/shared';
import type { Room } from './manager.js';

export interface GameRecord {
  roomId: RoomId;
  players: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  rounds: number;
  turns: number;
  /** finished = 정상 종료, abandoned = 진행 중 방치되어 정리됨 */
  outcome: 'finished' | 'abandoned';
  reason: string | null;
  turnTimeLimitSec: number | null;
  seats: {
    seat: number;
    kind: 'human' | 'ai';
    /** 이 자리가 심은 식물 종류 (2026-10-08 드래프트 → 마켓. 예전 기록에는 drafted 가 있다) */
    planted: string[];
    /** 재접속 토큰의 해시 일부 (재방문 집계용, 원본 토큰은 남기지 않는다) */
    playerHash: string | null;
    rank: number | null;
    score: number | null;
    surrendered: boolean;
    timeouts: number;
    autopiloted: boolean;
  }[];
}

/** 시작 시각이 있는 방의 요약. endedAt 은 기록하는 시각 */
export function buildRecord(
  room: Room & { startedAt: number },
  outcome: GameRecord['outcome'],
  endedAt: number,
  hashToken: (token: string) => string | null,
): GameRecord {
  const state = room.state;
  const tokenOf = new Map<PlayerId, string>();
  for (const [token, id] of Object.entries(room.tokens)) tokenOf.set(id, token);
  const surrendered = new Set(state.log.filter((e) => e.kind === 'surrender' && e.playerId).map((e) => e.playerId as PlayerId));
  const autopiloted = new Set(room.everAutopiloted ?? []);
  const ranking = state.result?.ranking ?? [];
  return {
    roomId: room.roomId,
    players: state.players.length,
    startedAt: room.startedAt,
    endedAt,
    durationMs: endedAt - room.startedAt,
    rounds: state.round,
    turns: state.turn,
    outcome,
    reason: state.result?.reason ?? null,
    turnTimeLimitSec: room.turnTimeLimitSec ?? null,
    seats: state.players.map((p) => {
      const token = tokenOf.get(p.id);
      const rank = ranking.indexOf(p.id);
      return {
        seat: p.seat,
        kind: p.kind,
        planted: [...new Set(state.plants.filter((pl) => pl.ownerId === p.id).map((pl) => pl.species))],
        playerHash: p.kind === 'human' && token ? hashToken(token) : null,
        rank: rank === -1 ? null : rank + 1,
        score: state.result?.scores[p.id]?.total ?? null,
        surrendered: surrendered.has(p.id),
        timeouts: room.timeoutTotals?.[p.id] ?? 0,
        autopiloted: autopiloted.has(p.id),
      };
    }),
  };
}
