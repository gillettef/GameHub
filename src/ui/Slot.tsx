import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { IMAGE_BASE, IMAGE_EXTS } from './assets';

const missing = new Set<string>();
const found = new Map<string, string>();

/** 슬롯의 실제 이미지 URL을 확장자 순서대로 탐색한다. 없으면 null. */
function probe(key: string): Promise<string | null> {
  if (found.has(key)) return Promise.resolve(found.get(key)!);
  if (missing.has(key)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (i >= IMAGE_EXTS.length) {
        missing.add(key);
        resolve(null);
        return;
      }
      const url = `${IMAGE_BASE}${key}.${IMAGE_EXTS[i++]}`;
      const img = new Image();
      img.onload = () => {
        found.set(key, url);
        resolve(url);
      };
      img.onerror = next;
      img.src = url;
    };
    next();
  });
}

export function useSlotImage(key: string | null) {
  const [url, setUrl] = useState<string | null>(key ? (found.get(key) ?? null) : null);
  useEffect(() => {
    let alive = true;
    if (!key) return setUrl(null);
    probe(key).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [key]);
  return url;
}

interface Props {
  /** 슬롯 키 (assets.ts 참고). 배열이면 앞에서부터 우선 적용 */
  slot: string | string[];
  /** 이미지가 없을 때 보여줄 것 */
  fallback?: ReactNode;
  /** 플레이스홀더 색 */
  tint?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** 이미지 영역. 이미지가 있으면 cover로 채우고, 없으면 틴트 그라데이션 + fallback 아이콘. */
export function Slot({ slot, fallback, tint = '#4b3fa8', className = '', style, children }: Props) {
  const keys = Array.isArray(slot) ? slot : [slot];
  const k0 = useSlotImage(keys[0]);
  const k1 = useSlotImage(keys[1] ?? null);
  const url = k0 ?? k1;
  return (
    <div
      className={`slot ${url ? 'has-img' : 'ph'} ${className}`}
      style={{ ['--tint' as string]: tint, ...style, backgroundImage: url ? `url(${url})` : undefined }}
    >
      {!url && <div className="slot-ph">{fallback}</div>}
      {children}
    </div>
  );
}
