// 위성 (Rules.md 14절). 궤도에 있는 동안 시야 +1 과 작은 보너스
import type { SatelliteDef } from '../types';

export const SATELLITES: SatelliteDef[] = [
  { id: 'sa1', name: '기상 위성', cost: 3, timer: 3, mods: { income: { food: 1 } } },
  { id: 'sa2', name: '측지 위성', cost: 3, timer: 3, mods: { income: { sci: 1 } } },
  { id: 'sa3', name: '중계 위성', cost: 3, timer: 4, mods: {} },
  { id: 'sa4', name: '태양 반사경', cost: 4, timer: 3, mods: { income: { energy: 2 } } },
  { id: 'sa5', name: '정찰 위성', cost: 4, timer: 3, mods: { might: 2 } },
  { id: 'sa6', name: '광물 탐지 위성', cost: 4, timer: 3, mods: { income: { prod: 1 } } },
  { id: 'sa7', name: '방송 위성', cost: 5, timer: 3, mods: { income: { culture: 1 } } },
  { id: 'sa8', name: '포자 감시 위성', cost: 4, timer: 4, mods: { sporeCap: 3 } },
  { id: 'sa9', name: '궤도 농장', cost: 5, timer: 4, mods: { income: { food: 2 } } },
  { id: 'sa10', name: '궤도 포대', cost: 6, timer: 3, mods: { might: 3 } },
  { id: 'sa11', name: '심우주 망원경', cost: 6, timer: 4, mods: { sight: 1, income: { sci: 1 } } },
  { id: 'sa12', name: '궤도 연구실', cost: 6, timer: 3, mods: { income: { sci: 2 } } },
];
export const SATELLITE_DEFS: Record<string, SatelliteDef> = Object.fromEntries(SATELLITES.map((s) => [s.id, s]));
