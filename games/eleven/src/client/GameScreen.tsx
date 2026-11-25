/**
 * 대국 화면: 공통 GameShell 배치(docs/refactor-plan.md 5절)에 옛 화면 부품을 얹는다.
 * ① 상태바: 주차·단계·지금 할 일(≡ → 알림·봇 속도·나가기) ② 참가자 띠(누르면 그 구단 보드)
 * ③ 본문: 진행/구단/시장/리그/기록 탭 중 하나(영역 안에서 스크롤) ⑤ 아래: 확정·차례 끝내기 막대 + 탭 막대
 */
import type { RoomSnapshot } from '@gamehub/net';
import { GameShell, Sheet } from '@gamehub/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { pidOf, type Action, type View } from '../def';
import { WEEKS } from '../engine/weekend';
import type { RoomView } from '../protocol';
import { CommitProvider, ConfirmBar } from './commit';
import { MobileMain, MobileNav, MobileTurnBar } from './components/Mobile';
import { PendingModal, PlayerStrip, confirmLeave } from './components/Shell';
import { TooltipLayer } from './components/Tooltip';
import { DAY_LABEL, phaseLabel } from './labels';
import { NotifyProvider, NotifyToggles, myTask } from './notify';
import { FridayAftermathScreen, FridayMatchScreen, FridayPrepareScreen } from './screens/Friday';
import { GameOverScreen } from './screens/GameOver';
import { MondayScreen } from './screens/Monday';
import { DraftScreen, ObjectiveScreen } from './screens/Setup';
import { PhaseStatus } from './screens/Spectator';
import type { BotSpeed } from './session';
import { StoreProvider, useView, type Store } from './store';
import { UiProvider } from './ui';

const ERROR_MS = 6000;

interface Props {
  room: RoomSnapshot<View>;
  error: string | null;
  connected: boolean;
  /** 한 기기 대전만: 봇 속도 */
  local?: { speed: BotSpeed; onSpeed(s: BotSpeed): void };
  act(a: Action): void;
  leave(): void;
  rematch?: () => void;
}

export function GameScreen(p: Props) {
  const v = p.room.view!;
  // 거절 이유는 6초 동안만 보인다(같은 문구가 다시 와도 다시 센다)
  const [shownError, setShownError] = useState<string | null>(null);
  const [seenError, setSeenError] = useState<string | null>(null);
  if (p.error !== seenError) {
    setSeenError(p.error);
    setShownError(p.error);
  }
  useEffect(() => {
    if (!shownError) return;
    const t = setTimeout(() => setShownError(null), ERROR_MS);
    return () => clearTimeout(t);
  }, [shownError]);

  const { room: snapshot, act, leave, rematch } = p;
  const store = useMemo<Store>(() => {
    const you = snapshot.you;
    const room: RoomView = {
      code: snapshot.code ?? '',
      status: snapshot.status === 'lobby' ? 'lobby' : snapshot.status,
      division: v.game.division,
      players: snapshot.seats.map((s, i) => ({
        id: pidOf(i),
        name: s.name,
        emblem: v.emblems[pidOf(i)]!,
        connected: s.online,
        isHost: i === snapshot.host,
        isBot: s.kind === 'bot',
      })),
    };
    return {
      connected: p.connected,
      session: you === null ? null : { playerId: pidOf(you) },
      spectating: you === null ? (snapshot.code ?? '') : null,
      room,
      view: v.game,
      error: shownError,
      local: !!p.local,
      watchWait: v.watchWait,
      botWatching: v.botWatching,
      act,
      leave,
      ...(rematch ? { rematch } : {}),
    };
  }, [snapshot, v, p.connected, p.local, shownError, act, leave, rematch]);

  return (
    <StoreProvider value={store}>
      <NotifyProvider>
        <UiProvider>
          <Layout local={p.local} />
        </UiProvider>
        <TooltipLayer />
      </NotifyProvider>
    </StoreProvider>
  );
}

