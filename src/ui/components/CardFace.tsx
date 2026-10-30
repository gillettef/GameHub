// 카드 프레임(SVG) 위에 글자를 얹은 카드
import type { CSSProperties, ReactNode } from 'react';
import styles from './CardFace.module.css';

const frames = import.meta.glob('../assets/cards/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const frameUrl = (name: string) => frames[`../assets/cards/${name}.svg`];

export type FrameName =
  | 'pioneer' | 'legacy' | 'supply' | 'patron' | 'satellite' | 'mission'
  | 'quest-back' | 'quest-judge' | 'quest-threat' | 'quest-contest' | 'quest-patron' | 'quest-fruition' | 'quest-finale';

export function CardFace({
  frame,
  title,
  kind,
  badge,
  body,
  width = 96,
  onClick,
  dim,
  label,
  className,
}: {
  frame: FrameName;
  title?: string;
  kind?: string;
  badge?: ReactNode;
  body?: ReactNode;
  width?: number;
  onClick?: () => void;
  dim?: boolean;
  label?: string;
  className?: string;
}) {
  const style = { width, '--w': width, backgroundImage: `url("${frameUrl(frame)}")` } as CSSProperties;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`${styles.card} ${dim ? styles.dim : ''} ${width < 80 ? styles.small : ''} ${className ?? ''}`} style={style} onClick={onClick} aria-label={label ?? [title, kind].filter(Boolean).join(', ')}>
      {badge !== undefined && <span className={styles.badge}>{badge}</span>}
      {title && <span className={styles.title}>{title}</span>}
      {kind && width >= 80 && <span className={styles.kind}>{kind}</span>}
      {body && <span className={styles.body}>{body}</span>}
    </Tag>
  );
}
