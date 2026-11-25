// 노선 표기: 자원(색 글자)과 구분되게 노선 아이콘 + 테두리 배지로 쓴다
import type { ReactNode } from 'react';
import type { Doctrine } from '../../engine/types';
import { DOCTRINE_NAMES } from '../../engine/data/constants';
import type { Seg } from '../describe';
import { Icon } from './Icon';
import styles from './DoctrineTag.module.css';

export function DoctrineTag({ doctrine, children }: { doctrine: Doctrine; children?: ReactNode }) {
  return (
    <span className={styles.tag} style={{ color: `var(--${doctrine})` }}>
      <Icon name={doctrine} size={12} />
      {children ?? DOCTRINE_NAMES[doctrine]}
    </span>
  );
}

/** 효과 조각을 이어 그린다 — 자원은 그 색 글자, 노선은 배지 */
export function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.doctrine ? (
          <DoctrineTag key={i} doctrine={s.doctrine}>
            {s.text}
          </DoctrineTag>
        ) : (
          <span key={i} style={s.tone ? { color: s.tone } : undefined}>
            {s.text}
          </span>
        ),
      )}
    </>
  );
}
