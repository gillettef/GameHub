import { memo } from 'react';
import type { CardType, DeckChoice, RaceId } from '@astraltab/shared';
import { BASE_CARDS_BY_RACE, BASE_DECK_SIZE, RACES, specialCardsOf } from '@astraltab/shared';
import { cx } from '../lib/cx';
import { CardFace } from './CardFace';
import styles from './Pickers.module.css';

export type PartialChoice = Partial<DeckChoice>;

export const DECK_TYPES: { type: CardType; label: string; key: keyof DeckChoice }[] = [
  { type: 'building', label: '건물', key: 'buildingId' },
  { type: 'unit', label: '유닛', key: 'unitId' },
  { type: 'magic', label: '마법', key: 'magicId' },
];

export function isCompleteChoice(c: PartialChoice | null | undefined): c is DeckChoice {
  return Boolean(c && c.race && c.buildingId && c.unitId && c.magicId);
}

interface DeckPickerProps {
  choice: PartialChoice;
  onPick?: (key: keyof DeckChoice, id: string) => void;
  disabled?: boolean;
  /** 기본 덱 22장 구성을 항상 펼쳐 보일지 (F016) */
  showBaseDeck?: boolean;
}

/** 종족 선택 → 그 종족 특수 카드 종류별 1장 선택 (F016) + 호버 상세 (F017) */
export const DeckPicker = memo(function DeckPicker({ choice, onPick, disabled, showBaseDeck = true }: DeckPickerProps) {
  const race = choice.race as RaceId | undefined;
  return (
    <div className={styles.deck}>
      <div>
        <h3 className={styles.groupTitle}>
          종족 <span className={styles.groupSub}>1개 선택</span>
        </h3>
        <div className={styles.raceRow}>
          {RACES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={cx(styles.mapCard, race === r.id && styles.mapSelected, disabled && styles.mapDisabled)}
              aria-pressed={race === r.id}
              disabled={disabled}
              onClick={() => onPick?.('race', r.id)}
            >
              <span className={styles.mapName}>{r.name}</span>
              <span className={styles.mapDesc}>{r.concept}</span>
            </button>
          ))}
        </div>
      </div>

      {!race && <p className={styles.racePrompt}>종족을 먼저 고르면 그 종족의 특수 카드와 기본 덱이 나타납니다.</p>}

      {race && (
        <>
          <div className={styles.picker}>
            {DECK_TYPES.map((t) => (
              <div key={t.type} className={styles.pickColumn}>
                <h3 className={styles.groupTitle}>
                  {t.label} 특수 카드 <span className={styles.groupSub}>1장 선택</span>
                </h3>
                <div className={styles.cards}>
                  {specialCardsOf(race, t.type).map((spec) => (
                    <CardFace
                      key={spec.id}
                      spec={spec}
                      selected={choice[t.key] === spec.id}
                      disabled={disabled}
                      onClick={disabled ? undefined : () => onPick?.(t.key, spec.id)}
                      hoverDetails
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {showBaseDeck && (
            <details className={styles.baseDeck} open>
              <summary className={styles.summary}>기본 덱 {BASE_DECK_SIZE}장 구성 (선택한 종족 전용)</summary>
              <div className={styles.cards}>
                {BASE_CARDS_BY_RACE[race].map((spec) => (
                  <div key={spec.id} className={styles.baseCard}>
                    <CardFace spec={spec} hoverDetails />
                    <span className={styles.copies}>×{spec.copies}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
});
