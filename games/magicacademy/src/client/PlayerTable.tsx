import { Icon } from "./Icons";
import { effectiveStat, projectedScore, type GameState, type PlayerGameState, type StatKey } from "./gameTypes";
import { COLUMN_STYLE, type ColumnKey } from "./statStyle";
import { waitingOn } from "./Social";

// 상단에 항상 보이는 플레이어 비교표: 행 = 플레이어, 열 = 능력치 5종 + 기운 4종
const STAT_COLS: ColumnKey[] = ["intelligence", "stamina", "charm", "spellPower", "credit"];
const TOKEN_COLS: ColumnKey[] = ["intelligenceTokens", "staminaTokens", "charmTokens", "manaTokens"];
// 이름 | 능력치 5칸 | 구분선 | 기운 4칸 (360px 폭에서도 가로 스크롤 없이 들어가도록 숫자 칸은 고정 폭)
const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(5,1.65rem)_0.4rem_repeat(4,1.65rem)] items-center";
// 63절(skillRules)에는 기운이 없어 능력치·학점만
const GRID_SKILL = "grid grid-cols-[minmax(0,1fr)_repeat(5,2.2rem)] items-center";

function cellValue(p: PlayerGameState, col: ColumnKey): { value: number; temp: number } {
  if (col === "credit" || col.endsWith("Tokens")) return { value: p[col as "credit"] as number, temp: 0 };
  const stat = col as StatKey;
  return { value: effectiveStat(p, stat), temp: p.tempBoosts[stat] ?? 0 };
}

export function PlayerTable({
  game,
  myId,
  offline,
  onOpenPlayer,
}: {
  game: GameState;
  myId: string;
  offline: string[];
  onOpenPlayer: (id: string) => void;
}) {
  // 메뉴 시트 안의 비교표: 늘 펼쳐 두고, 열 이름은 아이콘 아래 글자로 보인다
  const collapsed = false;
  const skill = game.rules.skillRules;
  const grid = skill ? GRID_SKILL : GRID;
  const tokenCols = skill ? [] : TOKEN_COLS;

  const players = game.turnOrder.map((id) => game.players[id]).filter(Boolean);
  const shown = collapsed ? players.filter((p) => p.id === myId) : players;
  const starterId = game.turnOrder[game.startingPlayerIndex];
  const waiting = waitingOn(game);
  const showStarter = game.phase !== "setup" && game.phase !== "ended";
  const maxOf = (col: ColumnKey) => Math.max(...players.map((p) => cellValue(p, col).value));
  const maxes = Object.fromEntries([...STAT_COLS, ...TOKEN_COLS].map((c) => [c, maxOf(c)])) as Record<ColumnKey, number>;
  // 예상 점수 = 지금 학점 + 지금 졸업하면 받을 학점 (누가 앞서는지 한눈에 보이도록)
  const scores = players.map((p) => ({ p, score: projectedScore(game, p) })).sort((x, y) => y.score - x.score);
  const myRank = 1 + scores.filter((s) => s.score > (scores.find((x) => x.p.id === myId)?.score ?? 0)).length;
  const showScores = game.phase !== "setup" && game.phase !== "ended";

  const headCell = (col: ColumnKey) => {
    const st = COLUMN_STYLE[col];
    return (
      <span key={col} className={`flex flex-col items-center justify-center text-[10px] leading-tight ${st.text}`}>
        <Icon name={st.icon} className="h-4 w-4" />
        {st.label.replace("기운", "")}
      </span>
    );
  };

  return (
    <div className="mt-1.5 rounded-2xl bg-white/80 px-1.5 py-1 ring-1 ring-purple-100" role="group" aria-label="플레이어 비교표">
      <div className={grid}>
        <span className="flex items-center gap-0.5 text-xs text-purple-600">
          <Icon name="users" className="h-4 w-4" />
          친구들
        </span>
        {STAT_COLS.map(headCell)}
        {!skill && <span aria-hidden className="mx-auto h-5 w-px bg-purple-200" />}
        {tokenCols.map(headCell)}
      </div>
      <ul>
        {shown.map((p) => {
          const isMe = p.id === myId;
          const away = offline.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenPlayer(p.id)}
                aria-label={`${p.name}${isMe ? " (나)" : ""} 자세히 보기`}
                className={`${grid} min-h-11 w-full rounded-lg py-0.5 text-center text-xs text-purple-900 active:bg-purple-100 ${isMe ? "bg-pink-100" : ""} ${away ? "opacity-55" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-0.5 text-left">
                  {showStarter && p.id === starterId && <Icon name="crown" className="h-3.5 w-3.5 text-amber-500" />}
                  {waiting.includes(p.id) && <Icon name="bell" className="h-3.5 w-3.5 text-pink-500" />}
                  <span className={`truncate ${isMe ? "font-semibold" : ""}`}>{p.name}</span>
                  {away && <span className="shrink-0 rounded bg-gray-200 px-1 text-[10px] text-gray-600">끊김</span>}
                </span>
                {STAT_COLS.map((c) => cell(p, c))}
                {!skill && <span aria-hidden className="mx-auto h-4 w-px bg-purple-200" />}
                {tokenCols.map((c) => cell(p, c))}
              </button>
            </li>
          );
        })}
      </ul>
      {showScores && (
        <p className="mx-1 mb-0.5 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-purple-600" aria-label="예상 점수">
          <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700">
            <Icon name="trophy" className="h-3.5 w-3.5" />
            예상 점수
          </span>
          {collapsed ? (
            <span>
              나 {scores.find((s) => s.p.id === myId)?.score ?? 0}점 · {myRank}위
            </span>
          ) : (
            scores.map(({ p, score }) => (
              <span key={p.id} className={p.id === myId ? "font-semibold text-pink-700" : ""}>
                {p.name} {score}
              </span>
            ))
          )}
        </p>
      )}
    </div>
  );

  function cell(p: PlayerGameState, col: ColumnKey) {
    const { value, temp } = cellValue(p, col);
    const best = maxes[col] > 0 && value === maxes[col];
    return (
      <span key={col} className={`relative mx-auto flex h-6 w-full items-center justify-center rounded-md tabular-nums ${best ? `${COLUMN_STYLE[col].bg} font-bold ${COLUMN_STYLE[col].text}` : ""}`}>
        {value}
        {temp !== 0 && <span className="absolute -right-0.5 -top-1 text-[9px] font-semibold leading-none text-pink-600">{temp > 0 ? "+" : ""}{temp}</span>}
      </span>
    );
  }
}
