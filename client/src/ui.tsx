import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerId } from '@server/engine/state';
import { useView } from './store';

// 게임 화면의 탐색 상태: 어느 참가자의 보드를 보는지, 메인 탭(개인 보드/공용 보드)과 그 안의 하위 탭, 방출 모드.
// 단계가 바뀌면 그 단계에 맞는 탭을 기본으로 연다 (주중 → 공용/이적 시장, 경기 준비 → 개인/경기 보드,
// 경기 결과·종료 → 공용/리그, 그 밖에 → 개인/구단 보드). 턴제 단계에서 차례가 바뀌면 그 참가자를 따라간다.

export type MainTab = 'personal' | 'shared';
export type BoardTab = 'club' | 'stadium' | 'match' | 'hand';
export type SharedTab = 'market' | 'league';
export type MarketTab = 'players' | 'staff' | 'sponsors';

interface UiStore {
  selected: PlayerId;
  selectPlayer: (pid: PlayerId) => void; // 헤더 참가자 띠에서 클릭 → 그 참가자의 개인 보드
  mainTab: MainTab;
  setMainTab: (t: MainTab) => void;
  boardTab: BoardTab;
  setBoardTab: (t: BoardTab) => void;
  sharedTab: SharedTab;
  setSharedTab: (t: SharedTab) => void;
  showBoard: (t: BoardTab, pid?: PlayerId) => void; // 개인 보드의 특정 탭으로 이동
  showShared: (t: SharedTab) => void; // 공용 보드의 특정 탭으로 이동
  marketTab: MarketTab; // 이적 시장 안의 선수/직원/스폰서 탭
  setMarketTab: (t: MarketTab) => void;
  showMarket: (t: MarketTab) => void; // 공용 보드 → 이적 시장 → 해당 행
  releasing: boolean; // 방출 모드: 경기 보드의 내 선수 카드를 눌러 방출 대상을 고른다
  setReleasing: (v: boolean) => void;
  settledRoll: string | null; // 주사위 트레이가 멈춰 보여주고 있는 눈의 키(`actor:roll`). 구르는 동안은 null
  setSettledRoll: (key: string | null) => void;
}

const UiContext = createContext<UiStore | null>(null);

function defaults(kind: string): { main: MainTab; board: BoardTab; shared: SharedTab } {
  switch (kind) {
    case 'weekday':
      return { main: 'shared', board: 'club', shared: 'market' };
    case 'friday.prepare':
    case 'friday.match':
      return { main: 'personal', board: 'match', shared: 'market' };
    case 'friday.aftermath':
    case 'gameOver':
      return { main: 'shared', board: 'match', shared: 'league' };
    default:
      return { main: 'personal', board: 'club', shared: 'market' };
  }
}

export function UiProvider({ children }: { children: ReactNode }) {
  const { view, session } = useView();
  const [selected, setSelected] = useState<PlayerId>(session?.playerId ?? view.seats[0]!);
  const [mainTab, setMainTab] = useState<MainTab>(() => defaults(view.phase.kind).main);
  const [boardTab, setBoardTab] = useState<BoardTab>(() => defaults(view.phase.kind).board);
  const [sharedTab, setSharedTab] = useState<SharedTab>(() => defaults(view.phase.kind).shared);
  const [marketTab, setMarketTab] = useState<MarketTab>('players');
  const [releasing, setReleasing] = useState(false);
  const [settledRoll, setSettledRoll] = useState<string | null>(null);

  useEffect(() => {
    if (!view.seats.includes(selected)) setSelected(session?.playerId ?? view.seats[0]!);
  }, [view.seats, selected, session?.playerId]);

  const current = 'current' in view.phase ? view.phase.current : null;
  useEffect(() => {
    if (current) setSelected(current);
    setReleasing(false);
  }, [current]);

  useEffect(() => {
    const d = defaults(view.phase.kind);
    setMainTab(d.main);
    setBoardTab(d.board);
    setSharedTab(d.shared);
    setReleasing(false);
  }, [view.phase.kind]);

  const selectPlayer = useCallback((pid: PlayerId) => {
    setSelected(pid);
    setMainTab('personal');
  }, []);
  const showBoard = useCallback((t: BoardTab, pid?: PlayerId) => {
    if (pid) setSelected(pid);
    setMainTab('personal');
    setBoardTab(t);
  }, []);
  const showShared = useCallback((t: SharedTab) => {
    setMainTab('shared');
    setSharedTab(t);
  }, []);
  const showMarket = useCallback((t: MarketTab) => {
    setMainTab('shared');
    setSharedTab('market');
    setMarketTab(t);
  }, []);

  const value = useMemo<UiStore>(
    () => ({ selected, selectPlayer, mainTab, setMainTab, boardTab, setBoardTab, sharedTab, setSharedTab, showBoard, showShared, marketTab, setMarketTab, showMarket, releasing, setReleasing, settledRoll, setSettledRoll }),
    [selected, selectPlayer, mainTab, boardTab, sharedTab, showBoard, showShared, marketTab, showMarket, releasing, settledRoll],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiStore {
  const s = useContext(UiContext);
  if (!s) throw new Error('UiProvider missing');
  return s;
}

export function rollKeyOf(actorId: string | null, roll: number | null): string {
  return `${actorId}:${roll}`;
}

// 서버가 정한 눈을 화면에 보여줘도 되는가: 주사위 트레이가 그 눈으로 멈춘 뒤에만. 구르는 동안은 null
export function useRevealedRoll(actorId: string, roll: number | null): number | null {
  const { settledRoll } = useUi();
  return roll !== null && settledRoll === rollKeyOf(actorId, roll) ? roll : null;
}
