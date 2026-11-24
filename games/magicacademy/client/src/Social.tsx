import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import type { GameState } from "./gameTypes";
import { KickConfirm } from "./Leave";
import type { Reaction } from "./useGameSocket";

export const EMOJIS = ["👍", "😆", "😭", "😱", "👀", "⏰", "🎉", "❤️"];

// 지금 게임이 누구의 행동을 기다리는지 (서버의 진행 규칙과 같은 기준: 주사위 굴림·확인, 4주차 기운 고르기, 정규수업·자율활동 차례, 카드 고르기)
export function waitingOn(game: GameState): string[] {
  if (game.phase === "ended") return [];
  // 주사위는 한 명씩 차례대로 굴린다: 아직 확인하지 않은 첫 참여자
  if (game.pendingRoll) return [game.pendingRoll.entries.find((e) => !e.confirmed)?.playerId].filter((id): id is string => !!id);
  if (game.phase === "cram") return [game.cramOrder[game.cramPointer]].filter(Boolean);
  if (game.phase === "class") return [game.classPickOrder[game.classPickPointer]].filter(Boolean);
  if (game.phase === "activity") {
    if (game.activityStage === "choose") return [game.activityOrder[game.activityTurnPointer]].filter(Boolean);
    if (game.pendingPick) return [game.pendingPick.playerId];
  }
  return [];
}

// 지금 누구의 행동을 기다리는지. 내 차례에는 강조해 준다
function WaitingPill({ game, names, myId }: { game: GameState; names: Record<string, string>; myId: string }) {
  const ids = waitingOn(game).filter((id) => names[id] !== undefined);
  if (ids.length === 0) return null;
  const mine = ids.includes(myId);
  const label = mine ? "내 차례예요" : ids.length === 1 ? `${names[ids[0]]}님을 기다려요` : `${ids.length}명을 기다려요`;
  return (
    <p
      className={`pointer-events-none max-w-[70%] truncate rounded-full px-3 py-1 text-sm shadow-sm ring-1 ring-purple-100 ${
        mine ? "bg-pink-100 text-pink-800" : "bg-white/90 text-purple-600"
      }`}
    >
      <Icon name="bell" className="mr-1 h-4 w-4" />
      <span>{label}</span>
    </p>
  );
}

// 접속이 끊긴 친구 이름 옆에 붙이는 작은 배지 (끊겨도 자리는 유지되고, 돌아오면 이어서 해요)
export function ConnectionBadge({ offline, className = "" }: { offline: boolean; className?: string }) {
  if (!offline) return null;
  return (
    <span className={`inline-block shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 ${className}`} title="연결이 끊겨 있어요">
      연결 끊김
    </span>
  );
}

// 지금 차례인 친구의 연결이 끊겨 있으면 게임이 기다리고 있다고 알려 준다. 방장에게는 내보내기 버튼도 보여 준다
export function WaitingBanner({
  game,
  offline,
  isHost,
  myId,
  onKick,
}: {
  game: GameState;
  offline: string[];
  isHost: boolean;
  myId: string;
  onKick: (playerId: string) => void;
}) {
  const [ask, setAsk] = useState<{ id: string; name: string } | null>(null);
  const absent = waitingOn(game).filter((id) => offline.includes(id) && id !== myId && game.players[id]);
  if (absent.length === 0) return null;
  const canKick = isHost && game.turnOrder.length > 2;
  return (
    <div role="status" className="rounded-2xl border-2 border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      <p>
        {absent.map((id) => `${game.players[id].name}님`).join(", ")}을(를) 기다리는 중이에요 · 연결이 돌아오면 이어서 해요{canKick ? "" : " · 방장은 내보낼 수 있어요"}
      </p>
      {canKick && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {absent.map((id) => (
            <button
              key={id}
              className="min-h-11 rounded-full bg-pink-100 px-4 text-pink-700 active:scale-95 transition-transform"
              onClick={() => setAsk({ id, name: game.players[id].name })}
            >
              {game.players[id].name}님 내보내기
            </button>
          ))}
        </div>
      )}
      {ask && (
        <KickConfirm
          name={ask.name}
          inGame
          onCancel={() => setAsk(null)}
          onKick={() => {
            onKick(ask.id);
            setAsk(null);
          }}
        />
      )}
    </div>
  );
}

// 친구들 목록의 한 사람 아래에 붙는 줄: 연결 끊김 배지와, 방장에게만 보이는 내보내기 버튼
export function PlayerAdminRow({ name, offline, canKick, onKick }: { name: string; offline: boolean; canKick: boolean; onKick: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!offline && !canKick) return null;
  return (
    <div className="-mt-1 flex items-center justify-between gap-2 px-3">
      <ConnectionBadge offline={offline} />
      {canKick && (
        <button className="ml-auto min-h-11 rounded-full bg-pink-50 px-4 text-sm text-pink-600 active:scale-95 transition-transform" onClick={() => setAsking(true)}>
          <Icon name="x" className="mr-1 h-4 w-4" />
          내보내기
        </button>
      )}
      {asking && (
        <KickConfirm
          name={name}
          inGame
          onCancel={() => setAsking(false)}
          onKick={() => {
            onKick();
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

// 방장이 누군가를 내보냈을 때 남은 사람들에게 잠깐 띄우는 안내
export function NoticeToast({ message, seq }: { message: string | null; seq: number }) {
  const [dismissedSeq, setDismissedSeq] = useState(0);
  useEffect(() => {
    if (seq === 0) return;
    const timer = setTimeout(() => setDismissedSeq(seq), 4500);
    return () => clearTimeout(timer);
  }, [seq]);
  if (!message || seq === 0 || dismissedSeq === seq) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4" role="status">
      <p className="pop-in max-w-sm rounded-2xl border-2 border-purple-200 bg-white px-4 py-2 text-sm text-purple-700 shadow-lg">{message}</p>
    </div>
  );
}

// 하단 탭 바로 위에 떠 있는 줄: 왼쪽엔 누구를 기다리는지, 오른쪽엔 리액션 버튼. 떠오르는 리액션도 여기서 보여 준다
export function SocialBar({
  game,
  reactions,
  names,
  myId,
  onEmoji,
}: {
  game: GameState;
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
        <WaitingPill game={game} names={names} myId={myId} />
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
