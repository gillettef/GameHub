import { useState } from "react";
import {
  ACTIVITY_HINT,
  ACTIVITY_LABEL,
  ELEMENT_ICON,
  ELEMENT_LABEL,
  LAB_KIND_ICON,
  LAB_KIND_LABEL,
  STAT_LABEL,
  describeAbility,
  effectiveStat,
  type ActivityId,
  type CreatureElement,
  type GameState,
  type LabCard,
  type PlayerGameState,
} from "./gameTypes";
import { RulesGuide } from "./Rules";

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
        🏆 토너먼트 {player.tournamentTrack}/10 · 🔋 체력토큰 {player.staminaTokens} · 📖 주문서 {player.spellbookTokens} · 📚 수업 {player.classCards.length}장
      </p>
      {player.peekedExploration && (
        <div className="mt-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-sm text-indigo-800">
          <p>
            <span aria-hidden>🔮</span> 엿본 탐험 카드: <b>{player.peekedExploration.name}</b>
          </p>
          <p className="text-xs text-indigo-600">{player.peekedExploration.description}</p>
          {player.peekedExploration.checkText && <p className="text-xs">🎲 {player.peekedExploration.checkText}</p>}
          <p className="text-xs">✅ 성공: {player.peekedExploration.successText}</p>
          <p className="text-xs">⚠️ 실패: {player.peekedExploration.failureText}</p>
        </div>
      )}
      {player.equipment.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {player.equipment.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white/70 px-2.5 py-1.5 text-sm text-purple-800">
              <span aria-hidden>🧪</span> <b>{c.name}</b>
              <span className="block text-xs text-purple-600">{c.summary}</span>
            </li>
          ))}
        </ul>
      )}
      {player.grimoires.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {player.grimoires.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white/70 px-2.5 py-1.5 text-sm text-purple-800">
              <span aria-hidden>📕</span> <b>{c.name}</b>
              <span className="block text-xs text-purple-600">
                {STAT_LABEL[c.statBoost.stat]} +{c.statBoost.amount}
                {c.ability ? ` · ${describeAbility(c.ability)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {player.creatures.length > 0 && (
        <p className="mt-2 text-xs text-purple-600">
          유형 모으기: {(["sky", "land", "ocean"] as CreatureElement[]).map((el) => `${ELEMENT_ICON[el]}${ELEMENT_LABEL[el]} ${player.creatures.filter((c) => c.element === el).length}`).join(" · ")}
        </p>
      )}
      {player.creatures.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1">
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
        2주차(정규수업): 카드 1장당 체력토큰 1개가 필요합니다. (선택 {selected.length}/{me.staminaTokens})
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
              <span className="block text-xs opacity-80">{card.description}</span>
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

function LabChoicePanel({ cards, onChoose }: { cards: LabCard[]; onChoose: (cardId: string) => void }) {
  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
      <p className="text-sm text-purple-500 mb-2">연구실 실험: 펼쳐진 연구 카드 중 1장을 고르세요</p>
      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => onChoose(card.id)}
            className="rounded-xl border-2 border-purple-200 bg-purple-50 min-h-12 px-3 py-3 text-left text-purple-800 active:scale-95 transition-transform"
          >
            <span aria-hidden>{LAB_KIND_ICON[card.kind]}</span> <b>{card.name}</b>
            <span className="ml-1 text-xs text-purple-500">({LAB_KIND_LABEL[card.kind]})</span>
            <span className="block text-sm">{card.summary}</span>
            <span className="block text-xs text-purple-500">{card.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityPhasePanel({
  game,
  myId,
  onSelect,
  onChooseLabCard,
}: {
  game: GameState;
  myId: string;
  onSelect: (activityId: ActivityId, targetPlayerId?: string, useStamina?: boolean) => void;
  onChooseLabCard: (cardId: string) => void;
}) {
  const currentTurnPlayerId = game.pendingLab?.playerId ?? game.activityOrder[game.activityTurnPointer];
  const isMyTurn = currentTurnPlayerId === myId;
  const duelTargets = game.turnOrder.filter((id) => id !== myId && !game.players[id].hasActedThisPhase);
  const [pendingActivity, setPendingActivity] = useState<ActivityId | null>(null);
  const [focus, setFocus] = useState(false);
  const staminaTokens = game.players[myId]?.staminaTokens ?? 0;
  const orderText = game.activityOrder.map((id) => game.players[id].name).join(" → ");

  if (isMyTurn && game.pendingLab) {
    return <LabChoicePanel cards={game.pendingLab.cards} onChoose={onChooseLabCard} />;
  }

  if (!isMyTurn) {
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4 text-center text-purple-500">
        {game.players[currentTurnPlayerId]?.name}님의 차례를 기다리는 중...
      </div>
    );
  }

  if (pendingActivity === "duel") {
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
        <p className="text-sm text-purple-500 mb-1">아직 활동을 고르지 않은 한 명을 지목하세요</p>
        <p className="text-xs text-purple-400 mb-2">지목당한 친구는 이번 달 자율활동으로 주문 대결을 하게 돼요.</p>
        <div className="flex flex-col gap-2">
          {duelTargets.map((id) => (
            <button
              key={id}
              className="rounded-xl border border-purple-200 min-h-12 px-3 py-3 text-purple-700 bg-purple-50 active:scale-95 transition-transform"
              onClick={() => onSelect("duel", id, focus && staminaTokens > 0)}
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
      <p className="text-sm text-purple-500 mb-1">3주차(자율활동): 구역을 선택하세요</p>
      <p className="text-xs text-purple-400 mb-2">💖 매력 순서: {orderText}</p>
      {staminaTokens > 0 && (
        <label className="flex items-center gap-2 min-h-11 mb-2 rounded-xl bg-green-50 px-3 text-sm text-green-800">
          <input type="checkbox" className="h-5 w-5" checked={focus} onChange={(e) => setFocus(e.target.checked)} />
          <span>💪 체력토큰 1개로 집중하기 (활동 효과 +1)</span>
        </label>
      )}
      <div className="grid grid-cols-1 gap-2">
        {ACTIVITY_IDS.map((activityId) => {
          const occupant = game.activitySlots[activityId];
          const label = ACTIVITY_LABEL[activityId];
          if (occupant) {
            return (
              <div key={activityId} className="rounded-xl border border-gray-200 min-h-12 px-3 py-3 text-gray-500 bg-gray-100">
                {label} — {game.players[occupant].name}
              {activityId === "duel" && game.duelTargetId ? ` vs ${game.players[game.duelTargetId].name}` : ""} 선택됨
              </div>
            );
          }
          const noTarget = activityId === "duel" && duelTargets.length === 0;
          return (
            <button
              key={activityId}
              disabled={noTarget}
              className="rounded-xl border border-purple-300 min-h-12 px-3 py-3 text-purple-700 bg-white active:bg-purple-100 active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
              onClick={() => (activityId === "duel" ? setPendingActivity("duel") : onSelect(activityId, undefined, focus && staminaTokens > 0))}
            >
              {label}
              <span className="block text-xs text-purple-400">
                {noTarget ? "지목할 수 있는 친구가 없어요" : ACTIVITY_HINT[activityId]}
              </span>
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

type TabId = "game" | "players" | "news" | "rules";

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "game", icon: "🎮", label: "게임" },
  { id: "players", icon: "👥", label: "친구들" },
  { id: "news", icon: "📜", label: "소식" },
  { id: "rules", icon: "📖", label: "규칙" },
];

export function GameBoard({
  game,
  myId,
  onSubmitClassChoice,
  onSelectActivity,
  onChooseLabCard,
}: {
  game: GameState;
  myId: string;
  onSubmitClassChoice: (keepCardIds: string[]) => void;
  onSelectActivity: (activityId: ActivityId, targetPlayerId?: string, useStamina?: boolean) => void;
  onChooseLabCard: (cardId: string) => void;
}) {
  const [tab, setTab] = useState<TabId>("game");
  const latestExam = game.examResults[game.examResults.length - 1];
  const me = game.players[myId];
  const activityTurnId = game.pendingLab?.playerId ?? game.activityOrder[game.activityTurnPointer];
  // 내가 행동해야 하는 순간에는 게임 탭에 알림 점을 띄운다
  const myTurn =
    (game.phase === "class" && !me.hasActedThisPhase) || (game.phase === "activity" && activityTurnId === myId);
  const phaseText =
    game.phase === "class" ? "2주차 정규수업" : game.phase === "activity" ? "3주차 자율활동" : "게임 종료";

  const selectTab = (id: TabId) => {
    setTab(id);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto">
      <header className="sticky top-0 z-40 border-b-2 border-purple-100 bg-purple-50/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg text-purple-700 whitespace-nowrap">🏫 {game.round}/12개월</h1>
          <p className={`truncate rounded-full px-3 py-1 text-sm ${myTurn ? "bg-pink-200 text-pink-800" : "bg-purple-100 text-purple-600"}`}>
            {myTurn ? "✋ 내 차례 · " : ""}
            {phaseText}
          </p>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-purple-100 overflow-hidden" aria-hidden>
          <div className="h-full bg-pink-300 transition-all" style={{ width: `${(game.round / 12) * 100}%` }} />
        </div>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="내 능력치">
          <Chip icon="🧠" label="지력" value={effectiveStat(me, "intelligence")} className="bg-sky-100 text-sky-800" />
          <Chip icon="💪" label="체력" value={effectiveStat(me, "stamina")} className="bg-green-100 text-green-800" />
          <Chip icon="💖" label="매력" value={effectiveStat(me, "charm")} className="bg-pink-100 text-pink-800" />
          <Chip icon="✨" label="주문력" value={effectiveStat(me, "spellPower")} className="bg-purple-100 text-purple-800" />
          <Chip icon="🎓" label="학점" value={me.credit} className="bg-amber-100 text-amber-800" />
          <Chip icon="🔋" label="체력토큰" value={me.staminaTokens} className="bg-green-50 text-green-700" />
          <Chip icon="📖" label="주문서" value={me.spellbookTokens} className="bg-indigo-50 text-indigo-700" />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 flex flex-col gap-4">
        {tab === "game" && (
          <>
            {game.phase === "class" && <ClassPhasePanel game={game} myId={myId} onSubmit={onSubmitClassChoice} />}
            {game.phase === "activity" && (
              <ActivityPhasePanel game={game} myId={myId} onSelect={onSelectActivity} onChooseLabCard={onChooseLabCard} />
            )}
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

            {game.log.length > 0 && (
              <button
                className="text-left rounded-3xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 active:scale-95 transition-transform"
                onClick={() => selectTab("news")}
              >
                <span className="font-display text-amber-700">📜 방금 소식</span>
                <span className="block truncate">{game.log[game.log.length - 1].message}</span>
              </button>
            )}
          </>
        )}

        {tab === "players" && (
          <div className="flex flex-col gap-2">
            {game.turnOrder.map((id) => (
              <PlayerStatCard key={id} player={game.players[id]} isMe={id === myId} />
            ))}
          </div>
        )}

        {tab === "news" && (
          <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-display text-base text-amber-700 mb-1">📜 최근 소식</p>
            {game.log.length === 0 && <p className="text-amber-700">아직 소식이 없어요</p>}
            <ul className="flex flex-col gap-1.5">
              {game.log
                .slice(-30)
                .reverse()
                .map((entry, i) => (
                  <li key={game.log.length - i}>{entry.message}</li>
                ))}
            </ul>
          </div>
        )}

        {tab === "rules" && <RulesGuide />}
      </main>

      <nav
        className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t-2 border-purple-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        aria-label="메뉴"
      >
        <ul className="grid grid-cols-4">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                className={`relative flex min-h-14 w-full flex-col items-center justify-center text-xs active:scale-95 transition-transform ${
                  tab === t.id ? "text-purple-700" : "text-purple-400"
                }`}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => selectTab(t.id)}
              >
                <span className={`text-xl leading-none rounded-full px-4 py-0.5 ${tab === t.id ? "bg-purple-100" : ""}`} aria-hidden>
                  {t.icon}
                </span>
                {t.label}
                {t.id === "game" && myTurn && tab !== "game" && (
                  <span className="absolute right-[28%] top-1.5 h-2.5 w-2.5 rounded-full bg-pink-400" aria-label="내 차례" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
