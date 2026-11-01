// 후원자·유산·자원 팟·습격·분쟁 (Rules.md 11절). 고리별 24·30·30장, 그 시대 퀘스트 덱에 섞인다
import type { CardDef, ConflictDef, LegacyDef, PioneerDef, RaidDef, Ring, SupplyDef } from '../types';

const P = (id: string, ring: Ring, name: string, doctrine: PioneerDef['doctrine'], mods: PioneerDef['mods'], text: string): PioneerDef => ({ type: 'pioneer', id, ring, name, doctrine, mods, text });
const L = (id: string, ring: Ring, name: string, stages: number[], mods: LegacyDef['mods'], points: number, text: string): LegacyDef => ({ type: 'legacy', id, ring, name, stages, mods, points, text });
const S = (id: string, ring: Ring, name: string, copies: number, instant: SupplyDef['instant']): SupplyDef => ({ type: 'supply', id, ring, name, copies, instant });
const RD = (id: string, ring: Ring, name: string, effects: RaidDef['effects'], atk: number, bonus: number, text: string): RaidDef => ({ type: 'raid', id, ring, name, copies: 1, effects, atk, bonus, text });
const CF = (id: string, ring: Ring, name: string, loss: ConflictDef['loss'], atk: number, text: string): ConflictDef => ({ type: 'conflict', id, ring, name, copies: 1, loss, atk, text });

export const PIONEERS: PioneerDef[] = [
  P('p1a', 1, '항해장 하윤', 'ark', { health: 1, income: { culture: 1 } }, '선단을 이끌고 착륙한 첫 지휘관'),
  P('p1s', 1, '채집가 마루', 'symbiont', { income: { food: 2 } }, '처음으로 행성의 열매를 먹어 본 사람'),
  P('p1y', 1, '기관장 도윤', 'synth', { income: { prod: 1, energy: 1 } }, '착륙선을 해체해 첫 공장을 세웠다'),
  P('p1n', 1, '측량사 세라', 'ark', { income: { sci: 1 }, sight: 1 }, '궤도에서 지형을 그린 측량사'),
  P('p2a', 2, '집정관 이레', 'ark', { command: 1 }, '흩어진 정착지를 하나의 의회로 묶었다'),
  P('p2s', 2, '접촉자 누리', 'symbiont', { unitPower: { rider: 1 }, health: 1 }, '토착 무리와 처음 말을 나눈 사람'),
  P('p2y', 2, '설계자 카이', 'synth', { defense: 1 }, '자율 경비 체계를 설계했다'),
  P('p2n', 2, '학장 솔', 'synth', { income: { sci: 2 } }, '행성 최초의 대학을 열었다'),
  P('p3a', 3, '수호자 강', 'ark', { might: 3, health: 1 }, '지구의 기억을 지키는 마지막 기사'),
  P('p3s', 3, '대모 아라', 'symbiont', { income: { food: 2, culture: 1 } }, '행성과 하나가 된 공동체의 어머니'),
  P('p3y', 3, '총체 지성 오르', 'synth', { command: 1, income: { energy: 1 } }, '수천 개의 정신을 이은 합성 지성'),
  P('p3n', 3, '시인 해담', 'symbiont', { income: { culture: 2 } }, '두 세계의 노래를 하나로 엮었다'),
];

export const LEGACIES: LegacyDef[] = [
  L('l1a', 1, '착륙 기념탑', [2, 3], { health: 1 }, 3, '첫발을 디딘 자리를 기억한다'),
  L('l1b', 1, '수경 농원', [2, 3], { income: { food: 1 } }, 2, '흙 없이도 자라는 지구의 작물'),
  L('l1c', 1, '심층 시추공', [3, 3], { income: { prod: 1 } }, 2, '지각 아래의 광맥을 연다'),
  L('l1d', 1, '첫 관측소', [2, 2], { sight: 1 }, 2, '하늘과 땅을 함께 본다'),
  L('l2a', 2, '대의회당', [3, 3, 4], { command: 1 }, 4, '모든 정착지의 목소리가 모인다'),
  L('l2b', 2, '생명의 정원', [3, 4, 4], { income: { food: 1, culture: 1 } }, 4, '두 세계의 식물이 함께 자란다'),
  L('l2c', 2, '궤도 승강기', [4, 4, 4], { income: { energy: 2 } }, 4, '하늘로 이어지는 실'),
  L('l2d', 2, '방벽 도시', [3, 3, 4], { might: 2, health: 1 }, 4, '포자 안개도 넘지 못하는 벽'),
  L('l3a', 3, '기억의 방주', [4, 5, 5, 6], { income: { culture: 2 } }, 8, '지구의 모든 기록을 담은 탑'),
  L('l3b', 3, '행성 의식', [4, 5, 5, 6], { income: { sci: 2 } }, 8, '행성 전체가 하나의 생각을 한다'),
  L('l3c', 3, '강철 성채', [5, 5, 6], { might: 4, defense: 1 }, 6, '어떤 무리도 넘지 못하는 요새'),
  L('l3d', 3, '별빛 극장', [4, 4, 5], { income: { culture: 1 }, health: 2 }, 6, '모두가 같은 하늘을 본다'),
];

