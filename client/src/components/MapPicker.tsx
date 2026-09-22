import { memo } from 'react';
import type { MapId } from '@astraltab/shared';
import { MAPS } from '@astraltab/shared';
import { cx } from '../lib/cx';
import styles from './Pickers.module.css';

interface MapPickerProps {
  value: MapId;
  onChange?: (mapId: MapId) => void;
  /** 방장이 아닐 때 등. 선택은 보이되 바꿀 수 없다 */
  disabled?: boolean;
  /** 지금 인원. 정원이 이보다 작은 맵은 이유와 함께 비활성 (온라인 로비: 인원이 계속 늘 수 있어 숨기지 않는다) */
  currentPlayers?: number;
  /** 지정하면 이 인원수 맵만 보여준다 (핫시트: 참가 인원을 먼저 정하고 나면 다른 인원의 맵은 아예 나타나지 않는다) */
  filterPlayers?: number;
}

/** 맵 6개를 인원별로 묶어 보여 준다 (F030). 이름·인원·크기·라운드 제한을 항상 표시 */
export const MapPicker = memo(function MapPicker({ value, onChange, disabled, currentPlayers = 0, filterPlayers }: MapPickerProps) {
  const counts = filterPlayers ? [filterPlayers] : [2, 3, 4];
  const groups = counts.map((n) => ({ n, maps: MAPS.filter((m) => m.players === n) }));
  return (
    <div className={styles.mapGroups}>
      {groups.map((g) => (
        <div key={g.n} className={styles.mapGroup}>
          {!filterPlayers && <h3 className={styles.groupTitle}>{g.n}인</h3>}
          {g.maps.map((m) => {
            const tooSmall = currentPlayers > m.players;
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                className={cx(styles.mapCard, selected && styles.mapSelected, (disabled || tooSmall) && styles.mapDisabled)}
                aria-pressed={selected}
                disabled={disabled || tooSmall}
                onClick={() => onChange?.(m.id)}
              >
                <span className={styles.mapName}>{m.name}</span>
                <span className={styles.mapMeta}>
                  {m.players}인 · {m.size}×{m.size} · {m.roundLimit}라운드
                </span>
                <span className={styles.mapDesc}>{tooSmall ? `현재 인원(${currentPlayers}명)보다 정원이 작습니다` : m.description}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});
