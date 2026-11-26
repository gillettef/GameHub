import { memo, useEffect, useState } from 'react';
import { CHORE_EXTRA, GOAL_COUNT, rulesFor } from '../../engine';
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

const tookCard = (s: Store) => s.state?.log.some((e) => e.kind === 'take' && e.playerId === s.viewerId) ?? false;

const pickedChore = (s: Store) => s.state?.log.some((e) => e.kind === 'chore' && e.playerId === s.viewerId) ?? false;

/** 명당을 놓지 않는 일과(담 넘기·명당 부르기)로 차례를 마쳤나. 그러면 놓기 안내 단계는 건너뛴다 */
const didOtherChore = (s: Store) => s.state?.log.some((e) => (e.kind === 'move' || e.kind === 'call' || e.kind === 'pass') && e.playerId === s.viewerId) ?? false;

/** 첫 차례를 마쳤나 (놓았거나, 놓지 않는 일과를 했거나) */
const playedOnce = (s: Store) => myPlants(s) > 0 || didOtherChore(s);

const STEPS: Step[] = [
  {
    title: '목표',
    body: `라운드마다 골목 일과 하나를 고르고, 그 일과대로 명당 타일을 놓아 고양이를 불러 모읍니다. 끝났을 때 내 고양이가 앉은 칸 1칸 = 1점, 여기에 위의 소문 카드 ${GOAL_COUNT}장 점수를 더해 높은 쪽이 이깁니다. 2인은 ${rulesFor(2).rounds}라운드입니다.`,
    top: true,
  },
  {
    title: '일과 고르기',
    body: `아래에 일과 ${2 + CHORE_EXTRA}장이 펼쳐져 있습니다(인원 + 1장). 선부터 하나씩 고르고 마지막 1장은 남습니다. 처음에는 명당을 놓는 일과(식빵 굽기·생선 냄새·마실·대장 방울)를 골라 보세요. 일과를 누르고 맨 아래 버튼으로 정합니다.`,
    top: true,
    done: (s) => pickedChore(s),
  },
  {
    title: '타일 가져오기',
    body: `보드 아래에 타일 ${rulesFor(2).market}개가 펼쳐져 있습니다. 하나를 눌러 크게 보고 가져오기 버튼을 누르세요. 빈자리는 바로 채워집니다. 맨 끝의 주머니를 누르면 무엇이 나올지 모르는 타일 1개를 뽑습니다.`,
    done: (s) => tookCard(s) || playedOnce(s),
  },
  {
    title: '타일 고르기',
    body: '이어서 명당을 놓을 차례입니다. 아래 내 타일 2개 중 하나를 눌러 크게 보고 고르기 버튼을 누르세요. 그림의 숫자가 그 칸에 모이는 고양이 수입니다.',
    done: (s) => s.selectedHandIndex !== null || playedOnce(s),
  },
  {
    title: '놓을 칸 고르기',
    body: '밝게 빛나는 칸이 내 칸이나, 내 칸·아지트와 맞닿은 고양이 없는 칸입니다(마실이면 두 칸 안 빈 칸도). 한 칸을 누르세요.',
    done: (s) => s.pendingPos !== null || playedOnce(s),
  },
  {
    title: '명당 놓기',
    body: '타일 방향을 고르면 내 칸·점수가 얼마나 바뀌는지 보입니다(식빵 굽기면 놓은 칸 +1). 마음에 들면 "놓기", 아니면 "취소"를 누르세요.',
    done: (s) => playedOnce(s),
  },
  {
    title: '상대 차례',
    body: '연습 봇이 두는 중입니다. 고양이 색이 그 칸의 주인입니다. 라운드가 끝나면 대장 방울을 고른 사람, 없으면 쉬는 고양이가 가장 많은 사람이 다음 라운드의 선(먼저 하는 사람)이 됩니다.',
    done: (s) => s.state?.currentPlayerId === s.viewerId && playedOnce(s),
  },
  {
    title: '놓지 않는 일과',
    body: '담 넘기는 명당 대신 내 칸의 고양이 1~2마리를 맞닿은 칸으로 두 번까지 옮기고, 명당 부르기는 내 칸 위 명당을 돌려 고양이를 다시 부른 뒤(그 칸 +1) 펼친 타일 1개를 가져옵니다. 일과는 ≡ 메뉴의 설명 탭에서 다시 볼 수 있습니다.',
    top: true,
  },
  {
    title: '한 마리가 한 마리를 쫓아낸다',
    body: '한 칸에는 한 무리의 고양이만 앉습니다. 남의 고양이가 앉은 칸에 내 고양이가 오면 먼저 1마리씩 쫓아내고, 남은 수만큼 내 고양이를 앉힙니다. 명당은 그 칸에 앉은 무리의 것입니다. 쉬는 고양이가 모자라면 이번에 앉힐 칸을 뺀, 가장 높이 쌓인 내 칸에서 1마리씩 데려옵니다.',
  },
  {
    title: '이제 직접',
    body: `${rulesFor(2).rounds}라운드가 끝나면(타일을 먼저 다 쓰면 그때) 게임이 끝납니다. ≡ 메뉴의 점수 탭에서 소문 카드별 점수를, 설명 탭에서 규칙과 일과를 볼 수 있습니다.`,
  },
];

/**
 * 첫 판 튜토리얼 안내 (2026-10-06, 2026-10-07 냥냥 골목 로 교체, 2026-10-08 가져오기 → 심기 순서, 2026-11-26 v7 일과 고르기).
 * 놓지 않는 일과(담 넘기·명당 부르기)를 고르면 놓기 안내 단계는 그 차례를 마칠 때 건너뛴다(막히지 않게).
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
