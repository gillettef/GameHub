import { useState } from 'react';
import logo from '../assets/logo.svg';
import { storage } from '../../store/storage';
import { resumeLocal, startLocal } from '../../store/localGame';
import { createRoom, joinRoom } from '../../online/client';
import { Rules } from '../components/Rules';
import styles from './Home.module.css';

export function Home() {
  const [name, setName] = useState(storage.loadName());
  const [ai, setAi] = useState(2);
  const [seats, setSeats] = useState(3);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [showRules, setShowRules] = useState(false);
  const save = storage.loadLocal();

  const keepName = () => storage.saveName(name.trim());
  const nick = () => name.trim() || '개척자';

  return (
    <main className={styles.home}>
      <img src={logo} alt="네오테라" className={styles.logo} />
      <p className={styles.tag}>새 행성 개척 문명 카드게임</p>

      <label className={styles.field}>
        <span>이름</span>
        <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} placeholder="개척자" />
      </label>

      {save && !save.game.gameOver && Array.isArray(save.game.rngState) && (
        <button className={styles.primary} onClick={() => resumeLocal()}>
          이어 하기 · {save.game.era <= 3 ? `${save.game.era}시대` : '종료 시대'} {save.game.round}라운드
        </button>
      )}

      <section className={styles.box}>
        <h2>AI 대전</h2>
        <div className={styles.seg} role="radiogroup" aria-label="AI 수">
          {[1, 2, 3].map((n) => (
            <button key={n} role="radio" aria-checked={ai === n} className={ai === n ? styles.on : ''} onClick={() => setAi(n)}>
              AI {n}명 ({n + 1}인)
            </button>
          ))}
        </div>
        <button
          className={styles.primary}
          onClick={() => {
            keepName();
            startLocal(nick(), ai, Math.floor(Math.random() * 2 ** 31));
          }}
        >
          새 게임 시작
        </button>
      </section>

      <section className={styles.box}>
        <h2>온라인 대전</h2>
        <div className={styles.seg} role="radiogroup" aria-label="인원">
          {[2, 3, 4].map((n) => (
            <button key={n} role="radio" aria-checked={seats === n} className={seats === n ? styles.on : ''} onClick={() => setSeats(n)}>
              {n}인 방
            </button>
          ))}
        </div>
        <button
          className={styles.secondary}
          onClick={() => {
            keepName();
            createRoom(nick(), seats);
          }}
        >
          방 만들기
        </button>
        <div className={styles.join}>
          <input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="초대 코드" aria-label="초대 코드" />
          <button
            className={styles.secondary}
            disabled={code.length !== 4}
            onClick={() => {
              keepName();
              joinRoom(code, nick());
            }}
          >
            참가
          </button>
        </div>
      </section>

      <button className={styles.link} onClick={() => setShowRules(true)}>
        게임 설명 보기
      </button>
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </main>
  );
}
