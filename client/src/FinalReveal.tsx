import { useEffect, useMemo, useState } from "react";
import { Icon, InlineIcon } from "./Icons";
import { creatureSets, effectiveStat, finalScore, type GameState, type PlayerGameState } from "./gameTypes";

const MEDAL_COLOR = ["text-amber-500", "text-slate-400", "text-orange-500"];

// 한 걸음이 지나가는 시간(ms). 팝업이 떠 있는 동안에는 시간이 흐르지 않는다
const STEP_MS = 1100;
// 플레이어 한 명의 점수 계산 걸음: 0 이름 → 1 성취도 → 2 마법생물 세트 → 3 합계
const TALLY_STEPS = 4;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// 숫자가 0에서 목표값까지 올라가는 연출
function CountUp({ to, ms = 700 }: { to: number; ms?: number }) {
  const [value, setValue] = useState(prefersReducedMotion() ? to : 0);
  useEffect(() => {
    if (prefersReducedMotion() || to <= 0) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const run = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [to, ms]);
  return <>{value}</>;
}

const CONFETTI = ["#f472b6", "#fbbf24", "#a78bfa", "#38bdf8", "#34d399"];

// 우승 순간에 흩날리는 색종이
function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 0.22, color: CONFETTI[i % CONFETTI.length], size: 6 + (i % 3) * 3 })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden rounded-3xl" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{ left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.color, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  );
}

// 지금 점수를 계산하는 플레이어의 카드: 주문력 × 학점 → 마법생물 세트 → 합계가 차례로 나타난다
function TallyCard({ game, player, step }: { game: GameState; player: PlayerGameState; step: number }) {
  const spell = effectiveStat(player, "spellPower");
  const achievement = spell * player.credit;
  const sets = creatureSets(player.creatures);
  const setScore = sets * game.rules.creatureSetScore;
  return (
    <div className="pop-in rounded-3xl border-2 border-pink-200 bg-pink-50 p-4 text-center">
      <p className="font-display text-xl text-purple-700 truncate">{player.name}</p>
      <div className="mt-3 flex flex-col gap-2 text-sm text-purple-800">
        <p className={`rounded-2xl bg-white px-3 py-2 ${step >= 1 ? "pop-in" : "invisible"}`}>
          <InlineIcon name="sparkle" /> 주문력 {spell} × <InlineIcon name="cap" /> 학점 {player.credit} = 성취도 <b className="text-lg">{step >= 1 ? <CountUp to={achievement} /> : 0}</b>
        </p>
        <p className={`rounded-2xl bg-white px-3 py-2 ${step >= 2 ? "pop-in" : "invisible"}`}>
          <InlineIcon name="paw" /> 마법생물 세트 {sets}개 × {game.rules.creatureSetScore}점 = <b className="text-lg">{step >= 2 ? <CountUp to={setScore} /> : 0}</b>점
        </p>
        <p className={`rounded-2xl bg-amber-100 px-3 py-2 font-display text-lg ${step >= 3 ? "pop-in" : "invisible"}`}>
          최종 점수 <b className="text-2xl text-amber-700">{step >= 3 ? <CountUp to={finalScore(game, player)} ms={900} /> : 0}</b>점
        </p>
      </div>
    </div>
  );
}

