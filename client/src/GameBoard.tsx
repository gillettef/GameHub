import { useEffect, useState, type CSSProperties } from "react";
import { Icon, InlineIcon, type IconName } from "./Icons";
import {
  ACTIVITY_HINT,
  ACTIVITY_LABEL,
  activityOpenCost,
  describeExam,
  canPay,
  charmRate,
  ELEMENT_ICON,
  ELEMENT_LABEL,
  STAT_LABEL,
  activityBlockReason,
  activityExtraCost,
  describeAbility,
  duelTargets,
  effectiveStat,
  type ActivityId,
  type CreatureElement,
  type GameState,
  type OfferCardView,
  type PlayerGameState,
} from "./gameTypes";
import { RulesGuide } from "./Rules";
import { AnnouncementLayer } from "./Announcements";

const ACTIVITY_IDS: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];

const MEDAL_COLOR = ["text-amber-500", "text-slate-400", "text-orange-500"];

function Chip({ icon, label, value, className, showLabel }: { icon: IconName; label: string; value: string | number; className: string; showLabel?: boolean }) {
  return (
    <span role="img" className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm whitespace-nowrap ${className}`} aria-label={`${label} ${value}`}>
      <Icon name={icon} className="h-4 w-4" />
      {showLabel && <span className="text-xs">{label}</span>}
      {value}
    </span>
  );
}

// 굴려서 나온 주사위 눈 하나
function DiceFace({ value, delay = 0 }: { value: number; delay?: number }) {
  return (
    <span
      className="dice-pop inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-pink-300 bg-white font-display text-xl text-pink-600 shadow-sm"
      style={{ "--d": `${delay.toFixed(2)}s` } as CSSProperties}
      aria-label={`주사위 ${value}`}
    >
      {value}
    </span>
  );
}

function PlayerStatCard({ player, isMe }: { player: PlayerGameState; isMe: boolean }) {
  const body = (
    <>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        <Chip icon="bulb" label="지력" value={effectiveStat(player, "intelligence")} className="bg-sky-100 text-sky-800" />
        <Chip icon="bolt" label="체력" value={effectiveStat(player, "stamina")} className="bg-green-100 text-green-800" />
        <Chip icon="heart" label="매력" value={effectiveStat(player, "charm")} className="bg-pink-100 text-pink-800" />
        <Chip icon="sparkle" label="주문력" value={effectiveStat(player, "spellPower")} className="bg-purple-100 text-purple-800" />
        <Chip icon="cap" label="학점" value={player.credit} className="bg-amber-100 text-amber-800" />
      </div>
      <p className="text-sm text-purple-700 leading-7">
        <InlineIcon name="trophy" /> 토너먼트 {player.tournamentTrack}칸 · <InlineIcon name="intToken" /> 지력토큰 {player.intelligenceTokens} · <InlineIcon name="staminaToken" /> 체력토큰 {player.staminaTokens} · <InlineIcon name="charmToken" /> 매력토큰 {player.charmTokens} · <InlineIcon name="spellbookToken" /> 주문서 {player.spellbookTokens} · <InlineIcon name="book" /> 수업 {player.classCards.length}장
      </p>
      {player.peekedExploration && (
        <div className="mt-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-sm text-indigo-800">
          <p>
            <InlineIcon name="crystal" /> 엿본 탐험 카드: <b>{player.peekedExploration.name}</b>
          </p>
          <p className="text-xs text-indigo-600">{player.peekedExploration.description}</p>
          {player.peekedExploration.checkText && <p className="text-xs"><InlineIcon name="dice" /> {player.peekedExploration.checkText}</p>}
          <p className="text-xs"><InlineIcon name="check" /> 성공: {player.peekedExploration.successText}</p>
          <p className="text-xs"><InlineIcon name="warn" /> 실패: {player.peekedExploration.failureText}</p>
        </div>
      )}
      {player.equipment.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {player.equipment.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white/70 px-2.5 py-1.5 text-sm text-purple-800">
              <InlineIcon name="flask" /> <b>{c.name}</b>
              <span className="block text-xs text-purple-600">{c.summary}</span>
            </li>
          ))}
        </ul>
      )}
      {player.grimoires.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {player.grimoires.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white/70 px-2.5 py-1.5 text-sm text-purple-800">
              <InlineIcon name="grimoire" /> <b>{c.name}</b>
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
          유형 모으기:{" "}
          {(["sky", "land", "ocean"] as CreatureElement[]).map((el) => (
            <span key={el} className="mr-2 whitespace-nowrap">
              <InlineIcon name={ELEMENT_ICON[el]} /> {ELEMENT_LABEL[el]} {player.creatures.filter((c) => c.element === el).length}
            </span>
          ))}
        </p>
      )}
      {player.creatures.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1">
          {player.creatures.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white/70 px-2.5 py-1.5 text-sm text-purple-800">
              <InlineIcon name={ELEMENT_ICON[c.element]} /> <b>{c.name}</b>
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
          <InlineIcon name="cap" /> {player.credit} · <InlineIcon name="sparkle" /> {effectiveStat(player, "spellPower")}
        </span>
      </summary>
      <div className="px-3 pb-3">{body}</div>
    </details>
  );
}

function ClassPhasePanel({ game, myId, onTake }: { game: GameState; myId: string; onTake: (cardId: string | null) => void }) {
  const me = game.players[myId];
  const currentId = game.classPickOrder[game.classPickPointer];
  const isMyTurn = currentId === myId;
  const nameOf = (id: string) => game.players[id].name;

  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
      <p className="text-sm text-purple-500 mb-1">2주차(정규수업): 공개된 수업카드를 지력 순서대로 1장씩 가져가요</p>
      <p className="text-xs text-purple-500 mb-2">
        <InlineIcon name="staminaToken" /> 체력토큰 {me.staminaTokens}개 · <InlineIcon name="charmToken" /> 매력토큰 {me.charmTokens}개 (매력토큰 {charmRate(game, me)}개 = 체력토큰 1개)
      </p>
      <ol className="mb-3 flex flex-wrap gap-1.5 text-xs" aria-label="지력 순서">
        {game.classPickOrder.map((id, index) => {
          const done = index < game.classPickPointer;
          const now = index === game.classPickPointer;
          return (
            <li
              key={id}
              className={`rounded-full px-2.5 py-1 ${
                now ? "bg-pink-200 text-pink-800 ring-2 ring-pink-300" : done ? "bg-gray-100 text-gray-500 line-through" : "bg-purple-50 text-purple-600"
              }`}
            >
              {index + 1}. {nameOf(id)}
              {id === myId ? " (나)" : ""}
            </li>
          );
        })}
      </ol>
      <p className={`mb-3 rounded-2xl px-3 py-2 text-sm ${isMyTurn ? "bg-pink-50 text-pink-700" : "bg-purple-50 text-purple-600"}`}>
        {isMyTurn ? "내 차례예요! 원하는 카드를 1장 가져가세요" : `${nameOf(currentId)}님이 카드를 고르는 중이에요...`}
      </p>

      {game.classMarket.length === 0 ? (
        <p className="mb-3 rounded-2xl bg-purple-50 px-3 py-3 text-center text-sm text-purple-600">공개된 카드가 없어요</p>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {game.classMarket.map((card) => {
            const affordable = canPay(game, me, 0, card.takeCost);
            return (
              <div
                key={card.id}
                className={`rounded-xl border-2 px-3 py-3 text-sm ${card.statBoost.amount >= 2 ? "bg-amber-50 border-amber-300" : "bg-purple-50 border-purple-200"} text-purple-700`}
              >
                <b>{card.name}</b> (+{card.statBoost.amount} {STAT_LABEL[card.statBoost.stat]})
                <span className="block text-xs opacity-80">{card.description}</span>
                <span className="block text-xs opacity-80">
                  <InlineIcon name="staminaToken" /> 습득 체력토큰 {card.takeCost}개
                </span>
                {isMyTurn && (
                  <button
                    disabled={!affordable}
                    onClick={() => onTake(card.id)}
                    className="mt-2 w-full min-h-11 rounded-xl bg-purple-500 text-white font-semibold py-2 active:scale-95 transition-transform disabled:bg-gray-200 disabled:text-gray-600 disabled:active:scale-100"
                  >
                    {affordable ? "가져가기" : "체력토큰이 부족해요"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isMyTurn && (
        <button className="w-full min-h-12 rounded-xl border-2 border-purple-200 text-purple-600 py-3 active:scale-95 transition-transform" onClick={() => onTake(null)}>
          가져가지 않고 넘어가기
        </button>
      )}
      <p className="mt-3 text-xs text-purple-500">
        남은 카드는 사라져요. 지력토큰은 3주차 구역에서 카드를 열 때 써요. (덱에 남은 카드 {game.classLeft}장)
      </p>
    </div>
  );
}

// 다음 시험의 시험 카드 안내: 공개 전에는 언제 공개되는지, 공개 후에는 어떤 능력치로 점수를 내는지 보여 준다
function ExamInfoPanel({ game }: { game: GameState }) {
  if (game.phase === "ended") return null;
  const { midtermRound, midtermRevealRound, finalRevealRound } = game.rules;
  const isMidterm = game.round <= midtermRound && game.examResults.length === 0;
  const card = isMidterm ? game.exams.midterm : game.exams.final;
  const name = isMidterm ? "중간고사" : "기말고사";
  const examRound = isMidterm ? midtermRound : 12;
  const revealRound = isMidterm ? midtermRevealRound : finalRevealRound;
  return (
    <div className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-3 text-sm text-sky-800">
      <p className="font-display text-base text-sky-700 mb-0.5">
        <InlineIcon name="note" /> 다음 시험: {name} ({examRound}개월 끝)
      </p>
      {card ? (
        <>
          <p><b>{card.name}</b> — {describeExam(card)}</p>
          <p className="text-xs text-sky-600">{card.description}</p>
        </>
      ) : (
        <p className="text-xs text-sky-600">시험 과목은 {revealRound}개월이 끝나면 공개돼요. 그때까지는 고르게 키워 두면 안전해요.</p>
      )}
    </div>
  );
}

// 구역에 공개된 카드 중 하나를 고르는 패널 (마법생물·연구 카드·비밀의 방 카드·주문 대결 마도서 공통)
function PickPanel({ game, myId, onPick }: { game: GameState; myId: string; onPick: (cardId: string | null) => void }) {
  const pick = game.pendingPick;
  const me = game.players[myId];
  if (!pick) return null;
  const cards = game.activityOffers[pick.activityId]?.cards ?? [];
  const canSkip = pick.mode === "take" && (pick.activityId === "creature" || pick.activityId === "lab");
  const title =
    pick.mode === "reward" ? "주문 대결에서 이겼어요! 마도서를 1장 고르세요" : `${ACTIVITY_LABEL[pick.activityId]}: 공개된 카드 중 1장을 고르세요`;
  const affordable = (card: OfferCardView): boolean => {
    if (!card.cost) return true;
    if (card.cost.kind === "stamina") return canPay(game, me, 0, card.cost.amount);
    return me.spellbookTokens >= Math.max(1, card.cost.amount - pick.boost);
  };
  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
      <p className="text-sm text-purple-600 mb-1">{title}</p>
      <p className="text-xs text-purple-500 mb-2">
        {pick.activityId === "exploration" || pick.mode === "reward"
          ? "고르지 않은 카드는 다음에 이 구역을 쓰는 친구의 몫이에요."
          : "고르고 남은 카드는 다음에 이 구역에 들어오는 친구가 가져가요."}
        {canSkip && " 살 수 있는 카드가 없거나 원하지 않으면 넘어가도 돼요."}{" "}
        (<InlineIcon name="staminaToken" /> 내 체력토큰 {me.staminaTokens}개 · <InlineIcon name="spellbookToken" /> 주문서 {me.spellbookTokens}개 · <InlineIcon name="charmToken" /> 매력토큰 {me.charmTokens}개)
      </p>
      <div className="flex flex-col gap-2">
        {cards.map((card) => {
          const ok = affordable(card);
          return (
            <button
              key={card.id}
              disabled={!ok}
              onClick={() => onPick(card.id)}
              className="rounded-xl border-2 border-purple-200 bg-purple-50 min-h-12 px-3 py-3 text-left text-purple-800 active:scale-95 transition-transform disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-600 disabled:active:scale-100"
            >
              <b>{card.name}</b>
              <span className="block text-xs text-purple-500">{card.description}</span>
              {card.lines.map((line) => (
                <span key={line} className="block text-sm">{line}</span>
              ))}
              {card.cost && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                  <InlineIcon name={card.cost.kind === "stamina" ? "staminaToken" : "spellbookToken"} />
                  {card.cost.kind === "stamina" ? `체력토큰 ${card.cost.amount}개` : `주문서 ${Math.max(1, card.cost.amount - pick.boost)}개`}
                  {!ok && " · 부족해요"}
                </span>
              )}
            </button>
          );
        })}
        {canSkip && (
          <button className="mt-1 min-h-11 w-full rounded-xl text-sm text-purple-600 active:scale-95 transition-transform" onClick={() => onPick(null)}>
            아무것도 가져가지 않고 넘어가기
          </button>
        )}
      </div>
    </div>
  );
}

// 함께할 친구를 기다리는 협력 탐험 카드 안내 (모두에게 공개)
function CoopNotice({ game, myId }: { game: GameState; myId: string }) {
  const coop = game.coopWaiting;
  if (!coop) return null;
  const owner = game.players[coop.playerId]?.name ?? "";
  return (
    <div className="mb-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
      <p>
        <InlineIcon name="users" /> <b>협력 카드 &quot;{coop.name}&quot;</b>
        <span className="text-xs text-indigo-700"> — {coop.playerId === myId ? "내가" : `${owner}님이`} 발견했어요</span>
      </p>
      {coop.playerId !== myId ? (
        <p className="mt-1 rounded-xl bg-white/70 px-2 py-1 text-sm font-semibold">비밀의 방 탐색을 고르면 함께할 수 있어요! 보상은 둘 다 받아요</p>
      ) : (
        <p className="mt-1 rounded-xl bg-white/70 px-2 py-1 text-sm">함께할 친구를 기다리는 중이에요</p>
      )}
      <details className="mt-1">
        <summary className="min-h-9 cursor-pointer py-1 text-xs text-indigo-700">자세히 보기</summary>
        <p className="text-xs text-indigo-700">{coop.description}</p>
        <p className="text-xs"><InlineIcon name="dice" /> {coop.pairText}</p>
        <p className="text-xs"><InlineIcon name="check" /> 성공: {coop.successText}</p>
        <p className="text-xs"><InlineIcon name="warn" /> 실패: {coop.failureText}</p>
        <p className="text-xs text-indigo-700">{coop.voidText}</p>
      </details>
    </div>
  );
}

// 구역에 공개된 (아직 가져가지 않은) 카드 이름들
function offerNames(game: GameState, activityId: ActivityId): string {
  return (game.activityOffers[activityId]?.cards ?? []).map((c) => c.name).join(", ");
}

function ActivityPhasePanel({
  game,
  myId,
  onSelect,
  onPick,
}: {
  game: GameState;
  myId: string;
  onSelect: (activityId: ActivityId, targetPlayerId?: string, useStamina?: boolean) => void;
  onPick: (cardId: string | null) => void;
}) {
  const currentTurnPlayerId = game.pendingPick?.playerId ?? game.activityOrder[game.activityTurnPointer];
  const isMyTurn = currentTurnPlayerId === myId;
  const targets = duelTargets(game, myId);
  const [pendingActivity, setPendingActivity] = useState<ActivityId | null>(null);
  const [focus, setFocus] = useState(false);
  const staminaTokens = game.players[myId]?.staminaTokens ?? 0;
  const meNow = game.players[myId];
  const orderText = game.activityOrder.map((id) => game.players[id].name).join(" → ");
  const namesOf = (ids: string[]) => ids.map((id) => game.players[id].name).join(" · ");
  const fee = game.rules.duelCharmFee;

  if (isMyTurn && game.pendingPick) {
    return <PickPanel game={game} myId={myId} onPick={onPick} />;
  }

  if (!isMyTurn) {
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
        <CoopNotice game={game} myId={myId} />
        <p className="text-center text-purple-500">
          {game.pendingPick
            ? `${game.players[currentTurnPlayerId]?.name}님이 ${ACTIVITY_LABEL[game.pendingPick.activityId]}의 카드를 고르는 중...`
            : `${game.players[currentTurnPlayerId]?.name}님의 차례를 기다리는 중...`}
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-xs text-purple-500">
          {ACTIVITY_IDS.filter((a) => game.activitySlots[a].length > 0).map((a) => (
            <li key={a} className="rounded-xl bg-purple-50 px-3 py-1.5">
              {ACTIVITY_LABEL[a]} — {namesOf(game.activitySlots[a])}
              {offerNames(game, a) && <span className="block text-purple-600">남은 카드: {offerNames(game, a)}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (pendingActivity === "duel") {
    const extra = activityExtraCost(game, "duel");
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
        <p className="text-sm text-purple-600 mb-1">아직 활동을 고르지 않은 한 명을 지목하세요</p>
        <p className="text-xs text-purple-500 mb-2">
          지목당한 친구는 이번 달 자율활동으로 주문 대결을 하게 돼요. 결과와 상관없이 지목한 친구에게 <InlineIcon name="heart" /> 매력 {fee}을 건네요.
        </p>
        <div className="flex flex-col gap-2">
          {targets.map((id) => (
            <button
              key={id}
              className="rounded-xl border border-purple-200 min-h-12 px-3 py-3 text-purple-700 bg-purple-50 active:scale-95 transition-transform"
              onClick={() => onSelect("duel", id, focus && canPay(game, meNow, activityOpenCost(game, "duel"), 1, extra))}
            >
              {game.players[id].name}
            </button>
          ))}
          <button className="mt-2 text-sm text-purple-600 min-h-11 w-full" onClick={() => setPendingActivity(null)}>
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
      <p className="text-sm text-purple-600 mb-1">3주차(자율활동): 구역을 선택하세요</p>
      <p className="text-xs text-purple-500 mb-1"><InlineIcon name="heart" /> 매력 순서: {orderText}</p>
      <p className="text-xs text-purple-500 mb-2">
        카드를 여는 구역(마법생물·비밀의 방·주문 대결·연구실)은 처음 들어오면 카드 2장이 공개돼요 (<InlineIcon name="intToken" /> 지력토큰 {game.rules.openCardCost}개). 먼저 온 친구가 원하는 카드를 가져가고, 남은 카드는 두 번째 참가자가 가져가요.
      </p>
      <p className="text-xs text-purple-500 mb-2">
        구역당 최대 {game.rules.activityMaxParticipants}명 · 먼저 온 친구가 있으면 <InlineIcon name="staminaToken" /> 체력토큰 {game.rules.activitySecondParticipantCost}개 추가 (<InlineIcon name="charmToken" /> 매력토큰 {game.rules.activitySecondParticipantCost}개로 대신 가능)
      </p>
      <CoopNotice game={game} myId={myId} />
      {(staminaTokens > 0 || (meNow && meNow.charmTokens >= charmRate(game, meNow))) && (
        <label className="flex items-center gap-2 min-h-11 mb-2 rounded-xl bg-green-50 px-3 text-sm text-green-800">
          <input type="checkbox" className="h-5 w-5" checked={focus} onChange={(e) => setFocus(e.target.checked)} />
          <span><InlineIcon name="staminaToken" /> 체력토큰 1개로 집중하기 (활동 효과 +1)</span>
        </label>
      )}
      <div className="grid grid-cols-1 gap-2">
        {ACTIVITY_IDS.map((activityId) => {
          const label = ACTIVITY_LABEL[activityId];
          const occupants = game.activitySlots[activityId];
          const reason = activityBlockReason(game, myId, activityId);
          const extra = activityExtraCost(game, activityId);
          const openCost = activityOpenCost(game, activityId);
          // 이미 이 구역에 들어간 친구들 (주문 대결은 누구를 지목했는지도 함께)
          const who = occupants
            .map((id) => {
              const duel = activityId === "duel" ? game.duels.find((d) => d.challengerId === id) : undefined;
              return `${game.players[id].name}${duel ? ` → ${game.players[duel.targetId].name}` : ""}`;
            })
            .join(" · ");
          if (reason) {
            return (
              <div key={activityId} aria-disabled="true" className="rounded-xl border border-gray-200 min-h-12 px-3 py-3 text-gray-600 bg-gray-100">
                {label}
                <span className="block text-xs">
                  {who && `${who} 참여 중 · `}
                  {reason}
                </span>
              </div>
            );
          }
          return (
            <button
              key={activityId}
              className="rounded-xl border border-purple-300 min-h-12 px-3 py-3 text-purple-700 bg-white active:bg-purple-100 active:scale-95 transition-transform"
              onClick={() =>
                activityId === "duel" ? setPendingActivity("duel") : onSelect(activityId, undefined, focus && canPay(game, meNow, activityOpenCost(game, activityId), 1, extra))
              }
            >
              {label}
              {activityId === "exploration" && game.coopWaiting && (
                <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">함께해요!</span>
              )}
              <span className="block text-xs text-purple-600">
                {activityId === "duel" ? `아직 안 고른 한 명을 지목 · 매력 ${fee}을 건네요 (집중: +1)` : ACTIVITY_HINT[activityId]}
              </span>
              {(who || extra > 0 || openCost > 0 || offerNames(game, activityId)) && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {who && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{who} 참여 중</span>}
                  {extra > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">체력토큰 +{extra} (또는 매력토큰 {extra}개)</span>}
                  {openCost > 0 && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                      지력토큰 {openCost}개 (카드 공개)
                    </span>
                  )}
                  {offerNames(game, activityId) && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">남은 카드: {offerNames(game, activityId)}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 주사위 굴리기 (주문 대결·탐험 판정·시험): 굴려야 하는 사람이 버튼을 누르면 서버가 굴려서 결과를 알려 준다
function RollPanel({ game, myId, onRoll }: { game: GameState; myId: string; onRoll: () => void }) {
  const pending = game.pendingRoll;
  const [clickedFor, setClickedFor] = useState<string | null>(null);
  // 버튼을 누른 뒤 응답이 없어도 잠시 뒤 다시 누를 수 있게 풀어 준다
  useEffect(() => {
    if (!clickedFor) return;
    const timer = setTimeout(() => setClickedFor(null), 4000);
    return () => clearTimeout(timer);
  }, [clickedFor]);
  if (!pending) return null;

  const mine = pending.entries.find((e) => e.playerId === myId);
  const canRoll = !!mine && mine.dice === null;
  const clicked = clickedFor === pending.title;
  const waiting = pending.entries.filter((e) => e.dice === null && e.playerId !== myId);

  return (
    <div className="pop-in bg-white rounded-3xl border-2 border-pink-300 shadow-sm p-4">
      <p className="font-display text-lg text-purple-700 text-center">
        <InlineIcon name="dice" /> {pending.title}
      </p>
      {pending.lines.map((line) => (
        <p key={line} className="mt-1 text-center text-sm text-purple-500">
          {line}
        </p>
      ))}

      <ul className="mt-3 flex flex-col gap-2">
        {pending.entries.map((entry) => (
          <li key={entry.playerId} className={`rounded-2xl px-3 py-2 ${entry.playerId === myId ? "bg-pink-50 ring-2 ring-pink-200" : "bg-purple-50"}`}>
            <p className="truncate text-sm text-purple-700">
              {entry.label}
              {entry.playerId === myId ? " (나)" : ""}
            </p>
            {entry.dice === null ? (
              <p className="text-xs text-purple-400">아직 안 굴렸어요 (주사위 {entry.diceCount}개)</p>
            ) : entry.dice.length === 0 ? (
              <p className="text-xs text-purple-400">굴릴 주사위가 없어요</p>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {entry.dice.map((d, i) => (
                  <DiceFace key={i} value={d} delay={i * 0.06} />
                ))}
                {entry.dice.length > 1 && <b className="ml-1 text-purple-700">합계 {entry.dice.reduce((a, b) => a + b, 0)}</b>}
              </div>
            )}
          </li>
        ))}
      </ul>

      {canRoll && mine ? (
        <button
          disabled={clicked}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pink-500 py-3 text-lg font-semibold text-white active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
          onClick={() => {
            setClickedFor(pending.title);
            onRoll();
          }}
        >
          <span className={clicked ? "dice-wiggle inline-flex" : "inline-flex"}>
            <Icon name="dice" className="h-6 w-6" />
          </span>
          {clicked ? "굴리는 중..." : mine.diceCount > 1 ? `주사위 ${mine.diceCount}개 굴리기` : "주사위 굴리기"}
        </button>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm text-purple-600" aria-live="polite">
          <span className="dice-wiggle inline-flex text-pink-400">
            <Icon name="dice" className="h-5 w-5" />
          </span>
          {waiting.length > 0 ? `${waiting.map((e) => e.label.replace(/ \(.*\)$/, "")).join(", ")}님이 굴리기를 기다리는 중...` : "결과를 계산하는 중..."}
        </p>
      )}
    </div>
  );
}

function ErrorToast({ message, seq }: { message: string | null; seq: number }) {
  const [dismissedSeq, setDismissedSeq] = useState(0);
  useEffect(() => {
    if (seq === 0) return;
    const timer = setTimeout(() => setDismissedSeq(seq), 4500);
    return () => clearTimeout(timer);
  }, [seq]);
  if (!message || seq === 0 || dismissedSeq === seq) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4" role="alert">
      <p className="pop-in max-w-sm rounded-2xl border-2 border-pink-200 bg-white px-4 py-2 text-sm text-pink-600 shadow-lg">{message}</p>
    </div>
  );
}

function EndedPanel({ game }: { game: GameState }) {
  const winnerIds = game.winnerIds ?? [];
  const ranked = [...game.turnOrder]
    .map((id) => game.players[id])
    .sort((a, b) => b.spellPower * b.credit - a.spellPower * a.credit);

  return (
    <div className="pop-in bg-white rounded-3xl border-2 border-amber-200 p-4 shadow-sm">
      <p className="font-display text-xl text-purple-700 mb-3 text-center">
        <InlineIcon name="sparkle" /> {winnerIds.map((id) => game.players[id].name).join(", ")} 승리! <InlineIcon name="sparkle" />
      </p>
      <ol className="flex flex-col gap-2">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className={`rounded-2xl px-3 py-2 ${winnerIds.includes(p.id) ? "bg-amber-100" : "bg-purple-50"}`}
          >
            <p className="font-display text-purple-800 truncate">
              {i < 3 ? <Icon name="medal" className={`h-5 w-5 ${MEDAL_COLOR[i]}`} /> : `${i + 1}위`} {p.name}
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

// 마법 토너먼트 순위 화면: 트랙에는 상한이 없고, 기말고사가 끝났을 때 1위·2위가 학점 보상을 받는다
function TournamentPanel({ game, myId }: { game: GameState; myId: string }) {
  const rewards = game.rules.tournamentRewards;
  // 트랙 위치가 높은 순, 같으면 매력이 높은 순 (게임 규칙의 동점 처리). 트랙과 매력이 모두 같으면 공동 순위로 보여 준다
  const rows = game.turnOrder
    .map((id) => game.players[id])
    .sort((a, b) => b.tournamentTrack - a.tournamentTrack || effectiveStat(b, "charm") - effectiveStat(a, "charm"));
  const leader = rows[0]?.tournamentTrack ?? 0;
  const rankOf = (index: number) => {
    let rank = index;
    while (rank > 0 && rows[rank - 1].tournamentTrack === rows[index].tournamentTrack && effectiveStat(rows[rank - 1], "charm") === effectiveStat(rows[index], "charm")) rank -= 1;
    return rank + 1;
  };
  const scale = Math.max(leader, 10);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-display text-base text-amber-700 mb-1"><InlineIcon name="trophy" /> 마법 토너먼트</p>
        <p className="text-xs">토너먼트 참가를 고를 때마다 주문력만큼 트랙을 전진해요. 트랙에는 상한이 없어요!</p>
        <p className="text-xs">
          기말고사가 끝나면 1위 <b>학점 +{rewards[0]}</b>
          {rewards.length > 1 && <>, 2위 <b>학점 +{rewards[1]}</b></>}를 받아요. (0칸은 보상 없음 · 같은 칸이면 매력 → 주사위 순)
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {rows.map((p, index) => {
          const rank = rankOf(index);
          const reward = p.tournamentTrack > 0 && rank <= rewards.length ? rewards[rank - 1] : 0;
          const isMe = p.id === myId;
          return (
            <li key={p.id} className={`rounded-3xl border-2 px-3 py-2 shadow-sm ${isMe ? "border-pink-300 bg-pink-50" : "border-purple-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-display text-purple-800">
                  {rank <= 3 ? <Icon name="medal" className={`h-5 w-5 ${MEDAL_COLOR[rank - 1]}`} /> : `${rank}위`} {p.name}
                  {isMe && <span className="text-sm text-pink-500"> (나)</span>}
                </p>
                <p className="shrink-0 font-display text-lg text-purple-700">{p.tournamentTrack}칸</p>
              </div>
              <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-purple-100" role="img" aria-label={`${p.name} 트랙 ${p.tournamentTrack}칸`}>
                <div className="h-full rounded-full bg-pink-400 transition-all" style={{ width: `${(p.tournamentTrack / scale) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-purple-600">
                {index === 0 || p.tournamentTrack === leader ? "선두예요!" : `선두와 ${leader - p.tournamentTrack}칸 차이`}
                {" · "}
                <InlineIcon name="sparkle" /> 주문력 {effectiveStat(p, "spellPower")} (한 번에 +{effectiveStat(p, "spellPower")}칸)
                {reward > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">지금 끝나면 학점 +{reward}</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type TabId = "game" | "tournament" | "players" | "news" | "rules";

const TABS: { id: TabId; icon: IconName; label: string }[] = [
  { id: "game", icon: "wand", label: "게임" },
  { id: "tournament", icon: "trophy", label: "토너먼트" },
  { id: "players", icon: "users", label: "친구들" },
  { id: "news", icon: "scroll", label: "소식" },
  { id: "rules", icon: "book", label: "규칙" },
];

export function GameBoard({
  game,
  myId,
  errorMessage,
  errorSeq,
  onTakeClassCard,
  onSelectActivity,
  onPickActivityCard,
  onRollDice,
}: {
  game: GameState;
  myId: string;
  errorMessage: string | null;
  errorSeq: number;
  onTakeClassCard: (cardId: string | null) => void;
  onSelectActivity: (activityId: ActivityId, targetPlayerId?: string, useStamina?: boolean) => void;
  onPickActivityCard: (cardId: string | null) => void;
  onRollDice: () => void;
}) {
  const [tab, setTab] = useState<TabId>("game");
  const latestExam = game.examResults[game.examResults.length - 1];
  const me = game.players[myId];
  const activityTurnId = game.pendingPick?.playerId ?? game.activityOrder[game.activityTurnPointer];
  const myRollPending = !!game.pendingRoll?.entries.some((e) => e.playerId === myId && e.dice === null);
  // 내가 행동해야 하는 순간에는 게임 탭에 알림 점을 띄운다
  const myTurn =
    myRollPending ||
    (!game.pendingRoll &&
      ((game.phase === "class" && game.classPickOrder[game.classPickPointer] === myId) || (game.phase === "activity" && activityTurnId === myId)));
  const phaseText =
    game.phase === "class"
      ? "2주차 정규수업"
      : game.phase === "activity"
        ? "3주차 자율활동"
        : game.phase === "midterm_exam"
          ? "중간고사"
          : game.phase === "final_exam"
            ? "기말고사"
            : "게임 종료";

  const selectTab = (id: TabId) => {
    setTab(id);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto">
      <header className="sticky top-0 z-40 border-b-2 border-purple-100 bg-purple-50/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg text-purple-700 whitespace-nowrap"><Icon name="school" className="mr-1 h-5 w-5" />{game.round}/12개월</h1>
          <p className={`truncate rounded-full px-3 py-1 text-sm ${myTurn ? "bg-pink-200 text-pink-800" : "bg-purple-100 text-purple-600"}`}>
            {myTurn && <Icon name="bell" className="mr-1 h-4 w-4" />}
            {myTurn ? "내 차례 · " : ""}
            {phaseText}
          </p>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-purple-100 overflow-hidden" aria-hidden>
          <div className="h-full bg-pink-300 transition-all" style={{ width: `${(game.round / 12) * 100}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="내 능력치">
          <Chip icon="bulb" label="지력" value={effectiveStat(me, "intelligence")} className="bg-sky-100 text-sky-800" />
          <Chip icon="bolt" label="체력" value={effectiveStat(me, "stamina")} className="bg-green-100 text-green-800" />
          <Chip icon="heart" label="매력" value={effectiveStat(me, "charm")} className="bg-pink-100 text-pink-800" />
          <Chip icon="sparkle" label="주문력" value={effectiveStat(me, "spellPower")} className="bg-purple-100 text-purple-800" />
          <Chip icon="cap" label="학점" value={me.credit} className="bg-amber-100 text-amber-800" />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="내 토큰">
          <Chip icon="intToken" label="지력토큰" showLabel value={me.intelligenceTokens} className="bg-sky-50 text-sky-700 ring-1 ring-sky-200" />
          <Chip icon="staminaToken" label="체력토큰" showLabel value={me.staminaTokens} className="bg-green-50 text-green-700 ring-1 ring-green-200" />
          <Chip icon="charmToken" label="매력토큰" showLabel value={me.charmTokens} className="bg-pink-50 text-pink-700 ring-1 ring-pink-200" />
          <Chip icon="spellbookToken" label="주문서" showLabel value={me.spellbookTokens} className="bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 flex flex-col gap-4">
        {tab === "game" && (
          <>
            {game.pendingRoll ? (
              <RollPanel game={game} myId={myId} onRoll={onRollDice} />
            ) : (
              <>
                {game.phase === "class" && (
                  <ClassPhasePanel game={game} myId={myId} onTake={onTakeClassCard} />
                )}
                {game.phase === "activity" && (
                  <ActivityPhasePanel game={game} myId={myId} onSelect={onSelectActivity} onPick={onPickActivityCard} />
                )}
              </>
            )}
            {game.phase === "ended" && <EndedPanel game={game} />}

            <ExamInfoPanel game={game} />

            {latestExam && (
              <div className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-3 text-sm">
                <p className="font-display text-base text-sky-700 mb-1">
                  <InlineIcon name="note" /> {latestExam.round === 6 ? "중간고사" : "기말고사"} 결과 · {latestExam.card.name}
                </p>
                {latestExam.scores.map((s) => (
                  <p key={s.playerId} className="text-sky-800">
                    {s.rank}위 {game.players[s.playerId].name} — 점수 {s.score}
                    {(s.dice.length > 0 || s.bonus > 0) && (
                      <span className="text-xs text-sky-600"> ({s.dice.length > 0 ? `주사위 ${s.dice.join("+")}` : ""}{s.bonus > 0 ? ` 보너스 +${s.bonus}` : ""})</span>
                    )}, 학점 +{s.creditAwarded}
                  </p>
                ))}
              </div>
            )}

            {game.log.length > 0 && (
              <button
                className="text-left rounded-3xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 active:scale-95 transition-transform"
                onClick={() => selectTab("news")}
              >
                <span className="font-display text-amber-700"><InlineIcon name="scroll" /> 방금 소식</span>
                <span className="block truncate">{game.log[game.log.length - 1].message}</span>
              </button>
            )}
          </>
        )}

        {tab === "tournament" && <TournamentPanel game={game} myId={myId} />}

        {tab === "players" && (
          <div className="flex flex-col gap-2">
            {game.turnOrder.map((id) => (
              <PlayerStatCard key={id} player={game.players[id]} isMe={id === myId} />
            ))}
          </div>
        )}

        {tab === "news" && (
          <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-display text-base text-amber-700 mb-1"><InlineIcon name="scroll" /> 최근 소식</p>
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
        <ul className="grid grid-cols-5">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                className={`relative flex min-h-14 w-full flex-col items-center justify-center text-xs active:scale-95 transition-transform ${
                  tab === t.id ? "text-purple-700" : "text-purple-400"
                }`}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => selectTab(t.id)}
              >
                <span className={`rounded-full px-4 py-0.5 ${tab === t.id ? "bg-purple-100" : ""}`}>
                  <Icon name={t.icon} className="h-6 w-6" />
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

      <AnnouncementLayer game={game} myId={myId} />
      <ErrorToast message={errorMessage} seq={errorSeq} />
    </div>
  );
}
