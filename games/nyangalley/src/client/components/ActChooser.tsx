import { memo, useMemo } from 'react';
import { HAND_MAX, TAKE_COUNT, legalCallCells } from '../../engine';
import { SPOT_BACK_URL, spotTileUrl } from '../game/cardImages';
import { asState } from '../game/derived';
import { cx } from '../lib/cx';
import { findMe, selectActOptions, selectState, selectViewerId, useGameStore, type ActMode } from '../store/gameStore';
import styles from './ActChooser.module.css';

interface Choice {
  mode: ActMode;
  title: string;
  detail: string;
  /** 할 수 없으면 그 이유 */
  blocked: string | null;
  art: string;
}

/**
 * ④ 행동 고르기 판 (v8 「행동 하나」, Rules.md 5.1). 내 차례가 되면 먼저 셋 중 하나를 고르고, 고른 행동의 화면으로 넘어간다
 * (가져오기 = 펼친 타일·주머니, 놓기 = 내 타일 → 보드 칸, 부르기 = 보드의 내 칸 위 명당). 돌아가기는 ⑤ "다른 행동".
 * 할 수 없는 행동은 이유를 적고 누를 수 없게 한다. 손의 어떤 타일도 놓을 칸이 없으면 놓기 자리가 "버리기"가 된다.
 */
export const ActChooser = memo(function ActChooser() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  // 선택자가 새 객체를 돌려주므로 구독하지 않고 상태가 바뀔 때만 계산한다
  const opts = useMemo(() => selectActOptions({ state, viewerId }), [state, viewerId]);
  const chooseAct = useGameStore((s) => s.chooseAct);
  const sending = useGameStore((s) => s.sending);
  const me = findMe(state, viewerId);
  if (!state || !viewerId || !me || !opts) return null;

  const hand = me.hand.length;
  const callCount = state.board ? legalCallCells(asState(state), viewerId).length : 0;
  const takeN = Math.min(TAKE_COUNT, HAND_MAX - hand);
  const firstCall = state.board ? legalCallCells(asState(state), viewerId)[0] : undefined;
  const callSpecies = firstCall ? state.plants.find((p) => p.pos.q === firstCall.q && p.pos.r === firstCall.r)?.species : undefined;
  const choices: Choice[] = [
    {
      mode: 'take',
      title: `타일 ${Math.max(1, takeN)}개 가져오기`,
      detail: `펼친 타일·주머니에서 1개씩 (손 ${hand}/${HAND_MAX})`,
      blocked: opts.take ? null : hand >= HAND_MAX ? `손이 가득 찼습니다 (${HAND_MAX}개)` : '남은 타일이 없습니다',
      art: SPOT_BACK_URL,
    },
    {
      mode: 'plant',
      title: opts.plant || !opts.discard ? '명당 놓기' : '타일 버리기',
      detail: opts.plant ? `내 타일 ${hand}개 중 1개를 골라 놓기` : opts.discard ? '놓을 칸이 없어 1개를 버립니다' : '',
      blocked: opts.plant || opts.discard ? null : '손에 타일이 없습니다',
      art: me.hand[0] ? spotTileUrl(me.hand[0]) : SPOT_BACK_URL,
    },
    {
      mode: 'call',
      title: '명당 부르기',
      detail: `내 칸 위 명당 ${callCount}곳 중 하나를 다시 부르기`,
      blocked: opts.call ? null : '내 칸 위에 명당이 없습니다',
      art: callSpecies ? spotTileUrl(callSpecies) : SPOT_BACK_URL,
    },
  ];

  return (
    <div className={styles.root} role="group" aria-label="이번 차례 행동 고르기">
      <p className={styles.lead}>이번 차례에 할 일 하나를 고르세요</p>
      <div className={styles.choices}>
        {choices.map((c) => (
          <button
            key={c.mode}
            type="button"
            className={cx(styles.choice, c.blocked && styles.blocked)}
            disabled={!!c.blocked || sending}
            onClick={() => chooseAct(c.mode)}
          >
            <img className={styles.art} src={c.art} alt="" aria-hidden="true" />
            <span className={styles.title}>{c.title}</span>
            <span className={styles.detail}>{c.blocked ?? c.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
