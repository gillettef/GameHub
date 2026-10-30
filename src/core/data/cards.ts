// 카드 줄 덱: 선구자·유산·보급 (Rules.md 11절). 고리별 24·30·30장
import type { CardDef, LegacyDef, PioneerDef, Ring, SupplyDef } from '../types';

const P = (id: string, ring: Ring, name: string, doctrine: PioneerDef['doctrine'], mods: PioneerDef['mods'], text: string): PioneerDef => ({ type: 'pioneer', id, ring, name, doctrine, mods, text });
const L = (id: string, ring: Ring, name: string, stages: number[], mods: LegacyDef['mods'], points: number, text: string): LegacyDef => ({ type: 'legacy', id, ring, name, stages, mods, points, text });
const S = (id: string, ring: Ring, name: string, copies: number, instant: SupplyDef['instant']): SupplyDef => ({ type: 'supply', id, ring, name, copies, instant });

export const PIONEERS: PioneerDef[] = [
  P('p1a', 1, '항해장 하윤', 'ark', { stability: 1, income: { culture: 1 } }, '선단을 이끌고 착륙한 첫 지휘관'),
  P('p1s', 1, '채집가 마루', 'symbiont', { income: { food: 2 } }, '처음으로 행성의 열매를 먹어 본 사람'),
  P('p1y', 1, '기관장 도윤', 'synth', { income: { prod: 1, energy: 1 } }, '착륙선을 해체해 첫 공장을 세웠다'),
  P('p1n', 1, '측량사 세라', 'ark', { income: { sci: 1 }, sight: 1 }, '궤도에서 지형을 그린 측량사'),
  P('p2a', 2, '집정관 이레', 'ark', { command: 1 }, '흩어진 정착지를 하나의 의회로 묶었다'),
  P('p2s', 2, '접촉자 누리', 'symbiont', { unitPower: { rider: 1 }, stability: 1 }, '토착 무리와 처음 말을 나눈 사람'),
  P('p2y', 2, '설계자 카이', 'synth', { defense: 1 }, '자율 경비 체계를 설계했다'),
  P('p2n', 2, '학장 솔', 'synth', { income: { sci: 2 } }, '행성 최초의 대학을 열었다'),
  P('p3a', 3, '수호자 강', 'ark', { might: 3, stability: 1 }, '지구의 기억을 지키는 마지막 기사'),
  P('p3s', 3, '대모 아라', 'symbiont', { income: { food: 2, culture: 1 } }, '행성과 하나가 된 공동체의 어머니'),
  P('p3y', 3, '총체 지성 오르', 'synth', { command: 1, income: { energy: 1 } }, '수천 개의 정신을 이은 합성 지성'),
  P('p3n', 3, '시인 해담', 'symbiont', { income: { culture: 2 } }, '두 세계의 노래를 하나로 엮었다'),
];

export const LEGACIES: LegacyDef[] = [
  L('l1a', 1, '착륙 기념탑', [2, 3], { stability: 1 }, 3, '첫발을 디딘 자리를 기억한다'),
  L('l1b', 1, '수경 농원', [2, 3], { income: { food: 1 } }, 2, '흙 없이도 자라는 지구의 작물'),
  L('l1c', 1, '심층 시추공', [3, 3], { income: { prod: 1 } }, 2, '지각 아래의 광맥을 연다'),
  L('l1d', 1, '첫 관측소', [2, 2], { sight: 1 }, 2, '하늘과 땅을 함께 본다'),
  L('l2a', 2, '대의회당', [3, 3, 4], { command: 1 }, 4, '모든 정착지의 목소리가 모인다'),
  L('l2b', 2, '생명의 정원', [3, 4, 4], { income: { food: 1, culture: 1 } }, 4, '두 세계의 식물이 함께 자란다'),
  L('l2c', 2, '궤도 승강기', [4, 4, 4], { income: { energy: 2 } }, 4, '하늘로 이어지는 실'),
  L('l2d', 2, '방벽 도시', [3, 3, 4], { might: 2, stability: 1 }, 4, '포자 안개도 넘지 못하는 벽'),
  L('l3a', 3, '기억의 방주', [4, 5, 5, 6], { income: { culture: 2 } }, 8, '지구의 모든 기록을 담은 탑'),
  L('l3b', 3, '행성 의식', [4, 5, 5, 6], { income: { sci: 2 } }, 8, '행성 전체가 하나의 생각을 한다'),
  L('l3c', 3, '강철 성채', [5, 5, 6], { might: 4, defense: 1 }, 6, '어떤 무리도 넘지 못하는 요새'),
  L('l3d', 3, '별빛 극장', [4, 4, 5], { income: { culture: 1 }, stability: 2 }, 6, '모두가 같은 하늘을 본다'),
];

