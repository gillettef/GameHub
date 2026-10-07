import { memo, useEffect, useRef, useState } from 'react';
import { markTutorialSeen } from '../lib/onboarding';
import { useGameStore } from '../store/gameStore';
import { CloseIcon, LearnIcon } from './icons';
import styles from './TutorialCoach.module.css';

type Store = ReturnType<typeof useGameStore.getState>;

interface Step {
  title: string;
  body: string;
  /** 이 조건이 참이 되면 다음 단계로 넘어간다. 없으면 '다음' 버튼으로 넘긴다 */
  done?: (s: Store, startTurn: number) => boolean;
}

const me = (s: Store) => s.state?.players.find((p) => p.id === s.viewerId);

/**
 * 첫 판 튜토리얼 안내 (2026-10-06). 연습 봇과 두는 핫시트 판(store.tutorial) 위에 떠서
 * 한 단계씩 할 일을 알려 주고, 플레이어가 실제로 그 조작을 하면 다음 단계로 넘어간다.
 * 보드·손패·턴 바를 가리지 않도록 화면 위쪽(상태 창 아래)에 작은 패널로 둔다.
 */
const STEPS: Step[] = [
  {
    title: '목표',
    body: '마커를 한 턴에 하나씩 놓아 영토를 넓힙니다. 라운드 제한이 끝날 때 영토 + 마커 점수가 높은 쪽이 이기고, 상대 코어(육각형)를 부수면 그 자리에서 이깁니다.',
  },
  {
    title: '카드 고르기',
    body: '아래 손패에서 카드를 누르면 크게 보입니다. 비용(에너지)을 확인하고 "고르기"를 누르세요.',
    done: (s) => s.selectedHandIndex !== null,
  },
  {
    title: '놓을 칸 고르기',
    body: '밝게 빛나는 칸이 내 시야 안, 즉 놓을 수 있는 곳입니다. 한 칸을 누르세요.',
    done: (s) => s.pendingPos !== null || !!me(s)?.actedThisTurn,
  },
  {
    title: '배치 확정',
    body: '놓기 전에 예상 결과(공격·피격·점수 변화)가 보입니다. 마음에 들면 "배치 확정", 아니면 "취소"를 누르세요.',
    done: (s) => !!me(s)?.actedThisTurn,
  },
  {
    title: '턴 끝내기',
    body: '마커는 턴당 하나입니다. 맨 아래 턴 종료 버튼(✓)을 누르세요. 턴을 끝내는 순간 내 마커의 자동 공격 → 수입 → 카드 1장 드로우가 처리됩니다.',
    done: (s, startTurn) => (s.state?.turn ?? 0) > startTurn,
  },
  {
    title: '상대 차례',
    body: '연습 봇이 두는 중입니다. 보드 위 칸을 눌러 마커 정보를 볼 수 있습니다.',
    done: (s) => s.state?.currentPlayerId === s.viewerId,
  },
  {
    title: '상태 읽기',
    body: '위 상태 창의 번개는 에너지(카드 비용), +숫자는 턴당 수입, 별은 점수입니다. 건물(둥근 사각)은 수입을 늘리고, 유닛(원)은 사거리 안 적을 자동으로 공격합니다.',
  },
  {
    title: '이제 직접',
    body: '시야를 넓혀 영토를 차지하세요. 놓을 게 없으면 패스, 손패가 마음에 안 들면 교체 버튼(↻)으로 버리고 다시 뽑을 수 있습니다. 규칙은 ⋯ 메뉴 → 규칙 보기.',
  },
];

export const TutorialCoach = memo(function TutorialCoach() {
  const tutorial = useGameStore((s) => s.tutorial);
  const phase = useGameStore((s) => s.state?.phase);
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);
  const startTurn = useRef(0);

  // 조작 조건을 만족하면 다음 단계로 (스토어를 구독해 매 변경마다 확인)
  useEffect(() => {
    if (!tutorial) return;
    const check = (s: Store) => {
      const cur = STEPS[step];
      if (cur?.done?.(s, startTurn.current)) advance();
    };
    check(useGameStore.getState());
    return useGameStore.subscribe(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial, step]);

  function advance() {
    startTurn.current = useGameStore.getState().state?.turn ?? 0;
    setStep((n) => {
      const next = n + 1;
      if (next >= STEPS.length) markTutorialSeen();
      return next;
    });
  }

  if (!tutorial || closed || phase !== 'playing' || step >= STEPS.length) return null;
  const cur = STEPS[step] as Step;
  const last = step === STEPS.length - 1;
  return (
    <aside className={styles.coach} role="status" aria-live="polite" aria-label="튜토리얼 안내">
      <div className={styles.head}>
        <LearnIcon size={18} />
        <strong className={styles.title}>{cur.title}</strong>
        <span className={styles.count}>
          {step + 1}/{STEPS.length}
        </span>
        <button
          type="button"
          className={styles.close}
          aria-label="튜토리얼 안내 닫기"
          title="안내 닫기"
          onClick={() => {
            markTutorialSeen();
            setClosed(true);
          }}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <p className={styles.body}>{cur.body}</p>
      {!cur.done && (
        <button type="button" className="pill" onClick={advance}>
          {last ? '시작하기' : '다음'}
        </button>
      )}
    </aside>
  );
});
