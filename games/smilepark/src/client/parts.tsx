import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDismissOnBack } from './platform/backButton';
import { showTip } from './tip';
import { Icon } from './Icon';
import { Slot } from './Slot';
import { TYPE_META } from './meta';
import { sizeOf } from '../engine/data/groups';
import type { Group, ParkCard } from '../engine/types';

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

/** 시트를 띄울 곳: 항상 화면 틀(.gh-app) 바로 아래 (부모 레이아웃/overflow의 영향을 받지 않게) */
function sheetHost(): Element | null {
  return typeof document === 'undefined' ? null : document.querySelector('.gh-app');
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
              <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
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

export function FacilityArt({ card, className = '' }: { card: ParkCard; className?: string }) {
  const m = TYPE_META[card.type];
  return (
    <Slot slot={[`facility/${card.id}`, `type/${card.type}`]} tint={m.color} className={`art ${className}`} fallback={<Icon name={m.icon} size={34} stroke={1.5} />} />
  );
}

export function TypeChip({ type }: { type: ParkCard['type'] }) {
  const m = TYPE_META[type];
  return (
    <span className="chip" style={{ ['--c' as string]: m.color }}>
      <Icon name={m.icon} size={12} stroke={2} />
      {m.short}
    </span>
  );
}

export const TARGET_LABEL = { child: '어린이', adult: '성인', all: '모두' } as const;

/** 놀이기구 대상 아이콘 */
export function TargetIcon({ target, size = 12 }: { target: ParkCard['target']; size?: number }) {
  if (target === 'all') {
    return (
      <span className="tgt" aria-label="대상 모두">
        <Icon name="child" size={size} stroke={2.2} />
        <Icon name="adult" size={size} stroke={2.2} />
      </span>
    );
  }
  return (
    <span className="tgt" aria-label={`대상 ${TARGET_LABEL[target]}`}>
      <Icon name={target} size={size} stroke={2.2} />
    </span>
  );
}

/** 카드의 핵심 인쇄값 한 줄 요약 */
export function cardSummary(c: ParkCard): string {
  if (c.kind === 'ride') return `정원 ${c.cap}명 · ${TARGET_LABEL[c.target]} 1명당 만족도 ${c.sat}`;
  if (c.kind === 'shop') return `입장 그룹 1개당 $${c.income}`;
  return c.fx.text;
}

/**
 * 시설 인쇄값 (오프라인 카드에 적힌 그대로).
 * labeled: 상세 시트용 — 글자 라벨을 함께 보여 터치 기기에서도 의미를 알 수 있게 한다.
 */
export function FacilityStats({ card, labeled }: { card: ParkCard; labeled?: boolean }) {
  if (labeled) {
    return (
      <dl className="stat-list">
        <div>
          <dt><Icon name="coin" size={15} /> 유지비</dt>
          <dd className="neg">-${card.upkeep} / 라운드</dd>
        </div>
        {card.kind === 'ride' && (
          <>
            <div>
              <dt><Icon name="family" size={15} /> 정원</dt>
              <dd>{card.cap}명 · 그룹 1개만</dd>
            </div>
            <div>
              <dt><Icon name="star" size={15} /> 만족도</dt>
              <dd>
                <TargetIcon target={card.target} size={13} /> {TARGET_LABEL[card.target]} 1명당 {card.sat}
              </dd>
            </div>
            <div>
              <dt><Icon name={card.outdoor ? 'sun' : 'amenity'} size={15} /> 위치</dt>
              <dd>{card.outdoor ? '야외' : '실내'}</dd>
            </div>
          </>
        )}
        {card.kind === 'shop' && (
          <div>
            <dt><Icon name="coin" size={15} /> 수익</dt>
            <dd>입장 그룹 1개당 ${card.income} · 쓰레기 1개</dd>
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
      {card.kind === 'ride' && (
        <>
          <div className="pair" title="정원" aria-label={`정원 ${card.cap}명`}>
            <Icon name="family" size={13} />
            <span>{card.cap}</span>
          </div>
          <div className="pair" title={`${TARGET_LABEL[card.target]} 1명당 만족도`} aria-label={`${TARGET_LABEL[card.target]} 1명당 만족도 ${card.sat}`}>
            <TargetIcon target={card.target} size={11} />
            <Icon name="star" size={13} />
            <span>{card.sat}</span>
          </div>
        </>
      )}
      {card.kind === 'shop' && (
        <div className="pair" title="입장 그룹 1개당 수익" aria-label={`입장 그룹 1개당 ${card.income}달러`}>
          <Icon name="coin" size={13} />
          <span>+{card.income}/그룹</span>
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

/* ───── 관객 그룹 카드 ───── */

/** 그룹 구성: 어린이/성인 아이콘 + 인원 */
export function Members({ g, size = 13 }: { g: Group; size?: number }) {
  return (
    <span className="members" aria-label={`어린이 ${g.kids}명 성인 ${g.adults}명`}>
      {g.kids > 0 && (
        <span className="mem kid"><Icon name="child" size={size} stroke={2.2} />{g.kids}</span>
      )}
      {g.adults > 0 && (
        <span className="mem adult"><Icon name="adult" size={size} stroke={2.2} />{g.adults}</span>
      )}
    </span>
  );
}

interface GroupCardProps {
  g: Group;
  /** open: 가져올 수 있음 / taken: 누군가 가져감 / mine: 내 그룹 */
  state?: 'open' | 'taken' | 'mine';
  owner?: string;
  /** 입장 여부 표시 (false면 돌아감) */
  enters?: boolean;
  /** 배치된 놀이기구 이름 */
  placedAt?: string;
  selected?: boolean;
  onTap?: () => void;
  disabled?: boolean;
}

/** 관객 그룹 카드 — 이름, 구성(어린이/성인), 좋아하는 유형, 지불 한도($)가 한눈에 보이게 */
export function GroupCard({ g, state = 'open', owner, enters, placedAt, selected, onTap, disabled }: GroupCardProps) {
  const m = TYPE_META[g.fav];
  const Tag = onTap ? 'button' : 'div';
  const lead = g.kids >= g.adults ? 'child' : 'adult';
  return (
    <Tag className={`vcard ${state} ${enters === false ? 'leaves' : ''} ${selected ? 'sel' : ''} ${placedAt ? 'placed' : ''}`} onClick={onTap} disabled={onTap ? disabled : undefined}>
      <Slot slot={`visitor/${lead}`} tint={lead === 'child' ? '#ff9ad0' : '#6cc7ff'} className="vcard-art" fallback={<Icon name={lead} size={28} stroke={1.6} />}>
        <span className="vcard-budget"><Icon name="ticket" size={11} />${g.budget}</span>
        <span className="vcard-size">{sizeOf(g)}명</span>
      </Slot>
      <b>{g.name}</b>
      <Members g={g} size={12} />
      <span className="vcard-fav" style={{ ['--c' as string]: m.color }}>
        <Icon name={m.icon} size={12} stroke={2} />
        {m.short}
      </span>
      {state === 'taken' && <span className="vcard-owner">{owner}</span>}
      {enters === false && <span className="vcard-owner bad">돌아감</span>}
      {placedAt && <span className="vcard-owner ok">{placedAt}</span>}
    </Tag>
  );
}

/** 그룹을 아주 작게 표시 (상대 공원 열람용). 탭하면 상세 설명이 뜬다. */
export function GroupChip({ g, enters }: { g: Group; enters?: boolean }) {
  const m = TYPE_META[g.fav];
  const desc = `${g.name} · 어린이 ${g.kids}명 성인 ${g.adults}명 · 좋아하는 유형 ${g.fav} · 지불 한도 $${g.budget}${enters === false ? ' · 입구에서 돌아감' : ''}`;
  return (
    <button type="button" className={`vchip ${enters === false ? 'leaves' : ''}`} style={{ ['--c' as string]: m.color }} title={desc} aria-label={desc} onClick={() => showTip(desc)}>
      <Members g={g} size={12} />
      <Icon name={m.icon} size={13} stroke={2} />
      <i>${g.budget}</i>
    </button>
  );
}
