import { memo, useEffect, useMemo, useState } from 'react';
import { Board } from '../components/Board';
import { Hand } from '../components/Hand';
import { TurnControls } from '../components/TurnControls';
import { buildCells, buildHand, legalCellKeys, seatOf } from '../game/derived';
import { cx } from '../lib/cx';
import { selectIsMyTurn, selectOwnsTurn, selectSelectedCardId, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './BoardTab.module.css';

/**
 * 보드 탭 (F008, F009, F015): 상태 창(PlayerStrip, GamePage) 바로 아래 배치. 한 화면에 스크롤 없이 들어간다.
 * 파생값은 상태 객체가 바뀔 때만 다시 계산한다. 셀 클릭은 스토어 액션(참조 고정)이라 셀 memo 가 유지된다.
 *
 * 손패는 맵 위에 뜨는 서랍(오버레이)이다(2026-09-24 사용자 지시: 맵 세로 공간을 최대로).
 * 맵 영역 자체를 항상 꽉 채우고, 내 차례에는 그 아래쪽에 손패 서랍이 겹쳐 뜬다 — 접으면 손잡이
 * 줄만 남아 맵을 거의 그대로 다 볼 수 있다. 새 턴이 되면 다시 펼쳐진 채로 시작한다.
 *
 * 손패 표시 여부는 `selectOwnsTurn`(턴 소유 여부만)으로 정하고, `selectIsMyTurn`(전송 중엔 false)은
 * 카드 클릭 가능 여부에만 쓴다. 온라인 모드에서 액션을 보내는 동안 손패가 사라졌다 나타나며 보드가
 * 리사이즈되는 걸 막기 위해서다(ui-tab-reviewer 지적).
 */
export const BoardTab = memo(function BoardTab() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const ownsTurn = useGameStore(selectOwnsTurn);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const selectedCardId = useGameStore(selectSelectedCardId);
  const selectedHandIndex = useGameStore((s) => s.selectedHandIndex);
  const placeAt = useGameStore((s) => s.placeAt);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const [handOpen, setHandOpen] = useState(true);

  const cells = useMemo(() => (state ? buildCells(state, viewerId) : []), [state, viewerId]);
  const legal = useMemo(
    () => (state ? legalCellKeys(state, viewerId, selectedCardId) : new Set<string>()),
    [state, viewerId, selectedCardId],
  );
  const hand = useMemo(() => (state ? buildHand(state, viewerId) : []), [state, viewerId]);

  // 새 턴이 시작되면 손패 서랍을 다시 펼쳐 둔다 (지난 턴에 접어 뒀어도)
  useEffect(() => {
    setHandOpen(true);
  }, [state?.turn]);

  if (!state || !viewerId) return null;
  const viewerSeat = seatOf(state, viewerId);

  return (
    <div className={styles.root}>
      <div className={styles.boardArea}>
        <Board size={state.board.width} cells={cells} legal={legal} viewerSeat={viewerSeat} onCellClick={placeAt} />
        {ownsTurn && (
          <div className={styles.handDrawer}>
            <button type="button" className={styles.handHandle} onClick={() => setHandOpen((v) => !v)} aria-expanded={handOpen}>
              <span className={styles.handHandleText}>
                손패 {hand.length}장 {handOpen && `· ${selectedCardId ? '밝은 칸을 클릭해 배치' : '카드를 골라 배치 가능 칸 확인'}`}
              </span>
              <svg
                className={cx(styles.chevron, handOpen && styles.chevronOpen)}
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 15l6-6 6 6" />
              </svg>
            </button>
            {handOpen && (
              <div className={styles.handBody}>
                <Hand cards={hand} selectedIndex={selectedHandIndex} interactive={isMyTurn} onSelect={selectHandCard} seat={viewerSeat} />
              </div>
            )}
          </div>
        )}
      </div>
      <TurnControls compact />
    </div>
  );
});
