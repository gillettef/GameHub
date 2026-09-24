import { useState } from 'react';
import type { SetupDockTab } from '../components/SetupDock';
import { DockShell } from '../components/DockShell';
import { getNickname, getPlayerToken, setNickname, setRoomPassword } from '../lib/identity';
import { extractRoomId, navigate } from '../lib/router';
import { api } from '../socket/client';
import styles from './LandingPage.module.css';

type LandingTab = 'room' | 'players' | 'map' | 'race';

const TABS: SetupDockTab[] = [
  { id: 'room', label: '방' },
  { id: 'players', label: '플레이어', disabled: true },
  { id: 'map', label: '맵', disabled: true },
  { id: 'race', label: '종족', disabled: true },
];

/**
 * 랜딩 (비게임 세계): 닉네임 → 방 만들기(F001, F003) / 초대 링크로 참여 / 핫시트.
 * 로그인은 없다. 닉네임과 재접속 토큰은 localStorage 에 둔다.
 * 2026-09-24 사용자 지시: 하단 독 탭으로 입장+대기실을 한 화면 체계로 묶는다 — 방을 만들거나
 * 참가하기 전에는 [플레이어]·[맵]·[종족] 탭이 잠겨 있고, 방에 들어가면(RoomPage) 같은 독으로
 * 네 탭이 모두 열린다.
 */
export function LandingPage() {
  const [tab, setTab] = useState<LandingTab>('room');
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
    <DockShell
      id="landing"
      heroTitle="AstralTab"
      heroSubtitle="마커를 하나씩 놓아 영토를 넓히는 우주 전략 보드게임. 친구 2~4명, 또는 AI와 함께."
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id as LandingTab)}
      dockLabel="입장 탭"
    >
      {tab !== 'room' ? (
        <section className={styles.section}>
          <h2 className={styles.h2}>아직 열리지 않았습니다</h2>
          <p className={styles.help}>방을 먼저 만들거나 초대 링크로 참가하면 플레이어·맵·종족을 정할 수 있습니다.</p>
          <button type="button" className="pill pill--outline" onClick={() => setTab('room')}>
            방 탭으로
          </button>
        </section>
      ) : (
        <>
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

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </DockShell>
  );
}
