import { useState } from "react";
import {
  ACTIVITY_LABEL,
  ELEMENT_ICON,
  STAT_LABEL,
  describeAbility,
  effectiveStat,
  type ActivityId,
  type GameState,
  type PlayerGameState,
} from "./gameTypes";

const ACTIVITY_IDS: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];

const STAT_ICON = { intelligence: "🧠", stamina: "💪", charm: "💖", spellPower: "✨" } as const;

function Chip({ icon, label, value, className }: { icon: string; label: string; value: string | number; className: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-sm whitespace-nowrap ${className}`} aria-label={`${label} ${value}`}>
      <span aria-hidden>{icon}</span> {value}
    </span>
  );
}

function PlayerStatCard({ player, isMe }: { player: PlayerGameState; isMe: boolean }) {
  const body = (
    <>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        <Chip icon={STAT_ICON.intelligence} label="지력" value={effectiveStat(player, "intelligence")} className="bg-sky-100 text-sky-800" />
        <Chip icon={STAT_ICON.stamina} label="체력" value={effectiveStat(player, "stamina")} className="bg-green-100 text-green-800" />
        <Chip icon={STAT_ICON.charm} label="매력" value={effectiveStat(player, "charm")} className="bg-pink-100 text-pink-800" />
        <Chip icon={STAT_ICON.spellPower} label="주문력" value={effectiveStat(player, "spellPower")} className="bg-purple-100 text-purple-800" />
        <Chip icon="🎓" label="학점" value={player.credit} className="bg-amber-100 text-amber-800" />
      </div>
      <p className="text-sm text-purple-700">
        🏆 토너먼트 {player.tournamentTrack}/10 · 🔋 체력토큰 {player.staminaTokens} · 📖 주문서 {player.spellbookTokens}
      </p>
      {player.creatures.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {player.creatures.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white/70 px-2.5 py-1.5 text-sm text-purple-800">
              <span aria-hidden>{ELEMENT_ICON[c.element]}</span> <b>{c.name}</b>
              <span className="block text-xs text-purple-600">{describeAbility(c.ability)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  // 내 카드는 항상 펼치고, 다른 플레이어는 한 줄 요약으로 접어 세로 길이를 줄인다
  if (isMe) {
    return (
      <div className="rounded-3xl border-2 border-pink-300 bg-pink-50 p-3 shadow-sm">
        <p className="font-display text-lg text-purple-700 mb-2 truncate">
          {player.name} <span className="text-sm text-pink-500">(나)</span>
        </p>
        {body}
      </div>
    );
  }
  return (
    <details className="rounded-3xl border-2 border-purple-200 bg-white shadow-sm">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3 py-2 font-display text-purple-700">
        <span className="truncate">{player.name}</span>
        <span className="shrink-0 text-sm text-purple-600">
          🎓 {player.credit} · ✨ {effectiveStat(player, "spellPower")}
        </span>
      </summary>
      <div className="px-3 pb-3">{body}</div>
    </details>
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
  const [limitHint, setLimitHint] = useState(false);

  if (me.hasActedThisPhase) {
    const waiting = game.turnOrder.filter((id) => !game.players[id].hasActedThisPhase);
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4 text-center text-purple-500">
        수업카드를 선택했습니다. {waiting.map((id) => game.players[id].name).join(", ")}님을 기다리는 중...
      </div>
    );
  }

  const toggle = (cardId: string) => {
    if (!selected.includes(cardId) && selected.length >= me.staminaTokens) {
      setLimitHint(true);
      return;
    }
    setLimitHint(false);
    setSelected((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]));
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
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
      {limitHint && (
        <p role="alert" className="mb-3 rounded-2xl bg-pink-50 px-3 py-2 text-sm text-pink-600">
          체력토큰이 부족해서 더 고를 수 없어요. 다른 카드를 해제해 주세요.
        </p>
      )}
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
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4 text-center text-purple-500">
        {game.players[currentTurnPlayerId]?.name}님의 차례를 기다리는 중...
      </div>
    );
  }

  if (pendingActivity === "duel") {
    const others = game.turnOrder.filter((id) => id !== myId);
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
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
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
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
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="pop-in bg-white rounded-3xl border-2 border-amber-200 p-4 shadow-sm">
      <p className="font-display text-xl text-purple-700 mb-3 text-center">
        🎉 {winnerIds.map((id) => game.players[id].name).join(", ")} 승리! 🎉
      </p>
      <ol className="flex flex-col gap-2">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className={`rounded-2xl px-3 py-2 ${winnerIds.includes(p.id) ? "bg-amber-100" : "bg-purple-50"}`}
          >
            <p className="font-display text-purple-800 truncate">
              {medals[i] ?? `${i + 1}위`} {p.name}
            </p>
            <p className="text-sm text-purple-700">
              주문력 {p.spellPower} × 학점 {p.credit} = <b>성취도 {p.spellPower * p.credit}</b>
            </p>
          </li>
        ))}
      </ol>
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
    <div className="min-h-dvh px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col gap-4 max-w-md mx-auto">
      <div className="text-center">
        <h1 className="text-2xl text-purple-700">🏫 마법학교 — {game.round}/12개월</h1>
        <div className="mx-auto mt-2 h-2 w-40 rounded-full bg-purple-100 overflow-hidden" aria-hidden>
          <div className="h-full bg-pink-300 transition-all" style={{ width: `${(game.round / 12) * 100}%` }} />
        </div>
        <p className="text-sm text-purple-500 mt-1">
          {game.phase === "class" && "2주차: 수업"}
          {game.phase === "activity" && "3주차: 방과후활동"}
          {game.phase === "ended" && "게임 종료"}
        </p>
      </div>

      {game.phase === "class" && <ClassPhasePanel game={game} myId={myId} onSubmit={onSubmitClassChoice} />}
      {game.phase === "activity" && <ActivityPhasePanel game={game} myId={myId} onSelect={onSelectActivity} />}
      {game.phase === "ended" && <EndedPanel game={game} />}

      {latestExam && (
        <div className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-3 text-sm">
          <p className="font-display text-base text-sky-700 mb-1">
            📝 {latestExam.round === 6 ? "중간고사" : "기말고사"} 결과
          </p>
          {latestExam.scores.map((s) => (
            <p key={s.playerId} className="text-sky-800 truncate">
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
