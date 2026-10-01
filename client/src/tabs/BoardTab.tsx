import { memo, useMemo } from 'react';
import { getSpec } from '@astraltab/shared';
import { Board } from '../components/Board';
import { Hand } from '../components/Hand';
import { SwapIcon } from '../components/icons';
import { TurnControls } from '../components/TurnControls';
import { buildCells, buildHand, buildPlacementPreview, legalCellKeys, seatOf } from '../game/derived';
import { hasSeenPlacementPreview } from '../lib/onboarding';
import { selectIsMyTurn, selectSelectedCardId, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './BoardTab.module.css';

/**
 * 보드 탭 (F008, F009, F015): 상태 창(PlayerStrip, GamePage) 바로 아래 배치. 한 화면에 스크롤 없이 들어간다.
 * 파생값은 상태 객체가 바뀔 때만 다시 계산한다. 셀 클릭은 스토어 액션(참조 고정)이라 셀 memo 가 유지된다.
 *
 * 맵 영역이 탭을 거의 다 채우고, 손패·턴 컨트롤은 그 위에 뜨는 바닥 패널이다
 * (2026-09-24 사용자 지시: 맵 세로 공간을 최대로 + 턴 컨트롤을 낮고 떠 있는 모양으로).
 * 손패는 접는 기능 없이 내 차례가 아니어도 항상 펼쳐 둔다(2026-09-23 사용자 지시: 다른 사람 차례에도
 * 하단 독의 보드 탭에서 내 손패를 계속 볼 수 있어야 한다 — 온라인 모드에서 남 턴을 기다리며 다음 수를
 * 미리 살펴볼 수 있게). 카드 클릭 가능 여부만 `selectIsMyTurn`(전송 중엔 false)으로 잠근다.
 * 핫시트는 손패 소유자 자체가 `viewerId`(턴 플레이어)로 바뀌므로 이 문제와 무관하고, 턴이
 * 넘어가는 순간은 `HandoffOverlay`가 화면 전체를 가려 상대에게 손패가 새는 일이 없다.
 */
export const BoardTab = memo(function BoardTab() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const selectedCardId = useGameStore(selectSelectedCardId);
  const selectedHandIndex = useGameStore((s) => s.selectedHandIndex);
  const discardMode = useGameStore((s) => s.discardMode);
  const discardCardIds = useGameStore((s) => s.discardCardIds);
  const setDiscardCard = useGameStore((s) => s.setDiscardCard);
  const placeAt = useGameStore((s) => s.placeAt);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const confirmPlacement = useGameStore((s) => s.confirmPlacement);
  const cancelPlacement = useGameStore((s) => s.cancelPlacement);

  const handleCellClick = placeAt;

  const cells = useMemo(() => (state ? buildCells(state, viewerId) : []), [state, viewerId]);
  const legal = useMemo(
    () => (state ? legalCellKeys(state, viewerId, selectedCardId) : new Set<string>()),
    [state, viewerId, selectedCardId],
  );
  const hand = useMemo(() => (state ? buildHand(state, viewerId) : []), [state, viewerId]);
  // 배치 프리뷰(길게 누르기, 2026-09-28)용 시야 반경. 카드 미선택 시 0 — Board 가 프리뷰를 계산 안 한다
  // 즉발 피해·회복 마법은 시야가 아니라 효과 반경을 프리뷰한다(어느 칸이 영향받는지 미리 본다)
  const selectedSpec = selectedCardId ? getSpec(selectedCardId) : null;
  const effect = selectedSpec?.effect ?? null;
  const previewAll = effect?.kind === 'damage' || effect?.kind === 'heal';
  const previewSight = !selectedSpec ? 0 : previewAll && effect && 'radius' in effect ? effect.radius : selectedSpec.sight;
  // 배치 후보가 있으면 엔진 함수로 '여기 놓고 턴을 끝내면' 무슨 일이 생기는지 미리 계산한다
  const placement = useMemo(
    () => (state && viewerId && selectedCardId && pendingPos ? buildPlacementPreview(state, viewerId, selectedCardId, pendingPos) : null),
    [state, viewerId, selectedCardId, pendingPos],
  );

  if (!state || !viewerId) return null;
  const viewerSeat = seatOf(state, viewerId);
  const placeHint = hasSeenPlacementPreview() ? '밝은 칸을 눌러 위치 선택' : '밝은 칸을 눌러 위치 선택 · 길게 누르면 시야 미리보기';

  return (
    <div className={styles.root}>
      <div className={styles.boardArea}>
        <Board
          size={state.board.width}
          cells={cells}
          legal={legal}
          viewerSeat={viewerSeat}
          previewSight={previewSight}
          previewAll={previewAll}
          overlays={placement?.overlays}
          ghostCardId={placement ? selectedCardId : null}
          onCellClick={handleCellClick}
        />
        <div className={styles.floatingBottom}>
          {placement && isMyTurn && selectedCardId && (
            <div className={styles.confirmBar} role="group" aria-label="배치 확인">
              <div className={styles.confirmInfo}>
                <strong>{getSpec(selectedCardId).name}</strong> ({pendingPos!.x},{pendingPos!.y})
                <span className={styles.confirmStats}>
                  {placement.newAttacks > 0 && <span className={styles.statHit}>공격 {placement.newAttacks}</span>}
                  {placement.kills > 0 ? (
                    <span className={styles.statHit}>파괴 예상 {placement.kills}</span>
                  ) : placement.hits > 0 ? (
                    <span className={styles.statHit}>피격 {placement.hits}</span>
                  ) : null}
                  {placement.exposedTo > 0 && <span className={styles.statWarn}>적 사거리 {placement.exposedTo}</span>}
                  {placement.scoreDelta !== 0 && (
                    <span>점수 {placement.scoreDelta > 0 ? '+' : ''}{placement.scoreDelta}</span>
                  )}
                  {placement.hits === 0 && placement.exposedTo === 0 && placement.scoreDelta === 0 && <span>전투 없음</span>}
                </span>
              </div>
              <button type="button" className="pill pill--outline" onClick={cancelPlacement}>
                취소
              </button>
              <button type="button" className="pill" onClick={confirmPlacement}>
                배치 확정
              </button>
            </div>
          )}
          {state.phase === 'playing' && (
            <div className={styles.handPanel}>
              <div className={styles.handLabel}>
                <span className={styles.handCount}>손패 {hand.length}</span>
                {!isMyTurn ? (
                  <span>상대 차례 · 카드를 눌러 살펴보기</span>
                ) : discardMode ? (
                  <span className={styles.discardHint}>
                    <SwapIcon size={14} /> 버릴 카드 {discardCardIds.length}장 · 턴 종료 시 덱과 섞어 다시 뽑기
                  </span>
                ) : (
                  <span>{selectedCardId ? placeHint : '카드를 눌러 확인하고 고르기'}</span>
                )}
              </div>
              <div className={styles.handBody}>
                <Hand
                  cards={hand}
                  selectedIndex={selectedHandIndex}
                  interactive={isMyTurn}
                  onOpen={(index) => openCardModal({ kind: 'hand', index })}
                  seat={viewerSeat}
                  discardMode={discardMode}
                  discardCardIds={discardCardIds}
                  onSetDiscard={setDiscardCard}
                />
              </div>
            </div>
          )}
          <TurnControls compact />
        </div>
      </div>
    </div>
  );
});
