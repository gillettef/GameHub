import { getChore, nameOf } from '../../engine';
import { choreOf, roundStageLabel } from '../game/derived';
import { findMe, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './HandoffOverlay.module.css';

/** 단계별로 이번 차례에 할 일 (v7 「골목 일과」) */
const STAGE_TEXT: Record<string, string> = {
  chore: '펼친 일과 중 이번 라운드에 할 일과 하나를 고를 차례입니다.',
  take: '펼친 타일이나 주머니에서 타일 1개를 가져올 차례입니다.',
  plant: '내 타일 중 1개를 골라 명당을 놓을 차례입니다.',
  move: '담 넘기: 내 칸의 고양이 1~2마리를 맞닿은 칸으로 두 번까지 옮길 차례입니다.',
  call: '명당 부르기: 내 칸 위 명당 하나를 돌려 고양이를 다시 부를 차례입니다.',
};

/**
 * 핫시트 기기 넘김 (손패 비공개). 턴이 바뀌면 다음 사람이 '시작'을 누를 때까지 화면을 가린다.
 * 클릭 한 번을 반드시 거치므로 연타로 다음 사람 턴까지 넘어가는 일도 막는다.
 */
export function HandoffOverlay() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const acknowledge = useGameStore((s) => s.acknowledgeHandoff);
  if (!state || !viewerId) return null;
  const me = findMe(state, viewerId);
  const chore = choreOf(state, viewerId);
  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="handoff-title">
      <div className={styles.panel}>
        <p className={styles.eyebrow}>{roundStageLabel(state)}</p>
        <h2 id="handoff-title" className={styles.title}>
          {nameOf(state, viewerId)}의 차례
        </h2>
        <p className={styles.desc}>
          기기를 {me?.nickname ?? ''}에게 넘기세요. 시작을 누르면 내 타일이 보입니다.{' '}
          {state.stage !== 'chore' && chore ? `오늘 일과는 「${getChore(chore).name}」. ` : ''}
          {state.stage === 'take' && chore === 'peek' ? '생선 냄새: 펼친 타일 3개 중 1개를 가져올 차례입니다.' : STAGE_TEXT[state.stage]}
        </p>
        <button type="button" className="pill pill--lg" onClick={acknowledge} autoFocus>
          시작
        </button>
      </div>
    </div>
  );
}
