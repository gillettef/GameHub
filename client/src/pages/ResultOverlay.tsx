import { nameOf } from '@rootbound/shared';
import { cx } from '../lib/cx';
import { selectState, useGameStore } from '../store/gameStore';
import styles from './ResultOverlay.module.css';

const REASON: Record<string, string> = {
  complete: '모든 카드를 심음',
  'last-standing': '남은 사람 1명',
};

/** 게임 종료 화면 (F025): 순위·점수 분해(땅 + 목표 + 무궁화 + 덤)·종료 사유. 보드를 다시 볼 수도 있다 */
export function ResultOverlay({ onNewGame }: { onNewGame: () => void }) {
  const state = useGameStore(selectState);
  const dismissResult = useGameStore((s) => s.dismissResult);
  if (!state?.result) return null;
  const { ranking, scores, reason } = state.result;
  const winner = ranking[0];

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className={styles.panel}>
        <p className={styles.eyebrow}>게임 종료 · {REASON[reason] ?? reason}</p>
        <h2 id="result-title" className={styles.title}>
          {winner ? `${nameOf(state, winner)} 승리` : '결과'}
        </h2>
        <ol className={styles.ranking}>
          {ranking.map((id, i) => {
            const p = state.players.find((x) => x.id === id);
            const s = scores[id];
            return (
              <li key={id} className={cx(styles.row, i === 0 && styles.first, p && p.surrenderedOrder !== null && 'is-disabled')}>
                <span className={styles.rank}>{i + 1}위</span>
                <span className={styles.name}>
                  {p?.nickname ?? id}
                  <span className={styles.seat}> {(p?.seat ?? -1) + 1}번 자리</span>
                </span>
                <span className={styles.breakdown}>
                  {p && p.surrenderedOrder !== null ? '기권' : `땅 ${s?.land ?? 0} + 목표 ${s?.goals ?? 0}${s?.bloom ? ` + 무궁화 보너스 ${s.bloom}` : ''}${s?.komi ? ` + 순서 보너스 ${s.komi}` : ''}`}
                </span>
                <span className={styles.total}>{s?.total ?? 0}점</span>
              </li>
            );
          })}
        </ol>
        <div className={styles.actions}>
          <button type="button" className="pill pill--lg" onClick={onNewGame} autoFocus>
            새 게임
          </button>
          <button type="button" className="pill pill--outline" onClick={dismissResult}>
            보드 살펴보기
          </button>
        </div>
      </div>
    </div>
  );
}
