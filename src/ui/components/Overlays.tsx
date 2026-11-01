// 기록 서랍, 결과판, 시대 전환 배너
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Confetti } from '../motion';
import { ranking } from '../../core/engine/scoring';
import { useGame } from '../useGame';
import { Sheet } from './Sheet';
import styles from './Overlays.module.css';

const banners = import.meta.glob('../assets/emblems/era*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function LogDrawer({ onClose }: { onClose: () => void }) {
  const { game } = useGame();
  const entries = game.log.slice(-150).reverse();
  return (
    <Sheet title="기록" onClose={onClose}>
      <ol className={styles.log}>
        {entries.map((e, i) => (
          <li key={i}>
            <span className={styles.round}>R{e.round}</span>
            {e.player !== null && <strong>{game.players[e.player].name} </strong>}
            {e.text}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

export function ScoreBoard({ onClose, onHome }: { onClose: () => void; onHome: () => void }) {
  const { game } = useGame();
  const rows = ranking(game);
  return (
    <Sheet title="최종 점수" onClose={onClose} actions={[{ label: '처음 화면으로', onClick: onHome }]}>
      <div className={styles.party}>
        <Confetti />
      </div>
      <table className={styles.score}>
        <thead>
          <tr>
            <th>순위</th>
            <th>이름</th>
            <th>문화</th>
            <th>결실</th>
            <th>기타</th>
            <th>합계</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player} className={`${i === 0 ? styles.win : ''} anim-rise`} style={{ '--delay': `${150 + (rows.length - 1 - i) * 160}ms` } as CSSProperties}>
              <td>{i === 0 ? <span className={`${styles.crown} anim-float`}>★</span> : i + 1}</td>
              <td>{game.players[r.player].name}</td>
              <td>{r.culture}</td>
              <td>{r.fruition}</td>
              <td title="유산·헌장·후원·종료 기록">{r.legacies + r.charters + r.patrons + r.finale}</td>
              <td>
                <strong>{r.total}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>기타 = 유산 + 헌장 + 주둔지 + 종료 기록</p>
    </Sheet>
  );
}

/** 시대가 바뀌면 배너를 잠깐 띄운다 */
export function EraOverlay() {
  const { game } = useGame();
  const last = useRef(game.era);
  const [show, setShow] = useState<number | null>(null);
  useEffect(() => {
    if (game.era !== last.current) {
      last.current = game.era;
      setShow(game.era);
      const t = setTimeout(() => setShow(null), 2400);
      return () => clearTimeout(t);
    }
  }, [game.era]);
  if (show === null) return null;
  return (
    <div className={`${styles.era} anim-era`} onAnimationEnd={() => setShow(null)}>
      <span className={`${styles.rays} anim-rays`} style={{ color: `var(--ring${Math.min(show, 3)})` }} aria-hidden />
      <img src={banners[`../assets/emblems/era${show}.svg`]} alt="" className="anim-float" style={{ '--dur': '2.4s' } as CSSProperties} />
      <strong className="anim-track-in" style={{ color: `var(--ring${Math.min(show, 3)})` }}>
        {show <= 3 ? `${show}시대` : '종료 시대'}
      </strong>
    </div>
  );
}
