// 자동 생성: tools/gen_facilities.py (원본 notes/놀이공원_v1.xlsx)
import type { FacilityCard } from '../types';

export const FACILITIES: FacilityCard[] = [
  {
    "id": 1,
    "type": "스릴형",
    "name": "롤러코스터",
    "cost": 10,
    "upkeep": 3,
    "income": [
      3,
      7
    ],
    "sat": [
      1,
      7
    ],
    "effect": "날씨 나쁠 때 유지비 +2"
  },
  {
    "id": 2,
    "type": "스릴형",
    "name": "자이로드롭",
    "cost": 9,
    "upkeep": 3,
    "income": [
      3,
      7
    ],
    "sat": [
      2,
      6
    ],
    "effect": "스릴을 좋아하는 관람객에게 만족도가 +2 증가."
  },
  {
    "id": 3,
    "type": "스릴형",
    "name": "바이킹",
    "cost": 5,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      2,
      5
    ],
    "effect": "야경 이벤트 시 추가 수익 +3 자원."
  },
  {
    "id": 4,
    "type": "스릴형",
    "name": "범퍼카",
    "cost": 5,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      3,
      4
    ],
    "effect": "스릴을 좋아하는 관람객의 만족도가 +2 증가."
  },
  {
    "id": 5,
    "type": "패밀리형",
    "name": "회전목마",
    "cost": 3,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      5,
      2
    ],
    "effect": "가족 단위 관람객에게 인기, 가족 이벤트 시 추가 만족도 제공 (+2)."
  },
  {
    "id": 6,
    "type": "패밀리형",
    "name": "미니 기차",
    "cost": 3,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      6,
      1
    ],
    "effect": "어린이 및 가족 관람객에게 인기가 높습니다."
  },
  {
    "id": 7,
    "type": "패밀리형",
    "name": "미니골프",
    "cost": 1,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      3,
      4
    ],
    "effect": "가족 단위 관람객의 만족도가 +2 증가."
  },
  {
    "id": 8,
    "type": "패밀리형",
    "name": "가족 회전 기차",
    "cost": 3,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      5,
      2
    ],
    "effect": "어린이와 가족 단위 관람객에게 특히 인기가 높음."
  },
  {
    "id": 9,
    "type": "공포형",
    "name": "유령의 집",
    "cost": 5,
    "upkeep": 2,
    "income": [
      3,
      5
    ],
    "sat": [
      4,
      4
    ],
    "effect": "할로윈 시즌에 수익이 두 배로 증가합니다."
  },
  {
    "id": 10,
    "type": "공포형",
    "name": "좀비 어드벤처",
    "cost": 6,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      3,
      4
    ],
    "effect": "공포 이벤트 발생 시 만족도가 +3 증가."
  },
  {
    "id": 11,
    "type": "공포형",
    "name": "공포 미로",
    "cost": 6,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      3,
      4
    ],
    "effect": "어두운 날씨 이벤트 발생 시 수익 +2 자원."
  },
  {
    "id": 12,
    "type": "공포형",
    "name": "귀신의 집",
    "cost": 6,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      3,
      4
    ],
    "effect": "시즌별 공포 테마 이벤트에서 만족도 +3."
  },
  {
    "id": 13,
    "type": "어드벤처형",
    "name": "정글 탐험",
    "cost": 8,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      3,
      4
    ],
    "effect": "탐험 이벤트 발생 시 추가 수익 +3 자원."
  },
  {
    "id": 14,
    "type": "어드벤처형",
    "name": "해적선",
    "cost": 5,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      3,
      4
    ],
    "effect": "모험 테마 시즌에 수익 +2 자원."
  },
  {
    "id": 15,
    "type": "어드벤처형",
    "name": "산악 롤러코스터",
    "cost": 7,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      2,
      5
    ],
    "effect": "산악 테마 이벤트 시 만족도 +3."
  },
  {
    "id": 16,
    "type": "어드벤처형",
    "name": "해양 어드벤처",
    "cost": 7,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      2,
      5
    ],
    "effect": "여름 시즌에 수익 +3 자원."
  },
  {
    "id": 17,
    "type": "교육형",
    "name": "우주 탐험",
    "cost": 3,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      4,
      3
    ],
    "effect": "교육적인 이벤트 시 추가 수익 +2 자원."
  },
  {
    "id": 18,
    "type": "교육형",
    "name": "과학 실험관",
    "cost": 3,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      4,
      3
    ],
    "effect": "학습 이벤트 시 관람객 만족도 +3 증가."
  },
  {
    "id": 19,
    "type": "교육형",
    "name": "동물원 탐방",
    "cost": 4,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      4,
      3
    ],
    "effect": "동물 관련 이벤트 시 수익 +3 자원."
  },
  {
    "id": 20,
    "type": "교육형",
    "name": "역사 탐험",
    "cost": 4,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      4,
      3
    ],
    "effect": "역사적 축제 기간 동안 추가 수익 +2 자원."
  },
  {
    "id": 21,
    "type": "물놀이형",
    "name": "워터 슬라이드",
    "cost": 8,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      3,
      4
    ],
    "effect": "여름 시즌에 수익 +3 자원."
  },
  {
    "id": 22,
    "type": "물놀이형",
    "name": "래프팅",
    "cost": 8,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      3,
      4
    ],
    "effect": "여름 시즌에 수익 +4 자원."
  },
  {
    "id": 23,
    "type": "물놀이형",
    "name": "수중 미끄럼틀",
    "cost": 7,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      4,
      3
    ],
    "effect": "물놀이 시즌에 만족도 +3 증가."
  },
  {
    "id": 24,
    "type": "물놀이형",
    "name": "물놀이 기구",
    "cost": 5,
    "upkeep": 1,
    "income": [
      2,
      5
    ],
    "sat": [
      4,
      3
    ],
    "effect": "물놀이 시즌에 수익 +3 자원."
  },
  {
    "id": 25,
    "type": "놀이형",
    "name": "미끄럼틀",
    "cost": 4,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      8,
      1
    ],
    "effect": "어린이들에게 인기 있는 기본 놀이 기구."
  },
  {
    "id": 26,
    "type": "놀이형",
    "name": "트램폴린",
    "cost": 1,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      8,
      1
    ],
    "effect": "신체 활동을 장려하며 즐거움 증가."
  },
  {
    "id": 27,
    "type": "놀이형",
    "name": "클라이밍 벽",
    "cost": 2,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      7,
      2
    ],
    "effect": "어린이들이 모험심을 키우기에 좋음."
  },
  {
    "id": 28,
    "type": "놀이형",
    "name": "스윙 세트",
    "cost": 4,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      8,
      1
    ],
    "effect": "간단한 놀이 기구로 안정성 증가."
  },
  {
    "id": 29,
    "type": "놀이형",
    "name": "구름 놀이터",
    "cost": 2,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      8,
      1
    ],
    "effect": "놀이 구역에서의 활동 시 만족도 +2 증가."
  },
  {
    "id": 30,
    "type": "놀이형",
    "name": "레이저 태그",
    "cost": 5,
    "upkeep": 2,
    "income": [
      3,
      7
    ],
    "sat": [
      3,
      4
    ],
    "effect": "놀이 구역에서의 활동 시 만족도 +2 증가."
  },
  {
    "id": 31,
    "type": "상점",
    "name": "즐거운 기념품 가게",
    "cost": 2,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      4,
      5
    ],
    "effect": "기념일에 수익 +3 자원"
  },
  {
    "id": 32,
    "type": "상점",
    "name": "24시간 편의점",
    "cost": 2,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      4,
      5
    ],
    "effect": "야간에 수익 +2 자원"
  },
  {
    "id": 33,
    "type": "상점",
    "name": "맛있는 푸드코트",
    "cost": 1,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      4,
      5
    ],
    "effect": "식사 시간대에 수익 +2 자원"
  },
  {
    "id": 34,
    "type": "상점",
    "name": "빠른 스낵바",
    "cost": 2,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      4,
      5
    ],
    "effect": "군것질 시간에 만족도 +2 증가"
  },
  {
    "id": 35,
    "type": "상점",
    "name": "시원한 음료수 자판기",
    "cost": 2,
    "upkeep": 1,
    "income": [
      2,
      2
    ],
    "sat": [
      4,
      5
    ],
    "effect": "더운 날씨에 수익 +2 자원"
  },
  {
    "id": 36,
    "type": "부대시설",
    "name": "정보 안내 센터",
    "cost": 1,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      3,
      8
    ],
    "effect": "모든 관람객의 만족도 +1 증가"
  },
  {
    "id": 37,
    "type": "부대시설",
    "name": "깨끗한 화장실",
    "cost": 1,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      5,
      6
    ],
    "effect": "청결 유지 시 만족도 +2 증가"
  },
  {
    "id": 38,
    "type": "부대시설",
    "name": "추억의 사진 촬영소",
    "cost": 3,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      5,
      6
    ],
    "effect": "특별 이벤트 날 사진 촬영 시 수익 +3 자원"
  },
  {
    "id": 39,
    "type": "부대시설",
    "name": "유모차 대여소",
    "cost": 2,
    "upkeep": 1,
    "income": [
      1,
      1
    ],
    "sat": [
      5,
      5
    ],
    "effect": "어린이 단위 관람객 만족도 +3 증가"
  },
  {
    "id": 40,
    "type": "부대시설",
    "name": "무료 Wi-Fi 존",
    "cost": 1,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      3,
      8
    ],
    "effect": "인터넷 사용 시 만족도 +2 증가"
  },
  {
    "id": 41,
    "type": "부대시설",
    "name": "응급 처치 센터",
    "cost": 2,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      5,
      6
    ],
    "effect": "응급 상황 발생 시 빠르게 대응, 만족도 +2 증가"
  },
  {
    "id": 42,
    "type": "부대시설",
    "name": "차량 정비소",
    "cost": 1,
    "upkeep": 1,
    "income": [
      1,
      1
    ],
    "sat": [
      1,
      9
    ],
    "effect": "차량 문제 발생 시 만족도 +2 증가"
  },
  {
    "id": 43,
    "type": "부대시설",
    "name": "신나는 게임 센터",
    "cost": 2,
    "upkeep": 1,
    "income": [
      1,
      1
    ],
    "sat": [
      7,
      3
    ],
    "effect": "주말에 수익 +3 자원"
  },
  {
    "id": 44,
    "type": "부대시설",
    "name": "다양한 체험 부스",
    "cost": 1,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      3,
      8
    ],
    "effect": "체험 행사 시 수익 +3 자원"
  },
  {
    "id": 45,
    "type": "부대시설",
    "name": "멋진 조형물",
    "cost": 3,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      3,
      8
    ],
    "effect": "포토존으로 활용 시 만족도 +3 증가"
  },
  {
    "id": 46,
    "type": "부대시설",
    "name": "전망대",
    "cost": 3,
    "upkeep": 1,
    "income": [
      1,
      1
    ],
    "sat": [
      5,
      5
    ],
    "effect": "풍경 이벤트 시 만족도 +3 증가"
  },
  {
    "id": 47,
    "type": "부대시설",
    "name": "넓은 주차장",
    "cost": 1,
    "upkeep": 1,
    "income": [
      1,
      1
    ],
    "sat": [
      1,
      9
    ],
    "effect": "주차 공간이 부족할 때 수익 +2 자원"
  },
  {
    "id": 48,
    "type": "부대시설",
    "name": "자전거 대여소",
    "cost": 2,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      5,
      6
    ],
    "effect": "자전거 대여 시 수익 +2 자원"
  },
  {
    "id": 49,
    "type": "부대시설",
    "name": "편안한 휴게실",
    "cost": 2,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      4,
      7
    ],
    "effect": "피로 회복 이벤트 시 만족도 +3 증가"
  },
  {
    "id": 50,
    "type": "부대시설",
    "name": "편안한 쉼터",
    "cost": 2,
    "upkeep": 1,
    "income": [
      0,
      0
    ],
    "sat": [
      4,
      7
    ],
    "effect": "휴식 이벤트 시 만족도 +3 증가"
  }
];

export const FACILITY_BY_ID: Record<number, FacilityCard> = Object.fromEntries(FACILITIES.map((c) => [c.id, c]));
