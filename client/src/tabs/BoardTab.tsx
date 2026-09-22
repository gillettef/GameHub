import { memo, useMemo } from 'react';
import { Board } from '../components/Board';
import { Hand } from '../components/Hand';
import { TurnControls } from '../components/TurnControls';
import { buildCells, buildHand, legalCellKeys, seatOf } from '../game/derived';
import { selectIsMyTurn, selectOwnsTurn, selectSelectedCardId, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './BoardTab.module.css';

/**
 * 보드 탭 (F008, F009, F015): 상태 창(PlayerStrip, GamePage) 바로 아래 배치. 내 차례에만 손패가
 * 상태 창과 맵 사이에 가로로 나타나고, 그 아래 맵, 맨 아래 패스/턴 종료·기권. 한 화면에 스크롤 없이 들어간다.
 * 파생값은 상태 객체가 바뀔 때만 다시 계산한다. 셀 클릭은 스토어 액션(참조 고정)이라 셀 memo 가 유지된다.
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

  const cells = useMemo(() => (state ? buildCells(state, viewerId) : []), [state, viewerId]);
  const legal = useMemo(
    () => (state ? legalCellKeys(state, viewerId, selectedCardId) : new Set<string>()),
    [state, viewerId, selectedCardId],
  );
  const hand = useMemo(() => (state ? buildHand(state, viewerId) : []), [state, viewerId]);

  if (!state || !viewerId) return null;
  const viewerSeat = seatOf(state, viewerId);

  return (
    <div className={styles.root}>
      {ownsTurn && (
        <div className={styles.handWrap}>
          <div className={styles.handHead}>
            <span>손패 {hand.length}장</span>
            <span className={styles.hint}>{selectedCardId ? '밝은 칸을 클릭해 배치' : '카드를 골라 배치 가능 칸 확인'}</span>
          </div>
          <Hand cards={hand} selectedIndex={selectedHandIndex} interactive={isMyTurn} onSelect={selectHandCard} seat={viewerSeat} />
        </div>
      )}
      <div className={styles.boardArea}>
        <Board size={state.board.width} cells={cells} legal={legal} viewerSeat={viewerSeat} onCellClick={placeAt} />
      </div>
      <TurnControls compact />
    </div>
  );
});
