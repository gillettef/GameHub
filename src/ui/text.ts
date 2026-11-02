import { HOLE_LABELS, HOLE_NAMES, MAX_PLACE_PER_TURN, PLAYER_EMOJI, PLAYER_NAMES } from '../core/constants';
import { nextStop, score, winner } from '../core/rules';
import type { Player } from '../core/types';
import type { View } from '../game/controller';

export interface StatusText {
  /** 굵게 표시할 앞부분 */
  title: string;
  detail: string;
}

export const playerLabel = (p: Player) => `${PLAYER_EMOJI[p]} ${PLAYER_NAMES[p]}`;
export const holeLabel = (i: number) => `${HOLE_LABELS[i]} ${HOLE_NAMES[i]}`;

/** 상태 메시지 (프로토타입 status()) */
export interface Seats {
  /** ai 모드에서 AI가 맡은 자리 */
  aiPlayer: Player;
  /** online 모드에서 내 자리 */
  seat: Player;
}

export function statusText(v: View, seats: Seats): StatusText {
  const s = v.state;
  if (s.phase === 'over') {
    const t = score(s);
    const w = winner(s);
    const tie = t[0] === t[1] ? ` · 동점이라 남은 예비군 비교 (${s.reserves[0]} : ${s.reserves[1]})` : '';
    return {
      title: w === null ? '선거일 · 무승부' : `선거일 · ${PLAYER_NAMES[w]} 후보 당선`,
      detail: `(${t[0]} : ${t[1]})${tie}`,
    };
  }

  if (v.mode === 'online' && s.current !== seats.seat) {
    if (s.phase === 'sow') return { title: '상대 버스가 유세 중…', detail: '' };
    if (s.phase === 'setup') return { title: '상대가 토큰을 배치하는 중…', detail: '' };
    return { title: '상대 차례예요. 기다리는 중…', detail: '' };
  }

  const aiTurn = v.mode === 'ai' && s.current === seats.aiPlayer;
  if (aiTurn) {
    if (s.phase === 'sow') return { title: 'AI 버스가 유세 중…', detail: '' };
    if (s.phase === 'place' && s.placedThisTurn > 0) return { title: 'AI가 예비군을 투입하는 중…', detail: '' };
    return { title: 'AI가 수를 고르는 중…', detail: '' };
  }

  if (v.busy && s.phase === 'sow') return { title: `유세 버스 이동 중…`, detail: '' };
  if (v.busy) return { title: `잠시만요…`, detail: '' };
  switch (s.phase) {
    case 'setup':
      return { title: `사전 배치`, detail: `토큰을 놓을 권역을 고르세요 · 남은 ${s.setupLeft[s.current]}개` };
    case 'place':
      return {
        title: s.placedThisTurn >= 1 ? '한 명 더 놓거나 투입 완료' : '예비군을 놓을 권역을 고르세요',
        detail: s.placedThisTurn >= 1 ? '' : `(최대 ${MAX_PLACE_PER_TURN}명)`,
      };
    case 'pick':
      return { title: '버스를 출발시킬 권역을 고르세요', detail: '' };
    case 'sow': {
      const n = nextStop(s);
      return {
        title: `다음 정차 ${n < 0 ? '없음' : holeLabel(n)}`,
        detail: '· 내릴 지지자를 고르세요',
      };
    }
  }
}
