import { useState } from "react";
import { Icon, type IconName } from "./Icons";
import { ACTIVITY_LABEL, STAT_LABEL, type ActivityId, type GameState, type StatKey } from "./gameTypes";

// 주차가 시작될 때 뜨는 "배너"와, 내 활동·시험 결과를 알려 주는 "결과 모달"을 순서대로 보여 준다. 둘 다 확인을 눌러야 넘어간다.
// (봇은 화면이 없으므로 서버가 타이머로 알아서 진행한다)
// 서버는 상태 스냅샷만 보내므로, 이전 상태와 비교해서 무슨 일이 있었는지 클라이언트가 유추한다.

interface Tile {
  text: string;
  tone?: "good" | "bad";
}

interface Announcement {
  id: number;
  kind: "banner" | "result";
  icon: IconName;
  title: string;
  subtitle?: string;
  lines: string[];
  tiles: Tile[];
  track?: { from: number; to: number };
}

const ACTIVITY_ICON: Record<ActivityId, IconName> = {
  tournament: "trophy",
  creature: "paw",
  duel: "swords",
  exploration: "door",
  lab: "flask",
};
const ACTIVITY_IDS = Object.keys(ACTIVITY_ICON) as ActivityId[];
const STAT_KEYS: StatKey[] = ["intelligence", "stamina", "charm", "spellPower"];

let nextId = 1;
const make = (a: Omit<Announcement, "id" | "tiles" | "lines"> & { tiles?: Tile[]; lines?: string[] }): Announcement => ({
  tiles: [],
  lines: [],
  ...a,
  id: nextId++,
});

function prepBanner(game: GameState, myId: string, afterCleanup: boolean): Announcement {
  const me = game.players[myId];
  return make({
    kind: "banner",
    icon: "calendar",
    title: `${game.round}개월 1주차 · 준비`,
    subtitle: afterCleanup ? "4주차 정리로 남은 토큰은 사라졌어요" : undefined,
    tiles: [
      { text: `체력토큰 ${me.staminaTokens}개`, tone: "good" },
      { text: `주문서 ${me.spellbookTokens}개`, tone: "good" },
    ],
  });
}

const classBanner = (game: GameState): Announcement =>
  make({
    kind: "banner",
    icon: "book",
    title: `${game.round}개월 2주차 · 정규수업`,
    subtitle: "지력만큼 수업카드를 받았어요. 체력토큰 1개로 1장을 습득해요",
  });

function activityBanner(game: GameState, myId: string): Announcement {
  const myOrder = game.activityOrder.indexOf(myId) + 1;
  return make({
    kind: "banner",
    icon: "compass",
    title: `${game.round}개월 3주차 · 자율활동`,
    subtitle: `매력 순서: ${game.activityOrder.map((id) => game.players[id].name).join(" → ")}`,
    lines: myOrder > 0 ? [`내 순서는 ${myOrder}번째예요`] : [],
  });
}

// 내가 한(또는 나에게 일어난) 자율활동의 결과. 새 로그 중 내 이름이 들어간 것과 내 수치 변화를 모은다
function activityResult(prev: GameState, next: GameState, myId: string): Announcement | null {
  // 연구 카드를 고르는 중이면 고른 뒤의 결과를 보여 준다
  if (next.pendingLab?.playerId === myId) return null;
  const before = prev.players[myId];
  const after = next.players[myId];
  const lines = next.log.slice(prev.log.length).map((e) => e.message).filter((m) => m.includes(after.name));
  const examHappened = next.examResults.length > prev.examResults.length;

  const tiles: Tile[] = [];
  for (const key of STAT_KEYS) {
    const d = after[key] - before[key];
    if (d !== 0) tiles.push({ text: `${STAT_LABEL[key]} ${d > 0 ? "+" : ""}${d}`, tone: d > 0 ? "good" : "bad" });
  }
  // 시험·토너먼트 최종 보상이 같은 전환에 섞이면 활동 결과와 구분할 수 없어 학점 변화는 생략한다
  const creditDiff = after.credit - before.credit;
  if (!examHappened && creditDiff !== 0) tiles.push({ text: `학점 ${creditDiff > 0 ? "+" : ""}${creditDiff}`, tone: creditDiff > 0 ? "good" : "bad" });
  for (const [label, list] of [["마법생물", "creatures"], ["마도서", "grimoires"], ["연구 카드", "equipment"]] as const) {
    const known = new Set(before[list].map((c) => c.id));
    for (const c of after[list]) if (!known.has(c.id)) tiles.push({ text: `${label} "${c.name}" 획득`, tone: "good" });
  }
  const track = after.tournamentTrack !== before.tournamentTrack ? { from: before.tournamentTrack, to: after.tournamentTrack } : undefined;
  if (lines.length === 0 && tiles.length === 0 && !track) return null;

  const mine = ACTIVITY_IDS.find((a) => next.activitySlots[a] === myId);
  const forcedDuel = !mine && next.duelTargetId === myId;
  const activity: ActivityId | undefined = mine ?? (forcedDuel ? "duel" : undefined);
  return make({
    kind: "result",
    icon: activity ? ACTIVITY_ICON[activity] : "scroll",
    title: activity ? ACTIVITY_LABEL[activity] : "자율활동 소식",
    subtitle: forcedDuel ? "지목당해서 이번 달 활동은 주문 대결이에요" : `${prev.round}개월 3주차 결과`,
    lines,
    tiles,
    track,
  });
}

