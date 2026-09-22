import { memo, useCallback, useMemo } from 'react';
import { validatePlacement } from '@astraltab/shared';
import { Board } from '../components/Board';
import { Hand } from '../components/Hand';
import { TurnControls } from '../components/TurnControls';
import { buildCells, buildHand, legalCellKeys, seatOf } from '../game/derived';
import {
  selectIsMyTurn,
  selectSelectedCardId,
  selectState,
  selectViewerId,
  useGameStore,
} from '../store/gameStore';
import styles from './BoardTab.module.css';

/**
 * 보드 탭 (F008, F009, F015): 격자 + 하단 손패 + 패스/기권. 한 화면에 스크롤 없이 들어간다.
 * 파생값은 상태 객체가 바뀔 때만 다시 계산한다.
 */
export const BoardTab = memo(function BoardTab() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const selectedCardId = useGameStore(selectSelectedCardId);
  const selectedHandIndex = useGameStore((s) => s.selectedHandIndex);
  const dispatch = useGameStore((s) => s.dispatch);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const setNotice = useGameStore((s) => s.setNotice);

  const cells = useMemo(() => (state ? buildCells(state, viewerId) : []), [state, viewerId]);
  const legal = useMemo(() => (state ? legalCellKeys(state, viewerId, selectedCardId) : new Set<string>()), [state, viewerId, selectedCardId]);
  const hand = useMemo(() => (state ? buildHand(state, viewerId) : []), [state, viewerId]);

  const onCellClick = useCallback(
    (x: number, y: number) => {
      if (!state || !viewerId || !selectedCardId) return;
      const err = validatePlacement(state, viewerId, selectedCardId, { x, y });
      if (err) {
        setNotice(err.message);
        return;
      }
      dispatch({ type: 'PLACE', playerId: viewerId, cardId: selectedCardId, pos: { x, y } });
    },
    [state, viewerId, selectedCardId, dispatch, setNotice],
  );

  if (!state || !viewerId) return null;
  const viewerSeat = seatOf(state, viewerId);

  return (
    <div className={styles.root}>
      <div className={styles.boardArea}>
        <Board size={state.board.width} cells={cells} legal={legal} viewerSeat={viewerSeat} onCellClick={onCellClick} />
      </div>
      <div className={styles.bottom}>
        <div className={styles.handWrap}>
          <div className={styles.handHead}>
            <span>손패 {hand.length}장</span>
            <span className={styles.hint}>
              {selectedCardId ? '밝은 칸을 클릭해 배치' : isMyTurn ? '카드를 골라 배치 가능 칸 확인' : '내 턴을 기다리는 중'}
            </span>
          </div>
          <Hand cards={hand} selectedIndex={selectedHandIndex} interactive={isMyTurn} onSelect={selectHandCard} />
        </div>
        <TurnControls compact />
      </div>
    </div>
  );
});
