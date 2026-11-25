// 내 차례 사이에 일어난 일 추적: 내 차례가 끝날 때 기록·연구 상태를 표시해 두고, 다음 내 차례에 그 뒤의 일을 보여 준다
import { useEffect, useRef } from 'react';
import type { GameState, LogEntry } from '../engine/types';
import { useApp, type TurnMark } from './store/app';

const ANCHOR = 3;
export const logKey = (e: LogEntry) => `${e.round}|${e.player}|${e.text}`;

export function makeMark(game: GameState): TurnMark {
  return {
    anchor: game.log.slice(-ANCHOR).map(logKey),
    logLen: game.log.length,
    researched: Object.fromEntries(game.players.map((p) => [p.id, [...p.researched]])),
  };
}

/** 표시 뒤에 새로 쌓인 기록. 기록 길이로 먼저 찾고(같은 줄이 되풀이돼도 정확), 기록이 잘려 밀렸으면 anchor 줄로 찾는다. 둘 다 못 찾으면 최근 30줄 */
export function logSince(log: LogEntry[], anchor: string[], logLen?: number): LogEntry[] {
  if (!anchor.length) return log.slice(-30);
  const keys = log.map(logKey);
  if (logLen !== undefined && logLen <= keys.length && anchor.every((k, j) => keys[logLen - anchor.length + j] === k)) return log.slice(logLen);
  for (let i = keys.length - anchor.length; i >= 0; i--) {
    if (anchor.every((k, j) => keys[i + j] === k)) return log.slice(i + anchor.length);
  }
  return log.slice(-30);
}

/** 상대가 내 직전 차례 이후 새로 연구한 노드 */
export function newlyResearched(mark: TurnMark | null, playerId: number, researched: string[]): Set<string> {
  const before = mark?.researched[playerId];
  if (!before) return new Set();
  return new Set(researched.filter((id) => !before.includes(id)));
}

/**
 * 테이블에 한 번 둔다. 내 차례(대기 결정과 관계없이 현재 차례가 나)가 끝나면 표시를 갱신하고,
 * 다시 내 차례가 오면 그 사이 상대 기록을 요약 대기열에 넣는다(설정에서 끄면 넣지 않음)
 */
export function useTurnWatch(game: GameState, me: number, enabled = true): void {
  // 관전(좌석 없음)이면 "내 차례"가 없다
  const mine = enabled && !game.gameOver && game.current === me;
  const was = useRef<boolean | null>(null);
  useEffect(() => {
    const app = useApp.getState();
    const summarize = () => {
      if (!app.mark || !app.settings.turnSummary) return;
      const news = logSince(game.log, app.mark.anchor, app.mark.logLen).filter((e) => e.player !== me);
      // 바로 열지 않고 대기열에 — 결정·시대 배너가 끝난 뒤 하나씩 열린다
      if (news.some((e) => e.player !== null)) app.pushNotice({ kind: 'turn', entries: news });
    };
    if (was.current === null) {
      // 돌려 하기: 기기를 넘겨받은 사람의 표시가 남아 있으면(이미 내 차례로 열린 화면) 그 뒤의 일을 바로 요약한다
      if (!app.mark) app.set({ mark: makeMark(game) });
      else if (mine) summarize();
      was.current = mine;
      return;
    }
    if (was.current && !mine) app.set({ mark: makeMark(game) });
    if (!was.current && mine) summarize();
    was.current = mine;
  }, [mine, game, me]);
}
