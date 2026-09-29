import { useState } from "react";
import {
  ACTIVITY_LABEL,
  STAT_LABEL,
  effectiveStat,
  type ActivityId,
  type GameState,
  type PlayerGameState,
} from "./gameTypes";

const ACTIVITY_IDS: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];

function PlayerStatCard({ player, isMe }: { player: PlayerGameState; isMe: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${isMe ? "border-purple-400 bg-purple-100" : "border-purple-200 bg-white"}`}>
      <p className="font-semibold text-purple-700 mb-1">
        {player.name} {isMe && <span className="text-xs text-purple-400">(나)</span>}
      </p>
      <div className="grid grid-cols-4 gap-1 text-xs text-purple-600 mb-1">
        <span>지력 {effectiveStat(player, "intelligence")}</span>
        <span>체력 {effectiveStat(player, "stamina")}</span>
        <span>매력 {effectiveStat(player, "charm")}</span>
        <span>주문력 {effectiveStat(player, "spellPower")}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-purple-500">
        <span>학점 {player.credit}</span>
        <span>토너먼트 {player.tournamentTrack}/10</span>
        <span>체력토큰 {player.staminaTokens}</span>
        <span>마법주문서 {player.spellbookTokens}</span>
      </div>
    </div>
  );
}

function ClassPhasePanel({
  game,
  myId,
  onSubmit,
}: {
  game: GameState;
  myId: string;
  onSubmit: (keepCardIds: string[]) => void;
}) {
  const me = game.players[myId];
  const [selected, setSelected] = useState<string[]>([]);

  if (me.hasActedThisPhase) {
    const waiting = game.turnOrder.filter((id) => !game.players[id].hasActedThisPhase);
    return (
      <div className="bg-white rounded-xl p-4 text-center text-purple-500">
        수업카드를 선택했습니다. {waiting.map((id) => game.players[id].name).join(", ")}님을 기다리는 중...
      </div>
    );
  }

  const toggle = (cardId: string) => {
    setSelected((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : prev.length < me.staminaTokens ? [...prev, cardId] : prev,
    );
  };

  return (
    <div className="bg-white rounded-xl p-4">
      <p className="text-sm text-purple-500 mb-2">
        2주차(수업): 카드 1장당 체력토큰 1개가 필요합니다. (선택 {selected.length}/{me.staminaTokens})
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {me.offeredClassCards.map((card) => {
          const isSelected = selected.includes(card.id);
          return (
            <button
              key={card.id}
              onClick={() => toggle(card.id)}
              aria-pressed={isSelected}
              className={`rounded-xl border-2 min-h-12 px-3 py-3 text-sm active:scale-95 transition-transform ${
                isSelected ? "bg-purple-500 text-white border-purple-700" : "bg-purple-50 text-purple-700 border-purple-200"
              }`}
            >
              {isSelected ? "✓ " : ""}{card.name} (+{card.statBoost.amount} {STAT_LABEL[card.statBoost.stat]})
            </button>
          );
        })}
      </div>
      <button
        className="w-full min-h-12 rounded-xl bg-purple-500 text-white font-semibold py-3 active:scale-95 transition-transform"
        onClick={() => onSubmit(selected)}
      >
        {selected.length === 0 ? "습득 없이 넘어가기" : `${selected.length}장 습득 확정`}
      </button>
    </div>
  );
}

function ActivityPhasePanel({
  game,
  myId,
  onSelect,
}: {
  game: GameState;
  myId: string;
  onSelect: (activityId: ActivityId, targetPlayerId?: string) => void;
}) {
  const currentTurnPlayerId = game.activityOrder[game.activityTurnPointer];
  const isMyTurn = currentTurnPlayerId === myId;
  const [pendingActivity, setPendingActivity] = useState<ActivityId | null>(null);

  if (!isMyTurn) {
    return (
      <div className="bg-white rounded-xl p-4 text-center text-purple-500">
        {game.players[currentTurnPlayerId]?.name}님의 차례를 기다리는 중...
      </div>
    );
  }

  if (pendingActivity === "duel") {
    const others = game.turnOrder.filter((id) => id !== myId);
    return (
      <div className="bg-white rounded-xl p-4">
        <p className="text-sm text-purple-500 mb-2">주문 대결 상대를 선택하세요</p>
        <div className="flex flex-col gap-2">
          {others.map((id) => (
            <button
              key={id}
              className="rounded-xl border border-purple-200 min-h-12 px-3 py-3 text-purple-700 bg-purple-50 active:scale-95 transition-transform"
              onClick={() => onSelect("duel", id)}
            >
              {game.players[id].name}
            </button>
          ))}
          <button className="text-sm text-purple-500 min-h-11 w-full" onClick={() => setPendingActivity(null)}>
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-4">
      <p className="text-sm text-purple-500 mb-2">3주차(방과후활동): 구역을 선택하세요</p>
      <div className="grid grid-cols-1 gap-2">
        {ACTIVITY_IDS.map((activityId) => {
          const occupant = game.activitySlots[activityId];
          const label = ACTIVITY_LABEL[activityId];
          if (occupant) {
            return (
              <div key={activityId} className="rounded-xl border border-gray-200 min-h-12 px-3 py-3 text-gray-500 bg-gray-100">
                {label} — {game.players[occupant].name} 선택됨
              </div>
            );
          }
          return (
            <button
              key={activityId}
              className="rounded-xl border border-purple-300 min-h-12 px-3 py-3 text-purple-700 bg-white active:bg-purple-100 active:scale-95 transition-transform"
              onClick={() => (activityId === "duel" ? setPendingActivity("duel") : onSelect(activityId))}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EndedPanel({ game }: { game: GameState }) {
  const winnerIds = game.winnerIds ?? [];
  const ranked = [...game.turnOrder]
    .map((id) => game.players[id])
    .sort((a, b) => b.spellPower * b.credit - a.spellPower * a.credit);

  return (
    <div className="bg-white rounded-xl p-4">
      <p className="text-lg font-bold text-purple-700 mb-3 text-center">
        🎉 {winnerIds.map((id) => game.players[id].name).join(", ")} 승리! 🎉
      </p>
      <table className="w-full text-sm text-purple-700">
        <thead>
          <tr className="text-left text-purple-400">
            <th className="py-1">이름</th>
            <th className="py-1">주문력</th>
            <th className="py-1">학점</th>
            <th className="py-1">마법 성취도</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p) => (
            <tr key={p.id} className={winnerIds.includes(p.id) ? "font-semibold text-purple-800" : ""}>
              <td className="py-1">{p.name}</td>
              <td className="py-1">{p.spellPower}</td>
              <td className="py-1">{p.credit}</td>
              <td className="py-1">{p.spellPower * p.credit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GameBoard({
  game,
  myId,
  onSubmitClassChoice,
  onSelectActivity,
}: {
  game: GameState;
  myId: string;
  onSubmitClassChoice: (keepCardIds: string[]) => void;
  onSelectActivity: (activityId: ActivityId, targetPlayerId?: string) => void;
}) {
  const latestExam = game.examResults[game.examResults.length - 1];

  return (
    <div className="min-h-dvh bg-purple-50 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col gap-4 max-w-md mx-auto">
      <div className="text-center">
        <h1 className="text-xl font-bold text-purple-700">마법학교 — {game.round}라운드</h1>
        <p className="text-sm text-purple-400">
          {game.phase === "class" && "2주차: 수업"}
          {game.phase === "activity" && "3주차: 방과후활동"}
          {game.phase === "ended" && "게임 종료"}
        </p>
      </div>

      {game.phase === "class" && <ClassPhasePanel game={game} myId={myId} onSubmit={onSubmitClassChoice} />}
      {game.phase === "activity" && <ActivityPhasePanel game={game} myId={myId} onSelect={onSelectActivity} />}
      {game.phase === "ended" && <EndedPanel game={game} />}

      {latestExam && (
        <div className="bg-purple-100 rounded-xl p-3 text-sm">
          <p className="font-semibold text-purple-600 mb-1">
            {latestExam.round === 6 ? "중간고사" : "기말고사"} 결과
          </p>
          {latestExam.scores.map((s) => (
            <p key={s.playerId} className="text-purple-600">
              {s.rank}위 {game.players[s.playerId].name} — 점수 {s.score}, 학점 +{s.creditAwarded}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {game.turnOrder.map((id) => (
          <PlayerStatCard key={id} player={game.players[id]} isMe={id === myId} />
        ))}
      </div>
    </div>
  );
}
