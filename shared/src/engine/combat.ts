/**
 * 전투·정비·지속 마법 만료·파괴·탈락 (Rules.md 7절, 5.1, F023, F024). 순수 함수.
 */
import type { GameLogEntry, GameState, LogKind, Marker, PlayerId, Position } from '../types/index.js';
import { REPAIR_AMOUNT, REPAIR_RADIUS, getSpec } from '../data/index.js';
import { hexDistance, markersOf, sortByPosition } from './sight.js';
import { getPlayer } from './scoring.js';

export function addLog(state: GameState, kind: LogKind, playerId: PlayerId | null, message: string): GameState {
  const entry: GameLogEntry = { turn: state.turn, round: state.round, playerId, kind, message };
  return { ...state, log: [...state.log, entry] };
}

/** 마커 배열을 y → x 순으로 정렬해 상태에 넣는다 (Rules.md 13절) */
export function withMarkers(state: GameState, markers: readonly Marker[]): GameState {
  return { ...state, markers: sortByPosition(markers) };
}

export function nameOf(state: GameState, playerId: PlayerId): string {
  return getPlayer(state, playerId).nickname;
}

function fmt(p: Position): string {
  return `(${p.x},${p.y})`;
}

/**
 * 7.1 자동 공격. 턴 플레이어의 공격력 > 0 마커 각각이 사거리 안 적 하나를 공격한다.
 * 대상: 거리 → 남은 체력 → y → x 오름차순. 피해는 전투 시작 상태 기준으로 동시 적용.
 * 피해 적용 후 removeDestroyed 로 한꺼번에 제거한다.
 */
export function resolveCombat(state: GameState, playerId: PlayerId): GameState {
  const attackers = markersOf(state, playerId).filter((m) => getSpec(m.specId).attack > 0);
  if (attackers.length === 0) return state;

  const enemies = state.markers.filter((m) => m.ownerId !== playerId);
  const damage = new Map<string, number>();
  let s = state;

  for (const a of attackers) {
    const spec = getSpec(a.specId);
    const candidates = enemies
      .filter((e) => hexDistance(a.pos, e.pos) <= spec.range)
      .map((e) => ({ e, d: hexDistance(a.pos, e.pos) }))
      .sort((p, q) => p.d - q.d || p.e.hp - q.e.hp || p.e.pos.y - q.e.pos.y || p.e.pos.x - q.e.pos.x);
    const target = candidates[0]?.e;
    if (!target) continue;
    damage.set(target.id, (damage.get(target.id) ?? 0) + spec.attack);
    s = addLog(
      s,
      'combat',
      playerId,
      `${spec.name}${fmt(a.pos)} → ${nameOf(s, target.ownerId)}의 ${getSpec(target.specId).name}${fmt(target.pos)} 피해 ${spec.attack}`,
    );
  }

  if (damage.size === 0) return s;
  const markers = s.markers.map((m) => (damage.has(m.id) ? { ...m, hp: m.hp - (damage.get(m.id) ?? 0) } : m));
  return removeDestroyed(withMarkers(s, markers));
}

/** 정비 키워드: 반경 안 아군(자기 자신 포함) 체력 +1 (최대 체력까지) */
export function applyRepair(state: GameState, playerId: PlayerId): GameState {
  const repairers = markersOf(state, playerId).filter((m) => getSpec(m.specId).keywords.includes('repair'));
  if (repairers.length === 0) return state;
  let s = state;
  const heal = new Map<string, number>();
  for (const r of repairers) {
    for (const m of markersOf(s, playerId)) {
      if (hexDistance(r.pos, m.pos) <= REPAIR_RADIUS && m.hp < getSpec(m.specId).hp) {
        heal.set(m.id, (heal.get(m.id) ?? 0) + REPAIR_AMOUNT);
      }
    }
  }
  if (heal.size === 0) return s;
  const markers = s.markers.map((m) => {
    const h = heal.get(m.id);
    if (h === undefined) return m;
    return { ...m, hp: Math.min(getSpec(m.specId).hp, m.hp + h) };
  });
  s = withMarkers(s, markers);
  const names = sortByPosition(s.markers.filter((m) => heal.has(m.id)))
    .map((m) => `${getSpec(m.specId).name}${fmt(m.pos)}`)
    .join(', ');
  return addLog(s, 'repair', playerId, `정비: ${names} 체력 +${REPAIR_AMOUNT}`);
}

