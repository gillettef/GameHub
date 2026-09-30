/**
 * 화면용 파생값. 규칙 계산은 전부 shared/src/engine 을 호출하고(중복 구현 금지),
 * 여기서는 셀 단위로 memo 하기 쉬운 평평한 구조로 바꾸기만 한다.
 */
import type { CardId, CardSpec, GameState, MarkerKind, PlayerId, PlayerState, Position, RaceId, Terrain } from '@astraltab/shared';

import {
  ENERGY_CAP,
  computeIncome,
  computeScores,
  computeSightArea,
  computeTerritory,
  effectiveAttack,
  effectiveRange,
  applyPlacement,
  effectiveSight,
  getSpec,
  hexDistance,
  legalCells,
  markerScore,
  planAttacks,
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
      return '정비: 내 턴을 끝낼 때 반경 1 아군(자신 포함) 체력 +1. 정비 마커가 여럿이면 중첩';
    case 'overclock':
      return '과부하: 내 턴을 끝낼 때의 수입 계산 시 반경 1 이내 자신 건물 수만큼 생산 추가';
    case 'veil':
      return '은신: 사거리 안에 은신 아닌 적 표적이 남아 있으면 자동 공격을 받지 않는다. 마법 피해는 그대로 받는다';
    case 'barrage':
      return '다중 포격: 주 표적 외 다음 순위 적 하나에도 같은 피해를 동시에 준다';
    default:
      return keywordLabel(k);
  }
}

/** 마법 카드 효과의 정확한 뜻. 카드 설명에 없는 "어디에 놓고 어디가 영향받는지"를 채운다 */
export function effectExplain(spec: CardSpec): string | null {
  const e = spec.effect;
  if (!e) return null;
  const base = '내 시야 안의 빈 칸에 놓습니다(마커 위에는 못 놓음).';
  switch (e.kind) {
    case 'damage':
      return `${base} 그 칸 중심 반경 ${e.radius} 안의 적 마커 전부에 피해 ${e.amount}, 놓은 뒤 사라집니다. 은신 마커도 맞습니다.`;
    case 'heal':
      return `${base} 그 칸 중심 반경 ${e.radius} 안의 아군 마커 전부 체력 +${e.amount}(최대 체력까지), 놓은 뒤 사라집니다.`;
    case 'energy':
      return `${base} 에너지 +${e.amount}(상한 ${ENERGY_CAP}) 후 사라집니다.`;
    case 'persistent':
      return `${base} 마커로 남아 시야 ${spec.sight}을 제공합니다. 놓은 턴을 포함해 내 턴 ${e.durationTurns}번째를 끝낼 때 사라지며, 파괴될 수 있습니다.`;
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

/** 배치 후보 칸 미리보기에서 셀마다 덧그리는 표시 */
export interface CellOverlay {
  /** 배치 후보 칸(고스트 마커를 그린다) */
  candidate?: boolean;
  /** 턴 종료 때 이 칸 마커가 받을 예상 피해(마법 즉발 + 자동 공격 합계) */
  hit?: number;
  /** 예상 피해로 파괴됨 */
  lethal?: boolean;
  /** 아군이 받을 회복량(즉발 회복 마법) */
  heal?: number;
  /** 새 마커의 공격 대상(이 칸을 놓으면 새로 생기는 공격) */
  fromNew?: boolean;
  /** 후보 칸을 사거리에 두는 적 마커 */
  threat?: boolean;
}

export interface PlacementPreview {
  overlays: Map<string, CellOverlay>;
  /** 적 마커 몇 기가 피해를 받는가 / 그중 파괴 */
  hits: number;
  kills: number;
  /** 새 마커가 공격할 적 수 */
  newAttacks: number;
  /** 후보 칸을 사거리에 두는 적 마커 수 */
  exposedTo: number;
  /** 배치 전 대비 내 점수 변화(영토+마커, 덤 포함) */
  scoreDelta: number;
}

/**
 * 카드를 pos 에 놓고 턴을 끝냈을 때 벌어질 일을 엔진 함수로 미리 계산한다(중복 구현 없음):
 * applyPlacement(즉발 마법 포함) → planAttacks(자동 공격). 수입·정비·이온 폭풍은 다루지 않는다.
 * 적 마커가 나중에 노출되는지는 적 마커의 현재 사거리만 본다(그 적이 실제로 이 마커를 고를지는 모른다).
 */
export function buildPlacementPreview(state: GameState, viewerId: PlayerId, cardId: CardId, pos: Position): PlacementPreview {
  const after = applyPlacement(state, viewerId, cardId, pos);
  const overlays = new Map<string, CellOverlay>();
  const put = (key: string, patch: CellOverlay) => overlays.set(key, { ...overlays.get(key), ...patch });
  put(posKey(pos), { candidate: true });

  // 총 피해 = 즉발 마법(배치 직후 hp 변화) + 자동 공격. 즉발로 이미 사라진 마커는 hp 전부를 피해로 본다
  const damage = new Map<string, number>();
  const hpNow = new Map(state.markers.map((m) => [m.id, m.hp] as const));
  const afterById = new Map(after.markers.map((m) => [m.id, m] as const));
  const owner = new Map(state.markers.map((m) => [m.id, m.ownerId] as const));
  for (const m of state.markers) {
    const a = afterById.get(m.id);
    if (m.ownerId === viewerId) {
      if (a && a.hp > m.hp) put(posKey(m.pos), { heal: a.hp - m.hp });
      continue;
    }
    const lost = a ? m.hp - a.hp : m.hp;
    if (lost > 0) damage.set(m.id, lost);
  }
  const plan = planAttacks(after, viewerId);
  let newAttacks = 0;
  for (const p of plan) {
    damage.set(p.target.id, (damage.get(p.target.id) ?? 0) + p.damage);
    if (p.attacker.pos.x === pos.x && p.attacker.pos.y === pos.y) {
      newAttacks++;
      put(posKey(p.target.pos), { fromNew: true });
    }
  }
  let kills = 0;
  for (const [id, dmg] of damage) {
    const m = state.markers.find((x) => x.id === id);
    if (!m || owner.get(id) === viewerId) continue;
    const lethal = dmg >= (hpNow.get(id) ?? m.hp);
    if (lethal) kills++;
    put(posKey(m.pos), { hit: dmg, lethal });
  }

  // 후보 칸에 마커가 남는 카드(유닛·건물·지속 마법)일 때만 노출을 본다
  const placed = afterById.size > state.markers.length ? after.markers.find((m) => m.pos.x === pos.x && m.pos.y === pos.y) : undefined;
  let exposedTo = 0;
  if (placed) {
    for (const e of state.markers) {
      if (e.ownerId === viewerId) continue;
      const spec = getSpec(e.specId);
      if (spec.attack <= 0) continue;
      if (hexDistance(e.pos, pos) <= effectiveRange(state.board, e.pos, spec.range)) {
        exposedTo++;
        put(posKey(e.pos), { threat: true });
      }
    }
  }

  const before = computeScores(state)[viewerId]?.total ?? 0;
  const later = computeScores(after)[viewerId]?.total ?? 0;
  return { overlays, hits: damage.size, kills, newAttacks, exposedTo, scoreDelta: later - before };
}
