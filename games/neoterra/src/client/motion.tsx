// 화면 모션 도우미: 새로 나타난 것 감지, 숫자 증감 표시, 축포. 움직임은 styles/motion.css 의 .anim-* 가 맡는다
import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * 처음 그릴 때 이미 있던 키는 오래된 것으로, 그 뒤에 처음 보인 키는 `ms` 동안 "새것"으로 본다.
 * 다른 상태 변화로 다시 그려져도 애니메이션이 끊기지 않게 처음 본 시각을 기억한다.
 */
/* eslint-disable react-hooks/refs, react-hooks/purity -- 처음 본 시각을 그리는 중에 기억하는 것이 이 도우미의 목적이다 */
export function useFresh(ms = 900) {
  const born = useRef<Map<string, number> | null>(null);
  const init = born.current === null;
  if (init) born.current = new Map();
  const map = born.current!;
  const now = performance.now();
  return (key: string) => {
    let t = map.get(key);
    if (t === undefined) {
      t = init ? -Infinity : now;
      map.set(key, t);
    }
    return now - t < ms;
  };
}
/* eslint-enable react-hooks/refs, react-hooks/purity */

/** 값이 바뀔 때마다 1씩 오르는 번호와 마지막 증감. 첫 값은 변화로 치지 않는다 */
export function useChange(value: number) {
  const prev = useRef(value);
  const [change, setChange] = useState<{ n: number; delta: number }>({ n: 0, delta: 0 });
  useEffect(() => {
    if (value !== prev.current) {
      const delta = value - prev.current;
      prev.current = value;
      setChange((c) => ({ n: c.n + 1, delta }));
    }
  }, [value]);
  return change;
}

/** 바뀌면 톡 튀고 +n / −n 이 떠오르는 숫자 */
export function Num({ value, delta = true }: { value: number; delta?: boolean }) {
  const { n, delta: d } = useChange(value);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span key={n} className={n ? 'anim-tick' : undefined}>
        {value}
      </span>
      {delta && n > 0 && d !== 0 && (
        <span key={`d${n}`} className={`anim-delta ${d > 0 ? 'up' : 'down'}`} aria-hidden>
          {d > 0 ? `+${d}` : `−${-d}`}
        </span>
      )}
    </span>
  );
}

const CONFETTI_COLORS = ['var(--accent)', 'var(--ark)', 'var(--symbiont)', 'var(--synth)', 'var(--ring2)', 'var(--res-energy)'];

/** 위에서 흩날리는 축포 조각. 위치·방향은 번호로 정해 매번 같다 */
export function Confetti({ count = 28 }: { count?: number }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, i) => {
        const f = (i * 37) % 100; // 0~99 고르게 섞인 값
        const g = (i * 61) % 100;
        return (
          <span
            key={i}
            className="anim-confetti"
            style={
              {
                left: `${(f * 0.9 + 5).toFixed(1)}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                '--x': `${(g - 50) * 1.6}px`,
                '--y': `${180 + g * 2.4}px`,
                '--r': `${(f % 2 ? 1 : -1) * (240 + g * 4)}deg`,
                '--delay': `${(i % 7) * 70}ms`,
                '--dur': `${1500 + g * 12}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
