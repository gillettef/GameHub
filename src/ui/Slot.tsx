import type { CSSProperties, ReactNode } from 'react';
import IMAGE_FILES from 'virtual:image-manifest';
import { IMAGE_BASE, IMAGE_EXTS } from './assets';

/**
 * 슬롯키 → 실제 이미지 URL.
 * public/images 의 파일 목록은 빌드 타임에 정해지므로(vite.config.ts imageManifest),
 * 파일이 없는 슬롯은 네트워크 요청 없이 바로 플레이스홀더를 그린다.
 * 같은 슬롯에 여러 확장자가 있으면 IMAGE_EXTS 순서(webp → png → jpg)를 따른다.
 */
const SLOT_URLS: Map<string, string> = (() => {
  const best = new Map<string, { rank: number; file: string }>();
  for (const file of IMAGE_FILES) {
    const dot = file.lastIndexOf('.');
    const key = file.slice(0, dot);
    const rank = IMAGE_EXTS.indexOf(file.slice(dot + 1).toLowerCase() as (typeof IMAGE_EXTS)[number]);
    if (rank < 0) continue;
    const cur = best.get(key);
    if (!cur || rank < cur.rank) best.set(key, { rank, file });
  }
  return new Map([...best].map(([k, v]) => [k, IMAGE_BASE + v.file]));
})();

/** 슬롯의 이미지 URL (없으면 null). 빌드 타임 목록을 동기로 조회한다. */
export function slotImageUrl(key: string | null): string | null {
  return key ? (SLOT_URLS.get(key) ?? null) : null;
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
  let url: string | null = null;
  for (const k of keys) {
    url = slotImageUrl(k);
    if (url) break;
  }
  return (
    <div
      className={`slot ${url ? 'has-img' : 'ph'} ${className}`}
      style={{ ['--tint' as string]: tint, ...style, backgroundImage: url ? `url("${encodeURI(url)}")` : undefined }}
    >
      {!url && <div className="slot-ph">{fallback}</div>}
      {children}
    </div>
  );
}
