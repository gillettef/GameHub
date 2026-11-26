import { memo, type CSSProperties } from 'react';
import type { GoalId, PlayerId, Score } from '../../engine';
import { GOALS, getGoal } from '../../engine';
import { useGameStore } from '../store/gameStore';
import styles from './GoalList.module.css';

interface GoalListProps {
  goals: GoalId[];
  /** 있으면 목표마다 자리별 지금 점수를 함께 보여 준다 */
  scores?: Record<PlayerId, Score> | null;
  players?: { id: PlayerId; nickname: string; seat: number }[];
  compact?: boolean;
}

/** 소문 카드 번호 (Rules.md 8절 표 순서, 01~16) */
const goalNo = (id: GoalId) => String(GOALS.findIndex((g) => g.id === id) + 1).padStart(2, '0');

/**
 * 이번 판 소문 카드 3장 (규칙 용어 목표, Rules.md 8절). 단골 소문(명당 연계)은 초록 띠, 나머지는 주황 띠.
 * 누르면 소문 카드(세로 그림)를 크게 본다.
 * compact: 보드 위쪽의 **소문 카드 축소판** — 카드 그림(크림 종이 + 윗띠)을 작게 다시 그린다.
 * 카드 그림을 그대로 줄이면 글자가 읽히지 않아서, 이름만 글자로 얹는다
 */
export const GoalList = memo(function GoalList({ goals, scores, players, compact }: GoalListProps) {
  const openCardModal = useGameStore((s) => s.openCardModal);
  if (compact) {
    return (
      <ol className={styles.minis} aria-label="이번 판 소문 카드">
        {goals.map((id) => {
          const g = getGoal(id);
          return (
            <li key={id} className={styles.item}>
              <button
                type="button"
                className={styles.mini}
                data-regular={g.species ? '' : undefined}
                onClick={() => openCardModal({ kind: 'goal', goal: id })}
                title={`${g.name}: ${g.description}`}
                aria-label={`소문 카드 ${g.name}: ${g.description}`}
              >
                <span className={styles.kicker}>{g.species ? `단골 · ${goalNo(id)}` : `소문 · ${goalNo(id)}`}</span>
                <span className={styles.miniName}>{g.name}</span>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol className={styles.list} aria-label="이번 판 소문 카드">
      {goals.map((id, i) => {
        const g = getGoal(id);
        return (
          <li key={id} className={styles.item}>
            <button
              type="button"
              className={styles.goal}
              data-regular={g.species ? '' : undefined}
              onClick={() => openCardModal({ kind: 'goal', goal: id })}
              title="소문 카드 크게 보기"
            >
              <span className={styles.name}>
                {g.name}
                {g.species && <span className={styles.tag}>단골</span>}
              </span>
              <span className={styles.desc}>{g.description}</span>
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
