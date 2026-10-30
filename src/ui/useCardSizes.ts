// 카드 크기: 쓰루처럼 모든 카드를 한 크기로(카드 줄·퀘스트·보드·미리 본 퀘스트), 누르면 확대
// 주 기준: 아이폰 17·17 Pro(CSS 402×874). 360~440px 폭에 비례, 앱 최대 폭 480px. 좌우 스크롤 없음
import { useEffect, useState } from 'react';

const MAX_APP = 480;
/** 섹션 바깥 여백(8×2) + 안쪽 여백(12×2) */
const SECTION_INSET = 40;
/** 카드 줄 3×3 격자의 줄 머리(지휘 비용) 폭 */
const ROW_TIER = 44;

const clamp = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)));

function viewport(): number {
  return typeof window === 'undefined' ? 402 : Math.min(window.innerWidth, MAX_APP);
}

/** 402px 기준: 카드 약 100px(카드 줄 3장 + 줄 머리가 한 줄에), 확대 카드 약 282px */
export function useCardSizes() {
  const [vw, setVw] = useState(viewport);
  useEffect(() => {
    const onResize = () => setVw(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const inner = vw - SECTION_INSET;
  return {
    card: clamp((inner - ROW_TIER - 3 * 8) / 3, 72, 104),
    zoom: clamp(vw - 120, 220, 300),
  };
}
