// 플레이어 상태창(BGA 의 플레이어 패널). 한 줄에 2명, 칩마다 이름·남은 행동·점수·노선·자원. 누르면 그 사람 보드로 스크롤
import { DOCTRINES } from '../../core/types';
import { commandLeft, defenseLeft, defenseValue, mainDoctrine, stage } from '../../core/engine/derive';
import { DOCTRINE_NAMES, RES_NAMES } from '../../core/data/constants';
import { useGame } from '../useGame';
import { Icon, type IconName } from './Icon';
import { Num } from '../motion';
import styles from './PlayerStrip.module.css';

// 칩에 보이는 자원(문화는 점수 줄에 따로)
const CHIP_RES = [
  ['food', 'food'],
  ['prod', 'prod'],
  ['energy', 'energy'],
  ['sci', 'sci'],
] as const satisfies readonly (readonly [string, IconName])[];

export function PlayerStrip() {
  const { game, me } = useGame();
  const actor = game.pending.length ? game.pending[0].player : game.current;
  const goto = (id: number) => document.getElementById(`board-${id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  return (
    <section className={styles.wrap} aria-label="플레이어 상태">
      <div className={styles.strip}>
        {game.players.map((p) => {
          // 칩에는 주 노선(없으면 가장 높은 노선) 하나만 — 세 노선 모두는 보드에서
          const lead = mainDoctrine(p) ?? (DOCTRINES.some((d) => p.doctrine[d] > 0) ? DOCTRINES.reduce((a, b) => (p.doctrine[b] > p.doctrine[a] ? b : a)) : null);
          return (
            <button
              key={p.id}
              className={`${styles.chip} ${p.id === me ? styles.viewing : ''} ${p.id === actor ? `${styles.turn} anim-turn` : ''}`}
              style={{ borderLeftColor: `var(--seat-${p.id})` }}
              onClick={() => goto(p.id)}
              aria-label={`${p.name} 보드 보기`}
              data-tip={p.name}
              data-tip-body={`문화 ${p.res.culture} · 방어값 ${defenseValue(p)}\n남은 행동: 지휘 ${commandLeft(game, p)} · 방위 ${defenseLeft(p)}\n${CHIP_RES.map(([k]) => `${RES_NAMES[k]} ${p.res[k]}`).join(' · ')}\n${DOCTRINES.map((d) => `${DOCTRINE_NAMES[d]} ${p.doctrine[d]}`).join(' · ')}${p.id === game.startPlayer ? '\n① 시작 플레이어' : ''}\n누르면 이 사람의 보드로 이동합니다.`}
            >
              <span className={styles.nameRow}>
                <span className={styles.name}>
                  {p.id === game.startPlayer && <span className={styles.first} title="시작 플레이어">①</span>}
                  {p.name}
                  {p.id === me && <span className={styles.me}>나</span>}
                </span>
                <span className={styles.acts} aria-label={`남은 지휘 ${commandLeft(game, p)}, 방위 ${defenseLeft(p)}`}>
                  <span>
                    <Icon name="command" size={13} /> <Num value={commandLeft(game, p)} delta={false} />
                  </span>
                  <span style={{ color: 'var(--danger)' }}>
                    <Icon name="defense" size={13} /> <Num value={defenseLeft(p)} delta={false} />
                  </span>
                </span>
              </span>
              <span className={styles.stats}>
                <span style={{ color: 'var(--res-culture)' }}>
                  <Icon name="culture" size={13} /> <Num value={p.res.culture} />
                </span>
                <span style={{ color: 'var(--danger)' }}>
                  <Icon name="might" size={13} /> <Num value={defenseValue(p)} />
                </span>
                {lead && (
                  <span className={styles.doc} style={{ color: `var(--${lead})` }} aria-label={`${DOCTRINE_NAMES[lead]} ${p.doctrine[lead]}점`}>
                    <Icon name={lead} size={13} />
                    {p.doctrine[lead]}
                    {stage(p, lead) > 0 && <sup>{stage(p, lead)}</sup>}
                  </span>
                )}
              </span>
              <span className={styles.res}>
                {CHIP_RES.map(([k, icon]) => (
                  <span key={k} style={{ color: `var(--res-${k})` }} aria-label={`${RES_NAMES[k]} ${p.res[k]}`}>
                    <Icon name={icon} size={13} /> <Num value={p.res[k]} />
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
