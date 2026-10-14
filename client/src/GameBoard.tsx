import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, InlineIcon, type IconName } from "./Icons";
import {
  ACTIVITY_HINT,
  ACTIVITY_LABEL,
  activityOpenCost,
  describeExam,
  canPay,
  canTakeClassCard,
  classGainApplied,
  ELEMENT_ICON,
  ELEMENT_LABEL,
  KIND_LABEL,
  LAB_KIND_LABEL,
  activityBlockReason,
  activityExtraCost,
  creatureSets,
  describeAbility,
  duelTargets,
  effectiveStat,
  energyText,
  type ActivityId,
  type CreatureElement,
  type GameState,
  type KeptToken,
  type OfferCardView,
  type PlayerGameState,
  currentRoller,
  cramSources,
  ENERGY_FIELD,
  type NewsCard,
} from "./gameTypes";
import { CardButton, CardGrid, PickGrid, type CardInfo } from "./CardArt";
import { classCardBlockReason, classCardData, GameCardGrid, GamePickGrid, type GameCardData } from "./GameCard";
import { PlayerTable } from "./PlayerTable";
import { RulesGuide } from "./Rules";
import { GameMenu } from "./Leave";
import { FinalReveal } from "./FinalReveal";
import { NoticeToast, PlayerAdminRow, SocialBar, WaitingBanner } from "./Social";
import type { Reaction } from "./useGameSocket";
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

