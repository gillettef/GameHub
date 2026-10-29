/**
 * 바깥에서 들어온 값의 모양 검사. 소켓 요청(조작된 클라이언트 방어)과 디스크 스냅샷(옛 형식 걸러 내기)을
 * 엔진에 넘기기 전에 본다. 규칙 판정(합법 수인가)은 엔진이 한다.
 */
import type { GameState } from '@rootbound/shared';
import { GOALS, isDirection, isSpeciesId, rulesFor } from '@rootbound/shared';
import type { Room } from './manager.js';

const isPos = (v: unknown): boolean => {
  const p = v as Record<string, unknown> | null;
  return !!p && typeof p === 'object' && Number.isInteger(p.q) && Number.isInteger(p.r);
};

/** 소켓으로 들어온 액션의 모양 검사. 타입 정의만 믿고 엔진에 넘기지 않는다(조작된 클라이언트 방어) */
export function actionShapeError(action: unknown): string | null {
  const a = action as Record<string, unknown> | null;
  if (!a || typeof a !== 'object' || typeof a.type !== 'string' || typeof a.playerId !== 'string') return '잘못된 요청입니다';
  switch (a.type) {
    case 'READY':
    case 'CONFIRM':
    case 'SURRENDER':
      return null;
    case 'TAKE':
      return Number.isInteger(a.take) || a.take === 'pile' ? null : '잘못된 가져오기입니다';
    case 'DISCARD':
      return isSpeciesId(a.species) ? null : '없는 식물입니다';
    case 'PLANT':
      if (!isSpeciesId(a.species) || !isPos(a.pos)) return '잘못된 심기 요청입니다';
      if (a.rotation !== undefined && !isDirection(a.rotation)) return '잘못된 방향입니다';
      if (a.seed !== undefined && !isPos(a.seed)) return '잘못된 씨앗 위치입니다';
      return null;
    default:
      return '알 수 없는 행동입니다';
  }
}

/** 지금 규칙(Rootbound 오프라인판) 형식의 방인가. 예전 우주 전투판·영향력 합산판 스냅샷은 모양이 다르다 */
export function isCurrentFormat(room: Room): boolean {
  const st = room.state as Partial<GameState> | undefined;
  // 2026-10-16 오프라인판(뿌리 큐브)부터 rootSeat·rootCount 가 있다. 영향력 합산 시절 판(seeds)은 복원하지 않는다
  if (!st || !Array.isArray(st.players) || !Array.isArray(st.plants) || !Array.isArray(st.rootSeat) || !Array.isArray(st.rootCount)) return false;
  if (!(st.board === null || (typeof st.board === 'object' && Array.isArray(st.board?.cells)))) return false;
  // 드래프트 시절 판(2026-10-08 마켓으로 바뀜)은 market·pile 이 없다
  if (!Array.isArray(st.market) || !Array.isArray(st.pile) || !Array.isArray(st.species)) return false;
  // 가져오기 → 심기 단계로 바뀌기 전 판(2026-10-08)은 stage 가 없다. 로비는 이어 가도 된다
  if (st.phase !== 'lobby' && st.stage !== 'take' && st.stage !== 'plant') return false;
  // 마켓이 인원별 3~5장이던 판(2026-10-18 모든 인원 2장으로 바뀜)은 지금 규칙과 섞이므로 복원하지 않는다
  if (st.phase !== 'lobby' && st.market.length > (rulesForSafe(st.players.length)?.market ?? 0)) return false;
  // 종·목표 id 가 바뀐 예전 판(2026-10-08 선인장·덩굴·해바라기·장미 → 소나무·칡·유채·무궁화)은 복원하지 않는다
  const species = [...st.plants.map((p) => p.species), ...st.market, ...st.pile, ...st.species, ...st.players.flatMap((p) => p.hand ?? [])];
  return species.every((sp) => isSpeciesId(sp)) && (st.goals ?? []).every((g) => GOALS.some((x) => x.id === g));
}

function rulesForSafe(players: number): ReturnType<typeof rulesFor> | null {
  try {
    return rulesFor(players);
  } catch {
    return null;
  }
}

/** 재접속 토큰: 문자열, 1~64자 (스냅샷·메모리에 그대로 들어가므로 길이를 제한한다) */
export function isValidToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 1 && token.length <= 64;
}
