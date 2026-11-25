import type { GameState } from "./gameTypes";

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

// 접속이 끊긴 친구 이름 옆에 붙이는 작은 배지 (끊겨도 자리는 유지되고, 돌아오면 이어서 해요)
export function ConnectionBadge({ offline, className = "" }: { offline: boolean; className?: string }) {
  if (!offline) return null;
  return (
    <span className={`inline-block shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 ${className}`} title="연결이 끊겨 있어요">
      연결 끊김
    </span>
  );
}
