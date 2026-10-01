import { useEffect, useState, type CSSProperties } from "react";
import { Icon, InlineIcon, type IconName } from "./Icons";
import {
  ACTIVITY_HINT,
  ACTIVITY_LABEL,
  activityOpenCost,
  describeExam,
  canPay,
  ELEMENT_ICON,
  ELEMENT_LABEL,
  KIND_LABEL,
  LAB_KIND_LABEL,
  STAT_LABEL,
  activityBlockReason,
  activityExtraCost,
  creatureSets,
  describeAbility,
  duelTargets,
  effectiveStat,
  type ActivityId,
  type ClassCard,
  type CreatureElement,
  type GameState,
  type KeepChoice,
  type OfferCardView,
  type PlayerGameState,
  type TokenStat,
} from "./gameTypes";
import { CardButton, CardGrid, PickGrid, type CardInfo } from "./CardArt";
import { RulesGuide } from "./Rules";
import { GameMenu } from "./Leave";
import { FinalReveal } from "./FinalReveal";
import { AwayBanner, SocialBar } from "./Social";
import type { Reaction, TurnTimer } from "./useGameSocket";
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
function DiceFace({ value, delay = 0, selected, onToggle }: { value: number; delay?: number; selected?: boolean; onToggle?: () => void }) {
  const cls = `dice-pop inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 font-display text-xl shadow-sm ${
    selected ? "border-purple-500 bg-purple-100 text-purple-700 ring-2 ring-purple-300" : "border-pink-300 bg-white text-pink-600"
  }`;
  const style = { "--d": `${delay.toFixed(2)}s` } as CSSProperties;
  // 다시 굴릴 주사위를 고를 수 있을 때는 누르면 선택/해제되는 버튼이 된다
  return onToggle ? (
    <button type="button" className={`${cls} active:scale-95 transition-transform`} style={style} aria-pressed={!!selected} aria-label={`주사위 ${value}${selected ? " (다시 굴리기 선택됨)" : ""}`} onClick={onToggle}>
      {value}
    </button>
  ) : (
    <span className={cls} style={style} aria-label={`주사위 ${value}`}>
      {value}
    </span>
  );
}

function PlayerStatCard({ player, isMe, rules }: { player: PlayerGameState; isMe: boolean; rules: GameState["rules"] }) {
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
        <InlineIcon name="trophy" /> 토너먼트 {player.tournamentTrack}칸 · <InlineIcon name="intToken" /> 지력토큰 {player.intelligenceTokens} · <InlineIcon name="staminaToken" /> 체력토큰 {player.staminaTokens} · <InlineIcon name="charmToken" /> 매력토큰 {player.charmTokens} · <InlineIcon name="manaToken" /> 마나토큰 {player.manaTokens} · <InlineIcon name="book" /> 수업 {player.classCards.length}장
      </p>
      {player.peekedExploration && (
        <div className="mt-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-sm text-indigo-800">
          <p className="mb-1.5">
            <InlineIcon name="crystal" /> 엿본 탐험 카드 <span className="text-xs text-indigo-600">(누르면 설명)</span>
          </p>
          <CardButton
            className="w-32"
            card={{
              name: player.peekedExploration.name,
              lines: [
                player.peekedExploration.description,
                ...(player.peekedExploration.checkText ? [<><InlineIcon name="dice" /> {player.peekedExploration.checkText}</>] : []),
                <><InlineIcon name="check" /> 성공: {player.peekedExploration.successText}</>,
                <><InlineIcon name="warn" /> 실패: {player.peekedExploration.failureText}</>,
              ],
            }}
          />
        </div>
      )}
      {ownedCardGroups(player).length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-purple-500">가진 카드 (누르면 크게 볼 수 있어요)</p>
          <div className="flex flex-col gap-2">
            {ownedCardGroups(player).map((g) => (
              <div key={g.key}>
                <p className="mb-1 text-xs font-semibold text-purple-600">
                  <InlineIcon name={g.icon} /> {g.label} {g.cards.length}장
                </p>
                <CardGrid cards={g.cards} />
              </div>
            ))}
          </div>
        </div>
      )}
      {player.creatures.length > 0 && (
        <p className="mt-2 text-xs text-purple-600">
          세트 모으기:{" "}
          {(["sky", "land", "ocean"] as CreatureElement[]).map((el) => (
            <span key={el} className="mr-2 whitespace-nowrap">
              <InlineIcon name={ELEMENT_ICON[el]} /> {ELEMENT_LABEL[el]} {player.creatures.filter((c) => c.element === el).length}
            </span>
          ))}
          <span className="whitespace-nowrap font-semibold text-amber-700">
            세트 {creatureSets(player.creatures)}개 (+{creatureSets(player.creatures) * rules.creatureSetScore}점)
          </span>
        </p>
      )}
    </>
  );

  // 내 카드와 친구 카드 모두 접고 펼 수 있다. 내 카드는 기본으로 펼쳐 두고, 접으면 한 줄 요약만 보인다
  return (
    <details open={isMe} className={isMe ? "rounded-3xl border-2 border-pink-300 bg-pink-50 shadow-sm" : "rounded-3xl border-2 border-purple-200 bg-white shadow-sm"}>
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3 py-2 font-display text-purple-700">
        <span className="truncate">
          {player.name}
          {isMe && <span className="text-sm text-pink-500"> (나)</span>}
        </span>
        <span className="shrink-0 text-sm text-purple-600">
          <InlineIcon name="cap" /> {player.credit} · <InlineIcon name="sparkle" /> {effectiveStat(player, "spellPower")}
        </span>
      </summary>
      <div className="px-3 pb-3">{body}</div>
    </details>
  );
}

