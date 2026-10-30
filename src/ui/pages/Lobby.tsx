// 온라인 대기실: 초대 코드·링크, 자리 현황, 방장 시작
import { useApp } from '../../store/app';
import { leaveOnline, startOnline } from '../../online/client';
import styles from './Lobby.module.css';

export function Lobby() {
  const lobby = useApp((s) => s.lobby);
  const me = useApp((s) => s.me);
  const showToast = useApp((s) => s.showToast);
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
  return (
    <main className={styles.lobby}>
      <h1>대기실</h1>
      <div className={styles.code} aria-label="초대 코드">
        {lobby.room}
      </div>
      <button className={styles.secondary} onClick={copy}>
        초대 링크 복사
      </button>
      <ul className={styles.seats}>
        {lobby.seats.map((s, i) => (
          <li key={i} className={i === me ? styles.me : ''}>
            <span>{i + 1}번 자리</span>
            <strong>{s.taken ? s.name : '빈 자리 — 시작하면 AI'}</strong>
            <span className={styles.dim}>{s.taken ? (s.connected ? '접속' : '끊김') : ''}{i === lobby.host ? ' · 방장' : ''}</span>
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
