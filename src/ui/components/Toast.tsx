import { useEffect, useState } from 'react';
import { useApp } from '../../store/app';
import styles from './Toast.module.css';

export function Toast() {
  const toast = useApp((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className={styles.toast} role="status">
      {toast.text}
    </div>
  );
}
