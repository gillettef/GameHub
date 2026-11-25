/**
 * 이미지 슬롯 레지스트리.
 *
 * - 파일을 `public/images/<슬롯키>.<확장자>` 로 넣으면 자동 적용된다. (확장자 우선순위: webp → png → jpg)
 *   예) public/images/facility/1.webp  (롤러코스터)
 * - 실제 파일 목록은 빌드 타임에 vite.config.ts 의 imageManifest 플러그인이 만든다(`virtual:image-manifest`).
 *   그래서 파일이 없는 슬롯은 요청을 보내지 않고 <Slot>이 아이콘 + 그라데이션 플레이스홀더를 그린다.
 * - 슬롯 목록과 권장 크기는 개발 서버(npm run dev)에서 앱 주소 뒤에 `#assets` 를 붙이면 확인할 수 있다.
 * - 앱 포장(Capacitor 등) 시에도 public/images 가 그대로 번들된다.
 */
import { FACILITIES } from '../engine/data/facilities';
import { EVENTS } from '../engine/data/events';
import type { FacilityType, StaffKey } from '../engine/types';

export const IMAGE_BASE = 'images/';
export const IMAGE_EXTS = ['webp', 'png', 'jpg'] as const;

export interface SlotSpec {
  key: string;
  label: string;
  group: string;
  /** 권장 픽셀 크기 (가로x세로) */
  size: string;
  note?: string;
}

const TYPES: FacilityType[] = ['스릴형', '패밀리형', '공포형', '어드벤처형', '교육형', '물놀이형', '놀이형', '상점', '부대시설'];
const STAFF: [StaffKey, string][] = [
  ['marketer', '마케팅 전문가'],
  ['guide', '안내 직원'],
  ['engineer', '엔지니어'],
  ['cleaner', '환경 미화원'],
  ['researcher', '연구원'],
];

export const SLOT_SPECS: SlotSpec[] = [
  { key: 'ui/logo', label: '로고', group: '공통', size: '512x512', note: '타이틀 화면. 투명 배경 PNG/WebP 권장' },
  { key: 'ui/title-bg', label: '타이틀 배경', group: '공통', size: '1080x1920', note: '세로 풀스크린, 위·아래에 UI가 얹힘' },
  { key: 'ui/park-bg', label: '인게임 배경', group: '공통', size: '1080x1920', note: '은은한 패턴/일러스트 (어둡게)' },
  { key: 'ui/slot-empty', label: '빈 부지 타일', group: '공통', size: '300x360' },
  { key: 'ui/slot-broken', label: '고장 오버레이', group: '공통', size: '300x360', note: '투명 PNG' },
  { key: 'visitor/child', label: '어린이 관객', group: '관객', size: '256x256' },
  { key: 'visitor/adult', label: '성인 관객', group: '관객', size: '256x256' },
  ...TYPES.map((t) => ({ key: `type/${t}`, label: `${t} 유형 배경`, group: '시설 유형', size: '600x400', note: '시설 개별 이미지가 없을 때 대체로 사용' })),
  ...STAFF.map(([k, l]) => ({ key: `staff/${k}`, label: l, group: '인력', size: '256x256' })),
  ...EVENTS.map((e) => ({ key: `event/${e.id}`, label: `이벤트: ${e.name}`, group: '운영카드(이벤트)', size: '800x360', note: '가로로 긴 배너' })),
  ...FACILITIES.map((c) => ({ key: `facility/${c.id}`, label: `${c.id}. ${c.name}`, group: `시설 · ${c.type}`, size: '600x400', note: '카드 일러스트 (3:2)' })),
];
