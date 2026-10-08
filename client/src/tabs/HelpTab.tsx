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
            <strong>식물 고르기</strong>: 공개된 목표 3장을 보고 식물을 번갈아 고릅니다. 고른 식물로 이번 판에 쓸 내 카드가 만들어집니다.
          </li>
          <li>
            <strong>심기</strong>: 내 차례에 손에 든 카드({HAND_SIZE}장) 중 1장을 골라, 내 뿌리가 닿는(영향력 1 이상) 빈 칸에 심고 1장 뽑습니다.
          </li>
          <li>
            <strong>끝</strong>: 모두 남은 카드를 다 쓰면 끝나고 점수를 셉니다. 패스는 없습니다.
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
          판마다 3장이 공개됩니다. "○○ 보호구역"은 끝날 때 내 땅 위에 있는 내 ○○ 1개당 +{RESERVE_BONUS}점이라, 식물 고르기에서 그 식물이 인기가 많아집니다.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>순서 보정</h2>
        <p>두는 순서에 따른 유불리는 식물 고르는 순서와 순서 보너스 점수로 맞춥니다. 점수 탭에 순서 보너스가 표시됩니다.</p>
      </section>
    </div>
  );
});
