import type { Group, RideType } from '../types';

/**
 * 관객 그룹 카드 28장 — 취향(놀이기구 7유형)마다 4장.
 * 그룹이 클수록 지불 한도가 낮다. 어린이가 많은 그룹은 패밀리·교육·놀이형을, 성인 그룹은 스릴·공포형을 좋아한다.
 */
const KINDS = {
  A: { name: '혼자 온 손님', kids: 0, adults: 1, budget: 3 },
  B: { name: '커플', kids: 0, adults: 2, budget: 3 },
  C: { name: '친구들', kids: 0, adults: 3, budget: 2 },
  D: { name: '부모와 아이', kids: 1, adults: 1, budget: 3 },
  E: { name: '가족', kids: 2, adults: 2, budget: 2 },
  F: { name: '어린이 단체', kids: 4, adults: 0, budget: 1 },
  G: { name: '형제자매', kids: 2, adults: 0, budget: 2 },
  H: { name: '단체 관광객', kids: 0, adults: 4, budget: 1 },
} as const;

const DECK: [RideType, (keyof typeof KINDS)[]][] = [
  ['스릴형', ['A', 'B', 'C', 'H']],
  ['공포형', ['A', 'B', 'B', 'C']],
  ['어드벤처형', ['B', 'C', 'D', 'E']],
  ['물놀이형', ['B', 'D', 'E', 'G']],
  ['패밀리형', ['D', 'E', 'E', 'G']],
  ['교육형', ['D', 'F', 'F', 'H']],
  ['놀이형', ['D', 'F', 'G', 'G']],
];

export const GROUPS: Group[] = DECK.flatMap(([fav, ks]) => ks.map((k) => ({ ...KINDS[k], fav }))).map((g, i) => ({ id: i + 1, ...g }));

export const GROUP_BY_ID: Record<number, Group> = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

export const sizeOf = (g: Group) => g.kids + g.adults;
