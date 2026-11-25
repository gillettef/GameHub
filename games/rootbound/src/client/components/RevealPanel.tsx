import { memo, type CSSProperties } from 'react';
import { rulesFor } from '../../engine';
import { findMe, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { GoalList } from './GoalList';
import { SpeciesCard } from './SpeciesCard';
import styles from './RevealPanel.module.css';

/**
 * 이번 판 식물 공개 단계 (Rules.md 4절 8). 정원 탭 자리에 보드 대신 나온다.
 * 이번 판 식물(카드를 누르면 크게 보기) · 목표 3장 · 자리별 확인 현황. "확인" 버튼은 화면 맨 아래(⑤ GameView)에 있다.
 *  - 한 기기로: "확인하고 시작" 한 번으로 모두 확인한다. 손 카드는 같은 화면을 모두가 보므로 보여 주지 않는다.
 *  - 온라인: 내 확인(CONFIRM)을 보내고 다른 사람을 기다린다. 내 첫 카드를 함께 보여 준다. AI 는 바로 확인되어 있다.
 */
export const RevealPanel = memo(function RevealPanel() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const mode = useGameStore((s) => s.mode);
  const openCardModal = useGameStore((s) => s.openCardModal);
  if (!state || !viewerId) return null;

  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const me = findMe(state, viewerId);
  const online = mode === 'online';
  const myCard = online ? me?.hand[0] : undefined;

  return (
    <div className={styles.root}>
      <section className={styles.section} aria-labelledby="reveal-species">
        <h2 id="reveal-species" className={styles.h2}>
          이번 판 식물 {state.species.length}가지
        </h2>
        <p className={styles.help}>카드 더미와 마켓에는 이 식물만 나옵니다. 카드를 누르면 크게 봅니다.</p>
        <div className={styles.grid}>
          {state.species.map((sp) => (
            <SpeciesCard key={sp} species={sp} variant="mini" compact onClick={() => openCardModal({ kind: 'species', species: sp })} />
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="reveal-goals">
        <h2 id="reveal-goals" className={styles.h2}>
          이번 판 목표
        </h2>
        <GoalList goals={state.goals} />
      </section>

      {myCard && (
        <section className={styles.mine} aria-label="내 첫 카드">
          <div className={styles.mineCard}>
            <SpeciesCard species={myCard} variant="chip" seat={me?.seat} onClick={() => openCardModal({ kind: 'species', species: myCard })} />
          </div>
          <p className={styles.help}>내 첫 카드입니다. 차례마다 마켓 {rulesFor(state.players.length).market}장 중 1장이나 카드 더미 맨 위 1장을 가져와 2장 중 1장을 심습니다.</p>
        </section>
      )}

      <section className={styles.footer} aria-label="확인 현황">
        <ul className={styles.status}>
          {players.map((p) => {
            const label = p.surrenderedOrder !== null ? '기권' : p.isReady ? '확인함' : '확인 전';
            return (
              <li
                key={p.id}
                className={p.isReady && p.surrenderedOrder === null ? styles.ready : styles.waiting}
                style={{ '--seat-color': `var(--color-seat-${p.seat})` } as CSSProperties}
              >
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.name}>{p.nickname}</span>
                <span className={styles.state}>{label}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
});
