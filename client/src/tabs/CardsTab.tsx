import { memo } from 'react';
import type { RaceId } from '@astraltab/shared';
import { BASE_CARDS_BY_RACE, CORE_SPEC, FIXED_DECKS, RACES, SPECIAL_CARDS_BY_RACE } from '@astraltab/shared';
import { CardMini } from '../components/CardMini';
import { useGameStore } from '../store/gameStore';
import styles from './CardsTab.module.css';

/** 고정 덱에 든 장수 표시. 안 든 카드는 "미포함" */
function deckCount(race: RaceId, cardId: string): string {
  const n = FIXED_DECKS[race][cardId] ?? 0;
  return n > 0 ? `×${n}` : '미포함';
}

/**
 * 카드 탭 (2026-09-23 사용자 지시: 하단 독에 전체 카드 리스트 설명). 종족별 카드 전부(5종족 × 19종) + 코어를
 * 한곳에 모아 둔다. 2026-10-01부터 손패와 같은 작은 아이콘 카드(CardMini)로 보여 주고, 탭하면 확대 모달(CardModal)로 읽는다.
 * 목록이 길어 종족별로 접어 둔다. "기본/특수"는 카탈로그 정리용 구분일 뿐이고, 실제 덱은 종족이 정하는 고정 25장이다.
 */
export const CardsTab = memo(function CardsTab() {
  const openCardModal = useGameStore((s) => s.openCardModal);
  const open = (cardId: string) => () => openCardModal({ kind: 'spec', cardId });
  return (
    <div className={styles.root}>
      <section className={styles.panel}>
        <h2 className={styles.title}>코어</h2>
        <p className={styles.help}>카드에 적힌 시야·체력·공격·사거리·점수는 기본값입니다. 놓은 칸의 지형에 따라 달라지며(설명 탭 지형 참고) 보드 마커 툴팁에 반영된 값이 나옵니다. 종족과 무관하게 전 좌석 동일. 게임 시작 시 자동 배치되며 덱에는 없습니다.</p>
        <div className={styles.cards}>
          <CardMini spec={CORE_SPEC} onClick={open(CORE_SPEC.id)} />
        </div>
      </section>

      {RACES.map((race) => (
        <section key={race.id} className={styles.panel}>
          <h2 className={styles.title}>{race.name}</h2>
          <p className={styles.help}>{race.concept} · 종족을 고르면 고정 덱 25장(기본 22장 + 특수 3장)이 정해집니다. 표시는 그 덱에 든 장수입니다.</p>
          <details className={styles.group} open>
            <summary className={styles.summary}>기본 카드 {BASE_CARDS_BY_RACE[race.id].length}종</summary>
            <div className={styles.cards}>
              {BASE_CARDS_BY_RACE[race.id].map((spec) => (
                <div key={spec.id} className={styles.cardWrap}>
                  <CardMini spec={spec} onClick={open(spec.id)} />
                  <span className={styles.copies}>{deckCount(race.id, spec.id)}</span>
                </div>
              ))}
            </div>
          </details>
          <details className={styles.group}>
            <summary className={styles.summary}>특수 카드 {SPECIAL_CARDS_BY_RACE[race.id].length}종</summary>
            <div className={styles.cards}>
              {SPECIAL_CARDS_BY_RACE[race.id].map((spec) => (
                <div key={spec.id} className={styles.cardWrap}>
                  <CardMini spec={spec} onClick={open(spec.id)} />
                  <span className={styles.copies}>{deckCount(race.id, spec.id)}</span>
                </div>
              ))}
            </div>
          </details>
        </section>
      ))}
    </div>
  );
});
