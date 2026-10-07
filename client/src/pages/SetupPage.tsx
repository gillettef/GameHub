import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '@rootbound/shared';
import { DockShell } from '../components/DockShell';
import { makeSeed } from '../game/hotseat';
import { getNickname } from '../lib/identity';
import { navigate } from '../lib/router';
import { useGameStore } from '../store/gameStore';
import landing from './LandingPage.module.css';
import styles from './SetupPage.module.css';

/**
 * 핫시트 설정 (같은 기기에서 번갈아 두기): 인원 2~4명과 닉네임만 정하면 바로 드래프트부터 시작한다.
 * 보드는 인원수로 정해지고 조각 배치는 시드로 매번 달라진다(Rules.md 3절).
 */
export function SetupPage() {
  const startHotseat = useGameStore((s) => s.startHotseat);
  const [names, setNames] = useState<string[]>(() => [getNickname() || '플레이어 1', '플레이어 2']);
  const [error, setError] = useState<string | null>(null);

  const setCount = (n: number) => setNames((cur) => Array.from({ length: n }, (_, i) => cur[i] ?? `플레이어 ${i + 1}`));
  const valid = names.every((n) => n.trim().length >= 1 && n.trim().length <= 12);

  const start = () => {
    try {
      startHotseat({ nicknames: names.map((n) => n.trim()), seed: makeSeed() });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <DockShell id="setup" heroTitle="같은 기기에서" heroSubtitle="한 브라우저에서 번갈아 둡니다. 차례가 바뀌면 기기를 넘기세요." activeTab="room">
      <section className={landing.section}>
        <h2 className={landing.h2}>인원</h2>
        <div className={landing.aiPick} role="radiogroup" aria-label="인원">
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={names.length === n} className={names.length === n ? landing.aiOn : landing.aiOff} onClick={() => setCount(n)}>
              {n}명
            </button>
          ))}
        </div>
      </section>
      <section className={landing.section}>
        <h2 className={landing.h2}>닉네임</h2>
        <ol className={styles.names}>
          {names.map((n, i) => (
            <li key={i} style={{ '--seat-color': `var(--color-seat-${i})` } as React.CSSProperties}>
              <span className={styles.seat}>{i + 1}</span>
              <input
                className={landing.input}
                value={n}
                maxLength={12}
                aria-label={`좌석 ${i + 1} 닉네임`}
                onChange={(e) => setNames((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </li>
          ))}
        </ol>
      </section>
      {error && (
        <p className={landing.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className="pill pill--outline" onClick={() => navigate('/')}>
          처음으로
        </button>
        <button type="button" className="pill pill--lg" disabled={!valid} onClick={start}>
          시작
        </button>
      </div>
    </DockShell>
  );
}
