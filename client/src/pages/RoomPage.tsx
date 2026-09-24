import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { RaceId, RoomPeek } from '@astraltab/shared';
import { getMap, mapsForPlayers } from '@astraltab/shared';
import { DeckPicker } from '../components/DeckPicker';
import { DockShell } from '../components/DockShell';
import { MapPicker } from '../components/MapPicker';
import type { SetupDockTab } from '../components/SetupDock';
import { cx } from '../lib/cx';
import { getNickname, getPlayerToken, getRoomPassword, setNickname, setRoomPassword } from '../lib/identity';
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

/** 위자드 순서 (2026-09-24 사용자 지시: 자유 탭 전환 대신 방→좌석→맵→종족 순으로 안내한다).
 * 맵 단계는 좌석 인원과 무관하게 항상 열려 있다 — 인원수에 맞는 맵만 고를 수 있는 조건은
 * MapPicker 의 currentPlayers 비활성화(너무 작은 맵만 흐리게)가 이미 만족한다(F030). 방장 혼자
 * 방을 만든 직후에도 맵을 미리 훑어볼 수 있어야 하므로 맵 탭 자체를 잠그지 않는다(spec-checker
 * 지적). 종족만 맵 단계를 한 번 거쳐야 열린다. */
const STEP_ORDER: LobbyTab[] = ['room', 'players', 'map', 'race'];
const STEP_LABEL: Record<LobbyTab, string> = { room: '방', players: '좌석', map: '맵', race: '종족' };

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
  // 맵 탭을 한 번이라도 열었는지(종족 단계를 열기 위한 조건뿐이라 좌석 인원과는 무관하다)
  const [visitedMap, setVisitedMap] = useState(false);

  const me = state?.players.find((p) => p.id === viewerId);

  // 처음 들어오면 무작위 종족을 한 번 골라 준다 (2026-09-23: 그 뒤로는 종족 탭에서 자유롭게 바꾼다)
  useEffect(() => {
    if (viewerId && me && !me.race) dispatch({ type: 'SELECT_RACE', playerId: viewerId, race: randomRaceId() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, me?.race]);

  useEffect(() => {
    if (tab === 'map') setVisitedMap(true);
  }, [tab]);

  const unlocked: Record<LobbyTab, boolean> = useMemo(() => ({ room: true, players: true, map: true, race: visitedMap }), [visitedMap]);
  const tabs: SetupDockTab[] = useMemo(
    () => STEP_ORDER.map((id) => ({ id, label: STEP_LABEL[id], disabled: !unlocked[id] })),
    [unlocked],
  );
  const goTab = useCallback((id: string) => setTab(id as LobbyTab), []);

  if (!state || !viewerId || !room || !me) return null;
  const isHost = room.hostId === viewerId;
  const map = getMap(state.mapId);
  const seats = Array.from({ length: map.players }, (_, i) => state.players.find((p) => p.seat === i) ?? null);
  const readyCount = state.players.filter((p) => p.isReady).length;
  const full = state.players.length === map.players;
  const url = roomUrl(roomId);

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

  const pickRace = (race: RaceId) => dispatch({ type: 'SELECT_RACE', playerId: viewerId, race });

  return (
    <DockShell
      id="lobby"
      heroTitle="대기실"
      heroSubtitle={
        <>
          방 {roomId} · {map.name}
          {connection !== 'connected' && (
            <span className={styles.connecting}>
              <span className={styles.connectingDot} aria-hidden="true" /> 연결 중…
            </span>
          )}
          <span className={styles.readyDots} role="status" aria-label={`${readyCount} / ${map.players}명 준비`}>
            {seats.map((p, i) => (
              <span
                key={i}
                className={cx(styles.readyDot, p?.isReady && styles.readyDotDone, !p && styles.readyDotEmpty)}
                style={{ '--seat-color': `var(--color-seat-${i})` } as CSSProperties}
                title={p ? `${p.nickname} · ${p.isReady ? '준비 완료' : '준비 중'}` : '빈 좌석'}
              />
            ))}
            <span className={styles.readyCount}>
              {readyCount} / {map.players}명 준비
            </span>
          </span>
        </>
      }
      tabs={tabs}
      activeTab={tab}
      onTabChange={goTab}
      dockLabel="대기실 탭"
      footer={
        me.isReady ? (
          <button type="button" className="pill pill--outline" onClick={() => pickRace(me.race ?? 'coalition')}>
            준비 취소
          </button>
        ) : (
          <>
            <button type="button" className="pill pill--lg" disabled={!me.race} onClick={() => dispatch({ type: 'READY', playerId: viewerId })}>
              준비 완료
            </button>
            <span className={landing.help}>{me.race ? '종족을 다시 고르면 준비가 풀립니다.' : '종족을 고르세요.'}</span>
          </>
        )
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
            <button type="button" className="pill pill--outline" onClick={() => setTab('players')}>
              다음: 좌석 정하기
            </button>
          </div>
        </section>
      )}

      {tab === 'players' && (
        <section className={landing.section}>
          <h2 className={landing.h2}>
            좌석 {state.players.length} / {map.players}
          </h2>
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
            <button type="button" className="pill pill--outline" onClick={onQuit}>
              나가기
            </button>
            <button type="button" className="pill pill--outline" onClick={() => setTab('map')}>
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
              <button type="button" className="pill pill--outline" onClick={() => request(api.setMap(roomId, randomMapId(mapsForPlayers(state.players.length))))}>
                무작위
              </button>
            )}
          </div>
          <p className={landing.help}>
            {isHost ? '방장만 맵을 바꿀 수 있습니다.' : '방장이 맵을 정합니다.'}
            {!full && ` 인원이 정원(${map.players}명)과 같아야 시작합니다.`}
          </p>
          <MapPicker value={state.mapId} onChange={(id) => request(api.setMap(roomId, id))} disabled={!isHost} currentPlayers={state.players.length} />
          <div className={styles.wizardNav}>
            <button type="button" className="pill pill--outline" onClick={() => setTab('race')}>
              다음: 종족 정하기
            </button>
          </div>
        </section>
      )}

      {tab === 'race' &&
        (unlocked.race ? (
          <section className={landing.section}>
            <h2 className={landing.h2}>내 종족</h2>
            <p className={landing.help}>{me.isReady ? '준비를 취소하면 다시 바꿀 수 있습니다.' : '종족을 고르면 그 종족의 고정 덱이 정해집니다. "랜덤"으로 다시 뽑을 수도 있습니다.'}</p>
            <DeckPicker race={me.race} disabled={me.isReady} onPickRace={pickRace} onRandom={() => pickRace(randomRaceId())} />
          </section>
        ) : (
          <LockedStep title="종족" reason="맵 탭을 한 번 확인하면 종족을 고를 수 있습니다." backLabel="맵 탭으로" onBack={() => setTab('map')} />
        ))}
    </DockShell>
  );
}

/** 아직 열리지 않은 위자드 단계(LandingPage 의 잠긴 탭 안내와 같은 패턴). */
function LockedStep({ title, reason, backLabel, onBack }: { title: string; reason: string; backLabel: string; onBack: () => void }) {
  return (
    <section className={landing.section}>
      <h2 className={landing.h2}>{title} · 아직 열리지 않았습니다</h2>
      <p className={landing.help}>{reason}</p>
      <button type="button" className="pill pill--outline" onClick={onBack}>
        {backLabel}
      </button>
    </section>
  );
}
