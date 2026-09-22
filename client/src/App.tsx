import { useEffect } from 'react';
import { DEFAULT_DECK_CHOICE, DEFAULT_MAP_ID, getMap } from '@astraltab/shared';
import { makeSeed } from './game/hotseat';
import { GamePage } from './pages/GamePage';
import { SetupPage } from './pages/SetupPage';
import { useGameStore, type TabId } from './store/gameStore';

/**
 * 개발·검증용 바로가기: `/?quick` 은 기본 맵·기본 덱으로 곧장 핫시트를 시작한다.
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

/** 화면 전환: 설정(비게임 세계) ↔ 게임 대시보드(게임 세계). 두 세계는 한 화면에 섞지 않는다 */
export function App() {
  const screen = useGameStore((s) => s.screen);
  const startHotseat = useGameStore((s) => s.startHotseat);
  const setTab = useGameStore((s) => s.setTab);
  const selectHandCard = useGameStore((s) => s.selectHandCard);

  useEffect(() => {
    const quick = readQuickStart();
    if (!quick || useGameStore.getState().state) return;
    const map = getMap(quick.mapId);
    startHotseat({
      mapId: map.id,
      seed: quick.seed,
      players: Array.from({ length: map.players }, (_, i) => ({ nickname: `플레이어 ${i + 1}`, deckChoice: DEFAULT_DECK_CHOICE })),
    });
    if (quick.tab) setTab(quick.tab);
    if (quick.select !== null && Number.isInteger(quick.select)) selectHandCard(quick.select);
  }, [startHotseat, setTab, selectHandCard]);

  return screen === 'game' ? <GamePage /> : <SetupPage />;
}
