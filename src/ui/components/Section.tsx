import type { ReactNode } from 'react';
import styles from './Section.module.css';

export function Section({ title, extra, children, id }: { title: ReactNode; extra?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className={styles.section} id={id}>
      <header className={styles.head}>
        <h2>{title}</h2>
        {extra && <div className={styles.extra}>{extra}</div>}
      </header>
      {children}
    </section>
  );
}
