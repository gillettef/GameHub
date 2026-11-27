import { memo, useEffect, useState } from 'react';
import { GOAL_COUNT, HAND_MAX, TAKE_COUNT, rulesFor } from '../../engine';
import { markTutorialSeen } from '../lib/onboarding';
import { useGameStore } from '../store/gameStore';
import { CloseIcon, LearnIcon } from './icons';
import styles from './TutorialCoach.module.css';

type Store = ReturnType<typeof useGameStore.getState>;

interface Step {
  title: string;
  body: string;
  /** 화면 위쪽에 띄운다 (아래 내 타일·펼친 타일을 가리지 않게) */
  top?: boolean;
  /** 이 조건이 참이 되면 다음 단계로 넘어간다. 없으면 '다음' 버튼으로 넘긴다 */
  done?: (s: Store) => boolean;
}

const myPlants = (s: Store) => s.state?.plants.filter((p) => p.ownerId === s.viewerId).length ?? 0;

/** 내가 가져온 타일 수 (기록 기준) */
const tookCards = (s: Store) => s.state?.log.filter((e) => e.kind === 'take' && e.playerId === s.viewerId).length ?? 0;

/** 첫 행동을 마쳤나 (가져오기 두 번, 놓기, 부르기) */
const actedOnce = (s: Store) => tookCards(s) >= TAKE_COUNT || myPlants(s) > 0 || (s.state?.log.some((e) => e.kind === 'call' && e.playerId === s.viewerId) ?? false);

const STEPS: Step[] = [
  {
    title: '목표',
    body: `명당 타일을 놓아 고양이를 불러 모읍니다. 끝났을 때 내 고양이가 앉은 칸 1칸 = 1점, 여기에 위의 소문 카드 ${GOAL_COUNT}장 점수를 더해 높은 쪽이 이깁니다. 2인은 ${rulesFor(2).rounds}라운드입니다.`,
    top: true,
  },
  {
    title: '차례마다 하나만',
    body: `내 차례에는 셋 중 하나만 합니다. ① 타일 ${TAKE_COUNT}개 가져오기(손은 ${HAND_MAX}개까지) ② 내 타일 1개 놓기 ③ 내 칸 위 명당 부르기. 가져오면 그 차례에는 놓지 않으니, 지금 놓을지 좋은 타일을 모을지 고르세요.`,
    top: true,
  },
  {
    title: '타일 가져오기',
    body: `먼저 타일을 모아 봅시다. 보드 아래 펼친 타일 하나를 눌러 크게 보고 가져오기 버튼을 누르세요. 빈자리는 바로 채워집니다. 맨 끝의 주머니를 누르면 무엇이 나올지 모르는 타일 1개를 뽑습니다. ${TAKE_COUNT}개를 가져오면 차례가 끝납니다.`,
    done: (s) => actedOnce(s),
  },
  {
    title: '상대 차례',
    body: '연습 봇이 두는 중입니다. 고양이 색이 그 칸의 주인입니다. 라운드가 끝나면 쉬는 고양이가 가장 많은 사람이 다음 라운드의 선(먼저 하는 사람)이 됩니다.',
    done: (s) => s.state?.currentPlayerId === s.viewerId && actedOnce(s),
  },
  {
    title: '타일 고르기',
    body: '이번에는 명당을 놓아 봅시다. 아래 내 타일 중 하나를 눌러 크게 보고 고르기 버튼을 누르세요. 그림의 숫자가 그 칸에 모이는 고양이 수입니다.',
    done: (s) => s.selectedHandIndex !== null || myPlants(s) > 0,
  },
  {
    title: '놓을 칸 고르기',
    body: '밝게 빛나는 칸이 내 칸이나, 내 칸·아지트와 맞닿은 고양이 없는 칸입니다. 한 칸을 누르세요.',
    done: (s) => s.pendingPos !== null || myPlants(s) > 0,
  },
  {
    title: '명당 놓기',
    body: '타일 방향을 고르면 내 칸·점수가 얼마나 바뀌는지 보입니다. 마음에 들면 "놓기", 아니면 "취소"를 누르세요.',
    done: (s) => myPlants(s) > 0,
  },
  {
    title: '명당 부르기',
    body: '내 칸 위에 있는 명당은 누가 놓았든 다시 부를 수 있습니다. 손 타일을 고르지 않은 채 그 명당을 누르면 방향을 다시 정해 그 모양대로 고양이를 부릅니다(능력은 쓰지 않음). 손 타일이 없을 때도 할 수 있습니다.',
    top: true,
  },
  {
    title: '한 마리가 한 마리를 쫓아낸다',
    body: '한 칸에는 한 무리의 고양이만 앉습니다. 남의 고양이가 앉은 칸에 내 고양이가 오면 먼저 1마리씩 쫓아내고, 남은 수만큼 내 고양이를 앉힙니다. 명당은 그 칸에 앉은 무리의 것입니다. 쉬는 고양이가 모자라면 이번에 앉힐 칸을 뺀, 가장 높이 쌓인 내 칸에서 1마리씩 데려옵니다.',
  },
  {
    title: '이제 직접',
    body: `${rulesFor(2).rounds}라운드가 끝나면(타일을 먼저 다 쓰면 그때) 게임이 끝납니다. ≡ 메뉴의 점수 탭에서 소문 카드별 점수를, 설명 탭에서 규칙을 볼 수 있습니다.`,
  },
];

/**
 * 첫 판 튜토리얼 안내 (2026-10-06, 2026-10-07 냥냥 골목 로 교체, 2026-10-08 가져오기 → 심기 순서, 2026-11-27 v8 행동 하나).
 * 가져오기 안내 때 먼저 놓아도 막히지 않는다(놓기 안내 단계는 이미 놓았으면 바로 넘어간다).
 * 이번 판 명당 공개 단계에는 공개 화면(RevealPanel)이 설명을 맡고, 1라운드가 시작되면 안내가 뜬다. 연습 봇과 두는 핫시트 판(store.tutorial) 위에 떠서
 * 한 단계씩 할 일을 알려 주고, 플레이어가 실제로 그 조작을 하면 다음 단계로 넘어간다.
 * 보드를 덜 가리도록 내 타일 위(첫 안내는 화면 위쪽)에 작은 패널로 둔다.
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
