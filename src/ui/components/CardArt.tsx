// 카드 일러스트(src/ui/assets/art/<카드 id>.svg). 아직 없으면 종류 아이콘 자리 표시
import type { CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './CardArt.module.css';

const urls = import.meta.glob('../assets/art/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byId: Record<string, string> = Object.fromEntries(Object.entries(urls).map(([k, v]) => [k.split('/').pop()!.replace('.svg', ''), v]));

export const hasArt = (id: string) => !!byId[id];

export function CardArt({
  id,
  icon = 'supply',
  tone = 'var(--text-dim)',
  className,
  style,
  arch,
}: {
  id: string;
  icon?: IconName;
  tone?: string;
  className?: string;
  style?: CSSProperties;
  /** 선구자·유산 프레임처럼 위가 둥근 창 */
  arch?: boolean;
}) {
  const url = byId[id];
  return (
    <span className={`${styles.art} ${arch ? styles.arch : ''} ${className ?? ''}`} style={style} aria-hidden="true">
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />
      ) : (
        <span className={styles.placeholder} style={{ color: tone }}>
          <Icon name={icon} size={22} />
        </span>
      )}
    </span>
  );
}
