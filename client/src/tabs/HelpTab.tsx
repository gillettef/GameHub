import { memo } from 'react';
import { ENTRANCE_RING, ENTRANCE_SELF, FERTILE_BONUS, HAND_SIZE, RESERVE_BONUS } from '@rootbound/shared';
import styles from './HelpTab.module.css';

/** 설명 탭: 한 화면 규칙 요약 (정본은 notes/Rules.md). 수치는 shared 상수에서 읽는다 */
export const HelpTab = memo(function HelpTab() {
  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.h2}>목표</h2>
        <p>
          차례마다 식물 하나를 심어 땅을 넓힙니다. 끝났을 때 <strong>내 땅 1칸 = 1점</strong>에 목표 카드 3장의 점수를 더해 가장 높은 사람이 이깁니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>한 판의 흐름</h2>
        <ol className={styles.steps}>
          <li>
            <strong>준비</strong>: 목표 3장과 이번 판 식물이 공개됩니다(카드 탭 위쪽). 이 식물들로 카드 더미를 섞고 각자 {HAND_SIZE}장씩 받습니다.
          </li>
          <li>
            <strong>마켓</strong>: 라운드가 시작될 때마다 카드 더미에서 카드를 앞면으로 펼칩니다. 이것이 마켓이고, 모두가 볼 수 있습니다.
          </li>
          <li>
            <strong>심기</strong>: 내 차례에 내 카드 1장을 골라 내 뿌리가 닿는(영향력 1 이상) 빈 칸에 심고, 마켓에서 1장을 골라 가져옵니다. 심을 칸이 하나도 없을 때만 1장을 버리고 가져옵니다.
          </li>
          <li>
            <strong>끝</strong>: 카드 더미와 마켓이 떨어지면 남은 내 카드만 씁니다. 모두 카드를 다 쓰면 끝나고 점수를 셉니다. 패스는 없습니다.
          </li>
        </ol>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>영향력과 땅</h2>
        <ul className={styles.list}>
          <li>식물은 카드 그림에 숫자가 적힌 칸마다 그 숫자만큼 영향력을 줍니다. 칸마다 사람별로 더합니다.</li>
          <li>
            한 칸에서 영향력이 <strong>가장 큰 한 사람</strong>이 그 칸의 주인입니다. 동점이면 아무의 땅도 아닙니다.
          </li>
          <li>식물은 사라지지 않지만, 상대가 옆에 더 강하게 심으면 그 칸은 상대 땅이 됩니다.</li>
          <li>
            입구는 입구 칸에 {ENTRANCE_SELF}, 맞닿은 6칸에 {ENTRANCE_RING}의 영향력을 줍니다.
          </li>
          <li>보드 아래 "영향력" 버튼을 켜면 칸마다 "내 영향력 : 가장 센 상대"가 보입니다.</li>
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>지형</h2>
        <ul className={styles.terrain}>
          <li>
            <span className={styles.swatchFertile} /> 기름진 땅: 여기 심은 식물은 이 칸에 +{FERTILE_BONUS}
          </li>
          <li>
            <span className={styles.swatchPond} /> 연못: 심을 수 없고 누구의 땅도 아님. 연꽃은 연못 옆이면 뿌리 없이도 심음
          </li>
          <li>
            <span className={styles.swatchRock} /> 바위: 심을 수 없고 누구의 땅도 아님
          </li>
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>목표 카드</h2>
        <p>
          판마다 3장이 공개됩니다. "○○ 보호구역"은 끝날 때 내 땅 위에 있는 내 ○○ 1개당 +{RESERVE_BONUS}점이라, 마켓에 그 식물이 나오면 서로 가져가려 합니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>순서 보정</h2>
        <p>두는 순서에 따른 유불리는 순서 보너스 점수로 맞춥니다. 점수 탭에 순서 보너스가 표시됩니다.</p>
      </section>
    </div>
  );
});