function classCardInfo(card: ClassCard): CardInfo {
  return {
    name: card.name,
    badge: `+${card.statBoost.amount} ${STAT_LABEL[card.statBoost.stat]} · 체력토큰 ${card.takeCost}개`,
    rare: card.statBoost.amount >= 2,
    lines: [card.description, <><InlineIcon name="staminaToken" /> 습득 체력토큰 {card.takeCost}개</>],
  };
}

function offerCardInfo(card: OfferCardView): CardInfo {
  return {
    name: card.name,
    badge:
      [card.tags, card.cost ? (card.cost.kind === "stamina" ? `체력토큰 ${card.cost.amount}개` : `마나토큰 ${card.cost.amount}개`) : undefined].filter(Boolean).join(" · ") || undefined,
    lines: [card.description, ...card.lines],
  };
}

// 가진 카드를 어디서 얻었는지(2주차 정규수업 / 3주차 자율활동 구역)별로 묶는다
function ownedCardGroups(player: PlayerGameState): { key: string; icon: IconName; label: string; cards: CardInfo[] }[] {
  const groups = [
    { key: "class", icon: "book" as IconName, label: "정규수업 수업카드", cards: player.classCards.map(classCardInfo) },
    {
      key: "lab",
      icon: "flask" as IconName,
      label: "연구실 실험 연구카드",
      cards: player.equipment.map((c) => ({ name: c.name, badge: LAB_KIND_LABEL[c.kind], lines: [c.description, c.summary] })),
    },
    {
      key: "duel",
      icon: "swords" as IconName,
      label: "주문 대결 마도서",
      cards: player.grimoires.map((c) => ({
        name: c.name,
        badge: `${STAT_LABEL[c.statBoost.stat]} +${c.statBoost.amount}`,
        lines: [c.description, ...(c.ability ? [describeAbility(c.ability)] : [])],
      })),
    },
    {
      key: "creature",
      icon: "paw" as IconName,
      label: "마법생물 조련 마법생물",
      cards: player.creatures.map((c) => ({
        name: c.name,
        badge: `${ELEMENT_LABEL[c.element]} · ${KIND_LABEL[c.kind]} · 기준 ${c.trainTarget}`,
        lines: [c.description, describeAbility(c.ability)],
      })),
    },
  ];
  return groups.filter((g) => g.cards.length > 0);
}

