import { memo } from 'react';
import { ENTRANCE_ROOTS, GOAL_COUNT, HAND_MAX, RESERVE_BONUS, START_HAND, TAKE_COUNT, rulesFor } from '../../engine';
import { CREW_NAMES } from '../game/derived';
import styles from './HelpTab.module.css';

/** 인원별 라운드 수 (Rules.md 5.2). 같은 수끼리 묶는다: "2인 18라운드, 3·4인 15라운드" */
function roundsText(): string {
  const groups: { counts: number[]; rounds: number }[] = [];
  for (let n = 2; n <= 4; n++) {
    const rounds = rulesFor(n).rounds;
    const last = groups[groups.length - 1];
    if (last && last.rounds === rounds) last.counts.push(n);
    else groups.push({ counts: [n], rounds });
  }
  return groups.map((g) => `${g.counts.join('·')}인 ${g.rounds}라운드`).join(', ');
}

/** 4인 덤: 덤을 받는 자리 범위와 점수 (Rules.md 4절 자리 보정). "2~4번 자리가 순서 보너스 1점" */
function komiText(): string {
  const komi = rulesFor(4).komi;
  const seats = komi.flatMap((k, seat) => (k > 0 ? [seat + 1] : []));
  const first = seats[0] ?? 0;
  const last = seats[seats.length - 1] ?? 0;
  return `${first === last ? first : `${first}~${last}`}번 자리가 순서 보너스 ${komi[first - 1] ?? 0}점`;
}

/** 지형 견본 그림 (페이지 기준 상대경로, 보드 칸과 같은 그림) */
const TERRAINS = [
  { art: 'empty', name: '골목길', text: '명당을 놓을 수 있고 고양이가 앉는 보통 칸' },
  { art: 'fertile', name: '햇볕 자리', text: '골목길과 같고, 소문 카드 "양지바른 곳"이 셉니다' },
  { art: 'pond', name: '개울', text: '놓을 수 없고 고양이도 앉지 않음. 낚시꾼은 개울과 맞닿은 칸이면 남의 칸에도 놓음' },
  { art: 'rock', name: '공사장', text: '놓을 수 없고 고양이도 앉지 않음' },
] as const;

