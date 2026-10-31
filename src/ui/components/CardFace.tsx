// 카드 프레임(SVG) 위에 글자를 얹은 카드
import type { CSSProperties, ReactNode } from 'react';
import type { CardDef } from '../../core/types';
import { CardArt } from './CardArt';
import type { IconName } from './Icon';
import styles from './CardFace.module.css';

const frames = import.meta.glob('../assets/cards/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const frameUrl = (name: string) => frames[`../assets/cards/${name}.svg`];

export type FrameName =
  | 'pioneer' | 'legacy' | 'supply' | 'patron' | 'satellite' | 'mission'
  | 'quest-back' | 'quest-judge' | 'quest-threat' | 'quest-contest' | 'quest-patron' | 'quest-fruition' | 'quest-finale';

/** 선구자·유산·보급·습격·분쟁 카드의 프레임과 그림 창 아이콘(습격·분쟁 전용 프레임은 아직 없어 임무 프레임을 쓴다) */
export const CARD_FRAME: Record<CardDef['type'], FrameName> = { pioneer: 'pioneer', legacy: 'legacy', supply: 'supply', raid: 'mission', conflict: 'mission' };
export const CARD_ICON: Record<CardDef['type'], IconName> = { pioneer: 'pioneer', legacy: 'legacy', supply: 'supply', raid: 'rider', conflict: 'might' };

export function CardFace({
  frame,
  title,
  kind,
  badge,
  body,
  brief,
  width = 96,
  onClick,
  dim,
  label,
  className,
  art,
  tip,
  tagTone,
}: {
  frame: FrameName;
  title?: string;
  kind?: string;
  badge?: ReactNode;
  body?: ReactNode;
  /** 작은 카드 아랫부분의 아이콘 요약(body 가 안 보이는 크기에서) */
  brief?: ReactNode;
  width?: number;
  onClick?: () => void;
  dim?: boolean;
  label?: string;
  className?: string;
  /** 그림 창에 넣을 일러스트(카드 id) */
  art?: { id: string; icon?: IconName; tone?: string };
  /** 마우스 툴팁 설명(제목은 title) */
  tip?: string;
  /** 그림 창 위 종류 태그 색(art 와 kind 가 있을 때 태그로 표시) */
  tagTone?: string;
}) {
  const style = { width, '--w': width, backgroundImage: `url("${frameUrl(frame)}")` } as CSSProperties;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`${styles.card} ${frame.startsWith('quest-') ? styles.quest : ''} ${dim ? styles.dim : ''} ${width < 80 && !art ? styles.small : ''} ${className ?? ''}`} style={style} onClick={onClick} aria-label={label ?? [title, kind].filter(Boolean).join(', ')} data-tip={tip !== undefined ? title : undefined} data-tip-body={tip}>
      {art && <CardArt id={art.id} icon={art.icon} tone={art.tone} arch={frame === 'pioneer' || frame === 'legacy'} className={styles.window} />}
      {art && kind && <span className={styles.tag} style={tagTone ? ({ '--tag': tagTone } as CSSProperties) : undefined}>{kind}</span>}
      {badge !== undefined && <span className={styles.badge}>{badge}</span>}
      {title && <span className={styles.title}>{title}</span>}
      {kind && width >= 80 && !art && <span className={styles.kind}>{kind}</span>}
      {body && width >= 130 ? <span className={styles.body}>{body}</span> : brief}
    </Tag>
  );
}
