import type { ReactNode } from "react";
import { Icon, InlineIcon } from "./Icons";
import {
  AWARD_NAME,
  AWARD_SUBJECT,
  SPECIAL_AWARD_HINT,
  STAT_LABEL,
  awardCategoriesOf,
  canChangeDream,
  dreamReached,
  effectiveStat,
  graduationAwards,
  isSpecialAward,
  type DreamCard,
  type GameState,
  type PlayerGameState,
} from "./gameTypes";

const MEDAL_COLOR = ["text-amber-500", "text-slate-400", "text-orange-500"];

// 장래희망 카드 한 장 (두 능력치와 지금 내 수치)
function DreamCardView({ dream, me, threshold, selected, onChoose }: { dream: DreamCard; me: PlayerGameState; threshold: number; selected?: boolean; onChoose?: () => void }) {
  return (
    <div className={`rounded-2xl border-2 p-3 ${selected ? "border-sky-300 bg-sky-50" : "border-purple-100 bg-white"}`}>
      <p className="font-display text-base text-sky-800">
        <InlineIcon name="compass" /> {dream.name}
        {selected && <span className="ml-1 rounded-full bg-sky-200 px-2.5 py-1 text-xs text-sky-800">내 꿈</span>}
      </p>
      <p className="mt-0.5 text-xs text-purple-600">{dream.description}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {dream.stats.map((s) => {
          const now = effectiveStat(me, s);
          const ok = now >= threshold;
          return (
            <li key={s} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${ok ? "bg-green-100 text-green-800" : "bg-purple-50 text-purple-700"}`}>
              {STAT_LABEL[s]} {now}/{threshold} {ok && <Icon name="check" className="h-3.5 w-3.5" />}
            </li>
          );
        })}
      </ul>
      {onChoose && (
        <button className="mt-2 min-h-11 w-full rounded-xl bg-sky-500 text-sm font-semibold text-white active:scale-95 transition-transform" onClick={onChoose}>
          이 꿈으로 할래요
        </button>
      )}
    </div>
  );
}

// 졸업 목표 탭 (56절): 내 장래희망(비공개) · 올해의 특별상 · 지금 졸업하면 받을 졸업식 순위
export function GoalsPanel({ game, myId, onChooseDream, children }: { game: GameState; myId: string; onChooseDream: (dreamId: string) => void; children?: ReactNode }) {
  const me = game.players[myId];
  const rules = game.rules;
  const canChange = canChangeDream(game, me);
  const awards = graduationAwards(game);
  const players = game.turnOrder.map((id) => game.players[id]).filter(Boolean);
  const specials = game.specialAwards ?? [];

  return (
    <div className="flex flex-col gap-3">
      {me?.dream && rules.dreamCredit > 0 && (
        <div className="rounded-3xl border-2 border-sky-200 bg-sky-50/60 p-3">
          <p className="flex items-center justify-between gap-2 font-display text-base text-sky-700">
            <span>
              <InlineIcon name="compass" /> 나의 장래희망
            </span>
            <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-0.5 font-sans text-xs text-sky-700">친구에겐 비밀</span>
          </p>
          <p className="mb-2 text-xs text-sky-800">
            졸업할 때 카드의 두 능력치가 모두 <b>{rules.dreamThreshold} 이상</b>이면 <b>학점 +{rules.dreamCredit}</b>!{" "}
            {dreamReached(me, rules) ? "지금 이룰 수 있어요!" : "두 능력치를 키워 보세요."}
          </p>
          {canChange ? (
            <>
              <p className="mb-2 rounded-2xl bg-white px-3 py-2 text-xs text-sky-700">
                받은 꿈 카드 {me.dreamOptions!.length}장 중 하나를 골라요. {rules.dreamChooseRounds}개월 동안은 바꿀 수 있어요.
              </p>
              <div className="flex flex-col gap-2">
                {me.dreamOptions!.map((d) => (
                  <DreamCardView key={d.id} dream={d} me={me} threshold={rules.dreamThreshold} selected={d.id === me.dream?.id} onChoose={d.id === me.dream?.id ? undefined : () => onChooseDream(d.id)} />
                ))}
              </div>
            </>
          ) : (
            <DreamCardView dream={me.dream} me={me} threshold={rules.dreamThreshold} selected />
          )}
        </div>
      )}

      {specials.length > 0 && (
        <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-3">
          <p className="font-display text-base text-amber-700">
            <InlineIcon name="medal" /> 올해의 특별상
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-sm text-amber-900">
            {specials.filter(isSpecialAward).map((c) => (
              <li key={c}>
                <b className="block">{AWARD_NAME[c]}</b>
                <span className="text-xs text-amber-800">{SPECIAL_AWARD_HINT[c]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-amber-800">졸업식에서 다른 상과 똑같이 1위 +{rules.rankPoints[0]} · 2위 +{rules.rankPoints[1]} · 3위 +{rules.rankPoints[2]} 학점을 줘요.</p>
        </div>
      )}

      <div className="rounded-3xl border-2 border-purple-200 bg-white p-3">
        <p className="font-display text-base text-purple-700">
          <InlineIcon name="cap" /> 지금 졸업하면?
        </p>
        <p className="mb-2 text-xs text-purple-500">부문마다 1위 +{rules.rankPoints[0]} · 2위 +{rules.rankPoints[1]} · 3위 +{rules.rankPoints[2]} 학점 (같으면 공동 순위)</p>
        <ul className="flex flex-col gap-2">
          {awardCategoriesOf(game).map((c) => {
            const got = players
              .flatMap((p) => (awards.get(p.id) ?? []).filter((w) => w.category === c).map((w) => ({ p, w })))
              .sort((a, b) => a.w.rank - b.w.rank);
            return (
              <li key={c} className={`rounded-2xl px-3 py-2 ${isSpecialAward(c) ? "bg-amber-50" : "bg-purple-50"}`}>
                <p className="text-sm font-semibold text-purple-800">
                  {AWARD_NAME[c]} <span className="text-xs font-normal text-purple-500">({AWARD_SUBJECT[c]})</span>
                </p>
                {got.length === 0 ? (
                  <p className="text-xs text-purple-500">아직 아무도 없어요</p>
                ) : (
                  <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-purple-700">
                    {got.map(({ p, w }) => (
                      <span key={p.id} className={`inline-flex items-center gap-0.5 ${p.id === myId ? "font-semibold text-pink-600" : ""}`}>
                        <Icon name="medal" className={`h-3.5 w-3.5 ${MEDAL_COLOR[w.rank - 1]}`} /> {p.name} {w.value} (+{w.points})
                      </span>
                    ))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {children}
    </div>
  );
}