function PlayerStatCard({ player, isMe, rules, defaultOpen }: { player: PlayerGameState; isMe: boolean; rules: GameState["rules"]; defaultOpen: boolean }) {
  // 기운은 지금 가진 양으로 보여 준다 (한도 옵션이 켜져 있으면 "가진 양/한도")
  const energy = (kind: KeptToken, _now: number) => energyText(player, kind, rules);
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
        <InlineIcon name="trophy" /> 토너먼트 {player.tournamentTrack}칸 · <InlineIcon name="book" /> 수업 {player.classCards.length}장
      </p>
      <p className="text-sm text-purple-700 leading-7">
        <InlineIcon name="intToken" /> 지력기운 {energy("intelligence", player.intelligenceTokens)} · <InlineIcon name="staminaToken" /> 체력기운 {energy("stamina", player.staminaTokens)} · <InlineIcon name="charmToken" /> 매력기운 {energy("charm", player.charmTokens)} · <InlineIcon name="manaToken" /> 마나기운 {energy("mana", player.manaTokens)}
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
                  <InlineIcon name={g.icon} /> {g.label} {g.count}장
                </p>
                {g.node}
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
            세트 {creatureSets(player.creatures)}개 · 생물사랑상 점수 {player.creatures.length + creatureSets(player.creatures)}
          </span>
        </p>
      )}
    </>
  );

  // 내 카드와 친구 카드 모두 접고 펼 수 있다. 내 카드는 기본으로 펼쳐 두고, 접으면 한 줄 요약만 보인다
  return (
    <details id={`player-${player.id}`} open={defaultOpen} className={isMe ? "rounded-3xl border-2 border-pink-300 bg-pink-50 shadow-sm" : "rounded-3xl border-2 border-purple-200 bg-white shadow-sm"}>
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

function offerCardInfo(card: OfferCardView): CardInfo {
  return {
    name: card.name,
    badge:
      [card.tags, card.cost ? (card.cost.kind === "stamina" ? `체력기운 ${card.cost.amount}개` : `마나기운 ${card.cost.amount}개`) : undefined].filter(Boolean).join(" · ") || undefined,
    lines: [card.description, ...card.lines],
  };
}

// 가진 카드를 어디서 얻었는지(2주차 정규수업 / 3주차 자율활동 구역)별로 묶는다
function ownedCardGroups(player: PlayerGameState): { key: string; icon: IconName; label: string; count: number; node: ReactNode }[] {
  const groups = [
    { key: "class", icon: "book" as IconName, label: "정규수업 수업카드", cards: player.classCards.map(classCardData) as (GameCardData | CardInfo)[] },
    {
      key: "lab",
      icon: "flask" as IconName,
      label: "연구실 실험 연구카드",
      cards: player.equipment.map((c) => ({ name: c.name, badge: LAB_KIND_LABEL[c.kind], lines: [c.description, c.summary] })),
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
  return groups
    .filter((g) => g.cards.length > 0)
    .map((g) => ({
      key: g.key,
      icon: g.icon,
      label: g.label,
      count: g.cards.length,
      node: g.key === "class" ? <GameCardGrid cards={g.cards as GameCardData[]} /> : <CardGrid cards={g.cards as CardInfo[]} />,
    }));
}

function ClassPhasePanel({ game, myId, onTake }: { game: GameState; myId: string; onTake: (cardId: string | null) => void }) {
  const me = game.players[myId];
  const currentId = game.classPickOrder[game.classPickPointer];
  const isMyTurn = currentId === myId;
  const nameOf = (id: string) => game.players[id].name;

  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
      <p className="text-sm text-purple-500 mb-1">2주차(정규수업): 수업카드는 무료예요. 가져가면 그 과목의 기운을 얻어요. 선부터 시계방향으로 한 장씩 가져가요</p>
      <p className="text-xs text-purple-500 mb-2">
        <InlineIcon name="intToken" /> 지력기운 {energyText(me, "intelligence", game.rules)} · <InlineIcon name="staminaToken" /> 체력기운 {energyText(me, "stamina", game.rules)} · <InlineIcon name="charmToken" /> 매력기운 {energyText(me, "charm", game.rules)} · <InlineIcon name="manaToken" /> 마나기운 {energyText(me, "mana", game.rules)}
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
              {id === game.turnOrder[game.startingPlayerIndex] ? " · 선" : ""}
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
          <GamePickGrid
            items={game.classMarket.map((card) => {
              const allowed = canTakeClassCard(me, card);
              const applied = classGainApplied(me, card, game.rules);
              return {
                key: card.id,
                card: classCardData(card),
                blockReason: classCardBlockReason(me, card),
                onAction: isMyTurn ? () => onTake(card.id) : undefined,
                actionLabel: !allowed ? "선수 조건이 모자라요" : applied < card.gain ? `가져가기 (+${applied}, 한도)` : `가져가기 (+${applied})`,
                disabled: !allowed,
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

// 이달의 학교 소식 (1주차): 행사·시험 공고·시험 주간 카드. 그달 내내 보여 준다
const NEWS_STYLE: Record<NewsCard["kind"], { icon: IconName; label: string; box: string; title: string }> = {
  event: { icon: "sparkle", label: "이달의 학교 소식", box: "border-amber-200 bg-amber-50 text-amber-900", title: "text-amber-700" },
  notice: { icon: "note", label: "학교 게시판 · 시험 공고", box: "border-sky-200 bg-sky-50 text-sky-900", title: "text-sky-700" },
  examWeek: { icon: "dice", label: "시험 주간", box: "border-pink-200 bg-pink-50 text-pink-900", title: "text-pink-700" },
};

function NewsPanel({ game }: { game: GameState }) {
  const news = game.news!;
  const st = NEWS_STYLE[news.kind];
  return (
    <div className={`rounded-3xl border-2 px-3 py-2 text-sm ${st.box}`}>
      <p className={`text-xs ${st.title}`}>
        <InlineIcon name={st.icon} /> {game.round}개월 1주차 · {st.label}
      </p>
      <p className={`font-display text-base ${st.title}`}>{news.name}</p>
      <p className="text-xs leading-5">{news.description}</p>
    </div>
  );
}

// 시험 달 1주차 벼락치기: 선부터 한 명씩, 가진 기운 1개를 시험 과목 기운 1개로 바꾸거나 넘어간다
function CramPanel({ game, myId, onCram }: { game: GameState; myId: string; onCram: (from: KeptToken | null) => void }) {
  const [clicked, setClicked] = useState<string | null>(null);
  const currentId = game.cramOrder[game.cramPointer];
  useEffect(() => setClicked(null), [currentId]);
  const to = game.news?.effect.cramTo;
  if (!to) return null;
  const me = game.players[myId];
  const isMyTurn = currentId === myId;
  const sources = me ? cramSources(game, me) : [];
  const toInfo = FUEL_INFO[to];
  const send = (from: KeptToken | null) => {
    setClicked(from ?? "skip");
    onCram(from);
  };
  return (
    <div className="bg-white rounded-3xl border-2 border-pink-200 shadow-sm p-4">
      <p className="font-display text-lg text-pink-700 text-center">
        <InlineIcon name="book" /> 벼락치기
      </p>
      <p className="mt-1 text-center text-sm text-purple-500">
        가진 기운 1개를 <InlineIcon name={toInfo.icon} /> {toInfo.name} 1개로 바꿀 수 있어요 (안 해도 돼요). 선부터 한 명씩 골라요
      </p>
      <ol className="my-3 flex flex-wrap gap-1.5 text-xs" aria-label="벼락치기 순서">
        {game.cramOrder.map((id, index) => (
          <li
            key={id}
            className={`rounded-full px-2.5 py-1 ${
              index === game.cramPointer ? "bg-pink-200 text-pink-800 ring-2 ring-pink-300" : index < game.cramPointer ? "bg-gray-100 text-gray-500 line-through" : "bg-purple-50 text-purple-600"
            }`}
          >
            {index + 1}. {game.players[id]?.name}
            {id === myId ? " (나)" : ""}
          </li>
        ))}
      </ol>
      {isMyTurn ? (
        <div className="flex flex-col gap-2">
          {sources.map((k) => (
            <button
              key={k}
              disabled={clicked !== null}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-pink-500 px-3 py-2 font-semibold text-white active:scale-95 transition-transform disabled:opacity-60"
              onClick={() => send(k)}
            >
              <InlineIcon name={FUEL_INFO[k].icon} /> {FUEL_INFO[k].name} 1개 ({me[ENERGY_FIELD[k]]}개 있음) → <InlineIcon name={toInfo.icon} /> {toInfo.name}
            </button>
          ))}
          {sources.length === 0 && <p className="text-center text-sm text-purple-500">바꿀 수 있는 기운이 없어요</p>}
          <button
            disabled={clicked !== null}
            className="min-h-12 rounded-2xl bg-purple-100 px-3 py-2 font-semibold text-purple-700 active:scale-95 transition-transform disabled:opacity-60"
            onClick={() => send(null)}
          >
            벼락치기 없이 시험 보기 (지금 {toInfo.name} {me[ENERGY_FIELD[to]]}개)
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-purple-600">{game.players[currentId]?.name}님이 벼락치기를 고르는 중이에요...</p>
      )}
    </div>
  );
}

// 다음 시험의 시험 카드 안내: 공개 전에는 언제 공개되는지, 공개 후에는 어떤 능력치로 점수를 내는지 보여 준다
function ExamInfoPanel({ game }: { game: GameState }) {
  if (game.phase === "ended") return null;
  const { midtermRound, midtermNoticeRound, finalNoticeRound } = game.rules;
  const isMidterm = game.round <= midtermRound && game.examResults.length === 0;
  const card = isMidterm ? game.exams.midterm : game.exams.final;
  const name = isMidterm ? "중간고사" : "기말고사";
  const examRound = isMidterm ? midtermRound : 12;
  const noticeRound = isMidterm ? midtermNoticeRound : finalNoticeRound;
  return (
    <div className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-3 text-sm text-sky-800">
      <p className="font-display text-base text-sky-700 mb-0.5">
        <InlineIcon name="note" /> 다음 시험: {name} ({examRound}개월, 수업·자율활동 대신)
      </p>
      {card ? (
        <div className="mt-1.5 flex items-center gap-3">
          <CardButton className="w-32 shrink-0" card={{ name: card.name, badge: describeExam(card), lines: [card.description] }} />
          <p className="text-xs text-sky-600">카드를 누르면 자세한 설명을 볼 수 있어요</p>
        </div>
      ) : (
        <p className="text-xs text-sky-600">시험 과목은 {noticeRound}개월 1주차 학교 소식(시험 공고)에 공개돼요. 그때까지는 고르게 키워 두면 안전해요.</p>
      )}
    </div>
  );
}

// 구역에 공개된 카드 중 하나를 고르는 패널 (마법생물·연구 카드·비밀의 방 카드 공통)
function PickPanel({ game, myId, onPick }: { game: GameState; myId: string; onPick: (cardId: string | null) => void }) {
  const pick = game.pendingPick;
  const me = game.players[myId];
  if (!pick) return null;
  // 다른 친구가 고르는 중이면 같은 카드를 읽기 전용으로 함께 본다
  const watching = pick.playerId !== myId;
  const pickerName = game.players[pick.playerId]?.name ?? "";
  const cards = game.activityOffers[pick.activityId]?.cards ?? [];
  const canSkip = pick.activityId === "creature" || pick.activityId === "lab";
  const title = watching
    ? `${pickerName}님이 ${ACTIVITY_LABEL[pick.activityId]}의 카드를 고르는 중이에요...`
    : `${ACTIVITY_LABEL[pick.activityId]}: 공개된 카드 중 1장을 고르세요`;
  const affordable = (card: OfferCardView): boolean => {
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
          {pick.activityId === "exploration"
            ? "고르지 않은 카드는 다음에 이 구역을 쓰는 친구의 몫이에요."
            : "고르고 남은 카드는 다음에 이 구역에 들어오는 친구가 가져가요."}
          {canSkip && " 살 수 있는 카드가 없거나 원하지 않으면 넘어가도 돼요."}{" "}
          (<InlineIcon name="staminaToken" /> 내 체력기운 {me.staminaTokens}개 · <InlineIcon name="manaToken" /> 마나기운 {me.manaTokens}개 · <InlineIcon name="charmToken" /> 매력기운 {me.charmTokens}개)
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

// 이번 달 활동 카드 (50절): 1주차에 공개된 구역별 카드를 정규수업·활동 선택 때 함께 본다 (누르면 크게 보기)
const MONTH_ZONES: ActivityId[] = ["creature", "lab", "exploration"];
function MonthOffersPanel({ game }: { game: GameState }) {
  const zones = MONTH_ZONES.filter((a) => (game.activityOffers[a]?.cards.length ?? 0) > 0);
  if (zones.length === 0) return null;
  return (
    <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-3">
      <p className="font-display text-base text-amber-700">
        <InlineIcon name="compass" /> 이번 달 활동 카드
      </p>
      <p className="mb-2 text-xs text-amber-800">
        3주차에 그 구역에 먼저 들어온 친구가 원하는 카드를 가져가고, 남은 카드는 두 번째 친구가 가져가요. 어떤 활동을 할지 정하고 그에 맞는 수업을 골라 보세요.
      </p>
      <div className="flex flex-col gap-2">
        {zones.map((a) => (
          <div key={a}>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-800">
              <Icon name={ACTIVITY_ICON[a]} className="h-4 w-4" />
              {a === "duel" ? "주문 대결 (이긴 친구가 고르는 마도서)" : ACTIVITY_LABEL[a]}
            </p>
            <CardGrid cards={(game.activityOffers[a]?.cards ?? []).map(offerCardInfo)} />
          </div>
        ))}
      </div>
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
          지목당한 친구는 이번 달 자율활동으로 주문 대결을 하게 돼요. 결과와 상관없이 지목한 친구에게 {fee > 0 ? <><InlineIcon name="heart" /> 매력 {fee}과 </> : null}<InlineIcon name="manaToken" /> 마나기운 {game.rules.duelManaFee}개를 건네요. 지목당한 친구가 먼저 굴리고, 나는 그 결과를 보고 굴려요.
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
        구역당 최대 {game.rules.activityMaxParticipants}명{game.rules.activitySecondParticipantCost > 0 ? <> · 먼저 고른 친구가 있으면 <InlineIcon name="charmToken" /> 매력기운 {game.rules.activitySecondParticipantCost}개를 그 친구에게 건네고 함께해요 (내 매력기운 {game.players[myId]?.charmTokens ?? 0}개)</> : null}. 마법생물·연구실은 둘이 함께면 둘 다 목표가 낮아져요. 처음 고른 친구가 카드를 공개하고 원하는 카드를 가져가요. 남은 카드는 두 번째 참가자가 가져가요.
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
              {activityId === "duel" && <span className="block text-xs opacity-80">아직 안 고른 한 명을 지목 · {fee > 0 ? `매력 ${fee}과 ` : ""}마나기운 {game.rules.duelManaFee}개를 건네요</span>}
              {(who || (isMyTurn && (extra > 0 || openCost > 0))) && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {who && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{who} 선택</span>}
                  {isMyTurn && extra > 0 && !full && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">매력기운 +{extra}</span>}
                  {isMyTurn && openCost > 0 && !full && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">지력기운 {openCost}개 (카드 공개)</span>
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

// 주사위 굴리기 (선 정하기·토너먼트·조련·연구실·주문 대결·탐험 판정·시험): 마나기운을 1~보유 개수만큼 골라 내고(없으면 공짜 1개) 버튼을 누르면
// 서버가 낸 개수만큼 굴려서 결과를 알려 주고, 한 명씩 차례대로 굴린 뒤 결과를 눈으로 확인하고(남은 마나기운 1개당 주사위 1개를 다시 굴릴 수 있다) "확인" 버튼을 눌러야 결과가 적용된다
// 주사위 재료 기운의 이름과 아이콘 (활동마다 주 능력치의 기운이 재료다. 다시 굴리기는 언제나 마나기운)
const FUEL_INFO = {
  intelligence: { icon: "intToken", name: "지력기운" },
  stamina: { icon: "staminaToken", name: "체력기운" },
  charm: { icon: "charmToken", name: "매력기운" },
  mana: { icon: "manaToken", name: "마나기운" },
} as const;

function RollPanel({
  game,
  myId,
  onRoll,
  onReroll,
  onConfirm,
}: {
  game: GameState;
  myId: string;
  onRoll: (diceCount?: number, assist?: number) => void;
  onReroll: (diceIndexes: number[]) => void;
  onConfirm: () => void;
}) {
  const pending = game.pendingRoll;
  const [clickedFor, setClickedFor] = useState<string | null>(null);
  // 다시 굴리려고 고른 내 주사위 번호
  const [selected, setSelected] = useState<number[]>([]);
  // 마나기운을 몇 개 낼지 고른 주사위 수 (null이면 서버가 정한 기본값)
  const [pickedCount, setPickedCount] = useState<number | null>(null);
  // 보조 능력치 기운(체력기운·지력기운)을 몇 개 낼지 고른 수. 굴림이 바뀌면 처음(0개)으로 돌아간다
  const [pickedAssist, setPickedAssist] = useState(0);
  const rollTitle = pending?.title;
  useEffect(() => {
    setPickedAssist(0);
    setPickedCount(null);
  }, [rollTitle]);
  // 버튼을 누른 뒤 응답이 없어도 잠시 뒤 다시 누를 수 있게 풀어 준다
  useEffect(() => {
    if (!clickedFor) return;
    const timer = setTimeout(() => setClickedFor(null), 4000);
    return () => clearTimeout(timer);
  }, [clickedFor]);
  if (!pending) return null;

  const mine = pending.entries.find((e) => e.playerId === myId);
  // 한 명씩 차례대로: 아직 확인하지 않은 첫 참여자가 굴리고 확인한다
  const currentId = pending.entries.find((e) => !e.confirmed)?.playerId;
  const current = pending.entries.find((e) => e.playerId === currentId);
  const myTurnNow = !!mine && currentId === myId;
  const canRoll = myTurnNow && mine!.dice === null;
  // 굴리기 전에 마나기운을 몇 개 낼지 고르는 굴림 (마나기운이 없으면 choiceMax가 없고 공짜 주사위 1개)
  const choiceMax = mine?.diceChoiceMax;
  const fuel = FUEL_INFO[mine?.diceToken ?? "mana"];
  const chosenCount = choiceMax !== undefined ? Math.min(Math.max(pickedCount ?? mine!.diceCount, 1), choiceMax) : (mine?.diceCount ?? 0);
  const assistMax = mine?.assistMax ?? 0;
  const chosenAssist = Math.min(pickedAssist, assistMax);
  const canConfirm = myTurnNow && mine!.dice !== null && !mine!.confirmed;
  const me = game.players[myId];
  // 결과를 확인하기 전에는 남은 마나기운으로 일부 주사위만 다시 굴릴 수 있다 (선 정하기는 제외)
  const canReroll = canConfirm && pending.kind !== "first" && !!mine && (mine.dice?.length ?? 0) > 0;
  const rerollCost = selected.length;
  const rerollOk = rerollCost > 0 && me.manaTokens >= rerollCost;
  const toggle = (i: number) => setSelected((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  const rollKey = `roll:${pending.title}`;
  const confirmKey = `confirm:${pending.title}`;
  const currentName = current?.label.replace(/ \(.*\)$/, "") ?? "";

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
          <li key={entry.playerId} className={`rounded-2xl px-3 py-2 ${entry.playerId === myId ? "bg-pink-50 ring-2 ring-pink-200" : "bg-purple-50"} ${entry.playerId === currentId ? "outline outline-2 outline-pink-300" : ""}`}>
            <p className="flex items-center justify-between gap-2 text-sm text-purple-700">
              <span className="truncate">
                {entry.label}
                {entry.playerId === myId ? " (나)" : ""}
              </span>
              {entry.confirmed ? (
                <span className="shrink-0 text-xs text-emerald-600">확인 완료</span>
              ) : entry.playerId === currentId ? (
                <span className="shrink-0 text-xs font-semibold text-pink-600">지금 차례</span>
              ) : null}
            </p>
            {entry.dice === null ? (
              <p className="text-xs text-purple-400">
                {entry.playerId === currentId
                  ? `굴리는 중이에요${entry.diceChoiceMax === undefined ? ` (주사위 ${entry.diceCount}개)` : ` (${FUEL_INFO[entry.diceToken ?? "mana"].name}을 고르는 중)`}`
                  : "앞사람이 끝나면 굴려요"}
              </p>
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
            {pending.assist && (entry.assist ?? 0) > 0 && (
              <p className="mt-1 text-xs text-emerald-700">
                {pending.assist.title}: {pending.assist.name} {entry.assist}개 사용
              </p>
            )}
          </li>
        ))}
      </ul>

      {canRoll && mine && choiceMax !== undefined && (
        <div className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <p>
            <InlineIcon name={fuel.icon} /> {fuel.name} {choiceMax}개 중 몇 개를 낼까요? 낸 개수만큼 주사위를 굴려요.{" "}
            {fuel.name === "마나기운" ? "안 낸 마나기운은 다시 굴리기에 쓸 수 있어요" : "다시 굴리기는 마나기운으로 해요"}
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
      {canRoll && mine && choiceMax === undefined && (
        <p className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-center text-sm text-sky-800">
          <InlineIcon name={fuel.icon} /> {fuel.name}이 없어서 공짜 주사위 {mine.diceCount}개를 굴려요
        </p>
      )}
      {canRoll && mine && pending.assist && assistMax > 0 && (
        <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>
            <b>{pending.assist.title}</b> — {pending.assist.hint}. {pending.assist.name}를 몇 개 낼까요? (안 내도 돼요, 지금 {assistMax}개까지)
          </p>
          <div className="mt-2 flex items-center justify-center gap-4">
            <button
              aria-label="보조 기운 하나 줄이기"
              disabled={chosenAssist <= 0}
              className="h-12 w-12 rounded-full bg-white text-2xl font-semibold text-emerald-700 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
              onClick={() => setPickedAssist(chosenAssist - 1)}
            >
              −
            </button>
            <span className="min-w-20 text-center text-lg font-semibold">{chosenAssist}개</span>
            <button
              aria-label="보조 기운 하나 늘리기"
              disabled={chosenAssist >= assistMax}
              className="h-12 w-12 rounded-full bg-white text-2xl font-semibold text-emerald-700 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
              onClick={() => setPickedAssist(chosenAssist + 1)}
            >
              +
            </button>
          </div>
        </div>
      )}
      {canRoll && mine ? (
        <button
          disabled={clickedFor === rollKey}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-pink-500 py-3 text-lg font-semibold text-white active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
          onClick={() => {
            setClickedFor(rollKey);
            onRoll(choiceMax !== undefined ? chosenCount : undefined, chosenAssist);
          }}
        >
          <span className={clickedFor === rollKey ? "dice-wiggle inline-flex" : "inline-flex"}>
            <Icon name="dice" className="h-6 w-6" />
          </span>
          {clickedFor === rollKey ? "굴리는 중..." : chosenCount > 1 ? `주사위 ${chosenCount}개 굴리기` : "주사위 굴리기"}
        </button>
      ) : canConfirm ? (
        <>
          {canReroll && (
            <div className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <p>
                <InlineIcon name="manaToken" /> 마나기운 {me.manaTokens}개 · 주사위를 눌러 고르면 <b>마나기운 1개당 주사위 1개</b>를 다시 굴려요
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
                {rerollCost === 0 ? "다시 굴릴 주사위를 골라요" : rerollOk ? `선택한 ${rerollCost}개 다시 굴리기 (마나기운 ${rerollCost}개)` : "마나기운이 부족해요"}
              </button>
            </div>
          )}
          <p className="mt-3 text-center text-sm text-purple-600">결과를 확인했으면 다음 사람에게 넘겨요. 모두 확인하면 결과가 적용돼요.</p>
          <button
            disabled={clickedFor === confirmKey}
            className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-purple-500 py-3 text-lg font-semibold text-white active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
            onClick={() => {
              setClickedFor(confirmKey);
              onConfirm();
            }}
          >
            <Icon name="check" className="h-6 w-6" />
            {clickedFor === confirmKey ? "확인 중..." : "결과 확인, 다음 사람에게"}
          </button>
        </>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm text-purple-600" aria-live="polite">
          <span className="dice-wiggle inline-flex text-pink-400">
            <Icon name="dice" className="h-5 w-5" />
          </span>
          {!current
            ? "결과를 적용하는 중..."
            : current.dice === null
              ? `${currentName}님 차례예요. 굴리기를 기다리는 중...`
              : `${currentName}님이 결과를 확인하는 중...`}
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
        <p className="text-xs">토너먼트 참가를 고르면 마나기운을 모두 내고 낸 개수만큼 주사위를 굴려, 나온 눈을 모두 더한 칸만큼 트랙을 전진해요. 트랙에는 상한이 없어요!</p>
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
  { id: "news", icon: "scroll", label: "기록" },
  { id: "rules", icon: "book", label: "규칙" },
];

export function GameBoard({
  game,
  myId,
  errorMessage,
  errorSeq,
  onTakeClassCard,
  onCram,
  onSelectActivity,
  onPickActivityCard,
  onRollDice,
  onRerollDice,
  onConfirmRoll,
  onLeave,
  isHost,
  offline,
  notice,
  noticeSeq,
  reactions,
  onEmoji,
  onKick,
  onRematch,
}: {
  game: GameState;
  myId: string;
  errorMessage: string | null;
  errorSeq: number;
  onTakeClassCard: (cardId: string | null) => void;
  onCram: (from: KeptToken | null) => void;
  onSelectActivity: (activityId: ActivityId, targetPlayerId?: string) => void;
  onPickActivityCard: (cardId: string | null) => void;
  onRollDice: (diceCount?: number, assist?: number) => void;
  onRerollDice: (diceIndexes: number[]) => void;
  onConfirmRoll: () => void;
  onLeave: () => void;
  isHost: boolean;
  // 접속이 끊긴 친구들의 id, 방장이 누군가를 내보냈을 때의 안내
  offline: string[];
  notice: string | null;
  noticeSeq: number;
  reactions: Reaction[];
  onEmoji: (emoji: string) => void;
  onKick: (playerId: string) => void;
  onRematch: () => void;
}) {
  const [tab, setTab] = useState<TabId>("game");
  const latestExam = game.examResults[game.examResults.length - 1];
  // 3주차: 선택 단계에서는 고를 차례인 사람, 진행 단계에서는 카드를 고르는 사람이 행동한다
  const activityTurnId = game.activityStage === "choose" ? game.activityOrder[game.activityTurnPointer] : game.pendingPick?.playerId;
  // 주사위는 한 명씩 차례대로 굴린다
  const myRollPending = currentRoller(game) === myId;
  // 내가 행동해야 하는 순간에는 게임 탭에 알림 점을 띄운다
  const myTurn =
    myRollPending ||
    (!game.pendingRoll &&
      ((game.phase === "class" && game.classPickOrder[game.classPickPointer] === myId) ||
        (game.phase === "cram" && game.cramOrder[game.cramPointer] === myId) ||
        (game.phase === "activity" && activityTurnId === myId)));
  // 방장은 게임 중에도 누구든(자신 제외) 내보낼 수 있다. 단, 2명 이상이 남아야 한다
  const canKickInGame = isHost && game.phase !== "ended" && game.turnOrder.length > 2;
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
          : game.phase === "cram"
          ? "1주차 시험 주간 · 벼락치기"
          : game.phase === "midterm_exam"
          ? "중간고사"
          : game.phase === "final_exam"
            ? "기말고사"
            : "게임 종료";

  // 비교표의 행을 누르면 친구들 탭에서 그 사람의 카드 목록을 펼쳐 보여 준다
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);
  const openPlayer = (id: string) => {
    setFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
    setTab("players");
  };
  useEffect(() => {
    if (tab !== "players" || !focus) return;
    const t = window.setTimeout(() => document.getElementById(`player-${focus.id}`)?.scrollIntoView({ block: "center" }), 50);
    return () => window.clearTimeout(t);
  }, [tab, focus]);

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
          <GameMenu
            inGame={game.phase !== "ended"}
            onLeave={onLeave}
            kickable={
              canKickInGame
                ? game.turnOrder.filter((id) => id !== myId).map((id) => ({ id, name: game.players[id].name }))
                : []
            }
            onKick={onKick}
          />
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-purple-100 overflow-hidden" aria-hidden>
          <div className="h-full bg-pink-300 transition-all" style={{ width: `${(game.round / 12) * 100}%` }} />
        </div>
        <PlayerTable game={game} myId={myId} offline={offline} onOpenPlayer={openPlayer} />
      </header>

      <main className="flex-1 px-4 py-4 pb-[calc(9rem+env(safe-area-inset-bottom))] flex flex-col gap-4">
        {tab === "game" && (
          <>
            {game.phase !== "setup" && game.phase !== "ended" && (
              <p className="rounded-2xl bg-white/70 px-3 py-1.5 text-center text-xs text-purple-600">
                <InlineIcon name="sparkle" /> 이번 달 선: <b>{starterName}</b> (선부터 시계방향으로 진행해요)
              </p>
            )}
            {game.news && game.phase !== "setup" && game.phase !== "ended" && <NewsPanel game={game} />}
            <WaitingBanner game={game} offline={offline} isHost={isHost} myId={myId} onKick={onKick} />
            {game.phase === "cram" && <CramPanel game={game} myId={myId} onCram={onCram} />}
            {game.pendingRoll && <RollPanel game={game} myId={myId} onRoll={onRollDice} onReroll={onRerollDice} onConfirm={onConfirmRoll} />}
            {game.phase === "class" && !game.pendingRoll && <ClassPhasePanel game={game} myId={myId} onTake={onTakeClassCard} />}
            {((game.phase === "class" && !game.pendingRoll) || (game.phase === "activity" && game.activityStage === "choose")) && <MonthOffersPanel game={game} />}
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
                <span className="font-display text-amber-700"><InlineIcon name="scroll" /> 방금 일어난 일</span>
                <span className="block truncate">{game.log[game.log.length - 1].message}</span>
              </button>
            )}
          </>
        )}

        {tab === "tournament" && <TournamentPanel game={game} myId={myId} />}

        {tab === "players" && (
          <div className="flex flex-col gap-2">
            {game.turnOrder.map((id) => (
              <div key={id} className="flex flex-col gap-1">
                <PlayerStatCard key={`${id}-${focus?.id === id ? focus.seq : 0}`} player={game.players[id]} isMe={id === myId} rules={game.rules} defaultOpen={id === myId || focus?.id === id} />
                <PlayerAdminRow name={game.players[id].name} offline={offline.includes(id)} canKick={canKickInGame && id !== myId} onKick={() => onKick(id)} />
              </div>
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
        game={game}
        reactions={reactions}
        names={Object.fromEntries(game.turnOrder.map((id) => [id, game.players[id].name]))}
        myId={myId}
        onEmoji={onEmoji}
      />
      <AnnouncementLayer game={game} myId={myId} />
      <ErrorToast message={errorMessage} seq={errorSeq} />
      <NoticeToast message={notice} seq={noticeSeq} />
    </div>
  );
}
