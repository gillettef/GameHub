import { memo } from 'react';
import { CALL_BONUS, canCallTake, cellLabel, getSpecies, HAND_MAX, samePos } from '../../engine';
import { spotTileUrl } from '../game/cardImages';
import { asState, distinctRotations, rotationLabel, type PlantPreview } from '../game/derived';
import { cx } from '../lib/cx';
import { findMe, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { RootDiagram } from './RootDiagram';
import { SpeciesCard } from './SpeciesCard';
import styles from './PlantBar.module.css';

/**
 * 명당 부르기 바 (v7 「골목 일과」, Rules.md 5.3): 보드에서 내 칸 위 명당을 고르면 방향을 다시 정하고(지금 방향 그대로도 된다)
 * 예상 결과(그 칸 +1 포함)를 보여 준다. 그다음 손에 가져올 펼친 타일을 고른다(손이 3개 미만이고 펼친 타일이 있으면 반드시).
 * 취소·부르기 버튼은 화면 맨 아래(⑤ GameView)에 있다.
 */
export const CallBar = memo(function CallBar({ preview }: { preview: PlantPreview | null }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const pos = useGameStore((s) => s.callPos);
  const rotation = useGameStore((s) => s.callRotation);
  const take = useGameStore((s) => s.callTake);
  const setRotation = useGameStore((s) => s.setCallRotation);
  const setTake = useGameStore((s) => s.setCallTake);
  if (!state?.board || !viewerId) return null;
  const mustTake = canCallTake(asState(state), viewerId);
  const me = findMe(state, viewerId);
  const plant = pos ? state.plants.find((p) => samePos(p.pos, pos)) : undefined;

  if (!pos || !plant) {
    return (
      <div className={styles.bar} role="group" aria-label="명당 부르기">
        <div className={styles.info}>
          <strong className={styles.name}>명당 부르기</strong>
          <span className={styles.hint}>
            내 칸 위 명당(빛나는 칸)을 누르세요. 방향을 다시 정해 그 모양대로 고양이를 부르고, 그 칸에 +{CALL_BONUS}마리. 능력은 쓰지 않습니다.
          </span>
        </div>
      </div>
    );
  }

  const sp = getSpecies(plant.species);
  const mySeat = me?.seat ?? 0;
  const myLand = preview?.landDelta[mySeat] ?? 0;
  const myScore = preview?.scoreDelta[mySeat] ?? 0;
  const rots = distinctRotations(plant.species);
  return (
    <div className={styles.bar} role="group" aria-label="명당 부르기">
      <img className={styles.tile} src={spotTileUrl(plant.species)} alt="" aria-hidden="true" />
      <div className={styles.info}>
        <strong className={styles.name}>
          {cellLabel(state.board, pos)} {sp.name} 부르기
        </strong>
        <span className={styles.stats}>
          <span className={myLand >= 0 ? styles.up : styles.down}>
            내 칸 {myLand >= 0 ? '+' : ''}
            {myLand}
          </span>
          <span className={myScore >= 0 ? styles.up : styles.down}>
            점수 {myScore >= 0 ? '+' : ''}
            {myScore}
          </span>
          {preview && preview.uprooted > 0 && <span className={styles.down}>쉬는 고양이가 모자라 {preview.uprooted}마리를 옮겨 옴</span>}
        </span>
      </div>
      {rots.length > 1 && (
        <div className={styles.dirs} role="radiogroup" aria-label="명당 방향">
          {rots.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={rotation === r}
              aria-label={`방향 ${rotationLabel(r)}${r === plant.rotation ? ' (지금 방향)' : ''}`}
              className={cx(styles.dir, rotation === r && styles.dirOn)}
              onClick={() => setRotation(r)}
            >
              <RootDiagram species={plant.species} rotation={r} size={30} />
            </button>
          ))}
        </div>
      )}
      <div className={styles.takeRow}>
        <span className={styles.hint}>
          {mustTake
            ? take === null
              ? '부른 뒤 손에 가져올 펼친 타일을 고르세요'
              : '이 타일을 가져옵니다'
            : state.market.length === 0
              ? '펼친 타일이 없어 가져오지 않습니다'
              : `손이 가득 차(${HAND_MAX}개) 가져오지 않습니다`}
        </span>
        {mustTake && (
          <div className={styles.takeCards} role="group" aria-label="가져올 펼친 타일">
            {state.market.map((s, i) => (
              <SpeciesCard key={`${i}-${s}`} species={s} variant="mini" compact selected={take === i} onClick={() => setTake(i)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
