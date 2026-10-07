import { useEffect, useState, type ReactNode } from "react";
import { CardArt } from "./CardArt";
import { Icon, type IconName } from "./Icons";
import { canTakeClassCard, CLASS_LEVEL_LABEL, classGainKind, ENERGY_FIELD, STAT_LABEL, effectiveStat, type ClassCard, type PlayerGameState } from "./gameTypes";
import { COLUMN_STYLE } from "./statStyle";
import { useModalLock } from "./modalLock";

// 카드 기본형: 일러스트 + 제목 + 속성(아이콘) + 효과(아이콘+숫자) + 비용(아이콘+숫자).
// 카드 종류가 늘어나도 같은 모양으로 쓰도록 속성/효과/비용을 "아이콘 슬롯 배열"로 받는다.
// 새 카드 종류는 GameCardData를 만드는 변환 함수(아래 classCardData 참고)만 추가하면 된다.
export interface CardSlot {
  icon: IconName;
  // 접근성·팝업 라벨용 이름 (예: "지력", "체력기운")
  label: string;
  // 숫자(또는 "무료" 같은 짧은 값). 속성 슬롯은 보통 없다
  value?: string | number;
  // 색상 클래스 (text-*, bg-*)
  text: string;
  bg: string;
  // 팝업에서 아이콘 옆에 붙는 풀어 쓴 설명 (예: "지력 능력치가 2 올라요")
  detail?: string;
}

export interface GameCardData {
  // 일러스트를 찾는 이름 (cardImages.ts 매핑)
  name: string;
  rare?: boolean;
  attrs: CardSlot[];
  effects: CardSlot[];
  costs: CardSlot[];
  // 팝업에만 보이는 문장 설명 (카드 위에는 쓰지 않는다)
  description?: string;
}

// ── 정규수업 카드 변환 ──

export function classCardData(card: ClassCard): GameCardData {
  const st = COLUMN_STYLE[card.stat];
  const kind = classGainKind(card);
  const energy = COLUMN_STYLE[ENERGY_FIELD[kind]];
  const label = STAT_LABEL[card.stat];
  const level = CLASS_LEVEL_LABEL[card.level];
  const rare = card.level === "advanced";
  return {
    name: card.name,
    rare,
    description: card.description,
    attrs: [{ icon: st.icon, label: `${label} ${level}`, text: st.text, bg: st.bg, detail: `${label} 과목 (${level})` }],
    effects: [{ icon: energy.icon, label: energy.label, value: `+${card.gain}`, text: energy.text, bg: energy.bg, detail: `${energy.label}이 ${card.gain} 생겨요` }],
    costs:
      card.minStat !== undefined
        ? [{ icon: st.icon, label: `${label} ${card.minStat} 이상`, value: `${card.minStat}↑`, text: st.text, bg: st.bg, detail: `${level} 과목이라 ${label} ${card.minStat} 이상이어야 들을 수 있어요` }]
        : [{ icon: "check", label: "비용", value: "무료", text: "text-emerald-700", bg: "bg-emerald-50", detail: `누구나 무료로 들을 수 있는 ${level} 과목이에요` }],
  };
}

// 내가 이 카드를 가져갈 수 있는지, 못 하면 이유 (심화 과목의 선수 조건)
export function classCardBlockReason(player: PlayerGameState, card: ClassCard): string | null {
  return canTakeClassCard(player, card)
    ? null
    : `${CLASS_LEVEL_LABEL[card.level]} 과목이라 ${STAT_LABEL[card.stat]} ${card.minStat} 이상이어야 해요 (지금 ${effectiveStat(player, card.stat)})`;
}

function SlotChip({ slot, size = "sm" }: { slot: CardSlot; size?: "sm" | "md" }) {
  return (
    <span
      role="img"
      aria-label={slot.value !== undefined ? `${slot.label} ${slot.value}` : slot.label}
      className={`inline-flex items-center gap-0.5 rounded-full font-semibold whitespace-nowrap ${slot.bg} ${slot.text} ${size === "md" ? "px-2.5 py-1 text-sm" : "px-1.5 py-0.5 text-xs"}`}
    >
      <Icon name={slot.icon} className={size === "md" ? "h-5 w-5" : "h-4 w-4"} />
      {slot.value !== undefined && slot.value}
    </span>
  );
}

