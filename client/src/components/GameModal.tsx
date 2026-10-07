import { memo, useEffect, useMemo } from 'react';
import type { SpeciesId } from '@rootbound/shared';
import { getSpecies, hasAnyPlant, legalPlantCells, samePos } from '@rootbound/shared';
import { DIRECTION_LABELS, asState, buildCells } from '../game/derived';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { CloseIcon } from './icons';
import { SpeciesCard } from './SpeciesCard';
import styles from './GameModal.module.css';

const TERRAIN: Record<string, string> = { empty: '빈 땅', fertile: '비옥토 (심은 식물 자기 칸 +1)', pond: '연못 (심기 불가, 누구의 땅도 아님)', rock: '돌밭 (심기 불가, 누구의 땅도 아님)' };

/**
 * 확대 모달 하나로 세 가지를 본다 (스토어 cardModal):
 *  - 손패 카드: 크게 보고 "이 카드 고르기". 심을 칸이 하나도 없으면 "버리기" (Rules.md 6절)
 *  - 종 카드: 보기 전용 (카드 탭·드래프트)
 *  - 보드 칸: 지형·식물·좌석별 영향력·주인
 */
export const GameModal = memo(function GameModal() {
  const target = useGameStore((s) => s.cardModal);
  const close = useGameStore((s) => s.closeCardModal);
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const selected = useGameStore((s) => s.selectedHandIndex);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const discard = useGameStore((s) => s.discard);
  const cells = useMemo(() => (state && target?.kind === 'cell' ? buildCells(state) : []), [state, target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, close]);

  if (!target || !state) return null;
  const me = state.players.find((p) => p.id === viewerId);

  let body: React.ReactNode = null;
  if (target.kind === 'hand' || target.kind === 'species') {
    const species: SpeciesId | undefined = target.kind === 'hand' ? me?.hand[target.index] : target.species;
    if (!species) return null;
    const canPlantAny = target.kind === 'hand' && isMyTurn && state.phase === 'playing' && viewerId ? hasAnyPlant(asState(state), viewerId) : true;
    const canPlantThis = target.kind === 'hand' && isMyTurn && state.phase === 'playing' && viewerId ? legalPlantCells(asState(state), viewerId, species).length > 0 : true;
    body = (
      <>
        <SpeciesCard species={species} variant="full" seat={target.kind === 'hand' ? me?.seat : null} />
        {target.kind === 'hand' && state.phase === 'playing' && (
          <div className={styles.actions}>
            {!isMyTurn ? (
              <p className={styles.hint}>상대 차례입니다. 내 차례에 고를 수 있습니다.</p>
            ) : canPlantAny && !canPlantThis ? (
              <p className={styles.hint}>이 카드는 지금 심을 칸이 없습니다. 다른 카드를 고르세요.</p>
            ) : canPlantAny ? (
              <button
                type="button"
                className="pill pill--lg"
                onClick={() => {
                  selectHandCard(selected === target.index ? null : target.index);
                  close();
                }}
              >
                {selected === target.index ? '선택 해제' : '이 카드 고르기'}
              </button>
            ) : (
              <>
                <p className={styles.hint}>손패의 어떤 카드도 심을 칸이 없습니다. 한 장을 버리고 새로 뽑습니다.</p>
                <button
                  type="button"
                  className="pill pill--lg"
                  onClick={() => {
                    close();
                    discard(species);
                  }}
                >
                  이 카드 버리기
                </button>
              </>
            )}
          </div>
        )}
      </>
    );
  } else {
    const cell = cells.find((c) => samePos(c, target.pos));
    if (!cell) return null;
    const players = [...state.players].sort((a, b) => a.seat - b.seat);
    body = (
      <div className={styles.cellInfo}>
        <h2 className={styles.title}>
          칸 ({cell.q},{cell.r})
        </h2>
        <p className={styles.line}>{TERRAIN[cell.terrain]}</p>
        {cell.entranceSeat >= 0 && <p className={styles.line}>{players[cell.entranceSeat]?.nickname}의 입구 (자기 칸 3, 둘레 1)</p>}
        {cell.plant && (
          <>
            <p className={styles.line}>
              {players[cell.plantSeat]?.nickname}의 {getSpecies(cell.plant.species).name}
              {cell.plant.direction !== null && ` · 방향 ${DIRECTION_LABELS[cell.plant.direction]}`}
            </p>
            <SpeciesCard species={cell.plant.species} variant="full" seat={cell.plantSeat} />
          </>
        )}
        <ul className={styles.influence}>
          {players.map((p) => (
            <li key={p.id} style={{ color: `var(--color-seat-${p.seat})` }}>
              {p.nickname}: 영향력 {cell.influence[p.seat] ?? 0}
            </li>
          ))}
        </ul>
        <p className={styles.line}>
          {cell.terrain === 'pond' || cell.terrain === 'rock'
            ? '누구의 땅도 될 수 없습니다'
            : cell.owner >= 0
              ? `${players[cell.owner]?.nickname}의 땅`
              : '주인 없음 (동점이거나 아무도 닿지 않음)'}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.backdrop} onClick={close} role="dialog" aria-modal="true" aria-label={target.kind === 'cell' ? '칸 정보' : '카드 보기'}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()} ref={(el) => el?.focus()} tabIndex={-1}>
        <button type="button" className={styles.close} onClick={close} aria-label="닫기" title="닫기">
          <CloseIcon />
        </button>
        {body}
      </div>
    </div>
  );
});
