/**
 * 첫 방문 안내 상태. DB 없음 원칙(CLAUDE.md)에 따라 localStorage 에만 남긴다.
 * identity.ts 와 같은 방식(try/catch, `astraltab.` 접두어)을 쓰되 성격이 달라(재접속 식별이 아니라
 * UI 힌트) 별도 파일로 둔다.
 */
const HELP_TAB_SEEN_KEY = 'astraltab.seenHelpTab';
const PLACEMENT_PREVIEW_SEEN_KEY = 'astraltab.seenPlacementPreview';

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

/** 설명(도움말) 탭을 한 번이라도 열어 봤는가. 처음 온 사람에게만 탭 바에 점 배지를 보여준다 */
export function hasSeenHelpTab(): boolean {
  return read(HELP_TAB_SEEN_KEY) === '1';
}

export function markHelpTabSeen(): void {
  write(HELP_TAB_SEEN_KEY, '1');
}

/** 칸을 길게 눌러 배치 프리뷰(새로 넓어질 시야)를 본 적이 있는가. 아직이면 손패 패널에 안내 문구를 덧붙인다 */
export function hasSeenPlacementPreview(): boolean {
  return read(PLACEMENT_PREVIEW_SEEN_KEY) === '1';
}

export function markPreviewHintSeen(): void {
  write(PLACEMENT_PREVIEW_SEEN_KEY, '1');
}

const TUTORIAL_SEEN_KEY = 'astraltab.seenTutorial';

/** 튜토리얼을 끝까지 봤거나 닫았는가. 아직이면 랜딩에서 튜토리얼을 맨 위에 권한다 */
export function hasSeenTutorial(): boolean {
  return read(TUTORIAL_SEEN_KEY) === '1';
}

export function markTutorialSeen(): void {
  write(TUTORIAL_SEEN_KEY, '1');
}
