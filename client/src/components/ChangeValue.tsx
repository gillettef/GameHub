import { memo, useEffect, useRef, useState } from 'react';
import styles from './ChangeValue.module.css';

interface ChangeValueProps {
  value: number;
  /** 표시 형식 (예: 수입의 "+2"). 기본은 그대로 */
  format?: (n: number) => string;
  /** true 면 값이 바뀔 때 ±N 이 떠오르게 한다 */
  showDelta?: boolean;
}

/**
 * 숫자가 바뀌면 톡 튀고 증감량(+N/−N)이 위로 떠올랐다 사라진다(2026-10-01, "누가 무엇을 했는지 눈으로 보이게").
 * 첫 렌더에서는 움직이지 않는다. 증감 표시는 부모 레이아웃을 밀지 않도록 절대 배치한다.
 */
export const ChangeValue = memo(function ChangeValue({ value, format, showDelta = true }: ChangeValueProps) {
  const prev = useRef(value);
  const [pulse, setPulse] = useState<{ key: number; delta: number } | null>(null);

  useEffect(() => {
    if (prev.current === value) return;
    const delta = value - prev.current;
    prev.current = value;
    setPulse((p) => ({ key: (p?.key ?? 0) + 1, delta }));
    const t = window.setTimeout(() => setPulse(null), 1100);
    return () => window.clearTimeout(t);
  }, [value]);

  const text = format ? format(value) : String(value);
  return (
    <span className={styles.root}>
      <span key={pulse?.key ?? 0} className={pulse ? styles.bump : undefined}>
        {text}
      </span>
      {showDelta && pulse && (
        <span key={`d${pulse.key}`} className={pulse.delta > 0 ? styles.up : styles.down} aria-hidden="true">
          {pulse.delta > 0 ? '+' : '−'}
          {Math.abs(pulse.delta)}
        </span>
      )}
    </span>
  );
});
