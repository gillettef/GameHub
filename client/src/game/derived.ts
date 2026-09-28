/**
 * 화면용 파생값. 규칙 계산은 전부 shared/src/engine 을 호출하고(중복 구현 금지),
 * 여기서는 셀 단위로 memo 하기 쉬운 평평한 구조로 바꾸기만 한다.
 */
import type { CardId, GameState, MarkerKind, PlayerId, PlayerState, Position, RaceId, Terrain } from '@astraltab/shared';

import {
  computeIncome,
  computeScores,
  computeSightArea,
  computeTerritory,
  effectiveAttack,
  effectiveRange,
  effectiveSight,
  getSpec,
  legalCells,
  markerScore,
  posKey,
  terrainAt,
  validateCard,
} from '@astraltab/shared';

/** 서버가 가린 상태에는 handCount·deckCount 가 있다. 없으면(핫시트 전체 공개) 배열 길이 */
function countOf(p: PlayerState, key: 'hand' | 'deck'): number {
  const masked = p as PlayerState & { handCount?: number; deckCount?: number };
  const n = key === 'hand' ? masked.handCount : masked.deckCount;
  return typeof n === 'number' ? n : p[key].length;
}

export interface MarkerView {
  id: string;
  specId: CardId;
  name: string;
  kind: MarkerKind;
  seat: number;
  ownerName: string;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  sight: number;
  score: number;
  production: number;
  remainingTurns: number | null;
}

export interface CellView {
  x: number;
  y: number;
  key: string;
  terrain: Terrain;
  /** 영토 소유자 좌석. 무소유(경합·시야 밖·소행성)는 null */
  ownerSeat: number | null;
  /** 보는 사람(viewer)의 시야 영역 안인지 */
  inSight: boolean;
  marker: MarkerView | null;
}

export function seatOf(state: GameState, playerId: PlayerId): number {
  return state.players.find((p) => p.id === playerId)?.seat ?? -1;
}

/** 보드 전체 셀을 y → x 순으로. 선택 카드와 무관한 값만 담는다 (선택 변경 시 재계산 안 함) */
export function buildCells(state: GameState, viewerId: PlayerId | null): CellView[] {
  const territory = computeTerritory(state);
  const sight = new Set(viewerId ? computeSightArea(state, viewerId).map(posKey) : []);
  const markerByKey = new Map(state.markers.map((m) => [posKey(m.pos), m] as const));
  const seatById = new Map(state.players.map((p) => [p.id, p.seat] as const));
  const nameById = new Map(state.players.map((p) => [p.id, p.nickname] as const));

  const cells: CellView[] = [];
  for (let y = 0; y < state.board.height; y++) {
    for (let x = 0; x < state.board.width; x++) {
      const pos: Position = { x, y };
      const key = posKey(pos);
      const owner = territory.owners[y]?.[x] ?? null;
      const m = markerByKey.get(key);
      let marker: MarkerView | null = null;
      if (m) {
        const spec = getSpec(m.specId);
        marker = {
          id: m.id,
          specId: m.specId,
          name: spec.name,
          kind: m.kind,
          seat: seatById.get(m.ownerId) ?? -1,
          ownerName: nameById.get(m.ownerId) ?? m.ownerId,
          hp: m.hp,
          // 지형 보정치까지 반영한 실제 값(2026-09-28). 배치 시점에 굳는 maxHp 외에는
          // 전부 그 칸의 지형에 따라 매번 다시 계산되는 값이다(shared 엔진 함수 재사용, 중복 계산 금지)
          maxHp: m.maxHp,
          attack: effectiveAttack(state.board, m.pos, spec.attack),
          range: effectiveRange(state.board, m.pos, spec.range),
          sight: effectiveSight(state.board, m.pos, spec.sight),
          score: markerScore(state, m),
          production: spec.production,
          remainingTurns: m.remainingTurns,
        };
      }
      cells.push({
        x,
        y,
        key,
        terrain: terrainAt(state.board, pos),
        ownerSeat: owner === null ? null : (seatById.get(owner) ?? null),
        inSight: sight.has(key),
        marker,
      });
    }
  }
  return cells;
}

export interface MarkerSnapshot {
  id: string;
  hp: number;
  seat: number;
}

/** 칸 key → 마커 스냅샷. Board 가 매 렌더 직전 상태와 비교(diff)해 전투·파괴 이펙트를 뽑는 데 쓴다 */
export function snapshotMarkers(cells: CellView[]): Map<string, MarkerSnapshot> {
  const map = new Map<string, MarkerSnapshot>();
  for (const cell of cells) {
    if (cell.marker) map.set(cell.key, { id: cell.marker.id, hp: cell.marker.hp, seat: cell.marker.seat });
  }
  return map;
}

export interface BoardEffect {
  /** React key 등으로 쓰는 유일 키. 같은 칸에서 이벤트가 다시 나도 겹치지 않게 값들을 조합한다 */
  id: string;
  cellKey: string;
  type: 'destroy' | 'hit';
  seat: number;
}

/**
 * 직전 마커 스냅샷과 비교해 파괴·피격 이펙트를 뽑아낸다(2026-09-28, 전투 시각 피드백).
 * 룰 엔진 로그(`GameState.log`)는 파괴 위치를 구조화된 필드가 아니라 메시지 문자열에만 담으므로,
 * 엔진·AI 픽스처를 건드리지 않고 클라이언트에서 직접 diff 한다. 마커는 절대 이동하지 않으므로
 * 같은 칸에서 id 가 사라지면 파괴, id 는 같은데 hp 가 줄면 피격으로 본다.
 */
