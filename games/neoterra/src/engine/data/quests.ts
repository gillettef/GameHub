// 퀘스트 트랙 사건 카드와 종료 묶음 (Rules.md 12절). 1시대 14 · 2시대 16 · 3시대 16 + 종료 5
import type { CardDef, ContestQuest, FacilityDef, FinaleQuest, FruitionQuest, JudgeQuest, PatronQuest, QuestDef, QuestOption, Ring, ThreatQuest } from '../types';
import { CARD_DEFS, ringDeckIds } from './cards';

/** 세 노선 선택지를 한 번에 만든다: 노선 점수 n + 각자의 자원 */
function opts(n: number, ark: QuestOption['gain'], sym: QuestOption['gain'], syn: QuestOption['gain']): QuestOption[] {
  return [
    { doctrine: 'ark', points: n, gain: ark },
    { doctrine: 'symbiont', points: n, gain: sym },
    { doctrine: 'synth', points: n, gain: syn },
  ];
}
const J = (id: string, era: Ring, name: string, cond: JudgeQuest['cond'], options: QuestOption[], text: string, failLoss?: JudgeQuest['failLoss']): JudgeQuest => ({ kind: 'judge', id, era, name, cond, options, text, failLoss });
const T = (id: string, era: Ring, name: string, power: number, target: ThreatQuest['target'], reward: ThreatQuest['reward'], loss: ThreatQuest['loss'], text: string): ThreatQuest => ({ kind: 'threat', id, era, name, power, target, reward, loss, text });
const C = (id: string, era: Ring, name: string, cond: ContestQuest['cond'], cost: ContestQuest['cost'], options: QuestOption[], text: string, facility?: string): ContestQuest => ({ kind: 'contest', id, era, name, cond, cost, options, text, facility });
const PQ = (id: string, era: Ring, name: string, text: string): PatronQuest => ({ kind: 'patron', id, era, name, text });

export const FACILITIES: FacilityDef[] = [
  { id: 'f_beacon', name: '착륙 신호소', mods: { sight: 1 }, text: '궤도와 늘 연결된 신호탑' },
  { id: 'f_granary', name: '균사 저장고', mods: { income: { food: 1 }, foodUpkeep: 1 }, text: '썩지 않는 저장고' },
  { id: 'f_observatory', name: '궤도 관측소', mods: { sight: 1, income: { sci: 1 } }, text: '하늘 너머를 읽는다' },
  { id: 'f_bastion', name: '외곽 보루', mods: { might: 2 }, text: '정착지 바깥의 첫 방어선' },
  { id: 'f_reactor', name: '심층 반응로', mods: { income: { energy: 2 }, sporeCap: 2 }, text: '지열을 끌어올리는 반응로' },
  { id: 'f_archive', name: '두 세계 기록관', mods: { income: { culture: 1 }, health: 1 }, text: '지구와 행성의 이야기를 함께 남긴다' },
  { id: 'f_foundry', name: '궤도 주조소', mods: { income: { prod: 2 } }, text: '무중력에서 강철을 붓는다' },
  { id: 'f_sanctum', name: '포자 성소', mods: { health: 2, sporeCap: 3 }, text: '안개가 가라앉는 고요한 곳' },
];
export const FACILITY_DEFS: Record<string, FacilityDef> = Object.fromEntries(FACILITIES.map((f) => [f.id, f]));

