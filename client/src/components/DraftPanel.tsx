import { memo, useState, type CSSProperties } from 'react';
import type { SpeciesId } from '@rootbound/shared';
import { SPECIES_IDS, draftOptions, getSpecies, rulesFor } from '@rootbound/shared';
import { asState } from '../game/derived';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { GoalList } from './GoalList';
import { SpeciesCard } from './SpeciesCard';
import styles from './DraftPanel.module.css';

/**
 * 드래프트 (Rules.md 5절). 공개 목표 3장을 보고, 뱀 순서로 한 종씩 가져간다.
 * 카드를 누르면 크게 보이고, 내 차례면 "이 종 고르기"로 확정한다.
 */
export const DraftPanel = memo(function DraftPanel() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const draft = useGameStore((s) => s.draft);
  const sending = useGameStore((s) => s.sending);
  const [focus, setFocus] = useState<SpeciesId | null>(null);
  if (!state) return null;
  const options = viewerId && isMyTurn ? draftOptions(asState(state), viewerId) : [];
  const rule = rulesFor(state.players.length);
  const current = state.players.find((p) => p.id === state.currentPlayerId);
  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const takersOf = (s: SpeciesId) => players.filter((p) => p.drafted.includes(s));

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.h2}>이번 판 목표</h2>
        <GoalList goals={state.goals} />
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h2 className={styles.h2}>식물 고르기</h2>
          <span className={styles.progress}>
            {state.draftIndex + 1}/{state.draftOrder.length} · {isMyTurn ? <strong>내 차례</strong> : `${current?.nickname ?? ''} 고르는 중`}
          </span>
        </div>
        <p className={styles.help}>
          각자 {rule.picks}종을 골라 이번 판 덱(종마다 {rule.copies}장)을 만듭니다.
          {rule.maxTakers > 1 ? ` 한 종은 ${rule.maxTakers}명까지 가져갈 수 있습니다.` : ' 남이 가져간 종은 고를 수 없습니다.'}
        </p>
        <div className={styles.grid}>
          {SPECIES_IDS.map((s) => {
            const takers = takersOf(s);
            const pickable = options.includes(s);
            return (
              <SpeciesCard
                key={s}
                species={s}
                variant="mini"
                selected={focus === s}
                dimmed={takers.length >= rule.maxTakers}
                onClick={() => setFocus(focus === s ? null : s)}
                footer={
                  <span className={styles.takers}>
                    {takers.map((p) => (
                      <span key={p.id} className={styles.dot} style={{ '--seat-color': `var(--color-seat-${p.seat})` } as CSSProperties} title={p.nickname} />
                    ))}
                    {pickable && takers.length === 0 && <span className={styles.free}>고를 수 있음</span>}
                  </span>
                }
              />
            );
          })}
        </div>
      </section>

      {focus && (
        <div className={styles.focus}>
          <SpeciesCard species={focus} variant="full" />
          <div className={styles.focusActions}>
            <button type="button" className="pill pill--outline" onClick={() => setFocus(null)}>
              닫기
            </button>
            {isMyTurn && (
              <button
                type="button"
                className="pill"
                disabled={!options.includes(focus) || sending}
                onClick={() => {
                  draft(focus);
                  setFocus(null);
                }}
              >
                {options.includes(focus) ? `${getSpecies(focus).name} 고르기` : '고를 수 없음'}
              </button>
            )}
          </div>
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.h2}>고른 종</h2>
        <ul className={styles.picks}>
          {players.map((p) => (
            <li key={p.id} style={{ '--seat-color': `var(--color-seat-${p.seat})` } as CSSProperties}>
              <span className={styles.pickName}>{p.nickname}</span>
              <span className={styles.pickList}>{p.drafted.length ? p.drafted.map((s) => getSpecies(s).name).join(' · ') : '아직 없음'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
});
