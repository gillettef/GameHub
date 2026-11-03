// 온라인 대기실: 초대 코드·링크, 자리 현황, 방장 시작
import { useState } from 'react';
import { useApp } from '../../store/app';
import { storage } from '../../store/storage';
import { leaveOnline, renameOnline, startOnline } from '../../online/client';
import { NAME_MAX } from '../../online/protocol';
import styles from './Lobby.module.css';

export function Lobby() {
  const lobby = useApp((s) => s.lobby);
  const me = useApp((s) => s.me);
  const showToast = useApp((s) => s.showToast);
  const [editing, setEditing] = useState<string | null>(null);
  if (!lobby) return <main className={styles.lobby}>방에 연결하는 중…</main>;
  const link = `${location.origin}${location.pathname}?room=${lobby.room}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast('초대 링크를 복사했습니다');
    } catch {
      showToast(link);
    }
  };
  const isHost = lobby.host === me;
  const saveName = () => {
    const n = (editing ?? '').trim();
    setEditing(null);
    if (!n || n === lobby.seats[me]?.name) return;
    if (renameOnline(n)) storage.saveName(n);
  };
  return (
    <main className={styles.lobby}>
      <h1>대기실</h1>
      <div className={styles.code} aria-label="초대 코드">
        {lobby.room}
      </div>
      <button className={styles.secondary} onClick={copy}>
        초대 링크 복사
      </button>
      <p className={styles.count} aria-live="polite">
        {lobby.seats.filter((s) => s.taken).length}/{lobby.seats.length} 입장 · 빈 자리는 시작할 때 AI가 앉습니다
      </p>
      <ul className={styles.seats}>
        {lobby.seats.map((s, i) => (
          <li key={i} className={i === me ? styles.me : ''}>
            <span>{i + 1}번 자리</span>
            {i === me && editing !== null ? (
              <input
                className={styles.nameInput}
                value={editing}
                maxLength={NAME_MAX}
                autoFocus
                aria-label="내 이름"
                autoComplete="nickname"
                enterKeyHint="done"
                onChange={(e) => setEditing(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.currentTarget.blur()}
              />
            ) : (
              <strong>{s.taken ? s.name : '빈 자리 — 시작하면 AI'}</strong>
            )}
            {i === me && editing === null ? (
              <button className={styles.rename} onClick={() => setEditing(s.name)}>
                이름 바꾸기
              </button>
            ) : (
              <span className={styles.dim}>{s.taken ? (s.connected ? '접속' : '끊김') : ''}{i === lobby.host ? ' · 방장' : ''}</span>
            )}
          </li>
        ))}
      </ul>
      {isHost ? (
        <button className={styles.primary} onClick={startOnline}>
          게임 시작
        </button>
      ) : (
        <p className={styles.dim}>방장이 시작하기를 기다리는 중…</p>
      )}
      <button className={styles.link} onClick={leaveOnline}>
        나가기
      </button>
    </main>
  );
}
