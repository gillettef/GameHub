import { useEffect } from 'react';
import { autoAction } from '@rootbound/shared';
import { asState } from './game/derived';
import { makeSeed } from './game/hotseat';
import { navigate, useRoute } from './lib/router';
import { GamePage } from './pages/GamePage';
import { LandingPage } from './pages/LandingPage';
import { getNickname } from './lib/identity';
import { RoomPage } from './pages/RoomPage';
import { SetupPage } from './pages/SetupPage';
import { useGameStore, type TabId } from './store/gameStore';

/**
 * 개발·검증용 바로가기: `/hotseat?quick` 은 곧장 핫시트를 시작한다.
 * `&players=<2~4>` 인원, `&seed=<n>` 시드, `&play` 드래프트를 자동 픽으로 끝내고 심기 단계부터,
 * `&tab=<board|status|progress|cards|help>` 첫 탭, `&select=<손패 index>` 선택 카드, `&modal=<손패 index>` 카드 확대 모달.
 */
function readQuickStart(): { players: number; seed: number; play: boolean; tab: TabId | null; select: number | null; modal: number | null } | null {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('quick')) return null;
  const tab = q.get('tab');
  const players = Number(q.get('players') ?? 2);
  return {
    players: players >= 2 && players <= 4 ? players : 2,
    seed: Number(q.get('seed') ?? makeSeed()),
    play: q.has('play'),
    tab: tab === 'status' || tab === 'progress' || tab === 'board' || tab === 'cards' || tab === 'help' ? tab : null,
    select: q.has('select') ? Number(q.get('select')) : null,
    modal: q.has('modal') ? Number(q.get('modal')) : null,
  };
}

/**
 * 경로별 화면. 비게임 세계(랜딩·로비·설정)와 게임 세계(대시보드)는 한 화면에 섞지 않는다.
 *  /            랜딩
 *  /hotseat     핫시트 설정 → 같은 경로에서 게임 (스토어 mode 로 구분)
 *  /tutorial    연습 봇과 두는 튜토리얼 판
 *  /room/:id    온라인 방 (로비 → 게임)
 */
export function App() {
  const route = useRoute();
  const mode = useGameStore((s) => s.mode);
  const state = useGameStore((s) => s.state);
  const startHotseat = useGameStore((s) => s.startHotseat);
  const acknowledgeHandoff = useGameStore((s) => s.acknowledgeHandoff);
  const setTab = useGameStore((s) => s.setTab);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const reset = useGameStore((s) => s.reset);
  const startTutorial = useGameStore((s) => s.startTutorial);
  const tutorial = useGameStore((s) => s.tutorial);

  useEffect(() => {
    const quick = readQuickStart();
    if (!quick || useGameStore.getState().state) return;
    startHotseat({ seed: quick.seed, nicknames: Array.from({ length: quick.players }, (_, i) => `플레이어 ${i + 1}`) });
    if (quick.play) {
      for (let i = 0; i < 40; i++) {
        const st = useGameStore.getState().state;
        if (!st || st.phase !== 'drafting' || !st.currentPlayerId) break;
        const a = autoAction(asState(st), st.currentPlayerId);
        if (!a) break;
        useGameStore.getState().dispatch(a);
      }
    }
    acknowledgeHandoff();
    if (quick.tab) setTab(quick.tab);
    if (quick.select !== null && Number.isInteger(quick.select)) selectHandCard(quick.select);
    if (quick.modal !== null && Number.isInteger(quick.modal)) openCardModal({ kind: 'hand', index: quick.modal });
    if (window.location.pathname !== '/hotseat') navigate('/hotseat', true);
  }, [startHotseat, acknowledgeHandoff, setTab, selectHandCard, openCardModal]);

  // /tutorial 로 들어오면(새로고침 포함) 연습 판을 새로 시작한다
  useEffect(() => {
    if (route.name === 'tutorial' && !(useGameStore.getState().tutorial && useGameStore.getState().state)) startTutorial(getNickname());
  }, [route.name, startTutorial]);

  switch (route.name) {
    case 'room':
      return <RoomPage roomId={route.roomId} />;
    case 'hotseat':
      if (mode === 'hotseat' && state && !tutorial) {
        return (
          <GamePage
            onQuit={() => {
              reset();
              navigate('/');
            }}
          />
        );
      }
      return <SetupPage />;
    case 'tutorial':
      if (mode === 'hotseat' && tutorial && state) {
        return (
          <GamePage
            onQuit={() => {
              reset();
              navigate('/');
            }}
          />
        );
      }
      return null;
    case 'landing':
      return <LandingPage />;
    default:
      return <LandingPage />;
  }
}
