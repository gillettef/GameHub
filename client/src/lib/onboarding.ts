/**
 * 첫 방문 안내 상태. DB 없음 원칙(CLAUDE.md)에 따라 localStorage 에만 남긴다.
 * identity.ts 와 같은 방식(try/catch, `astraltab.` 접두어)을 쓰되 성격이 달라(재접속 식별이 아니라
 * UI 힌트) 별도 파일로 둔다.
 */
const HELP_TAB_SEEN_KEY = 'astraltab.seenHelpTab';

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
