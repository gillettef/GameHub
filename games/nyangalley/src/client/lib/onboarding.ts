/**
 * 첫 방문 안내 상태. DB 없음 원칙에 따라 localStorage(`nyangalley:` 접두어)에만 남긴다.
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 시크릿 창 등: 이번 세션에는 다시 뜰 수 있지만 기능에는 영향 없다 */
  }
}

const TUTORIAL_SEEN_KEY = 'nyangalley:seenTutorial';

/** 튜토리얼을 끝까지 봤거나 닫았는가. 아직이면 랜딩에서 튜토리얼을 맨 위에 권한다 */
export function hasSeenTutorial(): boolean {
  return read(TUTORIAL_SEEN_KEY) === '1';
}

export function markTutorialSeen(): void {
  write(TUTORIAL_SEEN_KEY, '1');
}
