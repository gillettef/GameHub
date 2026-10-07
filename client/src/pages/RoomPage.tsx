import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { RaceId, RoomPeek } from '@astraltab/shared';
import { AFK_STRIKES_FOR_AUTOPILOT, MAX_PLAYERS, TURN_TIME_OPTIONS_SEC, getMap, mapsForAtLeast } from '@astraltab/shared';
import { DeckPicker } from '../components/DeckPicker';
import { DockShell } from '../components/DockShell';
import { MapPicker } from '../components/MapPicker';
import { cx } from '../lib/cx';
import { turnTimeLabel } from '../lib/turnClock';
import { getNickname, getPlayerToken, getRoomPassword, setNickname, setRoomPassword } from '../lib/identity';
import { hasQuickStart, takeQuickStart } from '../lib/quickStart';
import { randomMapId, randomRaceId } from '../lib/randomPicks';
import { navigate, roomUrl } from '../lib/router';
import { api, connectSocket, getSocket } from '../socket/client';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { GamePage } from './GamePage';
import landing from './LandingPage.module.css';
import styles from './RoomPage.module.css';

type Gate = { kind: 'loading' } | { kind: 'nickname' } | { kind: 'password'; message: string | null } | { kind: 'error'; message: string } | { kind: 'joined' };

/**
 * 온라인 방 (F001~F005, F007, F030). 입장 전 확인(REST) → 닉네임/비밀번호 → 소켓 입장 → 로비 또는 게임.
 * 연결이 끊기면 socket.io 가 재연결하고, 다시 붙으면 같은 토큰으로 room:join 을 보내 상태를 통째로 받는다.
 */