// 카드 격자에 들어가는 작은 카드. 본체를 누르면 onOpen(세부 팝업)
export function GameCardThumb({ card, onOpen, dim = false }: { card: GameCardData; onOpen: () => void; dim?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${card.name} 카드 자세히 보기`}
      className={`block min-h-11 w-full min-w-0 rounded-2xl border-2 p-1.5 text-left shadow-sm transition-transform active:scale-95 ${
        card.rare ? "border-amber-300 bg-amber-50" : "border-purple-200 bg-white"
      } ${dim ? "opacity-60" : ""}`}
    >
      <div className="relative">
        <CardArt name={card.name} />
        {card.attrs.length > 0 && (
          <span className="absolute left-1 top-1 flex gap-1">
            {card.attrs.map((a, i) => (
              <span key={i} role="img" aria-label={a.label} className={`flex h-6 w-6 items-center justify-center rounded-full shadow ring-1 ring-white ${a.bg} ${a.text}`}>
                <Icon name={a.icon} className="h-4 w-4" />
              </span>
            ))}
          </span>
        )}
      </div>
      <span className="mt-1 block truncate px-0.5 text-center font-display text-sm text-purple-700">{card.name}</span>
      <span className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
        {card.effects.map((s, i) => (
          <SlotChip key={`e${i}`} slot={s} />
        ))}
        {card.costs.map((s, i) => (
          <SlotChip key={`c${i}`} slot={s} />
        ))}
      </span>
    </button>
  );
}

function DetailRow({ title, slots }: { title: string; slots: CardSlot[] }) {
  if (slots.length === 0) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="w-9 shrink-0 pt-1 text-xs font-semibold text-purple-500">{title}</span>
      <div className="flex min-w-0 flex-col gap-1">
        {slots.map((s, i) => (
          <p key={i} className="flex items-center gap-1.5 text-sm text-purple-800">
            <SlotChip slot={s} size="md" />
            <span className="min-w-0">{s.detail ?? s.label}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

// 세부 팝업: 큰 이미지, 제목, 속성/효과/비용(아이콘+설명), 문장 설명, 습득 가능 여부. children에는 가져가기 같은 행동 버튼
export function GameCardDetail({
  card,
  onClose,
  blockReason,
  children,
}: {
  card: GameCardData;
  onClose: () => void;
  // 지금 가져갈 수 없는 이유 (가져갈 수 있으면 null, 보기 전용이면 undefined로 생략)
  blockReason?: string | null;
  children?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useModalLock();
  return (
    <div role="dialog" aria-modal="true" aria-label={`${card.name} 카드`} className="fixed inset-0 z-50 flex items-end justify-center bg-purple-900/60 p-3 sm:items-center" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-3xl border-2 border-pink-200 bg-white p-3 shadow-xl" style={{ animation: "pop-in 0.18s ease-out" }} onClick={(e) => e.stopPropagation()}>
        <CardArt name={card.name} className="shadow-md" />
        <p className="mt-2 text-center font-display text-xl text-purple-700">{card.name}</p>
        <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-purple-50 px-3 py-2">
          <DetailRow title="속성" slots={card.attrs} />
          <DetailRow title="효과" slots={card.effects} />
          <DetailRow title="비용" slots={card.costs} />
        </div>
        {card.description && <p className="mt-2 rounded-2xl bg-pink-50 px-3 py-2 text-sm text-purple-700">{card.description}</p>}
        {blockReason !== undefined && (
          <p className={`mt-2 rounded-2xl px-3 py-2 text-sm ${blockReason ? "bg-gray-100 text-gray-700" : "bg-emerald-50 text-emerald-700"}`}>
            <Icon name={blockReason ? "warn" : "check"} className="mr-1 h-4 w-4" />
            {blockReason ?? "지금 가져갈 수 있어요"}
          </p>
        )}
        {children && <div className="mt-3 flex flex-col gap-2">{children}</div>}
        <button type="button" onClick={onClose} className="mt-3 min-h-12 w-full rounded-xl border-2 border-purple-200 py-2 text-purple-600 transition-transform active:scale-95">
          닫기
        </button>
      </div>
    </div>
  );
}

// 보기 전용 격자 (내가 가진 카드·친구 카드). 탭하면 세부 팝업. 아주 좁은 화면(359px 이하)에서는 2열로 줄인다
export function GameCardGrid({ cards }: { cards: GameCardData[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="grid grid-cols-3 gap-2 max-[359px]:grid-cols-2">
        {cards.map((c, i) => (
          <GameCardThumb key={i} card={c} onOpen={() => setOpen(i)} />
        ))}
      </div>
      {open !== null && cards[open] && <GameCardDetail card={cards[open]} onClose={() => setOpen(null)} />}
    </>
  );
}

export interface GamePickItem {
  key: string;
  card: GameCardData;
  // 내 차례가 아니면 undefined → 보기 전용
  onAction?: () => void;
  actionLabel?: string;
  disabled?: boolean;
  // 가져갈 수 없을 때 팝업에 보일 이유 (undefined면 표시 안 함)
  blockReason?: string | null;
}

// 고르는 격자: 카드 본체 탭 = 세부 팝업, 선택은 카드 아래 버튼(또는 팝업 안 버튼)
export function GamePickGrid({ items }: { items: GamePickItem[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = items.find((it) => it.key === openKey);
  const actionButton = (it: GamePickItem, inDetail: boolean) =>
    it.onAction && (
      <button
        type="button"
        disabled={it.disabled}
        onClick={() => {
          setOpenKey(null);
          it.onAction?.();
        }}
        className={`min-h-11 w-full rounded-xl bg-purple-500 px-2 py-2 font-semibold text-white transition-transform active:scale-95 disabled:bg-gray-200 disabled:text-gray-600 disabled:active:scale-100 ${inDetail ? "" : "text-sm"}`}
      >
        {it.actionLabel}
      </button>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.key} className="flex min-w-0 flex-col gap-1">
            <GameCardThumb card={it.card} dim={it.disabled} onOpen={() => setOpenKey(it.key)} />
            {actionButton(it, false)}
          </div>
        ))}
      </div>
      {open && (
        <GameCardDetail card={open.card} blockReason={open.blockReason} onClose={() => setOpenKey(null)}>
          {actionButton(open, true)}
        </GameCardDetail>
      )}
    </>
  );
}
