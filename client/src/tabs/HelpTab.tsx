import { memo } from 'react';
import { ENTRANCE_ROOTS, RESERVE_BONUS, START_HAND, rulesFor } from '@rootbound/shared';
import styles from './HelpTab.module.css';

/** 설명 탭: 한 화면 규칙 요약 (정본은 notes/Rules.md). 수치는 shared 상수에서 읽는다 */
export const HelpTab = memo(function HelpTab() {
  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.h2}>이야기</h2>
        <p>
          해마다 도시를 돌며 열리는 달빛 정원 박람회. 주최 측이 조립식 화단 블록(구역)을 이어 붙여 부지를 만들어서, 기름진 땅·연못·바위의 자리가 매번 다릅니다. 부지에 칸막이는 없고, 폐막 심사 때 칸마다 <strong>뿌리를 내리고 있는 정원사</strong>의 화단으로 칩니다. 땅속에서는 뿌리끼리 서로 밀어내, 한 칸에는 한 정원사의 뿌리만 남습니다.
          개막 날 올해의 심사 주제(목표 카드)가 발표되면 종묘원이 이번에 공급할 품종(이번 판 식물)을 정합니다. 정원사들은 각자의 출입문(입구)에서 밤마다 묘목을 한 그루씩 심고, 종묘 트럭이 내려놓은 상자(마켓)에서 하나씩 챙겨 갑니다. 묘목은 누가 심었든 그 자리에 뿌리를 둔 정원사의 화단에 속합니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>목표</h2>
        <p>
          차례마다 마켓이나 카드 더미에서 카드 1장을 가져오고, 내 카드 2장 중 1장을 심어 뿌리를 뻗습니다. 끝났을 때 <strong>내 뿌리가 있는 칸 1칸 = 1점</strong>에 목표 카드 3장의 점수를 더해 가장 높은 사람이 이깁니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>한 판의 흐름</h2>
        <ol className={styles.steps}>
          <li>
            <strong>준비</strong>: 이번 판 식물로 카드 더미를 섞어 각자 {START_HAND}장씩 받고, 마켓에 카드 2장을 펼칩니다. 각자 입구와 맞닿은 6칸에 뿌리 {ENTRANCE_ROOTS}개씩을 놓고 시작합니다.
          </li>
          <li>
            <strong>가져오기</strong>: 내 차례에 마켓 2장 중 원하는 카드 1장을 가져오거나(빈자리는 카드 더미에서 바로 채움), 카드 더미 맨 위 1장을 뒷면만 보고 가져옵니다(내 카드 2장). 더미에서 가져온 카드는 나만 봅니다.
          </li>
          <li>
            <strong>심기</strong>: 내 카드 1장을 <strong>내 땅</strong>이나 <strong>내 땅과 맞닿은 빈 칸</strong>에 심고, 카드의 뿌리 모양을 원하는 방향으로 돌려 숫자만큼 뿌리를 놓습니다. 심을 칸이 하나도 없을 때만 1장을 버립니다.
          </li>
          <li>
            <strong>다음 선</strong>: 모두 한 번씩 두면 라운드가 끝납니다. <strong>남은 뿌리가 가장 많은 사람</strong>(가장 적게 퍼진 사람)이 다음 라운드의 선입니다. 같으면 이번 선 다음 자리부터 시계방향으로 처음 만나는 사람입니다.
          </li>
          <li>
            <strong>끝</strong>: 카드를 모두 쓰면 끝납니다(2인 12번, 3·4인 10번 심기). 패스는 없습니다.
          </li>
        </ol>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>뿌리 줄다리기</h2>
        <ul className={styles.list}>
          <li>
            한 칸에는 <strong>한 사람의 뿌리만</strong> 있습니다. 남의 뿌리가 있는 칸에 뿌리를 뻗으면 내 뿌리 1개가 남의 뿌리 1개를 밀어냅니다. 다 밀어내고 남은 만큼 내 뿌리를 놓습니다.
          </li>
          <li>
            <strong>식물은 누구의 것도 아닙니다.</strong> 그 칸에 뿌리를 둔 사람의 땅이고, 그 위 식물도 그 사람 점수에 셉니다.
          </li>
          <li>
            한 사람의 뿌리는 2인 {rulesFor(2).supply} / 3인 {rulesFor(3).supply} / 4인 {rulesFor(4).supply}개뿐입니다. 남은 뿌리가 모자라면 <strong>가장 높이 쌓인 내 칸</strong>에서 옮겨 옵니다. 밀려난 뿌리는 주인에게 돌아갑니다.
          </li>
          <li>버섯은 맞닿은 6칸의 남의 뿌리를 걷어내고, 민들레는 두 칸 안 아무 칸에 씨앗 뿌리 1개를 날립니다.</li>
          <li>보드의 원 숫자가 그 칸의 뿌리 수이고, 원 색이 땅 주인입니다. 아래 "뿌리 수" 버튼으로 끄고 켭니다.</li>
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>지형</h2>
        <ul className={styles.terrain}>
          <li>
            <span className={styles.swatchFertile} /> 기름진 땅: 보통 땅과 같고, 목표 "비옥한 밭"이 셉니다
          </li>
          <li>
            <span className={styles.swatchPond} /> 연못: 심을 수 없고 누구의 땅도 아님. 연꽃은 연못 옆 빈 칸이면 어디든 심음
          </li>
          <li>
            <span className={styles.swatchRock} /> 바위: 심을 수 없고 누구의 땅도 아님
          </li>
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>목표 카드</h2>
        <p>
          판마다 3장이 공개됩니다. "○○ 보호구역"은 끝날 때 내 땅 위에 있는 ○○ 1개당 +{RESERVE_BONUS}점입니다. 누가 심었든 상관없어서, 남이 심은 식물을 뿌리로 감싸 빼앗을 수 있습니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>순서 보정</h2>
        <p>남은 뿌리가 많은 사람이 선을 잡아 앞선 사람을 따라잡을 기회를 줍니다. 4인만 2~4번 자리가 순서 보너스 1점을 받고 시작합니다.</p>
      </section>
    </div>
  );
});
