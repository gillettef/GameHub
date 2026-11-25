// PLACEHOLDER 데이터 — CLAUDE.md "Mock 데이터 정책"에 따라 창작한 스폰서 카드 36장 (p.18 구조 기준). 실제 카드 데이터로 교체 예정.
// 리밸런싱(사용자 요청, 2026-09-24): 자원 트랙(돈/팬덤/운영/체력)을 올려주는 효과가 너무 적다는 피드백에 따라, 광고판·유니폼
// 효과 대부분이 그 카드의 테마 자원에 moveTrack +1을 포함하도록 gainResource 일부를 교체했다(총가치는 아래 척도대로 유지).
// 규칙서 예시 sp-01과 훈련/토큰 제거/전술 등 고유 메커니즘이 이미 테마인 카드 일부는 그대로 두었다.
// 균형 원칙(사용자 결정, 2026-09; 리밸런싱 2026-09-22):
//   - 장내 방송(kit): 1회성·즉시 효과 위주, 셋 중 가장 약함 ≈ 3.
//   - 광고판(billboard): 카드가 남고 효과 **또는** 추가 보너스 택1이므로 둘의 가치를 같게 맞춘다 — 효과 ≈ 4, 추가 보너스 ≈ 4.
//   - 유니폼(naming): 효과 **+** 추가 보너스 모두 받으므로 유니폼 효과는 광고판 효과에서 약간 줄인 값 ≈ 3 (대개 자원 1개 적음). 합계 ≈ 7.
// 가치 척도: 자원 1 = 1, 트랙 +1 ≈ 2, 승점 ≈ 3, 훈련 ≈ 3, 전술 카드 ≈ 1.5, 체력 올려놓기 ≈ 1, 부상·영구 약점 제거 ≈ 2(상황에 따라),
// 상시 효과 관중석 +1 ≈ 3 / 승리마다 팬덤 ≈ 2, 유지비 −N ≈ N. 추가 보너스는 상황 의존 효과(토큰 제거 등)만으로 두지 않고 확정 보상을 함께 붙여 ≈ 4를 보장한다.
// 일시적 약점은 다음 경기 뒤 어차피 버려지므로(friday.ts) 제거 효과의 가치가 낮다 — 규칙서 예시(p.18)를 따른 sp-01 에만 남겼다.
import type { SponsorCard } from '../engine/types';

