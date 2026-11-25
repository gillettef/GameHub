import { useState, type CSSProperties, type ReactNode } from "react";
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
  creatureGiftText,
  duelTargets,
  effectiveStat,
  energyText,
  orderText,
  type ActivityId,
  type CreatureElement,
  type GameState,
  type KeptToken,
  type OfferCardView,
  type PlayerGameState,
  cramSources,
  ENERGY_FIELD,
  STAT_LABEL,
  type NewsCard,
  type StatKey,
} from "./gameTypes";
import { CardButton, CardGrid, PickGrid, type CardInfo } from "./CardArt";
import { classCardBlockReason, classCardData, GameCardGrid, GamePickGrid, type GameCardData } from "./GameCard";

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

export function PlayerStatCard({ player, isMe, rules, defaultOpen }: { player: PlayerGameState; isMe: boolean; rules: GameState["rules"]; defaultOpen: boolean }) {
  // 기운은 지금 가진 양으로 보여 준다 (한도 옵션이 켜져 있으면 "가진 양/한도")
  const energy = (kind: KeptToken) => energyText(player, kind, rules);
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
        {!rules.disabledActivities.includes("tournament") && (
          <>
            <span className="whitespace-nowrap"><InlineIcon name="trophy" /> {rules.tournamentCards ? `대회 입상 ${player.feats?.tournament ?? 0}번` : `마법 경연 ${player.tournamentTrack}칸`}</span> ·{" "}
          </>
        )}
        <span className="whitespace-nowrap"><InlineIcon name="book" /> 수업 {player.classCards.length}장</span>
        {isMe && player.dream && rules.dreamCredit > 0 && (
          <>
            {" "}· <span className="whitespace-nowrap"><InlineIcon name="compass" /> 장래희망 {player.dream.name}</span>
          </>
        )}
      </p>
      {!rules.skillRules && <p className="text-sm text-purple-700 leading-7">
        <InlineIcon name="intToken" /> 지력기운 {energy("intelligence")} · <InlineIcon name="staminaToken" /> 체력기운 {energy("stamina")} · <InlineIcon name="charmToken" /> 매력기운 {energy("charm")} · <InlineIcon name="manaToken" /> 마나기운 {energy("mana")}
      </p>}
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
      {ownedCardGroups(player, rules).length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-purple-500">가진 카드 (누르면 크게 볼 수 있어요)</p>
          <div className="flex flex-col gap-2">
            {ownedCardGroups(player, rules).map((g) => (
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
          {rules.graduationCategories.includes("creature") && (
            <span className="whitespace-nowrap font-semibold text-amber-700">
              세트 {creatureSets(player.creatures)}개 · 마법생물상 점수 {player.creatures.length + creatureSets(player.creatures)}
            </span>
          )}
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
function ownedCardGroups(player: PlayerGameState, rules: GameState["rules"]): { key: string; icon: IconName; label: string; count: number; node: ReactNode }[] {
  const groups = [
    { key: "class", icon: "book" as IconName, label: "정규수업 수업카드", cards: player.classCards.map((c) => classCardData(c, rules)) as (GameCardData | CardInfo)[] },
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
        lines: [c.description, creatureGiftText(c, rules)],
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

export function ClassPhasePanel({ game, myId, onTake }: { game: GameState; myId: string; onTake: (cardId: string, mode: "learn" | "note") => void }) {
  const me = game.players[myId];
  const currentId = game.classPickOrder[game.classPickPointer];
  const isMyTurn = currentId === myId;
  const nameOf = (id: string) => game.players[id].name;

  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
      <p className="text-sm text-purple-500 mb-1">2주차(정규수업): {game.rules.skillRules ? `공개된 수업카드 중 1장을 배우거나(능력치 +1) 노트로 보관해요(그 과목 판정 +${game.rules.noteBonus}).` : "수업카드는 무료예요. 가져가면 그 과목의 기운을 얻어요."} {orderText(game.rules)} 한 장씩 가져가요</p>
      {!game.rules.skillRules && <p className="text-xs text-purple-500 mb-2">
        <InlineIcon name="intToken" /> 지력기운 {energyText(me, "intelligence", game.rules)} · <InlineIcon name="staminaToken" /> 체력기운 {energyText(me, "stamina", game.rules)} · <InlineIcon name="charmToken" /> 매력기운 {energyText(me, "charm", game.rules)} · <InlineIcon name="manaToken" /> 마나기운 {energyText(me, "mana", game.rules)}
      </p>}
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
              const noteRoom = (me.notes ?? []).length < effectiveStat(me, "intelligence");
              return {
                key: card.id,
                card: classCardData(card, game.rules),
                blockReason: classCardBlockReason(me, card),
                ...(game.rules.skillRules
                  ? {
                      actions: isMyTurn
                        ? [
                            { label: `배우기 (${STAT_LABEL[card.stat]} +${card.gain})`, onAction: () => onTake(card.id, "learn"), disabled: !allowed },
                            { label: noteRoom ? `노트로 보관 (+${game.rules.noteBonus})` : "노트가 가득 찼어요", onAction: () => onTake(card.id, "note"), disabled: !allowed || !noteRoom, tone: "note" as const },
                          ]
                        : undefined,
                    }
                  : {
                      onAction: isMyTurn ? () => onTake(card.id, "learn") : undefined,
                      actionLabel: !allowed ? "선수 조건이 모자라요" : applied < card.gain ? `가져가기 (+${applied}, 한도)` : `가져가기 (+${applied})`,
                      disabled: !allowed,
                    }),
              };
            })}
          />
        </div>
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

export function NewsPanel({ game }: { game: GameState }) {
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
export function CramPanel({ game, myId, onCram }: { game: GameState; myId: string; onCram: (from: KeptToken | null) => void }) {
  const currentId = game.cramOrder[game.cramPointer];
  // 누른 버튼은 차례가 바뀌면 풀린다
  const [clickedFor, setClickedFor] = useState<{ id: string; value: string } | null>(null);
  const clicked = clickedFor?.id === currentId ? clickedFor.value : null;
  const setClicked = (value: string) => setClickedFor({ id: currentId, value });
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
        가진 기운 1개를 <InlineIcon name={toInfo.icon} /> {toInfo.name} 1개로 바꿀 수 있어요 (안 해도 돼요). {orderText(game.rules)} 한 명씩 골라요
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
export function ExamInfoPanel({ game }: { game: GameState }) {
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

// 구역에 공개된 카드 중 하나를 고르는 패널 (마법생물·연구 카드·별빛 다락방 카드 공통)
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
          {!game.rules.skillRules && <>(<InlineIcon name="staminaToken" /> 내 체력기운 {me.staminaTokens}개 · <InlineIcon name="manaToken" /> 마나기운 {me.manaTokens}개 · <InlineIcon name="charmToken" /> 매력기운 {me.charmTokens}개)</>}
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
      </div>
    </div>
  );
}

// 이번 달 활동 카드 (50절): 1주차에 공개된 구역별 카드를 정규수업·활동 선택 때 함께 본다 (누르면 크게 보기)
const MONTH_ZONES: ActivityId[] = ["tournament", "creature", "lab", "exploration"];
export function MonthOffersPanel({ game }: { game: GameState }) {
  const zones = MONTH_ZONES.filter((a) => (game.activityOffers[a]?.cards.length ?? 0) > 0);
  // 62절 한 덱: 종류를 섞어 인원만큼(62-7절) 한 줄로 보여 준다 (카드마다 종류·쓰는 기운 배지)
  if (game.rules.activityMarket) {
    const cards = MARKET_ZONES.flatMap((a) => (game.activityOffers[a]?.cards ?? []).map((card) => marketCardInfo(a, card)));
    if (cards.length === 0) return null;
    return (
      <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-3">
        <p className="font-display text-base text-amber-700">
          <InlineIcon name="compass" /> 이번 달 활동 카드 {cards.length}장
        </p>
        <p className="mb-2 text-xs text-amber-800">3주차에 학점이 낮은 친구부터 1장씩 골라요. 하고 싶은 카드의 기운을 주는 수업을 골라 두세요.</p>
        <CardGrid cards={cards} />
      </div>
    );
  }
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
              {a === "duel" ? "마법 겨루기 (이긴 친구가 고르는 마도서)" : ACTIVITY_LABEL[a]}
            </p>
            <CardGrid cards={(game.activityOffers[a]?.cards ?? []).map(offerCardInfo)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 62절 한 덱: 활동 카드의 종류와 굴릴 때 쓰는 기운
const MARKET_ZONES: ActivityId[] = ["creature", "exploration", "lab", "duel"];
const MARKET_KIND: Partial<Record<ActivityId, string>> = { creature: "조련 · 매력기운", exploration: "탐험 · 체력기운", lab: "연구 · 지력기운", duel: "겨루기 · 마나기운" };
function marketCardInfo(a: ActivityId, card: OfferCardView, note?: string): CardInfo {
  const info = offerCardInfo(card);
  const tags = a === "duel" ? undefined : info.badge;
  return { ...info, badge: [note, MARKET_KIND[a], tags].filter(Boolean).join(" · "), chip: note ?? MARKET_KIND[a] };
}

// 62절 한 덱: 공개된 카드마다 누가 골랐는지 (카드를 정해 고른 친구는 그 카드, 종류만 고른 친구(봇)와 겨루기는 그 종류의 남은 카드를 앞에서부터 채운다).
// 진행 단계에서는 이미 끝난 활동의 카드가 공개 목록에서 빠져 있으므로 아직 진행하지 않은 선택만 본다
function marketTakenBy(game: GameState): Map<string, string> {
  const from = game.activityStage === "resolve" ? game.activityResolvePointer : 0;
  const pending = game.activityChoices.slice(from);
  const takenBy = new Map<string, string>();
  for (const c of pending) if (c.cardId) takenBy.set(c.cardId, c.playerId);
  for (const c of pending) {
    if (c.cardId) continue;
    const free = (game.activityOffers[c.activityId]?.cards ?? []).find((card) => !takenBy.has(card.id));
    if (free) takenBy.set(free.id, c.playerId);
  }
  return takenBy;
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
            {id === game.turnOrder[game.startingPlayerIndex] ? " · 선" : ""}
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
  duelPicking,
  onDuelPicking,
}: {
  game: GameState;
  myId: string;
  onSelect: (activityId: ActivityId, targetPlayerId?: string, cardId?: string) => void;
  // 겨루기 카드를 골라 지목할 친구를 고르는 중 (취소는 아래 행동 줄)
  duelPicking: boolean;
  onDuelPicking: (on: boolean) => void;
}) {
  const currentTurnPlayerId = game.activityOrder[game.activityTurnPointer];
  const isMyTurn = currentTurnPlayerId === myId;
  const targets = duelTargets(game, myId);
  const pendingActivity = duelPicking ? "duel" : null;
  const setPendingActivity = (a: ActivityId | null) => onDuelPicking(a === "duel");
  const fee = game.rules.duelCharmFee;
  const forcedBy = game.duels.find((d) => d.targetId === myId);

  if (isMyTurn && pendingActivity === "duel") {
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
        <p className="text-sm text-purple-600 mb-1">{game.rules.duelTargetKeepsTurn ? "겨룰 친구 한 명을 지목하세요" : "아직 활동을 고르지 않은 한 명을 지목하세요"}</p>
        <ul className="text-xs text-purple-500 mb-2 list-disc pl-4 space-y-0.5">
          <li>
            {game.rules.duelDefenderStatDice === "flat" ? "친구는 주사위 1개 + 주문력으로 자동으로 막고, 나는 그 결과를 보고 굴려요" : "친구가 먼저 굴리고, 나는 그 결과를 보고 굴려요"}
            {game.rules.duelTieWinner === "defender" ? " (더 높아야 이겨요)" : ""}
          </li>
          <li>{game.rules.duelTargetKeepsTurn ? "지목당한 친구도 이번 달 자기 활동은 그대로 해요" : "지목당한 친구는 이번 달 자율활동으로 마법 겨루기를 하게 돼요"}</li>
          {game.rules.duelTargetOnce && <li>한 친구는 한 달에 한 번만 지목받아요</li>}
          {(fee > 0 || game.rules.duelManaFee > 0) && (
            <li>
              결과와 상관없이 지목한 친구에게 {fee > 0 ? <><InlineIcon name="heart" /> 매력 {fee} </> : null}
              {game.rules.duelManaFee > 0 ? <><InlineIcon name="manaToken" /> 마나기운 {game.rules.duelManaFee}개</> : null}를 건네요
            </li>
          )}
        </ul>
        <div className="flex flex-col gap-2">
          {targets.map((id) => {
            const spell = effectiveStat(game.players[id], "spellPower");
            return (
              <button
                key={id}
                className="flex items-center gap-2 rounded-xl border border-purple-200 min-h-12 px-3 py-3 text-left text-purple-700 bg-purple-50 active:scale-95 transition-transform"
                onClick={() => onSelect("duel", id)}
              >
                <span className="truncate">{game.players[id].name}</span>
                <span className="ml-auto shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
                  <InlineIcon name="sparkle" /> 주문력 {spell}
                  {game.rules.duelDefenderStatDice === "flat" ? ` · 막기 ${spell + 1}~${spell + 6}` : ""}
                </span>
              </button>
            );
          })}

        </div>
      </div>
    );
  }

  const turnText = isMyTurn
    ? game.rules.activityMarket
      ? "내 차례예요! 하고 싶은 카드를 1장 골라요"
      : "내 차례예요! 하고 싶은 활동을 골라요"
    : forcedBy
      ? game.rules.duelTargetKeepsTurn
        ? `${game.players[forcedBy.challengerId].name}님이 나에게 마법 겨루기를 걸었어요! ${game.players[myId]?.hasActedThisPhase ? "내 활동은 그대로 해요" : "내 활동은 내 차례에 그대로 골라요"}${game.rules.duelDefenderStatDice === "flat" ? " (막기는 주사위 1개 + 주문력으로 자동)" : ""}`
        : `${game.players[forcedBy.challengerId].name}님이 나를 지목했어요! 이번 달 활동은 마법 겨루기예요`
      : currentTurnPlayerId
        ? `${game.players[currentTurnPlayerId]?.name}님이 ${game.rules.activityMarket ? "카드" : "활동"}를 고르는 중이에요...`
        : "모두 골랐어요";

  // 62절 한 덱: 공개된 활동 카드 중 1장을 고른다 (겨루기 카드는 이어서 친구를 지목)
  if (game.rules.activityMarket) {
    const me = game.players[myId];
    const nameOf = (id: string) => game.players[id]?.name ?? "";
    // 이미 고른 카드: 카드를 정해 고른 친구는 그 카드, 종류만 고른 친구(봇)와 겨루기는 그 종류의 남은 카드를 앞에서부터
    const takenBy = marketTakenBy(game);
    const duelBlocked = activityBlockReason(game, myId, "duel");
    const items = MARKET_ZONES.flatMap((a) =>
      (game.activityOffers[a]?.cards ?? []).map((card) => {
        const owner = takenBy.get(card.id);
        const blocked = !owner && a === "duel" ? duelBlocked : null;
        return {
          key: card.id,
          card: marketCardInfo(a, card, owner ? `${nameOf(owner)} 선택` : blocked ? "지목할 친구 없음" : undefined),
          onAction: isMyTurn ? () => (a === "duel" ? setPendingActivity("duel") : onSelect(a, undefined, card.id)) : undefined,
          actionLabel: owner ? `${nameOf(owner)} 선택` : blocked ? "지목할 친구 없음" : a === "duel" ? "친구 지목하기" : "이 카드 고르기",
          disabled: Boolean(owner || blocked),
        };
      }),
    );
    return (
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
        <p className="text-sm text-purple-600 mb-1">3주차(자율활동): {orderText(game.rules)} 활동 카드를 1장씩 골라요</p>
        <p className="text-xs text-purple-500 mb-2">{game.rules.skillRules ? "모두 고르면 고른 순서대로 굴려요(주문력만큼 주사위 + 그 분야 능력치). " : "모두 고르면 고른 순서대로 굴려요(카드의 기운을 낸 만큼, 실패해도 1개는 남아요). "}카드를 누르면 크게 볼 수 있어요.</p>
        <ChooseOrder game={game} myId={myId} currentId={currentTurnPlayerId} />
        <p className={`mb-2 rounded-2xl px-3 py-2 text-sm ${isMyTurn ? "bg-pink-50 text-pink-700" : "bg-purple-50 text-purple-600"}`}>{turnText}</p>
        {me && !game.rules.skillRules && (
          <div className="mb-2 flex flex-wrap gap-1.5 text-xs" aria-label="내 기운 (한 번에 낼 수 있는 개수)">
            {(
              [
                ["charmToken", "매력", me.charmTokens, "charm"],
                ["staminaToken", "체력", me.staminaTokens, "stamina"],
                ["intToken", "지력", me.intelligenceTokens, "intelligence"],
                ["manaToken", "마나", me.manaTokens, "spellPower"],
              ] as const
            ).map(([icon, label, have, stat]) => (
              <span key={label} className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">
                <InlineIcon name={icon} /> {label} {have}
                {game.rules.rollLimitBonus !== null ? <span className="text-purple-500"> (한 번에 {Math.min(have, effectiveStat(me, stat) + game.rules.rollLimitBonus)})</span> : null}
              </span>
            ))}
          </div>
        )}
        <PickGrid items={items} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-sm p-4">
      <p className="text-sm text-purple-600 mb-1">3주차(자율활동): {orderText(game.rules)} 활동을 골라요</p>
      <p className="text-xs text-purple-500 mb-2">모두 고르고 나면 고른 순서대로 한 명씩 차례로 진행돼요. 다른 친구가 고른 활동도 여기서 볼 수 있어요.</p>
      <ChooseOrder game={game} myId={myId} currentId={currentTurnPlayerId} />
      <p className={`mb-3 rounded-2xl px-3 py-2 text-sm ${isMyTurn ? "bg-pink-50 text-pink-700" : "bg-purple-50 text-purple-600"}`}>{turnText}</p>
      <p className="text-xs text-purple-500 mb-2">
        구역당 최대 {game.rules.activityMaxParticipants}명{game.rules.activitySecondParticipantCost > 0 ? <> · 먼저 고른 친구가 있으면 <InlineIcon name="charmToken" /> 매력기운 {game.rules.activitySecondParticipantCost}개를 그 친구에게 건네고 함께해요 (내 매력기운 {game.players[myId]?.charmTokens ?? 0}개)</> : null}. 먼저 고른 친구가 원하는 카드를 가져가요. 남은 카드는 두 번째 참가자가 가져가요.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {ACTIVITY_IDS.filter((a) => !game.rules.disabledActivities.includes(a)).map((activityId) => {
          const label = ACTIVITY_LABEL[activityId];
          const occupants = game.activitySlots[activityId];
          // 내가 아직 고르기 전이라면 내 차례가 아니어도 지금 고를 수 없는 구역은 미리 회색으로 보여 준다
          const reason = game.players[myId]?.hasActedThisPhase ? null : activityBlockReason(game, myId, activityId);
          const extra = activityExtraCost(game, activityId);
          const openCost = activityOpenCost(game, activityId);
          const full = occupants.length >= game.rules.activityMaxParticipants;
          // 이미 이 구역을 고른 친구들 (마법 겨루기는 누구를 지목했는지도 함께)
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
              {activityId === "duel" && !game.rules.duelTargetKeepsTurn && <span className="block text-xs opacity-80">아직 안 고른 한 명을 지목 · {fee > 0 ? `매력 ${fee}과 ` : ""}마나기운 {game.rules.duelManaFee}개를 건네요</span>}
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
                {now && game.rules.activityMarket
                  ? (() => {
                      const id = choice.cardId ?? [...marketTakenBy(game)].find(([, pid]) => pid === choice.playerId)?.[0];
                      const card = id ? game.activityOffers[choice.activityId]?.cards.find((c) => c.id === id) : undefined;
                      return card ? (
                        <p className="mt-1 rounded-xl bg-white/70 px-2 py-1 text-xs text-purple-700">
                          <InlineIcon name="scroll" /> {choice.cardId || choice.activityId === "duel" ? "고른 카드" : "가져갈 카드"}: {card.name}
                        </p>
                      ) : null;
                    })()
                  : now &&
                    offerNames(game, choice.activityId) && (
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
            <InlineIcon name="swords" /> {game.rules.duelDefenderStatDice === "flat" ? "마법 겨루기에 지목당한 친구는 도전자의 차례에 주사위 1개 + 주문력으로 자동으로 막아요." : "마법 겨루기에 지목당한 친구는 도전자의 차례에 함께 대결해요."}
          </p>
        )}
      </div>
    </div>
  );
}

export function ActivityPhasePanel({
  game,
  myId,
  onSelect,
  onPick,
  duelPicking,
  onDuelPicking,
}: {
  game: GameState;
  myId: string;
  onSelect: (activityId: ActivityId, targetPlayerId?: string, cardId?: string) => void;
  onPick: (cardId: string | null) => void;
  duelPicking: boolean;
  onDuelPicking: (on: boolean) => void;
}) {
  return game.activityStage === "resolve" ? (
    <ResolvePanel game={game} myId={myId} onPick={onPick} />
  ) : (
    <ChoosePanel game={game} myId={myId} onSelect={onSelect} duelPicking={duelPicking} onDuelPicking={onDuelPicking} />
  );
}

// 주사위 굴리기 (선 정하기·조련·연구·탐험·겨루기·시험): 한 명씩 차례대로 굴리고, 굴린 사람이 결과를 보고 다시 굴리기·노트를 쓴 뒤 확인한다.
// 굴리기·다시 굴리기·확인 버튼은 아래 행동 줄(⑤)에 있고, 이 패널은 굴림 상황과 고르기(주사위 선택, 낼 기운 개수, 노트)를 보여 준다.
// 63절(skillRules): 주사위 = 주문력, 더하는 값 = 그 분야 능력치·생물·노트, 다시 굴리기 = 체력 번(주사위 1개씩), 노트는 그 과목만 +2
const FUEL_INFO = {
  intelligence: { icon: "intToken", name: "지력기운" },
  stamina: { icon: "staminaToken", name: "체력기운" },
  charm: { icon: "charmToken", name: "매력기운" },
  mana: { icon: "manaToken", name: "마나기운" },
} as const;

/** 굴림 화면에서 고르는 것(다시 굴릴 주사위, 낼 기운 개수, 보조 기운). 행동 줄의 버튼과 함께 쓰려고 GameScreen 이 들고 있다 */
export interface RollPicks {
  selected: number[];
  count: number | null;
  assist: number;
}
export const EMPTY_PICKS: RollPicks = { selected: [], count: null, assist: 0 };

type Entry = NonNullable<GameState["pendingRoll"]>["entries"][number];

/** 굴림에서 내가 지금 할 수 있는 것 (패널·행동 줄 공용) */
export function rollState(game: GameState, myId: string, picks: RollPicks) {
  const pending = game.pendingRoll;
  if (!pending) return null;
  const skill = game.rules.skillRules;
  const mine = pending.entries.find((e) => e.playerId === myId);
  const currentId = pending.entries.find((e) => !e.confirmed)?.playerId;
  const myTurnNow = !!mine && currentId === myId;
  const canRoll = myTurnNow && mine!.dice === null;
  const choiceMax = mine?.diceChoiceMax;
  const base = mine?.baseDice ?? 0;
  const minCount = base > 0 ? 0 : 1;
  const chosenCount = choiceMax !== undefined ? Math.min(Math.max(picks.count ?? mine!.diceCount, minCount), choiceMax) : (mine?.diceCount ?? 0);
  const rollDice = chosenCount + (choiceMax !== undefined ? base : 0);
  const canConfirm = myTurnNow && mine!.dice !== null && !mine!.confirmed;
  const me = game.players[myId];
  const rerollsLeft = skill ? (mine?.rerollsLeft ?? 0) : (me?.manaTokens ?? 0);
  const canReroll = canConfirm && pending.kind !== "first" && (skill || game.rules.reroll) && (mine?.dice?.length ?? 0) > 0 && rerollsLeft > 0;
  const selected = canReroll ? picks.selected.filter((i) => i < (mine?.dice?.length ?? 0)) : [];
  const rerollOk = selected.length > 0 && selected.length <= rerollsLeft;
  return { pending, skill, mine, currentId, myTurnNow, canRoll, choiceMax, base, minCount, chosenCount, rollDice, canConfirm, canReroll, rerollsLeft, selected, rerollOk };
}

const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function EntryRow({ entry, game, myId, currentId, selectable, selected, onToggle }: { entry: Entry; game: GameState; myId: string; currentId?: string; selectable: boolean; selected: number[]; onToggle: (i: number) => void }) {
  const skill = game.rules.skillRules;
  const total = entry.dice ? sumOf(entry.dice) + (entry.bonus ?? 0) : 0;
  return (
    <li className={`rounded-2xl px-3 py-2 ${entry.playerId === myId ? "bg-pink-50 ring-2 ring-pink-200" : "bg-purple-50"} ${entry.playerId === currentId ? "outline outline-2 outline-pink-300" : ""}`}>
      <p className="flex items-center justify-between gap-2 text-sm text-purple-700">
        <span className="truncate">
          {entry.label}
          {entry.playerId === myId && entry.label !== "나" ? " (나)" : ""}
        </span>
        {entry.confirmed ? (
          <span className="shrink-0 text-xs text-emerald-600">확인 완료</span>
        ) : entry.playerId === currentId ? (
          <span className="shrink-0 text-xs font-semibold text-pink-600">지금 차례</span>
        ) : null}
      </p>
      {entry.dice === null ? (
        <p className="text-xs text-purple-500">
          {entry.playerId === currentId
            ? `굴리는 중이에요${entry.diceChoiceMax === undefined ? ` (주사위 ${entry.diceCount}개)` : ` (${FUEL_INFO[entry.diceToken ?? "mana"].name}을 고르는 중)`}`
            : `앞사람이 끝나면 굴려요${skill ? ` (주사위 ${entry.diceCount}개)` : ""}`}
        </p>
      ) : entry.dice.length === 0 ? (
        <p className="text-xs text-purple-500">굴릴 주사위가 없어요</p>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {entry.dice.map((d, i) => (
            <DiceFace
              key={`${i}-${entry.rerollCounts?.[i] ?? 0}`}
              value={d}
              delay={(entry.rerollCounts?.[i] ?? 0) > 0 ? 0 : i * 0.06}
              selected={selectable && selected.includes(i)}
              onToggle={selectable ? () => onToggle(i) : undefined}
            />
          ))}
          {entry.bonus !== undefined ? (
            <b className="ml-1 text-purple-700">
              {skill ? `+ ${entry.bonus} = ${total}` : `+ 주문력 ${entry.bonus} = 막기 ${total}`}
            </b>
          ) : (
            entry.dice.length > 1 && <b className="ml-1 text-purple-700">합계 {sumOf(entry.dice)}</b>
          )}
          {entry.rerolls > 0 && <span className="ml-1 text-xs text-sky-700">다시 굴림 {entry.rerolls}번</span>}
        </div>
      )}
      {skill && entry.bonusParts && entry.bonusParts.length > 0 && (
        <p className="mt-1 text-xs text-purple-600">더하는 값: {entry.bonusParts.map((b) => `${b.label} +${b.value}`).join(" · ")}</p>
      )}
      {entry.notesPlayed && entry.notesPlayed.length > 0 && <p className="mt-0.5 text-xs text-emerald-700">펼친 노트: {entry.notesPlayed.map((s) => STAT_LABEL[s]).join(", ")}</p>}
      {entry.targets && entry.dice !== null && (
        <p className="mt-0.5 text-xs text-purple-600">
          목표: 성공 {entry.targets.success}
          {entry.targets.great !== undefined ? ` · 대성공 ${entry.targets.great}` : ""}
          {total >= (entry.targets.great ?? Infinity) ? " → 대성공!" : total >= entry.targets.success ? " → 성공" : " → 아직 모자라요"}
        </p>
      )}
      {game.pendingRoll?.assist && (entry.assist ?? 0) > 0 && (
        <p className="mt-1 text-xs text-emerald-700">
          {game.pendingRoll.assist.title}: {game.pendingRoll.assist.name} {entry.assist}개 사용
        </p>
      )}
    </li>
  );
}

function Stepper({ label, value, min, max, onChange, children }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; children?: ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-4">
      <button aria-label={`${label} 하나 줄이기`} disabled={value <= min} className="h-12 w-12 rounded-full bg-white text-2xl font-semibold text-sky-700 shadow-sm active:scale-95 transition-transform disabled:opacity-40" onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="min-w-24 text-center">{children}</span>
      <button aria-label={`${label} 하나 늘리기`} disabled={value >= max} className="h-12 w-12 rounded-full bg-white text-2xl font-semibold text-sky-700 shadow-sm active:scale-95 transition-transform disabled:opacity-40" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function RollPanel({ game, myId, picks, onPicks, onNote }: { game: GameState; myId: string; picks: RollPicks; onPicks: (p: RollPicks) => void; onNote: (stat: StatKey) => void }) {
  const rs = rollState(game, myId, picks);
  if (!rs) return null;
  const { pending, mine, currentId, canRoll, choiceMax, base, minCount, chosenCount, canConfirm, canReroll, rerollsLeft, selected, skill } = rs;
  const me = game.players[myId];
  const fuelKind: KeptToken = mine?.diceToken ?? "mana";
  const fuel = FUEL_INFO[fuelKind];
  const fuelStat = fuelKind === "mana" ? "spellPower" : fuelKind;
  const fuelHave = me ? me[ENERGY_FIELD[fuelKind]] : 0;
  const assistMax = mine?.assistMax ?? 0;
  const keepOnFail = ["creature", "lab", "exploration", "duel"].includes(pending.kind) ? Math.min(game.rules.failKeepFuel ?? 0, chosenCount) : 0;
  const defense = !skill && pending.kind === "duel" ? pending.entries.find((e) => e.bonus !== undefined && e.dice) : undefined;
  const defenseTotal = defense ? sumOf(defense.dice!) + defense.bonus! : 0;
  const toggle = (i: number) => {
    const has = selected.includes(i);
    if (!has && selected.length >= rerollsLeft) return;
    onPicks({ ...picks, selected: has ? selected.filter((x) => x !== i) : [...selected, i] });
  };
  // 낼 수 있는 노트: 이 판정의 과목이고 손에 있는 노트 (장수만큼)
  const myNotes = me?.notes ?? [];
  const notes = canConfirm && skill ? (mine?.noteStats ?? []).filter((s) => myNotes.includes(s)) : [];
  const currentName = pending.entries.find((e) => e.playerId === currentId)?.label.replace(/ \(.*\)$/, "") ?? "";

  return (
    <div className="pop-in rounded-3xl border-2 border-pink-300 bg-white p-3 shadow-sm">
      <p className="text-center font-display text-lg text-purple-700">
        <InlineIcon name="dice" /> {pending.title}
      </p>
      {pending.lines.map((line) => (
        <p key={line} className="mt-1 text-center text-sm text-purple-600">
          {line}
        </p>
      ))}

      <ul className="mt-2 flex flex-col gap-2">
        {pending.entries.map((entry) => (
          <EntryRow key={entry.playerId} entry={entry} game={game} myId={myId} currentId={currentId} selectable={entry.playerId === myId && canReroll} selected={selected} onToggle={toggle} />
        ))}
      </ul>

      {canRoll && mine && choiceMax !== undefined && (
        <div className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          {defense && <p className="mb-1 text-center font-semibold text-pink-600">{defenseTotal + 1} 이상이면 승리!</p>}
          <p>
            <InlineIcon name={fuel.icon} /> {fuel.name} {fuelHave}개 있어요 · {STAT_LABEL[fuelStat]} {me ? effectiveStat(me, fuelStat) : 0}이라 한 번에 <b>{choiceMax}개까지</b> 낼 수 있어요
          </p>
          <p className="mt-0.5 text-xs text-sky-700">
            {base > 0 ? `낸 개수 + 공짜 주사위 ${base}개를 굴려요. 안 낸 기운은 남아요` : "낸 개수만큼 주사위를 굴려요."} {keepOnFail > 0 ? `실패해도 ${keepOnFail}개는 남아요.` : ""}
          </p>
          <Stepper label="기운" value={chosenCount} min={minCount} max={choiceMax} onChange={(n) => onPicks({ ...picks, count: n })}>
            <span className="block text-lg font-semibold">기운 {chosenCount}개</span>
            {base > 0 && <span className="block text-xs text-sky-600">주사위 {chosenCount + base}개 (공짜 {base})</span>}
          </Stepper>
        </div>
      )}
      {canRoll && mine && pending.assist && assistMax > 0 && (
        <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>
            <b>{pending.assist.title}</b> — {pending.assist.hint}. {pending.assist.name}를 몇 개 낼까요? (지금 {assistMax}개까지)
          </p>
          <Stepper label="보조 기운" value={Math.min(picks.assist, assistMax)} min={0} max={assistMax} onChange={(n) => onPicks({ ...picks, assist: n })}>
            <span className="text-lg font-semibold">{Math.min(picks.assist, assistMax)}개</span>
          </Stepper>
        </div>
      )}
      {canConfirm && canReroll && (
        <p className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <InlineIcon name="dice" /> 다시 굴릴 주사위를 눌러 고르세요 ·{" "}
          {skill ? (
            <>
              다시 굴리기 <b>{rerollsLeft}번</b> 남음 (체력만큼, 새 눈을 따라요)
            </>
          ) : (
            <>마나기운 1개당 주사위 1개 (마나기운 {rerollsLeft}개)</>
          )}
        </p>
      )}
      {notes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {[...new Set(notes)].map((s) => (
            <button key={s} className="min-h-11 flex-1 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 active:scale-95 transition-transform" onClick={() => onNote(s)}>
              <InlineIcon name="note" /> {STAT_LABEL[s]} 노트 펼치기 +{game.rules.noteBonus} ({myNotes.filter((n) => n === s).length}장)
            </button>
          ))}
        </div>
      )}
      {!rs.myTurnNow && (
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm text-purple-600" aria-live="polite">
          <span className="dice-wiggle inline-flex text-pink-400">
            <Icon name="dice" className="h-5 w-5" />
          </span>
          {!currentId ? "결과를 적용하는 중..." : pending.entries.find((e) => e.playerId === currentId)?.dice === null ? `${currentName}님 차례예요. 굴리기를 기다리는 중...` : `${currentName}님이 결과를 확인하는 중...`}
        </p>
      )}
    </div>
  );
}

// 반짝 마법 경연 순위 화면: 트랙에는 상한이 없고, 기말고사가 끝났을 때 1위·2위가 학점 보상을 받는다
export function TournamentPanel({ game, myId }: { game: GameState; myId: string }) {
  const rewards = game.rules.tournamentRewards;
  // 트랙 위치가 높은 순. 같은 칸이면 공동 순위(1, 1, 3, ...)
  const rows = game.turnOrder.map((id) => game.players[id]).sort((a, b) => b.tournamentTrack - a.tournamentTrack);
  const leader = rows[0]?.tournamentTrack ?? 0;
  const rankOf = (index: number) => rows.findIndex((p) => p.tournamentTrack === rows[index].tournamentTrack) + 1;
  const scale = Math.max(leader, 10);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-display text-base text-amber-700 mb-1"><InlineIcon name="trophy" /> 반짝 마법 경연</p>
        <p className="text-xs">마법 경연 참가를 고르면 마나기운을 모두 내고 낸 개수만큼 주사위를 굴려, 나온 눈을 모두 더한 칸만큼 트랙을 전진해요. 트랙에는 상한이 없어요!</p>
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
                <InlineIcon name="sparkle" /> 주문력 {effectiveStat(p, "spellPower")} (한 번에 주사위 {effectiveStat(p, "spellPower") + 1}개)
                {reward > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">지금 끝나면 학점 +{reward}</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
