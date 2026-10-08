import { memo, useMemo, type CSSProperties } from 'react';
import { computeScores, getSpecies } from '@rootbound/shared';
import { GoalList } from '../components/GoalList';
import { asState, buildPlayerSummaries } from '../game/derived';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './StatusTab.module.css';

/**
 * 점수 탭 (F010, F011): 지금 끝난다면 몇 점인가. 좌석별 땅·목표·무궁화·덤·합계와 고른 종, 남은 카드.
 * 점수는 언제나 보드에서 다시 계산한 예상값이다(Rules.md 9절).
 */
export const StatusTab = memo(function StatusTab() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const scores = useMemo(() => (state?.board ? computeScores(asState(state)) : null), [state]);
  const rows = useMemo(() => (state ? buildPlayerSummaries(state, scores) : []), [state, scores]);
  if (!state) return null;

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.h2}>{state.phase === 'finished' ? '최종 점수' : '지금 끝난다면'}</h2>
        <ul className={styles.players}>
          {rows.map((r) => (
            <li key={r.id} className={styles.player} style={{ '--seat-color': `var(--color-seat-${r.seat})` } as CSSProperties}>
              <div className={styles.head}>
                <span className={styles.name}>
                  {r.nickname}
                  {r.id === viewerId && <span className={styles.me}>나</span>}
                  {r.kind === 'ai' && <span className={styles.me}>AI</span>}
                  {r.surrendered && <span className={styles.gone}>기권</span>}
                </span>
                <span className={styles.total}>{r.score?.total ?? 0}점</span>
              </div>
              {r.score && (
                <div className={styles.breakdown}>
                  <span>땅 {r.score.land}</span>
                  <span>목표 {r.score.goals}</span>
                  {r.score.bloom > 0 && <span>무궁화 보너스 {r.score.bloom}</span>}
                  {r.score.komi > 0 && <span>순서 보너스 {r.score.komi}</span>}
                </div>
              )}
              <div className={styles.meta}>
                <span>손에 {r.handCount}장 · 남은 {r.deckCount}장</span>
                <span className={styles.drafted}>{r.drafted.map((s) => getSpecies(s).name).join(' · ') || '고른 식물 없음'}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {state.goals.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.h2}>목표별 점수</h2>
          <GoalList goals={state.goals} scores={scores} players={rows} />
        </section>
      )}
    </div>
  );
});
