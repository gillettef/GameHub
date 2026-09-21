// PLACEHOLDER 데이터 — CLAUDE.md "Mock 데이터 정책"에 따라 만든 이사회 카드 36장 (p.13 구조; bc-01/02는 규칙서 예시 카드 원문, 나머지는 창작). 실제 카드 데이터로 교체 예정.
import type { BoardCard } from '../engine/types';

export const BOARD_CARDS: BoardCard[] = [
  {
    id: 'bc-01',
    name: '기나긴 여정',
    description: '원정 경기가 이번 시즌 중에 가장 먼 곳에서 열립니다.',
    decisions: {
      yellow: {
        text: '다음 주에는 목요일에 카드 행동만 수행할 수 있습니다. 화요일 칸에 [점검용 토큰]을 올려놓습니다.',
        effects: [
          { type: 'restrictDay', day: 'thu', week: 'next', mode: 'cardActionOnly' },
        ],
      },
      blue: {
        // 원문은 2[체력]이지만 출전 체력은 1개뿐이고 남는 것은 경기 후 버려져(p.24 4) 1개로 줄임 (사용자 결정, 2026-09)
        text: '3[돈]과 1[팬덤]을 얻고, 선수 카드 1장을 선택하여 1[체력]을 올려놓습니다.',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 3 },
          { type: 'gainResource', resource: 'fandom', amount: 1 },
          { type: 'placeStamina', count: 1 },
        ],
      },
      red: {
        text: '[돈] -1, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-02',
    name: '부정직한 선수',
    description:
      '선수 중 한 명이 시즌 말에 이적하기 위해 경쟁 구단의 윗선들과 비밀리에 접상을 하고 있다는 것을 알게 되었습니다.',
    decisions: {
      yellow: {
        text: '은밀하게 문제를 해결합니다. 2[돈]을 얻고 [체력] 2를 잃습니다.',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'gainResource', resource: 'stamina', amount: -2 },
        ],
      },
      blue: {
        text: '그가 팀의 사기를 저해한다는 것을 알리고 방출로 처리합니다.',
        effects: [{ type: 'releasePlayer' }],
      },
      red: {
        text: '선수 카드 1장을 선택하고 해당 카드에 2[출장정지]를 올려놓습니다.',
        effects: [{ type: 'addPlayerToken', token: 'suspension', count: 2 }],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-03',
    name: '폭우 속 홈경기',
    description: '주말 내내 폭우가 쏟아져 경기장 잔디가 물에 잠겼습니다. 배수 시설 문제가 다시 도마에 올랐습니다.',
    decisions: {
      yellow: {
        text: '배수 공사에 투자합니다. [돈] -2, 돈 능력치 마커 +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'moveTrack', track: 'money', delta: 1 },
        ],
      },
      blue: {
        text: '진흙탕에서 훈련을 강행합니다. [체력] -2, 선수 카드 1장을 훈련 면으로 뒤집습니다.',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: -2 },
          { type: 'trainPlayer', count: 1 },
        ],
      },
      red: {
        text: '팬들이 복구 작업에 자원봉사로 나섭니다. [팬덤] -1, [운영] +2',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: -1 },
          { type: 'gainResource', resource: 'ops', amount: 2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-04',
    name: '중계권 협상',
    description: '지역 방송국이 홈경기 중계권을 사겠다고 제안했습니다. 조건을 두고 이사진의 의견이 갈립니다.',
    decisions: {
      yellow: {
        text: '가장 높은 금액을 부른 곳과 계약합니다. [돈] +4, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 4 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      blue: {
        text: '전술 분석 영상 제공을 조건으로 겁니다. [돈] +2, 전술 카드 1장, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'drawTactic', count: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      red: {
        text: '팬들이 무료로 볼 수 있게 합니다. [팬덤] +3, [돈] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 3 },
          { type: 'gainResource', resource: 'money', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-05',
    name: '훈련장 화재',
    description: '훈련장 창고에 불이 나 장비 대부분이 소실됐습니다. 다행히 다친 사람은 없습니다.',
    decisions: {
      yellow: {
        text: '최신 장비로 전면 교체합니다. [돈] -3, 체력 능력치 마커 +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -3 },
          { type: 'moveTrack', track: 'stamina', delta: 1 },
        ],
      },
      blue: {
        text: '남은 장비로 버팁니다. [체력] -2, 선수 카드 1장에 1[체력]을 올려놓습니다.',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: -2 },
          { type: 'placeStamina', count: 1 },
        ],
      },
      red: {
        text: '직원들이 밤새 뒷정리를 합니다. [운영] -2, [팬덤] +1',
        effects: [
          { type: 'gainResource', resource: 'ops', amount: -2 },
          { type: 'gainResource', resource: 'fandom', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-06',
    name: '유소년 페스티벌',
    description: '지역 유소년 클럽들이 우리 스타디움에서 축제를 열고 싶어 합니다.',
    decisions: {
      yellow: {
        text: '대관료를 받고 빌려줍니다. [돈] +2, [운영] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
      blue: {
        text: '코치진이 직접 지도에 나섭니다. 선수 카드 1장을 훈련 면으로 뒤집고 [돈] -2',
        effects: [
          { type: 'trainPlayer', count: 1 },
          { type: 'gainResource', resource: 'money', amount: -2 },
        ],
      },
      red: {
        text: '무료로 개방하고 선수들이 사인회를 엽니다. [팬덤] +2, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-07',
    name: '주장의 은퇴 선언',
    description: '팀의 주장이 시즌이 끝나면 은퇴하겠다고 발표했습니다. 라커룸 분위기가 무겁습니다.',
    decisions: {
      yellow: {
        text: '기념 굿즈를 출시합니다. [돈] +2, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      blue: {
        text: '고별 시즌을 위해 마지막 힘을 쏟습니다. 선수 카드 1장에 [영구적 역량] 1개, [체력] -2',
        effects: [
          { type: 'addPlayerToken', token: 'strengthPerm', count: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -2 },
        ],
      },
      red: {
        text: '성대한 고별전을 준비합니다. [팬덤] +2, [운영] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-08',
    name: '심판 판정 논란',
    description: '지난 경기의 판정을 두고 팬들이 격분했습니다. 구단의 공식 입장을 기다리고 있습니다.',
    decisions: {
      yellow: {
        text: '협회에 공식 항의서를 제출합니다. [돈] -1, [팬덤] +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -1 },
          { type: 'gainResource', resource: 'fandom', amount: 1 },
        ],
      },
      blue: {
        text: '선수가 심판에게 거칠게 항의합니다. 선수 카드 1장에 [출장정지] 1개, 전술 카드 1장',
        effects: [
          { type: 'addPlayerToken', token: 'suspension', count: 1 },
          { type: 'drawTactic', count: 1 },
        ],
      },
      red: {
        text: '팬들의 분노에 동참하는 성명을 냅니다. [팬덤] +2, [운영] -2',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'ops', amount: -2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-09',
    name: '스폰서의 요구',
    description: '주요 스폰서가 광고 노출을 늘려 달라고 강하게 요구합니다. 거절하면 관계가 틀어질 수 있습니다.',
    decisions: {
      yellow: {
        text: '요구를 전부 수용합니다. [돈] +3, [팬덤] -2',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 3 },
          { type: 'gainResource', resource: 'fandom', amount: -2 },
        ],
      },
      blue: {
        text: '선수들이 광고 촬영에 나섭니다. [돈] +1, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      red: {
        text: '팬을 우선하며 거절합니다. [팬덤] +1, [돈] -2',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 1 },
          { type: 'gainResource', resource: 'money', amount: -2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-10',
    name: '구단 버스 고장',
    description: '원정길에 구단 버스가 고속도로 한복판에서 멈춰 섰습니다. 선수들은 몇 시간을 갓길에서 보냈습니다.',
    decisions: {
      yellow: {
        text: '새 버스를 구입합니다. [돈] -2, [운영] +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'gainResource', resource: 'ops', amount: 1 },
        ],
      },
      blue: {
        text: '선수들이 대중교통으로 이동합니다. [체력] -2, [팬덤] +1',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: -2 },
          { type: 'gainResource', resource: 'fandom', amount: 1 },
        ],
      },
      red: {
        text: '직원들이 렌터카를 급히 수배합니다. [운영] -2, [체력] +1',
        effects: [
          { type: 'gainResource', resource: 'ops', amount: -2 },
          { type: 'gainResource', resource: 'stamina', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-11',
    name: '지역 축제 후원',
    description: '시청에서 구단에 지역 축제 후원을 요청했습니다. 시와의 관계를 생각하면 무시하기 어렵습니다.',
    decisions: {
      yellow: {
        text: '후원금을 냅니다. [돈] -2, 승점 토큰 1개',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'gainVP', amount: 1 },
        ],
      },
      blue: {
        text: '선수들이 축제 무대에 오릅니다. [체력] -1, [팬덤] +2',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: -1 },
          { type: 'gainResource', resource: 'fandom', amount: 2 },
        ],
      },
      red: {
        text: '직원들이 부스를 운영합니다. [팬덤] +2, [운영] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-12',
    name: '스카우트의 제보',
    description: '스카우트가 인근 리그에서 재능 있는 선수를 발견했다고 보고했습니다. 다른 구단도 눈독을 들이고 있습니다.',
    decisions: {
      yellow: {
        text: '정보를 다른 구단에 팔아넘깁니다. [돈] +2, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      blue: {
        text: '기존 선수의 훈련에 집중합니다. 선수 카드 1장을 훈련 면으로 뒤집고 [돈] -2',
        effects: [
          { type: 'trainPlayer', count: 1 },
          { type: 'gainResource', resource: 'money', amount: -2 },
        ],
      },
      red: {
        text: '스카우트 부서를 확대합니다. [운영] +2, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'ops', amount: 2 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-13',
    name: '독감 유행',
    description: '라커룸에 독감이 돌고 있습니다. 벌써 여러 명이 기침을 하며 훈련에서 빠졌습니다.',
    decisions: {
      yellow: {
        text: '전문 의료진을 부릅니다. [돈] -2, 선수 카드에서 [부상] 1개 제거',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'removePlayerToken', token: 'injury', count: 1 },
        ],
      },
      blue: {
        text: '아픈 선수도 훈련시킵니다. 선수 카드 1장에 [일시적 약점] 2개, [체력] +1',
        effects: [
          { type: 'addPlayerToken', token: 'weaknessTemp', count: 2 },
          { type: 'gainResource', resource: 'stamina', amount: 1 },
        ],
      },
      red: {
        text: '훈련장을 폐쇄하고 소독합니다. [운영] -1, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'ops', amount: -1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-14',
    name: '더비를 앞두고',
    description: '다음 주 라이벌전을 앞두고 도시 전체가 들썩입니다. 티켓은 이미 매진됐습니다.',
    decisions: {
      yellow: {
        text: '프리미엄 좌석을 추가 판매합니다. [돈] +3, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 3 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      blue: {
        text: '핵심 선수의 컨디션 관리에 집중합니다. 선수 카드 1장에 1[체력]',
        effects: [{ type: 'placeStamina', count: 1 }],
      },
      red: {
        text: '대규모 응원전을 조직합니다. [팬덤] +3, [운영] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 3 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-15',
    name: '티켓 값 인상 시위',
    description: '티켓 값 인상 계획이 알려지자 팬클럽이 구단 사무실 앞에서 시위를 벌였습니다.',
    decisions: {
      yellow: {
        text: '계획대로 인상합니다. [돈] +2, [팬덤] -2',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'gainResource', resource: 'fandom', amount: -2 },
        ],
      },
      blue: {
        text: '선수들이 팬들을 직접 설득합니다. [체력] +1, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: 1 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      red: {
        text: '인상을 철회합니다. [팬덤] +2, [돈] -2',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'money', amount: -2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-16',
    name: '이사진 개편',
    description: '이사회에 새 인물이 합류했습니다. 그가 어떤 분야에 힘을 실어 줄지 모두가 주목합니다.',
    decisions: {
      yellow: {
        text: '재정 전문가가 들어옵니다. 돈 능력치 마커 +1, [팬덤] -1',
        effects: [
          { type: 'moveTrack', track: 'money', delta: 1 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      blue: {
        text: '전직 감독이 들어옵니다. 체력 능력치 마커 +1, [돈] -1',
        effects: [
          { type: 'moveTrack', track: 'stamina', delta: 1 },
          { type: 'gainResource', resource: 'money', amount: -1 },
        ],
      },
      red: {
        text: '서포터즈 대표가 들어옵니다. 팬덤 능력치 마커 +1, [운영] -1',
        effects: [
          { type: 'moveTrack', track: 'fandom', delta: 1 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-17',
    name: '잔디 교체 공사',
    description: '경기장 잔디 상태가 리그 기준에 미달한다는 통보를 받았습니다. 전면 교체가 불가피합니다.',
    decisions: {
      yellow: {
        text: '최고급 잔디를 깝니다. [돈] -3, 승점 토큰 1개',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -3 },
          { type: 'gainVP', amount: 1 },
        ],
      },
      blue: {
        text: '공사 중에도 훈련을 계속합니다. [체력] -1, 선수 카드에 [일시적 약점] 1개, [돈] +1',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: -1 },
          { type: 'addPlayerToken', token: 'weaknessTemp', count: 1 },
          { type: 'gainResource', resource: 'money', amount: 1 },
        ],
      },
      red: {
        text: '직원들이 직접 공사를 맡습니다. [운영] -2, [팬덤] +1',
        effects: [
          { type: 'gainResource', resource: 'ops', amount: -2 },
          { type: 'gainResource', resource: 'fandom', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-18',
    name: '국가대표 차출',
    description: '선수 한 명이 국가대표팀에 소집됐습니다. 구단의 자랑이지만 당장 전력 공백이 걱정입니다.',
    decisions: {
      yellow: {
        text: '협회로부터 보상금을 받습니다. [돈] +2, 선수 카드에 [일시적 약점] 1개',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'addPlayerToken', token: 'weaknessTemp', count: 1 },
        ],
      },
      blue: {
        text: '대표팀에서 한 단계 성장해 돌아옵니다. 선수 카드 1장에 [영구적 역량] 1개, [체력] -2',
        effects: [
          { type: 'addPlayerToken', token: 'strengthPerm', count: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -2 },
        ],
      },
      red: {
        text: '지역 언론이 크게 보도합니다. [팬덤] +2, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-19',
    name: '사무실 정전',
    description: '노후 배선 문제로 구단 사무실 전기가 며칠간 끊겼습니다. 업무가 완전히 마비됐습니다.',
    decisions: {
      yellow: {
        text: '급히 발전기를 빌립니다. [돈] -1, [운영] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -1 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
      blue: {
        text: '사무 업무를 미루고 훈련장으로 갑니다. 이번 주 화요일에는 기본 행동을 수행할 수 없습니다.',
        effects: [{ type: 'restrictDay', day: 'tue', week: 'this', mode: 'noBasic' }],
      },
      red: {
        text: '직원들이 카페에서 일합니다. [운영] -2, [팬덤] +1',
        effects: [
          { type: 'gainResource', resource: 'ops', amount: -2 },
          { type: 'gainResource', resource: 'fandom', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-20',
    name: '훈련장 난투극',
    description: '훈련 중 선수들끼리 주먹다짐이 벌어졌습니다. 영상이 이미 인터넷에 퍼졌습니다.',
    decisions: {
      yellow: {
        text: '구단이 벌금을 대신 냅니다. [돈] -2, [체력] +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'gainResource', resource: 'stamina', amount: 1 },
        ],
      },
      blue: {
        text: '경쟁심을 동력으로 삼습니다. 선수 카드 1장에 [출장정지] 1개, 다른 선수 카드 1장에 [영구적 역량] 1개',
        effects: [
          { type: 'addPlayerToken', token: 'suspension', count: 1 },
          { type: 'addPlayerToken', token: 'strengthPerm', count: 1 },
        ],
      },
      red: {
        text: '홍보팀이 사태를 수습합니다. [팬덤] -1, [운영] +1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: -1 },
          { type: 'gainResource', resource: 'ops', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-21',
    name: '자선 경기 초청',
    description: '자선 단체가 구단에 친선 경기를 요청했습니다. 좋은 일이지만 일정이 빠듯합니다.',
    decisions: {
      yellow: {
        text: '수익 일부를 받고 참가합니다. [돈] +1, 승점 토큰 1개, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 1 },
          { type: 'gainVP', amount: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      blue: {
        text: '주전 선수 전원이 출전합니다. [체력] -2, [팬덤] +2',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: -2 },
          { type: 'gainResource', resource: 'fandom', amount: 2 },
        ],
      },
      red: {
        text: '직원들이 행사 운영을 전담합니다. 승점 토큰 1개, [운영] -2',
        effects: [
          { type: 'gainVP', amount: 1 },
          { type: 'gainResource', resource: 'ops', amount: -2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-22',
    name: '감독의 실언',
    description: '감독이 방송 인터뷰에서 상대 팀과 팬들을 싸잡아 비난했습니다. 파장이 커지고 있습니다.',
    decisions: {
      yellow: {
        text: '공식 사과문을 내고 벌금을 냅니다. [돈] -1, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -1 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      blue: {
        text: '감독이 경기로 증명하겠다고 선언합니다. 전술 카드 1장, [팬덤] -1',
        effects: [
          { type: 'drawTactic', count: 1 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      red: {
        text: '홍보팀이 총력 대응합니다. [팬덤] -2, [운영] +2',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: -2 },
          { type: 'gainResource', resource: 'ops', amount: 2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-23',
    name: '새 유니폼 공개',
    description: '새 시즌 유니폼 디자인이 공개됐습니다. 반응은 뜨겁지만 판매 전략을 정해야 합니다.',
    decisions: {
      yellow: {
        text: '한정판으로 비싸게 팝니다. [돈] +3, [운영] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 3 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
      blue: {
        text: '선수들에게 먼저 지급합니다. 선수 카드 1장에 1[체력], [돈] +1',
        effects: [
          { type: 'placeStamina', count: 1 },
          { type: 'gainResource', resource: 'money', amount: 1 },
        ],
      },
      red: {
        text: '서포터즈에게 할인 판매합니다. [팬덤] +2, [돈] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'money', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-24',
    name: '의무팀의 성과',
    description: '의무팀이 새로운 회복 프로그램을 개발했습니다. 어디에 먼저 적용할지 결정해야 합니다.',
    decisions: {
      yellow: {
        text: '고가 장비를 들여 고질적 문제를 고칩니다. [돈] -2, 선수 카드에서 [영구적 약점] 1개 제거',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'removePlayerToken', token: 'weaknessPerm', count: 1 },
        ],
      },
      blue: {
        text: '부상 선수의 복귀를 앞당깁니다. 선수 카드에서 [부상] 1개 제거, [체력] -1',
        effects: [
          { type: 'removePlayerToken', token: 'injury', count: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      red: {
        text: '전 선수단에 일괄 적용합니다. [운영] -2, 선수 카드에서 [일시적 약점]을 2개까지 제거(1개씩 나눠서)',
        effects: [
          { type: 'gainResource', resource: 'ops', amount: -2 },
          { type: 'removePlayerToken', token: 'weaknessTemp', count: 2, spread: true },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-25',
    name: '도박 의혹',
    description: '선수 한 명이 불법 도박에 연루됐다는 의혹이 보도됐습니다. 사실 여부는 아직 불분명합니다.',
    decisions: {
      yellow: {
        text: '변호인단을 꾸려 대응합니다. [돈] -2, [팬덤] +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'gainResource', resource: 'fandom', amount: 1 },
        ],
      },
      blue: {
        text: '자체 징계로 선수를 보호합니다. 선수 카드 1장에 [출장정지] 1개, [돈] +1',
        effects: [
          { type: 'addPlayerToken', token: 'suspension', count: 1 },
          { type: 'gainResource', resource: 'money', amount: 1 },
        ],
      },
      red: {
        text: '조사 결과가 나올 때까지 침묵합니다. [팬덤] -2, [운영] +1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: -2 },
          { type: 'gainResource', resource: 'ops', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-26',
    name: '폭설',
    description: '기록적인 폭설로 도시가 마비됐습니다. 훈련장으로 가는 길조차 끊겼습니다.',
    decisions: {
      yellow: {
        text: '제설 업체를 부릅니다. [돈] -2, [체력] +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'gainResource', resource: 'stamina', amount: 1 },
        ],
      },
      blue: {
        text: '실내에서 전술 훈련만 합니다. [체력] -2, 전술 카드 1장',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: -2 },
          { type: 'drawTactic', count: 1 },
        ],
      },
      red: {
        text: '모두 집에서 쉽니다. 이번 주 수요일에는 기본 행동을 수행할 수 없습니다.',
        effects: [{ type: 'restrictDay', day: 'wed', week: 'this', mode: 'noBasic' }],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-27',
    name: '지역 기업의 제안',
    description: '지역 대기업이 구단 후원을 제안했습니다. 다만 조건에 따라 팬들의 시선이 달라질 수 있습니다.',
    decisions: {
      yellow: {
        text: '조건 없이 후원금을 받습니다. [돈] +3, 팬덤 능력치 마커 -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 3 },
          { type: 'moveTrack', track: 'fandom', delta: -1 },
        ],
      },
      blue: {
        text: '훈련 시설 지원만 받습니다. [돈] +1, [체력] +1, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 1 },
          { type: 'gainResource', resource: 'stamina', amount: 1 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      red: {
        text: '지역 공헌 사업으로 돌립니다. [팬덤] +1, [운영] +1, [돈] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 1 },
          { type: 'gainResource', resource: 'ops', amount: 1 },
          { type: 'gainResource', resource: 'money', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-28',
    name: '관중석 안전 점검',
    description: '정기 점검에서 관중석 일부의 안전 문제가 발견됐습니다. 해당 구역은 당장 폐쇄해야 합니다.',
    decisions: {
      yellow: {
        text: '전면 보수 공사를 합니다. [돈] -3, 돈 능력치 마커 +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -3 },
          { type: 'moveTrack', track: 'money', delta: 1 },
        ],
      },
      blue: {
        text: '선수들이 점검 작업을 돕습니다. [체력] -1, [돈] -1',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: -1 },
          { type: 'gainResource', resource: 'money', amount: -1 },
        ],
      },
      red: {
        text: '구역을 폐쇄한 채 경기를 치릅니다. [팬덤] -2, [운영] +1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: -2 },
          { type: 'gainResource', resource: 'ops', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-29',
    name: '유망주의 급성장',
    description: '유소년 팀 선수 한 명이 눈에 띄게 성장했습니다. 코치진은 당장 1군에 올리자고 합니다.',
    decisions: {
      yellow: {
        text: '다른 구단의 관심을 이용해 몸값을 올립니다. [돈] +2, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      blue: {
        text: '집중 훈련을 시킵니다. 선수 카드 1장을 훈련 면으로 뒤집고 [체력] -1',
        effects: [
          { type: 'trainPlayer', count: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      red: {
        text: '지역 언론에 대대적으로 소개합니다. [팬덤] +1, [운영] +1, [돈] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 1 },
          { type: 'gainResource', resource: 'ops', amount: 1 },
          { type: 'gainResource', resource: 'money', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-30',
    name: '원정 버스 지원 요청',
    description: '서포터즈가 다음 원정 경기에 응원 버스를 지원해 달라고 요청했습니다.',
    decisions: {
      yellow: {
        text: '버스 비용을 전액 지원합니다. [돈] -2, [팬덤] +2',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'gainResource', resource: 'fandom', amount: 2 },
        ],
      },
      blue: {
        text: '선수단 버스에 자리를 내줍니다. [체력] +1, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'stamina', amount: 1 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      red: {
        text: '직원이 직접 버스를 섭외합니다. [팬덤] +1, [운영] -1',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 1 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-31',
    name: '언론의 집중 조명',
    description: '전국 매체가 구단을 집중 보도하기 시작했습니다. 기회이자 부담입니다.',
    decisions: {
      yellow: {
        text: '독점 인터뷰를 유료로 제공합니다. [돈] +2, [팬덤] +1, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'gainResource', resource: 'fandom', amount: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      blue: {
        text: '선수들이 촬영에 시달립니다. 선수 카드에 [일시적 약점] 1개, [팬덤] +2',
        effects: [
          { type: 'addPlayerToken', token: 'weaknessTemp', count: 1 },
          { type: 'gainResource', resource: 'fandom', amount: 2 },
        ],
      },
      red: {
        text: '홍보팀이 취재를 전부 받아 줍니다. [팬덤] +3, [운영] -2',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 3 },
          { type: 'gainResource', resource: 'ops', amount: -2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-32',
    name: '장비 리콜',
    description: '훈련 장비 업체가 결함을 이유로 리콜을 발표했습니다. 교체까지 시간이 걸립니다.',
    decisions: {
      yellow: {
        text: '보상금을 받고 낡은 장비로 버팁니다. [돈] +1, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      blue: {
        text: '결함 장비를 그대로 씁니다. 선수 카드 1장에 [일시적 약점] 2개, [돈] +2',
        effects: [
          { type: 'addPlayerToken', token: 'weaknessTemp', count: 2 },
          { type: 'gainResource', resource: 'money', amount: 2 },
        ],
      },
      red: {
        text: '직원들이 대체 장비를 수소문합니다. [운영] -1, [체력] +1',
        effects: [
          { type: 'gainResource', resource: 'ops', amount: -1 },
          { type: 'gainResource', resource: 'stamina', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-33',
    name: '시즌권 판매 호조',
    description: '시즌권이 예상보다 훨씬 많이 팔렸습니다. 늘어난 수익을 어디에 쓸지 정해야 합니다.',
    decisions: {
      yellow: {
        text: '수익을 전부 금고에 넣습니다. [돈] +4, [운영] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 4 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
        ],
      },
      blue: {
        text: '선수단 복지에 씁니다. [돈] +2, 선수 카드 1장에 1[체력]',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'placeStamina', count: 1 },
        ],
      },
      red: {
        text: '팬 행사에 재투자합니다. [팬덤] +2, [돈] +1, [운영] -2',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'money', amount: 1 },
          { type: 'gainResource', resource: 'ops', amount: -2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-34',
    name: '코치진 내분',
    description: '수석 코치와 피지컬 코치 사이의 불화가 선수들에게까지 알려졌습니다.',
    decisions: {
      yellow: {
        text: '외부 중재자를 고용합니다. [돈] -2, [체력] +1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: -2 },
          { type: 'gainResource', resource: 'stamina', amount: 1 },
        ],
      },
      blue: {
        text: '감독이 전술로 승부합니다. 전술 카드 1장, [체력] -2',
        effects: [
          { type: 'drawTactic', count: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -2 },
        ],
      },
      red: {
        text: '한 명을 징계합니다. 직원 카드 1장을 선택해 [출장정지] 1개를 올려놓습니다.',
        effects: [{ type: 'addStaffSuspension', count: 1 }],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-35',
    name: '유니폼 계약 분쟁',
    description: '유니폼 스폰서가 계약 조건을 문제 삼고 나섰습니다. 변호사들이 바빠졌습니다.',
    decisions: {
      yellow: {
        text: '계약을 파기합니다. 유니폼 스폰서가 있다면 장내 방송 효과를 반환하고, 없다면 [돈] +2',
        effects: [{ type: 'breakNamingSponsor', otherwise: [{ type: 'gainResource', resource: 'money', amount: 2 }] }],
      },
      blue: {
        text: '선수들이 스폰서 행사에 추가로 참여합니다. [돈] +1, [체력] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 1 },
          { type: 'gainResource', resource: 'stamina', amount: -1 },
        ],
      },
      red: {
        text: '팬 여론을 등에 업고 버팁니다. [팬덤] -1, [돈] +2',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: -1 },
          { type: 'gainResource', resource: 'money', amount: 2 },
        ],
      },
    },
    placeholder: true,
  },
  {
    id: 'bc-36',
    name: '시즌 응원전',
    description: '서포터즈가 시즌 최고의 응원전을 준비하고 있습니다. 구단의 지원 방식을 정해야 합니다.',
    decisions: {
      yellow: {
        text: '응원 용품 판매권을 구단이 가집니다. [돈] +2, [팬덤] -1',
        effects: [
          { type: 'gainResource', resource: 'money', amount: 2 },
          { type: 'gainResource', resource: 'fandom', amount: -1 },
        ],
      },
      blue: {
        text: '선수들이 응원에 힘입어 컨디션을 끌어올립니다. 선수 카드 1장에 1[체력], [돈] -1',
        effects: [
          { type: 'placeStamina', count: 1 },
          { type: 'gainResource', resource: 'money', amount: -1 },
        ],
      },
      red: {
        text: '구단이 전폭 지원합니다. [팬덤] +2, [운영] -1, 승점 토큰 1개',
        effects: [
          { type: 'gainResource', resource: 'fandom', amount: 2 },
          { type: 'gainResource', resource: 'ops', amount: -1 },
          { type: 'gainVP', amount: 1 },
        ],
      },
    },
    placeholder: true,
  },
];
