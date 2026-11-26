import { memo } from 'react';
import { CHORES, CHORE_EXTRA, GOALS, GOAL_COUNT, SPECIES_IDS } from '../../engine';
import { choreArtUrl } from '../game/cardImages';
import { SpeciesCard } from '../components/SpeciesCard';
import { useGameStore } from '../store/gameStore';
import styles from './CardsTab.module.css';

/**
 * 카드 탭: 명당 타일 9종(규칙 용어 식물), 골목 일과 6장(v7), 소문 카드 16장(규칙 용어 목표) 전체 목록.
 * 이번 판 명당(state.species)을 위에, 나머지는 '이번 판에 없음'으로 흐리게.
 * 타일·소문 카드를 누르면 그림을 크게 본다(보기 전용). 소문 카드는 단골(명당 연계) = 초록 띠, 나머지 = 주황 띠
 */
export const CardsTab = memo(function CardsTab() {
  const openCardModal = useGameStore((s) => s.openCardModal);
  const inGame = useGameStore((s) => s.state?.species);
  const current = inGame && inGame.length > 0 ? inGame : null;
  const others = current ? SPECIES_IDS.filter((s) => !current.includes(s)) : [];
  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.h2}>{current ? `이번 판 명당 ${current.length}가지` : `명당 ${SPECIES_IDS.length}종`}</h2>
        <p className={styles.help}>
          타일 가운데가 놓는 칸, 숫자는 그 칸(가운데·옆 칸)에 모이는 고양이 수입니다. 놓을 때 방향을 돌릴 수 있습니다.{current ? ' 주머니와 펼친 타일에는 이 명당만 나옵니다.' : ''}
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
        <h2 className={styles.h2}>골목 일과 {CHORES.length}장</h2>
        <p className={styles.help}>라운드마다 섞어 (인원 + {CHORE_EXTRA})장을 펼치고, 선부터 하나씩 골라 그 일과대로 차례를 합니다. 마지막 1장은 남습니다.</p>
        <ul className={styles.chores}>
          {CHORES.map((c) => (
            <li key={c.id}>
              <img className={styles.choreArt} src={choreArtUrl(c.id)} alt="" aria-hidden="true" decoding="async" />
              <span>
                <strong>
                  {c.name}
                  <em className={c.place ? styles.place : styles.noPlace}>{c.place ? '놓기' : '놓지 않음'}</em>
                </strong>
                <span>{c.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>소문 카드 {GOALS.length}장</h2>
        <p className={styles.help}>판마다 {GOAL_COUNT}장이 공개되고, 그중 1장 이상은 단골 소문(초록 띠)입니다.</p>
        <ul className={styles.goals}>
          {GOALS.map((g) => (
            <li key={g.id}>
              <button type="button" className={g.species ? styles.regular : undefined} onClick={() => openCardModal({ kind: 'goal', goal: g.id })}>
                <strong>
                  {g.name}
                  {g.species && <em className={styles.tag}>단골</em>}
                </strong>
                <span>{g.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
});
