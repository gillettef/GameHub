import { useEffect } from 'react';
import { DEFAULT_DECK_CHOICE, DEFAULT_MAP_ID, getMap } from '@astraltab/shared';
import { makeSeed } from './game/hotseat';
import { navigate, useRoute } from './lib/router';
import { GamePage } from './pages/GamePage';
import { LandingPage } from './pages/LandingPage';
import { RoomPage } from './pages/RoomPage';
import { SetupPage } from './pages/SetupPage';
import { useGameStore, type TabId } from './store/gameStore';

/**
 * 개발·검증용 바로가기: `/hotseat?quick` 은 기본 맵·기본 덱으로 곧장 핫시트를 시작한다.
 * `&map=<id>` 로 맵을, `&tab=status|progress` 로 첫 탭을, `&seed=<n>` 으로 시드를, `&select=<손패 index>` 로 선택 카드를 지정한다.
 */
function readQuickStart(): { mapId: string; seed: number; tab: TabId | null; select: number | null } | null {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('quick')) return null;
  const tab = q.get('tab');
  return {
    mapId: q.get('map') ?? DEFAULT_MAP_ID,
    seed: Number(q.get('seed') ?? makeSeed()),
    tab: tab === 'status' || tab === 'progress' || tab === 'board' ? tab : null,
    select: q.has('select') ? Number(q.get('select')) : null,
  };
}

/**
 * 경로별 화면. 비게임 세계(랜딩·로비·설정)와 게임 세계(대시보드)는 한 화면에 섞지 않는다.
 *  /            랜딩
 *  /hotseat     핫시트 설정 → 같은 경로에서 게임 (스토어 mode 로 구분)
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
  const reset = useGameStore((s) => s.reset);

  useEffect(() => {
    const quick = readQuickStart();
    if (!quick || useGameStore.getState().state) return;
    const map = getMap(quick.mapId);
    startHotseat({
      mapId: map.id,
      seed: quick.seed,
      players: Array.from({ length: map.players }, (_, i) => ({ nickname: `플레이어 ${i + 1}`, deckChoice: DEFAULT_DECK_CHOICE })),
    });
    acknowledgeHandoff();
    if (quick.tab) setTab(quick.tab);
    if (quick.select !== null && Number.isInteger(quick.select)) selectHandCard(quick.select);
    if (window.location.pathname !== '/hotseat') navigate('/hotseat', true);
  }, [startHotseat, acknowledgeHandoff, setTab, selectHandCard]);

  switch (route.name) {
    case 'room':
      return <RoomPage roomId={route.roomId} />;
    case 'hotseat':
      if (mode === 'hotseat' && state) {
        return (
          <GamePage
            onQuit={() => {
              reset();
              navigate('/');
            }}
          />
        );
      }
      return <SetupPage onStart={() => undefined} />;
    case 'landing':
      return <LandingPage />;
    default:
      return <LandingPage />;
  }
}
