import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import type { Reaction, TurnTimer } from "./useGameSocket";

export const EMOJIS = ["👍", "😆", "😭", "😱", "👀", "⏰", "🎉", "❤️"];

// 지금 누구의 행동을 기다리는지와 남은 시간. 내 차례에는 시간이 줄어들수록 눈에 띄게 바뀐다
function TurnTimerPill({ timer, names, myId }: { timer: TurnTimer; names: Record<string, string>; myId: string }) {
  const ids = Object.keys(timer.waiting);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (ids.length === 0) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [ids.length]);
  if (ids.length === 0) return null;

  const mine = timer.waiting[myId];
  const deadline = mine ?? Math.min(...Object.values(timer.waiting));
  const sec = Math.max(0, Math.ceil((deadline - now) / 1000));
  const urgent = mine !== undefined && sec <= 10;
  const label =
    mine !== undefined
      ? "내 차례예요"
      : ids.length === 1
        ? `${names[ids[0]] ?? "친구"}님을 기다려요`
        : `${ids.length}명을 기다려요`;
  return (
    <p
      className={`pointer-events-none max-w-[70%] truncate rounded-full px-3 py-1 text-sm shadow-sm ring-1 ring-purple-100 ${
        urgent ? "bg-pink-600 text-white" : mine !== undefined ? "bg-pink-100 text-pink-800" : "bg-white/90 text-purple-600"
      }`}
    >
      <Icon name="bell" className="mr-1 h-4 w-4" />
      <span>{label}</span>
      <span aria-hidden> · {sec}초</span>
    </p>
  );
}

// 하단 탭 바로 위에 떠 있는 줄: 왼쪽엔 제한 시간, 오른쪽엔 리액션 버튼. 떠오르는 리액션도 여기서 보여 준다
export function SocialBar({
  timer,
  reactions,
  names,
  myId,
  onEmoji,
}: {
  timer: TurnTimer;
  reactions: Reaction[];
  names: Record<string, string>;
  myId: string;
  onEmoji: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      {/* 트레이가 열려 있을 때 바깥을 누르면 닫는다 */}
      {open && <div className="fixed inset-0 z-[29]" aria-hidden onClick={() => setOpen(false)} />}
    <div className="pointer-events-none fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-3 pb-1">
      <ul className="mb-1 flex flex-col items-end gap-1">
        {reactions.slice(-3).map((r) => (
          <li key={r.id} className="reaction-float rounded-full bg-white/95 px-3 py-1 text-sm text-purple-700 shadow-sm">
            <span className="mr-1">{names[r.playerId] ?? "친구"}</span>
            <span className="text-lg align-middle">{r.emoji}</span>
          </li>
        ))}
      </ul>
      {open && (
        <div
          id="emoji-tray"
          role="group"
          aria-label="리액션 고르기"
          className="pop-in pointer-events-auto mb-1 ml-auto grid w-fit grid-cols-4 gap-1 rounded-3xl bg-white p-2 shadow-lg ring-2 ring-purple-100"
        >
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="grid h-11 w-11 place-items-center rounded-full bg-purple-50 text-2xl active:scale-90 transition-transform"
              aria-label={`${emoji} 보내기`}
              onClick={() => {
                onEmoji(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end justify-between gap-2">
        <TurnTimerPill timer={timer} names={names} myId={myId} />
        <button
          className="pointer-events-auto ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-xl shadow-md active:scale-95 transition-transform"
          aria-label="리액션 보내기"
          aria-expanded={open}
          aria-controls="emoji-tray"
          onClick={() => setOpen((v) => !v)}
        >
          😊
        </button>
      </div>
    </div>
    </>
  );
}

// 자리를 비워 봇이 내 자리를 대신하고 있을 때 나타나는 안내. 누르면 되찾는다
export function AwayBanner({ onResume }: { onResume: () => void }) {
  return (
    <div role="alert" className="mb-1.5 flex items-center gap-2 rounded-2xl bg-amber-100 px-3 py-1.5 text-sm text-amber-900">
      <span className="min-w-0 flex-1">봇이 대신 플레이 중이에요</span>
      <button className="min-h-11 shrink-0 rounded-full bg-purple-500 px-4 font-semibold text-white active:scale-95 transition-transform" onClick={onResume}>
        돌아오기
      </button>
    </div>
  );
}
