import type { PlayerPublicView } from '../../engine/view';
import { PitchLines } from './Boards';
import { Icon, ResourceChip } from './Icons';

// 경기 준비 4단계의 관중석 배치 (사용자 요청 2026-09: "눈에 너무 안 띈다 — 스타디움 보드 같은 그림으로"):
// 경기장 평면도의 관중석을 눌러 팬덤을 놓거나 뺀다. 값은 개수 하나(value)라 어느 관중석을 눌러도 앞 번호부터 채운 것으로 그린다.
// 지은 관중석(1·2번 기본, 3·4번 기반 시설)은 제자리에, 스폰서 상시 효과로 생긴 추가 관중석은 아래 줄에 둔다
const SIDES = ['west', 'east', 'north', 'south'] as const;

export function StandsPicker({ me, seats, max, value, onChange }: { me: PlayerPublicView; seats: number; max: number; value: number; onChange: (n: number) => void }) {
  const built = [true, true, me.infrastructure.includes('stand3'), me.infrastructure.includes('stand4')];
  const extra = Math.max(0, seats - built.filter(Boolean).length); // 상시 효과(extraStand)로 늘어난 자리
  let order = 0; // 열린 관중석에 앞에서부터 번호를 매겨 value 개까지 채운다
  const seat = (key: string, label: string, side: string, open: boolean) => {
    const index = open ? order++ : -1;
    const filled = open && index < value;
    const canAdd = open && !filled && value < max;
    return (
      <button
        key={key}
        type="button"
        className={`stand ${side} seat${open ? ' open' : ''}${filled ? ' filled' : ''}`}
        disabled={!open || (!filled && !canAdd)}
        onClick={() => onChange(filled ? value - 1 : value + 1)}
        aria-pressed={filled}
        title={!open ? `${label} (미건설)` : filled ? `${label}: 팬덤 1개 배치됨 — 누르면 뺍니다` : canAdd ? `${label}: 비어 있음 — 누르면 팬덤 1개를 놓습니다` : `${label}: 놓을 팬덤이 없습니다`}
      >
        <span className="stand-name">{label}</span>
        {open ? <span className={`seat-fan${filled ? ' on' : ''}`}><Icon name="fandom" size={14} />{filled ? '1' : '빈 자리'}</span> : <span className="stand-state">미건설</span>}
      </button>
    );
  };
  return (
    <div className="stands-plan-wrap">
      <div className="stadium-plan stands-plan" aria-label="관중석 배치">
        {SIDES.map((side, i) => seat(side, `${i + 1}번 관중석`, side, built[i]!))}
        <div className="stadium-pitch">
          <PitchLines />
          <span className="stands-total">
            <span className="stands-total-value"><Icon name="fandom" size={20} />{value}<small>/ {max}</small></span>
            <span className="stands-total-note">경기 후 <ResourceChip resource="money" amount={value} signedValue /></span>
          </span>
        </div>
        {extra > 0 && <div className="stands-extra">{Array.from({ length: extra }, (_, i) => seat(`x${i}`, '추가 관중석', 'extra', true))}</div>}
      </div>
      <div className="stands-quick">
        <button className="small" disabled={value >= max} onClick={() => onChange(max)}>모두 채우기</button>
        <button className="small ghost" disabled={value <= 0} onClick={() => onChange(0)}>모두 비우기</button>
      </div>
    </div>
  );
}
