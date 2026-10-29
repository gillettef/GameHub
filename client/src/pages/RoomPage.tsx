import { useEffect, useState } from 'react';
import { NICKNAME_MAX_LENGTH, ROOM_PASSWORD_DIGITS, isValidNickname, isValidRoomPassword } from '@rootbound/shared';
import { getNickname, getRoomPassword, setNickname, setRoomPassword } from '../lib/identity';
import { navigate } from '../lib/router';
import { api, getSocket } from '../socket/client';
import { selectState, useGameStore } from '../store/gameStore';
import { GamePage } from './GamePage';
import landing from './LandingPage.module.css';
import { LobbyView } from './LobbyView';
import { useRoomGate } from './useRoomGate';

/**
 * 온라인 방 (F001~F005, F007, F030). 입장 전 확인(REST) → 닉네임/비밀번호 → 소켓 입장 → 로비 또는 게임.
 * 입장 게이트와 재접속은 useRoomGate, 로비 화면은 LobbyView.
 */
export function RoomPage({ roomId }: { roomId: string }) {
  const state = useGameStore(selectState);
  const reset = useGameStore((s) => s.reset);
  const { gate, setGate, peek } = useRoomGate(roomId);
  const [nick, setNick] = useState(getNickname());
  const [pw, setPw] = useState(getRoomPassword(roomId) ?? '');

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
    const ok = isValidNickname(nick);
    return (
      <Shell title="닉네임을 정하세요">
        <input className={landing.input} value={nick} maxLength={NICKNAME_MAX_LENGTH} placeholder={`1~${NICKNAME_MAX_LENGTH}자`} onChange={(e) => setNick(e.target.value)} />
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
          maxLength={ROOM_PASSWORD_DIGITS}
          placeholder={`숫자 ${ROOM_PASSWORD_DIGITS}자리`}
          onChange={(e) => setPw(e.target.value.replace(/\D/g, ''))}
        />
        <button
          type="button"
          className="pill"
          disabled={!isValidRoomPassword(pw)}
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
