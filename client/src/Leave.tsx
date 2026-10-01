import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import { useModalLock } from "./modalLock";

// 팝업은 body 바로 아래에 그린다. 헤더의 backdrop-blur 같은 것이 fixed의 기준 영역을 바꿔 팝업 윗부분이 잘리는 것을 막는다.
// 떠 있는 동안 뒤 화면의 연출도 멈춘다.
function Overlay({ children }: { children: ReactNode }) {
  useModalLock();
  return createPortal(children, document.body);
}

// 나가기 확인 창. 게임 중에는 봇이 대신하고 돌아올 수 없다는 것을 알려 준다
export function LeaveConfirm({ inGame, onCancel, onLeave }: { inGame: boolean; onCancel: () => void; onLeave: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <Overlay>
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-purple-900/40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="나가기 확인"
      onClick={onCancel}
    >
      <div className="pop-in w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-lg" onClick={(e) => e.stopPropagation()}>
        <Icon name="door" className="mb-1 h-8 w-8 text-pink-400" />
        <p className="font-display text-lg text-purple-700">정말 나갈까요?</p>
        <p className="mt-1 text-sm text-purple-600">
          {inGame ? "나가면 봇이 대신 플레이하고, 이 게임에는 다시 돌아올 수 없어요." : "방에서 나가 처음 화면으로 돌아가요."}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button className="min-h-12 rounded-2xl bg-purple-500 font-semibold text-white active:scale-95 transition-transform" onClick={onCancel} autoFocus>
            계속 플레이
          </button>
          <button className="min-h-12 rounded-2xl bg-pink-100 text-pink-700 active:scale-95 transition-transform" onClick={onLeave}>
            나가기
          </button>
        </div>
      </div>
    </div>
    </Overlay>
  );
}

// 방장이 친구를 내보낼 때 한 번 더 묻는 창. 게임 중에는 봇이 이어받고 돌아올 수 없다는 것을 알려 준다
export function KickConfirm({ name, inGame, onCancel, onKick }: { name: string; inGame: boolean; onCancel: () => void; onKick: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <Overlay>
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-purple-900/40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="내보내기 확인"
        onClick={onCancel}
      >
        <div className="pop-in w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-lg" onClick={(e) => e.stopPropagation()}>
          <Icon name="door" className="mb-1 h-8 w-8 text-pink-400" />
          <p className="font-display text-lg text-purple-700">{name}님을 내보낼까요?</p>
          <p className="mt-1 text-sm text-purple-600">
            {inGame ? "내보내면 봇이 대신 플레이하고, 이 게임에는 다시 돌아올 수 없어요." : "방에서 내보내요. 방 코드로 다시 들어올 수는 있어요."}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button className="min-h-12 rounded-2xl bg-purple-500 font-semibold text-white active:scale-95 transition-transform" onClick={onCancel} autoFocus>
              취소
            </button>
            <button className="min-h-12 rounded-2xl bg-pink-100 text-pink-700 active:scale-95 transition-transform" onClick={onKick}>
              내보내기
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// 뒤로가기(안드로이드 뒤로가기·브라우저 뒤로가기 제스처)를 눌렀을 때 바로 나가지 않고 onBack을 대신 실행한다
export function useBackGuard(onBack: () => void, enabled = true): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    if (!enabled) return;
    try {
      history.pushState({ magicGuard: true }, "");
    } catch {
      return;
    }
    const onPop = () => {
      // 가드를 다시 쌓아 두어야 다음 뒤로가기도 잡을 수 있다
      try {
        history.pushState({ magicGuard: true }, "");
      } catch {
        // 무시
      }
      onBackRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled]);
}

// 우상단 메뉴 아이콘 → 시트 → "나가기" → 확인 창. 뒤로가기도 같은 확인 창으로 이어진다
export function GameMenu({
  inGame,
  onLeave,
  kickable = [],
  onKick,
}: {
  inGame: boolean;
  onLeave: () => void;
  // 방장만 받는 목록: 게임에서 내보낼 수 있는 친구들
  kickable?: { id: string; name: string }[];
  onKick?: (playerId: string) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; name: string } | null>(null);
  useBackGuard(() => {
    // 내보내기 확인 창이 떠 있으면 그것부터 닫는다
    if (kickTarget) {
      setKickTarget(null);
      return;
    }
    setSheet(false);
    setConfirming(true);
  });

  return (
    <>
      <button
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-purple-600 shadow-sm active:scale-95 transition-transform"
        aria-label="메뉴"
        onClick={() => setSheet(true)}
      >
        <Icon name="menu" className="h-6 w-6" />
      </button>
      {sheet && (
        <Overlay>
        <div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-purple-900/30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-label="메뉴"
          onClick={() => setSheet(false)}
        >
          <div className="pop-in max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <button
              className="flex min-h-12 w-full items-center gap-2 rounded-2xl bg-pink-50 px-4 text-pink-700 active:scale-95 transition-transform"
              onClick={() => {
                setSheet(false);
                setConfirming(true);
              }}
            >
              <Icon name="door" className="h-5 w-5" />
              게임 나가기
            </button>
            {kickable.length > 0 && onKick && (
              <div className="mt-2 flex flex-col gap-1 rounded-2xl bg-purple-50 p-2">
                <p className="px-2 pb-1 text-xs text-purple-500">방장 메뉴 · 자리를 오래 비운 친구는 내보내면 봇이 이어받아요</p>
                {kickable.map((p) => (
                  <button
                    key={p.id}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-purple-700 active:scale-95 transition-transform"
                    onClick={() => {
                      setSheet(false);
                      setKickTarget(p);
                    }}
                  >
                    <Icon name="x" className="h-4 w-4 text-pink-500" />
                    <span className="min-w-0 flex-1 truncate">{p.name} 내보내기</span>
                  </button>
                ))}
              </div>
            )}
            <button className="mt-2 min-h-12 w-full rounded-2xl bg-purple-100 text-purple-700 active:scale-95 transition-transform" onClick={() => setSheet(false)}>
              닫기
            </button>
          </div>
        </div>
        </Overlay>
      )}
      {confirming && <LeaveConfirm inGame={inGame} onCancel={() => setConfirming(false)} onLeave={onLeave} />}
      {kickTarget && onKick && (
        <KickConfirm
          name={kickTarget.name}
          inGame
          onCancel={() => setKickTarget(null)}
          onKick={() => {
            onKick(kickTarget.id);
            setKickTarget(null);
          }}
        />
      )}
    </>
  );
}
