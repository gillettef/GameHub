import { useEffect, useState } from 'react';
import { useApp } from '../store/app';
import styles from './Toast.module.css';

export function Toast() {
  const toast = useApp((s) => s.toast);
  // 사라진 토스트 번호. 새 토스트(번호가 다름)는 바로 보인다
  const [gone, setGone] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setGone(toast.id), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || gone === toast.id) return null;
  return (
    <div key={toast.id} className={`${styles.toast} anim-toast`} role="status">
      {toast.text}
    </div>
  );
}
