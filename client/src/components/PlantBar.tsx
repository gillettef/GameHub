import { memo } from 'react';
import type { Direction } from '@rootbound/shared';
import { getSpecies } from '@rootbound/shared';
import { DIRECTION_LABELS, directionsFor, type PlantPreview } from '../game/derived';
import { cx } from '../lib/cx';
import { selectSelectedSpecies, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './PlantBar.module.css';

/**
 * 심기 확인 바: 후보 칸을 고르면 곧바로 심지 않고 예상 결과(내 땅·점수 변화, 뺏는 칸)를 보여 준다.
 * 칡은 방향을, 민들레는 씨앗 칸(선택)을 여기서 정한다.
 */
export const PlantBar = memo(function PlantBar({ preview }: { preview: PlantPreview | null }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const species = useGameStore(selectSelectedSpecies);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const direction = useGameStore((s) => s.pendingDirection);
  const seed = useGameStore((s) => s.pendingSeed);
  const seedPicking = useGameStore((s) => s.seedPicking);
  const setDirection = useGameStore((s) => s.setDirection);
  const startSeedPick = useGameStore((s) => s.startSeedPick);
  const clearSeed = useGameStore((s) => s.clearSeed);
  const confirm = useGameStore((s) => s.confirmPlant);
  const cancel = useGameStore((s) => s.cancelPlant);
  const sending = useGameStore((s) => s.sending);
  if (!state || !species || !pendingPos || !viewerId) return null;
  const sp = getSpecies(species);
  const mySeat = state.players.find((p) => p.id === viewerId)?.seat ?? 0;
  const myLand = preview?.landDelta[mySeat] ?? 0;
  const myScore = preview?.scoreDelta[mySeat] ?? 0;
  const taken = preview ? [...preview.flips.values()].filter((o) => o === mySeat).length : 0;
  const legalDirs = sp.line ? directionsFor(state, pendingPos) : [];

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
          {taken > 0 && <span className={styles.up}>뺏는 칸 {taken}</span>}
        </span>
      </div>
      {sp.line > 0 && (
        <div className={styles.dirs} role="radiogroup" aria-label="칡 방향">
          {DIRECTION_LABELS.map((label, d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              aria-label={`방향 ${label}`}
              disabled={!legalDirs.includes(d as Direction)}
              className={cx(styles.dir, direction === d && styles.dirOn)}
              onClick={() => setDirection(d as Direction)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {sp.seed > 0 && (
        <div className={styles.seedRow}>
          {seedPicking ? (
            <span className={styles.hint}>보드에서 씨앗 칸(점선)을 누르세요</span>
          ) : seed ? (
            <span className={styles.hint}>
              씨앗 ({seed.q},{seed.r})
            </span>
          ) : (
            <span className={styles.hint}>씨앗은 선택입니다</span>
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
      <div className={styles.buttons}>
        <button type="button" className="pill pill--outline" onClick={cancel}>
          취소
        </button>
        <button type="button" className="pill" onClick={confirm} disabled={sending || seedPicking}>
          심기
        </button>
      </div>
    </div>
  );
});
