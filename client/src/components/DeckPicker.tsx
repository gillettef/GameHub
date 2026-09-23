import { memo } from 'react';
import type { CardId, DeckChoice, RaceId } from '@astraltab/shared';
import { DECK_SIZE, RACES, cardPoolOf, isValidDeckChoice } from '@astraltab/shared';
import { RaceArt } from '../game/raceArt';
import { cx } from '../lib/cx';
import { CardFace } from './CardFace';
import styles from './Pickers.module.css';

export type PartialChoice = { race?: RaceId; cards?: Record<CardId, number> };

export function isCompleteChoice(c: PartialChoice | null | undefined): c is DeckChoice {
  if (!c?.race) return false;
  return isValidDeckChoice({ race: c.race, cards: c.cards ?? {} });
}

interface DeckPickerProps {
  choice: PartialChoice;
  onPickRace?: (race: RaceId) => void;
  /** 카드 한 종류의 장수를 절대값으로 정한다(0 이상, 그 카드의 상한 이내로 호출부가 clamp 한다) */
  onSetCount?: (cardId: CardId, count: number) => void;
  disabled?: boolean;
  /** 종족 + 카드 구성을 통째로 무작위로 채운다. 없으면 "랜덤" 버튼을 숨긴다 */
  onRandom?: () => void;
}

/**
 * 종족 선택 → 그 종족의 카드 전체(기본·특수 구분 없이)에서 자유롭게 장수를 정해 덱을 짠다
 * (F016, 2026-09-23 개편: "기본 22 + 특수 3 고정"에서 "카드마다 상한 이내로 원하는 만큼"으로 바뀌었다).
 * 카드 하나하나의 상세(호버 팝오버)는 CardFace 가 그대로 맡는다.
 */
export const DeckPicker = memo(function DeckPicker({ choice, onPickRace, onSetCount, disabled, onRandom }: DeckPickerProps) {
  const race = choice.race;
  const cards = choice.cards ?? {};
  const total = Object.values(cards).reduce((sum, n) => sum + n, 0);
  const complete = race ? isValidDeckChoice({ race, cards }) : false;

  return (
    <div className={styles.deck}>
      <div>
        <h3 className={styles.groupTitle}>
          종족 <span className={styles.groupSub}>1개 선택</span>
          {onRandom && (
            <button type="button" className={cx('pill', 'pill--outline', styles.randomButton)} disabled={disabled} onClick={onRandom}>
              랜덤
            </button>
          )}
        </h3>
        <div className={styles.raceRow}>
          {RACES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={cx(styles.mapCard, race === r.id && styles.mapSelected, disabled && styles.mapDisabled)}
              aria-pressed={race === r.id}
              disabled={disabled}
              onClick={() => onPickRace?.(r.id)}
            >
              <RaceArt raceId={r.id} className={styles.raceCardIcon} />
              <span className={styles.mapName}>{r.name}</span>
              <span className={styles.mapDesc}>{r.concept}</span>
            </button>
          ))}
        </div>
      </div>

      {!race && <p className={styles.racePrompt}>종족을 먼저 고르면 그 종족의 카드 목록이 나타납니다.</p>}

      {race && (
        <>
          <div className={cx(styles.deckTotal, complete && styles.deckTotalComplete)}>
            덱 {total} / {DECK_SIZE}장{!complete && total > DECK_SIZE ? ' (너무 많습니다)' : ''}
          </div>
          <div className={styles.cardList}>
            {cardPoolOf(race).map((spec) => {
              const n = cards[spec.id] ?? 0;
              return (
                <div key={spec.id} className={styles.cardRow}>
                  <CardFace spec={spec} compact hoverDetails />
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      disabled={disabled || n <= 0}
                      aria-label={`${spec.name} 한 장 빼기`}
                      onClick={() => onSetCount?.(spec.id, n - 1)}
                    >
                      −
                    </button>
                    <span className={styles.stepperCount}>
                      {n} <span className={styles.stepperMax}>/{spec.copies}</span>
                    </span>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      disabled={disabled || n >= spec.copies}
                      aria-label={`${spec.name} 한 장 더하기`}
                      onClick={() => onSetCount?.(spec.id, n + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});
