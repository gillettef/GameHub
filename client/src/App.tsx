import { useEffect } from 'react';
import { autoAction, legalPlantCells } from '@rootbound/shared';
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
 * 개발·검증용 바로가기: `/hotseat?quick` 은 곧장 핫시트를 시작한다(이번 판 식물 공개 화면).
 * `&players=<2~4>` 인원, `&seed=<n>` 시드, `&play=<n>` 공개 단계를 확인한 뒤 자동 수로 n번 두고 시작(가져오기·심기 각각 1번, 중반·마켓 빈 화면 확인용),
 * `&tab=<board|status|progress|cards|help>` 첫 탭, `&take=<마켓 index | pile>` 가져오기 차례면 그 카드(pile = 카드 더미 맨 위)를 가져온다(TAKE),
 * `&select=<손패 index>` 선택 카드, `&cell=<합법 칸 index>` 고른 카드로 심을 후보 칸(미리보기), `&modal=<손패 index>` 카드 확대 모달.
 * play·take·select·cell·modal 중 하나라도 있으면 공개 단계를 자동으로 확인한다.
 */
function readQuickStart(): { players: number; seed: number; play: number; tab: TabId | null; select: number | null; cell: number | null; take: number | 'pile' | null; modal: number | null } | null {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('quick')) return null;
  const tab = q.get('tab');
  const players = Number(q.get('players') ?? 2);
  return {
    players: players >= 2 && players <= 4 ? players : 2,
    seed: Number(q.get('seed') ?? makeSeed()),
    play: Number(q.get('play')) || 0,
    tab: tab === 'status' || tab === 'progress' || tab === 'board' || tab === 'cards' || tab === 'help' ? tab : null,
    select: q.has('select') ? Number(q.get('select')) : null,
    cell: q.has('cell') ? Number(q.get('cell')) : null,
    take: q.get('take') === 'pile' ? 'pile' : q.has('take') ? Number(q.get('take')) : null,
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
  const tapCell = useGameStore((s) => s.tapCell);
  const takeCard = useGameStore((s) => s.takeCard);
  const confirmReveal = useGameStore((s) => s.confirmReveal);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const reset = useGameStore((s) => s.reset);
  const startTutorial = useGameStore((s) => s.startTutorial);
  const tutorial = useGameStore((s) => s.tutorial);

  useEffect(() => {
    const quick = readQuickStart();
    if (!quick || useGameStore.getState().state) return;
    startHotseat({ seed: quick.seed, nicknames: Array.from({ length: quick.players }, (_, i) => `플레이어 ${i + 1}`) });
    const skipReveal = new URLSearchParams(window.location.search).has('play') || quick.take !== null || quick.select !== null || quick.cell !== null || quick.modal !== null;
    if (skipReveal) confirmReveal();
    if (quick.play > 0) {
      for (let i = 0; i < quick.play; i++) {
        const st = useGameStore.getState().state;
        if (!st || st.phase !== 'playing' || !st.currentPlayerId) break;
        const a = autoAction(asState(st), st.currentPlayerId);
        if (!a) break;
        useGameStore.getState().dispatch(a);
      }
    }
    acknowledgeHandoff();
    if (quick.tab) setTab(quick.tab);
    if (quick.take === 'pile' || (quick.take !== null && Number.isInteger(quick.take))) {
      takeCard(quick.take);
      acknowledgeHandoff();
    }
    if (quick.select !== null && Number.isInteger(quick.select)) selectHandCard(quick.select);
    if (quick.cell !== null && Number.isInteger(quick.cell)) {
      const { state: st, viewerId } = useGameStore.getState();
      const sp = st && viewerId && quick.select !== null ? st.players.find((p) => p.id === viewerId)?.hand[quick.select] : undefined;
      const pos = st && viewerId && sp ? legalPlantCells(asState(st), viewerId, sp)[quick.cell] : undefined;
      if (pos) tapCell(pos);
    }
    if (quick.modal !== null && Number.isInteger(quick.modal)) openCardModal({ kind: 'hand', index: quick.modal });
    if (window.location.pathname !== '/hotseat') navigate('/hotseat', true);
  }, [startHotseat, confirmReveal, acknowledgeHandoff, setTab, selectHandCard, tapCell, takeCard, openCardModal]);

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