// 게임이 끝났을 때: 플레이어별 점수를 하나씩 계산해서 보여 주고, 꼴찌부터 순위를 공개한다 (건너뛰기 가능)
export function FinalReveal({ game, onLeave }: { game: GameState; onLeave: () => void }) {
  const players = game.turnOrder.map((id) => game.players[id]);
  const winnerIds = game.winnerIds ?? [];
  const ranked = [...players].sort((a, b) => finalScore(game, b) - finalScore(game, a));
  const n = players.length;
  const tallyEnd = n * TALLY_STEPS;
  // 순위 공개: 꼴찌부터 한 칸씩, 1위까지 공개되면 끝
  const lastStep = tallyEnd + n;
  const [step, setStep] = useState(prefersReducedMotion() ? lastStep : 0);
  const finished = step >= lastStep;

  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => {
      if (document.body.hasAttribute("data-modal-open")) return;
      setStep((s) => Math.min(lastStep, s + 1));
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [finished, lastStep]);

  const tallying = step < tallyEnd;
  const currentIndex = Math.min(n - 1, Math.floor(step / TALLY_STEPS));
  const currentStep = step % TALLY_STEPS;
  const revealedRanks = Math.max(0, step - tallyEnd);
  const rankOf = (p: PlayerGameState) => 1 + ranked.filter((o) => finalScore(game, o) > finalScore(game, p)).length;
  const tallied = (i: number) => i < currentIndex || (i === currentIndex && currentStep >= 3);

  return (
    <div className="relative bg-white rounded-3xl border-2 border-amber-200 p-4 shadow-sm">
      {finished && winnerIds.length > 0 && <Confetti />}
      {tallying ? (
        <>
          <p className="font-display text-lg text-purple-700 mb-3 text-center">
            <InlineIcon name="note" /> 최종 점수를 계산해요
          </p>
          <TallyCard key={players[currentIndex].id} game={game} player={players[currentIndex]} step={currentStep} />
          <ul className="mt-3 flex flex-wrap justify-center gap-1.5 text-xs">
            {players.map((p, i) => (
              <li key={p.id} className={`rounded-full px-2.5 py-1 ${tallied(i) ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                {p.name} {tallied(i) ? `${finalScore(game, p)}점` : "?"}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="font-display text-xl text-purple-700 mb-3 text-center">
            {finished ? (
              <>
                <InlineIcon name="sparkle" /> {winnerIds.map((id) => game.players[id].name).join(", ")} 승리! <InlineIcon name="sparkle" />
              </>
            ) : (
              <>
                <InlineIcon name="trophy" /> 순위 발표!
              </>
            )}
          </p>
          <ol className="flex flex-col gap-2">
            {ranked.map((p, i) => {
              // 아래쪽(꼴찌)부터 공개된다
              if (i < n - revealedRanks) {
                return (
                  <li key={p.id} className="rounded-2xl bg-gray-100 px-3 py-3 text-center text-sm text-gray-500">
                    {i + 1}위 ???
                  </li>
                );
              }
              const rank = rankOf(p);
              const winner = winnerIds.includes(p.id);
              return (
                <li key={p.id} className={`pop-in rounded-2xl px-3 py-2 ${winner ? "bg-amber-100 ring-2 ring-amber-300" : "bg-purple-50"} ${winner && finished ? "winner-bounce" : ""}`}>
                  <p className="flex items-center justify-between gap-2 font-display text-purple-800">
                    <span className="truncate">
                      {rank <= 3 ? <Icon name="medal" className={`h-5 w-5 ${MEDAL_COLOR[rank - 1]}`} /> : `${rank}위`} {p.name}
                    </span>
                    <span className="shrink-0 text-lg">{finalScore(game, p)}점</span>
                  </p>
                  <p className="text-xs text-purple-600">
                    성취도 {effectiveStat(p, "spellPower") * p.credit} (주문력 {effectiveStat(p, "spellPower")} × 학점 {p.credit}) + 마법생물 세트 {creatureSets(p.creatures) * game.rules.creatureSetScore}점
                  </p>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <div className="mt-4 flex flex-col gap-1">
        {!finished && (
          <button className="min-h-11 w-full rounded-xl text-sm text-purple-600 active:scale-95 transition-transform" onClick={() => setStep(lastStep)}>
            건너뛰기
          </button>
        )}
        {finished && (
          <button className="min-h-12 w-full rounded-2xl bg-purple-500 font-semibold text-white active:scale-95 transition-transform" onClick={onLeave}>
            <Icon name="door" className="mr-1 h-5 w-5" />
            처음 화면으로 나가기
          </button>
        )}
      </div>
    </div>
  );
}
