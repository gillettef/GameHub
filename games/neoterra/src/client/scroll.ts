// ③ 테이블 영역 안의 구역으로 스크롤한다(페이지는 움직이지 않고 영역 안에서만)
const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

export const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: smooth(), block: 'start' });
