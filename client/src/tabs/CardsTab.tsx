import { memo } from 'react';
import { BASE_CARDS_BY_RACE, CORE_SPEC, RACES, SPECIAL_CARDS_BY_RACE } from '@astraltab/shared';
import { CardFace } from '../components/CardFace';
import styles from './CardsTab.module.css';

/**
 * 카드 탭 (2026-09-23 사용자 지시: 하단 독에 전체 카드 리스트 설명). 종족별 기본 덱·특수 카드
 * 전부(57종) + 코어를 한곳에 모아 둔다. 실제 손패·덱 빌딩과 같은 CardFace 컴포넌트를 그대로 써서
 * 표시가 어긋나지 않는다. 목록이 길어 종족별로 접어 둔다.
 */
export const CardsTab = memo(function CardsTab() {
  return (
    <div className={styles.root}>
      <section className={styles.panel}>
        <h2 className={styles.title}>코어</h2>
        <p className={styles.help}>종족과 무관하게 전 좌석 동일. 게임 시작 시 자동 배치되며 덱에는 없습니다.</p>
        <div className={styles.cards}>
          <CardFace spec={CORE_SPEC} hoverDetails />
        </div>
      </section>

      {RACES.map((race) => (
        <section key={race.id} className={styles.panel}>
          <h2 className={styles.title}>{race.name}</h2>
          <p className={styles.help}>{race.concept}</p>
          <details className={styles.group} open>
            <summary className={styles.summary}>기본 덱 {BASE_CARDS_BY_RACE[race.id].length}종</summary>
            <div className={styles.cards}>
              {BASE_CARDS_BY_RACE[race.id].map((spec) => (
                <div key={spec.id} className={styles.cardWrap}>
                  <CardFace spec={spec} hoverDetails />
                  <span className={styles.copies}>×{spec.copies}</span>
                </div>
              ))}
            </div>
          </details>
          <details className={styles.group}>
            <summary className={styles.summary}>특수 카드 {SPECIAL_CARDS_BY_RACE[race.id].length}종 (덱 빌딩에서 종류별 1장)</summary>
            <div className={styles.cards}>
              {SPECIAL_CARDS_BY_RACE[race.id].map((spec) => (
                <CardFace key={spec.id} spec={spec} hoverDetails />
              ))}
            </div>
          </details>
        </section>
      ))}
    </div>
  );
});