const ERA1: QuestDef[] = [
  J('q1j1', 1, '첫 수확', [{ metric: 'farms', min: 3 }], opts(1, { culture: 1 }, { culture: 1, food: 1 }, { prod: 2 }), '행성의 흙에서 처음으로 작물이 자랐다'),
  J('q1j2', 1, '지형 측량', [{ metric: 'nodes', min: 4 }], opts(1, { culture: 2 }, { sci: 4 }, { energy: 5 }), '착륙지 주변의 지도가 완성되었다'),
  J('q1j3', 1, '정착지 축제', [{ metric: 'health', min: 2 }], opts(1, { culture: 2 }, { culture: 1, food: 2 }, { prod: 4 }), '모두가 모여 첫 해를 기념한다', { res: { culture: 1 } }),
  J('q1j4', 1, '광맥 발견', [{ metric: 'workshops', min: 3 }], opts(1, { prod: 2 }, { food: 2 }, { prod: 3 }), '언덕 아래에서 금속 광맥이 드러났다'),
  J('q1j5', 1, '야간 경계', [{ metric: 'might', min: 3 }], opts(1, { culture: 1 }, { culture: 1, food: 1 }, { energy: 3 }), '밤마다 울음소리가 가까워진다', { res: { food: 1 } }),
  T('q1t1', 1, '굴파기 무리', 3, 'weakest', { food: 2 }, { res: { food: 2 } }, '땅속에서 무언가가 저장고를 노린다'),
  T('q1t2', 1, '포자 폭풍', 4, 'energyMost', { energy: 2 }, { res: { energy: 3 } }, '쌓인 에너지에 이끌린 포자가 몰려온다'),
  T('q1t3', 1, '갑각 떼', 4, 'weakest2', { prod: 2 }, { res: { prod: 2 } }, '단단한 껍질의 무리가 들판을 지난다'),
  T('q1t4', 1, '밤사냥꾼', 5, 'weakest', { culture: 2 }, { downgrade: 1 }, '빛을 싫어하는 포식자'),
  T('q1t5', 1, '덩굴 침식', 3, 'all', { food: 1 }, { res: { food: 1 } }, '덩굴이 모든 정착지의 벽을 타고 오른다'),
  C('q1c1', 1, '착륙 신호소', [{ metric: 'powers', min: 1 }], { prod: 3 }, opts(1, {}, {}, {}), '궤도와 다시 연결할 신호탑', 'f_beacon'),
  C('q1c2', 1, '균사 저장고', [{ metric: 'farms', min: 3 }], { prod: 3 }, opts(1, {}, { food: 2 }, {}), '토착 균사로 만든 저장고', 'f_granary'),
  PQ('q1p1', 1, '본국의 첫 제안', '지구의 한 세력이 개척지를 지원하겠다고 연락해 왔다'),
  PQ('q1p2', 1, '보급 협상', '다음 보급선의 짐칸을 놓고 본국 세력들이 경쟁한다'),
];

