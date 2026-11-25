import { memo, useEffect, useState } from 'react';
import { GOAL_COUNT, rulesFor } from '../../engine';
import { markTutorialSeen } from '../lib/onboarding';
import { useGameStore } from '../store/gameStore';
import { CloseIcon, LearnIcon } from './icons';
import styles from './TutorialCoach.module.css';

type Store = ReturnType<typeof useGameStore.getState>;

interface Step {
  title: string;
  body: string;
  /** 화면 위쪽에 띄운다 (아래 내 카드·마켓을 가리지 않게) */
  top?: boolean;
  /** 이 조건이 참이 되면 다음 단계로 넘어간다. 없으면 '다음' 버튼으로 넘긴다 */
  done?: (s: Store) => boolean;
}

const myPlants = (s: Store) => s.state?.plants.filter((p) => p.ownerId === s.viewerId).length ?? 0;

const tookCard = (s: Store) => s.state?.log.some((e) => e.kind === 'take' && e.playerId === s.viewerId) ?? false;

const STEPS: Step[] = [
  {
    title: '목표',
    body: `내 차례마다 마켓이나 카드 더미에서 카드 1장을 가져온 뒤, 내 카드 2장 중 1장을 심어 뿌리를 뻗습니다. 끝났을 때 내 뿌리가 있는 칸 1칸 = 1점, 여기에 위의 목표 카드 ${GOAL_COUNT}장 점수를 더해 높은 쪽이 이깁니다.`,
    top: true,
  },
  {
    title: '카드 가져오기',
    body: `보드 아래 마켓에 카드 ${rulesFor(2).market}장이 펼쳐져 있습니다. 한 장을 눌러 크게 보고 "이 카드 가져오기"를 누르세요. 빈자리는 바로 채워집니다. 맨 끝의 카드 더미 뒷면을 누르면 무엇이 나올지 모르는 1장을 가져옵니다.`,
    done: (s) => tookCard(s) || myPlants(s) > 0,
  },
  {
    title: '카드 고르기',
    body: '이어서 심을 차례입니다. 아래 내 카드 2장 중 한 장을 눌러 크게 보고 "이 카드 고르기"를 누르세요. 그림의 숫자가 그 칸에 놓는 뿌리 수입니다.',
    done: (s) => s.selectedHandIndex !== null || myPlants(s) > 0,
  },
  {
    title: '심을 칸 고르기',
    body: '밝게 빛나는 칸이 내 땅이나 내 땅과 맞닿은 빈 칸입니다. 한 칸을 누르세요.',
    done: (s) => s.pendingPos !== null || myPlants(s) > 0,
  },
  {
    title: '심기',
    body: '뿌리 모양의 방향을 고르면 내 땅·점수가 얼마나 바뀌는지 보입니다. 마음에 들면 "심기", 아니면 "취소"를 누르세요.',
    done: (s) => myPlants(s) > 0,
  },
  {
    title: '상대 차례',
    body: '연습 봇이 두는 중입니다. 칸 색이 그 칸의 주인입니다. 라운드가 끝나면 남은 뿌리가 가장 많은 사람이 다음 라운드의 선(먼저 두는 사람)이 됩니다.',
    done: (s) => s.state?.currentPlayerId === s.viewerId && myPlants(s) > 0,
  },
  {
    title: '뿌리 줄다리기',
    body: '한 칸에는 한 사람의 뿌리만 있습니다. 남의 뿌리가 있는 칸에 뿌리를 뻗으면 1개씩 밀어냅니다. 식물은 그 칸에 뿌리를 둔 사람 것입니다. 뿌리가 모자라면 가장 높이 쌓인 내 칸에서 옮겨 옵니다.',
  },
  {
    title: '이제 직접',
    body: '카드를 다 쓰면 끝납니다. ≡ 메뉴의 점수 탭에서 목표별 점수를, 설명 탭에서 규칙을 볼 수 있습니다.',
  },
];

/**
 * 첫 판 튜토리얼 안내 (2026-10-06, 2026-10-07 Rootbound 로 교체, 2026-10-08 가져오기 → 심기 순서).
 * 이번 판 식물 공개 단계에는 공개 화면(RevealPanel)이 설명을 맡고, 1라운드가 시작되면 안내가 뜬다. 연습 봇과 두는 핫시트 판(store.tutorial) 위에 떠서
 * 한 단계씩 할 일을 알려 주고, 플레이어가 실제로 그 조작을 하면 다음 단계로 넘어간다.
 * 보드를 덜 가리도록 내 카드 위(첫 안내는 화면 위쪽)에 작은 패널로 둔다.
 */
export const TutorialCoach = memo(function TutorialCoach() {
  const tutorial = useGameStore((s) => s.tutorial);
  const phase = useGameStore((s) => s.state?.phase);
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);

  // 조작 조건을 만족하면 다음 단계로 (스토어를 구독해 매 변경마다 확인)
  useEffect(() => {
    if (!tutorial) return;
    const check = (s: Store) => {
      const cur = STEPS[step];
      if (cur?.done?.(s)) advance();
    };
    check(useGameStore.getState());
    return useGameStore.subscribe(check);
  }, [tutorial, step]);

  function advance() {
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
    <aside className={cur.top ? styles.coachTop : styles.coach} role="status" aria-live="polite" aria-label="튜토리얼 안내">
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