export const SUPPLIES: SupplyDef[] = [
  // 고리 1: 16장
  S('s1f', 1, '식량 상자', 3, { gain: { food: 3 } }),
  S('s1p', 1, '자재 상자', 3, { gain: { prod: 3 } }),
  S('s1e', 1, '연료 전지', 2, { gain: { energy: 3 } }),
  S('s1s', 1, '탐사 기록', 3, { gain: { sci: 3 } }),
  S('s1c', 1, '고향의 편지', 2, { gain: { culture: 2 } }),
  S('s1m', 1, '동면 해제', 2, { colonist: 1 }),
  S('s1d', 1, '정착 교본', 1, { gain: { food: 1, prod: 1, sci: 1 } }),
  // 고리 2: 22장
  S('s2f', 2, '식량 저장고', 3, { gain: { food: 5 } }),
  S('s2p', 2, '공장 출하', 3, { gain: { prod: 5 } }),
  S('s2e', 2, '축전 함', 3, { gain: { energy: 4 } }),
  S('s2s', 2, '연구 보고서', 3, { gain: { sci: 5 } }),
  S('s2c', 2, '축제', 3, { gain: { culture: 3 } }),
  S('s2m', 2, '이주선 도착', 2, { colonist: 1, gain: { food: 2 } }),
  S('s2a', 2, '방주 교리문', 1, { doctrine: { ark: 2 } }),
  S('s2b', 2, '공생 의례', 1, { doctrine: { symbiont: 2 } }),
  S('s2y', 2, '합성 설계도', 1, { doctrine: { synth: 2 } }),
  S('s2d', 2, '교역 호송대', 2, { gain: { food: 2, prod: 2, energy: 2 } }),
  // 고리 3: 22장
  S('s3f', 3, '풍년', 3, { gain: { food: 7 } }),
  S('s3p', 3, '대량 생산', 3, { gain: { prod: 7 } }),
  S('s3e', 3, '핵융합 전지', 3, { gain: { energy: 6 } }),
  S('s3s', 3, '대발견', 3, { gain: { sci: 7 } }),
  S('s3c', 3, '걸작', 3, { gain: { culture: 5 } }),
  S('s3m', 3, '새 세대', 2, { colonist: 1, gain: { culture: 2 } }),
  S('s3a', 3, '방주 서사시', 1, { doctrine: { ark: 3 } }),
  S('s3b', 3, '공생 합창', 1, { doctrine: { symbiont: 3 } }),
  S('s3y', 3, '합성 각성', 1, { doctrine: { synth: 3 } }),
  S('s3d', 3, '행성 박람회', 2, { gain: { culture: 3, sci: 3 } }),
];

export const CARD_DEFS: Record<string, CardDef> = Object.fromEntries(
  [...PIONEERS, ...LEGACIES, ...SUPPLIES].map((c) => [c.id, c]),
);

/** 고리 덱의 카드 id 목록(보급은 장수만큼 반복) */
export function ringDeckIds(ring: Ring): string[] {
  const ids: string[] = [];
  for (const p of PIONEERS) if (p.ring === ring) ids.push(p.id);
  for (const l of LEGACIES) if (l.ring === ring) ids.push(l.id);
  for (const s of SUPPLIES) if (s.ring === ring) for (let i = 0; i < s.copies; i++) ids.push(s.id);
  return ids;
}