function examResult(next: GameState, myId: string): Announcement {
  const result = next.examResults[next.examResults.length - 1];
  return make({
    kind: "result",
    icon: "note",
    title: result.round === 6 ? "중간고사 결과" : "기말고사 결과",
    lines: result.scores.map(
      (s) => `${s.rank}위 ${next.players[s.playerId].name}${s.playerId === myId ? " (나)" : ""} — 점수 ${s.score}, 학점 +${s.creditAwarded}`,
    ),
  });
}

function build(prev: GameState, next: GameState, myId: string): Announcement[] {
  const out: Announcement[] = [];
  const roundChanged = next.round > prev.round;
  if (prev.phase === "activity" && (next.phase !== "activity" || roundChanged || next.log.length > prev.log.length)) {
    const r = activityResult(prev, next, myId);
    if (r) out.push(r);
  }
  if (next.examResults.length > prev.examResults.length) out.push(examResult(next, myId));
  if (roundChanged && next.phase === "class") out.push(prepBanner(next, myId, true), classBanner(next));
  else if (prev.phase === "class" && next.phase === "activity") out.push(activityBanner(next, myId));
  return out;
}

export function AnnouncementLayer({ game, myId }: { game: GameState; myId: string }) {
  // 렌더 중에 이전 상태와 비교해 큐를 늘린다 (effect 안에서 setState하지 않기 위한 패턴)
  const [prev, setPrev] = useState(game);
  const [queue, setQueue] = useState<Announcement[]>(() => [prepBanner(game, myId, false), classBanner(game)]);
  if (prev !== game) {
    setPrev(game);
    const added = build(prev, game, myId);
    if (added.length > 0) setQueue((q) => [...q, ...added]);
  }

  const current = queue[0];
  const dismiss = () => setQueue((q) => q.slice(1));

  if (!current) return null;
  const isResult = current.kind === "result";
  const remaining = queue.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-purple-900/30 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
    >
      <div key={current.id} className="pop-in w-full max-w-sm rounded-3xl border-2 border-pink-200 bg-white p-5 text-center shadow-lg">
        <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-pink-100 text-pink-500">
          <Icon name={current.icon} className="h-8 w-8" />
        </span>
        <h2 className="text-xl text-purple-700">{current.title}</h2>
        {current.subtitle && <p className="mt-1 text-sm text-purple-500">{current.subtitle}</p>}

        {current.track && (
          <div className="mt-3" aria-label={`토너먼트 트랙 ${current.track.from}에서 ${current.track.to}칸`}>
            <div className="grid grid-cols-10 gap-0.5">
              {Array.from({ length: 10 }, (_, i) => {
                const n = i + 1;
                const gained = n > current.track!.from && n <= current.track!.to;
                const had = n <= current.track!.from;
                return (
                  <span
                    key={n}
                    className={`h-3 rounded-full ${gained ? "bg-pink-400" : had ? "bg-purple-300" : "bg-purple-100"}`}
                  />
                );
              })}
            </div>
            <p className="mt-1 text-sm text-purple-700">
              {current.track.from}칸 → <b>{current.track.to}칸</b> / 10
            </p>
          </div>
        )}

        {current.tiles.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {current.tiles.map((t) => (
              <span
                key={t.text}
                className={`rounded-full px-3 py-1 text-sm ${t.tone === "bad" ? "bg-pink-100 text-pink-700" : "bg-emerald-100 text-emerald-800"}`}
              >
                {t.text}
              </span>
            ))}
          </div>
        )}

        {current.lines.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-left text-sm text-purple-800">
            {current.lines.map((line) => (
              <li key={line} className="rounded-2xl bg-purple-50 px-3 py-1.5">
                {line}
              </li>
            ))}
          </ul>
        )}

        <button
          className="mt-4 min-h-12 w-full rounded-2xl bg-purple-500 py-3 font-semibold text-white active:scale-95 transition-transform"
          onClick={dismiss}
          autoFocus
        >
          {isResult ? "확인" : "시작하기"}
          {remaining > 0 ? ` (${remaining}개 더 있어요)` : ""}
        </button>
      </div>
    </div>
  );
}
