import { nameOf } from '@rootbound/shared';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './HandoffOverlay.module.css';

/**
 * 핫시트 기기 넘김 (손패 비공개). 턴이 바뀌면 다음 사람이 '시작'을 누를 때까지 화면을 가린다.
 * 클릭 한 번을 반드시 거치므로 패스 연타로 다음 사람 턴까지 넘어가는 일도 막는다.
 */
export function HandoffOverlay() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const acknowledge = useGameStore((s) => s.acknowledgeHandoff);
  if (!state || !viewerId) return null;
  const me = state.players.find((p) => p.id === viewerId);
  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="handoff-title">
      <div className={styles.panel}>
        <p className={styles.eyebrow}>
          {state.round}라운드 · {state.stage === 'take' ? '가져오기' : '심기'}
        </p>
        <h2 id="handoff-title" className={styles.title}>
          {nameOf(state, viewerId)}의 차례
        </h2>
        <p className={styles.desc}>
          기기를 {me?.nickname ?? ''}에게 넘기세요. 시작을 누르면 내 카드가 보입니다.{' '}
          {state.stage === 'take' ? '마켓에서 카드 1장을 가져올 차례입니다.' : '내 카드 중 1장을 심을 차례입니다.'}
        </p>
        <button type="button" className="pill pill--lg" onClick={acknowledge} autoFocus>
          시작
        </button>
      </div>
    </div>
  );
}
