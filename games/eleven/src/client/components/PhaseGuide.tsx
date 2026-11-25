import { useState } from 'react';
import type { GameView } from '../../engine/view';
import { useView } from '../store';

// 처음 하는 사람을 위한 '지금 할 일' 한 줄 안내 (단계·내 차례에 따라). 익숙해지면 끌 수 있고, 설정은 localStorage(eleven:guide)에 둔다.
// 이번 주 일정의 요일 설명은 '오늘 무슨 날인가', 이 안내는 '지금 무엇을 눌러야 하나'를 말한다

const GUIDE_KEY = 'eleven:guide';

function loadOn(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveOn(on: boolean): void {
  try {
    localStorage.setItem(GUIDE_KEY, on ? 'on' : 'off');
  } catch {
    /* 저장 불가 환경이면 이번 화면에만 */
  }
}

export function guideText(view: GameView): string | null {
  const phase = view.phase;
  const mine = 'current' in phase && phase.current === view.me;
  switch (phase.kind) {
    case 'setup.draft':
      return '임원 카드를 누르면 바로 영입합니다. 임원은 월요일 이사회에서 주사위 색대로 투표하고, 자원 트랙 조정과 능력을 줍니다. 남은 카드는 옆 참가자에게 넘어갑니다.';
    case 'setup.objective':
      return '목표 카드 2장 중 1장을 누르면 보관합니다. 게임이 끝날 때 달성하면 2점, 완벽하면 4점입니다 (다른 참가자에게는 보이지 않음).';
    case 'monday.board':
      return mine
        ? '조달로 자원을 받았습니다. 이사회 카드를 읽고 아래 주사위를 굴리세요 — 임원 3명이 눈의 색대로 투표해 많이 나온 결정을 적용합니다. 마음에 안 들면 팬덤 1개로 다시 굴립니다.'
        : '다른 참가자의 이사회입니다. 주사위와 결정을 함께 지켜보세요.';
    case 'weekday':
      return mine
        ? '기본 행동 1회: 선수 영입·방출, 직원 고용, 스폰서 계약, 시설 건설, 카드 행동 중 하나. 운영 2개를 내면 카드 행동을 한 번 더 할 수 있습니다. 다 했으면 차례 끝내기.'
        : '다른 참가자의 차례입니다. 무엇을 했는지는 기록 탭에서 볼 수 있고, 시장·보드는 언제든 둘러볼 수 있습니다.';
    case 'friday.prepare':
      return '전술 → 출전 선수 → 배치 → 관중석 순서로 라인업을 짭니다. 내 차례가 아니어도 미리 짜 두면 차례에 제출만 하면 됩니다.';
    case 'friday.match':
      return mine ? '상대 팀 카드가 공개됐습니다. 포메이션에 쓰지 않은 전술 카드 1장의 효과를 쓰거나 효과 없이 진행하세요.' : '참가자마다 상대 팀을 확인하고 전술 효과를 고르는 중입니다.';
    case 'friday.aftermath':
      return mine ? '경기 보기 → 경기 종료 → 경기 영향 주사위 순서로 진행합니다. 결과를 확인한 뒤 아래 주사위를 굴리세요.' : '다른 참가자의 경기를 함께 봅니다.';
    default:
      return null;
  }
}

export function PhaseGuide() {
  const { view, session } = useView();
  const [on, setOn] = useState(loadOn);
  if (!session) return null; // 관전자에게는 할 일이 없다
  const text = guideText(view);
  if (!text) return null;
  const toggle = (next: boolean) => {
    saveOn(next);
    setOn(next);
  };
  if (!on) {
    return (
      <button className="link small guide-on" onClick={() => toggle(true)}>
        ? 지금 할 일 안내 켜기
      </button>
    );
  }
  return (
    <p className="phase-guide" role="note">
      <span className="phase-guide-text">{text}</span>
      <button className="link small" onClick={() => toggle(false)} title="이 안내를 숨깁니다 (아래 버튼으로 다시 켤 수 있습니다)">
        안내 끄기
      </button>
    </p>
  );
}
