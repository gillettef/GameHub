import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActionFocus, PlayerId } from '@server/engine/state';
import { useView } from './store';

// 다른 참가자(봇 포함)의 행동 따라가기 (사용자 요청 2026-09-22): 내 차례가 아닐 때 서버가 내려준 마지막 행동(view.lastAction)을
// 화면 아래 **관전 띠**(components/Follow.tsx)에 "○○ · 영입: 김○○"처럼 띄운다. 화면은 옮기지 않는다 — 행동마다 보드·탭이 바뀌어
// 정신없다는 사용자 피드백(2026-09-22)으로 자동 이동을 뺐다. 띠의 "보러 가기"를 누르면 그때 그 보드·탭으로 가서 만진 카드·시설을
// 몇 초 비춘다(spotlight). 헤더의 눈 토글로 끄고 켠다 (localStorage eleven.follow)
const FOLLOW_KEY = 'eleven.follow';
const SPOTLIGHT_MS = 6000;
const TICKER_MS = 20000; // 새 행동이 없으면 관전 띠가 스스로 사라지는 시간
export interface Spotlight {
  seq: number;
  pid: PlayerId;
  focus: ActionFocus;
}
export interface Ticker {
  seq: number;
  pid: PlayerId;
  text: string;
  focus?: ActionFocus;
}
function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function loadFollow(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== 'off';
  } catch {
    return true;
  }
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
  follow: boolean; // 다른 참가자의 행동을 관전 띠로 알리기
  setFollow: (on: boolean) => void;
  ticker: Ticker | null; // 관전 띠에 보이는 다른 참가자의 마지막 행동 (새 행동이 오면 바뀌고, 한동안 없으면 사라진다)
  dismissTicker: () => void;
  visitTicker: () => void; // 관전 띠의 "보러 가기": 그 보드·탭으로 이동하고 만진 카드·시설을 비춘다
  spotlight: Spotlight | null; // 방금 보러 간 카드·시설 (몇 초 뒤 사라진다)
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
  const [follow, setFollowState] = useState(loadFollow);
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const seenSeq = useRef(view.lastAction?.seq ?? 0); // 접속(재접속) 시점 이전의 행동은 알리지 않는다
  const [sideTab, setSideTab] = useState<'log' | 'chat'>('log');
  const [chatSeen, setChatSeen] = useState(() => chat.at(-1)?.id ?? 0); // 들어오기 전에 쌓인 글은 읽은 것으로

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

  const setFollow = useCallback((on: boolean) => {
    setFollowState(on);
    try {
      localStorage.setItem(FOLLOW_KEY, on ? 'on' : 'off');
    } catch {
      /* 저장 못 해도 이번 세션에는 적용 */
    }
  }, []);

  // 관전 띠: 내 차례가 아닐 때 다른 참가자의 행동(기록 문구가 있는 것)이 들어오면 띠의 내용을 바꾼다. 화면은 옮기지 않는다.
  // 준비 단계(드래프트·목표)는 동시 진행이고 화면이 이미 "기다리는 중"을 보여 주므로 알리지 않는다
  const lastAction = view.lastAction;
  const me = session?.playerId;
  const myTurn = 'current' in view.phase && view.phase.current === me;
  useEffect(() => {
    if (!lastAction || lastAction.seq === seenSeq.current) return;
    seenSeq.current = lastAction.seq;
    if (!follow || !lastAction.text || lastAction.pid === me || myTurn || view.phase.kind.startsWith('setup.')) return;
    setTicker({ seq: lastAction.seq, pid: lastAction.pid, text: lastAction.text, focus: lastAction.focus });
  }, [lastAction, follow, me, myTurn, view.phase.kind]);
  useEffect(() => {
    if (!ticker) return;
    const t = setTimeout(() => setTicker((s) => (s?.seq === ticker.seq ? null : s)), TICKER_MS);
    return () => clearTimeout(t);
  }, [ticker]);
  useEffect(() => {
    if (!follow) setTicker(null);
  }, [follow]);
  const dismissTicker = useCallback(() => setTicker(null), []);
  const visitTicker = useCallback(() => {
    if (!ticker?.focus) return;
    const focus = ticker.focus;
    if (focus.board === 'market') showMarket(focus.row);
    else showBoard(focus.board, ticker.pid);
    setSpotlight({ seq: ticker.seq, pid: ticker.pid, focus });
    setTicker(null);
  }, [ticker, showBoard, showMarket]);
  // 내 차례가 오면 진행 화면이 먼저 보이게 (사용자 요청 2026-09-22): 보러 가기로 다른 참가자의 보드·시장에 가 있었을 수 있으므로
  // 모바일은 '진행' 탭으로, PC 는 그 단계의 기본 탭으로 되돌린다. 관전 띠도 거둔다
  const prevMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !prevMyTurn.current) {
      const d = defaults(view.phase.kind);
      setMainTab(d.main);
      setBoardTab(d.board);
      setSharedTab(d.shared);
      setMobileTab('play');
      setTicker(null);
    }
    prevMyTurn.current = myTurn;
  }, [myTurn, view.phase.kind]);

  useEffect(() => {
    if (!spotlight) return;
    // 비춘 카드·시설이 화면 밖이면 보이는 곳으로 (탭 이동으로 맨 위로 간 뒤에 실행되도록 한 프레임 뒤)
    const raf = requestAnimationFrame(() => document.querySelector('.spotlight')?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }));
    const t = setTimeout(() => setSpotlight((s) => (s?.seq === spotlight.seq ? null : s)), SPOTLIGHT_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [spotlight]);

  // 메뉴·탭을 누르면(또는 단계가 바뀌어 탭이 재설정되면) 항상 화면 맨 위로 (사용자 요청 2026-09-22). 페이지는 window 가 스크롤한다(헤더·사이드바는 sticky)
  const firstNav = useRef(true);
  useEffect(() => {
    if (firstNav.current) {
      firstNav.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [selected, mainTab, boardTab, sharedTab, marketTab, mobileTab]);

  const value = useMemo<UiStore>(
    () => ({ selected, selectPlayer, mainTab, setMainTab, boardTab, setBoardTab, sharedTab, setSharedTab, showBoard, showShared, marketTab, setMarketTab, showMarket, mobileTab, setMobileTab, releasing, setReleasing, settledRoll, setSettledRoll, resultSeen, setResultSeen, matchWatched, setMatchWatched, follow, setFollow, ticker, dismissTicker, visitTicker, spotlight, sideTab, setSideTab, chatSeen, setChatSeen }),
    [selected, selectPlayer, mainTab, boardTab, sharedTab, showBoard, showShared, marketTab, showMarket, mobileTab, releasing, settledRoll, resultSeen, matchWatched, follow, setFollow, ticker, dismissTicker, visitTicker, spotlight, sideTab, chatSeen],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiStore {
  const s = useContext(UiContext);
  if (!s) throw new Error('UiProvider missing');
  return s;
}

// 헤더 토글: 관전 띠(다른 참가자의 행동 알림) 켜기/끄기 (알림 토글과 같은 모양)
export function FollowToggle() {
  const { follow, setFollow } = useUi();
  return (
    <span className="notify-toggles follow-toggle">
      <button className={`toggle${follow ? ' on' : ''}`} aria-pressed={follow} title={`내 차례가 아닐 때 다른 참가자의 행동을 화면 아래 관전 띠로 알립니다. 띠의 "보러 가기"로 그 보드를 봅니다 (${follow ? '켜짐' : '꺼짐'})`} onClick={() => setFollow(!follow)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="label">따라가기</span>
      </button>
    </span>
  );
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
