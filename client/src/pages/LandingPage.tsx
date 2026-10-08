import { useState } from 'react';
import { DockShell } from '../components/DockShell';
import { BotIcon, LearnIcon } from '../components/icons';
import { hasSeenTutorial } from '../lib/onboarding';
import { getNickname, getPlayerToken, setNickname, setRoomPassword } from '../lib/identity';
import { markQuickStart } from '../lib/quickStart';
import { extractRoomId, navigate } from '../lib/router';
import { api } from '../socket/client';
import styles from './LandingPage.module.css';

/**
 * 랜딩 (비게임 세계): 닉네임 → 방 만들기(F001, F003) / 초대 링크로 참여 / 핫시트.
 * 로그인은 없다. 닉네임과 재접속 토큰은 localStorage 에 둔다.
 * 2026-09-28 사용자 지시로 개편: [플레이어]·[맵]·[종족]이 잠긴 채 보이던 하단 독 탭을 없앴다 —
 * 방을 만들기 전에는 애초에 그 단계들이 없으므로("한 화면 = 한 결정") 잠긴 탭 자체가 혼란이었다.
 * 이제 한 화면에 닉네임 + 세 갈래 선택(방 만들기 / 초대 링크로 참여 / 같은 기기에서)만 세로로
 * 쌓는다. 방을 만들거나 참가하면(RoomPage) 그때부터 좌석→맵→종족 위자드가 시작된다.
 */
export function LandingPage() {
  const [nickname, setNick] = useState(getNickname());
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [aiCount, setAiCount] = useState(1);
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

  /** AI와 바로 시작(2026-10-01): 방 만들기 → AI 좌석 채우기 → (로비에서) 준비까지 자동. 보드는 인원수로 정해진다 */
  const startWithAi = async () => {
    if (!nickOk || busy) return;
    setBusy(true);
    setError(null);
    setNickname(nickname);
    const res = await api.createRoom({ playerToken: getPlayerToken(), nickname: nickname.trim() });
    if (!res.ok) {
      setBusy(false);
      setError(res.message);
      return;
    }
    for (let i = 0; i < aiCount; i++) {
      const added = await api.addAi(res.roomId);
      if (!added.ok) {
        setBusy(false);
        setError(added.message);
        return;
      }
    }
    markQuickStart(res.roomId);
    setBusy(false);
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
    <DockShell id="landing" heroTitle="Rootbound" heroSubtitle="식물을 하나씩 심어 뿌리로 땅을 넓히는 정원 땅따먹기. 친구 2~4명, 또는 AI와 함께." activeTab="room">
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

      {!hasSeenTutorial() && <TutorialSection primary />}

      <section className={styles.sectionPrimary}>
        <h2 className={styles.h2}>AI와 바로 시작</h2>
        <p className={styles.help}>AI 상대 수를 고르면 곧바로 식물 고르기부터 시작합니다.</p>
        <div className={styles.aiRow}>
          <div className={styles.aiPick} role="radiogroup" aria-label="AI 상대 수">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={aiCount === n}
                aria-label={`AI ${n}명`}
                title={`AI ${n}명`}
                className={aiCount === n ? styles.aiOn : styles.aiOff}
                onClick={() => setAiCount(n)}
              >
                <BotIcon size={18} />
                <span>{n}</span>
              </button>
            ))}
          </div>
          <button type="button" className="pill pill--lg" disabled={!nickOk || busy} onClick={startWithAi}>
            {busy ? '준비 중' : '시작'}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>방 만들기</h2>
        <p className={styles.help}>방을 만들면 초대 링크가 생깁니다. 링크를 친구에게 보내거나 빈 자리에 AI를 넣으세요.</p>
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
        <button type="button" className="pill pill--outline" disabled={!nickOk || !pwOk || busy} onClick={createRoom}>
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
        <button type="button" className="pill pill--outline" disabled={!nickOk || !invite.trim()} onClick={joinRoom}>
          참여
        </button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>같은 기기에서</h2>
        <p className={styles.help}>한 브라우저에서 번갈아 둡니다. 서버 연결이 필요 없습니다.</p>
        <button type="button" className="pill pill--outline" onClick={() => navigate('/hotseat')}>
          한 기기로 시작
        </button>
      </section>

      {hasSeenTutorial() && <TutorialSection primary={false} />}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </DockShell>
  );
}

/** 튜토리얼 입구. 처음 온 사람에게는 맨 위에 강조해서, 이미 본 사람에게는 맨 아래에 다시 보기로 둔다 */
function TutorialSection({ primary }: { primary: boolean }) {
  return (
    <section className={primary ? styles.sectionPrimary : styles.section}>
      <h2 className={styles.h2}>{primary ? '처음이세요?' : '튜토리얼 다시 보기'}</h2>
      <p className={styles.help}>연습 봇과 한 판 두면서 카드 고르기 → 칸 고르기 → 심기를 한 단계씩 따라 합니다. 5분이면 충분합니다.</p>
      <button type="button" className={primary ? 'pill pill--lg' : 'pill pill--outline'} onClick={() => navigate('/tutorial')}>
        <LearnIcon size={18} /> 튜토리얼 시작
      </button>
    </section>
  );
}
