import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Slot } from './Slot';
import { TYPE_META } from './meta';
import { incomeOf } from '../game/engine';
import type { FacilityCard } from '../game/types';

/** 값이 바뀌면 살짝 튀어오르는 숫자 */
export function Num({ value, prefix = '', className = '' }: { value: number; prefix?: string; className?: string }) {
  const prev = useRef(value);
  const [dir, setDir] = useState<'up' | 'down' | ''>('');
  useEffect(() => {
    if (prev.current !== value) {
      setDir(value > prev.current ? 'up' : 'down');
      prev.current = value;
      const t = setTimeout(() => setDir(''), 600);
      return () => clearTimeout(t);
    }
  }, [value]);
  return <span className={`num ${dir} ${className}`}>{prefix}{value}</span>;
}

export function Sheet({ title, onClose, children, tall }: { title?: ReactNode; onClose?: () => void; children: ReactNode; tall?: boolean }) {
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className={`sheet ${tall ? 'tall' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="sheet-grab" />
        {(title || onClose) && (
          <div className="sheet-head">
            <h3>{title}</h3>
            {onClose && (
              <button className="icon-btn" onClick={onClose} aria-label="닫기">
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function FacilityArt({ card, className = '' }: { card: FacilityCard; className?: string }) {
  const m = TYPE_META[card.type];
  return (
    <Slot slot={[`facility/${card.id}`, `type/${card.type}`]} tint={m.color} className={`art ${className}`} fallback={<Icon name={m.icon} size={34} stroke={1.5} />} />
  );
}

export function TypeChip({ type }: { type: FacilityCard['type'] }) {
  const m = TYPE_META[type];
  return (
    <span className="chip" style={{ ['--c' as string]: m.color }}>
      <Icon name={m.icon} size={12} stroke={2} />
      {m.short}
    </span>
  );
}

function Pair({ icon, a, b, label }: { icon: IconName; a: number; b: number; label: string }) {
  return (
    <div className="pair" title={label}>
      <Icon name={icon} size={13} />
      <span><Icon name="child" size={10} stroke={2.2} />{a}</span>
      <span><Icon name="adult" size={10} stroke={2.2} />{b}</span>
    </div>
  );
}

/** 시설 스탯 (유지비 / 수익 / 만족도) */
export function FacilityStats({ card }: { card: FacilityCard }) {
  return (
    <div className="stats">
      <div className="pair" title="유지비">
        <Icon name="coin" size={13} />
        <span className="neg">-{card.upkeep}</span>
      </div>
      <Pair icon="coin" a={incomeOf(card, 'child')} b={incomeOf(card, 'adult')} label="수익(어린이/성인)" />
      <Pair icon="star" a={card.sat[0]} b={card.sat[1]} label="만족도(어린이/성인)" />
    </div>
  );
}

export function Pips({ level, max = 3, color }: { level: number; max?: number; color?: string }) {
  return (
    <span className="pips" style={{ ['--c' as string]: color }}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < level ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Money({ value, big }: { value: number; big?: boolean }) {
  return (
    <span className={`money ${big ? 'big' : ''}`}>
      <Icon name="coin" size={big ? 20 : 15} />
      <Num value={value} />
    </span>
  );
}

export function Vp({ value, big }: { value: number; big?: boolean }) {
  return (
    <span className={`vp ${big ? 'big' : ''}`}>
      <Icon name="star" size={big ? 20 : 15} />
      <Num value={value} />
    </span>
  );
}
