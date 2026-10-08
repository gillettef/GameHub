import { memo, useEffect, useRef, useState } from 'react';
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
  done?: (s: Store, startTurn: number) => boolean;
}


/**
 * 첫 판 튜토리얼 안내 (2026-10-06, 2026-10-07 Rootbound 로 교체, 2026-10-08 가져오기 → 심기 순서).
 * 이번 판 식물 공개 단계에는 공개 화면(RevealPanel)이 설명을 맡고, 1라운드가 시작되면 안내가 뜬다. 연습 봇과 두는 핫시트 판(store.tutorial) 위에 떠서
 * 한 단계씩 할 일을 알려 주고, 플레이어가 실제로 그 조작을 하면 다음 단계로 넘어간다.
 * 보드를 덜 가리도록 내 카드 위(첫 안내는 화면 위쪽)에 작은 패널로 둔다.
 */
const myPlants = (s: Store) => s.state?.plants.filter((p) => p.ownerId === s.viewerId).length ?? 0;

const tookCard = (s: Store) => s.state?.log.some((e) => e.kind === 'take' && e.playerId === s.viewerId) ?? false;

const STEPS: Step[] = [
  {
    title: '목표',
    body: '라운드마다 마켓에서 카드 1장을 가져온 뒤, 내 카드 2장 중 1장을 심어 땅을 넓힙니다. 끝났을 때 내 땅 1칸 = 1점, 여기에 위의 목표 카드 3장 점수를 더해 높은 쪽이 이깁니다.',
    top: true,
  },
  {
    title: '마켓에서 가져오기',
    body: '보드 아래 마켓에 이번 라운드 카드가 펼쳐져 있습니다. 한 장을 눌러 크게 보고 "이 카드 가져오기"를 누르세요.',
    done: (s) => tookCard(s) || myPlants(s) > 0,
  },
  {
    title: '카드 고르기',
    body: '모두 가져가면 심을 차례입니다. 아래 내 카드 2장 중 한 장을 눌러 크게 보고 "이 카드 고르기"를 누르세요. 그림의 숫자가 옆 칸에 주는 영향력입니다.',
    done: (s) => s.selectedHandIndex !== null || myPlants(s) > 0,
  },
  {
    title: '심을 칸 고르기',
    body: '밝게 빛나는 칸이 내 뿌리가 닿는(영향력 1 이상) 빈 칸입니다. 한 칸을 누르세요.',
    done: (s) => s.pendingPos !== null || myPlants(s) > 0,
  },
  {
    title: '심기',
    body: '심기 전에 내 땅·점수가 얼마나 바뀌는지 보입니다. 마음에 들면 "심기", 아니면 "취소"를 누르세요.',
    done: (s) => myPlants(s) > 0,
  },
  {
    title: '상대 차례',
    body: '연습 봇이 두는 중입니다. 칸 색이 그 칸의 주인입니다. 라운드가 끝나면 점수가 가장 낮은 사람이 다음 라운드의 선(먼저 가져오는 사람)이 됩니다.',
    done: (s) => s.state?.currentPlayerId === s.viewerId && myPlants(s) > 0,
  },
  {
    title: '영향력 보기',
    body: '아래 "영향력" 버튼을 켜면 칸마다 "내 영향력 : 가장 센 상대"가 보입니다. 1등만 그 칸을 가집니다(동점이면 아무도 못 가짐). 상대가 더 강하게 심으면 내 땅도 넘어갑니다.',
  },
  {
    title: '이제 직접',
    body: '카드를 다 쓰면 끝납니다. 점수 탭에서 목표별 점수를, ⋯ 메뉴 → 규칙 보기에서 규칙을 볼 수 있습니다.',
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