/** 설명 탭: 한 화면 규칙 요약 (정본은 notes/Rules.md, 고양이 테마 문구는 submission/rulebook.md). 수치는 엔진 상수에서 읽는다 */
export const HelpTab = memo(function HelpTab() {
  const r2 = rulesFor(2);
  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.h2}>이야기</h2>
        <p>
          오래된 골목에 {CREW_NAMES.slice(0, 3).join('·')} 무리가 삽니다(넷이면 {CREW_NAMES[3]}까지). 담장도 문패도 없는 골목이라, 평상이든 종이 상자든 해 질 녘에 <strong>그 자리에 앉아 있는 무리</strong>가 주인입니다. 이 동네 고양이들은 할퀴며 싸우지 않습니다. 대신 슬그머니 비집고 들어가 한 마리씩 밀어내는 데 선수라, 한 칸에는 늘 한 무리만 남습니다.
          아침마다 골목에 소문이 돕니다. "요즘은 개울가 산책이 최고래", "상자 단골이 대접받는대". 여러분은 무리의 대장이 되어 아지트에서 출발해 하루에 명당 하나씩을 찾아내고 고양이들을 불러 모읍니다. 명당은 누가 찾아냈든, 마지막에 그 자리를 지키고 있는 무리의 것입니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>꼭 알아야 할 세 가지</h2>
        <ol className={styles.steps}>
          <li>
            <strong>내 영역</strong>: 내 고양이가 1마리 이상 앉은 칸이 <strong>내 칸</strong>, 내 칸 전체가 <strong>내 영역</strong>입니다. 한 칸에는 언제나 한 무리의 고양이만 있어서, 고양이 색만 보면 칸 주인을 압니다.
          </li>
          <li>
            <strong>한 마리가 한 마리를 쫓아낸다</strong>: 남의 고양이가 앉은 칸에 내 고양이가 오면 1마리가 1마리를 쫓아냅니다. 쫓겨난 고양이는 주인의 쉬는 고양이로 돌아갑니다.
          </li>
          <li>
            <strong>명당은 그 자리를 차지한 무리의 것</strong>: 명당은 누가 놓았는지 따지지 않습니다. 끝날 때 그 칸에 앉은 무리가 점수를 가져갑니다.
          </li>
        </ol>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>게임 목표</h2>
        <p>
          끝났을 때 <strong>내 칸 1칸 = 1점</strong>, 공개된 소문 카드 {GOAL_COUNT}장의 점수, 내 영역 위 캣맘 급식소 1개당 1점을 더해 가장 높은 사람이 이깁니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>준비</h2>
        <p>
          쉬는 고양이는 2인 {r2.supply} / 3인 {rulesFor(3).supply} / 4인 {rulesFor(4).supply}마리입니다. 각자 아지트와 맞닿은 6칸에 {ENTRANCE_ROOTS}마리씩 앉히고 시작합니다. 이번 판 명당 타일을 주머니에 넣고 각자 {START_HAND}개씩 손에 들며, 타일 {r2.market}개를 펼쳐 둡니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>차례: 셋 중 하나만</h2>
        <p>
          선부터 차례대로 한 사람씩 둡니다. 내 차례에는 아래 셋 중 <strong>하나만</strong> 합니다. {roundsText()}를 하면 게임이 끝납니다.
        </p>
        <ol className={styles.steps}>
          <li>
            <strong>타일 가져오기</strong>: 펼친 타일 {r2.market}개 중 <strong>1개</strong>(빈자리는 주머니에서 바로 채움)를 가져오거나, 주머니에서 <strong>{TAKE_COUNT}개</strong>를 꺼내 나만 봅니다. 손 타일은 최대 {HAND_MAX}개라, 2개를 들고 있으면 주머니에서도 1개만, {HAND_MAX}개면 가져올 수 없습니다.
          </li>
          <li>
            <strong>명당 놓기</strong>: 손의 타일 1개를 <strong>내 칸</strong>이나, <strong>내 칸·아지트와 맞닿은 고양이 없는 칸</strong>에 원하는 방향으로 돌려 놓습니다. 남의 고양이가 앉은 칸에는 놓을 수 없습니다(낚시꾼만 예외). 이 차례에는 타일을 가져오지 않습니다.
          </li>
          <li>
            <strong>명당 부르기</strong>: <strong>내 칸 위의 명당</strong> 하나를 원하는 방향으로 다시 돌려, 그 모양대로 고양이를 다시 부릅니다. 누가 놓은 명당이든 지금 내 칸이면 됩니다. 능력(멀리 보내기·쫓아내기·개울)은 쓰지 않습니다.
          </li>
        </ol>
        <p className={styles.note}>
          손의 어떤 타일도 놓을 칸이 없으면 놓기 대신 1개를 버릴 수 있습니다. 셋 다 할 수 없으면 그 차례는 쉽니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>고양이 모이기 (놓기·부르기)</h2>
        <p>타일 그림의 숫자만큼 그 칸과 가리키는 쪽 칸에 고양이가 모입니다(»는 두 칸 앞). 두 단계로 합니다.</p>
        <ul className={styles.list}>
          <li>
            <strong>쫓아내기</strong>: 남의 고양이가 앉은 칸마다 오는 고양이 1마리가 남의 고양이 1마리를 쫓아냅니다. 쫓아내기에는 쉬는 고양이를 쓰지 않습니다.
          </li>
          <li>
            <strong>앉히기</strong>: 남은 수만큼 내 쉬는 고양이를 앉힙니다.
          </li>
          <li>
            <strong>쉬는 고양이가 모자라면</strong>: 이번에 앉힐 칸을 뺀 <strong>내 칸 중 원하는 칸</strong>에서 1마리씩 데려옵니다(칸이 비어도 됩니다). 놓기·부르기 바의 "데려올 칸 고르기"로 고르고, 고르지 않으면 가장 높이 쌓인 칸에서 데려옵니다.
          </li>
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>라운드와 선</h2>
        <p>
          모두 한 차례씩 하면 라운드가 끝납니다. <strong>쉬는 고양이가 가장 많은 사람</strong>(고양이를 가장 적게 내보낸 무리)이 다음 라운드 선입니다. 같으면 지금 선 다음 자리부터 시계 방향으로 처음 만나는 사람입니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>끝과 점수</h2>
        <ul className={styles.list}>
          <li>{roundsText()}가 끝나면 게임이 끝납니다(주머니·펼친 타일·모두의 손이 먼저 비면 그 라운드 끝에). 손에 남은 타일은 점수와 무관합니다.</li>
          <li>
            점수 = 내 칸 + 소문 카드 {GOAL_COUNT}장 + 캣맘 급식소. "○○ 단골"은 내 영역 위 ○○ 1개당 +{RESERVE_BONUS}점이라, 남이 놓은 명당도 내 고양이로 차지하면 내 점수입니다.
          </li>
          <li>동점이면 내 칸이 많은 사람 → 내 영역 위 명당이 많은 사람 → 차례 순서가 늦은 사람이 이깁니다. 4인만 {komiText()}을 받고 시작합니다.</li>
          <li>보드의 원 숫자가 그 칸의 고양이 수이고, 원 색이 칸 주인입니다. ≡ 메뉴의 "칸마다 고양이 수"로 끄고 켭니다.</li>
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>지형</h2>
        <ul className={styles.terrain}>
          {TERRAINS.map((t) => (
            <li key={t.art}>
              <img className={styles.swatch} src={`./art/terrain-${t.art}.svg`} alt="" width={22} height={22} />
              <span>
                <strong>{t.name}</strong>: {t.text}
              </span>
            </li>
          ))}
          <li>
            <img className={styles.swatch} src="./art/hideout-0.svg" alt="" width={22} height={22} />
            <span>
              <strong>아지트</strong>: 각 무리의 출발점. 놓을 수 없고 누구의 영역도 아님
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
});
