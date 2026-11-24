// 카드 크기: 쓰루처럼 모든 카드를 한 크기로(퀘스트 트랙·보드), 누르면 확대
// 주 기준: 아이폰 17·17 Pro(CSS 402×874). 360~440px 폭에 비례, 앱 최대 폭 480px. 좌우 스크롤 없음
import { useEffect, useState } from 'react';

const MAX_APP = 480;
/** 섹션 바깥 여백(8×2) + 안쪽 여백(12×2) + 왼쪽 띠 4 + 오른쪽 테두리 1 */
const SECTION_INSET = 45;

const clamp = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)));

/** 확대 카드 높이는 화면 높이의 이 비율까지 — 시트 안에서 설명·행동 버튼이 카드에 밀려 화면 밖으로 나가지 않게 */
const ZOOM_MAX_VH = 0.4;

function viewport(): number {
  return typeof window === 'undefined' ? 402 : Math.min(window.innerWidth, MAX_APP);
}

/** 화면 높이는 상태로 두지 않고 그릴 때 읽는다 — iOS 는 스크롤하며 주소창이 접힐 때마다 높이가 바뀌어 resize 가 잦다 */
function viewportHeight(): number {
  return typeof window === 'undefined' ? 874 : window.innerHeight;
}

/** 402×874 기준: 카드 약 104px(한 줄에 3장, 퀘스트 트랙 5칸은 3 + 2줄), 확대 카드 약 250px(높이 350px) */
export function useCardSizes() {
  const [vw, setVw] = useState(viewport);
  useEffect(() => {
    const onResize = () => setVw(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const inner = vw - SECTION_INSET;
  return {
    card: clamp((inner - 2 * 8) / 3, 72, 104),
    zoom: clamp(Math.min(vw - 120, (viewportHeight() * ZOOM_MAX_VH * 5) / 7), 180, 300),
  };
}
