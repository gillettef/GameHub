import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// 전역 툴팁: 화면 곳곳의 `title` 속성을 브라우저 기본 툴팁 대신 디자인된 말풍선으로 보여준다 (사용자 요청, 2026-09).
// 마우스가 올라간 순간 그 요소의 `title`을 `data-tip`으로 옮겨(기본 툴팁 억제) 내용을 읽고, 떠나면 되돌린다.
// 컴포넌트마다 툴팁을 따로 만들 필요 없이 `title=`만 쓰면 된다. 터치 기기(hover 불가)에서는 아무것도 하지 않는다.

const SHOW_DELAY_MS = 320;
const GAP = 8; // 요소와 말풍선 사이
const EDGE = 8; // 화면 가장자리 여백

interface Tip {
  text: string;
  x: number; // 말풍선 가운데 x (fixed)
  y: number; // 말풍선 위쪽(below) 또는 아래쪽(above) 기준 y
  below: boolean;
}

function readTip(el: Element): string | null {
  const title = el.getAttribute('title');
  if (title !== null) {
    el.setAttribute('data-tip', title);
    el.removeAttribute('title');
  }
  const tip = el.getAttribute('data-tip');
  return tip && tip.trim() ? tip : null;
}

function restoreTitle(el: Element): void {
  const tip = el.getAttribute('data-tip');
  if (tip !== null && !el.hasAttribute('title')) el.setAttribute('title', tip);
  el.removeAttribute('data-tip');
}

function placeFor(el: Element, text: string): Tip {
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, EDGE + 40), window.innerWidth - EDGE - 40);
  const below = r.top < 64; // 위쪽 공간이 없으면 아래에
  return { text, x, y: below ? r.bottom + GAP : r.top - GAP, below };
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return;
    let active: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      observer?.disconnect();
      observer = null;
      if (active) restoreTitle(active);
      active = null;
      setTip(null);
    };

    const show = (el: Element) => {
      if (el === active) return;
      hide();
      const text = readTip(el);
      if (!text) return;
      active = el;
      // React 가 hover 중에 title 을 다시 쓰면(값 변경) 기본 툴팁이 뜨지 않게 곧바로 옮기고 내용을 갱신한다
      observer = new MutationObserver(() => {
        if (!active) return;
        const next = readTip(active);
        if (next) setTip((t) => (t ? { ...t, text: next } : t));
      });
      observer.observe(el, { attributes: true, attributeFilter: ['title'] });
      timer = setTimeout(() => {
        if (active === el && el.isConnected) setTip(placeFor(el, text));
      }, SHOW_DELAY_MS);
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const el = target?.closest?.('[title], [data-tip]') ?? null;
      if (!el) {
        if (active) hide();
        return;
      }
      show(el);
    };
    const onOut = (e: MouseEvent) => {
      if (!active) return;
      const to = e.relatedTarget as Node | null;
      if (to && active.contains(to)) return;
      hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip]') ?? null;
      if (el) show(el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', hide);
    document.addEventListener('mousedown', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', hide);
    return () => {
      hide();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('mousedown', hide);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', hide);
    };
  }, []);

  if (!tip) return null;
  const style: React.CSSProperties = tip.below ? { left: tip.x, top: tip.y } : { left: tip.x, bottom: window.innerHeight - tip.y };
  return createPortal(
    <div className={`tip ${tip.below ? 'below' : 'above'}`} style={style} role="tooltip">
      {tip.text}
    </div>,
    document.body,
  );
}
