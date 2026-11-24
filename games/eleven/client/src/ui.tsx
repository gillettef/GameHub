import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerId } from '@server/engine/state';
import { useView } from './store';

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 게임 화면의 탐색 상태: 어느 참가자의 보드를 보는지, 메인 탭(개인 보드/공용 보드)과 그 안의 하위 탭, 방출 모드.
// 단계가 바뀌면 그 단계에 맞는 탭을 기본으로 연다 (주중 → 공용/이적 시장, 경기 준비 → 개인/경기 보드,
// 경기 결과·종료 → 공용/리그, 그 밖에 → 개인/구단 보드). 턴제 단계에서 차례가 바뀌면 그 참가자를 따라간다.

export type MainTab = 'personal' | 'shared';
export type BoardTab = 'club' | 'stadium' | 'match' | 'hand';
export type SharedTab = 'market' | 'league';
export type MobileTab = 'play' | 'board' | 'market' | 'league' | 'log'; // 모바일용 화면의 아래 탭 막대 (한 번에 한 영역만 보인다)
export type MarketTab = 'players' | 'veterans' | 'prospects' | 'staff' | 'sponsors'; // 주전 행 / 베테랑 행 / 유망주 더미 / 직원 / 스폰서

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
  showCard: (key: string, pid?: PlayerId) => void; // 구단 보드의 그 직원·임원 카드(`data-focus` 키, 'staff:2'/'executive:0')로 이동해 화면을 그 카드에 맞춘다
  showShared: (t: SharedTab) => void; // 공용 보드의 특정 탭으로 이동
  marketTab: MarketTab; // 이적 시장 안의 선수/직원/스폰서 탭
  setMarketTab: (t: MarketTab) => void;
  showMarket: (t: MarketTab) => void; // 공용 보드 → 이적 시장 → 해당 행
  mobileTab: MobileTab; // 모바일용: 진행(단계 패널·주사위·주중 행동) / 구단 / 시장 / 리그 / 기록. 단계가 바뀌면 '진행'으로
  setMobileTab: (t: MobileTab) => void;
  releasing: boolean; // 방출 모드: 경기 보드의 내 선수 카드를 눌러 방출 대상을 고른다
  setReleasing: (v: boolean) => void;
  settledRoll: string | null; // 주사위 트레이가 멈춰 보여주고 있는 눈의 키(`actor:roll`). 구르는 동안은 null
  setSettledRoll: (key: string | null) => void;
  sideTab: 'log' | 'chat'; // 오른쪽(모바일은 '기록' 탭) 패널: 행동 기록 / 채팅
  setSideTab: (t: 'log' | 'chat') => void;
  chatSeen: number; // 내가 본 마지막 채팅 id — 그 뒤에 온 남의 글이 '안 읽음'
  setChatSeen: (id: number) => void;
  resultSeen: string | null; // 경기 결과를 확인한 키(`week:actor`). 내 경기 결과를 확인해야 경기 영향 주사위를 굴릴 수 있다 (스텝 진행)
  setResultSeen: (key: string | null) => void;
  matchWatched: string | null; // 경기 보기(재생)를 마치고 경기 종료 스텝으로 넘어간 키(`week:actor`) — 차례인 본인 기준
  setMatchWatched: (key: string | null) => void;
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
  const { view, session, chat } = useView();
  const [selected, setSelected] = useState<PlayerId>(session?.playerId ?? view.seats[0]!);
  const [mainTab, setMainTab] = useState<MainTab>(() => defaults(view.phase.kind).main);
  const [boardTab, setBoardTab] = useState<BoardTab>(() => defaults(view.phase.kind).board);
  const [sharedTab, setSharedTab] = useState<SharedTab>(() => defaults(view.phase.kind).shared);
  const [marketTab, setMarketTab] = useState<MarketTab>('players');
  const [mobileTab, setMobileTab] = useState<MobileTab>('play');
  const [releasing, setReleasing] = useState(false);
  const [settledRoll, setSettledRoll] = useState<string | null>(null);
  const [resultSeen, setResultSeen] = useState<string | null>(null);
  const [matchWatched, setMatchWatched] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<'log' | 'chat'>('log');
  const [chatSeen, setChatSeen] = useState(() => chat.at(-1)?.id ?? 0); // 들어오기 전에 쌓인 글은 읽은 것으로

  useEffect(() => {
    if (!view.seats.includes(selected)) setSelected(session?.playerId ?? view.seats[0]!);
  }, [view.seats, selected, session?.playerId]);

  // 차례가 바뀌어 보던 참가자가 자동으로 바뀐 것은 '메뉴를 누른 것'이 아니므로 화면을 맨 위로 올리지 않는다 (아래 스크롤 효과).
  // 미리 라인업을 짜거나 시장을 읽는 중에 봇이 차례를 넘길 때마다 화면이 튀었다. 단계 전환·내 차례 시작은 탭을 다시 잡으므로 올린다
  const autoSelect = useRef(false);
  const forceNav = useRef(false);
  const current = 'current' in view.phase ? view.phase.current : null;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    if (current) {
      if (selectedRef.current !== current) autoSelect.current = true; // 실제로 바뀔 때만 (안 바뀌면 스크롤 효과가 돌지 않아 표시가 남는다)
      setSelected(current);
    }
    setReleasing(false);
  }, [current]);

  useEffect(() => {
    forceNav.current = true;
    const d = defaults(view.phase.kind);
    setMainTab(d.main);
    setBoardTab(d.board);
    setSharedTab(d.shared);
    setMobileTab('play');
    setReleasing(false);
  }, [view.phase.kind]);

  const selectPlayer = useCallback((pid: PlayerId) => {
    setSelected(pid);
    setMainTab('personal');
    setMobileTab('board');
  }, []);
  const showBoard = useCallback((t: BoardTab, pid?: PlayerId) => {
    if (pid) setSelected(pid);
    setMainTab('personal');
    setBoardTab(t);
    setMobileTab('board');
  }, []);
  // 카드 행동 버튼(진행 영역) → 구단 보드의 그 카드로 (사용자 요청 2026-09-24: 전에는 구단 보드 맨 위로만 갔다).
  // 이동할 카드는 ref 에 두고 navTick 으로 아래 스크롤 효과를 깨운다 — 이미 구단 보드를 보고 있어 탭 상태가 안 바뀌어도 스크롤되게
  const focusRef = useRef<string | null>(null);
  const [navTick, setNavTick] = useState(0);
  const showCard = useCallback((key: string, pid?: PlayerId) => {
    focusRef.current = key;
    if (pid) setSelected(pid);
    setMainTab('personal');
    setBoardTab('club');
    setMobileTab('board');
    setNavTick((n) => n + 1);
  }, []);
  const showShared = useCallback((t: SharedTab) => {
    setMainTab('shared');
    setSharedTab(t);
    setMobileTab(t);
  }, []);
  const showMarket = useCallback((t: MarketTab) => {
    setMainTab('shared');
    setSharedTab('market');
    setMarketTab(t);
    setMobileTab('market');
  }, []);

  // 내 차례가 오면 진행 화면이 먼저 보이게 (사용자 요청 2026-09-22): 다른 참가자의 보드·시장을 보고 있었을 수 있으므로
  // 모바일은 '진행' 탭으로, PC 는 그 단계의 기본 탭으로 되돌린다
  const me = session?.playerId;
  const turnBased = 'current' in view.phase;
  const myTurn = 'current' in view.phase && view.phase.current === me;
  const prevMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !prevMyTurn.current) {
      forceNav.current = true;
      const d = defaults(view.phase.kind);
      setMainTab(d.main);
      setBoardTab(d.board);
      setSharedTab(d.shared);
      setMobileTab('play');
    } else if (!myTurn && prevMyTurn.current && turnBased && view.phase.kind === 'weekday') {
      // 주중에 내 차례가 끝나 다른 참가자 차례가 되면 '기록·채팅' 탭의 기록으로 (사용자 요청 2026-09-24): '진행' 탭은 남의 주중 차례엔 비어 있고,
      // 다른 참가자가 무엇을 하는지는 기록으로 본다 (행동 따라가기 기능은 없앴다).
      // 이사회·경기 결과는 남의 주사위와 경기 보기가 '진행' 탭에 나오므로 그대로 둔다 — 서로 지켜보라고 턴제로 바꾼 단계다
      setMobileTab('log');
      setSideTab('log');
    }
    prevMyTurn.current = myTurn;
  }, [myTurn, turnBased, view.phase.kind]);

  // 메뉴·탭을 누르면(또는 단계가 바뀌어 탭이 재설정되면) 항상 화면 맨 위로 (사용자 요청 2026-09-22). 페이지는 window 가 스크롤한다(헤더·사이드바는 sticky).
  // showCard 로 왔으면 맨 위 대신 그 카드(`data-focus`)가 보이게 맞추고 잠깐 초록 테두리로 표시한다
  const firstNav = useRef(true);
  const lastNav = useRef({ selected, mainTab, boardTab, sharedTab, marketTab, mobileTab, navTick });
  useEffect(() => {
    const prev = lastNav.current;
    lastNav.current = { selected, mainTab, boardTab, sharedTab, marketTab, mobileTab, navTick };
    const auto = autoSelect.current;
    const forced = forceNav.current;
    autoSelect.current = false;
    forceNav.current = false;
    if (firstNav.current) {
      firstNav.current = false;
      return;
    }
    // 차례가 바뀌어 보던 참가자만 자동으로 바뀌었으면(다른 탭 상태는 그대로) 스크롤하지 않는다
    const onlySelected = prev.selected !== selected && prev.mainTab === mainTab && prev.boardTab === boardTab && prev.sharedTab === sharedTab && prev.marketTab === marketTab && prev.mobileTab === mobileTab && prev.navTick === navTick;
    if (auto && onlySelected && !forced) return;
    const behavior = reducedMotion() ? 'auto' : 'smooth';
    const key = focusRef.current;
    focusRef.current = null;
    const target = key ? document.querySelector<HTMLElement>(`[data-focus="${key}"]`) : null;
    if (target) {
      target.scrollIntoView({ block: 'center', inline: 'center', behavior });
      target.classList.add('focus-flash');
      const timer = setTimeout(() => target.classList.remove('focus-flash'), 1600);
      return () => clearTimeout(timer);
    }
    window.scrollTo({ top: 0, behavior });
  }, [selected, mainTab, boardTab, sharedTab, marketTab, mobileTab, navTick]);

  const value = useMemo<UiStore>(
    () => ({ selected, selectPlayer, mainTab, setMainTab, boardTab, setBoardTab, sharedTab, setSharedTab, showBoard, showCard, showShared, marketTab, setMarketTab, showMarket, mobileTab, setMobileTab, releasing, setReleasing, settledRoll, setSettledRoll, resultSeen, setResultSeen, matchWatched, setMatchWatched, sideTab, setSideTab, chatSeen, setChatSeen }),
    [selected, selectPlayer, mainTab, boardTab, sharedTab, showBoard, showCard, showShared, marketTab, showMarket, mobileTab, releasing, settledRoll, resultSeen, matchWatched, sideTab, chatSeen],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiStore {
  const s = useContext(UiContext);
  if (!s) throw new Error('UiProvider missing');
  return s;
}

export function resultKeyOf(week: number, actorId: string | null): string {
  return `${week}:${actorId}`;
}

// tag: 같은 참가자의 다른 주사위(경기 영향 6면체 / 부상 12면체 n번째)를 구분한다
export function rollKeyOf(actorId: string | null, roll: number | null, tag = ''): string {
  return `${actorId}:${tag}${roll}`;
}

// 서버가 정한 눈을 화면에 보여줘도 되는가: 주사위 트레이가 그 눈으로 멈춘 뒤에만. 구르는 동안은 null
export function useRevealedRoll(actorId: string, roll: number | null, tag = ''): number | null {
  const { settledRoll } = useUi();
  return roll !== null && settledRoll === rollKeyOf(actorId, roll, tag) ? roll : null;
}
