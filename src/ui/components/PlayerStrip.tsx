// 상단 고정 플레이어 패널(BGA 의 오른쪽 플레이어 패널을 가로로 접은 형태)
import { DOCTRINES } from '../../core/types';
import { defenseValue, mainDoctrine, stage } from '../../core/engine/derive';
import { eraProgress } from '../../core/engine/era';
import { DOCTRINE_NAMES } from '../../core/data/constants';
import { useApp } from '../../store/app';
import { useGame } from '../useGame';
import { Icon } from './Icon';
import styles from './PlayerStrip.module.css';

export function PlayerStrip({ onMenu, onLog }: { onMenu: () => void; onLog: () => void }) {
  const { game, me } = useGame();
  const viewing = useApp((s) => s.viewing);
  const set = useApp((s) => s.set);
  const prog = eraProgress(game);
  const actor = game.pending.length ? game.pending[0].player : game.current;
  return (
    <header className={styles.wrap}>
      <div className={styles.top}>
        <button className={styles.iconBtn} onClick={onMenu} aria-label="메뉴">
          ☰
        </button>
        <div className={styles.era} style={{ color: `var(--ring${Math.min(game.era, 3)})` }}>
          <strong>{game.era <= 3 ? `${game.era}시대` : '종료 시대'}</strong>
          <span>
            {game.round}라운드
            {game.era <= 3 ? ` · 시대 진행 ${prog.have}/${prog.need}` : game.endTriggered ? ' · 마지막 라운드' : ''}
          </span>
        </div>
        <button className={styles.textBtn} onClick={onLog}>
          기록
        </button>
      </div>
      <div className={styles.strip}>
        {game.players.map((p) => {
          // 칩에는 주 노선(없으면 가장 높은 노선) 하나만 — 세 노선 모두는 보드에서
          const lead = mainDoctrine(p) ?? (DOCTRINES.some((d) => p.doctrine[d] > 0) ? DOCTRINES.reduce((a, b) => (p.doctrine[b] > p.doctrine[a] ? b : a)) : null);
          return (
            <button
              key={p.id}
              className={`${styles.chip} ${p.id === viewing ? styles.viewing : ''} ${p.id === actor ? styles.turn : ''}`}
              onClick={() => set({ viewing: p.id })}
              aria-label={`${p.name} 보드 보기`}
            >
              <span className={styles.name}>
                {p.id === game.startPlayer && <span className={styles.first} title="시작 플레이어">①</span>}
                {p.name}
                {p.id === me && <span className={styles.me}>나</span>}
              </span>
              <span className={styles.stats}>
                <span style={{ color: 'var(--res-culture)' }}>
                  <Icon name="culture" size={13} /> {p.res.culture}
                </span>
                <span style={{ color: 'var(--danger)' }}>
                  <Icon name="might" size={13} /> {defenseValue(p)}
                </span>
                {lead && (
                  <span className={styles.doc} style={{ color: `var(--${lead})` }} aria-label={`${DOCTRINE_NAMES[lead]} ${p.doctrine[lead]}점`}>
                    <Icon name={lead} size={13} />
                    {p.doctrine[lead]}
                    {stage(p, lead) > 0 && <sup>{stage(p, lead)}</sup>}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
