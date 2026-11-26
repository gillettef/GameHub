import { useEffect } from "react";
import { Icon, InlineIcon, type IconName } from "./Icons";
import { useModalLock } from "./modalLock";
import { BALANCE } from "../engine/config";

const I = ({ n }: { n: IconName }) => <InlineIcon name={n} />;

// 지금 규칙(기획 63-3절, config.ts skillRules)을 설명한다. 수치는 엔진 설정에서 읽어 규칙과 어긋나지 않게 한다.
// (옛 기운 규칙의 설명은 git 이력에 있다. skillRules 를 끄는 판은 실험용이라 화면 설명을 두지 않는다)
const B = BALANCE;
const [R1, R2, R3] = B.rankPoints;
const [E1, E2, E3] = B.examCredits;

const SECTIONS: { icon: IconName; title: string; body: React.ReactNode }[] = [
  {
    icon: "target",
    title: "게임 목표",
    body: (
      <>
        <p><b>수업에서 실력을 쌓고, 활동에서 마법(주사위)과 실력으로 도전해요.</b> 12개월이 지나 졸업할 때 <b>학점</b>이 가장 높은 친구가 이겨요. (2~5명)</p>
        <p><I n="cap" /> <b>학점 모으기</b> — 활동에 성공할 때마다 +{B.growthCredit}, 마법 겨루기 승리 +{B.skillDuelCredit}, 대성공 보상, 하늘·육지·바다 생물 모으기 +{B.skillSetCredit}, 시험(1위 +{E1} · 2위 +{E2} · 나머지 +{E3}).</p>
        <p><I n="medal" /> <b>졸업식 4부문 = 네 능력치</b> — 마법상(주문력)·수석상(지력)·튼튼상(체력)·생물사랑상(매력). 부문마다 <b>1위 +{R1} · 2위 +{R2} · 3위 +{R3}</b>. 같은 값이면 같은 순위예요.</p>
        <p><I n="compass" /> <b>장래희망</b> — 시작할 때 꿈 카드 1장을 무작위로 몰래 받아요. 졸업할 때 카드의 <b>두 능력치가 모두 {B.dreamThreshold} 이상이면 학점 +{B.dreamCredit}</b>.</p>
        <p>학점이 같으면 1위 상이 많은 친구가 이겨요. 위쪽 표의 <b>예상 점수</b>는 지금 졸업하면 받을 학점이에요.</p>
      </>
    ),
  },
  {
    icon: "chart",
    title: "네 능력치 (가장 중요한 규칙)",
    body: (
      <>
        <p>처음에는 <b>주문력 {B.skillInitialSpell}</b>, 지력·체력·매력은 <b>1</b>이에요. 능력치마다 하는 일이 달라요.</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><b>주문력</b> — 판정마다 굴리는 <b>주사위 수</b>. 마법 겨루기에서 이기거나 일부 카드 보상으로만 올라요.</li>
          <li><b>지력</b> — 연구 판정·지력 시험에 더해요. <b>노트를 지력 장수까지</b> 들고 있을 수 있어요.</li>
          <li><b>체력</b> — 탐험 판정·체력 시험에 더해요. 판정마다 주사위를 <b>체력 번 다시 굴릴</b> 수 있어요(한 번에 1개, 새 눈을 따라요).</li>
          <li><b>매력</b> — 조련 판정·매력 시험에 더해요. <b>마법생물을 매력 마리까지</b> 데리고 다녀요.</li>
        </ul>
        <p className="mt-1"><b>판정 점수 = 주사위 합(주문력 개) + 그 분야 능력치 + 도와주는 생물 한 마리 + 낸 노트</b>. 굴린 뒤 다시 굴리기와 노트 내기를 마치고 <b>&quot;확인&quot;</b>을 누르면 결과가 적용돼요.</p>
      </>
    ),
  },
  {
    icon: "calendar",
    title: "한 달의 흐름",
    body: (
      <>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li><b>1주차 학교 소식</b> — 행사 카드 1장의 효과를 받아요(예: 모두 지력 노트 1장, 이번 달 다시 굴리기 +1, 수업카드 1장 더). <b>4월은 중간고사, 10월은 기말고사 공고</b>가 그달의 소식이에요. 이번 달 <b>활동 카드</b>(인원만큼)도 미리 공개돼요.</li>
          <li><b>2주차 정규수업</b> — 인원만큼 공개된 수업카드(지력·체력·매력 과목) 중 1장씩 가져가 둘 중 하나로 써요.
            <ul className="list-[circle] pl-5 mt-0.5">
              <li><b>배우기</b>: 그 과목 능력치 <b>+{B.skillLearnGain}</b>.</li>
              <li><b>노트</b>: 손에 보관했다가 그 과목 판정(시험 포함)에서 굴린 뒤 내면 <b>+{B.noteBonus}</b>. 쓰면 버려요.</li>
            </ul>
          </li>
          <li><b>3주차 자율활동</b> — 공개된 활동 카드 중 1장씩 고른 뒤, 고른 순서대로 굴려요.</li>
          <li><b>4주차 정리</b> — 선이 시계방향으로 한 칸 넘어가요.</li>
        </ol>
        <p className="mt-1"><b>6·12개월은 시험 달</b> — 수업·활동 없이 시험을 쳐요.</p>
        <p className="mt-1"><b>차례는 언제나 학점이 낮은 친구부터</b>(같으면 선부터 시계방향). 뒤처진 친구가 먼저 골라요.</p>
      </>
    ),
  },
  {
    icon: "compass",
    title: "활동 카드 4종",
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>네 종류가 한 덱에 섞여 있어서, 그달 어떤 카드가 나오느냐에 따라 할 수 있는 활동이 달라져요.</li>
        <li>카드마다 목표가 두 개예요: <b>성공</b>이면 그 분야 능력치 <b>+1 · 학점 +{B.growthCredit}</b>, <b>대성공</b>(성공 목표 + {B.greatGap})이면 여기에 <b>카드 보상</b>까지. 달이 지날수록 목표가 조금씩 높아져요. 실패하면 카드만 버려요(손해는 없어요).</li>
        <li><b><I n="paw" /> 마법생물 조련 (매력)</b> — 성공하면 그 생물이 <b>곁에 와요</b>. 대성공이면 학점 +{B.creatureGreatCredit} 더.</li>
        <li><b><I n="door" /> 별빛 다락방 탐험 (체력)</b> — 대성공이면 카드에 적힌 보상.</li>
        <li><b><I n="flask" /> 연구실 실험 (지력)</b> — 대성공이면 카드에 적힌 다른 능력치 보상.</li>
        <li>
          <b><I n="swords" /> 마법 겨루기 (주문력)</b> — 고르면 친구 한 명을 지목해요.
          <ul className="list-[circle] pl-5 mt-1 space-y-1">
            <li>지목당한 친구는 <b>주사위(주문력 개) + {B.skillDefenderBonus}</b>(+ 곁의 하늘 생물)로 자동으로 막아요. 낮은 주사위는 체력만큼 저절로 다시 굴려요.</li>
            <li>한 친구는 <b>한 달에 한 번만</b> 지목받고, 자기 활동은 <b>그대로</b> 해요.</li>
            <li>도전자는 막기 점수를 보고 주사위(주문력 개) + 곁의 하늘 생물 + 주문력 노트로 <b>더 높으면 승리</b>: <b>주문력 +1 · 학점 +{B.skillDuelCredit}</b>. 같거나 낮으면 친구가 막아 낸 거예요(아무도 받지 않아요).</li>
          </ul>
        </li>
        <li>아무도 고르지 않은 카드는 그달 끝에 버려요.</li>
      </ul>
    ),
  },
  {
    icon: "paw",
    title: "마법생물 친구",
    body: (
      <ul className="list-disc pl-5 space-y-0.5">
        <li>곁에 둔 생물이 판정을 도와요(판정마다 가장 큰 한 마리만): <I n="cloud" /> 하늘 = 겨루기, <I n="sprout" /> 육지 = 탐험, <I n="wave" /> 바다 = 연구, 조련은 <b>모든 생물</b>이 도와요.</li>
        <li>어려운 생물(조련 기준 {B.creatureHelpRareMin} 이상)은 <b>+{B.creatureHelpRare}</b>, 나머지는 <b>+{B.creatureHelp}</b>.</li>
        <li>매력보다 많아지면 도움이 가장 작은 생물부터 숲으로 돌아가요(같으면 먼저 온 생물).</li>
        <li>하늘·육지·바다를 한 마리씩 처음 곁에 두면 <b>학점 +{B.skillSetCredit}</b>(한 번).</li>
      </ul>
    ),
  },
  {
    icon: "dice",
    title: "시험 (6개월·12개월)",
    body: (
      <>
        <p>시험 과목은 판마다 달라요. 시험 카드 8장 중 <b>중간고사는 4월</b>, <b>기말고사는 10월</b> 1주차 학교 소식에 공개돼요. 카드마다 점수에 더하는 능력치가 두 개예요(예: 비행 실기 = 체력 + 주문력).</p>
        <p><b>점수 = 주사위 합(주문력 개) + 시험 카드의 두 능력치 + 그 과목 노트</b>. 다시 굴리기는 체력만큼. 학점이 낮은 친구부터 한 명씩 굴리고, 1위 +{E1} · 2위 +{E2} · 나머지 +{E3}.</p>
      </>
    ),
  },
  {
    icon: "bulb",
    title: "작전 팁",
    body: (
      <ul className="list-disc pl-5 space-y-0.5">
        <li>수업은 <b>지금 배울지, 노트로 아껴 둘지</b>가 고민거리예요. 배우면 영원히 +{B.skillLearnGain}, 노트는 한 번만 +{B.noteBonus}이지만 꼭 필요한 판정에서 쓸 수 있어요.</li>
        <li>주문력이 높으면 모든 판정의 주사위가 늘어요. 주문력은 겨루기로만 오르니 기회를 놓치지 마세요.</li>
        <li>졸업식은 네 능력치 순위 싸움이에요. 한 부문 1위(+{R1})는 2위 두 번과 같아요. 친구들이 몰린 능력치보다 <b>비어 있는 능력치의 1위</b>를 노려 보세요.</li>
        <li>장래희망의 두 능력치를 {B.dreamThreshold}까지 키우는 것을 잊지 마세요.</li>
        <li>시험 공고가 나면 그 과목 노트를 모아 두세요. 공고 전에는 능력치를 고르게 키워 두면 안전해요.</li>
      </ul>
    ),
  },
];

export function RulesGuide() {
  return (
    <div className="flex flex-col gap-2">
      {SECTIONS.map((s, i) => (
        <details key={s.title} open={i === 0} className="rounded-3xl border-2 border-purple-200 bg-white shadow-sm">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 py-2 font-display text-purple-700">
            <Icon name={s.icon} className="h-5 w-5 text-pink-400" />
            {s.title}
          </summary>
          <div className="space-y-1.5 px-4 pb-4 text-sm leading-relaxed text-purple-800">{s.body}</div>
        </details>
      ))}
    </div>
  );
}

// 대기실·첫 화면에서 쓰는 전체 화면 규칙 시트
export function RulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useModalLock();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-purple-50" role="dialog" aria-modal="true" aria-label="게임 규칙">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="text-xl text-purple-700"><Icon name="book" className="mr-1 h-5 w-5" />게임 규칙</h2>
        <button className="min-h-11 rounded-full bg-purple-200 px-4 text-purple-700 active:scale-95 transition-transform" onClick={onClose}>
          닫기
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md">
          <RulesGuide />
        </div>
      </div>
    </div>
  );
}
