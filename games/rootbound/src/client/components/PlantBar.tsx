import { memo } from 'react';
import { getSpecies } from '../../engine';
import { spotTileUrl } from '../game/cardImages';
import { distinctRotations, rotationLabel, type PlantPreview } from '../game/derived';
import { cx } from '../lib/cx';
import { findMe, selectSelectedSpecies, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { RootDiagram } from './RootDiagram';
import styles from './PlantBar.module.css';

/**
 * 놓기 확인 바 (규칙 용어 심기): 후보 칸을 고르면 곧바로 놓지 않고 예상 결과(내 칸·점수 변화, 빼앗는 칸)를 보여 준다.
 * 고양이 모양 방향(회전)과 캣닢 화분의 멀리 보내기 칸(선택, 규칙 용어 씨앗)을 여기서 정한다 (Rules.md 6.2).
 * 취소·놓기 버튼은 화면 맨 아래(⑤ GameView)에 있다.
 */
export const PlantBar = memo(function PlantBar({ preview }: { preview: PlantPreview | null }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const species = useGameStore(selectSelectedSpecies);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const rotation = useGameStore((s) => s.pendingRotation);
  const seed = useGameStore((s) => s.pendingSeed);
  const seedPicking = useGameStore((s) => s.seedPicking);
  const setRotation = useGameStore((s) => s.setRotation);
  const startSeedPick = useGameStore((s) => s.startSeedPick);
  const clearSeed = useGameStore((s) => s.clearSeed);
  if (!state || !species || !pendingPos || !viewerId) return null;
  const sp = getSpecies(species);
  const mySeat = findMe(state, viewerId)?.seat ?? 0;
  const myLand = preview?.landDelta[mySeat] ?? 0;
  const myScore = preview?.scoreDelta[mySeat] ?? 0;
  const pushed = preview ? [...preview.flips.values()].filter((o) => o === mySeat).length : 0;
  const rots = distinctRotations(species);

  return (
    <div className={styles.bar} role="group" aria-label="놓기 확인">
      <img className={styles.tile} src={spotTileUrl(species)} alt="" aria-hidden="true" />
      <div className={styles.info}>
        <strong className={styles.name}>{sp.name}</strong>
        <span className={styles.stats}>
          <span className={myLand >= 0 ? styles.up : styles.down}>
            내 칸 {myLand >= 0 ? '+' : ''}
            {myLand}
          </span>
          <span className={myScore >= 0 ? styles.up : styles.down}>
            점수 {myScore >= 0 ? '+' : ''}
            {myScore}
          </span>
          {pushed > 0 && <span className={styles.up}>빼앗는 칸 {pushed}</span>}
          {preview && preview.uprooted > 0 && <span className={styles.down}>쉬는 고양이가 모자라 {preview.uprooted}마리를 옮겨 옴</span>}
        </span>
      </div>
      {rots.length > 1 && (
        <div className={styles.dirs} role="radiogroup" aria-label="고양이 방향">
          {rots.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={rotation === r}
              aria-label={`방향 ${rotationLabel(r)}`}
              className={cx(styles.dir, rotation === r && styles.dirOn)}
              onClick={() => setRotation(r)}
            >
              <RootDiagram species={species} rotation={r} size={30} />
            </button>
          ))}
        </div>
      )}
      {sp.seed > 0 && (
        <div className={styles.seedRow}>
          {seedPicking ? (
            <span className={styles.hint}>보드에서 멀리 보낼 칸(점선)을 누르세요</span>
          ) : seed ? (
            <span className={styles.hint}>멀리 보낼 칸을 골랐습니다</span>
          ) : (
            <span className={styles.hint}>멀리 보내기는 안 해도 됩니다</span>
          )}
          {seed || seedPicking ? (
            <button type="button" className="pill pill--outline" onClick={clearSeed}>
              멀리 보내기 취소
            </button>
          ) : (
            <button type="button" className="pill pill--outline" onClick={startSeedPick}>
              멀리 보내기
            </button>
          )}
        </div>
      )}
    </div>
  );
});
