// 1주차 "학교 소식" (44절): 매달 처음에 소식 카드 1장이 공개되어 그달의 분위기를 바꾼다.
// - 행사(event): 시험과 상관없는 달에 행사 덱에서 1장을 뽑는다. 고를 것이 없고 바로 적용된다 (한 판에 8번, 덱 12장이라 매 판 조합이 다르다)
// - 시험 공고(notice): 시험 2개월 전 달(BALANCE.midtermNoticeRound·finalNoticeRound, 4·10개월)에 시험 카드를 공개한다 (52-6절에서 시험 과목 수업카드 1장 추가를 없앴다)
// - 시험 주간(examWeek): 시험 달에 나온다. 선부터 한 명씩 벼락치기(기운 1개를 시험 과목 기운으로 바꾸기)를 하고 시험을 친다
// 수치는 플레이테스트와 시뮬레이션으로 조정한다.
import type { KeptToken, NewsCard, NewsEffect } from "./types.js";

type Def = [name: string, description: string, effect: NewsEffect];

const EVENTS: Def[] = [
  ["봄 소풍", "다 같이 숲으로 소풍! 비밀의 방 가는 길도 훤히 보여요.", { targetMod: { exploration: -2 } }],
  ["장마철", "비가 주룩주룩… 탐험은 미끄럽지만 연구실은 조용하고 아늑해요.", { targetMod: { exploration: 2, lab: -1 } }],
  ["마법생물 번식기", "새끼 마법생물들이 태어나는 계절, 다들 순하고 다정해요.", { targetMod: { creature: -1 } }],
  ["학교 축제", "축제 준비로 들썩들썩! 매력 수업이 더 즐거워요.", { classBonus: { charm: 1 } }],
  ["도서관 주간", "책 냄새 가득한 도서관 주간. 지력 수업이 머리에 쏙쏙!", { classBonus: { intelligence: 1 } }],
  ["체육대회 주간", "줄다리기 연습으로 온몸이 튼튼! 체력 수업이 더 알차요.", { classBonus: { stamina: 1 } }],
  ["별똥별 쏟아지는 밤", "밤하늘 가득 별똥별이 내려 마력이 출렁여요. 주문력 수업이 더 강해요.", { classBonus: { spellPower: 1 } }],
  ["수업 박람회", "새 과목을 소개하는 박람회가 열렸어요. 수업카드가 1장 더 공개돼요.", { classExtra: 1 }],
  ["급식 특식 데이", "오늘 급식은 마법 크림 스튜! 모두 체력기운 +1.", { gift: { stamina: 1 } }],
  ["응원단 결성", "토너먼트 응원단이 생겼어요! 토너먼트에 나가면 3칸 더 전진해요.", { tournamentBonus: 3 }],
  ["스터디 주간", "삼삼오오 모여 공부하는 주간. 모두 지력기운 +1.", { gift: { intelligence: 1 } }],
  ["마법 결투 대회", "교내 결투 대회가 열렸어요! 주문 대결에서 이기면 학점 +1.", { duelWinCredit: 1 }],
];

let nextId = 0;
const make = ([name, description, effect]: Def, kind: NewsCard["kind"]): NewsCard => ({ id: `news-${nextId++}`, kind, name, description, effect });

export const NEWS_EVENT_COUNT = EVENTS.length;
export function eventTemplates(): NewsCard[] {
  return EVENTS.map((d) => make(d, "event"));
}

// 행사를 끈 판(BALANCE.schoolNewsEvents = false)의 소식
export function quietMonthCard(): NewsCard {
  return make(["평범한 한 달", "특별한 행사 없이 차분하게 공부하는 한 달이에요.", {}], "event");
}

// 시험 공고: 시험 카드를 공개한다
export function noticeCard(exam: "midterm" | "final", examName: string): NewsCard {
  const title = exam === "midterm" ? "중간고사" : "기말고사";
  return make([`${title} 공고`, `게시판에 ${title} 공고가 붙었어요: "${examName}". 시험 과목에 맞는 기운을 미리 모아 두세요.`, {}], "notice");
}

// 시험 주간: 선부터 한 명씩 벼락치기를 고른 뒤 시험을 친다
export function examWeekCard(exam: "midterm" | "final", fuel: KeptToken, fuelName: string): NewsCard {
  const title = exam === "midterm" ? "중간고사" : "기말고사";
  return make(
    [`${title} 주간`, `드디어 ${title}! 선부터 한 명씩 벼락치기를 할 수 있어요: 가진 기운 1개를 ${fuelName} 1개로 바꿔요 (안 해도 돼요).`, { cramTo: fuel }],
    "examWeek",
  );
}
