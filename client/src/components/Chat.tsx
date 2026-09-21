import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH } from '@server/protocol';
import type { ChatMessage } from '@server/protocol';
import { useStore } from '../store';

// 방 채팅 (test_insight C9): 대기실과 게임 화면(오른쪽 기록 패널의 '채팅' 탭)이 함께 쓴다. 관전자는 읽기만.
// 메시지는 서버가 방 단위로 최근 100개를 들고 있다가 입장·재접속 때 통째로 보내 준다.

function timeOf(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 남이 쓴 글 중 아직 안 본 것의 수
export function unreadCount(chat: ChatMessage[], seen: number, me: string | undefined): number {
  return chat.filter((m) => m.id > seen && m.playerId !== me).length;
}

export function ChatBody({ colorOf }: { colorOf: (playerId: string) => string | undefined }) {
  const { chat, session, sendChat, connected } = useStore();
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = chat.at(-1)?.id ?? 0;

  // 새 글이 오면 맨 아래로 (위쪽을 읽는 중이면 그대로 둔다)
  const nearBottom = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    sendChat(clean);
    setText('');
    nearBottom.current = true;
  };

  return (
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {chat.length === 0 && <p className="muted small">아직 채팅이 없습니다.</p>}
        {chat.map((m) => (
          <div key={m.id} className={`chat-msg${m.playerId === session?.playerId ? ' mine' : ''}`} style={{ '--seat': colorOf(m.playerId) } as React.CSSProperties}>
            <span className="chat-name">{m.name}</span>
            <span className="chat-time">{timeOf(m.at)}</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      {session ? (
        <form className="chat-form" onSubmit={submit}>
          <input value={text} maxLength={CHAT_MAX_LENGTH} placeholder="메시지 입력…" aria-label="채팅 메시지" onChange={(e) => setText(e.target.value)} />
          <button className="primary" type="submit" disabled={!connected || !text.trim()}>보내기</button>
        </form>
      ) : (
        <p className="muted small chat-form">관전자는 채팅을 읽을 수만 있습니다.</p>
      )}
    </div>
  );
}