const ERA2: QuestDef[] = [
  J('q2j1', 2, '정착지 연합', [{ metric: 'buildings', min: 8 }], opts(1, { culture: 3 }, { culture: 2, food: 3 }, { prod: 6 }), '흩어진 정착지들이 도로로 이어졌다'),
  J('q2j2', 2, '대학 설립', [{ metric: 'labs', min: 2 }, { metric: 'nodes', min: 9 }], opts(2, { culture: 2 }, { sci: 4 }, { sci: 4 }), '첫 세대가 행성에서 배운다'),
  J('q2j3', 2, '토착 접촉', [{ metric: 'symbiont', min: 4 }], opts(2, { culture: 2 }, { culture: 1, food: 3 }, { energy: 3 }), '토착 생물이 먼저 다가왔다'),
  J('q2j4', 2, '방벽 완공', [{ metric: 'ark', min: 4 }, { metric: 'might', min: 6 }], opts(2, { culture: 3 }, { culture: 2, food: 3 }, { prod: 6 }), '정착지를 두르는 벽이 완성되었다', { res: { culture: 2 } }),
  J('q2j5', 2, '전력망', [{ metric: 'synth', min: 4 }, { metric: 'powers', min: 1 }], opts(2, { culture: 2 }, { culture: 1, food: 2 }, { energy: 5 }), '모든 집에 불이 들어왔다'),
  J('q2j6', 2, '인구 증가', [{ metric: 'colonists', min: 12 }], opts(1, { culture: 3 }, { culture: 2, food: 3 }, { prod: 6 }), '행성에서 태어난 아이들이 늘었다', { res: { food: 2 } }),
  T('q2t1', 2, '거대 갑각수', 7, 'weakest', { prod: 3 }, { downgrade: 1, res: { prod: 2 } }, '집채만 한 껍질이 벽에 부딪힌다'),
  T('q2t2', 2, '포자 해일', 6, 'energyMost', { energy: 3 }, { res: { energy: 4 }, downgrade: 1 }, '안개가 해일처럼 밀려온다'),
  T('q2t3', 2, '하늘 날개 떼', 8, 'weakest2', { culture: 2 }, { res: { food: 3 } }, '하늘을 덮는 날개 소리'),
  T('q2t4', 2, '공생의 반동', 9, 'symbiont', { food: 3 }, { colonist: 1 }, '섞인 생물들이 본래의 무리로 돌아간다'),
  T('q2t5', 2, '군체 각성', 7, 'all', { sci: 2 }, { res: { prod: 2 } }, '땅속 군체가 한꺼번에 깨어났다'),
  C('q2c1', 2, '궤도 관측소', [{ metric: 'satellites', min: 1 }], { prod: 6 }, opts(1, {}, {}, { sci: 2 }), '하늘을 읽는 관측소', 'f_observatory'),
  C('q2c2', 2, '외곽 보루', [{ metric: 'might', min: 7 }], { prod: 5 }, opts(1, { culture: 1 }, {}, {}), '정착지 바깥의 첫 방어선', 'f_bastion'),
  C('q2c3', 2, '심층 반응로', [{ metric: 'powers', min: 2 }], { prod: 6 }, opts(1, {}, {}, { energy: 2 }), '지열을 끌어올리는 반응로', 'f_reactor'),
  PQ('q2p1', 2, '본국 투자 설명회', '지구의 세력들이 개척지의 성과를 보고 투자처를 고른다'),
  PQ('q2p2', 2, '독점 계약 제안', '한 세력이 독점 공급 계약을 내밀었다'),
];

const ERA3: QuestDef[] = [
  J('q3j1', 3, '행성 문화제', [{ metric: 'cultureRate', min: 5 }], opts(2, { culture: 4 }, { culture: 4 }, { culture: 4 }), '두 세계의 예술이 한 무대에 오른다'),
  J('q3j2', 3, '기술 특이점', [{ metric: 'nodes', min: 18 }], opts(2, { culture: 3 }, { sci: 6 }, { sci: 6 }), '연구가 스스로 연구를 낳기 시작했다'),
  J('q3j3', 3, '대도시', [{ metric: 'buildingLevels', min: 20 }], opts(2, { culture: 4 }, { culture: 2, food: 4 }, { prod: 8 }), '정착지가 도시가 되었다'),
  J('q3j4', 3, '요새 행성', [{ metric: 'might', min: 15 }], opts(1, { culture: 4 }, { culture: 2, food: 4 }, { energy: 9 }), '어떤 위협도 두렵지 않다', { res: { culture: 3 } }),
  J('q3j5', 3, '정체성 선언', [{ metric: 'doctrineTotal', min: 20 }], opts(2, { culture: 3 }, { culture: 3 }, { culture: 3 }), '우리는 더 이상 지구인이 아니다'),
  J('q3j6', 3, '자급 경제', [{ metric: 'foodRate', min: 8 }], opts(1, { culture: 3 }, { culture: 2, food: 3 }, { prod: 6 }), '본국 보급 없이도 살아갈 수 있다', { res: { culture: 2 } }),
  T('q3t1', 3, '고대 수호자', 13, 'weakest', { culture: 4 }, { downgrade: 2 }, '행성 깊은 곳의 거대한 존재가 일어섰다'),
  T('q3t2', 3, '포자 대폭발', 12, 'energyMost', { energy: 4 }, { res: { energy: 6 }, downgrade: 1 }, '행성 전체가 숨을 내쉰다'),
  T('q3t3', 3, '방주 거부 반응', 14, 'ark', { culture: 3 }, { downgrade: 1, colonist: 1 }, '행성이 지구의 흔적을 밀어낸다'),
  T('q3t4', 3, '기계 잠식', 14, 'synth', { culture: 3 }, { downgrade: 1, res: { energy: 4 } }, '토착 균류가 회로를 먹어 들어간다'),
  T('q3t5', 3, '대이동', 11, 'all', { culture: 2 }, { res: { food: 3 } }, '행성의 모든 무리가 한 방향으로 움직인다'),
  C('q3c1', 3, '두 세계 기록관', [{ metric: 'ark', min: 8 }, { metric: 'halls', min: 2 }], { prod: 8 }, opts(2, { culture: 2 }, { culture: 2 }, { culture: 2 }), '지구와 행성의 이야기를 함께 남긴다', 'f_archive'),
  C('q3c2', 3, '궤도 주조소', [{ metric: 'synth', min: 8 }, { metric: 'satellites', min: 1 }], { prod: 8 }, opts(1, {}, {}, { prod: 2 }), '무중력에서 강철을 붓는다', 'f_foundry'),
  C('q3c3', 3, '포자 성소', [{ metric: 'symbiont', min: 8 }], { prod: 7 }, opts(2, {}, { food: 2 }, {}), '안개가 가라앉는 고요한 곳', 'f_sanctum'),
  PQ('q3p1', 3, '본국 마지막 지원', '지구의 세력들이 마지막 투자를 결정한다'),
  PQ('q3p2', 3, '전략 동반자', '본국의 한 세력이 장기 동반자를 찾는다'),
];

