import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { effectiveStat, type GameState, type PlayerGameState, type StatKey } from "./gameTypes";
import { COLUMN_STYLE, type ColumnKey } from "./statStyle";
import { waitingOn } from "./Social";

// 상단에 항상 보이는 플레이어 비교표: 행 = 플레이어, 열 = 능력치 5종 + 토큰 4종
const STAT_COLS: ColumnKey[] = ["intelligence", "stamina", "charm", "spellPower", "credit"];
const TOKEN_COLS: ColumnKey[] = ["intelligenceTokens", "staminaTokens", "charmTokens", "manaTokens"];
// 이름 | 능력치 5칸 | 구분선 | 토큰 4칸 (360px 폭에서도 가로 스크롤 없이 들어가도록 숫자 칸은 고정 폭)
const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(5,1.65rem)_0.4rem_repeat(4,1.65rem)] items-center";
const COLLAPSE_KEY = "magicacademy.playerTable.collapsed";

function readCollapsed(defaultValue: boolean): boolean {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY);
    return v === null ? defaultValue : v === "1";
  } catch {
    return defaultValue;
  }
}

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
  const [collapsed, setCollapsed] = useState(() => readCollapsed(game.turnOrder.length >= 4));
  const [tip, setTip] = useState<ColumnKey | null>(null);
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => setTip(null), 2500);
    return () => window.clearTimeout(t);
  }, [tip]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* 저장 못 해도 화면은 동작한다 */
    }
  };

  const players = game.turnOrder.map((id) => game.players[id]).filter(Boolean);
  const shown = collapsed ? players.filter((p) => p.id === myId) : players;
  const starterId = game.turnOrder[game.startingPlayerIndex];
  const waiting = waitingOn(game);
  const showStarter = game.phase !== "setup" && game.phase !== "ended";
  const maxOf = (col: ColumnKey) => Math.max(...players.map((p) => cellValue(p, col).value));
  const maxes = Object.fromEntries([...STAT_COLS, ...TOKEN_COLS].map((c) => [c, maxOf(c)])) as Record<ColumnKey, number>;

  const headCell = (col: ColumnKey) => {
    const st = COLUMN_STYLE[col];
    return (
      <button
        key={col}
        type="button"
        onClick={() => setTip(tip === col ? null : col)}
        aria-label={st.label}
        aria-pressed={tip === col}
        className={`flex h-8 w-full items-center justify-center rounded-lg ${st.text} ${tip === col ? st.bg : ""}`}
      >
        <Icon name={st.icon} className="h-4 w-4" />
      </button>
    );
  };

  return (
    <div className="mt-1.5 rounded-2xl bg-white/80 px-1.5 py-1 ring-1 ring-purple-100" role="group" aria-label="플레이어 비교표">
      <div className={GRID}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "친구들 상태 펼치기" : "친구들 상태 접기"}
          className="flex h-8 min-w-0 items-center gap-0.5 text-left text-xs text-purple-600"
        >
          <Icon name="users" className="h-4 w-4" />
          <span className="truncate">{collapsed ? "펼치기" : "접기"}</span>
          <span aria-hidden className={`text-[10px] transition-transform ${collapsed ? "" : "rotate-180"}`}>▾</span>
        </button>
        {STAT_COLS.map(headCell)}
        <span aria-hidden className="mx-auto h-5 w-px bg-purple-200" />
        {TOKEN_COLS.map(headCell)}
      </div>
      {tip && (
        <p role="status" className={`mx-1 mb-1 rounded-lg px-2 py-0.5 text-center text-xs ${COLUMN_STYLE[tip].bg} ${COLUMN_STYLE[tip].text}`}>
          {COLUMN_STYLE[tip].label}
          {tip === "credit" ? "" : STAT_COLS.includes(tip) ? " (능력치)" : ""}
        </p>
      )}
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
                className={`${GRID} min-h-8 w-full rounded-lg py-0.5 text-center text-xs text-purple-900 active:bg-purple-100 ${isMe ? "bg-pink-100" : ""} ${away ? "opacity-55" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-0.5 text-left">
                  {showStarter && p.id === starterId && <Icon name="crown" className="h-3.5 w-3.5 text-amber-500" />}
                  {waiting.includes(p.id) && <Icon name="bell" className="h-3.5 w-3.5 text-pink-500" />}
                  <span className={`truncate ${isMe ? "font-semibold" : ""}`}>{p.name}</span>
                  {away && <span className="shrink-0 rounded bg-gray-200 px-1 text-[10px] text-gray-600">끊김</span>}
                </span>
                {STAT_COLS.map((c) => cell(p, c))}
                <span aria-hidden className="mx-auto h-4 w-px bg-purple-200" />
                {TOKEN_COLS.map((c) => cell(p, c))}
              </button>
            </li>
          );
        })}
      </ul>
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
