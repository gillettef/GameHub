import type { CSSProperties, ReactNode } from 'react';
import styles from './Section.module.css';

/** tone: 영역 색(CSS 변수). 머리 띠·왼쪽 테두리·바탕 틴트에 쓴다 */
export function Section({ title, extra, children, id, tone }: { title: ReactNode; extra?: ReactNode; children: ReactNode; id?: string; tone?: string }) {
  return (
    <section className={styles.section} id={id} style={tone ? ({ '--zone': tone } as CSSProperties) : undefined}>
      <header className={styles.head}>
        <h2>{title}</h2>
        {extra && <div className={styles.extra}>{extra}</div>}
      </header>
      {children}
    </section>
  );
}
