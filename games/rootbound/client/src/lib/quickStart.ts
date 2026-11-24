/**
 * "AI와 바로 시작"(2026-10-01) 표시. 랜딩에서 방을 만들고 AI 자리를 채운 뒤 방 화면으로 넘어가면,
 * 로비가 한 번만 준비 완료를 대신 눌러 곧바로 대국이 시작되게 한다.
 * 방 단위 일회성 신호라 sessionStorage 에 둔다(막혀 있으면 메모리로 대체).
 */
const KEY = 'astraltab.quickStart.';
const memory = new Set<string>();

export function markQuickStart(roomId: string): void {
  memory.add(roomId);
  try {
    window.sessionStorage.setItem(KEY + roomId, '1');
  } catch {
    /* 메모리 표시로 충분하다 */
  }
}

/** 표시가 있으면 true 를 돌려주고 지운다 */
export function takeQuickStart(roomId: string): boolean {
  let found = memory.delete(roomId);
  try {
    if (window.sessionStorage.getItem(KEY + roomId) === '1') found = true;
    window.sessionStorage.removeItem(KEY + roomId);
  } catch {
    /* 무시 */
  }
  return found;
}

export function hasQuickStart(roomId: string): boolean {
  if (memory.has(roomId)) return true;
  try {
    return window.sessionStorage.getItem(KEY + roomId) === '1';
  } catch {
    return false;
  }
}
