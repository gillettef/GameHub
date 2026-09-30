/**
 * 전투·정비·지속 마법 만료·파괴·탈락 (Rules.md 7절, 5.2, F023, F024). 순수 함수.
 */
import type { GameLogEntry, GameState, LogKind, Marker, PlayerId, Position } from '../types/index.js';
import { ION_STORM_DAMAGE, REPAIR_AMOUNT, REPAIR_RADIUS, getSpec } from '../data/index.js';
import { effectiveAttack, effectiveRange, hexDistance, markersOf, sortByPosition, terrainAt } from './sight.js';
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
 * 7.1 대상 후보를 우선순위(거리 → 남은 체력 → y → x)로 정렬하고, `은신` 마커는 다른 비은신 후보가
 * 있으면 뒤로 뺀다(그림자 결사 종족, Rules.md 7.1). 비은신 후보가 하나도 없을 때만 은신 후보가 앞으로 온다.
 */
function prioritizedTargets(attackerPos: Position, enemies: readonly Marker[], range: number): Marker[] {
  const sorted = enemies
    .filter((e) => hexDistance(attackerPos, e.pos) <= range)
    .map((e) => ({ e, d: hexDistance(attackerPos, e.pos) }))
    .sort((p, q) => p.d - q.d || p.e.hp - q.e.hp || p.e.pos.y - q.e.pos.y || p.e.pos.x - q.e.pos.x)
    .map((p) => p.e);
  const nonVeiled = sorted.filter((e) => !getSpec(e.specId).keywords.includes('veil'));
  return nonVeiled.length > 0 ? nonVeiled : sorted;
}

export interface PlannedAttack {
  attacker: Marker;
  target: Marker;
  damage: number;
}

/**
 * 7.1 자동 공격 계획. 턴 플레이어의 공격력 > 0 마커 각각이 사거리 안 적 하나(또는 `다중 포격`이면 둘)를
 * 누구에게 얼마를 주는지 순서대로 돌려준다. 대상: 거리 → 남은 체력 → y → x 오름차순, `은신` 마커는
 * 다른 표적이 있으면 제외. 상태를 바꾸지 않으므로 배치 전 전투 예측(UI)에도 그대로 쓴다.
 */
export function planAttacks(state: GameState, playerId: PlayerId): PlannedAttack[] {
  const attackers = markersOf(state, playerId).filter((m) => getSpec(m.specId).attack > 0);
  const enemies = state.markers.filter((m) => m.ownerId !== playerId);
  const plan: PlannedAttack[] = [];
  for (const a of attackers) {
    const spec = getSpec(a.specId);
    const attack = effectiveAttack(state.board, a.pos, spec.attack);
    const range = effectiveRange(state.board, a.pos, spec.range);
    const candidates = prioritizedTargets(a.pos, enemies, range);
    const targets = spec.keywords.includes('barrage') ? candidates.slice(0, 2) : candidates.slice(0, 1);
    for (const target of targets) plan.push({ attacker: a, target, damage: attack });
  }
  return plan;
}

/**
 * 7.1 자동 공격 적용. 피해는 전투 시작 상태 기준으로 동시 적용(planAttacks). 피해 적용 후
 * removeDestroyed 로 한꺼번에 제거한다.
 */
export function resolveCombat(state: GameState, playerId: PlayerId): GameState {
  const plan = planAttacks(state, playerId);
  if (plan.length === 0) return state;

  const damage = new Map<string, number>();
  let s = state;
  for (const { attacker, target, damage: dmg } of plan) {
    damage.set(target.id, (damage.get(target.id) ?? 0) + dmg);
    s = addLog(
      s,
      'combat',
      playerId,
      `${getSpec(attacker.specId).name}${fmt(attacker.pos)} → ${nameOf(s, target.ownerId)}의 ${getSpec(target.specId).name}${fmt(target.pos)} 피해 ${dmg}`,
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
      if (hexDistance(r.pos, m.pos) <= REPAIR_RADIUS && m.hp < m.maxHp) {
        heal.set(m.id, (heal.get(m.id) ?? 0) + REPAIR_AMOUNT);
      }
    }
  }
  if (heal.size === 0) return s;
  const markers = s.markers.map((m) => {
    const h = heal.get(m.id);
    if (h === undefined) return m;
    return { ...m, hp: Math.min(m.maxHp, m.hp + h) };
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

/** 지형 피해(이온 폭풍): 내 마커 중 이온 폭풍 칸에 있는 것마다 매 턴 피해 1(지속, 만료 없음).
 * 파괴 정리(removeDestroyed)까지 여기서 끝낸다 — 호출자는 그 뒤 생존자 수만 확인하면 된다 */
export function applyTerrainHazards(state: GameState, playerId: PlayerId): GameState {
  const hit = markersOf(state, playerId).filter((m) => terrainAt(state.board, m.pos) === 'ionStorm');
  if (hit.length === 0) return state;
  let s = state;
  const ids = new Set(hit.map((m) => m.id));
  const markers = s.markers.map((m) => (ids.has(m.id) ? { ...m, hp: m.hp - ION_STORM_DAMAGE } : m));
  s = withMarkers(s, markers);
  const names = hit.map((m) => `${getSpec(m.specId).name}${fmt(m.pos)}`).join(', ');
  s = addLog(s, 'combat', playerId, `이온 폭풍: ${names} 피해 ${ION_STORM_DAMAGE}`);
  return removeDestroyed(s);
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
      (m) => m.ownerId === playerId && hexDistance(center, m.pos) <= radius && m.hp < m.maxHp,
    ),
  );
  const ids = new Set(hits.map((m) => m.id));
  const markers = state.markers.map((m) =>
    ids.has(m.id) ? { ...m, hp: Math.min(m.maxHp, m.hp + amount) } : m,
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