export const SPONSOR_CARDS: SponsorCard[] = [
  {
    id: 'sp-01',
    name: '슬로우 커피',
    description: '느긋한 오후를 파는 동네 커피 체인으로, 구단 앞에 통 큰 돈을 내밀었습니다.',
    kit: [{ type: 'gainResource', resource: 'money', amount: 3 }],
    billboard: [
      { type: 'gainResource', resource: 'money', amount: 3 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    naming: [
      { type: 'gainResource', resource: 'money', amount: 2 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    extraBonus: [
      { type: 'removePlayerToken', token: 'weaknessTemp', count: 3, spread: true },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-02',
    name: '번개 택배',
    description: '무엇이든 하루 만에 배송하는 물류 회사로, 구단 운영을 한층 빠르게 만들어 줍니다.',
    kit: [{ type: 'gainResource', resource: 'ops', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'drawTactic', count: 2 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-03',
    name: 'Probably Pizza',
    description: '아마도 피자일 무언가를 파는 배달 전문점으로, 경기장 근처 팬들에게 인기가 많습니다.',
    kit: [{ type: 'gainResource', resource: 'fandom', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-04',
    name: '철벽 보험',
    description: '선수 부상 보험을 전문으로 하는 회사로, 계약하면 의무실이 한결 여유로워집니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 2 },
      { type: 'removePlayerToken', token: 'weaknessTemp', count: 1 },
    ],
    billboard: [
      { type: 'gainResource', resource: 'money', amount: 2 },
      { type: 'removePlayerToken', token: 'injury', count: 1 },
    ],
    naming: [
      { type: 'gainResource', resource: 'money', amount: 1 },
      { type: 'removePlayerToken', token: 'injury', count: 1 },
    ],
    extraBonus: [
      { type: 'removePlayerToken', token: 'weaknessPerm', count: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-05',
    name: '새벽 우유',
    description: '매일 아침 선수단에 신선한 우유를 배달해 주는 지역 목장 브랜드입니다.',
    kit: [{ type: 'gainResource', resource: 'stamina', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    extraBonus: [
      { type: 'trainPlayer', count: 1 },
      { type: 'placeStamina', count: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-06',
    name: '초록 에너지',
    description: '스타디움 지붕에 태양광 패널을 얹어 주겠다는 친환경 에너지 기업입니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 2 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-07',
    name: '하늘 항공',
    description: '원정 경기 전세기를 제공하는 항공사로, 팬들과 함께 하늘길을 열어 줍니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 2 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'drawTactic', count: 2 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-08',
    name: '골든 부츠',
    description: '축구화 장인이 운영하는 공방으로, 선수들의 발끝을 책임집니다.',
    kit: [{ type: 'gainResource', resource: 'money', amount: 3 }],
    billboard: [
      { type: 'trainPlayer', count: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    naming: [{ type: 'trainPlayer', count: 1 }],
    extraBonus: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-09',
    name: '캐치! 스낵',
    description: '경기장 매점의 단골 과자 브랜드로, 팬들의 입을 즐겁게 합니다.',
    kit: [{ type: 'gainResource', resource: 'fandom', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-10',
    name: '반달 은행',
    description: '돈은 넉넉히 내놓지만 조건이 까다로운 지역 은행입니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 4 },
      { type: 'gainResource', resource: 'fandom', amount: -1 },
    ],
    billboard: [
      { type: 'gainResource', resource: 'money', amount: 5 },
      { type: 'gainResource', resource: 'ops', amount: -1 },
    ],
    naming: [
      { type: 'gainResource', resource: 'money', amount: 4 },
      { type: 'gainResource', resource: 'ops', amount: -1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-11',
    name: '돌핀 스포츠웨어',
    description: '가볍고 통기성 좋은 훈련복을 만드는 스포츠웨어 브랜드입니다.',
    kit: [
      { type: 'gainResource', resource: 'stamina', amount: 2 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    extraBonus: [
      { type: 'removePlayerToken', token: 'weaknessPerm', count: 1 },
      { type: 'moveTrack', track: 'stamina', delta: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-12',
    name: '미드나잇 라디오',
    description: '밤마다 구단 소식을 전하는 지역 라디오 방송국입니다.',
    kit: [
      { type: 'gainResource', resource: 'fandom', amount: 2 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    extraBonus: [
      { type: 'passive', passive: 'fandomOnWin' },
      { type: 'gainResource', resource: 'fandom', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-13',
    name: '튼튼 건설',
    description: '스타디움 증축을 도맡겠다는 건설사로, 자재를 원가에 대 줍니다.',
    kit: [{ type: 'gainResource', resource: 'money', amount: 3 }],
    billboard: [
      { type: 'gainResource', resource: 'money', amount: 2 },
      { type: 'moveTrack', track: 'money', delta: 1 },
    ],
    naming: [
      { type: 'gainResource', resource: 'money', amount: 1 },
      { type: 'moveTrack', track: 'money', delta: 1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-14',
    name: '퍼플 모바일',
    description: '구단 전용 요금제를 내놓은 통신사로, 사무실 업무가 한결 수월해집니다.',
    kit: [{ type: 'gainResource', resource: 'ops', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-15',
    name: '올드타운 브루어리',
    description: '경기 후 팬들이 모여드는 오래된 양조장으로, 서포터즈와 각별한 사이입니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 2 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'passive', passive: 'extraStand' },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-16',
    name: '라이트하우스 물류',
    description: '항구 도시의 대형 물류 회사로, 구단 장비 운송을 전담합니다.',
    kit: [
      { type: 'gainResource', resource: 'ops', amount: 2 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    extraBonus: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-17',
    name: '닥터 물리치료',
    description: '스포츠 재활 전문 클리닉으로, 부상 선수의 복귀를 앞당겨 줍니다.',
    kit: [
      { type: 'removePlayerToken', token: 'injury', count: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    billboard: [
      { type: 'removePlayerToken', token: 'injury', count: 1 },
      { type: 'moveTrack', track: 'stamina', delta: 1 },
    ],
    naming: [
      { type: 'removePlayerToken', token: 'injury', count: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    extraBonus: [
      { type: 'removePlayerToken', token: 'weaknessPerm', count: 1 },
      { type: 'moveTrack', track: 'stamina', delta: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-18',
    name: '스타라이트 화장품',
    description: '선수들을 광고 모델로 기용하고 싶어 하는 화장품 브랜드입니다.',
    kit: [{ type: 'gainResource', resource: 'fandom', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-19',
    name: '큰바위 타이어',
    description: '구단 버스 타이어를 무상 교체해 주는 타이어 제조사입니다.',
    kit: [
      { type: 'gainResource', resource: 'stamina', amount: 2 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'removePlayerToken', token: 'weaknessPerm', count: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-20',
    name: '점프 트램폴린 파크',
    description: '선수단 체력 훈련장을 무료로 개방해 주는 실내 놀이 시설입니다.',
    kit: [{ type: 'gainResource', resource: 'stamina', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    extraBonus: [
      { type: 'trainPlayer', count: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-21',
    name: '팬케이크 하우스',
    description: '홈경기 날 아침마다 팬들에게 팬케이크를 나눠 주는 브런치 카페입니다.',
    kit: [{ type: 'gainResource', resource: 'fandom', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    extraBonus: [
      { type: 'passive', passive: 'extraStand' },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-22',
    name: '시계탑 시계',
    description: '정확함을 자랑하는 시계 제조사로, 구단 사무실의 일정 관리를 후원합니다.',
    kit: [{ type: 'gainResource', resource: 'ops', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    extraBonus: [
      { type: 'drawTactic', count: 2 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-23',
    name: '얼음 왕국 냉동식품',
    description: '선수 식당에 냉동식품을 대량 납품하는 식품 회사입니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 2 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'upkeepDiscount', amount: 2 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-24',
    name: '헤이! 택시',
    description: '도시 어디서든 5분 안에 오는 택시 앱으로, 구단 직원들의 발이 되어 줍니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 2 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'drawTactic', count: 2 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-25',
    name: '왕관 호텔',
    description: '원정 팀 숙소로 유명한 고급 호텔로, 구단에 넉넉한 후원금을 약속했습니다.',
    kit: [{ type: 'gainResource', resource: 'money', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-26',
    name: '노을 여행사',
    description: '원정 응원 패키지를 파는 여행사로, 팬과 선수단이 함께 움직이게 합니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    extraBonus: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'placeStamina', count: 1 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-27',
    name: '바람개비 게임즈',
    description: '축구 전술 시뮬레이션 게임을 만드는 회사로, 코치진에게 분석 도구를 제공합니다.',
    kit: [
      { type: 'drawTactic', count: 1 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    billboard: [
      { type: 'drawTactic', count: 2 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    naming: [{ type: 'drawTactic', count: 2 }],
    extraBonus: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-28',
    name: '청춘 학원',
    description: '유소년 축구 교실을 운영하는 학원으로, 훈련 프로그램을 공유해 줍니다.',
    kit: [{ type: 'gainResource', resource: 'stamina', amount: 3 }],
    billboard: [
      { type: 'trainPlayer', count: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    naming: [{ type: 'trainPlayer', count: 1 }],
    extraBonus: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'placeStamina', count: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-29',
    name: '파이어웍스 폭죽',
    description: '홈경기 승리마다 밤하늘을 수놓는 불꽃놀이 업체입니다.',
    kit: [{ type: 'gainResource', resource: 'fandom', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'fandom', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    extraBonus: [
      { type: 'passive', passive: 'fandomOnWin' },
      { type: 'gainResource', resource: 'fandom', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-30',
    name: '그레이 정장',
    description: '임원진의 단골 양복점으로, 구단의 품격을 높여 줍니다.',
    kit: [{ type: 'gainResource', resource: 'money', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-31',
    name: '마운틴 생수',
    description: '고산지대에서 길어 온 생수를 선수단에 무제한 공급하는 브랜드입니다.',
    kit: [{ type: 'gainResource', resource: 'stamina', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    extraBonus: [
      { type: 'moveTrack', track: 'stamina', delta: 1 },
      { type: 'placeStamina', count: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-32',
    name: '리본 문구',
    description: '구단 사무실의 모든 서류와 문구를 책임지는 문구 전문 업체입니다.',
    kit: [{ type: 'gainResource', resource: 'ops', amount: 3 }],
    billboard: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 1 },
    ],
    extraBonus: [
      { type: 'moveTrack', track: 'ops', delta: 1 },
      { type: 'gainResource', resource: 'ops', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-33',
    name: '코끼리 이삿짐',
    description: '거액을 내놓지만 선수들에게 광고 촬영을 요구해 체력을 빼앗는 이삿짐 센터입니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 4 },
      { type: 'gainResource', resource: 'stamina', amount: -1 },
    ],
    billboard: [
      { type: 'gainResource', resource: 'money', amount: 5 },
      { type: 'gainResource', resource: 'stamina', amount: -1 },
    ],
    naming: [
      { type: 'gainResource', resource: 'money', amount: 4 },
      { type: 'gainResource', resource: 'stamina', amount: -1 },
    ],
    extraBonus: [
      { type: 'gainVP', amount: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-34',
    name: '별빛 영화관',
    description: '구단 다큐멘터리를 상영해 팬을 끌어모으지만, 촬영 협조에 손이 많이 갑니다.',
    kit: [
      { type: 'gainResource', resource: 'fandom', amount: 4 },
      { type: 'gainResource', resource: 'ops', amount: -1 },
    ],
    billboard: [
      { type: 'gainResource', resource: 'fandom', amount: 5 },
      { type: 'gainResource', resource: 'ops', amount: -1 },
    ],
    naming: [
      { type: 'gainResource', resource: 'fandom', amount: 4 },
      { type: 'gainResource', resource: 'ops', amount: -1 },
    ],
    extraBonus: [
      { type: 'drawTactic', count: 2 },
      { type: 'gainResource', resource: 'fandom', amount: 1 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-35',
    name: '스마일 치과',
    description: '선수단 정기 검진을 맡은 치과로, 고질적인 문제를 말끔히 해결해 줍니다.',
    kit: [
      { type: 'removePlayerToken', token: 'weaknessPerm', count: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    billboard: [
      { type: 'removePlayerToken', token: 'weaknessPerm', count: 1 },
      { type: 'moveTrack', track: 'money', delta: 1 },
    ],
    naming: [
      { type: 'removePlayerToken', token: 'weaknessPerm', count: 1 },
      { type: 'gainResource', resource: 'money', amount: 1 },
    ],
    extraBonus: [
      { type: 'removePlayerToken', token: 'injury', count: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    placeholder: true,
  },
  {
    id: 'sp-36',
    name: '노란 우산 보험',
    description: '구단 운영비를 보장해 주는 보험사로, 주말 유지비 걱정을 덜어 줍니다.',
    kit: [
      { type: 'gainResource', resource: 'money', amount: 1 },
      { type: 'upkeepDiscount', amount: 2 },
    ],
    billboard: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 2 },
    ],
    naming: [
      { type: 'moveTrack', track: 'money', delta: 1 },
      { type: 'gainResource', resource: 'stamina', amount: 1 },
    ],
    extraBonus: [
      { type: 'upkeepDiscount', amount: 2 },
      { type: 'gainResource', resource: 'money', amount: 2 },
    ],
    placeholder: true,
  },
];
