import { memo } from 'react';
import { GOALS, SPECIES_IDS } from '@rootbound/shared';
import { SpeciesCard } from '../components/SpeciesCard';
import { useGameStore } from '../store/gameStore';
import styles from './CardsTab.module.css';

/**
 * 카드 탭: 식물 12종과 목표 18장 전체 카탈로그. 이번 판 식물(state.species)을 위에, 나머지는 '이번 판에 없음'으로 흐리게.
 * 식물·목표 카드를 누르면 카드 디자인을 크게 본다(보기 전용)
 */
export const CardsTab = memo(function CardsTab() {
  const openCardModal = useGameStore((s) => s.openCardModal);
  const inGame = useGameStore((s) => s.state?.species);
  const current = inGame && inGame.length > 0 ? inGame : null;
  const others = current ? SPECIES_IDS.filter((s) => !current.includes(s)) : [];
  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.h2}>{current ? `이번 판 식물 ${current.length}가지` : `식물 ${SPECIES_IDS.length}종`}</h2>
        <p className={styles.help}>
          그림의 가운데가 심는 칸, 숫자는 그 칸에 주는 영향력입니다.{current ? ' 카드 더미와 마켓에는 이 식물만 나옵니다.' : ''}
        </p>
        <div className={styles.grid}>
          {(current ?? SPECIES_IDS).map((s) => (
            <SpeciesCard key={s} species={s} variant="mini" onClick={() => openCardModal({ kind: 'species', species: s })} />
          ))}
        </div>
      </section>
      {others.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.h2}>이번 판에 없음</h2>
          <div className={styles.grid}>
            {others.map((s) => (
              <SpeciesCard key={s} species={s} variant="mini" dimmed onClick={() => openCardModal({ kind: 'species', species: s })} />
            ))}
          </div>
        </section>
      )}
      <section className={styles.section}>
        <h2 className={styles.h2}>목표 {GOALS.length}장</h2>
        <p className={styles.help}>판마다 3장이 공개되고, 그중 1장 이상은 식물 보호구역 목표입니다.</p>
        <ul className={styles.goals}>
          {GOALS.map((g) => (
            <li key={g.id}>
              <button type="button" className={g.species ? styles.linked : undefined} onClick={() => openCardModal({ kind: 'goal', goal: g.id })}>
                <strong>{g.name}</strong>
                <span>{g.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
});
