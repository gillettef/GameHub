import { memo, type CSSProperties } from 'react';
import { CREW_COUNT, HAND_MAX, TAKE_COUNT } from '../../engine';
import { CREW_NAMES, awaitingConfirm } from '../game/derived';
import { catArtUrl } from '../lib/hexGeometry';
import { cx } from '../lib/cx';
import { findMe, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { GoalList } from './GoalList';
import { SpeciesCard } from './SpeciesCard';
import styles from './RevealPanel.module.css';

/**
 * 이번 판 명당 공개 단계 (규칙 용어 이번 판 식물, Rules.md 4절 8). 보드 자리에 보드 대신 나온다.
 * 이번 판 명당 타일(누르면 크게 보기) · 소문 카드 3장 · 내 무리 고르기(랜덤 포함, PICK_CREW) · 자리별 무리·확인 현황.
 * "확인" 버튼은 화면 맨 아래(⑤ GameView)에 있다. 남이 고른 무리는 고를 수 없고, 랜덤·AI 는 1라운드가 열릴 때 남은 무리로 정해진다.
 *  - 한 기기로: 사람마다 차례로 무리를 고르고 확인한다(보는 사람이 다음 사람으로 바뀐다). 손의 타일은 같은 화면을 모두가 보므로 보여 주지 않는다.
 *  - 온라인: 내 무리를 고르고 확인(CONFIRM)을 보낸 뒤 다른 사람을 기다린다. 내 첫 타일을 함께 보여 준다. AI 는 바로 확인되어 있다.
 */
export const RevealPanel = memo(function RevealPanel() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const mode = useGameStore((s) => s.mode);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const pickCrew = useGameStore((s) => s.pickCrew);
  const sending = useGameStore((s) => s.sending);
  if (!state || !viewerId) return null;

  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const me = findMe(state, viewerId);
  const online = mode === 'online';
  const myCard = online ? me?.hand[0] : undefined;
  const picking = awaitingConfirm(state, viewerId);
  const myCrew = me?.crew ?? null;
  const takenBy = (crew: number) => players.find((p) => p.id !== viewerId && p.crew === crew);

  return (
    <div className={styles.root}>
      <section className={styles.section} aria-labelledby="reveal-species">
        <h2 id="reveal-species" className={styles.h2}>
          이번 판 명당 {state.species.length}가지
        </h2>
        <p className={styles.help}>주머니와 펼친 타일에는 이 명당만 나옵니다. 타일을 누르면 크게 봅니다.</p>
        <div className={styles.grid}>
          {state.species.map((sp) => (
            <SpeciesCard key={sp} species={sp} variant="mini" compact onClick={() => openCardModal({ kind: 'species', species: sp })} />
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="reveal-goals">
        <h2 id="reveal-goals" className={styles.h2}>
          이번 판 소문 카드
        </h2>
        <GoalList goals={state.goals} />
      </section>

      {picking && (
        <section className={styles.section} aria-labelledby="reveal-crew">
          <h2 id="reveal-crew" className={styles.h2}>
            {online ? '내 고양이 무리' : `${me?.nickname ?? ''}의 고양이 무리`}
          </h2>
          <div className={styles.crews} role="radiogroup" aria-label="고양이 무리 고르기">
            {Array.from({ length: CREW_COUNT }, (_, c) => {
              const owner = takenBy(c);
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={myCrew === c}
                  disabled={!!owner || sending}
                  className={cx(styles.crew, myCrew === c && styles.crewOn)}
                  style={{ '--seat-color': `var(--crew-${c})` } as CSSProperties}
                  onClick={() => pickCrew(c)}
                >
                  <img className={styles.crewArt} src={catArtUrl(c)} alt="" aria-hidden="true" />
                  <span className={styles.crewName}>{CREW_NAMES[c]}</span>
                  {owner && <span className={styles.crewTaken}>{owner.nickname}</span>}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={myCrew === null}
              disabled={sending}
              className={cx(styles.crew, myCrew === null && styles.crewOn)}
              style={{ '--seat-color': 'var(--color-muted)' } as CSSProperties}
              onClick={() => pickCrew(null)}
            >
              <span className={styles.crewRandom} aria-hidden="true">?</span>
              <span className={styles.crewName}>랜덤</span>
            </button>
          </div>
          <p className={styles.help}>무리는 겉모습(색·그림)만 바꿉니다. 랜덤은 시작할 때 남은 무리 중에서 정해집니다.</p>
        </section>
      )}

      {myCard && (
        <section className={styles.mine} aria-label="내 첫 타일">
          <div className={styles.mineCard}>
            <SpeciesCard species={myCard} variant="chip" seat={me?.seat} onClick={() => openCardModal({ kind: 'species', species: myCard })} />
          </div>
          <p className={styles.help}>내 첫 타일입니다. 차례마다 타일 가져오기(펼친 타일 1개 또는 주머니 {TAKE_COUNT}개, 손 최대 {HAND_MAX}개) · 놓기 · 내 칸 명당 부르기 중 하나를 합니다.</p>
        </section>
      )}

      <section className={styles.footer} aria-label="확인 현황">
        <ul className={styles.status}>
          {players.map((p) => {
            const label = p.surrenderedOrder !== null ? '기권' : p.isReady ? '확인함' : '확인 전';
            const crew = typeof p.crew === 'number' ? p.crew : null;
            return (
              <li
                key={p.id}
                className={p.isReady && p.surrenderedOrder === null ? styles.ready : styles.waiting}
                style={{ '--seat-color': crew === null ? 'var(--color-muted)' : `var(--crew-${crew})` } as CSSProperties}
              >
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.name}>{p.nickname}</span>
                <span className={styles.crewOf}>{crew === null ? '랜덤' : CREW_NAMES[crew]}</span>
                <span className={styles.state}>{label}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
});
