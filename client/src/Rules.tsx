import { useEffect } from "react";
import { Icon, InlineIcon, type IconName } from "./Icons";

const I = ({ n }: { n: IconName }) => <InlineIcon name={n} />;

const SECTIONS: { icon: IconName; title: string; body: React.ReactNode }[] = [
  {
    icon: "target",
    title: "게임 목표",
    body: (
      <>
        <p>학생이 되어 12개월 동안 능력치를 키우고, 기말고사가 끝났을 때 <b>마법 성취도(주문력 × 학점)</b>가 가장 높은 친구가 승리해요.</p>
        <p>동점이면 매력이 높은 쪽, 그래도 같으면 주사위로 정해요. (2~5명)</p>
      </>
    ),
  },
  {
    icon: "chart",
    title: "능력치 5가지",
    body: (
      <ul className="list-disc pl-5 space-y-0.5">
        <li><I n="bulb" /> <b>지력</b> — 2주차에 받는 수업카드 수, 시험 주사위 수, 연구실에서 펼치는 카드 수</li>
        <li><I n="staminaToken" /> <b>체력</b> — 매달 받는 체력토큰 수</li>
        <li><I n="heart" /> <b>매력</b> — 3주차 활동 순서(높을수록 먼저), 모든 동점의 우선권</li>
        <li><I n="sparkle" /> <b>주문력</b> — 매달 받는 마법 주문서 수, 토너먼트 전진, 주문 대결 굴림, 성취도의 절반</li>
        <li><I n="cap" /> <b>학점</b> — 시험·토너먼트·마법생물 등으로 쌓이며 성취도의 나머지 절반</li>
      </ul>
    ),
  },
  {
    icon: "calendar",
    title: "한 달(라운드)의 흐름",
    body: (
      <ol className="list-decimal pl-5 space-y-0.5">
        <li><b>1주차 준비</b> — 체력만큼 체력토큰, 주문력만큼 마법 주문서를 받아요.</li>
        <li><b>2주차 정규수업</b> — 지력만큼 수업카드를 받아 원하는 만큼 습득해요. 카드 1장당 체력토큰 1개가 들어요.</li>
        <li><b>3주차 자율활동</b> — 매력이 높은 순서대로 5개 구역 중 하나를 골라요. 구역마다 1명만 들어갈 수 있어요.</li>
        <li><b>4주차 정리</b> — 남은 체력토큰과 마법 주문서는 사라져요. 능력치와 카드, 학점은 그대로예요.</li>
      </ol>
    ),
  },
  {
    icon: "dice",
    title: "시험 (6개월·12개월 뒤)",
    body: (
      <>
        <p>지력 수치만큼 주사위를 굴려 합산한 점수로 순위를 매겨요.</p>
        <p>학점: 1위 +3 / 2위 +2 / 나머지 +1. 동점이면 주문력 → 매력 → 주사위 순으로 가려요.</p>
      </>
    ),
  },
  {
    icon: "compass",
    title: "3주차 자율활동 5종",
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li><b><I n="trophy" /> 마법 토너먼트 참가</b> — 주문력만큼 10칸 트랙을 전진해요. 기말고사 뒤 가장 앞선 친구가 학점 +2, 다음이 +1을 받아요.</li>
        <li><b><I n="paw" /> 마법생물 조련</b> — 카드 1장을 열고 요구 주문력만큼 주문서를 내면 획득해요. 하늘·육지·바다 속성을 모을수록 학점이 생겨요(같은 속성을 많이, 또는 세 속성을 고루).</li>
        <li><b><I n="swords" /> 주문 대결</b> — 아직 활동을 안 고른 친구 1명을 지목해요. 지목당하면 그 친구도 이번 달 대결에 참여해요. 주사위 + 주문력이 큰 쪽이 마도서 카드를 얻고, 진 쪽은 주문서 1개를 잃어요(지목당한 쪽은 잃지 않아요).</li>
        <li><b><I n="door" /> 비밀의 방 탐색</b> — 하이리스크 하이리턴! 탐험 카드를 뽑아 주사위 판정을 해요. 성공하면 크게 성장, 실패하면 다음 달 자원을 잃어요. 선두와 격차가 크면 판정 보너스가 있어요.</li>
        <li><b><I n="flask" /> 연구실 실험</b> — 지력만큼(최대 3장) 연구 카드를 펼쳐 1장을 골라요. 능력치 성장·시험 대비·엿보기·보급 카드가 있어요.</li>
      </ul>
    ),
  },
  {
    icon: "staminaToken",
    title: "체력토큰 집중",
    body: (
      <p>수업 후 남은 체력토큰 1개로 3주차 활동에 <b>집중</b>하면 효과가 +1이에요. (토너먼트 1칸 더, 조련 주문서 -1, 대결 굴림 +1, 탐험 판정 +1, 연구 카드 1장 더) 토큰은 정리 때 사라지니 남기지 말고 써 보세요!</p>
    ),
  },
  {
    icon: "bulb",
    title: "작전 팁",
    body: (
      <ul className="list-disc pl-5 space-y-0.5">
        <li>수업카드를 많이 고를수록 성장하지만, 집중에 쓸 체력토큰이 줄어요.</li>
        <li>뒤처졌다면 비밀의 방 탐색으로 한 방 역전을 노려봐요.</li>
        <li>성취도는 곱셈이라 주문력과 학점을 <b>고르게</b> 올리는 게 좋아요.</li>
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
