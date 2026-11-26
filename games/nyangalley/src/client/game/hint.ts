import { canCallTake, getChore, MOVE_TIMES } from '../../engine';
import {
  selectCanCall,
  selectCanMove,
  selectCanPickChore,
  selectCanPlant,
  selectCanTake,
  selectIsMyTurn,
  selectSelectedSpecies,
  type GameStore,
} from '../store/gameStore';
import { asState, choicePick, choreOf, distinctRotations, leftChores, stageDoing } from './derived';

/** ① 할 일 안내(옛 정원 탭 바닥의 차례 안내). v7 「골목 일과」: 일과 고르기 → 일과대로 놓기 / 담 넘기 / 명당 부르기 */
export function boardHint(s: GameStore, plantable: number[]): string {
  const state = s.state;
  if (!state) return '';
  const canTake = selectCanTake(s);
  const canPlant = selectCanPlant(s);
  const species = selectSelectedSpecies(s);
  const stuck = canPlant && plantable.length > 0 && plantable.every((n) => n === 0);
  const selectedDead = s.selectedHandIndex !== null && plantable[s.selectedHandIndex] === 0;
  if (state.phase === 'finished') return '게임이 끝났습니다';
  if (!selectIsMyTurn(s)) {
    const current = state.players.find((p) => p.id === state.currentPlayerId);
    return `${current?.nickname ?? ''}의 차례 · ${stageDoing(state.stage)}`;
  }
  if (selectCanPickChore(s)) {
    const left = leftChores(state).length;
    if (s.pendingChore) return `${choicePick(state)}번째 선택 · 「${getChore(s.pendingChore).name}」을(를) 고를까요? 아래 버튼으로 정합니다`;
    return `${choicePick(state)}번째 선택 · 펼친 일과 ${left}장 중 하나를 고르세요${left === 2 ? '(남는 1장은 쓰지 않음)' : ''}`;
  }
  if (selectCanMove(s)) {
    const n = s.moveSteps.length + 1;
    if (!s.moveFrom) return `담 넘기 ${n}/${MOVE_TIMES} · 고양이를 옮길 내 칸(빛나는 칸)을 누르세요`;
    if (!s.moveTo) return `담 넘기 ${n}/${MOVE_TIMES} · 마릿수를 고르고 맞닿은 칸(빛나는 칸)을 누르세요`;
    return n < MOVE_TIMES ? '결과를 보고 한 번 더 옮기거나 이대로 끝내세요' : '결과를 보고 이대로 끝내세요';
  }
  if (selectCanCall(s)) {
    if (!s.callPos) return '명당 부르기 · 내 칸 위 명당(빛나는 칸)을 누르세요';
    if (s.viewerId && canCallTake(asState(state), s.viewerId) && s.callTake === null) return '방향을 고르고, 손에 가져올 펼친 타일을 누르세요';
    return '방향을 고르고 결과를 본 뒤 부르기를 누르세요';
  }
  const chore = choreOf(state, s.viewerId);
  if (canTake) {
    if (chore === 'peek' && state.peek) return '생선 냄새 · 펼친 타일 3개 중 1개를 가져오세요';
    return '펼친 타일이나 주머니에서 타일 1개를 가져오세요';
  }
  if (stuck) return '놓을 칸이 없습니다. 타일을 눌러 하나 버리세요';
  const extra = chore === 'bread' ? ' (식빵 굽기: 놓은 칸 +1)' : chore === 'roam' ? ' (마실: 두 칸 안 빈 칸도)' : chore === 'boss' ? ' (대장 방울: 다음 라운드 선)' : '';
  if (!species) return `놓을 타일을 고르세요. 빛나는 칸에 놓을 수 있습니다${extra}`;
  if (selectedDead) return '이 타일은 지금 놓을 칸이 없습니다. 다른 타일을 고르세요';
  if (s.seedPicking) return '보드에서 고양이를 멀리 보낼 칸(점선)을 누르세요';
  if (!s.pendingPos) return `밝게 빛나는 칸에 놓을 수 있습니다${extra}`;
  return distinctRotations(species).length > 1 ? '방향을 고르고 결과를 본 뒤 놓기를 누르세요' : '결과를 본 뒤 놓기를 누르세요';
}
