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
  /** 고정 덱 25장 목록까지 보여줄지. 종족 카드만 고르면 되는 화면(온라인 대기실 위자드)에서는
   * false 로 꺼서 "덱 25/25장 (고정)" 이하를 통째로 숨긴다(2026-09-24 사용자 지시). 기본값 true —
   * 핫시트 설정 화면은 그대로 도감을 보여준다 */
  showDeck?: boolean;
}

/** 주사위 아이콘. "랜덤" 타일 전용(2026-09-28: 종족 카드 5장 맨 앞에 6번째 타일로 둔다) */
function DiceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * 종족 선택 (F016, 2026-09-24 개편: 덱 빌딩 자유 선택 폐지). 종족을 고르면 그 종족의 고정
 * 덱(`FIXED_DECKS`, Rules.md 10.7절)이 곧바로 정해진다 — 카드를 낱장으로 고르지 않는다.
 * "랜덤"은 5개 종족 타일 맨 앞에 같은 모양의 6번째 타일로 둔다(2026-09-28 사용자 지시) — 누르면
 * 무작위 종족이 곧바로 정해지고, 그 종족 타일이 선택 표시되어 결과가 바로 보인다. 이 결과는
 * 일반 선택과 똑같이 GameState.players[].race 에 저장되므로 대기실은 물론 실제 게임 중에도
 * PlayerStrip 에서 계속 확인할 수 있다.
 * 아래 카드 목록은 도감처럼 그 종족의 카드 풀 전체를 보여주며, 고정 덱에 포함된 장수만 표시한다
 * (읽기 전용). 카드 하나하나의 상세(호버 팝오버)는 CardFace 가 그대로 맡는다.
 */
export const DeckPicker = memo(function DeckPicker({ race, onPickRace, disabled, onRandom, showDeck = true }: DeckPickerProps) {
  return (
    <div className={styles.deck}>
      <div>
        <h3 className={styles.groupTitle}>
          종족 <span className={styles.groupSub}>1개 선택 · 덱은 자동 고정</span>
        </h3>
        <div className={styles.raceRow}>
          {onRandom && (
            <button type="button" className={cx(styles.mapCard, styles.randomCard, disabled && styles.mapDisabled)} disabled={disabled} onClick={onRandom}>
              <DiceIcon className={styles.raceCardIcon} />
              <span className={styles.mapName}>랜덤</span>
              <span className={styles.mapDesc}>무작위로 하나 고릅니다</span>
            </button>
          )}
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

      {race && showDeck && (
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
