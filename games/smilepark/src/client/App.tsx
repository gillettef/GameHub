/**
 * 화면 전환: 처음 → 한 기기(AI 대전·돌려 하기·봇끼리 관전) / 온라인(대기실 → 대국, 관전). 초대 링크: ?room=ABCD
 * 진행은 공통 방·진행 코드(@gamehub/net): 한 기기는 LocalGame(이어 하기 저장), 온라인은 useRoom(재접속).
 */
import type { RoomSnapshot, SeatInfo } from '@gamehub/net';
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave, type RoomClient } from '@gamehub/net/client';
import { Button, HomeScreen, Screen, WaitingRoom } from '@gamehub/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { def, type Action, type View } from '../def';
import type { GameState } from '../engine/types';
import { AssetSheet } from './AssetSheet';
import { GameScreen } from './Game';
import { Icon } from './Icon';
import { Sheet } from './parts';
import { clearSave, loadLocal, saveLocal } from './platform/storage';
import { RulesBody } from './Rules';
import { Slot } from './Slot';
import { TipHost } from './tip';

type Local = LocalGame<GameState, Action, View, unknown>;
const TITLE = '스마일 파크';

/** `#assets` 이미지 슬롯 점검 페이지는 개발 모드에서만 연다 */
function useDevHash() {
  const [hash, setHash] = useState(() => (import.meta.env.DEV ? location.hash : ''));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const h = () => setHash(location.hash);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return hash;
}

let localKey = 0;
function makeLocal(seats: SeatInfo[], save?: LocalSave<Action>): { key: number; game: Local } {
  const game: Local = new LocalGame(def, {
    seats,
    ...(save ? { seed: save.seed, history: save.history } : {}),
    onSave: (s) => saveLocal(s),
  });
  return { key: ++localKey, game };
}

/** 저장한 한 기기 판(끝나지 않은 것). 지금 규칙으로 이어 둘 수 없으면 버린다 */
function restoreLocal(): { key: number; game: Local } | null {
  const save = loadLocal();
  if (!save) return null;
  try {
    const run = makeLocal(save.seats, save);
    if (run.game.getState().room.status === 'over') throw new Error('끝난 판');
    return run;
  } catch {
    clearSave();
    return null;
  }
}

export default function App() {
  const hash = useDevHash();
  const [online, client] = useRoom<View, Action>({ slug: def.slug });
  const [local, setLocal] = useState<{ key: number; game: Local } | null>(null);
  const [invited, setInvited] = useState(() => invitedCode(location.search));
  const [rules, setRules] = useState(false);

  const home = () => {
    setInvited(null);
    history.replaceState(null, '', location.pathname);
    setLocal(null);
  };
  // 처음 화면으로 돌아올 때마다 저장한 판을 다시 읽는다(만들기만 하고 시작하지 않으므로 봇이 움직이지 않는다)
  const resumable = useMemo(() => (local ? null : restoreLocal()), [local]);

  if (import.meta.env.DEV && hash === '#assets') return <AssetSheet />;

  const room = online.room;
  let screen;
  if (room?.status === 'lobby') {
    screen = (
      <WaitingRoom
        title={TITLE}
        room={room}
        bots
        error={online.error}
        onSeat={(i, kind) => client.setSeat(i, kind)}
        onStart={() => client.start()}
        onLeave={() => {
          client.leave();
          home();
        }}
      />
    );
  } else if (room?.view) {
    screen = (
      <OnlineTable
        key={`online-${room.code}`}
        room={room as RoomSnapshot<View>}
        error={online.connection === 'reconnecting' ? '다시 접속하는 중이에요…' : online.error}
        client={client}
        onLeave={() => {
          client.leave();
          home();
        }}
      />
    );
  } else if (local) {
    screen = (
      <LocalTable
        key={local.key}
        game={local.game}
        onHome={home}
        onRematch={() => {
          const seats = local.game.save().seats;
          clearSave();
          setLocal(makeLocal(seats));
        }}
      />
    );
  } else {
    const round = resumable?.game.getState().room.view?.game.round;
    screen = (
      <>
        <HomeScreen
          slug={def.slug}
          title={TITLE}
          hero={
            <div className="sp-hero">
              <Slot slot="ui/logo" tint="#ffd54a" className="logo" fallback={<Icon name="smile" size={52} stroke={1.4} />} />
              <div>
                <h1>스마일 파크</h1>
                <p>나만의 놀이공원을 키워 최고의 만족도를 얻어보세요</p>
              </div>
            </div>
          }
          top={
            resumable ? (
              <Button tone="primary" onClick={() => setLocal(resumable)}>
                이어 하기 (라운드 {round ?? 1}/8)
              </Button>
            ) : undefined
          }
          minSeats={def.minSeats}
          maxSeats={def.maxSeats}
          bots
          invited={invited}
          error={online.error}
          connecting={online.connection !== 'idle'}
          onLocal={(seats) => {
            clearSave();
            setLocal(makeLocal(seats));
          }}
          onCreate={(name, seats, bots) => client.create(name, seats, bots)}
          onJoin={(code, name) => client.join(code, name)}
          onWatch={(code) => client.watch(code)}
        >
          <Button onClick={() => setRules(true)}>게임 규칙</Button>
          <p className="m-0 text-center text-sm text-muted">2~5인 · 8라운드 · 사람이 둘 이상이면 한 기기를 돌려 가며, 비밀 입찰·운영 차례마다 가림 화면이 나와요</p>
        </HomeScreen>
        {rules && (
          <Sheet title="게임 규칙" onClose={() => setRules(false)} tall>
            <RulesBody />
          </Sheet>
        )}
      </>
    );
  }
  return (
    <>
      {screen}
      <TipHost />
    </>
  );
}

