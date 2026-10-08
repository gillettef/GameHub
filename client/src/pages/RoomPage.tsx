import { useEffect, useState, type CSSProperties } from 'react';
import type { RoomPeek } from '@rootbound/shared';
import { AFK_STRIKES_FOR_AUTOPILOT, MAX_PLAYERS, MIN_PLAYERS, TURN_TIME_OPTIONS_SEC } from '@rootbound/shared';
import { DockShell } from '../components/DockShell';
import { cx } from '../lib/cx';
import { turnTimeLabel } from '../lib/turnClock';
import { getNickname, getPlayerToken, getRoomPassword, setNickname, setRoomPassword } from '../lib/identity';
import { hasQuickStart, takeQuickStart } from '../lib/quickStart';
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
        <h1 className={landing.title}>Rootbound</h1>
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
// 로비 (F002, F026)
// ---------------------------------------------------------------------------

type LobbyTab = 'room' | 'players' | 'settings';

/** 위자드 순서: 방(초대 링크) → 좌석(사람·AI 2~4명) → 설정(제한 시간)·준비. 보드는 인원수로 정해진다 */
const STEP_ORDER: LobbyTab[] = ['room', 'players', 'settings'];
const STEP_LABEL: Record<LobbyTab, string> = { room: '방', players: '자리', settings: '준비' };

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

  const me = state?.players.find((p) => p.id === viewerId);

  // "AI와 바로 시작"(2026-10-01): 랜딩이 방과 AI 좌석을 만들어 두고 넘어왔으면 한 번만 준비 완료를 대신 눌러 곧바로 시작한다
  const quickReady = !!me && !me.isReady && (state?.players.length ?? 0) >= MIN_PLAYERS;
  useEffect(() => {
    if (!quickReady || !viewerId || !hasQuickStart(roomId)) return;
    takeQuickStart(roomId);
    dispatch({ type: 'READY', playerId: viewerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickReady, viewerId, roomId]);

  if (!state || !viewerId || !room || !me) return null;
  const isHost = room.hostId === viewerId;
  const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => state.players.find((p) => p.seat === i) ?? null);
  const readyCount = state.players.filter((p) => p.isReady).length;
  const enough = state.players.length >= MIN_PLAYERS;
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
      await navigator.share({ title: 'Rootbound 초대', text: '정원 한 판 같이 가꿔요', url });
    } catch {
      /* 취소는 조용히 무시 */
    }
  };

  const request = async (p: Promise<{ ok: boolean; message?: string }>) => {
    const res = await p;
    if (!res.ok && res.message) setNotice(res.message);
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
          방 {roomId} · {state.players.length}인 · {stepIndex + 1}/{STEP_ORDER.length}단계 · {STEP_LABEL[tab]}
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
                title={p ? `${p.nickname} · ${p.isReady ? '준비 완료' : '준비 중'}` : '빈 자리'}
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
        <>
          <button type="button" className={me.isReady ? 'pill pill--outline' : 'pill pill--lg'} disabled={!enough && !me.isReady} onClick={() => dispatch({ type: 'READY', playerId: viewerId })}>
            {me.isReady ? '준비 취소' : '준비 완료'}
          </button>
          <span className={landing.help}>
            {!enough ? `${MIN_PLAYERS}명 이상이어야 시작합니다. 친구를 부르거나 AI를 넣으세요.` : me.isReady ? '모두 준비하면 바로 시작합니다.' : '모두 준비하면 식물 고르기부터 시작합니다.'}
          </span>
        </>
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
              다음: 자리 정하기
            </button>
          </div>
        </section>
      )}

      {tab === 'players' && (
        <section className={landing.section}>
          <h2 className={landing.h2}>
            자리 {state.players.length} / {MAX_PLAYERS}
          </h2>
          <p className={landing.help}>사람 또는 AI로 2~4명을 채웁니다. 인원수에 맞는 정원 보드가 자동으로 만들어집니다.</p>
          <ul className={styles.seats}>
            {seats.map((p, i) => (
              <li key={i} className={cx(styles.seat, !p && styles.seatEmpty)}>
                <span className={styles.seatNo}>
                  <span className={styles.seatDot} style={{ '--seat-color': `var(--color-seat-${i})` } as CSSProperties} aria-hidden="true" />
                  {i + 1}번 자리
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
                    <span className={cx(styles.seatState, p.isReady && styles.ready)}>{p.isReady ? '준비 완료' : '준비 중'}</span>
                    {isHost && p.kind === 'ai' && (
                      <button type="button" className="pill pill--outline" onClick={() => request(api.removeAi(roomId, p.id))}>
                        제거
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className={styles.seatName}>빈 자리</span>
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
              다음: 준비
            </button>
          </div>
        </section>
      )}

      {tab === 'settings' && (
        <section className={landing.section}>
          <h2 className={landing.h2}>차례 제한 시간</h2>
          <p className={landing.help}>
            {isHost ? '방장만 바꿀 수 있습니다. ' : '방장이 정합니다. '}
            시간이 지나면 자동으로 둡니다. {AFK_STRIKES_FOR_AUTOPILOT}번 연속이면 AI가 대신 두고, &lsquo;다시 내가 두기&rsquo;를 누르면 되찾습니다. 며칠에 걸쳐 두려면 &lsquo;없음&rsquo;을 고르세요.
          </p>
          {seats.filter((p) => p?.kind === 'human').length <= 1 && (
            <p className={landing.help}>지금처럼 사람이 혼자고 나머지가 AI면 시계가 흐르지 않습니다. 사람이 2명 이상일 때만 적용됩니다.</p>
          )}
          <div className={landing.aiPick} role="radiogroup" aria-label="차례 제한 시간">
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
              이전: 자리로
            </button>
          </div>
        </section>
      )}
    </DockShell>
  );
}
