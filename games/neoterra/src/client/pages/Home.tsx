// 처음 화면 머리: 착륙 히어로 + 로고·태그라인·세 노선. 설정·시작은 공통 처음 화면(@gamehub/ui HomeScreen)이 맡는다
import { useEffect, useState, type CSSProperties } from 'react';
import logo from '../assets/logo.svg';
import { LandingHero } from '../components/LandingHero';
import styles from './Home.module.css';

// 첫 진입에만 전체 등장 시퀀스를 보이고, 게임에서 돌아오면 짧게 줄인다(새로고침하면 다시 전체)
let introPlayed = false;

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function HomeHero() {
  const [quick] = useState(() => introPlayed);
  useEffect(() => {
    introPlayed = true;
  }, []);
  return (
    <header className={styles.home} style={{ '--seq': quick ? 0.15 : 1 } as Vars}>
      <LandingHero quick={quick} />
      <div className={styles.brand}>
        <div className={`${styles.logoWrap} anim-float`}>
          <span className={styles.flare} aria-hidden="true" />
          <span className={styles.streak} aria-hidden="true" />
          <h1 className="m-0">
            <img src={logo} alt="네오테라" className={styles.logo} />
          </h1>
        </div>
        <p className={`${styles.tag} anim-track-in`} style={{ '--delay': 'calc(var(--seq) * 1300ms)' } as Vars}>
          새 행성 개척 문명 카드게임
        </p>
        <ul className={`${styles.doctrines} anim-rise`} style={{ '--delay': 'calc(var(--seq) * 1500ms)' } as Vars} aria-label="세 노선">
          <li className={styles.ark}>방주</li>
          <li className={styles.symbiont}>공생</li>
          <li className={styles.synth}>합성</li>
        </ul>
      </div>
    </header>
  );
}