export function diffMarkerEffects(prev: Map<string, MarkerSnapshot>, next: Map<string, MarkerSnapshot>): BoardEffect[] {
  const effects: BoardEffect[] = [];
  for (const [cellKey, prevM] of prev) {
    const nextM = next.get(cellKey);
    if (!nextM || nextM.id !== prevM.id) {
      effects.push({ id: `${cellKey}:destroy:${prevM.id}`, cellKey, type: 'destroy', seat: prevM.seat });
    } else if (nextM.hp < prevM.hp) {
      effects.push({ id: `${cellKey}:hit:${nextM.id}:${nextM.hp}`, cellKey, type: 'hit', seat: nextM.seat });
    }
  }
  return effects;
}

/** 선택한 카드를 놓을 수 있는 칸 키 집합. 카드 조건(손패·에너지)이 안 맞으면 빈 집합 */
export function legalCellKeys(state: GameState, viewerId: PlayerId | null, cardId: CardId | null): Set<string> {
  if (!viewerId || !cardId) return new Set();
  if (validateCard(state, viewerId, cardId) !== null) return new Set();
  return new Set(legalCells(state, viewerId, cardId).map(posKey));
}

export interface HandCardView {
  /** 손패 안 위치. 같은 카드가 여러 장일 수 있어 index 로 구분한다 */
  index: number;
  cardId: CardId;
  name: string;
  kind: MarkerKind;
  cost: number;
  sight: number;
  score: number;
  hp: number;
  attack: number;
  range: number;
  production: number;
  keywords: string[];
  description: string;
  /** 지금 낼 수 있는가 */
  playable: boolean;
  /** 낼 수 없는 이유 (F009, F011). 낼 수 있으면 null */
  reason: string | null;
}

/** 손패 카드별 표시값과 가능 여부. 낼 수 없는 이유는 엔진 메시지를 그대로 쓴다 */
export function buildHand(state: GameState, playerId: PlayerId | null): HandCardView[] {
  if (!playerId) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const cellCountCache = new Map<CardId, number>();
  return player.hand.map((cardId, index) => {
    const spec = getSpec(cardId);
    const cardErr = validateCard(state, playerId, cardId);
    let reason: string | null = cardErr ? cardErr.message : null;
    if (!reason) {
      let n = cellCountCache.get(cardId);
      if (n === undefined) {
        n = legalCells(state, playerId, cardId).length;
        cellCountCache.set(cardId, n);
      }
      if (n === 0) reason = '놓을 수 있는 칸이 없습니다';
    }
    return {
      index,
      cardId,
      name: spec.name,
      kind: spec.kind,
      cost: spec.cost,
      sight: spec.sight,
      score: spec.score,
      hp: spec.hp,
      attack: spec.attack,
      range: spec.range,
      production: spec.production,
      keywords: spec.keywords.map(keywordLabel),
      description: spec.description,
      playable: reason === null,
      reason,
    };
  });
}

export function keywordLabel(k: string): string {
  switch (k) {
    case 'infiltrate':
      return '침투';
    case 'repair':
      return '정비';
    case 'overclock':
      return '과부하';
    case 'veil':
      return '은신';
    case 'barrage':
      return '다중 포격';
    default:
      return k;
  }
}

/** 키워드 배지에 다는 설명. 카드별 description 과 별개로, 키워드 자체의 공통 뜻(F017) */
export function keywordExplain(k: string): string {
  switch (k) {
    case 'infiltrate':
      return '침투: 적 마커 거리 1 이내에도 배치 가능';
    case 'repair':
      return '정비: 내 턴을 끝낼 때 반경 1 아군 체력 +1';
    case 'overclock':
      return '과부하: 내 턴을 끝낼 때의 수입 계산 시 반경 1 이내 자신 건물 수만큼 생산 추가';
    case 'veil':
      return '은신: 다른 적 표적이 남아 있으면 공격받지 않는다';
    case 'barrage':
      return '다중 포격: 주 표적 외 다음 순위 적에도 동시에 피해';
    default:
      return keywordLabel(k);
  }
}

export function kindLabel(kind: MarkerKind): string {
  switch (kind) {
    case 'core':
      return '코어';
    case 'building':
      return '건물';
    case 'unit':
      return '유닛';
    case 'magic':
      return '마법';
  }
}

export interface PlayerSummary {
  id: PlayerId;
  nickname: string;
  seat: number;
  /** 로비에서 고른 종족. 아직 안 골랐으면 null */
  race: RaceId | null;
  alive: boolean;
  isCurrent: boolean;
  energy: number;
  income: number;
  territory: number;
  markerScore: number;
  /** 덤(komi): 좌석 번호 × 상수. 선턴 유리함 보정 (Rules.md 9.1) */
  komi: number;
  total: number;
  markerCount: number;
  handCount: number;
  deckCount: number;
  discardCount: number;
  passed: boolean;
}

/** 상태 탭(F010) 한 줄씩. 좌석 순 */
export function buildPlayerSummaries(state: GameState): PlayerSummary[] {
  const scores = computeScores(state);
  return [...state.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p: PlayerState) => ({
      id: p.id,
      nickname: p.nickname,
      seat: p.seat,
      race: p.race,
      alive: p.alive,
      isCurrent: state.currentPlayerId === p.id,
      energy: p.energy,
      income: p.alive ? computeIncome(state, p.id).total : 0,
      territory: scores[p.id]?.territory ?? 0,
      markerScore: scores[p.id]?.markers ?? 0,
      komi: scores[p.id]?.komi ?? 0,
      total: scores[p.id]?.total ?? 0,
      markerCount: state.markers.filter((m) => m.ownerId === p.id).length,
      handCount: countOf(p, 'hand'),
      deckCount: countOf(p, 'deck'),
      discardCount: p.discard.length,
      passed: p.passed,
    }));
}
