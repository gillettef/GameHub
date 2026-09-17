import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction } from '@server/engine/actions';
import { useStore } from './store';

// 선택을 누르면 화면이 바로 넘어가지 않고, 고른 것을 잠시 강조한 뒤 서버에 보낸다.
// commit(key, action) 을 부르면 key 가 `chosen` 으로 노출되어 화면이 그 항목에 강조 스타일을 줄 수 있고,
// HOLD_MS 뒤에 action 을 보낸다. 강조 중에는 다른 선택을 무시한다(중복 전송 방지).
export const HOLD_MS = 900;

export function useCommit() {
  const { act } = useStore();
  const [chosen, setChosen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = useCallback(
    (key: string, action: GameAction) => {
      if (timer.current) return;
      setChosen(key);
      timer.current = setTimeout(() => {
        timer.current = null;
        act(action);
        setChosen(null);
      }, HOLD_MS);
    },
    [act],
  );

  return { chosen, committing: chosen !== null, commit };
}
