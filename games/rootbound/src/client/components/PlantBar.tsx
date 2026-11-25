import { memo } from 'react';
import { getSpecies } from '../../engine';
import { distinctRotations, rotationLabel, type PlantPreview } from '../game/derived';
import { cx } from '../lib/cx';
import { findMe, selectSelectedSpecies, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { RootDiagram } from './RootDiagram';
import styles from './PlantBar.module.css';

/**
 * 심기 확인 바: 후보 칸을 고르면 곧바로 심지 않고 예상 결과(내 땅·점수 변화, 밀어내는 칸)를 보여 준다.
 * 뿌리 모양 방향(회전)과 민들레 씨앗 칸(선택)을 여기서 정한다 (Rules.md 6.2). 취소·심기 버튼은 화면 맨 아래(⑤ GameView)에 있다.
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
    <div className={styles.bar} role="group" aria-label="심기 확인">
      <div className={styles.info}>
        <strong>{sp.name}</strong>
        <span className={styles.stats}>
          <span className={myLand >= 0 ? styles.up : styles.down}>
            내 땅 {myLand >= 0 ? '+' : ''}
            {myLand}
          </span>
          <span className={myScore >= 0 ? styles.up : styles.down}>
            점수 {myScore >= 0 ? '+' : ''}
            {myScore}
          </span>
          {pushed > 0 && <span className={styles.up}>밀어내는 칸 {pushed}</span>}
          {preview && preview.uprooted > 0 && <span className={styles.down}>남은 뿌리가 모자라 {preview.uprooted}개를 옮겨 옴</span>}
        </span>
      </div>
      {rots.length > 1 && (
        <div className={styles.dirs} role="radiogroup" aria-label="뿌리 방향">
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
            <span className={styles.hint}>보드에서 씨앗 칸(점선)을 누르세요</span>
          ) : seed ? (
            <span className={styles.hint}>씨앗 칸을 골랐습니다</span>
          ) : (
            <span className={styles.hint}>씨앗은 안 놓아도 됩니다</span>
          )}
          {seed || seedPicking ? (
            <button type="button" className="pill pill--outline" onClick={clearSeed}>
              씨앗 빼기
            </button>
          ) : (
            <button type="button" className="pill pill--outline" onClick={startSeedPick}>
              씨앗 놓기
            </button>
          )}
        </div>
      )}
    </div>
  );
});
