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
        <p>학생이 되어 12개월 동안 능력치를 키우고, 기말고사가 끝났을 때 <b>최종 점수 = 마법 성취도(주문력 × 학점) + 마법생물 세트 점수</b>가 가장 높은 친구가 승리해요.</p>
        <p>마법생물은 <I n="cloud" /> 하늘·<I n="sprout" /> 육지·<I n="wave" /> 바다를 1장씩 모아 한 세트를 만들 때마다 <b>5점</b>이에요.</p>
        <p>동점이면 <b>공동 승리</b>예요. (2~5명)</p>
      </>
    ),
  },
  {
    icon: "chart",
    title: "능력치 5가지",
    body: (
      <ul className="list-disc pl-5 space-y-0.5">
        <li><I n="bulb" /> <b>지력</b> — 매달 받는 지력토큰 수(주사위 다시 굴리기에 써요), 시험·탐험에서 굴리는 주사위 수. 초반에 키워 두면 든든해요</li>
        <li><I n="staminaToken" /> <b>체력</b> — 매달 받는 체력토큰 수(수업카드·연구 카드 습득, 연구실 주사위에 써요), 시험·탐험에서 굴리는 주사위 수. 주문력 수업카드는 체력토큰이 많이 들어서 체력이 먼저 필요해요</li>
        <li><I n="heart" /> <b>매력</b> — 매달 받는 매력토큰 수(이미 친구가 있는 구역에 들어갈 때 내요), 4주차에 매력토큰을 가장 많이 남긴 친구가 다음 달 <b>선</b>이 돼요. 주문 대결에서는 지목당한 친구에게 건네기도 해요</li>
        <li><I n="sparkle" /> <b>주문력</b> — 매달 받는 마나토큰 수(토너먼트·조련의 주사위), 주문 대결에서 굴리는 주사위 수, 성취도의 한 축. 후반 승부의 열쇠예요</li>
        <li><I n="cap" /> <b>학점</b> — 시험·토너먼트·마법생물 등으로 쌓이며 성취도의 다른 한 축</li>
      </ul>
    ),
  },
  {
    icon: "users",
    title: "선 플레이어와 진행 순서",
    body: (
      <>
        <p>게임을 시작할 때 <I n="dice" /> 주사위를 굴려 가장 높은 친구가 첫 달의 <b>선</b>이에요(동점이면 동점자끼리 다시).</p>
        <p>정규수업·자율활동 모두 <b>선부터 시계방향</b>으로 진행해요.</p>
        <p>한 달이 끝나는 4주차에 <b>매력토큰을 가장 많이 남긴 친구가 다음 달 선</b>이 돼요(구역 참가비로 쓰지 않고 아껴 두면 유리해요). 남긴 개수가 같으면 지금 선에서 시계방향으로 가장 가까운 친구가 선이 되고, 모두 0개면 선이 시계방향으로 한 칸 넘어가요.</p>
      </>
    ),
  },
  {
    icon: "calendar",
    title: "한 달(라운드)의 흐름",
    body: (
      <>
      <ol className="list-decimal pl-5 space-y-0.5">
        <li><b>1주차 준비</b> — 지력만큼 지력토큰, 체력만큼 체력토큰, 매력만큼 매력토큰, 주문력만큼 마나토큰을 받아요.</li>
        <li><b>2주차 정규수업</b> — 플레이어 수 + 1장의 수업카드가 모두에게 공개돼요. <b>선부터 시계방향</b>으로 한 명씩 원하는 카드를 1장 가져가요(<I n="staminaToken" /> 체력토큰이 카드마다 달라요. 원하지 않으면 넘어가도 돼요). 남은 카드는 사라져요. 수업카드 덱은 <b>1학기·2학기로 나뉘어</b>, 중간고사 다음 달부터 주문력 위주의 새 덱으로 바뀌어요.</li>
        <li><b>3주차 자율활동</b> — <b>먼저 선부터 시계방향으로 5개 구역 중 하나씩 고르고</b>(다른 친구가 고른 활동도 모두 보여요), 모두 고르고 나면 <b>고른 순서대로 한 명씩 차례로 진행</b>돼요. 구역마다 최대 2명까지 들어갈 수 있고, 먼저 고른 친구가 있으면 <I n="charmToken" /> 매력토큰 1개를 더 내요. 카드를 여는 구역(마법생물·비밀의 방·연구실·주문 대결)은 <b>처음 들어온 사람이 카드 2장을 공개</b>해요. 먼저 온 사람이 원하는 카드를 가져가고, 남은 카드는 두 번째로 들어온 사람이 가져가요. 비용을 못 내면 그 카드는 가져갈 수 없어요.</li>
        <li><b>4주차 정리</b> — 남은 지력토큰·체력토큰·매력토큰·마나토큰은 사라져요. 다만 <b>어떤 토큰이든 1개</b>는 골라서 다음 달로 남길 수 있어요. 능력치와 카드, 학점은 그대로예요.</li>
      </ol>
      <p className="mt-1"><b>시험 달(6개월·12개월)</b>에는 1주차 준비 뒤에 2·3주차 대신 <b>중간고사·기말고사</b>를 치르고, 4주차에 정리해요(시험에서 다시 굴리고 남은 지력토큰도 1개 남길 수 있어요). 기말고사가 끝나면 게임이 끝나요.</p>
      </>
    ),
  },
  {
    icon: "dice",
    title: "시험 (6개월·12개월)",
    body: (
      <>
        <p>시험 과목(시험 카드)은 게임마다 달라요. 주사위는 <b>지력 또는 체력</b> 수치만큼 굴려요. <b>3개월·9개월이 끝나면</b> 중간고사·기말고사 카드가 공개돼요.</p>
        <p>모두 <b>주사위 굴리기 버튼</b>을 눌러 카드가 정한 능력치 수치만큼 주사위를 굴리고, 보너스 능력치가 있으면 그 수치를 더한 점수로 순위를 매겨요.</p>
        <p>주사위(선 정하기·모든 자율활동·시험)는 굴린 뒤 <b>결과를 눈으로 확인하고 &quot;확인&quot; 버튼</b>을 눌러야 결과가 적용돼요.</p>
        <p><b>지력토큰 다시 굴리기</b>: 결과를 확인하기 전에 <I n="intToken" /> 지력토큰 1개로 주사위 1개를 다시 굴릴 수 있어요. 주사위가 여러 개면 원하는 주사위만 골라 원하는 만큼 다시 굴려요(선 정하기는 제외). 시험을 치르는 달에도 1주차에 지력토큰을 받으니 시험 다시 굴리기에 쓸 수 있어요.</p>
        <p>학점: 1위 +3 / 2위 +2 / 나머지 +1. 점수가 같으면 <b>공동 순위</b>예요. 같은 순위는 같은 학점을 받고(1위 공동이면 둘 다 +3, 다음 친구는 3위), 순위는 1, 1, 3 순서로 이어져요.</p>
      </>
    ),
  },
  {
    icon: "compass",
    title: "3주차 자율활동 5종",
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li><b><I n="trophy" /> 마법 토너먼트 참가</b> — 가진 마나토큰을 모두 내고, 낸 개수만큼 주사위를 굴려 나온 눈을 모두 더한 칸만큼 트랙을 전진해요(트랙에는 상한이 없어요, 마나토큰이 1개 이상 있어야 해요). 기말고사 뒤 가장 앞선 친구가 학점 +2, 다음이 +1을 받아요. 같은 칸이면 공동 순위예요. 순위는 &quot;토너먼트&quot; 탭에서 언제든 볼 수 있어요.</li>
        <li><b><I n="paw" /> 마법생물 조련</b> — 공개된 마법생물 2장(카드에 속성·종류가 적혀 있어요) 중 하나를 골라요(요구 마나토큰 이상 필요). 가진 마나토큰을 모두 내고 그만큼 주사위를 굴려 <b>합 + 생물별 능력치 보너스</b>가 카드의 목표값 이상이면 조련 성공! 보너스는 생물마다 달라요(하늘 = 주문력, 육지 = 체력, 바다 = 매력을 2 : 동물 = 체력, 식물 = 매력 1 비율로 섞어요). 실패하면 마나토큰만 잃고 카드는 구역에 돌아가 두 번째 참가자가 도전할 수 있어요. 하늘·육지·바다 속성을 1장씩 모은 <b>세트</b>는 최종 점수에 5점씩 더해져요. 카드마다 다른 능력도 있어요.</li>
        <li><b><I n="swords" /> 주문 대결</b> — 아직 활동을 안 고른 친구 1명을 지목해요. 지목당하면 그 친구도 이번 달 대결에 참여하고(구역도, 추가 비용도 필요 없어요), 도전자는 결과와 상관없이 지목한 친구에게 <I n="heart" /> 매력 1을 건네요. 둘 다 가진 마나토큰을 모두 내고(지목당한 친구는 마나토큰이 없어도 주사위 1개) 낸 개수만큼 주사위를 굴려 합이 큰 쪽이 공개된 마도서 2장 중 1장을 골라 얻고(합이 같으면 무승부라 아무도 얻지 못해요). 도전하려면 마나토큰이 1개 이상 필요해요.</li>
        <li><b><I n="door" /> 비밀의 방 탐색</b> — 하이리스크 하이리턴! 공개된 탐험 카드 2장 중 하나를 골라, 카드가 정한 <b>지력 또는 체력토큰</b>을 모두 내고 낸 개수만큼(없어도 1개) 주사위를 굴려 합이 목표값 이상이면 성공이에요(목표값은 달마다 조금씩 올라요). 남은 카드는 두 번째로 들어온 친구가 맡아요. 성공하면 크게 성장, 실패하면 다음 달 자원을 잃어요. 선두와 격차가 크면 판정 보너스가 있어요. <b>협력 카드</b>가 나오면 다른 친구가 합류할 때까지 기다렸다가, 둘의 (주사위 + 능력치) 합으로 판정하고 보상을 둘 다 받아요. 끝까지 친구가 없으면 카드는 무효가 돼요.</li>
        <li><b><I n="flask" /> 연구실 실험</b> — 연구 카드 2장이 공개돼요. 1장을 골라 카드에 적힌 만큼 체력토큰을 내고, 카드를 본 뒤 <b>지력토큰</b>을 몇 개 낼지 골라(최소 1개, 안 낸 토큰은 다시 굴리기에 써요) 낸 개수만큼 주사위를 굴려 합이 낮은 목표값 이상이면 실험 성공이에요. 가장 안정적이지만 효과는 작아요(아무것도 안 고르고 넘어가도 돼요). 남은 카드는 두 번째로 들어온 친구가 가져가요. 능력치 성장·시험 대비·엿보기·보급 카드가 있어요.</li>
      </ul>
    ),
  },
  {
    icon: "bulb",
    title: "작전 팁",
    body: (
      <ul className="list-disc pl-5 space-y-0.5">
        <li>비싼 수업카드를 고르면 성장하지만, 연구 카드에 쓸 체력토큰이 줄어요. 초반에는 지력·체력을 키워 두고, 후반에 주문력과 학점으로 점수를 만들어요.</li>
        <li>인기 있는 구역은 두 번째로 들어가려면 매력토큰이 더 들어요. 비어 있는 구역이 나을 수도 있어요.</li>
        <li>매력을 높게 유지하면 구역 참가비(매력토큰)가 넉넉하고, 선을 잡아 정규수업·자율활동을 먼저 고를 수 있어요.</li>
        <li>뒤처졌다면 비밀의 방 탐색으로 한 방 역전을 노려봐요.</li>
        <li>1학기(1~6개월)에는 지력·체력을 키우고 탐험·연구실을 노리고, 2학기(7~12개월)에는 주문력과 학점을 노려요. 주문력 수업카드는 체력토큰이 많이 들어서 체력이 먼저 필요해요.</li>
        <li>성취도는 곱셈이라 주문력과 학점을 <b>고르게</b> 올리는 게 좋아요. 마법생물 세트도 점수가 돼요. 지력토큰은 위험한 판정이나 시험 앞에서 아껴 두면 든든해요.</li>
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
