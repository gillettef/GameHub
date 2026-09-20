import { describe, expect, it } from 'vitest';
import { loadDevice, recommendDevice } from './device';

// 화면 모드(PC용/모바일용) 선택 화면의 "추천" 판정과 저장값 읽기
describe('recommendDevice', () => {
  it('좁은 화면은 입력 방식과 무관하게 모바일용', () => {
    expect(recommendDevice(390, true)).toBe('mobile');
    expect(recommendDevice(820, false)).toBe('mobile');
  });

  it('터치가 주 입력이면 태블릿 폭까지 모바일용', () => {
    expect(recommendDevice(1024, true)).toBe('mobile');
    expect(recommendDevice(1024, false)).toBe('pc');
  });

  it('넓은 화면은 PC용', () => {
    expect(recommendDevice(1440, false)).toBe('pc');
    expect(recommendDevice(1366, true)).toBe('pc');
  });
});

describe('loadDevice', () => {
  it('저장소가 없거나 값이 없으면 null (→ 선택 화면)', () => {
    expect(loadDevice()).toBeNull();
  });
});
