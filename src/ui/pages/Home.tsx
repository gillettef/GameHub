import { useEffect, useState, type CSSProperties } from 'react';
import logo from '../assets/logo.svg';
import symbiontEmblem from '../assets/emblems/symbiont.svg';
import synthEmblem from '../assets/emblems/synth.svg';
import { storage } from '../../store/storage';
import { resumeLocal, startLocal } from '../../store/localGame';
import { createRoom, joinRoom } from '../../online/client';
import { Rules } from '../components/Rules';
import { LandingHero } from '../components/LandingHero';
import styles from './Home.module.css';

// 첫 진입에만 전체 등장 시퀀스를 보이고, 게임에서 돌아오면 짧게 줄인다(새로고침하면 다시 전체)
let introPlayed = false;

type Vars = CSSProperties & Record<`--${string}`, string | number>;
// 메뉴 요소가 히어로 시퀀스 뒤에 차례로 떠오른다(--seq 로 비례 축소)
const rise = (i: number) => ({ '--delay': `calc(var(--seq) * 1500ms + ${i * 80}ms)` }) as Vars;

export function Home() {
  const [name, setName] = useState(storage.loadName());
  const [ai, setAi] = useState(2);
  const [seats, setSeats] = useState(3);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [showRules, setShowRules] = useState(false);
  const [quick] = useState(() => introPlayed);
  useEffect(() => {
    introPlayed = true;
  }, []);
  const save = storage.loadLocal();

  const keepName = () => storage.saveName(name.trim());
  const nick = () => name.trim() || '개척자';

  return (
    <>
      <main className={`${styles.home} ${showRules ? styles.paused : ''}`} style={{ '--seq': quick ? 0.15 : 1 } as Vars}>
        <LandingHero quick={quick} />

        <header className={styles.brand}>
          <div className={`${styles.logoWrap} anim-float`}>
            <span className={styles.flare} aria-hidden="true" />
            <span className={styles.streak} aria-hidden="true" />
            <img src={logo} alt="네오테라" className={styles.logo} />
          </div>
          <p className={`${styles.tag} anim-track-in`} style={{ '--delay': 'calc(var(--seq) * 1300ms)' } as Vars}>
            새 행성 개척 문명 카드게임
          </p>
          <ul className={`${styles.doctrines} anim-rise`} style={rise(0)} aria-label="세 노선">
            <li className={styles.ark}>방주</li>
            <li className={styles.symbiont}>공생</li>
            <li className={styles.synth}>합성</li>
          </ul>
        </header>

        <div className={styles.menu}>
          <label className={`${styles.panel} ${styles.field} anim-rise`} style={rise(1)}>
            <span>개척자 이름</span>
            <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} placeholder="개척자" />
          </label>

          {save && !save.game.gameOver && Array.isArray(save.game.rngState) && (
            <button className={`${styles.primary} ${styles.resume} anim-shine anim-rise`} style={rise(2)} onClick={() => resumeLocal()}>
              <span>이어 하기</span>
              <small>
                {save.game.era <= 3 ? `${save.game.era}시대` : '종료 시대'} {save.game.round}라운드
              </small>
            </button>
          )}

          <section className={`${styles.panel} ${styles.toneSymbiont} anim-rise`} style={rise(3)}>
            <div className={styles.head}>
              <img src={symbiontEmblem} alt="" className={styles.mark} />
              <div>
                <h2>AI 대전</h2>
                <p>AI 1~3명과 겨루기 · 매 차례 자동 저장</p>
              </div>
            </div>
            <div className={styles.seg} role="group" aria-label="AI 수" style={{ '--i': ai - 1 } as Vars}>
              <span className={styles.pill} aria-hidden="true" />
              {[1, 2, 3].map((n) => (
                <button key={n} aria-pressed={ai === n} className={ai === n ? styles.on : ''} onClick={() => setAi(n)}>
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

          <section className={`${styles.panel} ${styles.toneSynth} anim-rise`} style={rise(4)}>
            <div className={styles.head}>
              <img src={synthEmblem} alt="" className={styles.mark} />
              <div>
                <h2>온라인 대전</h2>
                <p>방을 만들거나 초대 코드 4자리로 참가</p>
              </div>
            </div>
            <div className={styles.seg} role="group" aria-label="인원" style={{ '--i': seats - 2 } as Vars}>
              <span className={styles.pill} aria-hidden="true" />
              {[2, 3, 4].map((n) => (
                <button key={n} aria-pressed={seats === n} className={seats === n ? styles.on : ''} onClick={() => setSeats(n)}>
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

          <button className={`${styles.link} anim-rise`} style={rise(5)} onClick={() => setShowRules(true)}>
            게임 설명 보기
          </button>
        </div>
      </main>
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </>
  );
}
