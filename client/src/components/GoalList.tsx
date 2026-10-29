import { memo, type CSSProperties } from 'react';
import type { GoalId, PlayerId, Score } from '@rootbound/shared';
import { GOALS, getGoal, getSpecies } from '@rootbound/shared';
import { useGameStore } from '../store/gameStore';
import styles from './GoalList.module.css';

interface GoalListProps {
  goals: GoalId[];
  /** 있으면 목표마다 자리별 지금 점수를 함께 보여 준다 */
  scores?: Record<PlayerId, Score> | null;
  players?: { id: PlayerId; nickname: string; seat: number }[];
  compact?: boolean;
}

/** 카드 디자인의 목표 번호 (GOAL · 01 …). 카드 SVG 는 Rules.md 8절 표 순서로 번호를 매겼다 */
const goalNo = (id: GoalId) => String(GOALS.findIndex((g) => g.id === id) + 1).padStart(2, '0');

/**
 * 이번 판 공개 목표 3장 (Rules.md 8절). 종 연계 목표는 그 종 이름을 강조한다. 누르면 목표 카드를 크게 본다.
 * compact: 정원 탭 위쪽의 **목표 카드 축소판** — 카드 디자인(밝은 종이 + 오른쪽 남색 띠 + 번호 육각 배지)을 작게 다시 그린다.
 * 카드 그림을 그대로 줄이면 글자가 4~8px 로 작아져 읽을 수 없어서, 이름만 글자로 얹는다
 */
export const GoalList = memo(function GoalList({ goals, scores, players, compact }: GoalListProps) {
  const openCardModal = useGameStore((s) => s.openCardModal);
  if (compact) {
    return (
      <ol className={styles.minis} aria-label="이번 판 목표">
        {goals.map((id) => {
          const g = getGoal(id);
          return (
            <li key={id} className={styles.item}>
              <button type="button" className={styles.mini} onClick={() => openCardModal({ kind: 'goal', goal: id })} title={`${g.name}: ${g.description}`} aria-label={`목표 ${g.name}: ${g.description}`}>
                <span className={styles.paper}>
                  <span className={styles.kicker}>{g.species ? '보호구역' : `GOAL · ${goalNo(id)}`}</span>
                  <span className={styles.miniName}>{g.species ? getSpecies(g.species).name : g.name}</span>
                </span>
                <span className={styles.band} aria-hidden="true">
                  <span className={styles.badge}>{goalNo(id)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol className={styles.list} aria-label="이번 판 목표">
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
