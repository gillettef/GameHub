import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface SelectOption<V extends string | number> {
  value: V;
  label: ReactNode;
  hint?: ReactNode; // 오른쪽 보조 설명 (예: 난이도)
}

// 드롭다운 메뉴 (사용자 요청 2026-09): 브라우저 기본 <select> 는 펼친 목록을 꾸밀 수 없어 버튼 + listbox 로 직접 그린다.
// 키보드: ↑↓ 이동 · Home/End · Enter/Space 선택 · Esc 닫기. 바깥을 누르거나 포커스가 나가면 닫힌다.
export function Select<V extends string | number>({ value, options, onChange, disabled, label }: { value: V; options: SelectOption<V>[]; onChange: (value: V) => void; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const openMenu = () => {
    if (disabled) return;
    setActive(selectedIndex);
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = options[i];
    setOpen(false);
    if (o && o.value !== value) onChange(o.value);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    const last = options.length - 1;
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') setActive((i) => Math.min(last, i + 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={root} className={`select${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}>
      <button
        type="button"
        className="select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">
          {selected?.label}
          {selected?.hint !== undefined && <span className="select-hint">{selected.hint}</span>}
        </span>
        <svg className="select-caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="select-menu" id={`${id}-list`} role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`select-option${i === active ? ' active' : ''}${o.value === value ? ' selected' : ''}`}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className="select-option-label">{o.label}</span>
              {o.hint !== undefined && <span className="select-hint">{o.hint}</span>}
              <svg className="select-check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
