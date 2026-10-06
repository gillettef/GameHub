import { useEffect, useState } from 'react';

/**
 * 터치 환경용 짧은 설명 말풍선.
 * hover(title 속성)는 터치 기기에서 볼 수 없으므로, 아이콘·라벨을 탭하면 showTip()으로 설명을 띄운다.
 */
type Listener = (t: { text: string; n: number }) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function showTip(text: string) {
  seq++;
  for (const l of listeners) l({ text, n: seq });
}

/** 앱 루트에 한 번만 둔다 */
export function TipHost() {
  const [tip, setTip] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    const l: Listener = (t) => setTip(t);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip((c) => (c && c.n === tip.n ? null : c)), 2400);
    return () => clearTimeout(t);
  }, [tip]);
  if (!tip) return null;
  return (
    <div className="tip" key={tip.n} role="status" aria-live="polite">
      {tip.text}
    </div>
  );
}
