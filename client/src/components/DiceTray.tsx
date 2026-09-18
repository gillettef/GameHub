import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { useStore } from '../store';
import { rollKeyOf, useUi } from '../ui';

const SPIN_MS = 1100; // 굴리기를 누른 뒤 최소한 이만큼은 구른다
const SPIN_FALLBACK_MS = 4000; // 서버 눈이 안 오면(거부 등) 이 뒤에 멈춘다
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

// 사이드바의 주사위: 굴리기를 누르면 구르는 애니메이션이 시작되고, 서버가 정한 눈이 오면 최소 시간 뒤 그 면으로 멈춘다.
// 멈추는 타이머는 ref 로 들고 있어 뷰가 중간에 바뀌어도(다음 차례로 넘어감 등) 취소되지 않는다.
// 멈춘 눈은 ui.settledRoll 로 알리고, 이사회·경기 결과 패널은 그때까지 눈을 숨긴다(구르는 동안 결과가 먼저 보이지 않게).
export function DiceTray() {
  const { view, session, act } = useStore();
  const { setSettledRoll } = useUi();
  const [spinning, setSpinning] = useState(false);
  const [face, setFace] = useState(1);
  const spinningRef = useRef(false);
  const faceRef = useRef(1);
  const spinStarted = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const rollKey = rollKeyOf(actorId, roll);
  const broadcast = view?.log.length ?? 0; // 같은 눈이 다시 나온 재굴림도 새 방송으로 감지하기 위해
  const lastRollKey = useRef(rollKey);
  const rollKeyRef = useRef(rollKey);
  rollKeyRef.current = rollKey;

  const settle = (n: number) => {
    faceRef.current = n;
    setFace(n);
    spinningRef.current = false;
    setSpinning(false);
    stopTimer.current = null;
    setSettledRoll(rollKeyRef.current); // 멈춘 시점의 눈을 공개
  };
  // 굴린 지 SPIN_MS 가 지난 뒤 n 면으로 멈춘다 (이미 지났으면 바로)
  const stopAt = (n: number, minMs = SPIN_MS) => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    const remaining = Math.max(0, minMs - (Date.now() - spinStarted.current));
    stopTimer.current = setTimeout(() => settle(n), remaining);
  };
  const beginSpin = () => {
    spinStarted.current = Date.now();
    spinningRef.current = true;
    setSpinning(true);
    setSettledRoll(null); // 구르는 동안은 눈을 숨긴다
  };

  useEffect(() => {
    const changed = lastRollKey.current !== rollKey;
    lastRollKey.current = rollKey;
    if (roll === null) {
      // 눈이 사라짐(다음 차례로 넘어감 등): 구르는 중이면 마지막 면으로 멈춘다
      if (spinningRef.current) stopAt(faceRef.current);
      return;
    }
    if (spinningRef.current) {
      stopAt(roll); // 내가 굴린 결과가 도착
      return;
    }
    if (changed && !mine) {
      // 다른 참가자의 새 눈: 짧게 굴러가는 모습을 보여준 뒤 멈춘다
      beginSpin();
      stopAt(roll);
      return;
    }
    // 구르지 않고 바로 보여주는 경우(새로고침 직후, 내가 굴렸는데 애니메이션이 없는 환경 등)
    faceRef.current = roll;
    setFace(roll);
    setSettledRoll(rollKey);
  }, [roll, rollKey, mine, broadcast]); // 눈·차례·방송이 바뀔 때만 (stopAt 등은 ref 기반이라 의존성에 넣지 않는다)

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
    },
    [],
  );

  if (!mode || !actor) return null;
  const canRoll = mine && !decided && roll === null;
  const canReroll = mine && !decided && roll !== null && actor.resources.fandom >= 1;
  const start = (reroll: boolean) => {
    beginSpin();
    stopAt(faceRef.current, SPIN_FALLBACK_MS); // 서버가 거부하면 원래 면으로 되돌아간다
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
      <div className="die-readout" aria-label="주사위 눈">{roll !== null && !spinning ? `눈 ${roll}` : spinning ? '구르는 중' : '—'}</div>
      <div className="dice-actions">
        {decided ? (
          <span className="muted small">처리 완료</span>
        ) : !mine ? (
          <span className="muted small">{roll === null ? '굴리기를 기다리는 중' : spinning ? '구르는 중' : `눈 ${roll}`}</span>
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
