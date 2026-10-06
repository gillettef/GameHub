import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDismissOnBack } from '../platform/backButton';
import { showTip } from './tip';
import { Icon, type IconName } from './Icon';
import { Slot } from './Slot';
import { TYPE_META } from './meta';
import { baseCapacity, incomeOf } from '../game/engine';
import type { FacilityCard, Visitor } from '../game/types';

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

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 시트를 띄울 곳: 항상 .app 바로 아래 (부모 레이아웃/overflow의 영향을 받지 않게) */
function sheetHost(): Element | null {
  return typeof document === 'undefined' ? null : document.querySelector('.app');
}

interface SheetProps {
  title?: ReactNode;
  /** 제목이 없을 때 스크린리더용 이름 */
  label?: string;
  onClose?: () => void;
  children: ReactNode;
  tall?: boolean;
}

/**
 * 하단 시트(모달). 모든 시트는 이 컴포넌트를 쓴다.
 * - .app 에 포털로 붙여 항상 화면 전체를 덮는 절대 위치 오버레이가 되게 한다.
 * - 본문(.sheet-body)만 스크롤되고, 하단 safe-area 만큼 여백을 둔다.
 * - 뒤로가기/ESC 로 닫기, aria-modal, 포커스 이동·가둠.
 */
export function Sheet({ title, label, onClose, children, tall }: SheetProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnBack(onClose);

  // 열릴 때 시트로 포커스 이동, 닫힐 때 원래 위치로 복귀
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);

  // 간단한 포커스 가둠: Tab 이 시트 밖으로 나가지 않게
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) {
      e.preventDefault();
      ref.current.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const node = (
    <div className="sheet-wrap" onClick={onClose}>
      <div
        ref={ref}
        className={`sheet ${tall ? 'tall' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
      >
        <div className="sheet-grab" />
        {(title || onClose) && (
          <div className="sheet-head">
            <h3 id={titleId}>{title}</h3>
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
  const host = sheetHost();
  return host ? createPortal(node, host) : node;
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
    <div className="pair" title={label} aria-label={`${label} ${a}/${b}`}>
      <Icon name={icon} size={13} />
      <span><Icon name="child" size={11} stroke={2.2} />{a}</span>
      <span><Icon name="adult" size={11} stroke={2.2} />{b}</span>
    </div>
  );
}

/**
 * 시설 스탯 (유지비 / 수익 / 만족도).
 * labeled: 상세 시트용 — 아이콘마다 글자 라벨을 함께 보여 터치 기기에서도 의미를 알 수 있게 한다.
 */
export function FacilityStats({ card, labeled }: { card: FacilityCard; labeled?: boolean }) {
  const cap = baseCapacity(card);
  if (labeled) {
    return (
      <dl className="stat-list">
        <div>
          <dt><Icon name="coin" size={15} /> 유지비</dt>
          <dd className="neg">-${card.upkeep} / 라운드</dd>
        </div>
        <div>
          <dt><Icon name="coin" size={15} /> 수익</dt>
          <dd>
            <span><Icon name="child" size={13} stroke={2.2} />어린이 ${incomeOf(card, 'child')}</span>
            <span><Icon name="adult" size={13} stroke={2.2} />성인 ${incomeOf(card, 'adult')}</span>
          </dd>
        </div>
        <div>
          <dt><Icon name="star" size={15} /> 만족도</dt>
          <dd>
            <span><Icon name="child" size={13} stroke={2.2} />어린이 {card.sat[0]}</span>
            <span><Icon name="adult" size={13} stroke={2.2} />성인 {card.sat[1]}</span>
          </dd>
        </div>
        {cap > 1 && (
          <div className="cap">
            <dt><Icon name="family" size={15} /> 수용</dt>
            <dd>대형 시설 · 한 번에 {cap}명</dd>
          </div>
        )}
      </dl>
    );
  }
  return (
    <div className="stats">
      <div className="pair" title="유지비" aria-label={`유지비 ${card.upkeep}`}>
        <Icon name="coin" size={13} />
        <span className="neg">-{card.upkeep}</span>
      </div>
      <Pair icon="coin" a={incomeOf(card, 'child')} b={incomeOf(card, 'adult')} label="수익(어린이/성인)" />
      <Pair icon="star" a={card.sat[0]} b={card.sat[1]} label="만족도(어린이/성인)" />
      {cap > 1 && (
        <div className="pair cap" title="대형 시설: 한 번에 여러 명 수용">
          <Icon name="family" size={13} />
          <span>수용 {cap}명</span>
        </div>
      )}
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

/* ───── 관객카드 ───── */

const KIND_LABEL = { child: '어린이', adult: '성인' } as const;

interface VisitorCardProps {
  v: Visitor;
  /** open: 가져올 수 있음 / taken: 누군가 가져감 / mine: 내 입구 */
  state?: 'open' | 'taken' | 'mine';
  owner?: string;
  /** 입장료 단계에서 입장 여부 표시 (false면 돌아감) */
  enters?: boolean;
  onTap?: () => void;
  disabled?: boolean;
}

/** 관객카드 — 종류(어린이/성인), 좋아하는 유형, 지불 한도($)가 한눈에 보이게 */
export function VisitorCard({ v, state = 'open', owner, enters, onTap, disabled }: VisitorCardProps) {
  const m = TYPE_META[v.fav];
  const Tag = onTap ? 'button' : 'div';
  return (
    <Tag className={`vcard ${state} ${enters === false ? 'leaves' : ''}`} onClick={onTap} disabled={onTap ? disabled : undefined}>
      <Slot slot={`visitor/${v.kind}`} tint={v.kind === 'child' ? '#ff9ad0' : '#6cc7ff'} className="vcard-art" fallback={<Icon name={v.kind} size={30} stroke={1.6} />}>
        <span className="vcard-budget"><Icon name="ticket" size={11} />${v.budget}</span>
      </Slot>
      <b>{KIND_LABEL[v.kind]}</b>
      <span className="vcard-fav" style={{ ['--c' as string]: m.color }}>
        <Icon name={m.icon} size={12} stroke={2} />
        {m.short}
      </span>
      {state === 'taken' && <span className="vcard-owner">{owner}</span>}
      {enters === false && <span className="vcard-owner bad">돌아감</span>}
    </Tag>
  );
}

/** 입구에 선 관객을 아주 작게 표시 (상대 공원 열람용). 탭하면 상세 설명이 뜬다. */
export function VisitorChip({ v, enters }: { v: Visitor; enters?: boolean }) {
  const m = TYPE_META[v.fav];
  const desc = `${KIND_LABEL[v.kind]} 관객 · 좋아하는 유형 ${v.fav} · 최대 입장료 $${v.budget}${enters === false ? ' · 입구에서 돌아감' : ''}`;
  return (
    <button type="button" className={`vchip ${enters === false ? 'leaves' : ''}`} style={{ ['--c' as string]: m.color }} title={desc} aria-label={desc} onClick={() => showTip(desc)}>
      <Icon name={v.kind} size={14} />
      <Icon name={m.icon} size={13} stroke={2} />
      <i>${v.budget}</i>
    </button>
  );
}
