import { selectCanPlant, selectCanTake, selectIsMyTurn, selectSelectedSpecies, type GameStore } from '../store/gameStore';
import { distinctRotations } from './derived';

/** ① 할 일 안내(옛 정원 탭 바닥의 차례 안내) */
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
    return `${current?.nickname ?? ''}의 차례 · ${state.stage === 'take' ? '가져오는 중' : '심는 중'}`;
  }
  if (canTake) return '마켓이나 카드 더미에서 카드 1장을 가져오세요';
  if (stuck) return '심을 칸이 없습니다. 카드를 눌러 한 장 버리세요';
  if (!species) return '심을 카드를 고르세요. 빛나는 칸에 심을 수 있습니다';
  if (selectedDead) return '이 카드는 지금 심을 칸이 없습니다. 다른 카드를 고르세요';
  if (s.seedPicking) return '보드에서 씨앗 칸(점선)을 누르세요';
  if (!s.pendingPos) return '밝게 빛나는 칸에 심을 수 있습니다';
  return distinctRotations(species).length > 1 ? '방향을 고르고 결과를 본 뒤 심기를 누르세요' : '결과를 본 뒤 심기를 누르세요';
}
