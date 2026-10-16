import { memo, useEffect, useMemo } from 'react';
import type { SpeciesId } from '@rootbound/shared';
import { ENTRANCE_ROOTS, getGoal, getSpecies, hasAnyPlant, legalPlantCells, samePos } from '@rootbound/shared';
import { goalCardUrl } from '../game/cardImages';
import { asState, buildCells, rotationLabel } from '../game/derived';
import { selectCanPlant, selectCanTake, selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { CloseIcon } from './icons';
import { SpeciesCard } from './SpeciesCard';
import styles from './GameModal.module.css';

const TERRAIN: Record<string, string> = { empty: '빈 땅', fertile: "기름진 땅 (목표 '비옥한 밭'이 센다)", pond: '연못 (심을 수 없고, 누구의 땅도 아님)', rock: '바위 (심을 수 없고, 누구의 땅도 아님)' };

/**
 * 확대 모달 하나로 다섯 가지를 본다 (스토어 cardModal):
 *  - 손패 카드: 심기 차례에 크게 보고 "이 카드 고르기". 심을 칸이 하나도 없으면 "버리기"(Rules.md 6절)
 *  - 마켓 카드: 가져오기 차례에 크게 보고 "이 카드 가져오기"(Rules.md 5절 2)
 *  - 식물 카드: 보기 전용 (카드 탭·마켓)
 *  - 목표 카드: 보기 전용 (목표 칩·점수 탭·카드 탭)
 *  - 보드 칸: 지형·식물·뿌리 수·주인
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
  const canPlant = useGameStore(selectCanPlant);
  const canTake = useGameStore(selectCanTake);
  const takeCard = useGameStore((s) => s.takeCard);
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
  if (target.kind === 'goal') {
    const g = getGoal(target.goal);
    body = <img className={styles.goalFace} src={goalCardUrl(g.id)} alt={`목표 ${g.name}. ${g.description}`} decoding="async" />;
  } else if (target.kind === 'market') {
    const species = state.market[target.index];
    if (!species) return null;
    body = (
      <>
        <SpeciesCard species={species} variant="full" />
        <div className={styles.actions}>
          {canTake ? (
            <button
              type="button"
              className="pill pill--lg"
              onClick={() => {
                close();
                takeCard(target.index);
              }}
            >
              이 카드 가져오기
            </button>
          ) : (
            <p className={styles.hint}>내 가져오기 차례에 가져올 수 있습니다.</p>
          )}
        </div>
      </>
    );
  } else if (target.kind === 'hand' || target.kind === 'species') {
    const species: SpeciesId | undefined = target.kind === 'hand' ? me?.hand[target.index] : target.species;
    if (!species) return null;
    const canPlantAny = target.kind === 'hand' && canPlant && viewerId ? hasAnyPlant(asState(state), viewerId) : true;
    const canPlantThis = target.kind === 'hand' && canPlant && viewerId ? legalPlantCells(asState(state), viewerId, species).length > 0 : true;
    body = (
      <>
        <SpeciesCard species={species} variant="full" seat={target.kind === 'hand' ? me?.seat : null} />
        {target.kind === 'hand' && state.phase === 'playing' && (
          <div className={styles.actions}>
            {!isMyTurn ? (
              <p className={styles.hint}>상대 차례입니다. 내 심기 차례에 고를 수 있습니다.</p>
            ) : !canPlant ? (
              <p className={styles.hint}>먼저 마켓에서 카드 1장을 가져오세요. 그다음 심을 카드를 고릅니다.</p>
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
                <p className={styles.hint}>손에 든 어떤 카드도 심을 칸이 없습니다. 이 카드를 버립니다.</p>
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
          칸 정보
        </h2>
        <p className={styles.line}>{TERRAIN[cell.terrain]}</p>
        {cell.entranceSeat >= 0 && <p className={styles.line}>{players[cell.entranceSeat]?.nickname}의 입구 (처음에 맞닿은 6칸에 뿌리 {ENTRANCE_ROOTS}씩)</p>}
        {cell.plant && (
          <>
            <p className={styles.line}>
              {getSpecies(cell.plant.species).name} · {players[cell.plantedBy]?.nickname}이(가) 방향 {rotationLabel(cell.plant.rotation)}으로 심음
            </p>
            <SpeciesCard species={cell.plant.species} variant="full" seat={cell.owner >= 0 ? cell.owner : null} />
          </>
        )}
        <p className={styles.line} style={cell.owner >= 0 ? { color: `var(--color-seat-${cell.owner})` } : undefined}>
          {cell.terrain === 'pond' || cell.terrain === 'rock' || cell.entranceSeat >= 0
            ? '누구의 땅도 될 수 없습니다'
            : cell.owner >= 0
              ? `${players[cell.owner]?.nickname}의 땅 · 뿌리 ${cell.cubes}${cell.plant ? ' (이 칸의 식물도 이 사람 것)' : ''}`
              : '주인 없음 (뿌리가 없음)'}
        </p>
      </div>
    );
  }

  return (
    <div
      className={styles.backdrop}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={target.kind === 'cell' ? '칸 정보' : '카드 보기'}
      data-kind={target.kind}
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()} ref={(el) => el?.focus()} tabIndex={-1}>
        <button type="button" className={styles.close} onClick={close} aria-label="닫기" title="닫기">
          <CloseIcon />
        </button>
        {body}
      </div>
    </div>
  );
});