export function RoomPage({ roomId }: { roomId: string }) {
  const state = useGameStore(selectState);
  const applySnapshot = useGameStore((s) => s.applySnapshot);
  const setConnection = useGameStore((s) => s.setConnection);
  const reset = useGameStore((s) => s.reset);
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const [nick, setNick] = useState(getNickname());
  const [pw, setPw] = useState(getRoomPassword(roomId) ?? '');
  const [peek, setPeek] = useState<RoomPeek | null>(null);

  // 1) 입장 전 확인
  useEffect(() => {
    let alive = true;
    setGate({ kind: 'loading' });
    fetch(`/api/rooms/${roomId}`)
      .then(async (r) => {
        const body = (await r.json()) as RoomPeek | { message: string };
        if (!alive) return;
        if (!r.ok || !('roomId' in body)) {
          setGate({ kind: 'error', message: 'message' in body ? body.message : '없는 방입니다' });
          return;
        }
        setPeek(body);
        if (!getNickname()) setGate({ kind: 'nickname' });
        else if (body.hasPassword && !getRoomPassword(roomId)) setGate({ kind: 'password', message: null });
        else setGate({ kind: 'joined' });
      })
      .catch(() => alive && setGate({ kind: 'error', message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요' }));
    return () => {
      alive = false;
    };
  }, [roomId]);

  // 2) 소켓 입장 + 재접속
  useEffect(() => {
    if (gate.kind !== 'joined') return;
    const socket = connectSocket();
    let cancelled = false;
    const join = async () => {
      setConnection('connecting');
      const res = await api.joinRoom({
        roomId,
        playerToken: getPlayerToken(),
        nickname: getNickname(),
        password: getRoomPassword(roomId) ?? undefined,
      });
      if (cancelled) return;
      if (!res.ok) {
        if (/비밀번호/.test(res.message)) {
          setRoomPassword(roomId, null);
          setGate({ kind: 'password', message: res.message });
        } else setGate({ kind: 'error', message: res.message });
      }
    };
    const onState = (snapshot: Parameters<typeof applySnapshot>[0]) => {
      if (snapshot.room.roomId === roomId) applySnapshot(snapshot);
    };
    const onDisconnect = () => setConnection('disconnected');
    const onClosed = ({ message }: { message: string }) => setGate({ kind: 'error', message });
    socket.on('room:state', onState);
    socket.on('disconnect', onDisconnect);
    socket.on('room:closed', onClosed);
    socket.on('connect', join);
    if (socket.connected) void join();
    return () => {
      cancelled = true;
      socket.off('room:state', onState);
      socket.off('disconnect', onDisconnect);
      socket.off('room:closed', onClosed);
      socket.off('connect', join);
    };
  }, [gate.kind, roomId, applySnapshot, setConnection]);

  // 방을 떠나면 스토어를 비운다
  useEffect(() => () => reset(), [reset]);

  const quit = async () => {
    if (state?.phase === 'lobby') await api.leaveRoom(roomId);
    getSocket().disconnect();
    navigate('/');
  };

  if (gate.kind === 'error') {
    return (
      <Shell title="입장할 수 없습니다">
        <p className={landing.help}>{gate.message}</p>
        <button type="button" className="pill" onClick={() => navigate('/')}>
          처음으로
        </button>
      </Shell>
    );
  }
  if (gate.kind === 'nickname') {
    const ok = nick.trim().length >= 1 && nick.trim().length <= 12;
    return (
      <Shell title="닉네임을 정하세요">
        <input className={landing.input} value={nick} maxLength={12} placeholder="1~12자" onChange={(e) => setNick(e.target.value)} />
        <button
          type="button"
          className="pill"
          disabled={!ok}
          onClick={() => {
            setNickname(nick);
            setGate(peek?.hasPassword && !getRoomPassword(roomId) ? { kind: 'password', message: null } : { kind: 'joined' });
          }}
        >
          계속
        </button>
      </Shell>
    );
  }
  if (gate.kind === 'password') {
    return (
      <Shell title="비밀번호가 필요한 방입니다">
        {gate.message && <p className={landing.hint}>{gate.message}</p>}
        <input
          className={landing.input}
          value={pw}
          inputMode="numeric"
          maxLength={4}
          placeholder="숫자 4자리"
          onChange={(e) => setPw(e.target.value.replace(/\D/g, ''))}
        />
        <button
          type="button"
          className="pill"
          disabled={!/^\d{4}$/.test(pw)}
          onClick={() => {
            setRoomPassword(roomId, pw);
            setGate({ kind: 'joined' });
          }}
        >
          입장
        </button>
      </Shell>
    );
  }
  if (!state) {
    return (
      <Shell title="방에 들어가는 중">
        <p className={landing.help}>서버와 연결하고 있습니다.</p>
      </Shell>
    );
  }
  if (state.phase === 'lobby') return <LobbyView roomId={roomId} onQuit={quit} />;
  return <GamePage onQuit={quit} />;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={landing.root}>
      <header className={landing.hero}>
        <h1 className={landing.title}>AstralTab</h1>
      </header>
      <main className={landing.main}>
        <section className={landing.section}>
          <h2 className={landing.h2}>{title}</h2>
          {children}
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 로비 (F002, F026, F030, F016)
// ---------------------------------------------------------------------------

type LobbyTab = 'room' | 'players' | 'map' | 'race';

/** 위자드 순서 (2026-09-24 사용자 지시: 자유 탭 전환 대신 방→좌석→맵→종족 순으로 안내하고,
 * 하단 독 대신 각 단계 안의 다음/이전 버튼으로만 이동한다). 좌석 단계는 맵과 무관하게 사람이든
 * AI든 최대 4인까지 채울 수 있고, 맵 단계에서 그 인원수에 맞는 맵을 고른다(F030). */
const STEP_ORDER: LobbyTab[] = ['room', 'players', 'map', 'race'];
const STEP_LABEL: Record<LobbyTab, string> = { room: '방', players: '좌석', map: '맵', race: '종족' };

const RANDOM_RACE_KEY = 'astraltab.randomRace.';

function readRandomRace(roomId: string): boolean {
  try {
    return window.sessionStorage.getItem(RANDOM_RACE_KEY + roomId) !== '0';
  } catch {
    return true;
  }
}

function writeRandomRace(roomId: string, on: boolean): void {
  try {
    window.sessionStorage.setItem(RANDOM_RACE_KEY + roomId, on ? '1' : '0');
  } catch {
    /* 저장 못 해도 화면 상태로는 유지된다 */
  }
}

function LobbyView({ roomId, onQuit }: { roomId: string; onQuit: () => void }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const room = useGameStore((s) => s.room);
  const connection = useGameStore((s) => s.connection);
  const dispatch = useGameStore((s) => s.dispatch);
  const notice = useGameStore((s) => s.notice);
  const setNotice = useGameStore((s) => s.setNotice);
  const [tab, setTab] = useState<LobbyTab>('players');
  const [copied, setCopied] = useState(false);
  // 랜덤으로 고른 종족은 게임이 시작되기 전까지 화면에 드러내지 않는다(2026-09-29 사용자 지시).
  // 실제 종족은 엔진 상태에 이미 들어 있고, 이 플래그는 이 화면이 그것을 가리는 용도일 뿐이다
  // 기본값은 "랜덤" — 종족 단계에 처음 들어가도 랜덤 타일만 선택돼 있다. 종족을 직접 골랐을 때만 해제하고,
  // 새로고침해도 유지되도록 방별로 sessionStorage 에 남긴다(막혀 있으면 메모리로만)
  const [randomRace, setRandomRaceState] = useState(() => readRandomRace(roomId));
  const setRandomRace = (on: boolean) => {
    setRandomRaceState(on);
    writeRandomRace(roomId, on);
  };

  const me = state?.players.find((p) => p.id === viewerId);

  // 처음 들어오면 무작위 종족을 한 번 골라 준다 (2026-09-23: 그 뒤로는 종족 탭에서 자유롭게 바꾼다).
  // 기본값도 "랜덤" 선택으로 취급해 게임 시작 전에는 가려 둔다
  useEffect(() => {
    if (viewerId && me && !me.race) {
      dispatch({ type: 'SELECT_RACE', playerId: viewerId, race: randomRaceId() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, me?.race]);

  // "AI와 바로 시작"(2026-10-01): 랜딩이 방과 AI 좌석을 만들어 두고 넘어왔으면, 종족이 정해지는 대로 한 번만
  // 준비 완료까지 대신 눌러 곧바로 대국을 시작한다. 인원이 맵 정원과 안 맞으면(누가 나갔을 때 등) 건드리지 않는다.
  const quickReady = me?.race && !me.isReady && state?.players.length === (state ? getMap(state.mapId).players : -1);
  useEffect(() => {
    if (!quickReady || !viewerId || !hasQuickStart(roomId)) return;
    takeQuickStart(roomId);
    dispatch({ type: 'READY', playerId: viewerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickReady, viewerId, roomId]);

  // 맵이 바뀌면(방장이 직접 고르거나, 좌석이 늘어 정원에 안 맞는 맵이 자동으로 더 큰 맵으로
  // 바뀌거나) 전원 준비가 풀린다(changeMap, shared/src/engine/turn.ts) — 특히 자동 전환은
  // 원인이 화면에 안 보이므로, 어느 경우든 안내 문구로 알려 준다(2026-09-28, 리뷰 반영).
  const prevMapIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    if (prevMapIdRef.current !== null && prevMapIdRef.current !== state.mapId) {
      setNotice(`맵이 ${getMap(state.mapId).name}(으)로 바뀌어 준비가 초기화됐습니다. 종족을 다시 확인하고 준비해 주세요.`);
    }
    prevMapIdRef.current = state.mapId;
  }, [state?.mapId, setNotice]);

  if (!state || !viewerId || !room || !me) return null;
  const isHost = room.hostId === viewerId;
  const map = getMap(state.mapId);
  // 좌석 목록·상단 준비 현황은 맵 정원이 아니라 항상 최대 인원(4)만큼 보여준다 — 좌석 단계가
  // 맵보다 먼저이므로 "몇 명이 참여하는지"가 아직 맵에 매이지 않는다(2026-09-24 사용자 지시).
  const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => state.players.find((p) => p.seat === i) ?? null);
  const readyCount = state.players.filter((p) => p.isReady).length;
  const full = state.players.length === map.players;
  const url = roomUrl(roomId);
  const stepIndex = STEP_ORDER.indexOf(tab);
  const goPrev = () => setTab(STEP_ORDER[stepIndex - 1] ?? tab);
  const goNext = () => setTab(STEP_ORDER[stepIndex + 1] ?? tab);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice('복사하지 못했습니다. 주소를 직접 선택해 복사하세요');
    }
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const share = async () => {
    try {
      await navigator.share({ title: 'AstralTab 초대', text: `${map.name} 방에 초대합니다`, url });
    } catch {
      /* 취소는 조용히 무시 */
    }
  };

  const request = async (p: Promise<{ ok: boolean; message?: string }>) => {
    const res = await p;
    if (!res.ok && res.message) setNotice(res.message);
  };

  const pickRace = (race: RaceId) => {
    setRandomRace(false);
    dispatch({ type: 'SELECT_RACE', playerId: viewerId, race });
  };
  const pickRandom = () => {
    setRandomRace(true);
    dispatch({ type: 'SELECT_RACE', playerId: viewerId, race: randomRaceId() });
  };

  return (
    <DockShell
      id="lobby"
      heroTitle="대기실"
      heroSubtitle={
        <>
          <span className={styles.stepDots} role="status" aria-label={`${stepIndex + 1}/${STEP_ORDER.length}단계 · ${STEP_LABEL[tab]}`}>
            {STEP_ORDER.map((s, i) => (
              <span key={s} className={cx(styles.stepDot, i <= stepIndex && styles.stepDotDone)} />
            ))}
          </span>
          방 {roomId} · {map.name} · {stepIndex + 1}/{STEP_ORDER.length}단계 · {STEP_LABEL[tab]}
          {connection !== 'connected' && (
            <span className={styles.connecting}>
              <span className={styles.connectingDot} aria-hidden="true" /> 연결 중…
            </span>
          )}
          <span className={styles.readyDots} role="status" aria-label={`${readyCount} / ${state.players.length}명 준비`}>
            {seats.map((p, i) => (
              <span
                key={i}
                className={cx(styles.readyDot, p?.isReady && styles.readyDotDone, !p && styles.readyDotEmpty)}
                style={{ '--seat-color': `var(--color-seat-${i})` } as CSSProperties}
                title={p ? `${p.nickname} · ${p.isReady ? '준비 완료' : '준비 중'}` : '빈 좌석'}
              />
            ))}
            <span className={styles.readyCount}>
              {readyCount} / {state.players.length}명 준비
            </span>
          </span>
        </>
      }
      activeTab={tab}
      footer={
        me.isReady ? (
          <>
            <button type="button" className="pill pill--outline" onClick={() => dispatch({ type: 'SELECT_RACE', playerId: viewerId, race: me.race ?? 'coalition' })}>
              준비 취소
            </button>
            <span className={landing.help}>
              {full
                ? '다른 플레이어가 준비하면 바로 시작합니다.'
                : `좌석 ${state.players.length}명, 맵 정원 ${map.players}명이라 시작하지 못합니다. 맵이나 좌석을 맞춰 주세요.`}
            </span>
          </>
        ) : tab === 'race' ? (
          <>
            <button type="button" className="pill pill--lg" disabled={!me.race} onClick={() => dispatch({ type: 'READY', playerId: viewerId })}>
              준비 완료
            </button>
            <span className={landing.help}>{me.race ? '종족을 다시 고르면 준비가 풀립니다.' : '종족을 고르세요.'}</span>
          </>
        ) : undefined
      }
    >
      {notice && (
        <p className={landing.error} role="status">
          {notice}
        </p>
      )}

      {tab === 'room' && (
        <section className={landing.section}>
          <h2 className={landing.h2}>초대 링크</h2>
          <div className={styles.inviteRow}>
            <input className={landing.input} value={url} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="초대 링크" />
            {canShare && (
              <button type="button" className="pill pill--outline" onClick={share}>
                공유
              </button>
            )}
            <button type="button" className="pill" onClick={copy}>
              {copied ? '복사됨' : '링크 복사'}
            </button>
          </div>
          <p className={landing.help}>{room.hasPassword ? '비밀번호가 걸린 방입니다. 친구에게 비밀번호도 알려 주세요.' : '링크를 아는 사람은 누구나 들어올 수 있습니다.'}</p>
          <div className={styles.wizardNav}>
            <button type="button" className="pill" onClick={goNext}>
              다음: 좌석 정하기
            </button>
          </div>
        </section>
      )}

      {tab === 'players' && (
        <section className={landing.section}>
          <h2 className={landing.h2}>
            좌석 {state.players.length} / {MAX_PLAYERS}
          </h2>
          <p className={landing.help}>사람 또는 AI로 최대 {MAX_PLAYERS}명까지 채울 수 있습니다. 몇 명인지에 맞는 맵은 다음 단계에서 고릅니다.</p>
          <ul className={styles.seats}>
            {seats.map((p, i) => (
              <li key={i} className={cx(styles.seat, !p && styles.seatEmpty)}>
                <span className={styles.seatNo}>
                  <span className={styles.seatDot} style={{ '--seat-color': `var(--color-seat-${i})` } as CSSProperties} aria-hidden="true" />
                  좌석 {i + 1}
                </span>
                {p ? (
                  <>
                    <span className={styles.seatName}>
                      {p.nickname}
                      {p.id === viewerId && ' (나)'}
                      {p.id === room.hostId && <span className={styles.badge}>방장</span>}
                      {p.kind === 'ai' && <span className={styles.badge}>AI</span>}
                      {p.kind === 'human' && !room.connected.includes(p.id) && <span className={styles.badgeMuted}>접속 끊김</span>}
                    </span>
                    <span className={cx(styles.seatState, p.isReady && styles.ready)}>{p.isReady ? '준비 완료' : p.race ? '종족 선택함' : '종족 고르는 중'}</span>
                    {isHost && p.kind === 'ai' && (
                      <button type="button" className="pill pill--outline" onClick={() => request(api.removeAi(roomId, p.id))}>
                        제거
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className={styles.seatName}>빈 좌석</span>
                    {isHost && (
                      <button type="button" className="pill pill--outline" onClick={() => request(api.addAi(roomId))}>
                        AI 추가
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className={styles.wizardNav}>
            <button type="button" className="pill pill--outline" onClick={goPrev}>
              이전: 방으로
            </button>
            <button type="button" className="pill pill--outline" onClick={onQuit}>
              나가기
            </button>
            <button type="button" className="pill" onClick={goNext}>
              다음: 맵 정하기
            </button>
          </div>
        </section>
      )}

      {tab === 'map' && (
        <section className={landing.section}>
          <div className={styles.sectionHead}>
            <h2 className={landing.h2}>맵</h2>
            {isHost && (
              <button type="button" className="pill pill--outline" onClick={() => request(api.setMap(roomId, randomMapId(mapsForAtLeast(state.players.length))))}>
                무작위
              </button>
            )}
          </div>
          <p className={landing.help}>
            {isHost ? '방장만 맵을 바꿀 수 있습니다.' : '방장이 맵을 정합니다.'} 지금 좌석 수({state.players.length}명)보다 작은 맵은 보이지 않습니다.
            {!full && ` 인원이 정원(${map.players}명)과 같아야 시작합니다.`}
          </p>
          <MapPicker value={state.mapId} onChange={(id) => request(api.setMap(roomId, id))} disabled={!isHost} minPlayers={state.players.length} />
          <h2 className={landing.h2}>턴 제한 시간</h2>
          <p className={landing.help}>
            시간이 지나면 자동으로 턴을 넘깁니다. {AFK_STRIKES_FOR_AUTOPILOT}번 연속이면 AI가 대신 두고, 돌아와서 &lsquo;직접 두기&rsquo;를 누르면 되찾습니다. 며칠에 걸쳐 두려면 &lsquo;없음&rsquo;을 고르세요.
          </p>
          <div className={landing.aiPick} role="radiogroup" aria-label="턴 제한 시간">
            {TURN_TIME_OPTIONS_SEC.map((sec) => (
              <button
                key={String(sec)}
                type="button"
                role="radio"
                aria-checked={room.turnTimeLimitSec === sec}
                disabled={!isHost}
                className={room.turnTimeLimitSec === sec ? landing.aiOn : landing.aiOff}
                onClick={() => request(api.setTurnTime(roomId, sec))}
              >
                {turnTimeLabel(sec)}
              </button>
            ))}
          </div>
          <div className={styles.wizardNav}>
            <button type="button" className="pill pill--outline" onClick={goPrev}>
              이전: 좌석으로
            </button>
            <button type="button" className="pill" onClick={goNext}>
              다음: 종족 정하기
            </button>
          </div>
        </section>
      )}

      {tab === 'race' && (
        <section className={landing.section}>
          <h2 className={landing.h2}>내 종족</h2>
          <p className={landing.help}>{me.isReady ? '준비를 취소하면 다시 바꿀 수 있습니다.' : '종족을 고르면 그 종족의 고정 덱이 정해집니다. "랜덤"을 고르면 게임이 시작될 때 종족이 공개됩니다.'}</p>
          <DeckPicker race={me.race} disabled={me.isReady} onPickRace={pickRace} onRandom={pickRandom} randomSelected={randomRace} showDeck={false} />
          <div className={styles.wizardNav}>
            <button type="button" className="pill pill--outline" onClick={goPrev}>
              이전: 맵으로
            </button>
          </div>
        </section>
      )}
    </DockShell>
  );
}