// 단계 패널: 카드 고르기·이사회·경기 준비/결과. 주중 행동은 '진행' 탭의 행동 목록에 있다
function PhaseScreen() {
  const { view, session } = useView();
  if (!session) return <PhaseStatus />;
  switch (view.phase.kind) {
    case 'setup.draft':
      return <DraftScreen />;
    case 'setup.objective':
      return <ObjectiveScreen />;
    case 'monday.board':
      return <MondayScreen />;
    case 'weekday':
      return null;
    case 'friday.prepare':
      return <FridayPrepareScreen />;
    case 'friday.match':
      return <FridayMatchScreen />;
    case 'friday.aftermath':
      return <FridayAftermathScreen />;
    case 'gameOver':
      return <GameOverScreen />;
  }
}

/** ① 상태바 두 줄: 주차·단계 / 지금 할 일 또는 누구 차례 */
function useStatus(): { status: ReactNode; detail: ReactNode } {
  const { view, session, room } = useView();
  const phase = view.phase;
  const step = `${phaseLabel(phase.kind)}${phase.kind === 'weekday' ? ` · ${DAY_LABEL[phase.day]}` : ''}`;
  const week = phase.kind === 'gameOver' ? '시즌 종료' : `${view.week}/${WEEKS}주${view.week >= WEEKS ? '(마지막 주)' : ''}`;
  const task = session && view.me === session.playerId ? myTask(view) : null;
  const current = 'current' in phase ? phase.current : null;
  const who = task
    ? `내 차례 · ${task}`
    : current
      ? `${view.players[current]?.name ?? ''}의 차례`
      : phase.kind === 'gameOver'
        ? `${phase.winners.map((id) => view.players[id]?.name).join(', ')} 우승`
        : session
          ? '다른 참가자를 기다리는 중'
          : '모두 고르는 중';
  return {
    status: who,
    detail: `${week} · ${step}${room?.code ? ` · 방 ${room.code}` : ''}${session ? '' : ' · 관전'}`,
  };
}

function Layout({ local }: { local?: Props['local'] }) {
  const { view, session, error, connected, leave } = useView();
  const [menu, setMenu] = useState(false);
  const { status, detail } = useStatus();
  const current = 'current' in view.phase ? view.phase.current : null;
  const myPending = session ? (view.players[session.playerId]?.pending.length ?? 0) : 0;
  // 선택(확정 대기)은 단계·차례·요일이 바뀌거나 대상 선택이 생기면 지운다
  const commitScope = [view.week, view.phase.kind, current ?? '', view.phase.kind === 'weekday' ? view.phase.day : '', myPending].join('|');
  const notice = !connected ? '연결이 끊겨 다시 연결하는 중…' : error;
  const exit = () => {
    // 온라인 게임 중 나가면 그 자리는 봇이 이어받고 돌아올 수 없다(공통 방 규칙) — 한 번 묻는다. 한 기기는 이어 하기로 돌아올 수 있다
    if (local || confirmLeave(view.phase.kind, !!session)) leave();
  };
  return (
    <CommitProvider scope={commitScope}>
      <GameShell
        status={status}
        detail={detail}
        onMenu={() => setMenu(true)}
        players={<PlayerStrip />}
        notice={notice}
        actions={
          <div className="eleven-footer">
            <ConfirmBar />
            <MobileTurnBar />
            <MobileNav />
          </div>
        }
      >
        <MobileMain phasePanel={<PhaseScreen />} />
      </GameShell>
      <PendingModal />
      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        <div className="menu-sheet">
          {session && (
            <section>
              <h3>알림</h3>
              <p className="muted small">내 차례가 오면 소리(진동)·바탕화면 알림</p>
              <NotifyToggles />
            </section>
          )}
          {local && (
            <section>
              <h3>봇 속도</h3>
              <div className="speed-row" role="radiogroup" aria-label="봇 속도">
                {(
                  [
                    ['normal', '보통'],
                    ['fast', '빠르게'],
                    ['turbo', '아주 빠르게'],
                  ] as const
                ).map(([key, label]) => (
                  <button key={key} role="radio" aria-checked={local.speed === key} className={local.speed === key ? 'active' : ''} onClick={() => local.onSpeed(key)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="muted small">한 기기 게임은 나가도 처음 화면의 ‘이어 하기’로 돌아올 수 있습니다.</p>
            </section>
          )}
          <button className="menu-exit" onClick={exit}>
            {local ? '처음 화면으로' : '게임에서 나가기'}
          </button>
        </div>
      </Sheet>
    </CommitProvider>
  );
}