/**
 * 한 기기 대국. 사람이 둘 이상이면(돌려 하기) 비밀로 정하는 단계(홍보 입찰, 운영 입장료·배치)에서 둘 사람이 바뀔 때 화면을 가린다.
 * 운영 결과의 '관리 단계로'는 한 번만 누르면 된다: 사람 자리마다 차례로 확인을 낸다.
 */
function LocalTable({ game, onHome, onRematch }: { game: Local; onHome(): void; onRematch(): void }) {
  const state = useLocalGame(game);
  const room = state.room;
  const v = room.view!;
  const g = v.game;
  const humans = room.seats.filter((s) => s.kind === 'human').length;
  const hotseat = humans > 1;
  const you = room.you;
  const [shown, setShown] = useState<string | null>(null);
  const secret = (g.phase === 'promote' && g.step === 'bid') || (g.phase === 'operate' && g.step !== 'result');
  const coverKey = `${g.round}:${g.phase}:${you}`;
  const cover = hotseat && room.status === 'playing' && secret && you !== null && room.actors.includes(you) && shown !== coverKey;
  const over = room.status === 'over';

  // 끝난 판은 이어 하기에서 뺀다
  useEffect(() => {
    if (over) clearSave();
  }, [over]);

  const act = (a: Action) => {
    if (a.type !== 'continue') return game.act(a);
    for (let k = 0; k < 6; k++) {
      const r = game.getState().room;
      const s = r.view?.game;
      if (r.status !== 'playing' || s?.phase !== 'operate' || s.step !== 'result' || r.you === null || !r.actors.includes(r.you)) break;
      game.act({ type: 'continue' });
    }
  };

  if (cover) {
    const name = g.players[you!]!.name;
    return (
      <Screen
        footer={
          <>
            <Button tone="primary" onClick={() => setShown(coverKey)}>
              제가 {name}입니다 · 시작
            </Button>
            <Button tone="ghost" onClick={onHome}>
              나가기
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="m-0 text-sm text-muted">
            라운드 {g.round} · {g.phase === 'promote' ? '홍보 비공개 입찰' : '운영 입장료·배치'}
          </p>
          <p className="m-0 text-3xl font-extrabold">{name} 차례</p>
          <p className="m-0 max-w-[30ch] text-sm text-muted">
            기기를 {name}에게 넘겨주세요.
            <br />
            다른 사람은 화면을 보지 마세요.
          </p>
        </div>
      </Screen>
    );
  }

  const allBots = humans === 0;
  return (
    <GameScreen
      view={v}
      actors={room.actors}
      act={act}
      acts={(list) => list.forEach((a) => game.act(a))}
      error={state.error}
      errorTick={state}
      hotseat={hotseat}
      onExit={onHome}
      onRematch={onRematch}
      {...(allBots ? { paused: state.paused, onPause: (p: boolean) => game.setPaused(p) } : {})}
    />
  );
}

/** 온라인 대국. 여러 행동(전부 청소)은 상태를 받을 때마다 하나씩 보낸다(같은 상태에서 두 번 보내면 서버가 거절한다) */
function OnlineTable({ room, error, client, onLeave }: { room: RoomSnapshot<View>; error: string | null; client: RoomClient<View, Action>; onLeave(): void }) {
  const queue = useRef<Action[]>([]);
  useEffect(() => {
    if (queue.current.length === 0) return;
    if (room.you === null || !room.actors.includes(room.you)) {
      queue.current = [];
      return;
    }
    client.act(queue.current.shift()!);
  }, [room.version, room.you, room.actors, client]);

  return (
    <GameScreen
      view={room.view!}
      actors={room.actors}
      act={(a) => client.act(a)}
      acts={(list) => {
        if (list.length === 0) return;
        client.act(list[0]!);
        queue.current = list.slice(1);
      }}
      error={error}
      errorTick={error}
      presence={room.seats.map((s) => s.online)}
      onExit={onLeave}
      exitLabel={room.you === null ? '관전 그만두기' : '나가기 (자리는 봇이 이어받아요)'}
    />
  );
}
