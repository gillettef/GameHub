import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { useStore } from '../store';

const SPIN_MS = 1100;
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};
// 정육면체 각 면을 정면으로 돌리는 회전 (앞 1, 오른쪽 2, 뒤 6, 왼쪽 5, 위 3, 아래 4)
const FACE_TRANSFORM: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateY(-90deg)',
  3: 'rotateX(-90deg)',
  4: 'rotateX(90deg)',
  5: 'rotateY(90deg)',
  6: 'rotateY(180deg)',
};

function Face({ n, className }: { n: number; className: string }) {
  return (
    <span className={`face ${className}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {PIPS[n]!.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="9" />
        ))}
      </svg>
    </span>
  );
}

// 메인 영역 우상단 주사위: 굴리기를 누르면 실제로 구르는 애니메이션 후 서버가 정한 눈으로 멈춘다
export function DiceTray() {
  const { view, session, act } = useStore();
  const [spinning, setSpinning] = useState(false);
  const [face, setFace] = useState(1);
  const spinStarted = useRef(0);
  const pendingFace = useRef<number | null>(null);

  const me = view && session ? view.players[session.playerId] : undefined;
  const phase = view?.phase;
  let mode: 'board' | 'match' | null = null;
  let roll: number | null = null;
  let decided = false;
  if (me && phase?.kind === 'monday.board') {
    mode = 'board';
    roll = phase.meetings[me.id]?.roll ?? null;
    decided = phase.meetings[me.id]?.decided ?? false;
  } else if (me && phase?.kind === 'friday.aftermath') {
    mode = 'match';
    roll = phase.matches[me.id]?.roll ?? null;
    decided = phase.matches[me.id]?.decided ?? false;
  }

  // 서버의 눈이 오면: 아직 구르는 중이면 최소 시간이 지난 뒤 멈추고, 아니면 바로 표시
  useEffect(() => {
    if (roll === null) return;
    if (spinning) {
      pendingFace.current = roll;
      const remaining = Math.max(0, SPIN_MS - (Date.now() - spinStarted.current));
      const t = setTimeout(() => {
        setFace(pendingFace.current ?? roll);
        setSpinning(false);
      }, remaining);
      return () => clearTimeout(t);
    }
    setFace(roll);
  }, [roll, spinning]);

  if (!me || !mode) return null;
  const canRoll = !decided && roll === null;
  const canReroll = !decided && roll !== null && me.resources.fandom >= 1;
  const start = (reroll: boolean) => {
    spinStarted.current = Date.now();
    pendingFace.current = null;
    setSpinning(true);
    if (mode === 'board') act({ type: reroll ? 'rerollBoardDie' : 'rollBoardDie' });
    else act({ type: reroll ? 'rerollMatchDie' : 'rollMatchDie' });
  };
  const accept = () => act({ type: mode === 'board' ? 'acceptBoardRoll' : 'acceptMatchRoll' });

  return (
    <div className="dice-tray" aria-live="polite">
      <div className="dice-title">{mode === 'board' ? '이사회 주사위' : '경기 영향 주사위'}</div>
      <div className="die-stage">
        <div className={`die3d${spinning ? ' spinning' : ''}`} style={spinning ? undefined : { transform: FACE_TRANSFORM[face] }}>
          <Face n={1} className="front" />
          <Face n={2} className="right" />
          <Face n={6} className="back" />
          <Face n={5} className="left" />
          <Face n={3} className="top" />
          <Face n={4} className="bottom" />
        </div>
      </div>
      <div className="dice-actions">
        {decided ? (
          <span className="muted small">처리 완료</span>
        ) : (
          <>
            <button className="primary" disabled={spinning || !canRoll} onClick={() => start(false)}>
              <Icon name="die" />굴리기
            </button>
            <button disabled={spinning || !canReroll} onClick={() => start(true)} title="팬덤 1개를 내고 다시 굴립니다">
              <Icon name="fandom" />1 다시
            </button>
            <button disabled={spinning || roll === null} onClick={accept}>적용</button>
          </>
        )}
      </div>
    </div>
  );
}
