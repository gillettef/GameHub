import { useState } from 'react';
import { getNickname, getPlayerToken, setNickname, setRoomPassword } from '../lib/identity';
import { extractRoomId, navigate } from '../lib/router';
import { api } from '../socket/client';
import styles from './LandingPage.module.css';

/**
 * 랜딩 (비게임 세계): 닉네임 → 방 만들기(F001, F003) / 초대 링크로 참여 / 핫시트.
 * 로그인은 없다. 닉네임과 재접속 토큰은 localStorage 에 둔다.
 */
export function LandingPage() {
  const [nickname, setNick] = useState(getNickname());
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nickOk = nickname.trim().length >= 1 && nickname.trim().length <= 12;
  const pwOk = !usePassword || /^\d{4}$/.test(password);

  const createRoom = async () => {
    if (!nickOk || !pwOk || busy) return;
    setBusy(true);
    setError(null);
    setNickname(nickname);
    const res = await api.createRoom({
      playerToken: getPlayerToken(),
      nickname: nickname.trim(),
      password: usePassword ? password : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (usePassword) setRoomPassword(res.roomId, password);
    navigate(`/room/${res.roomId}`);
  };

  const joinRoom = () => {
    const roomId = extractRoomId(invite);
    if (!roomId) {
      setError('초대 링크 또는 방 코드를 확인하세요');
      return;
    }
    if (nickOk) setNickname(nickname);
    navigate(`/room/${roomId}`);
  };

  return (
    <div className={styles.root}>
      <header className={styles.hero}>
        <h1 className={styles.title}>AstralTab</h1>
        <p className={styles.lead}>마커를 하나씩 놓아 영토를 넓히는 우주 전략 보드게임. 친구 2~4명, 또는 AI와 함께.</p>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.h2}>닉네임</h2>
          <input
            className={styles.input}
            value={nickname}
            placeholder="1~12자"
            maxLength={12}
            onChange={(e) => setNick(e.target.value)}
            aria-label="닉네임"
          />
          {!nickOk && nickname.length > 0 && <p className={styles.hint}>닉네임은 1~12자입니다.</p>}
        </section>

        <div className={styles.columns}>
          <section className={styles.section}>
            <h2 className={styles.h2}>방 만들기</h2>
            <p className={styles.help}>방을 만들면 초대 링크가 생깁니다. 링크를 친구에게 보내거나 빈 좌석에 AI를 넣으세요.</p>
            <label className={styles.check}>
              <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
              비밀번호 설정 (숫자 4자리)
            </label>
            {usePassword && (
              <input
                className={styles.input}
                value={password}
                inputMode="numeric"
                maxLength={4}
                placeholder="0000"
                onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
                aria-label="방 비밀번호"
              />
            )}
            <button type="button" className="pill pill--lg" disabled={!nickOk || !pwOk || busy} onClick={createRoom}>
              {busy ? '만드는 중' : '방 만들기'}
            </button>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>초대 링크로 참여</h2>
            <p className={styles.help}>받은 링크나 방 코드를 붙여 넣으세요.</p>
            <input
              className={styles.input}
              value={invite}
              placeholder="https://…/room/abc123 또는 abc123"
              onChange={(e) => setInvite(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              aria-label="초대 링크"
            />
            <button type="button" className="pill pill--lg" disabled={!nickOk || !invite.trim()} onClick={joinRoom}>
              참여
            </button>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>같은 기기에서</h2>
            <p className={styles.help}>한 브라우저에서 번갈아 둡니다. 서버 연결이 필요 없습니다.</p>
            <button type="button" className="pill pill--outline" onClick={() => navigate('/hotseat')}>
              핫시트 시작
            </button>
          </section>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
