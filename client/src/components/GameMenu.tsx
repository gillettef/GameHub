import { memo, useEffect, useState } from 'react';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { isNotifyOn, isSoundOn, notifySupported, setNotifyOn, setSoundOn } from '../lib/cues';
import { BellIcon, CheckIcon, CloseIcon, ExitIcon, HelpIcon, MoreIcon, MuteIcon, SoundIcon, SurrenderIcon } from './icons';
import styles from './GameMenu.module.css';

type Confirm = 'quit' | 'surrender' | null;

/**
 * 게임 메뉴 (2026-10-01): 돌이킬 수 없는 동작(기권·나가기)을 바닥 턴 바에서 떼어 상단 ⋯ 메뉴로 옮겼다.
 * 패스 바로 옆에 기권이 있어 연타로 잘못 누르던 위험을 없앤다. 항목마다 한 번 더 확인한다.
 * 나가기(온라인은 게임이 서버에 남고 다시 들어올 수 있다)와 기권(즉시 탈락)의 차이를 문구로 밝힌다.
 */
export const GameMenu = memo(function GameMenu({ onQuit }: { onQuit: () => void }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const mode = useGameStore((s) => s.mode);
  const surrender = useGameStore((s) => s.surrender);
  const setTab = useGameStore((s) => s.setTab);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [sound, setSound] = useState(isSoundOn);
  const [notify, setNotify] = useState(isNotifyOn);
  const setNotice = useGameStore((s) => s.setNotice);

  // 턴이 바뀌면 열려 있던 확인은 풀린다(차례가 넘어간 뒤 기권이 눌리는 사고 방지)
  const turn = state?.turn;
  useEffect(() => {
    setConfirm(null);
  }, [turn]);

  const close = () => {
    setOpen(false);
    setConfirm(null);
  };

  const canSurrender = (state?.phase === 'playing' || state?.phase === 'reveal') && state.players.find((p) => p.id === viewerId)?.surrenderedOrder === null;

  return (
    <div className={styles.root}>
      <button type="button" className={styles.trigger} onClick={() => (open ? close() : setOpen(true))} aria-label="메뉴" title="메뉴" aria-expanded={open}>
        <MoreIcon />
      </button>
      {open && (
        <>
          <div className={styles.backdrop} onClick={close} aria-hidden="true" />
          <div className={styles.popover} role="menu">
            {confirm === null && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.item}
                  onClick={() => {
                    setTab('help');
                    close();
                  }}
                >
                  <HelpIcon />
                  <span>규칙 보기</span>
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={sound}
                  className={styles.item}
                  onClick={() => {
                    setSoundOn(!sound);
                    setSound(!sound);
                  }}
                >
                  {sound ? <SoundIcon /> : <MuteIcon />}
                  <span>효과음 {sound ? '켜짐' : '꺼짐'}</span>
                </button>
                {mode === 'online' && notifySupported() && (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={notify}
                    className={styles.item}
                    onClick={() => {
                      void setNotifyOn(!notify).then((on) => {
                        setNotify(on);
                        if (!notify && !on) setNotice('브라우저 설정에서 이 사이트의 알림을 허용하세요');
                      });
                    }}
                    title="다른 탭을 보고 있을 때 내 차례가 오면 알려 줍니다"
                  >
                    <BellIcon />
                    <span>차례 알림 {notify ? '켜짐' : '꺼짐'}</span>
                  </button>
                )}
                <button type="button" role="menuitem" className={styles.item} onClick={() => setConfirm('quit')}>
                  <ExitIcon />
                  <span>나가기</span>
                </button>
                <button type="button" role="menuitem" className={styles.item} disabled={!canSurrender} onClick={() => setConfirm('surrender')} title={canSurrender ? undefined : '게임 중에만 기권할 수 있습니다'}>
                  <SurrenderIcon />
                  <span>기권</span>
                </button>
              </>
            )}
            {confirm !== null && (
              <div className={styles.confirm}>
                <p className={styles.confirmText}>
                  {confirm === 'quit'
                    ? mode === 'hotseat'
                      ? '나가면 진행 중인 판이 사라집니다.'
                      : '나가도 게임은 서버에 남고, 다시 들어올 수 있습니다.'
                    : '기권하면 순위 맨 아래로 확정됩니다. 심어 둔 식물은 보드에 남습니다.'}
                </p>
                <div className={styles.confirmRow}>
                  <button type="button" className={styles.cancel} onClick={() => setConfirm(null)} aria-label="취소" title="취소">
                    <CloseIcon />
                  </button>
                  <button
                    type="button"
                    className={confirm === 'surrender' ? styles.danger : styles.ok}
                    onClick={() => {
                      const c = confirm;
                      close();
                      if (c === 'quit') onQuit();
                      else surrender();
                    }}
                    aria-label={confirm === 'quit' ? '나가기 확정' : '기권 확정'}
                    title={confirm === 'quit' ? '나가기 확정' : '기권 확정'}
                  >
                    <CheckIcon />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