export const SUPPLIES: SupplyDef[] = [
  // 고리 1: 12장
  S('s1f', 1, '식량 상자', 2, { gain: { food: 3 } }),
  S('s1p', 1, '자재 상자', 2, { gain: { prod: 3 } }),
  S('s1e', 1, '연료 전지', 2, { gain: { energy: 3 } }),
  S('s1s', 1, '탐사 기록', 2, { gain: { sci: 3 } }),
  S('s1c', 1, '고향의 편지', 1, { gain: { culture: 2 } }),
  S('s1m', 1, '동면 해제', 2, { colonist: 1 }),
  S('s1d', 1, '정착 교본', 1, { gain: { food: 1, prod: 1, sci: 1 } }),
  // 고리 2: 15장
  S('s2f', 2, '식량 저장고', 2, { gain: { food: 5 } }),
  S('s2p', 2, '공장 출하', 2, { gain: { prod: 5 } }),
  S('s2e', 2, '축전 함', 2, { gain: { energy: 4 } }),
  S('s2s', 2, '연구 보고서', 2, { gain: { sci: 5 } }),
  S('s2c', 2, '축제', 2, { gain: { culture: 3 } }),
  S('s2m', 2, '이주선 도착', 1, { colonist: 1, gain: { food: 2 } }),
  S('s2a', 2, '방주 교리문', 1, { doctrine: { ark: 2 } }),
  S('s2b', 2, '공생 의례', 1, { doctrine: { symbiont: 2 } }),
  S('s2y', 2, '합성 설계도', 1, { doctrine: { synth: 2 } }),
  S('s2d', 2, '교역 호송대', 1, { gain: { food: 2, prod: 2, energy: 2 } }),
  // 고리 3: 15장
  S('s3f', 3, '풍년', 2, { gain: { food: 7 } }),
  S('s3p', 3, '대량 생산', 2, { gain: { prod: 7 } }),
  S('s3e', 3, '핵융합 전지', 2, { gain: { energy: 6 } }),
  S('s3s', 3, '대발견', 2, { gain: { sci: 7 } }),
  S('s3c', 3, '걸작', 2, { gain: { culture: 5 } }),
  S('s3m', 3, '새 세대', 1, { colonist: 1, gain: { culture: 2 } }),
  S('s3a', 3, '방주 서사시', 1, { doctrine: { ark: 3 } }),
  S('s3b', 3, '공생 합창', 1, { doctrine: { symbiont: 3 } }),
  S('s3y', 3, '합성 각성', 1, { doctrine: { synth: 3 } }),
  S('s3d', 3, '행성 박람회', 1, { gain: { culture: 3, sci: 3 } }),
];

// 습격 카드(Rules 10.2): 고리마다 4장
export const RAIDS: RaidDef[] = [
  RD('r1a', 1, '창고 기습', ['lootFood', 'lootProd'], 0, 0, '밤사이 남의 창고 문을 연다'),
  RD('r1b', 1, '기록 탈취', ['stealSci'], 1, 0, '탐사 기록을 몰래 베껴 온다'),
  RD('r1c', 1, '전지 약탈', ['stealEnergy'], 1, 0, '충전된 전지를 통째로 들고 온다'),
  RD('r1d', 1, '야간 기습', ['lootFood', 'lootProd', 'stealSci', 'stealEnergy'], 0, 0, '어둠을 틈타 무엇이든 챙긴다'),
  RD('r2a', 2, '보급로 차단', ['lootFood', 'lootProd'], 1, 1, '이웃 정착지의 수송로를 끊는다'),
  RD('r2b', 2, '연구소 잠입', ['stealSci'], 2, 1, '경비를 피해 실험 자료를 빼낸다'),
  RD('r2c', 2, '송전망 습격', ['stealEnergy'], 2, 1, '송전선에 몰래 줄을 댄다'),
  RD('r2d', 2, '기동 기습', ['lootFood', 'lootProd', 'stealSci', 'stealEnergy'], 1, 0, '빠르게 치고 빠진다'),
  RD('r3a', 3, '봉쇄 작전', ['lootFood', 'lootProd'], 2, 2, '정착지 전체를 포위해 물자를 거둔다'),
  RD('r3b', 3, '두뇌 유출', ['stealSci'], 3, 2, '연구자들을 꾀어 자료째 데려온다'),
  RD('r3c', 3, '발전소 점거', ['stealEnergy'], 3, 2, '발전 시설을 잠시 손에 넣는다'),
  RD('r3d', 3, '전격 습격', ['lootFood', 'lootProd', 'stealSci', 'stealEnergy'], 2, 1, '하늘과 땅에서 동시에 들이친다'),
];

// 분쟁 카드(Rules 10.3): 2·3고리에 3장씩
export const CONFLICTS: ConflictDef[] = [
  CF('c2a', 2, '명예 분쟁', 'culture', 0, '누구의 이야기가 행성에 남을지 다툰다'),
  CF('c2b', 2, '영역 분쟁', 'building', 0, '경계선 위의 시설을 두고 맞선다'),
  CF('c2c', 2, '교리 분쟁', 'doctrine', 0, '어떤 길이 옳은지 힘으로 가린다'),
  CF('c3a', 3, '패권 분쟁', 'culture', 2, '행성의 주인이 누구인지 묻는다'),
  CF('c3b', 3, '대륙 분쟁', 'building', 2, '대륙 하나를 두고 정착지가 충돌한다'),
  CF('c3c', 3, '노선 전면전', 'doctrine', 2, '세 갈래 길 중 하나만 남긴다'),
];

export const CARD_DEFS: Record<string, CardDef> = Object.fromEntries(
  [...PIONEERS, ...LEGACIES, ...SUPPLIES, ...RAIDS, ...CONFLICTS].map((c) => [c.id, c]),
);

/** 고리별 카드 id 목록(자원 팟은 장수만큼 반복) */
export function ringDeckIds(ring: Ring): string[] {
  const ids: string[] = [];
  for (const p of PIONEERS) if (p.ring === ring) ids.push(p.id);
  for (const l of LEGACIES) if (l.ring === ring) ids.push(l.id);
  for (const s of [...SUPPLIES, ...RAIDS, ...CONFLICTS]) if (s.ring === ring) for (let i = 0; i < s.copies; i++) ids.push(s.id);
  return ids;
}
