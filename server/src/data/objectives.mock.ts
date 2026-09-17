// placeholder: 목표 카드 12장. 구조는 규칙서 p.27(달성 2승점 + 완벽 달성 추가 2승점), 내용은 임의 (CLAUDE.md Mock 데이터 정책)
import type { ObjectiveCard } from '../engine/types';

export const OBJECTIVE_CARDS: ObjectiveCard[] = [
  { id: 'ob-01', name: '더비', description: '이번 시즌의 가장 중요한 경기입니다. 라이벌 팀을 반드시 이겨야 해요!', goal: '5번째 주의 리그 경기에서 승리합니다.', perfect: '추가로 2골 이상 차이로 승리합니다.', placeholder: true },
  { id: 'ob-02', name: '개막전', description: '시즌 첫 경기부터 팬들에게 확신을 심어 주세요.', goal: '1번째 주의 리그 경기에서 승리합니다.', perfect: '추가로 그 경기에서 상대 팀이 득점하지 못합니다.', placeholder: true },
  { id: 'ob-03', name: '연승 행진', description: '한 번 이기기 시작하면 멈출 수 없습니다.', goal: '리그 경기에서 3주 연속으로 승리합니다.', perfect: '추가로 4주 연속으로 승리합니다.', placeholder: true },
  { id: 'ob-04', name: '정상 등극', description: '트로피는 하나뿐이고, 그것은 우리 것입니다.', goal: '게임 종료 시 리그 성적표에서 1위를 차지합니다.', perfect: '추가로 2위와의 성적표 칸 차이가 3칸 이상입니다.', placeholder: true },
  { id: 'ob-05', name: '드림팀 스태프', description: '경기장 밖에서도 최고의 전문가들이 구단을 지탱합니다.', goal: '같은 세트의 직원 카드 3장을 보유한 채로 게임을 종료합니다.', perfect: '추가로 그 세트의 직원 카드가 4장입니다.', placeholder: true },
  { id: 'ob-06', name: '스타디움 확장', description: '더 많은 관중, 더 많은 상점, 더 밝은 조명. 구장이 자라납니다.', goal: '게임 종료 시 스타디움 기반 시설 토큰을 4개 이상 보유합니다.', perfect: '추가로 6개 이상 보유합니다.', placeholder: true },
  { id: 'ob-07', name: '유스 아카데미', description: '내일의 스타는 우리 유소년 팀에서 자라고 있습니다.', goal: '게임 종료 시 훈련된 유망주를 2명 이상 보유합니다.', perfect: '추가로 그중 1명 이상의 경력 칸에 득점 [승점] 토큰이 있습니다.', placeholder: true },
  { id: 'ob-08', name: '정예 스쿼드', description: '훈련, 훈련, 그리고 또 훈련. 준비된 선수만이 경기장에 섭니다.', goal: '게임 종료 시 훈련된 선수 카드를 4장 이상 보유합니다.', perfect: '추가로 6장 이상 보유합니다.', placeholder: true },
  { id: 'ob-09', name: '든든한 금고', description: '이사회는 결산 보고서의 숫자를 가장 좋아합니다.', goal: '게임 종료 시 [돈]을 10개 이상 보유합니다.', perfect: '추가로 15개 이상 보유합니다.', placeholder: true },
  { id: 'ob-10', name: '무사고 시즌', description: '의료진의 꿈은 조용한 시즌입니다.', goal: '게임 종료 시 선수 카드 위에 [부상] 토큰이 하나도 없습니다.', perfect: '추가로 게임 동안 경기 영향 주사위로 [부상] 토큰을 한 번도 받지 않습니다.', placeholder: true },
  { id: 'ob-11', name: '본사 이전', description: '새 사무실의 창문 너머로 구장 전체가 내려다보입니다.', goal: '게임 종료 시 사무실 트랙에서 3번째 칸(9[승점]) 이상에 도달합니다.', perfect: '추가로 사무실 트랙의 마지막 칸(15[승점])에 도달합니다.', placeholder: true },
  { id: 'ob-12', name: '후원사 총출동', description: '유니폼, 광고판, 구장 이름까지 전부 팔렸습니다.', goal: '게임 종료 시 스폰서 계약을 3건 이상 보유합니다.', perfect: '추가로 키트, 광고판, 명명권 3유형 계약을 각각 1건 이상 보유합니다.', placeholder: true },
];
