import { useEffect, useState, type ReactNode } from "react";
import { cardImageUrl } from "./cardImages";
import { useModalLock } from "./modalLock";

// 카드 한 장을 화면에 보여 주는 정보 (카드 종류와 상관없이 같은 모양)
export interface CardInfo {
  name: string;
  // 이름 아래에 붙는 짧은 배지 (예: "+1 지력", "체력토큰 2")
  badge?: string;
  // 확대했을 때 보여 줄 설명 줄들
  lines?: ReactNode[];
  // 강조(희귀) 카드
  rare?: boolean;
}

// 일러스트만 (글자 없음). 이미지가 없는 카드는 이름만 있는 예쁜 상자로 대신한다
export function CardArt({ name, className = "" }: { name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = cardImageUrl(name);
  return (
    <div className={`relative aspect-[690/520] w-full overflow-hidden rounded-xl bg-purple-100 ${className}`}>
      {url && !failed ? (
        <img src={url} alt={name} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-2 text-center font-display text-purple-500">{name}</span>
      )}
    </div>
  );
}

// 작은 카드: 일러스트 + 이름 + 배지. 누르면 onOpen(보통 확대 팝업)
export function CardThumb({ card, onOpen, dim = false }: { card: CardInfo; onOpen: () => void; dim?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${card.name} 카드 크게 보기`}
      className={`block w-full min-w-0 rounded-2xl border-2 p-1.5 text-left shadow-sm transition-transform active:scale-95 ${
        card.rare ? "border-amber-300 bg-amber-50" : "border-purple-200 bg-white"
      } ${dim ? "opacity-60" : ""}`}
    >
      <CardArt name={card.name} />
      <span className="mt-1 block truncate px-0.5 text-center font-display text-sm text-purple-700">{card.name}</span>
      {card.badge && <span className="block truncate px-0.5 text-center text-xs text-purple-500">{card.badge}</span>}
    </button>
  );
}

// 카드 확대 팝업. 바깥/닫기 버튼/ESC로 닫는다. children에는 가져가기 같은 행동 버튼을 넣는다
export function CardZoom({ card, onClose, children }: { card: CardInfo; onClose: () => void; children?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useModalLock();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} 카드`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-purple-900/60 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-3xl border-2 border-pink-200 bg-white p-3 shadow-xl"
        style={{ animation: "pop-in 0.18s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <CardArt name={card.name} className="shadow-md" />
        <p className="mt-2 text-center font-display text-xl text-purple-700">{card.name}</p>
        {card.badge && <p className="text-center text-sm font-semibold text-pink-500">{card.badge}</p>}
        {card.lines && card.lines.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 rounded-2xl bg-purple-50 px-3 py-2 text-sm text-purple-700">
            {card.lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
        {children && <div className="mt-3 flex flex-col gap-2">{children}</div>}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-12 w-full rounded-xl border-2 border-purple-200 py-2 text-purple-600 active:scale-95 transition-transform"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

// 카드 목록(작은 카드 격자) + 탭하면 확대. 행동이 필요 없는 보기 전용 목록에 쓴다
export function CardGrid({ cards, cols = 3 }: { cards: CardInfo[]; cols?: 2 | 3 }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className={`grid gap-2 ${cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {cards.map((c, i) => (
          <CardThumb key={i} card={c} onOpen={() => setOpen(i)} />
        ))}
      </div>
      {open !== null && cards[open] && <CardZoom card={cards[open]} onClose={() => setOpen(null)} />}
    </>
  );
}

export interface PickItem {
  key: string;
  card: CardInfo;
  // 내 차례가 아니면 undefined → 보기 전용
  onAction?: () => void;
  actionLabel?: string;
  disabled?: boolean;
}

// 고를 수 있는 카드 격자: 작은 카드 아래에 바로 가져가기 버튼, 카드를 누르면 확대 팝업(거기에도 버튼)
export function PickGrid({ items }: { items: PickItem[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = items.find((it) => it.key === openKey);
  const actionButton = (it: PickItem, inZoom: boolean) =>
    it.onAction && (
      <button
        type="button"
        disabled={it.disabled}
        onClick={() => {
          setOpenKey(null);
          it.onAction?.();
        }}
        className={`min-h-11 w-full rounded-xl bg-purple-500 px-2 py-2 font-semibold text-white active:scale-95 transition-transform disabled:bg-gray-200 disabled:text-gray-600 disabled:active:scale-100 ${
          inZoom ? "" : "text-sm"
        }`}
      >
        {it.actionLabel}
      </button>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.key} className="flex min-w-0 flex-col gap-1">
            <CardThumb card={it.card} dim={it.disabled} onOpen={() => setOpenKey(it.key)} />
            {actionButton(it, false)}
          </div>
        ))}
      </div>
      {open && (
        <CardZoom card={open.card} onClose={() => setOpenKey(null)}>
          {actionButton(open, true)}
        </CardZoom>
      )}
    </>
  );
}
