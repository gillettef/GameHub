/**
 * 화면 전환과 게임 연결. 진행은 공통 방·진행 코드(@gamehub/net)가 맡는다:
 * 한 기기 게임은 LocalGame(이어 하기), 온라인은 useRoom(대기실 → 대국, 새로고침·재접속 복귀).
 * 대국 화면은 옛 화면 부품을 그대로 쓰고(store.tsx 가 공통 RoomSnapshot 을 옛 모양으로 바꿔 넣는다), 배치는 공통 GameShell(GameScreen.tsx).
 */
import type { RoomSnapshot, SeatInfo } from '@gamehub/net';
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client';
import { Button, Screen, WaitingRoom } from '@gamehub/ui';
import { useCallback, useEffect, useState } from 'react';
import { def, type Action, type Options, type Table, type View } from '../def';
import type { Division } from '../engine/types';
import { GameScreen } from './GameScreen';
import { HomeScreen } from './HomeScreen';
import { clearCurrent, loadBotSpeed, loadCurrent, saveBotSpeed, saveCurrent, type BotSpeed, type SavedLocal } from './session';

type Local = LocalGame<Table, Action, View, Options>;

const TITLE = 'ELEVEN';

/** 봇 속도 배수: 봇의 한 수 간격과 쉼·경기 보기 대기(시계)를 함께 줄인다 */
const SPEED: Record<BotSpeed, number> = { normal: 1, fast: 3, turbo: 40 };

interface LocalRun {
  key: number;
  createdAt: number;
  game: Local;
}

let runKey = 0;

/** 시계를 배속으로 흘린다(봇 쉼·경기 보기 대기가 시계로 줄어든다) */
function scaledClock(speed: number): () => number {
  const start = Date.now();
  return () => start + (Date.now() - start) * speed;
}

/** 한 기기 게임을 만든다(저장한 판이면 이어서). 저장한 판을 지금 규칙으로 이어 둘 수 없으면 null */
function newLocal(save: Pick<LocalSave<Action>, 'seats' | 'options'> & Partial<LocalSave<Action>>, createdAt: number, speed: BotSpeed): LocalRun | null {
  try {
    const game: Local = new LocalGame(def, {
      seats: save.seats,
      options: def.parseOptions!(save.options),
      now: scaledClock(SPEED[speed]),
      ...(save.seed !== undefined ? { seed: save.seed } : {}),
      ...(save.history ? { history: save.history } : {}),
      onSave: (s) => saveCurrent({ v: 1, createdAt, save: s }),
    });
    game.setSpeed(SPEED[speed]);
    return { key: ++runKey, createdAt, game };
  } catch (e) {
    console.warn('[eleven] 저장한 판을 이어 둘 수 없습니다', e);
    return null;
  }
}

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug });
  const [local, setLocal] = useState<LocalRun | null>(null);
  const [saved, setSaved] = useState<SavedLocal | null>(loadCurrent);
  const [invited, setInvited] = useState(() => invitedCode(location.search));
  const [speed, setSpeedRaw] = useState<BotSpeed>(loadBotSpeed);
  const setSpeed = useCallback((s: BotSpeed) => {
    setSpeedRaw(s);
    saveBotSpeed(s);
  }, []);

  const home = () => {
    setLocal(null);
    setSaved(loadCurrent());
    setInvited(null);
    history.replaceState(null, '', location.pathname);
  };

  const room = online.room;
  if (room?.status === 'lobby') {
    return (
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
  }
  if (room?.view) {
    return (
      <GameScreen
        key={`online-${room.code}`}
        room={room as RoomSnapshot<View>}
        error={online.error}
        connected={online.connection === 'open'}
        act={(a) => client.act(a)}
        leave={() => {
          client.leave();
          home();
        }}
      />
    );
  }
  if (local) {
    return <LocalTable key={local.key} run={local} speed={speed} onSpeed={setSpeed} onReplace={setLocal} onHome={home} />;
  }

  const startLocal = (seats: SeatInfo[], division: Division) => {
    clearCurrent();
    setLocal(newLocal({ seats, options: { division } }, Date.now(), speed));
  };
  return (
    <HomeScreen
      invited={invited}
      error={online.error}
      connecting={online.connection !== 'idle'}
      canContinue={saved !== null}
      onContinue={() => {
        const run = saved ? newLocal(saved.save, saved.createdAt, speed) : null;
        if (run) setLocal(run);
        else {
          clearCurrent();
          setSaved(null);
        }
      }}
      onLocal={startLocal}
      onCreate={(name, seats, bots, division) => client.create(name, seats, bots, { division })}
      onJoin={(code, name) => client.join(code, name)}
      onWatch={(code) => client.watch(code)}
    />
  );
}

/**
 * 한 기기 게임: 봇 속도, 같은 구성으로 다시 하기. 사람이 둘 이상이면(돌려 하기) 다음 사람에게 넘길 때 화면을 가린다 —
 * 목표 카드·전술 손패·드래프트 손패는 사람마다 비공개라, 넘겨받은 사람이 누르기 전에는 보여 주지 않는다.
 */
function LocalTable({ run, speed, onSpeed, onReplace, onHome }: { run: LocalRun; speed: BotSpeed; onSpeed(s: BotSpeed): void; onReplace(run: LocalRun | null): void; onHome(): void }) {
  const { game } = run;
  const state = useLocalGame(game);
  const room = state.room;
  const over = room.status === 'over';
  const humans = room.seats.filter((s) => s.kind === 'human').length;
  const [shownFor, setShownFor] = useState<number | null>(() => (humans > 1 ? null : room.you));

  useEffect(() => {
    if (over) clearCurrent(); // 끝난 판은 이어 하기에서 뺀다
  }, [over]);

  const changeSpeed = (s: BotSpeed) => {
    onSpeed(s);
    // 시계 배속은 만들 때 정하므로 같은 기록으로 다시 만든다(봇 간격만이 아니라 쉼·경기 보기 대기도 함께 빨라지게)
    const next = newLocal(game.save(), run.createdAt, s);
    if (next) {
      game.dispose();
      onReplace(next);
    }
  };
  const rematch = () => {
    const save = game.save();
    clearCurrent();
    onReplace(newLocal({ seats: save.seats, options: save.options }, Date.now(), speed));
  };

  const cover = humans > 1 && !over && room.you !== null && room.you !== shownFor;
  if (cover) {
    const name = room.seats[room.you!]!.name;
    return (
      <Screen
        footer={
          <>
            <Button tone="primary" onClick={() => setShownFor(room.you)}>
              {name}입니다 · 보기
            </Button>
            <Button tone="ghost" onClick={onHome}>
              그만두기
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="m-0 text-sm font-bold tracking-[0.3em] text-muted">기기를 넘겨 주세요</p>
          <p className="m-0 text-3xl font-extrabold">{name}</p>
          <p className="m-0 max-w-[30ch] text-sm text-muted">다른 사람은 화면을 보지 마세요. 목표 카드와 전술 손패는 사람마다 비공개입니다.</p>
        </div>
      </Screen>
    );
  }
  return (
    <GameScreen
      room={room}
      error={state.error}
      connected
      local={{ speed, onSpeed: changeSpeed }}
      act={(a) => game.act(a)}
      leave={onHome}
      rematch={rematch}
    />
  );
}
