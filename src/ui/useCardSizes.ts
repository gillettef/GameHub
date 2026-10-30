// 화면 폭에 맞춘 카드 크기(BGA 모바일처럼 카드 그림이 주인공이 되도록). 기준 360~430px, 최대 480px
import { useEffect, useState } from 'react';

const MAX_APP = 480;
/** 섹션 바깥 여백(8×2) + 안쪽 여백(12×2) */
const SECTION_INSET = 40;

const clamp = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)));

function viewport(): number {
  return typeof window === 'undefined' ? 390 : Math.min(window.innerWidth, MAX_APP);
}

export function useCardSizes() {
  const [vw, setVw] = useState(viewport);
  useEffect(() => {
    const onResize = () => setVw(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const inner = vw - SECTION_INSET;
  return {
    /** 카드 줄: 한 화면에 약 4장, 나머지는 가로로 밀어서 */
    row: clamp((inner - 3 * 8) / 4.2, 74, 106),
    /** 퀘스트 공개 2칸: 반씩 */
    slot: clamp((inner - 8) / 2, 140, 200),
    /** 미래 퀘스트 더미: 한 줄에 6장 */
    future: clamp((inner - 5 * 4) / 6, 44, 66),
    /** 보드의 선구자·유산·보급·궤도·후원 카드: 한 줄에 약 4장 */
    board: clamp((inner - 3 * 6) / 4.2, 70, 100),
  };
}
