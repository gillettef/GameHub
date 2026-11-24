import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameAction } from '@server/engine/actions';
import { useStore } from './store';

// 선택은 바로 서버에 보내지 않는다. select(key, action, label) 로 고른 항목을 강조(chosen)해 두고,
// 화면 아래 확정 막대(ConfirmBar)에서 "확정"을 눌러야 보낸다. "취소"(또는 Esc)는 선택을 지운다.
// 단계·차례·요일이 바뀌거나 대상 선택 모달이 뜨면(scope 변경) 선택은 자동으로 사라진다.

export interface Selection {
  key: string;
  action: GameAction;
  label: ReactNode;
}

interface CommitStore {
  selection: Selection | null;
  chosen: string | null; // 강조할 항목의 key
  select: (key: string, action: GameAction, label: ReactNode) => void;
  confirm: () => void;
  cancel: () => void;
}

const CommitContext = createContext<CommitStore | null>(null);

export function CommitProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const { act } = useStore();
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    setSelection(null);
  }, [scope]);

  const select = useCallback((key: string, action: GameAction, label: ReactNode) => {
    setSelection((s) => (s?.key === key ? null : { key, action, label })); // 같은 항목을 다시 누르면 선택 해제
  }, []);
  const confirm = useCallback(() => {
    if (!selection) return;
    act(selection.action);
    setSelection(null);
  }, [selection, act]);
  const cancel = useCallback(() => setSelection(null), []);

  const value = useMemo<CommitStore>(
    () => ({ selection, chosen: selection?.key ?? null, select, confirm, cancel }),
    [selection, select, confirm, cancel],
  );
  return <CommitContext.Provider value={value}>{children}</CommitContext.Provider>;
}

export function useCommit(): CommitStore {
  const s = useContext(CommitContext);
  if (!s) throw new Error('CommitProvider missing');
  return s;
}

// 화면 아래 고정 막대: 무엇을 골랐는지 보여주고 확정/취소
export function ConfirmBar() {
  const { selection, confirm, cancel } = useCommit();
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, cancel]);
  if (!selection) return null;
  return (
    <div key={selection.key} className="confirm-bar" role="dialog" aria-label="선택 확정">
      <span className="confirm-label">{selection.label}</span>
      <span className="confirm-actions">
        <button className="ghost light" onClick={cancel}>취소</button>
        <button className="primary" onClick={confirm} autoFocus>확정</button>
      </span>
    </div>
  );
}
