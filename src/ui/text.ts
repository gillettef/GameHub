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
      title: w === null ? '🏁 선거일! 무승부' : `🏁 선거일! ${playerLabel(w)} 후보 당선`,
      detail: `(${t[0]} : ${t[1]})${tie}`,
    };
  }

  if (v.mode === 'online' && s.current !== seats.seat) {
    if (s.phase === 'sow') return { title: '🚌 상대 버스가 유세 중…', detail: '' };
    if (s.phase === 'setup') return { title: `⏳ ${playerLabel(s.current)}(상대) 배치 중…`, detail: '' };
    return { title: `⏳ ${playerLabel(s.current)}(상대) 차례…`, detail: '' };
  }

  const aiTurn = v.mode === 'ai' && s.current === seats.aiPlayer;
  if (aiTurn) {
    if (s.phase === 'sow') return { title: '🚌 AI의 버스가 유세 중…', detail: '' };
    if (s.phase === 'place' && s.placedThisTurn > 0) return { title: '🤖 AI가 예비군을 투입하는 중…', detail: '' };
    return { title: '🤖 AI가 생각하는 중…', detail: '' };
  }

  const who = v.mode === 'online' ? `${PLAYER_EMOJI[s.current]} 내 차례 · ` : '';
  if (v.busy && s.phase === 'sow') return { title: `${who}🚌 유세 버스 이동 중…`, detail: '' };
  if (v.busy) return { title: `${who}잠시만요…`, detail: '' };
  switch (s.phase) {
    case 'setup':
      return { title: `${who}배치`, detail: `토큰을 놓을 권역을 고르세요 (남은 ${s.setupLeft[s.current]}개)` };
    case 'place':
      return {
        title: `${who}① 조직 투입 (${Math.min(s.placedThisTurn + 1, MAX_PLACE_PER_TURN)}/${MAX_PLACE_PER_TURN})`,
        detail: `예비군을 놓을 권역을 고르세요${s.placedThisTurn >= 1 ? ' (또는 투입 완료)' : ''}`,
      };
    case 'pick':
      return { title: `${who}② 출발지 선택`, detail: '버스를 출발시킬 권역을 고르세요' };
    case 'sow': {
      const n = nextStop(s);
      return {
        title: `${who}③ 유세 순회`,
        detail: `내려놓을 후보를 고르세요 → 다음 정차 ${n < 0 ? '없음' : holeLabel(n)}`,
      };
    }
  }
}
