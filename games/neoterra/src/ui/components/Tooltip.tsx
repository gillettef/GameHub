// 마우스 호버·키보드 포커스 툴팁. 요소에 data-tip(제목)·data-tip-body(설명)를 달면 전역 레이어가 띄운다
// 터치 기기: 버튼이 아닌 정보 표시(메달·자원 접시·행동 구슬 등)는 눌러서 띄우고, 다른 곳을 누르거나 스크롤하면 닫힌다.
// 버튼은 누르면 시트가 열리므로 툴팁을 띄우지 않는다 — 같은 정보는 그 시트에 있어야 한다
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
/** 눌러서 띄운 툴팁은 이만큼 뒤 저절로 닫힌다 */
const TAP_HIDE = 5000;
const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]';

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
    let tapTimer: ReturnType<typeof setTimeout> | null = null;
    const hide = () => {
      if (timer.current) clearTimeout(timer.current);
      if (tapTimer) clearTimeout(tapTimer);
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
    // 눌러서 보기: pointerdown 에서 먼저 닫히고 click 에서 새로 띄운다
    let lastPointer = '';
    const onDownType = (e: PointerEvent) => {
      lastPointer = e.pointerType;
    };
    const onTap = (e: MouseEvent) => {
      // 마우스는 호버로 이미 보인다 — 손가락·펜으로 누를 때만
      if (lastPointer === 'mouse' && canHover) return;
      if ((e.target as Element | null)?.closest?.(INTERACTIVE)) return;
      const t = findTarget(e.target);
      if (!t || t.closest(INTERACTIVE)) return;
      show(t, true);
      tapTimer = setTimeout(hide, TAP_HIDE);
    };
    document.addEventListener('pointerdown', onDownType, true);
    document.addEventListener('click', onTap);
    document.addEventListener('pointerover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerdown', onDownType, true);
      document.removeEventListener('click', onTap);
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
