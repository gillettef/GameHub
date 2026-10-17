import { useEffect } from "react";
import { Icon, InlineIcon, type IconName } from "./Icons";
import { useModalLock } from "./modalLock";

const I = ({ n }: { n: IconName }) => <InlineIcon name={n} />;

const SECTIONS: { icon: IconName; title: string; body: React.ReactNode }[] = [
  {
    icon: "target",
    title: "게임 목표",
    body: (
      <>
        <p><b>수업으로 컨디션(기운)을 채우고, 활동에서 실력(능력치)을 키워, 졸업식에서 꿈을 이뤄요.</b> 12개월이 지나 졸업할 때 <b>학점</b>이 가장 높은 친구가 이겨요. (2~5명)</p>
        <p><I n="cap" /> <b>학점 모으기</b> — 활동에 성공해 <b>성장할 때마다 +1</b>, 카드에 적힌 보상, 마법 겨루기 승리(+1), 시험(1위 +3 · 2위 +2 · 나머지 +1).</p>
        <p><I n="medal" /> <b>졸업식 4부문 = 네 능력치</b> — 마법상(주문력)·수석상(지력)·튼튼상(체력)·생물사랑상(매력). 부문마다 <b>1위 +4 · 2위 +2 · 3위 +1</b>. 같은 값이면 같은 순위예요.</p>
        <p><I n="compass" /> <b>장래희망</b> — 시작할 때 꿈 카드 2장 중 1장을 몰래 골라요(1개월까지 바꿀 수 있어요). 졸업할 때 카드의 <b>두 능력치가 모두 5 이상이면 학점 +2</b>.</p>
        <p>학점이 같으면 1위 상이 많은 친구가 이겨요. 위쪽 표의 <b>예상 점수</b>는 지금 졸업하면 받을 학점이에요.</p>
      </>
    ),
  },
  {
    icon: "chart",
    title: "실력과 컨디션 (가장 중요한 규칙)",
    body: (
      <ul className="list-disc pl-5 space-y-0.5">
        <li><b>능력치 = 실력</b>(지력·체력·매력·주문력, 처음에는 모두 1), <b>기운 = 컨디션</b>(지력기운·체력기운·매력기운·마나기운). 기운은 수업카드로 얻고, 남은 기운은 다음 달로 이어져요(한도 없음).</li>
        <li><b>실력만큼만 힘을 내요</b> — 주사위를 굴릴 때 그 활동의 기운을 <b>0개부터 능력치 + 1개까지</b> 골라 내고, <b>낸 개수 + 공짜 주사위 1개</b>를 굴려요. 기운을 아무리 모아도 실력이 낮으면 한 번에 다 못 써요.</li>
        <li><b>성장</b> — 활동에 성공하면 그 구역의 능력치가 <b>+1</b>, 학점도 <b>+1</b>. 수업은 기운만 주고, 실력은 활동으로만 올라요.</li>
        <li>구역과 능력치는 1:1이에요: <I n="paw" /> 마법생물 조련 = <b>매력</b>, <I n="door" /> 별빛 다락방 탐험 = <b>체력</b>, <I n="flask" /> 연구실 실험 = <b>지력</b>, <I n="swords" /> 마법 겨루기 = <b>주문력</b>(마나기운).</li>
      </ul>
    ),
  },
  {
    icon: "calendar",
    title: "한 달의 흐름",
    body: (
      <>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li><b>1주차 학교 소식</b> — 행사 카드 1장의 효과(예: 모두 매력기운 +1, 수업카드 1장 더)를 바로 받아요. 이번 달 <b>구역 카드</b>(마법생물·연구실·별빛 다락방 2장씩)도 미리 공개돼요.</li>
          <li><b>2주차 정규수업</b> — 인원 + 1장의 수업카드 중 1장씩 가져가 그 과목의 <b>기운 +2</b>를 얻어요. 이번 달 하려는 활동의 기운을 고르세요. 7개월부터는 주문력 수업이 많은 2학기 덱이에요.</li>
          <li><b>3주차 자율활동</b> — 4구역 중 하나씩 고른 뒤, 고른 순서대로 진행해요. 구역마다 2명까지, 먼저 들어온 친구가 카드를 먼저 골라요.</li>
          <li><b>4주차 정리</b> — 선이 시계방향으로 한 칸 넘어가요.</li>
        </ol>
        <p className="mt-1"><b>6·12개월은 시험 달</b> — 수업·활동 없이 모아 둔 기운으로 시험을 쳐요.</p>
        <p className="mt-1"><b>차례는 언제나 학점이 낮은 친구부터</b>(같으면 선부터 시계방향). 뒤처진 친구가 먼저 골라요.</p>
      </>
    ),
  },
  {
    icon: "compass",
    title: "자율활동 4구역",
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li><b><I n="paw" /> 마법생물 조련 (매력기운)</b> — 생물 카드 2장 중 하나, 주사위 합이 카드의 기준 이상이면 데려와요. <b>매력 +1 · 학점 +1(성장)</b>에 카드의 <b>학점 +1</b>, 그리고 교감으로 속성 능력치 +1(<I n="cloud" /> 하늘 주문력 · <I n="sprout" /> 육지 체력 · <I n="wave" /> 바다 지력).</li>
        <li><b><I n="door" /> 별빛 다락방 탐험 (체력기운)</b> — 탐험 카드 2장 중 하나, 주사위 합이 카드의 목표 이상이면 성공! <b>체력 +1 · 학점 +1</b>과 카드 보상. 실패해도 손해는 없어요.</li>
        <li><b><I n="flask" /> 연구실 실험 (지력기운)</b> — 연구 카드 2장 중 하나, 주사위 합이 카드의 목표(6~8) 이상이면 성공! <b>지력 +1 · 학점 +1</b>과 카드의 다른 능력치 보상.</li>
        <li>
          <b><I n="swords" /> 마법 겨루기 (마나기운)</b> — 친구 한 명을 지목해요.
          <ul className="list-[circle] pl-5 mt-1 space-y-1">
            <li>지목당한 친구는 <b>주사위 1개 + 주문력</b>으로 자동으로 막아요. 한 친구는 <b>한 달에 한 번만</b> 지목받고, 자기 활동은 <b>그대로</b> 해요.</li>
            <li>도전자는 막기 점수를 보고 마나기운을 골라 굴려 <b>더 높으면 승리</b>: <b>주문력 +1 · 학점 +1</b>과 승리 <b>학점 +1</b>.</li>
            <li>
              <span className="mr-1 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">겨루며 배운다</span>
              이기면 친구가 나보다 높은 능력치 중 차이가 가장 큰 것 하나 <b>+1</b>.
            </li>
            <li>같거나 낮으면 친구가 막아 낸 거예요(아무도 받지 않아요).</li>
          </ul>
        </li>
        <li>실패한 카드는 버려요. 카드를 고르지 않고 넘어갈 수도 있어요.</li>
      </ul>
    ),
  },
  {
    icon: "dice",
    title: "시험 (6개월·12개월)",
    body: (
      <>
        <p>시험 과목은 처음부터 정해져 있어요: <b>중간고사 = 마법 마라톤</b>(체력기운 주사위 + 지력), <b>기말고사 = 주문 실기</b>(마나기운 주사위 + 매력).</p>
        <p>시험 달에는 수업·활동 없이 모아 둔 기운으로 시험을 쳐요(학점이 낮은 친구부터 한 명씩). <b>점수 = 주사위 합 + 보너스 능력치</b>, 학점 1위 +3 · 2위 +2 · 나머지 +1.</p>
        <p>굴린 뒤 결과를 확인하고 <b>&quot;확인&quot;</b>을 눌러야 적용돼요. 여러 명이 굴릴 때는 한 명씩 차례대로 굴려요.</p>
      </>
    ),
  },
  {
    icon: "bulb",
    title: "작전 팁",
    body: (
      <ul className="list-disc pl-5 space-y-0.5">
        <li>기운은 얼마든지 모을 수 있지만 한 번에 <b>능력치 + 1개</b>까지만 써요. 큰 카드를 노린다면 먼저 실력을 키우세요.</li>
        <li>졸업식은 네 능력치 순위 싸움이에요. 한 부문 1위(+4)는 2위 두 번과 같아요. 친구들이 몰린 능력치보다 <b>비어 있는 능력치의 1위</b>를 노려 보세요.</li>
        <li>장래희망의 두 능력치를 5까지 키우는 것을 잊지 마세요. 마법생물과의 교감, 연구 카드가 다른 능력치를 키워 줘요.</li>
        <li>중간고사(체력·지력)와 기말고사(주문력·매력)에 쓸 기운을 미리 남겨 두세요.</li>
        <li>마법 겨루기는 주문력이 높은 친구일수록 막기 어려워요. 주문력을 키우면 도전에도, 막기에도 강해져요.</li>
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
