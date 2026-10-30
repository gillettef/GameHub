// 화면 폭에 맞춘 카드 크기(BGA 모바일처럼 카드 그림이 주인공이 되도록)
// 주 기준: 아이폰 17·17 Pro(CSS 402×874). 아이폰 Air 420, Pro Max 440, 작은 안드로이드 360 에서도 비례해서 맞춘다. 앱 최대 폭 480px
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

/**
 * 좌우 스크롤 없음 — 모든 줄은 화면 폭 안에 들어가고 넘치면 아래로 줄을 바꾼다.
 * 402px 기준 결과: 카드 줄 3×3 격자 카드 약 100px(줄 머리 44px 포함),
 * 퀘스트 공개 칸 177px 두 장, 미래 더미 57px 여섯 장, 보드 카드 약 96px.
 */
export function useCardSizes() {
  const [vw, setVw] = useState(viewport);
  useEffect(() => {
    const onResize = () => setVw(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const inner = vw - SECTION_INSET;
  return {
    row: clamp((inner - ROW_TIER - 3 * 8) / 3, 72, 104),
    slot: clamp((inner - 8) / 2, 150, 210),
    future: clamp((inner - 5 * 4) / 6, 48, 68),
    board: clamp((inner - 2 * 6) / 3.6, 82, 108),
  };
}
