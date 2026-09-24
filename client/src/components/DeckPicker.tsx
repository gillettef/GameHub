import { memo } from 'react';
import type { RaceId } from '@astraltab/shared';
import { DECK_SIZE, FIXED_DECKS, RACES, cardPoolOf } from '@astraltab/shared';
import { RaceArt } from '../game/raceArt';
import { cx } from '../lib/cx';
import { CardFace } from './CardFace';
import styles from './Pickers.module.css';

interface DeckPickerProps {
  race: RaceId | null;
  onPickRace?: (race: RaceId) => void;
  disabled?: boolean;
  /** 종족을 통째로 무작위로 고른다. 없으면 "랜덤" 버튼을 숨긴다 */
  onRandom?: () => void;
}

/**
 * 종족 선택 (F016, 2026-09-24 개편: 덱 빌딩 자유 선택 폐지). 종족을 고르면 그 종족의 고정
 * 덱(`FIXED_DECKS`, Rules.md 10.7절)이 곧바로 정해진다 — 카드를 낱장으로 고르지 않는다.
 * 아래 카드 목록은 도감처럼 그 종족의 카드 풀 전체를 보여주며, 고정 덱에 포함된 장수만 표시한다
 * (읽기 전용). 카드 하나하나의 상세(호버 팝오버)는 CardFace 가 그대로 맡는다.
 */
export const DeckPicker = memo(function DeckPicker({ race, onPickRace, disabled, onRandom }: DeckPickerProps) {
  return (
    <div className={styles.deck}>
      <div>
        <h3 className={styles.groupTitle}>
          종족 <span className={styles.groupSub}>1개 선택 · 덱은 자동 고정</span>
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

      {!race && <p className={styles.racePrompt}>종족을 고르면 고정된 카드 25장 구성이 곧바로 정해집니다.</p>}

      {race && (
        <>
          <div className={cx(styles.deckTotal, styles.deckTotalComplete)}>덱 {DECK_SIZE} / {DECK_SIZE}장 (고정)</div>
          <div className={styles.cardList}>
            {cardPoolOf(race).map((spec) => {
              const n = FIXED_DECKS[race][spec.id] ?? 0;
              return (
                <div key={spec.id} className={cx(styles.cardRow, n === 0 && styles.cardRowUnused)}>
                  <CardFace spec={spec} compact hoverDetails />
                  <span className={styles.fixedCount}>{n > 0 ? `${n}장` : '미포함'}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});
