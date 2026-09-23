/**
 * 점수·순위·수입 (Rules.md 9절, 5.1-4, F020, F025). 순수 함수, 파생값.
 */
import type { GameState, PlayerId, PlayerState, Position, Score } from '../types/index.js';
import {
  KOMI_PER_SEAT,
  OVERCLOCK_BONUS_PER_NEIGHBOR,
  OVERCLOCK_RADIUS,
  SCORE_PER_TERRITORY,
  VEIN_PRODUCTION_BONUS,
  getSpec,
} from '../data/index.js';
import { computeTerritory, hexDistance, markersOf, terrainAt } from './sight.js';

/** 생존 플레이어를 좌석 순으로 */
export function alivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.alive).sort((a, b) => a.seat - b.seat);
}

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`알 수 없는 플레이어: ${id}`);
  return p;
}

/** 점수 = 영토 칸 수 × 1 + Σ 마커 점수 + 덤(좌석 번호 × KOMI_PER_SEAT). 탈락자는 0 */
export function computeScores(state: GameState): Record<PlayerId, Score> {
  const territory = computeTerritory(state);
  const scores: Record<PlayerId, Score> = {};
  for (const p of state.players) {
    if (!p.alive) {
      scores[p.id] = { territory: 0, markers: 0, komi: 0, total: 0 };
      continue;
    }
    const t = (territory.counts[p.id] ?? 0) * SCORE_PER_TERRITORY;
    const m = markersOf(state, p.id).reduce((sum, mk) => sum + getSpec(mk.specId).score, 0);
    const komi = p.seat * KOMI_PER_SEAT;
    scores[p.id] = { territory: t, markers: m, komi, total: t + m + komi };
  }
  return scores;
}

/**
 * 순위 (Rules.md 9.3): 생존자는 점수 내림차순, 동점은 좌석 번호 큰 쪽이 위.
 * 탈락자는 생존자 아래, 늦게 탈락한 쪽이 위.
 */
export function computeRanking(state: GameState, scores = computeScores(state)): PlayerId[] {
  const alive = state.players
    .filter((p) => p.alive)
    .sort((a, b) => (scores[b.id]?.total ?? 0) - (scores[a.id]?.total ?? 0) || b.seat - a.seat);
  const dead = state.players
    .filter((p) => !p.alive)
    .sort((a, b) => (b.eliminatedOrder ?? -1) - (a.eliminatedOrder ?? -1));
  return [...alive, ...dead].map((p) => p.id);
}

export interface IncomeItem {
  markerId: string;
  name: string;
  amount: number;
  /** 광맥 보너스가 포함됐는지 */
  vein: boolean;
}

export interface Income {
  total: number;
  items: IncomeItem[];
}

/** 과부하 키워드(오토마타): 반경 1 이내 자신 소유 다른 건물 수 × 보너스를 생산에 더한다 */
function overclockBonus(state: GameState, playerId: PlayerId, markerId: string, pos: Position): number {
  const neighbors = markersOf(state, playerId).filter(
    (o) => o.id !== markerId && o.kind === 'building' && hexDistance(o.pos, pos) <= OVERCLOCK_RADIUS,
  ).length;
  return neighbors * OVERCLOCK_BONUS_PER_NEIGHBOR;
}

/** 수입 = 코어 기본 수입 + 내 건물 생산 합(광맥·과부하 보너스 포함). y → x 순 내역 */
export function computeIncome(state: GameState, playerId: PlayerId): Income {
  const items: IncomeItem[] = [];
  for (const m of markersOf(state, playerId)) {
    const spec = getSpec(m.specId);
    if (m.kind === 'core') {
      items.push({ markerId: m.id, name: spec.name, amount: spec.production, vein: false });
    } else if (m.kind === 'building') {
      const vein = terrainAt(state.board, m.pos) === 'vein';
      const overclock = spec.keywords.includes('overclock') ? overclockBonus(state, playerId, m.id, m.pos) : 0;
      const amount = spec.production + (vein ? VEIN_PRODUCTION_BONUS : 0) + overclock;
      if (amount > 0) items.push({ markerId: m.id, name: spec.name, amount, vein });
    }
  }
  return { total: items.reduce((s, i) => s + i.amount, 0), items };
}
