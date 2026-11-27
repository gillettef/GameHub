import {
  selectCanCall,
  selectCanPlant,
  selectCanTake,
  selectChoosingAct,
  selectIsMyTurn,
  selectMe,
  selectSelectedSpecies,
  selectTakingSecond,
  type GameStore,
} from '../store/gameStore';
import { distinctRotations, stageDoing } from './derived';

/** ① 할 일 안내(옛 정원 탭 바닥의 차례 안내). v8 「행동 하나」: 행동 고르기 → 고른 행동(가져오기 2개 · 놓기 · 명당 부르기)의 화면 */
export function boardHint(s: GameStore, plantable: number[]): string {
  const state = s.state;
  if (!state) return '';
  if (state.phase === 'finished') return '게임이 끝났습니다';
  if (!selectIsMyTurn(s)) {
    const current = state.players.find((p) => p.id === state.currentPlayerId);
    return `${current?.nickname ?? ''}의 차례 · ${stageDoing(state.stage)}`;
  }
  if (selectTakingSecond(s)) return '하나 더 · 펼친 타일이나 주머니에서 타일 1개를 더 가져오세요';
  if (selectChoosingAct(s)) return '가져오기 · 놓기 · 부르기 중 하나를 고르세요';
  if (selectCanTake(s)) return '펼친 타일이나 주머니에서 1개씩 가져오세요';
  if (selectCanCall(s)) return s.callPos ? '방향을 고르고 결과를 본 뒤 부르기를 누르세요' : '부를 내 칸 위 명당(빛나는 칸)을 누르세요';
  if (!selectCanPlant(s)) return '';
  const species = selectSelectedSpecies(s);
  const handSize = selectMe(s)?.hand.length ?? 0;
  const stuck = handSize > 0 && plantable.length > 0 && plantable.every((n) => n === 0);
  if (!species) return stuck ? '놓을 칸이 없습니다. 내 타일을 눌러 하나 버리세요' : '놓을 타일을 고르세요';
  if (plantable[s.selectedHandIndex ?? -1] === 0) return '이 타일은 지금 놓을 칸이 없습니다. 다른 타일을 고르세요';
  if (s.seedPicking) return '보드에서 고양이를 멀리 보낼 칸(점선)을 누르세요';
  if (!s.pendingPos) return '밝게 빛나는 칸에 놓을 수 있습니다';
  return distinctRotations(species).length > 1 ? '방향을 고르고 결과를 본 뒤 놓기를 누르세요' : '결과를 본 뒤 놓기를 누르세요';
}
