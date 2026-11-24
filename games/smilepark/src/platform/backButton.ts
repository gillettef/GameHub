/**
 * 뒤로가기(Android 하드웨어/제스처, 브라우저 뒤로) · ESC 키로 열린 시트를 닫는 기능.
 *
 * 웹에서는 history.pushState / popstate 로 구현한다. 앱으로 포장할 때는
 * 이 파일만 Capacitor App 'backButton' 리스너 등으로 교체하면 된다.
 *
 * 열린 시트들은 스택으로 관리하고, "시트가 하나라도 열려 있으면" 히스토리 항목 1개를 쌓아 둔다.
 * 뒤로가기 → 가장 위 시트의 닫기 함수를 호출한다. 닫을 수 없는 시트(onClose 없음)는 뒤로가기를 삼킨다.
 */
import { useEffect, useRef } from 'react';

interface Entry {
  close: (() => void) | undefined;
}

const stack: Entry[] = [];
const MARK = '__smileparkSheet';
let pushed = false;
let ignorePops = 0;
let listening = false;

function hasOurState() {
  return !!(history.state && (history.state as Record<string, unknown>)[MARK]);
}

function pushEntry() {
  if (pushed) return;
  try {
    history.pushState({ ...(history.state ?? {}), [MARK]: true }, '');
    pushed = true;
  } catch {
    /* 일부 WebView에서 실패할 수 있음 */
  }
}

/** 열고 닫기가 같은 커밋에서 연달아 일어나도(시트 전환) 히스토리를 흔들지 않도록 한 틱 늦춰 정리한다 */
function scheduleSync() {
  setTimeout(() => {
    if (stack.length > 0) pushEntry();
    else if (pushed) {
      pushed = false;
      if (hasOurState()) {
        ignorePops++;
        history.back();
      }
    }
  }, 0);
}

function onPopState() {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  if (!pushed) return;
  pushed = false;
  const top = stack[stack.length - 1];
  if (!top) return;
  if (top.close) top.close();
  // 닫을 수 없는 시트이거나 아래에 다른 시트가 남아 있으면 항목을 다시 쌓는다
  scheduleSync();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top?.close) {
    e.preventDefault();
    top.close();
  }
}

function ensureListeners() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', onPopState);
  window.addEventListener('keydown', onKeyDown);
}

/**
 * 시트가 마운트되어 있는 동안 뒤로가기/ESC 를 가로챈다.
 * @param onClose 닫기 함수. 없으면 뒤로가기를 무시(삼킴)한다.
 */
export function useDismissOnBack(onClose: (() => void) | undefined) {
  const ref = useRef(onClose);
  ref.current = onClose;
  const closable = !!onClose;
  useEffect(() => {
    ensureListeners();
    const entry: Entry = { close: closable ? () => ref.current?.() : undefined };
    stack.push(entry);
    scheduleSync();
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      scheduleSync();
    };
  }, [closable]);
}
