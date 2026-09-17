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
  // 차례인 참가자(actor)의 주사위를 모두가 본다 (관전자 포함). 버튼은 내 차례일 때만
  let mode: 'board' | 'match' | null = null;
  let roll: number | null = null;
  let decided = false;
  let actorId: string | null = null;
  if (phase?.kind === 'monday.board') {
    mode = 'board';
    actorId = phase.current;
    roll = phase.meetings[actorId]?.roll ?? null;
    decided = phase.meetings[actorId]?.decided ?? false;
  } else if (phase?.kind === 'friday.aftermath') {
    mode = 'match';
    actorId = phase.current;
    roll = phase.matches[actorId]?.roll ?? null;
    decided = phase.matches[actorId]?.decided ?? false;
  }
  const actor = view && actorId ? view.players[actorId] : undefined;
  const mine = !!me && me.id === actorId;
  const rollKey = `${actorId}:${roll}`;
  const lastRollKey = useRef(rollKey);

  // 서버의 눈이 오면: 아직 구르는 중이면 최소 시간이 지난 뒤 멈추고, 아니면 바로 표시.
  // 다른 참가자의 새 눈이 도착하면 짧게 굴러가는 모습을 보여준 뒤 멈춘다
  useEffect(() => {
    const changed = lastRollKey.current !== rollKey;
    lastRollKey.current = rollKey;
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
    if (changed && !mine) {
      spinStarted.current = Date.now();
      pendingFace.current = roll;
      setSpinning(true);
      return;
    }
    setFace(roll);
  }, [roll, rollKey, spinning, mine]);

  if (!mode || !actor) return null;
  const canRoll = mine && !decided && roll === null;
  const canReroll = mine && !decided && roll !== null && actor.resources.fandom >= 1;
  const start = (reroll: boolean) => {
    spinStarted.current = Date.now();
    pendingFace.current = null;
    setSpinning(true);
    if (mode === 'board') act({ type: reroll ? 'rerollBoardDie' : 'rollBoardDie' });
    else act({ type: reroll ? 'rerollMatchDie' : 'rollMatchDie' });
  };

  return (
    <div className="dice-tray" aria-live="polite">
      <div className="dice-title">{mode === 'board' ? '이사회 주사위' : '경기 영향 주사위'}</div>
      <div className="dice-actor">{mine ? '내 차례' : `${actor.name}의 차례`}</div>
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
        ) : !mine ? (
          <span className="muted small">{roll === null ? '굴리기를 기다리는 중' : `눈 ${roll}`}</span>
        ) : (
          <>
            <button className="primary" disabled={spinning || !canRoll} onClick={() => start(false)}>
              <Icon name="die" />굴리기
            </button>
            <button disabled={spinning || !canReroll} onClick={() => start(true)} title="팬덤 1개를 내고 다시 굴립니다">
              <Icon name="fandom" />1 다시
            </button>
          </>
        )}
      </div>
    </div>
  );
}
