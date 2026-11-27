import { memo, useEffect, useMemo } from 'react';
import type { SpeciesId } from '../../engine';
import { ENTRANCE_ROOTS, HAND_MAX, TAKE_COUNT, getGoal, getSpecies, hasAnyPlant, legalPlantCells, samePos } from '../../engine';
import { SPOT_BACK_URL, goalCardUrl } from '../game/cardImages';
import { asState, buildCells, rotationLabel } from '../game/derived';
import { findMe, selectActOptions, selectCanPlant, selectCanTake, selectChoosingAct, selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { CloseIcon } from './icons';
import { SpeciesCard } from './SpeciesCard';
import styles from './GameModal.module.css';

const TERRAIN: Record<string, string> = {
  empty: '골목길',
  fertile: "햇볕 자리 (소문 '양지바른 곳'이 센다)",
  pond: '개울 (놓을 수 없고, 누구의 영역도 아님)',
  rock: '공사장 (놓을 수 없고, 누구의 영역도 아님)',
};

/**
 * 확대 모달 하나로 여섯 가지를 본다 (스토어 cardModal). 화면 테마 「냥냥 골목」 용어(규칙 용어는 괄호):
 *  - 내 타일(손패): 놓기를 고른 차례에 크게 보고 "이 타일 고르기". 놓을 칸이 하나도 없으면 "버리기"(Rules.md 5.1·6절)
 *  - 펼친 타일(마켓): 가져오기를 고른 차례에 크게 보고 "이 타일 가져오기" — 1개로 차례 끝(Rules.md 5.1 1)
 *  - 주머니(카드 더미) 뒷면: 가져오기를 고른 차례에 "주머니에서 꺼내기" — 2개까지, 두 번째도 주머니(Rules.md 5.1 1)
 *  행동을 고르기 전(④ 행동 고르기 판)에 타일을 눌러도 같은 버튼이 나오고, 누르면 그 행동을 고른 것으로 친다(지름길)
 *  - 명당 타일(식물 카드): 보기 전용 (카드 탭·펼친 타일)
 *  - 소문 카드(목표): 보기 전용 (소문 축소판·점수 탭·카드 탭)
 *  - 보드 칸: 칸 이름·지형·명당·고양이 수·주인
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
  const chooseAct = useGameStore((s) => s.chooseAct);
  const choosing = useGameStore(selectChoosingAct);
  // 선택자가 새 객체를 돌려주므로 구독하지 않고 상태가 바뀔 때만 계산한다
  const opts = useMemo(() => selectActOptions({ state, viewerId }), [state, viewerId]);
  const cells = useMemo(() => (state && target?.kind === 'cell' ? buildCells(state) : []), [state, target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, close]);

  if (!target || !state) return null;
  const me = findMe(state, viewerId);
  // 행동을 고르기 전이면 할 수 있는 행동인지로 판단하고, 누르면 그 행동을 고른다
  const takeHere = canTake || (choosing && !!opts?.take);
  // 주머니 두 번째 장 단계에는 펼친 타일을 가져올 수 없다
  const marketHere = takeHere && state.stage !== 'take';
  const pileN = Math.min(TAKE_COUNT, HAND_MAX - (me?.hand.length ?? 0));
  const plantHere = canPlant || (choosing && !!(opts?.plant || opts?.discard));
  const enter = (mode: 'take' | 'plant') => {
    if (choosing) chooseAct(mode);
  };

  let body: React.ReactNode;
  if (target.kind === 'goal') {
    const g = getGoal(target.goal);
    body = <img className={styles.goalFace} src={goalCardUrl(g.id)} alt={`소문 카드 ${g.name}. ${g.description}`} decoding="async" />;
  } else if (target.kind === 'market') {
    const species = state.market[target.index];
    if (!species) return null;
    body = (
      <>
        <SpeciesCard species={species} variant="full" />
        <div className={styles.actions}>
          {marketHere ? (
            <button
              type="button"
              className="pill pill--lg"
              onClick={() => {
                close();
                enter('take');
                takeCard(target.index);
              }}
            >
              이 타일 가져오기
            </button>
          ) : (
            <p className={styles.hint}>
              {takeHere ? '주머니에서 가져오는 중입니다. 두 번째 타일도 주머니에서 꺼냅니다.' : '내 차례에 손 타일이 3개보다 적으면 가져올 수 있습니다.'}
            </p>
          )}
          {marketHere && <p className={styles.hint}>펼친 타일은 1개만 가져오고 차례가 끝납니다. 주머니에서는 {pileN}개를 꺼냅니다.</p>}
        </div>
      </>
    );
  } else if (target.kind === 'pile') {
    body = (
      <>
        <img className={styles.pileFace} src={SPOT_BACK_URL} alt={`주머니(명당 타일 뒷면). 남은 ${state.pileCount}개`} decoding="async" />
        <div className={styles.actions}>
          {takeHere && state.pileCount > 0 ? (
            <>
              <p className={styles.hint}>
                {state.stage === 'take'
                  ? '두 번째 타일을 꺼냅니다.'
                  : `무엇이 나올지 모릅니다. ${pileN}개를 하나씩 꺼내 나만 보고, 펼친 타일은 그대로 남습니다.`}
              </p>
              <button
                type="button"
                className="pill pill--lg"
                onClick={() => {
                  close();
                  enter('take');
                  takeCard('pile');
                }}
              >
                {state.stage === 'take' ? '주머니에서 1개 더 꺼내기' : '주머니에서 꺼내기'}
              </button>
            </>
          ) : (
            <p className={styles.hint}>내 차례에 손 타일이 3개보다 적으면 주머니에서 1개를 꺼낼 수 있습니다.</p>
          )}
        </div>
      </>
    );
  } else if (target.kind === 'hand' || target.kind === 'species') {
    const species: SpeciesId | undefined = target.kind === 'hand' ? me?.hand[target.index] : target.species;
    if (!species) return null;
    const canPlantAny = target.kind === 'hand' && plantHere && viewerId ? hasAnyPlant(asState(state), viewerId) : true;
    const canPlantThis = target.kind === 'hand' && plantHere && viewerId ? legalPlantCells(asState(state), viewerId, species).length > 0 : true;
    body = (
      <>
        <SpeciesCard species={species} variant="full" seat={target.kind === 'hand' ? me?.seat : null} />
        {target.kind === 'hand' && state.phase === 'playing' && (
          <div className={styles.actions}>
            {!isMyTurn ? (
              <p className={styles.hint}>상대 차례입니다. 내 차례에 고를 수 있습니다.</p>
            ) : !plantHere ? (
              <p className={styles.hint}>
                {state.stage === 'take'
                  ? '주머니에서 가져오는 중입니다. 주머니에서 1개를 더 꺼내세요. 놓기는 다음 차례에 합니다.'
                  : state.stage === 'act' && !choosing
                    ? '다른 행동을 골랐습니다. 놓으려면 아래 "다른 행동"을 누르세요.'
                    : '지금은 놓을 수 없습니다.'}
              </p>
            ) : canPlantAny && !canPlantThis ? (
              <p className={styles.hint}>이 타일은 지금 놓을 칸이 없습니다. 다른 타일을 고르세요.</p>
            ) : canPlantAny ? (
              <button
                type="button"
                className="pill pill--lg"
                onClick={() => {
                  enter('plant');
                  selectHandCard(selected === target.index ? null : target.index);
                  close();
                }}
              >
                {selected === target.index ? '선택 해제' : '이 타일 고르기'}
              </button>
            ) : (
              <>
                <p className={styles.hint}>손에 든 어떤 타일도 놓을 칸이 없습니다. 이 타일을 버립니다.</p>
                <button
                  type="button"
                  className="pill pill--lg"
                  onClick={() => {
                    close();
                    enter('plant');
                    discard(species);
                  }}
                >
                  이 타일 버리기
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
          칸 {cell.label}
        </h2>
        <p className={styles.line}>{TERRAIN[cell.terrain]}</p>
        {cell.entranceSeat >= 0 && <p className={styles.line}>{players[cell.entranceSeat]?.nickname}의 아지트 (처음에 맞닿은 6칸에 고양이 {ENTRANCE_ROOTS}마리씩)</p>}
        {cell.plant && (
          <>
            <p className={styles.line}>
              {getSpecies(cell.plant.species).name} · {players[cell.plantedBy]?.nickname}이(가) 방향 {rotationLabel(cell.plant.rotation)}으로 놓음
            </p>
            <SpeciesCard species={cell.plant.species} variant="full" seat={cell.owner >= 0 ? cell.owner : null} />
          </>
        )}
        <p className={styles.line}>
          {cell.owner >= 0 && <span className={styles.dot} style={{ background: `var(--color-seat-${cell.owner})` }} aria-hidden="true" />}
          {cell.terrain === 'pond' || cell.terrain === 'rock' || cell.entranceSeat >= 0
            ? '누구의 영역도 될 수 없습니다'
            : cell.owner >= 0
              ? `${players[cell.owner]?.nickname}의 칸 · 고양이 ${cell.cubes}마리${cell.plant ? ' (이 칸의 명당도 이 사람 것)' : ''}`
              : '주인 없음 (고양이가 없음)'}
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
      aria-label={target.kind === 'cell' ? '칸 정보' : target.kind === 'goal' ? '소문 카드 보기' : '명당 타일 보기'}
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
