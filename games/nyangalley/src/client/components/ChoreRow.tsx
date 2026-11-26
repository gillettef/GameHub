import { memo, type CSSProperties } from 'react';
import { getChore } from '../../engine';
import { choreArtUrl } from '../game/cardImages';
import { crewName, leftChores } from '../game/derived';
import { cx } from '../lib/cx';
import { selectCanPickChore, selectState, useGameStore } from '../store/gameStore';
import styles from './ChoreRow.module.css';

/**
 * 일과 고르기 (v7 「골목 일과」, Rules.md 5.1): 이번 라운드에 펼친 일과 타일(그림)을 한 줄로 보여 준다.
 *  - 이미 누가 고른 일과는 흐리게, 그 무리 이름 띠를 붙인다.
 *  - 내 차례면 눌러서 고르고(다시 누르면 해제) 화면 맨 아래(⑤)의 "일과 고르기"로 보낸다.
 *  - 내 차례가 아니어도 눌러서 설명을 볼 수 있다.
 * 마지막 1장은 아무도 고르지 않고 남는다.
 */
export const ChoreRow = memo(function ChoreRow() {
  const state = useGameStore(selectState);
  const pending = useGameStore((s) => s.pendingChore);
  const canPick = useGameStore(selectCanPickChore);
  const pickChore = useGameStore((s) => s.pickChore);
  if (!state || state.phase !== 'playing' || state.stage !== 'chore') return null;
  const left = leftChores(state);
  const focus = pending ? getChore(pending) : null;

  return (
    <div className={cx(styles.root, canPick && styles.active)} role="group" aria-label={canPick ? '골목 일과: 고를 일과를 누르세요' : '골목 일과'}>
      <ul className={styles.cards} role="list">
        {state.choreOffer.map((id) => {
          const seat = state.chores.indexOf(id);
          const taken = seat >= 0;
          const c = getChore(id);
          return (
            <li key={id} className={styles.slot}>
              <button
                type="button"
                className={cx(styles.card, taken && styles.taken, pending === id && styles.selected)}
                style={taken ? ({ '--seat-color': `var(--color-seat-${seat})` } as CSSProperties) : undefined}
                aria-pressed={pending === id}
                aria-label={`${c.name}${c.place ? ' (놓기)' : ' (놓지 않음)'}: ${c.description}${taken ? ` · ${crewName(seat)}이(가) 고름` : ''}`}
                disabled={taken}
                onClick={() => pickChore(id)}
              >
                <img className={styles.art} src={choreArtUrl(id)} alt="" aria-hidden="true" decoding="async" draggable={false} />
                {taken && <span className={styles.badge}>{crewName(seat)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.desc} aria-live="polite">
        {focus ? (
          <>
            <strong>{focus.name}</strong> {focus.description}
          </>
        ) : canPick ? (
          `일과를 눌러 설명을 보고 고르세요. ${left.length === 2 ? '내가 고르면 남는 1장은 이번 라운드에 쓰지 않습니다.' : `남은 일과 ${left.length}장 · 마지막 1장은 남습니다.`}`
        ) : (
          `남은 일과 ${left.length}장 · 마지막 1장은 이번 라운드에 쓰지 않습니다. 일과를 누르면 설명을 봅니다.`
        )}
      </p>
    </div>
  );
});