function ClassPhasePanel({ game, myId, onTake }: { game: GameState; myId: string; onTake: (cardId: string | null) => void }) {
  const me = game.players[myId];
  const currentId = game.classPickOrder[game.classPickPointer];
  const isMyTurn = currentId === myId;
  const nameOf = (id: string) => game.players[id].name;

  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
      <p className="text-sm text-purple-500 mb-1">2주차(정규수업): 공개된 수업카드를 선부터 시계방향으로 1장씩 가져가요</p>
      <p className="text-xs text-purple-500 mb-2">
        <InlineIcon name="staminaToken" /> 체력토큰 {me.staminaTokens}개
      </p>
      <ol className="mb-3 flex flex-wrap gap-1.5 text-xs" aria-label="진행 순서">
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
              {index === 0 ? " · 선" : ""}
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
        <div className="mb-3">
          <p className="mb-2 text-xs text-purple-500">카드를 누르면 크게 볼 수 있어요</p>
          <PickGrid
            items={game.classMarket.map((card) => {
              const affordable = canPay(me, 0, card.takeCost);
              return {
                key: card.id,
                card: classCardInfo(card),
                onAction: isMyTurn ? () => onTake(card.id) : undefined,
                actionLabel: affordable ? "가져가기" : "체력토큰이 부족해요",
                disabled: !affordable,
              };
            })}
          />
        </div>
      )}

      {isMyTurn && (
        <button className="w-full min-h-12 rounded-xl border-2 border-purple-200 text-purple-600 py-3 active:scale-95 transition-transform" onClick={() => onTake(null)}>
          가져가지 않고 넘어가기
        </button>
      )}
      <p className="mt-3 text-xs text-purple-500">
        남은 카드는 사라져요. (덱에 남은 카드 {game.classLeft}장)
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
        <InlineIcon name="note" /> 다음 시험: {name} ({examRound}개월 2~3주차 대신)
      </p>
      {card ? (
        <div className="mt-1.5 flex items-center gap-3">
          <CardButton className="w-32 shrink-0" card={{ name: card.name, badge: describeExam(card), lines: [card.description] }} />
          <p className="text-xs text-sky-600">카드를 누르면 자세한 설명을 볼 수 있어요</p>
        </div>
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
  // 다른 친구가 고르는 중이면 같은 카드를 읽기 전용으로 함께 본다
  const watching = pick.playerId !== myId;
  const pickerName = game.players[pick.playerId]?.name ?? "";
  const cards = game.activityOffers[pick.activityId]?.cards ?? [];
  const canSkip = pick.mode === "take" && (pick.activityId === "creature" || pick.activityId === "lab");
  const title = watching
    ? pick.mode === "reward"
      ? `${pickerName}님이 주문 대결에서 이겼어요! 마도서를 고르는 중이에요...`
      : `${pickerName}님이 ${ACTIVITY_LABEL[pick.activityId]}의 카드를 고르는 중이에요...`
    : pick.mode === "reward"
      ? "주문 대결에서 이겼어요! 마도서를 1장 고르세요"
      : `${ACTIVITY_LABEL[pick.activityId]}: 공개된 카드 중 1장을 고르세요`;
  const affordable = (card: OfferCardView): boolean => {
    if (card.tokenNeeds) return card.tokenNeeds.some((stat) => (stat === "intelligence" ? me.intelligenceTokens : stat === "stamina" ? me.staminaTokens : me.charmTokens) > 0);
    if (!card.cost) return true;
    if (card.cost.kind === "stamina") return canPay(me, 0, card.cost.amount);
    return me.manaTokens >= card.cost.amount;
  };
  return (
    <div className={`bg-white rounded-3xl border-2 shadow-sm p-4 ${watching ? "border-purple-100" : "border-purple-200"}`}>
      <p className="text-sm text-purple-600 mb-1">{title}</p>
      {watching ? (
        <p className="text-xs text-purple-500 mb-2">공개된 카드를 같이 볼 수 있어요.</p>
      ) : (
        <p className="text-xs text-purple-500 mb-2">
          {pick.activityId === "exploration" || pick.mode === "reward"
            ? "고르지 않은 카드는 다음에 이 구역을 쓰는 친구의 몫이에요."
            : "고르고 남은 카드는 다음에 이 구역에 들어오는 친구가 가져가요."}
          {canSkip && " 살 수 있는 카드가 없거나 원하지 않으면 넘어가도 돼요."}{" "}
          (<InlineIcon name="staminaToken" /> 내 체력토큰 {me.staminaTokens}개 · <InlineIcon name="manaToken" /> 마나토큰 {me.manaTokens}개 · <InlineIcon name="charmToken" /> 매력토큰 {me.charmTokens}개)
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-purple-500">카드를 누르면 크게 볼 수 있어요</p>
        <PickGrid
          items={cards.map((card) => {
            const ok = watching || affordable(card);
            return {
              key: card.id,
              card: offerCardInfo(card),
              onAction: watching ? undefined : () => onPick(card.id),
              actionLabel: ok ? "가져가기" : "부족해요",
              disabled: !ok,
            };
          })}
        />
        {canSkip && !watching && (
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
      <div className="mt-2">
        <CardButton
          className="w-32"
          card={{
            name: coop.name,
            lines: [
              coop.description,
              <><InlineIcon name="dice" /> {coop.pairText}</>,
              <><InlineIcon name="check" /> 성공: {coop.successText}</>,
              <><InlineIcon name="warn" /> 실패: {coop.failureText}</>,
              coop.voidText,
            ],
          }}
        />
      </div>
      {coop.playerId !== myId ? (
        <p className="mt-1 rounded-xl bg-white/70 px-2 py-1 text-sm font-semibold">비밀의 방 탐색을 고르면 함께할 수 있어요! 보상은 둘 다 받아요</p>
      ) : (
        <p className="mt-1 rounded-xl bg-white/70 px-2 py-1 text-sm">함께할 친구를 기다리는 중이에요</p>
      )}
    </div>
  );
}

// 구역에 공개된 (아직 가져가지 않은) 카드 이름들
function offerNames(game: GameState, activityId: ActivityId): string {
  return (game.activityOffers[activityId]?.cards ?? []).map((c) => c.name).join(", ");
}

const ACTIVITY_ICON: Record<ActivityId, IconName> = {
  tournament: "trophy",
  creature: "paw",
  duel: "swords",
  exploration: "door",
  lab: "flask",
};

// 선 플레이어부터 시계방향 순서 표시 (지금 차례인 사람 강조, 이미 고른 활동은 아이콘으로)
function ChooseOrder({ game, myId, currentId }: { game: GameState; myId: string; currentId?: string }) {
  return (
    <ol className="mb-3 flex flex-wrap gap-1.5 text-xs" aria-label="활동 선택 순서">
      {game.activityOrder.map((id, index) => {
        const choice = game.activityChoices.find((c) => c.playerId === id);
        const forced = !choice && game.duels.some((d) => d.targetId === id);
        const now = id === currentId;
        return (
          <li
            key={id}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
              now ? "bg-pink-200 text-pink-800 ring-2 ring-pink-300" : choice || forced ? "bg-purple-100 text-purple-700" : "bg-purple-50 text-purple-500"
            }`}
          >
            {index + 1}. {game.players[id].name}
            {id === myId ? " (나)" : ""}
            {index === 0 ? " · 선" : ""}
            {choice && <Icon name={ACTIVITY_ICON[choice.activityId]} className="h-3.5 w-3.5" />}
            {forced && <Icon name="swords" className="h-3.5 w-3.5" />}
          </li>
        );
      })}
    </ol>
  );
}

// 3주차 선택 단계: 5개 구역이 모두에게 보이고, 선부터 시계방향으로 한 명씩 고른다 (내 차례가 아닐 때는 보기만 한다)
function ChoosePanel({
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
  const targets = duelTargets(game, myId);
  const [pendingActivity, setPendingActivity] = useState<ActivityId | null>(null);
  const fee = game.rules.duelCharmFee;
  const forcedBy = game.duels.find((d) => d.targetId === myId);

  if (isMyTurn && pendingActivity === "duel") {
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
        <p className="text-sm text-purple-600 mb-1">아직 활동을 고르지 않은 한 명을 지목하세요</p>
        <p className="text-xs text-purple-500 mb-2">
          지목당한 친구는 이번 달 자율활동으로 주문 대결을 하게 돼요. 결과와 상관없이 지목한 친구에게 <InlineIcon name="heart" /> 매력 {fee}과 <InlineIcon name="manaToken" /> 마나토큰 {game.rules.duelManaFee}개를 건네요.
        </p>
        <div className="flex flex-col gap-2">
          {targets.map((id) => (
            <button
              key={id}
              className="rounded-xl border border-purple-200 min-h-12 px-3 py-3 text-purple-700 bg-purple-50 active:scale-95 transition-transform"
              onClick={() => onSelect("duel", id)}
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
      <p className="text-sm text-purple-600 mb-1">3주차(자율활동): 선부터 시계방향으로 활동을 골라요</p>
      <p className="text-xs text-purple-500 mb-2">모두 고르고 나면 고른 순서대로 한 명씩 차례로 진행돼요. 다른 친구가 고른 활동도 여기서 볼 수 있어요.</p>
      <ChooseOrder game={game} myId={myId} currentId={currentTurnPlayerId} />
      <p className={`mb-3 rounded-2xl px-3 py-2 text-sm ${isMyTurn ? "bg-pink-50 text-pink-700" : "bg-purple-50 text-purple-600"}`}>
        {isMyTurn
          ? "내 차례예요! 하고 싶은 활동을 골라요"
          : forcedBy
            ? `${game.players[forcedBy.challengerId].name}님이 나를 지목했어요! 이번 달 활동은 주문 대결이에요`
            : currentTurnPlayerId
              ? `${game.players[currentTurnPlayerId]?.name}님이 활동을 고르는 중이에요...`
              : "모두 골랐어요"}
      </p>
      <p className="text-xs text-purple-500 mb-2">
        구역당 최대 {game.rules.activityMaxParticipants}명 · 먼저 고른 친구가 있으면 <InlineIcon name="charmToken" /> 매력토큰 {game.rules.activitySecondParticipantCost}개 추가 (내 매력토큰 {game.players[myId]?.charmTokens ?? 0}개). 처음 고른 친구가 카드를 공개하고 원하는 카드를 가져가요. 남은 카드는 두 번째 참가자가 가져가요.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {ACTIVITY_IDS.map((activityId) => {
          const label = ACTIVITY_LABEL[activityId];
          const occupants = game.activitySlots[activityId];
          // 내가 아직 고르기 전이라면 내 차례가 아니어도 지금 고를 수 없는 구역은 미리 회색으로 보여 준다
          const reason = game.players[myId]?.hasActedThisPhase ? null : activityBlockReason(game, myId, activityId);
          const extra = activityExtraCost(game, activityId);
          const openCost = activityOpenCost(game, activityId);
          const full = occupants.length >= game.rules.activityMaxParticipants;
          // 이미 이 구역을 고른 친구들 (주문 대결은 누구를 지목했는지도 함께)
          const who = occupants
            .map((id) => {
              const duel = activityId === "duel" ? game.duels.find((d) => d.challengerId === id) : undefined;
              return `${game.players[id].name}${duel ? ` → ${game.players[duel.targetId].name}` : ""}`;
            })
            .join(" · ");
          const body = (
            <>
              <span className="flex items-center gap-1.5">
                <Icon name={ACTIVITY_ICON[activityId]} className="h-5 w-5 shrink-0" />
                {label}
                {full && <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">가득 참</span>}
              </span>
              <span className="block text-xs opacity-80">{ACTIVITY_HINT[activityId]}</span>
              {activityId === "duel" && <span className="block text-xs opacity-80">아직 안 고른 한 명을 지목 · 매력 {fee}을 건네요</span>}
              {(who || (isMyTurn && (extra > 0 || openCost > 0))) && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {who && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{who} 선택</span>}
                  {isMyTurn && extra > 0 && !full && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">매력토큰 +{extra}</span>}
                  {isMyTurn && openCost > 0 && !full && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">지력토큰 {openCost}개 (카드 공개)</span>
                  )}
                </span>
              )}
              {reason && <span className="mt-1 block text-xs">{reason}</span>}
            </>
          );
          if (!isMyTurn || reason) {
            const gray = Boolean(reason);
            return (
              <div
                key={activityId}
                aria-disabled={gray ? "true" : undefined}
                className={`rounded-xl border min-h-12 px-3 py-3 ${gray ? "border-gray-200 bg-gray-100 text-gray-500 opacity-80" : "border-purple-200 bg-purple-50 text-purple-700"}`}
              >
                {body}
              </div>
            );
          }
          return (
            <button
              key={activityId}
              className="rounded-xl border border-purple-300 min-h-12 px-3 py-3 text-left text-purple-700 bg-white active:bg-purple-100 active:scale-95 transition-transform"
              onClick={() => (activityId === "duel" ? setPendingActivity("duel") : onSelect(activityId))}
            >
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 3주차 진행 단계: 모두가 고른 활동을 고른 순서대로 하나씩 보여 주며 진행한다 (지금 진행 중인 활동은 강조, 끝난 활동은 결과를 보여 준다)
function ResolvePanel({
  game,
  myId,
  onPick,
}: {
  game: GameState;
  myId: string;
  onPick: (cardId: string | null) => void;
}) {
  const currentIndex = game.activityResolvePointer;
  const current = game.activityChoices[currentIndex];
  const myPick = game.pendingPick?.playerId === myId;
  const nameOf = (id: string) => game.players[id]?.name ?? "";

  return (
    <div className="flex flex-col gap-3">
      {game.pendingPick && <PickPanel game={game} myId={myId} onPick={onPick} />}
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
        <p className="text-sm text-purple-600 mb-1">3주차(자율활동): 모두 골랐어요! 차례대로 진행해요</p>
        <p className="text-xs text-purple-500 mb-3">
          {current
            ? game.pendingPick && !myPick
              ? `${nameOf(game.pendingPick.playerId)}님이 ${ACTIVITY_LABEL[game.pendingPick.activityId]}의 카드를 고르는 중이에요...`
              : game.pendingRoll
                ? "주사위를 굴리는 중이에요..."
                : game.activityResolveStarted
                  ? `${nameOf(current.playerId)}님의 ${ACTIVITY_LABEL[current.activityId]}을(를) 진행하는 중이에요...`
                  : `${nameOf(current.playerId)}님의 ${ACTIVITY_LABEL[current.activityId]}이(가) 곧 시작돼요...`
            : "모든 활동이 끝났어요"}
        </p>
        <CoopNotice game={game} myId={myId} />
        <ol className="flex flex-col gap-2">
          {game.activityChoices.map((choice, index) => {
            const done = index < currentIndex;
            const now = index === currentIndex;
            const result = game.activityResults.find((r, i) => i === index && r.playerId === choice.playerId);
            const target = choice.targetPlayerId ? nameOf(choice.targetPlayerId) : "";
            return (
              <li
                key={choice.playerId}
                className={`rounded-2xl border-2 px-3 py-2 text-sm transition-colors ${
                  now
                    ? "spotlight border-pink-300 bg-pink-50 text-pink-800"
                    : done
                      ? "border-purple-100 bg-purple-50 text-purple-700"
                      : "border-gray-100 bg-gray-50 text-gray-500"
                }`}
              >
                <p className="flex items-center gap-1.5 font-display">
                  <Icon name={ACTIVITY_ICON[choice.activityId]} className="h-5 w-5 shrink-0" />
                  <span className="truncate">
                    {index + 1}. {nameOf(choice.playerId)}
                    {choice.playerId === myId ? " (나)" : ""} · {ACTIVITY_LABEL[choice.activityId]}
                    {target ? ` → ${target}` : ""}
                  </span>
                  <span className="ml-auto shrink-0 text-xs">{done ? "완료" : now ? (game.activityResolveStarted ? "진행 중" : "곧 시작") : "대기"}</span>
                </p>
                {now && offerNames(game, choice.activityId) && (
                  <p className="mt-1 rounded-xl bg-white/70 px-2 py-1 text-xs text-purple-700">
                    <InlineIcon name="scroll" /> 공개된 카드: {offerNames(game, choice.activityId)}
                  </p>
                )}
                {result && result.lines.length > 0 && (
                  <ul className="pop-in mt-1 flex flex-col gap-0.5 text-xs text-purple-700">
                    {result.lines.map((line, i) => (
                      <li key={i} className="rounded-xl bg-white/70 px-2 py-1">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
        {game.duels.length > 0 && (
          <p className="mt-2 text-xs text-purple-500">
            <InlineIcon name="swords" /> 주문 대결에 지목당한 친구는 도전자의 차례에 함께 대결해요.
          </p>
        )}
      </div>
    </div>
  );
}

function ActivityPhasePanel({
  game,
  myId,
  onSelect,
  onPick,
}: {
  game: GameState;
  myId: string;
  onSelect: (activityId: ActivityId, targetPlayerId?: string) => void;
  onPick: (cardId: string | null) => void;
}) {
  return game.activityStage === "resolve" ? (
    <ResolvePanel game={game} myId={myId} onPick={onPick} />
  ) : (
    <ChoosePanel game={game} myId={myId} onSelect={onSelect} />
  );
}

// 주사위 굴리기 (선 정하기·주문 대결·탐험 판정·시험): 굴려야 하는 사람이 버튼을 누르면 서버가 굴려서 결과를 알려 주고,
// 모두 굴린 뒤에는 결과를 눈으로 확인하고 "확인" 버튼을 눌러야 결과가 적용된다
function RollPanel({
  game,
  myId,
  onRoll,
  onReroll,
  onConfirm,
}: {
  game: GameState;
  myId: string;
  onRoll: (diceCount?: number, tokenCounts?: Partial<Record<TokenStat, number>>) => void;
  onReroll: (diceIndexes: number[]) => void;
  onConfirm: () => void;
}) {
  const pending = game.pendingRoll;
  const [clickedFor, setClickedFor] = useState<string | null>(null);
  // 다시 굴리려고 고른 내 주사위 번호
  const [selected, setSelected] = useState<number[]>([]);
  // 연구실 실험처럼 지력토큰을 몇 개 낼지 고르는 굴림에서 고른 주사위 수 (null이면 서버가 정한 기본값)
  const [pickedCount, setPickedCount] = useState<number | null>(null);
  // 마법생물 조련처럼 여러 종류의 토큰을 종류별로 몇 개씩 낼지 고르는 굴림에서 고른 개수 (없는 종류는 최대치가 기본값)
  const [pickedTokens, setPickedTokens] = useState<Partial<Record<TokenStat, number>>>({});
  // 버튼을 누른 뒤 응답이 없어도 잠시 뒤 다시 누를 수 있게 풀어 준다
  useEffect(() => {
    if (!clickedFor) return;
    const timer = setTimeout(() => setClickedFor(null), 4000);
    return () => clearTimeout(timer);
  }, [clickedFor]);
  if (!pending) return null;

  const mine = pending.entries.find((e) => e.playerId === myId);
  const revealed = pending.entries.every((e) => e.dice !== null);
  const canRoll = !!mine && mine.dice === null;
  // 굴리기 전에 지력토큰을 몇 개 낼지 고르는 굴림 (연구실 실험)
  const choiceMax = mine?.diceChoiceMax;
  const chosenCount = choiceMax !== undefined ? Math.min(Math.max(pickedCount ?? mine!.diceCount, 1), choiceMax) : (mine?.diceCount ?? 0);
  const multi = mine?.diceChoices;
  const tokenCountOf = (c: { stat: TokenStat; max: number }) => Math.min(Math.max(pickedTokens[c.stat] ?? c.max, 0), c.max);
  const multiTotal = multi ? multi.reduce((a, c) => a + tokenCountOf(c), 0) : 0;
  const canConfirm = !!mine && revealed && !mine.confirmed;
  const me = game.players[myId];
  // 결과를 확인하기 전에는 지력토큰으로 일부 주사위만 다시 굴릴 수 있다 (선 정하기는 제외)
  const canReroll = canConfirm && pending.kind !== "first" && !!mine && (mine.dice?.length ?? 0) > 0;
  const rerollCost = selected.length;
  const rerollOk = rerollCost > 0 && canPay(me, rerollCost, 0);
  const toggle = (i: number) => setSelected((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  const rollKey = `roll:${pending.title}`;
  const confirmKey = `confirm:${pending.title}`;
  const waiting = pending.entries.filter((e) => e.dice === null && e.playerId !== myId);
  const unconfirmed = pending.entries.filter((e) => !e.confirmed && e.playerId !== myId);

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
            <p className="flex items-center justify-between gap-2 text-sm text-purple-700">
              <span className="truncate">
                {entry.label}
                {entry.playerId === myId ? " (나)" : ""}
              </span>
              {revealed && entry.confirmed && entry.diceCount > 0 && <span className="shrink-0 text-xs text-emerald-600">확인 완료</span>}
            </p>
            {entry.dice === null ? (
              <p className="text-xs text-purple-400">아직 안 굴렸어요{entry.diceChoiceMax === undefined && !entry.diceChoices ? ` (주사위 ${entry.diceCount}개)` : ` (${entry.diceChoiceStat === "stamina" ? "체력토큰" : entry.diceChoiceStat === "mana" ? "마나토큰" : "지력토큰"}을 고르는 중)`}</p>
            ) : entry.dice.length === 0 ? (
              <p className="text-xs text-purple-400">굴릴 주사위가 없어요</p>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {entry.dice.map((d, i) => (
                  <DiceFace
                    key={`${i}-${entry.rerollCounts?.[i] ?? 0}`}
                    value={d}
                    delay={(entry.rerollCounts?.[i] ?? 0) > 0 ? 0 : i * 0.06}
                    selected={entry.playerId === myId && canReroll && selected.includes(i)}
                    onToggle={entry.playerId === myId && canReroll ? () => toggle(i) : undefined}
                  />
                ))}
                {entry.dice.length > 1 && <b className="ml-1 text-purple-700">합계 {entry.dice.reduce((a, b) => a + b, 0)}</b>}
                {entry.rerolls > 0 && <span className="ml-1 text-xs text-sky-700">다시 굴림 {entry.rerolls}개</span>}
              </div>
            )}
          </li>
        ))}
      </ul>

      {canRoll && mine && choiceMax !== undefined && (
        <div className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <p>
            {mine.diceChoiceStat === "stamina" ? (
              <>
                <InlineIcon name="staminaToken" /> 체력토큰 {choiceMax}개 중 몇 개를 낼까요? 낸 개수만큼 주사위를 굴려요. 안 낸 토큰은 지켜 둘 수 있어요
              </>
            ) : mine.diceChoiceStat === "mana" ? (
              <>
                <InlineIcon name="manaToken" /> 마나토큰 {choiceMax}개 중 몇 개를 낼까요? 낸 개수만큼 주사위를 굴려요. 안 낸 마나토큰은 지켜 둘 수 있어요
              </>
            ) : (
              <>
                <InlineIcon name="intToken" /> 지력토큰 {choiceMax}개 중 몇 개를 낼까요? 낸 개수만큼 주사위를 굴려요. 안 낸 토큰은 다시 굴리기에 쓸 수 있어요
              </>
            )}
          </p>
          <div className="mt-2 flex items-center justify-center gap-4">
            <button
              aria-label="하나 줄이기"
              disabled={chosenCount <= 1}
              className="h-12 w-12 rounded-full bg-white text-2xl font-semibold text-sky-700 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
              onClick={() => setPickedCount(chosenCount - 1)}
            >
              −
            </button>
            <span className="min-w-20 text-center text-lg font-semibold">{chosenCount}개</span>
            <button
              aria-label="하나 늘리기"
              disabled={chosenCount >= choiceMax}
              className="h-12 w-12 rounded-full bg-white text-2xl font-semibold text-sky-700 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
              onClick={() => setPickedCount(chosenCount + 1)}
            >
              +
            </button>
          </div>
        </div>
      )}
      {canRoll && mine && multi && (
        <div className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <p>토큰 종류별로 몇 개를 낼까요? 낸 토큰 개수만큼 주사위를 굴려요. 안 낸 토큰은 지켜 둘 수 있어요</p>
          {multi.map((c) => {
            const n = tokenCountOf(c);
            return (
              <div key={c.stat} className="mt-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  <InlineIcon name={c.stat === "intelligence" ? "intToken" : c.stat === "stamina" ? "staminaToken" : "charmToken"} /> {STAT_LABEL[c.stat]}토큰 (최대 {c.max}개)
                </span>
                <span className="flex items-center gap-3">
                  <button
                    aria-label={`${STAT_LABEL[c.stat]}토큰 하나 줄이기`}
                    disabled={n <= 0}
                    className="h-12 w-12 rounded-full bg-white text-2xl font-semibold text-sky-700 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
                    onClick={() => setPickedTokens((cur) => ({ ...cur, [c.stat]: n - 1 }))}
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center text-lg font-semibold">{n}</span>
                  <button
                    aria-label={`${STAT_LABEL[c.stat]}토큰 하나 늘리기`}
                    disabled={n >= c.max}
                    className="h-12 w-12 rounded-full bg-white text-2xl font-semibold text-sky-700 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
                    onClick={() => setPickedTokens((cur) => ({ ...cur, [c.stat]: n + 1 }))}
                  >
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {canRoll && mine ? (
        <button
          disabled={clickedFor === rollKey || (!!multi && multiTotal < 1)}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pink-500 py-3 text-lg font-semibold text-white active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
          onClick={() => {
            setClickedFor(rollKey);
            if (multi) onRoll(undefined, Object.fromEntries(multi.map((c) => [c.stat, tokenCountOf(c)])));
            else onRoll(choiceMax !== undefined ? chosenCount : undefined);
          }}
        >
          <span className={clickedFor === rollKey ? "dice-wiggle inline-flex" : "inline-flex"}>
            <Icon name="dice" className="h-6 w-6" />
          </span>
          {clickedFor === rollKey ? "굴리는 중..." : (multi ? multiTotal : chosenCount) > 1 ? `주사위 ${multi ? multiTotal : chosenCount}개 굴리기` : "주사위 굴리기"}
        </button>
      ) : canConfirm ? (
        <>
          {canReroll && (
            <div className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <p>
                <InlineIcon name="intToken" /> 지력토큰 {me.intelligenceTokens}개 · 주사위를 눌러 고르면 <b>1개당 주사위 1개</b>를 다시 굴려요
              </p>
              <button
                disabled={!rerollOk}
                className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 py-2 font-semibold text-white active:scale-95 transition-transform disabled:bg-gray-200 disabled:text-gray-600 disabled:active:scale-100"
                onClick={() => {
                  onReroll(selected);
                  setSelected([]);
                }}
              >
                <Icon name="dice" className="h-5 w-5" />
                {rerollCost === 0 ? "다시 굴릴 주사위를 골라요" : rerollOk ? `선택한 ${rerollCost}개 다시 굴리기 (지력토큰 ${rerollCost}개)` : "지력토큰이 부족해요"}
              </button>
            </div>
          )}
          <p className="mt-3 text-center text-sm text-purple-600">결과를 확인했으면 다음으로 넘어가요. 모두 확인하면 결과가 적용돼요.</p>
          <button
            disabled={clickedFor === confirmKey}
            className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 py-3 text-lg font-semibold text-white active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
            onClick={() => {
              setClickedFor(confirmKey);
              onConfirm();
            }}
          >
            <Icon name="check" className="h-6 w-6" />
            {clickedFor === confirmKey ? "확인 중..." : "결과 확인, 다음으로"}
          </button>
        </>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm text-purple-600" aria-live="polite">
          <span className="dice-wiggle inline-flex text-pink-400">
            <Icon name="dice" className="h-5 w-5" />
          </span>
          {!revealed
            ? waiting.length > 0
              ? `${waiting.map((e) => e.label.replace(/ \(.*\)$/, "")).join(", ")}님이 굴리기를 기다리는 중...`
              : "결과를 계산하는 중..."
            : unconfirmed.length > 0
              ? `${unconfirmed.map((e) => e.label.replace(/ \(.*\)$/, "")).join(", ")}님이 결과를 확인하는 중...`
              : "결과를 적용하는 중..."}
        </p>
      )}
    </div>
  );
}

// 4주차(정리): 남은 토큰(지력·체력·매력·마나) 중 1개를 다음 달로 남길 수 있다
const KEEP_OPTIONS = [
  { kind: "intelligence", count: "intelligenceTokens", icon: "intToken", label: "지력", className: "bg-sky-100 text-sky-800" },
  { kind: "stamina", count: "staminaTokens", icon: "staminaToken", label: "체력", className: "bg-green-100 text-green-800" },
  { kind: "charm", count: "charmTokens", icon: "charmToken", label: "매력", className: "bg-pink-100 text-pink-800" },
  { kind: "mana", count: "manaTokens", icon: "manaToken", label: "마나", className: "bg-purple-200 text-purple-900" },
] as const;

function CleanupPanel({ game, myId, onKeep }: { game: GameState; myId: string; onKeep: (choice: KeepChoice) => void }) {
  const me = game.players[myId];
  const myChoice = game.cleanupKeep[myId]; // undefined: 남길 수 있는 토큰이 없음, null: 고르는 중
  const waiting = Object.entries(game.cleanupKeep)
    .filter(([id, choice]) => choice === null && id !== myId)
    .map(([id]) => game.players[id].name);
  const label = (choice: KeepChoice) => KEEP_OPTIONS.find((o) => o.kind === choice)?.label + "토큰" || "남기지 않기";

  return (
    <div className="pop-in bg-white rounded-3xl border-2 border-pink-300 shadow-sm p-4">
      <p className="font-display text-lg text-purple-700 text-center">
        <InlineIcon name="bag" /> 4주차 정리
      </p>
      <p className="mt-1 text-center text-sm text-purple-500">남은 토큰은 사라지지만, 어떤 토큰이든 <b>1개</b>는 다음 달로 남길 수 있어요.</p>
      {myChoice === null ? (
        <div className="mt-3 flex flex-col gap-2">
          {KEEP_OPTIONS.filter((o) => me[o.count] > 0).map((o) => (
            <button
              key={o.kind}
              className={`min-h-12 rounded-2xl px-3 py-2 font-semibold active:scale-95 transition-transform ${o.className}`}
              onClick={() => onKeep(o.kind)}
            >
              <InlineIcon name={o.icon} /> {o.label}토큰 1개 남기기 (남은 {me[o.count]}개 중)
            </button>
          ))}
          <button
            className="min-h-12 rounded-2xl bg-purple-100 px-3 py-2 text-purple-700 active:scale-95 transition-transform"
            onClick={() => onKeep("none")}
          >
            남기지 않기
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-purple-50 px-3 py-2 text-center text-sm text-purple-600">
          {myChoice === undefined ? "남길 수 있는 토큰이 없어요." : `${label(myChoice)}${myChoice === "none" ? "" : " 1개를 남기기로 했어요."}`}
        </p>
      )}
      {waiting.length > 0 && <p className="mt-2 text-center text-xs text-purple-500">{waiting.join(", ")}님이 고르는 중이에요...</p>}
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4" role="alert">
      <p className="pop-in max-w-sm rounded-2xl border-2 border-pink-200 bg-white px-4 py-2 text-sm text-pink-600 shadow-lg">{message}</p>
    </div>
  );
}

// 마법 토너먼트 순위 화면: 트랙에는 상한이 없고, 기말고사가 끝났을 때 1위·2위가 학점 보상을 받는다
function TournamentPanel({ game, myId }: { game: GameState; myId: string }) {
  const rewards = game.rules.tournamentRewards;
  // 트랙 위치가 높은 순. 같은 칸이면 공동 순위(1, 1, 3, ...)
  const rows = game.turnOrder.map((id) => game.players[id]).sort((a, b) => b.tournamentTrack - a.tournamentTrack);
  const leader = rows[0]?.tournamentTrack ?? 0;
  const rankOf = (index: number) => rows.findIndex((p) => p.tournamentTrack === rows[index].tournamentTrack) + 1;
  const scale = Math.max(leader, 10);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-display text-base text-amber-700 mb-1"><InlineIcon name="trophy" /> 마법 토너먼트</p>
        <p className="text-xs">토너먼트 참가를 고르면 마나토큰을 모두 내고 낸 개수만큼 주사위를 굴려, 나온 눈을 모두 더한 칸만큼 트랙을 전진해요. 트랙에는 상한이 없어요!</p>
        <p className="text-xs">
          기말고사가 끝나면 1위 <b>학점 +{rewards[0]}</b>
          {rewards.length > 1 && <>, 2위 <b>학점 +{rewards[1]}</b></>}를 받아요. (0칸은 보상 없음 · 같은 칸이면 공동 순위)
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
                <InlineIcon name="sparkle" /> 주문력 {effectiveStat(p, "spellPower")} (한 번에 주사위 {effectiveStat(p, "spellPower")}개)
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
  onRerollDice,
  onConfirmRoll,
  onKeepToken,
  onLeave,
  isHost,
  turnTimer,
  reactions,
  onEmoji,
  onResumeSeat,
  onKick,
  onRematch,
}: {
  game: GameState;
  myId: string;
  errorMessage: string | null;
  errorSeq: number;
  onTakeClassCard: (cardId: string | null) => void;
  onSelectActivity: (activityId: ActivityId, targetPlayerId?: string) => void;
  onPickActivityCard: (cardId: string | null) => void;
  onRollDice: (diceCount?: number, tokenCounts?: Partial<Record<TokenStat, number>>) => void;
  onRerollDice: (diceIndexes: number[]) => void;
  onConfirmRoll: () => void;
  onKeepToken: (choice: KeepChoice) => void;
  onLeave: () => void;
  isHost: boolean;
  turnTimer: TurnTimer;
  reactions: Reaction[];
  onEmoji: (emoji: string) => void;
  onResumeSeat: () => void;
  onKick: (playerId: string) => void;
  onRematch: () => void;
}) {
  const [tab, setTab] = useState<TabId>("game");
  const latestExam = game.examResults[game.examResults.length - 1];
  const me = game.players[myId];
  // 3주차: 선택 단계에서는 고를 차례인 사람, 진행 단계에서는 카드를 고르는 사람이 행동한다
  const activityTurnId = game.activityStage === "choose" ? game.activityOrder[game.activityTurnPointer] : game.pendingPick?.playerId;
  const myRollPending = !!game.pendingRoll?.entries.some(
    (e) => e.playerId === myId && (e.dice === null || (!e.confirmed && game.pendingRoll!.entries.every((x) => x.dice !== null))),
  );
  // 내가 행동해야 하는 순간에는 게임 탭에 알림 점을 띄운다
  const myTurn =
    myRollPending ||
    game.cleanupKeep[myId] === null ||
    (!game.pendingRoll &&
      ((game.phase === "class" && game.classPickOrder[game.classPickPointer] === myId) || (game.phase === "activity" && activityTurnId === myId)));
  const starterName = game.players[game.turnOrder[game.startingPlayerIndex]]?.name;
  const phaseText =
    game.phase === "setup"
      ? "선 정하기"
      : game.phase === "class"
      ? "2주차 정규수업"
      : game.phase === "activity"
        ? "3주차 자율활동"
        : game.phase === "cleanup"
          ? "4주차 정리"
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
        {me.isBot && game.phase !== "ended" && <AwayBanner onResume={onResumeSeat} />}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg text-purple-700 whitespace-nowrap"><Icon name="school" className="mr-1 h-5 w-5" />{game.round}/12개월</h1>
          <p className={`truncate rounded-full px-3 py-1 text-sm ${myTurn ? "bg-pink-200 text-pink-800" : "bg-purple-100 text-purple-600"}`}>
            {myTurn && <Icon name="bell" className="mr-1 h-4 w-4" />}
            {myTurn ? "내 차례 · " : ""}
            {phaseText}
          </p>
          <GameMenu
            inGame={game.phase !== "ended"}
            onLeave={onLeave}
            kickable={
              isHost && game.phase !== "ended"
                ? game.turnOrder.filter((id) => id !== myId && !game.players[id].isBot).map((id) => ({ id, name: game.players[id].name }))
                : []
            }
            onKick={onKick}
          />
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
          <Chip icon="manaToken" label="마나토큰" showLabel value={me.manaTokens} className="bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-[calc(9rem+env(safe-area-inset-bottom))] flex flex-col gap-4">
        {tab === "game" && (
          <>
            {game.phase !== "setup" && game.phase !== "ended" && (
              <p className="rounded-2xl bg-white/70 px-3 py-1.5 text-center text-xs text-purple-600">
                <InlineIcon name="sparkle" /> 이번 달 선: <b>{starterName}</b> (선부터 시계방향으로 진행해요)
              </p>
            )}
            {game.pendingRoll && <RollPanel game={game} myId={myId} onRoll={onRollDice} onReroll={onRerollDice} onConfirm={onConfirmRoll} />}
            {game.phase === "class" && !game.pendingRoll && <ClassPhasePanel game={game} myId={myId} onTake={onTakeClassCard} />}
            {game.phase === "cleanup" && <CleanupPanel game={game} myId={myId} onKeep={onKeepToken} />}
            {game.phase === "activity" && (
              <ActivityPhasePanel game={game} myId={myId} onSelect={onSelectActivity} onPick={onPickActivityCard} />
            )}
            {game.phase === "ended" && <FinalReveal game={game} onLeave={onLeave} isHost={isHost} onRematch={onRematch} />}

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
              <PlayerStatCard key={id} player={game.players[id]} isMe={id === myId} rules={game.rules} />
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

      <SocialBar
        key={tab}
        timer={turnTimer}
        reactions={reactions}
        names={Object.fromEntries(game.turnOrder.map((id) => [id, game.players[id].name]))}
        myId={myId}
        onEmoji={onEmoji}
      />
      <AnnouncementLayer game={game} myId={myId} />
      <ErrorToast message={errorMessage} seq={errorSeq} />
    </div>
  );
}
