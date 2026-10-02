import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useModalOpen } from "./modalLock";
import { Icon, type IconName } from "./Icons";
import { ACTIVITY_LABEL, STAT_LABEL, describeExam, type ActivityId, type GameState, type StatKey } from "./gameTypes";

// 주차가 시작될 때 뜨는 "배너"와, 내 활동·시험 결과를 알려 주는 "결과 모달"을 순서대로 보여 준다. 둘 다 버튼을 눌러야 넘어간다.
// 1주차(충전) 배너는 버튼을 누르면 모두의 기운이 차오르는 연출이 나온 뒤 다음으로 넘어간다 (4주차 정리에는 사라지는 기운이 없다).
// (봇은 화면이 없으므로 서버가 타이머로 알아서 진행한다)
// 서버는 상태 스냅샷만 보내므로, 이전 상태와 비교해서 무슨 일이 있었는지 클라이언트가 유추한다.

interface Tile {
  text: string;
  tone?: "good" | "bad";
}

interface TokenRow {
  id: string;
  name: string;
  isMe: boolean;
  int: number;
  stamina: number;
  charm: number;
  spell: number;
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
  // 있으면 버튼을 눌렀을 때 기운이 들어오거나(gain) 사라지는(wipe) 연출을 보여 준다
  tokens?: { mode: "gain" | "wipe"; rows: TokenRow[] };
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

// 기운 연출 타이밍(초)과 한 줄에 그릴 기운 최대 개수
const ROW_GAP = 0.2;
const TOKEN_GAP = 0.07;
const MAX_ICONS = 12;
// 연출이 끝난 뒤 결과를 눈으로 확인할 수 있게 머무는 시간(초)
const HOLD_AFTER = 2.2;

let nextId = 1;
const make = (a: Omit<Announcement, "id" | "tiles" | "lines"> & { tiles?: Tile[]; lines?: string[] }): Announcement => ({
  tiles: [],
  lines: [],
  ...a,
  id: nextId++,
});

// 나를 맨 위에 두고 나머지는 진행 순서대로
function tokenRows(game: GameState, myId: string, amounts: { id: string; int: number; stamina: number; charm: number; spell: number }[]): TokenRow[] {
  const rows = amounts.map((a) => ({ ...a, name: game.players[a.id].name, isMe: a.id === myId }));
  return [...rows.filter((r) => r.isMe), ...rows.filter((r) => !r.isMe)];
}

function prepBanner(game: GameState, myId: string): Announcement {
  const summary = game.chargeSummary.filter((c) => game.players[c.playerId]);
  // 한도(능력치 × 배수)를 넘어서 사라진 기운이 있으면 알려 준다 (나를 먼저)
  const lostLines = summary
    .slice()
    .sort((a, b) => Number(b.playerId === myId) - Number(a.playerId === myId))
    .flatMap((c) => {
      const parts = ENERGY_LABELS.filter(([kind]) => c.lost[kind] > 0).map(([kind, label]) => `${label} ${c.lost[kind]}`);
      return parts.length > 0 ? [`${game.players[c.playerId].name}${c.playerId === myId ? " (나)" : ""}: 한도를 넘어 ${parts.join(", ")}개가 사라졌어요`] : [];
    });
  return make({
    kind: "banner",
    icon: "calendar",
    title: `${game.round}개월 1주차 · 충전`,
    subtitle: `능력치만큼 기운이 차올라요. 쓰고 남은 기운은 다음 달로 이어지고, 모아 둘 수 있는 한도는 능력치의 ${game.rules.energyCapMultiplier}배예요`,
    lines: lostLines,
    tokens: {
      mode: "gain",
      rows: tokenRows(
        game,
        myId,
        summary.map((c) => ({ id: c.playerId, int: c.gained.intelligence, stamina: c.gained.stamina, charm: c.gained.charm, spell: c.gained.mana })),
      ),
    },
  });
}

const ENERGY_LABELS = [
  ["intelligence", "지력기운"],
  ["stamina", "체력기운"],
  ["charm", "매력기운"],
  ["mana", "마나기운"],
] as const;

function cleanupBanner(prev: GameState, next: GameState, myId: string): Announcement {
  return make({
    kind: "banner",
    icon: "bag",
    title: `${prev.round}개월 4주차 · 정리`,
    subtitle: "쓰고 남은 기운은 다음 달로 이어져요. 지력·체력·매력은 시간이 지나면 조금씩 줄어요. 주문력과 학점, 카드는 그대로예요",
    lines: [
      // 능력치 감쇠: 이번 정리에서 줄어든 지력·체력·매력 (나를 먼저)
      ...next.cleanupSummary
        .slice()
        .sort((a, b) => Number(b.playerId === myId) - Number(a.playerId === myId))
        .flatMap((c) => {
          const parts = STAT_KEYS.filter((key) => (c.decay?.[key] ?? 0) > 0).map((key) => `${STAT_LABEL[key]} -${c.decay[key]}`);
          return parts.length > 0 ? [`${next.players[c.playerId].name}${c.playerId === myId ? " (나)" : ""}: 시간이 지나 ${parts.join(", ")}`] : [];
        }),
    ],
  });
}

const starterName = (game: GameState): string => game.players[game.turnOrder[game.startingPlayerIndex]].name;

// 게임 시작 때 주사위로 첫 달의 선이 정해졌다
const firstPlayerBanner = (game: GameState, myId: string): Announcement =>
  make({
    kind: "banner",
    icon: "dice",
    title: "선이 정해졌어요!",
    subtitle: `${starterName(game)}님이 첫 달의 선이에요. 선부터 시계방향으로 진행해요`,
    lines: [`순서: ${game.classPickOrder.map((id) => game.players[id].name).join(" → ")}`, ...(game.turnOrder[game.startingPlayerIndex] === myId ? ["내가 선이에요!"] : [])],
  });

const classBanner = (game: GameState): Announcement =>
  make({
    kind: "banner",
    icon: "book",
    title: `${game.round}개월 2주차 · 정규수업`,
    subtitle: `이번 달 선은 ${starterName(game)}님! 선부터 시계방향으로 공개된 수업카드를 한 장씩 가져가요. 카드마다 드는 체력기운이 달라요`,
  });

function activityBanner(game: GameState, myId: string): Announcement {
  const myOrder = game.activityOrder.indexOf(myId) + 1;
  return make({
    kind: "banner",
    icon: "compass",
    title: `${game.round}개월 3주차 · 자율활동`,
    subtitle: `선 ${starterName(game)}님부터 시계방향으로 활동을 골라요: ${game.activityOrder.map((id) => game.players[id].name).join(" → ")}`,
    lines: myOrder > 0 ? [`내 순서는 ${myOrder}번째예요`] : [],
  });
}

// 모두 활동을 골랐다: 누가 무엇을 골랐는지 공개하고 차례대로 진행한다
function resolveBanner(game: GameState, myId: string): Announcement {
  return make({
    kind: "banner",
    icon: "compass",
    title: "모두 골랐어요!",
    subtitle: "고른 순서대로 한 명씩 진행해요",
    lines: game.activityChoices.map(
      (c, i) =>
        `${i + 1}. ${game.players[c.playerId].name}${c.playerId === myId ? " (나)" : ""} — ${ACTIVITY_LABEL[c.activityId]}${c.targetPlayerId ? ` → ${game.players[c.targetPlayerId].name} 지목` : ""}`,
    ),
  });
}

// 내가 한(또는 나에게 일어난) 자율활동의 결과. 새 로그 중 내 이름이 들어간 것과 내 수치 변화를 모은다
function activityResult(prev: GameState, next: GameState, myId: string): Announcement | null {
  // 공개된 카드를 고르는 중이거나 주사위를 굴리는 중이면 결과가 나온 뒤에 보여 준다 (시험 굴림은 활동이 끝난 뒤의 일이라 예외)
  if (next.pendingPick?.playerId === myId) return null;
  if (next.pendingRoll && next.pendingRoll.kind !== "exam") return null;
  const before = prev.players[myId];
  const after = next.players[myId];
  const lines = next.log.slice(prev.log.length).map((e) => e.message).filter((m) => m.includes(after.name));
  const examHappened = next.examResults.length > prev.examResults.length;

  const tiles: Tile[] = [];
  // 활동이 끝나고 같은 갱신에서 4주차 정리가 일어났다면 능력치 감쇠분은 활동 결과가 아니므로 되돌려 센다
  const decayed = next.round > prev.round ? (next.cleanupSummary.find((c) => c.playerId === myId)?.decay ?? {}) : {};
  for (const key of STAT_KEYS) {
    const d = after[key] - before[key] + (decayed[key] ?? 0);
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

  const mine = ACTIVITY_IDS.find((a) => next.activitySlots[a].includes(myId));
  const forcedDuel = !mine && next.duels.some((d) => d.targetId === myId);
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

function examBanner(next: GameState): Announcement {
  const card = next.exams[next.phase === "midterm_exam" ? "midterm" : "final"]!;
  return make({
    kind: "banner",
    icon: "dice",
    title: next.phase === "midterm_exam" ? "중간고사 시작!" : "기말고사 시작!",
    subtitle: `${card.name}: ${describeExam(card)}로 점수를 내요`,
  });
}

// 3라운드·9라운드가 끝나면 다음 시험의 시험 카드가 공개된다
function examRevealBanner(next: GameState, which: "midterm" | "final"): Announcement {
  const card = next.exams[which]!;
  return make({
    kind: "banner",
    icon: "note",
    title: `${which === "midterm" ? "중간고사" : "기말고사"} 과목 공개!`,
    subtitle: `"${card.name}" — ${describeExam(card)}`,
    lines: [card.description, `${card.diceStat === "spellPower" ? "마나" : STAT_LABEL[card.diceStat]}기운을 많이 낼수록 주사위가 늘어요${card.bonusStat ? `. ${STAT_LABEL[card.bonusStat]} 수치는 점수에 그대로 더해져요` : ""}`],
  });
}

function examResult(next: GameState, myId: string): Announcement {
  const result = next.examResults[next.examResults.length - 1];
  return make({
    kind: "result",
    icon: "note",
    title: `${result.round === 6 ? "중간고사" : "기말고사"} 결과 · ${result.card.name}`,
    lines: result.scores.map(
      (s) =>
        `${s.rank}위 ${next.players[s.playerId].name}${s.playerId === myId ? " (나)" : ""} — 점수 ${s.score}${s.dice.length > 0 || s.bonus > 0 ? ` (${[s.dice.length > 0 ? `주사위 ${s.dice.join("+")}` : "", s.bonus > 0 ? `보너스 +${s.bonus}` : ""].filter(Boolean).join(" ")})` : ""}, 학점 +${s.creditAwarded}`,
    ),
  });
}

function build(prev: GameState, next: GameState, myId: string): Announcement[] {
  const out: Announcement[] = [];
  const roundChanged = next.round > prev.round;
  const activityEnded = prev.phase === "activity" && (next.phase !== "activity" || roundChanged);
  // 활동 결과는 진행 단계에서만 알린다 (선택 단계의 "무엇을 골랐다"는 소식은 결과가 아니다)
  if (prev.phase === "activity" && prev.activityStage === "resolve" && (activityEnded || next.log.length > prev.log.length)) {
    const r = activityResult(prev, next, myId);
    if (r) out.push(r);
  }
  // 평소: 자율활동 → 4주차 정리 → 다음 달 1주차 준비 → 2주차 정규수업
  // 시험 달(6·12개월): 1주차 준비 → 시험 → 4주차 정리 (기말고사 뒤에는 게임이 끝난다)
  // 4주차 정리는 남길 기운을 모두 고른 뒤에 끝난다 (고를 기운이 없으면 바로 지나간다)
  const examStarts = prev.phase !== next.phase && next.pendingRoll?.kind === "exam";
  const leftExam = prev.phase === "midterm_exam" && next.phase !== "midterm_exam";
  const cleanupDone = ((prev.phase === "activity" || prev.phase === "cleanup") && next.phase !== "activity" && next.phase !== "cleanup") || (leftExam && next.phase !== "cleanup");
  if (cleanupDone && !leftExam) out.push(cleanupBanner(prev, next, myId));
  if (examStarts) {
    if (roundChanged) out.push(prepBanner(next, myId));
    out.push(examBanner(next));
  }
  if (next.examResults.length > prev.examResults.length) out.push(examResult(next, myId));
  if (cleanupDone && leftExam) out.push(cleanupBanner(prev, next, myId));
  if (!prev.exams.midterm && next.exams.midterm) out.push(examRevealBanner(next, "midterm"));
  if (!prev.exams.final && next.exams.final) out.push(examRevealBanner(next, "final"));
  if (prev.phase === "setup" && next.phase === "class") out.push(firstPlayerBanner(next, myId), prepBanner(next, myId), classBanner(next));
  else if (roundChanged && next.phase === "class") out.push(prepBanner(next, myId), classBanner(next));
  else if (prev.phase === "class" && next.phase === "activity") out.push(activityBanner(next, myId));
  if (next.phase === "activity" && prev.activityStage === "choose" && next.activityStage === "resolve" && next.activityChoices.length > 0 && prev.phase === "activity") {
    out.push(resolveBanner(next, myId));
  }
  return out;
}

// 연출이 끝나기까지 걸리는 시간(ms)
function playDuration(tokens: NonNullable<Announcement["tokens"]>): number {
  // 한 사람의 세 줄(지력기운 → 체력기운 → 마나기운)은 차례로 들어오므로 가장 늦게 끝나는 사람 기준으로 계산한다
  const finish = Math.max(
    0,
    ...tokens.rows.map(
      (r, i) => i * ROW_GAP + (Math.min(MAX_ICONS, r.int) + Math.min(MAX_ICONS, r.stamina) + Math.min(MAX_ICONS, r.charm) + Math.min(MAX_ICONS, r.spell)) * TOKEN_GAP,
    ),
  );
  return (finish + 0.5 + HOLD_AFTER) * 1000;
}

function TokenLine({
  icon,
  label,
  count,
  mode,
  playing,
  startDelay,
  color,
}: {
  icon: IconName;
  label: string;
  count: number;
  mode: "gain" | "wipe";
  playing: boolean;
  startDelay: number;
  color: string;
}) {
  const shown = Math.min(count, MAX_ICONS);
  const delayOf = (i: number) => ({ "--d": `${(startDelay + i * TOKEN_GAP).toFixed(2)}s` }) as CSSProperties;
  const endDelay = { "--d": `${(startDelay + shown * TOKEN_GAP + 0.2).toFixed(2)}s` } as CSSProperties;
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="w-14 shrink-0 text-left text-xs text-purple-500">{label}</span>
      <span className="flex min-h-5 flex-1 flex-wrap gap-0.5">
        {count === 0 && <span className="text-xs text-purple-300">없음</span>}
        {Array.from({ length: shown }, (_, i) =>
          mode === "gain" && !playing ? (
            <span key={i} className="h-5 w-5 rounded-full border-2 border-dashed border-purple-200" aria-hidden />
          ) : (
            <span key={i} className={mode === "gain" ? "token-in" : playing ? "token-out" : ""} style={playing ? delayOf(i) : undefined}>
              <Icon name={icon} className={`h-5 w-5 ${color}`} />
            </span>
          ),
        )}
      </span>
      <b className="w-10 shrink-0 text-right text-sm text-purple-700">
        {mode === "gain" ? (
          playing ? (
            <span className="token-in inline-block" style={endDelay}>
              +{count}
            </span>
          ) : (
            "–"
          )
        ) : playing ? (
          <span className="token-in inline-block" style={endDelay}>
            0
          </span>
        ) : (
          count
        )}
      </b>
    </div>
  );
}

function TokenBoard({ tokens, playing }: { tokens: NonNullable<Announcement["tokens"]>; playing: boolean }) {
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {tokens.rows.map((row, index) => (
        <li key={row.id} className={`rounded-2xl px-3 py-2 ${row.isMe ? "bg-pink-50 ring-2 ring-pink-200" : "bg-purple-50"}`}>
          <p className="truncate text-left font-display text-sm text-purple-700">
            {row.name}
            {row.isMe ? " (나)" : ""}
          </p>
          {(tokens.mode === "gain" || row.int > 0) && <TokenLine
            icon="intToken"
            label="지력기운"
            count={row.int}
            mode={tokens.mode}
            playing={playing}
            startDelay={index * ROW_GAP}
            color="text-sky-500"
          />}
          {(tokens.mode === "gain" || row.stamina > 0) && <TokenLine
            icon="staminaToken"
            label="체력기운"
            count={row.stamina}
            mode={tokens.mode}
            playing={playing}
            startDelay={index * ROW_GAP + Math.min(row.int, MAX_ICONS) * TOKEN_GAP}
            color="text-green-500"
          />}
          {(tokens.mode === "gain" || row.charm > 0) && <TokenLine
            icon="charmToken"
            label="매력기운"
            count={row.charm}
            mode={tokens.mode}
            playing={playing}
            startDelay={index * ROW_GAP + (Math.min(row.int, MAX_ICONS) + Math.min(row.stamina, MAX_ICONS)) * TOKEN_GAP}
            color="text-pink-500"
          />}
          {(tokens.mode === "gain" || row.spell > 0) && <TokenLine
            icon="manaToken"
            label="마나기운"
            count={row.spell}
            mode={tokens.mode}
            playing={playing}
            startDelay={index * ROW_GAP + (Math.min(row.int, MAX_ICONS) + Math.min(row.stamina, MAX_ICONS) + Math.min(row.charm, MAX_ICONS)) * TOKEN_GAP}
            color="text-indigo-500"
          />}
          {tokens.mode === "wipe" && row.int + row.stamina + row.charm + row.spell === 0 && <p className="mt-1 text-left text-xs text-purple-400">남은 기운이 없어요</p>}
        </li>
      ))}
    </ul>
  );
}

export function AnnouncementLayer({ game, myId }: { game: GameState; myId: string }) {
  // 렌더 중에 이전 상태와 비교해 큐를 늘린다 (effect 안에서 setState하지 않기 위한 패턴)
  const [prev, setPrev] = useState(game);
  // 게임 시작 직후(선 정하기)에는 아직 1주차가 시작되지 않았으므로 선이 정해진 뒤에 배너를 보여 준다
  const [queue, setQueue] = useState<Announcement[]>(() => (game.phase === "setup" ? [] : [prepBanner(game, myId), classBanner(game)]));
  const [playing, setPlaying] = useState(false);
  if (prev !== game) {
    setPrev(game);
    const added = build(prev, game, myId);
    if (added.length > 0) setQueue((q) => [...q, ...added]);
  }

  const current = queue[0];
  const dismiss = () => setQueue((q) => q.slice(1));

  // 기운 연출이 끝나면 저절로 다음 알림으로 넘어간다
  // 다른 팝업(메뉴·나가기 확인 등)이 떠 있는 동안은 연출과 타이머를 멈추고, 닫히면 남은 시간만큼 이어 간다
  const paused = useModalOpen();
  const leftRef = useRef<{ id: number; ms: number } | null>(null);
  useEffect(() => {
    if (!playing || !current?.tokens || paused) return;
    const left = leftRef.current?.id === current.id ? leftRef.current : { id: current.id, ms: playDuration(current.tokens) };
    leftRef.current = left;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      leftRef.current = null;
      setPlaying(false);
      setQueue((q) => (q[0]?.id === current.id ? q.slice(1) : q));
    }, left.ms);
    return () => {
      clearTimeout(timer);
      left.ms = Math.max(0, left.ms - (Date.now() - startedAt));
    };
  }, [playing, current, paused]);

  if (!current) return null;
  const isResult = current.kind === "result";
  const remaining = queue.length - 1;
  const onButton = () => (current.tokens ? setPlaying(true) : dismiss());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-purple-900/30 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
    >
      <div
        key={current.id}
        className="pop-in max-h-[88dvh] w-full max-w-sm overflow-y-auto rounded-3xl border-2 border-pink-200 bg-white p-5 text-center shadow-lg"
      >
        <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-pink-100 text-pink-500">
          <Icon name={current.icon} className="h-8 w-8" />
        </span>
        <h2 className="text-xl text-purple-700">{current.title}</h2>
        {current.subtitle && <p className="mt-1 text-sm text-purple-500">{current.subtitle}</p>}

        {current.tokens && <TokenBoard tokens={current.tokens} playing={playing} />}

        {current.track && (
          <div className="mt-3" role="img" aria-label={`토너먼트 트랙 ${current.track.from}칸에서 ${current.track.to}칸`}>
            {/* 트랙에는 상한이 없으므로 막대의 길이는 max(도착 칸, 10)을 기준으로 잡는다 */}
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-purple-100">
              <div className="absolute inset-y-0 left-0 rounded-full bg-pink-400" style={{ width: `${(current.track.to / Math.max(current.track.to, 10)) * 100}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-purple-300" style={{ width: `${(current.track.from / Math.max(current.track.to, 10)) * 100}%` }} />
            </div>
            <p className="mt-1 text-sm text-purple-700">
              {current.track.from}칸 → <b>{current.track.to}칸</b>
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

        {playing ? (
          <div className="mt-4 flex min-h-12 items-center justify-between gap-2 py-1">
            <p className="text-sm text-purple-600" aria-live="polite">
              {current.tokens?.mode === "gain" ? "기운을 받는 중이에요..." : "기운을 정리하는 중이에요..."}
            </p>
            <button
              className="min-h-11 shrink-0 rounded-full bg-purple-100 px-4 text-sm text-purple-700 active:scale-95 transition-transform"
              onClick={() => {
                setPlaying(false);
                dismiss();
              }}
            >
              건너뛰기
            </button>
          </div>
        ) : (
          <button
            className="mt-4 min-h-12 w-full rounded-2xl bg-purple-500 py-3 font-semibold text-white active:scale-95 transition-transform"
            onClick={onButton}
            autoFocus
          >
            {isResult ? "확인" : "시작하기"}
            {remaining > 0 ? ` (${remaining}개 더 있어요)` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
