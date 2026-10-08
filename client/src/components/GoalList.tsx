import { memo, type CSSProperties } from 'react';
import type { GoalId, PlayerId, Score } from '@rootbound/shared';
import { getGoal, getSpecies } from '@rootbound/shared';
import { useGameStore } from '../store/gameStore';
import styles from './GoalList.module.css';

interface GoalListProps {
  goals: GoalId[];
  /** 있으면 목표마다 좌석별 지금 점수를 함께 보여 준다 */
  scores?: Record<PlayerId, Score> | null;
  players?: { id: PlayerId; nickname: string; seat: number }[];
  compact?: boolean;
}

/** 이번 판 공개 목표 3장 (Rules.md 8절). 종 연계 목표는 그 종 이름을 강조한다. 누르면 목표 카드를 크게 본다 */
export const GoalList = memo(function GoalList({ goals, scores, players, compact }: GoalListProps) {
  const openCardModal = useGameStore((s) => s.openCardModal);
  return (
    <ol className={compact ? styles.compact : styles.list} aria-label="이번 판 목표">
      {goals.map((id, i) => {
        const g = getGoal(id);
        return (
          <li key={id} className={styles.item}>
            <button
              type="button"
              className={g.species ? styles.linked : styles.goal}
              onClick={() => openCardModal({ kind: 'goal', goal: id })}
              title="목표 카드 크게 보기"
            >
              <span className={styles.name}>
                {g.name}
                {g.species && <span className={styles.tag}>{getSpecies(g.species).name}</span>}
              </span>
              {!compact && <span className={styles.desc}>{g.description}</span>}
              {scores && players && (
                <span className={styles.points}>
                  {players.map((p) => (
                    <span key={p.id} style={{ '--seat-color': `var(--color-seat-${p.seat})` } as CSSProperties} className={styles.point} title={p.nickname}>
                      {scores[p.id]?.goalBreakdown[i] ?? 0}
                    </span>
                  ))}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
});
