import { useState } from 'react';
import { DeviceSwitch } from '../device';
import { useStore } from '../store';
import { Select } from '../components/Select';
import type { SelectOption } from '../components/Select';

const DIVISIONS: SelectOption<1 | 2 | 3>[] = [
  { value: 3, label: '3부', hint: '쉬움' },
  { value: 2, label: '2부', hint: '보통' },
  { value: 1, label: '1부', hint: '어려움' },
];

export function Lobby() {
  const { send, spectate, connected, error } = useStore();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const ready = connected && name.trim().length > 0;
  return (
    <main className="lobby">
      <h1>ELEVEN</h1>
      <p className="muted">축구 구단 매니지먼트 보드게임 · 온라인</p>
      <label>
        닉네임
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="닉네임" />
      </label>
      <div className="row">
        <button className="primary" disabled={!ready} onClick={() => send({ type: 'createRoom', name })}>새 방 만들기</button>
      </div>
      <label>
        방 코드
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="ABCDE" />
      </label>
      <div className="row">
        <button disabled={!ready || code.length !== 5} onClick={() => send({ type: 'joinRoom', code, name })}>입장</button>
        <button className="link" disabled={!connected || code.length !== 5} onClick={() => spectate(code)}>관전</button>
      </div>
      <p className="muted small">혼자 해보려면 방을 만든 뒤 대기실에서 <b>AI 추가</b>로 봇을 넣고 시작하세요.</p>
      {!connected && <p className="muted small">서버에 연결하는 중…</p>}
      {error && <p className="error">{error}</p>}
      <DeviceSwitch />
    </main>
  );
}

export function RoomLobby() {
  const { room, session, spectating, send, leave, error } = useStore();
  if (!room) return null;
  const isHost = !!session && (room.players.find((p) => p.id === session.playerId)?.isHost ?? false);
  const full = room.players.length >= 4;
  return (
    <main className="lobby">
      <h1>방 코드: <span className="code">{room.code}</span></h1>
      <p className="muted">이 코드를 친구에게 알려주세요. 1~4명이 플레이할 수 있습니다.{spectating && ' (관전 중)'}</p>
      <ul className="players">
        {room.players.map((p) => (
          <li key={p.id} className="row">
            <span>
              {p.isBot && '🤖 '}{p.name} {p.isHost && <span className="badge">호스트</span>} {!p.isBot && !p.connected && <span className="muted small">(연결 끊김)</span>}
            </span>
            {isHost && p.isBot && <button className="link small" onClick={() => send({ type: 'removeBot', playerId: p.id })}>제거</button>}
            {isHost && !p.isBot && !p.isHost && (
              <button className="link small danger" title="이 참가자를 방에서 내보냅니다 (대기실에서만)" onClick={() => window.confirm(`${p.name} 님을 방에서 내보낼까요?`) && send({ type: 'kick', playerId: p.id })}>
                강퇴
              </button>
            )}
          </li>
        ))}
      </ul>
      {isHost && (
        <div className="row">
          <button className="small" disabled={full} onClick={() => send({ type: 'addBot' })}>🤖 AI 추가</button>
          <span className="muted small">{full ? '정원(4명)이 찼습니다' : `${4 - room.players.length}자리 남음`}</span>
        </div>
      )}
      {/* label 로 감싸지 않는다 — 메뉴 항목을 누른 클릭이 label 을 거쳐 버튼을 다시 눌러 메뉴가 도로 열린다 */}
      <div className="field">
        <span>상대할 부{!isHost && <span className="muted small"> · 호스트가 정합니다</span>}</span>
        <Select label="상대할 부" value={room.division} disabled={!isHost} options={DIVISIONS} onChange={(division) => send({ type: 'setDivision', division })} />
      </div>
      <p className="muted small">차례 순서는 게임을 시작할 때 무작위로 정해집니다.</p>
      <div className="row">
        {isHost ? <button className="primary" onClick={() => send({ type: 'startGame' })}>게임 시작</button> : <span className="muted">호스트가 시작하기를 기다리는 중…</span>}
        <button className="link" onClick={leave}>나가기</button>
      </div>
      {error && <p className="error">{error}</p>}
      <DeviceSwitch />
    </main>
  );
}