export const FRUITIONS: FruitionQuest[] = [
  { kind: 'fruition', id: 'e_ark', doctrine: 'ark', name: '방주의 결실', text: '지구의 모습을 끝까지 지켜 낸 이들의 기록' },
  { kind: 'fruition', id: 'e_symbiont', doctrine: 'symbiont', name: '공생의 결실', text: '행성과 하나가 된 이들의 노래' },
  { kind: 'fruition', id: 'e_synth', doctrine: 'synth', name: '합성의 결실', text: '육체를 넘어선 이들의 설계도' },
];
export const FINALES: FinaleQuest[] = [
  { kind: 'finale', id: 'e_frontier', name: '개척의 기록', metric: 'nodes', divisor: 2, text: '연구 노드 수 ÷ 2 문화' },
  { kind: 'finale', id: 'e_prosper', name: '번영의 기록', metric: 'buildingLevels', divisor: 2, text: '건물 레벨 합 ÷ 2 문화' },
];

export const QUEST_DECKS: Record<Ring, QuestDef[]> = { 1: ERA1, 2: ERA2, 3: ERA3 };
export const QUEST_DEFS: Record<string, QuestDef> = Object.fromEntries(
  [...ERA1, ...ERA2, ...ERA3, ...FRUITIONS, ...FINALES].map((q) => [q.id, q]),
);

/** 시대 퀘스트 덱 구성: 사건 카드 + 그 고리의 후원자·유산·자원 팟 (Rules.md 3.1) */
export function eraDeckIds(ring: Ring): string[] {
  return [...QUEST_DECKS[ring].map((q) => q.id), ...ringDeckIds(ring)];
}

/** 퀘스트 트랙의 카드 하나: 사건 카드(QuestDef) 또는 후원자·유산·자원 팟(CardDef) */
export type TrackDef = { src: 'quest'; def: QuestDef } | { src: 'card'; def: CardDef };
export function trackDef(id: string): TrackDef | null {
  if (QUEST_DEFS[id]) return { src: 'quest', def: QUEST_DEFS[id] };
  if (CARD_DEFS[id]) return { src: 'card', def: CARD_DEFS[id] };
  return null;
}
export function trackName(id: string): string {
  return trackDef(id)?.def.name ?? '?';
}
/** 종료 묶음(결실·공통 종료) 카드는 고를 수 없다 */
export function isEndCard(id: string): boolean {
  const k = QUEST_DEFS[id]?.kind;
  return k === 'fruition' || k === 'finale';
}
