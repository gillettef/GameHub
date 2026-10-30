import { useState } from 'react';
import { useStore } from '../store';
import { Crest, EMBLEM_LIST } from '../components/Crest';
import { Select } from '../components/Select';
import type { SelectOption } from '../components/Select';

const DIVISIONS: SelectOption<1 | 2 | 3>[] = [
  { value: 3, label: '3부', hint: '쉬움' },
  { value: 2, label: '2부', hint: '보통' },
  { value: 1, label: '1부', hint: '어려움' },
];

// 초대 링크(`?code=ABCDE`)로 들어오면 방 코드를 미리 채운다. 주소창의 코드는 바로 지운다 — 나중에 새로고침해도 옛 초대가 다시 뜨지 않게
function inviteCode(): string {
  try {
    const code = new URLSearchParams(location.search).get('code')?.toUpperCase().slice(0, 5) ?? '';
    if (code) history.replaceState(null, '', location.pathname);
    return /^[A-Z0-9]{5}$/.test(code) ? code : '';
  } catch {
    return '';
  }
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?code=${code}`;
}

export function Lobby() {
  const { send, spectate, connected, error } = useStore();
  const [name, setName] = useState('');
  const [invited] = useState(inviteCode);
  const [code, setCode] = useState(invited);
  const ready = connected && name.trim().length > 0;
  return (
    <main className="lobby">
      <h1>ELEVEN</h1>
      <p className="muted">축구 구단 매니지먼트 보드게임 · 온라인</p>
      {invited && <p className="phase-guide">초대받은 방 <b>{invited}</b> — 닉네임을 입력하고 <b>입장</b>을 누르세요.</p>}
      <label>
        닉네임
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="닉네임" autoFocus={!!invited} />
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
    </main>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// 방 코드 복사 / 초대 링크 공유 — 친구가 주소와 다섯 글자 코드를 따로 입력하지 않아도 되게.
// 휴대폰은 공유 시트(navigator.share, 카톡 등)로, 지원하지 않으면 링크를 복사한다
function ShareRoom({ code }: { code: string }) {
  const [done, setDone] = useState<string | null>(null);
  const flash = (text: string) => {
    setDone(text);
    setTimeout(() => setDone(null), 2000);
  };
  const share = async () => {
    const url = inviteLink(code);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'ELEVEN 초대', text: `ELEVEN 방 ${code}에 들어오세요`, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // 공유 시트를 닫음
      }
    }
    flash((await copyText(url)) ? '초대 링크를 복사했습니다' : url);
  };
  return (
    <div className="row share-room">
      <button className="primary" onClick={() => void share()}>초대 링크 보내기</button>
      <button onClick={() => void copyText(code).then((ok) => flash(ok ? '방 코드를 복사했습니다' : code))}>코드 복사</button>
      {done && <span className="muted small" role="status">{done}</span>}
    </div>
  );
}

export function RoomLobby() {
  const { room, session, spectating, send, leave, error } = useStore();
  if (!room) return null;
  const isHost = !!session && (room.players.find((p) => p.id === session.playerId)?.isHost ?? false);
  const full = room.players.length >= 4;
  const me = room.players.find((p) => p.id === session?.playerId);
  return (
    <main className="lobby">
      <h1>방 코드: <span className="code">{room.code}</span></h1>
      <p className="muted">이 코드나 초대 링크를 친구에게 보내 주세요. 1~4명이 플레이할 수 있습니다.{spectating && ' (관전 중)'}</p>
      <ShareRoom code={room.code} />
      <ul className="players">
        {room.players.map((p) => (
          <li key={p.id} className="row">
            <span className="lobby-player">
              <Crest name={p.name} emblem={p.emblem} color={p.id === me?.id ? 'var(--pitch)' : 'var(--ink-2)'} size={24} />
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
      {me && !spectating && (
        <div className="field">
          <span>내 구단 엠블럼 <span className="muted small">· {EMBLEM_LIST.find((e) => e.id === me.emblem)?.name}</span></span>
          <div className="emblem-grid" role="radiogroup" aria-label="내 구단 엠블럼">
            {EMBLEM_LIST.map((e) => {
              const owner = room.players.find((p) => p.emblem === e.id && p.id !== me.id);
              const mine = me.emblem === e.id;
              return (
                <button
                  key={e.id}
                  role="radio"
                  aria-checked={mine}
                  aria-label={e.name}
                  className={`emblem-option${mine ? ' chosen' : ''}`}
                  disabled={!!owner}
                  title={owner ? `${e.name} — ${owner.name}의 엠블럼` : e.name}
                  onClick={() => !mine && send({ type: 'setEmblem', emblem: e.id })}
                >
                  <Crest name={e.name} emblem={e.id} color={mine ? 'var(--pitch)' : owner ? 'var(--muted-light)' : 'var(--ink-2)'} size={34} />
                </button>
              );
            })}
          </div>
          <span className="muted small">게임 화면에서 내 구단을 나타냅니다. 바탕색은 시작할 때 정해지는 자리 색을 따릅니다.</span>
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
    </main>
  );
}