/** 지속 마법 만료: 내 지속형 마법 마커의 남은 턴을 1 줄이고 0이면 제거 */
export function expirePersistentMagic(state: GameState, playerId: PlayerId): GameState {
  let s = state;
  const next: Marker[] = [];
  for (const m of s.markers) {
    if (m.ownerId !== playerId || m.remainingTurns === null) {
      next.push(m);
      continue;
    }
    const remaining = m.remainingTurns - 1;
    if (remaining <= 0) {
      s = addLog(s, 'expire', playerId, `${getSpec(m.specId).name}${fmt(m.pos)} 만료`);
    } else {
      next.push({ ...m, remainingTurns: remaining });
    }
  }
  return withMarkers(s, next);
}

/** 7.2 즉발 피해: 중심 반경 안 적 마커 전부에 N 피해. 파괴 정리는 호출자가 한다 */
export function damageEnemiesInRadius(
  state: GameState,
  playerId: PlayerId,
  center: Position,
  radius: number,
  amount: number,
): { state: GameState; hits: Marker[] } {
  const hits = sortByPosition(
    state.markers.filter((m) => m.ownerId !== playerId && hexDistance(center, m.pos) <= radius),
  );
  const ids = new Set(hits.map((m) => m.id));
  const markers = state.markers.map((m) => (ids.has(m.id) ? { ...m, hp: m.hp - amount } : m));
  return { state: withMarkers(state, markers), hits };
}

/** 7.2 즉발 회복: 중심 반경 안 아군 마커 전부 체력 +N (최대 체력까지) */
export function healAlliesInRadius(
  state: GameState,
  playerId: PlayerId,
  center: Position,
  radius: number,
  amount: number,
): { state: GameState; hits: Marker[] } {
  const hits = sortByPosition(
    state.markers.filter(
      (m) => m.ownerId === playerId && hexDistance(center, m.pos) <= radius && m.hp < getSpec(m.specId).hp,
    ),
  );
  const ids = new Set(hits.map((m) => m.id));
  const markers = state.markers.map((m) =>
    ids.has(m.id) ? { ...m, hp: Math.min(getSpec(m.specId).hp, m.hp + amount) } : m,
  );
  return { state: withMarkers(state, markers), hits };
}

/**
 * 7.3 파괴 정리. 체력 ≤ 0 마커를 한꺼번에 제거하고, 코어가 파괴된 플레이어를
 * 좌석 번호 오름차순으로 탈락시킨다.
 */
export function removeDestroyed(state: GameState): GameState {
  const destroyed = sortByPosition(state.markers.filter((m) => m.hp <= 0));
  if (destroyed.length === 0) return state;
  let s = state;
  for (const m of destroyed) {
    s = addLog(s, 'destroy', m.ownerId, `${nameOf(s, m.ownerId)}의 ${getSpec(m.specId).name}${fmt(m.pos)} 파괴`);
  }
  s = withMarkers(s, s.markers.filter((m) => m.hp > 0));

  const coreOwners = destroyed
    .filter((m) => m.kind === 'core')
    .map((m) => getPlayer(s, m.ownerId))
    .sort((a, b) => a.seat - b.seat);
  for (const p of coreOwners) {
    if (getPlayer(s, p.id).alive) s = eliminatePlayer(s, p.id, 'core');
  }
  return s;
}

/** 탈락: alive=false, 탈락 순서 기록, 남은 마커 전부 제거 */
export function eliminatePlayer(state: GameState, playerId: PlayerId, reason: 'core' | 'surrender'): GameState {
  const order = state.players.filter((p) => !p.alive).length;
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, alive: false, eliminatedOrder: order } : p,
  );
  let s = withMarkers({ ...state, players }, state.markers.filter((m) => m.ownerId !== playerId));
  const why = reason === 'core' ? '코어 파괴' : '기권';
  s = addLog(s, 'eliminate', playerId, `${nameOf(s, playerId)} 탈락 (${why}). 남은 마커 제거`);
  return s;
}
