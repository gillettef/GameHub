// 마우스 호버·키보드 포커스 툴팁. 요소에 data-tip(제목)·data-tip-body(설명)를 달면 전역 레이어가 띄운다
// 터치 기기에는 호버가 없으므로 보조 수단 — 같은 정보는 눌러서 여는 시트에도 있어야 한다
import { useEffect, useRef, useState } from 'react';
import styles from './Tooltip.module.css';

interface Tip {
  title: string;
  body: string;
  x: number;
  y: number;
  below: boolean;
}

const SHOW_DELAY = 280;
const GAP = 10;

function findTarget(el: EventTarget | null): HTMLElement | SVGElement | null {
  let n = el as Element | null;
  while (n && n !== document.body) {
    if (n instanceof HTMLElement || n instanceof SVGElement) {
      if (n.dataset?.tip) return n;
    }
    n = n.parentElement;
  }
  return null;
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<Element | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const show = (el: HTMLElement | SVGElement, immediate: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      current.current = el;
      const run = () => {
        if (current.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 140;
        setShift(0);
        setTip({ title: el.dataset.tip ?? '', body: el.dataset.tipBody ?? '', x: r.left + r.width / 2, y: below ? r.bottom + GAP : r.top - GAP, below });
      };
      if (immediate) run();
      else timer.current = setTimeout(run, SHOW_DELAY);
    };
    const hide = () => {
      if (timer.current) clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };
    const onOver = (e: PointerEvent) => {
      if (!canHover || e.pointerType !== 'mouse') return;
      const t = findTarget(e.target);
      if (t && t !== current.current) show(t, false);
      else if (!t && current.current) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const t = findTarget(e.target);
      if (t && (e.target as Element).matches(':focus-visible')) show(t, true);
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  // 화면 밖으로 나가지 않게 좌우를 밀어 넣는다(화살표는 대상 위치 유지)
  useEffect(() => {
    if (!tip || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const margin = 8;
    if (r.left < margin) setShift(margin - r.left);
    else if (r.right > window.innerWidth - margin) setShift(window.innerWidth - margin - r.right);
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={box}
      role="tooltip"
      className={`${styles.tip} ${tip.below ? styles.below : styles.above}`}
      style={{ left: tip.x + shift, top: tip.y, ['--arrow' as string]: `${-shift}px` }}
    >
      {tip.title && <strong className={styles.title}>{tip.title}</strong>}
      {tip.body && <span className={styles.body}>{tip.body}</span>}
    </div>
  );
}
