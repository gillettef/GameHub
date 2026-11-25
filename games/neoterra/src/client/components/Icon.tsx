// 단색 아이콘: CSS mask + currentColor 로 색을 입힌다 (docs/art.md)
import type { CSSProperties } from 'react';
import styles from './Icon.module.css';

const urls = import.meta.glob('../assets/icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byName: Record<string, string> = Object.fromEntries(Object.entries(urls).map(([k, v]) => [k.split('/').pop()!.replace('.svg', ''), v]));

export type IconName =
  | 'food' | 'prod' | 'energy' | 'sci' | 'culture' | 'command' | 'defense' | 'might' | 'health' | 'spore'
  | 'ark' | 'symbiont' | 'synth' | 'farm' | 'workshop' | 'power' | 'lab' | 'hall' | 'guard' | 'rider' | 'battery' | 'flyer'
  | 'satellite' | 'quest' | 'threat' | 'patron' | 'mission' | 'charter' | 'legacy' | 'pioneer' | 'supply' | 'colonist' | 'raid' | 'conflict';

export function Icon({ name, size = 18, color, title }: { name: IconName; size?: number; color?: string; title?: string }) {
  const style = { width: size, height: size, color, '--icon': `url("${byName[name]}")` } as CSSProperties;
  return <span className={styles.icon} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} />;
}
