import { memo } from 'react';
import { GOALS, SPECIES_IDS } from '@rootbound/shared';
import { SpeciesCard } from '../components/SpeciesCard';
import { useGameStore } from '../store/gameStore';
import styles from './CardsTab.module.css';

/** 카드 탭: 식물 12종과 목표 18장 전체 카탈로그. 카드를 누르면 크게 본다(보기 전용) */
export const CardsTab = memo(function CardsTab() {
  const openCardModal = useGameStore((s) => s.openCardModal);
  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.h2}>식물 12종</h2>
        <p className={styles.help}>그림의 가운데가 심는 칸, 숫자는 그 칸에 주는 영향력입니다.</p>
        <div className={styles.grid}>
          {SPECIES_IDS.map((s) => (
            <SpeciesCard key={s} species={s} variant="mini" onClick={() => openCardModal({ kind: 'species', species: s })} />
          ))}
        </div>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>목표 18장</h2>
        <p className={styles.help}>판마다 3장이 공개되고, 그중 1장 이상은 식물 보호구역 목표입니다.</p>
        <ul className={styles.goals}>
          {GOALS.map((g) => (
            <li key={g.id} className={g.species ? styles.linked : undefined}>
              <strong>{g.name}</strong>
              <span>{g.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
});
